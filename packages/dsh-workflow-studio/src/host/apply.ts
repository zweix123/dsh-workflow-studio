import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-workspace'
import { createPluginStatusRoute } from './routes/plugin-status.js'
import { createWorkflowInstancesRoute } from './routes/workflow-instances.js'
import { PluginStatusService } from './service/plugin-status-service.js'
import { WorkflowInstanceService } from './service/workflow-instance-service.js'
import { TemplateRegistry } from './service/template-registry.js'

declare const __PLUGIN_VERSION__: string

export async function apply(ctx: Context): Promise<void> {
  const status = new PluginStatusService(__PLUGIN_VERSION__)
  const templates = new TemplateRegistry(ctx)
  ctx.provide('workflowTemplates', templates)
  const instances = await WorkflowInstanceService.create(ctx, templates)

  ctx.effect(() => async () => instances.close())
  ctx.effect(() => ctx.webServer.register(createPluginStatusRoute(status)))
  ctx.effect(() => ctx.webServer.register(createWorkflowInstancesRoute(instances)))
}
