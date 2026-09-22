import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { STATUS_PATH } from '../../shared/constants.js'
import type { PluginStatusService } from '../service/plugin-status-service.js'

export function createPluginStatusRoute(service: PluginStatusService): WebRoute {
  return {
    kind: 'exact',
    path: STATUS_PATH,
    handler(req, res) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      res.end(JSON.stringify(service.getStatus()))
    },
  }
}
