# Studio 错误色修复验收

日期：2026-10-15。代码范围：基于 `4abefa3` 的 Studio 错误色修复与新增浏览器回归，不包含弹窗、控件或警告色统一。

## 依据与环境

- [UI 审查记录第 1 项](./ui-style-review.zh.md)：无效错误色变量及错误呈现路径。
- [实例管理规格](../specs/instance-tab.zh.md)、[共享定义详情规格](../specs/shared-definition-details.zh.md)、[运行记录规格](../specs/node-run-records.zh.md)。本次只验收相关错误呈现，不代表这些规格的完整验收。
- 用户本机 dsh `0.2.0-rc.1`；Node `v26.7.0`、npm `11.19.0`、pnpm `11.25.0`。
- 复用 `e2e/dsh.ts`：每条 case 创建隔离 home、工作区和真实 Web 宿主，由 Chromium 执行 UI 操作与计算样式断言；结束后清理。无需模型凭据。

## 修复与实际结果

错误呈现统一使用宿主 `--dsw-alias-state-error-primary`。删除确认和运行区顶部错误另修复了被通用按钮／段落规则覆盖的问题。运行信息、记录全文和模板／实例加载错误按明确错误路径着色；普通命令、stdout、stderr、取消按钮及布局警告不采用错误色。

| 自动化场景 | 预期 | 实际与状态 |
| --- | --- | --- |
| 无效模板、空名称、同名实例校验 | 浅深主题均为宿主错误色 | 通过：浅色 `rgb(236, 19, 19)`，深色 `rgb(242, 90, 90)` |
| 删除菜单与确认按钮，取消并保留实例 | 危险操作使用错误色，取消保留普通色 | 两种主题通过；取消后实例仍在 |
| Bash 首次非零退出 | 节点状态文字、状态点背景、运行信息错误、记录摘要与全文一致 | 两种主题通过；错误点不再透明 |
| Form 业务成功但 DAG 交付失败 | 顶部运行错误采用错误色 | 两种主题通过，显示 `MISSING_OUTPUT_FIELD` |
| 普通命令日志与布局警告 | 保留各自原有颜色 | 两种主题通过，未被错误规则整体染红 |

回归代码：[error-colors.e2e.ts](../../e2e/workflows/error-colors.e2e.ts)。运行命令：`npm run test:e2e -- e2e/workflows/error-colors.e2e.ts`，2/2 通过。首次执行发现顶部运行错误仍被次级文字规则覆盖，修复优先级后上述复验通过；首次失败不代表当前结论。

受影响的既有回归：`npm run test:e2e -- e2e/workflows/instances.e2e.ts e2e/workflows/bash.e2e.ts e2e/workflows/run-records.e2e.ts`，3 个文件、8/8 通过，覆盖实例创建／删除／恢复、Bash 失败重试与未知状态、Bash／Agent／Form 运行记录。`npm test` 210/210 通过；`npm run typecheck --workspace=dsh-workflow-studio` 和 `npm run typecheck:e2e` 通过；真实 E2E 入口的构建通过。

模板／实例加载请求失败、模板详情失效和持久化错误的颜色路径已核对源码，本次未单独注入这些故障进行浏览器验证；英文、窄屏和真实模型不属于本次颜色复验范围。

报告与脱敏宿主日志保留在忽略目录 `.e2e/`；新增颜色用例报告副本在 `.e2e/error-colors/`。上表与回归代码为可长期复现的依据，不依赖临时绝对路径或截图。
