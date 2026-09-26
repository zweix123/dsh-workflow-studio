import assert from 'node:assert/strict'
import test from 'node:test'
import { compile, type DagDefinition } from '../src/host/dag/index.js'
import { inspectLayout } from '../src/shared/layout.js'
import { buildCanvasGraph } from '../src/client/pages/workflow-studio/instances/build-canvas-graph.js'
import type { InstanceDetail } from '../src/shared/types/workflow-instance.js'

const node = (id: string) => ({ id, type: 'node' as const })
const edge = (from: string, to: string) => ({ type: 'edge' as const, from, to })
const chain = (layout?: unknown): DagDefinition => ({ id: 'root', type: 'dag', ...(layout === undefined ? {} : { layout }), dag: [
  node('a'), node('b'), node('c'), node('d'), node('e'), edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('d', 'e'),
] }) as DagDefinition

function graph(definition: DagDefinition) {
  const program = compile(definition)
  const detail: InstanceDetail = {
    id: 'run', workspaceId: 'w', name: 'Run', templateId: 'flow', createdAt: '2026-09-26T00:00:00Z', input: {},
    definition: program.getDefinition(), snapshot: program.createExecution({}).getSnapshot(),
  }
  return { ...buildCanvasGraph(detail), detail }
}

function position(nodes: ReturnType<typeof graph>['nodes'], label: string) {
  const row = nodes.find(item => item.data.label === label)
  assert.ok(row, `missing ${label}`)
  return row.position
}

test('pure directions, consecutive vertical columns, mixed turns and legacy horizontal positions', () => {
  const legacy = graph(chain()).nodes
  const horizontal = graph(chain({ direction: 'horizontal' })).nodes
  assert.deepEqual(horizontal.map(item => item.position), legacy.map(item => item.position))
  const vertical = graph(chain({ direction: 'vertical' })).nodes
  assert.ok(position(vertical, 'b').y > position(vertical, 'a').y)
  assert.equal(position(vertical, 'b').x, position(vertical, 'a').x)
  const columns = graph(chain({ direction: 'vertical', segments: [
    { start_at: 'c', direction: 'vertical' }, { start_at: 'e', direction: 'vertical' },
  ] })).nodes
  assert.ok(position(columns, 'c').x > position(columns, 'b').x)
  assert.ok(position(columns, 'e').x > position(columns, 'd').x)
  assert.ok(position(columns, 'd').y > position(columns, 'c').y)
  assert.ok(position(columns, 'e').y > position(columns, 'c').y) // Short final column is centered.
  assert.ok(position(columns, 'e').y < position(columns, 'd').y)
  const mixed = graph(chain({ direction: 'horizontal', segments: [
    { start_at: 'c', direction: 'vertical' }, { start_at: 'e', direction: 'horizontal' },
  ] }))
  assert.ok(position(mixed.nodes, 'b').x > position(mixed.nodes, 'a').x)
  assert.ok(position(mixed.nodes, 'd').y > position(mixed.nodes, 'c').y)
  assert.ok(position(mixed.nodes, 'e').x > position(mixed.nodes, 'd').x)
  assert.ok(mixed.edges.every(item => item.markerEnd))
})

test('unsafe fork turns, unknown starts, duplicates and order errors warn without changing execution', () => {
  const branch: DagDefinition = { id: 'root', type: 'dag', layout: { direction: 'horizontal', segments: [{ start_at: 'b', direction: 'vertical' }] }, dag: [
    node('a'), node('b'), node('c'), node('m'), node('n'), edge('a', 'b'), edge('a', 'c'), edge('b', 'm'), edge('c', 'm'), edge('m', 'n'),
  ] }
  assert.equal(inspectLayout(branch).issues[0]?.code, 'unsafeStart')
  branch.layout = { direction: 'horizontal', segments: [{ start_at: 'n', direction: 'vertical' }] }
  assert.equal(inspectLayout(branch).issues.length, 0)
  const invalid = chain({ direction: 'vertical', segments: [
    { start_at: 'missing', direction: 'vertical' }, { start_at: 'c', direction: 'vertical' },
    { start_at: 'c', direction: 'horizontal' }, { start_at: 'b', direction: 'horizontal' },
  ] })
  assert.deepEqual(inspectLayout(invalid).issues.map(item => item.code), ['unknownStart', 'duplicateStart', 'unorderedStart'])
  assert.deepEqual(graph(invalid).nodes.map(item => item.position), graph(chain()).nodes.map(item => item.position))
  const before = compile(chain()).createExecution({})
  const after = compile(invalid).createExecution({})
  assert.deepEqual(before.getFrontier().map(item => item.definition.id), after.getFrontier().map(item => item.definition.id))
  assert.deepEqual(before.getSnapshot().edges, after.getSnapshot().edges)
  assert.deepEqual(before.exportState().frames, after.exportState().frames)
})

