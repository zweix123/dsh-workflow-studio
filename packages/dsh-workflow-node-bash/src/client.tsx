import type {} from '@deepseek-ai/dsh-client-locale/client'
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { en, zh } from './locales.js'
import type { ClientNode } from 'dsh-workflow-node/ui'

export const bashClient: ClientNode = {
  kind: 'bash',
  Panel: ({ execution, t }) => <>
    {execution?.status === 'unknown' && <p>{t('resultUnknown')}</p>}
    {execution?.stdout && <><strong>{t('commandOutput')}</strong><pre>{String(execution.stdout)}</pre></>}
    {execution?.stderr && <><strong>{t('commandError')}</strong><pre>{String(execution.stderr)}</pre></>}
  </>,

}

export const name = '@dsh-workflow/node-bash'
export const inject = ['workflowNodeViews', 'locale']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(name, { en, zh }))
  ctx.workflowNodeViews.register(ctx, name, bashClient)
}
