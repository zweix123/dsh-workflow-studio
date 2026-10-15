# Agent / Bash 的输入引用

[返回整体语法](../dag-syntax.zh.md) · [Agent 节点](./agent/README.zh.md) · [Bash 节点](./bash/README.zh.md)

本文定义 `prompt` / `command` 中的文本插值；边上 `if` / `for` 使用的 `$.field` 另见 [DAG 表达式](../dag-syntax.zh.md#5-字段引用if-与-for-的写法)。

## 书写与取值规则

仅支持 `{{ name }}` 和 `{{ object.field }}`；字段与对象路径都必须在当前节点 `input_schema` 中声明。变量名和路径段使用字母或下划线开头的标识符。未知路径、过滤器、条件、循环、数组索引和 `$.` 引用在模板判定阶段拒绝。不自动追加整份输入。

字符串使用原值，数字、布尔值、对象、数组使用 JSON 文本。零、`false`、空字符串保留原值；来源关闭或跳过导致的正常缺失（包括不可到达的对象路径）替换为空文本。输入声明仍须具有潜在来源，不能以运行时的空文本规则绕过静态来源校验。

Bash 还要求引用是独立的数据参数，转义及位置限制见 [Bash 输入用法](./bash/README.zh.md#输入如何使用)。

## 组合示例

以下 YAML 可作为模板定义；包的构造与加载见[模板作者指南](../template-plugin-authoring.zh.md)。

```yaml
id: input-example
name: 示例工作流
type: dag
dag:
  - id: request
    type: node
    node_kind: form
    output_schema: { text: string }
  - id: discuss
    type: node
    node_kind: agent
    input_schema: { text: string }
    prompt: "处理需求：{{ text }}"
  - id: verify
    type: node
    node_kind: bash
    input_schema: { text: string }
    command: "printf '%s' {{ text }}"
  - type: edge
    from: request
    to: discuss
  - type: edge
    from: request
    to: verify
  - type: edge
    from: discuss
    to: verify
```

verify 同时等待会话完成并从 request 接收真实 text；会话空输出不会透传业务字段。mattpocock 与 OpenSpec 中文内置模板通过需求表单取得真实输入。Wayfinder 的 Agent 节点直接声明业务输出，由完成操作核验并交付；OpenSpec 的方案节点声明并交付实际 change 名称，实施与归档采用无输出的台前会话。对象或数组可由 form 的结构化契约直接收集；需要粘贴 JSON 文本时，也可由 `printf '%s' {{ result_json }}` 的 bash 节点交付并校验 JSON 对象。mattpocock 模板保留条件分支与递归流程，并直接交付结构化 Agent 结果；OpenSpec 模板由需求表单、澄清需求与生成方案、实施与验证、同步规格与归档四阶段组成；需求只传给方案节点，方案交付的名称直接传给实施和归档。
