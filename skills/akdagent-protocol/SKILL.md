---
name: akdagent-protocol
description: AKDAgent 协议 v1 完整规范（**现役通道 = 纯文件通道**，剪贴板已整体退役）：`akdagent-{req,res,hb,boot}-<host>.json` 的**字段与语义**（请求 `v/seq/id/op/args` ↔ 响应 `v/id/seq/ok/ts/host/result|error`）、规则（心跳声明能力 + `canServe` 判据 / **id 去重（不是 seq）** / **应答后必须 `consumeReq`** / **客户端按 `id` 字符串匹配** / 超时语义）、**32 个 op 清单**、目录解析顺序与时序、边界（多宿主 `-sv`/`-ix` 不互抢、排障三件套）、写操作护栏规格（指纹与 STALE、体量护栏、事务语义 —— **规格已定、尚未实现**）、能力边界自述与"不抢用户焦点"纪律；用于开发与 Synthesizer V Studio / Instrument X 桥通信的客户端（MCP server / Electron / 脚本）。旧 SVCMD/SVRES（剪贴板）内容仅作历史参考
version: 1.0.0
---

# AKDAgent 桥协议 v1（**文件通道**）

> 📌 **传输方式（2026-09-12 起，唯一通道）**：**剪贴板已整体退役**，只有文件通道 ——
> 请求 `<dir>\akdagent-req-<host>.json`（客户端**原子替换**写入：写 `.tmp` 再 rename）· 响应 `akdagent-res-<host>.json`（桥写 `.tmp` 再改名，失败则先删再改）·
> 心跳 `akdagent-hb-<host>.json`（存活 + 宿主信息 + **`ops` 能力清单** + 实际 `dir`）· 启动结果 `akdagent-boot-<host>.json`（成功/致命错误，供外部排障）。
> **`<dir>` 解析顺序（两端同序）**：① `%USERPROFILE%\AKDAgent\ipc`（**存在且可写才用** —— Lua 不能 mkdir）② `os.tmpdir()`（= `%TEMP%`）。
> ⚠️ 客户端另有环境变量 `AKDAGENT_IPC_DIR` 可覆盖，**桥不读它** ⇒ 设了就必须让桥也落在同一目录。**"两端 `dir` 不一致"是这套通道最常见的故障**（心跳里会写实际 `dir`，先对一眼）。
> 桥只有 Lua 一种 ⇒ **`run_script` 执行的是 Lua**（冒号调用、索引 1 起），不再是 JS。
> 本文件后文凡提到 `SVCMD:`/`SVRES:`/剪贴板的，均**只作历史参考**；现役事实以 `sv/lua/AKDAgentBridge.lua`（现 **0.3.25**）与 `server/src/fileipc.ts` 为准。

通信双方：**Bridge**（宿主内常驻 Lua 脚本，执行方）与 **Client**（MCP server / Electron 客户端，请求方）。
另有旁路产物 `akdagent-log-<host>.txt`（桥的运行日志）与 `akdagent-diag-*`（诊断），排障时先看它们。

> 规范原文维护在 `knowledge/docs/PROTOCOL.md`（**与本技能同源，改协议要一起改**）；通道客户端实现 `server/src/fileipc.ts` · 桥侧 `sv/lua/AKDAgentBridge.lua`。

## 🔢 索引基准（全仓总纲 —— 看到任何 `index` 先读这条）

| 层 | 基准 | 说明 |
|---|---|---|
| **JS 绑定**（SV 官方脚本 JS）| **0 起** | `getTrack(0)` / `notes[0]` / `getIndexInParent()` 全 0 起。**的 JS 桥（`SVAgentBridge.js`）已退役**（连同归档目录 `legacy/`，2026-09-19 已删）—— 现役是 Lua 桥 |
| **Lua 绑定**（SV 官方脚本 Lua；SV1/SV2 都有）| **1 起** | 官方 API 原文：`getIndexInParent()` — *"In Lua, this index starts from 1. In JavaScript, this index starts from 0."* **参数与返回值都是** 1 起；桥内用 `CFG.INDEX_BASE = 1` 换算 |
| **对外协议**（`akdagent-{req,res,hb,boot}-<host>.json` 文件通道、`mcp__sv__*` 工具、本技能）| **一律 0 起** | 换算只发生在**桥内部**（`CFG.INDEX_BASE = 1`）⇒ 客户端与文档都不用改 |
| **工程文件**（`.svp`/`.ixp` 的 `notes[]`/`groups[]`/`meter[].index`）| **0 起** | JSON 数组下标 |
| **小节号**（`getMeasureMarkAt(measureNumber)` / `addMeasureMark` / `removeMeasureMark`）| **1 起** | 另有 `getMeasureMarkAtBlick(b)` 是**按 blick** 取 —— 两者别混（曾因此静默算错拍号） |

