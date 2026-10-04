import type { CanvasReadingState } from '../../../studio-client.js'
import { useEffect, useMemo, useState } from 'react'
import { Controls, ReactFlow } from '@xyflow/react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { buildCanvasGraph } from './build-canvas-graph.js'
import { workCandidates } from '../canvas/navigation.js'
import { definitionAt } from '../DefinitionDetails.js'
import { CanvasNavigation, edgeTypes, nodeTypes, canvasStatusLabel } from '../canvas/CanvasElements.js'
import type { CanvasNode, CanvasEdge, Expression } from '../canvas/types.js'
import { emptyNodeViews, NodeButton, NodeBoundary, type NodeViews, visibleActions } from '../../../nodes.js'
import type { NodeCardProps } from 'dsh-workflow-node/ui'
import type { NodeData, NodeDefinition } from 'dsh-workflow-node/contract'

export function DagCanvas({ nodes: nodeViews = emptyNodeViews, detail, t, onAction, onInspect, pending, active = true, inspectorWidth = 0, reading }: { nodes?: NodeViews; reading?: CanvasReadingState; detail: InstanceDetail; t: WorkflowTranslate; onAction: (id: string, name: string, payload: unknown) => void; onInspect: (id: string) => void; pending?: string[]; active?: boolean; inspectorWidth?: number }) {
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
      summary: (() => {
        const item = detail.snapshot.instances.find(item => item.instanceId === node.id && item.type === 'node')
        const definition = item && definitionAt(detail.definition, item.definitionPath)
        const view = detail.nodeViews?.[node.id]
        const entry = nodeViews.get(String(definition?.node_kind), view?.source)
        const Summary = entry?.node.Summary
        return Summary && entry && item && definition?.type === 'node' ? <NodeBoundary key={entry.generation} message={t('nodeViewFailed')}><Summary definition={definition as NodeDefinition} input={item.input as NodeData} output={item.status === 'completed' ? item.output as NodeData : undefined} execution={execution as NodeCardProps['execution']} data={view?.data} t={entry.t} /></NodeBoundary> : null
      })(),
      control: (() => {
        const item = detail.snapshot.instances.find(row => row.instanceId === node.id)
        const definition = item?.type === 'node' ? definitionAt(detail.definition, item.definitionPath) : undefined
        if (definition?.type !== 'node' || item?.type !== 'node') return null
        const view = detail.nodeViews?.[item.instanceId]
        const primary = visibleActions(view?.actions ?? [], nodeViews, String(definition.node_kind), view?.source).find(action => action.primary)
        return primary ? <NodeButton action={primary} nodes={nodeViews} label={`${node.data.label}${item.forItem ? ` ${item.forItem.key}` : ''}`} pending={Boolean(pending?.includes(node.id))} blocked={Boolean(detail.incompatible)} onClick={() => onAction(node.id, primary.id, {})} /> : null
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
    <ReactFlow<CanvasNode, CanvasEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={reading?.viewport} onMove={(_event, viewport) => { if (reading) reading.viewport = viewport }} minZoom={0.05} maxZoom={2} onInit={() => setReady(true)}
      panOnDrag zoomOnScroll nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
      elementsSelectable={false} onNodeClick={() => {}} deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
      <Controls showInteractive={false} showFitView={false} />
      <CanvasNavigation restored={Boolean(reading?.viewport)} nodes={nodes} candidates={candidates} active={active} ready={ready} inspectorWidth={inspectorWidth} t={t} />
    </ReactFlow>
    {currentExpression && <aside className="dsh-workflow-expression" role="dialog" aria-label={t('fullExpression')}><header><strong>{t('fullExpression')}</strong><button type="button" aria-label={t('closeExpression')} onClick={() => setExpression(null)}>×</button></header>
      {currentExpression.condition && <><span>{t('conditionMark')} · if</span><pre>{currentExpression.condition}</pre></>}
      {currentExpression.each && <><span>{t('eachMark')} · for</span><pre>{currentExpression.each}</pre></>}
    </aside>}
  </div>
}
