import dagre from '@dagrejs/dagre'
import { MarkerType } from '@xyflow/react'
import type { DagDefinition } from '../../../../host/dag/index.js'
import { inspectLayout, type LayoutDirection } from '../../../../shared/layout.js'

import type { CanvasGraph, TemplateCanvasNode, CanvasEdge } from '../canvas/types.js'

const WIDTH = 184
const HEIGHT = 112
const PADDING = 28
const HEADER = 40

export function buildTemplateGraph(root: DagDefinition): CanvasGraph {
  const layers = new Map(inspectLayout(root).layers.map(layer => [layer.path.join('\0'), layer]))
  const nodes: TemplateCanvasNode[] = []
  const edges: CanvasEdge[] = []
  const idAt = (path: number[]) => path.length ? `dag/${path.join('/dag/')}` : 'root'

  function visit(dag: DagDefinition, path: number[], names: string[]): { width: number; height: number } {
    const parent = idAt(path)
    const vertices = dag.dag.flatMap((item, index) => item.type === 'edge' ? [] : [{ item, index }])
    const self = dag.dag.some(item => item.type === 'edge' && (item.from === dag.id || item.to === dag.id))
    const items: TemplateCanvasNode[] = []
    for (const { item, index } of vertices) {
      const childPath = [...path, index]
      const size = item.type === 'dag' ? visit(item, childPath, [...names, item.id]) : { width: WIDTH, height: HEIGHT }
      items.push({
        id: idAt(childPath), type: item.type === 'dag' ? 'dagGroup' : 'workflow',
        data: { source: 'template', label: item.id, kind: item.type, definitionPath: childPath.flatMap(index => ['dag', index]) }, position: { x: 0, y: 0 },
        style: item.type === 'dag' ? { width: size.width + PADDING * 2, height: size.height + HEADER + PADDING } : { width: WIDTH, height: HEIGHT },
        ...(path.length && { parentId: parent }), draggable: false, selectable: false, connectable: false,
      })
    }
    if (self) items.push({
      id: `${parent}/recursive`, type: 'workflow', data: { source: 'template', label: dag.id, kind: 'recursive', definitionPath: path.flatMap(index => ['dag', index]) },
      position: { x: 0, y: 0 }, style: { width: WIDTH, height: HEIGHT },
      ...(path.length && { parentId: parent }), draggable: false, selectable: false, connectable: false,
    })
    const byName = new Map(items.map(item => [item.data.label, item]))
    const layout = layers.get(names.join('\0'))
    const valid = layout && layout.issues.length === 0
    const segments: Array<{ direction: LayoutDirection; ids: string[] }> = valid
      ? [{ direction: layout.direction, ids: [] }, ...layout.starts.map(start => ({ direction: start.direction, ids: [] }))]
      : [{ direction: 'horizontal', ids: [] }]
    const starts = new Map(valid ? layout.starts.map((start, index) => [start.startAt, index + 1]) : [])
    let segment = 0
    for (const name of valid ? layout.order : vertices.map(row => row.item.id)) {
      segment = starts.get(name) ?? segment
      if (byName.has(name) && name !== dag.id) segments[segment]!.ids.push(name)
    }
    let width = 0
    let height = 0
    const placed = segments.filter(part => part.ids.length).map(part => {
      const graph = new dagre.graphlib.Graph()
      graph.setGraph({ rankdir: part.direction === 'vertical' ? 'TB' : 'LR', ranksep: 88, nodesep: 36, marginx: 0, marginy: 0 })
      graph.setDefaultEdgeLabel(() => ({}))
      for (const name of part.ids) {
        const node = byName.get(name)!
        graph.setNode(name, { width: Number(node.style?.width), height: Number(node.style?.height) })
      }
      for (const item of dag.dag) if (item.type === 'edge' && part.ids.includes(item.from) && part.ids.includes(item.to)) graph.setEdge(item.from, item.to)
      dagre.layout(graph)
      return { ...part, graph, width: graph.graph().width || WIDTH, height: graph.graph().height || HEIGHT }
    })
    const rowHeight = Math.max(HEIGHT, ...placed.map(part => part.height))
    for (const part of placed) {
      for (const name of part.ids) {
        const node = byName.get(name)!
        const box = part.graph.node(name) as { x: number; y: number; width: number; height: number }
        node.position = { x: width + box.x - box.width / 2, y: (rowHeight - part.height) / 2 + box.y - box.height / 2 }
        node.data.direction = part.direction
      }
      width += part.width + 140
    }
    width = Math.max(WIDTH, width - (placed.length ? 140 : 0))
    height = rowHeight
    if (self) {
      const marker = byName.get(dag.id)!
      marker.position = { x: 0, y: height + 36 }
      height += HEIGHT + 36
    }
    for (const node of items) if (path.length) node.position = { x: node.position.x + PADDING, y: node.position.y + HEADER }
    nodes.push(...items)
    for (const [index, item] of dag.dag.entries()) {
      if (item.type !== 'edge') continue
      const source = byName.get(item.from)
      const target = byName.get(item.to)
      if (!source || !target) continue
      const sourceDirection = source.data.direction ?? 'horizontal'
      const targetDirection = target.data.direction ?? 'horizontal'
      edges.push({
        id: `${parent}/edge/${index}`, source: source.id, target: target.id,
        sourceHandle: sourceDirection === 'vertical' ? 'bottom' : 'right',
        targetHandle: targetDirection === 'vertical' ? 'top' : 'left',
        type: 'expression', data: { source: 'template', definitionPath: [...path, index].flatMap(index => ['dag', index]), ...(item.id && { definitionId: item.id }), ...(item.if && { condition: item.if }), ...(item.for && { each: item.for }) },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--dsw-alias-label-secondary)' }, selectable: false,
      })
    }
    return { width, height }
  }
  visit(root, [], [root.id])
  const depth = (node: TemplateCanvasNode): number => node.parentId ? 1 + depth(nodes.find(item => item.id === node.parentId)!) : 0
  nodes.sort((a, b) => depth(a) - depth(b))
  return { nodes, edges }
}
