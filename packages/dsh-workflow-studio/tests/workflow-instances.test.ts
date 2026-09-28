import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import { WorkflowInstanceService, workflowInstanceDomain } from '../src/host/service/workflow-instance-service.js'
import { compile, type SavedExecution } from '../src/host/dag/index.js'
import { createWorkflowInstancesRoute } from '../src/host/routes/workflow-instances.js'
import { INSTANCES_PATH, TEMPLATES_PATH } from '../src/shared/constants.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function fixture(services: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workflow-studio-'))
  const templateRoot = join(root, 'home', 'dsh-workflow-studio', 'templates')
  const storageRoot = join(root, 'storage')
  await mkdir(templateRoot, { recursive: true })
  const host = await openHost(storageRoot, templateRoot, root, services)
  cleanups.push(async () => {
    await host.close()
    await rm(root, { recursive: true, force: true })
  })
  return {
    root,
    storageRoot,
    templateRoot,
    close: host.close,
    url: host.url,
  }
}

async function openHost(storageRoot: string, templateRoot: string, workspacePath: string, services: Record<string, unknown> = {}) {
  const ctx = new Context()
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: storageRoot })
  await ctx.plugin(storageDomain, { backend: 'json' })
  ctx.provide('workspaceRegistry', {
    get: (id: string) => id === 'workspace-a' ? { id, path: workspacePath, title: 'Workspace A' } : undefined,
  } as never)
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/fallback' }) } as never)
  for (const [name, service] of Object.entries(services)) ctx.provide(name as never, service as never)
  const service = await WorkflowInstanceService.create(ctx, templateRoot)
  const unregister = ctx.webServer.register(createWorkflowInstancesRoute(service))
  let active = true
  const close = async () => {
    if (!active) return
    active = false
    unregister()
    await service.close()
    await ctx.fiber.dispose()
  }
  return {
    close,
    url: (path: string) => `http://127.0.0.1:${ctx.webServer.port}${path}`,
  }
}

async function putTemplate(root: string, id: string, yaml: string) {
  const directory = join(root, id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'workflow.yaml'), yaml)
}

async function postJson(url: string, value: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
}

async function untilDetail(url: string, check: (detail: any) => boolean): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const detail = await (await fetch(url)).json()
    if (check(detail)) return detail
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for workflow detail')
}

const validTemplate = `
id: root
type: dag
input_schema:
  topic: string
  count: number
  enabled: boolean
  config:
    type: object
    properties:
      label: string
      nested:
        type: object
        properties:
          limit: number
  items:
    type: array
    items: string
dag:
  - id: draft
    type: node
    node_kind: bash
    command: ""
    input_schema:
      topic: string
    output_schema:
      result: string
  - id: finish
    type: node
    node_kind: bash
    command: ""
    input_schema:
      result: string
  - type: edge
    from: draft
    to: finish
`

