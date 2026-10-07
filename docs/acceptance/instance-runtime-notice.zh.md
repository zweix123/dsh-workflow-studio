# 实例运行页常驻说明移除验收

日期：2026-10-07。依据：[实例页规格的运行页说明](../specs/instance-tab.zh.md#实例运行页说明2026-10-07)、[节点输入输出规格](../specs/node-input-output.zh.md)、[实例运行图阅读规格](../specs/instance-graph-readability.zh.md)。

被测范围：基于 `710dc837a9f467585069f60480c0e3f17a4a376b` 的工作区，删除 `InstanceRunPanel.tsx` 中通用结果说明的段落、`styles.ts` 中专用的 `.dsh-workflow-run-note` 和中英文 `resultNotice` 词条，共四行。没有替代横幅或新提示机制；节点操作及输入输出实现未改动。搜索源代码与测试，未发现仅用于该说明的测试断言，故没有测试断言需要删除；清理后源代码及测试无对应 key、class 或说明文本残留。

## 自动化

- 类型检查与构建通过。
- 首次 `npm run check` 的 HTTP 测试因沙箱禁止监听 `127.0.0.1` 而失败，首条错误为 `listen EPERM`；取得本地监听权限后重跑 `npm test`：145 项通过，0 失败、0 跳过。
- `git diff --check` 通过。DAG 语法文档与节点输入输出规格中的语义未修改。

## 真实宿主浏览器

环境：Node `v26.7.0`、npm `11.19.0`、pnpm `11.25.0`、dsh `0.2.0-rc.1`。重新构建默认 bundle，在全新临时 `DSH_HOME` 与工作区注册；Codex 内置浏览器登录本地 `127.0.0.1:31991` 后，从网页目录选择器添加验收工作区，通过工坊创建并打开实例。未安装或升级 dsh，未使用日常 profile 或模型凭据。

使用两份临时模板：`notice-plain` 是 form → bash → bash，无 session_agent；form 声明 `note: string`，正常 bash 以 `printf '%s' '{"result":"ok"}'` 交付 `result: string`，最后一个 bash 以 `printf '%s' 'not JSON'` 故意交付非法 JSON。`notice-session` 只有空 prompt 的 session_agent，附带非法 `layout: { direction: diagonal }`，用于检查已有布局警告。

| 场景、操作与预期 | 实际结果 | 状态 |
| --- | --- | --- |
| 创建并打开无 session_agent 的实例，不显示通用说明或空白占位 | 中文深色页面无该说明；运行 section 只有标题与运行区两个直接子元素，画布顶部与标题底部差为 0px | 通过 |
| 填写并正式提交 form，保留节点操作、真实输出和只读提示 | 提交 `notice removal check` 后 form 完成，输出与输入值一致，显示“已提交，结果只读。”；下游 bash 就绪 | 通过 |
| 执行正常 bash，交付结果并推进下游 | command 完成，broken 就绪；broken 详情的输入为 `{ "result": "ok" }` | 通过 |
| 执行非法 JSON bash，保留异常、日志和重试 | 节点显示“执行异常”，stdout 显示 `not JSON`，错误为 `stdout must contain one complete JSON object`；通过详情“执行”重试仍得到该错误，节点未完成 | 通过 |
| 创建含 session_agent 的实例，保留布局警告与节点操作 | 无通用说明；WARN (1) 仍提示本层回退横向且可继续执行，展开显示 direction 的校验详情 | 通过 |
| 执行 session_agent，打开对话、返回实例并手动完成 | 关联会话显示默认提示词；返回定位原节点；“完成”后状态为已完成，输出 `{}`，“打开对话”仍可用 | 通过 |
| 中英文、深浅主题及窄屏不留下说明区域，现有提示与操作可用 | 中文深色默认视口、英文浅色 1280×900 与 390×844 视口均无说明；英文宽窄屏标题与运行区间距均为 0px；英文布局警告、窄屏错误详情与重试可用 | 通过 |
| session_agent 实际模型回复 | 隔离环境无模型凭据，宿主显示 `MISSING_CREDENTIAL`；未填写或读取凭据 | 未验证，本次 UI 删除不依赖模型回复 |

验收结束恢复默认浏览器视口，停止本轮宿主并清理临时 home、模板与工作区；截图保留为交付证据。未验证项仅为真实模型回复。
