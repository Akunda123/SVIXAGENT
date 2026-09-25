# 工程文件结构实测对比：SV1 · SV2 · IX（2026-09-13）

> **来源**：用户新建的三个真实工程（非推测），逐个用 `tools/project-digest.cjs` 读出来的。
> **为什么重要**：`skills/sv-project-format/` 与 `akdagent-playbook` 里的结构断言此前**多是从少数样本外推**（待办 B2 一直标"待复核"）。
> 本文是**对照表**，用于把那批断言逐条钉死或改错。

| 项 | SV1 | SV2 | IX（Instrument X） |
|---|---|---|---|
| 实测样本 | `sv1工程测试.svp`（153） | `123132132132132123.svp`（196） | `dad838b6_…ixp`（**201**） |
| 顶层字段 | `version, time, library, tracks, renderConfig` | `+ uuid, projectMixer` | `+ uuid, projectMixer, loopBegin, loopEnd, loopEnabled` |
| `version` | **153** | **196** | **201** |
| `uuid` | ❌ 无 | ✅ | ✅ |
| `time.startTimeSeconds` | ❌ 无 | ✅ `0.0` | ✅ `0.0` |
| `time.meter[]` | `{index, numerator, denominator}`（**无 position**） | 同左 | 同左 |
| `time.tempo[]` | `{position, bpm}` | 同左 | 同左 |
| **`library`（组定义池）** | ✅ **存在**（本次样本 1 组；空白工程里是 `[]`） | ✅ 存在（28 组） | ✅ 存在（9 组） |
| 音轨字段 | `name, dispColor, dispOrder, renderEnabled, mixer, mainGroup, mainRef, groups[]` | `name, dispColor, dispOrder, renderEnabled, mixer, groups[]` | 同 SV2 |
| **主组存放方式** | **内联在音轨里**：`mainGroup`（组定义）+ `mainRef`（组引用） | **不内联**，走 `groups[]` 里的组引用（含 `isMain`） | 同 SV2 |
| 组引用字段 | `groupID, blickAbsoluteBegin, blickAbsoluteEnd, blickOffset, pitchOffset, isInstrumental, systemPitchDelta, database, dictionary, voice, pitchTakes, timbreTakes` | `name, groupID(或 target), timeOffset, pitchOffset, isMain, muted, voice, …` | 同 SV2 |
| `blickAbsoluteBegin/End` | `0 / -1`（**−1 = 未定/到底**） | 用 `timeOffset` | 同 SV2 |
| 组参数通道 | **8 个**：pitchDelta, vibratoEnv, loudness, tension, breathiness, voicing, gender, toneShift | **9 个**（**多 `mouthOpening`**） | **9 个** |
| 音符字段 | `musicalType, onset, duration, lyrics, phonemes, accent, pitch, detune, instantMode, attributes, systemAttributes, pitchTakes, timbreTakes` | `…, takes{activeTakeId,takes[{id,seedDuration,seedPitch,seedTimbre,liked}]}, scriptData` | 同 SV2，但属性是 `{muted, articulationsFixed}`、**歌词恒空** |
| 音高参数存放 | **音符 `attributes`**（tF0Left/dF0Left/dF0Vbr…/tNoteOffset/dur/strength/rTone/rIntonation/alt/exprGroup） | **`scriptData`**（如 `{dF0Left:2, tF0Offset:-0.035}`） | 同 SV2 |
| 声库/唱法 | `mainRef.database{name,language,phoneset,languageOverride,phonesetOverride,backendType,version:"100"}` + `voice{vocalModePreset, vocalModeParams{Kawaii:100,…}, transposeSemitones/Cents, renderMode}` | `voice{singers, spacing…}`（无 pitch 参数） | 同 SV2 |
| `renderConfig` | `destination, filename, numChannels, aspirationFormat, bitDepth, sampleRate, exportMixDown, exportPitch` | **+ `bypassPan, bypassGain, bypassEffects`** | 同 SV2，但**无 `aspirationFormat`**（无气声概念） |
| 文件尾部 | **有一个 `\0`（NUL）字节** ⇒ 严格 `JSON.parse` 报错 | 无 | 无 |

