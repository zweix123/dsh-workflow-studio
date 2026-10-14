import { expect } from 'e2e'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, detailField, inspectNode, openWorkflows } from '../ui.js'

test('模板与实例的输入输出契约、表单注解和控件配置以完整 YAML 展示', async ({ app, screen, browser, dsh }) => {
  const fixture = parse(await readFile(new URL('../../packages/dsh-workflow-studio/tests/fixtures/form-structured/templates/structured/workflow.yaml', import.meta.url), 'utf8'))
  const review = fixture.dag.find((node: { id?: string }) => node.id === 'review')
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('button', '打开模板 结构化表单验收 / Structured form E2E', { exact: true }).tap()
  await inspectNode(screen, 'review')
  const selector = '.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-body > section[aria-label="定义详情"]'
  const values = () => browser.evaluate(selector => Object.fromEntries([...document.querySelectorAll(`${selector} dl > div`)].map(row => [row.querySelector('dt')!.textContent!, row.querySelector('dd pre')!.textContent!])), selector)
  const template = await values()
  expect(Object.keys(template)).toEqual(Object.keys(review))
  for (const key of ['input_schema', 'output_schema', 'schema', 'uiSchema']) {
    expect(parse(template[key])).toEqual(review[key])
    expect(template[key]).not.toMatch(/&a\d|\*a\d/)
  }
  expect(template.input_schema).toContain('rows:\n  type: array\n  items:\n    type: object')
  expect(template.schema).toContain('title: 额外备注 / Extra note')
  expect(template.uiSchema).toContain('ui:widget: textarea')
  await createInstance(screen, dsh.workspaceName, fixture.id, 'yaml-details')
  await inspectNode(screen, 'review')
  expect(await values()).toEqual(template)
  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '深色', { exact: true }).tap()
  await screen.getByRole('button', '中文', { exact: true }).tap()
  await screen.getByRole('menuitem', 'English', { exact: true }).tap()
  await screen.getByRole('button', 'Close', { exact: true }).tap()
  await browser.setViewport({ width: 390, height: 844 })
  const englishSelector = selector.replace('定义详情', 'Definition details')
  expect(await browser.evaluate(selector => Object.fromEntries([...document.querySelectorAll(`${selector} dl > div`)].map(row => [row.querySelector('dt')!.textContent!, row.querySelector('dd pre')!.textContent!])), englishSelector)).toEqual(template)
  await browser.locator(`${englishSelector} dt:text-is("uiSchema") + dd pre`).scrollIntoView()
  await expect(browser.locator(`${englishSelector} dt:text-is("uiSchema") + dd pre`)).toBeVisible()
  expect(await browser.evaluate(() => {
    const body = document.querySelector('.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-body')!
    return body.scrollWidth <= body.clientWidth
  })).toBe(true)
})

