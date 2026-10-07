import { Context } from '@deepseek-ai/cordis'
import { BrowserNodeRegistry } from '../../dsh-workflow-node/src/browser.js'
import { bashClient } from '../../dsh-workflow-node-bash/src/client.js'
import { formClient } from '../../dsh-workflow-node-form/src/client.js'
import { sessionAgentClient } from '../../dsh-workflow-node-session-agent/src/client.js'
import { bashNode } from '../../dsh-workflow-node-bash/src/server.js'
import { formNode } from '../../dsh-workflow-node-form/src/server.js'
import { sessionAgentNode } from '../../dsh-workflow-node-session-agent/src/server.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { JSDOM } from 'jsdom'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { WorkflowStudioPanel } from '../src/client/pages/workflow-studio/WorkflowStudioPanel.js'
import { InstanceRunPanel } from '../src/client/pages/workflow-studio/instances/InstanceRunPanel.js'
import { StudioClient } from '../src/client/studio-client.js'
import { ConversationInstanceAction } from '../../dsh-workflow-node-session-agent/src/ConversationInstanceAction.js'
import { en, zh } from './locales.js'

let testLanguage = zh
let testNodes: BrowserNodeRegistry
let testOpenSession: ((id: string) => void) | undefined
function withNodeViews(value: any): any {
  if (!value || !value.snapshot || value.nodeViews) return value
  return { ...value, nodeViews: Object.fromEntries(value.snapshot.instances.filter((item: any) => item.type === 'node').map((item: any) => {
    let definition = value.definition
    for (const key of item.definitionPath) definition = definition?.[key]
    const node = [bashNode, formNode, sessionAgentNode].find(node => node.kind === definition?.node_kind)
    const execution = value.executions?.[item.instanceId]
    const fact = execution && { ...execution, business: execution.business ?? execution }
    const folder = node?.kind === 'session_agent' ? 'session-agent' : node?.kind
    return [item.instanceId, { source: `@dsh-workflow/node-${folder}`, token: 'test', ...node?.describe?.({ definition, input: item.input, fact, ready: item.status === 'ready' }) }]
  })) }
}
const nodeResponse = (value: any) => Response.json(withNodeViews(value))

function testDom(onResize?: (callback: ResizeObserverCallback) => void) {
  testLanguage = zh
  const context = new Context()
  testNodes = new BrowserNodeRegistry((_namespace, key) => testLanguage[key as keyof typeof zh] ?? key)
  for (const [source, node] of [['bash', bashClient], ['form', formClient], ['session-agent', { ...sessionAgentClient, handlers: { openSession: (props: any) => testOpenSession?.(props.execution.sessionId) } }]] as const) testNodes.register(context, `@dsh-workflow/node-${source}`, node)
  const dom = new JSDOM('<!doctype html><div id="root"></div>')
  const names = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'] as const
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0) as unknown as number
  globalThis.cancelAnimationFrame = handle => clearTimeout(handle)
  globalThis.ResizeObserver = class { constructor(callback: ResizeObserverCallback) { onResize?.(callback) } observe() {} unobserve() {} disconnect() {} }
  return { dom, context, cleanup: () => {
    dom.window.close()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  } }
}

function fields(container: Element): Record<string, string> {
  return Object.fromEntries([...container.querySelectorAll('dl > div')].map(row => [
    row.querySelector('dt')!.textContent!, row.querySelector('dd')!.textContent!,
  ]))
}

function inspectorSection(container: Element, name: string): HTMLElement {
  const section = container.querySelector<HTMLElement>(`.dsh-workflow-inspector section[aria-label="${name}"]`)
  assert.ok(section, `Missing inspector section: ${name}`)
  return section
}

