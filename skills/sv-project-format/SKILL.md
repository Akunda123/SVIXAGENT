---
name: sv-project-format
description: AKDAgent 工程/项目文件结构参考：.svp（Synthesizer V）与 .ixp（Instrument X）的 JSON 结构、时间单位（blick）、音符/音符组/自动化/音频轨的存储格式、安全读写姿势。触发：需要读/解析/生成/编辑 SV 或 IX 工程文件、理解 ixp/svp 顶层结构、加音频轨、写 automation、单位换算等。
version: 1.0.0
---

# AKDAgent 工程文件结构（.svp / .ixp）

工控 SV/IX 工程文件的**格式知识**（JSON 明文、UTF-8）。读/解析/生成/编辑工程、加音频轨、写 automation 时参考。逆向自真实工程实测。

## 时间单位（核心）

| 单位 | 含义 |
|---|---|
| **blick** | SV/IX 内部时间单位。`SV.QUARTER = 705600000` blick = 1 四分音符 |
| 换算 | `blick = 拍数 × 705600000`；`1 拍 = 705600000 blick` |
| 音符/自动化时间 | 工程内所有 `onset`/`duration`/position 均为 **blick 整数** |
| tick 换算 | MIDI tick → blick：`blick = tick × (QUARTER / ppq)`（ppq=ticksPerBeat）|

## `.svp`（Synthesizer V 工程）结构

UTF-8 JSON；**汉字用 `\uXXXX` 转义**（读时需先解码）。

顶层字段**按版本不同（2026-09-13 三端实测对照）**：

| 版本 | 顶层字段 | 备注 |
|---|---|---|
| **SV1（`version: 153`）** | `version, time, library, tracks, renderConfig` | **无 `uuid`**、无 `projectMixer`、`time` 里**无 `startTimeSeconds`** |
| **SV2（`version: 196`）** | `+ uuid, projectMixer` | `renderConfig` 多 `bypassPan / bypassGain / bypassEffects` |
| **IX（`version: 201`）** | `+ uuid, projectMixer, loopBegin, loopEnd, loopEnabled` | `renderConfig` **无 `aspirationFormat`**（无气声概念） |

- ❌ **旧结论作废**：「SV1 没有 `library` 间接层」**已实测推翻** —— `library` **三端都有**（SV1 真实工程里就在顶层）。
- ⚠️ **SV1 的 `.svp` 尾部带一个 `\0`（NUL）字节**（`…"exportPitch": false}}\u0000`）⇒ 严格 `JSON.parse` 会报
  `Unexpected non-whitespace character after JSON`。**读 SV1 工程前先剥尾部空白/NUL**（`tools/project-digest.cjs` 已内置）。

## `.ixp`（Instrument X 工程）结构

```json
{
  "version": 201,
  "uuid": "...",
  "time": { "meter":[{"index":0,"numerator":4,"denominator":4}], "tempo":[{"position":0,"bpm":120}], "startTimeSeconds":0 },
  "library": [ /* 音符组库（含音符+automation） */ ],
  "tracks": [ /* 轨道（mainRef + groups 引用 library） */ ],
  "renderConfig": {...}, "projectMixer": {...}, "loopBegin": 0, "loopEnd": 0, "loopEnabled": false
}
```

### `library[]`（音符组库 —— 真正的音符容器）
```json
{
  "name": "音符组 1", "uuid": "...",
  "parameters": { /* 9 个固定 automation 键，见下 */ },
  "pitchControls": [],
  "notes": [ /* 音符数组 */ ],
  "musicalScale": { "type": "Major", "root": "C" }
}
```
- **automation 9 个固定键**：`pitchDelta, vibratoEnv, loudness, tension, breathiness, voicing, gender, toneShift, mouthOpening`。
- **音符**：
```json
{ "uuid":"<16hex>", "onset":<blick>, "duration":<blick>, "pitch":<midi>, "detune":0,
  "attributes":{ "dynamic":0.5, "muted":false, "articulations":["Staccato"], "articulationsFixed":true },
  "takes":{ "activeTakeId":0, "takes":[{"id":0,"seedPitch":0,"seedTimbre":0,"liked":false}] } }
```
- **音符级力度曲线** `dynamics`（cubic）：`{ "mode":"cubic", "points":[x,y,x,y,...] }`（音符内力度包络，x=相对 blick，y=偏移）。

### `tracks[]`（轨道）
```json
{
  "name": "未命名音轨", "dispColor":"ff489ce5", "dispOrder":0, "renderEnabled":false,
  "mixer": { "gainDecibel":0, "pan":0, "mute":false, "solo":false, "display":true },
  "mainGroup": { /* SV1：主组**内联**在此（就是装用户音符的容器，可读可写）；SV2/IX 不内联，见下 */ },
  "mainRef": {
    "uuid":"...", "groupID":"...", "blickAbsoluteBegin":0, "blickAbsoluteEnd":-1,
    "blickOffset":0, "pitchOffset":0, "mute":false,
    "isInstrumental":false,
    "database": { "name":"Orchestral Flute 1", "backendType":"W", "version":"100" },
    "voice":{}, "voicePresetName":"", "takes":{...}, "timestampLMR":0, "timestampLRSR":0
  },
  "groups": [ /* 引用 library 组的实例（groupID→library.uuid） */ ]
}
```
- **`tracks[].groups[].groupID` 引用 `library[].uuid`** —— library 是内容容器，track groups 是实例（含偏移）。
- ✅ **主组一律内联（三端实测一致，2026-09-13）**：`tracks[].mainGroup`（组定义）+ `tracks[].mainRef`（组引用）
  在 **SV1 / SV2 / IX 全都有**；**非主组**的实例才放在 `tracks[].groups[]`。
  ⇒ 要枚举"这条轨上所有组"，必须**两者都看**（`mainRef` + `groups[]`）。
  ⚠️ **更正**：本技能上一版写"SV2/IX 不内联、走 `groups[]`" —— **已作废**，那是我只看了 `groups[]` 就下的结论。
- 📌 「主组不可加音符」是 **SV2 的宿主限制**，**不是 SV1 的** —— **SV1 的 `mainGroup` 就是用户音符所在的容器，可读可写**。

### 字段级版本差异：**三端逐字段对照（SV1 / SV2 / IX）**（2026-09-14 · 由 `tools/diff-project-3ends.cjs` 自动产出）

> **方法**：取三端**真实工程**递归遍历 → **数组下标归一** → 把 `library[].notes[]` 与 `tracks[].mainGroup.notes[]`、
> `groups[]` 与 `mainRef` 等**归成同一"类"**（音符 / 组定义 / 组引用 / voice / mixer / 组参数 / pitchControls / 时间轴 / renderConfig / 顶层）→ 取差集。
> **键总数 115 · 三端都有 52。** 重跑：`node tools/diff-project-3ends.cjs`（`--table` 打全量矩阵，`--json` 落盘 `tools/_diff-3ends.json`）
> - ⚠️ 千万别只比"路径字符串"—— 那样 `mainGroup.notes.*` 与 `library[].notes.*` 会被当成两组，产生一堆假差异（第一版就踩了）。
> - ⚠️ 也别只比"某端有没有" —— 三端要一起看：老版本"SV2 独有 26 条"里混着一堆 **IX 也有**的键，真实 SV2 独有只有 3 条。
> - 样本：SV1/SV2 用各自测试工程；**IX 用 `ixp测试.ixp`（2026-09-14 新存，含技法 / mic / loop 真实值）**。
>   旧的 IX 样本是 recovery 快照、字段大量为空，不利于判"是否见过有效值"。

#### ① 只在 **SV1** 出现（18 条）

| 类 | 键 | 实测样本 / 说明 |
|---|---|---|
| 音符 | `instantMode` | `false` |
| 音符 | `systemAttributes` | `{evenSyllableDuration}` —— **"系统默认值层"**，与用户写的 `attributes` **分开存**（语义未确认） |
| 音符 | `pitchTakes` / `timbreTakes` | `{activeTakeId:0, takes:[{id,expr,liked}]}` —— **SV1 的 take 记法**（带 `expr`） |
| 组引用 | `systemPitchDelta` | `{mode:"cubic", points:[]}`（SV1 独有） |
| 组引用 | `pitchTakes` / `timbreTakes` | 同上（组引用级也各有一套） |
| voice | **9+1 个音高参数**：`tF0Left 0.325` `tF0Right 0.325` `dF0Left 3.36` `dF0Right 3.57` `tF0VbrStart 0.58` `tF0VbrLeft 0.35` `tF0VbrRight 0.32` `dF0Vbr 1.54` `dF0VbrMod 1.46` `fF0Vbr 8.77` | **SV1 的组级默认音高参数**；SV2/IX 的 voice 里**都没有**这些 |
| voice | **`improviseAttackRelease`** | `"true"`（**字符串**）—— SV2/IX 无此键 |

#### ② 只在 **SV2** 出现（3 条）

| 类 | 键 | 实测样本 / 说明 |
|---|---|---|
| voice | `choirSeatingSeparation 0.6999…` · `consonantStrength 0.22` · `consonantDuration 0.455` | 合唱声部间距 / 辅音强度·时长 —— **真·SV2 独有**（注意 `choirNumStems` 是 **SV2+IX 都有**，不在此列） |

#### ③ 只在 **IX** 出现（4 条）

| 类 | 键 | 实测样本 / 说明 |
|---|---|---|
| 音符 | **`dynamics`** | `{mode:"linear"\|"cubic", points:[x,y,…]}` —— **音符级力度包络**（x=音符内相对 blick，0…note.duration；**y=相对 `attributes.dynamic` 的偏移，且 `y ∈ [−dynamic, 1−dynamic]`** ⇒ 绝对力度 = `dynamic + y` ∈ [0,1]；2026-09-21 · 408 条真实曲线核对）。⚠️ **宿主载入时会把 `cubic` 归一成 `linear`**（同日实测：写 cubic → 重载后 recovery 即 linear、**Ctrl+S 后文件也是 linear**）⇒ **文件路线写曲线用 `linear`**（cubic 只在"画完就存、不经重载"时保留）。SV1/SV2 无此键。**工具**：`node tools/ixp-dynamics.cjs`（校验 / 文件路线写入，默认 linear） |
| mixer | **`micParams`** | `{instrumentMics:{mics:[{key,value:{gain,pan}}],mute,solo,link}, room:{name, micArrays:[{key, value:{mics[],mute,solo,link}}]}}` —— **录音室话筒阵列**（IX 独有概念） |
| mixer | **`micPresetName`** | `""` |
| voice | **`performanceDirection`** | `"allegro"` / `"default"` —— 演奏指示 |

#### ④ **IX 缺失**（SV1/SV2 有、IX 没有）（15 条）—— 移植 / 写 IX 时当心

| 类 | 键 | 说明 |
|---|---|---|
| 音符 | `lyrics` `phonemes` `accent` `musicalType` | 唱词 / 音素 / 重音 / `"singing"` —— **IX 是乐器，没有唱词概念** |
| 组定义 | `vocalModes` | `{Kawaii,Soft,Rock,Adult,Piano_Ballade}` |
| 组引用 | `dictionary` | 发音词典（人声概念） |
| voice | `paramTension` `paramGender` `paramToneShift` | 组级嗓音参数 |
| voice | `renderMode` `relaxedPronunciation` `vocalModeInherited` `vocalModePreset` `vocalModeParams` | 渲染模式 / 唱法 —— **IX 无"唱法"概念** |
| renderConfig | `aspirationFormat` | 气声格式（IX 无气声概念） |

#### ⑤ **SV1 缺失**（SV2/IX 都有）（23 条）—— 老文档"只在 SV2 出现 26 条"扣除 ② 的 3 条真·SV2 独有

时间轴 `startTimeSeconds` · 组参数 `mouthOpening`（⇒ SV2/IX 是 9 通道，SV1 是 8） · 组定义 `pitchControls`（SV1 不支持音高线）/
`musicalScale` · 音符 `uuid` / `takes`（取代 SV1 的 `pitchTakes`+`timbreTakes`） · `pitchControls` 的 `pos/pitch/id/type/points` ·
mixer `fxPresetName` / `fxParams{room,postRoomEq,compressor,reverb}`（**轨道 FX 链存在文件里，API 未暴露**） ·
组引用 `uuid` / `mute` / `voicePresetName` / `takes` / `timestampLMR` / `timestampLRSR` · voice `choirNumStems` ·
renderConfig `bypassPan` / `bypassGain` / `bypassEffects`

#### ⑥ 三端都有、但**从无非默认样本**（语义未见）

- **`组引用.pitchOffset`**（实测**恒 0**）⇒ ⚠️ "pitchOffset 非零时会不会改变显示音高"**至今没有样本**；
  此前我在画图可见性里按"可能非零"处理，那是**保守假设，不是实测**（待你造一个非零样本即可定论）。
- `renderConfig.exportPitch`（恒 `false`）。

#### ⑦ 三端都有、但**写法不同**（关键差异不在"有没有"，而在"怎么存"）

| 项 | SV1 | SV2 | IX |
|---|---|---|---|
| **take 记法** | `pitchTakes` + `timbreTakes`，每项 `{id, expr, liked}` | 单个 `takes`，每项 `{id, seedDuration, seedPitch, seedTimbre, liked}` | 同 SV2（`takes` + `seedPitch/seedTimbre`，实测 `activeTakeId` 可为 3） |
| **音符级音高参数** | 音符 **`attributes`**（`tF0Left/dF0Left/tF0Vbr*/pF0Vbr/fF0Vbr/dF0Jitter/tNoteOffset/dur/strength/…`） | 音符 **`scriptData`**（如 `{dF0Left:2, tF0Offset:-0.035}`）；`attributes` 里另放 `phonemes[] / expValueX / expValueY / rTone / rIntonation` | **既在 `attributes` 里**（实测 `dF0VbrMod/cTimeDispersion/cPitchDispersion/fF0VbrMod` + `articulations`/`articulationsFixed`/`dynamic`/`muted`），**也有 IX 独有的 `dynamics`** |
| **`vocalModeParams` 值** | **纯数字** `{"Soft":105}` | **三轴对象** `{"Soft":{pitch,timbre,pronunciation}}` | **无**（无唱法） |
| **组级默认音高参数** | 在 `voice` 里（上述 9+1 个） | **没有**（音高参数只在音符级） | **没有** |
| **组引用还带** | `database{name,language,phoneset,languageOverride,phonesetOverride,backendType,version}`（**声库履历**）+ `dictionary` | `voicePresetName` + `timestampLMR/LRSR`（**无 `dictionary`**） | `database{name,backendType:"W",version:"100"}`（**乐器**履历，如 `Orchestral Piccolo 1`）+ `takes` + `timestampLMR/LRSR`（无 `dictionary`） |

