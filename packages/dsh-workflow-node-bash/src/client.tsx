import type {} from '@deepseek-ai/dsh-client-locale/client'
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { en, zh } from './locales.js'
import type { ClientNode } from 'dsh-workflow-node/ui'

export const bashClient: ClientNode = {
  kind: 'bash',
  Panel: ({ definition, execution, t }) => <>
    <strong>{t('command')}</strong><pre>{typeof definition.command === 'string' ? definition.command : ''}</pre>
    {execution?.status === 'running' && <p role="status">{t('executing')}</p>}
    {execution?.status === 'unknown' && <p role="alert">{t('resultUnknown')}</p>}
    {execution?.stdout && <><strong>{t('commandOutput')}</strong><pre>{String(execution.stdout)}</pre></>}
    {execution?.stderr && <><strong>{t('commandError')}</strong><pre>{String(execution.stderr)}</pre></>}
    {execution?.error && <p role="alert">{execution.error}</p>}
  </>,
}

export const name = '@dsh-workflow/node-bash'
export const inject = ['workflowNodeViews', 'locale']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  ctx.workflowNodeViews.register(ctx, name, bashClient)
}