test('nested layers validate independently and old snapshots have no layout diagnostics', () => {
  const nested: DagDefinition = { id: 'root', type: 'dag', layout: { direction: 'horizontal' }, dag: [
    { id: 'inner', type: 'dag', layout: { direction: 'vertical', segments: [{ start_at: 'x', direction: 'vertical' }] }, dag: [node('x'), node('y'), edge('x', 'y')] },
    node('last'), edge('inner', 'last'),
  ] }
  const report = inspectLayout(nested)
  assert.deepEqual(report.issues.map(item => item.path), [['root', 'inner']])
  const result = graph(nested)
  const inner = result.nodes.find(item => item.data.label === 'inner')!
  const child = result.nodes.find(item => item.data.label === 'x')!
  assert.equal(child.parentId, inner.id)
  for (const item of result.nodes.filter(item => item.parentId === inner.id)) {
    assert.ok(item.position.x >= 0 && item.position.y >= 40)
    assert.ok(item.position.x + Number(item.style?.width) <= Number(inner.style?.width))
    assert.ok(item.position.y + Number(item.style?.height) <= Number(inner.style?.height))
  }
  assert.equal(inspectLayout(chain()).layers.length, 0)
})

test('vertical fork and merge spreads branches sideways while preserving all incoming edges', () => {
  const branch: DagDefinition = { id: 'root', type: 'dag', layout: { direction: 'vertical' }, dag: [
    node('a'), node('b'), node('c'), node('m'), edge('a', 'b'), edge('a', 'c'), edge('b', 'm'), edge('c', 'm'),
  ] }
  const { nodes, edges } = graph(branch)
  assert.notEqual(position(nodes, 'b').x, position(nodes, 'c').x)
  assert.ok(position(nodes, 'm').y > position(nodes, 'b').y)
  assert.ok(position(nodes, 'm').y > position(nodes, 'c').y)
  assert.equal(edges.filter(item => item.target === nodes.find(node => node.data.label === 'm')?.id).length, 2)
  assert.ok(edges.every(item => item.targetHandle === 'top' && item.sourceHandle === 'bottom'))
})

test('cross-column edges use the outer gutter and custom-layout cards do not overlap', () => {
  const definition = chain({ direction: 'vertical', segments: [
    { start_at: 'c', direction: 'vertical' }, { start_at: 'e', direction: 'vertical' },
  ] })
  const { nodes, edges } = graph(definition)
  const cards = nodes.filter(item => item.type === 'workflow')
  for (const [index, first] of cards.entries()) for (const second of cards.slice(index + 1)) {
    const separated = first.position.x + Number(first.style?.width) <= second.position.x
      || second.position.x + Number(second.style?.width) <= first.position.x
      || first.position.y + Number(first.style?.height) <= second.position.y
      || second.position.y + Number(second.style?.height) <= first.position.y
    assert.ok(separated, `${first.data.label} overlaps ${second.data.label}`)
  }
  const byId = new Map(nodes.map(item => [item.id, item]))
  const cross = edges.filter(item => byId.get(item.source)?.data.label === 'b' && byId.get(item.target)?.data.label === 'c'
    || byId.get(item.source)?.data.label === 'd' && byId.get(item.target)?.data.label === 'e')
  assert.equal(cross.length, 2)
  assert.ok(cross.every(item => item.sourceHandle === 'bottom' && item.targetHandle === 'top'))
  const bottom = Math.max(...cards.map(item => item.position.y + Number(item.style?.height)))
  assert.ok(cross.every(item => Number(item.data?.routeY) > bottom), JSON.stringify({ bottom, cross: cross.map(item => item.data) }))
  assert.ok(cross.every(item => Number(item.data?.routeX) < byId.get(item.target)!.position.x))
  assert.ok(cross.every(item => Number(item.data?.routeTopY) < byId.get(item.target)!.position.y))
  assert.ok(edges.every(item => item.markerEnd))
})

