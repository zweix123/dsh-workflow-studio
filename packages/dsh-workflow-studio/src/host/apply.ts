import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createPluginStatusRoute } from './routes/plugin-status.js'
import { PluginStatusService } from './service/plugin-status-service.js'

declare const __PLUGIN_VERSION__: string

export function apply(ctx: Context): void {
  const service = new PluginStatusService(__PLUGIN_VERSION__)

  // 新增接口时，在 routes/ 中定义路由工厂，并在此逐条注册；业务逻辑放在 service/ 中。
  // 路由增多后，可在 routes/index.ts 提取 createRoutes(...) 返回路由列表，在此遍历注册。
  // 每条路由都通过 ctx.effect 托管 register 返回的取消注册函数，随插件卸载自动清理。
  ctx.effect(() => ctx.webServer.register(createPluginStatusRoute(service)))
}