test('模板与实例详情可拖拽和键盘调整宽度，模板保留页面偏好且实例重启后恢复', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('button', '打开模板 条件分支回归', { exact: true }).tap()
  await inspectNode(screen, 'source')
  const selector = '.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-resize'
  const handle = browser.locator(selector)
  const width = () => browser.evaluate(selector => Number(document.querySelector(selector)!.getAttribute('aria-valuenow')), selector)
  const viewport = () => browser.locator('.dsh-workflow-studio-panel:not([hidden]) .react-flow__viewport').getAttribute('style')
  const drag = async (delta: number) => {
    const point = await browser.evaluate(selector => {
      const rect = document.querySelector(selector)!.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }, selector)
    await browser.mouse.move(point.x, point.y)
    await browser.mouse.down()
    await browser.mouse.move(point.x + delta, point.y)
    await browser.mouse.up()
  }
  await expect(handle).toHaveAttribute('aria-valuenow', '320')
  const originalViewport = await viewport()
  await drag(-100)
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  expect(await browser.evaluate(() => getComputedStyle(document.querySelector('.dsh-workflow-template-inspector')!).width)).toBe('420px')
  expect(await viewport()).toBe(originalViewport)
  await handle.press('ArrowLeft')
  await expect(handle).toHaveAttribute('aria-valuenow', '430')
  await handle.press('ArrowRight')
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  await screen.getByRole('button', '关闭详情', { exact: true }).tap()
  await screen.getByRole('button', '根 DAG 详情', { exact: true }).tap()
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  await inspectNode(screen, 'active')
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('tab', '条件分支回归', { exact: true }).tap()
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  await drag(1000)
  await expect(handle).toHaveAttribute('aria-valuenow', '300')
  await drag(-2000)
  expect(await width()).toBe(Number(await handle.getAttribute('aria-valuemax')))

  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '深色', { exact: true }).tap()
  await screen.getByRole('button', '中文', { exact: true }).tap()
  await screen.getByRole('menuitem', 'English', { exact: true }).tap()
  await screen.getByRole('button', 'Close', { exact: true }).tap()
  await expect(screen.getByRole('separator', 'Resize details', { exact: true })).toBeVisible()
  await browser.setViewport({ width: 390, height: 844 })
  await expect.poll(() => browser.evaluate(() => {
    const panel = document.querySelector('.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-run')!
    const inspector = panel.querySelector<HTMLElement>('.dsh-workflow-inspector')!
    return inspector.clientWidth <= panel.clientWidth && inspector.scrollWidth <= inspector.clientWidth
  })).toBe(true)
  await browser.setViewport({ width: 1440, height: 900 })
  await screen.getByRole('button', 'Settings', { exact: true }).tap()
  await screen.getByRole('button', 'Light', { exact: true }).tap()
  await screen.getByRole('button', 'English', { exact: true }).tap()
  await screen.getByRole('menuitem', '中文', { exact: true }).tap()
  await screen.getByRole('button', '关闭', { exact: true }).tap()

  await createInstance(screen, dsh.workspaceName, 'regression-branches', 'resizable-details')
  await inspectNode(screen, 'source')
  await drag(-100)
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  await handle.press('ArrowLeft')
  await expect(handle).toHaveAttribute('aria-valuenow', '430')
  await screen.getByRole('button', '关闭详情', { exact: true }).tap()
  await screen.getByRole('button', '根 DAG 详情', { exact: true }).tap()
  await expect(handle).toHaveAttribute('aria-valuenow', '430')
  await dsh.restart(browser)
  await app.open('/')
  await openWorkflows(screen, browser)
  await screen.getByRole('button', /^resizable-details/).tap()
  await inspectNode(screen, 'source')
  await expect(handle).toHaveAttribute('aria-valuenow', '430')
})

