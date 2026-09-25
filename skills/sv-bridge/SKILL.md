---
name: sv-bridge
description: ⛔ 已退役—— AKDAgent **旧的 JS 剪贴板桥**（SVAgentBridge.js）的历史参考：安装/运行方式、操作实现、ES5.1 约束、排错与扩展。**现役桥是 Lua 文件通道桥，请改用 akdagent-protocol 技能**；本技能仅在查阅旧剪贴板方案的实现细节时使用
version: 1.0.0
---

# AKDAgent Bridge（SV 内常驻桥脚本）
> ⛔ **本技能已退役**：它描述的是 **JS 剪贴板桥** `SVAgentBridge.js`，该桥已随剪贴板通道一起退役；**归档目录 `legacy/` 也于 2026-09-19 按用户指示删除**（退役记录：，不随技能分发）。
> 现在唯一的桥是 **`sv/lua/AKDAgentBridge.lua`**（Lua + 文件通道），协议与绑定差异见 `akdagent-protocol` 技能。
> 下面内容保留作历史参考（尤其"ES5.1 约束"只对已退役的 JS 桥成立）。


让外部进程（DSH MCP server / Electron 悬浮球）通过**系统剪贴板**向 Synthesizer V Studio 下发命令。
请求 `SVCMD:` → 在 SV 进程内执行真实 API → 响应写回 `SVRES:`。协议细节见 `akdagent-protocol` 技能。

> 脚本源码**连同 `legacy/` 已删除**（2026-09-19，退役前归档在 `legacy/SVAgentBridge.js`）；如果要看当年的实现，只能从历史提交或备份里找。
> ⚠️ 本文件里**只有一节内容仍现役**（浮动 BPM 伴奏对齐），已**移出到 `akdagent-playbook` 的「七、伴奏对齐」节**；其余全部只作历史。

## 先看这里：排错症状索引

桥出问题时，**先定位症状**：

| 症状 | 原因 | 处置 |
|---|---|---|
| **工具超时**（10s 无响应）+ 宿主重启 | **宿主版本**（IX 1.0.0 的读点类 API 会弹框冻桥）或**参数个数写错** | 先看 `hostOutdated`（桥报了就**先让用户升级宿主**）；再读错误原文（`InvocationError` 会写明「预期 N 个参数」）。**别一上来归因成"宿主内部对象没法序列化"**（2026-09-20 实测那条不成立） |
| 报 `unknown op: xxx` | 桥是**旧版**（改了源码没重载）| 重新同步 + 在宿主里重跑桥 |
| 报 `spawn ENAMETOOLONG` | 载荷过大（base64 二次编码膨胀 ~7 倍，超 Windows 32KB 命令行）| 只传短指令，展开放桥端；详见 `../sv-scripting/examples/载荷过大-ENAMETOOLONG.md` |
| 报 `X is not a function` / `undefined not callable` | API 记错（如 `timeAxis.seconds2Blick`）| 见 `sv-scripting` 的「API 勘误」 |
| 桥完全没反应（连超时都没有）| 桥脚本没运行 / 被关闭 | 在宿主里跑 `Agent → AKDAgent Bridge` |
| 写操作被拒绝（安全校验）| 脚本没含 `newUndoRecord()` | 写脚本里先 `SV.getProject().newUndoRecord()`（**无参数**）|

> **验证桥版本**（不靠记忆）：让桥返回只有新版才有的符号，如
> `return { has: typeof svhChordSegsToNotes }` → 期望 `"function"`；`"undefined"` = 旧版。

## 安装（**JS 桥时代 · 历史** —— 用户手动复制，应用不自动安装）

把 `SVAgentBridge.js` 复制到 SV 的 scripts 目录（可放 `AKDAgent/` 子目录）：

| 版本 | 路径 |
|---|---|
| SV2 | `%APPDATA%\Dreamtonics\Synthesizer V Studio 2\scripts\AKDAgent\SVAgentBridge.js` |
| SV1 | `Documents\Dreamtonics\Synthesizer V Studio\scripts\AKDAgent\SVAgentBridge.js` |

文件就位后 SV 脚本菜单自动出现 `AKDAgent → AKDAgent Bridge`。

## 运行（**JS 桥时代 · 历史**）

- 脚本菜单 → `AKDAgent → AKDAgent Bridge` → 运行（每次打开 SV 后需运行一次；SV2 后续可改 SidePanelSection 自动常驻）
- 脚本常驻轮询剪贴板，**不要关闭**；控制台可见 `[AKDAgent]` 日志
- 需要脚本 API：`SV.getHostInfo` / `SV.getHostClipboard` / `SV.setHostClipboard`（缺失时启动弹窗提示）

## 实现要点（改脚本前必读）

