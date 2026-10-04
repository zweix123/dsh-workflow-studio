# 节点与模板插件化联合审查及验收

日期：2026-10-04。依据：[节点插件登记](../specs/node-plugin-registration.zh.md)、[模板插件分发](../specs/template-plugin-distribution.zh.md)，以及它们引用的[输入输出](../specs/node-input-output.zh.md)、[共享定义详情](../specs/shared-definition-details.zh.md)、[会话导航](../specs/session-agent-instance-navigation.zh.md)、[实例 Tab](../specs/instance-tab.zh.md)与模板管理规格。

结论：两份规格要求均有对应证据，联合验收通过。两步累计差异审查完成，一项作者示例接入缺陷已修复；136项自动化、本轮联合真实浏览器场景，以及经差异核对仍适用的历史真实宿主证据共同支撑结论。本轮没有重新进行已认证的模型调用，模型回复和持续生成中的往返采用下述历史真实证据，不将其记作本轮操作。

## 代码范围与可靠基线

第一阶段记录中的开始点 `7a1a82173fd6622a2527cc5d97b31bb468c5f518` 已通过 Git 对象核实；其后的第一阶段提交为 `67264f8488822f2d163ef9a01e37c900c0c4a2f4`。本轮开始时第二阶段为未提交及新增文件，期间工作区 HEAD 更新为 `329c28611e5ea90000253d7a119b436de95dd7cc`（模板插件分发提交）。本轮审查及验收阶段未执行 commit；验收完成后用户明确要求提交本轮相关改动。

累计审查采用 `git diff 7a1a821...HEAD`、`git diff HEAD`，并读取 `git ls-files --others --exclude-standard` 中相关新增文件；覆盖第一步至第二步的最终源码、构建、模板、示例、测试和文档，再独立复审本轮修复。无关文件不纳入审查、不改写。两阶段先前的实际代码范围可分别从[节点阶段记录](./node-plugin-registration.zh.md)及[模板阶段记录](./template-plugin-distribution.zh.md)复现。

本轮额外改动：echo 示例 manifest/补丁与指南、`template-plugins.test.ts` 四个公开集成回归、`tests/fixtures/joint-bundle` 验收 bundle、截图与本记录，以及两份主 spec 的简短状态。未修改 Studio 或节点运行时代码。被测是上述提交及本轮未提交改动的当前构建。

## 审查与修复

### Standards

累计差异和修复复审均无文档标准硬违规，无需要修复的 smell。依赖方向符合 AGENTS 与 ADR 0004–0006；独立节点不引用 Studio 的 workflow、DAG 或实例状态；六份双语模板结构与能力一致。测试沿已确认 Cordis 装配、HTTP、真实临时存储及现有页面交互边界，无私有测试入口。

### Spec

发现一项 P2：节点作者指南与 echo README 仍指导复制 YAML 到旧 DSH_HOME 目录，但第二阶段停止扫描该目录，示例 bundle 只提供节点，按指南无法创建示例实例。节点规格要求可运行最小作者示例，模板规格要求统一通过声明加载。

按 TDD 在公开集成边界复现：装配示例自身声明后模板数量实际为 0，预期为 1。随后为 manifest 增加 YAML exports、补丁增加通用模板加载声明，更新 README 与节点作者指南；同一测试转绿，创建实例后 Echo 结果进入下游 form。真实 CLI 添加修复后的示例后，工坊出现 `Echo example` 与来源 `@example/workflow-echo/templates/example`，无需复制 YAML；随后真实创建 Author Echo、执行 Echo，原message进入下游answer并正式提交只读。

修复及联合 fixture 已由两轴独立复审，均无剩余发现。Standards 0 项；Spec 原 1 项 P2 已修复，剩余 0 项。

## 验证环境和证据复用规则

