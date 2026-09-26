import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BaseEdge, Controls, EdgeLabelRenderer, Handle, Position, ReactFlow, useReactFlow, getSmoothStepPath, type EdgeProps, type NodeProps, type Viewport } from '@xyflow/react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { buildCanvasGraph } from './build-canvas-graph.js'
import { canvasPosition, flowStartNodeId, workCandidates, type WorkCandidate } from './graph-navigation.js'

type GraphData = { id: string; label: string; status: 'ready' | 'completed' | 'running' | 'waiting' | 'skipped'; displayStatus?: string; statusLabel: string; kind: 'node' | 'dag' | 'position'; kindLabel: string; forItem?: { key: string; index: number }; executeLabel: string; detailsLabel: string; pending: boolean; onExecute: (id: string) => void; onInspect: (id: string) => void }
type Expression = { condition?: string; each?: string }
export const statusKeys = { ready: 'statusReady', completed: 'statusCompleted', running: 'statusRunning', waiting: 'statusWaiting', skipped: 'statusSkipped' } as const

const WorkflowNode = memo(function WorkflowNode({ data: rawData }: NodeProps) {
  const data = rawData as GraphData
  return <div className="dsh-workflow-node" data-graph-node data-definition-id={data.label} data-status={data.displayStatus ?? data.status}>
    <Handle id="left" type="target" position={Position.Left} /><Handle id="top" type="target" position={Position.Top} />
    <div className="dsh-workflow-node-top"><span className="dsh-workflow-node-kind">{data.kindLabel}</span><span className="dsh-workflow-node-status"><i aria-hidden="true" />{data.statusLabel}</span></div>
    <strong title={data.label}>{data.label}</strong>
    {data.forItem && <small title={data.forItem.key}>{data.forItem.key} #{data.forItem.index + 1}</small>}
    <div className="dsh-workflow-node-actions">
      {data.kind === 'node' && data.status === 'ready' && <button type="button" className="nodrag nopan" disabled={data.pending} aria-label={`${data.executeLabel} ${data.label}${data.forItem ? ` ${data.forItem.key}` : ''}`} onClick={event => { event.stopPropagation(); data.onExecute(data.id) }}>▶ {data.executeLabel}</button>}
      <button type="button" className="nodrag nopan" aria-label={`${data.detailsLabel} ${data.label}${data.forItem ? ` ${data.forItem.key}` : ''}`} onClick={event => { event.stopPropagation(); data.onInspect(data.id) }}>ⓘ {data.detailsLabel}</button>
    </div>
    <Handle id="right" type="source" position={Position.Right} /><Handle id="bottom" type="source" position={Position.Bottom} />
  </div>
})

const DagGroupNode = memo(function DagGroupNode({ data: rawData }: NodeProps) {
  const data = rawData as GraphData
  return <div className="dsh-workflow-dag-group" data-graph-node data-definition-id={data.label} data-status={data.status}>
    <Handle id="left" type="target" position={Position.Left} /><Handle id="top" type="target" position={Position.Top} />
    <div className="dsh-workflow-dag-heading">
      <strong title={data.label}>{data.label}</strong>
      <span className="dsh-workflow-node-status"><i aria-hidden="true" />{data.statusLabel}</span>
      <button type="button" className="nodrag nopan" aria-label={`${data.detailsLabel} ${data.label}`} onClick={event => { event.stopPropagation(); data.onInspect(data.id) }}>ⓘ {data.detailsLabel}</button>
    </div>
    <Handle id="right" type="source" position={Position.Right} /><Handle id="bottom" type="source" position={Position.Bottom} />
  </div>
})

function AggregateNode({ data }: NodeProps) {
  return <div className="dsh-workflow-aggregate" aria-label={String(data.label)}><Handle id="left" type="target" position={Position.Left} /><Handle id="top" type="target" position={Position.Top} /><span>{String(data.label)}</span><Handle id="right" type="source" position={Position.Right} /><Handle id="bottom" type="source" position={Position.Bottom} /></div>
}

function ExpressionEdge(props: EdgeProps) {
  const data = props.data as Expression & { open?: (id: string, expression: Expression) => void; conditionLabel?: string; eachLabel?: string; routeY?: number; routeX?: number; routeTopY?: number }
  const [smoothPath, smoothX, smoothY] = getSmoothStepPath(props)
  const path = data.routeY === undefined ? smoothPath
    : data.routeX !== undefined && data.routeTopY !== undefined
      ? `M ${props.sourceX},${props.sourceY} L ${props.sourceX},${data.routeY} L ${data.routeX},${data.routeY} L ${data.routeX},${data.routeTopY} L ${props.targetX},${data.routeTopY} L ${props.targetX},${props.targetY}`
      : `M ${props.sourceX},${props.sourceY} L ${props.sourceX + 24},${props.sourceY} L ${props.sourceX + 24},${data.routeY} L ${props.targetX - 24},${data.routeY} L ${props.targetX - 24},${props.targetY} L ${props.targetX},${props.targetY}`
  const x = data.routeY === undefined ? smoothX : data.routeX ?? (props.sourceX + props.targetX) / 2
  const y = data.routeY === undefined ? smoothY : data.routeY
  const label = [data.condition && data.conditionLabel, data.each && data.eachLabel].filter(Boolean).join(' / ')
  return <><BaseEdge path={path} markerEnd={props.markerEnd} />{label && <EdgeLabelRenderer><button type="button" className="dsh-workflow-edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
    aria-label={`${label}: ${[data.condition, data.each].filter(Boolean).join('; ')}`} onFocus={() => data.open?.(props.id, data)} onClick={() => data.open?.(props.id, data)}>{label}</button></EdgeLabelRenderer>}</>
}
const nodeTypes = { workflow: WorkflowNode, dagGroup: DagGroupNode, aggregate: AggregateNode }
const edgeTypes = { expression: ExpressionEdge }

function CanvasNavigation({ nodes, candidates, active, ready, inspectorWidth, t }: { nodes: ReturnType<typeof buildCanvasGraph>['nodes']; candidates: WorkCandidate[]; active: boolean; ready: boolean; inspectorWidth: number; t: WorkflowTranslate }) {
  const { setViewport, zoomTo } = useReactFlow()
  const element = useRef<HTMLDivElement>(null)
  const first = useRef(false)
  const [listOpen, setListOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const area = () => element.current?.closest('.dsh-workflow-graph') as HTMLDivElement | null
  const bounds = useMemo(() => {
    const roots = nodes.filter(node => !node.parentId)
    const x = Math.min(...roots.map(node => node.position.x))
    const y = Math.min(...roots.map(node => node.position.y))
    const right = Math.max(...roots.map(node => node.position.x + Number(node.style?.width || 184)))
    const bottom = Math.max(...roots.map(node => node.position.y + Number(node.style?.height || 112)))
    return { x, y, width: right - x, height: bottom - y }
  }, [nodes])
  const move = useCallback((viewport: Viewport, animate = true) => {
    void setViewport(viewport, { duration: animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 0 })
  }, [setViewport])
  const locate = useCallback((id: string, animate = true) => {
    const byId = new Map(nodes.map(node => [node.id, node]))
    const node = byId.get(id)
    const viewport = area()
    if (!node || !viewport) return
    const usable = Math.max(120, viewport.clientWidth - inspectorWidth)
    const { x, y } = canvasPosition(node, byId)
    const centerX = x + Number(node.style?.width || 184) / 2
    const centerY = y + Number(node.style?.height || 112) / 2
    move({ x: Math.max(usable * .42, Math.min(usable - 80, 180)) - centerX, y: viewport.clientHeight * .48 - centerY, zoom: 1 }, animate)
  }, [nodes, inspectorWidth, move])
  const fit = useCallback((animate = true) => {
    const viewport = area()
    if (!viewport || !nodes.length) return
    const usable = Math.max(120, viewport.clientWidth - inspectorWidth)
    const scale = Math.max(.05, Math.min(1, (usable - 48) / bounds.width, (viewport.clientHeight - 112) / bounds.height))
    move({ x: (usable - bounds.width * scale) / 2 - bounds.x * scale, y: (viewport.clientHeight - bounds.height * scale) / 2 - bounds.y * scale, zoom: scale }, animate)
  }, [bounds, inspectorWidth, move, nodes.length])
  useEffect(() => {
    if (first.current || !active || !ready || !nodes.length) return
    const frame = requestAnimationFrame(() => {
      const viewport = area()
      if (!viewport || !viewport.clientWidth || !viewport.clientHeight) return
      const usable = Math.max(120, viewport.clientWidth - inspectorWidth)
      if (bounds.width + 48 <= usable && bounds.height + 112 <= viewport.clientHeight) fit(false)
      else locate(candidates[0]?.id ?? flowStartNodeId(nodes) ?? nodes[0].id, false)
      first.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [active, ready, nodes, bounds, candidates, inspectorWidth, fit, locate])
  if (!nodes.length) return <div className="dsh-workflow-empty">{t('emptyGraph')}</div>
  return <div ref={element} className="dsh-workflow-canvas-overlay"><div className="dsh-workflow-view-tools">
    <button type="button" onClick={() => fit()}>{t('fitGraph')}</button>
    <button type="button" onClick={() => { void zoomTo(1, { duration: 180 }); setFeedback('') }}>{t('resetZoom')}</button>
    <button type="button" aria-expanded={listOpen} onClick={() => {
      if (candidates.length === 1) { locate(candidates[0].id); setListOpen(false); setFeedback('') }
      else { setListOpen(value => !value); setFeedback(candidates.length ? '' : t('noPendingNodes')) }
    }}>{t('locateWork')}{candidates.length > 1 ? ` (${candidates.length})` : ''}</button>
    {listOpen && <div className="dsh-workflow-locate-list" role="dialog" aria-label={t('locateWork')}>
      <div className="dsh-workflow-locate-head"><strong>{t('locateWork')}</strong><button type="button" aria-label={t('closeList')} onClick={() => setListOpen(false)}>×</button></div>
        {candidates.length ? candidates.map(item => <button type="button" key={item.id} onClick={() => { locate(item.id); setListOpen(false); setFeedback('') }}><span>{item.label}{item.item ? ` · ${item.item}` : ''}</span><small>{item.path ? `${item.path} · ` : ''}{item.status === 'error' ? t('executionError') : item.status === 'unknown' ? t('statusUnknown') : item.status === 'running' ? t('statusRunning') : t('statusReady')}</small></button>) : <p>{t('noPendingNodes')}</p>}
    </div>}
    {feedback && <span role="status" className="dsh-workflow-view-feedback">{feedback}</span>}
  </div></div>
}

export function DagCanvas({ detail, t, onExecute, onInspect, pending, active = true, inspectorWidth = 0 }: { detail: InstanceDetail; t: WorkflowTranslate; onExecute: (id: string) => void; onInspect: (id: string) => void; pending?: string[]; active?: boolean; inspectorWidth?: number }) {
  const [expression, setExpression] = useState<{ id: string; value: Expression } | null>(null)
  const [ready, setReady] = useState(false)
  const graph = useMemo(() => buildCanvasGraph(detail), [detail])
  const currentExpression = expression ? graph.edges.find(edge => edge.id === expression.id)?.data as Expression | undefined : undefined
  const candidates = useMemo(() => workCandidates(detail, graph.nodes), [detail, graph.nodes])
  const nodes = graph.nodes.map(node => node.type === 'aggregate' ? { ...node, data: { ...node.data, label: t('groupOutput') } } : ({ ...node, data: {
    ...node.data, id: node.id,
    status: detail.executions?.[node.id]?.status === 'running' ? 'running' : node.data.status,
    displayStatus: detail.executions?.[node.id]?.status === 'failed' ? 'error' : detail.executions?.[node.id]?.status === 'unknown' ? 'unknown' : detail.executions?.[node.id]?.status === 'running' ? 'running' : node.data.status,
    statusLabel: detail.executions?.[node.id]?.status === 'failed' ? t('executionError') : detail.executions?.[node.id]?.status === 'unknown' ? t('statusUnknown') : t(statusKeys[detail.executions?.[node.id]?.status === 'running' ? 'running' : node.data.status as keyof typeof statusKeys]),
    kindLabel: node.data.kind === 'dag' ? 'DAG' : node.data.kind === 'node' ? t('node') : '',
    executeLabel: t('executeNode'), detailsLabel: t('nodeDetails'), onExecute, onInspect,
    pending: Boolean(detail.incompatible) || Boolean(detail.executions?.[node.id]?.status === 'running') || Boolean(pending?.includes(node.id)),
  } }))
  const edges = graph.edges.map(edge => ({ ...edge, data: { ...edge.data, conditionLabel: t('conditionMark'), eachLabel: t('eachMark'), open: (id: string, value: Expression) => setExpression({ id, value }) } }))
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
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} minZoom={0.05} maxZoom={2} onInit={() => setReady(true)}
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
