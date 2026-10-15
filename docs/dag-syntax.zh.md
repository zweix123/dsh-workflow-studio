# 工作流工坊 DAG 语法规范

当前实现：工作流工坊内置 DAG 引擎，默认 bundle 装配 `agent`、`bash`、`form` 三种节点。

适配 `@deepseek-ai/dsh@0.2.0-rc.1`。从[文档导航](./README.zh.md)选择阅读入口；各内置节点的业务配置与操作说明在 [Agent](./nodes/agent/README.zh.md)、[Bash](./nodes/bash/README.zh.md)、[Form](./nodes/form/README.zh.md) 中维护。新模板使用 `node_kind: agent`，不提供旧配置、旧实例兼容或迁移；已有实例快照和数据保留，不会自动改写或删除。

本文面向 DAG 语法的使用者，说明标准字段、书写规则、静态合法性、执行语义和使用示例。产品需求、功能范围与验收规格统一维护在 `docs/specs/`；内部数据结构、模块和算法属于实现设计。

## 1. 阅读顺序、范围与规范用语

| 章节 | 回答的问题 |
| --- | --- |
| 1.1 最小可运行模板 | 如何先写出并运行一个工作流？ |
| 2. 概念模型 | 节点、边、DAG、定义和实例分别是什么？ |
| 3～5. 书写规则 | 定义结构、节点类型选择、输入输出 Schema、`if` 和 `for` 怎么写？排布按需阅读 §3.2。 |
| 6. 静态检查 | 哪些定义合法，哪些必须在执行前拒绝？ |
| 7～10. 执行语义 | 如何激活、合并与校验输入、展开、聚合和递归？ |
| 11. 完整示例 | 如何把这些规则组合成程序？ |
| 12. 错误与实现边界 | 哪些情况报错，哪些内容由实现设计说明？ |

工作流工坊 DAG 引擎使用由键值对、数组和标量组成的定义对象描述嵌套执行图，支持按需实例化、条件执行、逐项执行和自递归定义引用。语言面向编排引擎及其可复用包，定义执行依赖和数据契约；节点业务动作与实际结果由外部集成方提供。

工坊的模板配置使用 YAML 存储。模板声明加载或重载时读取并登记定义，实例管理 Tab 创建实例时使用当前可用的已加载定义；实例详情 Tab 展示初始化快照。引擎本身不负责文件存储或文本解析，定义的数据结构与文件序列化格式分开约定。本文的 JSON 示例用于表达解析后的数据结构，不要求配置文件使用 JSON。

模板的包结构、身份登记、加载与重载规则见[模板作者指南](./template-plugin-authoring.zh.md)。本文负责定义本身的结构与编排语义。

“必须”和“不得”表示强制要求。“待确定”表示尚未规定，不能假定实现已支持。“编译期”或“静态检查”指执行前对源程序定义的检查，不要求实现生成机器码。

表达式采用 Nunjucks；本项目维护数据与编排契约，不另造表达式语言。不定义节点代码、并发调度、业务错误恢复、重试或迭代间依赖，不保证递归终止。

### 1.1 最小可运行模板

工作流模板描述流程，创建实例后执行其中的节点；边决定依赖顺序并传递数据。下面的表单收集 `task`，Agent 接收它并与用户讨论。Agent 未声明输出，用户完成节点后根 DAG 以空结果完成。

```yaml
id: discuss-task
name: 讨论任务
type: dag
dag:
  - id: request
    type: node
    node_kind: form
    output_schema:
      task: string
  - id: discuss
    type: node
    node_kind: agent
    input_schema:
      task: string
    prompt: |
      请分析以下任务并给出建议：
      {{ task }}
  - type: edge
    from: request
    to: discuss
```

将其保存为模板包的 `workflow.yaml`，按[模板作者指南](./template-plugin-authoring.zh.md)添加到已装配默认 bundle 的 profile。创建实例后提交表单，执行 Agent 并打开对话，交流结束后返回工坊点击“完成”。声明业务输出、切换台后模式等用法见 [Agent 节点](./nodes/agent/README.zh.md)。

## 2. 概念模型

DAG 的内容由顶点和边组成。顶点分为节点（`node`）和 DAG（`dag`）。节点是最小执行单元，DAG 是包含顶点和边的复合执行单元。边表示执行依赖和数据传递，不是顶点，不得成为边的端点。

| 术语 | 含义 |
| --- | --- |
| 定义 | 描述实体结构、规则和契约的对象，与存储格式无关 |
| 实例 | 某个定义在本次运行中的具体执行对象 |
| 执行位置 | 本层依赖计划中引用某个顶点定义的位置，不意味着实例已经创建 |
| 实例组 | 一个执行位置由非空 `for` 产生的一组实例 |
| 结构入口／出口 | 按本层解析后的全部依赖计算，入度／出度为 0 的执行位置 |
| 激活 | 本次运行中一条边实际提供依赖及数据的状态 |
| 跳过 | 执行位置未创建实例、不产生输出，其出边均不激活 |
| `map` | 输入或输出使用的对象，字段按自身字符串键处理，额外字段值不限于 JSON 数据 |

所有顶点在源程序中都是定义，具有模板性质；运行时按需创建实例，不设独立的 DAG 模板类型。`if` 和 `for` 改变边的激活情况与实例数量，不修改定义。连接 DAG 表示连接整体，不得穿透边界连接内部顶点。

输入和输出按 Schema 复制声明结构。结构化 `object` 复制对象容器并递归处理已声明属性，结构化 `array` 复制数组容器并按 `items` 递归处理元素；输入缺失的声明字段保持缺失。接收方修改自己输入中的声明结构，不得改变已接收的上游声明值、其他实例声明值或根输入声明值；外部修改提交对象或查询所得数据中的声明结构，也不得改变引擎已接受的声明值。这同样适用于 DAG 的多个入口、普通扇出及 `for` 实例的共同依赖。

任意层级的额外字段不增加值类型限制，原样保留；对象值按引用保存和传递，不承诺深拷贝隔离。例如 address.city 已声明、address.custom 未声明，则修改 city 不影响引擎已接受的值，修改 custom 对象可能影响引擎或其他实例。该隔离保证不覆盖外部通过额外对象引用进行的修改。所有已声明的对象和数组均须使用结构化类型描述，不支持无内部类型描述的字符串简写。

跨 Schema 传递时，来源先按自身适用的 Schema 为每个接收方复制声明结构，接收方再按自身的 Schema 接收并隔离其声明结构。目标未声明某字段，不得使来源已声明的结构直接暴露为目标可修改的共享对象。来源未声明、目标已声明的结构在接收边界按目标 Schema 复制。任意层级未声明的字段值仍按引用保留；这里的深拷贝仅递归覆盖 Schema 声明的结构，不包含其中未声明的对象内部。

## 3. 实体数据结构

源文件根对象必须为 DAG。字段顺序不影响含义。下表列出各实体自身的标准字段；除明确可选的字段外，其余标准字段都必须存在。

引擎 compile() 接收已构造的 JavaScript 对象，不读取原始 YAML 或 JSON 文本，也不承担原始文本重复对象键检查。调用方从文本构造定义时，其解析行为由调用方负责；解析结果必须满足引擎对定义对象的约束。定义 ID 唯一性、声明合并冲突与实际合并冲突仍须由引擎检查；它们与原始文本重复键是不同的问题。

