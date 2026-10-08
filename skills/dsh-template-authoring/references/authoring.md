# 从流程写出模板内容

## 先明确数据如何交接

starter 的路径是：`request` 表单收集 `task` → `discuss` 会话消费 `task` → `confirm` 表单收集 `summary`、`approved`。

`discuss → confirm` 只表示等待会话被手动标记完成；没有业务数据流经这条边。用户阅读对话后，在结果表单中正式填写结论。根输出来自最后的表单。

如果 confirm 还要预填 task，须增加 `request → confirm`，并在 confirm 的输入与输出都声明 `task: string`。不能只在 discuss 后增加 `input_schema.task`，因为 discuss 的输出是空对象。

## 提示词的写法

用多行 `prompt: |` 写明：

1. 此节点负责什么，何时算完成。
2. 通过 `{{ field }}` 注入的输入与材料。不要假定新对话记得其他对话内容。
3. 允许的动作及范围。例如审查流程默认不自行修改文件；实现流程则按实际需求写。
4. 应产生的文件、分析结果或决策依据。路径相对于实例工作区。
5. 人工交接方式：让用户阅读并标记完成，再填写结果表单。提示词提及字段时不代表系统会自动提取。

不要在每个节点重复整份流程。自动启动只减少点击；不会使会话自动完成。

## bash 的结果与安全引用

一个只展示输入的节点：

```yaml
- id: show-summary
  type: node
  node_kind: bash
  input_schema:
    summary: string
  command: "printf '%s\\n' {{ summary }}"
```

`{{ summary }}` 不再额外包引号，节点会作为一个 Shell 数据参数转义。它不能写成 `"{{ summary }}"`、`prefix-{{ summary }}`，也不能放进 heredoc。

要把人工提供的 JSON 文本变为真实对象输出，可用 `form` 收集 `result_json: string`，再连到：

```yaml
- id: parse-result
  type: node
  node_kind: bash
  input_schema:
    result_json: string
  output_schema:
    approved: boolean
    summary: string
  command: "printf '%s' {{ result_json }}"
```

用户输入例如 `{"approved":true,"summary":"检查通过"}`。命令输出由节点校验；不完整或非法 JSON 会失败，下游不会推进。这里不是 form 原生支持对象，也不是自动读取 Agent 的回复。

## 条件与复杂图

根据 confirm 的 approved 字段控制下游：

```yaml
- type: edge
  from: confirm
  to: next-step
  if: '$.approved == true'
```

需要同时处理不通过分支时，为另一个目标添加 `if: '$.approved == false'`。分支合并前核对不同来源是否有同名输出；即使条件互斥，同名声明仍会被静态拒绝。DAG 根的必需输出必须在实际完成路径可获得，不能只在某个可能跳过的出口产生。

逐项执行与递归不能靠普通连线猜测：读仓库 DAG 文档第 6、9、10 节。`for` 必须引用对象数组，元素有非空且唯一的字符串 `key`；它是实例身份，不会作为普通项输入传入。递归入边必须有显式 `if`；这不保证运行终止。

布局是可选展示配置，先让数据契约成立，再按需添加 `layout`。它不决定执行顺序。

## Bash 模板附属文件

包内脚本可通过 `command: bash "$DSH_TEMPLATE_DIR/scripts/init.sh"` 调用，脚本用 `"$DSH_TEMPLATE_DIR/docs/guide.md"` 读取文档。无需资源字段或文件清单，仅 exports 暴露 workflow.yaml；目录取解析结果父目录，不取模板 ID。该变量由宿主 dshEnv 提供，不是业务输入或 Django 占位符，session_agent 不注入。cwd 和沙箱 workspaceRoot 保持工作区，产物写工作区，不提升权限。

实例保存定义快照和来源目录，不复制资源；重启、撤销登记继续使用旧来源，历史实例不自动补回。脚本和文档读取执行时当前文件，更新不使成功节点重跑；文件删除或包移动沿用 Bash 错误与人工重试。
