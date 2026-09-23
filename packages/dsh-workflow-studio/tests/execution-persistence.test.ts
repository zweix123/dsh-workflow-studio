import assert from 'node:assert/strict'
import test from 'node:test'
import { compile } from '../src/host/dag-engine/index.js'
import { buildCanvasGraph } from '../src/client/pages/workflow-studio/instances/build-canvas-graph.js'
import type { InstanceDetail } from '../src/shared/types/workflow-instance.js'

test('restored for items keep separate identities and feed one aggregated downstream connection', () => {
  const definition = {
    id: 'root', type: 'dag' as const,
    input_schema: { jobs: { type: 'array' as const, items: { type: 'object' as const, properties: { key: 'string' as const, title: 'string' as const } } } },
    dag: [
      { id: 'source', type: 'node' as const, input_schema: { jobs: { type: 'array' as const, items: { type: 'object' as const, properties: { key: 'string' as const, title: 'string' as const } } } }, output_schema: { jobs: { type: 'array' as const, items: { type: 'object' as const, properties: { key: 'string' as const, title: 'string' as const } } } } },
      { id: 'each', type: 'node' as const, input_schema: { title: 'string' as const }, output_schema: { done: 'string' as const } },
      { id: 'finish', type: 'node' as const, input_schema: { done: { type: 'array' as const, items: 'string' as const } } },
      { type: 'edge' as const, from: 'source', to: 'each', for: '$.jobs' },
      { type: 'edge' as const, from: 'each', to: 'finish' },
    ],
  }
  const program = compile(definition)
  const execution = program.createExecution({ jobs: [] })
  const source = execution.getFrontier()[0]!
  execution.submit(source.instanceId, { jobs: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] })
  const items = execution.getFrontier()
  assert.deepEqual(items.map(item => item.forItem?.key), ['a', 'b'])
  assert.deepEqual(execution.getSnapshot().instanceConnections?.map(edge => edge.toInstanceId), items.map(item => item.instanceId))
  execution.submit(items[0]!.instanceId, { done: 'first' })
  const restored = program.restoreExecution(JSON.parse(JSON.stringify(execution.exportState())))
  assert.deepEqual(restored.getFrontier().map(item => item.instanceId), [items[1]!.instanceId])
  restored.submit(items[1]!.instanceId, { done: 'second' })
  const finish = restored.getFrontier()[0]!
  assert.equal(finish.definition.id, 'finish')
  assert.deepEqual(finish.input, { done: ['first', 'second'] })
  const snapshot = restored.getSnapshot()
  assert.equal(snapshot.instanceConnections?.filter(edge => edge.toInstanceId === finish.instanceId).length, 1)
  const detail: InstanceDetail = { id: 'run', workspaceId: 'w', name: 'Run', templateId: 't', createdAt: new Date().toISOString(), definition: program.getDefinition(), input: { jobs: [] }, snapshot }
  const graph = buildCanvasGraph(detail)
  assert.equal(graph.edges.find(edge => edge.target === finish.instanceId)?.source, `aggregate:${snapshot.rootInstanceId}\u0000each`)
  assert.deepEqual(graph.edges.filter(edge => edge.data?.status === 'aggregation').map(edge => edge.source).sort(), items.map(item => item.instanceId).sort())

  const legacy = execution.exportState()
  legacy.version = 1
  delete legacy.connections
  assert.deepEqual(program.restoreExecution(legacy).getFrontier().map(item => item.instanceId), [items[1]!.instanceId])

  const broken = execution.exportState()
  broken.frames[0]!.positions.find(([id]) => id === 'each')![1].instances[0] = 'missing'
  assert.throws(() => program.restoreExecution(broken), /Invalid execution member/)
})