| 实体 | 必需标准字段 | 可选标准字段 |
| --- | --- | --- |
| `node` | `id`、`type` | `name`、`input_schema`、`output_schema` |
| `dag` | `id`、`type`、`dag` | `name`、`input_schema`、`output_schema`、`layout`（仅工坊画布） |
| `edge` | `type`、`from`、`to` | `id`、`name`、`if`、`for` |

| 字段 | 解析后的值与含义 |
| --- | --- |
| `id` | 字符串，定义 ID；`node`、`dag` 必须提供，`edge` 可省略 |
| `name` | 可选显示名称；提供时须为非空、非纯空白字符串，保留原文；省略显示 `id`。边的名称展示适用于有显式 ID 的边 |
| `type` | 对应实体的字符串常量：`node`、`dag` 或 `edge` |
| `input_schema`、`output_schema` | 第 4 节定义的 Schema 对象；省略等同于 `{}`，显式提供时必须为对象 |
| `dag` | 数组，成员为 `node`、`dag` 或 `edge` 定义，允许为空 |
| `from`、`to` | 字符串，引用定义 ID；解析规则见第 6.1 节 |
| `if`、`for` | 字符串，解析后的完整内容遵循第 5 节表达式语法 |

边 ID 仅用于标识和定位该边，不参与端点解析或实例身份生成。省略边 ID 不改变其执行含义；边可由所在 DAG 及 `(from, to)` 端点对定位。所有显式提供的 ID 仍须满足第 6.1 节的全局唯一要求。

省略 Schema 只表示不声明业务字段要求，不改变第 4.2 节规定的输入允许缺失、输出声明字段必须存在的规则。DAG 的 Schema 定义对外接口，内部顶点的 Schema 定义各自契约，两者独立校验，不从内部定义自动推导或替代对外声明。

最小 DAG：

```json
{
  "id": "main",
  "type": "dag",
  "dag": []
}
```

实体的标准字段按实体类型识别，其余字段对 DAG 引擎而言均为自定义字段。引擎必须原样保留这些字段，不得因字段未知而拒绝或丢弃，也不赋予编排语义。例如 `node` 上的 `if`、`for` 不控制该节点执行；只有 `edge` 上的同名字段具有条件或展开语义。工作流模板还须遵守下述节点字段规则。

自定义字段不得改变该实体标准字段的含义或校验要求。本节的扩展规则适用于 `node`、`dag`、`edge` 实体；Schema 中的键表示业务字段，含义见下一节。

### 3.1 工作流模板与节点类型

根模板、普通节点、嵌套 DAG 和显式边的 `id`，以及 `node_kind`、节点动作 ID、handler 名称和 `for` 每项的 `key` 值，统一采用 `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`，完整匹配原字符串。数字可开头，点号、下划线、连字符只作单个片段分隔符，不具备路径含义。`0`、`review_v2`、`review.zh`、`review-step` 合法；中文、大写、空白、首尾及连续分隔符、末尾换行均不合法。不自动裁剪、转换或设置长度上限，各标识继续按原值精确比较并沿用各自唯一性范围。插件契约细节见[节点作者指南](./node-plugin-authoring.zh.md)。

根模板、普通节点、嵌套 DAG 和有显式 ID 的边支持可选 `name`，可使用中文、重复名称和前后空白，显式空串、纯空白或非字符串值被拒绝。省略时显示 ID。名称仅用于标题与标签，`from`、`to`、`layout.segments[].start_at`、递归目标及操作定位始终使用 ID 或实例身份。同名实体可独立查看和操作；既有实例从创建时的定义快照取得名称，源模板改名不改变其身份或名称。动作文案继续使用 `label`。

每个普通 `node` 必须显式提供 `node_kind`，选择当前 profile 已登记的节点插件。默认 bundle 装配三种内置节点，第三方插件可提供其他 kind；缺失或冲突的类型使模板不可用。

| `node_kind` | 用途 | 节点文档 |
| --- | --- | --- |
| `agent` | Agent 处理任务，支持台前与台后模式 | [Agent 节点](./nodes/agent/README.zh.md) |
| `bash` | 在宿主沙箱执行 Shell 命令 | [Bash 节点](./nodes/bash/README.zh.md) |
| `form` | 收集用户输入并提交结构化结果 | [Form 节点](./nodes/form/README.zh.md) |

公共编排字段由 DAG 解释；业务字段由所选 kind 解释和校验，其他自定义字段原样保留。`prompt`、`command`、`mode`、`schema`、`uiSchema`、`is_auto_start` 的支持范围见对应节点文档；不能将某个节点的能力推定为所有节点共有能力。Agent/Bash 的 `{{ }}` 文本引用见[输入引用](./nodes/input-references.zh.md)，与边上 `if` / `for` 的表达式分别约定。

工坊创建实例没有外部业务输入。根 DAG 与普通节点、嵌套 DAG 一样检查输入来源；非空根输入声明没有提供方，模板不可用，也不会生成占位根输入。需要人工数据时使用入口 form，新填写字段只声明在输出中。公共 DAG 引擎的外部调用方仍可明确提供根输入。

### 3.2 实例运行图排布 `layout`

任意 DAG 定义可选配 `layout`，只影响该层实例画布的位置和连线方向。根 DAG、嵌套 DAG 及递归产生的每次 DAG 实例各用所引用定义的本层配置；父层不会覆盖子层。省略时沿用从左到右的横向画布。有效配置静默生效；只有配置无效、相关 DAG 层回退横向时显示 WARN，详情说明原因及修正建议。`layout` 不影响依赖、`if`、`for`、实例身份、输出、持久化和恢复。

```yaml
layout:
  direction: vertical             # 必填：horizontal 或 vertical
  segments:                      # 可选：按依赖顺序声明后续段
    - start_at: publish           # 本层直接声明的 node 或 dag 的 id
      direction: horizontal
```

`start_at` 从该顶点起切换方向，直到下一段或本层结束；它不是边的 `from`，也不能引用边 ID、子 DAG 内的顶点或递归虚拟位置。第一顶点不能设为转折点。并行位置没有确定的先后顺序，不能作为转折点。分叉、分支和汇合必须放在同一段：`A → B/C → M → N` 中 B、C、M 不能切段，N 可以。一个 `for` 执行位置展开的实例组及其聚合出口、一个嵌套 DAG 分组在父层都是整体。横向段的分支和逐项实例上下展开，纵向段左右展开。连续纵向段向右另开一列，列在整图高度内居中；混合方向也向右接续。

以下纯横向示例可直接保存为 `workflow.yaml`：

```yaml
id: horizontal-flow
name: 示例工作流
type: dag
layout: { direction: horizontal }
dag:
  - { id: plan, type: node, node_kind: bash, command: 'echo plan' }
  - { id: build, type: node, node_kind: bash, command: 'echo build' }
  - { type: edge, from: plan, to: build }
```

纯纵向示例：

```yaml
id: vertical-flow
name: 示例工作流
type: dag
layout: { direction: vertical }
dag:
  - { id: plan, type: node, node_kind: bash, command: 'echo plan' }
  - { id: build, type: node, node_kind: bash, command: 'echo build' }
  - { type: edge, from: plan, to: build }
```

连续纵向列示例；`review` 开始第二列，`publish` 开始第三列：

