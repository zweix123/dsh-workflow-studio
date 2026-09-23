import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { WorkflowStudioPanel } from '../src/client/pages/workflow-studio/WorkflowStudioPanel.js'
import { getPluginStatus } from '../src/client/apis/plugin-status.js'
import { createInstance, deleteInstance, getInstance, listInstances, listTemplates } from '../src/client/apis/workflow-instances.js'
import { en, zh, type WorkflowTranslate } from '../src/client/locales/index.js'

const status = { plugin: 'dsh-workflow-studio', version: '0.1.0', status: 'ready' as const, serverTime: '2026-09-22T10:00:00.000Z' }
const emptyWorkspaces = {
  items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
} as unknown as WorkspaceSnapshot
const useEmptyWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector(emptyWorkspaces)

for (const [language, initial, other] of [['zh', zh, en], ['en', en, zh]] as const) {
  test(`studio supports accessible tabs and language switching without duplicate requests (${language})`, async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>')
    const globals = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'] as const
    const previous = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
    Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
    Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    let requests = 0
    globalThis.fetch = async url => {
      requests++
      assert.equal(url, '/api/dsh-workflow-studio/instances')
      return Response.json([])
    }
    const container = dom.window.document.getElementById('root')!
    const root = createRoot(container)
    let dictionary = initial
    const t: WorkflowTranslate = key => dictionary[key]
    const render = () => root.render(<WorkflowStudioPanel t={t} useWorkspaces={useEmptyWorkspaces} />)
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
        if (index === 1) assert.equal(panel.childNodes.length, 0)
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
      const initialRequests = requests
      assert.equal(container.querySelector('h1')!.textContent, initial.title)
      assert.equal(container.querySelector('.dsh-workflow-overview-heading h2')!.textContent, initial.overviewTitle)
      assert.equal(container.querySelector('[role="tablist"]')!.getAttribute('aria-labelledby'), container.querySelector('h1')!.id)
      assert.deepEqual(tabs().map(tab => tab.textContent), [initial.instanceManagement, initial.templateManagement])
      assertSelection(0)
      await act(async () => tabs()[1].click())
      assertSelection(1)
      tabs()[1].focus()
      const originalTabs = tabs()
      const originalPanels = panels()
      dictionary = other
      await act(async () => render())
      assert.equal(requests, initialRequests)
      assert.equal(container.querySelector('h1')!.textContent, other.title)
      assert.equal(container.querySelector('.dsh-workflow-overview-heading h2')!.textContent, other.overviewTitle)
      assert.deepEqual(tabs().map(tab => tab.textContent), [other.instanceManagement, other.templateManagement])
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
      assert.deepEqual(tabs().map(tab => tab.textContent), [initial.instanceManagement, initial.templateManagement])
      await act(async () => root.render(null))
      await act(async () => render())
      assertSelection(0)
      // Multiple mounted copies must not share tab/panel IDs.
      await act(async () => root.render(<><WorkflowStudioPanel t={t} useWorkspaces={useEmptyWorkspaces} /><WorkflowStudioPanel t={t} useWorkspaces={useEmptyWorkspaces} /></>))
      const ids = [...container.querySelectorAll('[id]')].map(element => element.id)
      assert.equal(new Set(ids).size, ids.length)
      assert.ok(requests >= initialRequests)
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

test('instance cards and creation dialog preserve drafts, then open details only on instance click', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const globals = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'] as const
  const previous = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = handle => clearTimeout(handle)
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  const workspaceSnapshot = {
    items: [
      { workspaceId: 'workspace-a', title: '工作区 A', path: '/a', sessionIds: [], createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z' },
      { workspaceId: 'workspace-b', title: '工作区 B', path: '/b', sessionIds: [], createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z' },
    ],
    archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  } as unknown as WorkspaceSnapshot
  const useWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector(workspaceSnapshot)
  const rows = [
    { id: 'old-a', workspaceId: 'workspace-a', name: '已有实例', templateId: 'flow', createdAt: '2026-09-23T01:00:00.000Z' },
    { id: 'orphan', workspaceId: 'removed', name: '保留实例', templateId: 'flow', createdAt: '2026-09-23T02:00:00.000Z' },
  ]
  const created = {
    id: 'created', workspaceId: 'workspace-a', name: 'flow draft', templateId: 'flow', createdAt: '2026-09-23T03:00:00.000Z',
    definition: { id: 'root', type: 'dag', dag: [
      { id: 'start', type: 'node' }, { id: 'worker', type: 'node' }, { id: 'later', type: 'node' }, { id: 'closed', type: 'node' },
      { id: 'nested', type: 'dag', dag: [{ id: 'inner', type: 'node' }] }, { id: 'after', type: 'node' },
      { id: 'recursive', type: 'dag', dag: [] },
      { type: 'edge', from: 'start', to: 'worker' }, { type: 'edge', from: 'worker', to: 'later' }, { type: 'edge', from: 'start', to: 'closed' },
      { type: 'edge', from: 'start', to: 'nested' }, { type: 'edge', from: 'nested', to: 'after' },
    ] },
    input: {},
    snapshot: {
      rootInstanceId: 'i1',
      instances: [
        { instanceId: 'i1', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
        { instanceId: 'i2', definitionId: 'start', definitionPath: ['dag', 0], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready' },
        { instanceId: 'i3', definitionId: 'worker', definitionPath: ['dag', 1], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready', forItem: { key: 'a', index: 0 } },
        { instanceId: 'i4', definitionId: 'worker', definitionPath: ['dag', 1], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready', forItem: { key: 'b', index: 1 } },
        { instanceId: 'i5', definitionId: 'nested', definitionPath: ['dag', 4], parentInstanceId: 'i1', input: {}, type: 'dag', status: 'running' },
        { instanceId: 'i6', definitionId: 'inner', definitionPath: ['dag', 0], parentInstanceId: 'i5', input: {}, type: 'node', status: 'ready' },
        { instanceId: 'i7', definitionId: 'after', definitionPath: ['dag', 5], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready' },
        { instanceId: 'i8', definitionId: 'recursive', definitionPath: ['dag', 6], parentInstanceId: 'i1', input: {}, type: 'dag', status: 'running' },
        { instanceId: 'i9', definitionId: 'recursive', definitionPath: ['dag', 6], parentInstanceId: 'i8', input: {}, type: 'dag', status: 'running' },
      ],
      waitingPositions: [{ parentInstanceId: 'i1', definitionId: 'later', definitionPath: ['dag', 2] }],
      skippedPositions: [{ parentInstanceId: 'i1', definitionId: 'closed', definitionPath: ['dag', 3] }],
      edges: [
        { parentInstanceId: 'i1', definitionPath: ['dag', 4], from: { parentInstanceId: 'i1', definitionId: 'start' }, to: { parentInstanceId: 'i1', definitionId: 'worker' }, status: 'active' },
        { parentInstanceId: 'i1', definitionPath: ['dag', 5], from: { parentInstanceId: 'i1', definitionId: 'worker' }, to: { parentInstanceId: 'i1', definitionId: 'later' }, status: 'pending' },
        { parentInstanceId: 'i1', definitionPath: ['dag', 6], from: { parentInstanceId: 'i1', definitionId: 'start' }, to: { parentInstanceId: 'i1', definitionId: 'closed' }, status: 'inactive' },
        { parentInstanceId: 'i1', definitionPath: ['dag', 7], from: { parentInstanceId: 'i1', definitionId: 'start' }, to: { parentInstanceId: 'i1', definitionId: 'nested' }, status: 'active' },
        { parentInstanceId: 'i1', definitionPath: ['dag', 8], from: { parentInstanceId: 'i1', definitionId: 'nested' }, to: { parentInstanceId: 'i1', definitionId: 'after' }, status: 'active' },
      ],
    },
  }
  let createAttempts = 0
  const createRequests: unknown[] = []
  let templateLoads = 0
  let oldInstanceLoads = 0
  let deleteAttempts = 0
  globalThis.fetch = async (url, init) => {
    if (url === '/api/dsh-workflow-studio/instances' && !init?.method) return Response.json(rows)
    if (url === '/api/dsh-workflow-studio/templates') {
      templateLoads++
      return Response.json({ directory: '~/.dsh/dsh-workflow-studio/templates/<template-id>/workflow.yaml', templates: [{ id: 'broken', error: 'Missing id' }, { id: 'flow' }] })
    }
    if (url === '/api/dsh-workflow-studio/instances' && init?.method === 'POST') {
      createAttempts++
      createRequests.push(JSON.parse(String(init.body)))
      if (createAttempts === 1) return Response.json({ error: { code: 'template-invalid', message: 'Missing id' } }, { status: 422 })
      if (createAttempts === 2) return Response.json({ error: { code: 'initialization-failed', message: 'Unable to initialize' } }, { status: 422 })
      return Response.json(created, { status: 201 })
    }
    if (url === '/api/dsh-workflow-studio/instances/old-a' && init?.method === 'DELETE') {
      deleteAttempts++
      if (deleteAttempts === 1) return Response.json({ error: { code: 'internal-error', message: 'try again' } }, { status: 500 })
      return Response.json({})
    }
    if (url === '/api/dsh-workflow-studio/instances/orphan' && init?.method === 'DELETE') return Response.json({})
    if (url === '/api/dsh-workflow-studio/instances/old-a') {
      oldInstanceLoads++
      return Response.json({ ...created, id: 'old-a', name: '已有实例' })
    }
    if (String(url).startsWith('/api/dsh-workflow-studio/instances/')) return Response.json(created)
    return new Response('missing', { status: 404 })
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const setValue = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const previousValue = element.value
    const prototype = element instanceof dom.window.HTMLInputElement ? dom.window.HTMLInputElement.prototype : dom.window.HTMLTextAreaElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    ;(element as HTMLInputElement & { _valueTracker?: { setValue(value: string): void } })._valueTracker?.setValue(previousValue)
    await act(async () => Simulate.change(element))
  }
  try {
    await act(async () => root.render(<WorkflowStudioPanel t={key => zh[key]} useWorkspaces={useWorkspaces} />))
    const headings = [...container.querySelectorAll('.dsh-workflow-workspace h3')].map(node => node.textContent)
    assert.deepEqual(headings, ['工作区 A', '工作区 B', '未关联工作区'])
    assert.equal(container.querySelectorAll('.dsh-workflow-workspace').length, 3)
    assert.equal(container.querySelector('.dsh-workflow-instance-list'), null)
    assert.equal(container.querySelector('.dsh-workflow-instance-main'), null)
    assert.equal(container.querySelectorAll('.dsh-workflow-workspace .dsh-workflow-add').length, 2)
    assert.match(container.textContent!, /已有实例/)
    assert.match(container.textContent!, /保留实例/)
    const overview = container.querySelector<HTMLElement>('[role="tabpanel"]')!
    overview.scrollTop = 73

    const createButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.getAttribute('aria-label')?.includes('工作区 A'))!
    await act(async () => createButton.click())
    assert.equal(templateLoads, 1)
    assert.equal(createButton.getAttribute('aria-expanded'), 'true')
    assert.equal(container.querySelector('[role="dialog"]')!.getAttribute('aria-modal'), 'true')
    assert.equal(container.querySelectorAll('.dsh-workflow-form-actions button').length, 1)
    assert.equal(container.querySelector('.dsh-workflow-form-actions')!.textContent, '创建实例')
    const close = container.querySelector<HTMLButtonElement>('.dsh-workflow-create-close')!
    assert.equal(dom.window.document.activeElement, close)
    await act(async () => close.click())
    assert.equal(container.querySelector('[role="dialog"]'), null)
    assert.equal(createButton.getAttribute('aria-expanded'), 'false')
    assert.equal(dom.window.document.activeElement, createButton)
    await act(async () => createButton.click())
    assert.equal(templateLoads, 2)
    await act(async () => container.querySelector<HTMLButtonElement>('.dsh-workflow-create-mask')!.click())
    assert.equal(container.querySelector('[role="dialog"]'), null)
    const createInB = [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-add')]
      .find(button => button.getAttribute('aria-label')?.includes('工作区 B'))!
    await act(async () => createInB.click())
    assert.equal(container.querySelector('.dsh-workflow-create-heading')!.textContent?.includes('工作区 B'), true)
    await act(async () => container.querySelector<HTMLButtonElement>('.dsh-workflow-create-close')!.click())
    await act(async () => createButton.click())
    assert.equal(templateLoads, 4)
    await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(container.querySelector('[role="dialog"]'), null)
    await act(async () => createButton.click())
    assert.equal(templateLoads, 5)
    const form = container.querySelector<HTMLFormElement>('form')!
    const select = form.querySelector('select')!
    assert.equal(select.value, 'flow')
    const brokenOption = select.querySelector<HTMLOptionElement>('option[value="broken"]')!
    assert.equal(brokenOption.disabled, true)
    assert.equal(brokenOption.textContent?.trim(), 'broken — 模板无效')
    const name = form.querySelector<HTMLInputElement>('input[name="instanceName"]')!
    assert.match(name.value, /^flow /)
    assert.equal(form.querySelector('textarea[name="runtimeInput"]'), null)
    await setValue(name, 'flow draft')
    await act(async () => form.requestSubmit())
    assert.equal(container.querySelector('[role="alert"]')!.textContent, '模板无效')
    assert.equal(name.value, 'flow draft')
    await act(async () => form.requestSubmit())
    assert.equal(container.querySelector('[role="alert"]')!.textContent, '初始化失败。 Unable to initialize')
    assert.equal(name.value, 'flow draft')

    await act(async () => form.requestSubmit())
    assert.equal(createAttempts, 3)
    assert.deepEqual(createRequests, Array.from({ length: 3 }, () => ({ workspaceId: 'workspace-a', name: 'flow draft', templateId: 'flow' })))
    assert.equal(container.querySelector('form'), null)
    assert.equal(container.querySelector('[role="dialog"]'), null)
    const createdRow = [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-instance-row')]
      .find(button => button.textContent?.includes('flow draft'))!
    assert.ok(createdRow)
    assert.ok(createdRow.closest('.dsh-workflow-workspace')?.textContent?.includes('工作区 A'))
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    assert.deepEqual(tabs.map(tab => tab.textContent), ['实例管理', '模板管理'])
    assert.equal(tabs[0]!.getAttribute('aria-selected'), 'true')
    assert.equal(dom.window.document.activeElement, createButton)
    await act(async () => createdRow.click())
    const detailTabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    assert.deepEqual(detailTabs.map(tab => tab.textContent), ['实例管理', '模板管理', 'flow draft'])
    assert.equal(detailTabs[2]!.getAttribute('aria-selected'), 'true')
    assert.equal(dom.window.document.activeElement, detailTabs[2])
    assert.equal(container.querySelectorAll('.dsh-workflow-detail .dsh-workflow-instance-list').length, 0)
    assert.equal(container.querySelector('.dsh-workflow-detail .dsh-workflow-button'), null)
    const worker = [...container.querySelectorAll<HTMLElement>('[data-graph-node]')].filter(node => node.dataset.definitionId === 'worker')
    assert.equal(worker.length, 2)
    assert.equal(container.querySelector<HTMLElement>('[data-definition-id="later"]')!.dataset.status, 'waiting')
    assert.equal(container.querySelector<HTMLElement>('[data-definition-id="closed"]')!.dataset.status, 'skipped')
    assert.match(container.querySelector<HTMLElement>('.dsh-workflow-dag-group[data-definition-id="nested"]')!.textContent!, /运行中/)
    assert.equal(container.querySelector('.dsh-workflow-dag-group[data-definition-id="nested"] button[aria-label^="执行"]'), null)
    const inner = container.querySelector<HTMLElement>('[data-definition-id="inner"]')!
    const after = container.querySelector<HTMLElement>('[data-definition-id="after"]')!
    assert.ok(inner.closest('.react-flow__node'))
    assert.ok(after.closest('.react-flow__node'))
    const recursive = [...container.querySelectorAll<HTMLElement>('[data-definition-id="recursive"]')]
    assert.equal(recursive.length, 2)
    assert.ok(container.querySelector('.react-flow__controls-zoomin'))
    assert.ok(container.querySelector('.react-flow__controls-zoomout'))
    assert.ok(container.querySelector('.react-flow__controls-fitview'))
    const canvas = container.querySelector('.react-flow')
    await act(async () => detailTabs[0]!.click())
    assert.equal(overview.scrollTop, 73)
    await act(async () => detailTabs[2]!.click())
    assert.equal(container.querySelector('.react-flow'), canvas)
    await act(async () => detailTabs[0]!.click())
    const oldRow = [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-instance-row')]
      .find(button => button.textContent?.includes('已有实例'))!
    await act(async () => oldRow.click())
    const openedTabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    assert.deepEqual(openedTabs.map(tab => tab.textContent), ['实例管理', '模板管理', 'flow draft', '已有实例'])
    assert.equal(openedTabs[3]!.getAttribute('aria-selected'), 'true')
    assert.equal(dom.window.document.activeElement, openedTabs[3])
    assert.equal(container.querySelectorAll('.dsh-workflow-detail h2')[1]!.textContent, '已有实例')
    assert.notEqual(container.querySelectorAll('.react-flow')[1], canvas)
    await act(async () => openedTabs[0]!.click())
    await act(async () => oldRow.click())
    assert.equal(oldInstanceLoads, 1)
    assert.equal(container.querySelectorAll('[role="tab"]').length, 4)
    assert.equal(openedTabs[3]!.getAttribute('aria-selected'), 'true')
    const closeButtons = [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-tab-close')]
    assert.equal(closeButtons.length, 2)
    assert.equal(closeButtons[1]!.getAttribute('aria-label'), '关闭实例标签 已有实例')
    await act(async () => closeButtons[1]!.click())
    assert.equal(container.querySelectorAll('[role="tab"]').length, 3)
    assert.equal(detailTabs[2]!.getAttribute('aria-selected'), 'true')
    assert.equal(dom.window.document.activeElement, detailTabs[2])
    assert.equal(container.querySelector('.react-flow'), canvas)
    await act(async () => closeButtons[0]!.click())
    assert.equal(container.querySelectorAll('[role="tab"]').length, 2)
    assert.equal(tabs[1]!.getAttribute('aria-selected'), 'true')
    assert.equal(dom.window.document.activeElement, tabs[1])
    await act(async () => tabs[0]!.click())
    await act(async () => oldRow.click())
    assert.equal(oldInstanceLoads, 2)
    assert.equal(container.querySelectorAll('[role="tab"]').length, 3)
    await act(async () => tabs[0]!.click())
    const oldItem = oldRow.closest('.dsh-workflow-instance-item')!
    const more = oldItem.querySelector<HTMLButtonElement>('.dsh-workflow-instance-more')!
    assert.match(more.getAttribute('aria-label')!, /已有实例/)
    await act(async () => more.click())
    assert.equal(container.querySelectorAll('[role="tab"]').length, 3)
    assert.equal(oldItem.querySelectorAll('[role="menuitem"]').length, 1)
    await act(async () => oldItem.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click())
    assert.equal(dom.window.document.querySelector('[role="alertdialog"]')?.textContent?.includes('已有实例'), true)
    await act(async () => dom.window.document.querySelector<HTMLButtonElement>('.dsh-workflow-delete-actions button')!.click())
    assert.ok(oldRow.isConnected)
    assert.equal(deleteAttempts, 0)
    await act(async () => more.click())
    await act(async () => oldItem.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click())
    await act(async () => dom.window.document.querySelector<HTMLButtonElement>('.dsh-workflow-delete-confirm')!.click())
    assert.equal(dom.window.document.querySelector('[role="alert"]')?.textContent, '操作失败，请重试。 try again')
    assert.ok(oldRow.isConnected)
    await act(async () => dom.window.document.querySelector<HTMLButtonElement>('.dsh-workflow-delete-confirm')!.click())
    assert.equal(deleteAttempts, 2)
    assert.equal(oldRow.isConnected, false)
    assert.equal(container.querySelectorAll('[role="tab"]').length, 2)
    assert.match(container.querySelector('.dsh-workflow-workspace')!.textContent!, /实例: 1/)
    const orphanItem = [...container.querySelectorAll<HTMLElement>('.dsh-workflow-instance-item')]
      .find(item => item.textContent?.includes('保留实例'))!
    await act(async () => orphanItem.querySelector<HTMLButtonElement>('.dsh-workflow-instance-more')!.click())
    await act(async () => orphanItem.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click())
    await act(async () => dom.window.document.querySelector<HTMLButtonElement>('.dsh-workflow-delete-confirm')!.click())
    assert.equal(container.querySelectorAll('.dsh-workflow-workspace').length, 2)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})

test('instance API uses the host routes and rejects malformed payloads', async () => {
  const original = globalThis.fetch
  const detail = {
    id: 'instance-a', workspaceId: 'workspace-a', name: 'Run', templateId: 'template-a', createdAt: '2026-09-23T08:00:00.000Z',
    definition: { id: 'root', type: 'dag', dag: [] }, input: {},
    snapshot: { rootInstanceId: 'i1', instances: [], waitingPositions: [], skippedPositions: [], edges: [] },
  }
  try {
    const calls: Array<[string, RequestInit | undefined]> = []
    globalThis.fetch = async (url, init) => {
      calls.push([String(url), init])
      if (url === '/api/dsh-workflow-studio/templates') return Response.json({ directory: '~/.dsh/dsh-workflow-studio/templates/<template-id>/workflow.yaml', templates: [{ id: 'template-a' }, { id: 'broken', error: 'Missing id' }] })
      if (url === '/api/dsh-workflow-studio/instances' && init?.method === 'POST') return Response.json(detail, { status: 201 })
      if (url === '/api/dsh-workflow-studio/instances') return Response.json([detail])
      if (url === '/api/dsh-workflow-studio/instances/instance-a' && init?.method === 'DELETE') return Response.json({})
      if (url === '/api/dsh-workflow-studio/instances/instance-a') return Response.json(detail)
      return new Response('missing', { status: 404 })
    }
    assert.equal((await listTemplates()).templates[1]!.error, 'Missing id')
    assert.deepEqual(await listInstances(), [detail].map(({ definition: _definition, input: _input, snapshot: _snapshot, ...row }) => row))
    const input = { workspaceId: 'workspace-a', name: 'Run', templateId: 'template-a' }
    assert.deepEqual(await createInstance(input), detail)
    assert.deepEqual(await getInstance('instance-a'), detail)
    await deleteInstance('instance-a')
    assert.equal(calls[4]![1]?.method, 'DELETE')
    assert.equal(calls[2]![1]?.body, JSON.stringify(input))
    assert.equal(calls[2]![1]?.headers && (calls[2]![1]!.headers as Record<string, string>)['Content-Type'], 'application/json')

    globalThis.fetch = async () => Response.json({ ...detail, snapshot: null })
    await assert.rejects(getInstance('instance-a'), /Unexpected workflow instance/)
    globalThis.fetch = async () => Response.json({ error: { code: 'duplicate-name', message: 'duplicate' } }, { status: 409 })
    await assert.rejects(createInstance(input), error => {
      assert.equal((error as { code?: string }).code, 'duplicate-name')
      return true
    })
  } finally {
    globalThis.fetch = original
  }
})
