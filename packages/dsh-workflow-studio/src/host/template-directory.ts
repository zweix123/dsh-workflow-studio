import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDocument } from 'yaml'
import { compile, type DagDefinition } from './dag/index.js'
import { validateWorkflowNodes } from './workflow/index.js'

export async function validateTemplateDirectory(directory: string): Promise<{ definition: DagDefinition } | { error: string }> {
  try {
    const document = parseDocument(await readFile(join(directory, 'workflow.yaml'), 'utf8'))
    if (document.errors.length) throw document.errors[0]
    const definition = compile(document.toJS()).getDefinition()
    validateWorkflowNodes(definition)
    return { definition }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export async function copyBuiltinTemplates(sourceRoot: string, targetRoot: string): Promise<void> {
  const entries = await readdir(sourceRoot, { withFileTypes: true })
  await mkdir(targetRoot, { recursive: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const source = join(sourceRoot, entry.name)
    const result = await validateTemplateDirectory(source)
    if ('error' in result) throw new Error(`Invalid built-in template "${entry.name}": ${result.error}`)
    const target = join(targetRoot, entry.name)
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
  }
}
