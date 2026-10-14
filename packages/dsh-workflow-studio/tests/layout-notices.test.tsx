import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LayoutNotices } from '../src/client/pages/workflow-studio/LayoutNotices.js'
import { en, zh, type WorkflowTranslate } from './locales.js'
import type { LayoutReport } from '../src/shared/layout.js'

const report: LayoutReport = { layers: [
  { path: ['root'], direction: 'vertical', starts: [{ startAt: 'publish', direction: 'horizontal' }], order: ['a', 'publish'], issues: [] },
  { path: ['root', 'inner'], direction: 'horizontal', starts: [], order: ['a', 'b'], issues: [
    { level: 'WARN', path: ['root', 'inner'], startAt: 'b', code: 'unsafeStart', suggestion: 'publish' },
  ] },
], issues: [{ level: 'WARN', path: ['root', 'inner'], startAt: 'b', code: 'unsafeStart', suggestion: 'publish' }] }

for (const dictionary of [zh, en]) test(`layout warnings expand and show localized copy; valid layouts stay silent (${dictionary === zh ? 'zh' : 'en'})`, async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const oldAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const t: WorkflowTranslate = key => dictionary[key]
  try {
    await act(async () => root.render(<LayoutNotices report={report} t={t} surface="create" />))
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
    assert.equal(buttons.length, 1)
    assert.equal(container.querySelector('[data-level="info"]'), null)
    assert.equal(buttons[0]!.getAttribute('aria-expanded'), 'false')
    assert.match(container.textContent!, new RegExp(dictionary.layoutCanCreate))
    buttons[0]!.focus()
    assert.equal(dom.window.document.activeElement, buttons[0])
    await act(async () => buttons[0]!.click())
    assert.equal(buttons[0]!.getAttribute('aria-expanded'), 'true')
    assert.match(container.textContent!, /start_at: b/)
    assert.match(container.textContent!, new RegExp(dictionary.layoutUnsafeStart))
    await act(async () => buttons[0]!.click())
    assert.equal(buttons[0]!.getAttribute('aria-expanded'), 'false')
    assert.doesNotMatch(container.textContent!, /start_at: b/)
    for (const surface of ['template', 'create', 'instance'] as const) {
      await act(async () => root.render(<LayoutNotices report={{ layers: [report.layers[0]!], issues: [] }} t={t} surface={surface} />))
      assert.equal(container.innerHTML, '')
    }
    await act(async () => root.render(<LayoutNotices report={{ layers: [], issues: [] }} t={t} surface="instance" />))
    assert.equal(container.textContent, '')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, old] of [['window', oldWindow], ['document', oldDocument], ['IS_REACT_ACT_ENVIRONMENT', oldAct]] as const) {
      if (old) Object.defineProperty(globalThis, name, old)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
