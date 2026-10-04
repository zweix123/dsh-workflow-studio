import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, rename, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import { WorkflowInstanceService, workflowInstanceDomain } from '../src/host/service/workflow-instance-service.js'
import { createWorkflowInstancesRoute } from '../src/host/routes/workflow-instances.js'
import { INSTANCES_PATH, TEMPLATES_PATH } from '../src/shared/constants.js'
import * as nodePlugin from '../../dsh-workflow-node/src/server.js'
import { bashNode } from '../../dsh-workflow-node-bash/src/server.js'
import * as sessionPlugin from '../../dsh-workflow-node-session-agent/src/server.js'
import { sessionAgentNode } from '../../dsh-workflow-node-session-agent/src/server.js'
import { formNode } from '../../dsh-workflow-node-form/src/server.js'
import { type ServerNode } from 'dsh-workflow-node/contract'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function fixture(services: Record<string, unknown> = {}, nodes?: ReadonlyMap<string, ServerNode>, storageFault?: (value: unknown) => void) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workflow-studio-'))
  const templateRoot = join(root, 'home', 'dsh-workflow-studio', 'templates')
  const storageRoot = join(root, 'storage')
  await mkdir(templateRoot, { recursive: true })
  const host = await openHost(storageRoot, templateRoot, root, services, nodes, storageFault)
  cleanups.push(async () => {
    await host.close()
    await rm(root, { recursive: true, force: true })
  })
  return {
    ctx: host.ctx,
    root,
    storageRoot,
    templateRoot,
    close: host.close,
    url: host.url,
  }
}

async function openHost(storageRoot: string, templateRoot: string, workspacePath: string, services: Record<string, unknown> = {}, nodes?: ReadonlyMap<string, ServerNode>, storageFault?: (value: unknown) => void) {
  const ctx = new Context()
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: storageRoot })
  if (storageFault) {
    const facet = ctx.storage.backend.get('json').kv!
    const open = facet.open.bind(facet)
    facet.open = async descriptor => {
      const unit = await open(descriptor)
      const put = unit.putRecord.bind(unit)
      unit.putRecord = async (table, key, value) => { storageFault(value); await put(table, key, value) }
      return unit
    }
  }
  await ctx.plugin(storageDomain, { backend: 'json' })
  ctx.provide('workspaceRegistry', {
    get: (id: string) => ['workspace-a', 'workspace-b'].includes(id) ? { id, path: workspacePath, title: 'Workspace A' } : undefined,
  } as never)
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/fallback' }) } as never)
  if (!Object.hasOwn(services, 'shell')) ctx.provide('shell', { sandboxMode: true } as never)
  for (const [name, service] of Object.entries(services)) ctx.provide(name as never, service as never)
  await ctx.plugin(nodePlugin)
  if (ctx.get('sessionController')) await ctx.plugin(sessionPlugin)
  else await ctx.plugin({ inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, '@dsh-workflow/node-session-agent', sessionAgentNode) } })
  for (const node of [bashNode, formNode]) await ctx.plugin({ inject: ['workflowNodes', ...node.requires], apply(c: Context) { c.workflowNodes.register(c, `@dsh-workflow/node-${node.kind}`, node) } })
  const service = await WorkflowInstanceService.create(ctx, templateRoot, undefined, nodes)
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
    ctx,
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

function stableDetail(value: any): any {
  const copy = structuredClone(value)
  for (const view of Object.values(copy.nodeViews ?? {}) as any[]) delete view.token
  return copy
}

async function untilDetail(url: string, check: (detail: any) => boolean): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const detail = await (await fetch(url)).json()
    if (check(detail)) return detail
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for workflow detail')
}

function successfulShell(results: Record<string, string>) {
  return { sandboxMode: 'workspace-write', resolve: (request: unknown) => request,
    execute: async (request: { command: string }) => ({ result: async () => ({ exitCode: 0,
      stdout: { text: results[request.command] ?? '', truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write' } }) }),
  }
}

const validTemplate = `
id: root
type: dag
dag:
  - id: draft
    type: node
    node_kind: form
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

test('workshop rejects root input declarations without an external provider', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'no-provider', `id: root
type: dag
input_schema:
  request: string
dag: []
`)
  const catalog = await (await fetch(f.url(TEMPLATES_PATH))).json() as any
  assert.match(catalog.templates[0].error, /MISSING_INPUT_PROVIDER.*request/)
  assert.equal((await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Invalid', templateId: 'no-provider' })).status, 422)
})

test('session_agent sends a default initial message when its rendered prompt is blank', async () => {
  for (const prompt of ['', ' \n\t ', '{{ value }}']) {
    const sessions: string[] = []
    const prompts: Array<{ sessionId: string; text: string }> = []
    const f = await fixture({ sessionController: {
      create: async ({ sessionId }: { sessionId: string }) => { sessions.push(sessionId) },
      prompt: async (request: { sessionId: string; content: Array<{ text: string }> }) => {
        prompts.push({ sessionId: request.sessionId, text: request.content[0]!.text })
        return { accepted: true }
      },
    } })
    await putTemplate(f.templateRoot, 'blank-prompt', `id: root\ntype: dag\ndag:\n  - id: input\n    type: node\n    node_kind: form\n    output_schema:\n      value: string\n  - id: task\n    type: node\n    node_kind: session_agent\n    prompt: ${JSON.stringify(prompt)}\n    input_schema:\n      value: string\n  - type: edge\n    from: input\n    to: task\n`)
    const catalog = await (await fetch(f.url(TEMPLATES_PATH))).json() as any
    assert.equal(catalog.templates[0].error, undefined)
    const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Default prompt', templateId: 'blank-prompt' })).json() as any
    const path = `${INSTANCES_PATH}/${created.id}`
    const inputId = created.snapshot.instances.find((item: any) => item.definitionId === 'input').instanceId
    assert.equal((await postJson(f.url(`${path}/nodes/${inputId}/actions/submit`), { value: '' })).status, 200)
    const supplied = await (await fetch(f.url(path))).json() as any
    const taskId = supplied.snapshot.instances.find((item: any) => item.definitionId === 'task').instanceId
    assert.equal((await postJson(f.url(`${path}/nodes/${taskId}/actions/start`), {})).status, 200)
    const ready = await untilDetail(f.url(path), detail => detail.executions?.[taskId]?.status === 'waiting')
    assert.deepEqual(prompts, [{ sessionId: ready.executions[taskId].sessionId, text: '请先询问我希望处理什么任务。' }])
    assert.equal(ready.snapshot.instances.find((item: any) => item.instanceId === taskId).status, 'ready')
    assert.equal((await postJson(f.url(`${path}/nodes/${taskId}/actions/start`), {})).status, 200)
    assert.equal(sessions.length, 1)
    assert.equal(prompts.length, 1)
  }
})

test('form accepts validated input once and sends its real result downstream', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'form', `id: root\ntype: dag\ndag:\n  - id: answer\n    type: node\n    node_kind: form\n    output_schema:\n      choice: string\n      count: number\n      approved: boolean\n    schema:\n      properties:\n        choice:\n          enum: [yes, no]\n  - id: next\n    type: node\n    node_kind: bash\n    command: ''\n    input_schema:\n      choice: string\n      count: number\n      approved: boolean\n  - type: edge\n    from: answer\n    to: next\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Form', templateId: 'form' })).json() as any
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'answer').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/submit`), { choice: 'invalid', count: 0, approved: false })).status, 422)
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/submit`), { choice: 'yes', count: 0, approved: false })).status, 200)
  const done = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.instanceId === nodeId).output, { choice: 'yes', count: 0, approved: false })
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.definitionId === 'next').input, { choice: 'yes', count: 0, approved: false })
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/submit`), { choice: 'no', count: 1, approved: true })).status, 409)
})

test('form preserves upstream zero, false and empty text over defaults', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'prefill', `id: root\ntype: dag\ndag:\n  - id: first\n    type: node\n    node_kind: form\n    output_schema:\n      text: string\n      count: number\n      enabled: boolean\n  - id: second\n    type: node\n    node_kind: form\n    input_schema:\n      text: string\n      count: number\n      enabled: boolean\n    output_schema:\n      text: string\n      count: number\n      enabled: boolean\n    schema:\n      properties:\n        text:\n          default: fallback\n        count:\n          default: 9\n        enabled:\n          default: true\n  - type: edge\n    from: first\n    to: second\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Prefill', templateId: 'prefill' })).json() as any
  const first = created.snapshot.instances.find((item: any) => item.definitionId === 'first').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal((await postJson(f.url(`${path}/nodes/${first}/actions/submit`), { text: '', count: 0, enabled: false })).status, 200)
  const current = await (await fetch(f.url(path))).json() as any
  const second = current.snapshot.instances.find((item: any) => item.definitionId === 'second')
  assert.deepEqual(second.input, { text: '', count: 0, enabled: false })
  assert.equal((await postJson(f.url(`${path}/nodes/${second.instanceId}/actions/submit`), second.input)).status, 200)
  const done = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.instanceId === first).output, { text: '', count: 0, enabled: false })
})