- 本机 CLI 和宿主设置页均确认 `0.2.0-rc.1`；未安装或升级宿主。
- 新建临时 DSH_HOME；profile `web` 使用 127.0.0.1:32186，另以宿主自带 web 模板初始化 `joint-isolated`，使用同一临时 home 和 32187。工作区 A/B 均为临时目录。插件添加与启动始终使用该 home。
- 仅添加默认 `packages/dsh-workflow-bundle` 后先验收六模板与工坊；随后添加联合 fixture，最后添加修复后的 echo 示例。安装命令显式使用公共 npm 源。
- Codex 内置浏览器可见标签页经本次临时 Web 登录地址正常登录，使用网页目录选择器及宿主原生插件开关。登录 token 不保存。未读取、复制真实模型凭据、日常 profile、.env 或实例。
- 初始沙箱拒绝本地监听，HTTP 测试报告 EPERM，宿主在取得登录地址前退出；批准本次本地监听后恢复。这些受阻尝试不作为测试红灯或通过证据。
- 前两阶段记录先与当前 diff 对照：节点登记、执行/保存/恢复、独立节点客户端及会话导航实现未被模板阶段改写，其浏览器证据可复用；模板阶段的资源解析、配置错误、旧入口与重载失败证据同样适用。本轮完整自动化重新验证所有公开边界，不把旧浏览器结果改写为本轮重新操作。
- 自动化模块解析使用外部文件解析替身，联合测试手动装配 bundle 对应声明；真实 CLI/bundle 资源解析与实际页面操作由本轮浏览器补齐。HTTP、jsdom、构建产物与截图均不替代真实 UI 操作。

### 历史真实模型证据的适用范围

收尾复核确认，[会话导航专项的最终 NAV-01/NAV-15](./session-agent-instance-navigation.zh.md)已经在用户自行配置认证的隔离 rc.1 宿主完成真实模型调用和持续生成期间往返；该记录后面的未验证表属于旧轮次，不能覆盖其最终结论。原截图和对应 DOM 仍存在，本记录保留四份截图的原样副本：[默认提示词引发真实提问](./assets/node-template-joint/historical-nav-default-conversation.jpg)、[往返前仍生成](./assets/node-template-joint/historical-nav-active-before.jpg)、[往返后仍生成](./assets/node-template-joint/historical-nav-active-after.jpg)、[正常输出至1500](./assets/node-template-joint/historical-nav-active-completed.jpg)。不是用截图本身推断调用：操作、前后原会话身份、发送次数、返回节点和正常结束以原专项记录及 DOM 为依据。

适用性核对：导航最终代码进入 `6948888`，到本次可靠基线 `7a1a821` 没有相关业务变更；再比较该基线与当前代码，`packages/dsh-workflow-node-session-agent/src/server.ts` 的 start、默认提示词、sessionController.create/prompt参数、独立AbortController和recover保持原语义。新增公共登记、关联查询迁入节点插件，以及导航接口由returnToInstance拆成查询后open，已由本轮真实创建/发送/往返/完成/重启及公开回归验证。返回动作仍只查询归属、读取详情和切换页面，不发prompt、不停止模型、不完成节点。因此组合复用历史模型行为与当前入口证据；不同于宣称当前未认证宿主完成了模型调用。

此复用不证明新插件缺失、冲突或卸载期间的模型运行；该类协调要求采用本轮完整定义、在途调用和保存/恢复的公开集成证据。Standards/Spec修复复审之后，对证据复用适用性和配置拒绝的规格边界另做独立只读复核，均支持上述范围。

### 配置拒绝的规定验证边界

模板规格 Testing Decisions 明确把配置拒绝列入Cordis/HTTP集成边界，本轮真实Fiber.update已验证非法配置被拒时旧贡献保留；不是必须增加宿主配置表单。继续使用新临时home、固定rc.1、32188与Codex内置浏览器查看联合bundle详情，所测组件页只提供启停开关，点击joint-template没有打开配置编辑入口；[实际组件页](./assets/node-template-joint/native-component-controls.jpg)与本机该版plugin-manager的configure.has(row)条件一致。原生表单操作在所测页面不适用，不算浏览器通过，也不作为缺失的规格要求。卸载后加载失败仍有原真实浏览器及本轮集成证据。

