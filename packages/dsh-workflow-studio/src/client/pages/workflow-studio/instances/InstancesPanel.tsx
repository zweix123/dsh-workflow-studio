import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createInstance, deleteInstance, getInstance, listInstances, listTemplates, WorkflowInstanceApiError } from '../../../apis/workflow-instances.js'
import type { InstanceDetail, InstanceErrorCode, InstanceSummary, TemplateCatalog } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowKey, WorkflowTranslate } from '../../../locales/index.js'

type Props = { t: WorkflowTranslate; useWorkspaces: <T>(selector: (snapshot: WorkspaceSnapshot) => T) => T; onSelect: (detail: InstanceDetail) => void; onOpenExisting: (id: string) => boolean; onDeleted: (id: string) => void }

const errorKeys: Record<InstanceErrorCode | 'request-failed', WorkflowKey> = {
  'invalid-request': 'invalidRequest',
  'invalid-name': 'invalidName',
  'duplicate-name': 'duplicateName',
  'workspace-missing': 'workspaceMissing',
  'template-missing': 'templateMissing',
  'template-invalid': 'templateInvalid',
  'initialization-failed': 'initializationFailed',
  'instance-missing': 'instanceMissing',
  'request-failed': 'requestFailed',
}

function message(error: unknown, t: WorkflowTranslate): string {
  if (error instanceof WorkflowInstanceApiError && error.code === 'template-invalid') return t('templateInvalid')
  return error instanceof WorkflowInstanceApiError
    ? `${t(errorKeys[error.code] ?? 'requestFailed')} ${error.message}`
    : t('requestFailed')
}

function defaultName(templateId: string): string {
  const timestamp = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date())
  return `${templateId} ${timestamp}`
}

function InstanceItem({ row, onOpen, onDeleted, t }: { row: InstanceSummary; onOpen: () => void; onDeleted: (id: string) => void; t: WorkflowTranslate }) {
  const [mode, setMode] = useState<'closed' | 'menu' | 'confirm'>('closed')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const item = useRef<HTMLLIElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  useEffect(() => { if (pending) dialog.current?.focus() }, [pending])

  useEffect(() => {
    if (mode === 'closed') return
    if (mode === 'menu') item.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    else dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (mode === 'menu' && !item.current?.contains(event.target as Node)) setMode('closed')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!busy.current) {
          setMode('closed')
          trigger.current?.focus()
        }
      }
      if (mode !== 'confirm' || event.key !== 'Tab' || !dialog.current) return
      const buttons = [...dialog.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (!buttons.length) {
        event.preventDefault()
        dialog.current.focus()
        return
      }
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault()
        buttons.at(-1)?.focus()
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault()
        buttons[0].focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [mode])

  async function confirmDelete() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(undefined)
    try {
      await deleteInstance(row.id)
      onDeleted(row.id)
    } catch (failure) {
      setError(message(failure, t))
      busy.current = false
      setPending(false)
    }
  }

  return <li ref={item} className="dsh-workflow-instance-item" data-menu-open={mode === 'menu'}>
    <button type="button" className="dsh-workflow-instance-row" onClick={() => { setMode('closed'); onOpen() }}>
      <strong>{row.name}</strong><span>{row.templateId}</span>
    </button>
    <button ref={trigger} type="button" className="dsh-workflow-instance-more" aria-label={`${t('instanceActions')} ${row.name}`} aria-haspopup="menu" aria-expanded={mode === 'menu'} onClick={() => setMode(current => current === 'menu' ? 'closed' : 'menu')}>⋯</button>
    {mode === 'menu' && <div className="dsh-workflow-instance-menu" role="menu" aria-label={row.name}>
      <button type="button" role="menuitem" onClick={() => setMode('confirm')}>{t('deleteInstance')}</button>
    </div>}
    {mode === 'confirm' && createPortal(<div className="dsh-workflow-create-overlay">
      <div className="dsh-workflow-create-mask" />
      <div ref={dialog} className="dsh-workflow-delete-dialog" role="alertdialog" aria-modal="true" aria-label={t('deleteInstance')} tabIndex={-1}>
        <h2>{t('deleteInstance')}</h2><p className="dsh-workflow-delete-name">{row.name}</p><p>{t('deleteWarning')}</p>
        {error && <p className="dsh-workflow-error" role="alert">{error}</p>}
        <div className="dsh-workflow-delete-actions">
          <button type="button" className="dsh-workflow-button" disabled={pending} onClick={() => { setMode('closed'); trigger.current?.focus() }}>{t('cancel')}</button>
          <button type="button" className="dsh-workflow-button dsh-workflow-delete-confirm" disabled={pending} onClick={() => void confirmDelete()}>{t(pending ? 'deleting' : 'deleteInstance')}</button>
        </div>
      </div>
    </div>, document.body)}
  </li>
}

