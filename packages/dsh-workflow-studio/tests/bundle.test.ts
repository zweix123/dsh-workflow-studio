import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

test('browser artifact uses dsh factory and host React, registers panel and sidebar', async () => {
  const require = createRequire(import.meta.url)
  const modules: string[] = []
  let plugin: { name: string; inject: string[]; apply: (ctx: unknown) => void } | undefined
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    window: { __ModuleLoader__: { load({ id, factory }: { id: string; factory: (load: (name: string) => unknown) => typeof plugin }) {
      assert.equal(id, 'dsh-workflow-studio')
      plugin = factory(name => {
        modules.push(name)
        assert.ok(['react', 'react/jsx-runtime'].includes(name), `unexpected browser import: ${name}`)
        return require(name)
      })
    } } },
  })
  assert.equal(plugin!.name, 'dsh-workflow-studio')
  assert.ok(modules.includes('react'))
  assert.deepEqual(Array.from(plugin!.inject), ['slots', 'locale'])
  const entries: Record<string, unknown>[] = []
  let dictionaries: Record<string, Record<string, string>> = {}
  let active = 'zh'
  let disposed = false
  const cleanup: (() => void)[] = []
  plugin!.apply({
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
  assert.equal(entries[0].key, entries[1].id)
  assert.equal(entries[0].locale, plugin!.name)
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
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-client-locale'], '0.1.6-alpha.2')
})
