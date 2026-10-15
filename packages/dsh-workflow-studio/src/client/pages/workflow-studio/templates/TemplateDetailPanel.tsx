import type { CanvasReadingState } from '../../../studio-client.js'
import { useEffect, useMemo, useState } from 'react'
import { Button, IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TemplateDetail } from '../../../../shared/types/workflow-instance.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { LayoutNotices } from '../LayoutNotices.js'
import { DefinitionDetails, definitionAt } from '../DefinitionDetails.js'
import type { DefinitionPath } from '../../../../host/dag/index.js'
import { getTemplate } from '../../../apis/workflow-instances.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { useInspectorResize } from '../useInspectorResize.js'

export function TemplateDetailPanel({ template, t, active, reading, onUpdate }: { reading?: CanvasReadingState; template: TemplateDetail; t: WorkflowTranslate; active: boolean; onUpdate: (detail: TemplateDetail) => void }) {
  const [checking, setChecking] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string>()
  useEffect(() => {
    if (!active) return
    let current = true
    setChecking(true)
    void getTemplate(template.id).then(value => {
      if (current) { onUpdate(value); setAvailabilityError(undefined) }
    }, error => { if (current) setAvailabilityError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (current) setChecking(false) })
    return () => { current = false }
  }, [active, template.id])
  const [selected, setSelected] = useState<DefinitionPath | null>(null)
  const definition = useMemo(() => selected ? definitionAt(template.definition, selected) : undefined, [selected, template.definition])
  const { runArea, width, resizeHandle } = useInspectorResize(320, undefined, !checking && !availabilityError)
  return <section className="dsh-workflow-detail dsh-workflow-template-detail" aria-label={template.name}>
    <header className="dsh-workflow-detail-header"><div><h2>{template.name}</h2><p>{template.definition.id}</p></div><Button variant="outline" size="sm" className="dsh-workflow-button" disabled={checking || !!availabilityError} onClick={() => setSelected([])}>{t('rootDagDetails')}</Button></header>
    {availabilityError && <p role="alert">{t('templateInvalid')} {availabilityError}</p>}
    {checking && <p role="status">{t('templatesLoading')}</p>}
    {!checking && !availabilityError && <>
    <LayoutNotices report={template.layout} t={t} surface="template" />
    <div ref={runArea} className="dsh-workflow-run">
      <TemplateCanvas reading={reading} definition={template.definition} t={t} onInspect={setSelected} active={active} inspectorWidth={definition ? width : 0} />
      {definition && <aside className="dsh-workflow-inspector dsh-workflow-template-inspector" aria-label={`${t('nodeDetails')} ${definition.name ?? definition.id ?? template.definition.id}`} style={{ width: `${width}px` }}>
        <div className="dsh-workflow-inspector-resize" aria-label={t('resizeNodeDetails')} {...resizeHandle} />
        <header><div><h3>{definition.name ?? definition.id ?? template.definition.id}</h3></div><Button size="sm" className="dsh-workflow-inspector-close" aria-label={t('closeNodeDetails')} onClick={() => setSelected(null)}><IconCloseOutlineRegular size={14} /></Button></header>
        <div className="dsh-workflow-inspector-body">
          <section aria-label={t('definitionDetails')}>
            <DefinitionDetails definition={definition} />
          </section>
        </div>
      </aside>}
    </div>
    </>}
  </section>
}
