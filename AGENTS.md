- 项目定位：为 Agent deepseek-harness（简称 dsh）开发插件；这是全新独立项目，结构和命名保持独立。
- 开发依赖：`references/` 中的代码可供借鉴，但该目录下的内容不得纳入 Git；其中 `references/dsh-workflow-ui` 是按照当前思路已经实现的一个半成品，可以作为主要参考的实现。
- 文档约定：根目录 `README.weixin.md` 使用中文，简要说明当前功能和试用方式；`docs/dag-syntax.zh.md` 是面向用户的 DAG 语法文档，说明标准字段、完整语义和用法；产品需求、功能范围与验收规格统一放在 `docs/specs/`，与用户文档分开维护；`CONTEXT.md` 维护领域词汇；`AGENTS.md` 保留项目约定。
- UI 设计：尽量参考 dsh 宿主的原生 UI 风格，优先复用宿主已有组件、主题变量和插槽传入的尺寸；自定义界面的字体、间距、图标、圆角、边框及交互状态应与宿主同类页面保持一致，并兼顾浅色/深色主题、中英文和窄屏显示。
- 版本要求：因宿主代码问题，短期固定适配 `@deepseek-ai/dsh@0.1.6-alpha.2`，相关开发依赖与该版本对齐；继续基于该版本迭代，待宿主稳定后再单独安排升级。
- npm 源故障处理：安装公开依赖时，默认在安装命令中追加 `--registry=https://registry.npmjs.org`，显示使用公共 npm 源；保持依赖版本约束，不修改全局 npm 源配置。
- 安装与分发：仅开发插件，不内置或安装 dsh CLI；用户自行安装本机 dsh，再通过本地目录添加插件。当前不维护分发或发布流程。
- 按需建设：没有实现需求时，不创建预留目录或增加抽象。

## 项目结构

```text
packages/dsh-workflow-studio/
├── src/
│   ├── index.ts                  # Host 插件入口
│   ├── shared/                   # 插件常量、前后端协议
│   ├── host/
│   │   ├── apply.ts              # 服务装配和生命周期
│   │   ├── dag-engine/           # 独立 DAG 编译与状态引擎，index.ts 统一导出
│   │   ├── runtime/              # 薄运行时：实例初始化与逐节点占位执行
│   │   ├── routes/plugin-status.ts    # GET /api/dsh-workflow-studio/status
│   │   ├── service/              # 领域服务
│   │   └── storage/              # 仅文档占位：运行持久化
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
```