test('every graph object exposes its snapshot definition below the correct running information', async () => {
  const { dom, cleanup } = testDom()
  const snapshotCommand = 'printf "snapshot command\\nsecond line"'
  const detail: any = { id: 'run', workspaceId: 'w', name: 'Definitions', templateId: 'source-template', createdAt: '2026-10-03T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', description: 'Root snapshot', custom: { zero: 0, flag: false }, dag: [
      { id: 'same', type: 'node', node_kind: 'bash', command: snapshotCommand, dag: 'ordinary custom field', output_schema: { answer: 'string' } },
      { id: 'nested', type: 'dag', description: 'Nested snapshot', dag: [
        { id: 'same', type: 'node', node_kind: 'bash', command: 'nested command' },
        { type: 'edge', from: 'same', to: 'nested', if: '$.again' },
      ] },
      { id: 'later', type: 'node', node_kind: 'bash', command: 'waiting command' },
      { id: 'closed', type: 'node', node_kind: 'bash', command: 'skipped command' },
    ] }, snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', parentInstanceId: null, definitionId: 'root', definitionPath: [], type: 'dag', status: 'running', input: {} },
      { instanceId: 'same-i', parentInstanceId: 'root-i', definitionId: 'same', definitionPath: ['dag', 0], type: 'node', status: 'completed', input: { zero: 0, flag: false, empty: '' }, output: { answer: 'accepted' } },
      { instanceId: 'nested-i', parentInstanceId: 'root-i', definitionId: 'nested', definitionPath: ['dag', 1], type: 'dag', status: 'running', input: {} },
      { instanceId: 'inner-i', parentInstanceId: 'nested-i', definitionId: 'same', definitionPath: ['dag', 1, 'dag', 0], type: 'node', status: 'ready', input: {} },
      { instanceId: 'recursive-i', parentInstanceId: 'nested-i', definitionId: 'nested', definitionPath: ['dag', 1], type: 'dag', status: 'running', input: {} },
    ], waitingPositions: [{ parentInstanceId: 'root-i', definitionId: 'later', definitionPath: ['dag', 2] }],
    skippedPositions: [{ parentInstanceId: 'root-i', definitionId: 'closed', definitionPath: ['dag', 3] }], edges: [], instanceConnections: [] } }
  const requests: string[] = []
  globalThis.fetch = async url => {
    requests.push(String(url))
    return nodeResponse({ id: detail.templateId, definition: { ...detail.definition, dag: [{ id: 'same', type: 'node', node_kind: 'bash', command: 'changed source command' }] } })
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const render = async (value = detail, language = zh) => act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(value)} t={key => { testLanguage = language; return language[key] }} onUpdate={() => {}} onWidthUpdate={() => {}} />))
  const inspect = async (id: string) => act(async () => {
    container.querySelector<HTMLButtonElement>(`.react-flow__node[data-id="${id}"] [aria-label^="详情 "]`)!.click()
  })
  const runtime = () => fields(inspectorSection(container, '运行信息'))
  const definition = () => fields(inspectorSection(container, '定义详情'))
  try {
    await render()
    const rootButton = [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-detail-header button')].find(button => button.textContent === zh.rootDagDetails)!
    assert.ok(rootButton)
    await act(async () => rootButton.click())
    assert.deepEqual([...container.querySelectorAll('.dsh-workflow-inspector section')].map(section => section.getAttribute('aria-label')), ['运行信息', '定义详情'])
    assert.equal(runtime()['DAG 实例'], 'root · root-i')
    assert.equal(runtime()['所属 DAG 实例'], undefined)
    assert.equal(runtime()['定义 ID'], undefined)
    assert.equal(runtime()['状态'], zh.statusRunning)
    assert.deepEqual(Object.keys(definition()), ['id', 'type', 'description', 'custom'])
    assert.equal(definition().description, 'Root snapshot')
    assert.deepEqual(JSON.parse(definition().custom!), { zero: 0, flag: false })
    await inspect('same-i')
    assert.equal(runtime()['节点实例'], 'same · same-i')
    assert.equal(runtime()['定义 ID'], undefined)
    assert.equal(runtime()['所属 DAG 实例'], 'root · root-i')
    assert.equal(runtime()['状态'], zh.statusCompleted)
    assert.deepEqual(JSON.parse(runtime()['输入']!), { zero: 0, flag: false, empty: '' })
    assert.deepEqual(JSON.parse(runtime()['输出']!), { answer: 'accepted' })
    assert.equal(definition().command, snapshotCommand)
    assert.equal(definition().dag, 'ordinary custom field')
    assert.deepEqual(JSON.parse(definition().output_schema!), { answer: 'string' })
    assert.equal(inspectorSection(container, '定义详情').querySelector('button, input, textarea'), null)
    await inspect('inner-i')
    assert.equal(runtime()['节点实例'], 'same · inner-i')
    assert.equal(runtime()['所属 DAG 实例'], 'nested · nested-i')
    assert.equal(definition().command, 'nested command')
    assert.equal(runtime()['输出'], undefined)
    for (const id of ['nested-i', 'recursive-i']) {
      await inspect(id)
      assert.equal(runtime()['DAG 实例'], `nested · ${id}`)
      assert.equal(runtime()['所属 DAG 实例'], id === 'nested-i' ? 'root · root-i' : 'nested · nested-i')
      assert.equal(definition().description, 'Nested snapshot')
      assert.equal(definition().dag, undefined)
      assert.equal(inspectorSection(container, '运行信息').querySelector('button[type="submit"]'), null)
    }
    for (const [id, command] of [['later', 'waiting command'], ['closed', 'skipped command']]) {
      await act(async () => container.querySelector<HTMLButtonElement>(`[aria-label="详情 ${id}"]`)!.click())
      assert.equal(runtime()['所属 DAG 实例'], 'root · root-i')
      assert.equal(runtime()['定义 ID'], id)
      assert.equal(runtime()['节点实例'], undefined)
      assert.equal(runtime()['DAG 实例'], undefined)
      assert.equal(runtime()['逐项身份'], undefined)
      assert.equal(runtime()['输入'], undefined)
      assert.equal(runtime()['输出'], undefined)
      assert.deepEqual(Object.keys(runtime()).sort(), ['所属 DAG 实例', '定义 ID', '状态'].sort())
      assert.equal(runtime()['状态'], id === 'later' ? zh.statusWaiting : zh.statusSkipped)
      assert.equal(definition().command, command)
      assert.equal(inspectorSection(container, '运行信息').querySelector('button'), null)
    }
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="详情 later"]')!.click())
    await render({ ...detail, snapshot: { ...detail.snapshot, waitingPositions: [] } })
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
    await render()
    await inspect('same-i')
    assert.equal(definition().command, snapshotCommand)
    assert.deepEqual(requests, [], 'Inspecting snapshot definitions must not load the current source template')
    await render(detail, en)
    assert.equal(fields(inspectorSection(container, 'Running information'))['Node instance'], 'same · same-i')
    assert.equal(fields(inspectorSection(container, 'Running information'))['Containing DAG instance'], 'root · root-i')
    assert.equal(fields(inspectorSection(container, 'Definition details')).command, snapshotCommand)
    assert.ok([...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-detail-header button')].some(button => button.textContent === en.rootDagDetails))
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('for instances share definition fields and retain independent identities and results', async () => {
  const { dom, cleanup } = testDom()
  const detail: any = { id: 'for-run', workspaceId: 'w', name: 'For definitions', templateId: 'flow', createdAt: '2026-10-03T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'worker', type: 'node', node_kind: 'bash', command: 'shared command' }] },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', parentInstanceId: null, definitionId: 'root', definitionPath: [], type: 'dag', status: 'running', input: {} },
      { instanceId: 'first-i', parentInstanceId: 'root-i', definitionId: 'worker', definitionPath: ['dag', 0], type: 'node', status: 'completed', input: { value: 0 }, output: { value: 'first' }, forItem: { key: 'first', index: 0 } },
      { instanceId: 'second-i', parentInstanceId: 'root-i', definitionId: 'worker', definitionPath: ['dag', 0], type: 'node', status: 'ready', input: { value: false }, forItem: { key: 'second', index: 1 } },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    await act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => { testLanguage = zh; return zh[key] }} onUpdate={() => {}} onWidthUpdate={() => {}} />))
    for (const [index, id, value] of [[0, 'first-i', 0], [1, 'second-i', false]] as const) {
      await act(async () => container.querySelector<HTMLButtonElement>(`.react-flow__node[data-id="${id}"] [aria-label^="详情 worker"]`)!.click())
      const running = fields(inspectorSection(container, '运行信息'))
      assert.equal(running['节点实例'], `worker · ${id}`)
      assert.equal(running['所属 DAG 实例'], 'root · root-i')
      assert.equal(running['状态'], index === 0 ? zh.statusCompleted : zh.statusReady)
      assert.deepEqual(JSON.parse(running['逐项身份']!), { key: index === 0 ? 'first' : 'second', index })
      assert.deepEqual(JSON.parse(running['输入']!), { value })
      if (index === 0) assert.deepEqual(JSON.parse(running['输出']!), { value: 'first' })
      else assert.equal(running['输出'], undefined)
      assert.equal(fields(inspectorSection(container, '定义详情')).command, 'shared command')
    }
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('an invalid definition reference keeps running information and shows a localized missing-definition message', async () => {
  const { dom, cleanup } = testDom()
  const detail: any = { id: 'missing-run', workspaceId: 'w', name: 'Missing definition', templateId: 'flow', createdAt: '2026-10-03T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'worker', type: 'node', node_kind: 'bash', command: 'must not be mistaken for the missing definition' }] },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', parentInstanceId: null, definitionId: 'root', definitionPath: [], type: 'dag', status: 'running', input: {} },
    ], waitingPositions: [{ parentInstanceId: 'root-i', definitionId: 'missing', definitionPath: ['dag', 9] }], skippedPositions: [], edges: [], instanceConnections: [] } }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    await act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => { testLanguage = zh; return zh[key] }} onUpdate={() => {}} onWidthUpdate={() => {}} />))
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="详情 missing"]')!.click())
    assert.equal(fields(inspectorSection(container, '运行信息'))['定义 ID'], 'missing')
    const definitionSection = inspectorSection(container, '定义详情')
    assert.equal(definitionSection.querySelector('p')!.textContent, '无法定位此对象的定义。')
    assert.deepEqual(fields(definitionSection), {})
    assert.equal(inspectorSection(container, '运行信息').querySelector('button'), null)
    await act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => { testLanguage = en; return en[key] }} onUpdate={() => {}} onWidthUpdate={() => {}} />))
    assert.equal(inspectorSection(container, 'Definition details').querySelector('p')!.textContent, en.definitionMissing)
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('cards execute independently and the inspector follows the selected graph object', async () => {
  let resize: (() => void) | undefined
  const { dom, cleanup } = testDom(callback => { resize = () => callback([], {} as ResizeObserver) })
  const workspace = { items: [{ workspaceId: 'w', title: 'Workspace', path: '/w', sessionIds: [] }], state: 'idle', phase: 'ready', archivedSessionIds: [], pinnedSessionIds: [], error: null } as unknown as WorkspaceSnapshot
  const useWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector(workspace)
  const row = { id: 'run', workspaceId: 'w', name: 'Run', templateId: 'flow', createdAt: '2026-09-23T00:00:00Z' }
  const base = { ...row, definition: { id: 'root', type: 'dag', dag: [
    { id: 'first', type: 'node', node_kind: 'bash', command: '' }, { id: 'other', type: 'node', node_kind: 'bash', command: '' }, { id: 'later', type: 'node', node_kind: 'bash', command: '' }, { id: 'closed', type: 'node', node_kind: 'bash', command: '' },
    { id: 'nested', type: 'dag', dag: [{ id: 'inner', type: 'node', node_kind: 'bash', command: '' }] },
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
    if (url === '/api/dsh-workflow-studio/instances' && !init?.method) return nodeResponse([row])
    if (url === '/api/dsh-workflow-studio/instances/run' && !init?.method) return nodeResponse(current)
    if (url === '/api/dsh-workflow-studio/instances/run/drawer-width' && init?.method === 'POST') {
      widthPosts++
      if (rejectWidth) return nodeResponse({ error: 'unavailable' }, { status: 500 })
      current = { ...current, drawerWidth: JSON.parse(String(init.body)).width }
      return nodeResponse(current)
    }
    const match = String(url).match(/\/nodes\/(i[234])\/actions\/start$/)
    if (match && init?.method === 'POST') {
      calls.push(match[1]!)
      current = structuredClone(current)
      const node = current.snapshot.instances.find((item: any) => item.instanceId === match[1])
      node.status = 'completed'; node.output = {}
      if (match[1] === 'i3') {
        current.snapshot.waitingPositions = []
        current.snapshot.instances.push({ instanceId: 'i4', definitionId: 'later', definitionPath: ['dag', 2], parentInstanceId: 'i1', input: {}, type: 'node', status: 'ready' })
      }
      return nodeResponse(current)
    }
    return new Response('missing', { status: 404 })
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const card = (id: string) => container.querySelector<HTMLElement>(`[data-definition-id="${id}"]`)!
  try {
    await act(async () => root.render(<WorkflowStudioPanel nodes={testNodes} t={key => { testLanguage = zh; return zh[key] }} useWorkspaces={useWorkspaces} />))
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
    await act(async () => root.render(<WorkflowStudioPanel nodes={testNodes} t={key => { testLanguage = en; return en[key] }} useWorkspaces={useWorkspaces} />))
    assert.match(card('first').textContent!, /Completed/)
    assert.equal(card('inner').querySelector<HTMLButtonElement>('[aria-label="Details inner"]')?.textContent?.trim(), 'ⓘ Details')
    assert.match(container.querySelector('.dsh-workflow-inspector')!.textContent!, /later.*Completed/)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click())
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
  } finally {
    await act(async () => root.unmount())
    cleanup()
  }
})

test('workflow node inspector opens the existing session_agent, completes it, and shows the last bash result', async () => {
  const { dom, cleanup } = testDom()
  const base: any = { id: 'run', workspaceId: 'w', name: 'Business', templateId: 'flow', createdAt: '2026-09-24T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'session_agent', type: 'node', node_kind: 'session_agent', prompt: '' }, { id: 'bash', type: 'node', node_kind: 'bash', command: 'printf done' }] },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
      { instanceId: 'session_agent-i', definitionId: 'session_agent', definitionPath: ['dag', 0], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' },
      { instanceId: 'bash-i', definitionId: 'bash', definitionPath: ['dag', 1], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] },
    executions: { 'session_agent-i': { kind: 'session_agent', status: 'waiting', sessionId: 'session-one', sessionCreated: true }, 'bash-i': { kind: 'bash', status: 'failed', stdout: 'done', stderr: 'warning', exitCode: 2, error: 'Command exited with code 2' } } }
  let latest: any
  const opened: string[] = []
  let completed = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/nodes/session_agent-i/actions/complete') && init?.method === 'POST') {
      completed++
      return nodeResponse({ ...base, snapshot: { ...base.snapshot, instances: base.snapshot.instances.map((item: any) => item.instanceId === 'session_agent-i' ? { ...item, status: 'completed', output: {} } : item) } })
    }
    return new Response('missing', { status: 404 })
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  testOpenSession = id => opened.push(id)
  const render = async (detail: any) => act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => { testLanguage = zh; return zh[key] }} onUpdate={value => { latest = value }} onWidthUpdate={() => {}} />))
  const assertStatus = (expected: string) => {
    assert.equal(fields(inspectorSection(container, '运行信息'))['状态'], expected)
    assert.equal(container.querySelector('.dsh-workflow-inspector > header p')!.textContent, expected)
  }
  try {
    await render(base)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="详情 session_agent"]')!.click())
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-inspector button')].find(button => button.textContent === zh.openSession)!.click())
    assert.deepEqual(opened, ['session-one'])
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-inspector button')].find(button => button.textContent === zh.completeSessionAgent)!.click())
    assert.equal(completed, 1)
    assert.equal(latest.snapshot.instances.find((item: any) => item.instanceId === 'session_agent-i').status, 'completed')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="详情 bash"]')!.click())
    assert.match(inspectorSection(container, '运行信息').textContent!, /printf done.*done.*warning.*Command exited with code 2/s)
    assert.equal(fields(inspectorSection(container, '定义详情')).command, 'printf done')
    assertStatus(zh.executionError)
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="执行 bash"]')!.disabled, false)
    await render({ ...base, executions: { ...base.executions, 'bash-i': { kind: 'bash', status: 'succeeded', output: {} } } })
    assertStatus(zh.statusReady)
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="执行 bash"]')!.disabled, false)
    await render({ ...base, executions: { ...base.executions, 'bash-i': { kind: 'bash', status: 'running' } } })
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="执行 bash"]'), null)
    assertStatus(zh.statusRunning)
    assert.match(inspectorSection(container, '运行信息').textContent!, /正在执行/)
    await render({ ...base, executions: { ...base.executions, 'bash-i': { kind: 'bash', status: 'unknown' } } })
    assertStatus(zh.statusUnknown)
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="执行 bash"]')!.disabled, false)
    await render({ ...base, incompatible: 'node_kind missing' })
    assertStatus(zh.executionError)
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="执行 bash"]')!.disabled, true)
    assert.match(container.querySelector('[role="alert"]')!.textContent!, /node_kind missing/)
  } finally {
    await act(async () => root.unmount())
    cleanup()
  }
})

