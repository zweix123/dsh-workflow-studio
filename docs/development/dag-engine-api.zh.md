# 在项目中调用 DAG 引擎

本文供维护 Studio 内部引擎与校验工具的开发者使用。编排规则以 [DAG 语法](../dag-syntax.zh.md)为准；独立节点插件使用[公共节点契约](../node-plugin-authoring.zh.md)，不依赖这里的内部模块。

引擎作为 Host 内部模块维护，源码入口为 `packages/dsh-workflow-studio/src/host/dag/index.ts`。定义、编译器、执行状态和数据校验均在项目内部，不依赖参考目录或其他引擎包。模块职责如下：

| 文件 | 职责 |
| --- | --- |
| `index.ts` | 统一导出 `compile`、公开类型和异常 |
| `compiler.ts` | 定义校验、Schema 与表达式检查、依赖计划 |
| `runtime.ts` | 按需实例化、内部推进、快照与原子提交 |
| `data.ts` | 数据容器检查、Schema 校验、声明结构复制 |
| `expression.ts` | 有限表达式解析和求值 |
| `errors.ts`、`types.ts` | 结构化异常与类型契约 |

Host 源码从该模块入口导入。执行根目录的 `npm run build` 后，也可直接调用独立 ESM 产物 `packages/dsh-workflow-studio/lib/host/dag/index.js`；类型声明位于 `lib/types/host/dag/index.d.ts`（相对于插件目录）。运行环境与项目一致：Node.js `^22.19.0 || >=24.0.0`，无第三方运行时依赖。

以下命令从项目根目录执行，展示普通节点由调用方完成并提交结果的完整过程：

```bash
node --input-type=module <<'JS'
import { compile } from './packages/dsh-workflow-studio/lib/host/dag/index.js'

const program = compile({
  id: 'main',
  type: 'dag',
  input_schema: { value: 'number' },
  output_schema: { result: 'number' },
  dag: [{
    id: 'double',
    type: 'node',
    input_schema: { value: 'number' },
    output_schema: { result: 'number' },
  }],
})
const execution = program.createExecution({ value: 3 })
const [task] = execution.getFrontier()
execution.submit(task.instanceId, { result: task.input.value * 2 })
console.log(execution.getResult()) // { status: 'completed', output: { result: 6 } }
JS
```

## 调用与状态

| 调用 | 返回与含义 |
| --- | --- |
| `compile(definition, rootProvider?)` | 校验已解析的定义对象，返回可复用的 `Program`；可选的根提供方声明使用相同来源覆盖检查，工坊传入 `{}` 表示没有外部业务输入 |
| `program.getDefinition()` | 返回完整定义副本，修改它不会改变已有程序 |
| `program.createExecution(rootInput)` | 校验根输入并推进初始状态，返回独立 `Execution` |
| `execution.getFrontier()` | 返回已创建、尚未成功提交结果的普通节点实例及其定义、输入和身份 |
| `execution.submit(instanceId, output)` | 同步校验并推进；成功返回 `void`，失败抛错并回滚本次变更 |
| `execution.getSnapshot()` | 返回已展开实例、等待/跳过位置和边状态 |
| `execution.getResult()` | 返回 `{ status: 'running' }` 或 `{ status: 'completed', output }` |

查询不推进执行，也不领取任务。普通节点快照的状态仅为 `ready` 或 `completed`；DAG 实例为 `running` 或 `completed`。边为 `pending`、`active` 或 `inactive`。引擎不记录外部任务的运行、失败、取消或重试状态，快照不是持久化恢复格式。

`instanceId` 只在当前 Execution 内有效，提交时应使用前沿返回的值。`parentInstanceId` 指向直接容纳实例的 DAG，不是前驱节点；根实例的父身份为 `null`。逐项实例另带 `forItem: { key, index }`，其中 `index` 为原数组的零起始下标。快照中的 `definitionPath` 指向定义树，根路径为 `[]`；等待或跳过位置尚无实例。

## 异常处理

- `CompileError.issues` 给出错误码、定义路径和说明。
- `InitializationError` 表示创建执行失败；此时没有可用的执行对象。
- `SubmissionError` 表示本次提交失败，`submittedInstanceId` 标识提交者；错误实际位置可能在下游。
- 后两者继承 `ExecutionError`，提供 `code`、`operation`、`phase`、`location`，以及适用时的 `dataPath`、`sources` 和 `cause`。调用方按这些字段处理，不解析错误文案。

重复提交已完成节点会报 `ALREADY_COMPLETED`；提交 DAG 实例会报 `NOT_SUBMITTABLE`；未知实例会报 `UNKNOWN_INSTANCE`。错误不会自动跳过节点、设置整个执行失败或重试任务。

## 验证

在项目根目录运行 `npm run check`，完成类型检查、构建及全部测试。引擎行为测试直接导入本项目构建产物，覆盖静态拒绝、条件、逐项节点和 DAG、按序聚合、嵌套与自递归、事务回滚、结构隔离和数据容器限制；另有启用 `exactOptionalPropertyTypes` 的类型契约检查。

实例管理 Tab 已接入模板读取、HTTP 接口、宿主领域存储和真实业务执行。创建时保存模板快照、空根输入与可恢复的实例运行图；详情画布展示运行图投影。agent 通过原生结构化输出交付声明结果，无输出时提交空对象；台后等待人工确认。bash 的合法 stdout JSON 对象和 form 的有效正式提交把真实结果交给 DAG。
