import { expect } from 'e2e'
import { test } from '../dsh.js'
import { addWorkspace, createInstance } from '../ui.js'

for (const language of ['中文', 'English'] as const) {
  test(`实例新建与删除弹窗沿用宿主设置的表面和遮罩，浅深主题及窄屏保持一致 · ${language}`, async ({ app, screen, browser, dsh }) => {
    await app.open('/')
    await addWorkspace(screen, dsh.workspace)
    await createInstance(screen, dsh.workspaceName, 'regression-lifecycle', 'dialog-style-reference')
    await screen.getByRole('tab', '实例管理', { exact: true }).tap()

    const labels = language === 'English' ? {
      settings: 'Settings', close: 'Close', create: 'New instance', name: 'Instance name',
      actions: 'Instance actions', remove: 'Delete instance', cancel: 'Cancel',
      overview: 'Workspaces and instances', light: 'Light', dark: 'Dark',
    } : {
      settings: '设置', close: '关闭', create: '新建实例', name: '实例名称',
      actions: '实例操作', remove: '删除实例', cancel: '取消',
      overview: '工作区与实例', light: '浅色', dark: '深色',
    }
    if (language === 'English') {
      await screen.getByRole('button', '设置', { exact: true }).tap()
      await screen.getByRole('button', '中文', { exact: true }).tap()
      await screen.getByRole('menuitem', 'English', { exact: true }).tap()
      await screen.getByRole('button', 'Close', { exact: true }).tap()
    }

    const appearance = (selector: string) => browser.evaluate(selector => {
      const panel = document.querySelector(selector)!
      const surface = getComputedStyle(panel)
      const mask = getComputedStyle(panel.previousElementSibling!)
      return {
        background: surface.backgroundColor, radius: surface.borderRadius,
        border: surface.borderTopWidth, shadow: surface.boxShadow,
        maskBackground: mask.backgroundColor, maskBlur: mask.backdropFilter,
      }
    }, selector)

    for (const [theme, width, height] of [
      [labels.light, 1280, 900], [labels.dark, 1280, 900], [labels.light, 390, 640], [labels.dark, 390, 640],
    ] as const) {
      await browser.setViewport({ width, height })
      await screen.getByRole('button', labels.settings, { exact: true }).tap()
      await screen.getByRole('button', theme, { exact: true }).tap()
      const settings = await appearance('[role="dialog"]')
      await screen.getByRole('button', labels.close, { exact: true }).tap()

      await screen.getByRole('button', `${labels.create} ${dsh.workspaceName}`, { exact: true }).tap()
      const create = screen.getByRole('dialog', labels.create, { exact: true })
      await expect(create).toBeVisible()
      expect(await appearance('.dsh-workflow-create-dialog')).toEqual(settings)
      expect(await browser.evaluate(() => {
        const panel = document.querySelector('.dsh-workflow-create-dialog')!
        const rect = panel.getBoundingClientRect()
        const action = panel.querySelector('.dsh-workflow-form-actions')!.getBoundingClientRect()
        return rect.left >= 24 && rect.top >= 24 && rect.right <= innerWidth - 24
          && rect.bottom <= innerHeight - 24 && panel.scrollWidth <= panel.clientWidth
          && action.top >= rect.top && action.bottom <= rect.bottom
      })).toBe(true)
      await create.getByLabel(labels.name).fill(`draft ${theme} ${width}`)
      await create.getByLabel(labels.name).press('Escape')
      await expect(create).not.toBeVisible()
      await expect.poll(() => browser.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)).toBe(`${labels.create} ${dsh.workspaceName}`)

      await screen.getByRole('button', `${labels.actions} dialog-style-reference`, { exact: true }).tap()
      await screen.getByRole('menuitem', labels.remove, { exact: true }).tap()
      const confirm = screen.getByRole('alertdialog', labels.remove, { exact: true })
      await expect(confirm).toBeVisible()
      expect(await appearance('.dsh-workflow-delete-dialog')).toEqual(settings)
      expect(await browser.evaluate(() => {
        const panel = document.querySelector('.dsh-workflow-delete-dialog')!
        const rect = panel.getBoundingClientRect()
        return rect.left >= 24 && rect.top >= 24 && rect.right <= innerWidth - 24
          && rect.bottom <= innerHeight - 24 && panel.scrollWidth <= panel.clientWidth
      })).toBe(true)
      await confirm.getByRole('button', labels.cancel, { exact: true }).tap()
      await expect(confirm).not.toBeVisible()
      await expect(screen.getByRole('button', /^dialog-style-reference/)).toHaveCount(1)
    }

    await screen.getByRole('button', `${labels.create} ${dsh.workspaceName}`, { exact: true }).tap()
    await expect(screen.getByRole('dialog', labels.create, { exact: true })).toBeVisible()
    await browser.locator('.dsh-workflow-create-mask').tap({ position: { x: 4, y: 4 } })
    await expect(screen.getByRole('dialog', labels.create, { exact: true })).not.toBeVisible()
    await expect(screen.getByRole('heading', labels.overview, { exact: true })).toBeVisible()
    await expect.poll(() => browser.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)).toBe(`${labels.create} ${dsh.workspaceName}`)
  })
}
