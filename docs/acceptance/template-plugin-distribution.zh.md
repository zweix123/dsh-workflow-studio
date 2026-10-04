# 模板插件分发第二阶段验收

日期：2026-10-04。依据：[模板插件分发规格](../specs/template-plugin-distribution.zh.md)、[节点插件登记规格](../specs/node-plugin-registration.zh.md)、[ADR 0006](../adrs/0006-independent-node-plugin-registry.md)。本记录只给出第二阶段结果；第三方节点与模板联合 bundle 的整体验收未执行。

## 被测范围与环境

- 基线 HEAD：`67264f8488822f2d163ef9a01e37c900c0c4a2f4`；被测版本为该基线上的本轮未提交模板插件化修改。没有自动提交。
- 本机已有 dsh CLI：`0.2.0-rc.1`；未安装或升级 CLI。公开依赖安装显式使用 `https://registry.npmjs.org`。
- 宿主使用新建临时 `DSH_HOME`、web profile、127.0.0.1 非默认端口 32084；工作区 A/B 均为临时目录。仅通过网页内目录选择器添加工作区，不访问日常 profile、模型凭据或 .env。
- 按浏览器验收技能关闭模型认证引导并使用网页目录选择器。Codex 内置浏览器完成 Web 登录、原生插件开关、工坊浏览及实例操作；临时 Web 登录 token 不保留。
- 第一次只添加 `packages/dsh-workflow-bundle`，随后添加 `examples/review-templates` 和[诊断 fixture](../../packages/dsh-workflow-studio/tests/fixtures/template-bundle/README.md)。后者仅用于隔离验收，不属于默认装配。
- 最终 `npm run check`：类型检查、构建成功，132/132 项测试通过，0 失败、0 跳过。故障注入测试中的保存错误为预期断言，不能当作宿主正常场景错误。

自动化复用 Cordis 插件装配、真实临时 JSON 存储和 HTTP 接口、既有页面交互边界。包资源解析在自动化中使用文件解析替身，实际 rc.1 profile 的解析和 wildcard exports 则由下列真实宿主场景验证。双 Context 自动化隔离不描述成两个真实 CLI profile。

## 场景与结果

表中编号对应模板规格的验收场景。“自动化通过”与“浏览器通过”分别说明实际证据，不互相替代。

| 场景 | 操作与预期 | 实际结果 | 状态 |
| --- | --- | --- | --- |
| 1、2 纯配置接入、身份与名称 | 本地添加 @acme/workflows；资源目录 review，YAML id acme-review、name 团队代码审查；两工作区应共享选择结果 | 原生插件管理显示一个加载组件；列表、选择器、详情显示 YAML 名称，详情根 ID 为 acme-review；A/B 均能创建 | 真实宿主/浏览器通过；HTTP 自动化通过 |
| 3、12 默认装配 | 干净 home 只添加默认 bundle；应有三个内置节点、六份独立中英文模板 | 工坊入口可用，六份名称和来源均有效；bundle 页面显示公共登记、三个节点、Studio、六个加载声明共 11 个组件；创建 OpenSpec 中文实例进入 form 等待态 | 真实宿主/浏览器通过；六模板及双语结构自动化通过 |
| 4 模板 ID 冲突 | 启用 fixture duplicate，使 acme-review 重复；所有贡献不可用，撤销单项应恢复 | 两条来源均保留，按钮及选择器选项禁用并列出冲突来源；原已开详情再次激活显示冲突；只关闭 duplicate 组件后 @acme 自动恢复 | 真实宿主/浏览器及 HTTP 自动化通过 |
| 5 加载/校验诊断 | 无资源、坏 YAML、缺失/空白 id/name、非法节点字段应不可用；layout 警告不阻断 | 浏览器验证坏 YAML、缺 name、缺 node_kind 的来源与原因；有效模板继续可用；layout-warning 可打开并创建 Layout warning B。HTTP 另覆盖 ENOENT、缺失/空白元数据、五类非法 command/prompt/is_auto_start 配置及详情/创建拒绝；未知业务字段保存到快照 | 上述浏览器与自动化子项通过；未在浏览器逐个操作全部非法值 |
| 6、13 读文件时机与快照 | 节点缺失时修改文件；刷新/恢复节点仍用旧定义，声明重载后用新定义 | bash 关闭后修改 example name 为新版、command 为 printf；刷新仍显示旧名称；恢复 bash 后创建 Before reload A，详情仍为 git diff --stat。关闭/开启模板组件后显示新版，After reload B 的快照为新版命令；旧实例仍为原名称/命令 | 真实宿主/浏览器及 HTTP 自动化通过；示例文件已恢复 |
| 7 模板撤销与节点撤销 | 仅关闭模板仍可执行旧快照；关闭所需节点禁止新执行但保留查看 | 模板从库撤销、旧详情显示不存在；Snapshot review A 仍显示原命令，手动 bash 在临时 Git 工作区执行成功并保存空对象结果。随后关闭 bash，已有实例显示类型不可用，完成事实仍可查看；恢复节点后解除暂停 | 真实宿主/浏览器通过；节点阶段在途保存/恢复自动化回归通过 |
| 8 旧 home 入口 | 放置 legacy YAML，启动不能发现或复制模板，也不能删除旧文件 | legacy 未出现在列表/选择器；home 的旧模板目录仍只有原 legacy 文件，内容未变，没有内置模板复制 | 真实宿主/浏览器 + 文件核对通过；Studio 独立装配自动化通过 |
| 9 工坊 UI | 检查列表、详情、选择器、快照名称；主题语言与窄屏可用 | 最终构建中文深色 1366×900、英文浅色 390×844：名称/来源分行，诊断换行，创建表单与只读详情可用；窄屏 document scrollWidth=390、模板项未横向溢出，Tab 区域按原交互横向滚动 | 真实浏览器通过 |
| 10 重载失败两种边界 | 宿主配置拒绝保留旧贡献；真正卸载后坏定义不能回滚 | Cordis Fiber.update 拒绝空 directory 后原模板仍有效；真实浏览器关闭/开启组件并读取 dag: invalid 后显示新 INVALID_STANDARD_FIELD 错误，旧有效模板未恢复，旧实例仍可查看 | 配置拒绝：固定项目 Cordis 自动化通过，未在原生配置编辑 UI 实测；卸载后失败：真实宿主/浏览器通过 |
| 11 具体节点依赖 | 缺失/冲突 node_kind 保留诊断，恢复自动可用，详情/创建同判定 | 浏览器缺失 fixture 类型保持诊断；原生关闭 bash 后 acme/Matt 不可用，而不依赖 bash 的 Spec Kit/OpenSpec 仍有效；恢复 bash 后自动有效。HTTP 装配迟到 external、冲突两来源、撤销冲突，验证详情/创建一致 | 浏览器缺失/恢复通过；类型迟到及冲突自动化通过 |
| 14 profile 与存储作用域 | 所属 profile 独立，工作区共享贡献，实例仍按 workspace 分组 | 两个独立 Cordis host Context 的同 ID 模板、节点登记不串用；真实 web profile 的 A/B 共用模板，A 两实例与 B 三实例分别显示，刷新和插件构建热重载后仍保留各自快照 | profile 隔离自动化通过；真实同 profile 跨工作区通过；未启动第二个真实 CLI profile |

