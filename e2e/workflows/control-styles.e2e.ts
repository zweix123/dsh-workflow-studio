import { expect } from 'e2e'
import { test } from '../dsh.js'
import { addWorkspace, createInstance } from '../ui.js'

for (const language of ['中文', 'English'] as const) {
  test(`实例表单与删除菜单复用宿主控件的边界、配色和交互，浅深主题及窄屏一致 · ${language}`, async ({ app, screen, browser, dsh }) => {
    await app.open('/')
    await addWorkspace(screen, dsh.workspace)
    await createInstance(screen, dsh.workspaceName, 'form-structured-e2e', 'control-style-reference')

    const labels = language === 'English' ? {
      settings: 'Settings', close: 'Close', create: 'New instance', name: 'Instance name',
      closeCreate: 'Close create form', actions: 'Instance actions', remove: 'Delete instance', cancel: 'Cancel',
      instances: 'Instance management', fill: 'Fill in collect', closeForm: 'Close form', light: 'Light', dark: 'Dark',
    } : {
      settings: '设置', close: '关闭', create: '新建实例', name: '实例名称',
      closeCreate: '关闭创建表单', actions: '实例操作', remove: '删除实例', cancel: '取消',
      instances: '实例管理', fill: '填写 collect', closeForm: '关闭表单', light: '浅色', dark: '深色',
    }
    if (language === 'English') {
      await screen.getByRole('button', '设置', { exact: true }).tap()
      await screen.getByRole('button', '中文', { exact: true }).tap()
      await screen.getByRole('menuitem', 'English', { exact: true }).tap()
      await screen.getByRole('button', labels.close, { exact: true }).tap()
    }

    const control = (selector: string, textSelector = selector) => browser.evaluate(({ selector, textSelector }) => {
      const element = document.querySelector(selector)!
      const style = getComputedStyle(element)
      const text = getComputedStyle(document.querySelector(textSelector)!)
      return {
        background: style.backgroundColor, border: style.borderTopWidth, borderColor: style.borderTopColor,
        radius: style.borderRadius, height: element.getBoundingClientRect().height,
        padding: style.padding, color: text.color, fontSize: text.fontSize, lineHeight: text.lineHeight,
      }
    }, { selector, textSelector })
    const menuSurface = (selector: string) => browser.evaluate(selector => {
      const menu = document.querySelector(selector)!
      const style = getComputedStyle(menu)
      const material = getComputedStyle(menu.querySelector(':scope > [aria-hidden="true"]')!)
      return {
        radius: style.borderRadius, border: style.borderTopWidth, background: style.backgroundColor,
        shadow: style.boxShadow, material: material.backgroundColor, blur: material.backdropFilter,
      }
    }, selector)

    for (const [theme, width, height] of [
      [labels.light, 1280, 900], [labels.dark, 1280, 900], [labels.light, 390, 640], [labels.dark, 390, 640],
    ] as const) {
      await browser.setViewport({ width, height })
      await screen.getByRole('button', labels.settings, { exact: true }).tap()
      await screen.getByRole('button', theme, { exact: true }).tap()
      // The settings language picker is a real host Menu with the same surface role.
      await screen.getByRole('button', language, { exact: true }).tap()
      await expect(screen.getByRole('menuitem', language, { exact: true })).toBeVisible()
      const hostMenu = await menuSurface('[role="menu"][data-menu-material]')
      await screen.getByRole('menuitem', language, { exact: true }).press('Escape')
      await screen.getByRole('button', labels.close, { exact: true }).tap()

      await screen.getByRole('button', labels.fill, { exact: true }).tap()
      const form = screen.getByRole('dialog', labels.fill, { exact: true })
      await expect(form).toBeVisible()
      await browser.mouse.move(0, 0)
      const formInput = await control('.dsh-workflow-form-field > span:has(input[type="text"])', '.dsh-workflow-form-field input[type="text"]')
      const formSelect = await control('.dsh-workflow-form-field select')
      const formPrimary = await control('.dsh-workflow-form-footer button[type="submit"]')
      await form.getByRole('button', labels.closeForm, { exact: true }).tap()

      await screen.getByRole('tab', labels.instances, { exact: true }).tap()
      await screen.getByRole('button', `${labels.create} ${dsh.workspaceName}`, { exact: true }).tap()
      const create = screen.getByRole('dialog', labels.create, { exact: true })
      await expect(create).toBeVisible()
      // Focus and hover are tested separately; compare the normal surfaces here.
      await create.getByRole('heading', labels.create, { exact: true }).tap()
      await browser.mouse.move(0, 0)
      expect(await control('.dsh-workflow-create-input', '.dsh-workflow-create-input input')).toEqual(formInput)
      expect(await control('.dsh-workflow-create select')).toEqual(formSelect)
      expect(await control('.dsh-workflow-form-actions button[type="submit"]')).toEqual(formPrimary)
      await create.getByLabel(labels.name).fill(`draft ${theme} ${width}`)
      expect(await browser.evaluate(() => {
        const style = getComputedStyle(document.querySelector('.dsh-workflow-create-input')!)
        const probe = document.createElement('span')
        probe.style.color = 'var(--dsw-alias-state-business-primary)'
        document.body.append(probe)
        const color = getComputedStyle(probe).color
        probe.remove()
        return style.borderTopColor === color
      })).toBe(true)
      expect(await browser.evaluate(() => {
        const panel = document.querySelector('.dsh-workflow-create-dialog')!
        const action = panel.querySelector('button[type="submit"]')!.getBoundingClientRect()
        return panel.scrollWidth <= panel.clientWidth && action.left >= 0 && action.right <= innerWidth
          && action.top >= 0 && action.bottom <= innerHeight
      })).toBe(true)
      await create.getByRole('button', labels.closeCreate, { exact: true }).tap()

      await screen.getByRole('button', `${labels.actions} control-style-reference`, { exact: true }).tap()
      const remove = screen.getByRole('menuitem', labels.remove, { exact: true })
      await expect(remove).toBeVisible()
      expect(await menuSurface('.dsh-workflow-instance-menu')).toEqual(hostMenu)
      const point = await browser.evaluate(() => {
        const rect = document.querySelector('.dsh-workflow-instance-menu [role="menuitem"]')!.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      })
      await browser.mouse.move(point.x, point.y)
      await expect.poll(() => browser.evaluate(() => {
        const menu = document.querySelector('.dsh-workflow-instance-menu')!
        const item = menu.querySelector('[role="menuitem"]')!
        const menuStyle = getComputedStyle(menu)
        const rowStyle = getComputedStyle(item)
        const probe = document.createElement('span')
        probe.style.color = 'var(--dsw-alias-state-error-primary)'
        probe.style.backgroundColor = 'var(--dsw-alias-interactive-bg-hover-danger)'
        document.body.append(probe)
        const expected = getComputedStyle(probe)
        const valid = menuStyle.borderRadius === menuStyle.getPropertyValue('--dsw-radius-lg').trim()
          && menuStyle.borderTopWidth === '0px'
          && rowStyle.borderRadius === rowStyle.getPropertyValue('--dsw-radius-md').trim()
          && rowStyle.color === expected.color && rowStyle.backgroundColor === expected.backgroundColor
          && expected.color !== getComputedStyle(document.body).color
        probe.remove()
        return valid
      })).toBe(true)
      await remove.tap()
      const confirm = screen.getByRole('alertdialog', labels.remove, { exact: true })
      await expect(confirm).toBeVisible()
      await browser.mouse.move(0, 0)
      const cancel = await control('.dsh-workflow-delete-actions button:not(.dsh-workflow-delete-confirm)')
      const danger = await control('.dsh-workflow-delete-confirm')
      expect({ radius: cancel.radius, height: cancel.height, fontSize: cancel.fontSize }).toEqual({
        radius: formPrimary.radius, height: formPrimary.height, fontSize: formPrimary.fontSize,
      })
      expect({ radius: danger.radius, height: danger.height, fontSize: danger.fontSize }).toEqual({
        radius: formPrimary.radius, height: formPrimary.height, fontSize: formPrimary.fontSize,
      })
      await confirm.getByRole('button', labels.cancel, { exact: true }).tap()
      await expect(confirm).not.toBeVisible()
      await expect(screen.getByRole('button', /^control-style-reference/)).toHaveCount(1)
      await screen.getByRole('button', /^control-style-reference/).tap()
      await expect(screen.getByRole('button', labels.fill, { exact: true })).toBeVisible()
    }
  })
}