**三条最容易踩的坑**
1. **`get_selected_notes` 返回的 `index` 是「本次选中结果数组内的序号」（0 起），不是「组内下标」。**
   要写 `write_pit` 的 `indices`（那是**组内下标**）必须另取 `Note#getIndexInParent` —— 而且 **Lua 侧要 +1 换算**。
2. **序号类参数的基准逐个确认**：`trackIndex` / `audioTrackIndex` **0 起**；`part` **1 起**（`tools.ts` 里 `part - 1` 即证）；不要想当然。
3. **别用"试一下"确定基准**：Lua 绑定的错误**穿透 `pcall`**（直接弹脚本错误框），一次试探就打断用户 —— 已实测两次，故 Lua 桥里**不做任何探测**，基准写死 `CFG.INDEX_BASE`。

## 消息格式（文件通道）

**请求** `<dir>\akdagent-req-<host>.json`（单行 JSON，客户端原子替换写入）：

```jsonc
{ "v": 1, "seq": 1789175384220009, "id": "fileipc-1789175384220009",
  "op": "get_selected_notes", "args": {} }
```

**响应** `<dir>\akdagent-res-<host>.json`（桥写 `.tmp` 后改名）：

```jsonc
{ "v": 1, "id": "fileipc-1789175384220009", "seq": 1789175384220009, "ok": true,
  "ts": 1789175384, "host": "sv", "result": { … } }
{ "v": 1, "id": "…", "seq": …, "ok": false, "ts": …, "host": "sv", "error": "…" }
```

| 字段 | 出现处 | 说明 |
|---|---|---|
| `v` | 双向 | 协议版本，恒为 `1` |
| **`id`** | 双向 | 请求唯一 id（客户端生成 `fileipc-<seq>`）。**两端的一切匹配与去重都以它为准** |
| `seq` | 双向 | 客户端生成的**单调递增**序号（`Date.now()*1000+计数器`）。⚠️ **只作观测**：桥**不按它去重**（见「规则 2」），也**不要求响应 seq 数值相等** |
| `op` | 请求 | 操作名（见下表） |
| `args` | 请求 | 参数对象（可省略） |
| `ok` / `ts` / `host` | 响应 | 是否成功 / Unix 秒 / 应答宿主（`sv` \| `ix`） |
| `result` / `error` | 响应 | 成功结果 / 错误描述（二选一） |

> 🔑 **`id` 按字符串比较，别比 seq**（`server/src/fileipc.ts` 实测教训）：Lua 曾把 16 位 `seq` 编成科学计数法（`1789175384220009 → 1.78917538422e+15`）丢精度 ⇒ 客户端**只按 `id` 判等**，数字比较只当冗余条件 —— 否则会把"对端数字序列化不精确"放大成"桥不响应"。
> 🔑 **宿主标识写在文件名里**：`-sv`（Synthesizer V，SV1/SV2 **共用**）/ `-ix`（Instrument X）⇒ 旧文档说的"SV1 与 SV2 互相抢答"**在文件通道下不复存在**（各读各的文件）；但**同一宿主开两个实例**仍会互抢同一份文件名。

## 规则

1. **心跳声明能力（`canServe`）**：发之前先看 `akdagent-hb-<host>.json` —— ① 有心跳文件 ② `ts` 新鲜（**≤ 15s**）③ 该 op 在心跳的 `ops` 数组里**被明确声明**。三条都过才发；否则明确报"无心跳 / 心跳过期 Ns / 桥未声明 op 'x'（并附 `advertisedOps`）"。**桥自报能力是最可靠的判据**（旧的文件/剪贴板白名单已随剪贴板一起删除）。
2. **id 去重（主键是 `id`，不是 `seq`）**：桥内存里存 `done[id]`；**重复 id ⇒ 不重复执行，直接重发缓存响应**（客户端超时重试正是靠这条）。缓存被淘汰后再来同 id ⇒ 回 `ok:false, error:"duplicate request id (response evicted from cache)"`。
   ⚠️ **别用 `seq > lastSeq` 去重** —— 不同客户端的 seq 尺度可差 1000 倍，先到的大 seq 会把后到的小 seq 请求**永久静默忽略**（实测 `reqSeen` 卡住、心跳正常、只有 resend 日志）。桥里 `lastSeq` 仅作统计。