## 联合场景与证据矩阵

“复用”明确指上述仍适用的前两阶段记录；“本轮浏览器”表示本次真实操作。故障注入在合适的公开集成边界验证。

| 重点 / 规格规则 | 操作与预期 | 实际结果与层次 | 状态 |
| --- | --- | --- | --- |
| 1 默认 bundle；节点默认装配、模板 3/12 | 干净 profile 只添加默认 bundle，工坊、三个内置节点和六模板可用 | 本轮浏览器工坊与六份模板名称/来源有效；联合 builtins 实例实际使用 form/bash/session_agent；完整自动化六模板装配通过。默认11组件与仅bundle真实启动另复用模板阶段记录 | 通过 |
| 2 第三方同时提供节点和模板 | 加联合 bundle，无修改 Studio；创建、首次按钮、执行、保存、下游推进 | 本轮创建 Joint A；纯服务端 `joint_echo` 自动获 Echo joint 按钮，结果 `loaded joint message` 进入 confirm 表单；正式提交保存且只读。模板静态图无业务动作。新增联合 HTTP 回归同链路通过 | 通过 |
| 3 先模板、迟到节点、缺失/全冲突/恢复；模板 11 | 模板先于节点加载仍保留诊断；两贡献全不可用，撤销冲突自动恢复 | fixture 补丁模板声明在节点前；HTTP 精确观察缺失→可用→冲突→恢复，详情/创建一致。真实浏览器关闭节点显示 missing；启用重复声明后模板禁用、实例暂停并显示两个声明来源，关闭重复后恢复。首次夹具来源名错误被宿主拒绝，修正同包身份并重启后才取得冲突证据 | 通过 |
| 4 等待时修改 YAML；模板 6/13 | 节点恢复仍用已加载定义，模板声明重载才读取新文件，旧实例不变 | 本轮关闭 joint-node 时修改名称/message；刷新仍旧名称。恢复节点创建 Before reload，快照 message 仍原值。关/开 joint-template 后新版名称出现；工作区B创建 After reload B，快照 message 为新版。恢复原文件后重新装配；旧快照仍原值 | 通过 |
| 5 单卸模板 vs 同卸节点；模板 7 | 只撤模板旧快照可执行；整个bundle撤销则停止新业务，保留查看，恢复后继续 | 本轮单关模板后 Joint A 的下游提交成功且保存；关闭整个联合bundle后 After reload B 提示缺失类型，无 Echo 操作，仍能查看定义；重新启用后 Before reload 按原值执行并交付。新增HTTP回归还验证已完成 echo 类型缺失会拒绝其他 form 的提交 | 通过 |
| 6 完整定义、在途收尾、保存/提交故障、未知重启 | 任意类型不可用暂停整实例；在途合法结果保存并提交，新业务等待；失败/未知不重跑 | 本轮完整HTTP/真实存储测试通过：尚未展开/已完成类型暂停、在途卸载等待与资源清理、结果保存失败不推进、重启未知不重复、业务成功保存而DAG写失败后仅恢复提交。复用节点阶段浏览器撤销/恢复及本轮真实bundle暂停；未用UI状态推断外部业务次数 | 集成通过；没有逐个浏览器故障注入 |
| 7 重载前配置拒绝 vs 已卸载后加载失败；模板 10 | 前者保留旧贡献，后者保留新错误，不回滚旧定义 | 本轮 `load errors stay visible...` 集成测试通过 Fiber.update 拒绝空directory而旧模板仍有效、真正卸载后坏YAML不可用；后者真实浏览器复用模板阶段记录。补查所测原生组件页没有配置编辑入口，见规定边界说明 | 通过（Cordis/HTTP集成）；卸载后失败浏览器证据复用；所测页面表单操作不适用 |
| 8 profile、工作区与原存储作用域；模板 1/14 | 两profile贡献不串用，同profile工作区共享，实例存储保持原规则 | 本轮真实 web A/B均可用联合模板，A保存 Joint A/Before reload、B保存 After reload B/Builtins B。第二真实 profile仅默认六模板，但能读取同一home的这些工作区实例；含joint_echo的快照提示missing，不能借用web节点。双Context隔离HTTP回归通过 | 通过；未把存储说成按profile隔离 |
| 9 可选前端、来源、迟到/重载 | 缺组件保留公共查看/服务端动作，缺handler隐藏；来源不混用，局部错误不破坏工坊 | 本轮纯服务端joint节点通过；来源冒用被真实宿主拒绝。缺组件/处理函数、来源不匹配、迟到登记、前端重载草稿提示、局部渲染和同步/异步动作失败，完整页面/构建回归通过；浏览器能力撤销与重载、局部错误复用节点阶段记录（客户端实现未改写） | 通过，按记录区分本轮与复用 |
| 10 内置业务、草稿、会话、Tab/视角、迟到保护、语言/主题/窄屏 | 真实业务结果与导航保留；同页草稿保持；迟到请求不回退；UI可读可操作 | 本轮form input关闭、切scratch后原草稿保留；提交后bash真实执行，完整JSON含count=0/accepted=false进入confirm并正式保存。空prompt创建原会话一轮默认提示词；返回Builtins B/i4，Before reload/After reload B/Builtins B的相对顺序保持，画布style前后均 `translate(106.2px, 113.2px) scale(1.2)`；完成输出{}，仍可访问及返回。最后重启同一隔离宿主，原会话仍1轮1步、返回原i4；confirm中0/false结果保持只读。中文深色与英文浅色、1366×900/390×844；窄屏草稿重开、提交只读，document scrollWidth=390。迟到请求、同名/逐项身份、错误重试等复杂导航子项复用完整自动化和节点/导航阶段记录。真实模型回复与生成中往返复用最终NAV-01/NAV-15，适用性见上文 | 通过（本轮操作与仍适用的历史真实证据组合）；本轮未重新认证调用模型 |

