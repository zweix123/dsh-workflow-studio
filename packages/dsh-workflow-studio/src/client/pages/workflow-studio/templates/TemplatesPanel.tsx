import { useEffect, useState } from 'react'
import { getTemplate, listTemplates, WorkflowInstanceApiError } from '../../../apis/workflow-instances.js'
import type { TemplateCatalog, TemplateDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { LayoutNotices } from '../LayoutNotices.js'

export function TemplatesPanel({ t, active, onSelect }: { t: WorkflowTranslate; active: boolean; onSelect: (detail: TemplateDetail) => void }) {
  const [catalog, setCatalog] = useState<TemplateCatalog>()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detailError, setDetailError] = useState<string>()
  useEffect(() => {
    if (!active) return
    let current = true
    setPhase('loading')
    void listTemplates().then(value => { if (current) { setCatalog(value); setPhase('ready') } }, () => { if (current) setPhase('error') })
    return () => { current = false }
  }, [active])

  async function open(id: string) {
    setDetailError(undefined)
    // Fetch current availability before reusing a detail tab.
    try { onSelect(await getTemplate(id)) }
    catch (error) {
      setDetailError(error instanceof WorkflowInstanceApiError
        ? `${t(error.code === 'template-missing' ? 'templateMissing' : error.code === 'template-invalid' ? 'templateInvalid' : 'requestFailed')} ${error.message}`
        : t('requestFailed'))
    }
  }

  return <div className="dsh-workflow-template-list">
    <header className="dsh-workflow-overview-heading"><h2>{t('templateManagement')}</h2><p>{t('templateListHint')}</p></header>
    {phase === 'loading' && <p role="status" className="dsh-workflow-notice">{t('templatesLoading')}</p>}
    {phase === 'error' && <p role="alert" className="dsh-workflow-notice">{t('templatesLoadFailed')}</p>}
    {detailError && <p role="alert" className="dsh-workflow-notice">{detailError}</p>}
    {phase === 'ready' && catalog && (catalog.templates.length
      ? <ul>{catalog.templates.map(row => <li key={row.key} className="dsh-workflow-template-item">
        <button type="button" disabled={Boolean(row.error)} onClick={() => void open(row.id)} aria-label={`${t('openTemplate')} ${row.name ?? row.source}`}>{row.name ?? row.source}</button>
        <code>{row.source}</code>
        {row.error && <p role="alert"><strong>{t('templateInvalid')}</strong><span>{row.error}</span></p>}
        <LayoutNotices report={row.layout} t={t} surface="template" />
      </li>)}</ul>
      : <div className="dsh-workflow-template-empty"><strong>{t('noTemplatesInDirectory')}</strong></div>)}
  </div>
}