3. **应答后必须消费请求文件（`consumeReq`）**：桥应答（或重发缓存）后删掉 `req` 文件 —— **且只在"文件内容仍等于读到的快照"时删**（客户端是原子 rename 写入，避免误删新请求）。不消费的后果实测过：每拍重读同一请求 ⇒ **命中缓存 ⇒ 每拍重发响应**（日志每秒 2~3 条 `resent cached response`、持续 90 秒，而客户端其实只发了一次）。
4. **同一时刻只允许一个在途请求**：客户端必须串行化（`server` 侧已做互斥）⇒ **模型侧不要并发下发**，串行是设计不是卡。
5. **超时**：客户端默认 **10s**、轮询 **40ms**；桥侧轮询间隔 **300ms**（`POLL_MS`）。
   ⚠️ **超时是"模糊"的** —— 它只代表"我们不等了"，**宿主可能仍在把那次写做完** ⇒ **别急着重试写**，先 `ping` / 重读目标确认状态；确要重试就**用同一个 id**（命中缓存会重发响应，不会重复执行）。
6. **执行方语义**：所有写操作执行前先 `newUndoRecord()`（`run_script` 缺则拒绝，`readonly:true` 跳过），保证宿主内可撤销。
   📌 它是**一个撤销恢复边界，不是自动回滚**（见下「指纹 / 守卫」§ 的事务语义）。

## 操作清单（v1 · **共 32 个 op**，以实现为准）

> 真源 = `sv/lua/AKDAgentBridge.lua` 的 `OPS.*`；**2026-09-19 逐条核对过**。
> 心跳的 `ops` 数组就是这张表（桥自报），`canServe` 拿它判"这个 op 现在能不能服务"。
> 关系：**32 个 op ↔ 44 个 MCP 工具** —— 工具比 op 多，因为分离 / 音频分析 / 旋律生成 / 织体渲染等**完全在本地算**，不经桥。

### 读操作（13）

| op | 说明 | 返回要点 |
|---|---|---|
| `ping` | 检测桥是否在线 | `{pong, host, version, isSV2, ts, dir, ops}` |
| `selftest` | 桥自检（内部一批断言） | `{ok, …}` |
| `get_project_info` | 工程基本信息 | `{fileName, durationBlicks, numTracks, tracks:[{name,numGroups}], numGroupsInLibrary}` |
| `get_current_group` | 当前编辑组 | `{current, name, uuid, noteCount, timeOffsetBlicks, pitchOffset}` |
| `get_selected_notes` | 当前选中音符 | `{count, notes:[{index, pitch, onsetQuarter, durationQuarter, endQuarter, lyrics}]}`<br>⚠️ `index` 是**本次选中结果数组内的序号（0 起）**，不是组内下标<br>🆕 0.3.23 附加非协议字段 **`indexInParent`**（**组内下标，0 起**）—— 要写 `indices`（组内下标）的调用方用它，别用 `index` |
| `get_melody_notes` | **当前组全部音符**（`maxNotes` 可限） | `{current, groupName, timeOffsetBlicks, noteCount, notes:[{index, pitch, onsetBlicks, durationBlicks, endBlicks, onsetQuarter, onsetSeconds, lyrics}]}`<br>⚠️ `onsetBlicks` 是**组内相对**，绝对位置 = `timeOffsetBlicks + onsetBlicks` |
| `get_measure_info` | 小节 / 拍号信息 | `{…}` |
| `get_note_time` | 音符时间换算（blick↔秒/拍） | `{…}` |
| `get_layout` | **当前组布局报告**（只读） | `{overlapCount, gapCount, smallGapCount, overlaps/gaps/smallGaps(各前 5 条), policy, isMain, hostIsSv2}`<br>📌 口径：**重叠 = 违规必须报**；**缝隙 = 允许但要告知**；短缝 ≤ 1/16 拍单列（消缝须经用户同意） |
| `get_lyrics_attrs` | 歌词 + 音素属性（含手动音素、`phonemeAttrs`、`dur`、`muted`） | `{…}` |
| `get_phonemes` | **整组的实际发音音素串**（含 T2P 默认）—— 桥 0.3.23 新增，给音素替换用；`Note#getPhonemes()` 只给**手动写死过**的串 | `{ok, current, count, phonemes:[…]}`<br>⚠️ 宿主没有 `SV:getPhonemesForGroup` ⇒ `unsupported:true`，调用方退回首动串 |
| `get_computed_pitch` | 宿主**算出的音高曲线**（SV2 2.1.1+；SV1 无此接口） | `{values, numeric, nulls, firstFrame, lastFrame, notReady}`<br>⚠️ 全 `null` 先查前置条件（组是否挂上轨 / 语种与声库是否兼容），别先怪"渲染没算完" |
| `get_computed_attributes` | 宿主**算出的音符属性**（`accent` / `rapTone` / `rapIntonation` / `phonemes[]` 含实际生效语种） | `{count, notes, languages, accents, notReady, …}` |

