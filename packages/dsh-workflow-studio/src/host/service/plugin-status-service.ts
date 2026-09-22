import { PLUGIN_NAME } from '../../shared/constants.js'
import type { PluginStatus } from '../../shared/types/plugin-status.js'

export class PluginStatusService {
  constructor(private readonly version: string) {}

  getStatus(): PluginStatus {
    return {
      plugin: PLUGIN_NAME,
      version: this.version,
      status: 'ready',
      serverTime: new Date().toISOString(),
    }
  }
}
