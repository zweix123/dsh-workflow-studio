# 本地加载与重载

## 加载前提

用户本机自行安装固定版本 dsh `0.2.0-rc.1`。本技能不安装宿主、不升级版本、不发布 npm 包。明确使用的 profile 和实例工作区；它们不是模板包目录。

首次使用 Studio，在仓库构建默认 bundle，并加入目标 profile。以 web 为例，在仓库根执行：

```sh
rtk npm run build
rtk dsh plugin --profile web add /absolute/path/dsh-workflow-studio/packages/dsh-workflow-bundle
```

默认 bundle 已存在时不重复添加。若需要安装项目公开依赖，使用仓库既定包管理方式，npm 安装命令显式加 `--registry=https://registry.npmjs.org`，保持版本约束。模板示例本身是纯配置，不需要构建或自行安装 dsh 依赖。

把 starter 复制并编辑到独立目录后，在同一 profile 添加模板包：

```sh
rtk dsh plugin --profile web add /absolute/path/team-workflows
```

命令里的路径需替换为真实绝对路径。不要直接加载技能 assets 后再把它当作用户的正式模板；应先复制到交付目录。如果目标环境没有 rtk，可执行相同的底层命令。

默认 bundle 提供通用能力，模板包提供声明和 YAML。它们必须进入同一 profile，不能仅安装 `dsh-workflow-studio` 包代替默认装配。若 profile 先前单独装过 Studio，按仓库 README 的迁移步骤处理，不直接叠加造成冲突。

## 验证可见与可用

打开相应 profile 的宿主工坊模板页，核对 YAML 的 `name`、根 `id` 和包来源；确认没有加载错误或缺失的节点类型。选择实际工作区创建新实例。

对于 starter：填写 task；手动执行 discuss，核对提示词收到输入；完成对话后手动标记完成；填写 confirm 的 summary 和 approved 并提交；检查实例完成及根输出。真实模型未执行时，不能写“业务流程已跑通”。

验证尽量使用隔离的 `DSH_HOME`、非默认端口和明确的 profile，避免干扰已有实例；真实宿主的具体启动参数沿用当前项目文档，不猜测 CLI 命令。不要为了加载技能示例自动修改用户常用 profile。

## 修改后的生效时机

YAML 只在模板声明加载或重载时读取。刷新页面、切换工作区、创建实例、节点依赖恢复都不会重读文件。

改完文件后重载对应模板声明。使用当前宿主实际提供的插件重载入口；命令不确定时先检查 `dsh plugin --profile web --help`，不要编造 `reload` 子命令。也可在用户允许的窗口重启同一 profile 的宿主，使声明重新加载。不要通过反复添加同一 bundle 模拟重载。

重载后检查新模板定义，再创建新实例。已有实例保留创建时的定义和名称，改源文件不能修复旧实例快照中的命令。重载失败不会在已卸载旧贡献后自动回退旧定义；恢复原文件并重新加载，再确认可用性。

## 故障定位

| 现象 | 优先核对 |
| --- | --- |
| 模板资源无法解析 | package.name、exports、config.directory 三者是否一致；目录中是否有 workflow.yaml |
| 模板没有出现 | 模板 bundle 与默认 bundle 是否在同一 profile，补丁是否由 dsh.bundle.patch 引用并加载 |
| 模板 ID 冲突 | 同一 profile 内所有同 ID 贡献都会不可用，无先到先得规则；定位并修正重复贡献 |
| 缺少节点类型 | profile 是否装配所需节点实现；恢复节点会重验已读模板，无须改补丁排序 |
| 根输入或节点输入报来源缺失 | 工坊根无业务输入；每个输入字段是否确有上游输出声明 |
| 会话完成后下游没有结果 | session_agent 提交空对象；增加人工结果表单或真实 bash 输出 |
| 修改后仍是旧内容 | 是否真正重载了声明；查看的是否是已有实例快照 |
| bash 找不到附属脚本 | 命令相对实例工作区运行；本期没有自动定位模板包脚本的协议 |

卸载模板贡献后不能新建该模板的实例；已有实例继续持有快照。若同时卸载所需节点实现，已有实例也无法继续新执行，须恢复能力。旧 DSH home 模板目录不再参与自动发现。
