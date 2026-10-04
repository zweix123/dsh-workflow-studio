import type { CanvasReadingState } from '../../../studio-client.js'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { InstanceDetail, InstanceNavigationTarget } from '../../../../shared/types/workflow-instance.js'
import { getInstance, nodeAction, setDrawerWidth, WorkflowInstanceApiError } from '../../../apis/workflow-instances.js'
import type { WorkflowKey, WorkflowTranslate } from '../../../locales/index.js'
import { buildPositionNodeId } from './build-canvas-graph.js'
import { DefinitionDetails, DetailFields, definitionAt } from '../DefinitionDetails.js'
import { inspectLayout } from '../../../../shared/layout.js'
import { LayoutNotices } from '../LayoutNotices.js'
import { DagCanvas } from './DagCanvas.js'
import { canvasStatusLabel } from '../canvas/CanvasElements.js'
import { emptyNodeViews, NodeButton, NodeBoundary, visibleActions, type NodeViews } from '../../../nodes.js'
import type { NodeViewProps } from 'dsh-workflow-node/ui'
import type { NodeData, NodeDefinition } from 'dsh-workflow-node/contract'

function visibleWidth(preference: number, available: number): number {
  if (!available) return preference
  if (available < 300) return available
  return Math.min(Math.max(300, preference), Math.max(300, Math.floor(available * 0.7)))
}

