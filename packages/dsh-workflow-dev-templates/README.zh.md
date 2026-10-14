# 开发用节点功能模板

这是开发时附加装配的纯配置模板包，使用真实的 form、bash 和 agent 节点。默认 `dsh-workflow-bundle` 不依赖或加载本包，普通用户仍只得到内置业务模板。

## 装配与体验

仓库根目录运行 `npm run dev`，构建并向隔离的 `.local/dsh-dev/` 添加默认 bundle 和本包，再启动已有的 dsh `0.2.0-rc.1`。默认端口 3081；可用 `npm run dev -- --port 3082 --no-open` 覆盖启动参数。`npm run install:dev` 只完成构建和装配，不启动宿主。安装和启动都使用同一个开发 DSH_HOME，不修改日常 profile。

也可以在已经装配默认 bundle 的独立开发宿主中，通过本地目录添加本包：

```sh
DSH_HOME="你的开发 home" dsh plugin --profile web add ./packages/dsh-workflow-dev-templates --registry=https://registry.npmjs.org
```

启动时继续使用相同的 DSH_HOME。在工坊现有模板列表中查看“开发 · …”模板，选择独立体验工作区创建实例。这里不新增示例分类、节点登记字段或专用运行模式。

旧 profile 若手动添加过已删除的 examples 包，须在原 home 撤销对应插件登记；详见[旧安装迁移说明](../../README.zh.md#本地开发)。开发入口使用新的隔离 home，不迁移或清理日常 profile。

| 模板 | 操作 | 预期 |
| --- | --- | --- |
| 表单节点功能 `dev-form.zh` | 修改说明和枚举；增删任务；切换标签；提交后打开核对预填并提交 | 标量、对象、数组、枚举名称及多选正常；真实上游值覆盖备用默认值；提交后只读，根结果保留 0、false 和空数组 |
| Bash 节点功能 `dev-bash.zh` | 提交带引号、换行的输入；执行手动命令；观察自动命令；核对结果后执行无输出命令 | 输入原样传递；包内脚本通过 DSH_TEMPLATE_DIR 读取；日志和业务输出分开；自动节点只运行一次，无输出节点交付空对象 |
| Bash 失败与重试 `dev-bash-retry.zh` | 在独立工作区对同一节点依次执行三次，再提交结果表单 | 第一次退出码 7，第二次输出类型错误，均不推进下游；第三次交付有效字符串；脚本写 `.dsh-dev-bash-retry.json`，重新体验前删除此计数文件 |
| Agent 节点功能 `dev-agent.zh` | 提交需求；执行台前节点并进入对话；生成结束后完成；查看自动台后任务的记录与结果，再确认完成 | 台前整理交付 summary；嵌套 DAG 内台后节点自动执行，结果仍须人工确认；根 DAG 最终交付 report |

Agent 模板需要开发宿主已配置模型；这里不安装模型、不复制日常凭据。其他模板不依赖模型。台后失败或中断时可人工重试，自动启动不表示自动重试；成功业务结果的保存、DAG 提交和重启恢复使用正式节点的原有规则。

## 维护与验收

节点实现、公共契约和作者接入方式直接参考正式节点包及[节点作者指南](../../docs/node-plugin-authoring.zh.md)、[模板作者指南](../../docs/template-plugin-authoring.zh.md)。本包承担节点功能体验，不承担最小第三方教学或故障注入。

修改公开能力时更新对应模板、操作与预期。模板保持可读、可完成，新增专题须有实际体验需求。测试直接加载这里的 YAML；内部故障和模型替身继续放测试夹具，默认 E2E 不全局加载本包。

自动化检查：`npm run check`。真实宿主：`npm run test:e2e -- e2e/workflows/dev-templates.e2e.ts`，并运行受影响的既有用例。Agent 配置和输入输出链的自动化使用确定结果，浏览器用例不调用真实模型；这不代表真实模型任务已通过。实际验证见[验收记录](../../docs/acceptance/development-templates.zh.md)。
