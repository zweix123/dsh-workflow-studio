import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as registryPlugin from '../../dsh-workflow-node/src/server.js'
import { nodeService, type ServerNode } from '../../dsh-workflow-node/src/index.js'

const echo: ServerNode = {
  kind: 'echo', requires: [], validate() {}, ready() { return undefined },
  action() { return { fact: { kind: 'echo', status: 'succeeded', output: {} } } },
  recover(fact) { return fact }, project() { return {} },
  describe() { return { actions: [{ id: 'start', label: { text: 'Echo' }, target: { type: 'server' }, primary: true }] } },
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
