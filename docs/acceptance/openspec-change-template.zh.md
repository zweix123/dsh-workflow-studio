# OpenSpec 四阶段模板验收

日期：2026-10-13。依据：[模板规格](../specs/openspec-change-template.zh.md)。被测范围：`packages/dsh-workflow-template-openspec-change/workflow.yaml` 的四阶段改版、方案节点结构化名称交付及相关测试；未修改 Agent 节点运行机制。

## 环境与证据

- dsh `0.2.0-rc.1`，Node `26.7.0`，npm `11.19.0`，pnpm `11.25.0`，无界面 Chromium。
- 复用 `e2e/dsh.ts`，每条 case 使用隔离临时 home、工作区及本机随机端口，完成后停止并清理；重启验证沿用该 case 的存储。
- [OpenSpec 浏览器用例](../../e2e/workflows/openspec-change.e2e.ts)加载默认 bundle 中的实际模板，使用[确定性模型夹具](../../e2e/fixtures/agent-host/README.md)返回模拟方案名称。真实宿主负责会话、fork、structured_output、持久化与页面操作；不读取日常模型凭据。
- 可复现测试与夹具随仓库保留。新增用例的报告和摘要保存在忽略提交的 `.e2e/openspec-delivery-results/`，宿主脱敏日志在 `.e2e/logs/`；后续回归报告默认在 `.e2e/report.json` 和 `.e2e/summary.md`。

## 验证结果

| 场景 | 预期与实际 | 状态 |
| --- | --- | --- |
| 加载、节点契约与 DAG 顺序 | 实际模板可加载和创建；只有四个中文节点。需求完整到达方案，方案名称直接到达实施与归档；模拟完成各节点后 DAG 完成 | 通过 |
| 需求入口 | 浏览器提交含中文、引号、换行和标记的需求；方案节点收到原值，无起名会话和名称确认表单 | 通过 |
| 方案交付 | 方案会话回复后实施仍等待；点击完成后原生 fork 继承已完成回复，以 structured_output 交付准确的 change_name，并保留子记录入口 | 通过 |
| 手动推进与名称来源 | 实施仅在方案交付后就绪，归档等待实施完成；两者输入均只有相同 change_name，完成均输出空对象 | 通过 |
| 宿主重启 | 方案交付后实际重启 dsh，方案输出保留，后续节点仍使用同一名称，且不会自动启动 | 通过 |
| 完整检查 | `npm run check` 的类型检查、构建及全部 163 项测试通过 | 通过 |
| 既有浏览器回归 | 默认模板加载 1 条及 Agent 交付 6 条通过，覆盖结构化输出、失败补充重试、手动确认、重启、主题语言窄屏和双工作区 | 通过 |
| 实际 OpenSpec 技能业务 | 未运行真实模型的 propose、apply、archive，也未检查真实规划、代码、规格同步与归档产物质量 | 未验证 |

## 复现

```sh
npm run test:e2e -- e2e/workflows/openspec-change.e2e.ts
npm run check
npm run test:e2e -- e2e/workflows/templates.e2e.ts e2e/workflows/agent-handoff.e2e.ts
```

新增浏览器用例 1/1 通过，受影响的既有浏览器回归 7/7 通过，模板定向集成测试 1/1 通过；完整检查 163/163 通过。确定性模型结果只能证明结构化交接和流程推进，不能将其写作真实 OpenSpec 变更整体验收通过。

## 2026-10-15 模板改名复验

依据：[模板规格](../specs/openspec-change-template.zh.md)、[模板分发规格](../specs/template-plugin-distribution.zh.md#模板身份与展示名称)。被测范围：模板目录、npm 包、默认 bundle 依赖与加载地址、中文展示名称及对应引用。目录改为 `packages/dsh-workflow-template-openspec-change/`，包名为 `@dsh-workflow/template-openspec-change`，展示名为“OpenSpec 变更工作流”；模板 ID 和加载器 ID 分别统一为 `openspec-change.zh`、`workflow-template-openspec-change.zh`，测试与规格文件名同步统一；模板登记增加 ID 格式校验。

环境为已安装的 dsh `0.2.0-rc.1`、Node `26.7.0`、npm `11.19.0`、pnpm `11.25.0` 和无界面 Chromium。复用隔离宿主夹具，每条用例独立准备环境并验证真实宿主重启。

| 场景 | 预期与实际 | 状态 |
| --- | --- | --- |
| 包资源和默认装配 | 新包地址正确解析 YAML，默认 bundle 与模板自身声明一致；新模板 ID 可创建实例，实例采用新展示名 | 17 项模板专项测试通过 |
| ID 格式边界 | 由小写英文字母或数字组成，单个 `-` 或 `.` 分隔的 ID 能查询并创建实例；拒绝大写、中文、下划线、路径、首尾与连续分隔符、空白及换行，不自动修正，其他有效模板不受影响；中文嵌套 DAG ID 保持可用 | 自动化通过 |
| 浏览器模板管理与实例创建 | 显示“OpenSpec 变更工作流”及新包来源，可浏览并创建实例，重启后仍可用 | 浏览器通过 |
| 四阶段流程与新 ID | 使用 `openspec-change.zh` 创建实例，方案交付后真实重启，实施与归档沿用相同 change 名称并由用户手动推进完成 | 浏览器通过 |
| 开发模板附加 | 新名称可见，按需附加开发模板后原模板和开发模板仍可用，重启恢复正常 | 浏览器通过 |
| 静态检查、构建与完整自动化 | 类型检查（含 E2E）、构建及完整 177 项测试通过 | 通过 |

复现浏览器用例：

```sh
npm run test:e2e -- e2e/workflows/openspec-change.e2e.ts
npm run test:e2e -- e2e/workflows/templates.e2e.ts e2e/workflows/dev-templates.e2e.ts --grep '默认装配|开发模板按需附加'
```

OpenSpec 四阶段用例 1/1 及受影响的模板装配回归 2/2 全部通过。四阶段报告保存在忽略提交的 `.e2e/openspec-change-id-results/`，装配回归报告在 `.e2e/report.json`、`.e2e/summary.md`，脱敏宿主日志在 `.e2e/logs/`；长期复现依据为对应测试代码和本记录。本轮验证格式限制、改名、装配和四阶段宿主交接机制，实际 OpenSpec 技能业务仍未验证。
