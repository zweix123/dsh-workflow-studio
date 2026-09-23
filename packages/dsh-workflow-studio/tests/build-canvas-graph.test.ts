import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCanvasGraph } from '../src/client/pages/workflow-studio/instances/build-canvas-graph.js'
import type { InstanceDetail } from '../src/shared/types/workflow-instance.js'

const detail: InstanceDetail = {
  id: 'run', workspaceId: 'workspace', name: 'Run', templateId: 'flow', createdAt: '2026-09-23T00:00:00Z', input: {},
  definition: { id: 'root', type: 'dag', dag: [
    { id: 'prepare', type: 'node' }, { id: 'work', type: 'node' }, { id: 'later', type: 'node' },
    { type: 'edge', from: 'prepare', to: 'work', for: '$.jobs' },
    { type: 'edge', from: 'work', to: 'later' },
  ] },
  snapshot: {
    rootInstanceId: 'i1',
    instances: [
      { instanceId: 'i1', parentInstanceId: null, definitionId: 'root', definitionPath: [], input: {}, type: 'dag', status: 'running' },
      { instanceId: 'i2', parentInstanceId: 'i1', definitionId: 'prepare', definitionPath: ['dag', 0], input: {}, type: 'node', status: 'completed', output: { jobs: [] } },
      { instanceId: 'i3', parentInstanceId: 'i1', definitionId: 'work', definitionPath: ['dag', 1], input: {}, type: 'node', status: 'ready', forItem: { key: 'a', index: 0 } },
      { instanceId: 'i4', parentInstanceId: 'i1', definitionId: 'work', definitionPath: ['dag', 1], input: {}, type: 'node', status: 'ready', forItem: { key: 'b', index: 1 } },
    ],
    waitingPositions: [{ parentInstanceId: 'i1', definitionId: 'later', definitionPath: ['dag', 2] }],
    skippedPositions: [],
    edges: [
      { parentInstanceId: 'i1', definitionPath: ['dag', 3], from: { parentInstanceId: 'i1', definitionId: 'prepare' }, to: { parentInstanceId: 'i1', definitionId: 'work' }, status: 'active' },
      { parentInstanceId: 'i1', definitionPath: ['dag', 4], from: { parentInstanceId: 'i1', definitionId: 'work' }, to: { parentInstanceId: 'i1', definitionId: 'later' }, status: 'pending' },
    ],
  },
}

test('projects created instances and waiting positions with horizontal dependencies and vertical for items', () => {
  const { nodes, edges } = buildCanvasGraph(detail)
  assert.equal(nodes.filter(node => node.data.kind === 'node').length, 3)
  assert.equal(nodes.filter(node => node.data.status === 'waiting').length, 1)
  assert.equal(nodes.filter(node => node.data.kind === 'position' && node.data.status === 'ready').length, 0)
  const prepare = nodes.find(node => node.id === 'i2')!
  const first = nodes.find(node => node.id === 'i3')!
  const second = nodes.find(node => node.id === 'i4')!
  const later = nodes.find(node => node.data.label === 'later')!
  assert.ok(prepare.position.x < first.position.x)
  assert.ok(first.position.x - prepare.position.x - Number(prepare.style?.width) > String(edges[0]?.label).length * 7)
  assert.equal(first.position.x, second.position.x)
  assert.ok(first.position.y < second.position.y)
  assert.ok(first.position.x < later.position.x)
  assert.equal(edges.filter(edge => edge.data?.status === 'active').length, 2)
  assert.equal(edges.filter(edge => edge.data?.status === 'pending').length, 2)
  assert.ok(edges.every(edge => edge.markerEnd))
  assert.equal(typeof edges[0]?.markerEnd === 'object' && edges[0].markerEnd.color, 'var(--dsw-alias-state-business-primary)')
  assert.ok(edges.filter(edge => edge.data?.status === 'active').every(edge => edge.label === 'for $.jobs'))
  assert.ok(edges.filter(edge => edge.data?.status === 'pending').every(edge => edge.label === undefined))
})