test('a late response from one branch cannot replace a newer parallel graph', async () => {
  const { dom, cleanup } = testDom()
  const row = { id: 'run', workspaceId: 'w', name: 'Parallel', templateId: 'flow', createdAt: '2026-09-24T00:00:00Z' }
  const base: any = { ...row, revision: 1, input: {}, definition: { id: 'root', type: 'dag', dag: [
    { id: 'left', type: 'node', node_kind: 'bash', command: '' }, { id: 'right', type: 'node', node_kind: 'bash', command: '' },
  ] }, snapshot: { rootInstanceId: 'root-i', instances: [
    { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
    { instanceId: 'left-i', definitionId: 'left', definitionPath: ['dag', 0], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' },
    { instanceId: 'right-i', definitionId: 'right', definitionPath: ['dag', 1], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' },
  ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  const completed = (revision: number, names: string[]) => ({ ...base, revision, snapshot: { ...base.snapshot,
    instances: base.snapshot.instances.map((item: any) => names.includes(item.definitionId) ? { ...item, status: 'completed', output: {} } : item),
  } })
  const pending = new Map<string, (response: Response) => void>()
  globalThis.fetch = async (url, init) => {
    if (url === '/api/dsh-workflow-studio/instances' && !init?.method) return nodeResponse([row])
    if (url === '/api/dsh-workflow-studio/instances/run' && !init?.method) return nodeResponse(base)
    const node = String(url).match(/\/nodes\/(left-i|right-i)\/actions\/start$/)?.[1]
    if (node) return new Promise<Response>(resolve => pending.set(node, resolve))
    return new Response('missing', { status: 404 })
  }
  const workspace = { items: [{ workspaceId: 'w', title: 'Workspace', path: '/w', sessionIds: [] }], state: 'idle', phase: 'ready', archivedSessionIds: [], pinnedSessionIds: [], error: null } as unknown as WorkspaceSnapshot
  const useWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector(workspace)
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    await act(async () => root.render(<WorkflowStudioPanel nodes={testNodes} t={key => { testLanguage = en; return en[key] }} useWorkspaces={useWorkspaces} />))
    await act(async () => container.querySelector<HTMLButtonElement>('.dsh-workflow-instance-row')!.click())
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Execute left"]')!.click()
      container.querySelector<HTMLButtonElement>('[aria-label="Execute right"]')!.click()
    })
    assert.equal(pending.size, 2)
    await act(async () => pending.get('right-i')!(nodeResponse(completed(4, ['left', 'right']))))
    await act(async () => pending.get('left-i')!(nodeResponse(completed(3, ['left']))))
    assert.equal(container.querySelector<HTMLElement>('[data-definition-id="left"]')!.dataset.status, 'completed')
    assert.equal(container.querySelector<HTMLElement>('[data-definition-id="right"]')!.dataset.status, 'completed')
  } finally {
    await act(async () => root.unmount())
    cleanup()
  }
})

test('form keeps a page draft, submits through the node action, then becomes read-only', async () => {
  const { dom, cleanup } = testDom()
  const base: any = { id: 'run', workspaceId: 'w', name: 'Form', templateId: 'flow', createdAt: '2026-09-24T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'answer', type: 'node', node_kind: 'form', output_schema: { name: 'string', count: 'number', yes: 'boolean' },
      schema: { properties: { name: { title: 'Name', default: 'Ada' }, count: { default: 0 }, yes: { default: false } } }, uiSchema: { name: { 'ui:widget': 'textarea' } } }] },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
      { instanceId: 'form-i', definitionId: 'answer', definitionPath: ['dag', 0], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  let requests = 0
  let latest: any = base
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/nodes/form-i/actions/submit')) {
      requests++
      const value = JSON.parse(String(init?.body))
      if (requests === 1) return nodeResponse({ error: { code: 'node-input-invalid', message: 'Try again' }, latest }, { status: 422 })
      latest = { ...base, revision: 2, snapshot: { ...base.snapshot, instances: base.snapshot.instances.map((item: any) => item.instanceId === 'form-i' ? { ...item, status: 'completed', output: value } : item) }, executions: { 'form-i': { kind: 'form', status: 'succeeded', output: value } } }
      return nodeResponse(latest)
    }
    return new Response('missing', { status: 404 })
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const render = async () => act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(latest)} t={key => { testLanguage = en; return en[key] }} onUpdate={value => { latest = value }} onWidthUpdate={() => {}} />))
  try {
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Details answer"]')!.click())
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!
    assert.equal(textarea.value, 'Ada')
    assert.equal(container.querySelector<HTMLInputElement>('input[type="number"]')!.value, '0')
    assert.equal(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked, false)
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Grace'); Simulate.change(textarea) })
    assert.equal(fields(inspectorSection(container, 'Definition details')).id, 'answer')
    assert.equal(inspectorSection(container, 'Definition details').querySelector('textarea, input, button'), null)
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-detail-header button')].find(button => button.textContent === en.rootDagDetails)!.click())
    assert.equal(fields(inspectorSection(container, 'Definition details')).id, 'root')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Details answer"]')!.click())
    assert.equal(container.querySelector<HTMLTextAreaElement>('textarea')!.value, 'Grace')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close details"]')!.click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Details answer"]')!.click())
    assert.equal(container.querySelector<HTMLTextAreaElement>('textarea')!.value, 'Grace')
    assert.equal(requests, 0)
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
    assert.equal(requests, 1)
    assert.equal(container.querySelector<HTMLTextAreaElement>('textarea')!.value, 'Grace')
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
    await render()
    assert.equal(requests, 2)
    assert.equal(container.querySelector<HTMLTextAreaElement>('textarea')!.disabled, true)
    assert.equal(container.querySelector<HTMLButtonElement>('button[type="submit"]'), null)
  } finally { await act(async () => root.unmount()); cleanup() }
})


