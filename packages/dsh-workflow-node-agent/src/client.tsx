import { ConversationInstanceAction } from './ConversationInstanceAction.js'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import React from 'react'
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
  </section>
}

type Address = NonNullable<NonNullable<AgentState['attempts']>[number]['address']>
function AgentRecord({ record, t, openRecord }: { record: import('dsh-workflow-node/contract').NodeRunRecord; t: (key: string) => string; openRecord?: (address: Address) => void }) {
  const address = record.data?.address as Address | undefined
  const [error, setError] = React.useState<string>()
  const navigate = () => {
    try { if (address) openRecord?.(address); setError(undefined) }
    catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }
  return <>
    <strong>{t('actualPrompt')}</strong><pre>{String(record.data?.prompt ?? '')}</pre>
    {record.data?.result !== undefined && record.output === undefined && <pre>{JSON.stringify(record.data.result, null, 2)}</pre>}
    {address && openRecord ? <button type="button" className="dsh-workflow-button" onClick={navigate}>{t('key' in record.operation && record.operation.key === 'extractResult' ? 'openHandoffRecord' : 'openRecord')}</button> : <p>{t('recordUnavailable')}</p>}
    {error && <p role="alert">{error}</p>}
  </>
}
export const agentClient: ClientNode = { kind: 'agent', Panel: AgentPanel, Record: AgentRecord, handlers: { 'open-session': () => {} } }

export const name = '@dsh-workflow/node-agent'
export const inject = ['workflowNodeViews', 'workflowNavigation', 'locale', 'slots', 'uiWorkspace', 'layout']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  const openRecord = (address: Address) => ctx.uiWorkspace.openSession({ parentSessionId: address.parentSessionId as SessionId, childSessionId: address.childSessionId as SessionId, mode: address.mode })
  const node: ClientNode = {
    ...agentClient,
    handlers: { 'open-session': props => {
      if (typeof props.execution?.sessionId === 'string' && props.execution.sessionCreated === true) ctx.uiWorkspace.openSession(props.execution.sessionId as SessionId)
    }, records: props => {
      const address = (props.execution as NodeViewProps['execution'] & AgentState)?.attempts?.at(-1)?.address
      if (address) openRecord(address)
    } },
    Record: props => <AgentRecord {...props} openRecord={openRecord} />,
  }
  ctx.workflowNodeViews.register(ctx, name, node)
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-workflow-studio', locale: name, order: 10 }, props => <ConversationInstanceAction key={String(props.sessionId)} sessionId={String(props.sessionId)} t={props.t} client={ctx.workflowNavigation} layout={ctx.layout} />))
}
