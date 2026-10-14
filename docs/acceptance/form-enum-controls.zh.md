# form 枚举名称与多选验收

日期：2026-10-14。依据：[枚举名称与多选规格](../specs/form-enum-controls.zh.md)、[结构化表单规格](../specs/form-structured-fields.zh.md)及 [DAG 表单语法](../dag-syntax.zh.md#32-表单节点)。

被测范围：基于 `48624ce` 的本轮本地改动，涉及 form 插件 `src/fields.ts`、`src/client.tsx` 的枚举名称与唯一数组多选实现，以及随功能保存的 HTTP 集成用例、浏览器用例和独立模板夹具。未新增依赖，不改变公共节点契约、DAG 或存储格式。

## 环境与方法

- macOS，本机 Node v26.7.0、npm 11.19.0、pnpm 11.25.0，用户已安装 dsh 0.2.0-rc.1。
- 每条 E2E 使用新的隔离 DSH_HOME 和工作区，通过公共 npm 源登记本地 bundle 与测试模板，运行真实宿主与 Chromium；不访问日常 profile 或模型凭据。
- 默认无界面，不录屏、不主动截图；失败诊断由框架保存。用例固定操作与断言，不依赖模型。
- 新增浏览器运行：`npm run test:e2e -- e2e/forms/enums.e2e.ts`，3/3 通过（运行标识 `01a13881-9021-7584-a7e6-127ecdfda947`）。报告和脱敏日志保存在忽略提交的 `.e2e/`；以下结果与仓库中的用例、夹具构成长久复现依据。
- 受影响的既有回归：`npm run test:e2e -- e2e/form-handoff.e2e.ts e2e/workflows/node-actions.e2e.ts`，5/5 通过（运行标识 `01a13882-e250-73eb-a8be-2fbd645058f0`），覆盖原有结构化交付、浮窗生命周期、草稿隔离、交付失败只读重试与重启。
- 完整检查：`npm run check` 通过，包含类型检查（含 E2E）、构建与 174/174 条自动化测试；新增两条 HTTP 集成用例也包含在其中。

## 场景与实际结果

| 场景 | 预期与实际 | 结论 |
| --- | --- | --- |
| 标量名称数组、数字／布尔名称映射、对象字段部分覆盖 | 显示中文名称，未覆盖选项显示原值；提交为 high、数字 1、布尔 true 和 ready，无显示名称混入 | 通过，真实宿主 |
| 复选框组添加、取消与重选，关闭后重开 | 默认 frontend 被明确取消，最终 tags 为 [backend, test]；重开保留选择，不重新补默认 | 通过，真实宿主 |
| 自动多选 select 与数字类型 | 键盘选择后 levels 为 [0, 1]；下游预填保持选择，未转换为字符串 | 通过，真实宿主 |
| 布尔多选、空数组与普通枚举数组 | flags 为 [false, true]，empty 为 []；普通 repeat 仍可增删且接受 [a, a] | 通过，真实宿主 |
| 下游交付、只读与真实重启 | review 输入和提交保持完整真实数据；完成后无填写入口，停止并重启 dsh 后结果一致，详情无编辑控件 | 通过，真实宿主 |
| 主题、语言、窄屏与清空 | 深浅主题下可操作；英文界面、390×844 窄屏无表单横向溢出；取消全部选择提交 tags／levels／flags 为 []，其他字段的 0 和 false 保留 | 通过，真实宿主 |
| 重复上游预填 | [a, a] 不静默去重；提交错误定位 form.tags[1] 并包含 uniqueItems，重开仍拒绝；取消重选后提交 [a] | 通过，真实宿主 |
| 服务端边界 | 名称冒充值、错误类型、非法选项、重复字符串／数字／布尔、键顺序不同的重复对象与嵌套重复值均返回 422，不完成节点、不创建下游；合法值准确交付并可恢复 | 通过，HTTP 集成 |
| 无效模板配置 | 名称类型错误、未知映射键、过长名称数组、无枚举名称、非法数组控件、非布尔 uniqueItems 与重复默认值均判定不可用 | 通过，HTTP 集成 |

## 当前结论与剩余项

本次范围内验收通过：完整检查、3 条新增真实宿主 E2E 与 5 条受影响的既有浏览器回归均通过，无本次范围内的剩余阻塞项。初次浏览器运行对未展开的原生下拉选项使用可见性断言而失败，改为检查选项文字并执行实际选择后，完整用例通过；该失败属于测试断言，不是产品故障。

当前支持 ui:enumNames 与唯一枚举数组 select／checkboxes；oneOf／const、远程选项、联动、排序、完整 JSON Schema／RJSF 均不在本次范围。不涉及真实模型执行或分发发布。

## 可复现证据

- [新增浏览器用例](../../e2e/forms/enums.e2e.ts)：三个 test 独立准备环境，保留具体操作、预期值和恢复断言。
- [枚举正常链路模板](../../e2e/fixtures/core-regression/templates/form-enums/workflow.yaml)与[重复预填模板](../../e2e/fixtures/core-regression/templates/form-enum-duplicates/workflow.yaml)。
- [HTTP 集成测试](../../packages/dsh-workflow-studio/tests/workflow-instances.test.ts)：名称包含 `form enum labels` 与 `form rejects malformed` 的两条 test。