### IX 的组级 automation：**哪几条真的影响渲染**（2026-09-14 实测，用户听感判据）

> 背景：IX 的 nofs / ixp 里 9 条 automation 通道**文件字段、API 都有**，写进去也能读回来、能保存 ——
> 但"存得下"不等于"渲染时算数"。下面是用户逐条试听的结果。

| 通道 | 是否影响渲染 | 备注 |
|---|---|---|
| **`pitchDelta`** | ✅ **有效** | ±1200 cent 肉眼/耳朵都明显；可当**阳性对照**用 |
| **`toneShift`** | ✅ **有效** | ±800 |
| `voicing` | ❌ 无效 | ⚠️ 第一轮曾误判为"有效"，原因是**相邻音符的 pitchDelta 串音**（见下"方法"第 2、5 条） |
| `gender` | ❌ 无效 | ±1 中点突变也听不出 |
| `mouthOpening` | ❌ 无效 | 范围未确认（±1 为推测）；**只在一件乐器上测过**，管乐是否有效待复测 |
| `tension` | ❌ 无效 | −1 → +1 中点突变，无变化（2026-09-14 单测） |
| `loudness` / `vibratoEnv` / `breathiness` | 未测 | 本轮未覆盖 |

**写 IX 工程/脚本时的实际含义**：想改 IX 的音高偏移用 `pitchDelta`；想改音区/音色用 `toneShift`；
其余人声味的参数（voicing / gender / tension / breathiness / mouthOpening）**别指望它们产生听感变化**（至少在测试过的这件乐器上）。

#### 判据本身怎么立（这套方法可复用到任何"参数到底有没有用"的问题）

1. **同一条轨放对照句与实验句** —— 乐器、mixer、轨道 FX 全一致，唯一变量就是那条曲线。
2. **音符之间留空隙**（如音符 4 拍 + 空隙 1 拍）—— 相邻音符贴在一起会串味：上一个音符结尾的突变会滑进下一个，
   legato 也会糊在一起。**不隔离就会把邻音的变化算到当前参数头上**（第一轮 `voicing` 误判就是这么来的）。
3. **在同一个音符内"前半段极端小 → 中点瞬间跳到极端大"** —— 比"两句对比"和"线性扫"都敏感；
   渐变容易被颤音/滑音掩盖，突变不会。
4. **必须有阳性对照**：先放一条**已知有效**的参数（`pitchDelta`）。对照没跳 ⇒ 装置本身有问题，别急着判"参数无效"。
5. **隔离自检**（每条参数四项都读回核对，`Automation.get(b)` 是**安全读法**）：
   前半段 = min · 后半段 = max · **空隙 = 默认** · **下一音符 = 默认**。少检"空隙"那一项，就会重犯第一轮的误判。
6. 复现脚本：`node sv/lua/test-ix-hidden-params.cjs ix [--beats=4] [--gap=1] [--clean]`（自带清理与自检；可重复运行）。

#### 两个会让结论直接错的坑

- **automation 首点之前的区段按首点的值外推**：只在第 8 拍写 `mouthOpening=1`，在第 0 拍读回**也是 1**
  ⇒ 后面音符的参数会**倒着污染**前面音符。必须在自己音符开始前先打一个"默认值"点。
- **读 automation 点：宿主内**直接调**就行**（IX ≥ **1.0.1**）—— `getAllPoints()`（0 参）/ `getPoints(start, end)`（**2 参**）/ `getLinear(blick)`（**1 参**）/ `get(blick)`；返回**普通嵌套数字数组** `{{位置,值},…}`，**可原样序列化**（实测 319ms）。⚠️ **参数个数写错只抛 `InvocationError`**（消息写明「预期 N 个」）。⚠️ **IX 1.0.0 上这些调用会冻住宿主**（弹框挡 Lua 线程）⇒ **靠版本检测兜**：桥报 `hostOutdated` 时**先让用户升级宿主**。想读**没保存**的工程、或批量分析，仍可走磁盘 `.ixp`/`.svp`（那条路一直可用）。

#### IX 的 API ↔ UI 能力对照（实测）

| 项 | UI 里能不能画 | 写进去算不算数（渲染） | 说明 |
|---|---|---|---|
| `loudness` · `vibratoEnv` · `breathiness` | ✅ **原生可画** | 原生参数（UI 直接可调） | 这三条在 IX 界面里就有参数道 |
| `pitchDelta` · `toneShift` | ❌ UI 不暴露 | ✅ **实测有效** | **只能通过 API 画**，但渲染认它 |
| `voicing` · `gender` · `tension` · `mouthOpening` | ❌ | ❌ 实测无效 | API 能写能读，渲染不认 |
| 音符级 **`dynamics`** | — | ✅ **算**（影响渲染） | ⚠️ **API 不能直接设、也读不到**（2026-09-14 三条路全试完；**2026-09-21 在 IX 1.0.1 上复检：又试 5 种键名/形状仍全被静默忽略，且 `getAttributes()` 三路径都读不到曲线**）：① `setAttributes({dynamics=…})` **静默忽略**（扁平/数组套数组/带不带 mode/mode 大小写/裸数组/顶层 `dynamicCurve` 共 8 种形状，回读与文件都无该键）；② `setAttributes({dynamic=<表>})` 该键**认但只收数字**（表被强转成 0）；③ `setScriptData("dynamics", {…})` **确实落盘**，但只是脚本私有数据，宿主**不当包络用**。⇒ ⛔ `Note#clone()` **虽然会连包络一起复制**，但把 `attributes`（含 `articulations`/`muted`）/`takes`/`scriptData`/`detune` **等无关字段也照搬**（脏模板克隆两次 ⇒ 副本一律带 `muted=true`、`scriptDataKeys=[akdagentDirty]`）⇒ **用户 2026-09-21 裁定「不复制」**，改为**等官方 API 更新**或**写 `.ixp`**（**工具**：`node tools/ixp-dynamics.cjs --write --file … --pitch … --base … --points "t:绝对值,…" --apply`；**外科式插入**、自动 `.bak`、写后自检） |
| 音符级 **`dynamic`**（标量 0~1） | ✅ UI 可调 | ✅ 算 | **API 可写**：`note:setDynamic(v)` ✔（`getDynamic()`/`getAttributes().dynamic` 可读回；`setAttributes({dynamic=v})` 同样生效）。实测保存后文件里是 `"dynamic": 1` |
| **`scriptData`**（note / group / project 级） | — | — | ✅ **可用且持久化**（2026-09-14 实测）：`setScriptData(k, v)` 支持表/字符串/数字，**会写进 `.ixp`**（音符顶层出现 `scriptData` 键）。⚠️ 宿主**不解释**其中内容（`scriptData.dynamics` 不会被当成包络）⇒ 适合挂**自定义元数据** |
| **`pitchControls`（音高线）** | ✅ | ✅ | IX 1.0.0 上 `addPitchControl`/`getPitchControl`/`getNumPitchControls`/`removePitchControl` 逐个判过都在；2026-09-14 实测画成 **28 条曲线 / 165 点、图案完整**（详见 `sv-pit-art` 技能） |

#### `getAutomation` vs `getParameter`（2026-09-14 实测：**是别名，零差别**）

| | `NoteGroup:getAutomation(type)` | `NoteGroup:getParameter(type)` |
|---|---|---|
| 存在 | ✅ | ✅（**官方文档里写的是这个**） |
| 返回 | table（Automation 视图，带 `getType`/`getInterpolationMethod`/`get`/`add`/`getScriptData`…） | 同上（同样字段） |
| 大小写 | **不敏感**：`loudness` / `Loudness` / `LOUDNESS` 都能拿到，`getType()` 回规范小写名 | 同 |
| 是否同一个底层曲线 | ✅ **实测证明**：用 A 写 `add(0, -3.25)` 后，**从 B 读 `get(0)` 也是 −3.25** | 同 |
| 哪些对象上有 | **只有 `NoteGroup`**（`Note` / `NoteGroupReference` / `Project` 上**两者都没有**） | 同 |
| 危险方法 | `getPoints` / `getAllPoints` / `getLinear` / `getDefinition` 在返回对象上都存在 ⇒ **都别调**（闪退宿主） | 同 |

⇒ **随便选一个用即可**；文档只写了 `getParameter`，但 `getAutomation` 一样能用（IX 上实测）。

#### `scriptData`：往音符 / 组 / 工程上挂自定义数据（**可用且持久化**）

`Note` / `NoteGroup` / `NoteGroupReference` / `Project` 都有 `getScriptData(k)` / `setScriptData(k,v)` / `getScriptDataKeys()`。
实测：值支持**表 / 字符串 / 数字**，且**会写进 `.ixp`** —— 音符顶层会多出一个 `scriptData` 键。

```lua
-- 写：值可以是表、字符串或数字
note:setScriptData("akdagent", { by = "AKDAgent", why = "harmony" })
-- 读
local v = note:getScriptData("akdagent")   -- 表原样返回
local ks = note:getScriptDataKeys()       -- ⚠️ 是**数组**（键名在 value 里）
for i, k in ipairs(ks) do local val = note:getScriptData(k) end
```

⚠️ 边界与坑：
- **`getScriptDataKeys()` 返回数组**，`pairs` 出来的是下标 `1..n`（我第一次就把它当日志打了，结果只看到 `1,2,3…`）⇒ 用 `ipairs`。
- 宿主**不解释**其内容：塞 `{dynamics = {…}}` 进去**不会**变成力度包络（实测，音符顶层依旧没有 `dynamics`）——它是**给脚本自用的元数据**。
- 会随工程一起保存 ⇒ 别存大块数据；适合当**标记/指纹**（"这条是 Agent 写的""这个组的用途""产物哈希"），事后可用文件核对。


- **`Track:clone()` 会共享** —— clone 出的轨与原轨**共享**（组引用指向同一批组对象）⇒ **改副本会污染原轨**。
  所以"复制轨之后要独立改参数"必须**另建独立组**，再把复制轨里的引用改指过去（`setTarget` 的限制见下）。
- **`NoteGroupReference:setTarget()` 只能在"目标未确定"时 set**（官方 API 文档有写）：已有目标的引用**改不动**（实测静默失败）。
  ⇒ 换目标要**删旧引用 + 新建引用**（`removeGroupReference(i)` + `SV:create("NoteGroupReference")` + `setTarget` + `addGroupReference`）。
- **`isInstrumental` = "音频轨"**（SV 的命名残留，IX 里同义）—— 不是"是不是乐器"。
- **`loopBegin/loopEnd/loopEnabled` 由 `PlaybackControl.loop(tBegin, tEnd)` 控制**（API 在 **PlaybackControl** 上，不在 Project 上；
  这也解释了为什么在 `Project` 上探不到 `getLoop*`）。

### `.ixp` 字段 ↔ API 实测对照（IX 1.0.0 · 2026-09-14 · 桥在线实测，样本 `ixp测试.ixp`）

| 文件字段 | API | 实测（该工程 track 0） |
|---|---|---|
| `groups[].blickOffset` | `ref:getTimeOffset()` | 11.6400 拍 = `8213191659` ✅ **完全一致** |
| `groups[].blickAbsoluteBegin` | `ref:getOnset()` | 10.0900 拍 = `7119511659` ✅ |
| `groups[].blickAbsoluteEnd` | `ref:getEnd()` | 45.7400 拍 = `32274151659` ✅ |
| （派生） | `ref:getDuration()` | `getEnd()-getOnset()` = `25154640000` ✅ 与文档一致 |
| `groups[].pitchOffset` | `ref:getPitchOffset()` | `0` ✅ |
| `groups[].isInstrumental` | `ref:isInstrumental()` | `false` ✅ |
| `groups[].groupID` ↔ `library[].uuid` | `ref:getTarget():getName()` | `2e84f293…` ↔ 「音符组 1」一一对应 ✅ |
| `notes[].onset` / `duration` / `pitch` | `note:getOnset()` / `getDuration()` / `getPitch()` | **组内局部坐标、可为负**（n0 = −0.9 拍），API **原样返回**，不自动加偏移 |
| `notes[].attributes.*` | `note:getAttributes()` | 键**完全一致**（`dynamic/muted/articulations/articulationsFixed` + 音高类 `dF0VbrMod` 等） |
| `notes[].dynamics`（IX 独有） | ❌ **无**（`getDynamics` 不存在） | 只能读文件 |
| `notes[].takes` | ❌ **无**（`getTakes` 不存在） | 只能读文件 |
| `mixer.micParams` / `micPresetName` | ❌ **无** | 只能读文件 |
| `uuid` · `loopBegin/loopEnd/loopEnabled` · `projectMixer` · `renderConfig` | ❌ **无**（`getUUID`/`getUUIDString`/`getLoop*`/`getProjectMixer`/`getRenderConfig`/`getMicParams` 逐个探过，全不存在） | 工程级 ixp 独有字段**只能读文件** |
| `mainRef.database` | ❌ **无**（`ref:getDatabase` 不存在） | 乐器库信息只能读文件 |

- ⚠️ **文档与实测有出入（重要）**：官方文档写 `getOnset()` = "目标组**第一个音符的 onset + time offset**"。本样本**不成立**：
  首音符 −0.9 拍 + 偏移 11.64 拍 = 10.74 拍，而 `getOnset()` 返回 **10.09 拍**（= 文件 `blickAbsoluteBegin`）。
  ⇒ **`blickAbsoluteBegin/End` 是独立存储的"入点/出点"，编排视图里可以单独拖，绝不能用音符推算**；
  反过来，**把组内音符换算到工程绝对时间要加 `blickOffset`（= `getTimeOffset()`），不是 `absBegin`**。
- ✅ 顺带结掉一条老待办：**文件字段 ↔ API 的对应关系在 IX 上已实测钉死**（`blickOffset↔getTimeOffset`、`absBegin↔getOnset`、`absEnd↔getEnd`）。

**IX 的 `getVoice()` 实测键**（⚠️ **修正旧结论"IX 的 `voice` 恒为空字典"** —— 那是 recovery 空快照给的印象）：

| 情况 | API 返回的键 |
|---|---|
| 未改过组级参数 | `performanceDirection`（`"default"`）+ **`singers`（数字）** |
| 改过 | 再加 `paramLoudness` / `paramBreathiness` |

- **两侧不是同一套键，别对着抄**：文件 `voice` 实测是 `paramLoudness, paramBreathiness, transposeCents, transposeSemitones, performanceDirection, choirNumStems`；
  API 侧多出 **`singers`**（数值，本样本 1 / 4）、**读不到** `transposeSemitones/Cents` 与 `choirNumStems`。