test('bash executes through the host sandbox and only a successful outcome advances the graph', async () => {
  const calls: Array<{ command: string; workdir: string; sandboxPolicy: { workspaceRoot: string } }> = []
  let exitCode = 7
  let sandboxMode: 'workspace-write' | undefined = 'workspace-write'
  const f = await fixture({ shell: {
    get sandboxMode() { return sandboxMode },
    resolve: (request: { command: string; workdir: string; sandboxPolicy: { workspaceRoot: string } }) => request,
    execute: async (request: { command: string; workdir: string; sandboxPolicy: { workspaceRoot: string } }) => {
      calls.push(request)
      return { result: async () => ({ exitCode, signal: null, timedOut: false, aborted: false,
        stdout: { text: 'real output', truncated: false }, stderr: { text: 'failed', truncated: false },
        sandbox: { mode: 'workspace-write', denied: false } }) }
    },
  } })
  await putTemplate(f.templateRoot, 'command', `id: root\ntype: dag\ndag:\n  - id: build\n    type: node\n    node_kind: bash\n    command: 'printf hello'\n    output_schema:\n      result: string\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Command', templateId: 'command' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'build').instanceId
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/execute`), {})).status, 200)
  const failed = await untilDetail(f.url(path), detail => detail.executions?.[nodeId]?.status === 'failed')
  assert.equal(failed.snapshot.instances.find((item: any) => item.instanceId === nodeId).status, 'ready')
  assert.match(failed.executions[nodeId].error, /7/)
  exitCode = 0
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/execute`), {})).status, 200)
  const complete = await untilDetail(f.url(path), detail => detail.snapshot.instances.find((item: any) => item.instanceId === nodeId).status === 'completed')
  assert.deepEqual(complete.snapshot.instances.find((item: any) => item.instanceId === nodeId).output, { result: '' })
  assert.equal(complete.executions[nodeId].stdout, 'real output')
  assert.deepEqual(calls.map(call => call.command), ['printf hello', 'printf hello'])
  assert.deepEqual(calls.map(call => call.workdir), [f.root, f.root])
  assert.deepEqual(calls.map(call => call.sandboxPolicy.workspaceRoot), [f.root, f.root])
  sandboxMode = undefined
  const unsafe = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'No sandbox', templateId: 'command' })).json() as any
  const unsafeNode = unsafe.snapshot.instances.find((item: any) => item.definitionId === 'build').instanceId
  const unsafePath = `${INSTANCES_PATH}/${unsafe.id}`
  assert.equal((await postJson(f.url(`${unsafePath}/nodes/${unsafeNode}/execute`), {})).status, 200)
  const blocked = await untilDetail(f.url(unsafePath), detail => detail.executions?.[unsafeNode]?.status === 'failed')
  assert.match(blocked.executions[unsafeNode].error, /Sandbox execution is unavailable/)
  assert.equal(calls.length, 2)
})

test('independent automatic bash nodes run together, reject duplicate starts and deletion, and do not auto retry', async () => {
  const calls: Array<{ command: string; finish: (code: number) => void }> = []
  const f = await fixture({ shell: {
    sandboxMode: 'workspace-write',
    resolve: (request: unknown) => request,
    execute: async (request: { command: string }) => ({ result: () => new Promise(resolve => {
      calls.push({ command: request.command, finish: code => resolve({ exitCode: code, signal: null, timedOut: false, aborted: false,
        stdout: { text: request.command, truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write', denied: false } }) })
    }) }),
  } })
  await putTemplate(f.templateRoot, 'parallel', `id: root\ntype: dag\ndag:\n  - id: left\n    type: node\n    node_kind: bash\n    command: left\n    is_auto_start: true\n  - id: right\n    type: node\n    node_kind: bash\n    command: right\n    is_auto_start: true\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Parallel', templateId: 'parallel' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  await untilDetail(f.url(path), detail => Object.keys(detail.executions ?? {}).length === 2)
  assert.deepEqual(calls.map(call => call.command).sort(), ['left', 'right'])
  const leftId = created.snapshot.instances.find((item: any) => item.definitionId === 'left').instanceId
  const rightId = created.snapshot.instances.find((item: any) => item.definitionId === 'right').instanceId
  assert.equal((await postJson(f.url(`${path}/nodes/${leftId}/execute`), {})).status, 409)
  assert.equal((await fetch(f.url(path), { method: 'DELETE' })).status, 409)
  assert.equal((await postJson(f.url(`${path}/drawer-width`), { width: 460 })).status, 200)
  calls.find(call => call.command === 'left')!.finish(0)
  calls.find(call => call.command === 'right')!.finish(9)
  const settled = await untilDetail(f.url(path), detail => detail.executions?.[leftId]?.status === 'succeeded' && detail.executions?.[rightId]?.status === 'failed' && detail.snapshot.instances.find((item: any) => item.instanceId === leftId).status === 'completed')
  assert.equal(settled.snapshot.instances.find((item: any) => item.instanceId === leftId).status, 'completed')
  assert.equal(settled.snapshot.instances.find((item: any) => item.instanceId === rightId).status, 'ready')
  assert.equal(settled.drawerWidth, 460)
  assert.equal(calls.length, 2)
  assert.equal((await postJson(f.url(`${path}/nodes/${rightId}/execute`), {})).status, 200)
  await untilDetail(f.url(path), detail => detail.executions?.[rightId]?.status === 'running')
  assert.equal(calls.length, 3)
  calls[2]!.finish(0)
  await untilDetail(f.url(path), detail => detail.snapshot.instances.find((item: any) => item.instanceId === rightId).status === 'completed')
  assert.equal((await fetch(f.url(path), { method: 'DELETE' })).status, 200)
})

