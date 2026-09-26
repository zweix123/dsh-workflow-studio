import dagre from '@dagrejs/dagre'
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react'
import type { EntityDefinition, PositionSnapshot, RuntimeEdgeSnapshot } from '../../../../host/dag/index.js'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'

const NODE_WIDTH = 184
const NODE_HEIGHT = 112
const GAP = 20
const GROUP_PADDING = 28
const GROUP_HEADER = 40

type GraphNode = Node<{ label: string; status: string; kind: 'node' | 'dag' | 'position'; forItem?: { key: string; index: number } }>

const positionKey = (parent: string, definition: string) => `${parent}\u0000${definition}`
export const buildPositionNodeId = (position: Pick<PositionSnapshot, 'parentInstanceId' | 'definitionId'>, status: 'waiting' | 'skipped') =>
  `${status}:${positionKey(position.parentInstanceId, position.definitionId)}`

export function definitionAt(root: InstanceDetail['definition'], path: readonly (string | number)[]): EntityDefinition | undefined {
  let current: EntityDefinition = root
  for (let index = 0; index < path.length; index += 2) {
    if (path[index] !== 'dag' || typeof path[index + 1] !== 'number' || current.type !== 'dag') return
    const child: EntityDefinition | undefined = current.dag[path[index + 1] as number]
    if (!child) return
    current = child
  }
  return current
}

function edgeExpressions(root: InstanceDetail['definition'], edge: RuntimeEdgeSnapshot): { condition?: string; each?: string } | undefined {
  const definition = definitionAt(root, edge.definitionPath)
  if (definition?.type !== 'edge') return
  if (!definition.if && !definition.for) return
  return { ...(definition.if && { condition: definition.if }), ...(definition.for && { each: definition.for }) }
}