**歌词在 IX：✅ 已定论 —— API 能写能读，但「保存」不会落到 `.ixp` 里**（2026-09-14 实测，三次证据齐）：

| 步骤 | 证据 |
|---|---|
| ① 文件基线 | `ixp测试.ixp` 20017 字符里 `lyrics` 出现 **0** 次；全文件 127 个键里没有 `lyrics/phonemes/accent/musicalType` |
| ② 用桥写词 | `note:setLyrics("zq1".."zq4")`（4 个音符）→ 立刻回读 = `zq1,zq2,zq3,zq4` ✅ **API 侧写读都正常** |
| ③ 用户 `Ctrl+S` 后 | 文件 mtime 刷新（21:37:58）、体积 20017 → **22101**、`library` 组数 2 → **4**、track0 引用 3 → **5** —— **结构改动都存下来了**，但 `lyrics`/`zq1~zq4` 计数仍是 **0** |

⇒ **IX 的歌词是"运行时概念"**：可以 `setLyrics` 写、`getLyrics` 读（宿主内存里有效），**保存时被丢弃**。
推论：**重开工程后歌词必然为空**（此前样本里 API 能读到 `"la"`，正是"谁在内存里写过、但从没落盘"的残留）。
写 IX 工程文件时**不要指望 `lyrics`**；要跨会话保留的演奏信息，只能落在**会持久化的字段**里（`attributes.articulations` / `dynamic` / 音符 `dynamics` 曲线等）。

## 时间轴：速度标 vs 拍号标（⚠️ 术语陷阱）

| | 文件里（`.svp`/`.ixp`） | API 侧 |
|---|---|---|
| **速度标** | `time.tempo[] = { "position": <**blick**>, "bpm": 120 }` | `addTempoMark(b, bpm)`（b 单位 blick）· `getTempoMarkAt(b)` → `{position(blick), positionSeconds, bpm}` |
| **拍号标** | `time.meter[] = { "index": <**小节号**>, "numerator": 5, "denominator": 4 }` | `addMeasureMark(**measure 小节号**, nomin, denom)` · `getMeasureMarkAt(n)` → `{ **position = 小节号**, positionBlick, numerator, denominator }` |

- ⛔ **同一个词 `position` 在两处含义不同**：文件的**速度标**里 `position` = **blick**；API 的**小节标对象**里 `position` = **小节号**。
  写文件时把两者混用 ⇒ 拍号错位到别的小节。
- **文件里没有 `positionBlick`**（由小节号推算）；**小节号起点 = 0**（实测首个标 `{"index":0,"numerator":4,"denominator":4}`）。
- **实测样本（SV1，2026-09-13）**：`meter = [{index:0,4/4}, {index:10,5/4}]` = **第 10 小节起变 5/4**；
  `tempo = [{position:0,bpm:120}, {position:21873600000,bpm:1000}]`（= 第 31 拍起 1000 BPM）。
- 换算参考：`TimeAxis.getMeasureAt(blick)` 得小节号 · `getMeasureMarkAtBlick(blick)` 得"该处生效的拍号"。

## 音频轨结构（关键 —— isInstrumental）

音频轨 = **`isInstrumental: true` 的 track**，与 SVP 结构相同。**在其 `mainRef` 里引用外部 WAV**：
```json
"mainRef": {
  "isInstrumental": true,
  "audio": {
    "filename": "../Downloads/xxx.wav",   // 外部 wav 路径（相对工程目录）
    "duration": 85.36,                    // 音频时长（秒）
    "bpm": 120,                           // 检测 BPM
    "alternativeBPMs": [120, 150, 75],    // BPM 候选（歧义时）
    "beatLocations": [0.39, 1.35, ...]    // 逐拍时间戳（秒）
  },
  "database": { "name":"", "backendType":"", "version":"-2" },  // 音频轨 database 空
  "groups": []    // 音频轨无音符组
}
```
- **音频轨 `groups` 为空**（无音符组）；`database` 空（backendType `""`，version `"-2"`）。
- **`filename` 是相对路径**（相对 .ixp 所在目录，如 `../Downloads/xxx.wav`），或绝对/同目录名。
- **`beatLocations`** 是逐拍秒数数组（对齐用小节/拍），**`bpm`/`alternativeBPMs`** 检测结果（歧义时列出候选）。
- 加音频轨：给 track 设 `mainRef.isInstrumental=true` + `audio` 引用 wav + `groups:[]`；乐器官固定为音频轨格式。

> ⚠️ **加音频轨的两条硬教训（2026-09-17 真机踩过，别再犯）**
>
> 1. **轨道骨架必须照「同一宿主、同一版本」的文件抄，不要自己拼、也不要跨宿主抄**：
>    实测把 `buhua_audio_track.**ixp**`（IX）的音频轨骨架照搬到 **SV1** 的 `.svp` ⇒ SV1 打开直接弹框
>    **「期待 NoteGroup 对象，然而获得了：null」**。原因是两边**同名键的取值不同**：IX 音频轨的 `mainGroup` 是 `null`，
>    而 **SV1 的 `mainGroup` 必须是真实 NoteGroup 对象**；`mainRef` 的键集也不同
>    （IX 有 `uuid/mute/voicePresetName/takes/timestampLMR…`，SV1 用 `groupID/pitchOffset/systemPitchDelta/voice/pitchTakes…`）。
>    ⇒ **正确姿势：拿本工程里已有的 track 整体 clone，再改 `name/dispOrder/mainGroup.notes=[]/isInstrumental/audio`。**
> 2. **新建音频轨的 `mainRef.groupID` 要与它 `mainGroup.uuid` 一致**（新生成一个 uuid，两处同时写），
>    否则组引用悬空。实测一致的写法：SV1 加载正常，工程时长随音频时长扩张（536 拍 ↔ 268 s，`blickAbsoluteBegin=0`）。

### 音频轨位置约定（统一用 **onset**，不用 **offset**）

> 🔴 **2026-09-17 真机修正（SV2 2.2.1 实测通过；本节旧说法以这里为准）** —— **移动音频轨 = `onset` 与 `timeOffset` 成对同向位移，`duration` 不动**：
>
> ```lua
> -- 整体右移 S（S = 位移量，如一小节 = 4 拍 = 2822400000 blick @150BPM）
> ref:setTimeRange(ref:getOnset() + S, ref:getDuration())   -- 窗口整体平移（长度不变）
> ref:setTimeOffset(ref:getTimeOffset() + S)                -- 内容同步平移
> ```
>
> **判据（用户手拖的权威结果，三项须完全一致）**：`onset = timeOffset = S`、`duration = 音频原长`。
> 例：`onset=2822400000, timeOffset=2822400000, duration=395136040000`（= +4 拍 / 224.0 s）。
>
> | 做法 | 后果（都实测到过） |
> |---|---|
> | 只挪窗口起点 `setTimeRange(onset>0, 原长)` | **切头**（内容锚在原位、窗口右移 ⇒ 前几秒被裁，实测切掉 0.988 s） |
> | 只挪内容 `setTimeOffset(S)`、`onset` 不动 | **切尾**（窗口末端没跟着走） |
> | `setTimeOffset(S)` + `duration += S`（onset 不动） | **不切但错**：窗口比音频长 S ⇒ **尾部多出 S 的空白**、onset/offset 语义错位（我 2026-09-17 试出的错解，别抄） |
> | **`onset += S` 且 `timeOffset += S`，`duration` 不动** | ✅ **规范解**：两端严丝合缝（= 用户手拖的结果，回读逐字段一致） |
>
> - **脚本 API 只有 `getTimeOffset()` / `setTimeOffset()`；没有 `getBlickOffset()`**（实测 `nil value (method 'getBlickOffset')`）。
>   `blickOffset` 只是**文件里的字段名**，别在脚本里找它。
> - **"音频实际落在哪" = `getOnset()`（窗口起点）+ `getTimeOffset()`（内容位移）**，只看 `getOnset()` 会误判。
> - 改完**一律回读三项**（onset / duration / timeOffset）—— 今晚靠这条抓出 3 次"假成功"。

**位置一律用绝对起点 `blickAbsoluteBegin`（= 音频轨的 onset）表达；`blickOffset` 恒为 0。** 这是 SV/IX 的推荐约定，杜绝"位移叠加"引起的位置混乱。

- **磁盘字段**：`mainRef.blickAbsoluteBegin` = 音频起点 blick（onset）；`mainRef.blickOffset: 0`。
- **调用端**：桥里用 **`ref.setTimeRange(absoluteOnset, duration)`** 设绝对 onset（不动 offset）；读取位置用 `ref.getOnset()`（= 绝对起点）。
- **不要用 `setTimeOffset()` 移动音频轨**——它改的是 offset 字段，叠加在 onset 上，后续难核算。若宿主不支持 `setTimeRange`（<2.1.0），才退回 `setTimeOffset`（兼容模式）。
- **API 佐证**：`NoteGroupReference` **没有 `setOnset()`**；设绝对起点只能 `setTimeRange(onset,duration)`。`getOnset()` 返回绝对起点（第一个音符 onset + offset；音频轨 = 音频起点 + offset，offset 为 0 时即纯起点）。
- **换算**：120 BPM、4/4 下，起点 blick = 小节号换算：第 N 小节起点 = (N-1)×4×705600000。音频内容第 T 秒处的绝对 blick = blickAbsoluteBegin + `timeAxis.getBlickFromSeconds(T)`。
- **运行期语义**：`sv_align_audio` 已改为按绝对 onset 对齐（`absoluteOnset = 锚点blick − firstBeatBlick`），返回 `absoluteOnsetBlicks`，offset 恒 0。

## Automation 点存储（⚡ 扁平交替数组）

`.ixp`/`.svp` 里每个 automation 的 `points` 是**扁平交替数组** `[x0,y0, x1,y1, x2,y2, ...]`（**不是 `[{x,y}]` 对象数组**）：
```json
"loudness": { "mode":"linear", "points":[1191153048, 0, 1202178048, -34.13, ...] }
```
- `x` = blick 时间；`y` = 参数值（loudness 单位 dB、breathiness 为粗粝度、vibratoEnv 0~2）。
- **不能用 `Object.keys(point)` 读点**（返回 `[]`，点是裸数字非对象），必须 `i%2` 交替取值。
- 首尾常有锚点（回默认值）。

## 安全读写姿势（重要，避免闪退）

- **读工程：解析磁盘 `.ixp`/`.svp` JSON**（Node/UTF-8 直读 + `JSON.parse`）—— 这是读**未保存**工程/批量分析的正路；**宿主内**读当前工程的 automation 点则直接调 `getAllPoints()` / `getPoints(start, end)`（IX ≥1.0.1；参数个数见上文，写错只抛错）。⚠️ **IX 1.0.0 上宿主内读点会冻桥** ⇒ 桥报 `hostOutdated` 时先让用户升级宿主。
- **写 automation**：桥内安全 `add(x, value)` + `get(x)`；写音符 `setLyrics/setPitch` 先新建 `newUndoRecord()`。
- **`getDefinition()` 的 `range` 字段可能闪退**（返回宿主数组），读定义/范围尽量走磁盘或安全 getter。
- 宿主闪退会丢未保存改动 → **改动后及时 Ctrl+S**，或从 recovery (`%APPDATA%/.../Instrument X/recovery/`) 恢复。

### 安全面 / 危险面速查（2026-09-14 实测，登记在 `tools/known-bugs.json`）

**先扫一眼缺陷表**：`node tools/known-bugs.cjs --list`（人读版 `knowledge/docs/已知Bug与平台约束.md`；四类 = `crash` / `api-gap` / `doc-gap` / **`by-design`**）。

| 面 | 能安全用的 | 绝对别碰的 |
|---|---|---|
| **读曲线** | `Automation:get(blick)`（单点，插值） ⇒ 需要整条就**采样拟合**（1/64 拍步长；实测 109 点 / 12 ms） | `getPoints` · `getAllPoints` · `getLinear` · `getDefinition`（返回宿主对象 ⇒ 卡死/闪退） |
| **删点** | `removeAll()` 清空 · `remove(x-1, x+1)` 删**单个点** · `remove(begin, end)` 删**半开区间** `[begin,end)` | `remove(index)`（按序号删 ⇒ 桥挂 + 宿主崩）；`remove(x, x+1)` **无效**（实测不删） |
| **写曲线** | `add(blick, value)`（写前 `newUndoRecord()`） | 从桥脚本 `return` 宿主对象（只回 `type()` / 数字 / 字符串） |
| **写参数** | 按取值域**钳制**后写 | 数百量级的 F0 参数（如 `fF0Vbr=300`）⇒ **宿主闪退**（登记 SV-002） |
| **读参数域** | 磁盘文件 / `_sync.json` 基线 | `getDefinition()`（IX 上文档缺席，见 `doc-gap` IX-004） |

**两条 `by-design`（不是 bug，是纪律；SV1 弹框"就是这么设计的"）**：
- `NoteGroupReference:setTarget()` 对**已指向**的 ref **静默失败** ⇒ 换目标要**删旧 ref + 建新 ref**（改完读回校验）
- `Track:clone()` 复制出的轨**与源轨共享音符组** ⇒ 想独立改必须**另建/复制组**并重新指向，别把 ref 指回原组

## IX 恢复目录机制 · 解析注意事项（**2026-09-19 并入**，原为一份 IX 格式参考）

> 📌 **来历**：这一节原为一份 IX 格式参考（原文件随后删除、内容并入本节）。它覆盖的 6 个部分（顶层结构 / `library[]` / `notes[]` / 自动化扁平数组 / `tracks[]` / 时间单位）
> 与本 skill **高度重合且本 skill 更新**（三端逐字段对照由 `tools/diff-project-3ends.cjs` 自动产出）⇒ 只把**独有的两节**并进来。

### 恢复目录机制（宿主闪退自动快照）

