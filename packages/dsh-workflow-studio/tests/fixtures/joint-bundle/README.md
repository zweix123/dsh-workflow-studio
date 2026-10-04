# 联合验收 bundle

仅用于隔离验收。普通本地 bundle 同时提供 `joint_echo` 节点及两个模板，模板声明排列在节点之前；不依赖 Studio 内部模块。只添加默认 bundle 后再添加本目录。原生插件页可分别开关 `joint-template`、`joint-node`、默认关闭的 `joint-conflict`，验证模板等待、全冲突、恢复及快照。`chain` 目录与 YAML 身份 `joint-chain` 不同。

`builtins` 用于 form → bash → form 与 session_agent 回归。真实模型回复仍需模型认证，本验收不配置认证。

等待时修改 chain YAML 后恢复节点应仍使用原定义，只有模板声明自身重载才读取文件；操作完恢复文件。不要将本夹具装入日常 profile。
