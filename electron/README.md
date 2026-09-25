# AKDAgent Electron 悬浮窗（全内嵌模式）

把 **DSH host + MCP server（akdagent-mcp）** 全部集成进 Electron：
双击 MSI 安装后启动即用，**不需要**单独跑 DSH web、不需要命令行起 MCP server。

## 架构

```
┌─ Electron 悬浮球 + 侧栏面板 ────────────────────────┐
│  orb.html（自绘对话 UI）──IPC──▶ 主进程 agent 代理    │
└─────────┼──────────────────────────────────────────┘
          │ ① 一元 RPC：POST /api/<endpoint>（斜杠端点 + Cookie 会话）
          │ ② 流：ws://127.0.0.1:<port>/api/remote.mux
          │      · $events         审批/提问 waterfall（需应答 → $events/result）
          │      · session/follow  会话日志（首帧 snapshot = 历史，随后实时事件）
          │ spawn（node <dshRoot>/node_modules/@deepseek-ai/dsh/lib/bin.js web --port <port> --no-open）
          ▼
┌─ 内嵌 DSH host（独立数据根 ~/.dsh-akdagent）─────────┐
│  └─ mcp-akdagent 插件 → 拉起 server/dist/index.js  │
│     （MCP server → Lua 文件通道桥 → SV/IX 脚本）     │
└───────────────────────────────────────────────────┘
```

- **0.1.5-rc.2 换了两件事**（2026-09-21 升级）：① 网页面（含 `/api/*` 与 mux）要**会话 cookie**
  —— 从宿主 stdout 的 `dsh web: http://…/?token=…` 换；② 客户端↔宿主 API 换成 **Typert RPC**
  （斜杠端点进路径、mux 逻辑流、`$events` / `session/follow`）。细节见 `src/main.js` 顶部注释。
- 内嵌实例端口 **3180+**（自动找空闲），与用户自己的 DSH web 互不干扰
- 退出应用时 `taskkill /T` 清掉整个 host 进程树（含 MCP server 子进程）

## 开发运行

```powershell
npm install
npm start            # 启动 Electron 悬浮球（开发模式，用仓内 dsh-runtime/dsh 做 host）
npm run verify       # 无 GUI 验证内嵌 host（拉起 → 换 token cookie → 裸 / 401、带 cookie 200 → 清理）
```

开发模式下 host 取仓内 `dsh-runtime/dsh`（由 `scripts/build-runtime.ps1` 从本机 npm prefix 组装）；
`AKDAGENT_DSH_ROOT` 可覆盖，`AKDAGENT_DSH_HOME_DIR` 可换成一次性数据根（测试用）。
打包后从 `resources/dsh` 读内嵌运行时。

端到端链路验收（**要真跑一轮对话**，需宿主已在跑）：

```powershell
node src/e2e-probe.js "http://127.0.0.1:<port>/?token=<token>"   # 见宿主 stdout 的 `dsh web:` 行
```

## 桥脚本（用户手动安装，应用不自动复制）

现役桥是 **Lua 文件通道桥** `..\sv\lua\AKDAgentBridge.lua`（旧 JS 剪贴板桥已退役）：

