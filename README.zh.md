# dsh-workflow-studio

[English](README.md) | 简体中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的工作流插件。用 YAML 定义工作流，在 DSH 工作区中创建实例，并在可视化 DAG 中查看每次运行。

固定适配 `@deepseek-ai/dsh@0.2.0-rc.1`。目前从本仓库安装，尚未发布为软件包。

> `npm install -g @deepseek-ai/dsh@0.2.0-rc.1 --registry=https://registry.npmjs.org`

## 功能

- 从当前 profile 的插件声明加载模板，默认提供三对中英文模板。
- 基于模板快照创建独立、可持久化的工作流实例，在 DAG 画布中查看进展。
- 使用 DSH 对话执行 `session_agent` 节点、宿主沙箱执行 `bash` 节点、用户填写并提交 `form` 节点。
- 支持依赖、条件边、逐项展开、嵌套 DAG 和递归 DAG 引用。完整规则见 [DAG 语法文档](docs/dag-syntax.zh.md)。

## 从源码安装

先在本机安装 DSH `0.2.0-rc.1`。构建本仓库需要 Node.js `^22.19.0 || >=24.0.0`。

```sh
git clone https://github.com/zweix123/dsh-workflow-studio.git
cd dsh-workflow-studio
npm ci --registry=https://registry.npmjs.org
npm run build
dsh plugin --profile web add ./packages/dsh-workflow-bundle
dsh web
```

如果此 profile 之前直接安装的是 `packages/dsh-workflow-studio`，先停止对应宿主，执行 `dsh plugin --profile web remove dsh-workflow-studio` 移除旧插件入口，再按上面的命令添加默认 bundle 并重启。两条命令使用相同 profile。仅安装 Studio 单包会缺少节点登记依赖，Web 页面可能提示 `waiting for service: workflowNodeViews`。这些操作只调整插件装配，不迁移或删除实例文件。


本插件不内置 DSH。默认 bundle 装配公共节点登记、Studio、三个节点插件、通用模板加载器和唯一的内置模板 mattpocock 中文版（`matt-pocock-wayfinder-workflow.zh`）；第三方节点见[作者指南](docs/node-plugin-authoring.zh.md)及[最小示例](examples/echo-node/README.zh.md)。模板接入见[作者指南](docs/template-plugin-authoring.zh.md)和[纯配置示例](examples/review-templates/README.zh.md)。

## 创建工作流

1. 使用默认模板，或按照[模板作者指南](docs/template-plugin-authoring.zh.md)添加自己的纯配置 bundle。
2. 从 DSH 侧边栏打开 **工作流**，在 **实例管理** 中选择工作区和模板，创建实例。
3. 打开实例，在运行图中执行就绪节点。`session_agent` 节点需用户明确标记完成；`bash` 命令成功后自动完成；`form` 节点在有效提交后完成。

包内最小模板（须由 bundle 声明并通过 exports 暴露）：

```yaml
id: hello
name: Hello workflow
type: dag
dag:
  - id: draft
    type: node
    node_kind: session_agent
    prompt: 写一段简短的初稿。
```

模板只在插件声明加载或重载时读取；页面刷新不重读文件，已有实例保留创建时快照。旧 DSH home 模板目录不再自动发现或复制。

## 当前限制

`session_agent` 通过 prompt 中的 `{{ name }}` / `{{ object.field }}` 消费声明输入，完成提交 `{}`，不能声明业务输出。`bash` 使用相同引用作为独立且安全转义的 Shell 参数；声明输出时 stdout 必须整体为符合输出契约的 JSON 对象，日志写 stderr；不声明输出时提交 `{}`，stdout 仅作日志。`form` 正式提交真实用户数据。工坊模板没有外部根输入，请用入口表单收集。详见 [DAG 语法文档](docs/dag-syntax.zh.md)。

原 `chat` 类型已更名为 `session_agent`。自定义模板需更新 `node_kind`；保留旧模板快照的已有实例需重新创建。

## 开发

```sh
npm run check
```

该命令执行类型检查、构建和测试。产品规格见 [`docs/specs/`](docs/specs/)，仓库约定见 [`AGENTS.md`](AGENTS.md)。

运行保存在仓库里的真实宿主浏览器回归测试：

```sh
npm run test:e2e
```

需要本机已安装的 dsh `0.2.0-rc.1`、pnpm 和 Node `^22.22.3 || >=24.8.0`；用例采用固定操作与断言，不需要模型。环境准备、可视运行和当前覆盖见 [E2E 说明](e2e/README.md)。

```sh
dsh plugin --profile web remove dsh-workflow-bundle
```
