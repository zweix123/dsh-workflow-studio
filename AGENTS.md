- 项目定位：为 Agent deepseek-harness（简称 dsh）开发插件；这是全新独立项目，结构和命名保持独立。
- 开发依赖：`references/` 中的代码可供借鉴，但该目录下的内容不得纳入 Git；其中 `references/dsh-workflow-ui` 是按照当前思路已经实现的一个半成品，可以作为主要参考的实现。
- 文档约定：`docs/README.zh.md` 提供阅读导航，`docs/dag-syntax.zh.md` 维护面向用户的整体 DAG 语法、标准字段与完整编排语义，内置节点用法按 `node_kind` 分目录维护在 `docs/nodes/<kind>/README.zh.md`；产品需求、功能范围与验收规格统一放在 `docs/specs/`，需要长期保留的实际验收结果放在 `docs/acceptance/`；`CONTEXT.md` 维护领域词汇；`AGENTS.md` 保留项目约定。
- UI 设计：尽量参考 dsh 宿主的原生 UI 风格，优先复用宿主已有组件、主题变量和插槽传入的尺寸；自定义界面的字体、间距、图标、圆角、边框及交互状态应与宿主同类页面保持一致，并兼顾浅色/深色主题、中英文和窄屏显示。
- 表单配置：优先遵循 JSON Schema 的字段描述约定与 [RJSF 的 uiSchema 展示约定](https://rjsf-team.github.io/react-jsonschema-form/docs/api-reference/uiSchema/)，不另造同用途配置语法。默认控件根据字段类型与 enum 自动选择，uiSchema 作为可选的显式展示覆盖；按实际需求实现并文档化支持子集，不宣称完整兼容，也不因采用约定而必须引入完整 RJSF 库。
- 版本要求：固定适配 `@deepseek-ai/dsh@0.2.0-rc.1`，相关开发依赖与该版本对齐；后续升级另行安排。
- npm 源故障处理：安装公开依赖时，默认在安装命令中追加 `--registry=https://registry.npmjs.org`，显示使用公共 npm 源；保持依赖版本约束，不修改全局 npm 源配置。
- 安装与分发：仅开发插件，不内置或安装 dsh CLI；用户自行安装本机 dsh，再通过本地目录添加插件。当前不维护分发或发布流程。
- 按需建设：没有实现需求时，不创建预留目录或增加抽象。
- 可重复 E2E：UI 功能与修复的稳定验收场景保存到 `e2e/**/*.e2e.ts`，随功能提交；通过 `npm run test:e2e` 在隔离的真实 dsh 宿主中运行。AI 探索操作应转成明确操作和断言；不能只留下文字验收或截图。组织与执行约定见下文，环境要求和当前覆盖见 `e2e/README.md`；Codex 内置浏览器用于探索、人工检查与定位。
- 模块依赖：`workflow/` 通过公共登记选择并调用独立节点插件的能力，负责工作流执行状态与持久化协调；节点插件不依赖 Studio 的 `workflow/`、`dag/` 或工作流实例状态类型。

## 用户文档与 Skill 维护

- 阅读顺序为整体 DAG 语法、所用节点、模板接入；节点与模板插件作者指南分别维护开发和装配契约，内部引擎调用说明放在 `docs/development/`。
- 每个内置节点的文档覆盖用途与示例、配置字段、输入使用、输出产生、执行与完成、失败重试及恢复、支持范围。先在单个入口文件中完整说明，实际内容增长后再拆专题，不预建空目录或占位文档。
- 公共 DAG 文档负责编排与数据契约，节点文档负责所选 kind 的业务配置和行为。节点自动启动等能力按实际支持范围记录；DAG 表达式与节点文本插值分别说明；Form 的 JSON Schema 注解和 RJSF uiSchema 明确列出支持子集。
- 完整规则集中维护在 `docs/`。Skill 保留任务范围、文档读取入口、执行步骤及验证交付要求，通过链接引用规则，不在 `SKILL.md` 或 `references/` 另存一套语法、节点或加载说明；可复制到交付物的资产按需保留。
- Skill 优先读取对应本地仓库的 docs；无本地仓库时，读取 `https://github.com/zweix123/dsh-workflow-studio` 默认分支中对应文档的实际内容，按任务选择具体入口，并沿相关链接继续读取。用户指定版本或 ref 时使用对应文档；读取失败须说明缺少依据，不凭记忆推定未确认的能力。
- 文档拆分或迁移时同步导航、跨文档链接、章节锚点及 Skill 入口；优先链接文档和具体主题，不在 Skill 中依赖易变的章节编号。示例注明完整模板、节点片段或纯引擎定义，保持公共规则与节点限制完整可查。

## 可重复浏览器 E2E 约定

- 默认 `npm run test:e2e` 无界面执行操作和断言，不录屏、不主动截图；需要观察时加 `--headed`，不增加演示用固定等待。当前框架失败时仍自动保存诊断截图。
- 支持按文件执行：`npm run test:e2e -- e2e/form-handoff.e2e.ts`；文件内按用例名称筛选：`npm run test:e2e -- e2e/form-handoff.e2e.ts --grep "宿主重启恢复"`。筛选与 `--headed` 可以组合；`--grep` 匹配完整 `test(...)` 的名称，不会只执行其中某个步骤或断言。
- 随 case 增长按功能归类目录，例如 `e2e/forms/`、`e2e/workflows/`；文件放相关场景，每个 `test(...)` 表达一个可独立验收的业务行为或完整用户链路，名称明确区分场景。不按点击步骤拆文件，不提前创建空目录。
- 每条 case 能单独执行，自行准备前置数据；不依赖其他 case 的执行顺序、浏览器状态或结果。需要单独验证原有链路中的行为时，新增独立 `test(...)` 并准备其前置状态，不能只截取原用例的后半段。
- 复用 `e2e/dsh.ts` 的隔离宿主夹具；环境准备和已实际重复的页面操作按需提取，预期结果与断言保留在对应 case。暂不为未来场景建立通用页面对象或额外执行框架。
- 新功能先运行对应 case，再运行受影响的既有 case；保留测试代码、可复现夹具、结果报告及脱敏日志。具体操作遵循 `dsh-browser-e2e` skill；`npm run check` 的 E2E 类型检查不能代替真实浏览器运行。

## 验收文档约定

- spec 定义行为规则、验收场景和预期结果，并维护简短的实施及验证状态；详细实际结果通过链接指向验收记录，不在 spec 中累积实施流水账或历轮测试报告。
- 验收记录按需创建：涉及真实宿主、人工操作、环境限制，或需要跟踪失败及未验证项时，在 `docs/acceptance/` 保留记录。普通小改动且已有自动化测试充分覆盖时，在交付说明中记录验证即可，不强制新增验收文档。
- spec 与验收记录不要求一一对应，也不要求同名。一次验收可以覆盖多个 spec，相关 spec 链接同一记录；记录中明确列出所依据的 spec。同一功能的多轮复验通常更新原记录，注明日期、被测版本或明确的代码范围及结论变化；重要历史失败注明适用版本，不能混作当前结论。
- 记录保留验证环境、场景的预期与实际、通过/失败/未验证状态、剩余事项及必要证据。区分自动化与真实宿主验证，不将部分通过或自动化通过写成整体验收通过；不保留无关工作区差异、逐步实施过程等流水账。
- 日志、截图按需引用，不要求全部收入仓库。正文应保留足以理解结论和复现关键问题的信息，临时目录或个人绝对路径不能作为唯一的长期证据。验收结论更新时同步相关 spec 的简短状态与链接。

## 项目结构

```text
packages/dsh-workflow-studio/
├── src/
│   ├── index.ts                  # Host 插件入口
│   ├── shared/                   # 插件常量、前后端协议
│   ├── host/
│   │   ├── apply.ts              # 服务装配和生命周期
│   │   ├── dag/                  # DAG 编译、图状态与结果提交
│   │   ├── workflow/             # 节点选择、执行状态与恢复
│   │   ├── routes/plugin-status.ts    # GET /api/dsh-workflow-studio/status
│   │   ├── service/              # 模板与工作流实例管理
│   │   └── storage/              # 工作流实例持久化与串行写入
│   └── client/
│       ├── index.tsx             # dsh 插槽注册
│       ├── pages/                # 顶层页面，其他页面与工坊并列
│       │   └── workflow-studio/  # 工坊标题、Tab 切换和页面装配
│       │       ├── WorkflowStudioPanel.tsx
│       │       ├── styles.ts     # 工坊公共布局
│       │       ├── instances/    # 实例 Tab 的页面与业务逻辑
│       │       │   └── InstancesPanel.tsx
│       │       └── templates/    # 模版 Tab 的页面与业务逻辑
│       │           └── TemplatesPanel.tsx
│       ├── apis/                 # API 调用与响应验证
│       └── locales/              # 中英文词表，跟随宿主语言
├── tests/
├── scripts/build.mjs
├── package.json
└── cordis.patch.yml
packages/dsh-workflow-template/  # 通用模板加载与登记插件
packages/dsh-workflow-template-*/ # 各模板的独立纯配置插件包
packages/dsh-workflow-node/      # 公共节点契约、profile 级登记与可选浏览器能力
packages/dsh-workflow-bundle/    # 普通 dsh 默认装配，引用节点与业务模板包
packages/dsh-workflow-dev-templates/ # 开发时附加的节点功能模板，默认 bundle 不依赖
packages/dsh-workflow-node-agent/      # agent 节点服务端与前端
packages/dsh-workflow-node-bash/      # bash 节点服务端与前端
packages/dsh-workflow-node-form/      # form 节点服务端与前端
```
