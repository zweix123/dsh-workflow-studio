import { memo, useMemo } from 'react'
import { Controls, Handle, Position, ReactFlow, type NodeProps } from '@xyflow/react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { buildCanvasGraph } from './build-canvas-graph.js'

type GraphData = { id: string; label: string; status: 'ready' | 'completed' | 'running' | 'waiting' | 'skipped'; statusLabel: string; kind: 'node' | 'dag' | 'position'; kindLabel: string; forItem?: { key: string; index: number }; executeLabel: string; detailsLabel: string; pending: boolean; onExecute: (id: string) => void; onInspect: (id: string) => void }
export const statusKeys = { ready: 'statusReady', completed: 'statusCompleted', running: 'statusRunning', waiting: 'statusWaiting', skipped: 'statusSkipped' } as const

const WorkflowNode = memo(function WorkflowNode({ data: rawData }: NodeProps) {
  const data = rawData as GraphData
  return <div className="dsh-workflow-node" data-graph-node data-definition-id={data.label} data-status={data.status}>
    <Handle type="target" position={Position.Left} />
    <span className="dsh-workflow-node-kind">{data.kindLabel}</span>
    <span className="dsh-workflow-node-status"><i aria-hidden="true" />{data.statusLabel}</span>
    <strong>{data.label}</strong>
    {data.forItem && <small>{data.forItem.key}</small>}
    <div className="dsh-workflow-node-actions">
      {data.kind === 'node' && data.status === 'ready' && <button type="button" className="nodrag nopan" disabled={data.pending} aria-label={`${data.executeLabel} ${data.label}${data.forItem ? ` ${data.forItem.key}` : ''}`} onClick={event => { event.stopPropagation(); data.onExecute(data.id) }}>▶ {data.executeLabel}</button>}
      <button type="button" className="nodrag nopan" aria-label={`${data.detailsLabel} ${data.label}${data.forItem ? ` ${data.forItem.key}` : ''}`} onClick={event => { event.stopPropagation(); data.onInspect(data.id) }}>ⓘ {data.detailsLabel}</button>
    </div>
    <Handle type="source" position={Position.Right} />
  </div>
})

const DagGroupNode = memo(function DagGroupNode({ data: rawData }: NodeProps) {
  const data = rawData as GraphData
  return <div className="dsh-workflow-dag-group" data-graph-node data-definition-id={data.label} data-status={data.status}>
    <Handle type="target" position={Position.Left} />
    <div className="dsh-workflow-dag-heading">
      <strong>{data.label}</strong>
      <span className="dsh-workflow-node-status"><i aria-hidden="true" />{data.statusLabel}</span>
      <button type="button" className="nodrag nopan" aria-label={`${data.detailsLabel} ${data.label}`} onClick={event => { event.stopPropagation(); data.onInspect(data.id) }}>ⓘ {data.detailsLabel}</button>
    </div>
    <Handle type="source" position={Position.Right} />
  </div>
})

function AggregateNode({ data }: NodeProps) {
  return <div className="dsh-workflow-aggregate" aria-label={String(data.label)}><Handle type="target" position={Position.Left} /><span>{String(data.label)}</span><Handle type="source" position={Position.Right} /></div>
}

const nodeTypes = { workflow: WorkflowNode, dagGroup: DagGroupNode, aggregate: AggregateNode }

export function DagCanvas({ detail, t, onExecute, onInspect, pending }: { detail: InstanceDetail; t: WorkflowTranslate; onExecute: (id: string) => void; onInspect: (id: string) => void; pending?: string }) {
  const labels = Object.values(statusKeys).map(key => t(key)).join('\u0000') + t('node')
  const graph = useMemo(() => {
    const projected = buildCanvasGraph(detail)
    return { ...projected, nodes: projected.nodes.map(node => node.type === 'aggregate' ? { ...node, data: { ...node.data, label: t('groupOutput') } } : ({ ...node, data: {
      ...node.data,
      id: node.id,
      statusLabel: t(statusKeys[node.data.status as keyof typeof statusKeys]),
      kindLabel: node.data.kind === 'dag' ? 'DAG' : node.data.kind === 'node' ? t('node') : '',
      executeLabel: t('executeNode'), detailsLabel: t('nodeDetails'), onExecute, onInspect, pending: pending === node.id,
    } })) }
  }, [detail, labels, onExecute, onInspect, pending, t])
  return <div className="dsh-workflow-graph" aria-label={t('workflowGraph')}>
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.16, minZoom: 0.25, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={2}
      panOnDrag
      zoomOnScroll
      nodesDraggable={false}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      onNodeClick={() => {}}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
    >
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>
}