test('chat creates one durable conversation, sends only a nonblank prompt, and completes only on user request', async () => {
  const createdSessions: Array<{ sessionId: string; workspaceId: string }> = []
  const prompts: Array<{ sessionId: string; text: string }> = []
  const services = { sessionController: {
    create: async (request: { sessionId: string; workspaceId: string }) => { createdSessions.push(request); return { sessionId: request.sessionId } },
    prompt: async (request: { sessionId: string; content: Array<{ text: string }> }) => { prompts.push({ sessionId: request.sessionId, text: request.content[0]!.text }); return { accepted: true } },
  } }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'chat', `id: root\ntype: dag\ndag:\n  - id: first\n    type: node\n    node_kind: chat\n    prompt: 'Write a draft'\n  - id: blank\n    type: node\n    node_kind: chat\n    prompt: '   '\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Chats', templateId: 'chat' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const [first, blank] = created.snapshot.instances.filter((item: any) => item.type === 'node')
  assert.equal((await postJson(f.url(`${path}/nodes/${first.instanceId}/execute`), {})).status, 200)
  assert.equal((await postJson(f.url(`${path}/nodes/${blank.instanceId}/execute`), {})).status, 200)
  const ready = await untilDetail(f.url(path), detail => detail.executions?.[first.instanceId]?.status === 'chat' && detail.executions?.[blank.instanceId]?.status === 'chat')
  assert.equal(createdSessions.length, 2)
  assert.deepEqual(createdSessions.map(row => row.workspaceId), ['workspace-a', 'workspace-a'])
  assert.notEqual(createdSessions[0]!.sessionId, createdSessions[1]!.sessionId)
  assert.deepEqual(prompts, [{ sessionId: ready.executions[first.instanceId].sessionId, text: 'Write a draft' }])
  assert.equal(ready.snapshot.instances.find((item: any) => item.instanceId === first.instanceId).status, 'ready')
  assert.equal((await postJson(f.url(`${path}/nodes/${first.instanceId}/execute`), {})).status, 200)
  assert.equal(createdSessions.length, 2)
  assert.equal((await postJson(f.url(`${path}/nodes/${first.instanceId}/complete`), {})).status, 200)
  const completed = await (await fetch(f.url(path))).json() as any
  assert.equal(completed.snapshot.instances.find((item: any) => item.instanceId === first.instanceId).status, 'completed')
  assert.equal(completed.snapshot.instances.find((item: any) => item.instanceId === blank.instanceId).status, 'ready')
  await f.close()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(restarted.close)
  const restored = await (await fetch(restarted.url(path))).json() as any
  assert.equal(restored.executions[blank.instanceId].sessionId, ready.executions[blank.instanceId].sessionId)
  assert.equal(createdSessions.length, 2)
  assert.equal(prompts.length, 1)
  assert.equal((await fetch(restarted.url(path), { method: 'DELETE' })).status, 200)
  assert.equal(createdSessions.length, 2)
})

test('a rejected chat prompt can be resumed after restart with the same session and request identity', async () => {
  const sessions: string[] = []
  const requests: Array<{ sessionId: string; requestId: string }> = []
  let reject = true
  const services = { sessionController: {
    create: async ({ sessionId }: { sessionId: string }) => { sessions.push(sessionId) },
    prompt: async ({ sessionId, requestId }: { sessionId: string; requestId: string }) => {
      requests.push({ sessionId, requestId })
      if (reject) throw new Error('Prompt was not accepted')
      return { accepted: true }
    },
  } }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'retry-chat', `id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: chat\n    prompt: Write a draft\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Retry chat', templateId: 'retry-chat' })).json() as any
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'task').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/execute`), {})).status, 200)
  const failed = await untilDetail(f.url(path), detail => detail.executions?.[nodeId]?.status === 'failed')
  assert.match(failed.executions[nodeId].error, /not accepted/)
  assert.equal(failed.executions[nodeId].promptStarted, undefined)
  await f.close()
  reject = false
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(restarted.close)
  assert.equal((await postJson(restarted.url(`${path}/nodes/${nodeId}/execute`), {})).status, 200)
  const resumed = await untilDetail(restarted.url(path), detail => detail.executions?.[nodeId]?.status === 'chat')
  assert.equal(resumed.executions[nodeId].promptStarted, true)
  assert.deepEqual(sessions, [requests[0]!.sessionId])
  assert.deepEqual(requests, [requests[0], requests[0]])
})

test('for-expanded chat instances keep separate host conversations', async () => {
  const sessions: string[] = []
  const f = await fixture()
  await putTemplate(f.templateRoot, 'chat-items', `id: root\ntype: dag\ndag:\n  - id: source\n    type: node\n    node_kind: bash\n    command: ''\n    output_schema:\n      jobs:\n        type: array\n        items:\n          type: object\n          properties:\n            key: string\n            title: string\n  - id: each\n    type: node\n    node_kind: chat\n    prompt: ''\n    input_schema:\n      title: string\n  - type: edge\n    from: source\n    to: each\n    for: $.jobs\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Chat items', templateId: 'chat-items' })).json() as any
  await f.close()
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: f.storageRoot })
  await ctx.plugin(storageDomain, { backend: 'json' })
  const domain = await ctx.storageDomain.open(workflowInstanceDomain)
  const row = domain.table('instances').get(created.id)!
  const execution = compile(row.definition).restoreExecution(row.state as unknown as SavedExecution)
  execution.submit(execution.getFrontier()[0]!.instanceId, { jobs: [{ key: 'one', title: 'One' }, { key: 'two', title: 'Two' }] })
  await domain.table('instances').put(created.id, { ...row, state: execution.exportState() as any, snapshot: execution.getSnapshot() as any })
  await domain.close()
  await ctx.fiber.dispose()
  const host = await openHost(f.storageRoot, f.templateRoot, f.root, { sessionController: {
    create: async ({ sessionId }: { sessionId: string }) => { sessions.push(sessionId) },
    prompt: async () => { throw new Error('Blank prompt must not be sent') },
  } })
  cleanups.push(host.close)
  const path = `${INSTANCES_PATH}/${created.id}`
  const detail = await (await fetch(host.url(path))).json() as any
  const items = detail.snapshot.instances.filter((item: any) => item.definitionId === 'each')
  assert.equal(items.length, 2)
  for (const item of items) assert.equal((await postJson(host.url(`${path}/nodes/${item.instanceId}/execute`), {})).status, 200)
  const started = await untilDetail(host.url(path), value => items.every((item: any) => value.executions?.[item.instanceId]?.status === 'chat'))
  assert.equal(sessions.length, 2)
  assert.notEqual(started.executions[items[0].instanceId].sessionId, started.executions[items[1].instanceId].sessionId)
  assert.equal((await postJson(host.url(`${path}/nodes/${items[0].instanceId}/complete`), {})).status, 200)
  const partial = await (await fetch(host.url(path))).json() as any
  assert.equal(partial.snapshot.instances.find((item: any) => item.instanceId === items[0].instanceId).status, 'completed')
  assert.equal(partial.snapshot.instances.find((item: any) => item.instanceId === items[1].instanceId).status, 'ready')
})

