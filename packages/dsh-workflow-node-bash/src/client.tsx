import React from 'react'
import type { ClientNode } from '../../dsh-workflow-studio/src/contract/node/client.js'

export const bashClient: ClientNode = {
  kind: 'bash',
  Card: ({ ready, pending, execution, action, t, label }) => ready && execution?.status !== 'running'
    ? <button type="button" className="nodrag nopan" aria-label={`${t('executeNode')} ${label}`} disabled={pending} onClick={event => { event.stopPropagation(); action('start', {}) }}>▶ {t('executeNode')}</button> : null,
  Panel: ({ definition, execution, t }) => <>
    <strong>{t('command')}</strong><pre>{typeof definition.command === 'string' ? definition.command : ''}</pre>
    {execution?.status === 'running' && <p role="status">{t('executing')}</p>}
    {execution?.status === 'unknown' && <p role="alert">{t('resultUnknown')}</p>}
    {execution?.stdout && <><strong>{t('commandOutput')}</strong><pre>{String(execution.stdout)}</pre></>}
    {execution?.stderr && <><strong>{t('commandError')}</strong><pre>{String(execution.stderr)}</pre></>}
    {execution?.error && <p role="alert">{execution.error}</p>}
  </>,
}
