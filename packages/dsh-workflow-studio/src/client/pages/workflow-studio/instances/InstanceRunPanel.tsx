import { useEffect, useRef, useState } from 'react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import { executeNode, setDrawerWidth, WorkflowInstanceApiError } from '../../../apis/workflow-instances.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { buildPositionNodeId } from './build-canvas-graph.js'
import { DagCanvas, statusKeys } from './DagCanvas.js'

function visibleWidth(preference: number, available: number): number {
  if (!available) return preference
  if (available < 300) return available
  return Math.min(Math.max(300, preference), Math.max(300, Math.floor(available * 0.7)))
}

export function InstanceRunPanel({ detail, t, onUpdate, onWidthUpdate }: { detail: InstanceDetail; t: WorkflowTranslate; onUpdate: (detail: InstanceDetail) => void; onWidthUpdate: (width: number) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<string>()
  const [error, setError] = useState<string>()
  const busy = useRef(false)
  const runArea = useRef<HTMLDivElement>(null)
  const dragCleanup = useRef<() => void>(() => {})
  const [areaWidth, setAreaWidth] = useState(0)
  const [dragWidth, setDragWidth] = useState<number>()
  const item = detail.snapshot.instances.find(row => row.instanceId === selected)
  const position = [...detail.snapshot.waitingPositions.map(row => ({ ...row, status: 'waiting' as const })),
    ...detail.snapshot.skippedPositions.map(row => ({ ...row, status: 'skipped' as const }))]
    .find(row => buildPositionNodeId(row, row.status) === selected)
  const inspection = item ?? position

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

  async function saveWidth(width: number) {
    try {
      await setDrawerWidth(detail.id, width)
      onWidthUpdate(width)
      setDragWidth(undefined)
      setError(undefined)
    } catch {
      setDragWidth(undefined)
      setError(t('requestFailed'))
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

  async function run(nodeId: string) {
    if (busy.current) return
    busy.current = true
    setPending(nodeId)
    setError(undefined)
    try {
      onUpdate(await executeNode(detail.id, nodeId))
    } catch (failure) {
      if (failure instanceof WorkflowInstanceApiError) {
        if (failure.latest) onUpdate(failure.latest)
        const key = failure.code === 'node-not-ready' ? 'nodeNotReady' : failure.code === 'submission-failed' ? 'submissionFailed' : 'requestFailed'
        setError(`${t(key)} ${failure.message}`)
      } else setError(t('requestFailed'))
    } finally {
      busy.current = false
      setPending(undefined)
    }
  }

  const statusKey = statusKeys[inspection?.status ?? 'waiting']
  return <section className="dsh-workflow-detail" aria-label={detail.name}>
    <header className="dsh-workflow-detail-header"><div><h2>{detail.name}</h2><p>{detail.templateId}</p></div></header>
    {error && <p className="dsh-workflow-run-error" role="alert">{error}</p>}
    <div ref={runArea} className="dsh-workflow-run">
      <DagCanvas detail={detail} t={t} onExecute={id => void run(id)} onInspect={setSelected} pending={pending} />
      {inspection && <aside className="dsh-workflow-inspector" aria-label={`${t('nodeDetails')} ${inspection.definitionId}`} style={{ width: `${visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)}px` }}>
        <div className="dsh-workflow-inspector-resize" role="separator" tabIndex={0} aria-label={t('resizeNodeDetails')} aria-orientation="vertical" aria-valuemin={areaWidth ? Math.min(300, areaWidth) : undefined} aria-valuemax={areaWidth ? Math.max(Math.min(300, areaWidth), Math.floor(areaWidth * 0.7)) : undefined} aria-valuenow={visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)} onPointerDown={startResize} onKeyDown={resizeByKeyboard} />
        <header><div><h3>{inspection.definitionId}</h3><p>{t(statusKey)}</p></div><button type="button" aria-label={t('closeNodeDetails')} onClick={() => setSelected(null)}>×</button></header>
        <div className="dsh-workflow-inspector-body" />
      </aside>}
    </div>
  </section>
}