export function InstanceRunPanel({ nodes = emptyNodeViews, detail, t, onUpdate, onWidthUpdate, active = true, selection, reading }: { nodes?: NodeViews; reading?: CanvasReadingState; selection?: InstanceNavigationTarget & { request: number }; detail: InstanceDetail; t: WorkflowTranslate; onUpdate: (detail: InstanceDetail) => void; onWidthUpdate: (width: number) => void; active?: boolean }) {
  const registryRevision = useSyncExternalStore(nodes.subscribe, nodes.snapshot)
  const draftOwners = useRef(new Map<string, number>())
  const [draftDiscarded, setDraftDiscarded] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { if (selection) setSelected(selection.nodeInstanceId) }, [selection])
  const [pending, setPending] = useState<string[]>([])
  const [error, setError] = useState<{ key: WorkflowKey; message?: string }>()
  const [drafts, setDrafts] = useState<Record<string, NodeData>>({})
  useEffect(() => {
    setDrafts(current => {
      const next = { ...current }
      let discarded = false
      for (const id of Object.keys(current)) {
        const item = detail.snapshot.instances.find(item => item.instanceId === id)
        const definition = item && definitionAt(detail.definition, item.definitionPath)
        if (nodes.get(String(definition?.node_kind), detail.nodeViews?.[id]?.source)?.generation !== draftOwners.current.get(id)) { delete next[id]; draftOwners.current.delete(id); discarded = true }
      }
      if (discarded) setDraftDiscarded(true)
      return discarded ? next : current
    })
  }, [nodes, registryRevision, detail])
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
    if (!active) return
    let current = true
    let waiting = false
    const timer = window.setInterval(() => {
      if (waiting) return
      waiting = true
      void getInstance(detail.id).then(value => {
        if (current) onUpdate(value)
      }, () => {}).finally(() => { waiting = false })
    }, 600)
    return () => { current = false; window.clearInterval(timer) }
  }, [detail, onUpdate, active])

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
      onUpdate(await nodeAction(detail.id, nodeId, action, payload, detail.nodeViews?.[nodeId]?.token))
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

  function propsFor(id: string): NodeViewProps | undefined {
    const item = detail.snapshot.instances.find(item => item.instanceId === id && item.type === 'node')
    const definition = item && definitionAt(detail.definition, item.definitionPath)
    if (!item || definition?.type !== 'node') return
    const entry = nodes.get(String(definition.node_kind), detail.nodeViews?.[id]?.source)
    const execution = detail.executions?.[id]
    return { data: detail.nodeViews?.[id]?.data, instanceId: detail.id, nodeInstanceId: id, label: item.definitionId, definition: definition as NodeDefinition, input: item.input as NodeData,
      output: (item.status === 'completed' ? item.output : execution?.status === 'succeeded' ? execution.output : undefined) as NodeData | undefined,
      execution: execution as NodeViewProps['execution'], ready: item.status === 'ready', pending: Boolean(detail.incompatible) || pending.includes(id),
      t: entry?.t ?? (key => key), action: (name, payload) => void run(id, name, payload), draft: drafts[id],
      setDraft: value => { if (entry) draftOwners.current.set(id, entry.generation); setDrafts(current => ({ ...current, [id]: value })) },
    }
  }
  async function invoke(id: string, name: string): Promise<void> {
    const props = propsFor(id)
    if (!props) return
    const view = detail.nodeViews?.[id]
    const action = visibleActions(view?.actions ?? [], nodes, String(props.definition.node_kind), view?.source).find(action => action.id === name)
    if (!action || action.disabled) return
    if (action.target.type === 'details') { setSelected(id); return }
    if (action.target.type === 'server') { await run(id, name, {}); return }
    if (busy.current.has(id)) return
    busy.current.add(id); setPending(current => [...current, id]); setError(undefined)
    try { await nodes.get(String(props.definition.node_kind), view?.source)?.node.handlers?.[action.target.handler]?.(props) }
    catch (error) { setError({ key: 'requestFailed', message: error instanceof Error ? error.message : String(error) }) }
    finally { busy.current.delete(id); setPending(current => current.filter(value => value !== id)) }
  }
  const inspectionStatus = canvasStatusLabel(inspection?.status ?? 'waiting', execution?.status, t)
  const layoutReport = useMemo(() => inspectLayout(detail.definition), [detail.definition])
  return <section className="dsh-workflow-detail" aria-label={detail.name}>
    <header className="dsh-workflow-detail-header"><div><h2>{detail.name}</h2><p>{detail.templateId}</p></div><button type="button" className="dsh-workflow-button" onClick={() => setSelected(detail.snapshot.rootInstanceId)}>{t('rootDagDetails')}</button></header>
    {error && <p className="dsh-workflow-run-error" role="alert">{t(error.key)} {error.message}</p>}
    {draftDiscarded && <p role="alert">{t('draftDiscarded')}</p>}
    {detail.incompatible && <p className="dsh-workflow-run-error" role="alert">{t('instanceIncompatible')} {detail.incompatible}</p>}
    <LayoutNotices report={layoutReport} t={t} surface="instance" />
    <p className="dsh-workflow-run-note">{t('resultNotice')}</p>
    <div ref={runArea} className="dsh-workflow-run">
      <DagCanvas nodes={nodes} reading={reading} detail={detail} t={t} onAction={(id, name) => void invoke(id, name)} onInspect={setSelected} pending={pending} active={active} inspectorWidth={inspection ? visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth) : 0} />
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
            const view = detail.nodeViews?.[item.instanceId]
            const entry = nodes.get(String(definition.node_kind), view?.source)
            const Panel = entry?.node.Panel
            const props = propsFor(item.instanceId)!
            return <>
              <div className="dsh-workflow-business-actions">{visibleActions(view?.actions ?? [], nodes, String(definition.node_kind), view?.source).map(action => <NodeButton key={action.id} action={action} nodes={nodes} pending={pending.includes(item.instanceId)} blocked={Boolean(detail.incompatible)} onClick={() => void invoke(item.instanceId, action.id)} />)}</div>
              {Panel && entry ? <NodeBoundary key={`${item.instanceId}:${entry.generation}`} message={t('nodeViewFailed')}><Panel {...props} /></NodeBoundary> : null}
              {!Panel && (view?.data || execution) ? <pre>{JSON.stringify(view?.data ?? execution, null, 2)}</pre> : null}
              {execution?.error ? <p role="alert">{execution.error}</p> : null}
            </>
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
