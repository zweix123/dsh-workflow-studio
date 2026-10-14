import type {} from '@deepseek-ai/dsh-host-webserver'
import { validateTextTemplate, renderTextTemplate } from 'dsh-workflow-node/text-template'
import { randomUUID } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { assertObjectJsonSchema, type JsonSchemaNode, type ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { Context } from '@deepseek-ai/cordis'
import type { NodeContext, NodeData, NodeFact, NodePlan, NodeValue, ServerNode } from 'dsh-workflow-node/contract'

import type { AgentAttempt, AgentState } from './types.js'
const state = (fact?: NodeFact): AgentState | undefined => fact?.business as AgentState | undefined
const background = (context: Pick<NodeContext, 'definition'>) => context.definition.mode === 'background'

// DAG output fields are all required at every object level. Extra fields remain
// allowed; DAG annotations (including required/default/enum) add no constraints.
function outputSchema(fields: NodeData): ObjectJsonSchema {
  const descriptor = (value: NodeValue): JsonSchemaNode => {
    if (value === 'string' || value === 'number' || value === 'boolean') return { type: value }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unsupported Agent output declaration')
    if (value.type === 'object' && value.properties && typeof value.properties === 'object' && !Array.isArray(value.properties)) return outputSchema(value.properties)
    if (value.type === 'array') return { type: 'array', items: descriptor(value.items!) }
    throw new Error('Unsupported Agent output declaration')
  }
  const schema: ObjectJsonSchema = { type: 'object', properties: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, descriptor(value)])), required: Object.keys(fields), additionalProperties: true }
  assertObjectJsonSchema(schema)
  return schema
}
function assertIdle(parent: Agent): void {
  if (parent.status !== 'idle' || parent.inbox.nextTurn.length || parent.inbox.nextStep.length) throw new Error('Conversation is generating; wait for its turn to end')
}

function assertForkContext(parent: Agent): void {
  const events = parent.session?.snapshotEvents() ?? []
  const boundary = events.reduce((last, event) => event.type === 'turn/end' ? event.seq : last, -1)
  if (events.some(event => event.seq > boundary && event.type.startsWith('compaction/'))) throw new Error('Conversation compaction is newer than the last completed turn; send a new message and wait for that turn to end before retrying Complete.')
}

function startForeground(context: NodeContext): NodePlan {
  const rendered = renderTextTemplate(context.definition.prompt as string, context.input)
  const prompt = rendered.trim() ? rendered : '请先询问我希望处理什么任务。'
  const previous = state(context.fact)
  if (context.fact?.status === 'succeeded' || previous?.promptStarted) return { fact: context.fact! }
  if (context.fact?.status === 'running') throw new Error('Node is already running')
  const business: AgentState = { ...previous, mode: 'foreground', sessionId: previous?.sessionId ?? randomUUID(), requestId: previous?.requestId ?? randomUUID() }
  return { fact: { kind: 'agent', status: 'running', business }, run: async () => {
    const sessionId = SessionId(business.sessionId!)
    if (!business.sessionCreated) {
      await context.services.sessionController.create({ sessionId, workspaceId: WorkspaceId(context.workspaceId) })
      business.sessionCreated = true
      await context.save({ kind: 'agent', status: 'running', business: { ...business } })
    }
    if (!business.promptStarted) {
      await context.services.sessionController.prompt({ sessionId, requestId: business.requestId as SessionRequestId, mode: 'queue', content: [{ type: 'text', text: prompt }] }, new AbortController().signal)
      business.promptStarted = true
      await context.save({ kind: 'agent', status: 'running', business: { ...business } })
    }
    return { kind: 'agent', status: 'waiting', business }
  } }
}

