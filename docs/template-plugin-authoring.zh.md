# 用纯配置 bundle 提供工作流模板

[文档导航](./README.zh.md) · [整体 DAG 语法](./dag-syntax.zh.md)

模板作者提供 package.json、bundle 补丁和包内 YAML；通用插件 `dsh-workflow-template` 定位文件并向 Studio 登记。先在所需 profile 中添加默认 bundle，再添加自己的模板 bundle。固定适配 dsh `0.2.0-rc.1`，本期只通过本地目录添加。

本仓库的正式模板就是完整接入实现，直接参考：

- [OpenSpec 模板包](../packages/dsh-workflow-template-openspec-change/package.json)、[加载声明](../packages/dsh-workflow-template-openspec-change/cordis.patch.yml)和[工作流定义](../packages/dsh-workflow-template-openspec-change/workflow.yaml)。
- [默认 bundle](../packages/dsh-workflow-bundle/cordis.patch.yml)：统一装配节点和内置业务模板。
- [通用加载器](../packages/dsh-workflow-template/src/index.ts)：包资源解析、读取和登记。
- [开发功能模板包](../packages/dsh-workflow-dev-templates/README.zh.md)：同一个纯配置包提供多份模板，只在开发宿主附加装配。

接入以正式实现为参考；下文解释资源、依赖和生命周期约定。需要从空目录开始时，可复制 [skill 的 starter 资产](../skills/dsh-template-authoring/assets/starter/)到自己的模板目录，并修改包名、loader ID、模板 ID、展示名称与资源地址；不要直接把技能资产目录加载为正式模板。

## 包结构与资源声明

单模板包包含 `package.json`、`cordis.patch.yml` 和 `workflow.yaml`。`package.json` 用 `dsh.bundle.patch` 指向补丁文件，`exports` 暴露模板 YAML，`peerDependencies` 声明加载器与所用节点包的兼容版本。补丁为每份模板声明独立 loader ID 和 `config.directory`。

单模板包将 `workflow.yaml` 放在包根目录，`directory` 直接填写包名。一个包提供多份模板时，可按 `templates/review/workflow.yaml`、`templates/delivery/workflow.yaml` 组织，通过 `"./templates/*/workflow.yaml": "./templates/*/workflow.yaml"` 导出，分别配置 `directory: '<包名>/templates/review'` 等地址。

`directory` 必须是包名或带包名的资源子目录地址，加载器追加 `/workflow.yaml`，通过所属 profile 的模块解析器和包 exports 定位文件，再读为 YAML。它不是 cwd、补丁文件或 loader 包旁边的相对文件路径；不接受文件系统路径、URL 或 `.`/`..` 路径段。安装位置变化无须改补丁。一个补丁可声明多个 loader 实例；不提供 config.id、config.name 或 node_kind 清单。

## 模板身份与加载生命周期

YAML 根 `id` 是同一 profile 中的稳定身份：由小写英文字母或数字组成，允许用单个 `-` 或 `.` 分隔，匹配 `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`。不允许空白、大写字母、中文、下划线、斜杠、首尾分隔符或连续分隔符；不会自动去空白或转换大小写。例如 `openspec-change.zh` 合法，`.` 是普通标识字符，`.zh` 只是本仓库的语言命名约定。`name` 是必填的非空、非纯空白展示名称，可使用中文；目录只定位文件。中英文模板分别提供独立 ID。改根 ID 时同步根自递归引用，嵌套 DAG/节点 ID 规则不变，仍可使用中文。

工坊展示来源、加载错误、缺失/冲突的节点类型和布局警告。同 ID 的所有贡献都不可用，移除重复贡献后剩余项自动恢复；不同 profile 相互独立，同一 profile 各工作区共享模板和节点能力。实例仍存于原有工作区作用域。

YAML 只在声明加载或重载时读取。刷新页面、查询详情、创建实例及节点依赖变化都不重读 YAML。节点恢复会自动重验已加载的定义；要采用改过的文件，请重载对应模板声明。无后台监听或轮询。

