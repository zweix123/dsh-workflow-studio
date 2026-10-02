# dsh-workflow-studio

[English](README.md) | 简体中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的工作流插件。用 YAML 定义工作流，在 DSH 工作区中创建实例，并在可视化 DAG 中查看每次运行。

固定适配 `@deepseek-ai/dsh@0.2.0-rc.1`。目前从本仓库安装，尚未发布为软件包。

> `npm install -g @deepseek-ai/dsh@0.2.0-rc.1 --registry=https://registry.npmjs.org`

## 功能

- 从本机 DSH 用户目录加载工作流模板，并附带三个示例模板。
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
dsh plugin --profile web add ./packages/dsh-workflow-studio
dsh web
```

本插件不内置 DSH。

## 创建工作流

1. 在 `<DSH 用户目录>/dsh-workflow-studio/templates/<template-id>/` 下添加 `workflow.yaml`。默认 DSH 用户目录是 `~/.dsh`。
2. 从 DSH 侧边栏打开 **工作流**，在 **实例管理** 中选择工作区和模板，创建实例。
3. 打开实例，在运行图中执行就绪节点。`session_agent` 节点需用户明确标记完成；`bash` 命令成功后自动完成；`form` 节点在有效提交后完成。

最小模板，保存为 `~/.dsh/dsh-workflow-studio/templates/hello/workflow.yaml`：

```yaml
id: hello
type: dag
dag:
  - id: draft
    type: node
    node_kind: session_agent
    prompt: 写一段简短的初稿。
```

模板目前通过文件管理，插件界面暂不支持编辑。插件启动时会将附带的示例复制到模板目录。

## 当前限制

`session_agent` 和 `bash` 会执行真实任务，但其声明的 DAG 输出目前仍为占位值。对话文本和命令输出不会传给下游节点，也不会驱动 `if` / `for` 表达式；`form` 的有效提交则会将真实结果交给 DAG。依赖数据分支前请阅读 [DAG 语法文档](docs/dag-syntax.zh.md)。

原 `chat` 类型已更名为 `session_agent`。自定义模板需更新 `node_kind`；保留旧模板快照的已有实例需重新创建。

## 开发

```sh
npm run check
```

该命令执行类型检查、构建和测试。产品规格见 [`docs/specs/`](docs/specs/)，仓库约定见 [`AGENTS.md`](AGENTS.md)。

```sh
dsh plugin --profile web remove dsh-workflow-studio
```
