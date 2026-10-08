# 用纯配置 bundle 提供工作流模板

模板作者提供 package.json、bundle 补丁和包内 YAML；通用插件 `dsh-workflow-template` 定位文件并向 Studio 登记。先在所需 profile 中添加默认 bundle，再添加自己的模板 bundle。固定适配 dsh `0.2.0-rc.1`，本期只通过本地目录添加。

可直接使用[完整示例](../examples/review-templates/README.zh.md)。其包名为 `@acme/workflows`：

```json
{
  "name": "@acme/workflows",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "exports": { "./templates/*/workflow.yaml": "./templates/*/workflow.yaml" }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: acme-review-loader
      name: dsh-workflow-template
      config:
        directory: '@acme/workflows/templates/review'
```

```yaml
# templates/review/workflow.yaml
id: acme-review
name: 团队代码审查
type: dag
dag:
  - id: inspect
    type: node
    node_kind: bash
    command: git diff --stat
```

`directory` 必须是带包名的资源地址，加载器追加 `/workflow.yaml`，通过所属 profile 的模块解析器和包 exports 定位文件，再读为 YAML。它不是 cwd、补丁文件或 loader 包旁边的相对文件路径。安装位置变化无须改补丁。一个补丁可声明多个 loader 实例；不提供 config.id、config.name 或 node_kind 清单。

YAML 根 id 和 name 均必须为非空、非纯空白字符串。id 是同一 profile 中的稳定身份，name 是展示名称；目录只定位文件。中英文模板分别提供独立 ID。改根 ID 时同步根自递归引用，嵌套 DAG/节点 ID 规则不变。

工坊展示来源、加载错误、缺失/冲突的节点类型和布局警告。同 ID 的所有贡献都不可用，移除重复贡献后剩余项自动恢复；不同 profile 相互独立，同一 profile 各工作区共享模板和节点能力。实例仍存于原有工作区作用域。

YAML 只在声明加载或重载时读取。刷新页面、查询详情、创建实例及节点依赖变化都不重读 YAML。节点恢复会自动重验已加载的定义；要采用改过的文件，请重载对应模板声明。无后台监听或轮询。

宿主在重载前拒绝新配置时旧贡献保持；真正卸载后重新读取/校验失败会显示新失败记录，不恢复旧有效定义。仅撤销模板不影响已创建实例的定义快照、名称及执行；撤销所需节点时按[节点规范](./specs/node-plugin-registration.zh.md)暂停新执行，仍保留查看。

默认入口：

```sh
npm run build
dsh plugin --profile web add /绝对路径/dsh-workflow-studio/packages/dsh-workflow-bundle
```

默认 bundle 一次装配 Studio、公共节点登记、bash/session_agent/form、通用模板加载器及唯一的内置模板 mattpocock 中文版（`matt-pocock-wayfinder-workflow.zh`）。旧 DSH home 模板目录不再自动发现，也不再复制内置模板；旧文件不会自动删除。

## Bash 引用模板附属文件

可在 workflow.yaml 旁提供 scripts/init.sh、docs/guide.md 等附属文件，无须资源字段、文件清单、固定子目录或逐个 exports。Bash 命令写为：

~~~yaml
command: bash "$DSH_TEMPLATE_DIR/scripts/init.sh"
~~~

脚本可以通过同一变量读取文档，并在当前工作区创建产物：

~~~sh
#!/usr/bin/env bash
set -e
cat "$DSH_TEMPLATE_DIR/docs/guide.md" >&2
git diff --stat > review-stat.txt
~~~

DSH_TEMPLATE_DIR 来自模块解析器返回的 YAML 文件 URL 的父目录。exports 映射到其他位置时使用实际位置，不从模板 ID 或声明字符串猜测。系统通过宿主 Shell 的 dshEnv 提供它，无须 input_schema 声明，也不用 Django 占位符。路径按 Shell 规则用双引号包住；可与独立的业务参数引用同用：

~~~yaml
command: bash "$DSH_TEMPLATE_DIR/scripts/init.sh" {{ repository }}
~~~

Bash 的 cwd 和沙箱 workspaceRoot 继续使用用户工作区。附属文件用于读取或执行，产物写工作区；访问受现有沙箱和系统权限约束，不提升权限，也不承诺模板目录被强制只读隔离。本次不向 session_agent 注入路径。

实例保存创建时的 YAML 定义和来源目录，不复制附属文件。嵌套、递归和逐项 Bash 使用同一来源，重启或仅撤销登记不清除目录，也不重绑定其他同 ID 模板。缺少来源的历史实例不自动补回变量，普通工作区命令继续可用。

YAML 修改须重载声明后作用于新实例；脚本和文档读取实际执行时的当前内容。文件更新不使已成功节点重跑；文件删除、包移动或读取失败沿用 Bash 错误和人工重试，定义快照不保证原文件一直可访问。

模板只读图及输入输出语义见[DAG 用户文档](./dag-syntax.zh.md)，验证范围见[附属文件验收记录](./acceptance/template-attached-files.zh.md)。
