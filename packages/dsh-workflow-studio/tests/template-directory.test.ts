import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { copyBuiltinTemplates, validateTemplateDirectory } from '../src/host/template-directory.js'

const validYaml = 'id: example\ntype: dag\ndag:\n  - id: start\n    type: node\n    node_kind: bash\n    command: ""\n'

test('bundled templates have valid English and Chinese counterparts', async () => {
  const root = fileURLToPath(new URL('../templates/', import.meta.url))
  const names = (await readdir(root)).sort()
  assert.deepEqual(names, [
    'github-spec-kit-workflow', 'github-spec-kit-workflow.zh',
    'matt-pocock-wayfinder-workflow', 'matt-pocock-wayfinder-workflow.zh',
    'openspec-workflow', 'openspec-workflow.zh',
  ])
  for (const name of names) {
    const result = await validateTemplateDirectory(join(root, name))
    assert.equal('definition' in result, true, `${name}: ${'error' in result ? result.error : ''}`)
    if ('definition' in result) for (const key of ['source', 'references', 'playground']) assert.equal(Object.hasOwn(result.definition, key), false, `${name}: ${key}`)
  }
  const localized = new Set(['id', 'from', 'to', 'definition_id', 'title', 'description', 'prompt', 'caption', 'request'])
  const invariant = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(invariant)
    if (value && typeof value === 'object') return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, localized.has(key) && typeof child === 'string' ? '<localized>' : invariant(child)]),
    )
    return value
  }
  for (const name of names.filter(name => !name.endsWith('.zh'))) {
    const englishSource = await readFile(join(root, name, 'workflow.yaml'), 'utf8')
    const chineseSource = await readFile(join(root, `${name}.zh`, 'workflow.yaml'), 'utf8')
    assert.doesNotMatch(englishSource, /[\u3400-\u9fff]/u, name)
    assert.match(chineseSource, /[\u3400-\u9fff]/u, name)
    const english = parse(englishSource)
    const chinese = parse(chineseSource)
    assert.deepEqual(invariant(english), invariant(chinese), name)
  }
})

test('workflow node fields are validated at the template boundary without dropping unknown fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-business-fields-'))
  try {
    await writeFile(join(root, 'workflow.yaml'), validYaml.replace('command: ""', 'command: "  "\n    custom_note: keep'))
    const valid = await validateTemplateDirectory(root)
    assert.equal('definition' in valid && (valid.definition.dag[0] as any).custom_note, 'keep')
    await writeFile(join(root, 'workflow.yaml'), validYaml.replace('node_kind: bash\n    command: ""', 'node_kind: session_agent\n    prompt: ""'))
    assert.equal('definition' in await validateTemplateDirectory(root), true)
    await writeFile(join(root, 'workflow.yaml'), validYaml.replace('command: ""', 'command: ""\n    prompt: nope'))
    assert.equal('definition' in await validateTemplateDirectory(root), true)
    for (const [fragment, expected] of [
      ['node_kind: unknown\n    command: ""', /node_kind/],
      ['node_kind: chat\n    prompt: ""', /node_kind/],
      ['node_kind: bash', /command/],
      ['node_kind: bash\n    command: null', /command/],
      ['node_kind: bash\n    command: ""\n    is_auto_start: yes', /is_auto_start/],
      ['node_kind: session_agent', /prompt/],
      ['node_kind: session_agent\n    prompt: 42', /prompt/],
    ] as const) {
      const yaml = validYaml.replace('node_kind: bash\n    command: ""', fragment)
      await writeFile(join(root, 'workflow.yaml'), yaml)
      const result = await validateTemplateDirectory(root)
      assert.equal('error' in result, true, fragment)
      if ('error' in result) assert.match(result.error, expected)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('validates a template directory and copies every bundled directory over its existing target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-template-directory-'))
  const bundled = join(root, 'bundled')
  const installed = join(root, 'installed')
  try {
    await mkdir(join(bundled, 'first'), { recursive: true })
    await mkdir(join(bundled, 'second'), { recursive: true })
    await writeFile(join(bundled, 'first', 'workflow.yaml'), validYaml)
    await writeFile(join(bundled, 'first', 'extra.txt'), 'bundled extra')
    await writeFile(join(bundled, 'second', 'workflow.yaml'), validYaml)
    await writeFile(join(bundled, 'ignored.txt'), 'not a directory')
    await mkdir(join(installed, 'first'), { recursive: true })
    await mkdir(join(installed, 'custom'), { recursive: true })
    await writeFile(join(installed, 'first', 'workflow.yaml'), 'changed locally')
    await writeFile(join(installed, 'first', 'old.txt'), 'removed on overwrite')
    await writeFile(join(installed, 'custom', 'workflow.yaml'), validYaml)

    const valid = await validateTemplateDirectory(join(bundled, 'first'))
    assert.equal('definition' in valid && valid.definition.id, 'example')
    await writeFile(join(installed, 'custom', 'workflow.yaml'), 'type: dag\ndag: []\n')
    const invalid = await validateTemplateDirectory(join(installed, 'custom'))
    assert.equal('error' in invalid && /Missing id/.test(invalid.error), true)
    await copyBuiltinTemplates(bundled, installed)
    assert.deepEqual((await readdir(installed)).sort(), ['custom', 'first', 'second'])
    assert.deepEqual((await readdir(join(installed, 'first'))).sort(), ['extra.txt', 'workflow.yaml'])
    assert.equal(await readFile(join(installed, 'first', 'workflow.yaml'), 'utf8'), validYaml)
    assert.equal(await readFile(join(installed, 'first', 'extra.txt'), 'utf8'), 'bundled extra')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
