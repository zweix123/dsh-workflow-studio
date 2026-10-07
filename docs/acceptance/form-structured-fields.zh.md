# form 结构化字段验收记录

日期：2026-10-07。依据：[对象与数组字段规格](../specs/form-structured-fields.zh.md)，沿用[节点输入输出](../specs/node-input-output.zh.md)和[节点模块](../specs/node-modules.zh.md)的草稿、只读、交付与恢复规则。

审查基点：`f2b7ea12ec4b9aa0e70c8f8b5dc820e88393d42e`。本轮实现集中在 form 节点包；审查包含基点后的本任务已提交及未提交差异。公共节点契约、DAG 和持久化格式未修改。

## 自动化

通过已确认的工作流实例 HTTP 与现有节点详情界面入口验证，不断言私有解析函数，不新增生产测试接口。HTTP 使用临时真实存储；需要控制 bash 输出时仅替换外部 Shell 服务。

- HTTP：原有标量能力、递归结构与键顺序无关的预填契约比较；完整性、类型、枚举、每层额外字段拒绝；空数组、嵌套空数组、按顺序交付下游；模板注解、控件和完整结构化默认值判定；接受后禁止覆盖；交付失败重试与宿主重新装配后的结果恢复。
- 界面：独立编辑和删除中间项；整体及子字段默认值；新增标量不自动填业务值；部分预填不合并默认值；递归过滤对象和上游数据隔离；关闭详情、切换节点保留草稿；删空不恢复默认项；失败保留填写；全部编辑和增删只读；不同数组项和节点实例不共享默认内容；`constructor`、`__proto__` 在顶层、嵌套对象和新增对象数组项中保持待填写，并以自有字段提交。
- 原有刷新／插件卸载草稿边界及节点独立性回归继续通过。form 源码另执行严格 TypeScript 检查，构建也覆盖节点包声明生成。

完整检查：审查修复后 `npm run check` 通过，包含类型检查、构建及 **145 项测试**，0 失败、0 跳过。form 源码单独严格 TypeScript 检查通过。

## 真实宿主

使用当前构建的插件和已安装的 dsh **0.2.0-rc.1**；Node v26.7.0、npm 11.19.0、pnpm 11.25.0。临时 home 与临时工作区相互独立，本机端口 `32147`；模型认证引导关闭，不读取日常凭据，不安装或升级 CLI。通过本轮启动地址建立 Web 登录，再用网页内目录选择器打开验收工作区。重启沿用本轮 home、工作区和端口，使用新启动地址重新登录。

可复现资源：[验收模板](../../packages/dsh-workflow-studio/tests/fixtures/form-structured/README.md)。三个实例分别名为 `structured-browser`、`partial-browser` 和 `retry-browser`。模板保留在仓库；临时环境路径、登录地址和 token 不作为长期证据。

