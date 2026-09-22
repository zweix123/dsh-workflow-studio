import { PLUGIN_NAME, STATUS_PATH } from '../../shared/constants.js'
import type { PluginStatus } from '../../shared/types/plugin-status.js'

export async function getPluginStatus(signal?: AbortSignal): Promise<PluginStatus> {
  const response = await fetch(STATUS_PATH, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object'
    || !('plugin' in data) || data.plugin !== PLUGIN_NAME
    || !('status' in data) || data.status !== 'ready'
    || !('version' in data) || typeof data.version !== 'string'
    || !('serverTime' in data) || typeof data.serverTime !== 'string'
    || Number.isNaN(Date.parse(data.serverTime))) {
    throw new Error('Unexpected plugin status response')
  }
  return data as PluginStatus
}
