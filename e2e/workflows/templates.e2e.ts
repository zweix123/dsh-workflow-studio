import { expect } from 'e2e'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, openWorkflows } from '../ui.js'

test('默认装配从独立模板包加载两份中文模板并创建实例，重启后保持可用', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  const templates = [
    ['matt-pocock-wayfinder-workflow.zh', 'Matt-Pocock-工程工作流', '@dsh-workflow/template-matt-pocock-wayfinder'],
    ['openspec-delivery.zh', 'OpenSpec 需求交付工作流', '@dsh-workflow/template-openspec-delivery'],
  ]
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  for (const [, name, packageName] of templates) {
    await expect(screen.getByRole('button', `打开模板 ${name}`, { exact: true })).toBeEnabled()
    await expect(browser.locator('.dsh-workflow-template-item > code').filter({ hasText: packageName })).toHaveText(packageName)
    await screen.getByRole('button', `打开模板 ${name}`, { exact: true }).tap()
    await expect(screen.getByRole('heading', name, { exact: true })).toBeVisible()
    await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  }
  for (const [id] of templates) {
    await createInstance(screen, dsh.workspaceName, id, `template-package-${id}`)
    await expect(screen.getByRole('heading', `template-package-${id}`, { exact: true })).toBeVisible()
  }
  await dsh.restart(browser)
  await app.open('/')
  await openWorkflows(screen, browser)
  for (const [id] of templates) {
    await expect(screen.getByRole('button', new RegExp(`^template-package-${id}`))).toHaveCount(1)
  }
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  for (const [, name] of templates) {
    await expect(screen.getByRole('button', `打开模板 ${name}`, { exact: true })).toBeEnabled()
  }
})