test('form keeps its accepted result when DAG submission fails and rejects changed input', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'rejected-form', `id: root\ntype: dag\noutput_schema:\n  result: string\ndag:\n  - id: answer\n    type: node\n    node_kind: form\n    output_schema:\n      enabled: boolean\n  - id: finish\n    type: node\n    node_kind: bash\n    command: ''\n    output_schema:\n      result: string\n  - type: edge\n    from: answer\n    to: finish\n    if: $.enabled\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Rejected form', templateId: 'rejected-form' })).json() as any
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'answer').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/submit`), { enabled: false })).status, 422)
  const accepted = await (await fetch(f.url(path))).json() as any
  assert.equal(accepted.executions[nodeId].status, 'succeeded')
  assert.deepEqual(accepted.executions[nodeId].output, { enabled: false })
  assert.equal(accepted.snapshot.instances.find((item: any) => item.instanceId === nodeId).status, 'ready')
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/submit`), { enabled: true })).status, 409)
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/start`), {})).status, 409)
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/retry`), {})).status, 422)
  const retained = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(retained.executions[nodeId].output, { enabled: false })
})

test('only the selected kind validates its fields and form rejects unsupported controls', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'same-field', `id: root\ntype: dag\ndag:\n  - id: a\n    type: node\n    node_kind: session_agent\n    prompt: Valid task\n    command: 42\n  - id: b\n    type: node\n    node_kind: bash\n    command: ''\n    prompt: false\n`)
  const accepted = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Same field', templateId: 'same-field' })).json() as any
  assert.equal(accepted.definition.dag[0].command, 42)
  assert.equal(accepted.definition.dag[1].prompt, false)
  await putTemplate(f.templateRoot, 'bad-control', `id: root\ntype: dag\ndag:\n  - id: answer\n    type: node\n    node_kind: form\n    output_schema:\n      value: string\n    uiSchema:\n      value:\n        ui:widget: file\n`)
  const catalog = await (await fetch(f.url(TEMPLATES_PATH))).json() as any
  assert.match(catalog.templates.find((row: any) => row.id === 'bad-control').error, /unsupported widget/)
})

test('an assembled node owns its actions and cancellation never submits a success result', async () => {
  const testNode: ServerNode = { kind: 'test', requires: [], validate(node) { if (typeof node.note !== 'string') throw new Error('note must be string') }, ready() { return undefined },
    action(_context, name) {
      if (name === 'cancel') return { fact: { kind: 'test', status: 'cancelled' } }
      if (name === 'finish') return { fact: { kind: 'test', status: 'succeeded', output: { done: true } } }
      throw new Error('Action denied')
    }, recover(fact) { return fact }, project() { return {} } }
  const f = await fixture({}, new Map([[testNode.kind, testNode]]))
  await putTemplate(f.templateRoot, 'test', `id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: test\n    note: ready\n    output_schema:\n      done: boolean\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Custom', templateId: 'test' })).json() as any
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'task').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/start`), {})).status, 409)
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/cancel`), {})).status, 200)
  const cancelled = await (await fetch(f.url(path))).json() as any
  assert.equal(cancelled.snapshot.instances.find((item: any) => item.instanceId === nodeId).status, 'ready')
  assert.equal(cancelled.executions[nodeId].status, 'cancelled')
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/finish`), {})).status, 200)
  const done = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.instanceId === nodeId).output, { done: true })
})

test('startup persists node recovery instead of projecting it only for a read', async () => {
  let resumed = 0
  const recoverable: ServerNode = {
    kind: 'recoverable', requires: [], validate() {}, ready() { return undefined },
    action(_context, name) {
      if (name !== 'start') throw new Error('Action denied')
      return { fact: { kind: 'recoverable', status: 'running' } }
    },
    recover(fact) {
      if (fact.status !== 'running') return fact
      resumed += 1
      return { ...fact, status: 'unknown' }
    },
    project() { return {} },
  }
  const nodes = new Map([[recoverable.kind, recoverable]])
  const f = await fixture({}, nodes)
  await putTemplate(f.templateRoot, 'recovery', `id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: recoverable\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Recovery', templateId: 'recovery' })).json() as any
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'task').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/start`), {})).status, 200)
  await f.close()
  const first = await openHost(f.storageRoot, f.templateRoot, f.root, {}, nodes)
  assert.equal((await (await fetch(first.url(path))).json() as any).executions[nodeId].status, 'unknown')
  await first.close()
  const second = await openHost(f.storageRoot, f.templateRoot, f.root, {}, nodes)
  cleanups.push(second.close)
  assert.equal((await (await fetch(second.url(path))).json() as any).executions[nodeId].status, 'unknown')
  assert.equal(resumed, 1)
})

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
        stdout: { text: '{"result":"real output"}', truncated: false }, stderr: { text: 'failed', truncated: false },
        sandbox: { mode: 'workspace-write', denied: false } }) }
    },
  } })
  await putTemplate(f.templateRoot, 'command', `id: root\ntype: dag\ndag:\n  - id: build\n    type: node\n    node_kind: bash\n    command: 'printf hello'\n    output_schema:\n      result: string\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Command', templateId: 'command' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'build').instanceId
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/start`), {})).status, 200)
  const failed = await untilDetail(f.url(path), detail => detail.executions?.[nodeId]?.status === 'failed')
  assert.equal(failed.snapshot.instances.find((item: any) => item.instanceId === nodeId).status, 'ready')
  assert.match(failed.executions[nodeId].error, /7/)
  exitCode = 0
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/start`), {})).status, 200)
  const complete = await untilDetail(f.url(path), detail => detail.snapshot.instances.find((item: any) => item.instanceId === nodeId).status === 'completed')
  assert.deepEqual(complete.snapshot.instances.find((item: any) => item.instanceId === nodeId).output, { result: 'real output' })
  assert.equal(complete.executions[nodeId].stdout, '{"result":"real output"}')
  assert.deepEqual(calls.map(call => call.command), ['printf hello', 'printf hello'])
  assert.deepEqual(calls.map(call => call.workdir), [f.root, f.root])
  assert.deepEqual(calls.map(call => call.sandboxPolicy.workspaceRoot), [f.root, f.root])
  sandboxMode = undefined
  const unsafe = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'No sandbox', templateId: 'command' })).json() as any
  const unsafeNode = unsafe.snapshot.instances.find((item: any) => item.definitionId === 'build').instanceId
  const unsafePath = `${INSTANCES_PATH}/${unsafe.id}`
  assert.equal((await postJson(f.url(`${unsafePath}/nodes/${unsafeNode}/actions/start`), {})).status, 200)
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
  assert.equal((await postJson(f.url(`${path}/nodes/${leftId}/actions/start`), {})).status, 409)
  assert.equal((await fetch(f.url(path), { method: 'DELETE' })).status, 409)
  assert.equal((await postJson(f.url(`${path}/drawer-width`), { width: 460 })).status, 200)
  calls.find(call => call.command === 'left')!.finish(0)
  calls.find(call => call.command === 'right')!.finish(9)
  const settled = await untilDetail(f.url(path), detail => detail.executions?.[leftId]?.status === 'succeeded' && detail.executions?.[rightId]?.status === 'failed' && detail.snapshot.instances.find((item: any) => item.instanceId === leftId).status === 'completed')
  assert.equal(settled.snapshot.instances.find((item: any) => item.instanceId === leftId).status, 'completed')
  assert.equal(settled.snapshot.instances.find((item: any) => item.instanceId === rightId).status, 'ready')
  assert.equal(settled.drawerWidth, 460)
  assert.equal(calls.length, 2)
  assert.equal((await postJson(f.url(`${path}/nodes/${rightId}/actions/start`), {})).status, 200)
  await untilDetail(f.url(path), detail => detail.executions?.[rightId]?.status === 'running')
  assert.equal(calls.length, 3)
  calls[2]!.finish(0)
  await untilDetail(f.url(path), detail => detail.snapshot.instances.find((item: any) => item.instanceId === rightId).status === 'completed')
  assert.equal((await fetch(f.url(path), { method: 'DELETE' })).status, 200)
})

test('session_agent creates one durable conversation, preserves prompt content, and completes only on user request', async () => {
  const createdSessions: Array<{ sessionId: string; workspaceId: string }> = []
  const prompts: Array<{ sessionId: string; text: string }> = []
  const services = { sessionController: {
    create: async (request: { sessionId: string; workspaceId: string }) => { createdSessions.push(request); return { sessionId: request.sessionId } },
    prompt: async (request: { sessionId: string; content: Array<{ text: string }> }) => { prompts.push({ sessionId: request.sessionId, text: request.content[0]!.text }); return { accepted: true } },
  } }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'session_agent', `id: root\ntype: dag\ndag:\n  - id: first\n    type: node\n    node_kind: session_agent\n    prompt: 'Write a draft'\n  - id: second\n    type: node\n    node_kind: session_agent\n    prompt: '  Review the draft  '\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Session agents', templateId: 'session_agent' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const [first, second] = created.snapshot.instances.filter((item: any) => item.type === 'node')
  assert.equal((await postJson(f.url(`${path}/nodes/${first.instanceId}/actions/start`), {})).status, 200)
  assert.equal((await postJson(f.url(`${path}/nodes/${second.instanceId}/actions/start`), {})).status, 200)
  const ready = await untilDetail(f.url(path), detail => detail.executions?.[first.instanceId]?.status === 'waiting' && detail.executions?.[second.instanceId]?.status === 'waiting')
  assert.equal(ready.executions[first.instanceId].kind, 'session_agent')
  assert.equal(createdSessions.length, 2)
  assert.deepEqual(createdSessions.map(row => row.workspaceId), ['workspace-a', 'workspace-a'])
  assert.notEqual(createdSessions[0]!.sessionId, createdSessions[1]!.sessionId)
  assert.deepEqual(prompts, [
    { sessionId: ready.executions[first.instanceId].sessionId, text: 'Write a draft' },
    { sessionId: ready.executions[second.instanceId].sessionId, text: '  Review the draft  ' },
  ])
  assert.equal(ready.snapshot.instances.find((item: any) => item.instanceId === first.instanceId).status, 'ready')
  assert.equal((await postJson(f.url(`${path}/nodes/${first.instanceId}/actions/start`), {})).status, 200)
  assert.equal(createdSessions.length, 2)
  assert.equal((await postJson(f.url(`${path}/nodes/${first.instanceId}/actions/complete`), {})).status, 200)
  const completed = await (await fetch(f.url(path))).json() as any
  assert.equal(completed.snapshot.instances.find((item: any) => item.instanceId === first.instanceId).status, 'completed')
  assert.equal(completed.snapshot.instances.find((item: any) => item.instanceId === second.instanceId).status, 'ready')
  await f.close()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(restarted.close)
  const restored = await (await fetch(restarted.url(path))).json() as any
  assert.equal(restored.executions[second.instanceId].sessionId, ready.executions[second.instanceId].sessionId)
  assert.equal(createdSessions.length, 2)
  assert.equal(prompts.length, 2)
  assert.equal((await fetch(restarted.url(path), { method: 'DELETE' })).status, 200)
  assert.equal(createdSessions.length, 2)
})

test('a rejected session_agent prompt can be resumed after restart with the same session and request identity', async () => {
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
  await putTemplate(f.templateRoot, 'retry-session_agent', `id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: session_agent\n    prompt: Write a draft\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Retry session_agent', templateId: 'retry-session_agent' })).json() as any
  const nodeId = created.snapshot.instances.find((item: any) => item.definitionId === 'task').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  assert.equal((await postJson(f.url(`${path}/nodes/${nodeId}/actions/start`), {})).status, 200)
  const failed = await untilDetail(f.url(path), detail => detail.executions?.[nodeId]?.status === 'failed')
  assert.match(failed.executions[nodeId].error, /not accepted/)
  assert.equal(failed.executions[nodeId].promptStarted, undefined)
  await f.close()
  reject = false
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(restarted.close)
  assert.equal((await postJson(restarted.url(`${path}/nodes/${nodeId}/actions/start`), {})).status, 200)
  const resumed = await untilDetail(restarted.url(path), detail => detail.executions?.[nodeId]?.status === 'waiting')
  assert.equal(resumed.executions[nodeId].promptStarted, true)
  assert.deepEqual(sessions, [requests[0]!.sessionId])
  assert.deepEqual(requests, [requests[0], requests[0]])
})

