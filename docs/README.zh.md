# 文档导航

适用于 `@deepseek-ai/dsh@0.2.0-rc.1`。安装插件见[项目 README](../README.zh.md#从源码安装)。

## 编写和使用工作流

1. 先读[整体 DAG 语法](./dag-syntax.zh.md)：最小模板、定义结构、输入输出、依赖、条件、逐项执行、嵌套与递归。排布和精确执行语义可按需查阅。
2. 阅读流程所用的[内置节点](#内置节点)，了解各节点如何执行任务、产生结果和完成。
3. 按[模板作者指南](./template-plugin-authoring.zh.md)构造模板包、加载到宿主、验证与重载。

完整规则集中在本目录。可使用 [dsh-template-authoring skill](../skills/dsh-template-authoring/SKILL.md)辅助编写；skill 读取这些文档并组织工作步骤。

## 内置节点

| 节点 | 适用任务 | 重点内容 |
| --- | --- | --- |
| [Agent](./nodes/agent/README.zh.md) | Agent 分析、讨论或执行任务 | 台前/台后、提示词、结构化结果、完成确认与恢复 |
| [Bash](./nodes/bash/README.zh.md) | 工作区命令与脚本 | 参数引用、沙箱、stdout JSON、模板附属文件与重试 |
| [Form](./nodes/form/README.zh.md) | 人工填写和确认 | Schema 与 uiSchema、预填、默认值、对象数组、枚举多选与提交 |

Agent 与 Bash 共用的 `{{ }}` 规则见[输入引用](./nodes/input-references.zh.md)。每个节点目录以 `README.zh.md` 为完整入口。

## 开发功能体验

- [开发功能模板](../packages/dsh-workflow-dev-templates/README.zh.md)：单独体验节点能力，作为开发时附加包使用。

## 插件与内部开发

- [节点插件作者指南](./node-plugin-authoring.zh.md)：公共契约、登记、执行、恢复及可选浏览器能力。
- [模板插件作者指南](./template-plugin-authoring.zh.md)：资源、依赖、装配与加载生命周期。
- [内部 DAG 引擎 API](./development/dag-engine-api.zh.md)：直接调用、查询、提交与异常处理。

## 规格与维护记录

[产品规格](./specs/)定义需求和验收预期，[验收记录](./acceptance/)记录实际验证范围，[架构决策](./adrs/)说明长期设计选择。[CONTEXT.md](../CONTEXT.md)维护领域词汇，[AGENTS.md](../AGENTS.md)维护仓库约定。

[节点与 DAG 的运行记录](./specs/node-run-records.zh.md)已实施各节点业务历史、DAG 异常历史和统一重试交付；实际验证、环境与未验证项见[验收记录](./acceptance/node-run-records.zh.md)。

[标识符字符规则与定义名称](./specs/identifiers-and-data-references.zh.md)已实施统一 ID 与逐项 key 字符规则、JSON 业务字段名及可选 name 展示；实际自动化与宿主验证范围见[验收记录](./acceptance/identifiers-and-data-references.zh.md)。

[文本插值与表达式求值](./specs/text-expressions.zh.md)已实施并通过项目自动化和真实宿主回归；覆盖与未验证范围见[验收记录](./acceptance/text-expressions.zh.md)，用户写法见整体 DAG 语法和节点文档。

Form 填写浮窗的宿主样式与布局要求见[规格](./specs/form-dialog.zh.md)，实际验证见[验收记录](./acceptance/form-dialog.zh.md)。
