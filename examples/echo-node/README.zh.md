# 最小第三方节点

`@example/workflow-echo` 是纯服务端的普通本地 dsh bundle。它只使用公开节点契约，不导入 Studio 私有代码，没有浏览器入口也能显示默认主要操作。`example_echo` 将配置 message 作为声明输出交给下游 form。

在仓库构建完成、dsh `0.2.0-rc.1` 已由用户安装的环境中：

```sh
dsh plugin --profile web add ./packages/dsh-workflow-bundle
dsh plugin --profile web add ./examples/echo-node
```

将本目录的 `workflow.yaml` 放入当前 DSH_HOME 的 `dsh-workflow-studio/templates/example-echo/`，启动对应 profile，在工坊创建并执行示例。此文件当前用于验证节点接入；本包尚未声明自动分发模板，第二阶段使用通用模板登记替代手工复制。

接口和生命周期见 [节点作者指南](../../docs/node-plugin-authoring.zh.md)。修改本地 JS 示例不需要单独构建；生产节点的依赖版本与宿主对齐，保留 manifest 的包名与插件 name 一致。