## 三条结论（可直接改文档/技能）

### 1. ❌ 旧结论作废：**"SV1 没有 `library` 间接层"是错的**

本次 **SV1 真实工程里 `library` 就在顶层**（`[version, time, library, tracks, renderConfig]`）。
此前那条结论是从"用户手上的工程"外推的（而他平常不用 library）⇒ 正是待办 B2 标记的"少数样本外推"典型。
**正确表述**：`library` 是**三端通用**的组定义池；差异只在**主组的存放位置**（SV1 内联 `mainGroup/mainRef`，SV2/IX 走 `groups[]`）。

### 2. ✅ 印证：**曲线点值是"相对 anchor 的偏移量"**（昨晚那条修正）

IX 工程里桥写的真实数据：`{"pos":491803199, "pitch":62, "points":[0,-2.05, 15000000,-2.17, …]}`
—— 点值是**负数偏移**，且同一组另一条曲线点值**全为 0**（= 正好落在 anchor 62）。
⇒ 与官方文档一致，也再次证明：**画图时必须写偏移量**（我写成绝对音高 62.56 ⇒ 62+62.56）。

### 3. ⚠️ SV1 的 `.svp` 尾部带 `\0`

`…"exportPitch": false}}\u0000` —— **严格 `JSON.parse` 会失败**（"Unexpected non-whitespace character"）。
任何读 SV1 工程的代码都必须**先剥尾部空白/NUL**（`tools/project-digest.cjs` 已内置）。

## 附：读工程的三条纪律

1. **先剥尾部 NUL** 再 parse（SV1 必需）；
2. **别假设字段名**：`mainGroup/mainRef`（SV1）与 `groups[].isMain`（SV2/IX）是两套形状，读之前先看 `Object.keys(track)`；
3. **主组要单独看**：SV1 里主组不在 `groups[]` 内，只看 `groups[]` 会得出"没有组引用"的错误结论（我第一次就报错了）。

---

## 🔄 2026-09-14 复核更正（IX 新样本 `ixp测试.ixp` + 桥在线实测）

> 上面那张表是 2026-09-13 用**旧的 IX 样本（recovery 空快照 `dad838b6_…`）**做的，其中 **IX 一列有多处错**。
> 今天用用户新存的 `Documents\Image-Line\FL Studio\Presets\Scores\ixp测试.ixp`（201 · 3 轨 · 4 音符 · 含技法/mic/loop 真实值）
> **同时读文件 + 读宿主 API**（IX 1.0.0 桥在线）复核，更正如下。表内原文保留不改，以本节为准。

| # | 原表说法（错） | 更正（实测） |
|---|---|---|
| 1 | 第 18 行「主组存放：SV1 内联，**SV2/IX 不内联**」 | ❌ **IX 也内联**：`tracks[0].mainGroup` + `tracks[0].mainRef` 都在（三端实测一致）。只看 `groups[]` 会漏掉主组。 |
| 2 | 第 19/20 行「IX 组引用字段同 SV2（`timeOffset`、`isMain`）」「`blickAbsoluteBegin/End` IX 同 SV2」 | ❌ **IX 组引用用的是 SV1 那套**：`blickOffset` / `blickAbsoluteBegin` / `blickAbsoluteEnd`（**不是 `timeOffset`**）。实测 `blickOffset=11.64拍`、`absBegin=10.09拍`、`absEnd=45.74拍`。 |
| 3 | 第 22 行「IX 音符属性只有 `{muted, articulationsFixed}`、**歌词恒空**」 | ⚠️ **属性不止两个**：实测还有 `dynamic`、`articulations[]`、`dF0VbrMod/cTimeDispersion/cPitchDispersion/fF0VbrMod`，且**有 IX 独有的 `dynamics`**（音符级力度包络）。<br>**歌词**：✅ 已定论 —— **API 能写能读、但保存不落盘**。三步证据：文件基线 `lyrics` 出现 0 次 → 桥写 `setLyrics("zq1".."zq4")` 回读正常 → **用户 Ctrl+S 后**文件 mtime 刷新、体积 20017→**22101**、`library` 组数 2→**4**（结构改动都存下了），而 `lyrics`/`zq*` 计数仍为 **0**。⇒ **IX 的歌词是运行时概念，保存即丢，重开工程必空**。 |
| 4 | 第 24 行「IX 声库/唱法同 SV2 `voice{singers, spacing…}`」 | ⚠️ 半对：**API** `ref:getVoice()` = `{performanceDirection, singers}`（改过组级参数再加 `paramLoudness/paramBreathiness`）；**文件**里的 voice 是 `paramLoudness, paramBreathiness, transposeCents, transposeSemitones, performanceDirection, choirNumStems` —— **两侧键集不同**，`transpose*/choirNumStems` API 读不到。⇒ 此前技能里"IX 的 voice 恒为空字典"**作废**。 |
| 5 | 第 10 行「IX 顶层 = `+ uuid, projectMixer, loopBegin/End/Enabled`」 | ✅ 对（另补：`time.startTimeSeconds` IX 也有；**这些工程级 ixp 独有字段 API 侧全都没有**，只能读文件）。 |

