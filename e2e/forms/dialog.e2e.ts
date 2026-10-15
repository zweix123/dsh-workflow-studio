import { expect } from 'e2e'
import { test } from '../dsh.js'
import { addWorkspace, createInstance } from '../ui.js'

test('Form 浮窗沿用设置主题，长表单独立滚动且标题、提交和错误保持可见', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await createInstance(screen, dsh.workspaceName, 'form-structured-e2e', 'form-dialog-layout')
  for (const [theme, width, height] of [['浅色', 1280, 900], ['深色', 390, 640]] as const) {
    await browser.setViewport({ width, height })
    await screen.getByRole('button', '设置', { exact: true }).tap()
    await screen.getByRole('button', theme, { exact: true }).tap()
    const settings = await browser.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]')!
      const style = getComputedStyle(panel)
      return { background: style.backgroundColor, radius: style.borderRadius, shadow: style.boxShadow, font: style.fontFamily }
    })
    await screen.getByRole('button', '关闭', { exact: true }).tap()
    await screen.getByRole('button', '填写 collect', { exact: true }).press('Enter')
    const form = screen.getByRole('dialog', '填写 collect', { exact: true })
    await expect(form).toBeVisible()
    expect(await browser.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.dsh-workflow-form-modal')!)
      return { background: style.backgroundColor, radius: style.borderRadius, shadow: style.boxShadow, font: style.fontFamily }
    })).toEqual(settings)
    const fixedPositions = () => browser.evaluate(() => {
      const header = document.querySelector('.dsh-workflow-form-header')!.getBoundingClientRect()
      const footer = document.querySelector('.dsh-workflow-form-footer')!.getBoundingClientRect()
      const dialog = document.querySelector('.dsh-workflow-form-modal')!
      return { top: header.top, bottom: footer.bottom, fits: header.top >= 0 && footer.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth }
    })
    const initial = await fixedPositions()
    expect(initial.fits).toBe(true)
    await form.getByLabel('备注 / Note', { exact: true }).fill(`draft ${theme}`)
    await form.getByRole('button', '添加 flags', { exact: true }).tap()
    // Adding an item scrolls to a field near the end; the primary action stays on screen.
    await expect.poll(() => browser.evaluate(() => document.querySelector('.dsh-workflow-form-body')!.scrollTop > 0)).toBe(true)
    expect(await fixedPositions()).toEqual(initial)
    await form.getByRole('button', '提交表单', { exact: true }).tap()
    await expect(form.getByRole('alert')).toContainText('form.flags[0]')
    expect(await browser.evaluate(() => {
      const alert = document.querySelector('.dsh-workflow-form-footer [role="alert"]')!.getBoundingClientRect()
      const submit = document.querySelector('.dsh-workflow-form-footer button')!.getBoundingClientRect()
      return alert.top >= 0 && alert.bottom <= submit.top && submit.bottom <= innerHeight
    })).toBe(true)
    await form.getByRole('button', '关闭表单', { exact: true }).press('Enter')
    await expect(form).not.toBeVisible()
    await expect.poll(() => browser.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null)).toBe('填写 collect')
    await screen.getByRole('button', '填写 collect', { exact: true }).press('Enter')
    await expect(form.getByLabel('备注 / Note', { exact: true })).toHaveValue(`draft ${theme}`)
    await form.getByRole('button', '删除 flags 1', { exact: true }).tap()
    await form.getByRole('button', '关闭表单', { exact: true }).tap()
  }
})
