# Bash 节点

[文档导航](../../README.zh.md) · [整体 DAG 语法](../../dag-syntax.zh.md)

## 用途与最小示例

`node_kind: bash` 在实例所属工作区通过宿主沙箱执行 Shell 命令。以下节点定义放入 DAG 的 `dag` 数组中：

```yaml
id: verify
type: node
node_kind: bash
command: npm test
```

默认手动执行，命令成功并交付有效结果后自动完成。

## 配置字段

公共 `id`、`type`、`input_schema`、`output_schema` 见 [DAG 定义结构](../../dag-syntax.zh.md#3-实体数据结构)。本类型解释以下业务字段；其他自定义字段保留，但不获得业务含义。

| 字段 | 类型 | 必填 / 默认值 | 含义 |
| --- | --- | --- | --- |
| `node_kind` | 字符串 | 必填，`bash` | 选择 Bash 节点插件 |
| `command` | 字符串 | 必填 | 要执行的命令，支持输入引用 |
| `is_auto_start` | 布尔值 | 默认 `false` | 首次就绪时自动启动 |

`command` 允许空字符串或纯空白，原始配置不裁剪。未声明输出的空白命令作为空操作成功结束；声明输出时，空命令仍因缺少 JSON 结果而失败。

## 输入如何使用

输入先在本节点 `input_schema` 中声明；路径与取值规则见[共用输入引用](../input-references.zh.md)。

Bash 使用 Nunjucks 默认表达式插值，支持内置 filter/test；结构化 JSON 使用 `{{ value | dump }}`。不通过模板条件、循环、注释或空白裁剪生成命令结构。

bash 的占位符必须是独立、未额外加引号的数据参数；不能用作命令名、拼进参数或放进引号、注释、命令替换和 heredoc。节点使用 Shell 单引号转义，含空格、引号、换行和特殊字符的值始终保持为一个参数；缺失值形成一个空参数。

```yaml
id: show-summary
type: node
node_kind: bash
input_schema:
  summary: string
command: "printf '%s\n' {{ summary }}"
```

此例需要上游声明并提供 `summary`。不要写成 `"{{ summary }}"` 或 `prefix-{{ summary }}`。

## 输出如何产生

声明非空 `output_schema` 时，成功命令的 stdout 必须整体是一个 JSON 对象，日志应写到 stderr。结果须完整满足输出契约且能可靠保存；空输出、非法或非对象 JSON、缺字段、类型错误和被截断的 stdout 均使节点失败，下游不会推进。

省略或空输出声明时 stdout 仅作为日志，完成提交 `{}`，不自动透传输入。

## 执行与完成

手动“执行”只启动选中的就绪节点实例；`is_auto_start: true` 在首次就绪时启动。命令成功且结果有效后自动完成，无须人工确认结果；下游是否自动启动由下游自己的配置决定。

cwd 和沙箱 workspaceRoot 使用实例所属工作区。沿用宿主沙箱与系统权限，不提升权限；沙箱不可用或执行失败时节点失败。

运行实例中的命令只读，接口不接受命令覆盖；源模板修改并重载后需创建新实例。

## 失败、重试与恢复

首次显示“执行”，失败或结果未知后显示“重新执行”，会再次运行快照中的命令。合法业务结果先可靠保存再交付 DAG；交付失败时业务历史仍为成功，当前显示“业务完成，交付失败”，按钮显示“重试交付”，只使用已接受结果，不运行命令。仅在新图状态保存成功后显示已完成。重启恢复只重交已接受结果；没有确定结果的中断不自动重跑。

详情末尾的“运行记录”最近一次在前，默认展开最新一次。每次尝试保留实际输入、渲染后的命令、stdout/stderr、退出码及可取得的中断信息、合法结果和错误。日志截断会明确提示，日志和业务输出分别显示。历史只读，不提供重新执行或使用旧结果的动作。开始记录保存失败不启动命令；最终结果保存失败不接受结果、不推进 DAG，当前页面显示可取得的保存错误，重启按最后可靠事实恢复为未知。记录随实例保存和删除，不补齐旧实例历史。

## 模板附属文件

模板目录中的脚本、文档和配置可随包提供，只需 exports 暴露 workflow.yaml，无须新增 YAML/config 资源字段或文件清单。Bash 可写：

~~~yaml
command: bash "$DSH_TEMPLATE_DIR/scripts/init.sh"
~~~

DSH_TEMPLATE_DIR 是系统通过宿主 Shell 的 dshEnv 注入的执行环境信息，来源为模块解析器返回的 workflow.yaml 文件 URL 的父目录，不是业务输入，无须 input_schema 声明，也不用 {{ DSH_TEMPLATE_DIR }}。普通业务引用仍须独立、未额外加引号；路径变量按 Shell 规则用双引号引用，例如 bash "$DSH_TEMPLATE_DIR/scripts/init.sh" {{ repository }}。

cwd 和沙箱 workspaceRoot 仍是实例所属工作区；模板文件用于读取或执行，产物写工作区。沿用现有沙箱和系统权限，不提升权限，也不新增模板目录强制只读隔离。agent 不注入此变量。

实例持久化创建时 YAML 定义和解析后的来源目录；嵌套、递归及逐项 Bash 共享此目录。重启或仅撤销模板登记仍使用保存的来源；缺少来源的历史实例不补回变量，不从宿主环境继承同名值。YAML 修改不热更新实例命令，脚本和文档则读取执行时的当前内容，不缓存副本；文件变化不会重跑成功节点。文件删除、包移动或读取失败沿用 Bash 错误和人工重试，不重新绑定其他模板。

完整包与加载示例见[模板作者指南](../../template-plugin-authoring.zh.md)。

## 完整示例

以下模板展示输入作为一个完整参数传入命令，再输出满足契约的 JSON。Node.js 需在宿主执行环境可用。

```yaml
id: echo-input
name: 输入输出示例
type: dag
output_schema:
  text: string
dag:
  - id: request
    type: node
    node_kind: form
    output_schema:
      text: string
  - id: echo
    type: node
    node_kind: bash
    input_schema:
      text: string
    output_schema:
      text: string
    command: "node -e 'console.log(JSON.stringify({text: process.argv[1]}))' {{ text }}"
  - type: edge
    from: request
    to: echo
```

如果已有表单收集的是 JSON 文本，可用 `command: "printf '%s' {{ result_json }}"`，配合对应 `input_schema` 与目标 `output_schema` 交付并校验对象。Form 也能直接收集结构化对象和数组，见[表单节点](../form/README.zh.md)。