test('structured form edits independent rows, deletes without reinitializing its draft and locks accepted results', async () => {
  const { dom, cleanup } = testDom()
  const defaultRows = [{ name: 'first', amount: 1 }, { name: 'middle', amount: 2 }, { name: 'last', amount: 3 }]
  const base: any = { id: 'run', workspaceId: 'w', name: 'Lists', templateId: 'flow', createdAt: '2026-10-07T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'answer', type: 'node', node_kind: 'form', output_schema: { rows: { type: 'array', items: { type: 'object', properties: { name: 'string', amount: 'number' } } } },
      schema: { properties: { rows: { title: 'Rows', default: defaultRows, items: { properties: { name: { title: 'Name' }, amount: { title: 'Amount', default: 0 } } } } } }, uiSchema: { rows: { items: { name: { 'ui:widget': 'textarea' } } } } }] },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
      { instanceId: 'form-i', definitionId: 'answer', definitionPath: ['dag', 0], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  let submitted: any
  let latest = base
  globalThis.fetch = async (_url, init) => {
    submitted = JSON.parse(String(init?.body))
    latest = { ...base, snapshot: { ...base.snapshot, instances: base.snapshot.instances.map((item: any) => item.instanceId === 'form-i' ? { ...item, status: 'completed', output: submitted } : item) }, executions: { 'form-i': { kind: 'form', status: 'succeeded', output: submitted } } }
    return nodeResponse(latest)
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const render = () => act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(latest)} t={key => { testLanguage = en; return en[key] }} onUpdate={value => { latest = value }} onWidthUpdate={() => {}} />))
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  const row = (index: number) => container.querySelector<HTMLElement>(`[role="group"][aria-label="Rows ${index}"]`)!
  const change = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => act(async () => { Object.getOwnPropertyDescriptor(input instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value); Simulate.change(input) })
  try {
    await render()
    await act(async () => button('Details answer').click())
    assert.equal(row(1).querySelector('textarea')!.value, 'first')
    await change(row(1).querySelector('textarea')!, 'changed')
    await act(async () => button('Remove Rows 2').click())
    assert.equal(row(2).querySelector('textarea')!.value, 'last')
    await act(async () => button('Add Rows').click())
    assert.equal(row(3).querySelector('textarea')!.value, '')
    assert.equal(row(3).querySelector('input')!.value, '0')
    await change(row(3).querySelector('textarea')!, 'new')
    await act(async () => button('Close details').click())
    await act(async () => button('Details answer').click())
    assert.deepEqual([...container.querySelectorAll('textarea')].map(input => input.value), ['changed', 'last', 'new'])
    assert.deepEqual(defaultRows, [{ name: 'first', amount: 1 }, { name: 'middle', amount: 2 }, { name: 'last', amount: 3 }])
    for (let index = 3; index > 0; index--) await act(async () => button(`Remove Rows ${index}`).click())
    await act(async () => button('Close details').click())
    await act(async () => button('Details answer').click())
    assert.equal(container.querySelector('textarea'), null)
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
    await render()
    assert.deepEqual(submitted, { rows: [] })
    assert.equal(button('Add Rows').disabled, true)
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('structured prefill excludes unknown fields without merging defaults and nested scalars stay unfilled until edited', async () => {
  const { dom, cleanup } = testDom()
  const input = { record: { title: '', checked: false, tags: [], nested: [[]], empty: { unrelated: 1 }, unrelated: 'secret' } }
  const base: any = { id: 'run', workspaceId: 'w', name: 'Nested', templateId: 'flow', createdAt: '2026-10-07T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'answer', type: 'node', node_kind: 'form', output_schema: {
      record: { type: 'object', properties: { title: 'string', score: 'number', checked: 'boolean', tags: { type: 'array', items: 'string' }, nested: { type: 'array', items: { type: 'array', items: 'number' } }, empty: { type: 'object', properties: {} } } },
      picks: { type: 'array', items: 'boolean' }, numbers: { type: 'array', items: 'number' }, texts: { type: 'array', items: 'string' },
    }, schema: { properties: { record: { default: { title: 'fallback', score: 9, checked: true, tags: ['a'], nested: [[9]], empty: {} }, properties: { score: { default: 7 }, tags: { items: { enum: ['a', 'b'] } } } } } } }] },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
      { instanceId: 'form-i', definitionId: 'answer', definitionPath: ['dag', 0], parentInstanceId: 'root-i', input, type: 'node', status: 'ready' },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  const requests: any[] = []
  let latest = base
  globalThis.fetch = async (_url, init) => {
    const value = JSON.parse(String(init?.body)); requests.push(value)
    if (requests.length === 1) return Response.json({ error: { code: 'node-input-invalid', message: 'Delivery refused' }, latest: withNodeViews(latest) }, { status: 422 })
    latest = { ...base, executions: { 'form-i': { kind: 'form', status: 'succeeded', output: value } } }
    return nodeResponse(latest)
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const render = () => act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(latest)} t={key => { testLanguage = en; return en[key] }} onUpdate={value => { latest = value }} onWidthUpdate={() => {}} />))
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  const control = (label: string) => { const element = [...container.querySelectorAll('label')].find(item => item.textContent === label)!; return dom.window.document.getElementById(element.htmlFor) as HTMLInputElement | HTMLSelectElement }
  const change = async (element: HTMLInputElement | HTMLSelectElement, value: string) => act(async () => { Object.getOwnPropertyDescriptor(element instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value); Simulate.change(element) })
  const submit = () => act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
  try {
    await render(); await act(async () => button('Details answer').click())
    assert.equal(control('title').value, '')
    assert.equal(control('score').value, '')
    assert.equal((control('checked') as HTMLInputElement).checked, false)
    assert.equal(container.querySelector('.dsh-workflow-form')!.textContent!.includes('secret'), false)
    await submit(); assert.match(container.querySelector('[role="alert"]')!.textContent!, /record.score/)
    assert.equal(requests.length, 0)
    await change(control('score'), '0')
    await act(async () => button('Add picks').click())
    await submit(); assert.match(container.querySelector('[role="alert"]')!.textContent!, /picks\[0\]/)
    const pick = container.querySelector<HTMLInputElement>('[aria-label="picks 1"] input')!
    await act(async () => { pick.checked = true; Simulate.change(pick) })
    await act(async () => { pick.checked = false; Simulate.change(pick) })
    await act(async () => button('Add numbers').click())
    await submit(); assert.match(container.querySelector('[role="alert"]')!.textContent!, /numbers\[0\]/)
    await change(container.querySelector<HTMLInputElement>('[aria-label="numbers 1"] input')!, '0')
    await act(async () => button('Add texts').click())
    await submit(); assert.match(container.querySelector('[role="alert"]')!.textContent!, /texts\[0\]/)
    const text = container.querySelector<HTMLInputElement>('[aria-label="texts 1"] input')!
    await change(text, 'x'); await change(text, '')
    await act(async () => button('Add tags').click())
    await change(container.querySelector<HTMLSelectElement>('[aria-label="tags 1"] select')!, '1')
    await act(async () => button('Add 1').click())
    await change(container.querySelector<HTMLInputElement>('[aria-label="nested 1"] input')!, '6')
    await submit()
    assert.equal(requests.length, 1)
    assert.equal(control('score').value, '0')
    assert.match(container.textContent!, /Delivery refused/)
    await submit(); await render()
    assert.deepEqual(requests[1], { record: { title: '', score: 0, checked: false, tags: ['b'], nested: [[6]], empty: {} }, picks: [false], numbers: [0], texts: [''] })
    assert.deepEqual(input, { record: { title: '', checked: false, tags: [], nested: [[]], empty: { unrelated: 1 }, unrelated: 'secret' } })
    assert.ok([...container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('.dsh-workflow-form input, .dsh-workflow-form select, .dsh-workflow-form button')].every(element => element.disabled))
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('prototype-sensitive form fields stay unfilled at every object level and submit their own values', async () => {
  const { dom, cleanup } = testDom()
  const properties = JSON.parse('{"constructor":"string","__proto__":"string"}')
  const detail: any = { id: 'run', workspaceId: 'w', name: 'Field names', templateId: 'flow', createdAt: '2026-10-07T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'answer', type: 'node', node_kind: 'form', output_schema: { ...properties,
      record: { type: 'object', properties }, rows: { type: 'array', items: { type: 'object', properties } },
    } }] }, snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
      { instanceId: 'form-i', definitionId: 'answer', definitionPath: ['dag', 0], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  let submitted: any
  globalThis.fetch = async (_url, init) => { submitted = JSON.parse(String(init?.body)); return nodeResponse(detail) }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  try {
    await act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => { testLanguage = en; return en[key] }} onUpdate={() => {}} onWidthUpdate={() => {}} />))
    await act(async () => button('Details answer').click())
    assert.deepEqual([...container.querySelectorAll<HTMLInputElement>('.dsh-workflow-form input')].map(input => input.value), ['', '', '', ''])
    await act(async () => button('Add rows').click())
    const inputs = [...container.querySelectorAll<HTMLInputElement>('.dsh-workflow-form input')]
    assert.deepEqual(inputs.map(input => input.value), ['', '', '', '', '', ''])
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
    assert.equal(submitted, undefined)
    assert.match(container.querySelector('[role="alert"]')!.textContent!, /form.constructor/)
    for (const [index, input] of inputs.entries()) await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, String(index))
      Simulate.change(input)
    })
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
    assert.deepEqual(submitted, JSON.parse('{"constructor":"0","__proto__":"1","record":{"constructor":"2","__proto__":"3"},"rows":[{"constructor":"4","__proto__":"5"}]}'))
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('new structured item defaults are independent across rows and node instances', async () => {
  const { dom, cleanup } = testDom()
  const itemDefault = { names: ['Ada'], count: 0, enabled: false }
  const config = { type: 'node', node_kind: 'form', output_schema: { rows: { type: 'array', items: { type: 'object', properties: { names: { type: 'array', items: 'string' }, count: 'number', enabled: 'boolean' } } } }, schema: { properties: { rows: { items: { default: itemDefault } } } } }
  const detail: any = { id: 'run', workspaceId: 'w', name: 'Independent', templateId: 'flow', createdAt: '2026-10-07T00:00:00Z', input: {}, definition: { id: 'root', type: 'dag', dag: [{ ...config, id: 'a' }, { ...config, id: 'b' }] },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {}, type: 'dag', status: 'running' },
      ...['a', 'b'].map((id, index) => ({ instanceId: `${id}-i`, definitionId: id, definitionPath: ['dag', index], parentInstanceId: 'root-i', input: {}, type: 'node', status: 'ready' })),
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  try {
    await act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => { testLanguage = en; return en[key] }} onUpdate={() => {}} onWidthUpdate={() => {}} />))
    await act(async () => button('Details a').click())
    assert.equal(container.querySelector('.dsh-workflow-form input'), null)
    await act(async () => button('Add rows').click())
    await act(async () => button('Add rows').click())
    const first = container.querySelector<HTMLInputElement>('[aria-label="rows 1"] input[type="text"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(first, 'Grace'); Simulate.change(first) })
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="rows 2"] input[type="text"]')!.value, 'Ada')
    await act(async () => button('Details b').click())
    assert.equal(container.querySelector('.dsh-workflow-form input'), null)
    await act(async () => button('Add rows').click())
    assert.equal(container.querySelector<HTMLInputElement>('input[type="text"]')!.value, 'Ada')
    await act(async () => button('Details a').click())
    assert.equal(container.querySelector<HTMLInputElement>('[aria-label="rows 1"] input[type="text"]')!.value, 'Grace')
    assert.deepEqual(itemDefault, { names: ['Ada'], count: 0, enabled: false })
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('conversation header returns to the latest instance and exact node after studio unmounts', async () => {
  const { dom, cleanup } = testDom()
  const client = new StudioClient()
  const workspaces = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null } as unknown as WorkspaceSnapshot
  const useWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector(workspaces)
  const detail: any = { id: 'run', workspaceId: 'w', name: 'Navigation run', templateId: 'source', createdAt: '2026-10-03T00:00:00Z', revision: 2, input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'same', type: 'node', node_kind: 'session_agent', prompt: '' }] },
    executions: { 'node-2': { kind: 'session_agent', status: 'waiting', sessionId: 'session-2', sessionCreated: true } },
    snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', parentInstanceId: null, definitionId: 'root', definitionPath: [], type: 'dag', status: 'running', input: {} },
      { instanceId: 'node-1', parentInstanceId: 'root-i', definitionId: 'same', definitionPath: ['dag', 0], type: 'node', status: 'ready', input: {} },
      { instanceId: 'node-2', parentInstanceId: 'root-i', definitionId: 'same', definitionPath: ['dag', 0], type: 'node', status: 'ready', input: {}, forItem: { key: 'second', index: 1 } },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } }
  const calls: string[] = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    if (String(url).includes('/conversations/')) return nodeResponse({ target: { instanceId: 'run', nodeInstanceId: 'node-2' } })
    if (String(url).endsWith('/instances/run')) return nodeResponse(detail)
    if (String(url).endsWith('/templates')) return nodeResponse({ directory: '/templates', templates: [] })
    return nodeResponse([])
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const studio = () => <WorkflowStudioPanel nodes={testNodes} client={client} t={key => { testLanguage = zh; return zh[key] }} useWorkspaces={useWorkspaces} />
  let returns = 0
  const layout = { beginNavigation: () => new AbortController().signal, selectPanel: () => { returns++; root.render(studio()) } }
  try {
    await act(async () => root.render(studio()))
    await act(async () => root.render(<ConversationInstanceAction client={client} layout={layout} sessionId="session-2" t={key => { testLanguage = zh; return zh[key] }} />))
    const back = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '返回实例')!
    assert.ok(back)
    await act(async () => { back.click(); back.click() })
    assert.equal(returns, 1)
    const selected = container.querySelector('[role="tab"][aria-selected="true"]')!
    assert.equal(selected.textContent, 'Navigation run')
    const info = inspectorSection(container, '运行信息')
    assert.equal(fields(info)['节点实例'], 'same · node-2')
    assert.equal(container.querySelectorAll('[role="tab"]').length, 3)
    assert.equal(calls.filter(url => url.includes('/actions/')).length, 0)
    assert.equal(container.querySelector('.dsh-workflow-inspector [aria-label="执行 same"]'), null)
    await act(async () => container.querySelector<HTMLButtonElement>('.react-flow__controls-zoomin')!.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
    const view = container.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform
    await act(async () => root.render(<ConversationInstanceAction client={client} layout={layout} sessionId="session-2" t={key => { testLanguage = zh; return zh[key] }} />))
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(container.querySelectorAll('[role="tab"]').length, 3)
    assert.equal(container.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform, view)
    assert.equal(fields(inspectorSection(container, '运行信息'))['节点实例'], 'same · node-2')
    await act(async () => container.querySelector<HTMLButtonElement>('.dsh-workflow-tab-close')!.click())
    await act(async () => root.render(<ConversationInstanceAction client={client} layout={layout} sessionId="session-2" t={key => { testLanguage = zh; return zh[key] }} />))
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(container.querySelectorAll('[role="tab"]').length, 3)
    assert.notEqual(container.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform, view)
    assert.equal(fields(inspectorSection(container, '运行信息'))['节点实例'], 'same · node-2')
  } finally {
    await act(async () => root.unmount()); client.dispose(); cleanup()
  }
})


