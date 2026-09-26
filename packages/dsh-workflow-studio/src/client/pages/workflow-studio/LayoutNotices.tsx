import { useState } from 'react'
import type { LayoutIssueCode, LayoutReport } from '../../../shared/layout.js'
import type { WorkflowKey, WorkflowTranslate } from '../../locales/index.js'

const reasonKeys: Record<LayoutIssueCode, WorkflowKey> = {
  invalidLayout: 'layoutInvalidLayout', invalidDirection: 'layoutInvalidDirection', invalidSegments: 'layoutInvalidSegments',
  invalidSegment: 'layoutInvalidSegment', unknownStart: 'layoutUnknownStart', duplicateStart: 'layoutDuplicateStart',
  emptyDefault: 'layoutEmptyDefault', unorderedStart: 'layoutUnorderedStart', unsafeStart: 'layoutUnsafeStart',
}
const fixKeys: Record<LayoutIssueCode, WorkflowKey> = {
  invalidLayout: 'layoutFixObject', invalidDirection: 'layoutFixDirection', invalidSegments: 'layoutFixArray',
  invalidSegment: 'layoutFixSegment', unknownStart: 'layoutFixStart', duplicateStart: 'layoutFixDuplicate',
  emptyDefault: 'layoutFixEmpty', unorderedStart: 'layoutFixOrder', unsafeStart: 'layoutFixUnsafe',
}

export function LayoutNotices({ report, t, surface }: { report?: LayoutReport; t: WorkflowTranslate; surface: 'create' | 'instance' }) {
  const [expanded, setExpanded] = useState({ info: false, warn: false })
  if (!report?.layers.length) return null
  const applied = report.layers.filter(layer => !layer.issues.length)
  const warnings = report.issues
  return <div className="dsh-workflow-layout-notices">
    {applied.length > 0 && <section className="dsh-workflow-layout-notice" data-level="info" role="status">
      <div className="dsh-workflow-layout-line"><strong>INFO</strong><span>{t('layoutApplied')} ({applied.length})</span><button type="button" aria-expanded={expanded.info} onClick={() => setExpanded(value => ({ ...value, info: !value.info }))}>{t(expanded.info ? 'layoutHideDetails' : 'layoutShowDetails')}</button></div>
      {expanded.info && <div className="dsh-workflow-layout-details">{applied.map(layer => <p key={layer.path.join('/')}><code>{layer.path.join(' / ')}</code> · {t(layer.direction === 'vertical' ? 'layoutVertical' : 'layoutHorizontal')}{layer.starts.map(start => <span key={start.startAt}> → <code>start_at: {start.startAt}</code> · {t(start.direction === 'vertical' ? 'layoutVertical' : 'layoutHorizontal')}</span>)}</p>)}</div>}
    </section>}
    {warnings.length > 0 && <section className="dsh-workflow-layout-notice" data-level="warn" role="alert">
      <div className="dsh-workflow-layout-line"><strong>WARN ({warnings.length})</strong><span>{t('layoutWarnings')}; {t(surface === 'create' ? 'layoutCanCreate' : 'layoutCanExecute')}</span><button type="button" aria-expanded={expanded.warn} onClick={() => setExpanded(value => ({ ...value, warn: !value.warn }))}>{t(expanded.warn ? 'layoutHideDetails' : 'layoutShowDetails')}</button></div>
      {expanded.warn && <div className="dsh-workflow-layout-details">{warnings.map((issue, index) => <p key={`${issue.path.join('/')}:${index}`}><code>{issue.path.join(' / ')}</code> · <code>{issue.segmentIndex === undefined ? 'layout' : `layout.segments[${issue.segmentIndex}]`}</code>{issue.startAt && <> · <code>start_at: {issue.startAt}</code></>}<br />{t(reasonKeys[issue.code])}<br /><small>{t('layoutSuggestion')}: {issue.suggestion ? `${t('layoutMoveTo')} ${issue.suggestion}` : t(fixKeys[issue.code])}. {t('layoutFallback')}</small></p>)}</div>}
    </section>}
  </div>
}