- **ES5.1 / Duktape 约束**：禁止 `const`/`let`/箭头函数/模板字符串；只用 `var` + `function`；`throw new Error` 仅在 dispatch 的 try/catch 内使用
- **常驻机制**：`main()` → `svhInit()`（校验 API）→ `svhPoll()`；`SV.setTimeout(300, svhPoll)` 递归轮询，**绝不能调 `SV.finish()`**
- **去重与重试**：`SVH.done` 记录已处理 id；`SVH.responses` 缓存序列化响应（上限 `MAX_CACHE=100`，超限按插入序裁剪）——客户端超时后用同 id 重试时桥会重发缓存响应
- **撤销**：所有写操作（移调/歌词/播放外）执行前先 `SV.getProject().newUndoRecord()`，保证 SV 内 Ctrl+Z 可撤销
- **时间单位**：SV 内部用 blicks；对外返回四分音符（`n.getOnset() / SV.QUARTER`）

## 操作实现对照（`svhDispatch` —— **JS 桥时代 · 历史**）

| op | 关键实现 |
|---|---|
| `ping` | 返回 `SVH.hostName/hostVersion/isSV2`（`SV.getHostInfo().hostVersionNumber >= 131072` 判 SV2） |
| `get_project_info` | `SV.getProject()` 遍历轨道 `getName()/getNumGroups()`、`getNumNoteGroupsInLibrary()` |
| `get_current_group` | `SV.getMainEditor().getCurrentGroup()` → `getTarget()` → name/uuid/noteCount/timeOffset/pitchOffset |
| `get_selected_notes` | `SV.getMainEditor().getSelection().getSelectedNotes()` 逐音符取 pitch/onset/duration/end/lyrics |
| `transpose_selected_notes` | 校验 `semitones` 为数字 → `newUndoRecord()` → 逐音符 `setPitch(getPitch()+semitones)` |
| `set_selected_lyrics` | `newUndoRecord()` → 逐音符 `setLyrics(lyrics)` |
| `playback` | `SV.getPlayback()`：play/pause/stop/toggle/seek；`toggle` 依 `getStatus()==="stopped"` 判断 |
| `get_melody_notes` | 读当前组全部音符（pitch/onsetBlicks/durationBlicks/lyrics），供和声等使用 |
| `create_harmony_group` | 接收 `{notes:[{pitch,onsetBlicks,durationBlicks,lyrics}]}` 建新 NoteGroup + Reference 加当前轨道 |
| `get_measure_info` | `TimeAxis.getMeasureMarkAt(measure)` → positionBlick/numerator/denominator/positionSeconds |
| `get_note_time` | 小节号+音符序号 → `TimeAxis.getSecondsFromBlick` 精确秒（含变速） |
| `run_script` | **通用执行**：`eval` agent 传的 ES5.1 脚本函数体（见下节） |

## 通用脚本执行（run_script）

`run_script` 让 agent 读 `sv-scripting` skill 文档现场写脚本，无需预加 op：

```javascript
// args: { code: "函数体", scope: { 变量名: 值 } }
// 例 1：读当前组音符数
code: 'var g = SV.getMainEditor().getCurrentGroup().getTarget(); return { count: g.getNumNotes() };'

// 例 2：用 scope 传入选中音符，写回音高
code: 'SV.getProject().newUndoRecord(); for (var i=0;i<selectedNotes.length;i++){ selectedNotes[i].setPitch(selectedNotes[i].getPitch()+12); } return {changed: selectedNotes.length};'
scope: { selectedNotes: [...] }   // 由 MCP 侧先调 sv_get_selected_notes 取到再传
```

- **实现**：`new Function(scopeKeys+["SV","SVH"], '"use strict"; '+code)`，`scope` 键作参数注入；返回结果经 `svhSerializeResult` 序列化（SV 对象按 getter 提取）
- **约束**：ES5.1（var/function，无箭头/const/let/模板串）；写操作前 `SV.getProject().newUndoRecord()`
- **安全（强制）**：**写操作脚本必须包含 `newUndoRecord()`**（桥侧校验，缺失即拒绝），否则工程数据可能被不可逆删除；只读查询传 `readonly:true` 跳过该校验。`eval` 任意代码 = SV 内任意执行权，仅限本机可信 agent；MCP 侧 `sv_run_script` 工具已挂载

### run_script 代码编写的 API 坑（真机实测，写错会 TypeError）

> 以下均为 SV 真机验证过的坑。`run_script` 让 agent 现场写脚本，务必按此写对，否则返回 `TypeError: xxx is not a function` / `undefined not callable`。

**① 时间换算用两套，别混**

| 需求 | 正确用法 | 错误写法（会报错） |
|---|---|---|
| 工程内精确换算（含变速/拍号） | `proj.getTimeAxis().getBlickFromSeconds(t)`、`getSecondsFromBlick(b)` | 写成 `timeAxis.seconds2Blick(...)` → 不存在 |
| 简单换算（固定 bpm） | `SV.blick2Seconds(b,bpm)`、`SV.seconds2Blick(s,bpm)` | 写成 `timeAxis.blick2Seconds(...)` → 不存在 |
| 音符↔拍 | `SV.blick2Quarter(b)`、`SV.quarter2Blick(q)` | — |

