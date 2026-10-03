# Session agent 返回实例验收记录

日期：2026-10-03。需求来源：[正式规格](../specs/session-agent-instance-navigation.zh.md)。最终真实验收：**NAV-01～NAV-16 共 16 项通过，0 项失败，0 项未验证**。用户自行配置隔离宿主模型凭据后，已补齐默认提示词、真实运行中往返、独立故障与迟到响应、完整展示矩阵。原轮通过的 NAV-02～NAV-11 继续采用原真实证据；本轮复验其余项目。旧版失败与中间修复失败证据保留，不能混作最终结果。

## 被测代码范围

实施基点：`0ea2b155ac31159298099101031804bee8d458ba`。本记录覆盖返回实例、客户端 Tab 与视角恢复、默认提示词及标题栏错误浮层的最终实现；验收时使用该基点上的本任务工作区构建。自动化日志与真实宿主结果见下文。

## 默认提示词与自动化验证

2026-10-03，用户将本轮中间的静态拒绝与运行时报错方案替换为统一默认提示词：`prompt` 仍为必填字符串，空字符串及纯空白配置合法。session_agent 先渲染文本，结果为空或纯空白时发送「请先询问我希望处理什么任务。」，否则原样发送渲染结果。判断及发送完全归属节点自身，不增加状态或框架；沿用现有 Session/request 身份与 `promptStarted` 恢复规则。导航不触发发送，不自动完成节点，不修改历史实例快照。

- TDD：既有 HTTP 入口的新行为测试先因旧静态拒绝返回 `Node task: prompt must not be blank` 而失败，最小实现后通过。覆盖空配置、纯空白配置、变量引用收到空字符串后渲染为空；断言初始默认消息仅一条、重复启动仅一个 Session、节点仍待人工完成。既有有效提示词测试验证首尾空白原样发送。
- 最终 `npm run check`：类型检查、构建、**111 测试通过，0 失败，0 跳过**。
- [本轮完整检查日志](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/default-prompt-final-check.log)。
- code-review 独立最终复审：Standards 硬性违规 0、剩余判断性问题 0；Spec 剩余实现问题 0。本轮实际浏览器回归另见下表，未以代码审查代替真实验收。
- 用户在隔离宿主 `DSH_HOME=/private/tmp/dsh-nav-auth-r1mbaau7`、端口 `31988` 自行配置模型凭据。沿用同一目录重启加载最终构建，真实 DeepSeek-V41-Flash 调用成功；未读取、复制或展示凭据。默认消息实际引发询问任务的交互，运行中导航使用连续输出数字的无工具测试任务。

## 最终 NAV-01～NAV-16 真实验收

固定宿主版本 `0.2.0-rc.1`，临时 DSH_HOME `/private/tmp/dsh-nav-auth-r1mbaau7`，非默认端口 `31988`，Codex 内置浏览器。实例创建、表单提交、打开/返回对话、完成节点及改名均通过真实 UI。故障工具仅在此临时宿主截获指定插件 GET：分别返回一次 503，或暂存真实响应后释放；其余宿主、模型、存储和导航实现均真实运行。没有直接调用业务 API冒充页面操作。安全保留的[注入工具](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-fault-harness.mjs)及[请求事件](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-fault-events.jsonl)可核对延迟、失败与释放。

本轮身份：E2E-Default=`6a8c13b2-ccdc-46ad-8ca8-52982b4b7b23`/task/i2；E2E-Rendered=`3d810aa1-b870-4c57-a264-00305054a0f4`/task/i3；E2E-Running=`95683a63-88ec-4d19-a4b8-26907a5d07f5`/task/i2。

