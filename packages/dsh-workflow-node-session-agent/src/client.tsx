import { ConversationInstanceAction } from './ConversationInstanceAction.js'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { en, zh } from './locales.js'
import type { ClientNode } from 'dsh-workflow-node/ui'

export const sessionAgentClient: ClientNode = {
  kind: 'session_agent',
  handlers: { openSession: () => {} },
  Panel: ({ execution }) => execution?.error ? <p role="alert">{execution.error}</p> : null,
}

export const name = '@dsh-workflow/node-session-agent'
export const inject = ['workflowNodeViews', 'workflowNavigation', 'locale', 'slots', 'uiWorkspace', 'layout']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  ctx.workflowNodeViews.register(ctx, name, { ...sessionAgentClient, handlers: { openSession: props => {
    if (typeof props.execution?.sessionId === 'string' && props.execution.sessionCreated === true) ctx.uiWorkspace.openSession(props.execution.sessionId as Parameters<typeof ctx.uiWorkspace.openSession>[0])
  } } })
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-workflow-studio', locale: name, order: 10 }, props => <ConversationInstanceAction key={String(props.sessionId)} sessionId={String(props.sessionId)} t={props.t} client={ctx.workflowNavigation} layout={ctx.layout} />))
}
