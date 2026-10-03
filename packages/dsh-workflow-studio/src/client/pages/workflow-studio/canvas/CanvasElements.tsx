import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, Handle, Position, useReactFlow, getSmoothStepPath, type EdgeProps, type NodeProps, type Viewport } from '@xyflow/react'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { canvasPosition, flowStartNodeId, type WorkCandidate } from './navigation.js'
import type { CanvasNode, CanvasEdge, CanvasStatus } from './types.js'

export const statusKeys = { ready: 'statusReady', completed: 'statusCompleted', running: 'statusRunning', waiting: 'statusWaiting', skipped: 'statusSkipped' } as const

export function canvasStatusLabel(status: CanvasStatus, executionStatus: string | undefined, t: WorkflowTranslate): string {
  return executionStatus === 'failed' ? t('executionError') : executionStatus === 'unknown' ? t('statusUnknown')
    : t(statusKeys[executionStatus === 'running' ? 'running' : status])
}

const WorkflowNode = memo(function WorkflowNode({ data }: NodeProps<CanvasNode>) {
  if (data.source === 'aggregate' || !data.view) return null
  const view = data.view
  const forItem = data.source === 'instance' ? data.forItem : undefined
  return <div className="dsh-workflow-node" data-graph-node data-definition-id={data.label} data-status={view.displayStatus ?? (data.source === 'template' ? undefined : data.status)}>
    <Handle id="left" type="target" position={Position.Left} /><Handle id="top" type="target" position={Position.Top} />
    <div className="dsh-workflow-node-top"><span className="dsh-workflow-node-kind">{view.kindLabel}</span>{data.source !== 'template' && <span className="dsh-workflow-node-status"><i aria-hidden="true" />{view.statusLabel}</span>}</div>
    <strong title={data.label}>{data.label}</strong>
    {forItem && <small title={forItem.key}>{forItem.key} #{forItem.index + 1}</small>}
    <div className="dsh-workflow-node-actions">
      {view.control}
      <button type="button" className="nodrag nopan" aria-label={`${view.detailsLabel} ${data.label}${forItem ? ` ${forItem.key}` : ''}`} onClick={event => { event.stopPropagation(); view.onInspect() }}>ⓘ {view.detailsLabel}</button>
    </div>
    <Handle id="right" type="source" position={Position.Right} /><Handle id="bottom" type="source" position={Position.Bottom} />
  </div>
})

const DagGroupNode = memo(function DagGroupNode({ data }: NodeProps<CanvasNode>) {
  if (data.source === 'aggregate' || !data.view) return null
  const view = data.view
  return <div className="dsh-workflow-dag-group" data-graph-node data-definition-id={data.label} data-status={data.source === 'template' ? undefined : data.status}>
    <Handle id="left" type="target" position={Position.Left} /><Handle id="top" type="target" position={Position.Top} />
    <div className="dsh-workflow-dag-heading">
      <strong title={data.label}>{data.label}</strong>
      {data.source !== 'template' && <span className="dsh-workflow-node-status"><i aria-hidden="true" />{view.statusLabel}</span>}
      <button type="button" className="nodrag nopan" aria-label={`${view.detailsLabel} ${data.label}`} onClick={event => { event.stopPropagation(); view.onInspect() }}>ⓘ {view.detailsLabel}</button>
    </div>
    <Handle id="right" type="source" position={Position.Right} /><Handle id="bottom" type="source" position={Position.Bottom} />
  </div>
})

function AggregateNode({ data }: NodeProps<CanvasNode>) {
  return <div className="dsh-workflow-aggregate" aria-label={String(data.label)}><Handle id="left" type="target" position={Position.Left} /><Handle id="top" type="target" position={Position.Top} /><span>{String(data.label)}</span><Handle id="right" type="source" position={Position.Right} /><Handle id="bottom" type="source" position={Position.Bottom} /></div>
}

function ExpressionEdge(props: EdgeProps<CanvasEdge>) {
  const data = props.data
  if (!data) return null
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
export const nodeTypes = { workflow: WorkflowNode, dagGroup: DagGroupNode, aggregate: AggregateNode }
export const edgeTypes = { expression: ExpressionEdge }

export function CanvasNavigation({ nodes, candidates, active, ready, inspectorWidth, t, template = false, restored = false }: { nodes: CanvasNode[]; candidates: WorkCandidate[]; active: boolean; ready: boolean; inspectorWidth: number; t: WorkflowTranslate; template?: boolean; restored?: boolean }) {
  const { setViewport, zoomTo } = useReactFlow()
  const element = useRef<HTMLDivElement>(null)
  const first = useRef(restored)
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
    {!template && <button type="button" aria-expanded={listOpen} onClick={() => {
      if (candidates.length === 1) { locate(candidates[0].id); setListOpen(false); setFeedback('') }
      else { setListOpen(value => !value); setFeedback(candidates.length ? '' : t('noPendingNodes')) }
    }}>{t('locateWork')}{candidates.length > 1 ? ` (${candidates.length})` : ''}</button>}
    {listOpen && <div className="dsh-workflow-locate-list" role="dialog" aria-label={t('locateWork')}>
      <div className="dsh-workflow-locate-head"><strong>{t('locateWork')}</strong><button type="button" aria-label={t('closeList')} onClick={() => setListOpen(false)}>×</button></div>
        {candidates.length ? candidates.map(item => <button type="button" key={item.id} onClick={() => { locate(item.id); setListOpen(false); setFeedback('') }}><span>{item.label}{item.item ? ` · ${item.item}` : ''}</span><small>{item.path ? `${item.path} · ` : ''}{item.status === 'error' ? t('executionError') : item.status === 'unknown' ? t('statusUnknown') : item.status === 'running' ? t('statusRunning') : t('statusReady')}</small></button>) : <p>{t('noPendingNodes')}</p>}
    </div>}
    {feedback && <span role="status" className="dsh-workflow-view-feedback">{feedback}</span>}
  </div></div>
}
