# Form 表单节点

[文档导航](../../README.zh.md) · [整体 DAG 语法](../../dag-syntax.zh.md)

## 用途与最小示例

`node_kind: form` 收集用户填写的数据，将有效正式提交作为输出交付下游。以下节点定义放入 DAG 的 `dag` 数组中：

```yaml
id: request
type: node
node_kind: form
output_schema:
  task: string
```

新填写的字段只需声明在输出中；有上游数据需要预填时，再声明对应输入。

## 配置字段

公共 `id`、`type`、`input_schema`、`output_schema` 见 [DAG 定义结构](../../dag-syntax.zh.md#3-实体数据结构)。

| 字段 | 类型 | 必填 / 默认值 | 含义 |
| --- | --- | --- | --- |
| `node_kind` | 字符串 | 必填，`form` | 选择表单节点插件 |
| `output_schema` | DAG Schema 对象 | 默认 `{}` | 定义表单字段结构与结果类型 |
| `input_schema` | DAG Schema 对象 | 默认 `{}` | 声明用于同名预填的上游字段 |
| `schema` | 对象 | 可选 | 沿 `properties` / `items` 补充字段注解及已支持约束 |
| `uiSchema` | 对象 | 可选 | 覆盖控件与枚举显示名称 |

DAG Schema 使用字段到类型的映射。`schema` 参考 JSON Schema 字段描述约定，`uiSchema` 参考 RJSF 展示约定；这里只支持本文列出的子集，不表示完整兼容，不增加同用途的自定义语法。Form 不解释 `is_auto_start`，也不需要开始按钮。

form 的字段名与类型直接来自 `output_schema`，支持 `string`、`number`、`boolean`，以及带属性声明的 `object` 和带元素声明的 `array`。用户填写的字段不必出现在 `input_schema`；用于同名预填的字段可写入输入契约，且必须存在于输出契约中、递归结构类型一致。可选的 `schema.properties` 为字段补充 `title`、`description`、`default`、标量 `enum`，也可声明与输出契约一致的 `type`；`uiSchema` 可配置 `ui:widget` 和枚举显示名称，唯一枚举数组支持下文的多选控件。标量支持的控件如下：

| 类型 | 默认控件 | 可选 `ui:widget` |
| --- | --- | --- |
| `string` | 单行文本；有 `enum` 时单选 | `text`、`textarea`、`select`（须有 `enum`） |
| `number` | 数字输入；有 `enum` 时单选 | `updown`、`select`（须有 `enum`） |
| `boolean` | 开关；有 `enum` 时单选 | `checkbox`、`select`（须有 `enum`） |

对象与数组支持下文的结构化填写，不支持文件上传或表外的标量控件。`enum` 中的值及 `default` 必须符合输出字段类型，默认值若有枚举还必须属于枚举。正式提交必须在每一层包含且仅包含全部声明字段，并符合类型与标量枚举约束；空字符串是合法的字符串值。

```yaml
id: collect
type: node
node_kind: form
output_schema:
  note: string
  priority: number
  approved: boolean
schema:
  properties:
    note:
      title: 处理说明
      description: 请填写审核意见
    priority:
      default: 0
      enum: [0, 1, 2]
uiSchema:
  note:
    ui:widget: textarea
```

## 输入如何使用

首次打开时，同名上游输入优先，其次使用 `default`；零、`false` 与空字符串均是有效值。缺失值留给用户填写，不自动猜测。类型不匹配的预填值不会转换。当前工作流页面内关闭详情或切换节点可保留未提交草稿；刷新或离开页面会丢弃草稿。提交后结果只读，额外上游字段不会混入输出。

输入必须有潜在上游来源。工坊没有外部根业务输入，入口表单收集数据的完整示例见[整体语法](../../dag-syntax.zh.md#11-最小可运行模板)。更详细的嵌套预填与默认值优先级见下文。

## 输出如何产生

正式提交以 `output_schema` 为结构，逐层只包含全部声明字段，并满足类型、枚举及已配置的唯一性约束。未声明的上游字段不进入结果。空字符串与空数组合法；未填写值不自动当成空字符串、零或 false。

这些额外字段范围与唯一性限制属于 Form；公共 DAG 的输出与额外字段规则见 [Schema 契约](../../dag-syntax.zh.md#42-输入声明输出契约与额外字段)。

## 执行与完成

节点就绪后打开表单、填写并提交；关闭表单不会提交。有效结果被服务端接受后只读，并交付 DAG；下游依照自身配置继续执行。

## 失败、重试与恢复

字段不合法时显示具体字段或数组下标，修改后重新提交。填写中的即时校验和草稿不进入历史；实际到达服务端并处理的正式提交保留提交值、结果或拒绝原因。详情末尾的“运行记录”最近一次在前、最新一次默认展开，全部只读。

服务端已接受结果但交付 DAG 失败时，业务记录保持成功，当前显示“业务完成，交付失败”，按钮统一为“重试交付”；不重新采集或改变数据，不新增业务尝试。编排诊断在实际所属 DAG 详情，只有新图状态可靠保存后才显示已完成。重启恢复保留已提交结果，未提交草稿仅保存在当前页面。保存失败不接受结果或推进 DAG，无法保存的错误不承诺重启后可追溯。历史随实例保存与删除，不补齐旧历史。

## 结构化示例与限制

以下配置片段属于节点定义；构造与加载完整模板见[模板作者指南](../../template-plugin-authoring.zh.md)。

### 对象与数组字段



对象与数组沿用 [DAG Schema](../../dag-syntax.zh.md#4-输入输出-schema) 的结构化类型描述。对象按 `properties` 展开，数组按 `items` 展开，支持组合嵌套；数组允许末尾新增、删除任意项及提交空数组。原有标量控件在嵌套字段中继续有效。

以下示例表示数量不固定的任务列表，每项包含名称与优先级。结构只在 `output_schema` 中定义；`schema` 沿 `properties`、`items` 补充注解，`uiSchema` 沿对象字段名、数组 `items` 配置已有控件。

```yaml
id: collect_items
type: node
node_kind: form
output_schema:
  tasks:
    type: array
    items:
      type: object
      properties:
        name: string
        priority: string
schema:
  properties:
    tasks:
      title: 任务列表
      items:
        properties:
          name:
            title: 名称
          priority:
            title: 优先级
            enum: [高, 中, 低]
            default: 中
uiSchema:
  tasks:
    items:
      name:
        ui:widget: textarea
```

默认值和预填遵循以下规则：

- 已有草稿保持原样，不重新补预填或默认值。首次初始化逐顶层字段使用同名上游值；已有对象或数组整体采用，不与其自身或子字段的默认值合并。上游对象缺少的字段由用户填写，零、false、空字符串和空数组不会触发默认值。
- 没有预填时，有显式 `default` 就复制并采用整个值；对象或数组默认值必须完整符合声明和嵌套枚举，不能包含额外字段。不再合并其子字段默认值。
- 没有整体默认值的对象按子字段初始化；没有整体默认值的数组从空数组开始。点击添加时按 `items` 初始化新项：应用该项或其子字段已有默认值，没有默认值的标量留待填写，不自动补空字符串、零或 false。
- 编辑和增删不会修改上游数据、模板默认值或其他项。删除后不按默认值重新补项，已删除的内容不会因重开详情而恢复。

`enum` 继续仅用于标量字段或标量元素，对象和数组本身不支持枚举。预填递归只取声明字段；正式提交则在每一层要求全部声明字段存在，拒绝额外字段，并校验类型与标量枚举。空字符串和空数组合法；无默认值且未填写的标量不能因控件显示为空或未选中而被视为已填写。错误须能指出具体字段或数组下标。服务端接受结果后所有嵌套编辑和增删操作只读，结果交付失败仅重试已接受结果。

结构化填写支持数组增删及下文的枚举多选，不增加排序、复制、联动、上传、远程选项或持久化草稿。其逐层字段范围与唯一性限制只属于 form，不改变公共 DAG 对额外字段的规则。

### 枚举显示名称与多选

枚举值仍在 `schema` 的 `enum` 中声明，`uiSchema` 可通过 RJSF 的 `ui:enumNames` 配置显示名称。支持按位置对应的字符串数组，或按枚举值的字符串形式对应的对象。允许部分覆盖，未配置的名称使用原值；名称数组不能多于枚举项，对象不能包含未知选项键，名称必须是字符串。没有 `enum` 时不能配置名称。

```yaml
output_schema:
  priority: string
  approved: boolean
schema:
  properties:
    priority:
      enum: [high, medium, low]
      default: medium
    approved:
      enum: [false, true]
      default: false
uiSchema:
  priority:
    ui:enumNames: [高优先级, 中优先级, 低优先级]
  approved:
    ui:enumNames: {'false': 否, 'true': 是}
```

界面显示“高优先级”或“否”，提交仍是 `"high"` 或 `false`，名称不改变类型、默认值、预填值或枚举约束。对象子字段及普通数组的标量元素同样支持名称配置；当前不支持 `oneOf`、`const` 或在 `schema` 中配置 `enumNames`。

数组可在 `schema` 注解中声明布尔 `uniqueItems`。省略或为 `false` 时保留原有逐项增删；为 `true` 时提交拒绝重复值。若 `items` 同时声明标量 `enum`，自动显示多选框；数组级 `ui:widget` 可显式选择 `select` 或 `checkboxes`。不满足唯一标量枚举条件的数组不能指定这些控件。

```yaml
output_schema:
  tags:
    type: array
    items: string
schema:
  properties:
    tags:
      title: 标签
      uniqueItems: true
      default: [frontend]
      items:
        enum: [frontend, backend, test]
uiSchema:
  tags:
    ui:widget: checkboxes
    items:
      ui:enumNames: [前端, 后端, 测试]
```

此例显示复选框组，提交例如 `{"tags": ["frontend", "test"]}`。省略 `ui:widget` 使用原生多选 select。数字与布尔枚举数组也支持多选，保持 `0`、`false` 等真实类型。名称优先按 `items` 定位；未提供 `items` 时，多选数组也可直接在数组级配置 `ui:enumNames`。普通枚举数组的名称配置在 `items` 下。

多选没有逐项添加／删除按钮；取消全部选项提交空数组，不重新应用默认值。复选框新选项追加到当前值末尾，取消保持剩余顺序；原生多选 select 编辑后按选项声明顺序输出。未编辑的上游值保持原顺序。

唯一性也可用于非枚举数组，包括对象和嵌套数组：对象按内容比较、不受键顺序影响，数组按顺序比较。默认值同样校验，重复默认值使模板不可用；重复上游预填不静默去重，提交时指出重复项下标，用户修改后再提交。前后端均校验唯一性，提交后只读及恢复规则保持不变。规格与实际验证范围见[枚举名称与多选规格](../../specs/form-enum-controls.zh.md)。
