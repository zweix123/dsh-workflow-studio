---
name: dsh-template-authoring
description: 为 dsh-workflow-studio 定义或修改工作流模板，编写 DAG、节点提示词与输入输出契约，构造纯配置模板 bundle，并指导本地加载、重载和验证。用户要求创建模板、把流程做成模板插件或加载自己的 workflow.yaml 时使用；不用于通用 Codex skill 创建或独立节点插件开发。
---

# 编写并加载 dsh 工作流模板

将用户的流程做成可加载的模板 bundle。适配本项目固定的 `@deepseek-ai/dsh@0.2.0-rc.1`；不安装或内置 dsh CLI，不增加 npm 发布流程。

通常只需三个文件：`package.json` 声明 bundle 和资源导出，`cordis.patch.yml` 声明模板加载器，`templates/<name>/workflow.yaml` 描述流程。默认 bundle 提供 Studio、模板加载器及三个内置节点，不为普通模板新写 TypeScript 注册服务。

## 先确定流程与交付范围

从当前请求提取目标、输入来源、步骤、人工决策、输出和目标目录。缺少会改变流程的信息时，集中询问；已有明确要求不重复确认。只要求讲解时提供实例和命令；要求创建或修改时交付真实文件；要求加载时才操作相应宿主配置，沿用已授权范围。

先用一句具体路径说明设计，例如：用户填写需求 → Agent 处理 → 用户确认结果 → 命令检查。逐个明确字段由哪个节点产生、由哪个节点消费，以及每一步如何完成，随后再写 YAML。

## 读取当前契约

在仓库内使用时，定位仓库根目录并遵守其 `AGENTS.md`。本技能保存在 `<repo>/skills/dsh-template-authoring`，不绑定个人绝对路径。下载时保留整个目录（含 references、assets 和 agents），可将 `SKILL.md` 作为 Agent 的入口；单独复制此文件会丢失示例及加载指南。

仓库可用时，创建或修改前先读：

- `docs/template-plugin-authoring.zh.md`：包、补丁、模板身份与加载契约。
- `docs/dag-syntax.zh.md` 第 3～6 节：节点配置、Schema、表达式、输入来源和边界。
- 用户指定的现有模板；没有指定时使用本技能的 [assets/starter](assets/starter) 作为小型可复制起点。

独立下载而没有仓库时，先读随附的 authoring 和 loading 两份参考，基础模板可从 starter 改写。需要它们未覆盖的语法、其他版本或自定义节点时，取得对应项目文档/代码再继续，不猜测能力；缺少项目编译器时标记这层验证未执行。

有条件、逐项执行、递归或复杂布局时，再读 DAG 文档对应章节。涉及自定义节点时检查 `docs/node-plugin-authoring.zh.md` 及其真实契约；不能仅在 YAML 写一个新 `node_kind` 就宣称支持。文档与代码矛盾时核对实现并说明，不将旧规格中的“历史基线”当成当前规则。

## 编写内容

遵守以下易错约束；完整示例和编写方法见 [references/authoring.md](references/authoring.md)。