test('one plugin client preserves ordered instance and template tabs and independent viewports across unmounts', async () => {
  const { dom, cleanup } = testDom()
  dom.window.matchMedia = (() => ({ matches: true })) as any
  const client = new StudioClient()
  const workspace = { items: [{ workspaceId: 'w', title: 'Workspace', sessionIds: [] }], phase: 'ready' } as unknown as WorkspaceSnapshot
  const useWorkspaces = <T,>(selector: (snapshot: WorkspaceSnapshot) => T) => selector(workspace)
  const detail = (id: string): any => ({ id, workspaceId: 'w', name: id, templateId: 'flow', createdAt: '2026-10-03T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [] }, snapshot: { rootInstanceId: 'root-i', instances: [
      { instanceId: 'root-i', definitionId: 'root', definitionPath: [], parentInstanceId: null, type: 'dag', status: 'running', input: {} },
    ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } })
  globalThis.fetch = async url => {
    if (String(url).endsWith('/instances')) return nodeResponse([detail('A'), detail('B')])
    if (String(url).endsWith('/templates')) return nodeResponse({ directory: '/templates', templates: [{ key: 'flow', source: '@test/templates/flow', id: 'flow', name: 'flow' }] })
    if (String(url).endsWith('/templates/flow')) return nodeResponse({ key: 'flow', source: '@test/templates/flow', id: 'flow', name: 'flow', definition: detail('A').definition })
    return nodeResponse(detail(String(url).split('/').at(-1)!))
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const render = (value = client) => root.render(<WorkflowStudioPanel nodes={testNodes} client={value} t={key => { testLanguage = zh; return zh[key] }} useWorkspaces={useWorkspaces} />)
  const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const click = async (button: HTMLButtonElement) => act(async () => button.click())
  const viewport = (index: number) => container.querySelectorAll<HTMLElement>('.react-flow__viewport')[index].style.transform
  try {
    await act(async () => render())
    const rows = [...container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-instance-row')]
    await click(rows[0]); await click(tabs()[0]); await click(rows[1])
    await click(tabs()[1])
    await click(container.querySelector<HTMLButtonElement>('.dsh-workflow-template-item button')!)
    const zoom = [...container.querySelectorAll<HTMLButtonElement>('.react-flow__controls-zoomin')]
    await click(zoom[0]); await click(zoom[1]); await click(zoom[1]); await click(zoom[2]); await click(zoom[2]); await click(zoom[2])
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
    const beforePan = viewport(0)
    await act(async () => {
      const pane = container.querySelector<HTMLElement>('.react-flow__pane')!
      pane.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 300, button: 0, view: dom.window as any }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 410, clientY: 370, buttons: 1, view: dom.window as any }))
      dom.window.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, clientX: 410, clientY: 370, view: dom.window as any }))
    })
    assert.notEqual(viewport(0), beforePan)
    const views = [viewport(0), viewport(1), viewport(2)]
    assert.equal(new Set(views).size, 3)
    await act(async () => root.render(null))
    await act(async () => render())
    assert.deepEqual(tabs().map(tab => tab.textContent), ['实例管理', '模板管理', 'A', 'B', 'flow'])
    assert.equal(tabs()[4].getAttribute('aria-selected'), 'true')
    assert.deepEqual([viewport(0), viewport(1), viewport(2)], views)
    await act(async () => root.render(null))
    await act(async () => render(new StudioClient()))
    assert.deepEqual(tabs().map(tab => tab.textContent), ['实例管理', '模板管理'])
  } finally { await act(async () => root.unmount()); client.dispose(); cleanup() }
})


