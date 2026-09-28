# dsh-workflow-studio

本仓库开发适配 `@deepseek-ai/dsh@0.2.0-rc.1` 的工作流工坊插件。用户只需在已安装的 dsh 中添加 `packages/dsh-workflow-studio`；chat、bash、form 节点包均打入这个插件，不单独安装。

```sh
npm ci --registry=https://registry.npmjs.org
npm run check
dsh plugin --profile web add ./packages/dsh-workflow-studio
dsh web
```

在宿主的工作流工坊中选择工作区和模板创建实例。模板放在 dsh 用户目录的 `dsh-workflow-studio/templates/<template-id>/workflow.yaml`。节点配置、form 支持范围及真实输出与占位输出的区别见 [DAG 语法文档](docs/dag-syntax.zh.md)。