| 编号 | 预期 | 实际结果 | 最终状态与证据 |
| --- | --- | --- | --- |
| NAV-01 | 原对话往返正确实例/节点，无额外业务动作 | 空配置与模板展开空字符串均实际发送一次默认提示词；出现标题栏入口，返回各自正确节点；重入复用原对话，没有自动完成 | **通过**：[空配置对话](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-default-conversation.jpg)、[返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-default-return.jpg)、[展开为空对话](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-rendered-conversation.jpg)、[返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-rendered-return.jpg)，发送次数边界另见 H1 |
| NAV-02 | 未先访问工坊，侧栏直接返回 | 原轮刷新后直接从 first 返回 NAV-Items/i3，仅创建目标 Tab；本轮宿主重启后直接返回 E2E-Default/i2 | **通过**：E3，本轮矩阵中的正确目标 |
| NAV-03 | 同定义实例分别返回自身完整身份 | 原轮 NAV-A/B 各返回不同外层 UUID 的 task/i2 | **通过**：E1、E4、E5 |
| NAV-04 | 逐项与嵌套节点准确返回 | first→i3，second→i4；nested-task→i4，父实例 i3 | **通过**：E5、E6 |
| NAV-05 | 多实例/模板 Tab、顺序、各自视角保持 | 原轮三个 Tab 顺序、数量及独立变换保持；本轮延迟响应也没有改变 Default/Rendered 视角 | **通过**：E7、[迟到后详情](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-old-detail-ignored.jpg) |
| NAV-06 | 保持原视角，即使目标在屏外 | 原轮屏外目标返回打开详情，原平移/缩放不变 | **通过**：E8 |
| NAV-07 | 首次或关闭后返回仅新增一个 Tab | 原轮关闭再双击返回只新增一个，采用新视角；本轮十组键盘重试 Tab 数量均为 1 | **通过**：E9、[矩阵数据](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-matrix.json) |
| NAV-08 | 刷新/重启后关联仍有效 | 原轮实际重启后找到同一实例与节点；本轮多次沿用同一临时目录重启后，原 Default 对话仍返回原 UUID/i2 | **通过**：E10、本轮矩阵 |
| NAV-09 | 普通/fork/无关联对话无入口 | 原轮真实新建普通对话与 fork 子对话均没有返回动作 | **通过**：E11 |
| NAV-10 | 已完成节点可只读返回 | 原轮完成后无完成操作；本轮 Default 已完成，反复返回仍显示 Completed/已完成及 task/i2 | **通过**：E12、[最新返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-latest-return.jpg) |
| NAV-11 | 删除竞态显示缺失并清理缓存 | 原轮第二页面删除目标后，主页面出现缺失错误，管理页无目标，重入无入口 | **通过**：E13 |
| NAV-12 | 查询与详情故障分别反馈且可重试 | 独立归属查询 503 可重试恢复入口；归属成功后独立详情 503 留在对话，重试准确返回 | **通过**：[查询故障](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-query-failure.jpg)、[详情故障](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-detail-failure.jpg)、[恢复](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-error-recovered.jpg) |
| NAV-13 | 旧请求迟到、快速切换及重复点击不串目标 | 暂存 Default 归属响应，切 Rendered 并双击返回；释放旧响应仍选 Rendered，Default Tab 数量 0。另暂存 Rendered 详情后主动导航 Default，释放不抢回目标 | **通过**：[旧归属未抢页面](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-old-query-ignored.jpg)、[详情取消后](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-cancel-ignored.jpg)、请求事件 |
| NAV-14 | 最新状态与视角不被旧详情回退 | 暂存 Default 未完成的真实详情，用户主动导航回实例并手动完成；释放旧响应后仍完成、无完成按钮、Tab 1。新返回仍完成；Default scale(1.2) 与 Rendered scale(1) 的完整 transform 均保持 | **通过**：[完成在先](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-old-detail-advanced.jpg)、[旧响应在后](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-old-detail-ignored.jpg)、[新返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-latest-return.jpg)。此真实操作含后续导航取消旧请求；revision 合并的独立边界另见 C8 |
| NAV-15 | 真实生成中往返不停止、重发、完成或推进 | 同一次浏览器操作发送数字输出请求后立即返回再重入；前后均有“停止生成”，初始提示词出现次数均为 1，仍为原对话，节点待人工完成；稍后模型继续输出至 1500 | **通过**：[运行前](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-active-before.jpg)、[返回节点](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-active-return.jpg)、[运行后](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-active-after.jpg)、[正常结束](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-active-completed.jpg)，对应 DOM 同名 txt |
| NAV-16 | 宽窄/浅深/中英文及键盘的加载、错误、重试均可用 | 最终八组合全部加载 disabled/aria-busy、无动作重叠，错误完整可读；Tab 聚焦有 2px 轮廓，Enter 重试正确返回 task，目标 Tab 1。中英文单字标题另两组通过；已有错误中改名、280px 缩屏及延迟重试长文案均保持提示在 header 边界内 | **通过**：[十组数据](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-matrix.json)、[布局补测](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-extra-layout.json)、[单字英文焦点](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-en-dark-narrow-short-error-focus.jpg)、[加载中重试](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-retry-loading.jpg) |

