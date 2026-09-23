import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copyBuiltinTemplates, validateTemplateDirectory } from '../src/host/template-directory.js'

const validYaml = 'id: example\ntype: dag\ndag:\n  - id: start\n    type: node\n'

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