### 写操作（16）

| op | args 要点 | 说明 |
|---|---|---|
| `transpose_selected_notes` | `{semitones}` | 选中音符整体移调（−12 = 降八度） |
| `set_selected_lyrics` | `{lyrics}` | 选中音符统一设词 |
| `apply_lyrics` | `{lyrics}` | 把一段词**按顺序**分配给选中音符（中文逐字 / 英文按词，`-` 保留） |
| `fill_track_lyrics` | `{lyrics, track?}` | 按**轨道/组**填词（track 可给名字或 0 起下标） |
| `set_note_languages` | `{…}` | 设音符语言（**⛔ 语言属于用户状态，默认不动**，见下文专节） |
| `set_note_rap_accents` | `{…}` | 写 `rapAccent`（1 阴平 · 2 阳平 · 3 上声 · 4 去声 · 5 轻声） |
| `set_note_phonemes` | `{…}` | 写**手动音素** |
| `set_note_phoneme_attrs` | `{…}` | 写**音素属性**（SV2 的 `leftOffset` 等；⚠️ 引擎消费但**不回显到 computed**） |
| `set_note_dur` | `{…}` | SV1 音素时长**比例**写入 |
| `write_chords` | `{chordSegs \| notes, pattern?, octaveShift?, groupName?, trackIndex?, instrument?, host?}` | **建 `NoteGroup` + 写音符**；`notes` 通道吃任意 `{pitch, onsetBlicks, durationBlicks, lyrics?, dynamic?, articulations?}`，`timeOffset=0`（位置由 onset 表达）、**同名组幂等替换**、回读 `layout`。<br>📌 织体 / 和声骨架都走它（`sv_write_chords`、`sv_write_texture`） |
| `create_harmony_group` | `{…}` | 建和声组（给主旋律配和声声部） |
| `write_pit` | `{plan?, params?, indices?, mode?, text?, egg?}` | 音高线写入：SV2 打点曲线 / SV1 写 12 属性；含重音计划与彩蛋词。⚠️ **仅 IX**：目标里含**同 onset 音符（和弦/齐奏）**且走 curve 路线时，结果会带 **`chordStarts`/`chordNotes`/`chordHint`** 如实警告（本工具按**单声部骨架**画曲线 ⇒ 同伴音被拉到骨架音高，真机 `yAtOnset` = 0 与 −4 ⇒ **和弦可能被压成同度**；IX 侧该处宿主实现是暴力移植、本身有 bug，见已知缺陷 `IX-005`）—— **只告知、不阻止**；要逐音精确控制就 `indices` 只给一个。⛔ **这条只在 IX**：SV1 走 attr 路线（无共享骨架）、SV2 的骨架是既定设计 ⇒ **都不提示**（IX 的参数编辑限制不许外溢到 SV）<br>🆕 **0.3.25 · 交界自检（只进回包、用户不可见）**：curve 路线下，若**目标的 ±1 邻音已有曲线而本次没重写它**，回包多给 **`junction`**（`{targets, neighbours, stale, unknown, items:[{index, neighbour, stale, unknown}]}`）与 **`junctionHint`**（一句话）；`stale` = 靠曲线 `scriptData` 里的**指纹**判出的**旧快照**（该音 ±2 的几何 + 各自生效参数），无指纹的旧曲线记 `unknown`。**含义**：这些交界处可能出现**两条有间距的线** ⇒ 推荐**把相邻音符放进同一次调用**（`indices` 同时给）|
| `align_audio` | `{firstBeatSec, bpm?, anchor?, measure?, introBeats?, introSec?, shiftBeats?, audioTrackIndex?}` | 移动音频轨使第一拍落到锚点（`trackIndex`/`groupIndex`/`audioTrackIndex` **均 0 起**） |
| `apply_tempo` | `{input?, bpm?, segmentBeats?, clearExisting?, measureStart?, beatOffsetSec?}` | 逐段写 tempo mark |
| `playback` | `{action:"play"\|"pause"\|"stop"\|"toggle"\|"seek", position?}` | 播放控制；**返回执行后的实际状态** `{status}` |
| `run_script` | `{code, scope?, readonly?}` | **通用逃生舱**：宿主内跑一段 **Lua**（冒号调用、索引 1 起）；⚠️ **必须含 `SV.getProject():newUndoRecord()`**（缺则拒绝；`readonly:true` 跳过） |
| `apply_ornaments` | `{ornament, indices?, interval?, dir?, len?, headLen?, steps?, df?, style?, manual?, dryRun?}` | **装饰音（拆音符路线）**：`graceFront` 前倚音 · `graceBack` 后倚音 · `spikeUp` 向上尖尖 · `mordent` 波音 · `turn` 回音 · `tailRun` 音尾音阶行进 —— 六个**真切音符**；`anticipate` 反向预备 · `slide` 滑音 —— 两个**只写音符属性**（**仅 SV1**）。<br>口径：**SV2 同样拆音符、不画曲线**；**第一段承接原歌词、其余段 `-`**；**新音符默认自动音高**（`manual:true` 才 `setPitchAutoMode(false)`）；**默认 `dryRun`**。回包给每段的 `{onsetQuarter, durQuarter, pitch, lyric, dF0Left?, tF0Left?}` 计划与 `failed[]` 原因（时值不足**不硬切**） |
| `set_automation` | `{parameter, points:[{onsetQuarter, value}], dryRun?}` | **参数自动化**：`NoteGroup#getParameter` + `Automation#add`；参数名大小写不敏感（`tension`/`loudness`/`breathiness`/`voicing`/`gender`/`vibratoEnv`/`pitchDelta`/`vocalMode_*`）。写前按**硬编码取值域 clamp**（不回包范围时如实标注）；回读**只用 `Automation#get(b)` 单点采样** —— `getPoints`/`getAllPoints`/`getLinear`/`getDefinition`/`remove(index)` 在**已知缺陷 `IX-001`（调用即冻桥）**上，一律不调。**默认 `dryRun`** |