test('for-expanded session_agent instances keep separate host conversations', async () => {
  const sessions: string[] = []
  const services = { shell: successfulShell({ 'emit-jobs': '{"jobs":[{"key":"one","title":"One"},{"key":"two","title":"Two"}]}' }), sessionController: {
    create: async ({ sessionId }: { sessionId: string }) => { sessions.push(sessionId) },
    prompt: async () => ({ accepted: true }),
  } }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'session_agent-items', `id: root\ntype: dag\ndag:\n  - id: source\n    type: node\n    node_kind: bash\n    command: emit-jobs\n    output_schema:\n      jobs:\n        type: array\n        items:\n          type: object\n          properties:\n            key: string\n            title: string\n  - id: each\n    type: node\n    node_kind: session_agent\n    prompt: 'Discuss {{ title }}'\n    input_schema:\n      title: string\n  - type: edge\n    from: source\n    to: each\n    for: $.jobs\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Session agent items', templateId: 'session_agent-items' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const source = created.snapshot.instances.find((item: any) => item.definitionId === 'source').instanceId
  await postJson(f.url(`${path}/nodes/${source}/actions/start`), {})
  await untilDetail(f.url(path), value => value.snapshot.instances.filter((item: any) => item.definitionId === 'each').length === 2)
  await f.close()
  const host = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(host.close)
  const detail = await (await fetch(host.url(path))).json() as any
  const items = detail.snapshot.instances.filter((item: any) => item.definitionId === 'each')
  assert.equal(items.length, 2)
  for (const item of items) assert.equal((await postJson(host.url(`${path}/nodes/${item.instanceId}/actions/start`), {})).status, 200)
  const started = await untilDetail(host.url(path), value => items.every((item: any) => value.executions?.[item.instanceId]?.status === 'waiting'))
  for (const item of items) {
    const sessionId = started.executions[item.instanceId].sessionId
    assert.deepEqual(await (await fetch(host.url(`/api/dsh-workflow-studio/conversations/${sessionId}/instance`))).json(), { target: { instanceId: created.id, nodeInstanceId: item.instanceId } })
  }
  assert.equal(sessions.length, 2)
  assert.notEqual(started.executions[items[0].instanceId].sessionId, started.executions[items[1].instanceId].sessionId)
  assert.equal((await postJson(host.url(`${path}/nodes/${items[0].instanceId}/actions/complete`), {})).status, 200)
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
        stdout: { text: '{"enabled":false}', truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write', denied: false } }))
    }) }),
  } }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'reject-real', `id: root\ntype: dag\noutput_schema:\n  result: string\ndag:\n  - id: run\n    type: node\n    node_kind: bash\n    command: success\n    output_schema:\n      enabled: boolean\n  - id: end\n    type: node\n    node_kind: bash\n    command: ''\n    output_schema:\n      result: string\n  - type: edge\n    from: run\n    to: end\n    if: $.enabled\n`)
  await putTemplate(f.templateRoot, 'uncertain', `id: root\ntype: dag\ndag:\n  - id: run\n    type: node\n    node_kind: bash\n    command: uncertain\n    is_auto_start: true\n`)
  const first = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Reject real', templateId: 'reject-real' })).json() as any
  const firstPath = `${INSTANCES_PATH}/${first.id}`
  const firstNode = first.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
  assert.equal((await postJson(f.url(`${firstPath}/nodes/${firstNode}/actions/start`), {})).status, 200)
  pending[0]!(0)
  await untilDetail(f.url(firstPath), detail => detail.executions?.[firstNode]?.status === 'succeeded' && Boolean(detail.executions[firstNode].error))
  const second = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Uncertain', templateId: 'uncertain' })).json() as any
  const secondPath = `${INSTANCES_PATH}/${second.id}`
  const secondNode = second.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
  await untilDetail(f.url(secondPath), detail => detail.executions?.[secondNode]?.status === 'running')
  assert.deepEqual(calls, ['success', 'uncertain'])
  // Graceful close now drains calls. Fail the outstanding result save so durable
  // evidence remains running, just as after an interrupted process.
  const interrupted = `${f.storageRoot}-interrupted`
  await rename(f.storageRoot, interrupted)
  await writeFile(f.storageRoot, 'blocked storage path')
  pending[1]!(0)
  await f.close()
  await rm(f.storageRoot)
  await rename(interrupted, f.storageRoot)
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(restarted.close)
  const restored = await (await fetch(restarted.url(secondPath))).json() as any
  assert.equal(restored.executions[secondNode].status, 'unknown')
  assert.match(restored.executions[secondNode].error, /unknown/)
  assert.equal((await postJson(restarted.url(`${firstPath}/nodes/${firstNode}/actions/start`), {})).status, 422)
  assert.deepEqual(calls, ['success', 'uncertain'])
  assert.equal((await postJson(restarted.url(`${secondPath}/nodes/${secondNode}/actions/start`), {})).status, 200)
  assert.deepEqual(calls, ['success', 'uncertain', 'uncertain'])
  pending[2]!(0)
  await untilDetail(restarted.url(secondPath), detail => detail.snapshot.instances.find((item: any) => item.instanceId === secondNode).status === 'completed')
})

test('an incompatible current-contract instance keeps its snapshot visible but cannot execute', async () => {
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
  const blocked = await postJson(restarted.url(`${path}/nodes/${node.instanceId}/actions/start`), {})
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

test('template detail is validated on read and confined to a direct template directory', async () => {
  const f = await fixture()
  await putTemplate(f.templateRoot, 'good', 'id: root\ntype: dag\ndescription: Original\ndag:\n  - id: step\n    type: node\n    node_kind: bash\n    command: echo hi\n')
  await putTemplate(f.templateRoot, 'bad', 'type: dag\ndag: []\n')
  const url = (id: string) => f.url(`${TEMPLATES_PATH}/${id}`)
  assert.equal((await fetch(url('good'))).status, 200)
  const first = await (await fetch(url('good'))).json() as any
  assert.equal(first.id, 'good')
  assert.equal(first.definition.description, 'Original')
  assert.equal(first.definition.dag[0].command, 'echo hi')
  await putTemplate(f.templateRoot, 'good', 'id: root\ntype: dag\ndescription: Updated\ndag:\n  - id: step\n    type: node\n    node_kind: bash\n    command: echo hi\n')
  assert.equal((await (await fetch(url('good'))).json() as any).definition.description, 'Updated')
  assert.equal((await fetch(url('bad'))).status, 422)
  assert.equal((await fetch(url('gone'))).status, 404)
  assert.equal((await fetch(url('..%2f..%2foutside'))).status, 400)
  await mkdir(join(f.templateRoot, 'linked'))
  await writeFile(join(f.root, 'outside.yaml'), 'id: outside\ntype: dag\ndag: []\n')
  await symlink(join(f.root, 'outside.yaml'), join(f.templateRoot, 'linked', 'workflow.yaml'))
  assert.equal((await fetch(url('linked'))).status, 400)
  assert.equal((await fetch(url('good'), { method: 'POST' })).status, 405)
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
  assert.deepEqual(detail.input, {})
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
  assert.deepEqual(stableDetail(await (await fetch(restarted.url(`${INSTANCES_PATH}/${expected.id}`))).json()), stableDetail(expected))
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
  const executed = await postJson(f.url(`${path}/nodes/${draft.instanceId}/actions/submit`), { result: 'written' })
  assert.equal(executed.status, 200)
  const advanced = await executed.json() as any
  assert.deepEqual(advanced.snapshot.instances.find((item: any) => item.instanceId === draft.instanceId).output, { result: 'written' })
  const finish = advanced.snapshot.instances.find((item: any) => item.definitionId === 'finish')
  assert.equal(finish.status, 'ready')
  const stale = await postJson(f.url(`${path}/nodes/${draft.instanceId}/actions/submit`), { result: 'written' })
  assert.equal(stale.status, 409)
  assert.deepEqual((await stale.json() as any).latest, advanced)
  assert.deepEqual(await (await fetch(f.url(path))).json(), advanced)
  await f.close()
  await rm(join(f.templateRoot, 'writer'), { recursive: true, force: true })
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root)
  cleanups.push(restarted.close)
  assert.deepEqual(stableDetail(await (await fetch(restarted.url(path))).json()), stableDetail(advanced))
  const completed = await postJson(restarted.url(`${path}/nodes/${finish.instanceId}/actions/start`), {})
  assert.equal(completed.status, 200)
  assert.equal((await completed.json() as any).snapshot.instances.find((item: any) => item.instanceId === finish.instanceId).status, 'completed')
})

test('real JSON outputs retain zero values and close if and empty for branches', async () => {
  const f = await fixture({ shell: successfulShell({ emit: '{"text":"","amount":0,"enabled":false,"payload":{"nested":{"flag":false}},"jobs":[]}' }) })
  await putTemplate(f.templateRoot, 'branches', `
id: root
type: dag
dag:
  - id: emit
    type: node
    node_kind: bash
    command: emit
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
  const response = await postJson(f.url(`${INSTANCES_PATH}/${created.id}/nodes/${emit.instanceId}/actions/start`), {})
  assert.equal(response.status, 200)
  const updated = await untilDetail(f.url(`${INSTANCES_PATH}/${created.id}`), detail => detail.snapshot.instances.find((item: any) => item.instanceId === emit.instanceId).status === 'completed')
  assert.deepEqual(updated.snapshot.instances.find((item: any) => item.instanceId === emit.instanceId).output,
    { text: '', amount: 0, enabled: false, payload: { nested: { flag: false } }, jobs: [] })
  assert.deepEqual(updated.snapshot.skippedPositions.map((item: any) => item.definitionId).sort(), ['conditional', 'each'])
  assert.equal(updated.snapshot.instanceConnections.length, 0)
  assert.deepEqual(updated.snapshot.edges.map((edge: any) => edge.status), ['inactive', 'inactive'])
})

