import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as plugin from '../lib/index.js'
import { STATUS_PATH } from '../src/shared/constants.js'

test('built host plugin serves HTTP and removes its route on disposal', async () => {
  const ctx = new Context()
  try {
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
    await fiber.dispose()
    assert.equal((await fetch(url)).status, 404)
    const reloaded = ctx.plugin(plugin)
    await reloaded
    assert.equal((await fetch(url)).status, 200)
  } finally {
    await ctx.fiber.dispose()
  }
})
