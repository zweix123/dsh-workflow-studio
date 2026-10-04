# 节点插件作者指南

适用于 dsh `0.2.0-rc.1` 和本仓库的公共节点接口。节点插件使用普通 dsh/Cordis 插件装配，不需要修改 Studio 的节点清单。最小可运行示例见 [`examples/echo-node`](../examples/echo-node/README.zh.md)。模板使用独立通用加载插件，资源声明见[模板作者指南](./template-plugin-authoring.zh.md)。

## 服务端登记

仅依赖 `dsh-workflow-node/contract` 的 `ServerNode`、`NodeContext`、`NodeFact` 等公共类型。插件导出 `name`，与自己的 `package.json.name` 一致，声明 `inject: ['workflowNodes', ...node.requires]`，在 `apply(ctx)` 中调用：

```ts
ctx.workflowNodes.register(ctx, name, node, { dispose: releaseNodeResources })
```

`register` 使用拥有该贡献的宿主 Context。真实 Loader 装配时，通过宿主 `pluginPackages` 和 Loader entry 校验包身份，并记录声明位置；直接 Cordis 装配时核对插件导出的名称。浏览器贡献使用宿主 client Loader entry 的包/module id，直接 Cordis 装配时核对插件名称。第三方应使用自身包名，不把其他节点的包名当作别名。来源用于匹配同包的前后端贡献，不是用户选择实现的优先级。

同一 profile 中同 kind 的所有重复贡献均不可用，`workflowNodes.diagnose(kind)` 返回包名、声明位置及 available/missing/conflict/unloading 状态。移除冲突后剩余贡献恢复。登记服务存在不代表某个 kind 可用；需要具体节点类型的插件，应额外依赖 `nodeService(kind)` 返回的宿主服务键。不同 profile 的登记独立，同一 profile 所有工作区共享类型。

`node.requires` 列出业务使用的宿主服务。Studio 为已接纳的调用捕获贡献 Context 中的这些服务，节点通过 `context.services` 使用它们。不能导入 Studio 的 workflow、DAG、存储或实例状态实现。

## 执行、保存与恢复

- `validate(definition)` 校验本类型业务配置，`validateFact(fact)` 可拒绝无法解释的保存状态。公共结构与输入输出语义由 Studio/DAG 校验；不要覆盖这些语义。
- `ready(context)` 决定是否自动启动；`action(context, id, payload)` 必须重新校验动作、业务阶段和参数。返回 `NodePlan`，包含待保存事实及可选异步 `run`。首次运行也可能没有事实。有外部副作用的业务放入 run；Studio 先保存初始事实再调用，ready/action 只准备该计划。
- `run` 返回同 kind 的事实。成功事实的输出必须满足声明；可提前调用 `validateOutput`。未声明输出时交付 `{}`。取消、失败、等待或未知均不推进 DAG。
- `context.save` 用于正在执行调用的进度事实。必须 `await`，失败后停止把未保存进展当作可靠事实；不要另建保存重试系统。异步业务应返回最终事实，由 Studio 协调最终保存与 DAG 提交。
- `recover` 校验通过后解释已有事实。已接受的成功结果不重新执行业务，Studio 可恢复其 DAG 提交；结果未知或失败不因插件恢复自动重跑。需要恢复外部任务时，节点必须根据自己的已保存业务身份明确判断，而不能把 running 默认解释为“尚未执行”。


完整定义中的任意必需类型缺失或冲突都会暂停该实例的新业务，包括已完成节点、未激活分支和尚未展开的节点。已开始调用仍可保存合法结果及提交 DAG，后续新业务继续等待。恢复依赖后重新校验完整定义和事实，按原有自动/手动规则继续。

## 资源清理

把本节点执行收尾需要的资源清理交给 `register` 的 `dispose` 回调。登记先撤销新调用资格，等待该插件已开始调用及保存收尾，然后执行回调，再完成注销。宿主可能并行执行普通 effect 的清理，因此不能用“最后登记”保护执行资源，也不能把同一资源另行登记普通 effect 清理。与执行无关的词表、界面等仍使用普通宿主 effect。

结果保存失败会明确记录错误并允许卸载完成；恢复以实际保存事实为准，不抹掉已保存成功结果、不自动重跑未知业务。仅 waiting 事实没有在途调用，不阻塞卸载。`dispose` 应可安全释放自己的资源；框架不保存插件代码或历史实现。

`workflowNodes.records(kind)` 返回真实工作流实例身份、节点实例身份、工作区、定义和事实的只读副本，供节点查询本类型关联，例如会话返回实例。不使用定义 id 代替逐项展开后的节点实例 id，也不创建另一套工作流持久化。

## 展示与可选浏览器入口

`describe({ definition, input, fact?, ready })` 是纯只读入口，返回可序列化 `NodePresentation`。其中 `actions` 每项有稳定 id、`NodeText` 文案、目标、可选 disabled 和 primary；最多声明一个 primary。目标为 `{ type: 'server' }`、`{ type: 'details' }` 或 `{ type: 'client', handler }`。首次无事实也可列出操作，禁止为了枚举按钮调用 ready/action。`project(fact)` 决定提供给前端的业务数据；持久化的原始 business 不自动公开。

固定文本用 `{ text: 'Run' }`。多语言用 `{ namespace: name, key: 'run' }`，节点自行通过宿主 locale 注册词表，Studio 只解析文本引用。

可选客户端导出普通 dsh browser 插件，在 manifest 的 `dsh.client` 声明 web 入口及宿主依赖。导出与 manifest 一致的 `name`，`inject` 包含 `workflowNodeViews`，调用 `ctx.workflowNodeViews.register(ctx, name, clientNode)`。类型从 `dsh-workflow-node/ui` 导入：

- `Summary` 只能填充公共卡片的业务摘要区域，不能替换整张卡片或身份、状态、连接点和固定详情入口。
- `Panel` 在公共详情的业务区域实现交互；通过 props 的 action 提交业务参数，draft/setDraft 管理同页临时草稿。
- `handlers` 以名称提供同步或异步前端动作。Studio 处理防重、等待与错误反馈。查看和导航可以在历史节点上使用，与业务执行权限分开。

同 kind 不同来源不会混用组件或 handler。没有组件时保留通用详情及有效服务端按钮；没有 handler 时隐藏对应操作。组件渲染错误在局部隔离，动作异常由公共通道反馈。前端卸载/重载会清除临时草稿并提示，已保存数据保留。

需要从宿主其他页面打开指定节点时，可注入 `workflowNavigation`，调用 `open({ instanceId, nodeInstanceId }, abortSignal)`；用真实身份定位，遵守取消信号，结果为 false 时不继续导航。session_agent 的会话头动作及关联 API 已由节点包自己装配。

## 模板联合装配

默认节点装配见 `packages/dsh-workflow-bundle/cordis.patch.yml`，公共登记、Studio 与三个内置节点都是普通宿主插件。模板加载插件可用 `nodeService(kind)` 等待完整模板依赖，或查询/订阅登记变化；不能只依赖 workflowNodes 就宣称具体类型可用。默认六份模板通过通用模板加载插件登记，节点示例 bundle 也声明模板资源。模板只在声明加载或重载时读取 YAML；节点依赖消失或恢复只重新判定已加载定义，不读取新文件。第三方节点与模板的联合验收见[联合验收记录](./acceptance/node-template-joint.zh.md)。
