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


test('independent template packages contain the valid Chinese Matt Pocock and OpenSpec templates', async () => {
  for (const [packageDirectory, name] of [
    ['dsh-workflow-template-matt-pocock-wayfinder', 'matt-pocock-wayfinder-workflow.zh'],
    ['dsh-workflow-template-openspec-delivery', 'openspec-delivery.zh'],
  ]) {
    const root = fileURLToPath(new URL(`../../${packageDirectory}/`, import.meta.url))
    assert.deepEqual((await readdir(root)).sort(), ['cordis.patch.yml', 'package.json', 'workflow.yaml'])
    const source = await readFile(join(root, 'workflow.yaml'), 'utf8')
    assert.match(source, /[\u3400-\u9fff]/u, name)
    const definition = compile(parse(source), {}).getDefinition()
    validateWorkflowNodes(definition, builtinNodes)
    assert.equal(definition.id, name)
    assert.ok(typeof definition.name === 'string' && definition.name.trim())
    for (const key of ['source', 'references', 'playground']) assert.equal(Object.hasOwn(definition, key), false, `${name}: ${key}`)
  }
})
