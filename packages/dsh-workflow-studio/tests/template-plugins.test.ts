import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, parseDocument } from 'yaml'
import * as nodes from '../../dsh-workflow-node/src/server.js'
import type { ServerNode } from 'dsh-workflow-node/contract'
import * as studio from '../lib/index.js'
import * as loader from '../../dsh-workflow-template/src/index.js'
import { INSTANCES_PATH, TEMPLATES_PATH } from '../src/shared/constants.js'

async function host() {
  const root = await mkdtemp(join(tmpdir(), 'template-plugins-'))
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(storageJson, { root: join(root, 'storage') })
  await ctx.plugin(storageDomain, { backend: 'json' })
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  ctx.provide('workspaceRegistry', { get: (id: string) => ['a', 'b'].includes(id) ? { id, path: root } : undefined } as never)
  // The filesystem/module resolver is the external boundary; real profile resolution is accepted in rc.1 below.
  ctx.provide('loader', { internal: { version: 'v1', resolve: async (specifier: string) => ({ url: pathToFileURL(join(root, specifier)).href }) } } as never)
  await ctx.plugin(nodes)
  await ctx.plugin(studio)
  const request = async (path: string, body?: unknown) => fetch(`http://127.0.0.1:${ctx.webServer.port}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return {
    ctx, root, request,
    async declare(directory: string, yaml: string) {
      await mkdir(join(root, directory), { recursive: true })
      await writeFile(join(root, directory, 'workflow.yaml'), yaml)
      const fiber = ctx.plugin(loader, { directory })
      await fiber
      return fiber
    },
    async close() { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) },
  }
}

test('template identity and display name come from loaded YAML across workspaces', async () => {
  const h = await host()
  try {
    await h.declare('@acme/workflows/templates/directory', 'id: acme-review\nname: Team review\ntype: dag\ndag: []\n')
    const catalog = await (await h.request(TEMPLATES_PATH)).json()
    assert.equal(catalog.templates.length, 1)
    assert.equal(catalog.templates[0].id, 'acme-review')
    assert.equal(catalog.templates[0].name, 'Team review')
    assert.equal(catalog.templates[0].source, '@acme/workflows/templates/directory')
    const detail = await (await h.request(`${TEMPLATES_PATH}/acme-review`)).json()
    assert.equal(detail.name, 'Team review')
    for (const workspaceId of ['a', 'b']) {
      const response = await h.request(INSTANCES_PATH, { workspaceId, name: 'Run', templateId: 'acme-review' })
      assert.equal(response.status, 201)
      assert.equal((await response.json()).definition.name, 'Team review')
    }
  } finally { await h.close() }
})


test('duplicate IDs disable every declaration, removing one restores the other without touching snapshots', async () => {
  const h = await host()
  try {
    const first = await h.declare('@acme/workflows/templates/first', 'id: shared\nname: First name\ntype: dag\ndag: []\n')
    const created = await (await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Original', templateId: 'shared' })).json()
    const duplicate = await h.declare('@other/workflows/templates/second', 'id: shared\nname: Second name\ntype: dag\ndag: []\n')
    const rows = (await (await h.request(TEMPLATES_PATH)).json()).templates
    assert.equal(rows.length, 2)
    for (const row of rows) assert.match(row.error, /Conflicting template ID.*first.*second/)
    assert.equal((await h.request(`${TEMPLATES_PATH}/shared`)).status, 422)
    assert.equal((await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Blocked', templateId: 'shared' })).status, 422)
    await duplicate.dispose()
    assert.equal((await h.request(`${TEMPLATES_PATH}/shared`)).status, 200)
    await first.dispose()
    assert.equal((await h.request(`${TEMPLATES_PATH}/shared`)).status, 404)
    const saved = await (await h.request(`${INSTANCES_PATH}/${created.id}`)).json()
    assert.equal(saved.definition.name, 'First name')
    assert.equal(saved.templateName, 'First name')
  } finally { await h.close() }
})


const external: ServerNode = {
  kind: 'external', requires: [], validate() {}, ready() { return undefined },
  action() { return { fact: { kind: 'external', status: 'succeeded', output: {} } } },
  recover(fact) { return fact }, project() { return {} },
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('missing and conflicting node types revalidate loaded definitions, never reread YAML', async () => {
  const h = await host()
  const directory = '@acme/workflows/templates/waiting'
  try {
    const declaration = await h.declare(directory, 'id: waiting\nname: Loaded name\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: external\n')
    let row = (await (await h.request(TEMPLATES_PATH)).json()).templates[0]
    assert.match(row.error, /external.*missing/)
    assert.equal((await h.request(`${TEMPLATES_PATH}/waiting`)).status, 422)
    await writeFile(join(h.root, directory, 'workflow.yaml'), 'id: waiting\nname: New file name\ntype: dag\ndag: []\n')
    const contribute = (name: string) => h.ctx.plugin({ name, inject: ['workflowNodes'], apply(owner: Context) { owner.workflowNodes.register(owner, name, external) } })
    const node = contribute('external-one'); await node; await settle()
    row = (await (await h.request(TEMPLATES_PATH)).json()).templates[0]
    assert.equal(row.name, 'Loaded name')
    assert.equal(row.error, undefined)
    const original = await (await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Original', templateId: 'waiting' })).json()
    assert.equal(original.definition.dag[0].node_kind, 'external')
    const conflict = contribute('external-two'); await conflict; await settle()
    row = (await (await h.request(TEMPLATES_PATH)).json()).templates[0]
    assert.match(row.error, /external.*conflict.*external-one.*external-two/)
    assert.equal((await h.request(`${TEMPLATES_PATH}/waiting`)).status, 422)
    assert.equal((await h.request(INSTANCES_PATH, { workspaceId: 'b', name: 'Blocked', templateId: 'waiting' })).status, 422)
    await conflict.dispose(); await settle()
    assert.equal((await h.request(`${TEMPLATES_PATH}/waiting`)).status, 200)
    await declaration.dispose()
    const reload = h.ctx.plugin(loader, { directory }); await reload
    assert.equal((await (await h.request(`${TEMPLATES_PATH}/waiting`)).json()).name, 'New file name')
    const saved = await (await h.request(`${INSTANCES_PATH}/${original.id}`)).json()
    assert.equal(saved.definition.name, 'Loaded name')
    await node.dispose(); await settle()
    assert.match((await (await h.request(`${INSTANCES_PATH}/${original.id}`)).json()).incompatible, /external/)
    // The reloaded template no longer needs external; the saved instance still does.
    assert.equal((await h.request(`${TEMPLATES_PATH}/waiting`)).status, 200)
  } finally { await h.close() }
})


test('load errors stay visible, metadata is required, and reload failures do not roll back definitions', async () => {
  const h = await host()
  try {
    const directory = '@acme/workflows/templates/reload'
    const active = await h.declare(directory, 'id: reload\nname: Old name\ntype: dag\ndag: []\n')
    assert.throws(() => active.update({ directory: '' }), /directory/)
    assert.equal((await h.request(`${TEMPLATES_PATH}/reload`)).status, 200)
    await active.dispose()
    await h.declare(directory, 'id: reload\nname: Broken name\ntype: dag\ndag: [oops]\n')
    assert.equal((await h.request(`${TEMPLATES_PATH}/reload`)).status, 422)
    const missing = h.ctx.plugin(loader, { directory: '@acme/workflows/templates/absent' }); await missing
    for (const [label, yaml] of [
      ['id-missing', 'name: Named\ntype: dag\ndag: []\n'],
      ['id-blank', 'id: "  "\nname: Named\ntype: dag\ndag: []\n'],
      ['name-missing', 'id: unnamed\ntype: dag\ndag: []\n'],
      ['name-blank', 'id: blank-name\nname: "  "\ntype: dag\ndag: []\n'],
      ['yaml-broken', 'id: [\n'],
    ]) await h.declare(`@acme/workflows/templates/${label}`, yaml)
    const rows = (await (await h.request(TEMPLATES_PATH)).json()).templates
    assert.equal(rows.length, 7)
    assert.ok(rows.every((row: any) => row.error && row.source))
    assert.equal(rows.find((row: any) => row.source.endsWith('name-missing')).name, undefined)
    assert.match(rows.find((row: any) => row.source.endsWith('absent')).error, /ENOENT/)
  } finally { await h.close() }
})


test('template contributions and node validation remain isolated between profiles', async () => {
  const first = await host(), second = await host()
  try {
    await first.declare('@acme/workflows/templates/one', 'id: profile-template\nname: First profile\ntype: dag\ndag: []\n')
    await second.declare('@acme/workflows/templates/two', 'id: profile-template\nname: Second profile\ntype: dag\ndag:\n  - id: task\n    type: node\n    node_kind: external\n')
    await first.ctx.plugin({ name: 'only-first', inject: ['workflowNodes'], apply(owner: Context) { owner.workflowNodes.register(owner, 'only-first', external) } })
    assert.equal((await (await first.request(`${TEMPLATES_PATH}/profile-template`)).json()).name, 'First profile')
    const rows = (await (await second.request(TEMPLATES_PATH)).json()).templates
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'Second profile')
    assert.match(rows[0].error, /external.*missing/)
  } finally { await Promise.all([first.close(), second.close()]) }
})


async function installBuiltinNodes(h: Awaited<ReturnType<typeof host>>) {
  h.ctx.provide('shell', {} as never)
  h.ctx.provide('sandboxPolicy', {} as never)
  h.ctx.provide('sessionController', {} as never)
  for (const node of [await import('../../dsh-workflow-node-bash/lib/server.js'), await import('../../dsh-workflow-node-form/lib/server.js'), await import('../../dsh-workflow-node-session-agent/lib/server.js')]) await h.ctx.plugin(node)
}

test('the Chinese Matt Pocock default template uses the public loader and registration contract', async () => {
  const h = await host()
  try {
    await installBuiltinNodes(h)
    const patch = parse(await readFile(new URL('../../dsh-workflow-bundle/cordis.patch.yml', import.meta.url), 'utf8'))
    const templates = patch[0].insert.filter((entry: any) => entry.name === 'dsh-workflow-template')
    const names = ['matt-pocock-wayfinder-workflow.zh']
    assert.deepEqual(templates.map((entry: any) => entry.config.directory), names.map(name => `dsh-workflow-studio/templates/${name}`))
    for (const name of names) await h.declare(`dsh-workflow-studio/templates/${name}`, await readFile(new URL(`../templates/${name}/workflow.yaml`, import.meta.url), 'utf8'))
    const rows = (await (await h.request(TEMPLATES_PATH)).json()).templates
    assert.deepEqual(rows.map((row: any) => row.id), names)
    assert.ok(rows.every((row: any) => row.name && !row.error))
    const response = await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Default run', templateId: 'matt-pocock-wayfinder-workflow.zh' })
    assert.equal(response.status, 201)
    assert.equal((await response.json()).definition.name, 'Matt-Pocock-工程工作流')
  } finally { await h.close() }
})


test('loaded templates validate node configuration by kind and preserve unknown business fields', async () => {
  const h = await host()
  try {
    await installBuiltinNodes(h)
    const yaml = (id: string, fragment: string) => `id: ${id}\nname: ${id}\ntype: dag\ndag:\n  - id: task\n    type: node\n    ${fragment}\n`
    await h.declare('@acme/workflows/templates/valid-bash', yaml('valid-bash', 'node_kind: bash\n    command: "  "\n    custom_note: keep\n    prompt: 42'))
    await h.declare('@acme/workflows/templates/valid-agent', yaml('valid-agent', 'node_kind: session_agent\n    prompt: ""\n    command: null'))
    const detail = await (await h.request(`${TEMPLATES_PATH}/valid-bash`)).json()
    assert.equal(detail.definition.dag[0].custom_note, 'keep')
    assert.equal(detail.definition.dag[0].prompt, 42)
    const created = await (await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Preserved fields', templateId: 'valid-bash' })).json()
    assert.equal(created.definition.dag[0].custom_note, 'keep')
    assert.equal((await h.request(`${TEMPLATES_PATH}/valid-agent`)).status, 200)
    for (const [id, fragment, expected] of [
      ['command-missing', 'node_kind: bash', /command/],
      ['command-null', 'node_kind: bash\n    command: null', /command/],
      ['auto-invalid', 'node_kind: bash\n    command: ""\n    is_auto_start: yes', /is_auto_start/],
      ['prompt-missing', 'node_kind: session_agent', /prompt/],
      ['prompt-invalid', 'node_kind: session_agent\n    prompt: 42', /prompt/],
    ] as const) {
      await h.declare(`@acme/workflows/templates/${id}`, yaml(id, fragment))
      const row = (await (await h.request(TEMPLATES_PATH)).json()).templates.find((row: any) => row.id === id)
      assert.match(row.error, expected)
      assert.equal((await h.request(`${TEMPLATES_PATH}/${id}`)).status, 422)
      assert.equal((await h.request(INSTANCES_PATH, { workspaceId: 'a', name: id, templateId: id })).status, 422)
    }
  } finally { await h.close() }
})


test('one third-party bundle combines templates and nodes, template removal keeps execution but node removal pauses the whole snapshot', async () => {
  const h = await host()
  try {
    await h.ctx.plugin(await import('../../dsh-workflow-node-form/lib/server.js'))
    const yaml = await readFile(new URL('./fixtures/joint-bundle/templates/chain/workflow.yaml', import.meta.url), 'utf8')
    // Same declarations as the local bundle: the template loads before its node.
    const declaration = await h.declare('@example/workflow-joint/templates/chain', yaml)
    assert.match((await (await h.request(TEMPLATES_PATH)).json()).templates[0].error, /joint_echo.*missing/)
    const nodePlugin = await import(new URL('./fixtures/joint-bundle/server.js', import.meta.url).href)
    const provider = h.ctx.plugin(nodePlugin); await provider; await settle()
    const created = await (await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Joint run', templateId: 'joint-chain' })).json()
    const path = `${INSTANCES_PATH}/${created.id}`
    const echo = created.snapshot.instances.find((item: any) => item.definitionId === 'echo')
    assert.equal(created.nodeViews[echo.instanceId].actions[0].label.text, 'Echo joint')
    await declaration.dispose()
    assert.equal((await h.request(`${TEMPLATES_PATH}/joint-chain`)).status, 404)
    assert.equal((await h.request(`${path}/nodes/${echo.instanceId}/actions/echo`, {})).status, 200)
    let detail = await (await h.request(path)).json()
    const confirm = detail.snapshot.instances.find((item: any) => item.definitionId === 'confirm')
    assert.deepEqual(confirm.input, { message: 'loaded joint message' })
    await provider.dispose(); await settle()
    detail = await (await h.request(path)).json()
    assert.match(detail.incompatible, /joint_echo/)
    // Even the completed node type remains required by the full definition.
    assert.equal((await h.request(`${path}/nodes/${confirm.instanceId}/actions/submit`, { message: 'confirmed' })).status, 409)
    const replacement = h.ctx.plugin(nodePlugin); await replacement; await settle()
    assert.equal((await h.request(`${path}/nodes/${confirm.instanceId}/actions/submit`, { message: 'confirmed' })).status, 200)
    detail = await (await h.request(path)).json()
    assert.deepEqual(detail.snapshot.instances.find((item: any) => item.definitionId === 'echo').output, { message: 'loaded joint message' })
    assert.deepEqual(detail.snapshot.instances.find((item: any) => item.definitionId === 'confirm').output, { message: 'confirmed' })
    assert.equal(detail.definition.name, 'Joint node and template')
  } finally { await h.close() }
})


test('the documented echo bundle exposes a selectable template and executes its node after ordinary declarations load', async () => {
  const h = await host()
  try {
    await h.ctx.plugin(await import('../../dsh-workflow-node-form/lib/server.js'))
    const base = new URL('../../../examples/echo-node/', import.meta.url)
    const manifest = JSON.parse(await readFile(new URL('package.json', base), 'utf8'))
    const patch = parseDocument(await readFile(new URL(manifest.dsh.bundle.patch, base), 'utf8')).toJS()
    for (const declaration of patch[0].insert) {
      if (declaration.name === 'dsh-workflow-template') {
        const resource = declaration.config.directory.slice(manifest.name.length) + '/workflow.yaml'
        const file = manifest.exports['.' + resource]
        await h.declare(declaration.config.directory, await readFile(new URL(file, base), 'utf8'))
      } else await h.ctx.plugin(await import(new URL(declaration.name, base).href))
    }
    await settle()
    const catalog = await (await h.request(TEMPLATES_PATH)).json()
    assert.equal(catalog.templates.length, 1)
    assert.equal(catalog.templates[0].id, 'example-echo')
    assert.equal(catalog.templates[0].error, undefined)
    const response = await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Author example', templateId: 'example-echo' })
    assert.equal(response.status, 201)
    const created = await response.json()
    const echo = created.snapshot.instances.find((item: any) => item.definitionId === 'echo')
    const path = `${INSTANCES_PATH}/${created.id}`
    assert.equal((await h.request(`${path}/nodes/${echo.instanceId}/actions/start`, {})).status, 200)
    const detail = await (await h.request(path)).json()
    assert.deepEqual(detail.snapshot.instances.find((item: any) => item.definitionId === 'answer').input, { message: 'Hello from a third-party node' })
  } finally { await h.close() }
})


test('a replacement node rejects incompatible saved definitions or facts, keeps results readable, and resumes when compatible', async () => {
  const h = await host()
  try {
    await h.ctx.plugin(await import('../../dsh-workflow-node-form/lib/server.js'))
    const original = await import(new URL('./fixtures/joint-bundle/server.js', import.meta.url).href)
    let provider = h.ctx.plugin(original); await provider
    await h.declare('@example/workflow-joint/templates/chain', await readFile(new URL('./fixtures/joint-bundle/templates/chain/workflow.yaml', import.meta.url), 'utf8'))
    const created = await (await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Upgrade', templateId: 'joint-chain' })).json()
    const path = `${INSTANCES_PATH}/${created.id}`
    const echo = created.snapshot.instances.find((item: any) => item.definitionId === 'echo')
    await h.request(`${path}/nodes/${echo.instanceId}/actions/echo`, {})
    const saved = await (await h.request(path)).json()
    const confirm = saved.snapshot.instances.find((item: any) => item.definitionId === 'confirm')
    for (const rejection of [
      { validate() { throw new Error('Upgraded definition unsupported') } },
      { validateFact() { throw new Error('Upgraded fact unsupported') } },
    ]) {
      await provider.dispose()
      provider = h.ctx.plugin({ name: original.name, inject: original.inject, apply(owner: Context) {
        owner.workflowNodes.register(owner, original.name, { ...original.node, ...rejection })
      } }); await provider; await settle()
      const visible = await (await h.request(path)).json()
      assert.match(visible.incompatible, /Upgraded (definition|fact) unsupported/)
      assert.deepEqual(visible.snapshot, saved.snapshot)
      assert.deepEqual(visible.executions[echo.instanceId].output, { message: 'loaded joint message' })
      const blocked = await h.request(`${path}/nodes/${confirm.instanceId}/actions/submit`, { message: 'confirmed' })
      assert.equal(blocked.status, 409)
      assert.equal((await blocked.json()).error.code, 'instance-incompatible')
    }
    await provider.dispose()
    provider = h.ctx.plugin(original); await provider; await settle()
    assert.equal((await h.request(`${path}/nodes/${confirm.instanceId}/actions/submit`, { message: 'confirmed' })).status, 200)
    const restored = await (await h.request(path)).json()
    assert.equal(restored.incompatible, undefined)
    assert.deepEqual(restored.executions[echo.instanceId].output, { message: 'loaded joint message' })
  } finally { await h.close() }
})


test('the public kind query exposes saved identities as copies that cannot modify instance facts or definitions', async () => {
  const h = await host()
  try {
    await h.ctx.plugin(await import('../../dsh-workflow-node-form/lib/server.js'))
    await h.ctx.plugin(await import(new URL('./fixtures/joint-bundle/server.js', import.meta.url).href))
    await h.declare('@example/workflow-joint/templates/chain', await readFile(new URL('./fixtures/joint-bundle/templates/chain/workflow.yaml', import.meta.url), 'utf8'))
    const created = await (await h.request(INSTANCES_PATH, { workspaceId: 'a', name: 'Read only', templateId: 'joint-chain' })).json()
    const path = `${INSTANCES_PATH}/${created.id}`
    const echo = created.snapshot.instances.find((item: any) => item.definitionId === 'echo')
    await h.request(`${path}/nodes/${echo.instanceId}/actions/echo`, {})
    const records = h.ctx.workflowNodes.records('joint_echo')
    assert.equal(records.length, 1)
    assert.equal(records[0].instanceId, created.id)
    assert.equal(records[0].nodeInstanceId, echo.instanceId)
    assert.equal(records[0].workspaceId, 'a')
    assert.deepEqual(h.ctx.workflowNodes.records('unrelated'), [])
    records[0].definition.message = 'changed copy'
    records[0].fact.output!.message = 'changed copy'
    records[0].fact.status = 'failed'
    const visible = await (await h.request(path)).json()
    assert.equal(visible.definition.dag[0].message, 'loaded joint message')
    assert.equal(visible.executions[echo.instanceId].status, 'succeeded')
    assert.deepEqual(visible.executions[echo.instanceId].output, { message: 'loaded joint message' })
    assert.deepEqual(h.ctx.workflowNodes.records('joint_echo')[0].fact.output, { message: 'loaded joint message' })
  } finally { await h.close() }
})