### 新增：`.ixp` 字段 ↔ API 双向对照（IX 1.0.0 实测）

| 文件字段 | API | 结果 |
|---|---|---|
| `groups[].blickOffset` | `ref:getTimeOffset()` | ✅ 完全一致（`8213191659`） |
| `groups[].blickAbsoluteBegin` | `ref:getOnset()` | ✅ 一致（`7119511659`） |
| `groups[].blickAbsoluteEnd` | `ref:getEnd()` | ✅ 一致（`32274151659`） |
| `groups[].pitchOffset` / `isInstrumental` | `ref:getPitchOffset()` / `isInstrumental()` | ✅ 一致（`0` / `false`） |
| `notes[].onset/duration/pitch` | `note:getOnset()/getDuration()/getPitch()` | ✅ **组内局部坐标、可为负**（`−0.9` 拍），API 原样返回 |
| `notes[].attributes.*` | `note:getAttributes()` | ✅ 键完全一致 |
| `uuid` · `loop*` · `projectMixer` · `renderConfig` · `mixer.micParams/micPresetName` · `notes[].dynamics` · `notes[].takes` · `mainRef.database` | ❌ **无对应 API**（`getUUID/getLoop*/getProjectMixer/getRenderConfig/getMicParams/getDatabase/getTakes/getDynamics` 逐个探过，全不存在） | 只能读文件 |

**⚠️ 官方文档与实测有出入**：文档说 `getOnset()` = "目标组第一个音符的 onset + time offset"，实测**不成立**
（首音符 −0.9 拍 + 偏移 11.64 拍 = 10.74 拍，而 `getOnset()` 返回 **10.09 拍** = 文件 `blickAbsoluteBegin`）
⇒ **`blickAbsoluteBegin/End` 是独立存储的"入点/出点"（编排视图可单独拖），不能用音符推算**；
**把组内音符换算成工程绝对时间要加 `blickOffset`（= `getTimeOffset()`），不是 `absBegin`**。
（这条同时**结掉了待办 B2 里"非主组 offset 文件字段↔API 对应"的 IX 部分**。）

### 复核工具

```powershell
node tools/diff-project-3ends.cjs            # 三端逐字段对照（取代旧的 diff-sv1-sv2.cjs）
node tools/diff-project-3ends.cjs --table    # 全量矩阵：类|键 × 三端
node tools/project-digest.cjs "<工程文件>"    # 单文件结构摘要（.svp/.ixp 通用）
```

**键总数 115 · 三端都有 52 · 只在 SV1 18 · 只在 SV2 3 · 只在 IX 4 · IX 缺失 15 · SV1 缺失 23。**
明细与逐条说明见技能：`skills/sv-project-format/SKILL.md`「三端逐字段对照」+「`.ixp` 字段 ↔ API 实测对照」。
