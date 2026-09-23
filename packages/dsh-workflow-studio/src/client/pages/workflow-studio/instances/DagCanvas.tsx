import { memo, useMemo } from 'react'
import { Controls, Handle, Position, ReactFlow, type NodeProps } from '@xyflow/react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { buildCanvasGraph } from './build-canvas-graph.js'

type GraphData = { label: string; status: 'ready' | 'completed' | 'running' | 'waiting' | 'skipped'; statusLabel: string; kind: 'node' | 'dag' | 'position'; kindLabel: string; forItem?: { key: string; index: number } }
const statusKeys = { ready: 'statusReady', completed: 'statusCompleted', running: 'statusRunning', waiting: 'statusWaiting', skipped: 'statusSkipped' } as const

const WorkflowNode = memo(function WorkflowNode({ data: rawData }: NodeProps) {
  const data = rawData as GraphData
  return <div className="dsh-workflow-node" data-graph-node data-definition-id={data.label} data-status={data.status}>
    <Handle type="target" position={Position.Left} />
    <span className="dsh-workflow-node-kind">{data.kindLabel}</span>
    <strong>{data.label}</strong>
    <span className="dsh-workflow-node-status"><i />{data.statusLabel}</span>
    {data.forItem && <small>{data.forItem.key}</small>}
    <Handle type="source" position={Position.Right} />
  </div>
})

const DagGroupNode = memo(function DagGroupNode({ data: rawData }: NodeProps) {
  const data = rawData as GraphData
  return <div className="dsh-workflow-dag-group" data-graph-node data-definition-id={data.label} data-status={data.status}>
    <Handle type="target" position={Position.Left} />
    <strong>{data.label}</strong>
    <span className="dsh-workflow-node-status"><i />{data.statusLabel}</span>
    <Handle type="source" position={Position.Right} />
  </div>
})

const nodeTypes = { workflow: WorkflowNode, dagGroup: DagGroupNode }

export function DagCanvas({ detail, t }: { detail: InstanceDetail; t: WorkflowTranslate }) {
  const labels = Object.values(statusKeys).map(key => t(key)).join('\u0000') + t('node')
  const graph = useMemo(() => {
    const projected = buildCanvasGraph(detail)
    return { ...projected, nodes: projected.nodes.map(node => ({ ...node, data: {
      ...node.data,
      statusLabel: t(statusKeys[node.data.status as keyof typeof statusKeys]),
      kindLabel: node.data.kind === 'dag' ? 'DAG' : node.data.kind === 'node' ? t('node') : '',
    } })) }
  }, [detail, labels])
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
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
    >
      <Controls showInteractive={false} />
    </ReactFlow>
  </div>
}
