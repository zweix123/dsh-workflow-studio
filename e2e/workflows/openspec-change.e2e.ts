import { expect } from 'e2e'
import { fileURLToPath } from 'node:url'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, detailField, inspectNode, openWorkflows } from '../ui.js'

const fixture = fileURLToPath(new URL('../fixtures/agent-host', import.meta.url))

test('OpenSpec 四阶段从方案会话交付名称，重启后实施与归档沿用同一 change 并手动推进', async ({ app, screen, browser, dsh }) => {
  await dsh.stop(); await dsh.addBundle(fixture); await dsh.start(); await dsh.authenticate(browser)
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await createInstance(screen, dsh.workspaceName, 'openspec-change.zh', 'openspec-change')
  await inspectNode(screen, '填写需求')
  const request = 'OPENSPEC_CHANGE_E2E 修复登录重定向循环。\n保留中文、"引号"和 <标记>。'
  await screen.getByRole('button', '填写 填写需求', { exact: true }).tap()
  const input = screen.getByRole('dialog', '填写 填写需求', { exact: true })
  await input.getByRole('textbox', '原始需求', { exact: true }).fill(request)
  await input.getByRole('button', '提交表单', { exact: true }).tap()
  await expect(input).not.toBeVisible()
  await expect(screen.getByRole('button', '详情 为需求起名', { exact: true })).toHaveCount(0)
  await expect(screen.getByRole('button', '详情 确认需求名称', { exact: true })).toHaveCount(0)

  await inspectNode(screen, '澄清需求与生成方案')
  const proposal = screen.getByRole('complementary', '详情 澄清需求与生成方案')
  expect(JSON.parse((await detailField(browser, '澄清需求与生成方案', '输入').textContent())!)).toEqual({ request })
  await expect(detailField(browser, '澄清需求与生成方案', '状态')).toHaveText('就绪')
  await screen.getByRole('button', '执行 澄清需求与生成方案', { exact: true }).tap()
  await expect(screen.getByRole('button', '完成 澄清需求与生成方案', { exact: true })).toBeEnabled()
  await inspectNode(screen, '实施与验证')
  await expect(detailField(browser, '实施与验证', '状态')).toHaveText('等待')
  await inspectNode(screen, '澄清需求与生成方案')
  await screen.getByRole('button', '完成 澄清需求与生成方案', { exact: true }).tap()
  await expect(detailField(browser, '澄清需求与生成方案', '状态')).toHaveText('已完成')
  const change = { change_name: 'fix-login-redirect-loop' }
  expect(JSON.parse((await detailField(browser, '澄清需求与生成方案', '输出').textContent())!)).toEqual(change)
  await expect(screen.getByRole('button', '记录 澄清需求与生成方案', { exact: true })).toHaveCount(0)
  await expect(proposal.getByRole('button', '交付记录', { exact: true })).toBeEnabled()

  await dsh.restart(browser)
  await app.open('/')
  await openWorkflows(screen, browser)
  await screen.getByRole('tab', '实例管理', { exact: true }).tap()
  await screen.getByRole('button', /^openspec-change/).tap()
  await inspectNode(screen, '澄清需求与生成方案')
  expect(JSON.parse((await detailField(browser, '澄清需求与生成方案', '输出').textContent())!)).toEqual(change)
  await inspectNode(screen, '同步规格与归档')
  await expect(detailField(browser, '同步规格与归档', '状态')).toHaveText('等待')

  for (const node of ['实施与验证', '同步规格与归档']) {
    await inspectNode(screen, node)
    const panel = screen.getByRole('complementary', `详情 ${node}`)
    await expect(detailField(browser, node, '状态')).toHaveText('就绪')
    expect(JSON.parse((await detailField(browser, node, '输入').textContent())!)).toEqual(change)
    await screen.getByRole('button', '关闭详情', { exact: true }).tap()
    await screen.getByRole('button', `执行 ${node}`, { exact: true }).tap()
    await expect(screen.getByRole('button', `完成 ${node}`, { exact: true })).toBeEnabled()
    await screen.getByRole('button', `完成 ${node}`, { exact: true }).tap()
    await inspectNode(screen, node)
    await expect(detailField(browser, node, '状态')).toHaveText('已完成')
    expect(JSON.parse((await detailField(browser, node, '输出').textContent())!)).toEqual({})
  }
})
