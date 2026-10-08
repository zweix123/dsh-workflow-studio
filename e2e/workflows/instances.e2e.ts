import { expect } from 'e2e'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, deleteDialog, detailField, inspectNode, openWorkflows } from '../ui.js'

test('实例创建保留名称校验、详情 Tab 去重、重启恢复与永久删除', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await createInstance(screen, dsh.workspaceName, 'regression-lifecycle', 'lifecycle-regression')
  await expect(screen.getByRole('heading', 'lifecycle-regression', { exact: true })).toBeVisible()
  await inspectNode(screen, 'manual')
  await expect(detailField(browser, 'manual', '状态')).toHaveText('就绪')
  expect(await access(join(dsh.workspace, 'lifecycle-runs.txt')).then(() => true, () => false)).toBe(false)

  await screen.getByRole('tab', '实例管理', { exact: true }).tap()
  await screen.getByRole('button', `新建实例 ${dsh.workspaceName}`, { exact: true }).tap()
  const create = screen.getByRole('dialog', '新建实例', { exact: true })
  await create.getByLabel('工作流模板').selectOption({ value: 'regression-lifecycle' })
  await create.getByLabel('实例名称').fill('   ')
  await create.getByRole('button', '创建实例', { exact: true }).tap()
  await expect(create.getByRole('alert')).toHaveText('实例名称不能为空。')
  await create.getByLabel('实例名称').fill('lifecycle-regression')
  await create.getByRole('button', '创建实例', { exact: true }).tap()
  await expect(create.getByRole('alert')).toHaveText('此工作区已有同名实例。')
  await expect(create.getByLabel('实例名称')).toHaveValue('lifecycle-regression')
  await expect(create.getByLabel('工作流模板')).toHaveValue('regression-lifecycle')
  await create.getByRole('button', '关闭创建表单', { exact: true }).tap()
  await screen.getByRole('button', /^lifecycle-regression/).tap()
  await expect(screen.getByRole('tab', 'lifecycle-regression', { exact: true })).toHaveCount(1)

  await dsh.restart(browser)
  await app.open('/')
  await openWorkflows(screen, browser)
  await expect(screen.getByRole('tab', 'lifecycle-regression', { exact: true })).toHaveCount(0)
  await expect(screen.getByRole('button', /^lifecycle-regression/)).toHaveCount(1)
  await screen.getByRole('button', /^lifecycle-regression/).tap()
  await inspectNode(screen, 'manual')
  await expect(detailField(browser, 'manual', '状态')).toHaveText('就绪')

  let confirm = await deleteDialog(screen, 'lifecycle-regression')
  await expect(confirm).toContainText('删除后不可恢复。')
  await confirm.getByRole('button', '取消', { exact: true }).tap()
  await expect(screen.getByRole('button', /^lifecycle-regression/)).toHaveCount(1)
  confirm = await deleteDialog(screen, 'lifecycle-regression')
  await confirm.getByRole('button', '删除实例', { exact: true }).tap()
  await expect(screen.getByRole('button', /^lifecycle-regression/)).toHaveCount(0)
  await expect(screen.getByRole('tab', 'lifecycle-regression', { exact: true })).toHaveCount(0)
  await expect(browser.locator('.dsh-workflow-workspace:has(h3:text-is("workspace")) > header')).toContainText('实例: 0')

  await dsh.restart(browser)
  await app.open('/')
  await openWorkflows(screen, browser)
  await expect(screen.getByRole('button', /^lifecycle-regression/)).toHaveCount(0)
  await expect(browser.locator('.dsh-workflow-workspace:has(h3:text-is("workspace")) > header')).toContainText('实例: 0')
})
