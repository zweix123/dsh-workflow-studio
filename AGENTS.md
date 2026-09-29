- 项目定位：为 Agent deepseek-harness（简称 dsh）开发插件；这是全新独立项目，结构和命名保持独立。
- 开发依赖：`references/` 中的代码可供借鉴，但该目录下的内容不得纳入 Git；其中 `references/dsh-workflow-ui` 是按照当前思路已经实现的一个半成品，可以作为主要参考的实现。
- 文档约定：`docs/dag-syntax.zh.md` 是面向用户的 DAG 语法文档，说明标准字段、完整语义和用法；产品需求、功能范围与验收规格统一放在 `docs/specs/`，与用户文档分开维护；`CONTEXT.md` 维护领域词汇；`AGENTS.md` 保留项目约定。
- UI 设计：尽量参考 dsh 宿主的原生 UI 风格，优先复用宿主已有组件、主题变量和插槽传入的尺寸；自定义界面的字体、间距、图标、圆角、边框及交互状态应与宿主同类页面保持一致，并兼顾浅色/深色主题、中英文和窄屏显示。
- 版本要求：固定适配 `@deepseek-ai/dsh@0.2.0-rc.1`，相关开发依赖与该版本对齐；后续升级另行安排。
- npm 源故障处理：安装公开依赖时，默认在安装命令中追加 `--registry=https://registry.npmjs.org`，显示使用公共 npm 源；保持依赖版本约束，不修改全局 npm 源配置。
- 安装与分发：仅开发插件，不内置或安装 dsh CLI；用户自行安装本机 dsh，再通过本地目录添加插件。当前不维护分发或发布流程。
- 按需建设：没有实现需求时，不创建预留目录或增加抽象。
- 模块依赖：`workflow/` 选择并调用 `nodes/` 中的节点能力，负责工作流执行状态与持久化协调；`nodes/` 不依赖 `workflow/`、`dag/` 或工作流实例状态类型。
- 模板 i18n：`packages/dsh-workflow-studio/templates/<name>/workflow.yaml` 为英文版，`packages/dsh-workflow-studio/templates/<name>.zh/workflow.yaml` 为对应中文版；两版使用相同的 DAG 结构、字段和外部能力，中文模板迭代时同步落实到英文版。目录名中的 `.zh` 是语言后缀，`<name>` 保持一致。

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
│   │   ├── nodes/                # 节点服务端装配登记
│   │   ├── routes/plugin-status.ts    # GET /api/dsh-workflow-studio/status
│   │   ├── service/              # 模板与工作流实例管理
│   │   └── storage/              # 工作流实例持久化与串行写入
│   ├── contract/node/            # studio 提供的公共节点契约
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
packages/dsh-workflow-node-chat/      # chat 节点服务端与前端
packages/dsh-workflow-node-bash/      # bash 节点服务端与前端
packages/dsh-workflow-node-form/      # form 节点服务端与前端
```
