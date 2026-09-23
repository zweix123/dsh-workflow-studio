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
import { compile, type SavedExecution } from '../src/host/dag-engine/index.js'
import { createWorkflowInstancesRoute } from '../src/host/routes/workflow-instances.js'
import { INSTANCES_PATH, TEMPLATES_PATH } from '../src/shared/constants.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workflow-studio-'))
  const templateRoot = join(root, 'home', 'dsh-workflow-studio', 'templates')
  const storageRoot = join(root, 'storage')
  await mkdir(templateRoot, { recursive: true })
  const host = await openHost(storageRoot, templateRoot, root)
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

async function openHost(storageRoot: string, templateRoot: string, workspacePath: string) {
  const ctx = new Context()
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: storageRoot })
  await ctx.plugin(storageDomain, { backend: 'json' })
  ctx.provide('workspaceRegistry', {
    get: (id: string) => id === 'workspace-a' ? { id, path: workspacePath, title: 'Workspace A' } : undefined,
  } as never)
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
    input_schema:
      topic: string
    output_schema:
      result: string
  - id: finish
    type: node
    input_schema:
      result: string
  - type: edge
    from: draft
    to: finish
`

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
  await putTemplate(f.templateRoot, 'plain', 'id: root\ntype: dag\ndag:\n  - id: task\n    type: node\n')
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
  - id: each
    type: node
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
    input_schema:
      title: string
    output_schema:
      done: string
  - id: finish
    type: node
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
    output_schema:
      enabled: boolean
  - id: finish
    type: node
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
  assert.deepEqual(await (await fetch(f.url(path))).json(), created)
})
