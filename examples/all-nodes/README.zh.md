# 全节点类型示例

包含当前内置的 `form`、`bash`、`agent` 三种业务节点；Agent 分别展示 `foreground` 和 `background` 两种模式。另含根 DAG 与嵌套 DAG，方便对照节点和组的详情。模板是独立纯配置包，未加入默认模板列表。

流程：填写需求 → 命令处理 → 台前讨论 → 台后整理组（内部：台后整理）。根 DAG 的最终输出为 `report`。

## 添加到工坊

已通过本地目录添加默认 bundle 的 dsh web profile，可以再添加此模板：

```sh
dsh plugin --profile web add /绝对路径/dsh-workflow-studio/examples/all-nodes --registry=https://registry.npmjs.org
```

在工坊“模板管理”中打开“全节点类型示例”，或选择该模板创建实例。固定使用本机 dsh `0.2.0-rc.1`；Bash 命令使用 dsh 环境已有的 Node.js，Agent 运行使用宿主已配置的模型。

## 操作与预期

1. **填写需求**：填写或保留默认内容，点击“提交表单”；已提交结果只读。
2. **命令处理**：点击“执行”；标准输出是 JSON，`prepared_request` 保留需求原文，包括引号和换行。
3. **台前讨论**：点击“执行”，再“打开对话”；可以持续交流。生成结束并确认方案后返回实例，点击“完成”，交付 `summary`。
4. **台后整理**：查看嵌套 DAG 内部节点，点击“执行”；在节点详情查看尝试记录和待确认结果，点击“完成”交付 `report`。
5. **台后整理组与根 DAG**：查看输入输出，最终报告经组交付到根 DAG。

模板详情只显示定义。实例详情将运行概况、输入与输出、节点操作与进展分块展示；等待位置省略尚不存在的运行数据和业务面板，DAG 不展示节点业务面板。所有 Agent/Bash 节点均手动启动，方便逐个观察状态与详情。

模板配置、加载、真实 Bash 输出和 DAG 数据链由 `packages/dsh-workflow-studio/tests/template-plugins.test.ts` 验证；该测试用确定的结果推进 Agent 节点。`npm run test:e2e -- e2e/workflows/all-nodes-template.e2e.ts` 在隔离真实宿主中验证模板浏览、实例创建、表单提交和 Bash 交付，不调用模型。实际范围见[验收记录](../../docs/acceptance/template-plugin-distribution.zh.md#2026-10-13-全节点类型示例)。