test('nonempty for items advance separately and retain aggregated connections across restart', async () => {
  const services = { shell: successfulShell({ source: '{"jobs":[{"key":"a","title":"A"},{"key":"b","title":"B"}]}', "each 'A'": '{"done":"A"}', "each 'B'": '{"done":"B"}' }) }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'items', `
id: root
type: dag
dag:
  - id: source
    type: node
    node_kind: bash
    command: source
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
    command: each {{ title }}
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
  const source = created.snapshot.instances.find((item: any) => item.definitionId === 'source').instanceId
  await postJson(f.url(`${path}/nodes/${source}/actions/start`), {})
  await untilDetail(f.url(path), value => value.snapshot.instances.filter((item: any) => item.definitionId === 'each').length === 2)
  await f.close()
  let host = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(host.close)
  const initial = await (await fetch(host.url(path))).json() as any
  const items = initial.snapshot.instances.filter((item: any) => item.definitionId === 'each')
  assert.deepEqual(items.map((item: any) => item.forItem.key), ['a', 'b'])
  assert.deepEqual(items.map((item: any) => item.status), ['ready', 'ready'])
  assert.deepEqual(initial.snapshot.instanceConnections.map((edge: any) => edge.toInstanceId), items.map((item: any) => item.instanceId))

  const first = await postJson(host.url(`${path}/nodes/${items[0].instanceId}/actions/start`), {})
  assert.equal(first.status, 200)
  const partial = await untilDetail(host.url(path), value => value.snapshot.instances.find((item: any) => item.instanceId === items[0].instanceId).status === 'completed')
  assert.equal(partial.snapshot.instances.find((item: any) => item.instanceId === items[0].instanceId).status, 'completed')
  assert.equal(partial.snapshot.instances.find((item: any) => item.instanceId === items[1].instanceId).status, 'ready')
  assert.equal(partial.snapshot.instances.some((item: any) => item.definitionId === 'finish'), false)
  await host.close()
  host = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(host.close)
  assert.deepEqual(stableDetail(await (await fetch(host.url(path))).json()), stableDetail(partial))

  const second = await postJson(host.url(`${path}/nodes/${items[1].instanceId}/actions/start`), {})
  assert.equal(second.status, 200)
  const complete = await untilDetail(host.url(path), value => value.snapshot.instances.some((item: any) => item.definitionId === 'finish'))
  const finish = complete.snapshot.instances.find((item: any) => item.definitionId === 'finish')
  assert.equal(finish.status, 'ready')
  assert.deepEqual(finish.input, { done: ['A', 'B'] })
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
    node_kind: form
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
  const failed = await postJson(f.url(`${path}/nodes/${start.instanceId}/actions/submit`), { enabled: false })
  assert.equal(failed.status, 422)
  assert.equal((await failed.json() as any).error.code, 'submission-failed')
  const persisted = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(persisted.snapshot, created.snapshot)
  assert.equal(persisted.executions[start.instanceId].status, 'succeeded')
  assert.match(persisted.executions[start.instanceId].error, /MISSING_OUTPUT_FIELD/)
  assert.equal((await postJson(f.url(`${path}/nodes/${start.instanceId}/actions/retry`), {})).status, 422)
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
  const executed = await (await postJson(f.url(`${path}/nodes/${node.instanceId}/actions/submit`), { result: 'written' })).json() as any
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
  assert.deepEqual(stableDetail(await (await fetch(restarted.url(path))).json()), stableDetail(resized))
})

test('selected nodes reject unsupported output, prefill and text references before creation', async () => {
  const f = await fixture()
  const cases = [
    { node_kind: 'session_agent', prompt: '', output_schema: { result: 'string' } },
    { node_kind: 'form', input_schema: { count: 'string' }, output_schema: { count: 'number' } },
    { node_kind: 'form', input_schema: { extra: 'string' }, output_schema: { count: 'number' } },
    { node_kind: 'session_agent', prompt: '{{ missing }}' },
    { node_kind: 'session_agent', prompt: '{% if value %}yes{% endif %}' },
    { node_kind: 'bash', command: 'echo {{ missing }}' },
  ]
  for (const [index, config] of cases.entries()) {
    const id = `invalid-${index}`
    await putTemplate(f.templateRoot, id, JSON.stringify({ id: 'root', type: 'dag', dag: [
      ...('input_schema' in config ? [{ id: 'source', type: 'node', node_kind: 'bash', command: '', output_schema: config.input_schema }, { type: 'edge', from: 'source', to: 'a' }] : []),
      { id: 'a', type: 'node', ...config },
    ] }))
    const response = await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: id, templateId: id })
    assert.equal(response.status, 422, JSON.stringify(config))
    if (config.node_kind === 'form') assert.match((await response.json() as any).error.message, /prefill input/)
  }
})

test('form input renders the session prompt and completion supplies only an execution dependency', async () => {
  const prompts: string[] = []
  const f = await fixture({ sessionController: {
    create: async () => {},
    prompt: async (request: { content: Array<{ text: string }> }) => { prompts.push(request.content[0]!.text) },
  } })
  await putTemplate(f.templateRoot, 'input', JSON.stringify({ id: 'root', type: 'dag', dag: [
    { id: 'source', type: 'node', node_kind: 'form', output_schema: { text: 'string', count: 'number', enabled: 'boolean' } },
    { id: 'agent', type: 'node', node_kind: 'session_agent', input_schema: { text: 'string', count: 'number', enabled: 'boolean' }, prompt: 'Task={{ text }}; count={{ count }}; enabled={{ enabled }}' },
    { id: 'next', type: 'node', node_kind: 'bash', input_schema: { text: 'string' }, command: '' },
    { type: 'edge', from: 'source', to: 'agent' }, { type: 'edge', from: 'source', to: 'next' }, { type: 'edge', from: 'agent', to: 'next' },
  ] }))
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Input', templateId: 'input' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const source = created.snapshot.instances.find((item: any) => item.definitionId === 'source').instanceId
  await postJson(f.url(`${path}/nodes/${source}/actions/submit`), { text: 'real task', count: 0, enabled: false })
  const detail = await (await fetch(f.url(path))).json() as any
  const agent = detail.snapshot.instances.find((item: any) => item.definitionId === 'agent').instanceId
  await postJson(f.url(`${path}/nodes/${agent}/actions/start`), {})
  await untilDetail(f.url(path), value => value.executions?.[agent]?.status === 'waiting')
  assert.deepEqual(prompts, ['Task=real task; count=0; enabled=false'])
  await postJson(f.url(`${path}/nodes/${agent}/actions/complete`), {})
  const done = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.instanceId === agent).output, {})
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.definitionId === 'next').input, { text: 'real task', count: 0, enabled: false })
  await f.close()
  const host = await openHost(f.storageRoot, f.templateRoot, f.root, { sessionController: { create: async () => { throw new Error('Must not create again') }, prompt: async () => { throw new Error('Must not prompt again') } } })
  cleanups.push(host.close)
  assert.deepEqual((await (await fetch(host.url(path))).json() as any).snapshot, done.snapshot)
})

test('bash validates complete stdout JSON before accepting a business result or advancing downstream', async () => {
  let stdout = '{"report":{"count":2},"jobs":[{"key":"a","title":"A"}],"enabled":true}'
  let truncated = false
  const commands: string[] = []
  const f = await fixture({ shell: {
    sandboxMode: 'workspace-write', resolve: (request: unknown) => request,
    execute: async (request: { command: string }) => { commands.push(request.command); return { result: async () => ({ exitCode: 0, stdout: { text: stdout, truncated }, stderr: { text: 'diagnostic log', truncated: false }, sandbox: { mode: 'workspace-write' } }) } },
  } })
  const schema = { report: { type: 'object', properties: { count: 'number' } }, jobs: { type: 'array', items: { type: 'object', properties: { key: 'string', title: 'string' } } }, enabled: 'boolean' }
  await putTemplate(f.templateRoot, 'json-output', JSON.stringify({ id: 'root', type: 'dag', dag: [
    { id: 'source', type: 'node', node_kind: 'bash', command: 'original-command', output_schema: schema },
    { id: 'each', type: 'node', node_kind: 'bash', command: '', input_schema: { title: 'string' } },
    { id: 'condition', type: 'node', node_kind: 'bash', command: '' },
    { type: 'edge', from: 'source', to: 'each', for: '$.jobs' }, { type: 'edge', from: 'source', to: 'condition', if: '$.enabled' },
  ] }))
  for (const [index, result] of [
    { stdout: '', error: /JSON/ }, { stdout: 'log\n{}', error: /JSON/ }, { stdout: '[]', error: /object/ },
    { stdout: '42', error: /object/ }, { stdout: '{}', error: /MISSING_OUTPUT_FIELD/ },
    { stdout: '{"report":{"count":"bad"},"jobs":[],"enabled":true}', error: /INVALID_FIELD_TYPE/ },
    { stdout: '{"report":{"count":1e400},"jobs":[],"enabled":true}', error: /JSON|finite|number/ },
    { stdout: '{"report":{"count":2},"jobs":[],"enabled":true}', truncated: true, error: /truncated/ },
  ].entries()) {
    stdout = result.stdout; truncated = result.truncated ?? false
    const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: `Bad-${index}`, templateId: 'json-output' })).json() as any
    const path = `${INSTANCES_PATH}/${created.id}`
    const node = created.snapshot.instances.find((item: any) => item.definitionId === 'source').instanceId
    await postJson(f.url(`${path}/nodes/${node}/actions/start`), {})
    const failed = await untilDetail(f.url(path), value => value.executions?.[node]?.status !== 'running')
    assert.equal(failed.executions[node].status, 'failed', result.stdout)
    assert.match(failed.executions[node].error, result.error)
    assert.equal(failed.executions[node].stdout, stdout)
    assert.equal(failed.executions[node].stderr, 'diagnostic log')
    assert.deepEqual(failed.snapshot, created.snapshot)
    assert.equal(failed.executions[node].output, undefined)
  }
  stdout = '{"report":{"count":2},"jobs":[{"key":"a","title":"A"}],"enabled":true}'; truncated = false
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Good', templateId: 'json-output' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const node = created.snapshot.instances.find((item: any) => item.definitionId === 'source').instanceId
  assert.equal((await postJson(f.url(`${path}/nodes/${node}/actions/start`), { command: 'override' })).status, 409)
  await postJson(f.url(`${path}/nodes/${node}/actions/start`), {})
  const done = await untilDetail(f.url(path), value => value.snapshot.instances.some((item: any) => item.definitionId === 'each'))
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.instanceId === node).output, { report: { count: 2 }, jobs: [{ key: 'a', title: 'A' }], enabled: true })
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.definitionId === 'each').input, { title: 'A' })
  assert.ok(done.snapshot.instances.some((item: any) => item.definitionId === 'condition'))
  assert.ok(commands.every(command => command === 'original-command'))
})

test('bash references are independent unquoted data arguments, never script fragments', async () => {
  const f = await fixture()
  for (const [index, command] of [
    'echo "{{ value }}"', "echo '{{ value }}'", 'echo prefix{{ value }}', 'echo {{ value }}suffix',
    'echo --option={{ value }}', 'echo \\{{ value }}', 'echo $(printf {{ value }})', 'echo `printf {{ value }}`',
    'echo # {{ value }}', '{{ value }}', 'echo ok; {{ value }}', 'cat <<EOF\n{{ value }}\nEOF',
    'echo ${unset:- {{ value }} }', '{ {{ value }}; }', 'case x in x) {{ value }};; esac', '> log {{ value }}', 'echo\u00a0{{ value }}',
    'unset missing; $missing {{ value }}', "$(printf '') {{ value }}", '2> /dev/null {{ value }}',
    'shopt -s nullglob; no-such-command-* {{ value }}', '\\\n {{ value }}',
    'time {{ value }}', 'time -p {{ value }}', 'coproc {{ value }}',
    '2<<EOF {{ value }}\nliteral\nEOF',
  ].entries()) {
    const id = `invalid-shell-${index}`
    await putTemplate(f.templateRoot, id, JSON.stringify({ id: 'root', type: 'dag', dag: [
      { id: 'source', type: 'node', node_kind: 'form', output_schema: { value: 'string' } },
      { id: 'command', type: 'node', node_kind: 'bash', input_schema: { value: 'string' }, command },
      { type: 'edge', from: 'source', to: 'command' },
    ] }))
    const response = await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: id, templateId: id })
    assert.equal(response.status, 422, command)
    assert.match((await response.json() as any).error.message, /parameter|argument/)
  }
  await putTemplate(f.templateRoot, 'after-heredoc', JSON.stringify({ id: 'root', type: 'dag', dag: [
    { id: 'source', type: 'node', node_kind: 'form', output_schema: { value: 'string' } },
    { id: 'run', type: 'node', node_kind: 'bash', input_schema: { value: 'string' }, command: "cat <<'END-OF-TEXT'\nliteral\nEND-OF-TEXT\nprintf %s {{ value }}" },
    { type: 'edge', from: 'source', to: 'run' },
  ] }))
  assert.equal((await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'After heredoc', templateId: 'after-heredoc' })).status, 201)

})

test('bash passes spaces, quotes, newlines and shell characters as single literal arguments', async () => {
  const f = await fixture({ shell: {
    sandboxMode: 'workspace-write', resolve: (request: unknown) => request,
    execute: async (request: { command: string; workdir: string }) => ({ result: async () => {
      const { stdout, stderr } = await promisify(execFile)('/bin/sh', ['-c', request.command], { cwd: request.workdir })
      return { exitCode: 0, stdout: { text: stdout, truncated: false }, stderr: { text: stderr, truncated: false }, sandbox: { mode: 'workspace-write' } }
    } }),
  } })
  const input = { text: 'string', count: 'number', enabled: 'boolean' }
  await putTemplate(f.templateRoot, 'shell-input', JSON.stringify({ id: 'root', type: 'dag', dag: [
    { id: 'form', type: 'node', node_kind: 'form', output_schema: input },
    { id: 'run', type: 'node', node_kind: 'bash', input_schema: input, command: `${process.execPath} -e 'process.stdout.write(JSON.stringify({args:process.argv.slice(1)}))' {{ text }} {{ count }} {{ enabled }}`, output_schema: { args: { type: 'array', items: 'string' } } },
    { type: 'edge', from: 'form', to: 'run' },
  ] }))
  for (const [index, text] of ["two words ' quote\n$(printf injected); & | * \\", ''].entries()) {
    const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: `Safe-${index}`, templateId: 'shell-input' })).json() as any
    const path = `${INSTANCES_PATH}/${created.id}`
    const source = created.snapshot.instances.find((item: any) => item.definitionId === 'form').instanceId
    await postJson(f.url(`${path}/nodes/${source}/actions/submit`), { text, count: 0, enabled: false })
    const detail = await (await fetch(f.url(path))).json() as any
    const run = detail.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
    await postJson(f.url(`${path}/nodes/${run}/actions/start`), {})
    const done = await untilDetail(f.url(path), value => value.executions?.[run]?.status === 'failed' || value.snapshot.instances.find((item: any) => item.instanceId === run).status === 'completed')
    assert.equal(done.executions[run].status, 'succeeded', done.executions[run].error)
    assert.deepEqual(done.snapshot.instances.find((item: any) => item.instanceId === run).output, { args: [text, '0', 'false'] })
  }
})

test('closed sources stay legitimately missing through propagation and a nested DAG input boundary', async () => {
  const prompts: string[] = [], commands: string[] = []
  const f = await fixture({ sessionController: { create: async () => {}, prompt: async (request: { content: Array<{ text: string }> }) => { prompts.push(request.content[0]!.text) } },
    shell: { sandboxMode: 'workspace-write', resolve: (request: unknown) => request,
      execute: async (request: { command: string }) => { commands.push(request.command); return { result: async () => ({ exitCode: 0, stdout: { text: 'log only', truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write' } }) } } } })
  const missing = { payload: { type: 'object', properties: { label: 'string' } }, count: 'number' }
  await putTemplate(f.templateRoot, 'missing', JSON.stringify({ id: 'root', type: 'dag', dag: [
    { id: 'flag', type: 'node', node_kind: 'form', output_schema: { enabled: 'boolean' } },
    { id: 'closed', type: 'node', node_kind: 'bash', command: 'must-not-run', output_schema: missing },
    { id: 'propagate', type: 'node', node_kind: 'bash', command: 'must-not-run', input_schema: missing, output_schema: missing },
    { id: 'nested', type: 'dag', input_schema: missing, dag: [
      { id: 'agent', type: 'node', node_kind: 'session_agent', input_schema: missing, prompt: 'label={{ payload.label }}; object={{ payload }}; count={{ count }}' },
      { id: 'run', type: 'node', node_kind: 'bash', input_schema: missing, command: 'printf %s {{ payload.label }} {{ count }}' },
    ] },
    { type: 'edge', from: 'flag', to: 'closed', if: '$.enabled' }, { type: 'edge', from: 'closed', to: 'propagate' },
    { type: 'edge', from: 'propagate', to: 'nested' }, { type: 'edge', from: 'flag', to: 'nested' },
  ] }))
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Missing', templateId: 'missing' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const flag = created.snapshot.instances.find((item: any) => item.definitionId === 'flag').instanceId
  assert.equal((await postJson(f.url(`${path}/nodes/${flag}/actions/submit`), { enabled: false })).status, 200)
  const detail = await (await fetch(f.url(path))).json() as any
  assert.deepEqual(detail.snapshot.skippedPositions.map((item: any) => item.definitionId), ['closed', 'propagate'])
  for (const name of ['agent', 'run']) {
    const item = detail.snapshot.instances.find((item: any) => item.definitionId === name)
    assert.deepEqual(item.input, { enabled: false })
    await postJson(f.url(`${path}/nodes/${item.instanceId}/actions/start`), {})
  }
  const done = await untilDetail(f.url(path), value => Object.values(value.executions ?? {}).filter((fact: any) => ['waiting', 'succeeded'].includes(fact.status)).length === 3)
  assert.deepEqual(prompts, ['label=; object=; count='])
  assert.deepEqual(commands, ["printf %s '' ''"])
  const run = done.snapshot.instances.find((item: any) => item.definitionId === 'run')
  assert.deepEqual(done.executions[run.instanceId].output, {})
})

test('structured input references render object fields and JSON text without appending unrelated data', async () => {
  const prompts: string[] = [], commands: string[] = []
  const f = await fixture({ sessionController: { create: async () => {}, prompt: async (request: { content: Array<{ text: string }> }) => { prompts.push(request.content[0]!.text) } },
    shell: { sandboxMode: 'workspace-write', resolve: (request: unknown) => request,
      execute: async (request: { command: string }) => { commands.push(request.command); return { result: async () => ({ exitCode: 0, stdout: { text: '{"config":{"label":"ok","count":0},"items":["a","b"],"unused":"secret"}', truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write' } }) } } } })
  const schema = { config: { type: 'object', properties: { label: 'string', count: 'number' } }, items: { type: 'array', items: 'string' } }
  await putTemplate(f.templateRoot, 'structured', JSON.stringify({ id: 'root', type: 'dag', dag: [
    { id: 'emit', type: 'node', node_kind: 'bash', command: 'emit', output_schema: schema },
    { id: 'agent', type: 'node', node_kind: 'session_agent', input_schema: schema, prompt: '{{ config.label }} / {{ config.count }} / {{ config }} / {{ items }}' },
    { id: 'run', type: 'node', node_kind: 'bash', input_schema: schema, command: 'echo {{ config.label }} {{ config }} {{ items }}' },
    { type: 'edge', from: 'emit', to: 'agent' }, { type: 'edge', from: 'emit', to: 'run' },
  ] }))
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Structured', templateId: 'structured' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`
  const emit = created.snapshot.instances.find((item: any) => item.definitionId === 'emit').instanceId
  await postJson(f.url(`${path}/nodes/${emit}/actions/start`), {})
  const detail = await untilDetail(f.url(path), value => value.snapshot.instances.some((item: any) => item.definitionId === 'agent'))
  for (const name of ['agent', 'run']) await postJson(f.url(`${path}/nodes/${detail.snapshot.instances.find((item: any) => item.definitionId === name).instanceId}/actions/start`), {})
  await untilDetail(f.url(path), value => Object.values(value.executions ?? {}).filter((fact: any) => ['waiting', 'succeeded'].includes(fact.status)).length === 3)
  assert.deepEqual(prompts, ['ok / 0 / {"label":"ok","count":0} / ["a","b"]'])
  assert.deepEqual(commands, ['emit', `echo 'ok' '{"label":"ok","count":0}' '["a","b"]'`])
})