test('vertical for items retain original order and aggregate below the group', () => {
  const definition: DagDefinition = { id: 'root', type: 'dag', layout: { direction: 'vertical', segments: [{ start_at: 'done', direction: 'vertical' }] }, dag: [
    { id: 'prepare', type: 'node', output_schema: { jobs: { type: 'array', items: { type: 'object', properties: { key: 'string' } } } } },
    node('worker'), node('done'), { type: 'edge', from: 'prepare', to: 'worker', for: '$.jobs' }, edge('worker', 'done'),
  ] }
  const program = compile(definition)
  const execution = program.createExecution({})
  execution.submit(execution.getFrontier()[0]!.instanceId, { jobs: [{ key: 'first' }, { key: 'second' }] })
  const detail: InstanceDetail = {
    id: 'run', workspaceId: 'w', name: 'Run', templateId: 'flow', createdAt: '2026-09-26T00:00:00Z', input: {},
    definition: program.getDefinition(), snapshot: execution.getSnapshot(),
  }
  detail.snapshot.instances.reverse()
  const { nodes, edges } = buildCanvasGraph(detail)
  const items = nodes.filter(item => item.data.label === 'worker').sort((a, b) => Number(a.data.forItem?.index) - Number(b.data.forItem?.index))
  assert.equal(items.length, 2)
  assert.ok(items[0]!.position.x < items[1]!.position.x)
  assert.equal(items[0]!.position.y, items[1]!.position.y)
  const outlet = nodes.find(item => item.type === 'aggregate')!
  assert.ok(outlet.position.y > items[0]!.position.y)
  assert.ok(position(nodes, 'done').x > outlet.position.x)
  assert.equal(edges.filter(item => item.data?.status === 'active').length, 2)
  const downstream = edges.find(item => item.source === outlet.id && item.target === nodes.find(node => node.data.label === 'done')?.id)
  assert.ok(downstream)
  assert.equal(downstream.sourceHandle, 'bottom')
  assert.equal(downstream.targetHandle, 'top')
  assert.ok(Number(downstream.data?.routeY) > outlet.position.y + Number(outlet.style?.height))
  assert.ok(Number(downstream.data?.routeTopY) < position(nodes, 'done').y)
})

test('recursive DAG instances reuse the definition layout without changing restored execution facts', () => {
  const definition: DagDefinition = { id: 'recur', type: 'dag', layout: { direction: 'vertical' }, dag: [
    { id: 'step', type: 'node', output_schema: { again: 'boolean' } },
    { type: 'edge', from: 'step', to: 'recur', if: '$.again' },
  ] }
  const program = compile(definition)
  const execution = program.createExecution({})
  execution.submit(execution.getFrontier()[0]!.instanceId, { again: true })
  const saved = execution.exportState()
  const restored = program.restoreExecution(saved)
  assert.deepEqual(restored.getSnapshot(), execution.getSnapshot())
  const detail: InstanceDetail = {
    id: 'run', workspaceId: 'w', name: 'Run', templateId: 'flow', createdAt: '2026-09-26T00:00:00Z', input: {},
    definition: program.getDefinition(), snapshot: restored.getSnapshot(),
  }
  const { nodes, edges } = buildCanvasGraph(detail)
  const firstStep = nodes.find(item => item.data.label === 'step' && !item.parentId)!
  const recursiveGroup = nodes.find(item => item.data.label === 'recur' && item.parentId === undefined)!
  const nestedStep = nodes.find(item => item.data.label === 'step' && item.parentId === recursiveGroup.id)!
  const waitingRecursive = nodes.find(item => item.data.label === 'recur' && item.parentId === recursiveGroup.id)!
  assert.ok(recursiveGroup.position.y > firstStep.position.y)
  assert.ok(nestedStep.position.y >= 40)
  assert.ok(waitingRecursive.position.y >= nestedStep.position.y + Number(nestedStep.style?.height))
  assert.ok(waitingRecursive.position.y + Number(waitingRecursive.style?.height) <= Number(recursiveGroup.style?.height))
  assert.ok(edges.some(item => item.source === firstStep.id && item.target === recursiveGroup.id
    && item.sourceHandle === 'bottom' && item.targetHandle === 'top'))
})
