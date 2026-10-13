# OpenSpec 需求交付工作流

内置中文模板，模板 ID 为 `openspec-delivery.zh`，由默认 bundle 与 mattpocock 中文模板一起装配，使用已有 form 和 session_agent 节点。

流程：**需求表单 → AI 起名 → 名称结果表单 → propose → apply → archive**。

入口表单提供 `request`；起名会话推荐名称，用户在结果表单提交 `change_name`。两个字段直接传给 propose、apply、archive，不依赖会话节点透传。propose 同时收到名称和完整原始需求，有实质歧义时会在自己的会话询问并等待答案。澄清结论进入规划文档，后续独立会话从实际 OpenSpec 产物恢复上下文。

session_agent 不提取 AI 回复，所有会话节点仅在用户手动标记完成后提交 `{}`。因此名称需要人工填写。propose、apply、archive 均手动启动：完成当前阶段并核对实际结果后，在工坊标记完成，再启动下一阶段。没有另加提案审批或归档确认表单；archive 技能自身要求的同步选择和未完成项确认仍在归档会话处理。

起名只读，不创建 change。名称进入 DAG 后保持固定；如 propose 中决定另起名称，应重新创建实例并填写新名称，后续阶段不会自动改用其他 change。技能缺失、未初始化的项目、阻塞、失败和取消须在对应会话处理，不能仅靠手动完成按钮证明业务成功。

## 本地加载

用户自行安装 dsh `0.2.0-rc.1` 与 OpenSpec CLI，并在目标项目提供 `openspec-propose`、`openspec-apply-change`、`openspec-archive-change` 技能。归档需要同步时还需 `openspec-sync-specs`。模板不新增依赖，使用仓库构建的默认插件。

在仓库根构建插件；同一 profile 尚未装配默认 bundle 时添加：

```sh
npm run build
dsh plugin --profile web add /绝对路径/dsh-workflow-studio/packages/dsh-workflow-bundle
```

在工坊选择“OpenSpec 需求交付工作流”，以实际目标项目为工作区创建实例。提交需求，执行起名会话，再填写名称结果表单。后续按上述顺序执行会话。CLI 安装、项目初始化与 store 选择沿用 OpenSpec 技能的规则，不由模板自动安装或初始化。

已安装默认 bundle 的用户在更新构建后重载默认 bundle 或重启宿主，即可加载新增模板，无须单独添加模板包。修改 YAML 后须重载对应模板声明，新实例才采用新定义；已有实例仍使用创建时的快照。完整契约见[模板作者指南](./template-plugin-authoring.zh.md)。

## 验证范围

`packages/dsh-workflow-studio/tests/template-plugins.test.ts` 覆盖真实模板加载器与节点登记校验、空根输入的 DAG 编译、阶段顺序，以及名称和原始需求到达后三个会话的提示词。测试模拟用户完成会话，不执行真实模型或 OpenSpec 操作；它不代表实际 propose、apply、archive 业务已跑通。
