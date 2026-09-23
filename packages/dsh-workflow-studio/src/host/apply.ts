import type { Context } from '@deepseek-ai/cordis'
import { fileURLToPath } from 'node:url'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-workspace'
import { dshHomeDisplay, dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { createPluginStatusRoute } from './routes/plugin-status.js'
import { createWorkflowInstancesRoute } from './routes/workflow-instances.js'
import { PluginStatusService } from './service/plugin-status-service.js'
import { WorkflowInstanceService } from './service/workflow-instance-service.js'
import { copyBuiltinTemplates } from './template-directory.js'

declare const __PLUGIN_VERSION__: string

export async function apply(ctx: Context): Promise<void> {
  const status = new PluginStatusService(__PLUGIN_VERSION__)
  const home = dshHomePath()
  const templateRoot = dshHomePath('dsh-workflow-studio', 'templates')
  await copyBuiltinTemplates(fileURLToPath(new URL('./templates/', import.meta.url)), templateRoot)
  const instances = await WorkflowInstanceService.create(
    ctx,
    templateRoot,
    `${dshHomeDisplay(home)}/dsh-workflow-studio/templates/<template-id>/workflow.yaml`,
  )

  ctx.effect(() => async () => instances.close())
  ctx.effect(() => ctx.webServer.register(createPluginStatusRoute(status)))
  ctx.effect(() => ctx.webServer.register(createWorkflowInstancesRoute(instances)))
}
