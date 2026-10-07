- 项目定位：为 Agent deepseek-harness（简称 dsh）开发插件；这是全新独立项目，结构和命名保持独立。
- 开发依赖：`references/` 中的代码可供借鉴，但该目录下的内容不得纳入 Git；其中 `references/dsh-workflow-ui` 是按照当前思路已经实现的一个半成品，可以作为主要参考的实现。
- 文档约定：`docs/dag-syntax.zh.md` 是面向用户的 DAG 语法文档，说明标准字段、完整语义和用法；产品需求、功能范围与验收规格统一放在 `docs/specs/`，需要长期保留的实际验收结果放在 `docs/acceptance/`，与用户文档分开维护；`CONTEXT.md` 维护领域词汇；`AGENTS.md` 保留项目约定。
- UI 设计：尽量参考 dsh 宿主的原生 UI 风格，优先复用宿主已有组件、主题变量和插槽传入的尺寸；自定义界面的字体、间距、图标、圆角、边框及交互状态应与宿主同类页面保持一致，并兼顾浅色/深色主题、中英文和窄屏显示。
- 版本要求：固定适配 `@deepseek-ai/dsh@0.2.0-rc.1`，相关开发依赖与该版本对齐；后续升级另行安排。
- npm 源故障处理：安装公开依赖时，默认在安装命令中追加 `--registry=https://registry.npmjs.org`，显示使用公共 npm 源；保持依赖版本约束，不修改全局 npm 源配置。
- 安装与分发：仅开发插件，不内置或安装 dsh CLI；用户自行安装本机 dsh，再通过本地目录添加插件。当前不维护分发或发布流程。
- 按需建设：没有实现需求时，不创建预留目录或增加抽象。
- 模块依赖：`workflow/` 通过公共登记选择并调用独立节点插件的能力，负责工作流执行状态与持久化协调；节点插件不依赖 Studio 的 `workflow/`、`dag/` 或工作流实例状态类型。
- 内置模板：仅保留 `packages/dsh-workflow-studio/templates/matt-pocock-wayfinder-workflow.zh/workflow.yaml`，为 mattpocock 的中文版；不维护英文版或其他内置模板。目录名中的 `.zh` 是语言后缀，保留现有模板 ID。

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
packages/dsh-workflow-node/      # 公共节点契约、profile 级登记与可选浏览器能力
packages/dsh-workflow-bundle/    # 普通 dsh 默认装配，模板部分留待下一阶段
packages/dsh-workflow-node-session-agent/      # session_agent 节点服务端与前端
packages/dsh-workflow-node-bash/      # bash 节点服务端与前端
packages/dsh-workflow-node-form/      # form 节点服务端与前端
```