## 模板规格全部场景对应

| 模板编号 | 对应证据 |
| --- | --- |
| 1/2 | 本轮联合fixture与echo示例真实资源解析、目录chain和模板ID joint-chain不同；两工作区与名称快照；模板阶段纯配置@acme浏览器及HTTP |
| 3/12 | 本轮干净默认bundle浏览器、六模板加载HTTP及双语结构回归；模板阶段11组件证据 |
| 4 | 本轮 duplicate IDs 公共HTTP；复用模板阶段同ID冲突/关闭单项真实操作 |
| 5 | 本轮 metadata/errors/config-by-kind 回归（ENOENT、坏YAML、缺失/空白id/name、非法节点字段、未知业务字段）；复用模板阶段诊断与layout非阻断浏览器 |
| 6/13 | 本轮等待修改YAML→刷新→节点恢复→模板自身重载→新旧快照的真实操作及HTTP |
| 7 | 本轮模板单关、bundle整体关闭/恢复与联合HTTP |
| 8 | 模板阶段旧home文件保留/不发现/不复制真实文件证据；本轮host回归验证不复制，旧目录不发现/不删除复用模板阶段证据 |
| 9 | 本轮英文浅色窄屏实例及名称、中文深色冲突诊断；复用模板阶段列表/选择器/详情的宽窄屏双主题语言检查 |
| 10 | 本轮Cordis配置拒绝与重载失败HTTP，复用模板阶段实际卸载后坏YAML浏览器；补查原生组件页未提供配置编辑入口，该额外表单操作不适用 |
| 11 | 本轮联合先模板后节点、缺失/冲突/自动恢复真实UI与公共HTTP |
| 14 | 本轮同home两个真实profile、同profile两工作区与原实例存储；双Context HTTP |

节点规格中的升级兼容由本轮新增公开集成回归直接验证：替换同kind实现，分别拒绝已保存定义与业务事实时，旧快照和成功结果仍可读，其他节点的新提交被拒绝；恢复兼容实现后可继续推进。只读事实查询由另一项新增回归直接验证：按kind返回实例、节点、工作区身份，修改返回的定义、输出和状态副本后，HTTP详情及再次查询均保持原值。

