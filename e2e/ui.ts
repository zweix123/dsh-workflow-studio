import { expect, type Screen } from 'e2e'
import type { Browser } from '@e2e-dev/web'

// Repeated real-host setup; business assertions stay in each case.
export async function addWorkspace(screen: Screen, workspace: string) {
  await screen.getByRole('dialog', '预览版说明').getByRole('button', '继续', { exact: true }).tap()
  // Wait for rc.1's initial conversation restore before navigating to another panel.
  await expect(screen.getByRole('treeitem', '新会话', { exact: true })).toHaveAttribute('aria-selected', 'true')
  await screen.getByRole('button', '添加工作区', { exact: true }).tap()
  const picker = screen.getByRole('dialog', '选择工作区目录')
  await expect(picker.getByRole('button', '主目录', { exact: true })).toBeVisible()
  await picker.getByRole('button', '编辑路径', { exact: true }).tap()
  await picker.getByRole('textbox', '编辑路径').fill(workspace)
  await picker.getByRole('textbox', '编辑路径').press('Enter')
  await picker.getByRole('button', '打开', { exact: true }).tap()
  await screen.getByRole('button', '工作流', { exact: true }).tap()
}

export async function openWorkflows(screen: Screen, browser: Browser) {
  // A restarted host restores its selected conversation asynchronously too.
  await expect(browser.locator('[role="treeitem"][aria-selected="true"]')).toBeVisible()
  await screen.getByRole('button', '工作流', { exact: true }).tap()
}

export async function createInstance(screen: Screen, workspace: string, template: string, name: string) {
  await screen.getByRole('tab', '实例管理', { exact: true }).tap()
  await screen.getByRole('button', `新建实例 ${workspace}`, { exact: true }).tap()
  const dialog = screen.getByRole('dialog', '新建实例', { exact: true })
  await dialog.getByLabel('工作流模板').selectOption({ value: template })
  await dialog.getByLabel('实例名称').fill(name)
  await dialog.getByRole('button', '创建实例', { exact: true }).tap()
  await expect(dialog).not.toBeVisible()
  await screen.getByRole('button', new RegExp(`^${name}`)).tap()
}

export async function inspectNode(screen: Screen, name: string) {
  // Fit before selecting so loop items and branches are also reachable.
  const close = screen.getByRole('button', '关闭详情', { exact: true })
  if (await close.isVisible()) await close.tap()
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  await screen.getByRole('button', `详情 ${name}`, { exact: true }).tap()
}

export const detailField = (browser: Browser, node: string, field: string) => browser.locator(
  `.dsh-workflow-studio-panel:not([hidden]) aside[aria-label="详情 ${node}"] section[aria-label="运行信息"] dt:text-is("${field}") + dd pre`,
)

export async function deleteDialog(screen: Screen, name: string) {
  await screen.getByRole('tab', '实例管理', { exact: true }).tap()
  await screen.getByRole('button', `实例操作 ${name}`, { exact: true }).tap()
  await screen.getByRole('menuitem', '删除实例', { exact: true }).tap()
  return screen.getByRole('alertdialog', '删除实例', { exact: true })
}