test('ordinary vertices and DAG boundaries enforce the same recursively compatible providers', async () => {
  const f = await fixture()
  const scalar = { value: 'string' }
  const object = { value: { type: 'object', properties: { count: 'number' } } }
  const cases = [
    { source: {}, input: scalar, error: /MISSING_INPUT_PROVIDER/ },
    { source: { value: 'number' }, input: scalar, error: /SCHEMA_TYPE_MISMATCH/ },
    { source: object, input: { value: { type: 'object', properties: { count: 'string' } } }, error: /SCHEMA_TYPE_MISMATCH/ },
    { source: { value: { type: 'array', items: { type: 'object', properties: { count: 'number' } } } }, input: { value: { type: 'array', items: { type: 'object', properties: { absent: 'number' } } } }, error: /SCHEMA_TYPE_MISMATCH/ },
  ]
  for (const nested of [false, true]) for (const [index, config] of cases.entries()) {
    const id = `provider-${nested}-${index}`
    const node = { id: 'consumer', type: 'node', node_kind: 'session_agent', prompt: '', input_schema: config.input }
    const target = nested ? { id: 'target', type: 'dag', input_schema: config.input, dag: [node] } : { ...node, id: 'target' }
    await putTemplate(f.templateRoot, id, JSON.stringify({ id: 'root', type: 'dag', dag: [
      { id: 'source', type: 'node', node_kind: 'bash', command: '', output_schema: config.source }, target, { type: 'edge', from: 'source', to: 'target' },
    ] }))
    const response = await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: id, templateId: id })
    assert.equal(response.status, 422)
    assert.match((await response.json() as any).error.message, config.error)
  }
  for (const [index, prompt] of ['{{ value.unknown }}', '{{ value.count.more }}', '{{ value|filter }}', '{{ value[0] }}', '{{ $.value }}', '{{ value', '{# comment #}'].entries()) {
    const id = `reference-${index}`
    await putTemplate(f.templateRoot, id, JSON.stringify({ id: 'root', type: 'dag', dag: [
      { id: 'source', type: 'node', node_kind: 'bash', command: '', output_schema: object },
      { id: 'agent', type: 'node', node_kind: 'session_agent', prompt, input_schema: object }, { type: 'edge', from: 'source', to: 'agent' },
    ] }))
    assert.equal((await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: id, templateId: id })).status, 422, prompt)
  }
  await putTemplate(f.templateRoot, 'conflict', JSON.stringify({ id: 'root', type: 'dag', dag: [
    { id: 'a', type: 'node', node_kind: 'form', output_schema: scalar }, { id: 'b', type: 'node', node_kind: 'form', output_schema: scalar },
    { id: 'target', type: 'node', node_kind: 'session_agent', prompt: '', input_schema: scalar },
    { type: 'edge', from: 'a', to: 'target' }, { type: 'edge', from: 'b', to: 'target' },
  ] }))
  const catalog = await (await fetch(f.url(TEMPLATES_PATH))).json() as any
  assert.match(catalog.templates.find((row: any) => row.id === 'conflict').error, /INPUT_SCHEMA_KEY_CONFLICT/)
})

