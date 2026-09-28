# 节点模块化与 form 节点：真实宿主验收记录

- 日期：2026-09-29
- 宿主：本机 `dsh 0.2.0-rc.1`，通过 `dsh plugin --profile web add` 加载本仓库插件，`dsh web` 启动真实 Web 宿主
- 环境：隔离的 `DSH_HOME` 位于 `/private/tmp/dsh-workflow-host.OPxVws`；插件由本仓库本地目录添加，未安装或修改 dsh CLI

| 场景 | 真实宿主操作与观察 | 结果 |
| --- | --- | --- |
| form 输入输出 | 创建两级 form 后接 bash 的模板与实例；第一级提交 `note=real-form-value`、`count=0`、`approved=false`；第二级显示这些真实上游值，而非自身默认值；提交后两个表单只读，后续 bash 在宿主沙箱输出 `studio-ok` | 通过 |
| 草稿与校验 | 未提交的 `discard-me` 在关闭节点面板后仍在；刷新宿主页面后恢复模板默认值；清空必填数字字段提交时服务端拒绝，节点保持可填写，草稿保留 | 通过 |
| 生命周期与持久化 | form 和 bash 完成后重启真实 dsh web；重新打开实例，三个节点仍显示完成，已提交表单只读；chat 会话仍可打开 | 通过 |
| bash 失败 | 执行 `exit 7`；图显示执行错误，节点仍可重试，详情显示 `Command exited with code 7` | 通过 |
| chat 控制权 | 使用非空提示创建真实 dsh 会话，进入宿主原生会话页看到初始用户消息；返回工坊可再次打开同一会话，并可手动完成节点 | 通过 |
| 界面适配 | 在宿主深色/浅色主题、中文/英文及 420px 窄屏下操作 form 页面，输入与操作控件可用，文案跟随宿主语言 | 通过 |
| chat 模型回复 | 宿主创建会话和发送初始消息后，模型请求返回 `MISSING_CREDENTIAL`；隔离环境没有配置模型提供方 API Key | 环境阻塞，回复内容未验证 |

本记录只将实际观察到的宿主行为标为通过；模型生成回复仍需在有可用 API Key 的环境中复验。

最终代码审查修复并通过完整检查后，另用隔离目录 `/private/tmp/dsh-workflow-final.iLXTwP` 加载最终构建，创建两级 form 实例。第一级提交 `note=final-value`、`count=0`、`approved=false`，第二级在真实宿主界面得到相同预填值；两级提交后均为只读完成状态。重启 dsh web 后重新打开该实例，两个节点仍为已完成。此复验通过。
