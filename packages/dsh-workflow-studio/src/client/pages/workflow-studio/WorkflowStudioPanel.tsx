import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { WorkflowKey, WorkflowTranslate } from '../../locales/index.js'
import { InstancesPanel } from './instances/InstancesPanel.js'
import { TemplatesPanel } from './templates/TemplatesPanel.js'
import { styles } from './styles.js'

const tabs = [
  { id: 'instances', label: 'instances' },
  { id: 'templates', label: 'templates' },
] as const satisfies readonly { id: string; label: WorkflowKey }[]

type TabId = typeof tabs[number]['id']

export function WorkflowStudioPanel({ t }: { t: WorkflowTranslate }) {
  const id = useId()
  const [activeTab, setActiveTab] = useState<TabId>('instances')
  const buttons = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({})

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabId: TabId) {
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
        {tabs.map(tab => <button
          key={tab.id}
          ref={element => { buttons.current[tab.id] = element }}
          type="button"
          role="tab"
          id={`${id}-tab-${tab.id}`}
          aria-controls={`${id}-panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => setActiveTab(tab.id)}
          onKeyDown={event => handleKeyDown(event, tab.id)}
        >{t(tab.label)}</button>)}
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
    >{tab.id === 'instances' ? <InstancesPanel /> : <TemplatesPanel />}</div>)}
  </section>
}
