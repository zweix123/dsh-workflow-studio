import assert from 'node:assert/strict'
import test from 'node:test'
import type { Node } from '@xyflow/react'
import type { InstanceDetail } from '../src/shared/types/workflow-instance.js'
import { flowStartNodeId, workCandidates } from '../src/client/pages/workflow-studio/canvas/navigation.js'

const detail: InstanceDetail = {
  id: 'run', workspaceId: 'w', name: 'Run', templateId: 'flow', createdAt: '2026-09-25', input: {},
  definition: { id: 'root', type: 'dag', dag: [] },
  snapshot: { rootInstanceId: 'root', waitingPositions: [], skippedPositions: [], edges: [], instances: [
    { instanceId: 'root', parentInstanceId: null, definitionId: 'root', definitionPath: [], input: {}, type: 'dag', status: 'running' },
    { instanceId: 'group', parentInstanceId: 'root', definitionId: 'review', definitionPath: [], input: {}, type: 'dag', status: 'running' },
    { instanceId: 'ready', parentInstanceId: 'root', definitionId: 'prepare', definitionPath: [], input: {}, type: 'node', status: 'ready' },
    { instanceId: 'failed', parentInstanceId: 'group', definitionId: 'check', definitionPath: [], input: {}, type: 'node', status: 'ready', forItem: { key: 'api', index: 0 } },
    { instanceId: 'unknown', parentInstanceId: 'group', definitionId: 'check', definitionPath: [], input: {}, type: 'node', status: 'ready', forItem: { key: 'web', index: 1 } },
    { instanceId: 'running', parentInstanceId: 'root', definitionId: 'build', definitionPath: [], input: {}, type: 'node', status: 'ready' },
    { instanceId: 'done', parentInstanceId: 'root', definitionId: 'done', definitionPath: [], input: {}, type: 'node', status: 'completed' },
  ] },
  executions: { failed: { kind: 'bash', status: 'failed' }, unknown: { kind: 'bash', status: 'unknown' }, running: { kind: 'bash', status: 'running' } },
}
const nodes: Node[] = [
  { id: 'group', position: { x: 300, y: 200 }, data: { label: 'review' } },
  { id: 'ready', position: { x: 0, y: 0 }, data: { label: 'prepare' } },
  { id: 'failed', parentId: 'group', position: { x: 28, y: 40 }, data: { label: 'check' } },
  { id: 'unknown', parentId: 'group', position: { x: 28, y: 180 }, data: { label: 'check' } },
  { id: 'running', position: { x: 600, y: 0 }, data: { label: 'build' } },
  { id: 'done', position: { x: 800, y: 0 }, data: { label: 'done' } },
]

test('navigation prioritizes unfinished errors and unknown outcomes before ready and running nodes', () => {
  const candidates = workCandidates(detail, nodes)
  assert.deepEqual(candidates.map(item => item.id), ['failed', 'unknown', 'ready', 'running'])
  assert.deepEqual(candidates.slice(0, 2).map(item => [item.path, item.item]), [['review', 'api #1'], ['review', 'web #2']])
  assert.deepEqual(candidates.slice(0, 2).map(item => [item.x, item.y]), [[328, 240], [328, 380]])
})

test('completed and group nodes are never navigation candidates', () => {
  const finished = structuredClone(detail)
  finished.snapshot.instances = finished.snapshot.instances.map(item => item.type === 'node' ? { ...item, status: 'completed' } : item)
  assert.deepEqual(workCandidates(finished, nodes), [])
})

test('a completed nested flow opens at its first ordinary node, not the group center', () => {
  const finished = structuredClone(detail)
  finished.snapshot.instances = finished.snapshot.instances.map(item => item.type === 'node' ? { ...item, status: 'completed' } : item)
  const nested: Node[] = [
    { id: 'group', type: 'dagGroup', position: { x: 100, y: 0 }, style: { width: 2400, height: 200 }, data: { kind: 'dag' } },
    { id: 'late', type: 'workflow', parentId: 'group', position: { x: 1800, y: 40 }, data: { kind: 'node' } },
    { id: 'start', type: 'workflow', parentId: 'group', position: { x: 28, y: 40 }, data: { kind: 'node' } },
  ]
  assert.deepEqual(workCandidates(finished, nested), [])
  assert.equal(flowStartNodeId(nested), 'start')
})