function attemptPlan(context: NodeContext, parentFor: () => Promise<Agent>): NodePlan {
  const isBackground = background(context)
  const attempt: AgentAttempt = { id: randomUUID(), status: 'running' }
  const business: AgentState = { ...state(context.fact), mode: isBackground ? 'background' : 'foreground', attempts: [...state(context.fact)?.attempts ?? [], attempt] }
  delete business.pendingOutput
  return { fact: { kind: 'agent', status: 'running', business }, run: async () => {
    let run: Awaited<ReturnType<typeof context.services.subagents.start>> | undefined
    try {
      const parent = await parentFor()
      if (isBackground) business.parentSessionId = parent.id
      const schema = Object.keys(context.definition.output_schema ?? {}).length ? outputSchema(context.definition.output_schema!) : undefined
      const prompt = isBackground ? renderTextTemplate(context.definition.prompt as string, context.input)
        : '只整理并核验当前对话已完成任务的结果。可以读取相关产物，但不得补做任务或修改文件。材料缺失、读取失败或无法确定结果时明确报告失败，不猜测、不补造字段。通过 structured_output 提交已核验的结果。'
      // Native fork synchronously snapshots the completed-turn prefix. Do not
      // await anything between this guard and start. Files are not snapshotted.
      if (!isBackground) { assertIdle(parent); assertForkContext(parent) }
      const pending = context.services.subagents.start(isBackground ? 'spawn' : 'fork', { parent, signal: new AbortController().signal,
        ...(isBackground ? { agentOptions: context.services.agentDefaultModel.currentSelection() } : {}),
        label: isBackground ? context.definition.id : 'Workflow result handoff', prompt: [{ type: 'text', text: prompt }], ...(schema ? { outputSchema: schema } : {}) })
      run = await pending
      attempt.address = { kind: 'subagent', parentSessionId: parent.id, childSessionId: run.id, mode: 'one-shot' }
      await context.save({ kind: 'agent', status: 'running', business: structuredClone(business) })
      const result = await run.result
      if (result.stopReason !== 'completed' || schema && result.structured === undefined) throw new Error(result.diagnostic ?? `Agent attempt failed: ${result.stopReason}; structured output required when outputs are declared`)
      const output = context.validateOutput(schema ? result.structured : {})
      attempt.status = 'succeeded'; attempt.output = output
      if (isBackground) return { kind: 'agent', status: 'waiting', business: { ...business, pendingOutput: output } } as NodeFact
      return { kind: 'agent', status: 'succeeded', business, output } as NodeFact
    } catch (error) {
      attempt.status = 'failed'; attempt.error = error instanceof Error ? error.message : String(error)
      return { kind: 'agent', status: 'failed', business, error: attempt.error } as NodeFact
    } finally { await run?.dispose() }
  } }
}

