import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as registryPlugin from '../../dsh-workflow-node/src/server.js'
import { nodeService, type ServerNode } from '../../dsh-workflow-node/src/index.js'

const echo: ServerNode = {
  kind: 'echo', requires: [], validate() {}, ready() { return undefined },
  action() { return { fact: { kind: 'echo', status: 'succeeded', output: {} } } },
  recover(fact) { return fact }, project() { return {} },
  describe() { return { actions: [{ id: 'start', label: { text: 'Echo' }, target: { type: 'server' }, position: 1, icon: 'execute' }] } },
}

test('host waits for a concrete type, rejects every conflict and restores the remaining contribution', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(registryPlugin)
    let available = false
    const consumer = ctx.plugin({ inject: [nodeService('echo')], apply(c: Context) {
      available = true
      c.effect(() => () => { available = false })
    } })
    await consumer
    assert.equal(available, false, 'registry existence is not type availability')
    const contribute = (source: string) => ctx.plugin({ inject: ['workflowNodes'], apply(c: Context) {
      c.workflowNodes.register(c, source, echo)
    } })
    const first = contribute('first-package')
    await first
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(available, true)
    const second = contribute('second-package')
    await second
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(available, false)
    assert.deepEqual(ctx.workflowNodes.diagnose('echo').sources.sort(), ['first-package', 'second-package'])
    await second.dispose()
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(available, true)
    await first.dispose()
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(available, false)
  } finally { await ctx.fiber.dispose() }
})


test('node availability belongs to each host profile context', async () => {
  const first = new Context(), second = new Context()
  try {
    await first.plugin(registryPlugin)
    await second.plugin(registryPlugin)
    await first.plugin({ name: 'first-profile-node', inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, 'first-profile-node', echo) } })
    assert.equal(first.workflowNodes.has('echo'), true)
    assert.equal(second.workflowNodes.has('echo'), false)
    await second.plugin({ name: 'second-profile-node', inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, 'second-profile-node', echo) } })
    assert.equal(second.workflowNodes.has('echo'), true)
    assert.equal(first.workflowNodes.identify('echo')?.source, 'first-profile-node')
    assert.equal(second.workflowNodes.identify('echo')?.source, 'second-profile-node')
  } finally { await Promise.all([first.fiber.dispose(), second.fiber.dispose()]) }
})

test('built-in actions declare stable positions through failures and accepted result delivery', async () => {
  const { bashNode } = await import('../../dsh-workflow-node-bash/src/server.js')
  const { formNode } = await import('../../dsh-workflow-node-form/src/server.js')
  const { agentNode } = await import('../../dsh-workflow-node-agent/src/server.js')
  const context = { definition: { id: 'n', type: 'node' as const }, input: {}, ready: true }
  const actions = (node: ServerNode, fact?: any, definition = context.definition) => node.describe!({ ...context, definition, fact }).actions
  assert.deepEqual(actions(bashNode, { kind: 'bash', status: 'running' }).map(a => [a.id, a.position, a.disabled]), [['start', 1, true]])
  assert.deepEqual(actions(formNode, { kind: 'form', status: 'succeeded' }).map(a => [a.id, a.position]), [['retry', 1]])
  assert.deepEqual(actions(agentNode).map(a => [a.id, a.position, Boolean(a.disabled)]), [['start', 1, false], ['complete', 2, true]])
  const background: any = { ...context.definition, mode: 'background' }
  assert.deepEqual(actions(agentNode, { kind: 'agent', status: 'waiting', business: { mode: 'background', pendingOutput: {} } }, background).map(a => [a.id, a.position]), [['complete', 2]])
  const failure = { kind: 'agent', status: 'failed', business: { mode: 'background', attempts: [{ id: 'a', status: 'failed', address: { parentSessionId: 'p', childSessionId: 'c', mode: 'one-shot' } }] } }
  assert.deepEqual(actions(agentNode, failure, background).map(a => [a.id, a.position, Boolean(a.disabled)]), [['records', 1, false], ['complete', 2, true], ['start', 3, false]])
  assert.deepEqual(actions(agentNode, { ...failure, status: 'succeeded', output: {} }, background).map(a => [a.id, a.position, Boolean(a.disabled)]), [['records', 1, false], ['complete', 2, false]])
})