### 维护（1）

| op | 说明 |
|---|---|
| `stop` | 让桥"自杀"（`{delayMs?}`）—— 桥常驻，改了桥源码**必须** `stop` 后在宿主里重新运行，否则跑的还是旧版 |

> 📌 **MCP 工具面（44 个）见 `knowledge/docs/MCP工具清单.md`**；本表只讲**通道 op**，两者不是一一对应。

### ⚠️ 写操作护栏

| 护栏 | 现状（2026-09-19 逐条核过桥源码） |
|---|---|
| `run_script` 必须含 `SV.getProject():newUndoRecord()` | ✅ **已实现**（缺则拒绝；`readonly:true` 跳过） |
| **指纹 / 守卫（防改错对象）** | **本版未实现** —— 桥里 `fingerprint` / `guardToken` / `STALE_SELECTION` **0 命中**；规格见下节（实现状态：⏳ 未实现） |
| **结果体量护栏（防淹没上下文）** | **本版未实现** —— 桥里 `maxChars` / 响应 `truncated` **0 命中**；规格见下节 |
| **共享组写保护** | **本版未实现** —— `referenceCount` / `allowAllReferences` 桥里 0 命中 |

> 📌 现状下的正确姿势：**写完必须重读**（`get_layout` / `get_melody_notes` / `get_selected_notes`）才算数，没重读就别对用户说"已经改好了"。

---

## 指纹 / 守卫 / 体量护栏（规格，2026-09-11 定）

> 起因：写操作目前只有"id 防重 + 参数类型校验 + 写前 undo"。
> 而 `transpose_selected_notes` / `set_selected_lyrics` / `fill_track_lyrics` / `sv_import_musicxml`（工具侧）
> 都是**按位置批量写** —— **用户手动改一笔，模型手里的旧计划就会错位**。
> 这层规格参照上游 `synthv-agent` 的"指纹 + guardToken + 重读不猜"做法（**摘要改写，不逐字照抄**）。

### 1. 指纹（fingerprint）：读操作产出，写操作必带

读操作（`get_selected_notes` / `get_current_group`）**额外返回**：

```jsonc
{
  "guard": "g-8f3a2b1c",          // 短 opaque token，代表"这份读回结果"
  "fingerprint": "…12位hex…",      // 规范化内容的短哈希
  "scope": "selection",            // selection | group
  "count": 8,                      // 参与指纹的音符数
  "groupUuid": "…"                 // 组身份
}
```

