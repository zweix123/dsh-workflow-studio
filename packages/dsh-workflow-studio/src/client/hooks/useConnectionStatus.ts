import { useEffect, useRef, useState } from 'react'
import type { PluginStatus } from '../../shared/types/plugin-status.js'

export type LoadStatus = (signal: AbortSignal) => Promise<PluginStatus>
type State = { phase: 'idle' | 'loading' | 'error' } | { phase: 'ready'; data: PluginStatus }

export function useConnectionStatus(load: LoadStatus) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])

  const check = async () => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setState({ phase: 'loading' })
    const timeout = setTimeout(() => {
      if (controller.signal.aborted) return
      controller.abort()
      setState({ phase: 'error' })
    }, 10_000)
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true })
    try {
      const data = await load(controller.signal)
      if (!controller.signal.aborted) setState({ phase: 'ready', data })
    } catch {
      if (!controller.signal.aborted) setState({ phase: 'error' })
    } finally {
      clearTimeout(timeout)
    }
  }
  return { state, check }
}
