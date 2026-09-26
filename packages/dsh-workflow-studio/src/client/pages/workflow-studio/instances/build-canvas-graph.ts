import dagre from '@dagrejs/dagre'
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react'
import type { EntityDefinition, PositionSnapshot, RuntimeEdgeSnapshot } from '../../../../host/dag/index.js'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import { inspectLayout, type LayoutDirection } from '../../../../shared/layout.js'
import { canvasPosition } from './graph-navigation.js'

const NODE_WIDTH = 184
const NODE_HEIGHT = 112
const GAP = 20
const GROUP_PADDING = 28
const GROUP_HEADER = 40

type GraphNode = Node<{ label: string; status: string; kind: 'node' | 'dag' | 'position'; forItem?: { key: string; index: number }; direction?: LayoutDirection; segment?: number }>

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
  const layoutLayers = new Map(inspectLayout(detail.definition).layers.map(layer => [layer.path.join('\u0000'), layer]))
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
    const frameEdges = snapshot.edges.filter(edge => edge.parentInstanceId === frameId)
    const withOutgoing = new Set(frameEdges.map(edge => edge.from.definitionId))
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
    for (const row of positions.values()) row.sort((a, b) => (a.data.forItem?.index ?? 0) - (b.data.forItem?.index ?? 0) || a.id.localeCompare(b.id))
    const parentPath = instances.get(frameId)?.definitionPath
    const framePath = parentPath ?? []
    const frameDefinition = definitionAt(detail.definition, framePath)
    const names = [detail.definition.id]
    for (let index = 2; index <= framePath.length; index += 2) {
      const ancestor = definitionAt(detail.definition, framePath.slice(0, index))
      if (ancestor?.type === 'dag') names.push(ancestor.id)
    }
    const plan = frameDefinition?.type === 'dag' ? layoutLayers.get(names.join('\u0000')) : undefined
    const recursive = new Set([...positions].filter(([, row]) => {
      const path = instances.get(row[0]!.id)?.definitionPath
      return parentPath && path && path.length === parentPath.length && path.every((part, index) => part === parentPath[index])
    }).map(([id]) => id))
    if (frameDefinition?.type === 'dag' && positions.has(frameDefinition.id)) recursive.add(frameDefinition.id)
    let width = 0
    let height = 0
    if (!plan || plan.issues.length) {
      const graph = new dagre.graphlib.Graph()
      // Direction is fixed here: dependencies read left to right, repeated items stack vertically.
      graph.setGraph({ rankdir: 'LR', ranksep: 88, nodesep: 36, marginx: 0, marginy: 0 })
      graph.setDefaultEdgeLabel(() => ({}))
      for (const [id, row] of positions) {
        const needsOutlet = withOutgoing.has(id)
          && (row.length > 1 || row.some(item => item.data.forItem))
        graph.setNode(id, {
          // Reserve the aggregate outlet inside this rank, including nested group bounds.
          width: Math.max(...row.map(item => Number(item.style?.width) || NODE_WIDTH)) + (needsOutlet ? 68 : 0),
          height: row.reduce((sum, item) => sum + (Number(item.style?.height) || NODE_HEIGHT), 0) + GAP * (row.length - 1),
        })
      }
      for (const edge of frameEdges) if (positions.has(edge.from.definitionId) && positions.has(edge.to.definitionId) && edge.from.definitionId !== edge.to.definitionId) {
        graph.setEdge(edge.from.definitionId, edge.to.definitionId)
      }
      dagre.layout(graph)
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
    }
    if (plan && !plan.issues.length) {
      const segments: Array<{ direction: LayoutDirection; ids: string[] }> = [
        { direction: plan.direction, ids: [] }, ...plan.starts.map(start => ({ direction: start.direction, ids: [] })),
      ]
      const startIndex = new Map(plan.starts.map((start, index) => [start.startAt, index + 1]))
      let current = 0
      for (const id of plan.order) {
        current = startIndex.get(id) ?? current
        if (positions.has(id) && !recursive.has(id)) segments[current]!.ids.push(id)
      }
      const placed: Array<{ graph: InstanceType<typeof dagre.graphlib.Graph>; direction: LayoutDirection; ids: string[]; width: number; height: number }> = []
      for (const segment of segments) {
        if (!segment.ids.length) continue
        const segmentIds = new Set(segment.ids)
        const portion = new dagre.graphlib.Graph()
        portion.setGraph({ rankdir: segment.direction === 'vertical' ? 'TB' : 'LR', ranksep: 88, nodesep: 36, marginx: 0, marginy: 0 })
        portion.setDefaultEdgeLabel(() => ({}))
        for (const id of segment.ids) {
          const row = positions.get(id)!
          const outlet = withOutgoing.has(id)
            && (row.length > 1 || row.some(item => item.data.forItem))
          const main = Math.max(...row.map(item => Number(segment.direction === 'vertical' ? item.style?.height : item.style?.width) || 0)) + (outlet ? 68 : 0)
          const cross = row.reduce((sum, item) => sum + Number(segment.direction === 'vertical' ? item.style?.width : item.style?.height), 0) + GAP * (row.length - 1)
          portion.setNode(id, segment.direction === 'vertical' ? { width: cross, height: main } : { width: main, height: cross })
        }
        for (const edge of frameEdges) if (segmentIds.has(edge.from.definitionId) && segmentIds.has(edge.to.definitionId)) portion.setEdge(edge.from.definitionId, edge.to.definitionId)
        dagre.layout(portion)
        placed.push({ graph: portion, direction: segment.direction, ids: segment.ids, width: portion.graph().width || NODE_WIDTH, height: portion.graph().height || NODE_HEIGHT })
      }
      const fullHeight = Math.max(NODE_HEIGHT, ...placed.map(part => part.height))
      width = 0
      height = fullHeight
      for (const [segmentIndex, part] of placed.entries()) {
        const yOffset = (fullHeight - part.height) / 2
        for (const id of part.ids) {
          const box = part.graph.node(id) as { x: number; y: number; width: number; height: number }
          let left = width + box.x - box.width / 2
          let top = yOffset + box.y - box.height / 2
          for (const item of positions.get(id)!) {
            item.position = { x: left, y: top }
            item.data = { ...item.data, direction: part.direction, segment: segmentIndex }
            if (part.direction === 'vertical') left += Number(item.style?.width) + GAP
            else top += Number(item.style?.height) + GAP
          }
        }
        width += part.width + 140
      }
      width = Math.max(NODE_WIDTH, width - 140)
      for (const id of recursive) {
        let top = height + GAP
        for (const item of positions.get(id)!) {
          item.position = { x: 0, y: top }
          item.data = { ...item.data, direction: placed.at(-1)?.direction ?? plan.direction, segment: placed.length - 1 }
          width = Math.max(width, Number(item.style?.width) || NODE_WIDTH)
          top += Number(item.style?.height) + GAP
        }
        height = top - GAP
      }
      if (frameId !== snapshot.rootInstanceId) {
        for (const item of items) item.position = { ...item.position, y: item.position.y + 24 }
        height += 24 // Leave an edge corridor below the nested DAG heading.
      }
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
    const row = ids.map(id => nodes.find(node => node.id === id)!).sort((a, b) => (a.data.forItem?.index ?? 0) - (b.data.forItem?.index ?? 0))
    const first = row[0]!
    const last = row.at(-1)!
    const vertical = first.data.direction === 'vertical'
    const id = `aggregate:${key}`
    aggregateIds.set(key, id)
    nodes.push({
      id, type: 'aggregate', data: { label: '', status: '', kind: 'position', ...(first.data.direction && { direction: first.data.direction, segment: first.data.segment }) },
      position: vertical
        ? { x: (first.position.x + last.position.x + Number(last.style?.width || NODE_WIDTH)) / 2 - 41,
          y: Math.max(...row.map(item => item.position.y + Number(item.style?.height || NODE_HEIGHT))) + 8 }
        : { x: last.position.x + Number(last.style?.width || NODE_WIDTH) + 8,
          y: (first.position.y + last.position.y + Number(last.style?.height || NODE_HEIGHT)) / 2 },
      style: { width: vertical ? 82 : 60, height: 22 },
      ...(first.parentId ? { parentId: first.parentId } : {}),
      draggable: false, selectable: false, connectable: false,
      sourcePosition: Position.Right, targetPosition: Position.Left,
    })
  }
  // React Flow needs group nodes before descendants to resolve relative positions.
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const depth = (node: GraphNode): number => node.parentId ? 1 + depth(nodeById.get(node.parentId)!) : 0
  nodes.sort((a, b) => depth(a) - depth(b))

  const laneY = new Map([...frameItems].map(([frameId, items]) => [frameId,
    Math.max(...[...items, ...nodes.filter(item => item.type === 'aggregate'
      && (item.parentId ?? snapshot.rootInstanceId) === frameId)].map(item => {
      const at = canvasPosition(item, nodeById)
      return at.y + (Number(item.style?.height) || NODE_HEIGHT)
    })) + 16]))

  const edgePorts = (source: string, target: string, frameId: string) => {
    const from = nodeById.get(source) as GraphNode | undefined
    const to = nodeById.get(target) as GraphNode | undefined
    const crosses = from?.data.segment !== undefined && to?.data.segment !== undefined
      && from.data.segment !== to.data.segment
    const columnTurn = crosses && from?.data.direction === 'vertical' && to?.data.direction === 'vertical'
    return crosses
      ? { sourceHandle: columnTurn ? 'bottom' : 'right', targetHandle: columnTurn ? 'top' : 'left', data: {
        routeY: laneY.get(frameId), ...(columnTurn && to && { routeX: canvasPosition(to, nodeById).x - 32,
          routeTopY: canvasPosition(to, nodeById).y - 16 }),
      } }
      : { sourceHandle: from?.data.direction === 'vertical' ? 'bottom' : 'right',
        targetHandle: to?.data.direction === 'vertical' ? 'top' : 'left', data: {} }
  }

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
    return pairs.map(([source, target], pairIndex): Edge => {
      const ports = edgePorts(source, target, edge.parentInstanceId)
      return {
        id: `${edgeIndex}:${pairIndex}`,
        source, target,
        sourceHandle: ports.sourceHandle,
        targetHandle: ports.targetHandle,
        data: { status: edge.status, ...expressions, ...ports.data },
        className: `dsh-workflow-edge-${edge.status}`,
        type: 'expression',
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.status === 'active'
          ? 'var(--dsw-alias-state-business-primary)'
          : edge.status === 'inactive' ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-label-secondary)' },
        selectable: false,
      }
    })
  })
  for (const [key, aggregate] of aggregateIds) for (const source of byPosition.get(key) ?? []) edges.push({
    id: `member:${source}:${aggregate}`, source, target: aggregate, type: 'smoothstep',
    sourceHandle: nodeById.get(source)?.data.direction === 'vertical' ? 'bottom' : 'right',
    targetHandle: nodeById.get(aggregate)?.data.direction === 'vertical' ? 'top' : 'left',
    data: { status: 'aggregation' }, className: 'dsh-workflow-edge-aggregation', selectable: false,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--dsw-alias-label-secondary)' },
  })
  return { nodes, edges }
}
