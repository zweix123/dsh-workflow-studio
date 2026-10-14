# 排布配置提示验收

日期：2026-10-14。被测范围：`LayoutNotices` 移除有效排布的 INFO，保留无效配置的 WARN、中英文文案和详情交互；排布算法与执行规则未修改。

依据：[模板作者可配置的实例运行图排布](../specs/template-layout.zh.md)、[DAG 语法文档](../dag-syntax.zh.md#34-实例运行图排布-layout)。

## 环境与方法

- macOS arm64；Node v26.7.0、npm 11.19.0、pnpm 11.25.0；用户已安装 dsh 0.2.0-rc.1。
- Chromium、隔离 `DSH_HOME` 与工作区，默认 bundle 加开发模板或已有模板诊断夹具；无模型调用。结束后夹具停止宿主并清理临时环境。
- [组件回归](../../packages/dsh-workflow-studio/tests/layout-notices.test.tsx)覆盖有效与无效层混合时只显示 WARN、有效配置无提示及中英文展开／收起。
- [真实宿主用例](../../e2e/workflows/layout-notices.e2e.ts)通过页面访问模板列表、模板详情、创建对话框及实例详情，并检查实际节点位置；覆盖中文默认主题与英文深色、390 × 844 窄屏和键盘详情操作。

## 结果

| 场景 | 预期 | 实际与状态 |
| --- | --- | --- |
| 有效排布的四个页面 | 不显示 INFO、成功提示或空提示容器 | 通过；开发 Bash 模板静默生效 |
| 模板预览与实例纵向排布 | 去除 INFO 后仍按依赖顺序纵向排列 | 通过；五张卡片横坐标相同、纵坐标依次增加 |
| 无效配置的四个页面 | 保留 WARN 数量、原因、修正建议，不阻止打开与创建 | 通过；`direction: diagonal` 仍可打开模板并创建实例，警告保留 |
| WARN 详情与语言主题窄屏 | 可键盘展开／收起，英文深色窄屏仍可操作 | 通过；Enter 操作与英文详情按钮均通过 |
| 既有排布回归 | 串行链依赖边、位置稳定及语言主题窄屏无回归 | 通过；既有串行链 E2E 通过 |
| 既有开发 Bash 链路 | 手动、自动执行与真实输入交付，重启不重跑 | 通过；既有开发 Bash E2E 通过 |

类型检查与构建通过；全部 176 条自动化测试通过。首次 `npm run check` 的 HTTP 测试因沙箱禁止监听本地端口而失败（`listen EPERM`）；允许本地测试运行后，`npm test` 全量通过。

新增真实宿主 E2E 2 条通过（报告 `01a13a3f-295a-76e0-ad49-7da4855e50df`），受影响的既有 E2E 2 条通过（报告 `01a13a3f-c525-7759-8fc4-24518754b28e`）。结果报告、摘要和脱敏宿主日志保存在忽略提交的 `.e2e/`；长期复现依据为上述随仓库保存的用例与夹具。

复现命令：

```sh
npm run check
npm run test:e2e -- e2e/workflows/layout-notices.e2e.ts
npm run test:e2e -- e2e/workflows/serial-chain-layout.e2e.ts e2e/workflows/dev-templates.e2e.ts --grep '串行链模板|开发 Bash 的真实手动'
```

本次提示调整无剩余失败或未验证的验收项；无效层回退与多层独立排布沿用既有布局自动化测试，本轮未新增真实宿主几何场景。
