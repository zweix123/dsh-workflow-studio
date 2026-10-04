import { bashNode } from '../../dsh-workflow-node-bash/src/server.js'
import { formNode } from '../../dsh-workflow-node-form/src/server.js'
import { sessionAgentNode } from '../../dsh-workflow-node-session-agent/src/server.js'
const builtinNodes = new Map([bashNode, formNode, sessionAgentNode].map(node => [node.kind, node]))
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { compile } from '../src/host/dag/index.js'
import { validateWorkflowNodes } from '../src/host/workflow/index.js'


test('bundled templates have valid English and Chinese counterparts', async () => {
  const root = fileURLToPath(new URL('../templates/', import.meta.url))
  const names = (await readdir(root)).sort()
  assert.deepEqual(names, [
    'github-spec-kit-workflow', 'github-spec-kit-workflow.zh',
    'matt-pocock-wayfinder-workflow', 'matt-pocock-wayfinder-workflow.zh',
    'openspec-workflow', 'openspec-workflow.zh',
  ])
  for (const name of names) {
    const definition = compile(parse(await readFile(join(root, name, 'workflow.yaml'), 'utf8')), {}).getDefinition()
    validateWorkflowNodes(definition, builtinNodes)
    assert.equal(definition.id, name)
    assert.ok(typeof definition.name === 'string' && definition.name.trim())
    for (const key of ['source', 'references', 'playground']) assert.equal(Object.hasOwn(definition, key), false, `${name}: ${key}`)
  }
  const localized = new Set(['name', 'id', 'from', 'to', 'definition_id', 'title', 'description', 'prompt', 'caption', 'request'])
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