test('keeps nested DAG children inside visible groups and stacks created recursion below its source', () => {
  const nested: InstanceDetail = {
    ...detail,
    definition: { id: 'root', type: 'dag', dag: [
      { id: 'inner', type: 'dag', dag: [
        { id: 'work', type: 'node' },
        { type: 'edge', from: 'work', to: 'inner', if: '$.again' },
      ] },
    ] },
    snapshot: {
      rootInstanceId: 'i1',
      instances: [
        { instanceId: 'i1', parentInstanceId: null, definitionId: 'root', definitionPath: [], input: {}, type: 'dag', status: 'running' },
        { instanceId: 'i2', parentInstanceId: 'i1', definitionId: 'inner', definitionPath: ['dag', 0], input: {}, type: 'dag', status: 'running' },
        { instanceId: 'i3', parentInstanceId: 'i2', definitionId: 'work', definitionPath: ['dag', 0, 'dag', 0], input: {}, type: 'node', status: 'completed', output: { again: true } },
        { instanceId: 'i4', parentInstanceId: 'i2', definitionId: 'inner', definitionPath: ['dag', 0], input: {}, type: 'dag', status: 'running' },
        { instanceId: 'i5', parentInstanceId: 'i4', definitionId: 'work', definitionPath: ['dag', 0, 'dag', 0], input: {}, type: 'node', status: 'ready' },
      ],
      waitingPositions: [{ parentInstanceId: 'i4', definitionId: 'inner', definitionPath: ['dag', 0] }],
      skippedPositions: [],
      edges: [
        { parentInstanceId: 'i2', definitionPath: ['dag', 0, 'dag', 1], from: { parentInstanceId: 'i2', definitionId: 'work' }, to: { parentInstanceId: 'i2', definitionId: 'inner' }, status: 'active' },
        { parentInstanceId: 'i4', definitionPath: ['dag', 0, 'dag', 1], from: { parentInstanceId: 'i4', definitionId: 'work' }, to: { parentInstanceId: 'i4', definitionId: 'inner' }, status: 'pending' },
      ],
    },
  }
  const { nodes, edges } = buildCanvasGraph(nested)
  const group = nodes.find(node => node.id === 'i2')!
  const recursion = nodes.find(node => node.id === 'i4')!
  const worker = nodes.find(node => node.id === 'i3')!
  assert.equal(group.type, 'dagGroup')
  assert.equal(worker.parentId, group.id)
  assert.equal(recursion.parentId, group.id)
  assert.equal(nodes.find(node => node.id === 'i5')?.parentId, recursion.id)
  assert.ok(Number(group.style?.width) > Number(worker.style?.width))
  assert.ok(worker.position.x >= 28)
  assert.ok(worker.position.y >= 40)
  assert.ok(recursion.position.y > worker.position.y)
  assert.equal(nodes.filter(node => node.data.status === 'waiting').length, 1)
  assert.equal(nodes.filter(node => node.data.kind === 'dag').length, 2)
  assert.equal(edges[0]?.label, 'if $.again')
  assert.equal(edges[1]?.data?.status, 'pending')
})

test('shows skipped positions and inactive conditional edges without inventing an instance', () => {
  const closed: InstanceDetail = structuredClone(detail)
  closed.definition.dag[3] = { type: 'edge', from: 'prepare', to: 'work', if: '$.enabled' }
  closed.snapshot.instances = closed.snapshot.instances.filter(row => row.definitionId !== 'work')
  closed.snapshot.skippedPositions = [{ parentInstanceId: 'i1', definitionId: 'work', definitionPath: ['dag', 1] }]
  closed.snapshot.edges[0]!.status = 'inactive'
  const { nodes, edges } = buildCanvasGraph(closed)
  assert.equal(nodes.filter(node => node.data.label === 'work').length, 1)
  assert.equal(nodes.find(node => node.data.label === 'work')?.data.status, 'skipped')
  assert.equal(edges[0]?.data?.status, 'inactive')
  assert.equal(typeof edges[0]?.markerEnd === 'object' && edges[0].markerEnd.color, 'var(--dsw-alias-label-tertiary)')
  assert.equal(edges[0]?.label, 'if $.enabled')
})
