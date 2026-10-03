import type { CanvasNode } from './types.js'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'

export type WorkCandidate = { id: string; label: string; status: 'error' | 'unknown' | 'ready' | 'running'; path: string; item?: string; x: number; y: number }

export function canvasPosition(node: CanvasNode, byId: Map<string, CanvasNode>): { x: number; y: number } {
  let x = node.position.x, y = node.position.y
  let parent = node.parentId && byId.get(node.parentId)
  while (parent) { x += parent.position.x; y += parent.position.y; parent = parent.parentId && byId.get(parent.parentId) }
  return { x, y }
}

export function flowStartNodeId(nodes: CanvasNode[]): string | undefined {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const ordinary = nodes.filter(node => node.type === 'workflow' && node.data.kind === 'node')
  const visible = ordinary.length ? ordinary : nodes.filter(node => node.type === 'workflow')
  const choices = visible.length ? visible : nodes.filter(node => node.type !== 'aggregate')
  return choices.sort((a, b) => {
    const first = canvasPosition(a, byId), second = canvasPosition(b, byId)
    return first.x - second.x || first.y - second.y || a.id.localeCompare(b.id)
  })[0]?.id
}

export function workCandidates(detail: InstanceDetail, nodes: CanvasNode[]): WorkCandidate[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const candidates: WorkCandidate[] = []
  for (const instance of detail.snapshot.instances) {
    if (instance.type !== 'node' || instance.status === 'completed') continue
    const node = byId.get(instance.instanceId)
    if (!node) continue
    const execution = detail.executions?.[instance.instanceId]
    const status = execution?.status === 'failed' ? 'error'
      : execution?.status === 'unknown' ? 'unknown'
        : execution?.status === 'running' ? 'running'
          : instance.status === 'ready' ? 'ready' : undefined
    if (!status) continue
    const parents: string[] = []
    let current = node.parentId && byId.get(node.parentId)
    while (current) { parents.unshift(String(current.data.label)); current = current.parentId && byId.get(current.parentId) }
    const at = canvasPosition(node, byId)
    candidates.push({ id: node.id, label: instance.definitionId, status, path: parents.join(' / '),
      ...(instance.forItem && { item: `${instance.forItem.key} #${instance.forItem.index + 1}` }), ...at })
  }
  const priority = { error: 0, unknown: 0, ready: 1, running: 2 }
  return candidates.sort((a, b) => priority[a.status] - priority[b.status] || a.x - b.x || a.y - b.y || a.id.localeCompare(b.id))
}