**指纹字段**（每个音符取这些，按 `index` 排序后规范化再哈希）：
`pitch` · `onsetQuarter` · `durationQuarter` · `endQuarter` · `lyrics`
（扩展位：`phonemes` · `attributes` · `pitchAutoMode` —— 需要更严时开启）

### 2. 写操作带上"我读到的是什么"

```jsonc
{ "op": "transpose_selected_notes",
  "args": { "semitones": -12, "expect": { "guard": "g-8f3a2b1c" } } }
```

桥端**写前重算指纹**并比对：

| 情况 | 桥的行为 | 客户端该做什么 |
|---|---|---|
| 一致 | 正常执行 | — |
| **不一致** | **不写**，返回 `ok:false, error:"STALE_SELECTION"`，`result:{ currentGuard, diff:[{index, field, was, now}] }` | **重读，不猜、不重试旧计划** |

### 3. 分级落地（避免一次性破坏现有调用）

| 模式 | 行为 |
|---|---|
| `off` | 不看 `expect`（现状）|
| **`warn`（默认起步）** | 不一致时**照常执行**，但响应里带 `staleWarning` + `diff` |
| `strict` | 不一致时**拒绝写**；没带 `expect` 也拒绝（要求先读）|

> 切换条件：`warn` 跑一段没有误报 → 再按工具逐个切 `strict`（先切**破坏性最强**的：转调 / 填词 / 导入）。

### 4. 结果体量护栏（上行方向）

响应超过 `maxChars`（默认 **20000**）时**不返回全量**，而是：

```jsonc
{ "ok": true, "truncated": true, "total": 379, "returned": 40,
  "hint": "用 groupIndex/索引区间分批读，或加 fields 收窄字段",
  "sample": [ … ] }
```

⇒ **带收窄指引地失败**，而不是把上下文淹掉。（已有**下行**载荷坑的记载，这是**上行**的对称护栏。）

### 5. 事务语义（澄清）

`newUndoRecord()` ＝ **一个撤销恢复边界，不是自动回滚**。
若桥返回 `undoRequired:true`（写中途失败、状态不明），**正确做法是让用户在 SV 里按 Undo，然后重读、重算计划、再重试**。

### 6. 共享组写保护（待实现）

`NoteGroup` 的内容**对所有 reference 都只有一份** ⇒ `referenceCount > 1` 时：
**内容写默认拒绝**；只有显式声明`allowAllReferences:true`、且给出吻合的`expectedReferenceCount`时才放行。
（`offset`、`mute` 这类`reference-local`字段不在此列。）

### 7. 排障与语义对照（照抄形态、不照抄内容）

| 症状 | 该怀疑什么 |
|---|---|
| 报 `STALE_SELECTION` | 用户改过音符 → **重读**；别把旧计划硬套 |
| 写成功但结果不对 | 是否**共享组**被别的 reference 覆盖；`referenceCount` 是多少 |
| 响应被截断 | 命中体量护栏 → 按 `hint` 分批读 |
| 超时后状态不明 | **先读回**；必要时请用户 Undo |

## 时序示例（文件通道）

```
Client（MCP / Electron）                          Bridge（宿主内常驻 Lua，轮询 300ms）
  │ ① 读 akdagent-hb-sv.json：心跳新鲜？ops 里有这个 op？   ← canServe() 判据
  │ ② 删掉旧的 akdagent-res-sv.json（防止读到上一轮的响应）
  │ ③ 原子写 akdagent-req-sv.json {v,seq,id:"fileipc-<seq>",op,args}
  │ 轮询 res（40ms/次，超时 10s）                        ──▶  读到 req → 解析
  │                                                         id 已在 done[]？→ 重发缓存响应 + consumeReq
  │                                                         否则 newUndoRecord() → dispatch(op,args)
  │ ◀───────────────────────────────────────────────────  写 res（.tmp → rename）
  │ res.id === 我发的 id ⇒ 命中（**按字符串比 id，不比 seq**）→ 返回给模型
  │                                                         consumeReq(快照)：内容没变才删 req
```

**读的时候顺手能拿到的排障三件套**（客户端超时错误里会带上；`fileipc.collectDiagnostics`）：

```
dir=<实际目录>            ← 两端目录不一致是头号故障
host=sv
heartbeatAge=11028s      ← 桥可能早就停了（>15s 即判不新鲜）
boot={"bridge":"0.3.25","hostVersion":"2.2.1","indexBase":1,…}
log尾部=…（akdagent-log-<host>.txt 最后 6 行）   ← boot 之外的运行期线索
```

## 边界情况处理