test('failed bash results retry the immutable snapshot command and output-free commands submit no log data', async () => {
  let stdout = 'not JSON'
  const commands: string[] = []
  const f = await fixture({ shell: { sandboxMode: 'workspace-write', resolve: (request: unknown) => request,
    execute: async (request: { command: string }) => { commands.push(request.command); return { result: async () => ({ exitCode: 0, stdout: { text: stdout, truncated: false }, stderr: { text: 'log', truncated: false }, sandbox: { mode: 'workspace-write' } }) } } } })
  const definition = { id: 'root', type: 'dag', dag: [{ id: 'run', type: 'node', node_kind: 'bash', command: 'snapshot-command', output_schema: { value: 'string' } }] }
  await putTemplate(f.templateRoot, 'retry', JSON.stringify(definition))
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Retry', templateId: 'retry' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`, run = created.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
  await postJson(f.url(`${path}/nodes/${run}/actions/start`), {})
  await untilDetail(f.url(path), value => value.executions?.[run]?.status === 'failed')
  await putTemplate(f.templateRoot, 'retry', JSON.stringify({ ...definition, dag: [{ ...definition.dag[0], command: 'updated-source-command' }] }))
  assert.equal((await postJson(f.url(`${path}/nodes/${run}/actions/start`), { command: 'override' })).status, 409)
  stdout = '{"value":"accepted"}'
  await postJson(f.url(`${path}/nodes/${run}/actions/start`), {})
  const done = await untilDetail(f.url(path), value => value.snapshot.instances.find((item: any) => item.instanceId === run).status === 'completed')
  assert.deepEqual(done.snapshot.instances.find((item: any) => item.instanceId === run).output, { value: 'accepted' })
  assert.deepEqual(commands, ['snapshot-command', 'snapshot-command'])
  const newInstance = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Updated', templateId: 'retry' })).json() as any
  assert.equal(newInstance.definition.dag[0].command, 'updated-source-command')
  for (const [index, output_schema] of [undefined, {}].entries()) {
    await putTemplate(f.templateRoot, `logs-${index}`, JSON.stringify({ id: 'root', type: 'dag', dag: [{ id: 'run', type: 'node', node_kind: 'bash', command: 'logs-only', output_schema }] }))
    const logs = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: `Logs-${index}`, templateId: `logs-${index}` })).json() as any
    const logPath = `${INSTANCES_PATH}/${logs.id}`, node = logs.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
    await postJson(f.url(`${logPath}/nodes/${node}/actions/start`), {})
    const completed = await untilDetail(f.url(logPath), value => value.snapshot.instances.find((item: any) => item.instanceId === node).status === 'completed')
    assert.deepEqual(completed.snapshot.instances.find((item: any) => item.instanceId === node).output, {})
    assert.equal(completed.executions[node].stdout, stdout)
  }
  await putTemplate(f.templateRoot, 'empty', JSON.stringify({ id: 'root', type: 'dag', dag: [{ ...definition.dag[0], command: '' }] }))
  const empty = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Empty', templateId: 'empty' })).json() as any
  const emptyPath = `${INSTANCES_PATH}/${empty.id}`, emptyNode = empty.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
  await postJson(f.url(`${emptyPath}/nodes/${emptyNode}/actions/start`), {})
  const failed = await untilDetail(f.url(emptyPath), value => value.executions?.[emptyNode]?.status === 'failed')
  assert.match(failed.executions[emptyNode].error, /JSON/)
  assert.deepEqual(failed.snapshot, empty.snapshot)
})

