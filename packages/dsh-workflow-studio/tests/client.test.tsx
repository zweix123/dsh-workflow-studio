import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionPanel } from '../src/client/features/connection/ConnectionPanel.js'
import { getPluginStatus } from '../src/client/apis/plugin-status.js'
import { en, zh, type WorkflowTranslate } from '../src/client/locales/index.js'

const status = { plugin: 'dsh-workflow-studio', version: '0.1.0', status: 'ready' as const, serverTime: '2026-09-22T10:00:00.000Z' }

for (const [language, initial, other] of [['zh', zh, en], ['en', en, zh]] as const) {
test(`panel handles connection states and language switching (${language})`, async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  let complete: (value: typeof status) => void = () => {}
  let fail: (error: Error) => void = () => {}
  let signal: AbortSignal
  const load = (next: AbortSignal) => {
    signal = next
    return new Promise<typeof status>((resolve, reject) => { complete = resolve; fail = reject })
  }
  const click = () => container.querySelector('button')!.click()
  let dictionary = initial
  const t: WorkflowTranslate = key => dictionary[key]
  const render = () => root.render(<ConnectionPanel loadStatus={load} t={t} />)
  try {
    await act(async () => render())
    for (const key of ['title', 'subtitle', 'description', 'idle', 'check', 'scope'] as const) {
      assert.ok(container.textContent!.includes(initial[key]), key)
    }
    await act(async () => click())
    assert.ok(container.querySelector('button')!.disabled)
    assert.equal(container.querySelector('[role="status"]')!.textContent, initial.checking)
    dictionary = other
    await act(async () => render())
    assert.equal(container.querySelector('[role="status"]')!.textContent, other.checking)
    assert.equal(signal!.aborted, false)
    await act(async () => complete(status))
    assert.equal(container.querySelector('[role="status"]')!.textContent, other.ready)
    dictionary = initial
    await act(async () => render())
    assert.equal(container.querySelector('[role="status"]')!.textContent, initial.ready)
    assert.deepEqual([...container.querySelectorAll('dt')].map(node => node.textContent), [initial.version, initial.serverTime])
    assert.match(container.textContent!, /0\.1\.0/)
    assert.equal(container.querySelector('time')!.dateTime, status.serverTime)
    await act(async () => click())
    await act(async () => fail(new Error('offline')))
    assert.equal(container.querySelector('[role="status"]')!.textContent, initial.failed)
    dictionary = other
    await act(async () => render())
    assert.equal(container.querySelector('[role="status"]')!.textContent, other.failed)
    assert.equal(container.querySelector('button')!.disabled, false)
    await act(async () => click())
    await act(async () => complete(status))
    assert.equal(container.querySelector('[role="status"]')!.textContent, other.ready)
    await act(async () => click())
    await act(async () => root.unmount())
    assert.ok(signal!.aborted)
    await act(async () => complete(status))
  } finally {
    dom.window.close()
    for (const [name, descriptor] of [['window', previousWindow], ['document', previousDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
}

test('API validates HTTP status and protocol payload', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/dsh-workflow-studio/status')
      assert.equal(init?.cache, 'no-store')
      return Response.json(status)
    }
    assert.deepEqual(await getPluginStatus(), status)
    globalThis.fetch = async () => new Response('unavailable', { status: 503 })
    await assert.rejects(getPluginStatus(), /HTTP 503/)
    globalThis.fetch = async () => Response.json({ ...status, serverTime: 'invalid' })
    await assert.rejects(getPluginStatus(), /Unexpected plugin status/)
  } finally {
    globalThis.fetch = original
  }
})
