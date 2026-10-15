---
name: dsh-template-authoring
description: 为 dsh-workflow-studio 定义或修改工作流模板，编写 DAG、节点提示词与输入输出契约，构造纯配置模板 bundle，并指导本地加载、重载和验证。用户要求创建模板、把流程做成模板插件或加载自己的 workflow.yaml 时使用；不用于通用 Codex skill 创建或独立节点插件开发。
---

# 编写并加载 dsh 工作流模板

将用户的流程做成可加载的模板 bundle。适配项目固定的 `@deepseek-ai/dsh@0.2.0-rc.1`；不安装或内置宿主，不增加发布流程。

## 确定任务与交付范围

提取目标、输入来源、步骤、人工决策、输出和目标目录。缺少会改变流程的信息时集中询问。只要求讲解时提供解释和命令；要求创建或修改时交付文件；要求加载时才操作相应宿主配置，沿用已授权范围。

先概括流程路径，逐个明确字段的产生方、消费方与节点完成条件，再编写定义。提示词要写清任务范围、输入材料、产物和人工交接方式，不假定其他节点的对话自动成为本节点上下文。

## 定位并读取权威文档

完整语法、节点行为与装配规则集中维护在项目 `docs/`。本技能只组织工作步骤，不能仅凭本文或 starter 推定能力。

1. **有对应本地仓库**：优先读取本地 `AGENTS.md` 和下表中对应的 docs 文件，与当前代码保持一致。本技能在仓库内的路径为 `skills/dsh-template-authoring`；独立安装后的技能目录不等于项目根目录。
2. **没有本地仓库**：通过可用的网页读取、HTTP 或 GitHub 工具读取下表链接的正文，不能只记录链接或依据搜索摘要编写。链接中的 `HEAD` 跟随线上默认分支；若网页只返回页面框架，可用 `https://raw.githubusercontent.com/zweix123/dsh-workflow-studio/HEAD/<仓库相对路径>` 读取 Markdown，并按相同目录解析文档中的相对链接。
3. **指定版本或 ref**：读取相应版本的文档；一次任务保持所用文档版本一致。无指定时使用本地版本，或线上默认分支。
4. **读取失败**：说明哪些依据缺失，继续已有依据支持的工作；受影响的字段和能力暂不确认，不凭记忆补写。需要本地代码才能验证的部分标为未验证。

| 何时读取 | 仓库相对路径 / 线上入口 |
| --- | --- |
| 开始编写；目录调整时定位新入口 | [docs/README.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/README.zh.md) |
| 所有模板：定义、Schema、数据来源、依赖与控制流 | [docs/dag-syntax.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/dag-syntax.zh.md) |
| 构造模板包、加载、重载和验证 | [docs/template-plugin-authoring.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/template-plugin-authoring.zh.md) |
| 使用 Agent | [docs/nodes/agent/README.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/nodes/agent/README.zh.md) |
| 使用 Bash | [docs/nodes/bash/README.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/nodes/bash/README.zh.md) |
| 使用 Form | [docs/nodes/form/README.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/nodes/form/README.zh.md) |
| 在 prompt / command 中引用输入 | [docs/nodes/input-references.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/nodes/input-references.zh.md) |
| 使用项目编译器直接校验定义 | [docs/development/dag-engine-api.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/development/dag-engine-api.zh.md) |
| 涉及自定义节点时核对公共接入契约 | [docs/node-plugin-authoring.zh.md](https://github.com/zweix123/dsh-workflow-studio/blob/HEAD/docs/node-plugin-authoring.zh.md) |

按任务读取所需节点及相关主题，无须为普通模板读取所有开发文档。自定义节点还需取得该插件自己的配置说明和实际契约，不能仅在 YAML 新写 kind 就宣称支持。文档与代码矛盾时核对实现并说明，不把旧规格的历史基线当成当前规则。

## 编写与构造

优先修改用户指定的模板。新建时可复制 [assets/starter](assets/starter/)到交付目录，统一修改包名、loader ID、模板 ID、展示名称和资源地址。下载本技能时保留 assets 与 agents；资产是生成起点，完整规则仍按上表读取。

依据文档检查输入是否有声明来源、边是否表达预期依赖、输出能否交付下游，以及节点所选模式的完成条件。自动启动和人工确认按用户需求选择。普通模板使用纯配置 bundle；不要为它新增 TypeScript 注册服务或通用框架。只在用户需要时增加语言版本或新的节点插件。

## 校验、加载与交付

先读取整体 DAG 文档的标识与名称主题，核对定义身份、显示名称、业务字段与逐项 key 的区别，并检查引用仍定位 ID；规则以文档为准。按模板作者指南校验包资源、YAML、DAG 和节点业务配置；分别说明解析成功、编译通过与节点校验通过，不能相互替代。文本与边表达式按输入引用和 DAG 文档使用同一库语法，核对显式 JSON、Bash 数据参数及静态保证的实际边界；验证节点调用、表达式结果和保存恢复，不能只验证库渲染。

用户要求加载或跑通时，按指南核对目标 profile、宿主前提、模板名称与来源、创建实例、数据传递和最终输出。区分模拟结果、真实宿主操作与真实模型执行。涉及 UI 改动时遵守仓库浏览器验收约定，纯模板编写无需修改 UI。

交付文件入口、流程说明、具体加载命令、验证结果和未验证项。需要长期保留真实宿主结果时按仓库约定写验收记录；普通模板任务不强制增加规格或报告，也不自动提交 Git。
