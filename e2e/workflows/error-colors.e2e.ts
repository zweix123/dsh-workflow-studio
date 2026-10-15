import { expect } from 'e2e'
import { fileURLToPath } from 'node:url'
import type { Browser } from '@e2e-dev/web'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, detailField, inspectNode } from '../ui.js'

const colorOf = (browser: Browser, selector: string, property = 'color') => browser.evaluate(
  ({ selector, property }) => getComputedStyle(document.querySelector(selector)!).getPropertyValue(property), { selector, property },
)

test('浅深主题下模板错误、名称校验和删除操作使用宿主错误色', async ({ app, screen, browser, dsh }) => {
  await dsh.stop()
  await dsh.addBundle(fileURLToPath(new URL('../../packages/dsh-workflow-studio/tests/fixtures/template-bundle', import.meta.url)))
  await dsh.start()
  await dsh.authenticate(browser)
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await createInstance(screen, dsh.workspaceName, 'regression-lifecycle', 'error-colors')

  for (const [theme, color] of [['浅色', 'rgb(236, 19, 19)'], ['深色', 'rgb(242, 90, 90)']]) {
    await screen.getByRole('button', '设置', { exact: true }).tap()
    await screen.getByRole('button', theme, { exact: true }).tap()
    await screen.getByRole('button', '关闭', { exact: true }).tap()
    await screen.getByRole('tab', '模板管理', { exact: true }).tap()
    const templateError = browser.locator('.dsh-workflow-template-item > p[role="alert"]').first()
    await expect(templateError).toBeVisible()
    await expect.poll(() => colorOf(browser, '.dsh-workflow-template-item > p[role="alert"]')).toBe(color)
    // A layout warning is an alert too, but must keep its own tone.
    await expect.poll(() => colorOf(browser, '.dsh-workflow-template-list [data-level="warn"]')).not.toBe(color)

    await screen.getByRole('tab', '实例管理', { exact: true }).tap()
    await screen.getByRole('button', `新建实例 ${dsh.workspaceName}`, { exact: true }).tap()
    const create = screen.getByRole('dialog', '新建实例', { exact: true })
    await create.getByLabel('工作流模板').selectOption({ value: 'regression-lifecycle' })
    await create.getByLabel('实例名称').fill('   ')
    await create.getByRole('button', '创建实例', { exact: true }).tap()
    await expect(create.getByRole('alert')).toHaveText('实例名称不能为空。')
    await expect.poll(() => colorOf(browser, '.dsh-workflow-create [role="alert"]')).toBe(color)
    await create.getByLabel('实例名称').fill('error-colors')
    await create.getByRole('button', '创建实例', { exact: true }).tap()
    await expect(create.getByRole('alert')).toHaveText('此工作区已有同名实例。')
    await expect.poll(() => colorOf(browser, '.dsh-workflow-create [role="alert"]')).toBe(color)
    await create.getByRole('button', '关闭创建表单', { exact: true }).tap()

    await screen.getByRole('button', '实例操作 error-colors', { exact: true }).tap()
    const remove = screen.getByRole('menuitem', '删除实例', { exact: true })
    await expect.poll(() => colorOf(browser, '.dsh-workflow-instance-menu [role="menuitem"]')).toBe(color)
    await remove.tap()
    const confirm = screen.getByRole('alertdialog', '删除实例', { exact: true })
    await expect.poll(() => colorOf(browser, '.dsh-workflow-delete-confirm')).toBe(color)
    await expect.poll(() => colorOf(browser, '.dsh-workflow-delete-actions button:not(.dsh-workflow-delete-confirm)')).not.toBe(color)
    await confirm.getByRole('button', '取消', { exact: true }).tap()
    await expect(screen.getByRole('button', /^error-colors/)).toHaveCount(1)
  }
})

test('浅深主题下失败节点、运行错误及记录全文使用宿主错误色，普通日志保持原色', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await createInstance(screen, dsh.workspaceName, 'regression-bash', 'failed-colors')
  await inspectNode(screen, 'retry')
  await screen.getByRole('button', '执行 retry', { exact: true }).tap()
  await expect(detailField(browser, 'retry', '状态')).toHaveText('执行异常')
  const node = '.dsh-workflow-studio-panel:not([hidden]) [data-graph-node][data-definition-id="retry"]'
  const runtime = 'aside[aria-label="详情 retry"] .dsh-workflow-runtime'
  const records = 'aside[aria-label="详情 retry"] .dsh-workflow-records'
  await expect(browser.locator(`${runtime} > [role="alert"]`)).toHaveText('Command exited with code 7')
  await expect(browser.locator(`${records} pre[role="alert"]`)).toHaveText('Command exited with code 7')
  const log = browser.locator(`${runtime} strong:text-is("命令日志 · stderr") + pre`)
  await expect(log).toHaveText('first attempt failed\n')
  for (const [theme, color] of [['浅色', 'rgb(236, 19, 19)'], ['深色', 'rgb(242, 90, 90)']]) {
    await screen.getByRole('button', '设置', { exact: true }).tap()
    await screen.getByRole('button', theme, { exact: true }).tap()
    await screen.getByRole('button', '关闭', { exact: true }).tap()
    await expect.poll(() => colorOf(browser, `${node} .dsh-workflow-node-status`)).toBe(color)
    await expect.poll(() => colorOf(browser, `${node} .dsh-workflow-node-status i`, 'background-color')).toBe(color)
    await expect.poll(() => colorOf(browser, `${runtime} > [role="alert"]`)).toBe(color)
    await expect.poll(() => colorOf(browser, `${records} .dsh-workflow-record-error`)).toBe(color)
    await expect.poll(() => colorOf(browser, `${records} pre[role="alert"]`)).toBe(color)
    await expect.poll(() => colorOf(browser, `${runtime} .dsh-workflow-plugin-content pre`)).not.toBe(color)
    await expect.poll(() => colorOf(browser, `${records} details:first-child > strong:nth-of-type(3) + pre`)).not.toBe(color)
  }

  await createInstance(screen, dsh.workspaceName, 'form-structured-retry', 'delivery-colors')
  await screen.getByRole('button', '填写 answer', { exact: true }).tap()
  await screen.getByRole('dialog', '填写 answer', { exact: true }).getByRole('button', '提交表单', { exact: true }).tap()
  await screen.getByRole('button', '关闭表单', { exact: true }).tap()
  const runError = browser.locator('.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-run-error')
  await expect(runError).toContainText('MISSING_OUTPUT_FIELD')
  for (const [theme, color] of [['浅色', 'rgb(236, 19, 19)'], ['深色', 'rgb(242, 90, 90)']]) {
    await screen.getByRole('button', '设置', { exact: true }).tap()
    await screen.getByRole('button', theme, { exact: true }).tap()
    await screen.getByRole('button', '关闭', { exact: true }).tap()
    await expect.poll(() => colorOf(browser, '.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-run-error')).toBe(color)
  }
})
