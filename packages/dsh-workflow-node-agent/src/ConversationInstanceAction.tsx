import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { InstanceNavigationTarget } from './association.js'
import type { NodeNavigation } from 'dsh-workflow-node/ui'
import { getConversationInstance } from './association.js'
import { en } from './locales.js'
type WorkflowTranslate = (key: keyof typeof en) => string
const PANEL_ID = 'dsh-workflow-studio'

type Props = { sessionId: string; t: WorkflowTranslate; client: NodeNavigation; layout: Pick<ILayout, 'beginNavigation' | 'selectPanel'> }
const css = `
.dsh-workflow-return { position:relative; display:flex; align-items:center; min-width:0; }
.dsh-workflow-return button { min-height:28px; padding:3px 5px; border:0; border-radius:var(--dsw-radius-sm); background:transparent; color:var(--dsw-alias-label-tertiary); font:inherit; font-size:12px; line-height:18px; cursor:pointer; white-space:nowrap; }
.dsh-workflow-return button:hover { color:var(--dsw-alias-label-secondary); }
.dsh-workflow-return button:focus-visible { outline:2px solid var(--dsw-alias-label-primary); outline-offset:2px; }
.dsh-workflow-return button:disabled { cursor:wait; opacity:.6; }
.dsh-workflow-return-error { position:absolute; top:100%; left:0; z-index:100; box-sizing:border-box; padding:8px; width:240px; max-width:calc(100vw - 32px); background:var(--dsw-specific-menu); color:var(--dsw-alias-label-primary); border-radius:var(--dsw-radius-sm); box-shadow:var(--dsw-elevation-prominent); font-size:12px; }
`

export function ConversationInstanceAction({ sessionId, t, client, layout }: Props) {
  const [result, setResult] = useState<{ sessionId: string; target?: InstanceNavigationTarget | null; error?: 'navigationInstanceMissing' | 'navigationFailed' }>({ sessionId })
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const lifetime = useRef<AbortController>()
  const busy = useRef(false)
  const attempt = useRef<AbortController>()
  const feedback = useRef<HTMLDivElement>(null)
  const current = result.sessionId === sessionId ? result : { sessionId }
  useLayoutEffect(() => {
    const element = feedback.current
    if (!element) return
    const boundary = element.closest('header') ?? document.documentElement
    const position = () => {
      const bounds = boundary.getBoundingClientRect()
      element.style.maxWidth = `${Math.max(0, bounds.width - 16)}px`
      const anchor = element.parentElement!.getBoundingClientRect()
      const width = element.getBoundingClientRect().width
      const left = Math.max(bounds.left + 8, Math.min(anchor.left + (anchor.width - width) / 2, bounds.right - width - 8))
      element.style.left = `${left - anchor.left}px`
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(boundary)
    observer.observe(element.parentElement!)
    observer.observe(element)
    return () => observer.disconnect()
  })
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    busy.current = false
    setLoading(false)
    setResult({ sessionId })
    void getConversationInstance(sessionId).then(value => {
      if (!controller.signal.aborted) setResult({ sessionId, target: value.target })
    }, () => { if (!controller.signal.aborted) setResult({ sessionId, error: 'navigationFailed' }) })
    return () => controller.abort()
  }, [sessionId, retry])

  async function back() {
    if (busy.current || !current.target || !lifetime.current) return
    busy.current = true
    setLoading(true)
    const life = lifetime.current
    const controller = new AbortController()
    attempt.current = controller
    const signal = layout.beginNavigation()
    // Session changes and later host navigation both invalidate this attempt.
    const release = () => {
      if (!life.signal.aborted && attempt.current === controller) {
        attempt.current = undefined
        busy.current = false
        setLoading(false)
      }
    }
    const abort = () => { controller.abort(); release() }
    life.signal.addEventListener('abort', abort, { once: true })
    signal.addEventListener('abort', abort, { once: true })
    try {
      const { target } = await getConversationInstance(sessionId)
      if (controller.signal.aborted) return
      if (!target) { client.remove(current.target.instanceId); setResult({ sessionId, target: current.target, error: 'navigationInstanceMissing' }); return }
      const returned = await client.open(target, controller.signal)
      if (returned && !controller.signal.aborted && !signal.aborted) layout.selectPanel(PANEL_ID as Parameters<ILayout['selectPanel']>[0])
    } catch (error) {
      if (!controller.signal.aborted) setResult({ sessionId, target: current.target, error: error instanceof Error && 'code' in error && error.code === 'instance-missing' ? 'navigationInstanceMissing' : 'navigationFailed' })
    } finally {
      signal.removeEventListener('abort', abort)
      life.signal.removeEventListener('abort', abort)
      release()
    }
  }
  if (current.target === null && !current.error) return null
  return <div className="dsh-workflow-return"><style>{css}</style>
    {!current.error && <button type="button" disabled={!current.target || loading} aria-busy={!current.target || loading} onClick={() => void back()}>{t(loading ? 'returningToInstance' : current.target ? 'returnToInstance' : 'findingInstance')}</button>}
    {current.error && <><button type="button" onClick={() => current.target && current.error !== 'navigationInstanceMissing' ? void back() : setRetry(value => value + 1)} disabled={loading}>{t(loading ? 'returningToInstance' : 'retryNavigation')}</button><div ref={feedback} className="dsh-workflow-return-error" role="alert">{t(current.error)}</div></>}
  </div>
}
