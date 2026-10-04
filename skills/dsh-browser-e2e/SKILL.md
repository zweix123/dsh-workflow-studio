---
name: dsh-browser-e2e
description: 验收本项目的 UI 变更时，在隔离的本地 dsh Web 实例中使用 Codex 内置浏览器按需求规格执行端到端测试。实现涉及 UI 的需求后自动使用；纯服务端或文档变更不触发。
---

# dsh 浏览器端到端验收

在真实 dsh 宿主中验证用户可见行为。组件测试、接口测试和截图本身不能代替浏览器端到端验收。

1. 从本次需求、`docs/specs/` 中对应规格和必要时的 `docs/dag-syntax.zh.md` 提取可观察的验收场景。逐项记录操作、预期结果；只覆盖与本次改动相关的正常路径、错误路径及规格要求的主题、语言和屏幕尺寸。
2. 构建当前插件。确认本机 `dsh` 为项目固定适配的 `0.2.0-rc.1`；不安装 CLI。为本次验收新建临时 `DSH_HOME`，并始终对插件注册与宿主启动使用同一个值，包括查看 Web profile 帮助时。用本仓库插件目录的绝对路径执行 `dsh plugin --profile web add <插件目录>`，避免改动用户日常的 dsh profile 和存储。当前默认装配入口是 `packages/dsh-workflow-bundle`；只添加 Studio 单包不会装配公共节点登记与内置节点。模型认证默认跳过；不读取、复制或展示用户日常的 token、API key、凭据文件、`.env` 或含密钥的配置，也不通过输出环境变量寻找凭据。需要真实模型调用且缺少认证的场景标为未验证，不索取 token。本次临时宿主自行生成的 Web 登录地址用于正常访问认证，与模型凭据分开处理，不写入验收记录或提交文件。
3. 在临时目录写入下方 `e2e.patch.yml`，关闭自动认证引导，并固定使用网页内目录选择器，避免 macOS 等系统目录弹窗抢占焦点。选择未被占用且不同于默认 3080 的本地端口；占用时换端口，不停止别人的进程。以 `DSH_HOME=<临时目录> dsh --profile web --patch <临时目录>/e2e.patch.yml --host 127.0.0.1 --port <端口> --no-open` 启动并保持进程运行。确认服务就绪、插件已加载；若启动失败，先查日志并修复实际问题。本机沙箱拒绝监听时，申请该本地端口的运行权限；未获准则报告受阻。
4. 在 Codex 内置浏览器（`iab`）新建可见标签页，使用本次隔离宿主启动时输出的完整 Web 地址完成登录，将其展示在 Codex 面板中。固定 rc.1 的地址可能带 `token` 参数；未建立登录 cookie 时直接打开裸地址会返回 401，也可能被浏览器报告为 `ERR_BLOCKED_BY_CLIENT`。`credentialOnboarding: false` 只关闭模型凭据引导，不关闭 Web 访问认证。先核对完整启动地址与浏览器实际登录结果，再判断浏览器控制是否受阻；不能仅凭裸地址的失败结束验收。如仍出现模型认证引导，点击跳过，不填写凭据。需要工作区时，通过网页内目录选择器的路径输入框填写验收工作区的绝对路径并确认；不要调用系统目录选择器或控制用户的桌面。通过浏览器 UI 控制工具读取页面状态、点击、输入和截图，按场景操作真实页面并检查最终状态、错误反馈和必要的持久化结果。宿主进程存活或 HTTP 响应成功不代表客户端插件激活，必须实际看到工坊入口及页面内容；若出现 `Failed to load plugins`，按页面中的缺失服务核对装配入口。画布中的可访问性点击失败时，重新观察页面并改用同一内置浏览器的语义 DOM 定位。不得用 `curl`、直接 API 调用或 jsdom 结果冒充浏览器操作。接口调用可辅助定位失败。
5. 汇报每个场景的规格出处、操作与预期、实际结果及通过/失败状态；失败时给出截图或可复现步骤和相关日志。明确列出未执行的场景及原因，不能把未验证写成通过。结束后停止本次宿主进程并清理临时 `DSH_HOME`；保留用户需要查看的浏览器标签页和必要证据。

`e2e.patch.yml`（仅用于本次隔离宿主，不修改用户 profile）：

```yaml
- id: ui-settings-models
  config:
    credentialOnboarding: false
- id: directory-picker
  disabled: true
- insert:
    - id: e2e-directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: e2e-ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

如果内置浏览器控制不可用，报告端到端验收受阻及已完成的其他验证，不以另一种测试方法宣称端到端通过。
