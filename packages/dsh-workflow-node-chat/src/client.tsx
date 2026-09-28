import React from 'react'
import type { ClientNode } from '../../dsh-workflow-studio/src/contract/node/client.js'

export const chatClient: ClientNode = {
  kind: 'chat',
  Card: ({ ready, pending, execution, action, t, label }) => ready && execution?.status !== 'waiting' && execution?.status !== 'succeeded' && execution?.status !== 'running'
    ? <button type="button" className="nodrag nopan" aria-label={`${t('executeNode')} ${label}`} disabled={pending} onClick={event => { event.stopPropagation(); action('start', {}) }}>▶ {t('executeNode')}</button> : null,
  Panel: ({ ready, pending, execution, action, openSession, t }) => <>
    {execution?.sessionId && execution.sessionCreated && <button type="button" onClick={() => openSession(String(execution.sessionId))}>{t('openChat')}</button>}
    {ready && execution?.sessionCreated && <button type="button" disabled={pending} onClick={() => action('complete', {})}>{t('completeChat')}</button>}
    {execution?.error && <p role="alert">{execution.error}</p>}
  </>,
}