test('配置原顺序在前、运行字段在末尾，插件日志来源明确，等待跳过和空插件不占位', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('button', '打开模板 条件分支回归', { exact: true }).tap()
  await inspectNode(screen, 'source')
  const bodySelector = '.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-body'
  const body = (selector: string) => browser.locator(`${bodySelector} :is(${selector})`)
  const config = (selector: string) => body(`section[aria-label="定义详情"] ${selector}`)
  const runtime = (selector: string) => body(`section[aria-label="运行信息"] ${selector}`)
  const plugin = (selector: string) => body(`section[aria-label="节点插件详情 · bash"] ${selector}`)
  const configuration = [
    'source', 'node', 'bash', 'printf \'{"enabled":true}\'', 'enabled: boolean',
  ]
  await expect(body('h4, h5')).toHaveCount(0)
  await expect(body('section')).toHaveCount(1)
  await expect(body(':is(button, input, textarea)')).toHaveCount(0)
  await expect(config('dt')).toHaveText(['id', 'type', 'node_kind', 'command', 'output_schema'])
  await expect(config('dd pre')).toHaveText(configuration)

  await createInstance(screen, dsh.workspaceName, 'regression-branches', 'details-blocks')
  await inspectNode(screen, 'active')
  await expect(body('h4:visible, h5:visible')).toHaveCount(0)
  await expect(runtime('dt')).toHaveText(['所属 DAG 实例', '状态'])
  await expect(detailField(browser, 'active', '状态')).toHaveText('等待')

  await inspectNode(screen, 'source')
  expect(await browser.evaluate(selector => [...document.querySelector(selector)!.children].map(element => element.getAttribute('aria-label')), bodySelector)).toEqual(['定义详情', '运行信息'])
  await expect(config('dd pre')).toHaveText(configuration)
  await expect(runtime('dt')).toHaveText(['节点实例', '所属 DAG 实例', '状态', '输入'])
  await expect(body('.dsh-workflow-plugin-details')).not.toBeVisible()
  await expect(body('section[aria-label="运行信息"] > :is(h4, h5)')).toHaveCount(0)
  await screen.getByRole('button', '执行 source', { exact: true }).tap()
  await expect(detailField(browser, 'source', '状态')).toHaveText('已完成')
  await expect(runtime('dt')).toHaveText(['节点实例', '所属 DAG 实例', '状态', '输入', '输出'])
  await expect(runtime('dt:text-is("输出") + dd pre')).toHaveText('{\n  "enabled": true\n}')
  await expect(plugin('strong')).toHaveText('命令日志 · stdout')
  await expect(plugin('pre')).toHaveText('{"enabled":true}')
  await expect(plugin('h4')).toHaveText('节点插件详情 · bash')
  await expect(plugin('p')).toHaveText('以下内容由节点插件提供')
  await expect(plugin(':is(button, input, textarea, select)')).toHaveCount(0)
  expect(await browser.evaluate(selector => {
    const element = document.querySelector(`${selector} .dsh-workflow-plugin-details`)!
    const runtime = element.parentElement!
    const style = getComputedStyle(element)
    return { inside: runtime.getAttribute('aria-label'), border: parseFloat(style.borderTopWidth) > 0,
      background: style.backgroundColor !== getComputedStyle(runtime).backgroundColor }
  }, bodySelector)).toEqual({ inside: '运行信息', border: true, background: true })

  await inspectNode(screen, 'closed')
  await expect(body('h4:visible, h5:visible')).toHaveCount(0)
  await expect(runtime('dt')).toHaveText(['所属 DAG 实例', '状态'])
  await expect(detailField(browser, 'closed', '状态')).toHaveText('已跳过')
  await screen.getByRole('button', '根 DAG 详情', { exact: true }).tap()
  await expect(body('h4, h5')).toHaveCount(0)
  await expect(runtime('dt')).toHaveText(['DAG 实例', '状态', '输入'])
  await expect(config('dt')).toHaveText(['id', 'name', 'type'])
  await expect(body('.dsh-workflow-plugin-details')).toHaveCount(0)

  await inspectNode(screen, 'source')
  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '深色', { exact: true }).tap()
  await screen.getByRole('button', '关闭', { exact: true }).tap()
  await expect(plugin('h4')).toBeVisible()
  expect(await browser.evaluate(selector => {
    const element = document.querySelector(`${selector} .dsh-workflow-plugin-details`)!
    return getComputedStyle(element).backgroundColor !== getComputedStyle(element.parentElement!).backgroundColor
  }, bodySelector)).toBe(true)
  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '浅色', { exact: true }).tap()
  await screen.getByRole('button', '中文', { exact: true }).tap()
  await screen.getByRole('menuitem', 'English', { exact: true }).tap()
  await screen.getByRole('button', 'Close', { exact: true }).tap()
  await browser.setViewport({ width: 390, height: 844 })
  await expect(body('h4')).toHaveText('Node plugin details · bash')
  await expect(body('.dsh-workflow-plugin-details > p')).toHaveText('The following content is provided by the node plugin')
  await expect(body('section[aria-label="Definition details"] dd pre')).toHaveText(configuration)
  await expect(body('section[aria-label="Running information"] dt')).toHaveText(['Node instance', 'Containing DAG instance', 'Status', 'Input', 'Output'])
  await expect.poll(() => browser.evaluate(() => {
    const element = document.querySelector('.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-body')!
    return element.scrollWidth <= element.clientWidth
  })).toBe(true)
  await body('.dsh-workflow-plugin-details h4').scrollIntoView()
  await expect(body('.dsh-workflow-plugin-details h4')).toBeVisible()
})