- **两端目录不一致**（**头号故障**）：客户端在 `%USERPROFILE%\AKDAgent\ipc` 有可写目录、桥却在 `%TEMP%`（或反之）⇒ 请求文件写了但桥永远读不到，表现为"一直超时、心跳却看不到"。**先比心跳里的 `dir`** —— 心跳文件在哪个目录，桥就在哪个目录。
- **桥未运行 / 宿主没开**：无心跳文件 ⇒ 客户端直接给"无心跳文件（桥未运行）"，不会白等 10 秒。
- **心跳过期**（>15s）：判"桥可能已停"，但**别据此断言宿主状态** —— 宿主只是把脚本停了/关窗口了都可能；`boot` 文件里有启动信息，`akdagent-log-<host>.txt` 有运行日志。
- **重复响应**：客户端发请求前**先删旧 res 文件**；桥**应答后消费 req 文件**（内容没变才删）⇒ 旧的"每拍重发响应"问题已消除（见「规则 2、3」）。
- **同一宿主开两个实例**：会互抢同一份 `akdagent-*-sv.json`（文件名里只有宿主，没有实例号）⇒ 同宿主只开一个。
- **SV1 与 SV2 同开**：**文件通道下不再互相抢答**（各自读自己的 `-sv` 文件）；但两者都会在**同名**文件上应答，所以"同宿主单实例"这条纪律仍然适用。
- **不许探测**：Lua 绑定的错误**穿透 `pcall`**（直接弹脚本错误框）⇒ 桥内不做任何探测（见「索引基准」第 3 条），模型侧也别拿"试一下"当查询手段。

> **载荷过大的坑（形态已变）**：剪贴板时代经 base64 + `powershell -EncodedCommand` 走命令行，有 ~32KB 上限；
> **现在载荷走文件** ⇒ 命令行上限不再是瓶颈，但**请求/响应仍不宜塞上千个展开后的音符**（桥端要 JSON 解析 + 逐音符建对象，且响应体量护栏还没实现）。
> 对策不变：**把"展开/生成"放到桥端做，只传短指令**（如和弦序列而非展开音符、模板而非成品织体）。
> 详见 `../sv-scripting/examples/载荷过大-ENAMETOOLONG.md`（历史实测数据仍可参考）。

## 能力边界：对用户怎么说（别误报）

> 📌 来源：上游 synthv-agent/SKILL.md（摘要改写）。

| 边界 | 事实 | 该怎么说 / 怎么做 |
|---|---|---|
| 一次只有一个请求在途 | 单文件通道、单请求串行（见上文「规则 3」）| 模型侧**不要并发下发**；串行是设计，不是卡 |
| 客户端超时是**模糊**的 | 10s 只代表"我们不等了"，**宿主可能还在把那次写做完**（见「规则 4」）| 先 `ping` / 重读目标确认状态，**别急着重发写请求**；确要重试就**用同一个 id**（桥按 id 防重，命中会重发缓存响应）|
| Retake 无法枚举 | **没有** retake 相关 op；Lua 侧 `RetakeList` 也只给数量 / 新建 / 激活 / 删除，**没有"列出全部 Take ID"** | 只提"默认 Take"或"我们刚生成并记下 ID 的那个"；不要承诺"切到你喜欢的那个 Take" |
| 桥不是全版本全声库验证过 | 支持 SV1 / SV2 / IX 三个宿主，各宿主能力有分叉，只在**实测过**的组合上验证过 | 碰到没验证过的宿主版本或冷门声库，**先小范围试一步再铺开**，别打包票 |
| 没有独立的事后验证层 | 写操作目前只保证"**可撤销 + 参数校验**"（指纹/守卫仍是规划，见上文规格）| **重读一遍**才算数；没重读就别对用户说"已经确认改好了" |

## 桥会话与缓存的重置（宿主重启 / 桥重跑）

> 📌 来源：上游 synthv-agent/SKILL.md（摘要改写；对应上游的会话变更错误码）。

- 桥是**宿主内的常驻脚本**：宿主一重启桥就没了；**桥源文件改了也必须在宿主里重新运行一次**才生效（当前会话跑的是加载时的旧版）。
- 桥重跑 ⇒ **id 防重表与响应缓存归零**（都在桥内存里，`ST.done` 有上限、超限按插入序淘汰）⇒ **同一个 id 再发一次不算重复，那一次会真的执行**。宿主重启后想"重发"旧请求之前，先确认目标的实际状态。
- 判断"还是不是同一个桥会话"：看 `ping` / 心跳（`akdagent-hb-<host>.json`）里的 `bridge` 版本、`dir`、`ops` 清单、`pollTicks` 是否连续 —— **别靠记忆**。
- 客户端侧同理：MCP 侧改了 `tools.ts` 必须重编译并重启 MCP 进程，否则工具面与实现对不上。

