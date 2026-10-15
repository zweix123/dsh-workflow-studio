import { expect } from 'e2e'
import { fileURLToPath } from 'node:url'
import { test } from '../dsh.js'
import { addWorkspace } from '../ui.js'

test('有效排布在模板列表、预览、创建和实例中静默生效，纵向位置保留', async ({ app, screen, browser, dsh }) => {
  await dsh.stop()
  await dsh.addBundle(fileURLToPath(new URL('../../packages/dsh-workflow-dev-templates', import.meta.url)))
  await dsh.start()
  await dsh.authenticate(browser)
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  const open = screen.getByRole('button', '打开模板 开发 · Bash 节点功能', { exact: true })
  await expect(open).toBeEnabled()
  await expect(browser.locator('.dsh-workflow-template-list .dsh-workflow-layout-notices')).toHaveCount(0)
  await open.tap()

  const checkVertical = async () => {
    const panel = '.dsh-workflow-studio-panel:not([hidden])'
    await expect(browser.locator(`${panel} [data-graph-node]`)).toHaveCount(5)
    await expect(browser.locator(`${panel} .dsh-workflow-layout-notices`)).toHaveCount(0)
    await expect.poll(() => browser.evaluate(() => {
      const panel = document.querySelector('.dsh-workflow-studio-panel:not([hidden])')!
      const positions = ['collect-command-input', 'manual-command', 'auto-command', 'review-command-result', 'empty-command'].map(id => {
        const card = panel.querySelector(`[data-graph-node][data-definition-id="${id}"]`)!
        const node = card.closest('.react-flow__node')!
        const position = new DOMMatrix(getComputedStyle(node).transform)
        return { x: position.m41, y: position.m42 }
      })
      return positions.every(position => position.x === positions[0]!.x)
        && positions.slice(1).every((position, index) => position.y > positions[index]!.y)
    })).toBe(true)
  }
  await checkVertical()
  await screen.getByRole('tab', '实例管理', { exact: true }).tap()
  await screen.getByRole('button', `新建实例 ${dsh.workspaceName}`, { exact: true }).tap()
  const dialog = screen.getByRole('dialog', '新建实例', { exact: true })
  await dialog.getByLabel('工作流模板').selectOption({ value: 'dev-bash.zh' })
  await expect(browser.locator('.dsh-workflow-create .dsh-workflow-layout-notices')).toHaveCount(0)
  await dialog.getByLabel('实例名称').fill('silent-layout')
  await dialog.getByRole('button', '创建实例', { exact: true }).tap()
  await expect(dialog).not.toBeVisible()
  await screen.getByRole('button', /^silent-layout/).tap()
  await checkVertical()

  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '深色', { exact: true }).tap()
  await screen.getByRole('button', '中文', { exact: true }).tap()
  await screen.getByRole('menuitem', 'English', { exact: true }).tap()
  await screen.getByRole('button', 'Close', { exact: true }).tap()
  await browser.setViewport({ width: 390, height: 844 })
  await checkVertical()
})

test('无效排布在四个页面保留非阻断 WARN，详情可用键盘展开收起并支持英文窄屏', async ({ app, screen, browser, dsh }) => {
  await dsh.stop()
  await dsh.addBundle(fileURLToPath(new URL('../../packages/dsh-workflow-studio/tests/fixtures/template-bundle', import.meta.url)))
  await dsh.start()
  await dsh.authenticate(browser)
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  const item = '.dsh-workflow-template-item:has-text("Layout warning only")'
  await expect(browser.locator(`${item} [data-level="warn"]`)).toContainText('仍可打开模板')
  await expect(browser.locator(`${item} [data-level="info"]`)).toHaveCount(0)
  await screen.getByRole('button', '打开模板 Layout warning only', { exact: true }).tap()
  const warning = browser.locator('.dsh-workflow-studio-panel:not([hidden]) [data-level="warn"]')
  await expect(warning).toContainText('WARN (1)')
  await expect(warning).toContainText('仍可打开模板')
  const details = warning.getByRole('button')
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await details.focus()
  await details.press('Enter')
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(warning).toContainText('direction 只接受 horizontal 或 vertical。')
  await expect(warning).toContainText('将 direction 改为 horizontal 或 vertical')
  await details.press('Enter')
  await expect(details).toHaveAttribute('aria-expanded', 'false')

  await screen.getByRole('tab', '实例管理', { exact: true }).tap()
  await screen.getByRole('button', `新建实例 ${dsh.workspaceName}`, { exact: true }).tap()
  const dialog = screen.getByRole('dialog', '新建实例', { exact: true })
  await dialog.getByLabel('工作流模板').selectOption({ value: 'layout-warning' })
  await expect(browser.locator('.dsh-workflow-create [data-level="warn"]')).toContainText('仍可创建实例')
  await expect(dialog.getByRole('button', '创建实例', { exact: true })).toBeEnabled()
  await dialog.getByLabel('实例名称').fill('warning-layout')
  await dialog.getByRole('button', '创建实例', { exact: true }).tap()
  await expect(dialog).not.toBeVisible()
  await screen.getByRole('button', /^warning-layout/).tap()
  await expect(warning).toContainText('仍可继续执行')
  await expect(warning).toContainText('WARN (1)')
  await expect(browser.locator('.dsh-workflow-studio-panel:not([hidden]) [data-level="info"]')).toHaveCount(0)

  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '深色', { exact: true }).tap()
  await screen.getByRole('button', '中文', { exact: true }).tap()
  await screen.getByRole('menuitem', 'English', { exact: true }).tap()
  await screen.getByRole('button', 'Close', { exact: true }).tap()
  await browser.setViewport({ width: 390, height: 844 })
  await expect(warning).toContainText('execution can continue')
  await warning.getByRole('button', 'Show details', { exact: true }).tap()
  await expect(warning).toContainText('direction must be horizontal or vertical.')
  await warning.getByRole('button', 'Hide details', { exact: true }).tap()
  await expect(warning.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
})
