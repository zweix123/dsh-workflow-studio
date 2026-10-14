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
import { emptyNodeViews, NodeBoundary, visibleActions, type NodeViews } from '../../../nodes.js'
import type { NodeViewProps } from 'dsh-workflow-node/ui'
import type { NodeData, NodeDefinition } from 'dsh-workflow-node/contract'

function visibleWidth(preference: number, available: number): number {
  if (!available) return preference
  if (available < 300) return available
  return Math.min(Math.max(300, preference), Math.max(300, Math.floor(available * 0.7)))
}

export function InstanceRunPanel({ nodes = emptyNodeViews, detail, t, onUpdate, onWidthUpdate, active = true, selection, reading }: { nodes?: NodeViews; reading?: CanvasReadingState; selection?: InstanceNavigationTarget & { request: number }; detail: InstanceDetail; t: WorkflowTranslate; onUpdate: (detail: InstanceDetail) => void; onWidthUpdate: (width: number) => void; active?: boolean }) {
  const registryRevision = useSyncExternalStore(nodes.subscribe, nodes.snapshot)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { if (selection) setSelected(selection.nodeInstanceId) }, [selection])
  const [pending, setPending] = useState<string[]>([])
  const [error, setError] = useState<{ key: WorkflowKey; message?: string; nodeId?: string }>()
  const requestOwners = useRef(new Map<string, number>())
  const [draftDiscarded, setDraftDiscarded] = useState(false)
  const [requests, setRequests] = useState<Record<string, { handler: string; sequence: number }>>({})
  useEffect(() => {
    setRequests(current => {
      const next = { ...current }
      let changed = false
      for (const id of Object.keys(current)) {
        const item = detail.snapshot.instances.find(item => item.instanceId === id)
        const definition = item && definitionAt(detail.definition, item.definitionPath)
        if (nodes.get(String(definition?.node_kind), detail.nodeViews?.[id]?.source)?.generation !== requestOwners.current.get(id)) {
          delete next[id]; requestOwners.current.delete(id); changed = true
        }
      }
      if (changed) setDraftDiscarded(true)
      return changed ? next : current
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
  const parent = detail.snapshot.instances.find(row => row.instanceId === inspection?.parentInstanceId)
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
        setError({ key, message: failure.message, nodeId })
      } else setError({ key: 'requestFailed', nodeId })
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
      t: entry?.t ?? (key => key), action: (name, payload) => run(id, name, payload), active, request: requestOwners.current.get(id) === entry?.generation ? requests[id] : undefined, reportError: failure => setError({ key: 'requestFailed', message: failure instanceof Error ? failure.message : String(failure), nodeId: id }), error: error?.nodeId === id ? `${t(error.key)} ${error.message ?? ''}` : undefined,
    }
  }
  async function invoke(id: string, name: string): Promise<void> {
    const props = propsFor(id)
    if (!props) return
    const view = detail.nodeViews?.[id]
    const action = visibleActions(view?.actions ?? [], nodes, String(props.definition.node_kind), view?.source).find(action => action.id === name)
    if (!action || action.disabled) return
    if (action.target.type === 'server') { await run(id, name, {}); return }
    if (busy.current.has(id)) return
    busy.current.add(id); setPending(current => [...current, id]); setError(undefined)
    try {
      const handler = nodes.get(String(props.definition.node_kind), view?.source)?.node.handlers?.[action.target.handler]
      if (handler) await handler(props)
      else {
        const entry = nodes.get(String(props.definition.node_kind), view?.source)
        if (entry) requestOwners.current.set(id, entry.generation)
        setRequests(current => ({ ...current, [id]: { handler: action.target.type === 'client' ? action.target.handler : '', sequence: (current[id]?.sequence ?? 0) + 1 } }))
      }
    }
    catch (error) { setError({ key: 'requestFailed', message: error instanceof Error ? error.message : String(error) }) }
    finally { busy.current.delete(id); setPending(current => current.filter(value => value !== id)) }
  }
  const inspectionStatus = canvasStatusLabel(inspection?.status ?? 'waiting', execution?.status, t)
  const layoutReport = useMemo(() => inspectLayout(detail.definition), [detail.definition])
  return <section className="dsh-workflow-detail" aria-label={detail.name}>
    <header className="dsh-workflow-detail-header"><div><h2>{detail.name}</h2><p>{detail.definition.name as string}</p></div><button type="button" className="dsh-workflow-button" onClick={() => setSelected(detail.snapshot.rootInstanceId)}>{t('rootDagDetails')}</button></header>
    {error && <p className="dsh-workflow-run-error" role="alert">{t(error.key)} {error.message}</p>}
    {draftDiscarded && <p role="alert">{t('draftDiscarded')}</p>}
    {detail.incompatible && <p className="dsh-workflow-run-error" role="alert">{t('instanceIncompatible')} {detail.incompatible}</p>}
    <LayoutNotices report={layoutReport} t={t} surface="instance" />
    {detail.snapshot.instances.filter(item => item.type === 'node').map(item => {
      const props = propsFor(item.instanceId)
      const entry = props && nodes.get(String(props.definition.node_kind), detail.nodeViews?.[item.instanceId]?.source)
      return entry && props ? Object.entries(entry.node.interactions ?? {}).map(([handler, Interaction]) => <NodeBoundary key={`${item.instanceId}:${entry.generation}:${handler}`} message={t('nodeViewFailed')}><Interaction {...props} request={props.request?.handler === handler ? props.request : undefined} /></NodeBoundary>) : null
    })}
    <div ref={runArea} className="dsh-workflow-run">
      <DagCanvas nodes={nodes} reading={reading} detail={detail} t={t} onAction={(id, name) => void invoke(id, name)} onInspect={setSelected} pending={pending} active={active} inspectorWidth={inspection ? visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth) : 0} />
      {inspection && <aside className="dsh-workflow-inspector" aria-label={`${t('nodeDetails')} ${inspection.definitionId}`} style={{ width: `${visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)}px` }}>
        <div className="dsh-workflow-inspector-resize" role="separator" tabIndex={0} aria-label={t('resizeNodeDetails')} aria-orientation="vertical" aria-valuemin={areaWidth ? Math.min(300, areaWidth) : undefined} aria-valuemax={areaWidth ? Math.max(Math.min(300, areaWidth), Math.floor(areaWidth * 0.7)) : undefined} aria-valuenow={visibleWidth(dragWidth ?? detail.drawerWidth ?? 320, areaWidth)} onPointerDown={startResize} onKeyDown={resizeByKeyboard} />
        <header><div><h3>{inspection.definitionId}</h3><p>{inspectionStatus}</p></div><button type="button" aria-label={t('closeNodeDetails')} onClick={() => setSelected(null)}>×</button></header>
        <div className="dsh-workflow-inspector-body">
          <section aria-label={t('runningInformation')}>
            <h4>{t('runningInformation')}</h4>
            <section className="dsh-workflow-runtime-block" aria-label={t('runOverview')}>
              <h5>{t('runOverview')}</h5>
              <DetailFields fields={[
                ...(item ? [[t(item.type === 'node' ? 'nodeInstance' : 'dagInstance'), `${item.definitionId} · ${item.instanceId}`] as [string, unknown]] : [[t('definitionId'), inspection.definitionId] as [string, unknown]]),
                ...(inspection.parentInstanceId !== null ? [[t('parentInstanceId'), parent ? `${parent.definitionId} · ${parent.instanceId}` : inspection.parentInstanceId] as [string, unknown]] : []),
                [t('runState'), inspectionStatus],
                ...(item?.forItem ? [[t('forItemIdentity'), item.forItem] as [string, unknown]] : []),
              ]} />
            </section>
            {item && <section className="dsh-workflow-runtime-block" aria-label={t('nodeInputOutput')}>
              <h5>{t('nodeInputOutput')}</h5>
              <DetailFields fields={[
                [t('nodeInput'), item.input],
                ...(output !== undefined ? [[t('nodeOutput'), output] as [string, unknown]] : []),
              ]} />
            </section>}
          {item?.type === 'node' && definition?.type === 'node' && (() => {
            const view = detail.nodeViews?.[item.instanceId]
            const entry = nodes.get(String(definition.node_kind), view?.source)
            const Panel = entry?.node.Panel
            const props = propsFor(item.instanceId)!
            const actions = visibleActions(view?.actions ?? [], nodes, String(definition.node_kind), view?.source)
            if (!actions.length && !Panel && !view?.data && !execution) return null
            return <section className="dsh-workflow-runtime-block" aria-label={t('nodeProgress')}>
              <h5>{t('nodeProgress')}</h5>
              {Panel && entry ? <NodeBoundary key={`${item.instanceId}:${entry.generation}`} message={t('nodeViewFailed')}><Panel data={props.data} label={props.label} definition={props.definition} input={props.input} output={props.output} execution={props.execution} t={props.t} /></NodeBoundary> : null}
              {!Panel && (view?.data || execution) ? <pre>{JSON.stringify(view?.data ?? execution, null, 2)}</pre> : null}
              {execution?.error ? <p role="alert">{execution.error}</p> : null}
            </section>
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