```yaml
id: columns
name: 示例工作流
type: dag
layout:
  direction: vertical
  segments:
    - { start_at: review, direction: vertical }
    - { start_at: publish, direction: vertical }
dag:
  - { id: plan, type: node, node_kind: bash, command: 'echo plan' }
  - { id: build, type: node, node_kind: bash, command: 'echo build' }
  - { id: review, type: node, node_kind: bash, command: 'echo review' }
  - { id: test, type: node, node_kind: bash, command: 'echo test' }
  - { id: publish, type: node, node_kind: bash, command: 'echo publish' }
  - { type: edge, from: plan, to: build }
  - { type: edge, from: build, to: review }
  - { type: edge, from: review, to: test }
  - { type: edge, from: test, to: publish }
```

混合方向示例，`build` 后转为纵向，再从 `publish` 恢复横向：

```yaml
id: mixed
name: 示例工作流
type: dag
layout:
  direction: horizontal
  segments:
    - { start_at: review, direction: vertical }
    - { start_at: publish, direction: horizontal }
dag:
  - { id: plan, type: node, node_kind: bash, command: 'echo plan' }
  - { id: build, type: node, node_kind: bash, command: 'echo build' }
  - { id: review, type: node, node_kind: bash, command: 'echo review' }
  - { id: test, type: node, node_kind: bash, command: 'echo test' }
  - { id: publish, type: node, node_kind: bash, command: 'echo publish' }
  - { type: edge, from: plan, to: build }
  - { type: edge, from: build, to: review }
  - { type: edge, from: review, to: test }
  - { type: edge, from: test, to: publish }
```

嵌套示例中，外层把 `quality` 当一个顶点，内层自行纵向排布：

```yaml
id: nested-layout
name: 示例工作流
type: dag
layout: { direction: horizontal }
dag:
  - id: quality
    type: dag
    layout: { direction: vertical }
    dag:
      - { id: lint, type: node, node_kind: bash, command: 'echo lint' }
      - { id: test, type: node, node_kind: bash, command: 'echo test' }
      - { type: edge, from: lint, to: test }
  - { id: publish, type: node, node_kind: bash, command: 'echo publish' }
  - { type: edge, from: quality, to: publish }
```

下例的 `review` 位于分叉与汇合之间，是无效转折；改为 `start_at: publish` 即可。排布警告不会使模板不可选，也不会阻止创建和执行。无效配置只使所在 DAG 层整体回退横向；创建对话框和已有实例画布可展开 WARN 查看 DAG 路径、起点、原因及建议。有效层显示 INFO；旧快照按其保存的定义诊断。

```yaml
id: unsafe-turn
name: 示例工作流
type: dag
layout:
  direction: horizontal
  segments:
    - { start_at: review, direction: vertical } # 无效：分支内部
dag:
  - { id: plan, type: node, node_kind: bash, command: 'echo plan' }
  - { id: review, type: node, node_kind: bash, command: 'echo review' }
  - { id: test, type: node, node_kind: bash, command: 'echo test' }
  - { id: merge, type: node, node_kind: bash, command: 'echo merge' }
  - { id: publish, type: node, node_kind: bash, command: 'echo publish' }
  - { type: edge, from: plan, to: review }
  - { type: edge, from: plan, to: test }
  - { type: edge, from: review, to: merge }
  - { type: edge, from: test, to: merge }
  - { type: edge, from: merge, to: publish }
```

## 4. 输入输出 Schema

输入输出及嵌套对象的业务字段名遵循 JSON 对象字符串键规则，允许中文、空串、点号、连字符及转义特殊字符，不套用 ID 正则或增加保留名。字段名合法不代表可作为 Nunjucks 顶层变量直接引用；已有对象下的特殊字段可使用括号属性访问，例如 `payload["中文字段"]`。上下文及安全复制、合并契约保持不变，不增加根变量或别名。


### 4.1 统一的类型描述

`input_schema` 和 `output_schema` 使用同一套 Schema：由业务字段名映射到类型描述。字段名可以是任意 JSON 字符串。`string`、`number`、`boolean` 的值表示与比较采用 JavaScript（ECMAScript）对应的语义；`object`、`array` 的结构遵循下表，传递遵循第 2 节的值语义。即使引擎使用其他语言实现，也必须保持相同结果。

下表是类型描述的写法，T 表示任意类型描述，Schema 可以继续嵌套。

| 类型描述 | 约束 |
| --- | --- |
| `"string"` | JavaScript String 基本值，按 UTF-16 码元序列表示 |
| `"number"` | JavaScript Number 基本值，采用 IEEE 754 binary64 双精度浮点数 |
| `"boolean"` | JavaScript Boolean 基本值，`true` 或 `false` |
| `{"type": "object", "properties": Schema}` | 对象，内部字段遵循 `properties` |
| `{"type": "array", "items": T}` | 数组，每个元素遵循 `items` |

对象类型必须使用 `{"type": "object", "properties": Schema}`，数组类型必须使用 `{"type": "array", "items": T}`。字符串类型描述只允许 `"string"`、`"number"`、`"boolean"`；`"object"`、`"array"` 简写在编译期报错。类型描述可以递归嵌套，每层对象都必须提供 `properties`，每层数组都必须提供 `items`，不能在内部重新使用已取消的简写。本期不提供 `null` 类型、联合类型或隐式类型转换。

`number` 的精度、范围、舍入和溢出行为均遵循 JavaScript Number，不另设整数或高精度小数类型。配置中的数字解析为 Number 后参与传递和比较，超出可精确表示范围时采用 JavaScript 的结果。配置使用 YAML；第 5 节表达式的字面量和运算遵循 Nunjucks，不增加 JavaScript 表达式或新的 Schema 类型。

`object` 与 `array` 在本语言中分别检查；`null` 不视为 `object`。顶层输入输出 map 与声明 object 只接受普通数据对象，包括无原型对象；Date、Map、Set、业务类实例等特殊对象在这些位置必须报错，不得按自身字段复制后隐式转换成普通对象。它们作为未声明字段的值时，仍原样保留引用。对象字段按自身的字符串键处理，不读取原型链属性。类型的基础定义参见 [ECMAScript 数据类型与值](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types)。

结构化类型描述同样按 `type` 识别标准字段：`object` 解释 `type`、`properties`，`array` 解释 `type`、`items`。其他字段原样保留，不获得类型约束语义，也不能替代必需标准字段。例如 `description` 仅作附加信息；`required`、`default` 等未定义字段不会改变输入与输出的字段存在性规则或提供默认值。Schema 和 `properties` 内的键则始终表示业务字段名，不作为类型描述的标准字段解释。

例如，以下内容既可作为 `input_schema`，也可作为 `output_schema`：

```json
{
  "orders": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "order_id": "string",
        "address": {
          "type": "object",
          "properties": {"city": "string"}
        }
      }
    }
  }
}
```

用于输入时，orders 可以缺失；存在时必须是数组，每项必须是对象，order_id、address 及其内部 city 存在时检查类型。用于输出时，orders 及每项声明的 order_id、address、city 均必须存在。空数组满足元素类型约束，不要求数组非空。

### 4.2 输入声明、输出契约与额外字段

输入与输出采用不同的字段存在性规则，不需要用户额外声明哪些输入字段必需。输入 Schema 及其任意层级的 `properties` 只约束已经存在的声明字段：缺失字段允许通过，不补默认值；存在时必须符合声明类型。输出 Schema 及其任意层级的 `properties` 列出的字段均必须存在且类型正确。每一层对象仍允许额外字段，不要求列出全部业务字段。