## 不抢用户焦点 / 不动用户状态（一等约束）

> 📌 来源：上游 synthv-agent/SKILL.md（摘要改写："无焦点操作"是其硬要求）。
> ⚠️ 上游那条能力来自**注入层**（无焦点点击），而**已裁定不做注入** ⇒ 这里只保留对我们成立的部分。

- **用户的选区、当前编辑组、播放头、视图滚动位置是共享状态**，而且是我们好几个工具的**输入**（`get_selected_notes`、`apply_lyrics` 的填词范围、`write_pit` 省略 `indices` 时的默认目标都读它）⇒ 除用户明确要求（播放 / 定位 / 选中）之外，**不要为了自己方便去改选中、切组、滚视图**。
- **读操作必须零副作用**：读一次不该让用户的选中没了。
- **报错也是打扰**：Lua 绑定的错误**穿透 `pcall`**（直接弹脚本错误框）⇒ 桥里不做探测（见「索引基准」第 3 条），模型侧同理 —— **别拿"试一下"当查询手段**。
- UI 类动作要回报宿主**执行后的实际状态**，不能把请求值原样当结果（目前只有 `playback`，返回 `{status}`）。
- **⛔ 语言（语种）也属于用户状态 —— 默认不动**（**这是 AKDAgent 的整体纪律，不限说唱 / 不限作词**）：
  语言链 = **音符属性 > 音符组属性 > 轨道属性 > 声库语言**（都没有 ⇒ 取声库录制语言）；**用户比我们清楚声库语种** ⇒
  不主动改音符 / 组 / 轨语言，**只有用户主动反馈"多语言混杂"时**才按词内语言自动设。
  ⚠️ 另有一条技术后果：**语种与声库不兼容 ⇒ 无音素 ⇒ 该组不渲染**（实测：英文声库 + 中文词 ⇒ 计算类接口全 `null`）
  ⇒ 读到全空时先查这条，别先怪"渲染没完成"。**正本见 `skills/akdagent-playbook/SKILL.md` 的 0.6b 节**（AKDAgent 整体语言纪律）。

## 轨克隆与非主 Vocal 组（规格，暂无对应 op）

> 📌 来源：上游 synthv-agent/SKILL.md（摘要改写）。
>  op 表里**没有** `clone_track`；但 `run_script` 里手写 `Track#clone()`（`references/06-track-misc.md` 的 `splitTrackAtPlayhead` 正是这么做的）会撞上同一个问题。

- 整轨克隆时，轨上若挂着**非主 vocal 的组**：把内容变独立了，**不等于**保住了那些组原本的 **Vocal 身份** —— 官方 API **没有**读回或核实身份的接口 ⇒ **必须请用户人工复核**（看组上挂着谁 / 听），别替它打包票。
- **绝不声称** API 能读出或命名那个 Vocal（连"当前歌手是谁"都读不到，见 `sv-scripting` 的不可做清单）。
- 想要的是**一条空壳轨、而它沿用主 Vocal 那套上下文**时，别去克隆整轨：走**建新组 + 挂 reference**更干净（ `create_harmony_group` / `write_chords` 就是这个做法）。
- 顺带：`NoteGroup` 的内容是**跨 reference 共享**的（见上文「共享组写保护」）—— 克隆出的轨与原轨指向同一份内容时，改一处会同时变两处。

## 详见
- `knowledge/docs/PROTOCOL.md` —— **协议规范原文**（与本技能同源，改协议**两处一起改**）
- `server/src/fileipc.ts` —— 客户端实现（目录解析 / `canServe` / 原子写 / 按 id 匹配 / 超时与诊断）
- `sv/lua/AKDAgentBridge.lua` —— 桥侧实现（`OPS.*` 32 个 op · `pollOnce` / `consumeReq` / `done[]` 去重 · 心跳字段）
- `skills/sv-project-format/SKILL.md` —— `.svp` / `.ixp` 工程文件格式与宿主差异（音符/组/自动化怎么写）
- 📦 原先的 `references/svp-format.md` **已删除**：`.svp` 工程结构 / 版本策略 / 音频轨注入 / 196 模板 → **`skills/sv-project-format/SKILL.md`**；声库 `nofs`/vocoder/中文名 → **`skills/sv-scripting/references/10-声库与声线.md` §5**
