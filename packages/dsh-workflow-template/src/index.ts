import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from 'dsh-workflow-studio/templates'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'
import { z } from 'zod'

export const name = 'dsh-workflow-template'
export const inject = ['workflowTemplates', 'loader']
export const Config = z.object({ directory: z.string().trim().min(1) }).strict()
export type Config = z.infer<typeof Config>

/** Read only for this declaration's load. Type dependency changes belong to Studio. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  let contribution: { definition: unknown; templateDirectory: string } | { error: string }
  try {
    if (!/^(?:@[^/]+\/[^/]+|[^./:@][^/]*)\/.+/.test(config.directory)
      || config.directory.split('/').some(part => part === '..' || part === '.')) throw new Error('directory must be a package resource address')
    const resolver = ctx.loader.internal
    if (!resolver) throw new Error('Profile module resolver is unavailable')
    const specifier = `${config.directory}/workflow.yaml`
    const parent = ctx.baseUrl ?? import.meta.url
    const resource = resolver.version === 'v2'
      ? resolver.resolveSync(parent, { specifier })
      : await resolver.resolve(specifier, parent, {})
    const file = fileURLToPath(resource.url)
    const document = parseDocument(await readFile(file, 'utf8'))
    if (document.errors.length) throw document.errors[0]
    contribution = { definition: document.toJS(), templateDirectory: dirname(file) }
  } catch (error) { contribution = { error: error instanceof Error ? error.message : String(error) } }
  ctx.workflowTemplates.register(ctx, config.directory, contribution)
}