### 窄屏问题、修复和最终回归

首次错误浮层右对齐时，390px 窄屏左边为 -11.5px，[失败截图](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-narrow-error-before-fix.jpg)。中间改为居中虽通过原长标题八组合，但单字标题 A 的浮层左边 11.57px，被从 x=56 开始的宿主内容区域裁切，[中间失败截图](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-short-error-before-fix.jpg)。未将“位于屏幕内”误判为“完整可读”。

最终只在标题栏动作组件内根据最近 header 的可见边界约束浮层位置和宽度；随 header、锚点、浮层尺寸及渲染变化重算，释放观察器，不改宿主样式或增加业务状态。真实回归：A 标题 390px 时浮层 64..304、header 56..390；错误显示中缩到 280px 后浮层 64..272、header 56..280；延迟重试长文案期间仍为 64..304，之后正确返回。保留中间失败 JSON，不覆盖失败历史。

最新完整检查 `npm run check`：类型检查、构建及 **111 测试通过，0 失败，0 跳过**，[最终日志](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-final-check.log)。最终 Standards、Spec 独立复审剩余问题均为 0；Standards 的布局观察遗漏已修复并在真实延迟重试中回归。没有为 CSS 写只镜像实现的伪布局测试，失败与成功证据均来自实际浏览器。

本轮收尾：已停止本次 31988 宿主并删除临时 DSH_HOME（含用户仅为验收配置的凭据），恢复浏览器视口、中文和跟随系统外观。只保留截图、DOM、故障事件与测试日志；未保存模型凭据或用户 profile。浏览器最终页面保留为静态可见结果，宿主停止后不能继续操作；可直接审阅本报告及证据。

## 验收证据索引

以下为 HTTP 或页面组件证据，不代表真实浏览器验收。

