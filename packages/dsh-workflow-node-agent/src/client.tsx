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
import type { ClientNode, NodeViewProps } from 'dsh-workflow-node/ui'
import type { AgentState } from './types.js'

function AgentPanel({ execution, t, openRecord }: NodeViewProps & { openRecord: (address: NonNullable<NonNullable<AgentState['attempts']>[number]['address']>) => void }) {
  const business = execution as (NodeViewProps['execution'] & AgentState)
  return <section aria-label={t('agentProgress')}>
    {execution?.error && <p role="alert">{execution.error}</p>}
    {business?.pendingOutput !== undefined && <section aria-label={t('pendingResult')}><p role="status">{t('awaitingConfirmation')}</p><pre>{JSON.stringify(business.pendingOutput, null, 2)}</pre></section>}
    {business?.attempts?.length ? <section aria-label={t('attempts')}><h4>{t('attempts')}</h4><ol>{business.attempts.map((attempt, index) => <li key={attempt.id}>
      <p>{t(`attempt${attempt.status[0]!.toUpperCase()}${attempt.status.slice(1)}`)} {index + 1}</p>
      {attempt.address && <button type="button" className="dsh-workflow-button" onClick={() => openRecord(attempt.address!)}>{t('openRecord')} {index + 1}</button>}
      {attempt.error && <p role="alert">{attempt.error}</p>}
      {attempt.output !== undefined && <pre>{JSON.stringify(attempt.output, null, 2)}</pre>}
    </li>)}</ol></section> : null}
  </section>
}

export const agentClient: ClientNode = { kind: 'agent', handlers: { openSession: () => {} } }

export const name = '@dsh-workflow/node-agent'
export const inject = ['workflowNodeViews', 'workflowNavigation', 'locale', 'slots', 'uiWorkspace', 'layout']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  const node: ClientNode = {
    ...agentClient,
    handlers: { openSession: props => {
      if (typeof props.execution?.sessionId === 'string' && props.execution.sessionCreated === true) ctx.uiWorkspace.openSession(props.execution.sessionId as SessionId)
    } },
    Panel: props => <AgentPanel {...props} openRecord={address => ctx.uiWorkspace.openSession({ parentSessionId: address.parentSessionId as SessionId, childSessionId: address.childSessionId as SessionId, mode: address.mode })} />,
  }
  ctx.workflowNodeViews.register(ctx, name, node)
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-workflow-studio', locale: name, order: 10 }, props => <ConversationInstanceAction key={String(props.sessionId)} sessionId={String(props.sessionId)} t={props.t} client={ctx.workflowNavigation} layout={ctx.layout} />))
}
