import { useEffect, useRef, useState } from 'react'
import type { InstanceDetail } from '../../../../shared/types/workflow-instance.js'
import { executeNode, WorkflowInstanceApiError } from '../../../apis/workflow-instances.js'
import type { WorkflowTranslate } from '../../../locales/index.js'
import { buildPositionNodeId } from './build-canvas-graph.js'
import { DagCanvas, statusKeys } from './DagCanvas.js'

export function InstanceRunPanel({ detail, t, onUpdate }: { detail: InstanceDetail; t: WorkflowTranslate; onUpdate: (detail: InstanceDetail) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<string>()
  const [error, setError] = useState<string>()
  const busy = useRef(false)
  const item = detail.snapshot.instances.find(row => row.instanceId === selected)
  const position = [...detail.snapshot.waitingPositions.map(row => ({ ...row, status: 'waiting' as const })),
    ...detail.snapshot.skippedPositions.map(row => ({ ...row, status: 'skipped' as const }))]
    .find(row => buildPositionNodeId(row, row.status) === selected)
  const inspection = item ?? position

  useEffect(() => { if (selected && !inspection) setSelected(null) }, [selected, inspection])

  async function run(nodeId: string) {
    if (busy.current) return
    busy.current = true
    setPending(nodeId)
    setError(undefined)
    try {
      onUpdate(await executeNode(detail.id, nodeId))
    } catch (failure) {
      if (failure instanceof WorkflowInstanceApiError) {
        if (failure.latest) onUpdate(failure.latest)
        const key = failure.code === 'node-not-ready' ? 'nodeNotReady' : failure.code === 'submission-failed' ? 'submissionFailed' : 'requestFailed'
        setError(`${t(key)} ${failure.message}`)
      } else setError(t('requestFailed'))
    } finally {
      busy.current = false
      setPending(undefined)
    }
  }

  const statusKey = statusKeys[inspection?.status ?? 'waiting']
  return <section className="dsh-workflow-detail" aria-label={detail.name}>
    <header className="dsh-workflow-detail-header"><div><h2>{detail.name}</h2><p>{detail.templateId}</p></div></header>
    {error && <p className="dsh-workflow-run-error" role="alert">{error}</p>}
    <div className="dsh-workflow-run">
      <DagCanvas detail={detail} t={t} onExecute={id => void run(id)} onInspect={setSelected} pending={pending} />
      {inspection && <aside className="dsh-workflow-inspector" aria-label={`${t('nodeDetails')} ${inspection.definitionId}`}>
        <header><div><h3>{inspection.definitionId}</h3><p>{t(statusKey)}</p></div><button type="button" aria-label={t('closeNodeDetails')} onClick={() => setSelected(null)}>×</button></header>
        <div className="dsh-workflow-inspector-body" />
      </aside>}
    </div>
  </section>
}
