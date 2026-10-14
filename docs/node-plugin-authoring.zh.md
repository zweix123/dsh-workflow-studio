# 节点插件作者指南

[文档导航](./README.zh.md) · [整体 DAG 语法](./dag-syntax.zh.md)

适用于 dsh `0.2.0-rc.1` 和本仓库的公共节点接口。节点插件使用普通 dsh/Cordis 插件装配，不需要修改 Studio 的节点清单。本仓库的内置节点使用同一公开契约，可直接作为接入实现参考。模板使用独立通用加载插件，资源声明见[模板作者指南](./template-plugin-authoring.zh.md)。

## 正式实现导航

- [公共契约](../packages/dsh-workflow-node/src/index.ts)：节点上下文、事实、计划与展示类型。
- [Form 服务端](../packages/dsh-workflow-node-form/src/server.ts)：字段校验、同步提交、结果重交付和普通插件登记。
- [Bash 服务端](../packages/dsh-workflow-node-bash/src/server.ts)：宿主服务依赖、异步业务、日志/输出及恢复。
- [Agent 服务端](../packages/dsh-workflow-node-agent/src/server.ts)：台前/台后任务、尝试记录和人工确认。
- [Form 浏览器入口](../packages/dsh-workflow-node-form/src/client.tsx)及[包声明](../packages/dsh-workflow-node-form/package.json)：可选浏览器贡献、交互和语言登记。
- [默认装配](../packages/dsh-workflow-bundle/cordis.patch.yml)及[开发体验模板](../packages/dsh-workflow-dev-templates/README.zh.md)：实际插件装配与节点功能体验。

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

`describe({ definition, input, fact?, ready })` 是纯只读入口，返回可序列化 `NodePresentation`。其中 `actions` 每项有稳定 id、`NodeText` 文案、目标、`position: 1 | 2 | 3`、公共 `icon` 标识和可选 disabled。同位置最多一个动作；缺位留空，不补位。目标为 `{ type: 'server' }` 或 `{ type: 'client', handler }`。首次无事实也可列出操作，禁止为了枚举按钮调用 ready/action。`project(fact)` 决定提供给前端的业务数据；持久化的原始 business 不自动公开。

公共图标标识为 `execute`、`complete`、`conversation`、`record`、`retry`、`edit`，分别使用宿主 rc.1 的 TriangleRightFill、CheckOutline、NewChatOutline、ClockOutline、RefreshOutline、EditOutline Regular 图标。Studio 统一渲染图标和文字；节点不能传入任意 SVG 或额外按钮。Studio 保留编排状态和卡片外壳，插件的业务表达不能改变 DAG 完成事实。

```ts
{ id: 'fill', position: 1, icon: 'edit', label: { namespace: name, key: 'fill' }, target: { type: 'client', handler: 'fill' } }
// clientNode.interactions = { fill: FormInteraction }
```

固定文本用 `{ text: 'Run' }`。多语言用 `{ namespace: name, key: 'run' }`，节点自行通过宿主 locale 注册词表，Studio 只解析文本引用。

可选客户端导出普通 dsh browser 插件，在 manifest 的 `dsh.client` 声明 web 入口及宿主依赖。导出与 manifest 一致的 `name`，`inject` 包含 `workflowNodeViews`，调用 `ctx.workflowNodeViews.register(ctx, name, clientNode)`。类型从 `dsh-workflow-node/ui` 导入：

- `Summary` 只能填充公共卡片的业务摘要区域，不能替换整张卡片或身份、状态、连接点和三个固定操作位。
- `Panel` 在公共详情的业务区域展示只读内容，接收 `NodeDetailsProps`，没有 action、草稿或编辑回调；不能提供执行、完成、填写或宿主导航入口。
- `interactions` 按 handler 名称登记 `NodeViewProps` 模块，处理插件自管浮窗。Studio 按真实节点实例和贡献代次挂载，传入 `request: { handler, sequence }`；只有匹配的模块收到请求。同一动作多次点击时 sequence 增加。模块使用 `action(name, payload)` 请求业务，读取 ready、pending、output、execution、error 更新界面，交互回调的异常通过 `reportError(error)` 交给公共反馈通道；action 的 Promise 结束表示请求完成，交付成功以 ready 与 output 为准。
- 浮窗与临时草稿由插件自己的 React 状态管理。模块在同一实例页面驻留，关闭浮窗或切换 Tab 不销毁草稿；`active: false` 时隐藏浮窗，页面销毁或插件卸载会销毁模块。已保存结果从公共 props 恢复。不能用定义 id 代替节点实例 id 缓存草稿。Form 复用 rc.1 的 Modal，校验失败保留输入，成功交付后关闭；服务端已接受的结果仅可重交。
- `handlers` 以名称提供同步或异步前端动作。Studio 处理防重、等待与错误反馈。查看和导航可以在历史节点上使用，与业务执行权限分开。

同 kind 不同来源不会混用组件或 handler。没有组件时保留通用详情及有效服务端按钮；没有匹配 handler 或 interaction 时隐藏对应操作。同一 handler 同时存在时优先调用 handlers；不要重复声明。组件渲染错误在局部隔离，动作异常由公共通道反馈。前端卸载/重载会清除临时草稿并提示，已保存数据保留。

需要从宿主其他页面打开指定节点时，可注入 `workflowNavigation`，调用 `open({ instanceId, nodeInstanceId }, abortSignal)`；用真实身份定位，遵守取消信号，结果为 false 时不继续导航。agent 的会话头动作及关联 API 已由节点包自己装配。

## 模板联合装配

默认节点装配见 `packages/dsh-workflow-bundle/cordis.patch.yml`，公共登记、Studio 与三个内置节点都是普通宿主插件。模板加载插件可用 `nodeService(kind)` 等待完整模板依赖，或查询/订阅登记变化；不能只依赖 workflowNodes 就宣称具体类型可用。默认两份业务模板通过通用模板加载插件登记；开发功能模板由独立附加包声明资源，不进入默认装配。模板只在声明加载或重载时读取 YAML；节点依赖消失或恢复只重新判定已加载定义，不读取新文件。第三方节点与模板的联合验收见[联合验收记录](./acceptance/node-template-joint.zh.md)。