function CreateInstanceForm({ workspaceId, workspaceTitle, trigger, rows, onClose, onCreated, t }: {
  workspaceId: string
  workspaceTitle: string
  trigger: HTMLButtonElement
  rows: InstanceSummary[]
  onClose: () => void
  onCreated: (detail: InstanceDetail) => void
  t: WorkflowTranslate
}) {
  const [catalog, setCatalog] = useState<TemplateCatalog>()
  const [catalogError, setCatalogError] = useState(false)
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>('.dsh-workflow-create-close')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      trigger.focus()
    }
  }, [onClose, trigger])

  useEffect(() => {
    let active = true
    void listTemplates().then(value => {
      if (!active) return
      setCatalog(value)
      const first = value.templates.find(row => !row.error)
      if (first) {
        setTemplateId(first.id)
        setName(defaultName(first.id))
      }
    }, () => { if (active) setCatalogError(true) })
    return () => { active = false }
  }, [])

  async function submit() {
    if (pending) return
    const normalized = name.trim()
    if (!normalized) return setError(t('invalidName'))
    if (rows.some(row => row.workspaceId === workspaceId && row.name === normalized)) return setError(t('duplicateName'))
    if (!templateId) return setError(t('templateMissing'))
    setPending(true)
    setError(undefined)
    try {
      onCreated(await createInstance({ workspaceId, name: normalized, templateId }))
    } catch (failure) {
      setError(message(failure, t))
    } finally {
      setPending(false)
    }
  }

  const validTemplates = catalog?.templates.filter(row => !row.error) ?? []
  return <div className="dsh-workflow-create-overlay">
    <button type="button" className="dsh-workflow-create-mask" aria-label={t('closeCreateForm')} onClick={onClose} />
    <div ref={dialog} className="dsh-workflow-create-dialog" role="dialog" aria-modal="true" aria-label={t('createInstance')}>
    <form className="dsh-workflow-create" onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="dsh-workflow-create-heading">
        <div><h2>{t('createInstance')}</h2><p>{workspaceTitle} · {t('createHint')}</p></div>
        <button type="button" className="dsh-workflow-create-close" aria-label={t('closeCreateForm')} onClick={onClose}>×</button>
      </div>
      <div className="dsh-workflow-create-fields">
      {catalogError ? <p role="alert">{t('templatesLoadFailed')}</p> : !catalog ? <p role="status">{t('templatesLoading')}</p> : <>
      <label>{t('chooseTemplate')}
        <select value={templateId} disabled={pending || validTemplates.length === 0} onChange={event => {
          setTemplateId(event.target.value)
          setName(defaultName(event.target.value))
        }}>
          {catalog.templates.map(row => <option key={row.id} value={row.id} disabled={Boolean(row.error)}>
            {row.error ? `${row.id} — ${t('templateInvalid')}` : row.id}
          </option>)}
        </select>
      </label>
      {validTemplates.length === 0 && <div className="dsh-workflow-template-empty">
        <strong>{t('noTemplates')}</strong><code>{catalog.directory}</code>
      </div>}
      <label>{t('instanceName')}<input name="instanceName" value={name} disabled={pending} autoComplete="off" onChange={event => setName(event.target.value)} /></label>
      {error && <p className="dsh-workflow-error" role="alert">{error}</p>}
      </>}
      </div>
      <div className="dsh-workflow-form-actions">
        <button type="submit" className="dsh-workflow-button dsh-workflow-button-primary" disabled={pending || validTemplates.length === 0}>{t(pending ? 'creating' : 'create')}</button>
      </div>
    </form>
    </div>
  </div>
}

