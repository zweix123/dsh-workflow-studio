# 最小第三方节点

`@example/workflow-echo` 是纯服务端的普通本地 dsh bundle。它同时提供节点和模板，只使用公开节点契约，不导入 Studio 私有代码，没有浏览器入口也能显示默认主要操作。`example_echo` 将配置 message 作为声明输出交给下游 form。

在仓库构建完成、dsh `0.2.0-rc.1` 已由用户安装的环境中：

```sh
dsh plugin --profile web add ./packages/dsh-workflow-bundle
dsh plugin --profile web add ./examples/echo-node
```

启动对应 profile 后，工坊自动显示 Echo example 模板，可直接创建实例并点击 Echo 将结果交给下游 form。补丁通过 `dsh-workflow-template` 加载 manifest 暴露的 YAML 资源，不需要复制到 DSH_HOME。节点与模板声明可独立撤销；只撤销模板不影响已有实例快照，撤销节点会暂停已有实例的新业务。

接口和生命周期见 [节点作者指南](../../docs/node-plugin-authoring.zh.md)。修改本地 JS 示例不需要单独构建；生产节点的依赖版本与宿主对齐，保留 manifest 的包名与插件 name 一致。
