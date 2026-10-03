import { useEffect, useMemo, useState } from 'react'
import { Controls, ReactFlow } from '@xyflow/react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { buildCanvasGraph } from './build-canvas-graph.js'
import { workCandidates } from '../canvas/navigation.js'
import { definitionAt } from '../DefinitionDetails.js'
import { CanvasNavigation, edgeTypes, nodeTypes, canvasStatusLabel } from '../canvas/CanvasElements.js'
import type { CanvasNode, CanvasEdge, Expression } from '../canvas/types.js'
import { clientNodes } from '../../../nodes.js'
import type { NodeCardProps } from '../../../../contract/node/client.js'
import type { NodeData, NodeDefinition } from '../../../../contract/node/index.js'

export function DagCanvas({ detail, t, onAction, onInspect, pending, active = true, inspectorWidth = 0 }: { detail: InstanceDetail; t: WorkflowTranslate; onAction: (id: string, name: string, payload: unknown) => void; onInspect: (id: string) => void; pending?: string[]; active?: boolean; inspectorWidth?: number }) {
  const [expression, setExpression] = useState<{ id: string; value: Expression } | null>(null)
  const [ready, setReady] = useState(false)
  const graph = useMemo(() => buildCanvasGraph(detail), [detail])
  const currentExpression = expression ? graph.edges.find(edge => edge.id === expression.id)?.data : undefined
  const candidates = useMemo(() => workCandidates(detail, graph.nodes), [detail, graph.nodes])
  const nodes: CanvasNode[] = graph.nodes.map(node => {
    if (node.data.source === 'aggregate') return { ...node, data: { ...node.data, label: t('groupOutput') } }
    if (node.data.source === 'template') return node
    const execution = detail.executions?.[node.id]
    const status = execution?.status === 'running' ? 'running' : node.data.status
    return { ...node, data: { ...node.data, view: {
      displayStatus: execution?.status === 'failed' ? 'error' : execution?.status === 'unknown' ? 'unknown' : status,
      statusLabel: canvasStatusLabel(status, execution?.status, t),
      kindLabel: node.data.kind === 'dag' ? 'DAG' : node.data.kind === 'node' ? t('node') : '',
      detailsLabel: t('nodeDetails'), onInspect: () => onInspect(node.id),
      control: (() => {
        const item = detail.snapshot.instances.find(row => row.instanceId === node.id)
        const definition = item?.type === 'node' ? definitionAt(detail.definition, item.definitionPath) : undefined
        const Client = clientNodes.get(String(definition?.node_kind))?.Card
        if (!Client || definition?.type !== 'node' || item?.type !== 'node') return null
        const props: NodeCardProps = { label: `${node.data.label}${item.forItem ? ` ${item.forItem.key}` : ''}`, definition: definition as NodeDefinition, input: item.input as NodeData, output: item.status === 'completed' ? item.output as NodeData : undefined,
          execution: execution && { ...execution }, ready: item.status === 'ready',
          pending: Boolean(detail.incompatible) || Boolean(pending?.includes(node.id)), t: key => t(key as Parameters<WorkflowTranslate>[0]),
          action: (name, payload) => onAction(node.id, name, payload), inspect: () => onInspect(node.id) }
        return <Client {...props} />
      })(),
    } } }
  })
  const edges: CanvasEdge[] = graph.edges.map(edge => ({ ...edge, data: { ...edge.data, conditionLabel: t('conditionMark'), eachLabel: t('eachMark'), open: (id: string, value: Expression) => setExpression({ id, value }) } }))
  useEffect(() => {
    if (expression && !graph.edges.some(edge => edge.id === expression.id)) setExpression(null)
  }, [expression, graph.edges])
  useEffect(() => {
    if (!expression) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpression(null) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [expression])
  return <div className="dsh-workflow-graph" aria-label={t('workflowGraph')}>
    <ReactFlow<CanvasNode, CanvasEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} minZoom={0.05} maxZoom={2} onInit={() => setReady(true)}
      panOnDrag zoomOnScroll nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
      elementsSelectable={false} onNodeClick={() => {}} deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
      <Controls showInteractive={false} showFitView={false} />
      <CanvasNavigation nodes={nodes} candidates={candidates} active={active} ready={ready} inspectorWidth={inspectorWidth} t={t} />
    </ReactFlow>
    {currentExpression && <aside className="dsh-workflow-expression" role="dialog" aria-label={t('fullExpression')}><header><strong>{t('fullExpression')}</strong><button type="button" aria-label={t('closeExpression')} onClick={() => setExpression(null)}>×</button></header>
      {currentExpression.condition && <><span>{t('conditionMark')} · if</span><pre>{currentExpression.condition}</pre></>}
      {currentExpression.each && <><span>{t('eachMark')} · for</span><pre>{currentExpression.each}</pre></>}
    </aside>}
  </div>
}
