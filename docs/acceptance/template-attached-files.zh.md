# 模板附属文件运行时引用验收

日期：2026-10-08。依据：[模板分发规格](../specs/template-plugin-distribution.zh.md#模板附属文件与-bash-路径契约)、[节点输入输出规格](../specs/node-input-output.zh.md)。被测范围为本轮模板加载器、内部来源登记及实例持久化、公共 NodeContext、Bash dshEnv 接入；没有客户端产品代码变更。

结论：实现及项目检查通过；已列出的真实宿主场景通过。其余生命周期场景由 HTTP 集成验证覆盖，尚未在真实 dsh 宿主逐项复验，不视为全部真实宿主验收通过。

## 实现与复现入口

- 加载器从解析出的 workflow.yaml 文件 URL 取得父目录；实例保存可缺省的 templateDirectory。公共节点上下文传递来源，Bash 通过 dshEnv 注入 DSH_TEMPLATE_DIR。
- 不新增作者 YAML/config 资源字段，不扫描或复制附属文件，不改写 command；cwd 与 sandbox workspaceRoot 保持工作区，不向 session_agent 注入路径。
- [HTTP 集成测试](../../packages/dsh-workflow-studio/tests/workflow-instances.test.ts)新增六条 case，均经过真实 JSON 存储及公开实例接口。附属文件命令在真实 Shell 子进程执行；Shell 服务和 sandbox outcome 为测试适配器，不能证明宿主沙箱访问能力。exports 由 Node 包解析实际映射，profile resolver 由适配器提供。
- [真实宿主用例](../../e2e/template-assets.e2e.ts)复用[隔离宿主](../../e2e/dsh.ts)与[本地模板包](../../packages/dsh-workflow-studio/tests/fixtures/template-assets/README.md)。可单独运行 npm run test:e2e -- e2e/template-assets.e2e.ts。

## 自动化结果

npm run check 退出码 0：类型检查（含公共 DAG 类型和 E2E）、全部插件构建、151 项测试通过，0 失败、0 跳过。新增六条场景全部通过：

| 场景 | 预期与实际 | 方式 |
| --- | --- | --- |
| 包文件、exports 与特殊路径 | v1/v2 解析器都采用实际 YAML 父目录；目录含中文、空格、单双引号、美元符、反引号、#、%；脚本读包内文档、写工作区，业务输入中的 Shell 字符保持单个参数，真实 JSON 结果进入下游 | HTTP + 真实文件和进程 |
| 保存来源、撤销登记与重启 | 失败后读取更新的脚本和文档；登记撤销后继续执行；关闭原服务、从同一存储重新创建服务仍保留原 command/来源；另一个包登记同 ID 不重绑定 | HTTP + 持久化恢复 |
| 删除、移动与重试 | 删除脚本或移动包使节点失败并保留实际 stderr；恢复原位置后人工重试读取当前文档；删除整个包后普通工作区命令仍可完成，成功节点不重跑 | HTTP + 真实文件和进程 |
| 嵌套与逐项展开 | 两个独立子 DAG 的 Bash 共享保存的模板目录，分别消费业务输入，for key 继续只用于身份 | HTTP + 真实进程 |
| 历史实例缺少来源 | 重启并登记同 ID 新模板后仍不补来源，dshEnv 为空；宿主同名旧环境值经 rc.1 scrub 清除，普通命令完成 | HTTP + 真实进程 |
| 结果恢复与递归边界 | 注入 DAG 状态保存故障后业务结果已保存；删除资源并重启，仅恢复结果，不重跑命令；递归三层 Bash 使用同一来源，session_agent 仅收到原提示词 | HTTP + 存储故障 + 真实进程 |

原有输入转义、stdout JSON/截断/类型校验、失败重试、未知结果、结果提交恢复、并发及删除保护均通过全量回归。

## 真实宿主结果

环境：本机 macOS，Node 26.7.0、npm 11.19.0、pnpm 11.25.0，用户已有 dsh 0.2.0-rc.1；Chromium、中文、1440×900。每条 case 使用自己的临时 DSH_HOME、工作区及非默认回环端口。模板包在工作区外，包路径含中文、空格、单双引号、美元符、反引号、#、%；exports 将 templates/declared/workflow.yaml 映射到 content/template/workflow.yaml，脚本和文档均未单独 exports。

npm run test:e2e 退出码 0；两条用例通过，0 重试。运行标识：01a11b03-55f0-7213-a8cb-4fd6fe027a8a。

- 附属文件场景：UI 创建实例、点击执行 first，输出准确的 document A、实际模板父目录与工作区；result.txt 写到工作区。启动宿主时人为提供旧 DSH_TEMPLATE_DIR，节点仍采用当前保存的来源。
- 修改包内文档为 B 后真正停止并重启宿主；UI 执行 second，读取 B；runs.txt 恰为 A、B 两行，已成功 first 未重跑。
- 删除包内脚本后执行 missing，用户看到 Command exited with code 127 和 No such file，日志/错误保留，runs.txt 不变。未回退到无沙箱执行。
- 既有结构化表单、下游预填、只读与宿主重启恢复用例通过。

真实宿主使用 rc.1 默认 Web profile 的 sandbox-local、bash-sandbox，部署模式为 workspace-write：已核对本机 dsh-base 的默认补丁，测试入口只传递必要运行环境，不传入 DSH_PERMISSION_MODE 覆盖；Bash 调用继续把 workspaceRoot 指向实例工作区。以本机普通用户权限运行，临时根目录由 mkdtemp 创建，脚本权限为 0644、通过 bash 读取执行，没有提升权限或修改包权限。读取工作区外包文件、写入工作区产物已实际成功；Bash 对策略和执行结果的检查拒绝 danger-full-access、无沙箱及执行器失败。此轮未采集内核 enforcement 信息，也未测试系统权限拒绝目录，不能据此承诺模板目录强制只读或所有外部文件均可访问。

首次端口监听在 Codex 外层沙箱返回 listen EPERM，获工具授权后按原隔离流程运行；未移除产品沙箱。首次场景失败来自夹具的 exports URL 编码、macOS /var 与 /private/var 路径预期、for key 契约及重复 alert 定位，修正夹具/断言后通过；本轮实现没有为这些测试改变原有业务规则。

报告和脱敏日志保存在忽略提交的 .e2e/report.json、.e2e/summary.md、.e2e/junit.xml、.e2e/logs/；token 不进入本文。临时宿主、home、工作区与模板副本已由夹具清理。长期复现入口为上述 Git 内用例及模板包，临时个人路径不是唯一证据。

## 尚未在真实宿主单独验证

- 仅撤销模板登记、同 ID 另一来源替换，以及包物理移动后的人工重试。
- 嵌套、递归及逐项 Bash 的附属文件引用。
- 缺少来源的历史实例，以及保存业务结果后 DAG 提交失败的恢复。
- 系统权限/沙箱拒绝外部文件、其他操作系统的执行与隔离差异。

前三项已有集成测试通过，不能作为对应真实宿主验证结果。session_agent 的原提示词/会话回归由自动化覆盖，本轮未调用真实模型。
