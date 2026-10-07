# 结构化 form 宿主验收模板

通过已有 `dsh-workflow-template` 插件登记三份模板；不是内置模板，不提供测试专用接口。

- `structured`：对象列表、标量枚举、整体与子字段默认值、对象中的数组、数组中的数组、同名预填与下游输入。
- `prefill`：bash 输出中的未声明数据沿既有 DAG 规则透传，form 不声明输入字段以接收这些既有扩展数据；验证部分对象、错误类型和递归过滤。不扩展 DAG 的输出或字段语义；form 最终提交仍严格要求声明的输出结构。
- `retry`：条件关闭使根 DAG 缺失 `result`，故意造成交付失败，用于验证已接受结果只读、重交及宿主重启恢复。

在隔离 `DSH_HOME` 注册默认 bundle 后，使用同一 home 登记本目录：

```sh
DSH_HOME="$E2E_DSH_HOME" dsh plugin --profile web add "$E2E_REPO/packages/dsh-workflow-studio/tests/fixtures/form-structured" --registry=https://registry.npmjs.org
```

实际步骤、结果与限制见[验收记录](../../../../../docs/acceptance/form-structured-fields.zh.md)。
