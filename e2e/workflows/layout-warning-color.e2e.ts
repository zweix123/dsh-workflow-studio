import { expect } from 'e2e'
import { fileURLToPath } from 'node:url'
import { test } from '../dsh.js'
import { addWorkspace, createInstance } from '../ui.js'

for (const language of ['中文', 'English'] as const) {
  test(`布局 WARN 使用有效宿主警告色，浅深主题及窄屏可阅读展开 · ${language}`, async ({ app, screen, browser, dsh }) => {
    await dsh.stop()
    await dsh.addBundle(fileURLToPath(new URL('../../packages/dsh-workflow-studio/tests/fixtures/template-bundle', import.meta.url)))
    await dsh.start()
    await dsh.authenticate(browser)
    await app.open('/')
    await addWorkspace(screen, dsh.workspace)
    await createInstance(screen, dsh.workspaceName, 'layout-warning', 'warning-colors')

    const labels = language === 'English' ? {
      settings: 'Settings', close: 'Close', light: 'Light', dark: 'Dark',
      summary: 'execution can continue', show: 'Show details', hide: 'Hide details',
      reason: 'direction must be horizontal or vertical.',
    } : {
      settings: '设置', close: '关闭', light: '浅色', dark: '深色',
      summary: '仍可继续执行', show: '查看详情', hide: '收起详情',
      reason: 'direction 只接受 horizontal 或 vertical。',
    }
    if (language === 'English') {
      await screen.getByRole('button', '设置', { exact: true }).tap()
      await screen.getByRole('button', '中文', { exact: true }).tap()
      await screen.getByRole('menuitem', 'English', { exact: true }).tap()
      await screen.getByRole('button', 'Close', { exact: true }).tap()
    }

    const selector = '.dsh-workflow-studio-panel:not([hidden]) .dsh-workflow-layout-notice[data-level="warn"]'
    const warning = browser.locator(selector)
    for (const [theme, width] of [[labels.light, 1280], [labels.dark, 1280], [labels.light, 390], [labels.dark, 390]] as const) {
      await browser.setViewport({ width, height: 844 })
      await screen.getByRole('button', labels.settings, { exact: true }).tap()
      await screen.getByRole('button', theme, { exact: true }).tap()
      await screen.getByRole('button', labels.close, { exact: true }).tap()
      await expect(warning).toContainText(labels.summary)
      await expect.poll(() => browser.evaluate(selector => {
        const element = document.querySelector(selector)!
        const style = getComputedStyle(element)
        return {
          host: style.getPropertyValue('--dsw-alias-state-warn-primary').trim(),
          tone: style.getPropertyValue('--layout-tone').trim(),
          border: style.borderLeftColor,
          badge: getComputedStyle(element.querySelector('strong')!).color,
          action: getComputedStyle(element.querySelector('button')!).color,
        }
      }, selector)).toEqual({
        // rc.1 defines warn-primary as amber-500 in both themes.
        host: '#f59e0b', tone: '#f59e0b', border: 'rgb(245, 158, 11)',
        badge: 'rgb(245, 158, 11)', action: 'rgb(245, 158, 11)',
      })
      await warning.getByRole('button', labels.show, { exact: true }).tap()
      await expect(warning).toContainText(labels.reason)
      expect(await browser.evaluate(selector => {
        const element = document.querySelector(selector)!
        const rect = element.getBoundingClientRect()
        return element.scrollWidth <= element.clientWidth && rect.left >= 0 && rect.right <= innerWidth
      }, selector)).toBe(true)
      await warning.getByRole('button', labels.hide, { exact: true }).tap()
      await expect(warning.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    }
  })
}
