# 纯配置模板 bundle

先构建并在同一 web profile 添加默认 `packages/dsh-workflow-bundle`，然后执行：

```sh
dsh plugin --profile web add /绝对路径/dsh-workflow-studio/examples/review-templates
```

打开工坊：名称为“团队代码审查”，ID 为 `acme-review`，目录 `review` 只定位资源。选择一个 Git 工作区创建实例后，可手动执行 bash 查看差异摘要。无需注册代码或第二份 node_kind 清单。

完整契约见[模板作者指南](../../docs/template-plugin-authoring.zh.md)。本例只贡献模板，消费默认 bundle 已提供的 bash 节点；同时贡献自定义节点的联合 bundle 留给第三阶段。