| 证据 | 入口与观察 |
| --- | --- |
| H1 | [实例 HTTP 集成测试](../../packages/dsh-workflow-studio/tests/workflow-instances.test.ts#L1207)：两个同定义实例的完整目标、查询无业务副作用、完成后关系、关闭并重开同一存储、普通/fork ID 无关系、非法请求、删除后无关系 |
| H2 | [逐项 HTTP 测试](../../packages/dsh-workflow-studio/tests/workflow-instances.test.ts#L391)：两个实际创建的 Session 分别反查到各自节点实例 |
| C1 | [标题栏往返组件测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L524)：未先打开目标时返回准确的逐项节点、双击与重复返回去重、视角保留、关闭后重开 |
| C2 | [跨挂载组件测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L584)：两个实例与一个模板 Tab、独立缩放及鼠标平移、卸载重挂保留顺序/选择/变换、新客户端清空 |
| C3 | [导航取消测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L637)：后续宿主导航使旧请求无效，当前动作可再次使用 |
| C4 | [查询失败测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L690)：查询错误可重试，与普通/fork 对话无入口区分 |
| C5 | [详情失败与已完成节点测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L706)：加载错误不导航，重试成功，已完成节点没有完成操作 |
| C6 | [删除竞态测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L727)：入口显示后关系失效，明确错误，清理详情 Tab，回到管理页不复活实例 |
| C7 | [迟到请求测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L751)：旧归属/详情响应不覆盖当前对话，不抢页面，释放客户端后不提交导航 |
| C8 | [版本竞态测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L777)：完成响应推进后，迟到的旧返回详情不能回退业务状态 |
| C9 | [抽屉宽度竞态测试](../../packages/dsh-workflow-studio/tests/node-card-interactions.test.tsx#L813)：迟到详情不能覆盖已保存的宽度偏好 |
| A1 | [客户端协议测试](../../packages/dsh-workflow-studio/tests/client.test.tsx#L442)：目标字段校验、合法无关联与服务故障区分 |
| B1 | [构建产物测试](../../packages/dsh-workflow-studio/tests/bundle.test.ts#L7)：宿主 React、标题栏公开插槽、layout 注入和 `0.2.0-rc.1` 依赖 |

## 历史：凭据配置前的真实宿主验收（非最终结论）

本节保留凭据配置前的实际执行结果和旧版失败；最终结论以上方最终验收表为准。所有业务操作均在真实 dsh 页面中通过 Codex 内置浏览器执行；终端 HTTP 只用于诊断宿主就绪，不充当页面验收。

环境：本机 dsh `0.2.0-rc.1`，本次重新构建的插件，新建 `/private/tmp/dsh-nav-real-3ugr0x_2`，非默认端口 `31987`，Codex iab。模板 fixture 只写入临时 DSH_HOME。通过 UI 创建 NAV-A、NAV-B 和 NAV-Items；没有读取用户凭据。测试消息触发 `MISSING_CREDENTIAL`，因此不能宣称真实模型运行中导航已验证。

“未验证（部分通过）”表示已执行的子场景通过，但仍缺所列子场景；没有把部分通过计为整项通过。

| 编号 | 预期 | 真实页面实际结果 | 状态与证据 |
| --- | --- | --- | --- |
| NAV-01 | 节点打开原对话，再返回正确实例/节点，不新增业务动作 | 含消息的对话返回 NAV-A / task / i2，原会话仍为 1 轮 1 步；空 prompt 创建的关联空对话只显示宿主欢迎页，没有标题栏及返回按钮。手动加入测试消息后才出现入口 | **失败：空对话边界**。E1、E2；只读副作用边界另见 H1 |
| NAV-02 | 未先访问工坊，从侧边栏直接返回 | 刷新到普通对话后，没有访问工坊，直接点击 first 关联对话并返回；只创建 NAV-Items 一个详情 Tab，打开 i3 / first | **通过**。E3 |
| NAV-03 | 两个同定义实例各回各的实例 | NAV-A 和 NAV-B 都有 task / i2；各自对话分别返回外层 UUID 不同的正确实例，未串实例 | **通过**。E1、E4、E5 |
| NAV-04 | 逐项或嵌套对话返回具体节点实例 | 真实 bash JSON 展开 first、second，各建独立 Session；分别返回 i3 / first、i4 / second。嵌套对话返回 NAV-A / nested-task / i4，父节点 i3 | **通过**。E5、E6 |
| NAV-05 | 多实例、模板 Tab 与各自缩放/平移保留 | NAV-A、NAV-B、github-spec-kit-workflow 顺序及数量保持；缩放为 1.2、1.44、1.44，NAV-A 平移后往返的三个完整 transform 相同 | **通过**。E7 |
| NAV-06 | 已有视角优先，打开详情不强制居中 | 将 NAV-A 目标移出可见区，返回仍显示 task / i2 详情；transform 前后均 translate(636px, 411.2px) scale(1.2) | **通过**。E8 |
| NAV-07 | 首次/关闭后返回仅新增一个 Tab，沿用首次视角 | 关闭 NAV-A 后从侧边栏双击返回，只出现一个 NAV-A Tab；释放旧视角，重新采用 scale(1)，没有恢复 scale(1.2) | **通过**。E9 |
| NAV-08 | 刷新或重启宿主后仍找回持久关联 | 实际停止并重启同一临时宿主。重启并刷新后从原 NAV-B 对话返回相同 UUID / i2 和已完成状态；新客户端只保留 NAV-B 一个详情 Tab | **通过**。E10 |
| NAV-09 | 普通、fork、无有效关联对话没有入口 | UI 新建普通对话并发送测试消息，没有按钮；UI 分叉 first 对话，再选中实际生成的 (1) 子对话，也没有按钮。合法无关系接口边界另见 H1 | **通过**。E11 |
| NAV-10 | 完成节点仍能返回查看，操作保持只读 | UI 手动完成 NAV-A 的 task，再进入原对话返回；详情显示已完成，完成按钮数量为 0 | **通过**。E12 |
| NAV-11 | 删除后隐藏；点击竞态显示缺失且清理缓存 | 主页面保持 NAV-B 返回入口，第二个 iab 页面删除 NAV-B；主页面点击后显示“实例已不存在”。打开工坊没有 NAV-B Tab/列表行；重入保留的对话后按钮数量为 0 | **通过**。E13 |
| NAV-12 | 查询/详情故障有可重试反馈，恢复后可返回 | 真实停止宿主后点击返回，显示“无法加载所属实例，请重试”；断开期间切换对话触发归属查询也有错误。重启后 UI 重试恢复入口并返回准确目标。没有单独注入仅详情请求失败、归属请求成功的故障 | **未验证（部分通过）**。E14；独立详情失败仍由 C5 自动化覆盖 |
| NAV-13 | 延迟旧请求，快速切换/后续导航/重复点击不串目标 | 实际快速从 first 切到 second 后双击返回，只打开 NAV-Items 一个 Tab，并显示 i4 / second。没有人为安排旧请求延迟或取消期间的后续导航 | **未验证（部分通过）**。E15；强制迟到/取消仅 C3、C7 通过 |
| NAV-14 | 对话期间状态推进，返回最新事实且旧响应不回退 | 主页面停在 NAV-B 对话，第二个真实页面手动完成 task，主页面返回显示已完成且无完成按钮。没有人为安排旧详情响应迟到；视角保留另见 NAV-05/06 | **未验证（部分通过）**。E4；迟到版本仅 C8、C9 通过 |
| NAV-15 | 模型仍运行时往返不停止/重发/完成/推进 | 所有测试消息实际因缺少模型凭据而失败，没有获得持续运行中的模型对话。普通往返保持同一对话和原有失败步骤 | **未验证**。E16；不能把普通往返或 HTTP 只读检查当作运行中验收 |
| NAV-16 | 宽窄屏、浅深色、中英文、键盘、加载/错误/重试可用 | 实际执行 1280×900 与 390×844、浅/深色、中/英文八种返回按钮展示组合。窄屏标题可截断，按钮与宿主动作可见且未重叠；英文浅色窄屏点击返回后详情可辨认。中文宽屏键盘 Tab/Shift+Tab 聚焦按钮，2px 焦点轮廓可见，Enter 正确导航。中文浅色宽屏错误及重试已验证；未完成加载状态及全部错误/重试组合 | **未验证（部分通过）**。E17 |

### 真实页面证据

证据根目录：`/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/`。截图、DOM、运行身份、画布 transform 和脱敏宿主日志分别保存；未保存临时访问 token。

- E1：[普通往返截图](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-01-return.jpg)。
- E2：[空关联对话失败截图](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-01-empty-session-failure.jpg)、[实际 DOM](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-01-empty-session-dom.txt)。
- E3：[刷新后侧边栏直接返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-02-direct-sidebar.jpg)。
- E4：[对话期间推进后的最新状态](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-14-latest.jpg)。
- E5：[UI 运行身份记录](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-runtime-identities.json)。
- E6：[first](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-04-first.jpg)、[second](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-04-second.jpg)、[嵌套节点](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-04-nested.jpg)。
- E7：[往返前后三个画布 transform](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-05-views.json)。
- E8：[目标移出视区后返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-06-offscreen.jpg)。
- E9：实际 UI Tab 数量与首次视角观察：关闭后列表为 NAV-B、NAV-A、github-spec-kit-workflow；NAV-A 只有一个，transform 为 translate(220px, 194px) scale(1)。同机制的新客户端首次视角可见 E10。
- E10：[真实重启并刷新后的返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-08-restart.jpg)、[脱敏重启日志](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-real-host-restart.log)。
- E11：[实际选中的 fork 子对话](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-09-fork.jpg)；普通对话 DOM 实测按钮数量为 0。
- E12：[完成后只读详情](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-10-completed.jpg)。
- E13：[删除竞态错误](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-11-deleted-race.jpg)。
- E14：[点击返回时断开](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-12-offline.jpg)、[归属查询故障](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-12-query-failure.jpg)、[重试后返回](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-12-query-recovered.jpg)。
- E15：[快速切换与双击后 second 详情](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-13-fast-switch.jpg)。
- E16：[真实 MISSING_CREDENTIAL 页面](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-16-dark-zh-wide.jpg)。
- E17：[键盘焦点](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-16-keyboard-focus.jpg)、[英文浅色窄屏按钮](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-16-light-en-narrow.jpg)、[窄屏目标详情](/Users/didi/.codex/visualizations/2026/10/03/01a100b6-d1ad-7e81-9270-60fa94ebe88d/nav-16-light-en-narrow-detail.jpg)；八种组合截图以 `nav-16-{light|dark}-{en|zh}-{wide|narrow}.jpg` 保存。

### 首次受阻与本次恢复

首次直接访问裸地址时，工具报告 `ERR_BLOCKED_BY_CLIENT`。本次启动后确认裸地址返回 401；dsh 生成的本次临时访问链接可以建立浏览器会话，再跳回干净根地址。通过 `open_in_codex` 将该链接交给面板后，真实页面实际加载成功；后续同一浏览器还可以直接新建第二个根地址标签页。

技能第 4 步当前写的是直接访问裸地址，遗漏了全新隔离宿主的首次访问认证。关闭 `credentialOnboarding` 只跳过模型凭据引导，不会替代 Web 访问认证。本次使用的是新建临时宿主自己生成的链接，没有读取、复制或展示用户日常凭据。此前普通 HTTP 页面的 `ERR_BLOCKED_BY_CLIENT` 对照结果仍保留；本次证据不能确定该错误码的全部拦截来源，只能确认正确宿主访问流程现已可用。

### 历史发现：旧空对话入口失败（最终默认提示词已解决）

空 prompt 是现有 DAG 语法支持的有效配置：只创建关联对话、不发送初始消息。实际宿主在该空对话显示欢迎页而没有标题栏动作，插件仅注册标题栏插槽，因此用户无法直接返回实例。已核对本机安装的 `@deepseek-ai/dsh-client-ui-conversation@0.2.0-rc.1` 构建代码：空对话向 Session header 传入 `hideChrome: blank`，标题栏动作随 chrome 一起隐藏。这是 NAV-01 的已复现失败；没有通过替用户发送消息、改写 prompt 或自动完成节点来掩盖它。本次任务为追加验收，未修改产品代码或扩大宿主入口方案。

仅详情请求失败、强制迟到响应以及完整加载/错误组合尚未用真实浏览器故障注入执行；既有自动化结果继续单独记录。真实模型运行缺少凭据，未索取或复制凭据。

结束时停止本次宿主进程、清理临时 DSH_HOME，并恢复浏览器 viewport 和外观偏好；截图与脱敏日志保留，主要浏览器标签页保留供查看页面最终状态。