- 路径：`%APPDATA%\Dreamtonics\Instrument X\recovery\`
- 结构：`session-<pid>`（内容是进程名，如 `instx.exe`）+ `YYYY-MM-DD\<uuid>_<日期>_<时间>.ixp`
- 宿主**闪退 / 异常退出前**自动保存当前工程快照；文件名时间戳 = 保存时刻（如 `c149ac3c_2026-08-28_01-36.ixp` = 01:36 的完整工程）
- 恢复：重开 Instrument X → 用 Recovery 加载对应快照
- ⚠️ **recovery 快照常大量字段为空** —— 别拿它当"这一版没有这个字段"的证据（本 skill 里两处旧结论正是被空快照带偏的：IX 的 `voice` 曾据此误判为"恒为空字典"）
- ⚠️ 从 recovery 目录读副本时，**同一相对路径会解析到别处**（副本目录不同）⇒ 别据此判"文件丢了"

### 解析注意事项（读工程文件的操作纪律）

1. **用 Node / UTF-8 直读**：`fs.readFileSync(p,'utf8')` + `JSON.parse`。**别用 PowerShell 读** —— `Get-Content` 在 GBK 控制台下中文乱码、`ConvertFrom-Json` 对大文件会失败（同 `akdagent-playbook` 的「工具与文档纪律」）
2. 中文名（`"未命名音轨"` / `"音符组 1"`）在 UTF-8 下**正常**，乱码是读法问题、不是文件问题
3. 文件可能不小（684 音符 ≈ 186 KB）⇒ 解析无压力，**别用 GUI 文本编辑器开**
4. 现成只读工具：`tools/show-ixp-note.cjs`（看单个音符）· `tools/make-dyn-test-ixp.cjs`（造测试工程）· `tools/svp-audio-schema.cjs`（扫 `.svp` 音频轨）
   ⚠️ 原 doc 提到的 `server/parse-ixp.cjs` **已不存在**，不再保留该指针

> 🔗 **与 `api/` 的分工（别搞混）**：`skills/sv-scripting/api/` 是**官方脚本手册的逐页镜像**（`tools/api-docs-sync.cjs` 维护，`--update` 整批重写 ⇒ **不要往里写自研内容**），讲宿主内**运行时对象/方法**；**本 skill 讲磁盘工程文件里的字段**。两层对照着看。

## 音高控制点 `pitchControls[]`（**仅 SV2 / IX**；SV1 无此字段）

挂在**组定义**上（`library[].pitchControls` / `mainGroup.pitchControls`），**不在组引用上**。
条目的 `pos` / `pitch` 都是**组内局部**坐标（相对组的 `timeOffset` / `pitchOffset`）。

| `type` | 形状 | 语义 |
|---|---|---|
| `"curve"` | `{"pos":<blick>, "pitch":<anchor 半音>, "id":<int>, "type":"curve", "points":[x,y, x,y, …]}` | **y 是相对 anchor 的偏移量**（可正可负）；x 相对 `pos`；**点数为 1 也合法**（单点曲线） |
| `"point"` | `{"pos":<blick>, "pitch":<音高>, "id":<int>, "type":"point"}` | **没有 `points` 字段**；`pitch` **就是该点的实际音高** |

**实测样本（`sv2工程测试.svp`，2026-09-13）**：
- curve：`{"pos":7427086768, "pitch":66.58333587646484, "points":[0,0, 15428487,0.2083, …, 354855214,3.75]}`（y 范围 −0.5..4.25 ⇒ 相对偏移）
- point：`{"pos":7469515109, "pitch":69, "id":94, "type":"point"}` · `{"pos":8140654318, "pitch":63.875, "id":96, "type":"point"}`
- 📌 **手画的点**在文件里就是上面两种形态（**单点 curve** 或 **point**）⇒ 看到"零星几条不像我写的曲线/点"，
  **先怀疑是用户手画的**，别当异常数据（此前我把它们误判成"异源残留"，纯属误诊）。
- `id` 是 SV2 内部编号，**不连续**（实测 2/9/11/13/90/94/96/98），**不要当索引用**。

## 音素时值 / 音素编辑（SV2）

- **没有** `phonemeDurations` / `phonemeStretch` 这类独立字段（全文扫描确认，`"phonemes"` 出现 21 次、其余 0 次）。
- 音素信息只有两处：
  1. **音符级 `phonemes`**（字符串）= 音素符号序列，手改过音素才有值，如 `"l a1123"`、`"l a  111 "`；
  2. **`attributes.phonemes[]`** = 与音素**一一对应**的数组，每项 `{"strength":<0~1>, "alt":<int>}`；
     **动了时值就多一个 `leftOffset`**（音素左边界偏移，实测 `0.108964763581753` / `-0.166003420948982` /
     `-0.11407221108675` / `0.088186167180538`，**疑似单位为秒**）⇒ **"音素时值"就存在这里**。
- 未编辑过的音符**没有** `attributes.phonemes` 键；编辑过才有。相关键还有 `phonesetOverride`（如 `"xsampa"`）、`languageOverride`（如 `"mandarin"`/`"spanish"`）。

## SV1 组引用的"两个位置字段"（`blickAbsoluteBegin` vs `blickOffset`）

SV1 的组引用（含 `mainRef`）用 **`blickOffset` / `blickAbsoluteBegin` / `blickAbsoluteEnd`**，**不是** SV2/IX 的 `timeOffset`。

实测样本（`sv1工程测试.svp`，2026-09-13 —— 用户特意补了"音符组偏移"）：

| 位置 | `blickAbsoluteBegin` | `blickAbsoluteEnd` | `blickOffset` | 备注 |
|---|---|---|---|---|
| 轨[0] 非主组引用（指向 library「la la」） | 10.0000 拍 | 13.7500 拍 | **11.0000 拍** | **两字段不相等**（10 ≠ 11） |
| 轨[3] 非主组引用 | 12.5000 拍 | −1（到底） | 12.5000 拍 | 相等 |
| 轨[2] 音频轨 `mainRef` | 5.5000 拍 | −1 | 5.5000 拍 | = 音频起点 |

- `-1` = **未定 / 到末尾**（不是错误值）。
- ✅ **语义（API 文档原文，权威）** —— 别再自己推：
  | 方法 | 官方原文 | 中文含义 |
  |---|---|---|
  | `getTimeOffset()` | "the time offset (blicks) **applied to all notes** in the target NoteGroup" | **施加在组内所有音符上的位移** ⇒ "**入点 / 出点移动**" |
  | `getOnset()` | "the beginning position (blicks), that is, **the onset of the first Note … plus the time offset**" | **首音符 onset + timeOffset** = 位移后的实际起点 ⇒ "**平移**" |
  | `getEnd()` | "the **end of the last note** … **plus the time offset**" | 末端同理派生 |
  | `getDuration()` | "Equivalent to `getEnd() - getOnset()`" | 派生量 |
  | `getPitchOffset()` | "the pitch shift (semitones) **applied to all notes**" | 与 `timeOffset` 平行的**音高**版位移 |
  > 🔑 **一句话**：`timeOffset` / `pitchOffset` 是**施加量**（作用到组内全部音符 = 整体位移/入出点移动）；
  > **`onset` / `end` / `duration` 是"含位移之后的派生位置"，不是独立设置项**。
- 📐 **文件字段 ↔ API 的对应（按上表 + 实测数值反推，仍待真机复核）**：
  `blickOffset` ↔ `getTimeOffset()`（内容位移）；**`blickAbsoluteBegin/End` 是"组块（引用）的入/出点范围"**（不是 onset/end）。
  自洽验算（轨[0]，目标组「la la」音符 onset 0 / 1 拍各 1 拍 ⇒ 内容 0..2 拍，`blickOffset` = 11 拍）：
  API 语义下 `getOnset()` = 0 + 11 = **11 拍**、`getEnd()` = 2 + 11 = **13 拍**，而文件写的是 **10 / 13.75 拍**
  ⇒ 块比内容**前后各多出** 1 拍 / 0.75 拍 ⇒ **`blickAbsoluteBegin/End` = 块边界**（与被裁掉的头尾对应）。
  ⚠️ **复核手段（下次 SV1 桥开着时一步完成）**：`node sv/lua/probe-ref-offsets.cjs sv`（读每条引用的
  `getOnset/getEnd/getDuration/getTimeOffset/getPitchOffset`），与上面文件数值对照即可定案。
- 组引用**只带偏移/声库/唱法，不带音符**（内容是 `groupID` → `library[].uuid` 的引用）——三端一致。

## automation 通道 `parameters`（三端同形状）

`groups[].parameters` / `library[].parameters` / `mainGroup.parameters`，每个通道 `{ "mode": "cubic", "points": [x,y, x,y, …] }`。

- **x = 组内局部 blick**（相对**组内容原点**，**可以为负** —— 包络允许延伸到首个音符之前）。
  **实测**：`la la` 组（组内仅 0..2 拍）的 x ∈ **−0.059 .. 1.74 拍**；主组 x 达 4.6..17.2 拍（其引用偏移为 0，故与绝对时间重合）。
  ⇒ **换算到工程绝对时间必须加组引用的偏移**（SV1 `blickOffset` / SV2·IX `timeOffset`）—— 别把 x 当绝对时间用。
- **y 单位按通道不同（实测量级）**：`loudness` = **dB**（−12.7..0）· `toneShift` ≈ **音分**（−497..0，即 ±5 半音以内）·
  `pitchDelta` ≈ **音分**（−79..131 ≈ ±1.3 半音）· `tension / breathiness / gender / voicing / vibratoEnv` = **归一化**（约 −1.2..1.4）。
- 通道键（SV1 = 8 个，SV2/IX = 9 个，多 `mouthOpening`），**未编辑的通道是 `points: []`**（不是缺键）。

## 音频轨 `audio` 字段 —— **分版本，且 SV2 缓存了音频分析结果**

| | 形状 |
|---|---|
| **SV1** | `"audio": { "filename": "../../Projects/00_…mp3", "duration": 25.443 }` |
| **SV2** | `"audio": { "filename": "C:/…/Projects/dsc二度使命完整版.mp3", "duration": 198.112, "bpm": 82.9956, "alternativeBPMs": [82.9956, 166.118, 66.391], "beatLocations": [0.0103, 0.7332, …] }` |

> ⚠️ **上表里出现 `.mp3` 只是"文件里原本就长这样"，不是推荐做法：导入宿主前一律先 `sv_convert_audio` 转 44.1k WAV** ——
> **MP3 带编码延迟**，直进宿主会让**整条时间轴偏移**（表现为"导出的音频与伴奏对不上拍"；
> 旁证见 `skills/composition/references/混音与母带.md` 与上游笔记的 `U3:174`）。
> 我们自己的转码链（mpg123 解码 + 重采样）会把延迟处理掉 ⇒ **时间轴才可信**；同理，测 BPM/第一拍、分离人声/伴奏，也都该拿这份 WAV 做，别直接喂 mp3。

- ⭐ **SV2 把音频的 BPM / 备选 BPM / 逐拍秒数（`beatLocations`）直接存进工程** ⇒ 做拍点对齐时**可先读这里，不必重新分析音频**（还能与自测 BPM 交叉验证）。
- **`filename` 可为相对或绝对**；相对路径的**基准 = 工程文件所在目录**。
  实测：`Documents\Image-Line\FL Studio\Presets\Scores` + `../../Projects/` = `Documents\Image-Line\FL Studio\Projects\` ✓（与 SV2 那份的绝对路径同族）。
  ⚠️ 从 **recovery** 目录读副本时，同一相对路径会解析到别处（副本目录不同）—— 别据此判定"文件丢了"。

## 音素：**信 `attributes.phonemes[]`，别解析音符级 `phonemes` 字符串**

- 实测 4 个带音素信息的音符中有 **2 个对不上**：`phonemes` 是**空串**而 `attributes.phonemes` 有 2 项（如 `[{"strength":0,"alt":0},{"leftOffset":0.109,"strength":0,"alt":0}]`）。
  ⇒ 音符级 `phonemes`（`"l a1123"`、`"l a  111 "`）是**显示/手改标记**，token 数与音素数**不保证一致**（`"l a1123"` 的 `1123` 疑似时值档）。
  **结构化数据一律以 `attributes.phonemes[]` 为准**（`strength` / `alt`，动了时值才多 `leftOffset`）。
- 相关键：`phonesetOverride`（如 `"xsampa"`）、`languageOverride`（`"mandarin"`/`"spanish"`/`"japanese"`…）。

## 写回文件：风格分版本 + 尾部 NUL 不可靠（改文件前必读）

| | SV1（153） | SV2（196）/ IX（201） |
|---|---|---|
| 汉字写法 | **全部转义为 `\uXXXX`**（实测 31 处、原样汉字 0） | **原样 UTF-8 汉字**（实测 50 / 39 处、`\uXXXX` 0） |
| 尾部 | ⚠️ **有的存盘带一个 `\0`、有的不带**（同一天两份 SV1 副本：Scores 尾部 `657d7d00` **有**、recovery `73657d7d` **无**） | 实测无 NUL |

⇒ **两条硬规矩**：
1. **读**：一律**先剥尾部空白/NUL** 再 `JSON.parse`（否者 SV1 会报 `Unexpected non-whitespace character`）；
2. **写**：**保持该文件原本的风格**（SV1 转义汉字、SV2/IX 原样），**尾 NUL 不必补**（实测不带 NUL 的副本同样正常）；
   并且**改前 `.bak` 备份 → 让用户先关闭该工程 → 改文件 → 用户重新打开**（否则宿主内存副本会覆盖改动）。

## ⭐ SV2 音频 BPM 的读取 / 写入 / 修正流程（`tracks[].mainRef.audio`）

**为什么需要**：**SV2 把音频的拍点分析结果缓存在工程里**，而 SV 自动识别的 BPM 有**倍/半速歧义**
（典型：真 120 被识别成别的倍数）。脚本 API **没有**暴露音频 BPM ⇒ **改工程文件是目前唯一能直接纠正它的途径**。
我们自己的 `sv_analyze_audio`（beat tracker + `bpmCandidates`）正好可以当"裁判"。

### 字段形状（实测 `sv2工程测试.svp`）
```json
"audio": {
  "filename": "C:/Users/<USER>/Documents/Image-Line/FL Studio/Projects/dsc二度使命完整版.mp3",
  "duration": 198.1119954648526,                       // 秒
  "bpm": 82.9956283569336,                             // ← 主 BPM（要改的就是它）
  "alternativeBPMs": [82.9956283569336, 166.1175537109375, 66.3910140991211],  // ← 备选（倍/半速族）
  "beatLocations": [0.010270833333333, 0.733200476590712, 1.456130119848091, …]  // ← 逐拍秒数
}
```
- **自洽性校验**：`beatLocations` 相邻间隔 = **0.722930 s** ⇒ `60 / 0.722930 = 82.9956 BPM` ✓ 与 `bpm` 字段完全一致。
- `alternativeBPMs` ≈ 主值的 **×2 / ×0.8** 关系（82.996 / 166.118 / 66.391）。
- 首拍 ≈ **0.0103 s**（不是 0 —— 音频开头常有一点静音）。

### 修正流程（**纯文件操作，不需要桥**）
1. **先拿我们的分析值**：`sv_analyze_audio`（必要时先 `sv_separate_vocals` 取纯伴奏）→ BPM + 第一拍秒数；
   若与 `alternativeBPMs` 同族但差倍数，**按同一"倍速族"取值**（避免把 ×2 当另一首歌的速度）。
2. **备份**：`xxx.svp` → 同目录 `xxx.svp.bak`。
3. **让用户在宿主里「关闭该工程」**（不关的话宿主内存副本会覆盖我们的改动）。
4. **改文件**：
   - `audio.bpm` = 正确值；`alternativeBPMs[0]` 同步改成同值（其余备选按新值的倍/半速重算）；
   - **`beatLocations` 必须一起处理**（否则"拍点数组"与"BPM 字段"互相矛盾）：
     - **恒定速度音频** ⇒ 重算：`beatLocations[i] = firstBeatSec + i × (60 / bpm)`，
       `firstBeatSec` 沿用原数组首值（或改用我们测到的第一拍）；长度沿用原数组长度；
     - **速度浮动音频** ⇒ **不要用恒定公式**，保留原 `beatLocations`、只改 `bpm`；
       或者干脆不动音频字段，改用 `sv_apply_tempo` 往工程 `tempo` 里逐段打浮动速度标。
5. **写回**：保持 SV2 原有风格（UTF-8 原样汉字、**不需要补尾 NUL**）。
6. **用户重新打开工程** → 核对音频轨显示的 BPM 与拍点是否变成新值（侧栏 / 音频轨）。
7. 🆕 **BPM 一律写成整数近似值**：宿主自己存的小数是**浮点噪声**，不是信息 ——
   见到 **`75.0031` 就按 75 写、见到 `150.0062` 就按 150 写**（同理 `alternativeBPMs` 各项也近似成整数）。
   不要原样搬运 `75.00308990478516` 这种值：它除了让文件难读、让后续比对永远不相等，没有任何用处。
8. 🆕 **对齐音频拍点的正确落点是「工程 tempo」，不是音频的 `audio.bpm`**（**纠正了本文档此前含混的说法**）：
   - **宿主/工具里读不到 `audio.bpm`**（它只是文件里的一个缓存字段）⇒ 想让"小节线落在音频拍点上"，要改的是
     **`time.tempo[0].bpm`**（工程时间轴），值取音频的**真 BPM**（如 150）。
   - **先区分恒速 / 变速**：`beatLocations` 相邻间隔**恒定** ⇒ 恒速 ⇒ 直接改 `time.tempo[0].bpm`；
     **明显变速** ⇒ 另议（稍后再说；不要硬塞单一 BPM，见第 9 条）。
   - **`audio.bpm` 顺手写成整数近似值**（见第 7 条）仍要做，但它**不是对齐手段**。
9. 🆕 **`beatLocations` 网格若存在明显变速 ⇒ 主动提醒用户"可以按网格设变速 BPM"**：
   判据 = 相邻间隔**不再恒定**（如整串 0.8 s 里突然出现 0.4 s 或 1.2 s 的段落）。
   这时**不要**硬塞一个单一 `bpm`，而要告诉用户：**网格本身已经把速度变化记下来了，可直接依据它设置变速（tempo 变化）** ——
   让用户决定是"贴网格做变速"还是"统一成一个平均 BPM"。
10. 🆕 **移动音频/组的位置一律用「绝对 onset」，绝不用 `offset`**：
    **改 `offset` 会让音频**后面出现截断**（内容被吃掉）**。⇒ 绝对位置写 `blickAbsoluteBegin`、`blickOffset` 保持 0
    （与本文档"音频轨位置约定"一节一致）；`tF0Offset`/组引用 offset 这类字段同理，别拿它们当"位移"使。
    实测参照：音频第一拍在文件里是 **0.6124 s**，若要让它在工程 0 点响，音频 onset 需为
    **−0.6124 s ≈ −1,080,303,000 blick（负值）**；而 0.6124 s 折合 **1.531 拍**（非整数）⇒
    **不能靠"量化到小节线"解决**，必须真的移 onset。

### 🆕 变速：把工程做成「BPM 包络曲线」（2026-09-17 用户给定流程）

**什么时候做**（两条任一成立）：
1. **`beatLocations` 相邻间隔差距较大** —— 判据：`dt_k = beatLocations[k+1] − beatLocations[k]`，
   若 **max(dt) / min(dt) > 1.05**（或 `|dt − median| / median > 5%` 的点超过 ~10%）⇒ 判定为**变速曲**；
   恒速（如整串 0.799967）**不要**做包络，按上面第 8 条改 `time.tempo[0].bpm` 即可。
2. **用户明确要求**做变速。

**结果形态**：一条 **BPM 包络**（多个 tempo 标，逐小节或逐拍），使**每一条小节线都落在音频拍点上**
（等价于用户手边的 `~/Documents/Dreamtonics/Synthesizer V Studio/scripts/AKD/自动调整BPM.js`）。

**算法（关键一步让"对齐"自动成立）**：
1. **先把初始 BPM 设成"置信 BPM"** —— 取 MIDI tempo / 用户告知值 / `bpmCandidates` 里与 MIDI 一致的那个
   （例：这首歌候选 101/120/150/90 而 MIDI 是 150 ⇒ 取 **150**）。做法见第 8 条的 `removeTempoMark` + `addTempoMark`。
2. **再按 `beatLocations` 逐段写 tempo 标**：
   - **逐小节**（推荐，标记少）：第 m 小节的 `bpm_m = 4 × 60 / (beatLocations[4m+4] − beatLocations[4m])`；
   - **逐拍**（最贴，标记多）：`bpm_k = 60 / dt_k`；
   - ⚠️ **为什么这样就对准了**：SV 的时间轴以**四分音符（blick）**为单位，而 tempo 标生效于"本标到下一个标"；
     只要**每段的时长（秒）× 该段 BPM / 60 = 整数拍**，该段就**恰好**占整数个四分音符 ⇒ **拍点自动落在拍线/小节线上**，
     不需要再做任何"位置微调"。逐拍时每段恰为 1 拍（705,600,000 blick），逐小节时恰为 4 拍。
3. **位置累加**：标的位置 = 上一个标的 blick + 该段拍数 × 705,600,000（逐拍即 +705,600,000/拍，
   逐小节即 +4×705,600,000），从"音频第一拍所在的工程 blick"起算（第一拍的位置由第 10 条的 onset/offset 决定）。
4. **API 序列**（**必须** remove + add，见 known-bugs `tempo-mark-no-update`）：
   ```lua
   local ta = SV:getProject():getTimeAxis()
   -- 每个位置：先删后加，因为 addTempoMark 不更新已有标
   ta:removeTempoMark(blick_m)
   ta:addTempoMark(blick_m, bpm_m)
   ```
5. **回读验证**（缺一不可）：`getAllTempoMarks()` 看标数与位置是否与预期一致、
   `getTempoMarkAt(blick_m).bpm` 抽查几段、再让用户目视"小节线是否压在拍点上"。

**注意**：
- 🔴 **变速包络的 BPM 一律用「原数值」，禁止近似成整数**（**与第 7 条相反**）：
  第 7 条的"近似成整数"**只适用于单一静态 BPM**（`time.tempo[0].bpm` / `audio.bpm` 这种"一个值管全场"的场合）。
  包络**必须**用计算出的精确值，否则每段都会带一点误差、**逐段累积**成明显漂移。
  实测对照：网格间隔 `0.7999670423734244 s` ⇒ 原数值 `60/dt = **75.00308990478636**`；
  写 `75`（整数）每小节差 0.13 ms、70 小节累计 ≈ **9 ms**；写原数值则每小节恰好 4 个四分音符，**零漂移**。
- 标太多会让工程难编辑（逐拍 = 一首歌几百个标）⇒ **默认逐小节**，用户要求"更贴"时才逐拍；
- **写包络前后都要数标**：`getAllTempoMarks()` 对数 —— 若把旧标落在**不同位置**（例如先写整数、后改原数值，起点 blick 又算了不同的精度），
  `removeTempoMark(新位置)` **删不掉旧标** ⇒ 标会**翻倍**（实测 71 → 141）。⇒ **要么先按位置精确对齐再删，要么改完显式清一遍旧位置**；
- 变速与"音频组位移/时长"是**两件事**：先把音频摆正（第 10 条），再写包络；
- 🔴 **音频时长必须按「音频所在段的本地 BPM」折算**（2026-09-17 实测踩坑）：
  `durationblick = 音频秒数 × (该段 BPM / 60) × 705600000`。
  **别用 `tempo[0]` 的 BPM**：包络第一段常与 `tempo[0]` 不同（例：`tempo[0]=150`、音频正文在 `75.003`），
  用 150 折 224 s = 560 拍，而 560 拍在 75.003 下是 **448 s** ⇒ **音频轨看上去长了一倍**（实测症状）。
  正确值：`224.00002267574 × (75.00308990478636/60) × 705600000 = 197,576,159,552`（⇔ 224.00002 s ✔）。
  ⇒ **写完一定要把 duration 用本地 BPM 反算回秒数核对**；
- 若工程里原本只有一个 120 的标，**别忘它**：包络的第一段要么覆盖它（`remove` + `add`），要么从它之后才开始。

### 未验证（要真机配合，别当成已确认）
- SV **重载时是信任文件还是重新分析**？测法：把 `bpm` 改成一个明显错值（或删掉 `beatLocations`）→ 重开 → 看是否被覆盖回原值。
- 只改 `bpm`、不动 `beatLocations`，宿主会怎么用这两份数据？（对齐/显示是否会打架）
- **音频 BPM 与工程 `time.tempo` 是两套独立数据**：`align_audio` 干的是"把音频轨对齐到工程锚点"，**它不改 `audio.bpm`**。

## 参数单位表（SV「音符属性侧栏」↔ 文件字段，2026-09-13 实测交叉验证）

**交叉验证证据**：截图侧栏的 时长-左 `0.325 sec` · 时长-右 `0.325 sec` · 深度-左 `3.36 smt` · 深度-右 `3.57 smt` ·
开始 `0.580 sec` · 左 `0.35 sec` · 右 `0.32 sec` · 深度 `1.54 smt` · 频率 `8.77 Hz`，
与 SV1 工程 `mainRef.voice` 里的 `tF0Left 0.324999988079071` · `tF0Right 0.324999988079071` ·
`dF0Left 3.359999895095825` · `dF0Right 3.569999933242798` · `tF0VbrStart 0.5799999833106995` ·
`tF0VbrLeft 0.3499999940395355` · `tF0VbrRight 0.3199999928474426` · `dF0Vbr 1.539999961853027` ·
`fF0Vbr 8.770000457763672` **逐个吻合** ⇒ 单位与字段名一一对应确定。

| 侧栏分组 | 显示项 | 单位 | 文件字段 |
|---|---|---|---|
| 音高过渡 | 偏移 | **sec** | `tF0Offset` |
| 音高过渡 | 时长-左 / 时长-右 | **sec** | `tF0Left` / `tF0Right` |
| 音高过渡 | 深度-左 / 深度-右 | **smt**（半音） | `dF0Left` / `dF0Right` |
| 颤音 | 开始 | **sec** | `tF0VbrStart` |
| 颤音 | 左 / 右 | **sec** | `tF0VbrLeft` / `tF0VbrRight` |
| 颤音 | 深度 | **smt** | `dF0Vbr` |
| 颤音 | 频率 | **Hz** | `fF0Vbr` |
| 颤音 | 相位 | **×（倍率）** | `pF0Vbr` |
| 颤音 | 抖动 | **×（倍率）** | `dF0Jitter` |
| 时间和音素 | 音符偏移 | **sec** | `tNoteOffset` |
| 音素 | 音素左边界偏移（侧栏不直接显示） | **秒** | `attributes.phonemes[].leftOffset`（实测 ±0.109 / −0.166 / −0.114 / 0.088） |

## 两条已裁定的事实（2026-09-13 用户确认）

- ✅ **尾部 NUL 不影响工程打开** ⇒ 写回时**可以不带 `\0`**（读时仍然一律先剥尾部空白/NUL）。
- ⛔ **`mixer.fxParams`（room / EQ / 压缩 / 混响）目前不支持脚本修改** —— 只能在**文件层**改（或宿主 UI 里改）；
  **以后宿主可能更新**，届时再补脚本路径（`Track.getMixer()` 现在只到 gain / pan / mute / solo）。
- 🌙 **`musicalType:"rap"` 与 SV1 组级 `voice` 参数优先级：用户说"稍后再说"**（用户口径「稍后再说」⇒ 别擅自开工）。

## `voice` 字典：到底有哪些属性（三端实测 + API 对照，2026-09-13）

`voice` 挂在**组引用**上（`tracks[].mainRef.voice` / `tracks[].groups[].voice`），是**组级/轨级默认嗓音参数**。

| 键 | SV1 | SV2 | IX | 含义 / 单位（实测值） |
|---|---|---|---|---|
| `tF0Left` / `tF0Right` | ✅ | ❌ | ❌ | 音高过渡 时长 左/右（**秒**，0.325/0.43/0.37） |
| `dF0Left` / `dF0Right` | ✅ | ❌ | ❌ | 音高过渡 深度 左/右（**半音**，3.36/3.57/3.5） |
| `tF0VbrStart` | ✅ | ❌ | ❌ | 颤音 开始（**秒**，0.58/0.76） |
| `tF0VbrLeft` / `tF0VbrRight` | ✅ | ❌ | ❌ | 颤音 左/右（**秒**，0.35/0.32/0.39/0.36） |
| `dF0Vbr` | ✅ | ❌ | ❌ | 颤音 深度（**半音**，1.54/1.71） |
| `dF0VbrMod` | ✅ | ❌ | ❌ | 颤音 深度调制（倍率，1.42~1.46） |
| `fF0Vbr` | ✅ | ❌ | ❌ | 颤音 频率（**Hz**，8.29/8.77） |
| `improviseAttackRelease` | ✅ | ❌ | ❌ | 即兴起音/收尾（**字符串** `"true"`/`"false"`） |
| `paramLoudness` | ✅ | ✅ | ❌ | 响度（3 ~ 5.65） |
| `paramTension` / `paramBreathiness` / `paramGender` | ✅ | ✅ | ❌ | 归一化（~0.35 ~ 0.51） |
| `paramToneShift` | ✅ | ✅ | ❌ | 音色移位（149 ~ 224） |
| `transposeCents` / `transposeSemitones` | ✅ | ✅ | ❌ | **组/轨级整体移调**：`实际移调 = transposeSemitones + transposeCents/100`（半音）；**只在设置过时才写这两个键**（未动 ⇒ 键不存在） |
| `renderMode` | ✅ | ✅ | ❌ | 渲染模式枚举（实测 `"modePreferSpeed"`） |
| `relaxedPronunciation` | ✅ | ✅ | ❌ | 宽松发音（**字符串** `"false"`） |
| `vocalModeInherited` / `vocalModePreset` / `vocalModeParams` | ✅ | ✅ | ❌ | 唱法：是否继承 / 预设名 / 各风格强度 |
| `consonantStrength` / `consonantDuration` | ❌ | ✅ | ❌ | 辅音 强度 / 时长（0.22 / 0.455） |
| `choirNumStems` / `choirSeatingSeparation` | ❌ | ✅ | ⚠️ `choirNumStems` **文件里有**（`4`）但 **API `getVoice()` 读不到**；`choirSeatingSeparation` 只在 SV2 | 合唱 声部数 / 座位间隔（10 / 0.7~1.4） |
| `performanceDirection` | ❌ | ❌ | ✅（API+文件都有） | **IX 独有**：演奏指示（`"allegro"` / `"default"`） |
| `singers` | ❌ | ❌ | ✅（**只有 API 有，文件里没有**） | 数值（实测 1 / 4）；含义未定，别当声库列表用 |
| **IX 的 `voice`** | — | — | **不是空字典**（修正！） | 未改过 = `{performanceDirection, singers}`；改过组级参数再加 `paramLoudness` / `paramBreathiness`。**文件侧另有 `transposeSemitones/Cents`、`choirNumStems` 而 API 读不到** ⇒ 两侧键集不同，别对着抄 |

### `transposeSemitones` / `transposeCents` 到底是什么（2026-09-13 实测）

**是"整组/整轨的整体移调"，拆成"整半音 + 残余音分"两部分**（不是两条独立设置）：

```
实际移调（半音） = transposeSemitones + transposeCents / 100
```

**实测样本（同一天两份工程，值完全对得上）**：

| 位置 | `transposeSemitones` | `transposeCents` | 合计 |
|---|---|---|---|
| SV1 轨[0] `mainRef.voice` | 7 | 26 | **7.26 半音** |
| SV1 轨[0] `groups[0].voice` | 4 | 15 | 4.15 半音 |
| SV2 轨[0] `mainRef.voice` | 7 | 26 | 7.26 半音 |
| SV2 轨[0] `groups[0].voice` | 6 | 28 | 6.28 半音 |
| SV2 轨[0] `groups[2].voice` | 4 | 15 | 4.15 半音 |

- **粒度为"每个组引用"**（`mainRef` 与各 `groups[]` 各自独立，实测同轨内 7.26 / 6.28 / 4.15 并存）。
- **未设置过 ⇒ 两个键都不存在**（SV1 轨[1]/[2]/[3]、SV2 多个组都是这样）——**别把"缺键"当成 0 写回**（写回时保持缺键即可）。
- `transposeCents` 实测都 < 100（15 / 26 / 28），即残余音分 ✓ 与"整半音 + 音分"的拆分吻合。
- ⛔ **API 未暴露（按文档 + 真机实测双重确认）**：全部 `skills/sv-scripting/api/*.md` 里**搜不到 transpose**；
  `NoteGroupReference#getVoice()/setVoice()` 的字段表只有 `param*` / `vocalModeParams` /（仅 v1）9 个音高参数；
  **真机实测**：SV1 的 `getVoice()` 返回 **14 个键**（见下表），SV2 的只返回 `singers/spacing/vocalModeParams` ——
  **两边都没有 `transposeSemitones/Cents`** ⇒ **要改移调只能改工程文件**（或宿主 UI）。
- ⚠️ **别与这几个搞混**：`note.detune`（**单音符**音分微调，实测 `detune: 25`）·
  `paramToneShift`（**音色**移位，不是音高）· `parameters.pitchDelta` automation（**随时间变化**的音高偏移，单位音分）。
- 📌 **口述记录的更正**：用户曾口述"`transposeSemitones` SV2 保留 API 可操作、`relaxedPronunciation` 有 API"，
  **随后用户更正为"按文档来"** ⇒ 本表**一律以文档 + 真机实测为准**：这两个键**都不在 `getVoice()` 里**。
  （若将来发现别的入口——例如挂在 `singers[i]` 或别的方法上——再补；**目前记为"未暴露"**。）

### ⭐ voice 各键的 API 覆盖（**按文档 + 真机实测**，2026-09-13）

| 键 | API | 依据 |
|---|---|---|
| `paramLoudness/Tension/Breathiness/Gender/ToneShift` | ✅ 有 | `getVoice()/setVoice()` 官方字段表 + **SV1 真机返回** |
| `tF0Left/Right`·`dF0Left/Right`·`tF0VbrStart`·`tF0VbrLeft/Right`·`dF0Vbr`·`fF0Vbr` | ✅ 有（**仅 SV1**） | 官方 "Properties only available in version 1" + **SV1 真机 14 键里确实有这 9 个**；SV2 只回 `singers/spacing/vocalModeParams` |
| `vocalModeParams` | ✅ 有（**2.1.1+**） | 官方字段表（SV1 真机 14 键里**没有**它 ⇒ 该字段是 2.1.1 起） |
| `transposeSemitones` / `transposeCents` | ❌ 未暴露 | **文档 0 命中 + SV1/SV2 真机 `getVoice()` 都没有**（用户已更正为按文档） |
| `relaxedPronunciation` | ❌ 未暴露 | 同上（文档 0 命中 + 真机未返回） |
| `renderMode` | ❌ 无（且基本不需要） | 文档 0 命中 |
| `choirNumStems` / `choirSeatingSeparation` / `consonantStrength` / `consonantDuration` | ❌ 无 | 文档 0 命中；实测也只有 SV2 的 voice 里有这些键 |
| `improviseAttackRelease` | ❌ 无 | 文档 0 命中；实测**只有 SV1**有该键（SV2 无） |

**SV1 真机 `getVoice()` 的 14 个键（原样）**：
`dF0Left dF0Right dF0Vbr fF0Vbr tF0Left tF0Right tF0VbrLeft tF0VbrRight tF0VbrStart
paramLoudness paramTension paramBreathiness paramGender paramToneShift`
⇒ ⚠️ **API 覆盖面 < 文件覆盖面**：SV1 文件里的 voice 有 **23 个键**（多出 `transposeCents/Semitones`、
`renderMode`、`dF0VbrMod`、`relaxedPronunciation`、`improviseAttackRelease`、`vocalMode*`）—— **这些只能改文件**。

> ⚠️ **文档镜像的坑 + 一条方法论**： `skills/sv-scripting/api/*.md`（24 份）**缺 `Voice` 类文档**；
> 而**真机实测才是终审**：SV1 的 `getVoice()` 只回 **14 键**、SV2 只回 `singers/spacing/vocalModeParams` ⇒
> 凡"某键有没有 API"的结论，**先看文档、再真机 `getVoice()` 读回**（本次就是这样把用户口述的
> `transposeSemitones/relaxedPronunciation` **从"有"改回"未暴露"**的）。
> ⇒ **"文档里没有" ≠ "API 没有"**，但反过来说：**"某人说 API 有"也 ≠ "真有"** —— 一律拿真机读数定案。
> ✅ **`improviseAttackRelease` 的含义**：
> 它**不是**"给起音/收尾自加倚音与转音"的开关，而是**决定「自动音高渲染」时的考虑范围**：
> - **关闭** ⇒ 自动音高**只考虑当前音符自己的音高线**；
> - **打开** ⇒ **把"转音"（音符之间的过渡 / 邻音）也考虑进去** ⇒ **自动音高可能因此跑调**。
>
> ⚠️ **作业后果（改正后）**：
> - 需要**可预测、贴合设计**的音高时（我们 07/08 的常规作业）⇒ **保持关闭**（置 `"false"`）；
> - 排查"**自动音高怎么跑调了**"这类现象时，**先看这个开关** —— 它开着就可能把跨音符的转音算进来。
> - 实测：**SV1 的 `voice` 里是字符串** `"true"`/`"false"`；**SV2 的 voice 里没有该键**；**无 API**（本地 24 份 API 文档 0 命中）
>   ⇒ 要改只能改工程文件或宿主 UI。

### ⚠️ 两处结构差异（写文件时最易写错）

1. **`vocalModeParams` 的值形状分版本**：
   - **SV1**：`{"Soft": 105, "Pop": 115}` —— **纯数字**
   - **SV2**：`{"Soft": {"pitch":105,"timbre":105,"pronunciation":105}}` —— **三轴对象（各 0..150）**
2. **未启用唱法时的"最小形态"**（SV2 实测 4 键）：
   `{"vocalModeInherited":true,"vocalModePreset":"","vocalModeParams":{},"choirSeatingSeparation":0.6999…}`

### API 对照（`NoteGroupReference#getVoice()` / `setVoice()`）

官方文档要点：`getVoice()` 返回"该组的**默认嗓音属性**（类似 `Note#getAttributes`）"，含
`paramLoudness(dB) / paramTension / paramBreathiness / paramGender / paramToneShift / vocalModeParams`
（每风格 `pitch / timbre / pronunciation` 各 **0..150**，2.1.1+），并**明确标注** "**Properties only available in version 1**"：
`tF0Left / tF0Right / dF0Left / dF0Right / tF0VbrStart / tF0VbrLeft / tF0VbrRight / dF0Vbr / fF0Vbr`（**秒 / 半音 / Hz**）。

⇒ **两条结论**：
- 官方说明与实测**完全一致**：那 9 个音高属性**只在 SV1 有**（SV2/IX 上 `getVoice()` 拿不到音高参数）；
- **API 覆盖面 < 文件覆盖面**：文件里还有 `transposeCents/Semitones`、`renderMode`、`relaxedPronunciation`、
  `improviseAttackRelease`、`consonant*`、`choir*` —— **API 未暴露，只能改文件**。

## ⭐ SV1 vs SV2 的 API 能力对照（真机实测，2026-09-13）

来源：`selftest` 的 `capabilities.extras` + `sv/lua/probe-sv1-safe.cjs`（SV1 1.11.2 逐项存在性检查）。

| 能力 | SV1（1.11.2） | SV2（2.2.1） | 实测依据 |
|---|---|---|---|
| 音高线（曲线/控制点） | ❌ **接口根本不存在** | ✅ | SV1：`group.getNumPitchControls` / `addPitchControl` **无此方法**；`capabilities.canCurve=false`；文件里也无 `pitchControls` 字段 |
| `SV.getComputedPitchForGroup` | ❌ 无（2.1.1+） | ✅ | SV1 探测 ❌；SV2 实测可用（注意 `blickStart` 必须用 `timeOffset`） |
| `SV.getComputedAttributesForGroup` | ❌ 无（2.1.1+） | ✅ | 同上（SV2 回 rap tone/intonation 与音素级信息） |
| 音符 `getAttributes()/setAttributes()` | ✅ 有 | ✅ 有 | SV1 实测有；**未写过的字段返回 `nil`（不是 `nan`）** |
| 音符 `getScriptData()/setScriptData()` | ❌ 无 | ✅ 有 | SV1 探测 ❌；`capabilities.noteHasScriptData=false` |
| 音符 `getPitchAutoMode()/setPitchAutoMode()` | ✅ 有 | — | SV1 实测有（`true`=自动 / `false`=手动） |
| 组引用 `getOnset()/getEnd()/getDuration()` | ✅ 有 | — | SV1 实测有（**main 组上 onset == timeOffset == 0**） |
| 组引用 `setTimeRange()` | ❌ 无 | ✅ 有 | `refHasSetTimeRange`：SV1 = false、SV2 = true |
| 组引用 `getTimeOffset()/setTimeOffset()/getPitchOffset()` | ✅ 有 | ✅ 有 | 两端 true |
| 组引用 `getVoice()/setVoice()` | ✅ 有（回 14 键，含 v1 专属音高参数） | ✅ 有（只回 `singers/spacing/vocalModeParams`） | 真机读数 |
| `Project.getNumNoteGroupsInLibrary()` / `getNoteGroup(i)` | ✅ | ✅ | SV1 实测（清理测试组时用过） |
| `Project.removeNoteGroup(index)` | ✅ | ✅ | ⚠️ **要的是"库内索引"（1 起），不是对象**；会自动连带删掉引用 |

> ⚠️ **调用纪律（用 SV1 实测血的教训换来的）**：SV 的 Lua 绑定**出错会弹脚本错误框并穿透 `pcall`**，
> 一旦弹框，**桥的定时器链就停**（我 2026-09-13 用 `SV:create("PitchControlPoint")` 把 SV1 的桥冻在弹框上：
> 心跳 `pollTicks` 不再增长、ping 无响应）。三条铁律：
> ① 判断"有没有"**只索引不调用**（`pcall(function() return obj[name] end)`，`type` 为 `function`/`userdata` 即存在）；
> ② 只在存在时才调，且**一律冒号形式** `obj[name](obj, ...)`；
> ③ **绝不做"点调用回退"**（实测会弹框，且可能让写操作执行两次）。
> 现成安全脚本：`sv/lua/probe-sv1-safe.cjs`（并在心跳过期时**自己拒绝运行**）。

## ⛔ 渲染前置条件 · 计算接口空值语义 · 语言处置权（**2026-09-18 用户裁定；动工前看**）

> 这一节是**约束**（不是待办），也是一次错误归因的产物：我曾把"计算接口采样全 `null`"判成"渲染没完成 / 接口不可用"，
> 用户当场给出真因。登记在 `tools/known-bugs.json`：**`SV-004`**（doc-gap）· **`SV-005` / `SV-006` / `SV-007`**（by-design）；
> 人读版由 `node tools/known-bugs.cjs --doc` 生成到 `knowledge/docs/已知Bug与平台约束.md`。

### B. 一个 NoteGroup 要"被渲染"，**三步缺一不可**（SV2 **没有自动存在的主组**）

| 步 | 调用 | 漏了会怎样 |
|---|---|---|
| ① 建组并入册 | `grp = SV:create("NoteGroup")` → `grp:addNote(note)` → `proj:addNoteGroup(grp)` | 组只是"库里的数据"，**不渲染** |
| ② 建引用并指向 | `ref = SV:create("NoteGroupReference")` → `ref:setTarget(grp)` → `ref:setTimeRange(onset, duration)` | 没有引用 ⇒ **不渲染**；窗口没盖住内容 ⇒ 露在外面的部分**不渲染** |
| ③ 挂到轨道 | `track:addGroupReference(ref)` | 引用不在轨道上 ⇒ **不渲染** |

- 删除用 `track:removeGroupReference(索引)`（**索引 1 起**）。
- ⚠️ **不渲染时计算类接口一律全 `null`，且不报任何错** ⇒ **采样全 null 时先自查"挂上轨道了没 / 窗口盖住内容了没"，不要先怀疑渲染延迟**。
- 📌 **`isMain=true` 的主组是宿主自己的结构**（见上方"不要往主组写音符"铁律）：**SV2 主组不可编辑**；**SV1 主组就是用户音符的容器**。

### C. 计算接口的**空值语义**：长度 = `numFrames`，未算出的帧是 `null`（**不是空数组**）

- `SV:getComputedPitchForGroup(ref, blickStart, blickInterval, numFrames)` 取到数据时，返回的是
  **长度 = `numFrames` 的数组，没有数据的帧为 `null`**。文档只写 *"does not block and may return an empty array if processing hasn't completed"*，**读起来像"长度为 0"**。
- 🔴 **绝不用 `#arr` 数帧**：Lua 里含 `nil` 的表 `#` 不可靠 ⇒ 会把"一整排 null"误报成 **0 帧**。必须**逐帧判 `type(v) == "number"`**。
- 判"就绪" = **轮询同一位置**，看 `null` 何时变成数值（小工程 3~5 s、长工程 30 s 以上预算）；**不要拿一次结果下结论**。
- `blickStart` 是**绝对位置**（含该 `NoteGroupReference` 自己的 time offset）；同一个 NoteGroup 被多个引用复用时，不同引用算出的音高可能不同。
- `SV:getComputedAttributesForGroup(grp)` 是**语义正路**（每个音符的 `accent` / `rapTone` / `rapIntonation` / `phonemes[]{symbol,language,activity,position}`），同样受 B 的前置条件与本节空值语义约束。

### A. **语言处置权在用户**（⛔ **这是 AKDAgent 的整体纪律**，不限说唱 / 不限作词）

> 📌 **正本在 `skills/akdagent-playbook/SKILL.md` §0.6b**（AKDAgent 整体纪律）。本节收录它，并补上"工程结构侧"的细节；
> `akdagent-protocol` 的「不动用户状态」、`sv-scripting/api/SV.md`、`sv-lyricist/references/说唱词流.md §5.2` 都指向同一处。

- 语言链 = **音符属性 > 音符组属性 > 轨道属性 > 声库语言**；都没有 ⇒ 取**声库录制语言**。
- 只有音符级 API：`getLanguageOverride()`（返回 `""` = **继承**，须上溯）/ `setLanguageOverride(lang)`，取值 `mandarin | japanese | english | cantonese`（**SV2 另有韩语 / 西班牙语**）。
- **⛔ 默认不改任何音符语言**（不 `setLanguageOverride`、不改组 / 轨语言）—— **用户比我们清楚声库语种**；
  **只有用户主动反馈"多语言混杂"时**，才按词内语言自动设。
- ⚠️ **语种与声库不兼容 ⇒ 无音素 ⇒ 该组不可渲染**（实测：**英文声库 + 中文词「我」⇒ 全 `null`**）——这是 B 之外最容易被误判成"渲染没完成"的一条。
- 声库语种写在 `nofs` 里（**非 flat 版加密 ⇒ 读不到**，别当已知信息）。
- 🆕 **混合语种怎么落地（只给"少数派"音符单独设）**：做法三步（读词 → **按语义判语种** → 只给非主流音符 `setLanguageOverride` 并回读）
  见 **`skills/akdagent-playbook/SKILL.md` §0.6c**。判据是**三级**：① 字形（CJK ⇒ `mandarin`、假名 ⇒ `japanese`、谚文 ⇒ `korean`）；② **拉丁字母必须按词法再判**（带声调符号/`ni3` 式数字 ⇒ **拼音=中文**；`tsu`/`shi`/长音/`-masu` ⇒ **罗马字=日文**；命中常用英文词 ⇒ `english`）；③ 两可时看上下文（多数派 / 相邻音符 / 用户提示），**拿不准问用户**。⚠️ **拼音 / 罗马字写的词不是英语**。`-`/空/纯标点**跳过**。
- 🆕 **API 侧补充**：`Note#getAttributes()` 在 SV2 就有 **`languageOverride` / `phonesetOverride`**（音符级覆盖）与 **`rTone` / `rIntonation`**（说唱 tone / intonation）⇒ 读回语种既可以走 `getLanguageOverride()`，也可以走 `getAttributes().languageOverride`。

### D. 写属性**必回读**（`setAttributes()` 不校验字段）

- SV2 上写那 12 个音高参数（`tF0Offset/tF0Left/tF0Right/dF0Left/dF0Right/tF0VbrStart/tF0VbrLeft/tF0VbrRight/dF0Vbr/pF0Vbr/fF0Vbr/tNoteOffset`，`Note.md` 注明 *Properties only available in version 1*）
  **不报错、静默忽略**；`getAttributes()` **只返回写过的键**（没写过的是 `nil`，不是 `nan`）。
- ⇒ **凡写属性必须读回验证**，不看返回值下结论。桥侧护栏：`write_pit` 的 attr 路线**分宿主**（SV2/IX ⇒ `attrUnsupported`，改走 curve 模式；SV1 ⇒ rap 音符跳过）。

## ⛔ 短音符的辅音「吃掉」前一个音符（**SV1 / SV2 分开处理**）

> **现象**（唱歌与 rap 都会出）：音符时值短时，它的**起首辅音被排到音符 onset 之前**，
> 于是**侵占了前一个音符的尾部** —— 听感上前一个字被截短、含糊，甚至"两个字粘成一个"。
> ⚠️ 这是 **SV 的 T2P（文字转音素）与时值分配行为**，不是 bug；**只能"调"或"绕"**，且 **SV1 与 SV2 的手段不同**。

### 先诊断（读，不改）

1. 读**计算属性**：MCP 工具 `sv_get_computed_attributes` → 每个音符的 `phonemes[]{symbol, language, activity, position}`（SV2 2.1.1+）。
   `activity` 是**辅音活动度**（>0 基本就是辅音）；`position` 是该音素的位置。⚠️ 读不到时先按本节下面的"§B 渲染前置条件 / §C 空值语义"自查，**别先怀疑渲染慢**。
2. 读**音符属性**（SV2）：`Note#getAttributes().phonemes[]` —— 每项含 **`leftOffset`（音素左边界偏移，实测 ±0.1 量级、疑似单位秒）**、`position`、`activity`、`strength`；另有 **`dur`（音素时长缩放数组）** 与 **`alt`（替代发音数组）**。
3. 对照时间：音符 *i* 的 `onset` vs 音符 *i−1* 的 `end`；若 *i* 的**首音素是辅音**且其左边界落在 *i−1* 的区间内 ⇒ 判定为侵入（把 `leftOffset` / 位置换算成时间时**先统一坐标系**，见下面"待验证"）。

### 修法 A：SV2 —— **有"精准"的音素位置/长度，可定点修**

**SV2 有获取精准辅音长度的 API**（SV1 没有）⇒ 所以 SV2 这条路是**可计算、可定点**的。

| 手段 | 说明 |
|---|---|
| **`Note#getAttributes().phonemes[]`** | 每个音素带 **`position`（该音素的精准位置）** · **`leftOffset`（加在左边界上的偏移）** · `activity`（辅音活动度）· `strength`（发音强度）⇒ **精度来自 `position`**：相邻音素的 `position` 之差就是音素长度，**辅音长度与"伸进前一个音符多少"都能算出来** |
| **`Note#setAttributes({ phonemes = { … } })`** | **官方文档示例原文就写了这个写法**（`{ leftOffset, position, strength }` / `{ leftOffset, position, activity }`）⇒ 可**定点**右推首辅音 / 改位置与强度；⚠️ `setAttributes` **不校验字段、静默忽略**（见 `api/Note.md`）⇒ **写完必须回读** |
| **`SV#getComputedAttributesForGroup`** | 拿**宿主算完后**的 `phonemes[]{symbol,language,activity,position}` ⇒ 用来核对"我写的"与"它算的"是否一致（⚠️ 未渲染时全 `null`，见 §B/§C）。🔴 **它只给"辅音的时长"，给不了"元音的"** —— 字段名本身就写着 *the **consonant** position / the **consonant** activity level* ⇒ **SV2 的"精准"只覆盖辅音那一侧**（正好是我们要修的对象），**元音时长要自己推**（音符时值 − 辅音时长） |
| `dur`（音素时长缩放数组） | 与 SV1 同名，但 SV2 上通常**优先用 `position`/`leftOffset` 定点**，`dur` 只作粗略比例 |
| `alt`（替代发音） | 换成**更短/更软**的辅音 |
| `setPhonemes("…")` | 写死音素串（**已真机验证可写可回读**）—— 换掉那个"太长"的辅音 |
| `evenSyllableDuration` | 一个音符里**多音节**时等分（**已真机验证可写**） |

### 修法 B：SV1 —— **只有 `dur`，而且只能调比例**

**SV1 的入口就是 `getAttributes()` 的 `dur`，且"只能调比例"**（没有 SV2 那种精准的长度/位置信息）。

| 手段 | 说明 |
|---|---|
| **`attributes.dur`（音素时长缩放，比例）** | SV1 的**主用手段** —— 完整配方见下面「SV1 `dur` 配方」；⚠️ 是**比例**不是绝对秒数，**没有量化测量方法，只能凭经验** |
| `setPhonemes("…")` | 换更短/更软的辅音（与 SV2 同） |
| `alt`（替代发音） | 在文件 `attributes` 里；**API 侧是否有入口待实测**（SV1 没有 `phonemes[]` 数组） |
| **`tNoteOffset`（音符偏移，秒）** | SV1 那 12 个 version-1-only 参数之一（"timing and phonemes - note offset"）—— **必要时**才用：它推的是**音符内整条时间轴**（元音会一起推后，可能顶到后一个音符），**不是"调辅音"的专用手段** |
| **拆音 / 改时值**（兜底，两端通用） | 给前一个音符**留出辅音时间**（缩短它、或在两者之间插一个短音符）；**不依赖 api 行为**，SV1 上往往是唯一稳妥办法 |

#### SV1 `dur` 配方（逐字记）

**触发**：① 遇到**当前音符长度短**（如 **16 分音符**）；或 ② **用户指出**这个问题时。

**做法**：

1. 🔴 **要压的音符已确认（2026-09-18 追问后用户再次确认）**：**取"短音符的**后一个**音符"的音素、压的是**它**的起首辅音** ——
   即"被吃掉的"是那个**短音符**，而侵入者的辅音属于**它后面那个音符**。**别压短音符自己的 `dur`。**
2. 看那个（后一个）音符**有几个辅音**：**第 0 个元素**（**Lua 里是第 1 个**）**就是辅音**。
3. 把**辅音位置那一项的 `dur` 降低到 50%~80%**（**根据长度**定：越短压得越多）。
4. **实际写成小数**（如 `0.5`，不是 `50`）。
5. 其余项**原样保留**（包括 `null`）；写完**回读**，听感由用户判。

**`dur` 数组的语义（关键，别猜）**：

- `dur` 是**数组**：有 **3 个音素** ⇒ `dur.length == 3`（**数组长度 = 音素个数**）。
- **第 0 个元素**（**Lua 里是第 1 个**，⚠️ 协议/宿主索引基准要分清）**就是辅音** ⇒ 只改它。
- **元素为 `null` ⇒ 视为默认值 `1`**；**会出现 `[null, 2, null]` 这种**写法 ⇒ 读时 **`null` 都当 `1`**，写时把要压的那一项写成小数（其余保持原样/`null`）。

**能力边界（务必如实告知用户）**：

- **没有任何量化测量方法**（SV1 拿不到精准音素长度）⇒ 只能**按经验**给比例，**听感验收由用户判**。
- 必要时再动 **`tNoteOffset`**（见上表说明）。
- 精确的定点修法是 **SV2 独有**（`phonemes[].position`/`leftOffset`）—— 见「修法 A」。

### ⚠️ 未真机验证（**别当已完成能力**）

1. SV2 的 `position` / `leftOffset` 的**取值口径**（文档示例是 `0.5` / `0.7` 这样的量级 ⇒ 疑似**音符内归一化位置或拍**，不是秒）—— 拿一个已知时值的音符测一次换算，**先把坐标系钉死**。
2. SV2 `setAttributes({ phonemes = { { leftOffset = … } } })` 的**实际生效性**（文档给了示例，但 `setAttributes` 不校验 ⇒ **回读比对**）。
3. SV1 `attributes.dur` 的**取值口径与可写性**（比例基数是什么、能否只改辅音那一项），以及 `alt` 在 API 侧有无入口。
4. 修完的**听感验收**必须由用户判定（我们不替用户下"听感 OK"的结论）。

> 🛠 桥侧**前置能力已就位**（0.3.14/0.3.15）：`get_lyrics_attrs` 带出每个音符的**手动音素**、`muted`、**`phonemeAttrs`（逐音素 position/leftOffset/strength/activity）**与 **`dur`（SV1 比例数组）**；
> `set_note_phonemes`（写音素串）· **`set_note_phoneme_attrs`（SV2 整数组写音素属性）** · **`set_note_dur`（SV1 写比例）**。
> 🛠 **MCP 工具：`sv_fix_consonant_intrusion`**（2026-09-18 落地，**默认 dry-run**）—— 扫短音符 → 取**后一个音符**的辅音 → SV2 建议把 `leftOffset` 往 0 收（`leftRatio` 默认 0.3，**绝不设 0**）、SV1 建议把 `dur[0]` 压到 `durFactor`（默认 0.65）；`apply:true` 才写，**效果只能听感验收**。
> ⚠️ **`leftRatio` 的标定口径（重要）**：0.3 是**对"原始 UI 值"标定**的 —— 实测 `−0.1576 × 0.3 ≈ −0.047`，正落在用户认可的 **`−0.05`** 附近
> ⇒ **已是好值就别再乘一次**（否则一路上收敛到"辅音消失"）；工具已加护栏：**`|leftOffset| ≤ 0.06` 即判"已在合理区间、不改"**。
> ⚠️ **`shortQuarter` 默认 0.25（16 分音符）**：真实工程里的短音符常是 **0.5Q / 0.625Q** 这种，会被自动跳过 ⇒ 按需放宽（实测 `shortQuarter=0.75` 才命中那两个 `la`）。

## 工具衔接

| 工具 | 用途 |
|---|---|
| `midi2ixp` | MIDI → `.ixp`（音符/力度/弯音/CC/乐器/分轨），单文件 HTML+Node 版 |
| `sv_generate_melody` | 乐理规则生成旋律（结构引擎：主题发展/句法/气口/落音/单一高点）→ `.mid`/音符 JSON |
| `sv_check_melody` | **按乐理判据体检一段旋律**（三证据/方向性/高点/避免音/气口/密度/落音）—— 读 SV 当前组或直接给音符，返回 issue + 严重度 |
| `sv_write_chords` | **分析音频和弦 → 把和弦拆成音符写入 SV/IX 工程和弦伴奏轨**（柱式/琶音/分解）|
| `sv_analyze_chord` | 单窗口单和弦估计（`detectChord`，参考级）|
| `sv_run_script` | 桥内写音符/automation（含新的 undo）|
| `sv_analyze_audio` | 测 BPM/拍点/调性（`bpmCandidates` + 指定 bpm）|

### 和弦写入链路（sv_write_chords）

把音频的和弦随时间变化**直接写成音符**进工程：

1. `extractChordTrack`（`audio/chord-track.ts`）：逐帧 chroma → 互相关模板评分（皮尔逊）+ 调性校正 → 每小节一条和弦（`ChordSeg`）。
2. `chordsToNotes`（`audio/chords.ts`）：每个和弦 `parseChordName` → 音程 → `chordsToNotes` 转柱式（block）/分解（broken）/琶音（arpeggio）音符，时间用**绝对 blick**，音区默认围绕 C4（可 `octaveShift` 下移）。
3. 桥 `write_chords` op：新建 NoteGroup + Note（`setPitch`/`setTimeRange` 绝对 blick），`proj.addNoteGroup` + `track.addGroupReference`，ref **time offset 恒 0**（统一 onset 约定）。
4. MCP `sv_write_chords`：①`analyzeAudio` 得调性/BPM → ②`extractChordTrack` 提和弦 → ③`chordsToNotes` 转音符 → ④`executeOp("write_chords")` 写入目标轨（默认第一个非音频轨）。

**注意**：带人声混音的 chroma 判定不准，建议用纯伴奏 WAV（`sv_separate_vocals` 的 accompaniment）。结果参考级。

---

## 生成 `.svp`：版本策略 · 音频轨注入 · 196 最小模板（**2026-09-19 并入**）

> 📌 **来历**：这一节原在 `skills/akdagent-protocol/references/svp-format.md`。它讲的是**工程文件怎么造**（版本、骨架、注入、模板），
> 本来就该在这里 ⇒ 2026-09-19 并入（**原文件同日已删除**）。并入时**修掉两处笔误**：`beatLocations` 是**逐拍秒数**，
> 不是 ticks（原文有两处写成 "ticks 数组"，与它自己 §音频轨 schema 的实测矛盾）。

### 版本策略（生成前先定版本）

| `version` | 对应 | 用途 |
|---|---|---|
| `196` | SV 2.x **当前版** | **默认首选**（结构最全：顶层 `uuid`、`startTimeSeconds`、`groups`、`projectMixer`、`audio.bpm/beatLocations`、`takes.seedDuration` 等） |
| `183` | SV **2.0.0** | 用户报"196 打不开/不兼容"时**回退** |
| `153` | SV **1.x** | SV1 专用（无 `uuid`/`startTimeSeconds`/`groups`/`beatLocations`） |

**183 与 196 的差异清单**（回退时照删）：音频轨 `takes` 无 `seedDuration/seedPitch/seedTimbre` · `voice` 无 `choirSeatingSeparation` · `mainRef` 无 `timestampLMR/timestampLRSR` · 无 `projectMixer`。

**生成前先问用户**：「这个工程要在 SV2 用，还是需要兼容 SV1？」

| 用户答案 | targetVersion | 写出的 `version` |
|---|---|---|
| SV2（默认，推荐）| `sv2` | `196`（打不开再降 `183`）|
| 兼容 SV1 | `sv1` | `153` |
| 仅 SV2 但怕旧版 | `sv2_183` | `183` |

### 音频轨注入（**实测 26 条真实音频轨** · 2026-09-11）

> 工具：`tools/svp-audio-schema.cjs`（只读扫本机 **1005 个 `.svp`**，抠出 **26 条音频轨**，与 294 条人声轨逐字段对比）。
> 为什么要这份：**官方脚本 API 造不出音频轨**（无 `setAudioFile` 类方法，只有只读 + `setTimeRange` 移动）
> ⇒ 想自动把伴奏塞进工程，只能在**工程关闭时改 `.svp`**（骨架见上文 §音频轨结构，含 2026-09-17 的两条真机硬教训）。

**可选字段的出现率**（只有被 SV 分析过节奏的工程才有 —— 正好解释了为什么不能假定它存在）：

| 路径 | 出现率 | 说明 |
|---|---|---|
| `mainRef.audio.bpm` | **11/26** | 分析出的 BPM |
| `mainRef.audio.alternativeBPMs[]` | **7/26** | 候选 BPM 列表（倍/半速族）|
| `mainRef.audio.beatLocations[]` | **7/26** | **秒**为单位的逐拍位置（可直接喂 `sv_apply_tempo`）|

**其余 26/26 必有的键**（`name`/`dispColor`/`dispOrder`/`renderEnabled`（**实测全为 false**）/`mixer.*`/`mainGroup.{name,uuid,parameters,vocalModes,notes}`/`mainRef.groupID`（**必须 = `mainGroup.uuid`**）/`blickAbsoluteBegin=0`+`blickAbsoluteEnd=-1`（−1 = 延伸到底）/`blickOffset`+`pitchOffset`（**`sv_align_audio` 改的就是这两个**）/`isInstrumental=true`/`systemPitchDelta`/`audio.filename`/`audio.duration`（**秒**）/`database.*`（**六字段全空、`version` 是字符串 `"-2"`**）/`dictionary`/`voice.{vocalModeInherited,vocalModePreset,vocalModeParams}`/`pitchTakes`+`timbreTakes`（⚠️ **音高/音色两个容器**，各 `{activeTakeId,takes:[{id,expr,liked}]}`，**不是单个 `takes`**）/`groups:[]`）。

**注入流程（改用户工程前必读）**
1. **必须关工程再改** —— SV 开着时以**内存态**为准，保存会覆盖磁盘改动。
2. UUID 自生成（`crypto.randomUUID()`），保证 `mainRef.groupID` = `mainGroup.uuid`。
3. **版本耦合**：按目标 `.svp` 版本（196/183/153）生成，别把 196 的块塞进 153。
4. **仍未验证**（三项都可能让"轨被丢掉"或"工程拒开"）：① SV 重开时对音频轨的**校验严格程度**；② `filename` 的路径解析（相对/绝对/中文/**文件缺失**）；③ 是否需要预建波形缓存等派生数据。
5. **纪律**：改前备份 `.bak`；**只动 `tracks[]` 数组**，其余字段不碰。

### 196 版最小完整模板（含伴奏轨 + 一个空人声轨，可直接复制填充）

```json
{
  "version": 196,
  "uuid": "<project-uuid>",
  "time": {
    "meter": [{"index": 0, "numerator": 4, "denominator": 4}],
    "tempo": [{"position": 0, "bpm": <主BPM>}],
    "startTimeSeconds": 0.0
  },
  "library": [],
  "tracks": [
    {
      "name": "伴奏",
      "dispColor": "ff4794cb",
      "dispOrder": 0,
      "renderEnabled": false,
      "mixer": {"gainDecibel": 0.0, "pan": 0.0, "mute": false, "solo": false, "display": true, "fxPresetName": "", "fxParams": {}},
      "mainGroup": {
        "name": "main", "uuid": "<audio-group-uuid>",
        "parameters": {"pitchDelta":{"mode":"cubic","points":[]},"vibratoEnv":{"mode":"cubic","points":[]},"loudness":{"mode":"cubic","points":[]},"tension":{"mode":"cubic","points":[]},"breathiness":{"mode":"cubic","points":[]},"voicing":{"mode":"cubic","points":[]},"gender":{"mode":"cubic","points":[]},"toneShift":{"mode":"cubic","points":[]},"mouthOpening":{"mode":"cubic","points":[]}},
        "vocalModes": {}, "pitchControls": [], "notes": [], "musicalScale": {"type": "Major", "root": "C"}
      },
      "mainRef": {
        "uuid": "<audio-ref-uuid>", "groupID": "<audio-group-uuid>",
        "blickAbsoluteBegin": 0, "blickAbsoluteEnd": -1, "blickOffset": <偏移blick>,
        "pitchOffset": 0, "mute": false, "isInstrumental": true,
        "audio": {"filename": "<绝对路径wav>", "duration": <秒>, "bpm": <主BPM>, "alternativeBPMs": [<主BPM>], "beatLocations": [<每拍秒>]},
        "database": {"name":"","language":"","phoneset":"","languageOverride":"","phonesetOverride":"","backendType":"","version":"-2"},
        "dictionary": "", "voice": {"vocalModeInherited": true, "vocalModePreset": "", "vocalModeParams": {}},
        "voicePresetName": "",
        "takes": {"activeTakeId": 0, "takes": [{"id": 0, "seedDuration": 0, "seedPitch": 0, "seedTimbre": 0, "liked": false}]},
        "timestampLMR": 0, "timestampLRSR": 0
      },
      "groups": []
    },
    {
      "name": "主唱",
      "dispColor": "ff7db235",
      "dispOrder": 1,
      "renderEnabled": false,
      "mixer": {"gainDecibel": 0.0, "pan": 0.0, "mute": false, "solo": false, "display": true, "fxPresetName": "", "fxParams": {}},
      "mainGroup": {
        "name": "main", "uuid": "<vocal-group-uuid>",
        "parameters": {"pitchDelta":{"mode":"cubic","points":[]},"vibratoEnv":{"mode":"cubic","points":[]},"loudness":{"mode":"cubic","points":[]},"tension":{"mode":"cubic","points":[]},"breathiness":{"mode":"cubic","points":[]},"voicing":{"mode":"cubic","points":[]},"gender":{"mode":"cubic","points":[]},"toneShift":{"mode":"cubic","points":[]},"mouthOpening":{"mode":"cubic","points":[]}},
        "vocalModes": {}, "pitchControls": [], "notes": [], "musicalScale": {"type": "Major", "root": "C"}
      },
      "mainRef": {
        "uuid": "<vocal-ref-uuid>", "groupID": "<vocal-group-uuid>",
        "blickAbsoluteBegin": 0, "blickAbsoluteEnd": -1, "blickOffset": 0, "pitchOffset": 0, "mute": false, "isInstrumental": false,
        "database": {"name":"","language":"","phoneset":"","languageOverride":"","phonesetOverride":"","backendType":"","version":"-2"},
        "dictionary": "", "voice": {"vocalModeInherited": true, "vocalModePreset": "", "vocalModeParams": {}},
        "voicePresetName": "",
        "takes": {"activeTakeId": 0, "takes": [{"id": 0, "seedDuration": 0, "seedPitch": 0, "seedTimbre": 0, "liked": false}]},
        "timestampLMR": 0, "timestampLRSR": 0
      },
      "groups": [
        {   // SV2 音符组 = 引用 library 的组（groupID 指向库项），音符不内嵌
          "uuid": "<vocal-group2-uuid>", "groupID": "<library-vocal-uuid>",
          "blickAbsoluteBegin": 0, "blickAbsoluteEnd": -1, "blickOffset": 0,
          "pitchOffset": 0, "mute": false, "isInstrumental": false,
          "database": {"name":"","language":"","phoneset":"","languageOverride":"","phonesetOverride":"","backendType":"","version":"-2"},
          "dictionary": "", "voice": {"vocalModeInherited": true, "vocalModePreset": "", "vocalModeParams": {}},
          "voicePresetName": "",
          "takes": {"activeTakeId": 0, "takes": [{"id": 0, "seedDuration": 0, "seedPitch": 0, "seedTimbre": 0, "liked": false}]},
          "timestampLMR": 0, "timestampLRSR": 0
        }
      ]
    }
  ],
  "library": [
    {   // SV2 音符真正定义在这里
      "name": "主唱旋律", "uuid": "<library-vocal-uuid>",
      "parameters": {"pitchDelta":{"mode":"cubic","points":[]},"vibratoEnv":{"mode":"cubic","points":[]},"loudness":{"mode":"cubic","points":[]},"tension":{"mode":"cubic","points":[]},"breathiness":{"mode":"cubic","points":[]},"voicing":{"mode":"cubic","points":[]},"gender":{"mode":"cubic","points":[]},"toneShift":{"mode":"cubic","points":[]},"mouthOpening":{"mode":"cubic","points":[]}},
      "vocalModes": {}, "pitchControls": [],
      "notes": [
        {"musicalType":"singing","onset":0,"duration":705600000,"lyrics":"la","phonemes":"","accent":"","pitch":60,"detune":0,"attributes":{"evenSyllableDuration":true},"takes":{"activeTakeId":0,"takes":[{"id":0,"seedDuration":0,"seedPitch":0,"seedTimbre":0,"liked":false}]}}
      ],
      "musicalScale": {"type": "Major", "root": "C"}
    }
  ],
  "renderConfig": {"destination":"","filename":"未命名","numChannels":1,"aspirationFormat":"noAspiration","bitDepth":16,"sampleRate":44100,"exportMixDown":true,"exportPitch":false,"bypassPan":false,"bypassGain":false,"bypassEffects":false},
  "projectMixer": {"linkRoomSettings": true}
}
```

**填充要点**
- `uuid` 全部用随机 UUID；**`mainGroup.uuid` 与 `mainRef.groupID` 必须一致**
- **SV2 音符写进顶层 `library[].notes`**；人声轨 `groups[]` 用 `.groupID` 指向 library 项（**引用，不内嵌**）；`mainGroup.notes` 保持 `[]`
- 音频轨 `mainGroup.notes` 也保持 `[]`（音频由 `mainRef.audio` 驱动）
- `audio.bpm`/`beatLocations` 用 BeatTracker 结果：**`beatLocations` 是逐拍秒数数组**（`beatTicks` 那个 ticks 数组是本地分析产物，别直接塞进来）
- 若要**浮动 BPM**：把 `time.tempo` 写成逐段数组（`position` 用 `getBlickFromSeconds(各段起点秒)`，`bpm` 填各段局部 BPM）；拍号变化则加多个 `time.meter` 项（`index` 是小节号）
- **打不开就降 183**（按上面的差异清单删字段）

> 历史样本：本节的骨架来自 `FileRecv/demosvp1.svp`（SV1 · 153）与 `demosvp2.svp`（SV2 · 196）两份对照 + 1005 个真实工程的统计。

## 详解参考
- **`skills/sv-ix/`** —— IX 运行时 API + 技法/互斥矩阵（⚠️ 原 `knowledge/docs/InstrumentX-API枚举.md` **2026-09-19 已搬进该技能并删除**）；另：原 `docs/InstrumentX-ixp格式参考.md` 已并入本 skill（见上文「IX 恢复目录机制 · 解析注意事项」节）
- `knowledge/docs/MIDI转IXP映射表.md` — MIDI→IX 映射规则
- `knowledge/docs/变更记录-音频分析升级.md` — 音频分析/BPM 处理