## 证据与复现

- 默认接入：构建仓库后，对新的临时 home 执行 `dsh plugin --profile web add <repo>/packages/dsh-workflow-bundle --registry=https://registry.npmjs.org`，按项目 [浏览器验收技能](../../.agents/skills/dsh-browser-e2e/SKILL.md) 的 patch 和非默认端口启动。
- 第三方示例：添加 `<repo>/examples/review-templates`；原生插件管理分别控制 bundle 下的加载组件。fixture 的 README 列出冲突和诊断声明，单独添加到临时 profile。
- 不重读复现：先关闭 bundle 的 bash 组件，修改已加载模板 YAML，再刷新并恢复 bash；观察名称与创建后的 command 不变。只有模板组件关闭/开启后才读取新内容。
- 不回滚复现：有效模板加载后将 dag 改为非数组，关闭/开启自身模板组件；列表应显示新错误，旧实例应继续显示快照。恢复文件并再重载即可恢复库贡献。
- [中文深色列表截图](./assets/template-plugin-distribution/desktop-zh-dark.jpg)、[英文浅色窄屏截图](./assets/template-plugin-distribution/narrow-en-light.jpg)来自最终构建。截图只辅助页面证据，生命周期结论以上表实际操作及自动化断言为依据。
- 两轴 code-review 覆盖基线以来实际修改和新增文件：Standards 发现一项被删除的节点配置测试覆盖，已迁移并复审通过；Spec 无发现；最终两轴无剩余问题。

## 剩余及清理

- 第三步：使用同一个第三方 bundle 同时贡献自定义节点与模板，验证一起装配、类型冲突/撤销/恢复及快照联动；本阶段的默认 bundle 和“第三方模板引用内置 bash”不能替代这项联合验收。
- 真实模型回复没有执行，未提供或读取模型凭据；模板浏览、form 等待态及 bash 执行不代表 session_agent 的真实模型业务链已经验收。
- 原生 UI 的重载前非法配置拒绝，以及第二个真实 CLI profile，未单独执行；已有自动化边界结果如表所列，后续需要真实环境证据时补验，不把它们写成浏览器通过。
- 本次 host 已停止，临时 home、工作区及测试登录信息已清理；作者示例 YAML 恢复原内容。必要截图和本记录保留，用户日常 profile 未改动。