- `input_schema` 声明节点或 DAG 的输入依赖及其类型，不承诺字段在本次执行中一定到达；根输入同样允许缺失。静态检查要求第 6.2 节的来源声明递归覆盖目标输入声明，并检查类型兼容。根输入由外部提供；DAG 内部结构入口以所在 DAG 的 `input_schema` 为声明中的潜在来源。
- `output_schema` 声明顶点必须提供的输出结构；解释器接收节点结果或形成 DAG 返回值时，必须先校验输出，再将其用于后续边或实例组聚合。
- 未声明字段不施加类型约束，不删除或过滤，仍参与数据传递、合并和实际键冲突检查，但不参与静态声明类型匹配；实际到达目标已声明的输入字段时，仍按目标声明检查类型。

前置输出多声明的字段，不要求后置输入也声明；后置输入声明的每个字段，必须在合并后的来源声明中有潜在提供方且类型兼容。条件可能关闭不免除这项静态要求，实际额外输出也不能替代声明中的潜在提供方。

### 4.3 类型兼容

静态检查比较“来源声明的类型”能否满足“接收方要求的类型”：

1. `string`、`number`、`boolean` 必须同类型匹配。
2. 对象必须与对象匹配，双方均须提供 `properties`。输入声明匹配与输出契约覆盖均要求来源递归声明并满足接收方的全部属性，额外来源属性允许存在。输入的静态覆盖只证明有潜在来源，不改变运行时嵌套属性允许缺失的规则。
3. 数组必须与数组匹配，双方均须提供 `items`，并递归检查元素类型；元素为对象时，仍按当前的输入匹配或输出契约覆盖规则处理属性。

例如，来源对象声明 name、age，可以满足只声明 name 的输入对象；反向匹配不成立，因为目标依赖的 age 没有声明中的潜在提供方。来源仅声明 order.id，而目标声明 order.id 和 order.amount 时同样编译报错。对象数组的元素声明也必须递归覆盖目标元素的全部声明属性。来源或接收方使用 object、array 字符串简写时，直接按非法 Schema 拒绝。

类型兼容只判断单个值的结构，不把来自不同前驱的同名对象字段递归合并；前驱之间的合并规则见第 6.2、8.1 节。

### 4.4 有效输出 Schema

有效 `output_schema` 是某个执行位置对下游提供的输出声明。没有 `for` 入边的位置使用顶点定义自身的 `output_schema`；有 `for` 入边的位置将每个声明字段 T 提升为 `{"type": "array", "items": T}`，完整保留嵌套类型。顶点定义自身的逐项 `output_schema` 不变。

例如逐项输出声明 `price:number`，有 `for` 入边的位置对外声明 price 为 `number` 数组。静态检查在执行前即可确定这一提升，不依赖运行时数组长度或条件结果。即使本次仅有一个实例也不取消数组提升；零实例时位置跳过，不提供输出。实际聚合规则见第 9.2 节。

### 4.5 统一的运行时校验

校验只检查值，不添加字段、转换类型、删除额外字段或修改被校验的值：

1. 输入和输出整体必须为 `map`，字段只读取自身字符串键。输入声明字段不存在时跳过该字段校验；输出声明字段不存在时报错。已经存在的声明字段均必须符合其类型描述，显式的 `undefined` 或 `null` 不等同于字段缺失。
2. `string`、`number`、`boolean`、`object`、`array` 按第 4.1 节分别检查；声明字段的 `null` 不满足任何已支持类型。
3. 结构化 `object` 按 `properties` 递归检查；结构化 `array` 按 `items` 逐项检查，保留元素数量和顺序。输入的嵌套对象同样允许声明属性缺失；输出的嵌套声明属性缺失时报错。输入数组仍须逐项检查元素类型，不能以允许对象属性缺失为由接受错误元素类型；空数组满足元素约束。
4. 未声明的额外字段不增加值类型限制，包括 `null` 及非 JSON 值；原样保留。已声明的对象和数组按其 `properties`、`items` 检查，复制边界按第 2 节处理。

引擎需要读取的输入输出顶层容器，以及按 Schema 递归读取的声明结构容器，其自身字段必须是数据属性；遇到 getter/setter 访问器属性时拒绝该数据并报错，不调用访问器。未声明字段的值仍不增加类型限制：该值可以指向内部带访问器的对象，引擎仅保留引用，不进入其内部检查。创建时的该类错误不发布 Execution；提交时按事务规则整体回滚。

Proxy 属于特殊代理对象，不作为顶层 map、声明 object 或声明 array 的数据容器接收。需要读取的容器应先识别并拒绝代理，再读取属性或检查原型。未声明字段的值仍可以是 Proxy；作为不透明额外值保留引用，不进入其内部读取。

| 校验时机 | 适用声明 |
| --- | --- |
| 根输入、DAG 输入和节点输入交付前 | 接收方 `input_schema`；有多个来源时先合并 |
| 外部节点结果被解释器接收时 | 该节点的 `output_schema`，检查全部声明字段 |
| DAG 出口输出合并后、返回前 | 该 DAG 的 `output_schema`，根 DAG 同样适用 |
| `if`/`for` 读取字段时 | 来源位置的有效 `output_schema` 中该字段的类型描述 |
| 实例组聚合 | 每项输出先通过其自身 `output_schema` 校验，聚合结果遵循有效输出 Schema |

外部负责执行节点业务，解释器负责校验输入和接收的结果。输出校验不以字段是否被下游使用、出边条件是否关闭为前提。任何校验错误均按第 12.1 节的创建或提交错误边界处理，不设置整次执行失败状态。

## 5. 字段引用、`if` 与 `for` 的写法

