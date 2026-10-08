import { expect } from 'e2e'
import { cp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from './dsh.js'

test('模板包附属文件读取、工作区产物、当前内容、宿主重启与缺失错误', async ({ app, screen, browser, dsh }) => {
  // The package is outside the workspace, with path characters that must stay data.
  const bundle = join(dsh.root, "template 中文 ' \" $ \x60 # %")
  await cp(fileURLToPath(new URL('../packages/dsh-workflow-studio/tests/fixtures/template-assets', import.meta.url)), bundle, { recursive: true })
  const directory = join(bundle, 'content/template')
  const expectedDirectory = await realpath(directory)
  const expectedWorkspace = await realpath(dsh.workspace)
  await dsh.stop()
  await dsh.addBundle(bundle)
  const previous = process.env.DSH_TEMPLATE_DIR
  process.env.DSH_TEMPLATE_DIR = '/stale/ambient/template'
  try { await dsh.start() }
  finally { if (previous === undefined) delete process.env.DSH_TEMPLATE_DIR; else process.env.DSH_TEMPLATE_DIR = previous }
  await dsh.authenticate(browser)
  await app.open('/')
  await screen.getByRole('dialog', '预览版说明').getByRole('button', '继续', { exact: true }).tap()
  await screen.getByRole('button', '添加工作区', { exact: true }).tap()
  const picker = screen.getByRole('dialog', '选择工作区目录')
  await expect(picker.getByRole('button', '主目录', { exact: true })).toBeVisible()
  await picker.getByRole('button', '编辑路径', { exact: true }).tap()
  await picker.getByRole('textbox', '编辑路径').fill(dsh.workspace)
  await picker.getByRole('textbox', '编辑路径').press('Enter')
  await picker.getByRole('button', '打开', { exact: true }).tap()
  await screen.getByRole('button', '工作流', { exact: true }).tap()
  await screen.getByRole('button', '新建实例 ' + dsh.workspaceName, { exact: true }).tap()
  const create = screen.getByRole('dialog', '新建实例', { exact: true })
  await create.getByLabel('工作流模板').selectOption({ value: 'template-assets-e2e' })
  await create.getByLabel('实例名称').fill('template-files-regression')
  await create.getByRole('button', '创建实例', { exact: true }).tap()
  await screen.getByRole('button', /^template-files-regression/).tap()
  await screen.getByRole('button', '详情 first', { exact: true }).tap()
  await screen.getByRole('button', '执行', { exact: true }).tap()
  const firstOutput = browser.locator('aside[aria-label="详情 first"] section[aria-label="运行信息"] dt:text-is("输出") + dd pre')
  await expect(firstOutput).toBeVisible()
  expect(JSON.parse((await firstOutput.textContent())!)).toEqual({ doc: 'document A', source: expectedDirectory, workspace: expectedWorkspace })
  expect(await readFile(join(dsh.workspace, 'result.txt'), 'utf8')).toEqual('document A')

  await writeFile(join(directory, 'docs/guide.md'), 'document B\n')
  await dsh.restart(browser)
  await app.open('/')
  await screen.getByRole('button', '工作流', { exact: true }).tap()
  await screen.getByRole('button', /^template-files-regression/).tap()
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  await screen.getByRole('button', '详情 second', { exact: true }).tap()
  await screen.getByRole('button', '执行', { exact: true }).tap()
  const secondOutput = browser.locator('aside[aria-label="详情 second"] section[aria-label="运行信息"] dt:text-is("输出") + dd pre')
  await expect(secondOutput).toBeVisible()
  expect(JSON.parse((await secondOutput.textContent())!)).toEqual({ doc: 'document B', source: expectedDirectory, workspace: expectedWorkspace })
  expect(await readFile(join(dsh.workspace, 'runs.txt'), 'utf8')).toEqual('document A\ndocument B\n')
  expect(await readFile(join(dsh.workspace, 'result.txt'), 'utf8')).toEqual('document B')

  await rm(join(directory, 'scripts/init.sh'))
  await screen.getByRole('button', '关闭详情', { exact: true }).tap()
  await screen.getByRole('button', '查看全图', { exact: true }).tap()
  await screen.getByRole('button', '详情 missing', { exact: true }).tap()
  await screen.getByRole('button', '执行', { exact: true }).tap()
  await expect(browser.locator('aside[aria-label="详情 missing"]')).toContainText('Command exited with code 127')
  await expect(browser.locator('aside[aria-label="详情 missing"]')).toContainText('No such file')
  expect(await readFile(join(dsh.workspace, 'runs.txt'), 'utf8')).toEqual('document A\ndocument B\n')
})
