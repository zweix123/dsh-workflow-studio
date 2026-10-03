import type { ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { API_PREFIX, CONVERSATIONS_PATH, INSTANCES_PATH, TEMPLATES_PATH } from '../../shared/constants.js'
import { WorkflowInstanceError, type WorkflowInstanceService } from '../service/workflow-instance-service.js'

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

async function body(request: AsyncIterable<unknown>): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > 64 * 1024) throw new WorkflowInstanceError('invalid-request', 'Request body is too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new WorkflowInstanceError('invalid-request', 'Request body must be valid JSON')
  }
}

export function createWorkflowInstancesRoute(service: WorkflowInstanceService): WebRoute {
  return {
    kind: 'prefix',
    path: API_PREFIX,
    async handler(request, response) {
      try {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        const conversation = path.match(new RegExp(`^${CONVERSATIONS_PATH}/([^/]+)/instance$`))
        if (conversation) {
          if (request.method !== 'GET') return json(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } })
          let sessionId: string
          try { sessionId = decodeURIComponent(conversation[1]!) }
          catch { throw new WorkflowInstanceError('invalid-request', 'Invalid conversation ID') }
          return json(response, 200, service.findConversationInstance(sessionId))
        }
        if (path === TEMPLATES_PATH) {
          if (request.method !== 'GET') return json(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } })
          return json(response, 200, await service.listTemplates())
        }
        if (path.startsWith(`${TEMPLATES_PATH}/`)) {
          if (request.method !== 'GET') return json(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } })
          let id: string
          try { id = decodeURIComponent(path.slice(TEMPLATES_PATH.length + 1)) }
          catch { throw new WorkflowInstanceError('invalid-request', 'Invalid template ID') }
          return json(response, 200, await service.getTemplate(id))
        }
        if (path === INSTANCES_PATH) {
          if (request.method === 'GET') return json(response, 200, service.listInstances())
          if (request.method === 'POST') return json(response, 201, await service.createInstance(await body(request)))
          return json(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } })
        }
        if (path.startsWith(`${INSTANCES_PATH}/`)) {
          const drawer = path.match(new RegExp(`^${INSTANCES_PATH}/([^/]+)/drawer-width$`))
          if (drawer) {
            if (request.method !== 'POST') return json(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } })
            return json(response, 200, await service.setDrawerWidth(decodeURIComponent(drawer[1]!), await body(request)))
          }
          const action = path.match(new RegExp(`^${INSTANCES_PATH}/([^/]+)/nodes/([^/]+)/actions/([^/]+)$`))
          if (action) {
            if (request.method !== 'POST') return json(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } })
            return json(response, 200, await service.actionNode(decodeURIComponent(action[1]!), decodeURIComponent(action[2]!), decodeURIComponent(action[3]!), await body(request)))
          }
          const id = decodeURIComponent(path.slice(INSTANCES_PATH.length + 1))
          if (request.method === 'GET') return json(response, 200, service.getInstance(id))
          if (request.method === 'DELETE') {
            await service.deleteInstance(id)
            return json(response, 200, {})
          }
          return json(response, 405, { error: { code: 'method-not-allowed', message: 'Method not allowed' } })
        }
        json(response, 404, { error: { code: 'not-found', message: 'Not found' } })
      } catch (error) {
        if (error instanceof WorkflowInstanceError) return json(response, error.status, { error: { code: error.code, message: error.message }, ...(error.latest && { latest: error.latest }) })
        json(response, 500, { error: { code: 'internal-error', message: 'Internal server error' } })
      }
    },
  }
}