test('配置保留原字段顺序和完整结构，源模板更新后实例仍展示创建快照', async ({ app, screen, browser, dsh }) => {
  const bundle = join(dsh.root, 'details-fixture')
  await mkdir(join(bundle, 'templates', 'snapshot'), { recursive: true })
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: '@dsh-workflow/details-fixture', version: '0.1.0', private: true,
    dsh: { bundle: { patch: './cordis.patch.yml' } }, exports: { './templates/*/workflow.yaml': './templates/*/workflow.yaml' } }))
  await writeFile(join(bundle, 'cordis.patch.yml'), stringify([{ insert: [{ id: 'details-snapshot', name: 'dsh-workflow-template', config: { directory: '@dsh-workflow/details-fixture/templates/snapshot' } }] }]))
  const prompt = '原语言 Original content\n' + '完整长文本不截断 — keep original text. '.repeat(60) + '\nFINAL_MARKER_731'
  const node = { prompt, node_kind: 'agent', id: 'task', type: 'node', output_schema: { answer: { type: 'object', properties: { done: 'boolean' } } },
    custom: { zero: 0, flag: false, empty: '', object: {}, array: [] }, dag: 'ordinary extension' }
  const definition = { id: 'details-snapshot', name: '详情快照回归', type: 'dag', dag: [node] }
  const file = join(bundle, 'templates', 'snapshot', 'workflow.yaml')
  await writeFile(file, stringify(definition))
  await dsh.stop(); await dsh.addBundle(bundle); await dsh.start(); await dsh.authenticate(browser)
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('button', '打开模板 详情快照回归', { exact: true }).tap()
  await inspectNode(screen, 'task')
  const configSelector = '.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-body > section[aria-label="定义详情"]'
  const keys = browser.locator(`${configSelector} dt`)
  const content = browser.locator(`${configSelector} dd pre`)
  await expect(keys).toHaveText(['prompt', 'node_kind', 'id', 'type', 'output_schema', 'custom', 'dag'])
  await expect(content).toHaveText([prompt, 'agent', 'task', 'node', 'answer:\n  type: object\n  properties:\n    done: boolean', 'zero: 0\nflag: false\nempty: ""\nobject: {}\narray: []', 'ordinary extension'])
  const templateContent = await browser.evaluate(selector => [...document.querySelectorAll(`${selector} dd pre`)].map(element => element.textContent), configSelector)
  await createInstance(screen, dsh.workspaceName, 'details-snapshot', 'snapshot-details')
  await inspectNode(screen, 'task')
  expect(await browser.evaluate(selector => [...document.querySelectorAll(`${selector} dd pre`)].map(element => element.textContent), configSelector)).toEqual(templateContent)
  await expect(browser.locator('.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-plugin-details')).not.toBeVisible()
  await writeFile(file, stringify({ ...definition, dag: [{ ...node, prompt: 'UPDATED SOURCE' }] }))
  await dsh.restart(browser)
  await app.open('/')
  await openWorkflows(screen, browser)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('button', '打开模板 详情快照回归', { exact: true }).tap()
  await inspectNode(screen, 'task')
  await expect(browser.locator(`${configSelector} dt:text-is("prompt") + dd pre`)).toHaveText('UPDATED SOURCE')
  await screen.getByRole('tab', '实例管理', { exact: true }).tap()
  await screen.getByRole('button', /^snapshot-details/).tap()
  await inspectNode(screen, 'task')
  await expect(browser.locator(`${configSelector} dt:text-is("prompt") + dd pre`)).toHaveText(prompt)
  await browser.locator(`${configSelector} dt:text-is("dag")`).scrollIntoView()
  await expect(browser.locator(`${configSelector} dt:text-is("dag") + dd pre`)).toHaveText('ordinary extension')
})
