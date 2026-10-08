import { expect } from 'e2e'
import type { Browser } from '@e2e-dev/web'
import { test } from './dsh.js'

// These are rendered public detail fields, not storage or service internals.
const detailValue = (browser: Browser, node: string, field: string) => browser.locator(
  `aside[aria-label="详情 ${node}"] section[aria-label="运行信息"] dt:text-is("${field}") + dd pre`,
)
async function expectDetail(browser: Browser, node: string, field: string, expected: unknown) {
  const value = detailValue(browser, node, field)
  await expect(value).toBeVisible()
  expect(JSON.parse((await value.textContent())!)).toEqual(expected)
}

test('结构化表单校验、下游预填、只读与宿主重启恢复', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await screen.getByRole('dialog', '预览版说明').getByRole('button', '继续', { exact: true }).tap()
  await screen.getByRole('button', '添加工作区', { exact: true }).tap()
  const picker = screen.getByRole('dialog', '选择工作区目录')
  // The initial home scan retires the path editor when it lands.
  await expect(picker.getByRole('button', '主目录', { exact: true })).toBeVisible()
  await picker.getByRole('button', '编辑路径', { exact: true }).tap()
  await picker.getByRole('textbox', '编辑路径').fill(dsh.workspace)
  await picker.getByRole('textbox', '编辑路径').press('Enter')
  await picker.getByRole('button', '打开', { exact: true }).tap()

  await screen.getByRole('button', '工作流', { exact: true }).tap()
  await screen.getByRole('button', `新建实例 ${dsh.workspaceName}`, { exact: true }).tap()
  const create = screen.getByRole('dialog', '新建实例', { exact: true })
  await create.getByLabel('工作流模板').selectOption({ value: 'form-structured-e2e' })
  await create.getByLabel('实例名称').fill('form-handoff-regression')
  await create.getByRole('button', '创建实例', { exact: true }).tap()
  await screen.getByRole('button', /^form-handoff-regression/).tap()
  await expect(screen.getByRole('heading', 'form-handoff-regression', { exact: true })).toBeVisible()

  await screen.getByRole('button', '详情 collect', { exact: true }).tap()
  const collect = screen.getByRole('complementary', '详情 collect', { exact: true })
  await collect.getByLabel('备注 / Note', { exact: true }).fill('persisted E2E value')
  await collect.getByRole('group', '任务列表 / Rows 1', { exact: true }).getByLabel('名称 / Name').fill('changed first')
  await collect.getByRole('group', '任务列表 / Rows 1', { exact: true }).getByLabel('数值 / Amount').fill('0')
  await collect.getByRole('button', '删除 任务列表 / Rows 2', { exact: true }).tap()
  await collect.getByRole('button', '添加 flags', { exact: true }).tap()
  await collect.getByRole('button', '提交表单', { exact: true }).tap()
  await expect(collect.getByRole('alert')).toContainText('form.flags[0]')
  const flag = collect.getByRole('group', 'flags 1', { exact: true }).getByRole('switch')
  await flag.press('Space')
  await flag.press('Space')
  await collect.getByRole('button', '提交表单', { exact: true }).tap()
  await expect(collect.getByRole('status')).toHaveText('已提交，结果只读。')
  await expect(collect.getByLabel('备注 / Note', { exact: true })).toBeDisabled()

  const output = {
    rows: [
      { name: 'changed first', amount: 0, enabled: false, tags: [], grid: [] },
      { name: 'last', amount: 3, enabled: false, tags: [], grid: [] },
    ],
    settings: { note: 'persisted E2E value', choice: 0, approved: false },
    empty: {}, flags: [false],
  }
  await expectDetail(browser, 'collect', '输出', output)
  await screen.getByRole('button', '关闭详情', { exact: true }).tap()
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  await screen.getByRole('button', '详情 review', { exact: true }).tap()
  const review = screen.getByRole('complementary', '详情 review', { exact: true })
  await expect(review.getByLabel('备注 / Note', { exact: true })).toHaveValue('persisted E2E value')
  await expect(review.getByLabel('选择 / Choice', { exact: true })).toHaveValue('0')
  await expect(review.getByLabel('批准 / Approved', { exact: true })).not.toBeChecked()
  await expect(review.getByLabel('额外备注 / Extra note')).toHaveValue('added default')
  await expectDetail(browser, 'review', '输入', output)
  await review.getByRole('button', '提交表单', { exact: true }).tap()
  await expect(review.getByRole('status')).toHaveText('已提交，结果只读。')
  const reviewed = { ...output, extraNote: 'added default' }
  await expectDetail(browser, 'review', '输出', reviewed)

  await screen.getByRole('button', '关闭详情', { exact: true }).tap()
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  await screen.getByRole('button', '详情 downstream', { exact: true }).tap()
  await expectDetail(browser, 'downstream', '输入', reviewed)

  // Restart the real host process with this run's original home and workspace.
  await dsh.restart(browser)
  await app.open('/')
  await screen.getByRole('button', '工作流', { exact: true }).tap()
  await screen.getByRole('button', /^form-handoff-regression/).tap()
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  await screen.getByRole('button', '详情 review', { exact: true }).tap()
  await expect(review.getByRole('status')).toHaveText('已提交，结果只读。')
  await expect(review.getByLabel('备注 / Note', { exact: true })).toHaveValue('persisted E2E value')
  await expect(review.getByLabel('备注 / Note', { exact: true })).toBeDisabled()
  await expect(review.getByLabel('额外备注 / Extra note')).toBeDisabled()
  await expectDetail(browser, 'review', '输出', reviewed)
})
