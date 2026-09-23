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
import { WorkflowInstanceService } from '../src/host/service/workflow-instance-service.js'
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