- 模板根为 `type: dag`，根 `id`、`name` 均非空。ID 在同一 profile 内唯一，目录只定位资源。整份定义中显式 ID 全局唯一，边引用本层顶点。
- 工坊创建实例没有外部根业务输入，根 `input_schema` 省略或为 `{}`；人工输入用入口 `form` 收集。
- 默认节点为 `form`、`session_agent`、`bash`。Schema 是字段到类型的映射，不是完整 JSON Schema；对象/数组使用带 `properties`/`items` 的结构化描述。
- `form` 只支持 string、number、boolean；字段以 `output_schema` 为准，`schema.properties` 和 `uiSchema` 仅补充表单展示信息。输入契约只写有上游来源、用于同名预填的字段。
- `session_agent` 提供 `prompt`，只消费输入。其 `output_schema` 只能省略或为 `{}`，用户手动完成时提交 `{}`，不会提取对话结果，也不透传输入。下游需要业务结果时增加人工结果表单，或采用能真实产生结果的 bash。
- `bash` 提供 `command`。有输出声明时 stdout 必须整体为满足契约的 JSON 对象，日志写 stderr；无输出声明时 stdout 只是日志，提交 `{}`。
- 每个输入字段都必须有潜在上游输出声明，不能假定数据沿链路自动透传。多个前驱的同名输出会冲突，即使条件互斥；边没有自定义字段映射语法。
- `prompt`/`command` 引用用 `{{ field }}` 或 `{{ object.field }}`，必须在本节点输入中声明。bash 占位符须独立、未额外加引号，不能拼进参数或命令名。
- `if`、`for` 写在边上，使用 `$.field`。不支持 JavaScript 表达式、布尔组合、嵌套字段或索引。复杂需求先读取准确语义，不能自创字段。
- `is_auto_start` 只用于 session_agent/bash，默认 false；按用户要求决定自动启动，不能把它当成自动完成或自动授权后续动作。
- 提示词写清任务、输入、范围、产物和人工交接方式。不能用“输出 JSON”的提示词伪装 session_agent 已支持结构化交付。其他对话的上下文也不会自动成为本节点输入。

项目仅维护 `packages/dsh-workflow-studio/templates/matt-pocock-wayfinder-workflow.zh/workflow.yaml` 这一份 mattpocock 中文内置模板，保留现有模板 ID，不补建英文版或其他内置模板。`.zh` 是目录语言后缀。第三方模板如按用户要求提供多语言版本，各版使用独立根 ID；修改根 ID 时同步其根自递归引用。

## 构造模板插件

复制 starter 到用户目标目录，再统一修改包名、loader ID、模板 ID、展示名称及目录地址。starter 是独立的中文单模板示例，不属于项目内置模板；第三方模板只在用户明确需要双语时增加对应版本。

`package.json` 的 `dsh.bundle.patch` 指向补丁文件，`exports` 暴露对应 `workflow.yaml`。补丁中每个加载器实例只配置 `directory: '<包名>/templates/<目录>'`，它是包资源地址，不是文件系统相对路径。不重复写 `config.id`、`config.name` 或节点清单。

一个包可以贡献多份模板，每份有独立 loader ID、directory 和模板根 ID。消费默认节点时只贡献模板，不重复装配默认节点。模板加载时读取 YAML 并保存解析后的父目录；包内脚本和文档可用 Bash 的 DSH_TEMPLATE_DIR 引用，例如 `bash "$DSH_TEMPLATE_DIR/scripts/init.sh"`。无需 input_schema 或资源字段，附属文件无需逐个 exports；普通相对路径和产物仍基于工作区。YAML 为实例快照，附属文件读取执行时当前内容；成功节点不因更新重跑，缺失或移动沿用 Bash 错误与人工重试，历史实例不自动补来源。session_agent 不注入路径，沿用沙箱且不提升权限。

## 校验、加载与交付

按 [references/loading.md](references/loading.md) 核对 profile、加载前提、命令及重载语义。

校验 YAML/JSON、exports 与资源地址、ID、DAG 编译及具体节点配置。使用项目已有编译器时传入空根提供方 `compile(definition, {})`，随后用真实节点定义检查业务配置；仅解析 YAML 不足以证明模板可用。不为一份普通模板新建通用验证框架。

若用户要求实际加载或跑通，在目标范围内验证模板名称与来源、创建实例、输入到达下游及完成结果。测试 session_agent 时区分人为确认完成与真实模型执行成功。涉及本项目 UI 改动时遵守项目浏览器验收技能；单纯写模板不必修改 UI。

交付文件入口、流程阅读顺序、具体加载命令、验证结果及未验证项。只做静态验证就明确写静态通过。需要保留真实宿主结果时按项目约定写验收记录；不为技能或普通小模板强制创建规格、验收报告或提交 Git。