宿主在重载前拒绝新配置时旧贡献保持；真正卸载后重新读取/校验失败会显示新失败记录，不恢复旧有效定义。仅撤销模板不影响已创建实例的定义快照、名称及执行；撤销所需节点时按[节点规范](./specs/node-plugin-registration.zh.md)暂停新执行，仍保留查看。

## 本地加载

用户自行安装固定版本 dsh；本项目仅提供插件。先确认目标 profile 与实例工作区，模板包目录不等于工作区。需要安装项目公开依赖时按仓库包管理方式安装，npm 命令显式追加 `--registry=https://registry.npmjs.org`。

首次在目标 profile 使用 Studio 时，在仓库根构建并添加默认 bundle；已添加时不重复装配。默认入口：

```sh
npm run build
dsh plugin --profile web add /绝对路径/dsh-workflow-studio/packages/dsh-workflow-bundle
```

默认 bundle 一次装配 Studio、公共节点登记、bash/agent/form、通用模板加载器及两个中文内置模板：mattpocock（`matt-pocock-wayfinder-workflow.zh`）和 OpenSpec 变更（`openspec-change.zh`）。旧 DSH home 模板目录不再自动发现，也不再复制内置模板；旧文件不会自动删除。

内置模板也使用独立纯配置插件包，与 Studio 平级：

- `packages/dsh-workflow-template-matt-pocock-wayfinder/`：mattpocock 中文版。
- `packages/dsh-workflow-template-openspec-change/`：OpenSpec 变更中文版。

各包包含根目录的 `package.json`、`cordis.patch.yml` 和 `workflow.yaml`，可在已经装配 Studio、节点和加载器的 profile 中通过本地目录单独添加；默认 bundle 依赖这些资源包，并以包名声明同样的加载器配置。模板包无须编译或增加 JavaScript 入口。Studio 只提供模板登记服务，不携带模板 YAML。当前模板范围由[模板管理规格](./specs/template-management.zh.md)维护。

## 节点依赖与组合 bundle

推荐第三方作者沿用本项目的结构：独立节点包提供业务能力，独立模板包组合节点，bundle 提供一次添加的入口。仅提供模板时保留模板包即可；一个模板包也可以包含多份模板。

模板包的 `peerDependencies` 声明 `dsh-workflow-template` 及实际使用的节点插件包和兼容版本。多模板包声明所用节点包的并集。Wayfinder 使用 form 和 agent，声明对应两个包；OpenSpec 变更模板只使用 form 和 agent，不声明 bash。节点类型名与包名不一定相同，作者需根据实际提供该类型的插件填写包名。

模板包自己的补丁只声明模板加载器，消费同一 profile 已装配的节点。组合 bundle 则在 `dependencies` 中包含要提供的包，并在补丁中显式启用节点、加载模板。例如，在已添加本项目默认 bundle 的 profile 中，第三方可以添加自己的组合 bundle：

```text
acme-workflows/packages/
├── node-review/       # @acme/node-review，提供 acme_review
├── template-review/   # @acme/template-review，peer 依赖节点和加载器
└── bundle/            # @acme/workflows，组合入口
```

组合入口的 manifest 关键字段：

```json
{
  "name": "@acme/workflows",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "dependencies": {
    "@acme/node-review": "0.1.0",
    "@acme/template-review": "0.1.0",
    "dsh-workflow-template": "0.1.0"
  }
}
```

```yaml
# 组合入口的 cordis.patch.yml
- insert:
    - id: acme-review-node
      name: '@acme/node-review'
    - id: acme-review-template
      name: dsh-workflow-template
      config:
        directory: '@acme/template-review'
```

组合 bundle 为模板资源包声明加载器，不再同时添加同一模板包自身的 bundle 声明。节点也只装配一次；默认 bundle 已提供的公共登记、Studio 和内置节点无需再次启用。需要完全独立的安装入口时，参考 `packages/dsh-workflow-bundle`，同时提供并装配这些基础插件。当前仍通过本地目录添加，不增加 npm 发布流程。

