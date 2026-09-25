# Electron 客户端界面语言（i18n）

**这里管的是 Electron 客户端的界面文案（悬浮球 / 设置窗 / 密钥弹窗 / 托盘 / 右键菜单），
和 DSH 自己的 `locale.preference` 完全是两套**：

| | 存哪 | 管什么 | 谁改 |
|---|---|---|---|
| DSH 语言 | `~/.dsh/settings.yaml` → `locale.preference` | 模型回复语言 + DSH 网页界面 | 设置页「DSH 界面语言」 |
| **客户端语言** | `%APPDATA%/akdagent-electron/ui-prefs.json` → `locale` | 本客户端所有界面文案 | 设置页「客户端界面语言」 |

语种：`zh-Hans` 简体 / `zh-Hant` 繁體 / `en` English / `ja` 日本語。
**首次启动**（`ui-prefs.json` 不存在）按系统语言自动选一次，之后以文件为准。

## 字典文件

```
src/i18n/
├── index.js        # 主进程：系统语言探测 / 读写 ui-prefs.json / 合并字典 / t() / audit()
├── common.json     # 通用 + 托盘/右键菜单/窗口标题（主进程与所有窗口共用）
├── settings.json   # 设置窗（命名空间 settings）
├── orb.json        # 悬浮球 + 对话面板（命名空间 orb）
└── keyPrompt.json  # 密钥弹窗（命名空间 keyPrompt）
```

每份 JSON 形状固定为 **4 个语种各一个扁平 key→文案 映射**：

```json
{
  "zh-Hans": { "nav.model": "模型设置" },
  "zh-Hant": { "nav.model": "模型設定" },
  "en":      { "nav.model": "Models" },
  "ja":      { "nav.model": "モデル設定" }
}
```

- **`zh-Hans` 是基准语种**：缺翻译时逐级回退（当前语种 → zh-Hans → key 本身）。
  `audit()` 会报出「哪个语种缺哪些 key」，也报多出来的 key（防拼错）。
- key 用 `命名空间.词条` 点分小写，如 `settings.status.bridge.check`。
- 占位符写 `{0}` `{1}`（`i18n/index.js` 的 `fill()` 与 preload 的同名实现一致）。
- 语言名永远用**该语言自己的写法**（`繁體中文`、`English`、`日本語`），不要译成 "Traditional Chinese"。

## 渲染层怎么用（重要）

preload 跑在**沙箱**里，**不能读文件**，字典由主进程经同步 IPC 给：

```js
// 每个窗口的 preload 里（三份 preload 各自内联这段，沙箱下不能 require 本地文件）
const { locale, dict } = ipcRenderer.sendSync('akdagent-i18n-sync')
```

preload 向页面暴露 `window.svi18n`：

| 成员 | 用途 |
|---|---|
| `svi18n.locale` | 当前语种（`'zh-Hans'` …） |
| `svi18n.t(key, ...args)` | 取文案，`{0}` 占位符按参数替换；**取不到时返回 key 本身**（便于测试发现漏翻） |
| `svi18n.apply(root?)` | 把 `[data-i18n]` / `[data-i18n-ph]` / `[data-i18n-title]` 刷成当前语种文案 |
| `svi18n.onChange(cb)` | 语种切换时回调（页面在这里重排动态文案，**不重载窗口**） |

### HTML 侧约定

- 静态纯文本叶子节点：`<div data-i18n="nav.model">模型设置</div>`
  （**原文保留作 zh-Hans 兜底**，`apply()` 会覆盖 `textContent`）。
- 属性：`data-i18n-ph="settings.stt.placeholder"`（placeholder）、`data-i18n-title="..."`（title）。
- **不要**对含子元素的容器挂 `data-i18n`（会把子元素一起抹掉）；给每个子节点各挂一个 key。
- JS 里拼出来的动态文案（列表项、提示、状态、`confirm()` 等）一律用 `svi18n.t('key', 参数)`。
- 页面加载末尾调用一次 `svi18n.apply()`；再注册
  `svi18n.onChange(() => { svi18n.apply(); renderXxx() })` 让动态部分跟上。
- 切语种**不重载窗口**：主进程广播 `akdagent-i18n-update`，preload 更新字典后回调页面。

## 主进程侧也要走 i18n