export function buildCanvasGraph(detail: InstanceDetail): { nodes: Node[]; edges: Edge[] } {
  const { snapshot } = detail
  const instances = new Map(snapshot.instances.map(instance => [instance.instanceId, instance]))
  const nodes: GraphNode[] = []
  const frameItems = new Map<string, GraphNode[]>()
  const byPosition = new Map<string, string[]>()
  const add = (id: string, type: 'workflow' | 'dagGroup', data: GraphNode['data'], parent: string, definition: string) => {
    const node: GraphNode = {
      id, type, data,
      position: { x: 0, y: 0 },
      style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      ...(parent === snapshot.rootInstanceId ? {} : { parentId: parent }),
      draggable: false,
      selectable: false,
      connectable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }
    const rows = frameItems.get(parent) ?? []
    rows.push(node)
    frameItems.set(parent, rows)
    const key = positionKey(parent, definition)
    const ids = byPosition.get(key) ?? []
    ids.push(node.id)
    byPosition.set(key, ids)
  }
  for (const instance of snapshot.instances) {
    if (instance.parentInstanceId === null) continue
    add(instance.instanceId, instance.type === 'dag' ? 'dagGroup' : 'workflow',
      { label: instance.definitionId, status: instance.status, kind: instance.type, ...(instance.forItem && { forItem: instance.forItem }) },
      instance.parentInstanceId, instance.definitionId)
  }
  const placeholder = (position: PositionSnapshot, status: 'waiting' | 'skipped') => add(
    buildPositionNodeId(position, status), 'workflow',
    { label: position.definitionId, status, kind: 'position' }, position.parentInstanceId, position.definitionId)
  snapshot.waitingPositions.forEach(position => placeholder(position, 'waiting'))
  snapshot.skippedPositions.forEach(position => placeholder(position, 'skipped'))

  const frames = new Set<string>()
  function layout(frameId: string): { width: number; height: number } {
    if (frames.has(frameId)) return { width: NODE_WIDTH, height: NODE_HEIGHT }
    frames.add(frameId)
    const items = frameItems.get(frameId) ?? []
    const positions = new Map<string, GraphNode[]>()
    for (const item of items) {
      if (item.data.kind === 'dag') {
        const inner = layout(item.id)
        item.style = { ...item.style, width: inner.width + GROUP_PADDING * 2, height: inner.height + GROUP_HEADER + GROUP_PADDING }
      }
      const row = positions.get(item.data.label) ?? []
      row.push(item)
      positions.set(item.data.label, row)
    }
    const graph = new dagre.graphlib.Graph()
    // Direction is fixed here: dependencies read left to right, repeated items stack vertically.
    graph.setGraph({ rankdir: 'LR', ranksep: 88, nodesep: 36, marginx: 0, marginy: 0 })
    graph.setDefaultEdgeLabel(() => ({}))
    for (const [id, row] of positions) {
      row.sort((a, b) => (a.data.forItem?.index ?? 0) - (b.data.forItem?.index ?? 0) || a.id.localeCompare(b.id))
      const needsOutlet = snapshot.edges.some(edge => edge.from.parentInstanceId === frameId && edge.from.definitionId === id)
        && (row.length > 1 || row.some(item => item.data.forItem))
      graph.setNode(id, {
        // Reserve the aggregate outlet inside this rank, including nested group bounds.
        width: Math.max(...row.map(item => Number(item.style?.width) || NODE_WIDTH)) + (needsOutlet ? 68 : 0),
        height: row.reduce((sum, item) => sum + (Number(item.style?.height) || NODE_HEIGHT), 0) + GAP * (row.length - 1),
      })
    }
    for (const edge of snapshot.edges) if (edge.parentInstanceId === frameId && positions.has(edge.from.definitionId) && positions.has(edge.to.definitionId) && edge.from.definitionId !== edge.to.definitionId) {
      graph.setEdge(edge.from.definitionId, edge.to.definitionId)
    }
    dagre.layout(graph)
    let width = 0
    let height = 0
    const parentPath = instances.get(frameId)?.definitionPath
    const recursive = new Set([...positions].filter(([, row]) => {
      const path = instances.get(row[0]!.id)?.definitionPath
      return parentPath && path && path.length === parentPath.length && path.every((part, index) => part === parentPath[index])
    }).map(([id]) => id))
    for (const [id, row] of positions) {
      if (recursive.has(id)) continue
      const position = graph.node(id)
      const left = position.x - position.width / 2
      let top = position.y - position.height / 2
      for (const item of row) {
        item.position = { x: left, y: top }
        width = Math.max(width, left + position.width)
        height = Math.max(height, top + (Number(item.style?.height) || NODE_HEIGHT))
        top += (Number(item.style?.height) || NODE_HEIGHT) + GAP
      }
    }
    for (const id of recursive) {
      const row = positions.get(id)!
      let top = height + GAP
      for (const item of row) {
        item.position = { x: 0, y: top }
        width = Math.max(width, Number(item.style?.width) || NODE_WIDTH)
        top += (Number(item.style?.height) || NODE_HEIGHT) + GAP
      }
      height = top - GAP
    }
    if (frameId !== snapshot.rootInstanceId) for (const item of items) {
      item.position = { x: item.position.x + GROUP_PADDING, y: item.position.y + GROUP_HEADER }
    }
    return { width: Math.max(width, NODE_WIDTH), height: Math.max(height, NODE_HEIGHT) }
  }
  layout(snapshot.rootInstanceId)
  for (const item of frameItems.values()) nodes.push(...item)
  const aggregateIds = new Map<string, string>()
  const outgoing = new Set(snapshot.edges.map(edge => positionKey(edge.from.parentInstanceId, edge.from.definitionId)))
  for (const [key, ids] of byPosition) if (outgoing.has(key) && (ids.length > 1 || ids.some(id => instances.get(id)?.forItem))) {
    const row = ids.map(id => nodes.find(node => node.id === id)!)
    const first = row[0]!
    const last = row.at(-1)!
    const id = `aggregate:${key}`
    aggregateIds.set(key, id)
    nodes.push({
      id, type: 'aggregate', data: { label: '', status: '', kind: 'position' },
      position: { x: last.position.x + Number(last.style?.width || NODE_WIDTH) + 8,
        y: (first.position.y + last.position.y + Number(last.style?.height || NODE_HEIGHT)) / 2 },
      style: { width: 60, height: 22 },
      ...(first.parentId ? { parentId: first.parentId } : {}),
      draggable: false, selectable: false, connectable: false,
      sourcePosition: Position.Right, targetPosition: Position.Left,
    })
  }
  // React Flow needs group nodes before descendants to resolve relative positions.
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const depth = (node: GraphNode): number => node.parentId ? 1 + depth(nodeById.get(node.parentId)!) : 0
  nodes.sort((a, b) => depth(a) - depth(b))

  const edges: Edge[] = snapshot.edges.flatMap((edge, edgeIndex) => {
    const sources = byPosition.get(positionKey(edge.from.parentInstanceId, edge.from.definitionId)) ?? []
    const targets = byPosition.get(positionKey(edge.to.parentInstanceId, edge.to.definitionId)) ?? []
    const expressions = edgeExpressions(detail.definition, edge)
    const connections = (snapshot.instanceConnections ?? []).filter(connection =>
      JSON.stringify(connection.edgeDefinitionPath) === JSON.stringify(edge.definitionPath)
      && connection.from.parentInstanceId === edge.parentInstanceId)
    const source = aggregateIds.get(positionKey(edge.from.parentInstanceId, edge.from.definitionId)) ?? sources[0]
    const targetPosition = targets.find(id => nodeById.get(id)?.data.kind === 'position')
    const pairs = edge.status === 'active'
      ? snapshot.instanceConnections
        ? connections.length
          ? connections.flatMap(connection => {
            const origin = connection.sourceKind === 'group'
              ? aggregateIds.get(positionKey(connection.from.parentInstanceId, connection.from.definitionId))
              : connection.sourceInstanceIds[0]
            return origin ? [[origin, connection.toInstanceId] as const] : []
          })
          : source && targetPosition && nodeById.get(targetPosition)?.data.status === 'waiting'
            ? [[source, targetPosition] as const] : []
        : source && targets[0] ? [[source, targets[0]] as const] : []
      : source && targetPosition ? [[source, targetPosition] as const] : []
    return pairs.map(([source, target], pairIndex): Edge => ({
      id: `${edgeIndex}:${pairIndex}`,
      source, target,
      data: { status: edge.status, ...expressions },
      className: `dsh-workflow-edge-${edge.status}`,
      type: 'expression',
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.status === 'active'
        ? 'var(--dsw-alias-state-business-primary)'
        : edge.status === 'inactive' ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-label-secondary)' },
      selectable: false,
    }))
  })
  for (const [key, aggregate] of aggregateIds) for (const source of byPosition.get(key) ?? []) edges.push({
    id: `member:${source}:${aggregate}`, source, target: aggregate, type: 'smoothstep',
    data: { status: 'aggregation' }, className: 'dsh-workflow-edge-aggregation', selectable: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--dsw-alias-label-secondary)' },
  })
  return { nodes, edges }
}
