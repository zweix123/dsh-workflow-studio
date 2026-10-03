import { useEffect, useMemo, useRef, useState } from 'react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import { getInstance, nodeAction, setDrawerWidth, WorkflowInstanceApiError } from '../../../apis/workflow-instances.js'
import type { WorkflowKey, WorkflowTranslate } from '../../../locales/index.js'
import { buildPositionNodeId } from './build-canvas-graph.js'
import { DefinitionDetails, DetailFields, definitionAt } from '../DefinitionDetails.js'
import { inspectLayout } from '../../../../shared/layout.js'
import { LayoutNotices } from '../LayoutNotices.js'
import { DagCanvas } from './DagCanvas.js'
import { canvasStatusLabel } from '../canvas/CanvasElements.js'
import { clientNodes } from '../../../nodes.js'
import type { NodeViewProps } from '../../../../contract/node/client.js'
import type { NodeData, NodeDefinition } from '../../../../contract/node/index.js'

function visibleWidth(preference: number, available: number): number {
  if (!available) return preference
  if (available < 300) return available
  return Math.min(Math.max(300, preference), Math.max(300, Math.floor(available * 0.7)))
}

export function InstanceRunPanel({ detail, t, onUpdate, onWidthUpdate, onOpenSession, active = true }: { detail: InstanceDetail; t: WorkflowTranslate; onUpdate: (detail: InstanceDetail) => void; onWidthUpdate: (width: number) => void; onOpenSession: (sessionId: string) => void; active?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [error, setError] = useState<{ key: WorkflowKey; message?: string }>()
  const [drafts, setDrafts] = useState<Record<string, NodeData>>({})
  const busy = useRef(new Set<string>())
  const runArea = useRef<HTMLDivElement>(null)
  const dragCleanup = useRef<() => void>(() => {})
  const [areaWidth, setAreaWidth] = useState(0)
  const [dragWidth, setDragWidth] = useState<number>()
  const item = detail.snapshot.instances.find(row => row.instanceId === selected)
  const position = [...detail.snapshot.waitingPositions.map(row => ({ ...row, status: 'waiting' as const })),
    ...detail.snapshot.skippedPositions.map(row => ({ ...row, status: 'skipped' as const }))]
    .find(row => buildPositionNodeId(row, row.status) === selected)
  const inspection = item ?? position
  const execution = item?.type === 'node' ? detail.executions?.[item.instanceId] : undefined
  const definition = inspection && definitionAt(detail.definition, inspection.definitionPath)
  const output = item?.status === 'completed' ? item.output : execution?.status === 'succeeded' ? execution.output : undefined

  useEffect(() => { if (selected && !inspection) setSelected(null) }, [selected, inspection])
  useEffect(() => {
    const element = runArea.current
    if (!element) return
    const observer = new ResizeObserver(() => setAreaWidth(element.clientWidth))
    observer.observe(element)
    setAreaWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => dragCleanup.current(), [])
  useEffect(() => {
    const polling = detail.snapshot.instances.some(row => row.type === 'node' && row.status === 'ready' && (
      detail.executions?.[row.instanceId]?.status === 'running'
      || (detail.executions?.[row.instanceId]?.status === 'succeeded' && !detail.executions[row.instanceId]?.error)
      || (detail.executions?.[row.instanceId] === undefined && definitionAt(detail.definition, row.definitionPath)?.is_auto_start === true)
    ))
    if (!polling) return
    let active = true
    let waiting = false
    const timer = window.setInterval(() => {
      if (waiting) return
      waiting = true
      void getInstance(detail.id).then(value => {
        if (active) onUpdate(value)
      }, () => {}).finally(() => { waiting = false })
    }, 600)
    return () => { active = false; window.clearInterval(timer) }
  }, [detail, onUpdate])

  async function saveWidth(width: number) {
    try {
      await setDrawerWidth(detail.id, width)
      onWidthUpdate(width)
      setDragWidth(undefined)
      setError(undefined)
    } catch {
      setDragWidth(undefined)
      setError({ key: 'requestFailed' })
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    dragCleanup.current()
    const startX = event.clientX
    const startWidth = visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)
    const next = (x: number) => visibleWidth(startWidth + startX - x, areaWidth)
    const move = (pointer: PointerEvent) => setDragWidth(next(pointer.clientX))
    const up = (pointer: PointerEvent) => {
      dragCleanup.current()
      const width = next(pointer.clientX)
      if (width === startWidth) setDragWidth(undefined)
      else {
        setDragWidth(width)
        void saveWidth(width)
      }
    }
    const cancel = () => {
      dragCleanup.current()
      setDragWidth(undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    dragCleanup.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      dragCleanup.current = () => {}
    }
  }

  function resizeByKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentWidth = visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)
    const width = visibleWidth(currentWidth + (event.key === 'ArrowLeft' ? 10 : -10), areaWidth)
    if (width === currentWidth) return
    setDragWidth(width)
    void saveWidth(width)
  }

  async function run(nodeId: string, action: string, payload: unknown) {
    if (busy.current.has(nodeId)) return
    busy.current.add(nodeId)
    setPending(current => [...current, nodeId])
    setError(undefined)
    try {
      onUpdate(await nodeAction(detail.id, nodeId, action, payload))
    } catch (failure) {
      if (failure instanceof WorkflowInstanceApiError) {
        if (failure.latest) onUpdate(failure.latest)
        const key = failure.code === 'node-not-ready' ? 'nodeNotReady' : failure.code === 'submission-failed' ? 'submissionFailed' : failure.code === 'node-input-invalid' ? 'nodeInputInvalid' : 'requestFailed'
        setError({ key, message: failure.message })
      } else setError({ key: 'requestFailed' })
    } finally {
      busy.current.delete(nodeId)
      setPending(current => current.filter(id => id !== nodeId))
    }
  }

  const inspectionStatus = canvasStatusLabel(inspection?.status ?? 'waiting', execution?.status, t)
  const layoutReport = useMemo(() => inspectLayout(detail.definition), [detail.definition])
  return <section className="dsh-workflow-detail" aria-label={detail.name}>
    <header className="dsh-workflow-detail-header"><div><h2>{detail.name}</h2><p>{detail.templateId}</p></div><button type="button" className="dsh-workflow-button" onClick={() => setSelected(detail.snapshot.rootInstanceId)}>{t('rootDagDetails')}</button></header>
    {error && <p className="dsh-workflow-run-error" role="alert">{t(error.key)} {error.message}</p>}
    {detail.incompatible && <p className="dsh-workflow-run-error" role="alert">{t('instanceIncompatible')} {detail.incompatible}</p>}
    <LayoutNotices report={layoutReport} t={t} surface="instance" />
    <p className="dsh-workflow-run-note">{t('resultNotice')}</p>
    <div ref={runArea} className="dsh-workflow-run">
      <DagCanvas detail={detail} t={t} onAction={(id, name, payload) => void run(id, name, payload)} onInspect={setSelected} pending={pending} active={active} inspectorWidth={inspection ? visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth) : 0} />
      {inspection && <aside className="dsh-workflow-inspector" aria-label={`${t('nodeDetails')} ${inspection.definitionId}`} style={{ width: `${visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)}px` }}>
        <div className="dsh-workflow-inspector-resize" role="separator" tabIndex={0} aria-label={t('resizeNodeDetails')} aria-orientation="vertical" aria-valuemin={areaWidth ? Math.min(300, areaWidth) : undefined} aria-valuemax={areaWidth ? Math.max(Math.min(300, areaWidth), Math.floor(areaWidth * 0.7)) : undefined} aria-valuenow={visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)} onPointerDown={startResize} onKeyDown={resizeByKeyboard} />
        <header><div><h3>{inspection.definitionId}</h3><p>{inspectionStatus}</p></div><button type="button" aria-label={t('closeNodeDetails')} onClick={() => setSelected(null)}>×</button></header>
        <div className="dsh-workflow-inspector-body">
          <section aria-label={t('runningInformation')}>
            <h4>{t('runningInformation')}</h4>
            <DetailFields fields={[
              ...(item ? [[t('instanceId'), item.instanceId] as [string, unknown]] : []),
              [t('parentInstanceId'), inspection.parentInstanceId],
              [t('definitionId'), inspection.definitionId],
              [t('runState'), inspectionStatus],
              ...(item?.forItem ? [[t('forItemIdentity'), item.forItem] as [string, unknown]] : []),
              ...(item ? [[t('nodeInput'), item.input] as [string, unknown]] : []),
              ...(output !== undefined ? [[t('nodeOutput'), output] as [string, unknown]] : []),
            ]} />
          {item?.type === 'node' && definition?.type === 'node' && (() => {
            const Panel = clientNodes.get(String(definition.node_kind))?.Panel
            if (!Panel) return null
            const props: NodeViewProps = { label: item.definitionId, definition: definition as NodeDefinition, input: item.input as NodeData, output: output as NodeData | undefined,
              execution: execution as NodeViewProps['execution'], ready: item.status === 'ready', pending: Boolean(detail.incompatible) || pending.includes(item.instanceId),
              t: key => t(key as Parameters<WorkflowTranslate>[0]), action: (name, payload) => void run(item.instanceId, name, payload),
              openSession: onOpenSession, draft: drafts[item.instanceId],
              setDraft: value => setDrafts(current => ({ ...current, [item.instanceId]: value })) }
            return <Panel key={item.instanceId} {...props} />
          })()}
          </section>
          <section aria-label={t('definitionDetails')}>
            <h4>{t('definitionDetails')}</h4>
            {definition ? <DefinitionDetails definition={definition} /> : <p role="status">{t('definitionMissing')}</p>}
          </section>
        </div>
      </aside>}
    </div>
  </section>
}
