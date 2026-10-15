import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

// Deterministic model boundary; the real host still assembles context, executes
// structured_output, persists sessions and serves its native Conversation UI.
class FixtureAdapter extends LlmAdapter {
  taskFailed = false
  async listModels(provider) { return [{ provider, id: 'fixture', name: 'Fixture' }] }
  async resolveModel(provider, model) { return { provider, id: model, name: 'Fixture', context: { contextWindow: 262144 } } }
  async *stream(options) {
    const text = JSON.stringify(options.messages)
    const expectedDirectory = options.messages.filter(message => message.role === 'user').flatMap(message => message.content).find(block => block.type === 'text' && block.text.includes('EXPECTED_CWD='))?.text.split('EXPECTED_CWD=')[1].trim()
    if (!options.purpose && text.includes('Compute CONTEXT_MARKER_731') && !options.tools?.some(tool => tool.name === 'bash')) throw new Error('Background task did not inherit native preset tools')
    if (!options.purpose && text.includes('FAIL_ONCE_TASK') && !this.taskFailed) { this.taskFailed = true; throw new Error('Fixture task failed') }
    if (!options.purpose && text.includes('SLOW_BACKGROUND')) await setTimeout(30_000, undefined, { signal: options.signal })
    if (!options.purpose && text.includes('Compute CONTEXT_MARKER_731')) {
      const results = options.messages.filter(message => message.role === 'tool')
      if (results.length) {
        if (results.at(-1).isError || !JSON.stringify(results.at(-1).content).includes('E2E_WORKSPACE_WRITE_OK') || expectedDirectory && !JSON.stringify(results.at(-1).content).includes(expectedDirectory)) throw new Error('Native workspace write/read task failed')
      } else {
        const block = { type: 'tool-call', id: randomUUID(), name: 'bash', arguments: JSON.stringify({ command: "printf 'E2E_WORKSPACE_WRITE_OK\\n' > agent-native-tool-proof.txt && cat agent-native-tool-proof.txt && pwd", description: 'Write and read the isolated task artifact' }) }
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'block-end', index: 0, block }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
    }
    const openspec = text.includes('OPENSPEC_CHANGE_E2E')
    const tool = options.tools?.find(tool => tool.name === 'structured_output')
    if (tool) {
      if (text.includes('MISSING_MATERIAL') && !text.includes('MATERIAL_READY')) throw new Error('Required material is missing')
      if (text.includes('COMPACT_PROBE') && (text.includes('ERASED_SEED_902') || text.includes('LATE_MESSAGE_498'))) throw new Error('fork included shadowed or later material')
      if (!text.includes('CONTEXT_MARKER_731')) throw new Error('fork did not inherit completed parent context')
      if (openspec && !text.includes('OPENSPEC_CREATED_CHANGE=fix-login-redirect-loop')) throw new Error('fork did not inherit the proposed change name')
      const output = openspec ? { change_name: 'fix-login-redirect-loop' } : { result: 'CONTEXT_MARKER_731', ...(expectedDirectory ? { directory: expectedDirectory } : {}) }
      const block = { type: 'tool-call', id: randomUUID(), name: 'structured_output', arguments: JSON.stringify(output) }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      if (!options.purpose && text.includes('SLOW_MAIN')) await setTimeout(5000, undefined, { signal: options.signal })
      const block = { type: 'text', text: openspec ? 'CONTEXT_MARKER_731 OPENSPEC_CREATED_CHANGE=fix-login-redirect-loop（模拟规划结果，仅验证交付）' : 'CONTEXT_MARKER_731' }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: block.text }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}
export const name = '@dsh-workflow/agent-host-fixture'
export const inject = ['workflowNodes', 'agents', 'subagents', 'llm', 'workspaceRegistry', 'sessionController', 'agentPresets']
export function apply(ctx) {
  ctx.llm.registerAdapter(['workflow-fixture'], new FixtureAdapter())
  ctx.workflowNodes.register(ctx, name, {
    kind: 'host_probe', requires: inject.filter(key => key !== 'workflowNodes'), validate() {}, ready() {}, recover: fact => fact, project: fact => fact.business ?? {},
    describe: ({ ready, fact }) => ({ actions: [ ...(ready ? [{ id: 'start', position: 1, icon: 'execute', label: { text: '验证宿主' }, target: { type: 'server' } }] : []), ...(fact?.business?.address ? [{ id: 'record', position: 3, icon: 'record', label: { text: '打开子记录' }, target: { type: 'client', handler: 'record' } }] : []) ] }),
    action(context) {
      return { fact: { kind: 'host_probe', status: 'running' }, run: async () => {
        const workspace = ctx.workspaceRegistry.get(context.workspaceId)
        const handle = await ctx.agents.create({ sessionId: randomUUID(), meta: { cwd: workspace.path, origin: 'subagent' }, agentOptions: { provider: 'workflow-fixture', model: 'fixture' } })
        ctx.effect(() => () => handle.dispose())
        const hidden = handle.agent
        const foregroundId = randomUUID()
        await ctx.sessionController.create({ sessionId: foregroundId, workspaceId: context.workspaceId })
        await ctx.sessionController.selectModel({ sessionId: foregroundId, provider: 'workflow-fixture', model: 'fixture' })
        const resolved = await ctx.sessionController.resolveAgent(foregroundId)
        if ('error' in resolved) throw resolved.error
        const parent = resolved.agent
        // Seed a completed turn through the public Agent inbox contract.
        parent.followup({ id: randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Remember CONTEXT_MARKER_731 ERASED_SEED_902 ' + 'original-context '.repeat(10000) }] })
        await parent.whenIdle()
        parent.followup({ id: randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep only the useful marker for the next task' }] })
        await parent.whenIdle()
        const compacted = await ctx.agentPresets.serviceFor(parent, 'compaction').compactNow(parent, new AbortController().signal)
        if (!compacted) throw new Error('Native compaction did not select useful history')
        const idleFork = await ctx.subagents.start('fork', { parent, prompt: [{ type: 'text', text: 'COMPACT_PROBE: inspect the current effective context' }], outputSchema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] }, signal: new AbortController().signal })
        const idleInheritedCompaction = idleFork.localAgent.session.snapshotEvents().some(event => event.type === 'compaction/summary')
        await idleFork.result
        await idleFork.dispose()
        if (idleInheritedCompaction) throw new Error('rc.1 fork boundary changed; recheck the handoff guard')
        parent.followup({ id: randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Use the compacted context COMPACT_PROBE' }] })
        await parent.whenIdle()
        const background = await ctx.subagents.start('spawn', { parent: hidden, prompt: [{ type: 'text', text: 'Remember CONTEXT_MARKER_731' }], signal: new AbortController().signal })
        await background.result
        await background.dispose()
        const pendingFork = ctx.subagents.start('fork', { parent, prompt: [{ type: 'text', text: 'Return the inherited marker' }], outputSchema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false }, signal: new AbortController().signal })
        parent.followup({ id: randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'LATE_MESSAGE_498' }] })
        const run = await pendingFork
        if (run.localAgent.session.header.cwd !== workspace.path || run.localAgent.options.provider !== 'workflow-fixture') throw new Error('Child lost workspace or model inheritance')
        const address = { kind: 'subagent', parentSessionId: parent.id, childSessionId: run.id, mode: 'one-shot' }
        await context.save({ kind: 'host_probe', status: 'running', business: { parentId: hidden.id, address } })
        try {
          const result = await run.result
          if (result.stopReason !== 'completed' || result.structured?.result !== 'CONTEXT_MARKER_731') throw new Error(JSON.stringify(result))
          return { kind: 'host_probe', status: 'waiting', business: { parentId: hidden.id, address, result: result.structured, compacted: true, idleCompactionExcluded: !idleInheritedCompaction } }
        } finally { await run.dispose() }
      } }
    },
  })
}