test('superseded host navigation leaves the current conversation return action usable', async () => {
  const { dom, cleanup } = testDom()
  const client = new StudioClient()
  const controller = new AbortController()
  let delayed: (value: Response) => void = () => {}
  let delay = true
  let selected = false
  globalThis.fetch = async url => {
    if (String(url).includes('/conversations/')) return nodeResponse({ target: { instanceId: 'run', nodeInstanceId: 'node' } })
    if (delay) return new Promise<Response>(resolve => { delayed = resolve })
    return nodeResponse({ id: 'run', workspaceId: 'w', name: 'Run', templateId: 'flow', createdAt: '2026-10-03T00:00:00Z', definition: { id: 'root', type: 'dag', dag: [] }, input: {}, snapshot: { rootInstanceId: 'root', instances: [], waitingPositions: [], skippedPositions: [], edges: [] } })
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  let first = true
  const layout = { beginNavigation: () => { if (first) { first = false; return controller.signal } return new AbortController().signal }, selectPanel: () => { selected = true } }
  try {
    await act(async () => root.render(<ConversationInstanceAction sessionId="session" client={client} layout={layout} t={key => { testLanguage = zh; return zh[key] }} />))
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(container.querySelector<HTMLButtonElement>('button')!.disabled, true)
    await act(async () => { controller.abort(); delayed(nodeResponse({})); await Promise.resolve() })
    assert.equal(selected, false)
    assert.equal(container.querySelector<HTMLButtonElement>('button')!.disabled, false)
    delay = false
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(selected, true)
  } finally { await act(async () => root.unmount()); client.dispose(); cleanup() }
})


function returnPage() {
  const { dom, cleanup } = testDom()
  const client = new StudioClient()
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const workspaces = { items: [], phase: 'ready' } as unknown as WorkspaceSnapshot
  let navigation = new AbortController()
  const studio = () => <WorkflowStudioPanel nodes={testNodes} client={client} t={key => { testLanguage = zh; return zh[key] }} useWorkspaces={selector => selector(workspaces)} />
  const layout = { beginNavigation: () => { navigation.abort(); navigation = new AbortController(); return navigation.signal },
    selectPanel: () => root.render(studio()) }
  return { container, client,
    showStudio: () => act(async () => root.render(studio())),
    header: (sessionId: string) => act(async () => root.render(<ConversationInstanceAction sessionId={sessionId} client={client} layout={layout} t={key => { testLanguage = zh; return zh[key] }} />)),
    close: async () => { await act(async () => root.unmount()); client.dispose(); cleanup() } }
}
const returnDetail = (id = 'run', nodeId = 'n2'): any => ({ id, workspaceId: 'w', name: id, templateId: 'flow', revision: 3, createdAt: '2026-10-03T00:00:00Z', input: {},
  definition: { id: 'root', type: 'dag', dag: [{ id: 'task', type: 'node', node_kind: 'session_agent', prompt: '' }] },
  executions: { [nodeId]: { kind: 'session_agent', status: 'succeeded', sessionId: 'session', sessionCreated: true, output: {} } },
  snapshot: { rootInstanceId: 'root-i', instances: [
    { instanceId: 'root-i', parentInstanceId: null, definitionId: 'root', definitionPath: [], type: 'dag', status: 'completed', input: {}, output: {} },
    { instanceId: nodeId, parentInstanceId: 'root-i', definitionId: 'task', definitionPath: ['dag', 0], type: 'node', status: 'completed', input: {}, output: {} },
  ], waitingPositions: [], skippedPositions: [], edges: [], instanceConnections: [] } })

test('conversation query errors are retryable and ordinary and fork conversations have no return action', async () => {
  const page = returnPage()
  let fail = true
  globalThis.fetch = async url => String(url).includes('/conversations/ordinary/') || String(url).includes('/conversations/fork/')
    ? nodeResponse({ target: null }) : fail ? new Response('unavailable', { status: 503 }) : nodeResponse({ target: { instanceId: 'run', nodeInstanceId: 'n2' } })
  try {
    await page.header('session')
    assert.equal(page.container.querySelector('[role="alert"]')!.textContent, zh.navigationFailed)
    fail = false
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(page.container.querySelector('button')!.textContent, zh.returnToInstance)
    await page.header('ordinary'); assert.equal(page.container.querySelector('button'), null)
    await page.header('fork'); assert.equal(page.container.querySelector('button'), null)
  } finally { await page.close() }
})

test('detail loading errors can retry the return and completed nodes remain read only', async () => {
  const page = returnPage()
  let fail = true
  globalThis.fetch = async url => {
    if (String(url).includes('/conversations/')) return nodeResponse({ target: { instanceId: 'run', nodeInstanceId: 'n2' } })
    if (String(url).endsWith('/instances/run')) return fail ? new Response('unavailable', { status: 503 }) : nodeResponse(returnDetail())
    return nodeResponse([])
  }
  try {
    await page.header('session')
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(page.container.querySelector('[role="alert"]')!.textContent, zh.navigationFailed)
    assert.equal(page.container.querySelector('[role="tab"]'), null)
    fail = false
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(page.container.querySelector('[role="tab"][aria-selected="true"]')!.textContent, 'run')
    assert.equal(fields(inspectorSection(page.container, '运行信息'))['状态'], zh.statusCompleted)
    assert.equal(page.container.querySelector('.dsh-workflow-inspector button[aria-label^="完成"]'), null)
  } finally { await page.close() }
})

test('deletion between showing the action and clicking it clears cached details and permits management', async () => {
  const page = returnPage()
  let deleted = false
  globalThis.fetch = async url => {
    if (String(url).includes('/conversations/')) return nodeResponse({ target: deleted ? null : { instanceId: 'run', nodeInstanceId: 'n2' } })
    if (String(url).endsWith('/instances/run')) return nodeResponse(returnDetail())
    return nodeResponse([])
  }
  try {
    await page.header('session')
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(page.container.querySelectorAll('[role="tab"]').length, 3)
    await page.header('session')
    deleted = true
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(page.container.querySelector('[role="alert"]')!.textContent, zh.navigationInstanceMissing)
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(page.container.querySelector('button'), null)
    await page.showStudio()
    assert.equal(page.container.querySelectorAll('[role="tab"]').length, 2)
    assert.equal(page.container.querySelector('[role="tab"][aria-selected="true"]')!.textContent, zh.instanceManagement)
  } finally { await page.close() }
})

test('late ownership and detail responses never replace the current conversation or navigate to its predecessor', async () => {
  const page = returnPage()
  let oldQuery: (value: Response) => void = () => {}
  let oldDetail: (value: Response) => void = () => {}
  globalThis.fetch = async url => {
    if (String(url).includes('/conversations/first/')) return new Promise<Response>(resolve => { oldQuery = resolve })
    if (String(url).includes('/conversations/')) return nodeResponse({ target: { instanceId: 'second', nodeInstanceId: 'n2' } })
    if (String(url).endsWith('/instances/second')) return new Promise<Response>(resolve => { oldDetail = resolve })
    return nodeResponse([])
  }
  try {
    await page.header('first'); await page.header('second')
    await act(async () => oldQuery(nodeResponse({ target: { instanceId: 'first', nodeInstanceId: 'n1' } })))
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    await page.header('third')
    await act(async () => oldDetail(nodeResponse(returnDetail('second'))))
    assert.equal(page.container.querySelector('[role="tab"]'), null)
    assert.equal(page.container.querySelector('button')!.textContent, zh.returnToInstance)
    page.client.dispose()
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    await act(async () => oldDetail(nodeResponse(returnDetail('second'))))
    assert.equal(page.container.querySelector('[role="tab"]'), null)
  } finally { await page.close() }
})


test('return uses the newest revision when an older detail response arrives after node completion', async () => {
  const page = returnPage()
  let loads = 0
  let actionDone: (value: Response) => void = () => {}
  let oldLoaded: (value: Response) => void = () => {}
  const waiting = returnDetail()
  waiting.revision = 2
  waiting.executions.n2.status = 'waiting'
  waiting.snapshot.instances[0].status = 'running'
  waiting.snapshot.instances[1].status = 'ready'
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/conversations/')) return nodeResponse({ target: { instanceId: 'run', nodeInstanceId: 'n2' } })
    if (init?.method === 'POST') return new Promise<Response>(resolve => { actionDone = resolve })
    if (String(url).endsWith('/instances/run')) {
      loads++
      return loads === 1 ? nodeResponse(waiting) : new Promise<Response>(resolve => { oldLoaded = resolve })
    }
    return nodeResponse([])
  }
  try {
    await page.header('session')
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    const complete = [...page.container.querySelectorAll<HTMLButtonElement>('.dsh-workflow-inspector button')].find(button => button.textContent === zh.completeSessionAgent)!
    assert.ok(complete)
    await act(async () => complete.click())
    await page.header('session')
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    await act(async () => actionDone(nodeResponse(returnDetail())))
    await act(async () => oldLoaded(nodeResponse(waiting)))
    assert.equal(fields(inspectorSection(page.container, '运行信息'))['状态'], zh.statusCompleted)
    assert.equal(page.container.querySelectorAll('[role="tab"]').length, 3)
    assert.equal(page.container.querySelector('.dsh-workflow-inspector button[aria-label^="完成"]'), null)
  } finally { await page.close() }
})