包依赖用于表达兼容版本和供包管理器解析，不能保证对应插件已启用。运行时从完整 YAML（含嵌套 DAG）的 `node_kind` 自动收集所需类型，以实际登记结果判断可用性；缺失或冲突时保留模板诊断，恢复后重新校验。不在补丁中添加第二份节点类型清单，也不由 Studio 额外校验包版本。

## 模板附属文件

脚本、文档和配置可随模板包提供，无须新增资源字段、文件清单或逐个 exports。模板目录按实际解析到的 `workflow.yaml` 位置确定。Bash 的 `DSH_TEMPLATE_DIR`、路径引用、工作区、权限及文件更新语义统一见 [Bash 节点的模板附属文件](./nodes/bash/README.zh.md#模板附属文件)。

## 添加自己的模板

默认 bundle 与模板包须进入同一 profile。将纯配置模板放到交付目录后添加；模板包本身不需要编译或安装 dsh CLI：

```sh
dsh plugin --profile web add /绝对路径/team-workflows
```

路径替换为实际目录。若 profile 先前单独添加过 Studio，按[项目安装说明](../README.zh.md#从源码安装)迁移到默认 bundle，避免重复装配。

## 校验与验证

先检查 YAML/JSON、包 exports 与资源地址、定义 ID、输入来源和具体节点配置。仓库可用时，使用[内部引擎](./development/dag-engine-api.zh.md)的 `compile(definition, {})` 校验工坊没有外部根输入的前提，并使用已登记节点的 `validate` 校验业务字段；DAG 编译通过不等于节点配置合法，仅解析 YAML 也不足以证明模板可用。

打开目标 profile 的工坊模板页，核对根 `id`、展示名称、包来源及可用状态，选择实际工作区创建新实例。验证人工输入到达下游、节点的完成条件和根输出。真实模型未执行时，不能把静态校验或模拟节点结果写成业务流程跑通。

starter 的流程是：request 表单填写 task → discuss 台前 Agent 消费 task → confirm 表单填写 summary 和 approved。discuss 未声明输出，后面的边只等待它完成；根结果来自 confirm。若要在 confirm 预填 task，需增加 request → confirm，并在 confirm 的输入与输出中声明 task。数据不会沿空输出节点自动透传。

真实宿主验证可使用隔离的 `DSH_HOME`、非默认端口与明确的 profile；环境准备见 [E2E 说明](../e2e/README.md)。区分静态校验、真实宿主与模型实际执行，记录尚未验证的部分。缺少项目编译器时明确该层未验证。

## 修改与重载

文件修改后重载对应模板声明。使用当前宿主实际提供的插件重载入口；命令不确定时先查看 `dsh plugin --profile web --help`，不要猜测 `reload` 子命令。也可在合适的维护窗口重启同一 profile 的宿主。不要反复添加同一 bundle 模拟重载。

重载后检查新定义并创建新实例。既有实例继续使用创建时快照；刷新页面、切换工作区、创建实例或节点依赖恢复都不会重读 YAML。重载失败与撤销登记的具体行为见[加载生命周期](#模板身份与加载生命周期)。

## 故障定位

| 现象 | 优先核对 |
| --- | --- |
| 模板资源无法解析 | `package.name`、`exports`、`config.directory` 是否对应；directory 是包名或带包名的资源目录 |
| 模板没有出现 | 模板与默认 bundle 是否在同一 profile，补丁是否由 `dsh.bundle.patch` 引用并加载 |
| 模板 ID 冲突 | 定位同一 profile 内所有同 ID 贡献并修正，不存在先到先得规则 |
| 缺少节点类型 | profile 是否装配所需节点；恢复节点会重验已读模板，无须改补丁排序 |
| 根输入或节点输入报来源缺失 | 工坊没有外部根输入；每个输入字段是否有上游输出声明 |
| Agent 完成后下游没有结果 | 是否声明输出，台后是否已人工完成，是否存在交付错误；见 [Agent 节点](./nodes/agent/README.zh.md) |
| 修改后仍是旧内容 | 是否真正重载声明，查看的是否是已有实例快照 |
| Bash 找不到附属脚本 | 核对实例保存的来源、包及文件是否仍存在、宿主权限；见 [Bash 节点](./nodes/bash/README.zh.md#模板附属文件) |
