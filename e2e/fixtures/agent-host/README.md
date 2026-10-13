# Agent 真实宿主夹具

`@dsh-workflow/agent-host-fixture` 仅由测试的隔离 profile 安装，不进入默认 bundle。

公开 `LlmAdapter` 提供确定性模型响应，避免访问日常模型凭据：正常主对话返回标记；声明输出的子 Agent 必须实际收到继承标记，适配器发出原生 `structured_output` 工具调用；缺材料、一次失败和可中断延迟用于失败/恢复场景。延迟模拟运行中的模型请求，不是浏览器演示等待。

`host_probe` 是使用公共节点契约的测试贡献，通过公开 Agent / Subagent 服务验证宿主创建、隐藏、fork、原生压缩/已结束轮次边界、后续消息隔离、原生记录和持久化能力。台后任务还实际调用预设中的 bash 写读工作区产物；双工作区模板核对工具执行目录和交付结果，防止只验证工具名或空任务。不添加产品测试接口。其他模板直接使用产品 `agent`，覆盖交付、人工确认、重试和中断。

回归：[宿主能力](../../workflows/agent-host.e2e.ts)、[Agent 用户链路](../../workflows/agent-handoff.e2e.ts)。实际范围和未验证项见[验收记录](../../../docs/acceptance/agent-result-handoff.zh.md)。