test('an older return detail cannot overwrite a drawer width saved while navigation is loading', async () => {
  const page = returnPage()
  let loads = 0
  let widthSaved: (value: Response) => void = () => {}
  let oldLoaded: (value: Response) => void = () => {}
  const initial = { ...returnDetail(), revision: 2, drawerWidth: 320 }
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/conversations/')) return nodeResponse({ target: { instanceId: 'run', nodeInstanceId: 'n2' } })
    if (init?.method === 'POST') return new Promise<Response>(resolve => { widthSaved = resolve })
    if (String(url).endsWith('/instances/run')) return ++loads === 1 ? nodeResponse(initial) : new Promise<Response>(resolve => { oldLoaded = resolve })
    return nodeResponse([])
  }
  try {
    await page.header('session')
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    await act(async () => page.container.querySelector('[role="separator"]')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
    await page.header('session')
    await act(async () => page.container.querySelector<HTMLButtonElement>('button')!.click())
    await act(async () => widthSaved(nodeResponse({ ...initial, revision: 3, drawerWidth: 330 })))
    await act(async () => oldLoaded(nodeResponse(initial)))
    assert.equal(page.container.querySelector('[role="separator"]')!.getAttribute('aria-valuenow'), '330')
  } finally { await page.close() }
})


test('third-party server actions get one public card button and missing client handlers are hidden', async () => {
  const { dom, cleanup } = testDom()
  const detail: any = { id: 'third-party', workspaceId: 'w', name: 'Third party', templateId: 't', createdAt: '2026-10-04T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'external', type: 'node', node_kind: 'external' }] },
    snapshot: { rootInstanceId: 'root-i', instances: [{ instanceId: 'root-i', definitionId: 'root', definitionPath: [], type: 'dag', status: 'running', input: {}, parentInstanceId: null }, { instanceId: 'external-i', definitionId: 'external', definitionPath: ['dag', 0], type: 'node', status: 'ready', input: {}, parentInstanceId: 'root-i' }], waitingPositions: [], skippedPositions: [], edges: [] },
    nodeViews: { 'external-i': { source: 'external-package', token: 'current', actions: [
      { id: 'start', label: { text: 'Run external' }, target: { type: 'server' }, primary: true },
      { id: 'inspect', label: { text: 'Inspect external' }, target: { type: 'details' } },
      { id: 'open', label: { text: 'Missing handler' }, target: { type: 'client', handler: 'open' } },
    ] } },
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const calls: unknown[] = []
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return nodeResponse(detail) }
  try {
    await act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => { testLanguage = zh; return zh[key] }} onUpdate={() => {}} onWidthUpdate={() => {}} />))
    const card = container.querySelector('.react-flow__node[data-id="external-i"]')!
    assert.deepEqual([...card.querySelectorAll('button')].map(button => button.textContent?.trim()), ['Run external', 'ⓘ 详情'])
    await act(async () => card.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(calls.length, 1)
    assert.equal(container.querySelector('.dsh-workflow-inspector'), null)
    await act(async () => card.querySelector<HTMLButtonElement>('[aria-label="详情 external"]')!.click())
    const runtime = inspectorSection(container, '运行信息')
    assert.match(runtime.textContent!, /Run external.*Inspect external/s)
    assert.doesNotMatch(runtime.textContent!, /Missing handler/)
    assert.equal(fields(inspectorSection(container, '定义详情')).node_kind, 'external')
  } finally { await act(async () => root.unmount()); cleanup() }
})