/** Each plugin activation owns its parents; native Agent lifetimes also belong to that Cordis owner. */
export function createAgentNode(host?: Context): ServerNode & { dispose(): Promise<void> } {
  const parents = new Map<string, Promise<AgentHandle>>()
  function parentFor(context: NodeContext): Promise<Agent> {
    let pending = parents.get(context.workspaceId)
    if (!pending) {
      const previous = context.services.workflowNodes.records('agent').find(record => record.workspaceId === context.workspaceId && state(record.fact)?.mode === 'background' && state(record.fact)?.parentSessionId)
      const savedId = state(previous?.fact)?.parentSessionId
      const workspace = context.services.workspaceRegistry.get(WorkspaceId(context.workspaceId))
      if (!workspace) throw new Error('Workspace is unavailable')
      pending = (async () => {
        if (savedId) return context.services.agents.resume({ resumeSessionId: SessionId(savedId), setup: async (agentCtx, agent) => {
          await context.services.agentPresets.mount(agentCtx, agent.session.header.agentPreset)
        } })
        const preset = await context.services.agentPresets.resolve()
        if (preset.broken) throw new Error(`Agent preset ${preset.id}: ${preset.broken}`)
        return context.services.agents.create({ sessionId: SessionId(randomUUID()), meta: { cwd: workspace.path, origin: 'subagent', agentPreset: preset.id },
          agentOptions: context.services.agentDefaultModel.currentSelection(), setup: async agentCtx => { await context.services.agentPresets.mount(agentCtx, preset.id) } })
      })()
      parents.set(context.workspaceId, pending)
      void pending.catch(() => { if (parents.get(context.workspaceId) === pending) parents.delete(context.workspaceId) })
    }
    return pending.then(handle => handle.agent)
  }
  const start = (context: NodeContext): NodePlan => {
    if (context.fact?.status === 'succeeded' || background(context) && state(context.fact)?.pendingOutput) return { fact: context.fact! }
    if (context.fact?.status === 'running') throw new Error('Node is already running')
    return background(context) ? attemptPlan(context, () => parentFor(context)) : startForeground(context)
  }
  return {
    kind: 'agent', requires: ['sessionController', 'agents', 'subagents', 'agentDefaultModel', 'agentPresets', 'workspaceRegistry', 'workflowNodes'],
    async dispose() { await Promise.allSettled([...parents.values()].map(async pending => (await pending).dispose())); parents.clear() },
    describe({ definition, ready, fact }) {
      const business = state(fact)
      const isBackground = background({ definition })
      const live = business?.sessionId && host?.agents.get(SessionId(business.sessionId))
      const generating = live && (live.status !== 'idle' || live.inbox.nextTurn.length > 0 || live.inbox.nextStep.length > 0)
      const canComplete = isBackground ? business?.pendingOutput !== undefined || fact?.status === 'succeeded' : business?.sessionCreated
      const records = business?.attempts?.some(attempt => Boolean(attempt.address?.parentSessionId && attempt.address.childSessionId))
      const retry = isBackground && (fact?.status === 'failed' || fact?.status === 'unknown')
      return { actions: [
        ...(ready && !business?.sessionCreated && !records && !retry && business?.pendingOutput === undefined && fact?.status !== 'succeeded' ? [{ id: 'start', position: 1 as const, icon: 'execute' as const, label: { namespace: name, key: 'executeNode' }, target: { type: 'server' as const }, disabled: fact?.status === 'running' }] : []),
        ...(!isBackground && business?.sessionCreated ? [{ id: 'open', position: 1 as const, icon: 'conversation' as const, label: { namespace: name, key: 'openSession' }, target: { type: 'client' as const, handler: 'openSession' } }] : []),
        ...(records ? [{ id: 'records', position: (isBackground ? 1 : 3) as 1 | 3, icon: 'record' as const, label: { namespace: name, key: 'openRecord' }, target: { type: 'client' as const, handler: 'records' } }] : []),
        ...(ready ? [{ id: 'complete', position: 2 as const, icon: 'complete' as const, label: { namespace: name, key: 'completeSessionAgent' }, target: { type: 'server' as const }, disabled: !canComplete || fact?.status === 'running' || Boolean(generating) }] : []),
        ...(ready && retry ? [{ id: 'start', position: 3 as const, icon: 'retry' as const, label: { namespace: name, key: 'retryNavigation' }, target: { type: 'server' as const } }] : []),
      ] }
    },
    validateFact(fact) {
      const business = state(fact)
      if (!business || !['foreground', 'background', undefined].includes(business.mode)) throw new Error('Invalid agent business state')
      if (business.mode !== 'background' && (typeof business.sessionId !== 'string' || typeof business.requestId !== 'string')) throw new Error('Invalid agent conversation identity')
      for (const key of ['sessionCreated', 'promptStarted'] as const) if (business[key] !== undefined && typeof business[key] !== 'boolean') throw new Error('Invalid agent conversation state')
      if (business.attempts !== undefined && (!Array.isArray(business.attempts) || business.attempts.some(a => !a || typeof a.id !== 'string' || !['running', 'succeeded', 'failed', 'unknown'].includes(a.status) || a.address && (a.address.kind !== 'subagent' || a.address.mode !== 'one-shot' || typeof a.address.parentSessionId !== 'string' || typeof a.address.childSessionId !== 'string')))) throw new Error('Invalid agent attempts')
      if (business.pendingOutput !== undefined && (business.mode !== 'background' || fact.status !== 'waiting' || !business.pendingOutput || typeof business.pendingOutput !== 'object' || Array.isArray(business.pendingOutput))) throw new Error('Invalid agent pending output')
    },
    validate(node) {
      if (typeof node.prompt !== 'string') throw new Error(`Node ${node.id}: prompt must be a string`)
      if (node.mode !== undefined && node.mode !== 'foreground' && node.mode !== 'background') throw new Error(`Node ${node.id}: mode must be foreground or background`)
      outputSchema(node.output_schema ?? {})
      validateTextTemplate(node, 'prompt')
      if (node.is_auto_start !== undefined && typeof node.is_auto_start !== 'boolean') throw new Error(`Node ${node.id}: is_auto_start must be a boolean`)
    },
    ready(context) { return context.definition.is_auto_start === true && !context.fact ? start(context) : undefined },
    action(context, action, payload) {
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) throw new Error('Unsupported agent action')
      if (context.fact?.status === 'running') throw new Error('Node is already running')
      if (action === 'start') return start(context)
      if (action !== 'complete' || !context.fact) throw new Error('Agent cannot perform this action now')
      if (context.fact.status === 'succeeded') return { fact: context.fact }
      const business = state(context.fact)!
      if (background(context)) {
        if (business.pendingOutput === undefined) throw new Error('Agent has no result awaiting confirmation')
        const { pendingOutput, ...confirmed } = business
        return { fact: { kind: 'agent', status: 'succeeded', business: confirmed, output: context.validateOutput(pendingOutput) } }
      }
      if (!business.sessionCreated || !business.promptStarted) throw new Error('Conversation has not started')
      const live = context.services.agents.get(SessionId(business.sessionId!))
      if (live) assertIdle(live)
      if (!Object.keys(context.definition.output_schema ?? {}).length) return { fact: { ...context.fact, status: 'succeeded', error: undefined, output: {} } }
      return attemptPlan(context, async () => {
        const live = context.services.agents.get(SessionId(business.sessionId!))
        if (live) return live
        const result = await context.services.sessionController.resolveAgent(SessionId(business.sessionId!))
        if ('error' in result) throw result.error
        return result.agent
      })
    },
    recover(fact) {
      if (fact.status !== 'running') return fact
      const business = state(fact)!
      if (business.attempts?.some(a => a.status === 'running')) return { ...fact, status: 'unknown', error: 'Previous Agent attempt was interrupted; result is unknown. Retry explicitly.', business: { ...business, attempts: business.attempts.map(a => a.status === 'running' ? { ...a, status: 'unknown' as const } : a) } }
      return business.promptStarted ? { ...fact, status: 'waiting', error: undefined }
        : { ...fact, status: 'unknown', error: 'Previous agent start is incomplete; execute to resume.' }
    },
    project(fact) { return (fact.business ?? {}) as NodeData },
  }
}
export const agentNode = createAgentNode()

