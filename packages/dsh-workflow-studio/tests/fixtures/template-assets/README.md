# 模板附属文件真实宿主夹具

本地纯配置 bundle，exports 仅将模板声明地址映射到 content/template/workflow.yaml；脚本和文档没有单独 exports，也不在 YAML/config 中列出。三个 Bash 节点复用 DSH_TEMPLATE_DIR，前两个读取文档并向工作区写 result.txt/runs.txt；最后一个用于删除脚本后的错误验证。

[e2e/template-assets.e2e.ts](../../../../../e2e/template-assets.e2e.ts)把此包复制到该条用例的临时包目录（工作区外、含特殊字符），添加到隔离 Web profile，在 UI 创建实例、执行节点、更新文档并重启宿主、删除脚本。副本只用于准备测试包，不复制到实例目录；原始夹具不修改。

运行 npm run test:e2e -- e2e/template-assets.e2e.ts。实际结果和限制见[验收记录](../../../../../docs/acceptance/template-attached-files.zh.md)。
