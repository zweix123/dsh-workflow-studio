# 纯配置模板 bundle

先构建并在同一 web profile 添加默认 `packages/dsh-workflow-bundle`，然后执行：

```sh
dsh plugin --profile web add /绝对路径/dsh-workflow-studio/examples/review-templates
```

单模板定义位于包根目录的 `workflow.yaml`，补丁的 `directory` 直接填写包名 `@acme/workflows`。打开工坊：名称为“团队代码审查”，ID 为 `acme-review`，来源为包名；包名与模板 ID 无须相同。选择一个 Git 工作区创建实例后，可手动执行 bash 查看差异摘要。无需注册代码或第二份 node_kind 清单。

完整契约见[模板作者指南](../../docs/template-plugin-authoring.zh.md)。本例只贡献模板，通过 `peerDependencies` 声明模板加载器和 bash 节点的版本，消费默认 bundle 已装配的能力，不重复启用节点。同时贡献自定义节点和模板的示例见 [echo-node](../echo-node/README.zh.md)。