test('a result whose durable save fails is never reported accepted and restarts as unknown', async () => {
  let finish!: () => void
  let calls = 0
  const services = { shell: { sandboxMode: 'workspace-write', resolve: (request: unknown) => request,
    execute: async () => { calls++; return { result: () => new Promise(resolve => { finish = () => resolve({ exitCode: 0, stdout: { text: '{"value":"real"}', truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write' } }) }) } } } }
  const f = await fixture(services)
  await putTemplate(f.templateRoot, 'durability', JSON.stringify({ id: 'root', type: 'dag', dag: [{ id: 'run', type: 'node', node_kind: 'bash', command: 'once', output_schema: { value: 'string' } }] }))
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Durability', templateId: 'durability' })).json() as any
  const path = `${INSTANCES_PATH}/${created.id}`, run = created.snapshot.instances.find((item: any) => item.definitionId === 'run').instanceId
  await postJson(f.url(`${path}/nodes/${run}/actions/start`), {})
  await untilDetail(f.url(path), value => value.executions?.[run]?.status === 'running')
  const backup = `${f.storageRoot}-backup`
  await rename(f.storageRoot, backup)
  await writeFile(f.storageRoot, 'Block durable writes')
  try {
    finish()
    await fetch(f.url(path))
    await f.close()
  } finally {
    await rm(f.storageRoot, { force: true })
    await rename(backup, f.storageRoot)
  }
  const host = await openHost(f.storageRoot, f.templateRoot, f.root, services)
  cleanups.push(host.close)
  const restored = await (await fetch(host.url(path))).json() as any
  assert.equal(restored.executions[run].status, 'unknown')
  assert.equal(restored.executions[run].output, undefined)
  assert.deepEqual(restored.snapshot, created.snapshot)
  assert.equal(calls, 1)
})

test('conversation ownership resolves the full instance and node identity without changing execution', async () => {
  const sessions: string[] = []
  const f = await fixture({ sessionController: {
    create: async ({ sessionId }: { sessionId: string }) => { sessions.push(sessionId) },
    prompt: async () => ({ accepted: true }),
  } })
  await putTemplate(f.templateRoot, 'navigation', `id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: session_agent\n    prompt: Review navigation\n`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Navigation', templateId: 'navigation' })).json() as any
  const nodeId = created.snapshot.instances.find((item: any) => item.type === 'node').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  await postJson(f.url(`${path}/nodes/${nodeId}/actions/start`), {})
  const ready = await untilDetail(f.url(path), detail => detail.executions?.[nodeId]?.status === 'waiting')
  const response = await fetch(f.url(`/api/dsh-workflow-studio/conversations/${sessions[0]}/instance`))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { target: { instanceId: created.id, nodeInstanceId: nodeId } })
  assert.deepEqual(await (await fetch(f.url(path))).json(), ready)
  assert.equal(sessions.length, 1)
  const peer = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Peer', templateId: 'navigation' })).json() as any
  const peerNode = peer.snapshot.instances.find((item: any) => item.type === 'node').instanceId
  await postJson(f.url(`${INSTANCES_PATH}/${peer.id}/nodes/${peerNode}/actions/start`), {})
  const peerReady = await untilDetail(f.url(`${INSTANCES_PATH}/${peer.id}`), detail => detail.executions?.[peerNode]?.status === 'waiting')
  const peerSession = peerReady.executions[peerNode].sessionId
  assert.deepEqual(await (await fetch(f.url(`/api/dsh-workflow-studio/conversations/${peerSession}/instance`))).json(), { target: { instanceId: peer.id, nodeInstanceId: peerNode } })
  await postJson(f.url(`${path}/nodes/${nodeId}/actions/complete`), {})
  await f.close()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, { sessionController: { create: async () => { throw new Error('Navigation must not create sessions') } } })
  cleanups.push(restarted.close)
  const query = (id: string) => fetch(restarted.url(`/api/dsh-workflow-studio/conversations/${id}/instance`))
  assert.deepEqual(await (await query(sessions[0]!)).json(), { target: { instanceId: created.id, nodeInstanceId: nodeId } })
  assert.deepEqual(await (await query('ordinary-session')).json(), { target: null })
  assert.deepEqual(await (await query('fork-child')).json(), { target: null })
  assert.equal((await fetch(restarted.url('/api/dsh-workflow-studio/conversations/%E0%A4/instance'))).status, 400)
  assert.equal((await postJson(restarted.url(`/api/dsh-workflow-studio/conversations/${sessions[0]}/instance`), {})).status, 405)
  await fetch(restarted.url(path), { method: 'DELETE' })
  assert.deepEqual(await (await query(sessions[0]!)).json(), { target: null })
  assert.equal(sessions.length, 2)
})


test('a missing type anywhere in the snapshot pauses new calls while an in-flight result is saved and submitted', async () => {
  const f = await fixture()
  let finish!: () => void
  let started = 0
  const external: ServerNode = {
    kind: 'external', requires: [], validate() {}, ready() { return undefined },
    describe() { return { actions: [{ id: 'start', label: { text: 'Run external' }, primary: true, target: { type: 'server' } }] } },
    action() { started++; return { fact: { kind: 'external', status: 'running' }, run: async () => { await new Promise<void>(resolve => { finish = resolve }); return { kind: 'external', status: 'succeeded', output: {} } } } },
    recover(fact) { return fact.status === 'running' ? { ...fact, status: 'unknown' } : fact }, project() { return {} },
  }
  const install = (source: string, node: ServerNode) => f.ctx.plugin({ inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, source, node) } })
  const externalFiber = install('external-package', external)
  const dormant = install('dormant-package', { ...external, kind: 'dormant' })
  await externalFiber; await dormant
  await putTemplate(f.templateRoot, 'external', `id: root
type: dag
dag:
  - id: first
    type: node
    node_kind: external
  - id: next
    type: node
    node_kind: bash
    command: ''
    is_auto_start: true
  - id: dormant
    type: node
    node_kind: dormant
  - type: edge
    from: first
    to: next
  - type: edge
    from: next
    to: dormant
`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'External', templateId: 'external' })).json() as any
  assert.ok(created.snapshot, JSON.stringify(created))
  const path = `${INSTANCES_PATH}/${created.id}`
  const first = created.snapshot.instances.find((item: any) => item.definitionId === 'first').instanceId
  assert.equal(created.nodeViews[first].actions[0].label.text, 'Run external')
  assert.equal(started, 0, 'presentation must not execute business')
  assert.equal((await postJson(f.url(`${path}/nodes/${first}/actions/start`), {})).status, 200)
  await dormant.dispose()
  const paused = await (await fetch(f.url(path))).json() as any
  assert.match(paused.incompatible, /dormant/)
  assert.equal((await postJson(f.url(`${path}/nodes/${first}/actions/start`), {})).status, 409)
  let unloaded = false
  const disposing = externalFiber.dispose().then(() => { unloaded = true })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(unloaded, false)
  finish()
  await disposing
  const settled = await (await fetch(f.url(path))).json() as any
  assert.equal(settled.executions[first].status, 'succeeded')
  const next = settled.snapshot.instances.find((item: any) => item.definitionId === 'next')
  assert.equal(next.status, 'ready')
  assert.equal(settled.executions[next.instanceId], undefined)
  const restored = install('external-package', external)
  const restoredDormant = install('dormant-package', { ...external, kind: 'dormant' })
  await restored; await restoredDormant
  const resumed = await untilDetail(f.url(path), value => value.snapshot.instances.find((item: any) => item.definitionId === 'next')?.status === 'completed')
  assert.equal(resumed.incompatible, undefined)
  assert.equal(started, 1, 'accepted business must never run again')
})


test('an unload with a result save fault reports failure and restarts from persisted unknown facts without repeating business', async () => {
  const f = await fixture()
  let finish!: () => void
  let calls = 0
  const errors: unknown[][] = []
  const previousError = console.error
  console.error = (...args) => { errors.push(args) }
  const node: ServerNode = {
    kind: 'save_fault', requires: [], validate() {}, ready(context) { return context.fact ? undefined : this.action(context, 'start', {}) },
    action() { calls++; return { fact: { kind: 'save_fault', status: 'running' }, run: async () => { await new Promise<void>(resolve => { finish = resolve }); return { kind: 'save_fault', status: 'succeeded', output: {} } } } },
    recover(fact) { return fact.status === 'running' ? { ...fact, status: 'unknown' } : fact }, project() { return {} },
  }
  try {
    const fiber = f.ctx.plugin({ inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, 'save-fault-package', node) } })
    await fiber
    await putTemplate(f.templateRoot, 'save-fault', `id: root
type: dag
dag:
  - id: fault
    type: node
    node_kind: save_fault
`)
    const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Fault', templateId: 'save-fault' })).json() as any
    const path = `${INSTANCES_PATH}/${created.id}`
    const id = created.snapshot.instances.find((item: any) => item.type === 'node').instanceId
    await untilDetail(f.url(path), detail => detail.executions?.[id]?.status === 'running')
    const held = `${f.storageRoot}-held`
    await rename(f.storageRoot, held)
    await writeFile(f.storageRoot, 'blocked storage path')
    const disposed = fiber.dispose()
    finish()
    await disposed
    assert.ok(errors.some(args => String(args[0]).includes('save')))
    const detail = await (await fetch(f.url(path))).json() as any
    assert.equal(detail.executions[id].status, 'running')
    assert.equal(detail.snapshot.instances.find((item: any) => item.instanceId === id).status, 'ready')
    await rm(f.storageRoot)
    await rename(held, f.storageRoot)
    await f.close()
    const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, {}, new Map([[node.kind, node]]))
    cleanups.push(restarted.close)
    const recovered = await (await fetch(restarted.url(path))).json() as any
    assert.equal(recovered.executions[id].status, 'unknown')
    assert.equal(calls, 1)
  } finally { console.error = previousError }
})


test('third-party success must satisfy declared outputs before it becomes an accepted business fact', async () => {
  const f = await fixture()
  const node: ServerNode = { kind: 'bad_output', requires: [], validate() {}, ready() { return undefined },
    action() { return { fact: { kind: 'bad_output', status: 'running' }, run: async () => ({ kind: 'bad_output', status: 'succeeded', output: { message: 42 } }) } },
    recover(fact) { return fact }, project() { return {} },
  }
  await f.ctx.plugin({ inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, 'bad-output-package', node) } })
  await putTemplate(f.templateRoot, 'bad-output', `id: root
type: dag
dag:
  - id: first
    type: node
    node_kind: bad_output
    output_schema:
      message: string
`)
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Bad output', templateId: 'bad-output' })).json() as any
  const id = created.snapshot.instances.find((item: any) => item.type === 'node').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  await postJson(f.url(`${path}/nodes/${id}/actions/start`), {})
  const settled = await untilDetail(f.url(path), detail => detail.executions?.[id]?.status !== 'running')
  assert.equal(settled.executions[id].status, 'failed')
  assert.equal(settled.executions[id].output, undefined)
  assert.equal(settled.snapshot.instances.find((item: any) => item.instanceId === id).status, 'ready')
  assert.match(settled.executions[id].error, /INVALID_FIELD_TYPE/)
})


