import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { BrowserNodeRegistry } from '../../dsh-workflow-node/src/browser.js'

test('browser artifact uses dsh factory and host React, registers panel and sidebar', async () => {
  const require = createRequire(import.meta.url)
  const modules: string[] = []
  let plugin: { name: string; inject: string[]; apply: (ctx: unknown) => void } | undefined
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(source, /react-flow__pane/)
  runInNewContext(source, {
    window: { __ModuleLoader__: { load({ id, factory }: { id: string; factory: (load: (name: string) => unknown) => typeof plugin }) {
      assert.equal(id, 'dsh-workflow-studio')
      plugin = factory(name => {
        modules.push(name)
        assert.ok(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'].includes(name), `unexpected browser import: ${name}`)
        return require(name)
      })
    } } },
  })
  assert.equal(plugin!.name, 'dsh-workflow-studio')
  assert.ok(modules.includes('react'))
  assert.ok(modules.includes('react-dom'))
  assert.deepEqual(Array.from(plugin!.inject), ['slots', 'locale', 'workflowNodeViews', 'layout'])
  const entries: Record<string, unknown>[] = []
  let dictionaries: Record<string, Record<string, string>> = {}
  let active = 'zh'
  let disposed = false
  const cleanup: (() => void)[] = []
  plugin!.apply({
    provide() {},
    workflowNodeViews: {},
    uiWorkspace: { openSession() {} },
    effect(setup: () => () => void) { cleanup.push(setup()) },
    locale: {
      register(namespace: string, value: typeof dictionaries) {
        assert.equal(namespace, plugin!.name)
        dictionaries = value
        return () => { disposed = true }
      },
      bind(namespace: string) {
        assert.equal(namespace, plugin!.name)
        return (key: string) => dictionaries[active][key]
      },
    },
    slots: {
    inject(_slot: string, setup: () => unknown) {
      const result = setup()
      if (result && typeof result === 'object' && Symbol.iterator in result) [...result as Iterable<unknown>]
      return () => {}
    },
    register(options: Record<string, unknown>) { entries.push(options); return () => {} },
  } })
  assert.deepEqual(entries.map(entry => entry.name), ['main', 'sidebar.panellist'])
  assert.equal(entries[0].locale, plugin!.name)
  assert.equal(entries[0].key, entries[1].id)
  assert.equal(entries[0].inject, undefined)
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort())
  const label = entries[1].label as () => string
  assert.equal(label(), dictionaries.zh.title)
  active = 'en'
  assert.equal(label(), dictionaries.en.title)
  // Distinct probes ensure the label resolves at read time rather than caching.
  dictionaries.en.title = 'English title'
  assert.equal(label(), 'English title')
  cleanup.forEach(dispose => dispose())
  assert.ok(disposed)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'))
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-client-locale'], '0.2.0-rc.1')
})

for (const [directory, kind] of [['dsh-workflow-node-bash', 'bash'], ['dsh-workflow-node-form', 'form'], ['dsh-workflow-node-session-agent', 'session_agent']]) {
  test(`${kind} browser artifact owns its capabilities, locale and cleanup`, async () => {
    const require = createRequire(import.meta.url)
    const source = await readFile(new URL(`../../${directory}/lib/client.js`, import.meta.url), 'utf8')
    let plugin: any
    runInNewContext(source, { window: { __ModuleLoader__: { load({ id, factory }: any) {
      plugin = factory((name: string) => {
        assert.ok(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'].includes(name), `unexpected import: ${name}`)
        return require(name)
      })
      assert.equal(id, plugin.name)
    } } } })
    const ctx = new Context()
    const dictionaries = new Map<string, Record<string, Record<string, string>>>()
    let language = 'zh'
    const translate = (namespace: string, key: string) => dictionaries.get(namespace)?.[language][key] ?? key
    const views = new BrowserNodeRegistry(translate)
    ctx.provide('workflowNodeViews', views)
    ctx.provide('locale', { register(namespace: string, words: any) { dictionaries.set(namespace, words); return () => { dictionaries.delete(namespace) } }, bind: (namespace: string) => (key: string) => translate(namespace, key) } as never)
    ctx.provide('slots', { inject(_slot: string, setup: () => unknown) { setup() }, register() { return () => {} } } as never)
    ctx.provide('workflowNavigation', { open: async () => false, remove() {} })
    ctx.provide('uiWorkspace', { openSession() {} } as never)
    ctx.provide('layout', { selectPanel() {} } as never)
    try {
      const fiber = ctx.plugin(plugin)
      await fiber
      assert.ok(views.get(kind, plugin.name))
      assert.equal(views.get(kind, 'another-package'), undefined)
      const words = dictionaries.get(plugin.name)!
      assert.deepEqual(Object.keys(words.en).sort(), Object.keys(words.zh).sort())
      const key = Object.keys(words.zh)[0]
      assert.equal(views.text({ namespace: plugin.name, key }), words.zh[key])
      language = 'en'
      assert.equal(views.text({ namespace: plugin.name, key }), words.en[key])
      await fiber.dispose()
      assert.equal(views.get(kind, plugin.name), undefined)
      assert.equal(dictionaries.has(plugin.name), false)
    } finally { await ctx.fiber.dispose() }
  })
}

test('a third-party locale-only browser entry can localize server descriptions without a component', async () => {
  const ctx = new Context()
  let language = 'en'
  let words: any
  const views = new BrowserNodeRegistry((_namespace, key) => words?.[language][key] ?? key)
  ctx.provide('workflowNodeViews', views)
  ctx.provide('locale', { register(_namespace: string, value: any) { words = value; return () => { words = undefined } } } as never)
  try {
    const plugin = ctx.plugin({ name: 'external-localized', inject: ['workflowNodeViews', 'locale'], apply(owner: Context) {
      owner.effect(() => owner.locale.register('external-localized', { en: { run: 'Run' }, zh: { run: '运行' } } as never))
      owner.workflowNodeViews.register(owner, 'external-localized', { kind: 'external_localized' })
    } })
    await plugin
    assert.equal(views.get('external_localized', 'external-localized')?.node.Panel, undefined)
    assert.equal(views.text({ namespace: 'external-localized', key: 'run' }), 'Run')
    language = 'zh'
    assert.equal(views.text({ namespace: 'external-localized', key: 'run' }), '运行')
    await plugin.dispose()
    assert.equal(views.get('external_localized', 'external-localized'), undefined)
    assert.equal(words, undefined)
  } finally { await ctx.fiber.dispose() }
})
