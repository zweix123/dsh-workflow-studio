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

export function LayoutNotices({ report, t, surface }: { report?: LayoutReport; t: WorkflowTranslate; surface: 'create' | 'instance' | 'template' }) {
  const [expanded, setExpanded] = useState(false)
  const warnings = report?.issues
  if (!warnings?.length) return null
  return <div className="dsh-workflow-layout-notices">
    <section className="dsh-workflow-layout-notice" data-level="warn" role="alert">
      <div className="dsh-workflow-layout-line"><strong>WARN ({warnings.length})</strong><span>{t('layoutWarnings')}; {t(surface === 'create' ? 'layoutCanCreate' : surface === 'template' ? 'layoutCanOpen' : 'layoutCanExecute')}</span><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'layoutHideDetails' : 'layoutShowDetails')}</button></div>
      {expanded && <div className="dsh-workflow-layout-details">{warnings.map((issue, index) => <p key={`${issue.path.join('/')}:${index}`}><code>{issue.path.join(' / ')}</code> · <code>{issue.segmentIndex === undefined ? 'layout' : `layout.segments[${issue.segmentIndex}]`}</code>{issue.startAt && <> · <code>start_at: {issue.startAt}</code></>}<br />{t(reasonKeys[issue.code])}<br /><small>{t('layoutSuggestion')}: {issue.suggestion ? `${t('layoutMoveTo')} ${issue.suggestion}` : t(fixKeys[issue.code])}. {t('layoutFallback')}</small></p>)}</div>}
    </section>
  </div>
}
