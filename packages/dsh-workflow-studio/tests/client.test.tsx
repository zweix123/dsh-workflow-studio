import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkflowStudioPanel } from '../src/client/pages/workflow-studio/WorkflowStudioPanel.js'
import { getPluginStatus } from '../src/client/apis/plugin-status.js'
import { en, zh, type WorkflowTranslate } from '../src/client/locales/index.js'

const status = { plugin: 'dsh-workflow-studio', version: '0.1.0', status: 'ready' as const, serverTime: '2026-09-22T10:00:00.000Z' }

for (const [language, initial, other] of [['zh', zh, en], ['en', en, zh]] as const) {
  test(`studio supports accessible tabs and language switching without requests (${language})`, async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>')
    const globals = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'] as const
    const previous = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
    Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
    Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let requests = 0
    globalThis.fetch = async () => { requests++; throw new Error('Studio must not fetch') }
    const container = dom.window.document.getElementById('root')!
    const root = createRoot(container)
    let dictionary = initial
    const t: WorkflowTranslate = key => dictionary[key]
    const render = () => root.render(<WorkflowStudioPanel t={t} />)
    const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const panels = () => [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')]
    const assertSelection = (selected: number) => {
      assert.equal(tabs().length, 2)
      assert.equal(panels().length, 2)
      tabs().forEach((tab, index) => {
        const panel = panels()[index]
        assert.equal(tab.getAttribute('aria-selected'), String(index === selected))
        assert.equal(tab.tabIndex, index === selected ? 0 : -1)
        assert.equal(tab.getAttribute('aria-controls'), panel.id)
        assert.equal(panel.getAttribute('aria-labelledby'), tab.id)
        assert.equal(panel.hidden, index !== selected)
        assert.equal(panel.childNodes.length, 0)
      })
    }
    const press = async (key: string, selected: number) => {
      const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      await act(async () => { dom.window.document.activeElement!.dispatchEvent(event) })
      assert.ok(event.defaultPrevented)
      assertSelection(selected)
      assert.equal(dom.window.document.activeElement, tabs()[selected])
    }
    try {
      await act(async () => render())
      assert.equal(container.querySelector('h1')!.textContent, initial.title)
      assert.equal(container.querySelector('[role="tablist"]')!.getAttribute('aria-labelledby'), container.querySelector('h1')!.id)
      assert.deepEqual(tabs().map(tab => tab.textContent), [initial.instances, initial.templates])
      assertSelection(0)
      await act(async () => tabs()[1].click())
      assertSelection(1)
      tabs()[1].focus()
      const originalTabs = tabs()
      const originalPanels = panels()
      dictionary = other
      await act(async () => render())
      assert.equal(container.querySelector('h1')!.textContent, other.title)
      assert.deepEqual(tabs().map(tab => tab.textContent), [other.instances, other.templates])
      assertSelection(1)
      tabs().forEach((tab, index) => assert.equal(tab, originalTabs[index]))
      panels().forEach((panel, index) => assert.equal(panel, originalPanels[index]))
      assert.equal(dom.window.document.activeElement, originalTabs[1])
      await press('ArrowRight', 0)
      await press('ArrowLeft', 1)
      await press('Home', 0)
      await press('End', 1)
      await press('ArrowLeft', 0)
      await press('ArrowRight', 1)
      const tabKey = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      await act(async () => { tabs()[1].dispatchEvent(tabKey) })
      assert.equal(tabKey.defaultPrevented, false)
      assertSelection(1)
      dictionary = initial
      await act(async () => render())
      assertSelection(1)
      assert.deepEqual(tabs().map(tab => tab.textContent), [initial.instances, initial.templates])
      await act(async () => root.render(null))
      await act(async () => render())
      assertSelection(0)
      // Multiple mounted copies must not share tab/panel IDs.
      await act(async () => root.render(<><WorkflowStudioPanel t={t} /><WorkflowStudioPanel t={t} /></>))
      const ids = [...container.querySelectorAll('[id]')].map(element => element.id)
      assert.equal(new Set(ids).size, ids.length)
      assert.equal(requests, 0)
    } finally {
      await act(async () => root.unmount())
      dom.window.close()
      for (const [name, descriptor] of previous) {
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