Testing Decisions 的其余子项（按kind配置校验、动作防重/非法参数/取消、自动手动调度、三个动作目标、词表清理）对应节点阶段记录的自动化行及本轮完整复跑。引用规格中的嵌套/递归完整定义路径、运行区状态、合法缺失与输入转义、会话删除/失败/迟到竞态，继续由既有 DAG/HTTP/页面边界回归及适用的专项验收记录支撑；不把尚未真实操作的所有细项宣称为浏览器通过。

## 自动化、复现和必要证据

- `npm run check`：类型检查、构建及136/136项测试通过，0失败、0跳过，包含最终新增的升级兼容和只读查询回归。故障测试中的ENOTDIR/Injected DAG-state storage fault为预期注入。
- 恢复fixture YAML后，模板与联合专项原9项回归再次通过；最终完整检查包含该文件全部11项测试。`git diff --check`通过。
- 新增测试：`tests/template-plugins.test.ts` 的 `one third-party bundle combines templates and nodes...`、`the documented echo bundle exposes a selectable template...`、`a replacement node rejects incompatible saved definitions or facts...`、`the public kind query exposes saved identities as copies...`。既有故障、完整定义与恢复：`tests/workflow-instances.test.ts`；登记与profile：`tests/node-plugins.test.ts`；UI/来源/草稿/导航：`tests/node-card-interactions.test.tsx`、`client.test.tsx`、`template-client.test.tsx`；词表及独立浏览器产物：`bundle.test.ts`。
- [联合fixture](../../packages/dsh-workflow-studio/tests/fixtures/joint-bundle/README.md)保存声明、节点和YAML，可复现真实操作。构建后新建隔离home，只添加默认bundle，按[浏览器技能](../../.agents/skills/dsh-browser-e2e/SKILL.md)启动；再添加此fixture。原生插件页分别控制joint-template/joint-node/joint-conflict，或整个bundle。
- 第二真实profile复现：同临时home执行 `dsh --profile joint-isolated --from-default-profile web --help` 初始化，再仅添加默认bundle，在另一非默认端口启动。模板库不含joint贡献，已有实例仍按原home/workspace作用域可读；不要同时在两宿主发起同一实例写操作。
- [真实冲突截图](./assets/node-template-joint/conflict-zh.jpg)、[第二profile缺失类型截图](./assets/node-template-joint/profile-isolation.jpg)、[英文浅色窄屏只读结果](./assets/node-template-joint/narrow-en-light.jpg)、[修复后Echo示例结果](./assets/node-template-joint/echo-example.jpg)。截图辅助已记录的真实操作，不作为独立执行/调用次数证据。

## 限制与清理

- 本轮未认证宿主会话显示 `MISSING_CREDENTIAL`，本轮真实模型调用仍未执行。规格所需的模型回复和持续生成中往返采用经核对仍适用的历史真实证据；未读取、复制或索取凭据，也未用模拟模型补记真实调用。
- 重载前非法配置拒绝按规格以公开Cordis集成验证；所测原生组件页没有配置表单。保存故障、强制未知恢复、迟到响应注入等采用集成边界，没有宣称浏览器故障注入通过。
- 未发现需澄清的规格矛盾或剩余规格内缺陷；两份规格均有相应层次证据，没有尚缺证据的必需场景。
- 首轮两个宿主及后续补查32188宿主均已停止，32186/32187/32188无监听；各临时home、工作区、登录信息与受阻测试留下的空目录已清理，fixture YAML恢复原值，浏览器视口已恢复。保留必要浏览器标签页、截图、fixture与验收记录；不改日常数据。

本次以本地spec覆盖tracker前置及自动提交要求，未配置tracker、发布Issue或自动commit。验收完成后的提交依据用户随后明确授权，仅包含联合审查、修复和验收相关文件。
