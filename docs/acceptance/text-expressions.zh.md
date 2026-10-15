# 文本插值与表达式求值验收

日期：2026-10-15。依据[文本与表达式规格](../specs/text-expressions.zh.md)及 [ADR 0008](../adrs/0008-library-expressions-and-runtime-contracts.md)。被测范围为基线 `33c2f51734d661723f871b8cb56e63ad9d61bc33` 上的本次工作区实现，覆盖公共 node 包表达式/文本入口、DAG 编译运行、Agent/Bash 调用、模板及文档迁移；验证时使用未提交工作区，未发布。

## 环境与结论

macOS，Node 26.7.0、npm 11.19.0、pnpm 11.25.0、本机已有 dsh 0.2.0-rc.1、Nunjucks 3.2.4。真实浏览器使用 Chromium 的 chromium-zh 目标、隔离 DSH_HOME/profile/工作区，无界面操作和断言；测试结束清理本轮宿主与临时数据。

- `npm run check`：通过，类型检查、构建及 193/193 条测试成功；DAG 测试直接调用独立 ESM 构建产物，Agent/Bash 使用真实共享 Nunjucks，Shell 参数测试实际执行 `/bin/bash`。
- 新增表达式 E2E 首次执行 1/1 通过；受影响的六文件回归及最终静态作用域修复后的复验均为 18/18 通过。六文件末轮用时约 3 分 31 秒；动态 for 容器收尾修复后，直接受影响的 DAG/表达式用例在最终产物上再次 4/4 通过（约 40 秒）。
- Standards 与 Spec 两轴审查完成。修复了分支别名合流、宏作用域及默认参数、声明执行顺序、计算数组来源路径及动态 for 容器消费等发现，复核无剩余可行动问题。

首次沙箱运行的 npm 下载与 HTTP 测试分别受 connect EPERM、listen EPERM 阻止；获准使用相应网络/本机端口后实际运行成功，不作为产品失败。没有安装或升级 dsh CLI。

## 规格场景覆盖

| 规格场景 | 验证与实际结果 |
| --- | --- |
| 边与节点使用相同属性语法，各自读取上下文 | DAG、节点及实例接口测试通过；宿主用例从 source.review 计算边，再从逐项 title 生成命令参数 |
| 比较、逻辑、算术、filter、test、局部变量 | 独立 DAG 及节点接口通过；验证库 `==` 与 `===`、range、set、宏前向调用、参数默认值与条件分支不确定性 |
| boolean、字符串 false、缺失值及默认值 | false 关闭；计算结果字符串/缺失拒绝；存在性、默认值和短路按库执行；初始化错误与提交回滚通过 |
| 空数组、非对象项、非法/重复 key | 自动化通过；特殊 key（空格、斜杠、中文等）保留，空数组的真实宿主回归通过 |
| 可确定的静态引用、类型和声明冲突 | 未执行分支、括号固定路径、逐项声明、已知来源冲突拒绝；后续同名 set/macro 不能掩盖前面的非法业务读取 |
| 动态访问和计算数组 | 实际类型、身份和合并冲突测试通过；已知部分继续静态检查，未知部分不新增输入必填约束；最终数组/逐项在拆解前检查容器，拒绝 getter/Proxy/Date/继承 key 且不调用 getter/trap；计算结果错误不伪造上游路径 |
| Agent 条件、文本循环、raw、注释 | 通过实际节点 action/run 观察提示词；宏及 Block 名称正确区分；数据不二次解释 |
| 对象、数组、dump 与原样字符 | 默认对象/数组输出、显式 JSON、缺失、0、false、含模板标记数据及 `<`/`&` 通过；宿主验证 upper/dump 原样交付 |
| Bash 独立数据参数与禁止位置 | 实际 Shell 验证空白、换行、引号、元字符、字符串/属性名中的 `}}`；命令名、拼接、引号、注释、替换、heredoc 及控制结构拒绝 |
| 跳过、关闭 if、求值错误 | 原 DAG 回归及新结果契约通过；关闭边不求值 for，异常保留字段/原因，提交不发布部分结果 |
| 已保存随机边决策的普通恢复 | 用固定的测试随机边界验证保存的分支、展开身份及输入不重新抽样；未增加产品随机种子或结果缓存 |
| 回滚重提、未提交的恢复重提、新业务尝试 | DAG 回滚后抽样次数改变；实例存储写故障重启后尚未保存的边重新求值；Agent/Bash 新尝试重新渲染，均通过非概率断言 |
| 成功节点仅重提 DAG | Bash 与 Agent 既有实例持久化测试通过；新增随机边写入失败恢复测试确认 Bash 外部调用仍仅一次 |
| 外部模板加载 | 无加载器环境，include/import/extends 在配置校验时明确拒绝；没有文件系统搜索目录或异步/自定义扩展 |
| 模板、资产、文档与独立引擎 | 正式/开发模板和夹具完成语法迁移；结构化文本改用显式 dump；作者 Skill 与用户导航同步；starter 资产通过公共 DAG 编译和全部节点配置校验；独立 DAG 构建产物通过全部 DAG 行为测试 |

对应测试入口：

- [DAG 公共接口](../../packages/dsh-workflow-studio/tests/dag-engine.test.mjs)：31 条，编译、原生求值、展开、错误、回滚、聚合、递归和恢复。
- [节点配置及执行接口](../../packages/dsh-workflow-studio/tests/text-expressions.test.ts)：7 条，实际库渲染、Shell、作用域、错误引用及新尝试行为。
- [工作流实例接口](../../packages/dsh-workflow-studio/tests/workflow-instances.test.ts)、[模板加载](../../packages/dsh-workflow-studio/tests/template-plugins.test.ts)、[持久化](../../packages/dsh-workflow-studio/tests/execution-persistence.test.ts)。
- [新增宿主场景](../../e2e/workflows/text-expressions.e2e.ts)与[可复现模板](../../e2e/fixtures/core-regression/templates/text-expressions/workflow.yaml)。

## 真实宿主命令与结果

```sh
npm run test:e2e -- e2e/workflows/text-expressions.e2e.ts
npm run test:e2e -- e2e/workflows/text-expressions.e2e.ts e2e/workflows/dag.e2e.ts e2e/workflows/bash.e2e.ts e2e/workflows/dev-templates.e2e.ts e2e/workflows/agent-handoff.e2e.ts e2e/workflows/templates.e2e.ts
```

首次新增场景 1/1 通过；六文件回归覆盖新增表达式 1、DAG 3、Bash 3、开发模板 4、Agent 交付 6、正式模板 1，共 18 条。收尾修复后执行 `npm run test:e2e -- e2e/workflows/text-expressions.e2e.ts e2e/workflows/dag.e2e.ts`，复验其中直接受影响的 4 条，全部通过。报告、步骤和脱敏宿主日志由运行入口保存在忽略提交的 `.e2e/report.json`、`.e2e/summary.md`、`.e2e/logs/`，最近一次报告对应 4 条复验；本轮六文件与四条复验报告另保留在忽略提交的 `.e2e/text-expressions/`。长期复现以仓库中的用例和夹具为准，不依赖个人临时目录。

## 未验证范围

未调用真实外部模型，Agent 宿主交付回归使用仓库确定性模型边界夹具，不能据此宣称真实模型的回答质量或实际业务技能已验证。本次没有新增视觉布局；真实宿主回归包含原有语言、主题、窄屏场景，但没有另行穷举所有浏览器、操作系统或 Nunjucks 语法组合。外部模板文件加载不属于本次能力。
