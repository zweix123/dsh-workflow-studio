import { ConversationInstanceAction } from './ConversationInstanceAction.js'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import React from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en, zh } from './locales.js'
import type { ClientNode, NodeViewProps, NodeDetailsProps } from 'dsh-workflow-node/ui'
import type { AgentState } from './types.js'

function AgentPanel({ execution, t }: NodeDetailsProps) {
  const business = execution as (NodeViewProps['execution'] & AgentState)
  if (!business?.attempts?.length && business?.pendingOutput === undefined) return null
  return <section aria-label={t('agentProgress')}>
    {business?.pendingOutput !== undefined && <section aria-label={t('pendingResult')}><h4>{t('pendingResult')}</h4><p role="status">{t('awaitingConfirmation')}</p><pre>{JSON.stringify(business.pendingOutput, null, 2)}</pre></section>}
    {business?.attempts?.length ? <section aria-label={t('attempts')}><h4>{t('attempts')}</h4><ol>{business.attempts.map((attempt, index) => <li key={attempt.id}>
      <p>{t(`attempt${attempt.status[0]!.toUpperCase()}${attempt.status.slice(1)}`)} {index + 1}</p>
      {attempt.error && attempt.error !== execution?.error && <p role="alert">{attempt.error}</p>}
      {attempt.output !== undefined && <pre>{JSON.stringify(attempt.output, null, 2)}</pre>}
    </li>)}</ol></section> : null}
  </section>
}

type Address = NonNullable<NonNullable<AgentState['attempts']>[number]['address']>
function AgentRecords({ execution, t, request, active, reportError, error, openRecord }: NodeViewProps & { openRecord: (address: Address) => void }) {
  const records = ((execution as NodeViewProps['execution'] & AgentState)?.attempts ?? []).map((attempt, index) => ({ ...attempt, number: index + 1 })).filter(attempt => Boolean(attempt.address?.parentSessionId && attempt.address.childSessionId)).reverse()
  const [open, setOpen] = React.useState(false)
  const handled = React.useRef<number>()
  const navigate = (address: Address) => {
    try { openRecord(address); setOpen(false) }
    catch (failure) { reportError(failure) }
  }
  React.useEffect(() => {
    if (!request || handled.current === request.sequence) return
    handled.current = request.sequence
    if (records.length === 1) navigate(records[0]!.address!)
    else if (records.length > 1) setOpen(true)
  }, [request, records, openRecord, reportError])
  return <Modal open={open && active} title={t('attempts')} closeLabel={t('closeRecords')} onClose={() => setOpen(false)}><>{error && <p role="alert">{error}</p>}<ol>{records.map(attempt => <li key={attempt.id}><button type="button" onClick={() => navigate(attempt.address!)}>{t('openRecord')} {attempt.number} · {t(`attempt${attempt.status[0]!.toUpperCase()}${attempt.status.slice(1)}`)}</button></li>)}</ol></></Modal>
}
export const agentClient: ClientNode = { kind: 'agent', Panel: AgentPanel, handlers: { openSession: () => {} } }

export const name = '@dsh-workflow/node-agent'
export const inject = ['workflowNodeViews', 'workflowNavigation', 'locale', 'slots', 'uiWorkspace', 'layout']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  const node: ClientNode = {
    ...agentClient,
    handlers: { openSession: props => {
      if (typeof props.execution?.sessionId === 'string' && props.execution.sessionCreated === true) ctx.uiWorkspace.openSession(props.execution.sessionId as SessionId)
    } },
    interactions: { records: props => <AgentRecords {...props} openRecord={address => ctx.uiWorkspace.openSession({ parentSessionId: address.parentSessionId as SessionId, childSessionId: address.childSessionId as SessionId, mode: address.mode })} /> },
  }
  ctx.workflowNodeViews.register(ctx, name, node)
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-workflow-studio', locale: name, order: 10 }, props => <ConversationInstanceAction key={String(props.sessionId)} sessionId={String(props.sessionId)} t={props.t} client={ctx.workflowNavigation} layout={ctx.layout} />))
}
