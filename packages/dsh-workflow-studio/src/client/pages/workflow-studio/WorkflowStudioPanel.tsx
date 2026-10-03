import { StudioClient } from '../../studio-client.js'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { InstanceDetail } from '../../../shared/types/workflow-instance.js'
import type { TemplateDetail } from '../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../locales/index.js'
import { InstanceRunPanel } from './instances/InstanceRunPanel.js'
import { InstancesPanel } from './instances/InstancesPanel.js'
import { TemplatesPanel } from './templates/TemplatesPanel.js'
import { TemplateDetailPanel } from './templates/TemplateDetailPanel.js'
import { styles } from './styles.js'

type UseWorkspaces = <T>(selector: (snapshot: WorkspaceSnapshot) => T) => T

export function WorkflowStudioPanel({ t, useWorkspaces, onOpenSession, client: suppliedClient }: { client?: StudioClient; t: WorkflowTranslate; useWorkspaces: UseWorkspaces; onOpenSession: (sessionId: string) => void }) {
  const id = useId()
  const [localClient] = useState(() => new StudioClient())
  const client = suppliedClient ?? localClient
  const { activeTab, opened, openedTemplates, selection } = useSyncExternalStore(client.subscribe, client.getSnapshot)
  const setActiveTab = (activeTab: string) => client.set(current => ({ ...current, activeTab }))
  const setOpened = (update: (items: InstanceDetail[]) => InstanceDetail[]) => client.set(current => ({ ...current, opened: update(current.opened) }))
  const setOpenedTemplates = (update: (items: TemplateDetail[]) => TemplateDetail[]) => client.set(current => ({ ...current, openedTemplates: update(current.openedTemplates) }))
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  const tabs: { id: string; label: string; detail?: InstanceDetail; template?: TemplateDetail }[] = [
    { id: 'instances', label: t('instanceManagement') },
    { id: 'templates', label: t('templateManagement') },
    ...opened.map(detail => ({ id: `instance-${detail.id}`, label: detail.name, detail })),
    ...openedTemplates.map(template => ({ id: `template-${encodeURIComponent(template.id)}`, label: template.id, template })),
  ]

  useEffect(() => {
    if (activeTab.startsWith('instance-') || activeTab.startsWith('template-')) buttons.current[activeTab]?.focus()
  }, [activeTab])

  function openDetail(detail: InstanceDetail) {
    setOpened(current => current.some(item => item.id === detail.id) ? current : [...current, detail])
    setActiveTab(`instance-${detail.id}`)
  }

  function openExisting(instanceId: string) {
    if (!opened.some(detail => detail.id === instanceId)) return false
    setActiveTab(`instance-${instanceId}`)
    return true
  }

  function openTemplate(template: TemplateDetail) {
    setOpenedTemplates(current => current.some(item => item.id === template.id) ? current : [...current, template])
    setActiveTab(`template-${encodeURIComponent(template.id)}`)
  }

  function openExistingTemplate(id: string) {
    if (!openedTemplates.some(item => item.id === id)) return false
    setActiveTab(`template-${encodeURIComponent(id)}`)
    return true
  }

  function closeDetail(tabId: string) {
    client.releaseCanvas(tabId)
    const index = tabs.findIndex(tab => tab.id === tabId)
    const next = tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? 'instances'
    const focused = activeTab === tabId ? next : activeTab
    setOpened(current => current.filter(detail => `instance-${detail.id}` !== tabId))
    setOpenedTemplates(current => current.filter(template => `template-${encodeURIComponent(template.id)}` !== tabId))
    if (activeTab === tabId) setActiveTab(next)
    buttons.current[focused]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabId: string) {
    const index = tabs.findIndex(tab => tab.id === tabId)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break
      case 'ArrowLeft': nextIndex = (index + tabs.length - 1) % tabs.length; break
      case 'Home': nextIndex = 0; break
      case 'End': nextIndex = tabs.length - 1; break
      default: return
    }
    event.preventDefault()
    const next = tabs[nextIndex].id
    setActiveTab(next)
    buttons.current[next]?.focus()
  }

  return <section className="dsh-workflow-studio" aria-labelledby={`${id}-title`}>
    <style>{styles}</style>
    <header className="dsh-workflow-studio-header">
      <div className="dsh-workflow-studio-title-row">
        <h1 id={`${id}-title`}>{t('title')}</h1>
      </div>
      <div className="dsh-workflow-studio-tabs" role="tablist" aria-labelledby={`${id}-title`}>
        {tabs.map(tab => <div key={tab.id} className="dsh-workflow-studio-tab" role="presentation" data-selected={activeTab === tab.id}>
          <button
            ref={element => { buttons.current[tab.id] = element }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.id}`}
            aria-controls={`${id}-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={event => handleKeyDown(event, tab.id)}
          >{tab.label}</button>
          {(tab.detail || tab.template) && <button type="button" className="dsh-workflow-tab-close" aria-label={`${t(tab.template ? 'closeTemplateTab' : 'closeInstanceTab')} ${tab.label}`} onClick={() => closeDetail(tab.id)}>×</button>}
        </div>)}
      </div>
    </header>
    {tabs.map(tab => <div
      key={tab.id}
      className="dsh-workflow-studio-panel"
      role="tabpanel"
      id={`${id}-panel-${tab.id}`}
      aria-labelledby={`${id}-tab-${tab.id}`}
      hidden={activeTab !== tab.id}
      tabIndex={0}
    >{tab.id === 'instances'
      ? <InstancesPanel t={t} useWorkspaces={useWorkspaces} onSelect={openDetail} onOpenExisting={openExisting} onDeleted={instanceId => {
        client.remove(instanceId)
      }} />
      : tab.id === 'templates'
        ? <TemplatesPanel t={t} active={activeTab === 'templates'} onSelect={openTemplate} onOpenExisting={openExistingTemplate} />
      : tab.template
        ? <TemplateDetailPanel reading={client.canvas(tab.id)} template={tab.template} t={t} active={activeTab === tab.id} />
      : tab.detail
        ? <InstanceRunPanel reading={client.canvas(tab.id)} selection={selection?.instanceId === tab.detail.id ? selection : undefined} detail={tab.detail} t={t} active={activeTab === tab.id} onOpenSession={onOpenSession}
          onUpdate={updated => client.updateDetail(updated)}
          onWidthUpdate={width => setOpened(current => current.map(item => item.id === tab.detail!.id ? { ...item, drawerWidth: width } : item))} />
        : null}</div>)}
  </section>
}
