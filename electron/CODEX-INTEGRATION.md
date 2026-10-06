# Codex OAuth 与 Fast 适配

本实现继续使用项目随包的 DSH 0.1.5-rc.2，不升级整个内核。普通通道注册为 `llm-pi-ai.providers.openai-codex`；可选 Fast 适配器注册为 `openai-codex-fast`，基于 higekibaka 独立插件的共享凭据与请求局部 Priority 设计移植。

## 组件与边界

- `src/codex-auth-worker.mjs` 使用随包 Node、pi-ai OAuth 和 DSH `LocalCredentialProvider`。浏览器/设备码授权、PKCE、回调校验交给 pi-ai；Electron 只中继授权网址、设备码及回调输入。父子进程之间不传递令牌，不打印 SDK 原始错误。
- `src/codex-service.cjs` 管理单次登录、超时、取消和进程清理；只允许系统浏览器打开 `auth.openai.com` 的指定 HTTPS 授权路径。新 IPC 限定于设置窗口主框架。
- `src/codex-controller.cjs` 集中注册设置 IPC。异步读取模型目录后才读取最新设置，避免覆盖期间发生的其他修改；登录与退出互斥。浏览器授权最多等待 5 分钟，设备码与 SDK 的 15 分钟有效期对齐。
- `src/codex-fast-plugin.mjs` 通过 AKDAgent 自有 web profile 注册。只使用同一 `llm-pi-ai/openai-codex` 授权记录，刷新处于 DSH 的跨进程锁内。Fast 不创建第二套 OAuth，也不读取其他客户端令牌；不修改全局网络函数或普通 Codex 提供方。
- API Key 保存也改用 DSH 凭据写入接口，避免覆盖同时刷新的 OAuth 记录。初始化迁移仍由既有 `dsh-home.js` 管理，并维持源 `~/.dsh` 只读。
- Worker 和 Fast 模块使用 `.asar.unpacked` 实盘路径；打包规则包含运行时所需的 `codex-*.mjs` 与 `codex-catalog.cjs`。

## 模型目录

`src/codex-catalog.cjs` 保存 2026-10-06 核对的增量目录，并合并随包 SDK 模型；普通与 Fast 共用容量和推理档位来源。Astra / 6.1 Sol 使用 `low / medium / high / xhigh / max`，没有把 Codex 的多代理 Ultra 模式冒充成 API 推理值。Fast 仅列出已核对支持 Standard / Fast 的 Astra 与 6.1 Sol。

参考：[Codex 模型与可用性](https://learn.chatgpt.com/docs/models)、[Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)、[6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)。目录不是账号权限查询；刷新按钮不会调用模型或消耗推理额度。后续模型发布需要更新这份小型目录或随包 SDK。

## 验证

```text
node --test tools/test-codex.cjs
```

设置 `AKDAGENT_TEST_RUNTIME` 为已组装的 DSH npm runtime 根目录后，上述测试还会实际加载随包 DSH，验证普通与 Fast 的模型解析、共享凭据、刷新写入、退出登录、API Key 与其他授权记录保留。数据都在临时目录，使用合成令牌，无网络推理。

```text
node tools/test-codex-host.cjs
```

同一环境变量下，启动临时 web host 并检查两种通道均能解析 Astra / 6.1 Sol；退出后关闭测试进程并清理临时目录。另有 `tools/test-codex-ui.cjs`，设置 `AKDAGENT_TEST_DOM` 为提供 `jsdom` 的依赖根目录后，可运行中文界面与交互回归。

## 打包与在线验收

`tools/test-codex-electron.cjs` 是独立 Electron 验收入口，加载生产的 preload、IPC 控制器、UI 和 worker。使用测试专用的 `AKDAGENT_REVIEW_HOME`，不运行主应用的自启动、桥部署等无关操作。测试包的 `resources/dsh` 和 `resources/node` 指向对应平台的随包运行时。

制作测试包时，将该文件作为 `app-stage/index.cjs`，在 `app-stage/package.json` 声明 `main: index.cjs`，复制 `electron/src/codex-*`、`settings-preload.js` 与 `i18n/settings.json` 到对应的 `src` 目录；`review.html` 只需包含 `#codex-settings` 容器、生产设置页的样式和 `codex-settings.js`，调用 `initCodexSettings(container, window.svsettings, window.svi18n)`。使用官方 `@electron/asar` 打包，解包规则为 `{codex-*.mjs,codex-catalog.cjs}`，与生产清单的目标文件一致。普通模式执行离线 IPC 验收并退出。

- `AKDAGENT_REVIEW_LIVE=1`：执行真实登录，`AKDAGENT_REVIEW_METHOD=browser|device` 选择方式。授权信息仅写测试目录。
- `AKDAGENT_REVIEW_LOGOUT=1`：用同一测试目录开启新进程，验证授权持久化，再通过生产设置 IPC 退出登录并确认已清除。
- 结果保存在测试目录的 `electron-review.json`，不含访问令牌或刷新令牌。

在线模型验收采用显式开关：设置 `AKDAGENT_LIVE_TEST=1`、`AKDAGENT_TEST_RUNTIME` 和 `AKDAGENT_LIVE_TEST_HOME` 后运行 `node tools/test-codex-live.mjs`。测试仅用独立授权目录，对 Astra / 6.1 Sol 的普通和 Fast 通道各执行一个合成只读工具往返，共 8 次小请求；不读取或发送用户工程。它将测试授权的本地有效期置为过期，再验证真实 SDK 能向服务端刷新。完成后运行测试应用的 logout 模式清理授权。

### 2026-10-06 实际验收结果

- Windows 真实打包 Electron：8 项基础检查通过，包括 `.asar.unpacked` worker、preload/IPC、模型选择和其他窗口拒绝访问。
- 浏览器和设备码 OAuth 均完成真实授权；两者均在新 Electron 进程中读到已保存授权，再通过设置 IPC 成功退出。
- 普通 / Fast × Astra / 6.1 Sol 的 4 个在线工具往返全部成功（8 次请求），SDK 服务端刷新成功。使用合成工具，无真实 SV/IX 工程数据。
- 两份测试授权均已清除。单元测试另覆盖并发凭据写入、登录/退出互斥、异步设置写入、Priority 请求载荷和真实 SDK 的 SSE 解析。

这些结果支持代码评审，不代表完整发行验收。真实 SV/IX 工程的端到端回归、完整安装/卸载流程及 macOS 发行包仍需在相应环境完成；不得把合成工具往返写成这些项目已通过。
