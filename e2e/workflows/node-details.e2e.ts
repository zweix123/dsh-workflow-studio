import { expect } from 'e2e'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, detailField, inspectNode } from '../ui.js'

test('模板只读定义与实例运行分块，等待跳过省略空块并支持主题语言窄屏', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('button', '打开模板 条件分支回归', { exact: true }).tap()
  await inspectNode(screen, 'source')
  const bodySelector = '.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-body'
  const body = (selector: string) => browser.locator(`${bodySelector} ${selector}`)
  await expect(body('h4')).toHaveText('定义详情')
  await expect(body('section')).toHaveCount(1)
  await expect(body(':is(button, input, textarea)')).toHaveCount(0)
  await expect(body('dt:text-is("command") + dd pre')).toHaveText('printf \'{"enabled":true}\'')

  await createInstance(screen, dsh.workspaceName, 'regression-branches', 'details-blocks')
  await inspectNode(screen, 'active')
  await expect(body(':is(h4, h5)')).toHaveText(['运行信息', '运行概况', '定义详情'])
  await expect(detailField(browser, 'active', '状态')).toHaveText('等待')

  await inspectNode(screen, 'source')
  const overview = (selector: string) => body(`section[aria-label="运行概况"] ${selector}`)
  const data = (selector: string) => body(`section[aria-label="输入与输出"] ${selector}`)
  const business = (selector: string) => body(`section[aria-label="节点操作与进展"] ${selector}`)
  await expect(body(':is(h4, h5)')).toHaveText(['运行信息', '运行概况', '输入与输出', '节点操作与进展', '定义详情'])
  await expect(overview('dt')).toHaveText(['节点实例', '所属 DAG 实例', '状态'])
  await expect(data('dt')).toHaveText(['输入'])
  await expect(business(':is(button, input, textarea, select)')).toHaveCount(0)
  await screen.getByRole('button', '执行 source', { exact: true }).tap()
  await expect(detailField(browser, 'source', '状态')).toHaveText('已完成')
  await expect(data('dt')).toHaveText(['输入', '输出'])
  await expect(data('dt:text-is("输出") + dd pre')).toHaveText('{\n  "enabled": true\n}')
  await expect(business('strong:text-is("输出") + pre')).toHaveText('{"enabled":true}')

  await inspectNode(screen, 'closed')
  await expect(body(':is(h4, h5)')).toHaveText(['运行信息', '运行概况', '定义详情'])
  await expect(detailField(browser, 'closed', '状态')).toHaveText('已跳过')
  await screen.getByRole('button', '根 DAG 详情', { exact: true }).tap()
  await expect(body(':is(h4, h5)')).toHaveText(['运行信息', '运行概况', '输入与输出', '定义详情'])
  await expect(overview('dt')).toHaveText(['DAG 实例', '状态'])

  await inspectNode(screen, 'source')
  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '深色', { exact: true }).tap()
  await screen.getByRole('button', '关闭', { exact: true }).tap()
  await expect(body('h5:text-is("运行概况")')).toBeVisible()
  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '浅色', { exact: true }).tap()
  await screen.getByRole('button', '中文', { exact: true }).tap()
  await screen.getByRole('menuitem', 'English', { exact: true }).tap()
  await screen.getByRole('button', 'Close', { exact: true }).tap()
  await browser.setViewport({ width: 390, height: 844 })
  await expect(body(':is(h4, h5)')).toHaveText(['Running information', 'Run overview', 'Input and output', 'Node actions and progress', 'Definition details'])
  await expect.poll(() => browser.evaluate(() => {
    const element = document.querySelector('.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-inspector-body')!
    return element.scrollWidth <= element.clientWidth
  })).toBe(true)
  await body('h4:text-is("Definition details")').scrollIntoView()
  await expect(body('h4:text-is("Definition details")')).toBeVisible()
})
