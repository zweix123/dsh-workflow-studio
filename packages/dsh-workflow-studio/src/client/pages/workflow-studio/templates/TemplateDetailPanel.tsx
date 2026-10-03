import { useMemo, useState } from 'react'
import type { TemplateDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { LayoutNotices } from '../LayoutNotices.js'
import { DefinitionDetails, definitionAt } from '../DefinitionDetails.js'
import type { DefinitionPath } from '../../../../host/dag/index.js'
import { TemplateCanvas } from './TemplateCanvas.js'

export function TemplateDetailPanel({ template, t, active }: { template: TemplateDetail; t: WorkflowTranslate; active: boolean }) {
  const [selected, setSelected] = useState<DefinitionPath | null>(null)
  const definition = useMemo(() => selected ? definitionAt(template.definition, selected) : undefined, [selected, template.definition])
  return <section className="dsh-workflow-detail dsh-workflow-template-detail" aria-label={template.id}>
    <header className="dsh-workflow-detail-header"><div><h2>{template.id}</h2><p>{template.definition.id}</p></div><button type="button" className="dsh-workflow-button" onClick={() => setSelected([])}>{t('rootDagDetails')}</button></header>
    <LayoutNotices report={template.layout} t={t} surface="template" />
    <div className="dsh-workflow-run">
      <TemplateCanvas definition={template.definition} t={t} onInspect={setSelected} active={active} inspectorWidth={definition ? 320 : 0} />
      {definition && <aside className="dsh-workflow-inspector dsh-workflow-template-inspector" aria-label={`${t('nodeDetails')} ${definition.id ?? template.definition.id}`}>
        <header><div><h3>{definition.id ?? template.definition.id}</h3></div><button type="button" aria-label={t('closeNodeDetails')} onClick={() => setSelected(null)}>×</button></header>
        <div className="dsh-workflow-inspector-body">
          <DefinitionDetails definition={definition} />
        </div>
      </aside>}
    </div>
  </section>
}
