import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { WorkflowStudioPanel } from '../src/client/pages/workflow-studio/WorkflowStudioPanel.js'
import { zh } from '../src/client/locales/zh.js'

test('template tab rescans, shows invalid entries, and reuses and closes read-only detail tabs', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const names = ['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'] as const
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = handle => clearTimeout(handle)
  const definition = { id: 'root', type: 'dag', description: '原始描述', dag: [
    { id: 'write', type: 'node', node_kind: 'chat', prompt: '完整提示词', output_schema: { answer: 'string' } },
    { id: 'review', type: 'node', node_kind: 'bash', command: 'echo ok' },
    { type: 'edge', from: 'write', to: 'review', if: '$.answer == "yes"' },
  ] }
  let catalogLoads = 0
  let detailLoads = 0
  let catalogMode: 'normal' | 'empty' | 'error' = 'normal'
  globalThis.fetch = async url => {
    if (url === '/api/dsh-workflow-studio/instances') return Response.json([])
    if (url === '/api/dsh-workflow-studio/templates') {
      catalogLoads++
      if (catalogMode === 'error') return new Response('unavailable', { status: 503 })
      return Response.json({ directory: '/templates/<template-id>/workflow.yaml', templates: catalogMode === 'empty' ? [] : [{ id: 'broken', error: 'Missing id' }, { id: 'good' }] })
    }
    if (url === '/api/dsh-workflow-studio/templates/good') {
      detailLoads++
      return Response.json({ id: 'good', definition })
    }
    return new Response('missing', { status: 404 })
  }
  const useWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector({ items: [], phase: 'ready', state: 'idle' } as WorkspaceSnapshot)
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  try {
    await act(async () => root.render(<WorkflowStudioPanel t={key => zh[key]} useWorkspaces={useWorkspaces} onOpenSession={() => {}} />))
    await act(async () => tabs()[1]!.click())
    assert.equal(catalogLoads, 1)
    const invalid = container.querySelector<HTMLButtonElement>('[aria-label="打开模板 broken"]')!
    assert.equal(invalid.disabled, true)
    assert.match(invalid.closest('li')!.textContent!, /Missing id/)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="打开模板 good"]')!.click())
    assert.equal(detailLoads, 1)
    assert.equal(tabs().length, 3)
    assert.equal(tabs()[2]!.textContent, 'good')
    await act(async () => container.querySelector<HTMLButtonElement>('.dsh-workflow-template-detail .dsh-workflow-detail-header button')!.click())
    const inspector = container.querySelector('.dsh-workflow-template-inspector')!
    assert.match(inspector.textContent!, /description原始描述/)
    assert.deepEqual([...inspector.querySelectorAll('dt')].map(node => node.textContent), ['id', 'type', 'description'])
    assert.doesNotMatch(inspector.textContent!, /完整提示词/)
    assert.equal(container.querySelector('.dsh-workflow-template-detail [aria-label="模板 DAG"]') !== null, true)
    assert.equal(container.querySelector('.dsh-workflow-template-detail [aria-label="执行"]'), null)
    const writeDetails = container.querySelector<HTMLButtonElement>('.dsh-workflow-template-detail [aria-label="详情 write"]')
    assert.ok(writeDetails)
    await act(async () => writeDetails.click())
    assert.match(container.querySelector('.dsh-workflow-template-inspector')!.textContent!, /完整提示词/)
    assert.match(container.querySelector('.dsh-workflow-template-inspector')!.textContent!, /output_schema/)
    await act(async () => tabs()[1]!.click())
    assert.equal(catalogLoads, 2)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="打开模板 good"]')!.click())
    assert.equal(detailLoads, 1)
    assert.equal(tabs().length, 3)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关闭模板标签 good"]')!.click())
    assert.equal(tabs().length, 2)
    assert.equal(tabs()[1]!.getAttribute('aria-selected'), 'true')
    catalogMode = 'error'
    await act(async () => tabs()[0]!.click())
    await act(async () => tabs()[1]!.click())
    assert.match(container.querySelector('.dsh-workflow-template-list [role="alert"]')!.textContent!, /模板目录暂时无法读取/)
    catalogMode = 'empty'
    await act(async () => tabs()[0]!.click())
    await act(async () => tabs()[1]!.click())
    assert.match(container.querySelector('.dsh-workflow-template-list .dsh-workflow-template-empty')!.textContent!, /\/templates\/<template-id>\/workflow.yaml/)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
