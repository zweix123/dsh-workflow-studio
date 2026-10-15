import { expect } from 'e2e'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '../dsh.js'
import { addWorkspace, createInstance, detailField, inspectNode, openWorkflows } from '../ui.js'

test('Nunjucks 原生条件与计算数组驱动展开，Bash filter 和 dump 安全交付并跨宿主重启恢复', async ({ app, screen, browser, dsh }) => {
  await app.open('/')
  await addWorkspace(screen, dsh.workspace)
  await createInstance(screen, dsh.workspaceName, 'regression-text-expressions', 'text-expressions-run')
  await screen.getByRole('button', '执行 source', { exact: true }).tap()
  await inspectNode(screen, 'source')
  await expect(detailField(browser, 'source', '状态')).toHaveText('已完成')
  await inspectNode(screen, 'each b')
  expect(JSON.parse((await detailField(browser, 'each', '逐项身份').textContent())!)).toEqual({ key: 'b', index: 0 })
  await screen.getByRole('button', '执行 each b', { exact: true }).tap()
  await expect(detailField(browser, 'each', '状态')).toHaveText('已完成')
  expect(JSON.parse((await detailField(browser, 'each', '输出').textContent())!)).toEqual({ text: 'BETA ; $(PRINTF INJECTED) }}', json: '{"title":"Beta ; $(printf INJECTED)"}' })
  await dsh.restart(browser)
  await app.open('/')
  await openWorkflows(screen, browser)
  await screen.getByRole('button', /^text-expressions-run/).tap()
  await inspectNode(screen, 'each b')
  await expect(detailField(browser, 'each', '状态')).toHaveText('已完成')
  await inspectNode(screen, 'each a')
  expect(JSON.parse((await detailField(browser, 'each', '逐项身份').textContent())!)).toEqual({ key: 'a', index: 1 })
  await screen.getByRole('button', '执行 each a', { exact: true }).tap()
  await expect(detailField(browser, 'each', '状态')).toHaveText('已完成')
  await inspectNode(screen, 'finish')
  expect(JSON.parse((await detailField(browser, 'finish', '输入').textContent())!)).toEqual({
    text: ['BETA ; $(PRINTF INJECTED) }}', 'ALPHA <& }}'],
    json: ['{"title":"Beta ; $(printf INJECTED)"}', '{"title":"Alpha <&"}'],
  })
  await screen.getByRole('button', '执行 finish', { exact: true }).tap()
  await expect(detailField(browser, 'finish', '状态')).toHaveText('已完成')
  expect(await readFile(join(dsh.workspace, 'source-runs.txt'), 'utf8')).toBe('run\n')
})
