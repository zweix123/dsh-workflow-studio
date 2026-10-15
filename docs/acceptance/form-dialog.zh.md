# Form 浮窗验收

- 日期：2026-10-15。
- 代码范围：Form 客户端浮窗及控件，移除 Studio 中遗留表单字段样式；不改变节点服务端或数据契约。
- 依据：[Form 填写浮窗](../specs/form-dialog.zh.md)、[节点操作位](../specs/node-action-positions.zh.md)、[结构化表单](../specs/form-structured-fields.zh.md)、[枚举控件](../specs/form-enum-controls.zh.md)。
- 环境：macOS，Node 26.7.0，npm 11.19.0，pnpm 11.25.0，用户已安装 dsh 0.2.0-rc.1；每条 E2E 使用独立临时 profile 与工作区，无模型调用。

## 结果

| 验证 | 预期与实际 | 结论 |
| --- | --- | --- |
| `forms/dialog.e2e.ts`（1 条） | 1280×900 浅色、390×640 深色下，面板背景/圆角/阴影/字体与设置面板计算值一致；正文滚动后标题与底部位置不变；错误与提交按钮均可见；关闭返回焦点并保留草稿 | 通过 |
| `forms/enums.e2e.ts`（3 条） | 枚举真实类型、名称、多选、重复预填拒绝、空数组、键盘、英文及主题窄屏行为保持有效 | 通过 |
| `form-handoff.e2e.ts`（1 条） | 对象数组、删除中间项、0/false/空容器、下游预填及重启结果恢复有效 | 通过 |
| `workflows/node-actions.e2e.ts`（4 条） | 第三方节点动作回归；Form 校验、关闭、草稿隔离、成功自动关闭、已接受结果交付失败只读重试、中英文主题窄屏有效 | 通过 |
| `workflows/dev-templates.e2e.ts`（4 条） | 开发模板的表单填写、枚举、多选、数组及预填与关联链路保持有效 | 通过 |
| 自动化检查 | `npm run typecheck`、`npm run build`、`npm test`（176 条） | 通过 |
| 内置浏览器人工观察 | 对照真实设置浮窗；浅深主题下字段层次、输入、开关与按钮一致；390×640 英文深色下标题、关闭与提交完整可见，正文可滚动 | 通过 |

可重复验证：

```sh
npm run test:e2e -- e2e/forms/dialog.e2e.ts
npm run test:e2e -- e2e/forms/enums.e2e.ts e2e/form-handoff.e2e.ts e2e/workflows/node-actions.e2e.ts e2e/workflows/dev-templates.e2e.ts
```

布局专项报告保存于 `.e2e/form-dialog-layout/`，关联回归报告位于 `.e2e/report.json`、`.e2e/summary.md`，脱敏宿主日志在 `.e2e/logs/`。这些是本地辅助证据；长期复现以已提交的用例和夹具为准。人工观察截图保留在本地 `.e2e/form-dialog-light.jpg`、`.e2e/form-dialog-dark.jpg`、`.e2e/form-dialog-dark-narrow.jpg`。

## 边界与剩余事项

本轮只验收 Form UI，未调用真实模型，未验证其他浏览器内核或移动设备软键盘。无已知未通过项。初次沙箱执行服务测试被本地端口权限限制，获准后完整重跑通过；不将该环境限制记作产品故障。临时 profile 和工作区在结束时清理，未改动用户日常 dsh 配置。
