# 可重复运行的浏览器 E2E

测试代码和模板随 Git 保留；运行时用固定的页面操作与断言，不需要模型或模型凭据。
基于 `tester-army/e2e` 的 `e2e@0.18.0` 和 `@e2e-dev/web@0.13.0`，浏览器由 Playwright 驱动。

## 运行

本机须已有 `dsh 0.2.0-rc.1`、npm、pnpm，以及 Node `^22.22.3 || >=24.8.0`。
测试不会安装或升级 dsh CLI。首次注册隔离 profile 的插件需要访问公共 npm 源；首次运行会下载所需 Chromium。

```sh
npm ci --registry=https://registry.npmjs.org
npm run test:e2e
```

看浏览器操作，或只运行一个文件：

```sh
npm run test:e2e -- --headed
npm run test:e2e -- e2e/form-handoff.e2e.ts
```

默认无界面执行操作和断言，不录屏、不主动截图。需要观察执行过程时加 `--headed`，弹出 Chromium 窗口，结束后自动关闭；不增加演示用固定等待。

入口自动检查工具、构建插件、选择空闲本地端口。每条测试创建新的临时 `DSH_HOME` 和工作区，注册默认 bundle 与本场景夹具，启动真实宿主，建立 Web 登录。结束或场景失败后停止本轮宿主并清理临时数据。正常重启场景沿用该测试的 home 与工作区。强制结束整个进程树或系统崩溃时，仍需核查遗留资源。

运行成功退出码为 0，失败为非 0。报告和证据在忽略提交的 `.e2e/` 中：

- `report.json`：用例结果和失败信息。
- `artifacts/`：失败页面状态等诊断证据。当前框架在失败时自动截取诊断截图，没有关闭配置；通过的用例不生成截图或录像。
- `summary.md`：可阅读的结果摘要；逐步操作和断言在 `report.json` 中。
- `logs/`：插件注册和宿主日志；临时启动 URL 的 token 已脱敏。
- JUnit 报告：供其他测试工具读取。

运行时自动关闭 E2E 框架遥测。测试不读取日常 dsh profile、`.env` 或模型凭据；Web 登录只使用本轮宿主输出的临时启动 URL，在浏览器操作记录之外换取本轮 cookie。浏览器网络 trace 默认关闭，避免保存会话 cookie；不要对本夹具启用 `--trace` 或其他网络抓包。

## 已保存的场景

[`form-handoff.e2e.ts`](./form-handoff.e2e.ts) 使用已有[结构化表单夹具](../packages/dsh-workflow-studio/tests/fixtures/form-structured/README.md)，从浏览器添加工作区和创建实例，验证：

- 未填写的数组布尔项拒绝提交，可明确填写 `false`。
- 修改对象数组、删除中间项，准确保存字符串、`0`、`false` 和空对象／数组。
- 下游 form 采用真实上游值，保留新增字段默认值；提交后只读。
- downstream 节点详情显示准确输入。
- 真正停止并重启 dsh 后，原实例输出和只读状态恢复。

该场景不执行 downstream 的空 bash 命令，也不执行模型任务，不代表所有功能已覆盖。

## 新功能怎样留下回归测试

1. 从 `docs/specs/` 提取操作和可观察的预期，新增或补充 `e2e/*.e2e.ts`。
2. 从 `./dsh.js` 导入 `test`，复用每条用例的隔离宿主；按需在 `DshHost.install()` 登记场景夹具。不要依赖上一条用例的数据。
3. 通过页面标签／角色定位，使用 `expect` 验证准确值和最终状态。接口可辅助环境准备与定位，不能替代被测业务的 UI 操作。
4. 运行相关用例与受影响的已有用例，测试代码和可复现夹具随功能提交。失败时修复产品或定位依据，不能删除断言、增加无理由重试或用固定延时掩盖故障。

`npm run check` 包括这些用例的类型检查；真实宿主浏览器测试单独通过 `npm run test:e2e` 执行。
Codex 内置浏览器继续用于探索新场景、人工检查界面和故障定位，稳定场景应沉淀到本目录。

行为规则见[规格](../docs/specs/reusable-browser-e2e.zh.md)，实际验证见[验收记录](../docs/acceptance/reusable-browser-e2e.zh.md)。