| 场景与操作 | 预期 | 实际 | 结果 |
| --- | --- | --- | --- |
| collect 编辑首项，删除中间项，追加新项 | 保持其余值与顺序，新项采用完整 items 默认值 | edited-first、last、new 顺序保持；新项 amount=0、enabled=false、tags/grid 为空；原模板仍为 first/middle/last | 通过 |
| 对象数组中的 tags 枚举与 grid 二维数组增删填写 | 按元素结构编辑，未填数字拒绝 | tags 选择 b；新增数字未填报 form.rows[0].grid[0][0]，填写 0 后成功 | 通过 |
| flags 新增无默认布尔项，键盘两次 Space | 未填写不等同 false，可显式填写 false | 未填报 form.flags[0]；两次 Space 后提交 false | 通过 |
| 关闭详情再打开、切换 collect/review | 草稿保持，删除不被默认恢复 | 文本、枚举、嵌套数组均保持；review 删除全部 rows 和 flags 后仍为空 | 通过 |
| review 预填与默认值优先级 | 保留 0、false、空字符串及数组；只对缺失顶层字段应用默认值 | 上游行内容及 settings 原样保留；extraNote 为 added default | 通过 |
| review 提交删空数组，打开 downstream | 空数组合法并交付真实结果 | downstream 输入含 rows=[]、flags=[]、settings={note:"",choice:0,approved:false}、empty={} | 通过 |
| partial 的真实 bash 上游预填 | 不补 score=7/9，不掩盖 bad.score 类型错误；不混入多余字段 | score 控件空白；提示 bad.score 错误；record/empty/rows 的 extra 不进入表单字段 | 通过 |
| partial 未补齐提交，再手动填写两个 score=0 | 缺字段拒绝，填写后输出仅含声明字段，保留嵌套空数组 | 首次报 form.record.score；成功输出无 gate/extra，nested=[[]]；上游原始输出仍含额外字段和 wrong | 通过 |
| partial 写入草稿 score=42 后刷新再打开 | 未提交草稿不持久化 | score 重新为空，既有上游值不被默认替换 | 通过 |
| retry 提交 enabled=false、rows 中 name=saved、grid=[[]] | DAG 交付失败但已接受结果只读 | 出现预期 MISSING_OUTPUT_FIELD；全部嵌套控件、添加与删除禁用，仅可重交 | 通过（预期交付错误） |
| retry 重交、停止宿主、同环境重启后再重交 | 使用已接受结果，不开放填写或改变结果 | 重启仍保留 saved、0、false、grid=[[]]；只读与原交付错误保持 | 通过（预期交付错误） |
| 中文浅色、英文深色、390×844、键盘操作 | 控件、增删和错误可用，主题与语言跟随宿主 | 原有输入控件及新增分组、Add/Remove 随主题和语言；窄屏填写、Space 与 Enter 提交可用，错误按路径换行 | 通过 |

证据：[浅色中文结构化表单](./assets/form-structured-fields-light.jpg)、[英文深色窄屏只读与预期交付错误](./assets/form-structured-fields-dark-narrow.jpg)。结论以表中操作和结果为准，截图不替代行为验证。

审查修复后重新构建、重启同一隔离宿主，新建 `partial-review-fix` 实例复验：真实 bash 上游完成后 record.score 仍为空，不采用默认值；新增 rows 对象项的 name、amount 均待填，未补齐提交报 `form.record.score`；填写 score=0、新行 review-new/0 后提交成功，下游收到过滤后的真实值，全部编辑与增删控件只读。[修复后宿主截图](./assets/form-structured-fields-review-fix.jpg)。原型敏感字段名的专门变体由上述界面自动化覆盖，未单独在宿主浏览器重放。

验收结束后停止本轮宿主并清理临时 home、工作区，保留浏览器标签页和仓库证据。重开页面需重新准备隔离环境。

## 未验证项与边界

- 真实宿主没有单独执行插件卸载／重新装配的结构化草稿场景；现有节点详情自动化覆盖卸载清稿和接受结果保留，本轮完整回归包含该场景。
- 多节点共享默认值隔离、无效模板注解与直接 HTTP 额外字段／枚举提交主要由自动化覆盖，未逐条在宿主 UI 重放。浏览器验证不能代替服务端直接请求校验，反之亦然。
- 未执行模型调用；本功能不依赖模型。未修改或迁移内置模板的 JSON 文本输入流程。

## 代码审查

Standards：0 项发现。对照 AGENTS.md、CONTEXT.md、ADR 0004／0005／0006 及 TDD、宿主验收约定检查基点后的全部任务差异，包括未提交文件。

Spec：发现 1 项 P2，已修复并经原审查者复核关闭。缺失的 `constructor`、`__proto__` 曾被页面读取为继承属性；两处字段渲染增加自有属性判断，现有节点详情入口新增红／绿测试覆盖初始、嵌套、新增数组项及正式提交。最终 0 项未关闭发现。