test('public projection hides private business fields and cannot override contribution identity', async () => {
  const f = await fixture()
  const node: ServerNode = { kind: 'private_business', requires: [], validate() {}, ready() { return undefined },
    describe() { return { actions: [], source: 'foreign-package', token: 'forged-token' } },
    action() { return { fact: { kind: 'private_business', status: 'succeeded', business: { internal: 'not-for-browser', visible: 'public' }, output: {} } } },
    recover(fact) { return fact }, project() { return { visible: 'public' } },
  }
  await f.ctx.plugin({ name: 'private-node', inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, 'private-node', node) } })
  await putTemplate(f.templateRoot, 'private-node', 'id: root\ntype: dag\ndag:\n  - id: first\n    type: node\n    node_kind: private_business\n')
  const detail = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Private', templateId: 'private-node' })).json() as any
  const id = detail.snapshot.instances.find((item: any) => item.type === 'node').instanceId
  const result = await (await postJson(f.url(`${INSTANCES_PATH}/${detail.id}/nodes/${id}/actions/start`), {})).json() as any
  assert.equal(result.executions[id].visible, 'public')
  assert.equal(result.nodeViews[id].source, 'private-node')
  assert.notEqual(result.nodeViews[id].token, 'forged-token')
  assert.ok(!JSON.stringify(result).includes('not-for-browser'))
})

test('node-owned cleanup waits for the call and durable result, while waiting business does not hold unload', async () => {
  const f = await fixture()
  let finish!: () => void
  let cleaned = false
  const node: ServerNode = { kind: 'managed', requires: [], validate() {}, ready() { return undefined },
    action() { return { fact: { kind: 'managed', status: 'running' }, run: async () => { await new Promise<void>(resolve => { finish = resolve }); assert.equal(cleaned, false); return { kind: 'managed', status: 'waiting', business: { waiting: true } } } } },
    recover(fact) { return fact }, project() { return {} },
  }
  const plugin = f.ctx.plugin({ name: 'managed-node', inject: ['workflowNodes'], apply(c: Context) {
    c.workflowNodes.register(c, 'managed-node', node, { dispose: () => { cleaned = true } })
  } })
  await plugin
  await putTemplate(f.templateRoot, 'managed', 'id: root\ntype: dag\ndag:\n  - id: first\n    type: node\n    node_kind: managed\n')
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Managed', templateId: 'managed' })).json() as any
  const id = created.snapshot.instances.find((item: any) => item.type === 'node').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  await postJson(f.url(`${path}/nodes/${id}/actions/start`), {})
  const disposed = plugin.dispose()
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(cleaned, false)
  assert.equal((await postJson(f.url(`${path}/nodes/${id}/actions/start`), {})).status, 409)
  finish()
  await disposed
  assert.equal(cleaned, true)
  assert.equal((await (await fetch(f.url(path))).json() as any).executions[id].status, 'waiting')
  const replacement = f.ctx.plugin({ name: 'managed-node', inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, 'managed-node', node) } })
  await replacement
  await replacement.dispose()
  assert.equal((await (await fetch(f.url(path))).json() as any).executions[id].status, 'waiting')
})


test('saved business success survives a real DAG-state write fault and restart without a repeated call', async () => {
  let failed = false, calls = 0
  const f = await fixture({}, undefined, value => {
    const row = value as any
    if (!failed && Object.values(row.executions ?? {}).some((fact: any) => fact.status === 'succeeded') && row.snapshot.instances.some((item: any) => item.type === 'node' && item.status === 'completed')) {
      failed = true
      throw new Error('Injected DAG-state storage fault')
    }
  })
  const node: ServerNode = { kind: 'accepted', requires: [], validate() {}, ready() { return undefined },
    action() { calls++; return { fact: { kind: 'accepted', status: 'running' }, run: async () => ({ kind: 'accepted', status: 'succeeded', output: {} }) } },
    recover(fact) { return fact }, project() { return {} },
  }
  const install = (c: Context) => c.plugin({ name: 'accepted-node', inject: ['workflowNodes'], apply(owner: Context) { owner.workflowNodes.register(owner, 'accepted-node', node) } })
  await install(f.ctx)
  await putTemplate(f.templateRoot, 'accepted', 'id: root\ntype: dag\ndag:\n  - id: first\n    type: node\n    node_kind: accepted\n')
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-b', name: 'Accepted', templateId: 'accepted' })).json() as any
  assert.equal(created.workspaceId, 'workspace-b')
  const id = created.snapshot.instances.find((item: any) => item.type === 'node').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  await postJson(f.url(`${path}/nodes/${id}/actions/start`), {})
  const persisted = await untilDetail(f.url(path), detail => detail.executions?.[id]?.status === 'succeeded')
  assert.equal(failed, true)
  assert.equal(persisted.snapshot.instances.find((item: any) => item.instanceId === id).status, 'ready')
  await f.close()
  const restarted = await openHost(f.storageRoot, f.templateRoot, f.root, {}, new Map([[node.kind, node]]))
  cleanups.push(restarted.close)
  const recovered = await (await fetch(restarted.url(path))).json() as any
  assert.equal(recovered.snapshot.instances.find((item: any) => item.instanceId === id).status, 'completed')
  assert.equal(calls, 1)
})

test('a conflict in an already completed kind pauses the full definition and a stale action token is rejected after replacement', async () => {
  const f = await fixture()
  const node: ServerNode = { kind: 'first_completed', requires: [], validate() {}, ready() { return undefined },
    action() { return { fact: { kind: 'first_completed', status: 'succeeded', output: {} } } }, recover(fact) { return fact }, project() { return {} },
  }
  const install = (source: string) => f.ctx.plugin({ name: source, inject: ['workflowNodes'], apply(c: Context) { c.workflowNodes.register(c, source, node) } })
  const original = install('first-original'); await original
  await putTemplate(f.templateRoot, 'completed-dependency', 'id: root\ntype: dag\ndag:\n  - id: first\n    type: node\n    node_kind: first_completed\n  - id: second\n    type: node\n    node_kind: form\n  - type: edge\n    from: first\n    to: second\n')
  const created = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Completed dependency', templateId: 'completed-dependency' })).json() as any
  const firstId = created.snapshot.instances.find((item: any) => item.definitionId === 'first').instanceId
  const path = `${INSTANCES_PATH}/${created.id}`
  const result = await (await postJson(f.url(`${path}/nodes/${firstId}/actions/start`), {})).json() as any
  const secondId = result.snapshot.instances.find((item: any) => item.definitionId === 'second').instanceId
  const conflict = install('first-conflict'); await conflict
  const paused = await (await fetch(f.url(path))).json() as any
  assert.match(paused.incompatible, /conflict/)
  assert.equal((await postJson(f.url(`${path}/nodes/${secondId}/actions/submit`), {})).status, 409)
  await conflict.dispose()
  assert.equal((await (await fetch(f.url(path))).json() as any).incompatible, undefined)
  const fresh = await (await postJson(f.url(INSTANCES_PATH), { workspaceId: 'workspace-a', name: 'Stale', templateId: 'completed-dependency' })).json() as any
  const staleId = fresh.snapshot.instances.find((item: any) => item.definitionId === 'first').instanceId
  const token = fresh.nodeViews[staleId].token
  await original.dispose()
  await install('first-replacement')
  const stale = await fetch(f.url(`${INSTANCES_PATH}/${fresh.id}/nodes/${staleId}/actions/start`), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workflow-Node': token }, body: '{}' })
  assert.equal(stale.status, 409)
})