边 `if`、`for` 的字符串是一个不带 `{{ }}` 定界符的 [Nunjucks 表达式](https://mozilla.github.io/nunjucks/templating.html)。上下文是该边上游已通过校验的输出 map；实例组使用第 9.2 节的聚合输出。使用普通变量、属性与索引，不增加 `$` 根变量，也不按节点 ID 隐式读取其他数据。工作流定义不会先作为模板生成或重写。

以下为边字段片段：

```yaml
if: 'review.approved and review.score + 5 >= 80'
for: 'review.jobs'
```

解析、比较、逻辑、算术、filter、test 与内置全局函数均交给库；`==` 沿用库的比较语义，严格比较使用 `===`。不保留旧 `$.field` 格式或自定义比较规则。通用语法以库文档为准。

`if` 必须得到原生 boolean；false 关闭边，字符串 `"false"`、缺失值等不满足结果契约。`for` 必须得到带合法 key 的对象数组；key 的值符合第 3.1 节标识规则且同次展开唯一，移除 key 后参与输入合并。显式空数组跳过目标。边取得原生值，不通过文本渲染后 JSON 解析或真值转换模拟类型。

固定业务属性路径可从 Schema 确定时必须声明，额外运行数据不能补救非法引用。能够确定的直接结果类型和数组元素声明继续检查；动态访问和计算结果无法证明结构时允许执行，将最终结果、逐项类型及合并冲突交给运行时。不维护完整表达式类型推导系统，未知部分也不豁免其他已知错误。

缺失值在表达式内部遵循库，包括存在性测试、默认值和短路；只要求最终结果满足消费契约。声明字段存在但类型错误时仍先拒绝，默认值不能掩盖输入错误。环境关闭 HTML 自动转义，不配置外部模板加载器、文件系统搜索目录、异步或自定义扩展。节点文本的上下文、输出和 Bash 限制见[输入引用](./nodes/input-references.zh.md)。

## 6. 静态合法性检查

执行前必须检查全部定义，包括本次可能因 `if` 或空 `for` 而不执行的定义。实际数据碰巧满足要求不能使静态非法程序变为合法。来源声明可以确定时，输入字段未被覆盖必须静态报错，包括任意层级的嵌套声明；动态 for 的限制见第 6.2 节。

### 6.1 身份、端点与无环约束

1. 源程序中所有显式提供的字符串 `id` 必须全局唯一，包括嵌套实体和边。`node`、`dag` 不得省略 `id`；`edge` 可省略。`from`、`to` 引用顶点定义 ID，不创建新定义。
2. 普通端点必须解析为所在 `dag` 数组中的直接顶点，不得连接边或穿透子 DAG 边界。
3. DAG 内直接包含的边还允许引用当前 DAG 的定义 ID，表示下一次实例化该定义的递归执行位置，不表示当前实例。
4. 同一层对当前 DAG 的所有引用绑定到同一递归位置 R。
5. 同一层不得存在相同的 (`from`, `to`) 端点对，即使边 ID、`if` 或 `for` 不同也必须拒绝。
6. 同一目标最多有一条携带 `for` 的入边，即使条件互斥也不得有多条。本期不定义多个 `for` 的配对、拼接或笛卡尔积。
7. 普通节点、子 DAG 和递归位置共同参与本层无环检查。定义允许自递归，但每层解析后的执行依赖必须无环；静态检查不得无限展开递归。
8. 指向当前 DAG 定义 ID、用于创建下一层实例的递归入边必须显式提供 `if`，并通过表达式及类型检查；缺少时必须在编译期报错。`for` 不能替代该条件要求。递归位置的普通出边不因其来源是递归位置而必须提供 `if`。
9. 本层只要引用当前 DAG 的定义 ID，所形成的递归位置就必须至少有一条入边。仅将当前 DAG 用作 `from`、使递归位置成为结构入口的定义必须拒绝。

例如当前 DAG 为 D，A → D 和 D → A 解析为 A → R → A，必须拒绝；D → D 解析为 R → R，也必须拒绝。端点类型、递归或 `if` 都不能豁免真正的依赖环。

### 6.2 输入声明匹配与冲突

静态检查按定义中的全部边分析，不以条件是否互斥、是否可能关闭或数组是否可能为空来放宽能够确定的约束。

| 执行位置 | 用于检查输入的来源声明 |
| --- | --- |
| 根 DAG | 外部调用方明确提供的输入声明；工坊没有此来源 |
| 结构入口 | 所在 DAG 的 `input_schema`；该 DAG 的声明继续沿其外部来源检查 |
| 无 `for` 入边的非入口 | 所有普通前驱的有效 `output_schema` |
| 有 `for` 入边的目标 | `for` 数组元素的 `properties` 去掉 `key`，再加所有普通前驱的有效 `output_schema` |

来源声明按顶层键平铺合并。同名键必须静态报错，即使类型相同、值可能相同或条件保证实际不会同时传入，也不允许。`for` 项的业务字段与普通前驱声明的同名字段同样冲突；不追加产生 `for` 数组的上游原始输出声明。

合并后的来源声明必须覆盖目标 `input_schema` 的全部声明字段，并按第 4.3 节递归检查类型兼容，包括对象属性和数组元素内部的声明。声明依赖必须有潜在提供方，但不要求每个前驱或 `for` 项单独覆盖目标的全部输入；它们共同提供的声明满足要求即可。

未声明的额外输出不参与静态类型匹配，不能补足缺少的来源声明。没有任何来源声明提供目标依赖字段时编译报错。额外输出在运行时仍参与实际键冲突检查；实际到达目标已声明的字段仍按目标输入 Schema 检查类型。

动态访问或计算数组无法确定元素声明时，仅将未知项的来源覆盖、类型和合并冲突留至运行时；普通前驱等已知来源仍完整检查，包括已知来源之间的冲突及其与接收方的类型兼容。此时不能宣称编译已证明全部输入来源。实际输入允许缺失的规则不变，不能把推迟检查解释为新增全部输入必填要求。

### 6.3 DAG 边界与检查范围

DAG 的 `input_schema` 必须按输入匹配规则递归覆盖每个结构入口的 `input_schema`，且类型兼容；入口声明的依赖必须有 DAG 输入声明作为潜在来源。全部结构出口的有效 `output_schema` 平铺合并后，必须无声明键冲突，并覆盖 DAG `output_schema` 的必需字段及类型要求。上述检查也不因条件可能关闭而放宽。

执行前还必须检查实体结构、必需标准字段、Schema 描述及其嵌套类型、表达式语法和引用字段类型。`if` 运行时为 `false` 时不求值 `for`，不代表可以免除 `for` 的静态检查。

静态检查仅对能够确定的声明证明契约相容，不证明动态表达式的全部来源，也不证明所有运行分支都会提供完整数据。DAG 声明输出缺失、实际值类型错误、额外字段造成实际键冲突、`for` 的 `key` 缺失、非法或重复等情况，必须在运行时检查并报错。

## 7. 激活、实例与执行位置

### 7.1 根实例与身份

外部系统编译 DAG 定义对象，再提供根输入创建执行。编译后的定义与规则固定，外部修改原定义或查询所得定义不得影响后续执行。根实例只执行一遍；重新创建执行形成独立实例树，不复用上一根实例的执行状态。

运行时实例至少记录实例 ID、定义 ID 和父实例 ID，根没有父实例。实例 ID 必须在单次初始化的实例树内唯一，同一定义可以有多个实例；跨初始化的身份区分由外部管理。

`for` 每项必须显式提供符合第 3.1 节标识规则的字符串 `key`，同一次数组结果内唯一。它是逐项标识及诊断元数据，不承担系统实例 ID 的生成、数组重排后的重关联或增量计算；目标定义由 `to` 确定。系统继续分配不透明的实例 ID，调用方不得从 ID 推导业务身份；它只保证在单次执行内唯一。

### 7.2 边的激活

边必须等待上游位置成功完成或跳过；实例组必须等待所有实例成功完成并聚合。未成功提交结果的实例继续等待，不作为完成或跳过处理；提交错误按第 12.1 节回滚。随后按以下顺序处理：

1. 上游被跳过时，出边不激活，不求值 `if` 或 `for`。
2. 有 `if` 时按下述读取规则求值；结果为 `false` 则边不激活，也不再求值 `for`。
3. `if` 缺省或为 `true`，且没有 `for` 时，边激活，提供上游输出。
4. 有 `for` 时按下述读取规则取得数组，检查元素为 `object`、`key` 符合标识字符规则且不重复。非空数组使边激活，空数组不激活边。

`if`/`for` 在来源输出上下文中按库规则求值，固定引用按有效 `output_schema` 静态检查，最终结果按本节检查。缺失值的存在性检查、默认值与短路遵循库，不改写上游输出；`if` 关闭时不求值 `for`。上游输出已在返回时校验全部声明字段，因此 `if` 关闭不能豁免上游输出缺字段或类型错误。

例如，前置声明 `enabled:boolean`、jobs 为合法的 `for` 数组类型，实际返回 `{}` 时，必须在提交输出时抛错并回滚。实际返回 `{"enabled": false, "jobs": []}` 时输出校验通过，边不激活且不求值 `for`。

直接以缺失值作为 `for` 结果、或元素 `key` 缺失必须报错；显式空数组是合法值，不创建实例。每项必须由上游显式提供固定字段 `key`，值符合第 3.1 节标识规则且同次展开唯一；不从其他业务字段推断或自动补齐。不同批次可复用相同 key。普通业务对象中的 key 不会因此被全局解释为逐项身份。`if` 关闭时不进行本次 `for` 的 `key` 字符和唯一性检查；这些身份约束与始终执行的输出类型校验不同。条件独立求值，不保证互斥。

### 7.3 实例数量与跳过传播

各位置必须等待全部结构前驱成功完成或跳过，再根据本次激活情况决定实例数量。

| 位置与入边情况 | 实例数量 | 原始输入来源 |
| --- | --- | --- |
| 结构入口 | 1 | 所在 DAG 的已校验输入 |
| 无 `for` 入边，至少一条普通入边激活 | 1 | 所有激活普通前驱的输出 |
| 无 `for` 入边，所有入边均不激活的非入口 | 0，跳过 | 无 |
| 有 `for` 入边，该边激活且数组有 N 项 | N | 各项去掉 `key`，与所有激活普通前驱输出合并 |
| 有 `for` 入边，该边不激活或数组为空 | 0，跳过 | 普通入边不创建替代实例 |

空分支不创建实例，也不产生输出或空聚合占位。被跳过位置的出边继续不激活；仅依赖该分支的后续位置随之跳过。有其他激活普通入边的位置仍需要执行，但实际输入必须通过第 8 节校验，声明字段缺失允许通过，存在但类型错误时失败。

结构入口和出口按完整定义计算，不因 `if` 关闭或位置跳过而改变。确定目标会创建后，按第 8.1 节提前检测已激活来源的实际键冲突；完整输入合并与输入 Schema 校验仍在全部前驱结束、所需实例数量确定后且创建实例前进行，不会重新激活边或创建被跳过的实例。

## 8. 输入合并与校验

本节对 `node`、`dag` 及外部根输入使用同一套规则：按第 7.3 节确定来源，先合并数据，再按接收方 `input_schema` 执行第 4.5 节校验，校验通过后交给实例。

### 8.1 先合并，再校验

按第 7.3 节确定原始输入来源，将其顶层字段平铺合并。实际同名键必须报错，即使值或类型相同；不覆盖、不递归合并同名对象，也不自动拼接数组。额外字段同样参加冲突检查。

有 `for` 入边时，从每项移除身份字段 `key`，将剩余字段与激活的普通前驱输出合并。普通前驱是每个展开实例的共同依赖；不额外创建目标实例，也不追加 `for` 来源节点的整个输出。

必须先完成所有来源合并，再按目标 `input_schema` 检查；不能要求每个来源分别满足目标的全部输入要求。普通连接不自动移除同名业务字段 `key`。

实际输入键冲突应在能够确定目标会创建实例后尽早检测，不必等齐全部结构前驱。无 `for` 入边的非入口在至少一条普通入边激活后即可确定会创建；有 `for` 入边的目标在该边通过检查并激活非空数组后才能确定会创建。此后，每次新增已激活来源都检查其与已有已激活来源的实际键冲突，包括额外字段；逐项输入按去掉 `key` 的当前项与普通共同依赖分别检查。发现冲突时，触发本次检测的提交整体回滚，先前成功提交保持有效。

如果 `for` 入边尚未判定，目标仍可能整体跳过，暂不因普通来源之间的输入键冲突拒绝提交；目标最终跳过时不进行输入合并检查。若后续确定会创建，立即检查此前暂缓的冲突，由触发该检查的本次提交承担回滚。提前检查冲突不意味着提前创建实例；完整输入合并、输入 Schema 校验和实例创建仍等待全部结构前驱成功完成或跳过。

### 8.2 输入字段缺失与类型错误

例如 C 声明输入 `{"order_id": "string", "currency": "string"}`，只收到 `{"order_id": "123"}` 时，输入校验通过，currency 保持缺失，由外部节点业务判断如何处理。显式提供 `{"order_id": "123", "currency": ""}` 也满足该 Schema；引擎不补默认值。

address 声明包含字符串 city 时，整个 address 缺失、或实际值为 `{}` 都允许通过；实际值为 `{"city": 123}` 则报类型错误。amount 声明为 `number` 却实际收到 `"abc"` 时也报错。缺失与显式的 `null`、`undefined` 不同，后两者不满足已支持的声明类型。语言不替外部业务构造默认数据。

### 8.3 DAG 输入边界

DAG 先校验自身输入，再按第 2 节的值语义把输入提供给所有结构入口，各入口按自己的 `input_schema` 校验。非入口不自动追加 DAG 输入，只使用第 7.3 节规定的来源。

被跳过的位置没有实例，不进行该位置的输入校验。需要执行的位置允许因条件关闭而缺少输入字段，但已有声明字段仍须符合类型。所有入边均不激活时仍按跳过规则处理，不因输入允许缺失而创建实例。DAG 自身的输出要求另按第 9.3 节检查。

## 9. 实际输出、聚合与 DAG 返回值

### 9.1 节点输出校验

外部节点提交的输出必须为 `map`，并立即按节点 `output_schema` 执行第 4.5 节的完整校验。校验通过后，输出才可用于本次事务内部的边求值、数据传递、聚合或 DAG 返回值计算；输出及其触发的内部流转全部成功后，才发布节点完成状态。声明结构按第 2 节复制，额外字段原值保留，对象按引用保存。

例如 B 声明输出 `{"price": "number"}`，返回 `{}`、`{"price": "bad"}` 或 `{"price": null}` 都必须在提交结果时抛错并回滚；返回 `{"price": 0}` 则合法。这一结果不受下游是否声明 price、是否有出边、出边 `if` 是否关闭或 B 是否属于实例组影响。

### 9.2 实例组逐字段聚合

非空 `for` 的目标作为实例组参与本层执行。每个实例输出都先独立通过其 `output_schema` 校验，再以所有实际输出字段的并集进行聚合。声明字段已保证存在于每个实例输出中。聚合保留字段名，每个字段变成各实例对应值组成的数组。

聚合直接使用已校验的字段值，不补齐声明字段、不转换类型，也不改写各实例输出。任一实例尚未成功提交时，实例组继续等待，不生成部分聚合结果作为成功输出。外部执行失败由外部处理，提交校验错误按第 12.1 节回滚。

例如两项输出为 `{"price": 100, "valid": true}` 和 `{"price": 200, "valid": false}`，聚合为：

```json
{"price": [100, 200], "valid": [true, false]}
```

数组按 `for` 原始项顺序排列，不按执行完成顺序排列。不同字段相同下标对应同一实例；单个实例也聚合为数组，原值为数组时产生嵌套数组，不自动展平。`key` 不自动加入业务输出。

额外输出字段只出现在部分实例时，缺失位置用 `null` 占位，不压缩数组。例如：

```json
{"price": [100, 200], "note": ["优惠", null]}
```

此处 `null` 仅用于未声明额外字段的聚合占位，不用于修复声明字段缺失；实际额外字段值为 `null` 时也原样保留，聚合结果不区分这两种来源。

例如两个实例均声明 `price:number`，实际输出分别为 `{"price": 100}` 和 `{}`，第二个实例提交时在输出校验处抛错并回滚，不产生 `{"price": [100, 0]}` 或 `{"price": [100, null]}`。

有效输出 Schema 的提升规则见第 4.4 节。例如 price 的 `number` 提升后为：

```json
{"price": {"type": "array", "items": "number"}}
```

下游若声明 price，必须满足第 4.3 节数组兼容规则；不要求下游声明所有聚合字段。组输出作为整体供出边使用，不自动逐项延伸后续图；下游只有显式使用 `for` 才再次展开。

### 9.3 DAG 输出边界

DAG 输出平铺合并所有实际执行的结构出口输出，实例组先聚合。实际键冲突报错；没有实际执行出口时，合并结果为空 `map`。合并结果必须按该 DAG 的 `output_schema` 通过第 4.5 节校验，才能作为成功输出返回。

node 和 dag 都是顶点，DAG 输出合并采用同样的尽早冲突检测规则：每个结构出口形成合法输出后，即检查其与已有已完成出口输出的实际键冲突，包括额外字段，不等待其他出口全部结束。触发冲突的本次提交按第 12.1 节整体回滚。for 出口仍等待全部逐项实例完成并聚合后，才作为一个来源参与检查。完整 DAG 输出合并和最终 Schema 校验仍等待本层全部位置完成或跳过。

被跳过的位置不成为新入口或出口。条件关闭或空 `for` 导致合并结果缺少 DAG 声明字段时必须报输出校验错误，并按第 12.1 节处理；空 `map` 只满足空 `output_schema`。根 DAG 与嵌套 DAG 遵循相同的输出校验规则，不补值、不返回不满足声明的成功结果。

## 10. 按需执行与递归

完成第 6 节全部静态检查后，按如下语义执行根 DAG 及各子 DAG：

1. 按第 8 节校验 DAG 输入，使用本层解析后的无环依赖计划。
2. 等待各位置全部结构前驱成功完成或跳过，按第 7 节判定边激活与实例数量。
3. 对需要执行的位置合并来源、校验输入，通过后创建实例；跳过位置不校验输入。
4. `node` 的业务动作由外部运行时执行；`dag` 按相同规则执行内部定义。递归位置此时才创建下一层。
5. 按第 9 节校验输出、聚合实例组，最终合并出口并校验 DAG 输出，通过后返回。任一步错误均按第 12.1 节处理；提交错误撤销本次提交触发的全部内部变化，此前已提交状态保留。

无依赖位置的具体执行顺序未规定。在各对应实例输出相同、外部未修改共享对象的前提下，不同合法执行顺序不得改变成功完成时的最终根 DAG 输出；实例 ID、中间快照及记录排列不要求相同，`for` 聚合始终按原始项顺序排列。边不作为独立任务执行。建立执行计划不意味着提前创建全部实例或递归层级。

递归位置不得绑定为当前 DAG 实例。上一层等待下一层完成属于嵌套调用，下一层不反向等待上一层；输出沿调用返回，不增加反向依赖边。

无循环依赖不保证终止。递归入边必须带 `if`，但条件存在不保证最终为假。`if` 为 `false` 或空 `for` 可以阻止继续递归；程序需要自行定义终止条件和业务结果；第一版引擎不增加递归深度或实例数量等执行资源上限。终止层与其他层一样，实际返回值必须满足该 DAG 的 `output_schema`；停止递归不自动生成返回值。本期无 break、continue 或迭代间自动串联。

## 11. 完整示例

以下 JSON 示例用于单独说明引擎编排规则，其中包含合法与明确标注的非法示例。它们不是可直接加载的工坊模板：用于工坊时须补充各普通节点的 `node_kind` 及相应业务配置，并满足工坊无外部根输入的限制。可直接加载的 YAML 示例见[最小模板](#11-最小可运行模板)及各节点文档；直接调用引擎见[开发说明](./development/dag-engine-api.zh.md)。

### 11.1 普通连接

```json
{
  "id": "main", "type": "dag",
  "input_schema": {"order_id": "string"},
  "output_schema": {"valid": "boolean"},
  "dag": [
    {
      "id": "load", "type": "node",
      "input_schema": {"order_id": "string"},
      "output_schema": {"order": {"type": "object", "properties": {"order_id": "string"}}}
    },
    {
      "id": "validate", "type": "node",
      "input_schema": {"order": {"type": "object", "properties": {"order_id": "string"}}},
      "output_schema": {"valid": "boolean"}
    },
    {"id": "load_validate", "type": "edge", "from": "load", "to": "validate"}
  ]
}
```

根输入 `{"order_id": "a"}` 交给 load，load 输出的 order 交给 validate，validate 的 valid 成为根输出。节点如何加载或校验订单不属于语法规范。

### 11.2 `for`、共同依赖与条件造成的输入缺失

```json
{
  "id": "dispatch", "type": "dag",
  "input_schema": {},
  "output_schema": {"price": {"type": "array", "items": "number"}},
  "dag": [
    {
      "id": "prepare", "type": "node",
      "input_schema": {},
      "output_schema": {
        "jobs": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {"key": "string", "order_id": "string"}
          }
        }
      }
    },
    {
      "id": "config", "type": "node",
      "input_schema": {},
      "output_schema": {"enabled": "boolean", "currency": "string"}
    },
    {
      "id": "worker", "type": "node",
      "input_schema": {"order_id": "string", "currency": "string"},
      "output_schema": {"price": "number"}
    },
    {"id": "jobs_worker", "type": "edge", "from": "prepare", "to": "worker", "for": "jobs"},
    {"id": "config_worker", "type": "edge", "from": "config", "to": "worker", "if": "enabled"}
  ]
}
```

静态检查从 jobs 的元素声明取得 order_id，从 `config` 取得 currency，共同覆盖 worker 的全部输入声明且类型兼容。`key` 是逐项标识，不进入 worker 业务输入；`config` 额外声明的 enabled 不要求 worker 声明。

假设 prepare 实际输出：

```json
{"jobs": [{"key": "a", "order_id": "order-a"}, {"key": "b", "order_id": "order-b"}]}
```

| `config` 实际输出 | 执行结果 |
| --- | --- |
| `{"enabled": true, "currency": "CNY"}` | 第一个 worker 收到 `{"order_id": "order-a", "enabled": true, "currency": "CNY"}` |
| `{"enabled": false, "currency": "CNY"}` | `config` 输出合法，但其边关闭；worker 输入缺少 currency，校验通过，两个 worker 实例仍进入可执行前沿，由外部业务处理缺失字段 |
| `{}` | `config` 缺少声明输出字段，在结果提交时抛错并回滚，不进行出边求值 |

第一种情况下创建两个 worker 实例，每个实例等待 prepare 和 `config` 成功完成。假设两项各返回 price 为 100、200，根输出为 `{"price": [100, 200]}`。第二种情况下同样创建两个 worker 实例，但输入没有 currency；最终能否提供合法输出由外部业务决定。第三种情况在提交 config 输出时抛错并回滚。

若 prepare 返回 `{"jobs": []}`，且 `config` 输出合法，则本次流转会跳过 worker，`config` 不能单独创建替代实例。根出口合并结果为 `{}`，缺少声明的 price，因此触发 DAG 输出校验错误；引发该错误的提交整体回滚，不留下 worker 已跳过的部分状态，也不自动返回 `{"price": []}`。若业务要求零项时成功返回空数组，必须由实际执行的出口显式提供该字段。

若 prepare 实际输出缺少 jobs，在节点结果提交时即抛错并回滚。若 prepare 使用 `"array"` 简写，则 Schema 本身非法，编译报错；即使提供了 items，若元素不是对象或没有声明字符串 key，仍因不满足 for 的结构要求而编译报错。

### 11.3 普通嵌套 DAG

```json
{
  "id": "outer", "type": "dag",
  "input_schema": {"order_id": "string"},
  "output_schema": {"valid": "boolean"},
  "dag": [
    {
      "id": "check_order", "type": "dag",
      "input_schema": {"order_id": "string"},
      "output_schema": {"valid": "boolean"},
      "dag": [
        {
          "id": "check", "type": "node",
          "input_schema": {"order_id": "string"},
          "output_schema": {"valid": "boolean"}
        }
      ]
    }
  ]
}
```

check_order 是 outer 的结构入口和出口；check 是 check_order 的结构入口和出口。order_id 逐层作为入口输入传递，check 输出的 valid 逐层合并返回。外层不得越过 check_order 直接连接 check。

### 11.4 按需递归及终止

```json
{
  "id": "recursive", "name": "递归处理", "type": "dag",
  "input_schema": {"items": {"type": "array", "items": "string"}},
  "output_schema": {},
  "dag": [
    {
      "id": "step", "type": "node",
      "input_schema": {"items": {"type": "array", "items": "string"}},
      "output_schema": {
        "items": {"type": "array", "items": "string"},
        "again": "boolean"
      }
    },
    {"id": "recur", "type": "edge", "from": "step", "to": "recursive", "if": "again"}
  ]
}
```

假设 step 在 `items` 非空时移除首项并输出 again=`true`，已经为空时输出 again=`false`。节点代码不属于示例语法；空输出契约用于单独说明递归，不产生业务结果。

| 实例 | step 输入 `items` | step 输出 | 下一层 |
| --- | --- | --- | --- |
| D₁ | `["a", "b"]` | `{"items": ["b"], "again": true}` | 创建 D₂ |
| D₂ | `["b"]` | `{"items": [], "again": true}` | 创建 D₃ |
| D₃ | `[]` | `{"items": [], "again": false}` | 不创建 D₄ |

每层计划为 step → 下一次 D，均无环。D₃ 的递归位置跳过，没有实际执行的结构出口，输出空 `map`，满足空契约；结果沿 D₂、D₁ 返回。step 不因条件关闭而成为出口。业务结果需要另行定义终止出口及条件。

本例仅展示递归的创建、终止和返回路径，不展示业务结果计算。若只把 D 的 `output_schema` 改为 `{"result": "number"}`，而不增加产生结果的路径，完成 D₃ 时就会因缺少 result 而报输出校验错误，引发该错误的提交整体回滚。下一层的输出只沿递归位置的出边传递；语言不会自动将 step 的输出或终止条件转换成递归返回值。互斥分支汇合还必须遵守下一节的冲突规则。

### 11.5 互斥分支的同名输出仍然非法

以下程序试图按 flag 二选一执行 left 或 right，再把它们的 result 交给 merge：

```json
{
  "id": "choice", "type": "dag",
  "input_schema": {"flag": "boolean"},
  "output_schema": {"result": "number"},
  "dag": [
    {
      "id": "select", "type": "node",
      "input_schema": {"flag": "boolean"},
      "output_schema": {"flag": "boolean"}
    },
    {"id": "left", "type": "node", "output_schema": {"result": "number"}},
    {"id": "right", "type": "node", "output_schema": {"result": "number"}},
    {
      "id": "merge", "type": "node",
      "input_schema": {"result": "number"},
      "output_schema": {"result": "number"}
    },
    {"type": "edge", "from": "select", "to": "left", "if": "flag"},
    {"type": "edge", "from": "select", "to": "right", "if": "flag == false"},
    {"type": "edge", "from": "left", "to": "merge"},
    {"type": "edge", "from": "right", "to": "merge"}
  ]
}
```

本程序必须在静态检查时拒绝：merge 的两个前驱都声明 result，即使两条分支条件互斥也发生声明键冲突。语言没有“取实际执行分支的同名值”这一合并规则。

将两侧输出分别改名为 left_result、right_result，并让 merge 声明这两个输入字段，则可以保留二选一分支。声明冲突消失；merge 实际只收到已执行分支的字段，缺失另一字段不构成输入错误，由其外部业务区分并产生统一的 result 输出。

一种合法替代方式是把二选一的业务判断封装在单个外部节点中，由该节点统一提供 result：

```json
{
  "id": "choice", "type": "dag",
  "input_schema": {"flag": "boolean"},
  "output_schema": {"result": "number"},
  "dag": [
    {
      "id": "choose_result", "type": "node",
      "input_schema": {"flag": "boolean"},
      "output_schema": {"result": "number"}
    }
  ]
}
```

外部执行方根据 flag 计算对应结果，必须返回包含 `number` 类型 result 的 `map`。这种写法只创建一个节点实例；若需要保留独立的分支执行位置，则可以采用不同字段名汇合，由汇合节点业务区分实际到达的字段。

## 12. 错误与实现边界

### 12.1 错误分类

| 阶段 | 必须报告的错误情形 |
| --- | --- |
| 静态检查 | 结构错误、标准字段缺失或类型错误、重复定义 ID、非法端点、重复端点对、同一目标多条 `for` 入边、依赖环、非法 Schema 描述、声明键冲突、输入声明缺少潜在来源或嵌套覆盖不足、DAG 输出声明覆盖不足、声明类型不兼容、非法表达式或引用、递归位置没有入边、递归入边缺少 if |
| 运行时 | 实际合并键冲突、需要读取的数据容器含 getter/setter、非 `map` 输入或输出、输出声明字段缺失、输入或输出已有声明字段类型错误（含嵌套字段）、表达式读取或求值失败、`if` 非 `boolean`、`for` 非 `object` 数组、`key` 缺失或非法或重复 |

运行时错误按照调用边界处理：

- 创建执行：根输入校验或初始展开发生错误时，抛出异常，不发布可用的 Execution。
- 提交结果：输出校验以及由该结果触发的表达式求值、输入合并与校验、展开、实例组聚合、DAG 完成或输出校验发生错误时，整体回滚本次提交并抛出结构化异常。此前已经成功提交的状态不撤销，提交实例保持本次调用前的状态。即使节点输出本身合法，也不能独立发布其完成状态。
- 外部业务失败：由外部决定重试或放弃。引擎不接收 fail() 上报，不将失败当作跳过，实例保持等待合法结果。

引擎不因上述错误设置整次执行 failed 状态，不自动重试。回滚不保证更换当前输出一定能修复错误；调用方应根据异常决定重试或放弃本次执行。事务及复制保证只覆盖引擎内部状态，不撤销外部业务副作用或外部对共享额外对象的修改。同步提交期间不得通过查询观察未发布的中间状态。

### 12.2 实现设计范围

本项目的初始化、查询和提交用法见[内部引擎 API](./development/dag-engine-api.zh.md)；完整类型和异常定义从 `packages/dsh-workflow-studio/src/host/dag/index.ts` 导出。实例 ID 的内部生成、状态存储、模块划分、解析和推进算法属于实现设计，不改变本规范的执行行为。

实现必须遵守本文规定的可观察行为，包括静态拒绝条件、声明结构与额外引用的隔离边界、输入存在时检查类型、输出严格校验、提交回滚、实例数量及聚合顺序，不能将它们作为实现方自行选择的策略。

表达式求值时机沿用事务与保存边界：普通恢复直接还原已保存的边状态、展开项及输入输出，不重新抽样；回滚后重提，以及成功业务已保存而 DAG 状态未保存时的恢复重提，重新求值尚未提交的边。库的 random 等能力在重新求值时允许产生不同结果；不增加缓存或随机种子。Agent/Bash 新业务尝试重新渲染，已成功业务仅重提 DAG 时不重复业务。
