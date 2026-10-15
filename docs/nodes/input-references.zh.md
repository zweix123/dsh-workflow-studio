# Agent / Bash 的输入引用

[返回整体语法](../dag-syntax.zh.md) · [Agent 节点](./agent/README.zh.md) · [Bash 节点](./bash/README.zh.md)

本文说明 Agent `prompt` 与 Bash `command` 对 [Nunjucks 默认语法](https://mozilla.github.io/nunjucks/templating.html)的使用。边 `if` / `for` 使用相同表达式语法，但消费原生值，见 [DAG 表达式](../dag-syntax.zh.md#5-字段引用if-与-for-的写法)。

## 上下文与输出

文本上下文来自当前节点合并后的输入，不隐式读取其他节点或追加整份输入。固定业务属性路径须在 `input_schema` 中声明；模板局部变量、宏参数、循环变量及库内置名称不作为业务字段。动态访问与计算结果无法确定结构时允许执行，仍检查其他已知引用。

字段始终输出文本，即使仅有一个插值也不切换为原生对象或数组。转换遵循库：对象通常是 `[object Object]`，数组通常以逗号连接；需要 JSON 时显式写 `{{ value | dump }}`。`0`、`false` 和空字符串保留，正常缺失值输出空文本。关闭 HTML 自动转义，`<`、`&` 等原样输出；显式编码 filter 仍遵循库。插入的数据不会再次作为模板执行；字面模板标记使用库的 raw。

Agent 可使用条件、文本循环、set、宏、raw、注释、内置 filter、test 与全局函数。文本循环只产生文本，不创建工作流实例。语法和可确定引用错误在节点配置校验时报出，包含节点及 prompt/command 字段；渲染错误走节点业务错误与重试边界。

## Bash 数据参数

Bash 每个 `{{ ... }}` 先由库渲染为文本，再自动进行 Shell 参数编码。无需 shellarg，不对整条命令编码，显式 filter 不能绕过编码。缺失值成为一个空参数。每个插值必须是独立且未额外加引号的数据参数；禁止命令名、参数拼接、引号、注释、命令替换及 heredoc 等位置，详见 [Bash 输入用法](./bash/README.zh.md#输入如何使用)。Bash 不支持模板控制结构、模板注释或空白裁剪标记生成命令骨架。

## 环境与恢复

使用无外部加载器的同步 Nunjucks 环境；不配置文件系统目录、自定义或异步扩展。不提供 include/import/extends 的外部文件加载生命周期。通用语法和内置能力以库文档为准；环境配置见 [Nunjucks API](https://mozilla.github.io/nunjucks/api.html)。

每次新的 Agent/Bash 业务尝试重新渲染，random 等结果可能改变。已成功保存的业务仅重提 DAG 时不重新执行业务；已保存 DAG 决策的普通恢复不重新求值。回滚重提与未保存 DAG 状态的恢复重提见 [DAG 错误边界](../dag-syntax.zh.md#121-错误分类)。

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
