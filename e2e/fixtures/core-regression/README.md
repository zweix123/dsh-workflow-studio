# 关键能力回归夹具

仅由 `e2e/dsh.ts` 注册到每条测试的隔离 profile，不属于默认 bundle 或内置模板。复用现有节点和模板插件，不注入模拟宿主服务。

- lifecycle：手动 Bash 留下 `lifecycle-runs.txt`，用于核实创建不会自动执行。
- bash：自动节点交付真实字符串；retry 的前两次分别非零退出、交付错误类型，第三次成功。工作区 `attempts.txt` 和 `automatic-runs.txt` 核对副作用次数。
- gate：自动命令写入 `gate-runs.txt`，等待工作区 `release.txt`；用例从外部释放或停止宿主。命令的条件轮询最多 60 秒，不是演示等待。
- branches：真实布尔输出决定分支，关闭的命令应永不生成 `closed-runs.txt`，汇合收到激活分支输出。
- loop：默认两项 a/Alpha、b/Beta；工作区存在 `empty.txt` 时输出空数组。`each-runs.txt` 核对实际完成顺序，页面输入核对聚合顺序。
- session：相同 task 定义创建两次独立对话，人工完成后推进 after；不声明 session_agent 业务输出。

每条 case 只操作本轮临时工作区，无共享文件状态；gate 的释放文件和 loop 的空数组开关只准备真实命令的前置条件，实例创建、执行、完成和删除仍通过 UI 操作。测试不编辑仓库中的模板，也不读取日常凭据。
