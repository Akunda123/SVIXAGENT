# AKDAgent 1.1.3：代理通道、订阅接入与悬浮聊天改进

本文说明基于 AKDAgent **v1.1.3** 的功能补丁、使用方法、兼容处理和验证边界。

基线：[v1.1.3](https://github.com/Akunda123/SVIXAGENT/releases/tag/v1.1.3)，
提交 `fccfa46302a891a62ebd781682f2733ca3dd4515`。
模型清单核对日期：**2026-10-08**。

## 1. 新增功能与已解决问题

| 问题 | 本补丁的处理 |
|---|---|
| 手动关闭、重启后丢失选定的代理通道 | 增加“启动默认通道”，选择有效通道后自动保存；以后启动读取同一配置 |
| 未打开悬浮球聊天时切换模型出现 `main.model.noSession` | 自动显示聊天、等待后台并创建或复用当前工程段的会话；不发送提示词 |
| 订阅登录成功后仍需手动建立模型配置 | 在后台确认 OAuth 成功后创建或复用对应提供方配置；刷新设置与聊天中的模型选择器 |
| 悬浮聊天把 Markdown 当普通文字显示 | 历史消息和流式回复使用同一离线、安全的 Markdown 渲染器 |
| 模型列表缺少部分新模型 | 对 SDK 缺少的模型补充有来源、带日期的清单；保留 SDK 原有模型 |
| 只有左侧标签可以拖动悬浮球，长时间拖动后漂移 | 球体、标签和聊天标题空白区共用拖动逻辑；取消位置轮询和累积位移 |
| 聊天框固定大小，边缘无法拖拽缩放 | 增加四边、四角缩放手柄及方向光标；支持键盘调整并记住聊天框大小 |

这些改动只涉及客户端连接、配置与聊天交互，**不会主动修改歌曲工程、轨道或音符**。
用户通过智能体发出的工程编辑指令仍按原有工具流程执行。

## 2. 设置代理通道

### 2.1 四种启动通道

进入 **设置 → 网络与代理**。

| 通道 | 含义 |
|---|---|
| 原有设置（环境变量 / 系统） | 保持原先行为；Node 继承代理环境变量，应用浏览器保留原有网络策略 |
| 直连（不使用代理） | 对 AKDAgent 控制的浏览器连接与 Node 子进程明确禁用代理 |
| Windows 固定系统代理 | 读取 Windows 当前固定 HTTP/HTTPS 代理；不改写系统设置 |
| 自定义代理通道 | 使用保存的 HTTP 或 HTTPS 代理地址、端口 |

“原有设置”不保证 Node 与应用浏览器走相同通道。希望两者一致时，请使用明确的自定义通道。

### 2.2 添加及切换

1. 点击“添加通道”，填写名称、代理服务器协议、地址和端口。
2. 地址只填写主机名或 IP，例如 `127.0.0.1`，不要包含协议、路径或账号密码。
3. 选择“启动默认通道”。配置有效时会立即保存；页面显示保存结果。
4. 仅编辑名称、地址、端口等字段时，仍需点击“保存配置”。
5. 想立即使用已保存通道时，点击“应用并重启 AKDAgent”，阅读并确认提示。
   也可以手动退出 AKDAgent 后重新启动。

例如，本地代理软件提供 HTTP 监听 `127.0.0.1:7897` 时，填写：

```text
名称：本地代理
协议：HTTP
地址：127.0.0.1
端口：7897
```

端口必须以自己的代理软件设置为准，示例不是自动探测结果。
HTTP/HTTPS 选择描述的是**代理服务器协议**，不是目标模型网站的协议。

### 2.3 保存与立即应用是两件事

- “已保存”表示下次启动将读取的通道；“正在使用”表示本次连接采用的通道。
- 保存不会中断当前连接。尚未应用时会显示重启待生效提示。
- 对话、订阅登录或网络操作进行中时，不允许通过此按钮强制中断后台重启。
- 应用需要再次确认；取消确认仍保留已保存通道。
- 重启仅针对 AKDAgent，SV 不会被关闭。请先保存尚未发送的输入草稿。
- 配置损坏或读取失败时，不会静默切换到其他通道；原文件保留，错误提示提供恢复方向。

### 2.4 测试、支持范围与隐私

“测试所选通道”分别测试 Node 模型后台和应用浏览器。只有用户点击时才向
`https://www.cloudflare.com/cdn-cgi/trace` 发送无 API 密钥的 HTTPS GET；
不调用模型，不消耗模型 token，不保存测试中的草稿通道。

两个测试都成功，只证明测试站点可达，**不证明某个订阅账号、模型或地区可用**。
正常的 HTTPS 证书验证不会被关闭。

支持：最多 20 个通道、HTTP/HTTPS 代理、IPv4、IPv6 和合法域名。
暂不支持：SOCKS、PAC 自动脚本、代理用户名/密码，以及 macOS 系统代理自动读取。
macOS 可使用自定义 HTTP/HTTPS 通道，但本次未做 macOS 真机验证。

本地 SV/DSH 回环连接绕过代理。系统浏览器中的授权页面、Codex 以及其他应用仍使用
各自网络设置；本功能不会替它们设置代理，不会修改全局环境变量或系统代理。
应用控制的语音模型下载也使用选定浏览器网络通道，但本次只用模拟下载验证运输路径，
没有下载或运行语音模型。

## 3. 订阅登录后直接选择模型

1. 先设置需要的网络通道并重启 AKDAgent。
2. 进入 **设置 → 模型设置 → 订阅登录**，选择实际清单提供的登录方式。
3. 按提示在浏览器完成授权，或按原有流程填写授权码。
4. 等待后台回报登录成功及配置接入结果，然后在设置上方或悬浮聊天中选择模型。

**只有后台确认成功的 OAuth 登录才会建立配置**。点击登录、正在等待授权、取消、
失败、未知流程或 API-key 登录，都不会被当作订阅成功。

配置接入时：

- 创建或复用对应的 `llm-pi-ai` 提供方，不复制授权令牌到模型配置。
- 清除该提供方的 `apiKeyEnv` 覆盖，让 DSH 使用保存的 OAuth 凭据；已有密钥本身不会删除。
- 保留其他提供方、自定义端点、模型字段及原有默认模型。
- 主进程持续观察授权结果，即使关闭设置窗口也能完成配置接入。
- 写入失败会明确区分“登录成功”和“模型配置未保存”，可以修复权限后刷新重试。
- 重复读取同一次成功结果不会重复改写配置，也不会覆盖之后的手动修改。
- 切换另一家订阅时，旧尝试的延迟返回不能把新尝试错误标记为成功。

选择模型时若没有当前会话，会自动显示聊天并绑定当前工程段；并发选择不会创建多个会话，
工程切换时会重新核对绑定。失败会在界面内显示，并允许重试。

登录和配置接入不会自行更改默认模型或开启额外计费。
**用户明确选择会话模型后，DSH 原有行为可能把这次选择记为默认**，界面会重新读取结果。
不要把“配置接入不改默认”理解为改写了 DSH 的模型选择机制。

## 4. 模型清单补充

清单文件：[`electron/src/subscription-models.json`](electron/src/subscription-models.json)。
它补充客户端依赖 SDK 中缺少的条目，不是账号权限查询结果。

| 通道 | 补充或兼容条目 | 核对来源 |
|---|---|---|
| OpenAI Codex | `gpt-6.1-sol`、`gpt-6-sol`、`gpt-6-luna` | [OpenAI 官方模型说明](https://learn.chatgpt.com/docs/models) |
| Anthropic | Opus / Sonnet / Haiku 5.5 | [Claude Code 模型配置](https://code.claude.com/docs/en/model-config) |
| GitHub Copilot | 上述三种 GPT-6 系列、三种 Claude 5.5、Grok 4.7 | [Copilot 支持模型](https://docs.github.com/en/copilot/reference/ai-models/supported-models) |
| Kimi Code | 标准与 HighSpeed ID 的兼容条目；保留 SDK 原有 K3 系列 | [Kimi Code 模型说明](https://www.kimi.com/code/docs/en/kimi-code/models.html) |
| xAI | `grok-4.7` | [Grok 4.7 模型说明](https://docs.x.ai/developers/models/grok-4.7) |
| OpenRouter | 321 个支持文本输出、工具调用且带有效限制信息的目录条目 | [OpenRouter 公共模型接口](https://openrouter.ai/api/v1/models) |

这些是 2026-10-08 的快照，不承诺以后一直“最新”，也不代表各套餐均可调用。
现有 SDK 已包含的模型继续保留；不存在模板时跳过补充，不让可选清单阻止宿主启动。

### 4.1 兼容及计费边界

- 清单仅在 AKDAgent 自有 Node 宿主内存中扩展，不改写安装目录中的 SDK 文件。
- 同时覆盖运行时 SDK 和自有 profile 加载的另一份 SDK，保持 OAuth、端点及混合协议。
- **SDK 已有的模型优先**：不会用旧快照覆盖未来 SDK 的原生参数、价格或协议。
- 普通官方提供方已有显式模型列表时，仅追加缺少 ID；已有模型字段不改动。
  设置了自定义 `baseURL` 或 `api` 的提供方不自动扩展列表。
- 继承模板的限制是当前适配器的兼容配置，不等于对官方最大上下文/输出额度的承诺。
- 订阅补充条目中的零价格字段表示“不提供价格估算”的 SDK 兼容值，**不是免费额度承诺**。
  OpenRouter 快照中的 API 价格也不等于订阅账单。
- 已退役 Codex ID 保留供历史配置解析，并标注退役，不自动替换已有默认模型。
- 不进行后台模型调用、自动购买额度或自动开启额外计费。

维护者可手动运行：

```sh
node tools/refresh-subscription-catalog.cjs
```

该命令只 GET OpenRouter 公共目录并更新其快照、获取时间；**不会自动更新其他厂商清单**。
其他通道需根据官方资料人工核对 ID、协议和限制，并重新执行回归测试。
应用运行时不自动刷新这份快照。

## 5. Markdown、拖动与聊天框缩放

### 5.1 Markdown

支持标题、粗体、强调、列表、引用、表格、行内代码、代码块、普通链接及只读任务复选框。
历史回复与流式回复共用渲染器；代码、表格在自身区域滚动，用户向上阅读时不会被新回复
强制拉回底部。用户发出的文本仍按普通文字显示。

安全限制：关闭原始 HTML；拒绝 `javascript:`、`file:`、`data:` 等危险链接；
图片仅显示替代文字，不自动请求远程图片；合法链接仍需用户点击才能通过原有通道打开。
Markdown 库随包提供，不访问 CDN，不授予页面 Node 访问权限。

### 5.2 移动悬浮球与聊天

- 点击球体：打开或收起聊天。
- 按住球体、左侧标签或聊天标题空白区拖动：移动窗口。
- 小于 4 DIP 的鼠标抖动不当作拖动；完成拖动不会额外触发聊天开关。
- 拖动从最初的窗口位置和屏幕光标位置计算，不累积事件位移，也没有持续移动的定时器。
- 松开、取消、失去捕获或焦点、隐藏窗口、页面重载都会终止拖动；Escape 可以取消。
- 拖动期间冻结悬停展开/收起引起的窗口调整，防止动画与移动互相影响。
- 右键仍使用原有上下文菜单，不作为拖动起点。

### 5.3 自定义聊天框大小

展开聊天后，将鼠标移到边框或四角，出现相应方向的缩放光标，然后按住拖动。
八个手柄也可通过 Tab 聚焦，使用方向键调整；按住 Shift 时步长更大。

默认外层窗口尺寸为 372 × 512 DIP；最小聊天窗口为 372 × 360 DIP，
最大单边 2000 DIP，并受所在显示器工作区限制。窗口收起时仍保留小球形态。
完成缩放后记住尺寸，收起再展开或重启后复用。偏好写入失败不阻止本次调整，
但那次尺寸可能无法在重启后恢复。

这里使用应用内边缘手柄，不是简单把 Electron 的 `resizable` 改为 `true`：
[Electron 官方文档](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)
指出透明窗口不支持可靠的原生缩放，启用原生缩放可能使部分平台的透明窗口失效。

## 6. 对 1.1.3 的兼容处理

1. 以 1.1.3 为基线合并，而不是覆盖成旧版 `main.js` 或 `dsh-home.js`。
2. 保留凭据/设置的 POSIX `0600` 写入、启动权限自愈、每次宿主启动独立的错误现场、
   重试序号、运行时长，以及日志/故障报告脱敏。
3. 订阅和目录变更前的设置备份也使用 `0600` 策略，因为设置中可能含内联 API 密钥。
4. 防止原有 API 密钥名自愈迁移在重启时给已接入 OAuth 的通道重新挂回旧密钥。
5. 模型清单仅补缺；未来 SDK 原生条目优先，缺模板或无效补充条目安全跳过。
6. 目录预加载在不支持 `registerHooks` 的旧 Node 上告警并保留原生清单，避免宿主启动失败。
7. 锁定 `markdown-it` 15.0.2，并增加可重复资源生成步骤、npm 锁文件和 macOS 打包调用，
   防止只在开发机上存在浏览器资源而干净安装/打包时遗漏。
8. 新增测试不再硬编码个人安装目录或用户目录，SDK/TLS 集成使用可选环境变量。

正式运行时沿用项目的 Node 24.13.0 配置。目录扩展需要 Node 22.15+ 的模块钩子；
Node 内置代理通路测试需要 22.21+ 或 24.5+。本次测试使用 Node 24.12.0。
不要把 `electron/package.json` 的基础开发要求 `>=20` 当成所有新增运行时能力的最低版本。

## 7. 数据位置、升级与恢复

| 文件 | 内容 |
|---|---|
| 应用 `userData/network-settings.json` | 启动默认通道、通道列表、修订号 |
| `network-settings.json.previous` | 上次成功保存前的网络配置 |
| 应用 `userData/subscription-profiles.json` | 已接入订阅提供方标识和显示名，不含 OAuth 令牌 |
| 应用 `userData/orb-ui.json` | 聊天框尺寸，不含歌曲或聊天内容 |
| AKDAgent 自有 DSH 根 `settings.yaml` | 原有提供方配置与本次补充配置 |
| `settings.yaml.before-subscription` / `.before-catalog` | 对应修改前的最近一份配置备份 |
| AKDAgent 自有 DSH 根 `model-catalog/` | 可重复生成的目录文件与预加载脚本 |

`userData` 是 Electron 管理的应用数据目录，不是程序安装目录。
AKDAgent 的自有 DSH 根沿用原项目的 `.dsh-akdagent`；用户独立的 `.dsh` 保持只读。
设置备份可能含密钥，**不要提交仓库、上传公开附件或发到公共问题页面**。
这些备份不是完整的会话/凭据/工程备份，也不是多版本历史。

升级仍走原项目安装流程，本补丁不增加自动下载更新。
排障/恢复前先退出 AKDAgent，备份原配置，再决定是否从对应备份恢复。
只想重置聊天大小时，可在应用关闭后移走 `orb-ui.json`；不需要删除其他数据。
返回旧版时应恢复兼容的设置备份，保留 OAuth 凭据与会话历史，勿整目录删除数据根。
本地合并测试前已备份程序及相关配置；本次没有执行恢复操作。

## 8. 开发、打包与测试

### 8.1 依赖及离线资源

```sh
npm ci --prefix electron
node tools/stage-markdown.cjs --check
```

安装依赖、启动和 npm 打包前会生成 Markdown 浏览器资源；直接调用
`electron-builder` 或使用 `npm ci --ignore-scripts` 时，应显式运行
`node tools/stage-markdown.cjs`。macOS 打包脚本也显式调用该步骤。
资源生成使用锁定依赖，并随包保留解析库及其依赖的上游 LICENSE。
构建产物位于忽略的 `src/vendor/`。
完整安装包仍需原项目的 DSH、Node、server-runtime 和脱敏知识包准备流程。

### 8.2 回归命令

```sh
npm --prefix electron run test:ux
npm --prefix electron run test:network
npm --prefix electron run test:ux-ui
npm --prefix electron run test:network-ui
npm --prefix electron run test:orb-ui
npm --prefix electron run test:i18n
npm --prefix electron run test:settings-ui
node tools/test-credentials-mode.cjs
node tools/check-credentials-doc.cjs
node tools/check-key-settings-safety.cjs
node tools/check-auth-bridge-wiring.cjs
node tools/check-host-reuse-sync.cjs
node tools/check-ci-workflow.cjs
node tools/check-inline-js.cjs
node tools/check-abs-paths.cjs
```

默认单元测试无需真实账号/模型。以下可选环境变量启用额外的只读集成验证：

- `AKD_TEST_DSH_ROOT`：包含 DSH 和 pi-ai `node_modules` 的运行时根目录。
- `AKD_TEST_PROFILE_ROOT`：可选的第二份 profile SDK 根目录。
- `AKD_TEST_NODE`：可选的待验证 Node 可执行文件，默认使用当前 Node。
- `AKD_TEST_TLS_DIR`：本地测试证书目录，包含 `test-proxy-cert.pem` 和 `test-proxy-key.pem`。
- `AKD_TEST_ASAR`：独立打包的 `app.asar`，让新增 Electron 测试从归档中加载客户端资源。

未指定 SDK/TLS 路径时，对应测试会明确跳过，不能把跳过写成验证通过。
TLS 测试证书可用 OpenSSL 在临时目录生成：

```sh
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout test-proxy-key.pem -out test-proxy-cert.pem -subj "/CN=akd-probe.invalid" -addext "subjectAltName=DNS:akd-probe.invalid,DNS:localhost,IP:127.0.0.1" -addext "basicConstraints=critical,CA:TRUE"
```

证书和私钥仅用于本地假代理/假目标，不能用于真实服务或提交仓库。
测试把该证书限定给子进程的 `NODE_EXTRA_CA_CERTS`，不关闭 TLS 校验，也不安装到系统信任库。

### 8.3 本次验证结果与未验证范围

验证环境：Windows、Electron 33.4.11、Node 24.12.0；只读 SDK 集成为
DSH 0.1.5-rc.2 / pi-ai 0.85.1。独立源码与 ASAR 使用相同业务模块。

| 验证 | 结果 |
|---|---|
| 会话、订阅、目录及窗口几何单元/SDK 集成 | 24 项通过 |
| 网络单元、真实本地 HTTP/HTTPS 代理、回环绕过及证书拒绝 | 7 项通过 |
| 订阅/模型选择/安全 Markdown 界面 | 源码 20 项、ASAR 20 项通过 |
| 网络设置与 Chromium 代理/模拟下载界面 | 源码 28 项、ASAR 28 项通过 |
| 球体拖动、取消、八方向缩放、尺寸记忆及键盘操作 | 源码 23 项、ASAR 23 项通过 |
| 原有四语种界面回归 | 96 项通过 |
| 原有设置点击回归 | 55 项通过 |
| 1.1.3 权限、凭据、日志脱敏、启动取证与其他相关守卫 | 已运行并通过；资源守卫在生成脱敏知识包后通过 |
| 本地 `1.1.3-local.1` 合并版启动 | 后台鉴权及目录读取成功，MCP 自检通过，返回 53 个工具 |
| 安装后的配置/文件核对 | 代理配置、默认模型及密钥引用保留；核对的一份原 SVP 工程哈希一致 |

本地合并版已经安装、重新启动，并核对实际宿主目录中三个新增 GPT-6 系列 ID。
安装文件的三组隔离界面回归再次通过；这些界面测试的授权结果由模拟服务提供。
界面验证使用真实 Electron 页面、预加载接口和窗口。
窗口指针测试注入屏幕坐标，并关闭隐藏窗口中会暂停的 CSS 动画，验证指针捕获与
真实窗口尺寸，不冒充物理鼠标测试。已检查窄布局、四语种与 Markdown 截图。

未完成：真实订阅账号端到端授权/付费模型请求、完整 NSIS/MSI/dmg 安装验证、
macOS 真机及 POSIX 实际权限验证、物理鼠标长时间拖动、混合 DPI/多显示器拖动，
以及本地模型推理。以上需要单独人工验收；回归测试没有产生模型推理调用。

全应用静态界面严格审查并非全绿：有 50 个结果，其中 48 个是该静态检查器不能识别
`addEventListener` 的按钮接线提示（含本次新增的语义球体按钮），另 2 个涉及原有设置页
的链接/文本框规则。不能据此宣称整个应用已通过无障碍认证；改变的球体按钮及
网络/聊天交互以实际界面测试验证，未为压低统计而更改无关旧页面。

## 9. 主要实现入口

- 网络：`network-schema.js`、`network-settings.js`、`network-settings-ipc.js`、`network-settings-ui.js`。
- 会话：`session-binding.js` 与主进程的原有 DSH 会话接口。
- 订阅：`subscription-profiles.js` 与原有授权桥；成功状态由宿主确认。
- 目录：`subscription-catalog.js`、`subscription-catalog-preload.mjs`、`subscription-models.json`。
- Markdown：`chat-markdown.js` 与 `tools/stage-markdown.cjs`。
- 窗口：`orb-window.js`、`orb-window-ui.js` 与受限的 `orb-preload.js` 接口。
- 设计/交互约定：[`DESIGN.md`](DESIGN.md)、[`UX-CONTRACT.md`](UX-CONTRACT.md)。

## English summary

This patch targets upstream **AKDAgent v1.1.3**, preserving its credential-mode
healing, secure settings writes, per-attempt startup diagnostics and log redaction.

Changes include persistent startup proxy profiles, automatic current-project
session binding when selecting a model, OAuth-success-only provider provisioning,
an offline safe Markdown renderer, and a dated additive model catalog. Existing
SDK model definitions take precedence over the compatibility snapshot. Model
visibility is not proof of account entitlement or free usage. Explicit model
selection retains DSH's existing default-selection behavior.

The orb itself, its label and the non-interactive chat header are draggable.
Gestures use pointer capture and immutable absolute origins, without polling or
accumulated movement. Eight app-owned edge/corner handles resize the transparent
chat window; keyboard controls and separate persisted size preferences are included.
Native transparent-window resizing remains disabled intentionally.

Run the commands in section 8. Optional SDK/TLS/ASAR test paths are supplied through
environment variables; no personal filesystem paths are required. Tests do not
send model prompts. Windows source and ASAR UI regressions passed, but physical
mouse/mixed-DPI behavior, macOS permissions and installers, and real subscription
inference remain manual acceptance gates. The app-wide static audit still reports
legacy findings and event-listener false positives; it is not an accessibility
certification.
