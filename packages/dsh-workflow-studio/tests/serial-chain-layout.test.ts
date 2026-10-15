import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'
import { compile, type DagDefinition } from '../src/host/dag/index.js'
import { buildTemplateGraph } from '../src/client/pages/workflow-studio/templates/build-template-graph.js'
import { buildCanvasGraph } from '../src/client/pages/workflow-studio/instances/build-canvas-graph.js'
import { canvasPosition } from '../src/client/pages/workflow-studio/canvas/navigation.js'
import type { CanvasGraph } from '../src/client/pages/workflow-studio/canvas/types.js'
import type { InstanceDetail } from '../src/shared/types/workflow-instance.js'

const serialChain: DagDefinition = parse(readFileSync(new URL('../../../e2e/fixtures/core-regression/templates/serial-chain/workflow.yaml', import.meta.url), 'utf8'))
const ids = ['collect-request', 'plan-change', 'implement-verify', 'sync-archive']
const names = ['填写需求', '澄清需求与生成方案', '实施与验证', '同步规格与归档']

function detail(definition: DagDefinition): InstanceDetail {
  const program = compile(definition)
  return { id: 'run', workspaceId: 'w', name: 'Run', templateId: definition.id, createdAt: '2026-10-13T00:00:00Z', input: {},
    definition: program.getDefinition(), snapshot: program.createExecution({}).getSnapshot() }
}

function assertChain(graph: CanvasGraph, vertical = false, bypassCount = 1) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]))
  const cards = names.map(name => graph.nodes.find(node => node.data.label === name)!)
  const positions = cards.map(node => canvasPosition(node, byId))
  const axis = vertical ? 'x' : 'y'
  assert.ok(positions.every(position => position[axis] === positions[0]![axis]))
  const main = vertical ? 'y' : 'x'
  for (let index = 1; index < cards.length; index++) {
    assert.ok(positions[index]![main] >= positions[index - 1]![main] + Number(cards[index - 1]!.style?.[vertical ? 'height' : 'width']) + 88)
  }
  assert.equal(graph.edges.length, 3 + bypassCount)
  const bypasses = graph.edges.filter(edge => edge.data.perimeter)
  assert.equal(bypasses.length, bypassCount)
  assert.equal(new Set(bypasses.map(edge => edge.data.perimeter!.coordinate)).size, bypassCount)
  for (const edge of bypasses) {
    assert.equal(edge.data.perimeter!.axis, axis)
    assert.ok(edge.data.perimeter!.coordinate < Math.min(...positions.map(position => position[axis])))
    assert.equal(edge.sourceHandle, vertical ? 'left' : 'top')
    assert.equal(edge.targetHandle, vertical ? 'left' : 'top')
    assert.ok(edge.markerEnd)
  }
}

test('Serial preview and runtime align four stages, retain every dependency and stay stable across state changes', () => {
  assertChain(buildTemplateGraph(serialChain))
  const run = detail(serialChain)
  const initial = buildCanvasGraph(run)
  assertChain(initial)
  const program = compile(serialChain)
  const execution = program.createExecution({})
  execution.submit(execution.getFrontier()[0]!.instanceId, { request: 'A request' })
  execution.submit(execution.getFrontier()[0]!.instanceId, { change_name: 'fix-layout' })
  run.snapshot = execution.getSnapshot()
  const ready = buildCanvasGraph(run)
  assertChain(ready)
  assert.deepEqual(ready.nodes.map(node => [node.data.label, node.position]), initial.nodes.map(node => [node.data.label, node.position]))
  const archive = run.snapshot.waitingPositions.find(position => position.definitionId === ids[3])
  assert.ok(archive, 'archive still waits for implementation')
  const build = execution.getFrontier()[0]!
  execution.submit(build.instanceId, {})
  assert.equal(execution.getFrontier()[0]!.definition.id, ids[3])
  assert.deepEqual(execution.getFrontier()[0]!.input, { change_name: 'fix-layout' })
})

test('explicit directions and multiple bypasses use separate outer lanes in both projections', () => {
  for (const vertical of [false, true]) {
    const definition = structuredClone(serialChain)
    definition.layout = { direction: vertical ? 'vertical' : 'horizontal' }
    definition.dag.push({ type: 'edge', from: ids[0]!, to: ids[2]! })
    assertChain(buildTemplateGraph(definition), vertical, 2)
    assertChain(buildCanvasGraph(detail(definition)), vertical, 2)
  }
})

test('nested chain lanes stay inside their group, below its heading and left of vertical cards', () => {
  for (const vertical of [false, true]) {
    const inner = structuredClone(serialChain)
    inner.layout = { direction: vertical ? 'vertical' : 'horizontal' }
    const definition: DagDefinition = { id: 'root', type: 'dag', dag: [inner] }
    for (const graph of [buildTemplateGraph(definition), buildCanvasGraph(detail(definition))]) {
      assertChain(graph, vertical)
      const group = graph.nodes.find(node => node.data.source !== 'aggregate' && node.data.definitionId === inner.id)!
      const route = graph.edges.find(edge => edge.data.perimeter)!.data.perimeter!
      assert.ok(route.coordinate >= group.position[route.axis] + (vertical ? 28 : 40))
      for (const node of graph.nodes.filter(node => node.parentId === group.id)) {
        assert.ok(node.position.y >= 40)
        assert.ok(node.position.x + Number(node.style?.width) <= Number(group.style?.width))
        assert.ok(node.position.y + Number(node.style?.height) <= Number(group.style?.height))
      }
    }
  }
})

test('real parallel branches are not flattened into a serial chain', () => {
  const definition: DagDefinition = { id: 'parallel', type: 'dag', dag: [
    ...['start', 'left', 'right', 'join'].map(id => ({ id, type: 'node' as const })),
    ...[['start', 'left'], ['start', 'right'], ['left', 'join'], ['right', 'join'], ['start', 'join']].map(([from, to]) => ({ type: 'edge' as const, from: from!, to: to! })),
  ] }
  for (const graph of [buildTemplateGraph(definition), buildCanvasGraph(detail(definition))]) {
    assert.equal(graph.edges.length, 5)
    assert.ok(graph.edges.every(edge => !edge.data.perimeter))
    const left = graph.nodes.find(node => node.data.label === 'left')!
    const right = graph.nodes.find(node => node.data.label === 'right')!
    assert.equal(left.position.x, right.position.x)
    assert.notEqual(left.position.y, right.position.y)
  }
})

test('duplicate nested bypass definitions keep independent route objects and their original expressions', () => {
  const inner = structuredClone(serialChain)
  inner.dag.push({ type: 'edge', from: ids[1]!, to: ids[3]!, if: 'enabled' })
  const graph = buildTemplateGraph({ id: 'root', type: 'dag', dag: [inner] })
  const routes = graph.edges.filter(edge => edge.data.perimeter)
  assert.equal(routes.length, 2)
  assert.notEqual(routes[0]!.data.perimeter, routes[1]!.data.perimeter)
  assert.deepEqual(routes[0]!.data.perimeter, routes[1]!.data.perimeter)
  assert.equal(routes[1]!.data.condition, 'enabled')
  const group = graph.nodes.find(node => node.data.kind === 'dag')!
  const cards = graph.nodes.filter(node => node.parentId === group.id)
  assert.ok(routes.every(edge => edge.data.perimeter!.coordinate < group.position.y + Math.min(...cards.map(node => node.position.y))))
})
