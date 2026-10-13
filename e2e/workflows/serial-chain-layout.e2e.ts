import { expect } from 'e2e'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, inspectNode } from '../ui.js'

test('串行链模板预览与实例四阶段对齐，跨节点边绕行且主题语言窄屏不改变排布', async ({ app, screen, browser, dsh }) => {
  await browser.setViewport({ width: 1440, height: 900 })
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)

  const checkLayout = async () => {
    await expect(browser.locator('.dsh-workflow-studio-panel:not([hidden]) .react-flow__edge-path')).toHaveCount(4)
    await expect.poll(() => browser.evaluate(() => {
      const panel = document.querySelector('.dsh-workflow-studio-panel:not([hidden])')!
      const viewport = panel.querySelector('.react-flow')!.getBoundingClientRect()
      return [...panel.querySelectorAll('[data-graph-node], .react-flow__edge-path')].every(element => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= viewport.left && bounds.right <= viewport.right && bounds.top >= viewport.top && bounds.bottom <= viewport.bottom
      })
    })).toBe(true)
    const geometry = await browser.evaluate(() => {
      const panel = document.querySelector('.dsh-workflow-studio-panel:not([hidden])')!
      const cards = ['填写需求', '澄清需求与生成方案', '实施与验证', '同步规格与归档'].map(name => {
        const card = panel.querySelector(`[data-graph-node][data-definition-id="${name}"]`)!
        const node = card.closest('.react-flow__node') as HTMLElement
        const position = new DOMMatrix(getComputedStyle(node).transform)
        const box = card.getBoundingClientRect()
        return { x: position.m41, y: position.m42, left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      })
      const paths = [...panel.querySelectorAll<SVGPathElement>('.react-flow__edge-path')]
      let intersections = 0
      let aboveCards = 0
      for (const path of paths) {
        const matrix = path.getScreenCTM()!
        const length = path.getTotalLength()
        let outer = false
        for (let step = 1; step < 100; step++) {
          const point = path.getPointAtLength(length * step / 100).matrixTransform(matrix)
          if (point.y < Math.min(...cards.map(card => card.top)) - 1) outer = true
          if (cards.some(card => point.x > card.left + 1 && point.x < card.right - 1 && point.y > card.top + 1 && point.y < card.bottom - 1)) intersections++
        }
        if (outer) aboveCards++
      }
      return { positions: cards.map(card => ({ x: card.x, y: card.y })), intersections, aboveCards }
    })
    expect(geometry.positions.every(position => position.y === geometry.positions[0]!.y)).toBe(true)
    expect(geometry.positions.slice(1).every((position, index) => position.x > geometry.positions[index]!.x)).toBe(true)
    expect(geometry.intersections).toBe(0)
    expect(geometry.aboveCards).toBe(1)
    return geometry.positions
  }

  await screen.getByRole('tab', '模板管理', { exact: true }).tap()
  await screen.getByRole('button', '打开模板 串行链跨节点依赖回归', { exact: true }).tap()
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  const preview = await checkLayout()

  await createInstance(screen, dsh.workspaceName, 'regression-serial-chain', 'serial-layout')
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  const initial = await checkLayout()
  expect(initial).toEqual(preview)
  await inspectNode(screen, '填写需求')
  const form = screen.getByRole('complementary', '详情 填写需求')
  await form.getByRole('textbox', '原始需求', { exact: true }).fill('验证串行流程的排布')
  await form.getByRole('button', '提交表单', { exact: true }).tap()
  await expect(form.getByRole('status')).toHaveText('已提交，结果只读。')
  await screen.getByRole('button', '关闭详情', { exact: true }).tap()
  expect(await checkLayout()).toEqual(initial)

  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '深色', { exact: true }).tap()
  await screen.getByRole('button', '关闭', { exact: true }).tap()
  expect(await checkLayout()).toEqual(initial)
  await screen.getByRole('button', '设置', { exact: true }).tap()
  await screen.getByRole('button', '浅色', { exact: true }).tap()
  await screen.getByRole('button', '中文', { exact: true }).tap()
  await screen.getByRole('menuitem', 'English', { exact: true }).tap()
  await screen.getByRole('button', 'Close', { exact: true }).tap()
  await browser.setViewport({ width: 390, height: 844 })
  await screen.getByRole('button', 'Fit all', { exact: true }).tap()
  expect(await checkLayout()).toEqual(initial)
  await screen.getByRole('button', 'Focus current', { exact: true }).tap()
  await screen.getByRole('button', 'Details 澄清需求与生成方案', { exact: true }).tap()
  await expect(screen.getByRole('complementary', 'Details 澄清需求与生成方案').getByRole('button', 'Execute', { exact: true })).toBeEnabled()
})
