import { useMemo, useState } from 'react'
import type { TemplateDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { LayoutNotices } from '../LayoutNotices.js'
import { templateDefinitionAt } from './build-template-graph.js'
import { TemplateCanvas } from './TemplateCanvas.js'

export function TemplateDetailPanel({ template, t, active }: { template: TemplateDetail; t: WorkflowTranslate; active: boolean }) {
  const [selected, setSelected] = useState<number[] | null>(null)
  const definition = useMemo(() => selected ? templateDefinitionAt(template.definition, selected) : undefined, [selected, template.definition])
  return <section className="dsh-workflow-detail dsh-workflow-template-detail" aria-label={template.id}>
    <header className="dsh-workflow-detail-header"><div><h2>{template.id}</h2><p>{template.definition.id}</p></div><button type="button" className="dsh-workflow-button" onClick={() => setSelected([])}>{t('rootDagDetails')}</button></header>
    <LayoutNotices report={template.layout} t={t} surface="template" />
    <div className="dsh-workflow-run">
      <TemplateCanvas definition={template.definition} t={t} onInspect={setSelected} active={active} inspectorWidth={definition ? 320 : 0} />
      {definition && <aside className="dsh-workflow-inspector dsh-workflow-template-inspector" aria-label={`${t('nodeDetails')} ${definition.id ?? template.definition.id}`}>
        <header><div><h3>{definition.id ?? template.definition.id}</h3></div><button type="button" aria-label={t('closeNodeDetails')} onClick={() => setSelected(null)}>×</button></header>
        <div className="dsh-workflow-inspector-body">
          <dl>{Object.entries(definition).filter(([key]) => key !== 'dag').map(([key, value]) => <div key={key} className="dsh-workflow-template-field"><dt>{key}</dt><dd><pre>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></dd></div>)}</dl>
        </div>
      </aside>}
    </div>
  </section>
}