任何**会被界面显示**的字符串都在范围内，不只是 HTML：`file-ipc.js` 的桥错误、
`stt-model.js` 的模型名、`main.js` 里 IPC 返回的 `{ok:false,error}` 都算，
统一 `const i18n = require('./i18n')` + `i18n.t('main.xxx', 参数)`（key 放 `common.json`）。
日志（`console.*`）、注释、op 名、频道名、路径不算。

**声明的中文兜底**：数据结构里保留中文原值作兜底（如 `stt-model.js` 的 `label`）时，
在该行尾加 `// i18n-fallback` 注明——`dev/check-i18n-residue.cjs` 会跳过这类行，
否则静态扫描会一直报"残留"。

## 导出 / 摘要也跟随界面语言（2026-09-13 定）

导出的 markdown（`# AKDAgent session log` / `## User` / `## Assistant` / 中断 / 待办）、导出文件名前缀、
以及**压给模型的摘要提示词**（含"用什么语言写摘要"那句）都走 `main.export.*` / `main.summary.*`。

⚠️ **表头与挑行正则是一对**：`ruleSummary()` 用 `/^#{1,3} |^用户|^助手/` 从导出的 md 里挑关键行，
表头本地化后必须**按当前语种构造正则**（`main.export.roleUser` / `roleAssistant` 去掉 `##` 再转义），
否则英文界面下会一行都挑不到。`tools/test-transcript-render.cjs` 对四语都断言了这条。

## 三条硬规矩（都踩过）

1. **切语种时每个重渲染各自 try/catch**：`I.onChange` 里是一串顺序调用，
   中间一个抛错会**中断整串**，后面的全部留在旧语种（真踩过：
   `renderSvConfig` 抛错 ⇒ STT 下拉没跟着切）。用 `safeRedraw('名字', fn)` 包一层。
2. **动态创建的节点也要能重排**：`I.apply()` 只认 `[data-i18n]` 属性；
   JS 里 `createElement` + `I.t()` 造出来的节点如果不带 `data-i18n`，
   切语种时必须由页面的重渲染函数再跑一遍（orb.html 用 `data-i18n-key` + `redrawDynamic()`）。
3. **测试桩的数据形状必须与主进程真实 handler 一致**：`akdagent-get-sv-config` 真实返回
   `{scriptsDirs, entries, bridgeSource}`，写错形状会让页面抛错，症状看起来像"文案没切"。

## 术语表（四语统一，别各译各的）

| 中文 | zh-Hant | en | ja |
|---|---|---|---|
| 悬浮球 | 懸浮球 | orb | フローティングボール |
| 聊天面板 | 聊天面板 | chat panel | チャットパネル |
| 设置 | 設定 | Settings | 設定 |
| 模型 | 模型 | Model | モデル |
| 推理等级 | 推理等級 | reasoning effort | 推論レベル |
| 提供方 | 提供方 | provider | プロバイダー |
| 密钥 | 金鑰 | API key | API キー |
| 语音输入 / STT | 語音輸入 / STT | Speech input (STT) | 音声入力（STT） |
| 桥 / 桥脚本 | 橋 / 橋腳本 | bridge / bridge script | ブリッジ / ブリッジスクリプト |
| 工程 | 專案 | project | プロジェクト |
| 音符组 | 音符組 | note group | ノートグループ |
| 音高线 | 音高線 | pitch curve | ピッチカーブ |
| 轨道 | 軌道 | track | トラック |
| 声库 | 聲庫 | voice database | 音源（ボイス） |
| 部署 | 部署 | deploy | デプロイ |
| 自动检测 | 自動偵測 | Auto-detect | 自動検出 |
| 状态 | 狀態 | Status | ステータス |
| 就绪 / 未就绪 | 就緒 / 未就緒 | ready / not ready | 準備完了 / 未準備 |
| 已连接 / 未连接 | 已連線 / 未連線 | Connected / Not connected | 接続済み / 未接続 |
| 会话 / 新会话 | 會話 / 新會話 | session / New session | セッション / 新しいセッション |
| 导出 | 匯出 | Export | エクスポート |
| 摘要 | 摘要 | summary | 要約 |
| 临时工程 | 臨時專案 | temporary project | 一時プロジェクト |
| 开机自启 | 開機自動啟動 | Launch at login | スタートアップに登録 |
| 置顶 | 置頂 | Always on top | 常に最前面 |
| 贴回右下角 | 貼回右下角 | Reset to bottom-right | 右下に戻す |
| 稍后配置 | 稍後設定 | Set up later | 後で設定 |
