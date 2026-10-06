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

更新目录保留提供方的显示名称、推理偏好、重试和图片参数；`modelOverrides` 会先合入显式模型条目，避免 DSH 的两种配置形式互斥。仅清除 API Key、端点、协议和请求头覆写，以保证 OAuth 使用原生 Codex 接口。

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

历史在线与打包验收记录见 [PR #3](https://github.com/Akunda123/SVIXAGENT/pull/3)。上述回归仅使用合成数据，不代替真实 SV/IX 工程、安装流程及 macOS 发行包验收。