1. 设置页 →「SV 集成」一键部署到各 SV 的 `scripts\Agent\` 子目录（或手动复制）
2. 在 SV 脚本菜单运行一次（驻留轮询；IX 侧另见 `skills/sv-ix`）

## 打包 MSI

```powershell
# 1) 组装内嵌运行时（npm 树 + 随包 skills + node.exe），默认离线用本机 prefix
powershell -ExecutionPolicy Bypass -File scripts\build-runtime.ps1
#    联网从 registry 组装：加 -Registry    指定本机 prefix：-FromPrefix <path>
# 2) 脱敏 + 生成随包知识集：node ..\tools\check-redaction.cjs --redact-to ..\dist\knowledge
npm run dist          # electron-builder → release/AKDAgent-<ver>-x64.exe（+ dist:msi 出 MSI）
```

> 运行时基线（2026-09-21）：`@deepseek-ai/dsh@0.1.5-rc.2` · **224 MB / 25 573 文件 / 0 符号链接**
> （旧源码树方案是 527 MB）。`build-runtime.ps1` 自带冒烟：起 host → 抓 token URL → 要求
> token URL 200、裸 `/` 401，不通过就构建失败。

## 悬浮球形态（已实现）

- **悬浮球**：64x64 无边框透明置顶圆球（🎵 + 状态点），可拖动；绿点 = 内嵌 host 就绪
- **点击球**：展开/收起自绘对话面板（`src/orb.html`，经主进程 agent 代理与宿主通信）
- **侧栏面板**：`SidePanelSection` ⇄ `src/panel-bridge.js` 镜像真实会话
- **托盘**：显示/隐藏、退出；退出时 `taskkill /T` 清掉 host 进程树

```powershell
npm start    # 开发模式：悬浮球 + 内嵌 host（用仓内 dsh-runtime/dsh）
```

## SV Flat 版：nofs 声库编辑器（设置 → SV 集成）

只对 **flat 版（OPSV）** 有意义：nofs 声库文件是 JSON，能直接读写风格向量。

- **没检测到 flat ⇒ 整个区块隐藏**（连标题一起；检测 = 进程在跑 或 `databases\` 里找到 JSON nofs）
- 声库列表点「编辑」⇒ 编辑器**贴在那一行正下方**（高亮 + 左侧绿线），不再固定挂在列表末尾
  —— 声库动辄 80+ 个，挂末尾等于"点了没反应"。切语种重排列表后会**贴回同一行**
- **加 style**：只收 **`data`（256 hex = 32×float32）+ `name`** 两个字段
  （实测 84 个声库 / 1222 条 style 无一例外都是 256 位；自动转大写；非 hex / 长度不对 / 重名都拦）
- **从现有 style 复制**：下拉**只列同 vocoder 的**声库/风格，选中自动预填「源名 copy」，
  `data` 与可选的 `extra`（8 hex）忠实带过来
  - ⚠️ **同 vocoder 是硬约束**：风格向量与声学模型绑定，跨 vocoder 不可移植（实测结论）
  - 两层保证：跨 vocoder 的条目**根本不进下拉**；点击时**再比对一次** vocoder（防手改 JSON 后旧列表仍在）
  - 当前 JSON 没有 `vocoder` 字段 ⇒ 停用复制并说明原因
- **保存**：只改文本框，点「保存」才写文件（写前自动留 `<file>.nofs.bak`）
- **scripts 目录**：输入框留空点「添加」或点「浏览…」⇒ **系统目录选择框**（`dialog.showOpenDialog`）

```powershell
npx electron dev/test-flat-style-editor.cjs   # 46 条：隐藏/贴行/加 style 校验/同 vocoder/选择器
```

nofs 文件结构与"同 vocoder 才能移植"的依据：`skills/akdagent-protocol/references/svp-format.md` §databases。

## 界面语言（i18n，独立于 DSH）

支持 **简体中文 / 繁體中文 / English / 日本語** 四语，**只影响客户端界面**
（悬浮球、设置窗、密钥弹窗、托盘与右键菜单），与 DSH 自己的语言（`~/.dsh/settings.yaml`
的 `locale.preference`，管模型回复与 DSH 网页界面）是两套互不干扰的设置。

- 存放：`%APPDATA%/akdagent-electron/ui-prefs.json` 的 `locale`
- **首次启动**（该文件不存在）按**系统语言**自动选一次：
  `zh-CN→zh-Hans`、`zh-TW/zh-HK→zh-Hant`、`ja-*→ja`、其余→`en`；之后以文件为准
- 切换入口：设置窗 → **对话设置** → 「客户端界面语言」；切换**不重载窗口**（保住聊天草稿），
  主进程广播 `akdagent-i18n-update`，各窗口重排文案；托盘/右键菜单用主进程侧文案重建
- 实现与术语表：`src/i18n/README.md`

### 校验

```powershell
npm start                                   # 手动看：设置 → 对话设置 → 客户端界面语言
npx electron dev/test-i18n.cjs              # 逻辑 + 三窗口 × 四语 + 热切换（必须全绿）
node dev/check-i18n-residue.cjs             # 静态扫描：界面文案里还有没有漏接 i18n 的中文
node dev/check-i18n-residue.cjs --strict    # 有残留就退出码 1（回归用）
```