/** Only a successfully created foreground conversation is a navigation association. */
export function associatedSession(fact: NodeFact): string | undefined {
  const business = state(fact)
  return fact.kind === 'agent' && business?.mode !== 'background' && business?.sessionCreated === true
    && typeof business.sessionId === 'string' && business.sessionId ? business.sessionId : undefined
}

export const name = '@dsh-workflow/node-agent'
export const inject = ['workflowNodes', 'sessionController', 'agents', 'subagents', 'agentDefaultModel', 'agentPresets', 'workspaceRegistry', 'webServer']
export function apply(ctx: Context): void {
  const node = createAgentNode(ctx)
  const unregister = ctx.webServer.register({ kind: 'prefix', path: '/api/dsh-workflow-studio/conversations', async handler(request, response) {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const match = path.match(/^\/api\/dsh-workflow-studio\/conversations\/([^/]+)\/instance$/)
    let result: { target: { instanceId: string; nodeInstanceId: string } | null } = { target: null }
    let status = 200
    if (!match) status = 404
    else if (request.method !== 'GET') status = 405
    else {
      try {
        const sessionId = decodeURIComponent(match[1]!)
        const record = ctx.workflowNodes.records('agent').find(record => associatedSession(record.fact) === sessionId)
        if (record) result = { target: { instanceId: record.instanceId, nodeInstanceId: record.nodeInstanceId } }
      } catch { status = 400 }
    }
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(result))
  } })
  ctx.workflowNodes.register(ctx, name, node, { dispose: async () => { unregister(); await node.dispose() } })
}
