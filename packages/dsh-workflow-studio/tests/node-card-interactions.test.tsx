import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { WorkflowStudioPanel } from '../src/client/pages/workflow-studio/WorkflowStudioPanel.js'
import { en, zh } from '../src/client/locales/index.js'

test('cards execute independently and the inspector follows the selected graph object', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const names = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'] as const
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = handle => clearTimeout(handle)
  let resize: (() => void) | undefined
  globalThis.ResizeObserver = class { constructor(callback: ResizeObserverCallback) { resize = () => callback([], this) } observe() {} unobserve() {} disconnect() {} }
  const workspace = { items: [{ workspaceId: 'w', title: 'Workspace', path: '/w', sessionIds: [] }], state: 'idle', phase: 'ready', archivedSessionIds: [], pinnedSessionIds: [], error: null } as unknown as WorkspaceSnapshot
  const useWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector(workspace)
  const row = { id: 'run', workspaceId: 'w', name: 'Run', templateId: 'flow', createdAt: '2026-09-23T00:00:00Z' }
  const base = { ...row, definition: { id: 'root', type: 'dag', dag: [
    { id: 'first', type: 'node' }, { id: 'other', type: 'node' }, { id: 'later', type: 'node' }, { id: 'closed', type: 'node' },
    { id: 'nested', type: 'dag', dag: [{ id: 'inner', type: 'node' }] },
  ] }, input: {}, snapshot: {
    rootInstanceId: 'i1', instances: [
      { instanceId: 'i1', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
      { instanceId: 'i2', definitionId: 'first', definitionPath: ['dag', 0], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready' },
      { instanceId: 'i3', definitionId: 'other', definitionPath: ['dag', 1], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready' },
      { instanceId: 'i5', definitionId: 'nested', definitionPath: ['dag', 4], parentInstanceId: 'i1', input: {}, type: 'dag', status: 'running' },
      { instanceId: 'i6', definitionId: 'inner', definitionPath: ['dag', 4, 'dag', 0], parentInstanceId: 'i5', input: {}, type: 'node', status: 'ready' },
    ], waitingPositions: [{ parentInstanceId: 'i1', definitionId: 'later', definitionPath: ['dag', 2] }],
    skippedPositions: [{ parentInstanceId: 'i1', definitionId: 'closed', definitionPath: ['dag', 3] }], edges: [], instanceConnections: [],
  } }
  let current: any = base
  let areaWidth = 1000
  let widthPosts = 0
  let rejectWidth = false
  const calls: string[] = []
  globalThis.fetch = async (url, init) => {
    if (url === '/api/dsh-workflow-studio/instances' && !init?.method) return Response.json([row])
    if (url === '/api/dsh-workflow-studio/instances/run' && !init?.method) return Response.json(current)
    if (url === '/api/dsh-workflow-studio/instances/run/drawer-width' && init?.method === 'POST') {
      widthPosts++
      if (rejectWidth) return Response.json({ error: 'unavailable' }, { status: 500 })
      current = { ...current, drawerWidth: JSON.parse(String(init.body)).width }
      return Response.json(current)
    }
    const match = String(url).match(/\/nodes\/(i[234])\/execute$/)
    if (match && init?.method === 'POST') {
      calls.push(match[1]!)
      current = structuredClone(current)
      const node = current.snapshot.instances.find((item: any) => item.instanceId === match[1])
      node.status = 'completed'; node.output = {}
      if (match[1] === 'i3') {
        current.snapshot.waitingPositions = []
        current.snapshot.instances.push({ instanceId: 'i4', definitionId: 'later', definitionPath: ['dag', 2], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready' })
      }
      return Response.json(current)
    }
    return new Response('missing', { status: 404 })
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const card = (id: string) => container.querySelector<HTMLElement>(`[data-definition-id="${id}"]`)!
  try {
    await act(async () => root.render(<WorkflowStudioPanel t={key => zh[key]} useWorkspaces={useWorkspaces} />))
    await act(async () => container.querySelector<HTMLButtonElement>('.dsh-workflow-instance-row')!.click())
    const runArea = container.querySelector<HTMLElement>('.dsh-workflow-run')!
    Object.defineProperty(runArea, 'clientWidth', { get: () => areaWidth })
    await act(async () => resize?.())
    const viewport = container.querySelector('.react-flow__viewport')
    const transform = viewport?.getAttribute('transform')
    assert.match(card('first').textContent!, /就绪/)
    assert.notEqual(card('first').closest<HTMLElement>('.react-flow__node')?.style.pointerEvents, 'none')
    assert.equal(card('first').querySelectorAll('button').length, 2)
    assert.equal(card('later').querySelectorAll('button').length, 1)
    assert.equal(card('closed').querySelectorAll('button').length, 1)
    const group = container.querySelector<HTMLElement>('.dsh-workflow-dag-group[data-definition-id="nested"]')!
    assert.match(group.textContent!, /运行中/)
    assert.equal(group.querySelector('button[aria-label^="执行"]'), null)
    await act(async () => group.querySelector<HTMLElement>('.dsh-workflow-dag-heading strong')!.click())
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
    await act(async () => group.querySelector<HTMLButtonElement>('[aria-label="详情 nested"]')!.click())
    assert.match(container.querySelector('.dsh-workflow-inspector')!.textContent!, /nested.*运行中/)
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '320px')
    await act(async () => container.querySelector<HTMLElement>('.react-flow__pane')!.click())
    assert.ok(container.querySelector('.dsh-workflow-inspector'))
    const grip = container.querySelector<HTMLElement>('.dsh-workflow-inspector-resize')!
    const drag = async (to: number) => act(async () => {
      grip.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 700 }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: to }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, clientX: to }))
    })
    await drag(600)
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '420px')
    assert.equal(current.drawerWidth, 420)
    await drag(0)
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '700px')
    await drag(2000)
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '300px')
    await drag(580)
    grip.focus()
    assert.equal(dom.window.document.activeElement, grip)
    await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    assert.equal(current.drawerWidth, 430)
    await act(async () => {
      grip.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 700 }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 600 }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('pointercancel', { bubbles: true }))
    })
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '430px')
    assert.equal(current.drawerWidth, 430)
    rejectWidth = true
    await drag(600)
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '430px')
    assert.equal(current.drawerWidth, 430)
    assert.ok(container.querySelector('[role="alert"]'))
    rejectWidth = false
    await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    assert.equal(current.drawerWidth, 420)
    assert.equal(container.querySelector('[role="alert"]'), null)
    await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    assert.equal(current.drawerWidth, 430)
    const postsBeforeNarrow = widthPosts
    areaWidth = 350
    await act(async () => resize?.())
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '300px')
    assert.equal(current.drawerWidth, 430)
    await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    await act(async () => {
      grip.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 700 }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 600 }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, clientX: 600 }))
    })
    assert.equal(widthPosts, postsBeforeNarrow)
    areaWidth = 280
    await act(async () => resize?.())
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '280px')
    assert.equal(current.drawerWidth, 430)
    await act(async () => grip.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    assert.equal(widthPosts, postsBeforeNarrow)
    areaWidth = 1000
    await act(async () => resize?.())
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '430px')
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    await act(async () => tabs.find(tab => tab.textContent === '实例管理')!.click())
    await act(async () => tabs.find(tab => tab.textContent === 'Run')!.click())
    assert.equal(container.querySelector<HTMLElement>('.dsh-workflow-inspector')!.style.width, '430px')
    assert.equal(container.querySelector('.react-flow__viewport'), viewport)
    assert.equal(viewport?.getAttribute('transform'), transform)
    await act(async () => card('inner').querySelector<HTMLButtonElement>('[aria-label="详情 inner"]')!.click())
    assert.match(container.querySelector('.dsh-workflow-inspector')!.textContent!, /inner.*就绪/)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关闭详情"]')!.click())
    await act(async () => card('first').click())
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
    const execute = card('first').querySelector<HTMLButtonElement>('button[aria-label^="执行"]')!
    execute.focus()
    assert.equal(dom.window.document.activeElement, execute)
    await act(async () => execute.click())
    assert.deepEqual(calls, ['i2'])
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
    assert.equal(card('first').dataset.status, 'completed')
    container.style.width = '480px'
    await act(async () => card('first').querySelector<HTMLButtonElement>('[aria-label="详情 first"]')!.click())
    const narrowInspector = container.querySelector<HTMLElement>('.dsh-workflow-inspector')!
    assert.equal(narrowInspector.closest('.dsh-workflow-detail')?.getAttribute('aria-label'), 'Run')
    assert.match(narrowInspector.textContent!, /first.*已完成/)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关闭详情"]')!.click())
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
    container.style.width = ''
    await act(async () => card('later').querySelector<HTMLButtonElement>('button')!.click())
    assert.match(container.querySelector('.dsh-workflow-inspector')!.textContent!, /later.*等待/)
    await act(async () => card('other').querySelector<HTMLButtonElement>('button[aria-label^="执行"]')!.click())
    assert.deepEqual(calls, ['i2', 'i3'])
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
    assert.equal(card('later').dataset.status, 'ready')
    await act(async () => card('later').querySelector<HTMLButtonElement>('[aria-label="详情 later"]')!.click())
    assert.match(container.querySelector('.dsh-workflow-inspector')!.textContent!, /later.*就绪/)
    await act(async () => card('later').querySelector<HTMLButtonElement>('button[aria-label^="执行"]')!.click())
    assert.match(container.querySelector('.dsh-workflow-inspector')!.textContent!, /later.*已完成/)
    await act(async () => root.render(<WorkflowStudioPanel t={key => en[key]} useWorkspaces={useWorkspaces} />))
    assert.match(card('first').textContent!, /Completed/)
    assert.equal(card('inner').querySelector<HTMLButtonElement>('[aria-label="Details inner"]')?.textContent?.trim(), 'ⓘ Details')
    assert.match(container.querySelector('.dsh-workflow-inspector')!.textContent!, /later.*Completed/)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click())
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
