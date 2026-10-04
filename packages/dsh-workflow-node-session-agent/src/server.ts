import type {} from '@deepseek-ai/dsh-host-webserver'
import { validateTextTemplate, renderTextTemplate } from 'dsh-workflow-node/text-template'
import { randomUUID } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type { NodeContext, NodeFact, ServerNode } from 'dsh-workflow-node/contract'

type SessionAgentState = { sessionId: string; requestId: string; sessionCreated?: boolean; promptStarted?: boolean }
const state = (fact?: NodeFact): SessionAgentState | undefined => fact?.business as SessionAgentState | undefined

function start(context: NodeContext) {
  const renderedPrompt = renderTextTemplate(context.definition.prompt as string, context.input)
  const prompt = renderedPrompt.trim() ? renderedPrompt : '请先询问我希望处理什么任务。'
  const previous = state(context.fact)
  if (context.fact?.status === 'succeeded') return { fact: context.fact }
  if (context.fact?.status === 'waiting' && previous?.sessionCreated) return { fact: context.fact }
  if (context.fact?.status === 'running') throw new Error('Node is already running')
  const business: SessionAgentState = { sessionId: previous?.sessionId ?? randomUUID(), requestId: previous?.requestId ?? randomUUID(), sessionCreated: previous?.sessionCreated, promptStarted: previous?.promptStarted }
  return {
    fact: { kind: 'session_agent', status: 'running', business } as NodeFact,
    run: async (): Promise<NodeFact> => {
      const sessionId = SessionId(business.sessionId)
      if (!business.sessionCreated) {
        await context.services.sessionController.create({ sessionId, workspaceId: WorkspaceId(context.workspaceId) })
        business.sessionCreated = true
        await context.save({ kind: 'session_agent', status: 'running', business: { ...business } })
      }
      if (!business.promptStarted) {
        await context.services.sessionController.prompt({ sessionId, requestId: business.requestId as SessionRequestId, mode: 'queue', content: [{ type: 'text', text: prompt }] }, new AbortController().signal)
        business.promptStarted = true
        await context.save({ kind: 'session_agent', status: 'running', business: { ...business } })
      }
      return { kind: 'session_agent', status: 'waiting', business }
    },
  }
}

/** Only a successfully created direct conversation is a navigation association. */
export function associatedSession(fact: NodeFact): string | undefined {
  const business = state(fact)
  return fact.kind === 'session_agent' && business?.sessionCreated === true
    && typeof business.sessionId === 'string' && business.sessionId ? business.sessionId : undefined
}

export const sessionAgentNode: ServerNode = {
  kind: 'session_agent',
  describe({ ready, fact }) {
    const business = state(fact)
    return { actions: [
      ...(ready && !['waiting', 'succeeded', 'running'].includes(fact?.status ?? '') ? [{ id: 'start', label: { namespace: name, key: 'executeNode' }, target: { type: 'server' as const }, primary: true }] : []),
      ...(business?.sessionCreated ? [{ id: 'open', label: { namespace: name, key: 'openSession' }, target: { type: 'client' as const, handler: 'openSession' } }] : []),
      ...(ready && business?.sessionCreated ? [{ id: 'complete', label: { namespace: name, key: 'completeSessionAgent' }, target: { type: 'server' as const }, disabled: fact?.status === 'running' }] : []),
    ] }
  },
  validateFact(fact) {
    const business = state(fact)
    if (!business || typeof business.sessionId !== 'string' || typeof business.requestId !== 'string' || (business.sessionCreated !== undefined && typeof business.sessionCreated !== 'boolean') || (business.promptStarted !== undefined && typeof business.promptStarted !== 'boolean')) throw new Error('Invalid session_agent business state')
  },

  requires: ['sessionController'],
  validate(node) {
    if (typeof node.prompt !== 'string') throw new Error(`Node ${node.id}: prompt must be a string`)
    if (Object.keys(node.output_schema ?? {}).length) throw new Error(`Node ${node.id}: session_agent cannot declare outputs`)
    validateTextTemplate(node, 'prompt')
    if (node.is_auto_start !== undefined && typeof node.is_auto_start !== 'boolean') throw new Error(`Node ${node.id}: is_auto_start must be a boolean`)
  },
  ready(context) { return context.definition.is_auto_start === true && !context.fact ? start(context) : undefined },
  action(context, name, payload) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length) throw new Error('Unsupported session_agent action')
    if (name === 'start') return start(context)
    if (name === 'complete' && context.fact?.status !== 'running' && state(context.fact)?.sessionCreated) return { fact: { ...context.fact!, status: 'succeeded' as const, error: undefined, output: {} } }
    throw new Error('Session agent cannot perform this action now')
  },
  recover(fact) {
    if (fact.status !== 'running') return fact
    return state(fact)?.promptStarted ? { ...fact, status: 'waiting', error: undefined }
      : { ...fact, status: 'unknown', error: 'Previous session_agent start is incomplete; execute to resume.' }
  },
  project(fact) { return (fact.business ?? {}) as Record<string, never> },
}

export const name = '@dsh-workflow/node-session-agent'
export const inject = ["workflowNodes", "sessionController", "webServer"]
export function apply(ctx: import('@deepseek-ai/cordis').Context): void {
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
        const record = ctx.workflowNodes.records('session_agent').find(record => associatedSession(record.fact) === sessionId)
        if (record) result = { target: { instanceId: record.instanceId, nodeInstanceId: record.nodeInstanceId } }
      } catch { status = 400 }
    }
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(result))
  } })
  ctx.workflowNodes.register(ctx, name, sessionAgentNode, { dispose: unregister })
}