export function InstancesPanel({ t, useWorkspaces, onSelect, onOpenExisting, onDeleted }: Props) {
  const workspaces = useWorkspaces(value => value)
  const [rows, setRows] = useState<InstanceSummary[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [creating, setCreating] = useState<{ id: string; title: string; trigger: HTMLButtonElement }>()
  const [detailError, setDetailError] = useState<string>()
  const closeCreation = useCallback(() => setCreating(undefined), [])

  useEffect(() => {
    let active = true
    void listInstances().then(value => {
      if (!active) return
      setRows(value)
      setPhase('ready')
    }, () => { if (active) setPhase('error') })
    return () => { active = false }
  }, [])

  const groups = useMemo(() => {
    const known = new Set(workspaces.items.map(workspace => String(workspace.workspaceId)))
    const result = workspaces.items.map(workspace => ({
      id: String(workspace.workspaceId), title: workspace.title,
      rows: rows.filter(row => row.workspaceId === workspace.workspaceId),
    }))
    const ungrouped = workspaces.phase === 'ready' ? rows.filter(row => !known.has(row.workspaceId)) : []
    if (ungrouped.length) result.push({ id: '', title: t('ungrouped'), rows: ungrouped })
    return result
  }, [rows, workspaces.items, workspaces.phase, t])

  async function open(row: InstanceSummary) {
    setCreating(undefined)
    setDetailError(undefined)
    if (onOpenExisting(row.id)) return
    try { onSelect(await getInstance(row.id)) } catch (error) { setDetailError(message(error, t)) }
  }

  return <div className="dsh-workflow-instances">
    <div className="dsh-workflow-instance-overview">
      <header className="dsh-workflow-overview-heading"><h2>{t('overviewTitle')}</h2><p>{t('overviewHint')}</p></header>
      {workspaces.state === 'error' && <p role="alert" className="dsh-workflow-notice">{t('workspaceLoadFailed')}</p>}
      {workspaces.phase === 'pending' && <p role="status" className="dsh-workflow-notice">{t('workspaceLoading')}</p>}
      {phase === 'loading' && <p role="status" className="dsh-workflow-notice">{t('instancesLoading')}</p>}
      {phase === 'error' && <p role="alert" className="dsh-workflow-notice">{t('instancesLoadFailed')}</p>}
      <div className="dsh-workflow-card-grid">
      {groups.map(group => <section className="dsh-workflow-workspace" key={group.id || 'ungrouped'}>
        <header><div><h3 title={group.title}>{group.title}</h3><p>{t('instances')}: {group.rows.length}</p></div>{group.id && <button type="button" className="dsh-workflow-button dsh-workflow-add" aria-label={`${t('createInstance')} ${group.title}`} aria-haspopup="dialog" aria-expanded={creating?.id === group.id} disabled={phase !== 'ready'} onClick={event => { setCreating({ id: group.id, title: group.title, trigger: event.currentTarget }); setDetailError(undefined) }}>+ {t('newInstance')}</button>}</header>
        {group.rows.length ? <ul>{group.rows.map(row => <InstanceItem key={row.id} row={row} onOpen={() => void open(row)} onDeleted={id => { setRows(current => current.filter(item => item.id !== id)); onDeleted(id) }} t={t} />)}</ul> : <p className="dsh-workflow-empty">{t('noInstances')}</p>}
      </section>)}
      </div>
      {workspaces.phase === 'ready' && workspaces.items.length === 0 && groups.length === 0 && <p className="dsh-workflow-notice">{t('noWorkspaces')}</p>}
      {detailError && <p role="alert" className="dsh-workflow-notice">{detailError}</p>}
    </div>
    {creating && <CreateInstanceForm key={creating.id} workspaceId={creating.id} workspaceTitle={creating.title} trigger={creating.trigger} rows={rows} onClose={closeCreation} onCreated={created => {
        setRows(current => [created, ...current])
        setCreating(undefined)
      }} t={t} />}
  </div>
}