test('frontend unload clears its drafts with feedback, and a new frontend keeps saved output intact', async () => {
  const { dom, context, cleanup } = testDom()
  const detail: any = { id: 'draft-run', workspaceId: 'w', name: 'Draft', templateId: 't', createdAt: '2026-10-04T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'answer', type: 'node', node_kind: 'form', output_schema: { message: 'string' } }] },
    snapshot: { rootInstanceId: 'r', instances: [{ instanceId: 'r', type: 'dag', status: 'running', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {} }, { instanceId: 'a', type: 'node', status: 'ready', definitionId: 'answer', definitionPath: ['dag', 0], parentInstanceId: 'r', input: {} }], waitingPositions: [], skippedPositions: [], edges: [] },
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const render = () => act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={withNodeViews(detail)} t={key => zh[key]} onUpdate={() => {}} onWidthUpdate={() => {}} />))
  try {
    await render()
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="详情 answer"]')!.click())
    const input = container.querySelector<HTMLInputElement>('.dsh-workflow-form input')!
    await act(async () => { input.value = 'temporary'; Simulate.change(input) })
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关闭详情"]')!.click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="详情 answer"]')!.click())
    assert.equal(container.querySelector<HTMLInputElement>('.dsh-workflow-form input')!.value, 'temporary')
    await act(async () => context.fiber.dispose())
    assert.match(container.textContent!, /未提交草稿已清除/)
    assert.equal(container.querySelector('.dsh-workflow-form'), null)
    const fresh = new Context()
    await act(async () => testNodes.register(fresh, '@dsh-workflow/node-form', formClient))
    assert.equal(container.querySelector<HTMLInputElement>('.dsh-workflow-form input')!.value, '')
    detail.snapshot.instances[1].status = 'completed'
    detail.snapshot.instances[1].output = { message: 'accepted' }
    await render()
    assert.equal(container.querySelector<HTMLInputElement>('.dsh-workflow-form input')!.value, 'accepted')
    assert.equal(container.querySelector<HTMLInputElement>('.dsh-workflow-form input')!.disabled, true)
    await act(async () => fresh.fiber.dispose())
    await act(async () => testNodes.register(new Context(), '@dsh-workflow/node-form', formClient))
    assert.equal(container.querySelector<HTMLInputElement>('.dsh-workflow-form input')!.value, 'accepted')
  } finally { await act(async () => root.unmount()); cleanup() }
})

test('browser contributions match their source and isolate component and synchronous or asynchronous action failures', async () => {
  const { dom, cleanup } = testDom()
  const detail: any = { id: 'local-errors', workspaceId: 'w', name: 'Local errors', templateId: 't', createdAt: '2026-10-04T00:00:00Z', input: {},
    definition: { id: 'root', type: 'dag', dag: [{ id: 'custom', type: 'node', node_kind: 'custom' }] },
    snapshot: { rootInstanceId: 'r', instances: [{ instanceId: 'r', type: 'dag', status: 'running', definitionId: 'root', definitionPath: [], parentInstanceId: null, input: {} }, { instanceId: 'c', type: 'node', status: 'completed', definitionId: 'custom', definitionPath: ['dag', 0], parentInstanceId: 'r', input: {}, output: {} }], waitingPositions: [], skippedPositions: [], edges: [] },
    incompatible: 'missing another required type',
    nodeViews: { c: { source: 'correct-package', token: 'now', actions: [{ id: 'sync', label: { text: 'Sync navigation' }, target: { type: 'client', handler: 'sync' }, primary: true }, { id: 'async', label: { text: 'Async navigation' }, target: { type: 'client', handler: 'async' } }] } },
  }
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  const render = () => act(async () => root.render(<InstanceRunPanel nodes={testNodes} detail={detail} t={key => zh[key]} onUpdate={() => {}} onWidthUpdate={() => {}} />))
  const wrong = new Context(), correct = new Context()
  const oldError = console.error
  console.error = () => {}
  try {
    testNodes.register(wrong, 'wrong-package', { kind: 'custom', Panel: () => <p>Wrong business</p>, handlers: { sync: () => {} } })
    await render()
    assert.doesNotMatch(container.textContent!, /Sync navigation|Wrong business/)
    await act(async () => testNodes.register(correct, 'correct-package', { kind: 'custom',
      Panel: () => { throw new Error('render failure') },
      handlers: { sync: () => { throw new Error('sync failure') }, async: async () => { throw new Error('async failure') } },
    }))
    const navigate = container.querySelector<HTMLButtonElement>('[aria-label="Sync navigation custom"]')!
    assert.equal(navigate.disabled, false, 'navigation remains usable on completed and paused history')
    await act(async () => navigate.click())
    assert.match(container.textContent!, /sync failure/)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="详情 custom"]')!.click())
    assert.match(inspectorSection(container, '运行信息').textContent!, /节点业务界面发生错误/)
    assert.equal(fields(inspectorSection(container, '定义详情')).node_kind, 'custom')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Async navigation"]')!.click())
    assert.match(container.textContent!, /async failure/)
    await act(async () => correct.fiber.dispose())
    assert.doesNotMatch(inspectorSection(container, '运行信息').textContent!, /Sync navigation|Wrong business/)
    assert.ok(container.querySelector('[aria-label="关闭详情"]'))
  } finally { console.error = oldError; await act(async () => root.unmount()); await wrong.fiber.dispose(); cleanup() }
})