**② `getTimeAxis()` 在 Project 上**

```javascript
var timeAxis = SV.getProject().getTimeAxis();   // ✅
var timeAxis = SV.getMainEditor().getTimeAxis(); // ❌ 编辑器没有这个
```

**③ `newUndoRecord()` 无参**

```javascript
SV.getProject().newUndoRecord();        // ✅
SV.getProject().newUndoRecord("名称");    // ❌ SV1 传参报错
```

**④ 音频轨 = `isInstrumental()` 的 NoteGroupReference**

```javascript
var proj = SV.getProject();
for (var t = 0; t < proj.getNumTracks(); t++) {
  var track = proj.getTrack(t);
  for (var g = 0; g < track.getNumGroups(); g++) {
    var ref = track.getGroupReference(g);
    if (ref.isInstrumental()) {
      ref.getOnset(); ref.getTimeOffset(); ref.getEnd(); ref.getDuration();
      // 移动音频轨：先撤销点，再 setTimeOffset
      proj.newUndoRecord();
      ref.setTimeOffset(newBlickOffset);
    }
  }
}
```
不能做：**导入/创建音频轨**（无 setAudioFile 类方法）；只能读位置 + 移动已有音频轨。

**⑤ 读 BPM / 小节 / 拍号**

```javascript
var ta = SV.getProject().getTimeAxis();
var tempo = ta.getTempoMarkAt(0);          // { bpm, position, positionSeconds } —— 参数是 **blick**
ta.addTempoMark(0, 120); ta.removeTempoMark(0);   // 同样按 **blick**（0 = 工程起点）
var measure = ta.getMeasureMarkAt(1);      // { position, positionBlick, numerator, denominator }
// ⚠️ getMeasureMarkAt 收的是**小节号（1 起）**，不是 blick；按 blick 取用 getMeasureMarkAtBlick(b)。
// 音频轨对齐小节：
var startBlick = measure.positionBlick;
var beatBlick = ta.getBlickFromSeconds(60 / tempo.bpm);   // 一拍
```

## 浮动 BPM 伴奏工作流（✅ **仍现役** —— 已移出到 `akdagent-playbook` 的「七、伴奏对齐」节）

> 📌 **这一节的内容与已退役的 JS 剪贴板桥无关**（用的是现役工具 `sv_apply_tempo` → `sv_align_audio`），
> 2026-09-19 **已搬到 `skills/akdagent-playbook/SKILL.md` 的「七、伴奏对齐：浮动 BPM 两件套」**，请看那边。
> 留这个标题只为让旧链接/旧记忆有落点。

## 排错（**JS 桥时代 · 历史** —— 现役排错看 `akdagent-protocol` 的「边界情况处理」+ `akdagent-playbook` 的「二、桥与文件通道」）

| 现象 | 原因 / 处理 |
|---|---|
| Client 超时"SV bridge 超时" | SV 未打开 / 桥脚本没运行 / 脚本被关闭 → 在 SV 里重新运行桥 |
| 启动弹窗提示不支持剪贴板 API | SV1 旧版本缺 `getHostClipboard`，确认版本 |
| 桥不响应特定 op | 看 SV 控制台 `[AKDAgent] op 'xxx' failed: ...` 错误信息 |
| 重复执行 | 同 id 请求被桥缓存重发（正常，客户端重试场景）；id 不同则不会 |

## 扩展新操作

1. 在 `svhDispatch` 的 switch 里加 `case "xxx": return svhOpXxx(args);`
2. 实现 `svhOpXxx`：读操作直接返回对象；写操作先 `newUndoRecord()`，参数校验失败 `throw new Error(...)`
3. **op 清单正本在 `skills/akdagent-protocol/SKILL.md` 的「操作清单」节**（`knowledge/docs/PROTOCOL.md` 现在只放**分组速览**与协议规则，不再是 op 表）
   —— 且**现役桥是 Lua**（`sv/lua/AKDAgentBridge.lua` 的 `OPS.*`），扩 op 要改它；本节这套 `svhDispatch` 只对已退役的 JS 桥成立
4. 重新复制到宿主 scripts 目录并重跑桥（**JS 桥时代**的做法；现役 Lua 桥同理，改完要 `stop` 后在宿主里重新运行）

> 写 op 或让 agent 用 `run_script` 写代码前，务必对照 `sv-scripting` 技能的 **"API 勘误 / 实测坑点"** 章节——尤其时间换算 (`timeAxis.*` vs `SV.*`) 与对象归属（`getTimeAxis` 在 Project 上）。
