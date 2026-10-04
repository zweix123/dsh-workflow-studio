import type { ReactNode } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { DefinitionPath, ForItemIdentity } from '../../../../host/dag/index.js'
import type { LayoutDirection } from '../../../../shared/layout.js'

export type DefinitionRef = { definitionPath: DefinitionPath }
export type CanvasStatus = 'ready' | 'completed' | 'running' | 'waiting' | 'skipped'
export interface CanvasNodeView {
  kindLabel: string
  detailsLabel: string
  onInspect: () => void
  statusLabel?: string
  displayStatus?: string
  summary?: ReactNode
  control?: ReactNode
}
type NodeData = { label: string; direction?: LayoutDirection; segment?: number }
export type TemplateNodeData = NodeData & DefinitionRef & {
  source: 'template'; kind: 'node' | 'dag' | 'recursive'; view?: CanvasNodeView
}
export type InstanceNodeData = NodeData & DefinitionRef & {
  source: 'instance'; kind: 'node' | 'dag'; instanceId: string; status: CanvasStatus
  forItem?: ForItemIdentity; view?: CanvasNodeView
}
export type PositionNodeData = NodeData & DefinitionRef & {
  source: 'position'; kind: 'position'; parentInstanceId: string; definitionId: string
  status: 'waiting' | 'skipped'; forItem?: never; view?: CanvasNodeView
}
export type AggregateNodeData = NodeData & { source: 'aggregate'; kind: 'aggregate' }
export type CanvasNodeData = TemplateNodeData | InstanceNodeData | PositionNodeData | AggregateNodeData
export type CanvasNode = Node<CanvasNodeData, 'workflow' | 'dagGroup' | 'aggregate'>
export type RuntimeCanvasNode = Node<InstanceNodeData | PositionNodeData, 'workflow' | 'dagGroup'>
export type TemplateCanvasNode = Node<TemplateNodeData, 'workflow' | 'dagGroup'>

export type Expression = { condition?: string; each?: string }
type EdgeData = Expression & {
  conditionLabel?: string; eachLabel?: string
  open?: (id: string, expression: Expression) => void
  routeY?: number; routeX?: number; routeTopY?: number
}
export type CanvasEdgeData = EdgeData & (
  | (DefinitionRef & { source: 'template'; definitionId?: string })
  | (DefinitionRef & { source: 'runtime'; status: 'pending' | 'active' | 'inactive' })
  | { source: 'aggregation'; status: 'aggregation' }
)
export type CanvasEdge = Edge<CanvasEdgeData> & { data: CanvasEdgeData }
export interface CanvasGraph { nodes: CanvasNode[]; edges: CanvasEdge[] }
