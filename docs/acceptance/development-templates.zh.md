# 开发模板装配与独立示例清理验收

日期：2026-10-14。依据：[开发模板规格](../specs/development-templates.zh.md)、[模板插件分发](../specs/template-plugin-distribution.zh.md)。被测范围：独立开发模板包、开发安装/启动入口、三个 examples 包删除后的文档与测试迁移；默认业务模板装配内容不变。

## 环境与结论

本机已有 dsh `0.2.0-rc.1`、Node `26.7.0`、npm `11.19.0`、pnpm `11.25.0`。浏览器验收使用 `e2e/dsh.ts`，每条 case 新建临时 DSH_HOME 和工作区，中文 Chromium、1440×900；无真实模型调用、不读取或复制日常模型凭据。开发入口另外验证项目自己的 `.local/dsh-dev/`，与日常 profile 隔离。

最终类型检查、构建及 175 项自动化测试通过；开发模板 4 条与受影响回归 5 条真实宿主浏览器用例通过。Agent 模板配置、输入提示词引用和嵌套结果链已验证；真实模型完成整条 Agent 体验尚未验证，不能将本轮写成模型任务通过。

## 场景结果

| 场景 | 预期与实际 | 方式及状态 |
| --- | --- | --- |
| 默认/开发装配分开 | 默认 bundle 不依赖或声明开发包，浏览器默认列表无开发模板；附加包的四份模板可用，来源准确，未重复装配节点 | 自动化及真实宿主通过 |
| 开发入口 | 在项目隔离 home 添加默认和开发包成功；重复装配可用，启动参数覆盖到另一个临时端口，宿主正常就绪 | 真实 CLI/启动通过；本轮进程已停止 |
| Form 功能 | 对象、任务数组、枚举名称、多选操作正常，提交值准确；下游采用真实输入，不覆盖 0/false；删除所有任务保留空数组；重启后输出只读 | 真实宿主浏览器通过 |
| Bash 数据链 | 中文、两种引号、换行、变量与命令替换样式原样保留；从模板包读取脚本，手动/自动节点交付一致；无输出命令仅提供日志，已成功状态重启后保留 | 自动化及真实宿主浏览器通过 |
| Bash 重试专题 | 首次非零退出、第二次类型错误不推进，第三次有效输出进入下游表单；实际计数 3，重启后保持 3，不重跑 | 真实宿主浏览器通过 |
| Agent 主模板 | 台前手动与台后自动配置、嵌套 DAG 定义可读；创建实例时台后组等待且无业务面板；确定结果验证 request/summary/report 引用和根返回 | 自动化及真实宿主浏览器通过；真实模型未验证 |
| 默认模板及既有执行 | 两份默认业务模板浏览、创建和重启可用；既有结构化表单、Bash 自动/手动重试、输出校验、中断和重启回归保持 | 真实宿主浏览器通过，5/5 |
| 第三方接入覆盖 | 既有 joint-bundle 自行提供自定义 kind，保留模板撤销、节点撤销/恢复、快照联动及事实兼容性测试；删除重复 Echo 教学测试 | 自动化通过；本轮未另跑第三方浏览器场景 |
| 示例与引用清理 | review-templates、all-nodes、echo-node 删除；作者指南引用正式实现；诊断夹具自行提供原始和冲突模板；旧实际验收标明历史适用范围 | 静态检查通过 |

## 首轮失败及修复范围

开发模板首轮浏览器 3/4 通过。Bash 主模板采用默认横向长链时，最后一个节点的执行按钮在打开详情后被抽屉遮挡，点击超时。该版本未通过；将本模板改为已有 `layout: { direction: vertical }` 后重跑整份开发用例，4/4 通过。不修改点击断言、不加固定等待，也不以该模板修复宣称通用画布遮挡问题已解决。

首次受限沙箱中的 HTTP 自动化报 `listen EPERM`；放开测试所需本机监听权限后，最终 `npm run check` 175/175 通过。类型检查或此前部分通过不替代最终完整结果。

## 可复现证据

```sh
npm run check
npm run test:e2e -- e2e/workflows/dev-templates.e2e.ts
npm run test:e2e -- e2e/workflows/templates.e2e.ts e2e/form-handoff.e2e.ts e2e/workflows/bash.e2e.ts
```

长期证据为[开发包及操作预期](../../packages/dsh-workflow-dev-templates/README.zh.md)、[浏览器用例](../../e2e/workflows/dev-templates.e2e.ts)、[模板集成测试](../../packages/dsh-workflow-studio/tests/template-plugins.test.ts)及上述既有用例。旧全节点测试中的特殊输入、真实命令与嵌套 Agent 结果断言拆入开发模板测试；浏览器的静态模式/分组检查及运行数据断言分别迁入对应 case。

完整本地报告保留在忽略提交的 `.e2e/development-templates/`、`.e2e/development-regression/`；首轮报告在 `.e2e/development-templates-initial/`，检查日志在 `.e2e/development-check.log`，安装日志在 `.e2e/development-install.log`。宿主日志在 `.e2e/logs/`，临时登录 token 脱敏。上述本地目录为辅助证据，复现不依赖它们。

所有 E2E 临时宿主和工作区由夹具清理；开发启动检查的进程已停止，项目隔离开发 home 保留供 `npm run dev` 使用。无需模型的场景已完成，真实模型体验须在自行配置模型的开发宿主另行验证；故障注入仍归独立测试夹具。

## 旧安装迁移补验

用户启动已有 web profile 时发现 `@example/workflow-all-nodes` 无法解析：该 profile 的依赖仍链接到已经删除的示例目录。检查确认只安装过这一个旧示例；通过原 home 执行 `dsh plugin --profile web remove @example/workflow-all-nodes` 成功，随后确认 manifest 中已无该示例引用。此项验证为实际插件撤销和登记检查，未另行重启用户日常宿主，不替代上述隔离浏览器验收。README 已补充按实际安装情况撤销旧示例的说明，不通过重新安装已删除包修复。
