import dagre, { type Graph } from '@dagrejs/dagre'

export type PerimeterRoute = { axis: 'x' | 'y'; coordinate: number }
export const edgeKey = (from: string, to: string) => JSON.stringify([from, to])

// Only a chain covering every vertex is unambiguous; real forks keep Dagre's layout.
export function layoutGraph(graph: Graph): Map<string, PerimeterRoute> {
  const order = dagre.graphlib.alg.isAcyclic(graph) ? dagre.graphlib.alg.topsort(graph) : []
  const serial = order.length > 2 && order.slice(1).every((id, index) => graph.hasEdge(order[index]!, id))
  const ranks = new Map(order.map((id, index) => [id, index]))
  const bypasses = serial ? graph.edges().filter(edge => ranks.get(edge.w)! > ranks.get(edge.v)! + 1)
    .sort((a, b) => ranks.get(a.v)! - ranks.get(b.v)! || ranks.get(a.w)! - ranks.get(b.w)!) : []
  const labels = bypasses.map(edge => graph.edge(edge))
  for (const edge of bypasses) graph.removeEdge(edge)
  dagre.layout(graph)
  const routes = new Map<string, PerimeterRoute>()
  if (bypasses.length) {
    const axis = graph.graph().rankdir === 'TB' ? 'x' : 'y'
    const gutter = 40 + (bypasses.length - 1) * 24
    for (const id of graph.nodes()) graph.node(id)[axis] += gutter
    if (axis === 'x') graph.graph().width! += gutter
    else graph.graph().height! += gutter
    bypasses.forEach((edge, index) => {
      routes.set(edgeKey(edge.v, edge.w), { axis, coordinate: 16 + index * 24 })
      graph.setEdge(edge, labels[index])
    })
  }
  return routes
}
