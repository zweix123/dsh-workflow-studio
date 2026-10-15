import type { ComponentType } from 'react'
import type { NodeRunRecord } from 'dsh-workflow-node/contract'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { DetailFields } from '../DefinitionDetails.js'
import { NodeBoundary } from '../../../nodes.js'

export function RunRecords({ records, text, t, Record, nodeTranslate }: {
  records: NodeRunRecord[]; text: (text: NodeRunRecord['operation']) => string; t: WorkflowTranslate
  Record?: ComponentType<{ record: NodeRunRecord; t: (key: string) => string }>; nodeTranslate?: (key: string) => string
}) {
  return <section className="dsh-workflow-records" aria-label={t('runRecords')}>
    <h4>{t('runRecords')}</h4>
    {!records.length ? <p>{t('noRunRecords')}</p> : <div key={records.at(-1)!.id}>{[...records].reverse().map((record, index) => <details key={record.id} open={index === 0}>
      <summary><span>#{records.length - index} · {text(record.operation)} · {t(`record${record.status}`)}</span><time dateTime={record.startedAt}>{new Date(record.startedAt).toLocaleString()}</time>{record.error && <span className="dsh-workflow-record-error">{record.error.split('\n')[0]}</span>}</summary>
      <DetailFields fields={[
        [t('nodeInput'), record.input], ...(record.output === undefined ? [] : [[t('nodeOutput'), record.output] as [string, unknown]]),
        ...(record.finishedAt ? [[t('recordFinishedAt'), new Date(record.finishedAt).toLocaleString()] as [string, unknown]] : []),
      ]} />
      {record.error && <pre role="alert">{record.error}</pre>}
      {Record ? <NodeBoundary message={t('nodeViewFailed')}><Record record={record} t={nodeTranslate ?? (key => key)} /></NodeBoundary> : record.data && <pre>{JSON.stringify(record.data, null, 2)}</pre>}
    </details>)}</div>}
  </section>
}