test('restart preserves a successful command awaiting DAG submission and exposes an uncertain command without rerunning it', async () => {
  const calls: string[] = []
  const pending: Array<(code: number) => void> = []
  const services = { shell: {
    sandboxMode: 'workspace-write',
    resolve: (request: unknown) => request,
    execute: async (request: { command: string }) => ({ result: () => new Promise(resolve => {
      calls.push(request.command)
      pending.push(code => resolve({ exitCode: code, signal: null, timedOut: false, aborted: false,
        stdout: { text: 'real', truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write', denied: false } }))
    }) }),
  } }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'reject-real', `id: root\ntype: dag\noutput_schema:\n  result: string\ndag:\n  - id: run\n    type: node\n    node_kind: bash\n    command: success\n    output_schema:\n      enabled: boolean\n  - id: end\n    type: node\n    node_kind: bash\n    command: ''\n    output_schema:\n      result: string\n  - type: edge\n    from: run\n    to: end\n    if: $.enabled\n`)
  await putTemplate(f.templateRoot, 'uncertain', `id: root\ntype: dag\ndag:\n  - id: run\n    type: node\n    node_kind: bash\n    command: uncertain\n    is_auto_start: true\n`)
  const first = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Reject real', templateId: 'reject-real' })).json() as any
  const firstPath = `${INSTANCES_PATH}/${first.id}`
  const firstNode = first.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
  assert.equal((await postJson(f.url(`${firstPath}/nodes/${firstNode}/execute`), {})).status, 200)
  pending[0]!(0)
  await untilDetail(f.url(firstPath), detail => detail.executions?.[firstNode]?.status === 'succeeded' && Boolean(detail.executions[firstNode].error))
  const second = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Uncertain', templateId: 'uncertain' })).json() as any
  const secondPath = `${INSTANCES_PATH}/${second.id}`
  const secondNode = second.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
  await untilDetail(f.url(secondPath), detail => detail.executions?.[secondNode]?.status === 'running')
  assert.deepEqual(calls, ['success', 'uncertain'])
  await f.close()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(restarted.close)
  const restored = await (await fetch(restarted.url(secondPath))).json() as any
  assert.equal(restored.executions[secondNode].status, 'unknown')
  assert.match(restored.executions[secondNode].error, /unknown/)
  assert.equal((await postJson(restarted.url(`${firstPath}/nodes/${firstNode}/execute`), {})).status, 422)
  assert.deepEqual(calls, ['success', 'uncertain'])
  assert.equal((await postJson(restarted.url(`${secondPath}/nodes/${secondNode}/execute`), {})).status, 200)
  assert.deepEqual(calls, ['success', 'uncertain', 'uncertain'])
  pending[2]!(0)
  await untilDetail(restarted.url(secondPath), detail => detail.snapshot.instances.find((item: any) => item.instanceId === secondNode).status === 'completed')
})

test('an old incompatible instance keeps its snapshot visible but cannot execute', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'old', `id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: bash\n    command: ''\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Old', templateId: 'old' })).json() as any
  await f.close()
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: f.storageRoot })
  await ctx.plugin(storageDomain, { backend: 'json' })
  const domain = await ctx.storageDomain.open(workflowInstanceDomain)
  const row = domain.table('instances').get(created.id)!
  const definition = structuredClone(row.definition as any)
  delete definition.dag[0].node_kind
  delete definition.dag[0].command
  await domain.table('instances').put(created.id, { ...row, definition })
  await domain.close()
  await ctx.fiber.dispose()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(restarted.close)
  const path = `${INSTANCES_PATH}/${created.id}`
  const visible = await (await fetch(restarted.url(path))).json() as any
  assert.deepEqual(visible.snapshot, created.snapshot)
  assert.equal(visible.definition.dag[0].node_kind, undefined)
  assert.match(visible.incompatible, /node_kind/)
  const node = created.snapshot.instances.find((item: any) => item.definitionId === 'task')
  const blocked = await postJson(restarted.url(`${path}/nodes/${node.instanceId}/execute`), {})
  assert.equal(blocked.status, 409)
  assert.equal((await blocked.json() as any).error.code, 'instance-incompatible')
  assert.equal((await fetch(restarted.url(path), { method: 'DELETE' })).status, 200)
})

test('template route rescans the configured directory and reports invalid templates', async () => {
  const f = await fixture()
  let response = await fetch(f.url(TEMPLATES_PATH))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    directory: `${f.templateRoot}/<template-id>/workflow.yaml`,
    templates: [],
  })

  await putTemplate(f.templateRoot, 'valid-template', validTemplate)
  await putTemplate(f.templateRoot, 'broken-template', 'type: dag\ndag: []\n')
  response = await fetch(f.url(TEMPLATES_PATH))
  assert.equal(response.status, 200)
  const catalog = await response.json() as { templates: Array<{ id: string; error?: string }> }
  assert.deepEqual(catalog.templates.map(row => row.id), ['broken-template', 'valid-template'])
  assert.match(catalog.templates[0]!.error!, /Missing id/)
  assert.equal(catalog.templates[1]!.error, undefined)

  await putTemplate(f.templateRoot, 'layout-warning', validTemplate.replace('dag:\n', 'layout:\n  direction: vertical\n  segments:\n    - { start_at: draft, direction: horizontal }\ndag:\n'))
  response = await fetch(f.url(TEMPLATES_PATH))
  const withLayout = await response.json() as { templates: Array<{ id: string; error?: string; layout?: { issues: Array<{ code: string }> } }> }
  const warning = withLayout.templates.find(row => row.id === 'layout-warning')!
  assert.equal(warning.error, undefined)
  assert.equal(warning.layout?.issues[0]?.code, 'emptyDefault')
  const createdWithWarning = await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Layout warning', templateId: 'layout-warning' })
  assert.equal(createdWithWarning.status, 201)
  const saved = await createdWithWarning.json() as { definition: { layout: { direction: string } } }
  assert.equal(saved.definition.layout.direction, 'vertical')

  assert.equal((await fetch(f.url(TEMPLATES_PATH), { method: 'POST' })).status, 405)
  assert.equal((await fetch(f.url(INSTANCES_PATH))).status, 200)
})

test('instance route validates and initializes before one durable create', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'writer', validTemplate)
  await putTemplate(f.templateRoot, 'broken', 'type: dag\ndag: []\n')
  const request = {
    workspaceId: 'workspace-a',
    name: 'Writer run',
    templateId: 'writer',
  }

  const created = await postJson(f.url(INSTANCES_PATH), request)
  assert.equal(created.status, 201)
  const detail = await created.json() as {
    id: string
    name: string
    definition: { id: string }
    input: Record<string, unknown>
    snapshot: { rootInstanceId: string; instances: Array<{ definitionId: string; status: string; output?: unknown }>; waitingPositions: Array<{ definitionId: string }> }
  }
  assert.match(detail.id, /^[0-9a-f-]{36}$/)
  assert.equal(detail.name, request.name)
  assert.equal(detail.definition.id, 'root')
  assert.deepEqual(detail.input, { topic: '', count: 0, enabled: false, config: { label: '', nested: { limit: 0 } }, items: [] })
  assert.equal(detail.snapshot.instances.find(row => row.definitionId === 'draft')?.status, 'ready')
  assert.equal(detail.snapshot.instances.find(row => row.definitionId === 'draft')?.output, undefined)
  assert.equal(detail.snapshot.instances.some(row => row.definitionId === 'finish'), false)
  assert.deepEqual(detail.snapshot.waitingPositions.map(row => row.definitionId), ['finish'])

  const failures = await Promise.all([
    postJson(f.url(INSTANCES_PATH), request),
    postJson(f.url(INSTANCES_PATH), { ...request, name: 'Unwanted input', inputYaml: 'topic: override' }),
    postJson(f.url(INSTANCES_PATH), { ...request, name: 'Unwanted alternate input', input: { topic: 'override' } }),
    postJson(f.url(INSTANCES_PATH), { ...request, name: 'Missing workspace', workspaceId: 'gone' }),
    postJson(f.url(INSTANCES_PATH), { ...request, name: 'Missing template', templateId: 'gone' }),
    postJson(f.url(INSTANCES_PATH), { ...request, name: 'Broken template', templateId: 'broken' }),
    postJson(f.url(INSTANCES_PATH), { ...request, name: '   ' }),
  ])
  assert.deepEqual(failures.map(response => response.status), [409, 400, 400, 404, 404, 422, 400])
  const codes = await Promise.all(failures.map(async response => (await response.json() as { error: { code: string } }).error.code))
  assert.deepEqual(codes, ['duplicate-name', 'invalid-request', 'invalid-request', 'workspace-missing', 'template-missing', 'template-invalid', 'invalid-name'])

  const race = await Promise.all([
    postJson(f.url(INSTANCES_PATH), { ...request, name: 'Concurrent' }),
    postJson(f.url(INSTANCES_PATH), { ...request, name: 'Concurrent' }),
  ])
  assert.deepEqual(race.map(response => response.status).sort(), [201, 409])
  const list = await (await fetch(f.url(INSTANCES_PATH))).json() as Array<{ id: string; name: string }>
  assert.deepEqual(list.map(row => row.name).sort(), ['Concurrent', 'Writer run'])

  const persisted = await (await fetch(f.url(`${INSTANCES_PATH}/${detail.id}`))).json()
  await putTemplate(f.templateRoot, 'writer', 'broken: true\n')
  assert.deepEqual(await (await fetch(f.url(`${INSTANCES_PATH}/${detail.id}`))).json(), persisted)
})

test('instance creation uses an empty object when the root has no input schema', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'plain', 'id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: bash\n    command: \"\"\n')
  const response = await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Plain', templateId: 'plain' })
  assert.equal(response.status, 201)
  const detail = await response.json() as { input: unknown; snapshot: { instances: Array<{ definitionId: string; status: string }> } }
  assert.deepEqual(detail.input, {})
  assert.equal(detail.snapshot.instances.find(row => row.definitionId === 'task')?.status, 'ready')
})

test('saved definition, input and graph survive a host restart without the source template', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'writer', validTemplate)
  const created = await postJson(f.url(INSTANCES_PATH), {
    workspaceId: 'workspace-a', name: 'Persistent', templateId: 'writer',
  })
  const expected = await created.json() as { id: string }
  await f.close()
  await rm(join(f.templateRoot, 'writer'), { recursive: true, force: true })

  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(restarted.close)
  assert.deepEqual(await (await fetch(restarted.url(`${INSTANCES_PATH}/${expected.id}`))).json(), expected)
})

test('deleting an instance removes its stored snapshot and frees its name', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'writer', validTemplate)
  const request = { workspaceId: 'workspace-a', name: 'Disposable', templateId: 'writer' }
  const created = await (await postJson(f.url(INSTANCES_PATH), request)).json() as { id: string }
  const path = `${INSTANCES_PATH}/${created.id}`

  assert.equal((await fetch(f.url(path), { method: 'DELETE' })).status, 200)
  assert.equal((await fetch(f.url(path))).status, 404)
  assert.deepEqual(await (await fetch(f.url(INSTANCES_PATH))).json(), [])
  assert.equal((await fetch(f.url(path), { method: 'DELETE' })).status, 404)
  assert.equal((await postJson(f.url(INSTANCES_PATH), request)).status, 201)

  await f.close()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(restarted.close)
  assert.equal((await fetch(restarted.url(path))).status, 404)
})

test('execute advances one ready node, keeps its identity after restart, and rejects a stale click', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'writer', validTemplate)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Step', templateId: 'writer' })).json() as any
  const draft = created.snapshot.instances.find((item: any) => item.definitionId === 'draft')
  const path = `${INSTANCES_PATH}/${created.id}`
  const executed = await postJson(f.url(`${path}/nodes/${draft.instanceId}/execute`), {})
  assert.equal(executed.status, 200)
  const advanced = await executed.json() as any
  assert.deepEqual(advanced.snapshot.instances.find((item: any) => item.instanceId === draft.instanceId).output, { result: '' })
  const finish = advanced.snapshot.instances.find((item: any) => item.definitionId === 'finish')
  assert.equal(finish.status, 'ready')
  const stale = await postJson(f.url(`${path}/nodes/${draft.instanceId}/execute`), {})
  assert.equal(stale.status, 409)
  assert.deepEqual((await stale.json() as any).latest, advanced)
  assert.deepEqual(await (await fetch(f.url(path))).json(), advanced)
  await f.close()
  await rm(join(f.templateRoot, 'writer'), { recursive: true, force: true })
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(restarted.close)
  assert.deepEqual(await (await fetch(restarted.url(path))).json(), advanced)
  const completed = await postJson(restarted.url(`${path}/nodes/${finish.instanceId}/execute`), {})
  assert.equal(completed.status, 200)
  assert.equal((await completed.json() as any).snapshot.instances.find((item: any) => item.instanceId === finish.instanceId).status, 'completed')
})

test('placeholder outputs use declared zero values and close if and empty for branches', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'branches', `
id: root
type: dag
dag:
  - id: emit
    type: node
    node_kind: bash
    command: ""
    output_schema:
      text: string
      amount: number
      enabled: boolean
      payload:
        type: object
        properties:
          nested:
            type: object
            properties:
              flag: boolean
      jobs:
        type: array
        items:
          type: object
          properties:
            key: string
            title: string
  - id: conditional
    type: node
    node_kind: bash
    command: ""
  - id: each
    type: node
    node_kind: bash
    command: ""
    input_schema:
      title: string
  - type: edge
    from: emit
    to: conditional
    if: $.enabled
  - type: edge
    from: emit
    to: each
    for: $.jobs
`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Branches', templateId: 'branches' })).json() as any
  const emit = created.snapshot.instances.find((item: any) => item.definitionId === 'emit')
  const response = await postJson(f.url(`${INSTANCES_PATH}/${created.id}/nodes/${emit.instanceId}/execute`), {})
  assert.equal(response.status, 200)
  const updated = await response.json() as any
  assert.deepEqual(updated.snapshot.instances.find((item: any) => item.instanceId === emit.instanceId).output,
    { text: '', amount: 0, enabled: false, payload: { nested: { flag: false } }, jobs: [] })
  assert.deepEqual(updated.snapshot.skippedPositions.map((item: any) => item.definitionId).sort(), ['conditional', 'each'])
  assert.equal(updated.snapshot.instanceConnections.length, 0)
  assert.deepEqual(updated.snapshot.edges.map((edge: any) => edge.status), ['inactive', 'inactive'])
})

test('nonempty for items advance separately and retain aggregated connections across restart', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'items', `
id: root
type: dag
dag:
  - id: source
    type: node
    node_kind: bash
    command: ""
    output_schema:
      jobs:
        type: array
        items:
          type: object
          properties:
            key: string
            title: string
  - id: each
    type: node
    node_kind: bash
    command: ""
    input_schema:
      title: string
    output_schema:
      done: string
  - id: finish
    type: node
    node_kind: bash
    command: ""
    input_schema:
      done:
        type: array
        items: string
  - type: edge
    from: source
    to: each
    for: $.jobs
  - type: edge
    from: each
    to: finish
`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Items', templateId: 'items' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  await f.close()

  // Occupy the same public domain only while the HTTP host is closed; a real task output can contain these items.
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: f.storageRoot })
  await ctx.plugin(storageDomain, { backend: 'json' })
  const domain = await ctx.storageDomain.open(workflowInstanceDomain)
  const row = domain.table('instances').get(created.id)!
  const execution = compile(row.definition).restoreExecution(row.state as unknown as SavedExecution)
  execution.submit(execution.getFrontier()[0]!.instanceId, { jobs: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] })
  await domain.table('instances').put(created.id, { ...row, state: execution.exportState() as any, snapshot: execution.getSnapshot() as any })
  await domain.close()
  await ctx.fiber.dispose()

  let host = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(host.close)
  const initial = await (await fetch(host.url(path))).json() as any
  const items = initial.snapshot.instances.filter((item: any) => item.definitionId === 'each')
  assert.deepEqual(items.map((item: any) => item.forItem.key), ['a', 'b'])
  assert.deepEqual(items.map((item: any) => item.status), ['ready', 'ready'])
  assert.deepEqual(initial.snapshot.instanceConnections.map((edge: any) => edge.toInstanceId), items.map((item: any) => item.instanceId))

  const first = await postJson(host.url(`${path}/nodes/${items[0].instanceId}/execute`), {})
  assert.equal(first.status, 200)
  const partial = await first.json() as any
  assert.equal(partial.snapshot.instances.find((item: any) => item.instanceId === items[0].instanceId).status, 'completed')
  assert.equal(partial.snapshot.instances.find((item: any) => item.instanceId === items[1].instanceId).status, 'ready')
  assert.equal(partial.snapshot.instances.some((item: any) => item.definitionId === 'finish'), false)
  await host.close()
  host = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(host.close)
  assert.deepEqual(await (await fetch(host.url(path))).json(), partial)

  const second = await postJson(host.url(`${path}/nodes/${items[1].instanceId}/execute`), {})
  assert.equal(second.status, 200)
  const complete = await second.json() as any
  const finish = complete.snapshot.instances.find((item: any) => item.definitionId === 'finish')
  assert.equal(finish.status, 'ready')
  assert.deepEqual(finish.input, { done: ['', ''] })
  assert.deepEqual(complete.snapshot.instanceConnections.filter((edge: any) => edge.toInstanceId === finish.instanceId), [{
    edgeDefinitionPath: ['dag', 4],
    from: { parentInstanceId: complete.snapshot.rootInstanceId, definitionId: 'each' },
    sourceKind: 'group',
    sourceInstanceIds: items.map((item: any) => item.instanceId),
    toInstanceId: finish.instanceId,
  }])
  assert.deepEqual(await (await fetch(host.url(path))).json(), complete)
})

test('DAG output rejection rolls back the submitted node and persists no partial graph', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'reject', `
id: root
type: dag
output_schema:
  result: string
dag:
  - id: start
    type: node
    node_kind: bash
    command: ""
    output_schema:
      enabled: boolean
  - id: finish
    type: node
    node_kind: bash
    command: ""
    output_schema:
      result: string
  - type: edge
    from: start
    to: finish
    if: $.enabled
`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Reject', templateId: 'reject' })).json() as any
  const start = created.snapshot.instances.find((item: any) => item.definitionId === 'start')
  const path = `${INSTANCES_PATH}/${created.id}`
  const failed = await postJson(f.url(`${path}/nodes/${start.instanceId}/execute`), {})
  assert.equal(failed.status, 422)
  assert.equal((await failed.json() as any).error.code, 'submission-failed')
  const persisted = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(persisted.snapshot, created.snapshot)
  assert.equal(persisted.executions[start.instanceId].status, 'succeeded')
  assert.match(persisted.executions[start.instanceId].error, /MISSING_OUTPUT_FIELD/)
  assert.equal((await postJson(f.url(`${path}/nodes/${start.instanceId}/execute`), {})).status, 422)
})

test('drawer width belongs to its instance and survives execution and host restart', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'writer', validTemplate)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Drawer', templateId: 'writer' })).json() as any
  const other = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Other drawer', templateId: 'writer' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal(created.drawerWidth, undefined)
  assert.equal(other.drawerWidth, undefined)
  assert.equal((await postJson(f.url(`${path}/drawer-width`), { width: 410 })).status, 200)
  const saved = await (await fetch(f.url(path))).json() as any
  assert.equal(saved.drawerWidth, 410)
  const node = saved.snapshot.instances.find((item: any) => item.definitionId === 'draft')
  const executed = await (await postJson(f.url(`${path}/nodes/${node.instanceId}/execute`), {})).json() as any
  assert.equal(executed.drawerWidth, 410)
  assert.equal(executed.snapshot.instances.find((item: any) => item.instanceId === node.instanceId).status, 'completed')
  const resized = await (await postJson(f.url(`${path}/drawer-width`), { width: 390 })).json() as any
  assert.deepEqual(resized.snapshot, executed.snapshot)
  assert.equal(resized.drawerWidth, 390)
  assert.equal((await (await fetch(f.url(`${INSTANCES_PATH}/${other.id}`))).json() as any).drawerWidth, undefined)
  const invalid = await postJson(f.url(`${path}/drawer-width`), { width: -1 })
  assert.equal(invalid.status, 400)
  assert.deepEqual(await (await fetch(f.url(path))).json(), resized)
  await f.close()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(restarted.close)
  assert.deepEqual(await (await fetch(restarted.url(path))).json(), resized)
})
