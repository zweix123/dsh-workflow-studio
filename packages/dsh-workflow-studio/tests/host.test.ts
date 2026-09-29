import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as plugin from '../lib/index.js'
import { INSTANCES_PATH, STATUS_PATH, TEMPLATES_PATH } from '../src/shared/constants.js'

test('built host plugin serves HTTP and removes its route on disposal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-workflow-plugin-'))
  const previousHome = process.env.DSH_HOME
  const home = join(root, 'home')
  process.env.DSH_HOME = home
  const ctx = new Context()
  try {
    await ctx.plugin(Storage)
    await ctx.plugin(storageJson, { root: join(root, 'storage') })
    await ctx.plugin(storageDomain, { backend: 'json' })
    ctx.provide('workspaceRegistry', { get: () => undefined } as never)
    ctx.provide('shell', {} as never)
    ctx.provide('sandboxPolicy', {} as never)
    ctx.provide('sessionController', {} as never)
    await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const fiber = ctx.plugin(plugin)
    await fiber
    const url = `http://127.0.0.1:${ctx.webServer.port}${STATUS_PATH}`
    const response = await fetch(url)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const data = await response.json()
    assert.equal(data.plugin, 'dsh-workflow-studio')
    assert.equal(data.version, '0.1.0')
    assert.equal(data.status, 'ready')
    assert.ok(Math.abs(Date.now() - Date.parse(data.serverTime)) < 5000)
    const denied = await fetch(url, { method: 'POST' })
    assert.equal(denied.status, 405)
    assert.equal(denied.headers.get('allow'), 'GET')
    await denied.text()
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${ctx.webServer.port}${INSTANCES_PATH}`)).json(), [])
    const catalog = await (await fetch(`http://127.0.0.1:${ctx.webServer.port}${TEMPLATES_PATH}`)).json()
    assert.deepEqual(catalog.templates, [
      { id: 'github-spec-kit-workflow' },
      { id: 'github-spec-kit-workflow.zh' },
      { id: 'matt-pocock-wayfinder-workflow' },
      { id: 'matt-pocock-wayfinder-workflow.zh' },
      { id: 'openspec-workflow' },
      { id: 'openspec-workflow.zh' },
    ])
    const builtin = join(home, 'dsh-workflow-studio', 'templates', 'matt-pocock-wayfinder-workflow', 'workflow.yaml')
    const bundled = await readFile(new URL('../templates/matt-pocock-wayfinder-workflow/workflow.yaml', import.meta.url), 'utf8')
    assert.equal(await readFile(builtin, 'utf8'), bundled)
    await writeFile(builtin, '# changed locally\n')
    await fiber.dispose()
    assert.equal((await fetch(url)).status, 404)
    assert.equal((await fetch(`http://127.0.0.1:${ctx.webServer.port}${INSTANCES_PATH}`)).status, 404)
    const reloaded = ctx.plugin(plugin)
    await reloaded
    assert.equal((await fetch(url)).status, 200)
    assert.equal(await readFile(builtin, 'utf8'), bundled)
  } finally {
    await ctx.fiber.dispose()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(root, { recursive: true, force: true })
  }
})
