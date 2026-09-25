<!--
  Instrument X 运行时 API 枚举（正本）。**这是开发参考，不属于技能** ——
  技能侧只见 `skills/sv-ix/SKILL.md`（IX 实操摘要）与其 `references/技法实测.md`（技法矩阵 / 互斥）。
  历史：2026-09-19 曾整份搬进 sv-ix，同日按用户要求把「枚举」这部分挪回 docs。
-->

> ⚠️ **状态标注（2026-08-28）：官方 API 文档尚未发布/未获取到。**
> 本文件全部结论来自 **Instrument X 1.0.0 实测枚举**（桥脚本 + `Object.getOwnPropertyNames` 沿原型链），
> 属于**实测推断**，可能与官方正式 API 有出入（尤其参数签名、对象属性命名、废弃 API）。
> **待官方文档发布后，需按官方定义逐条校准**，再作为开发依据。
>
> 枚举方式：AKDAgent 桥脚本 + `Object.getOwnPropertyNames` 沿原型链（depth=2，宿主对象方法多为不可枚举，`for...in` 拿不到）。
> 宿主：**Instrument X 1.0.0**（`SV.getHostInfo()` → hostName="Instrument X"，isSV2=true，API 与 SV2 一致）。
> 枚举时间：2026-08-28（AKDAgent 会话内实时枚举）。

---

## 1. 全局对象 `SV`

```
QUARTER, showMessageBox, showOkCancelBox, showYesNoCancelBox, showInputBox,
showCustomDialog, create, finish, getProject, getMainEditor, getArrangement,
getPlayback, setTimeout, getHostInfo, getHostClipboard, setHostClipboard,
getPhonemesForGroup, getComputedAttributesForGroup, getComputedPitchForGroup,
showMessageBoxAsync, showOkCancelBoxAsync, showYesNoCancelBoxAsync, showInputBoxAsync,
showCustomDialogAsync, T,
blick2Quarter, quarter2Blick, blick2Seconds, seconds2Blick, blickRoundDiv, blickRoundTo,
freq2Pitch, pitch2Freq, blackKey,
scaleTypes, automationTypes, parameterTypes, scaleNotes, articulationTypes,
dynamicLevels, performanceDirections, print, refreshSidePanel
```

### 常用方法签名（SV2 同款）
| 方法 | 说明 |
|---|---|
| `SV.getProject()` | 工程对象 |
| `SV.getMainEditor()` | 主编辑器 |
| `SV.getPlayback()` | 播放控制 |
| `SV.getArrangement()` | 编排视图（选择/导航） |
| `SV.getHostInfo()` | `{osType, osName, hostName, hostVersion, hostVersionNumber, languageCode}` |
| `SV.getHostClipboard()/setHostClipboard(s)` | 读写宿主剪贴板（桥脚本通信基础） |
| `SV.blick2Seconds / seconds2Blick / blick2Quarter / quarter2Blick` | 时间单位换算 |
| `SV.QUARTER` | 四分音符 blick 数（705600000） |
| `SV.freq2Pitch / pitch2Freq` | 频率↔MIDI 音高 |
| `SV.T("...")` | 本地化字符串 |

---

## 2. `SV.getProject()` — Project

```
getParent, isMemoryManaged, setScriptData, getScriptData, hasScriptData, removeScriptData,
getScriptDataKeys, clearScriptData, newUndoRecord,
getNumNoteGroupsInLibrary, getNumTracks, getTimeAxis, getFileName, getDuration,
getTrack, getNoteGroup, addNoteGroup, removeNoteGroup, addTrack, removeTrack
```

⚠️ **写操作必须先 `newUndoRecord()`**（AKDAgent 协议强制要求）。

---

## 3. `getProject().getTimeAxis()` — TimeAxis

```
clone, getMeasureAt, getMeasureMarkAt, getMeasureMarkAtBlick, getTempoMarkAt,
getSecondsFromBlick, getBlickFromSeconds, getAllMeasureMarks, getAllTempoMarks,
addTempoMark, removeTempoMark, addMeasureMark, removeMeasureMark
```

返回的 mark 对象（真实可读）：
- **TempoMark**: `position`(blick), `positionSeconds`, `bpm`
- **MeasureMark**: `position`(blick), `positionBlick`, `numerator`, `denominator`

---

## 4. `SV.getMainEditor()` — MainEditor

```
getSelection, getCurrentTrack, getCurrentGroup, getNavigation,
setCurrentTrack, setCurrentGroup,
getSupportedArticulations, getArticulationState, setArticulation, clearArticulations,
setSmartArticulation, rewriteSelection
```

---

## 5. `getMainEditor().getCurrentGroup()` — NoteGroup

```
clone, getIndexInParent, isMain, isInstrumental, getTimeOffset, getPitchOffset,
getOnset, getEnd, getDuration, getTarget, getVoice,
setTarget, setTimeOffset, setPitchOffset, setTimeRange, setVoice,
isMuted, setMuted
```

---

## 6. `NoteGroup.getTarget()` — 音符容器（最关键）

```
clone, getIndexInParent, getName, getUUID,
getNote(i), getNumNotes(), getAutomation(type), getParameter(type), getScale, setScale,
setName, addNote, removeNote,
getPitchControl(i), getNumPitchControls, addPitchControl, removePitchControl
```

⚠️ `getAutomation`/`getParameter` **是同一个函数**（`getParameter` 为 SV2 废弃别名，错误信息一致）。
参数是**字符串类型名**，不是数字索引；有效类型：`loudness`、`tension`、`breathiness`、
`vibratoEnv`、`gender`、`toneShift`、`dynamics`、`pitchDelta`、`voicing`。
`getPitchControl(0)` 在当前组无控制点时抛"越界访问"。

---

## 6.1 `Note` 对象（`target.getNote(i)`）

```
getLyrics, getPhonemes, getRapAccent, getMusicalType, getPitchAutoMode, getLanguageOverride,
getPitch, getDetune, getOnset, getEnd, getDuration, getAttributes, getArticulations,
getDynamic, getRetakes,
setLyrics, setRapAccent, setMusicalType, setLanguageOverride, setPhonemes,
setOnset, setDuration, setTimeRange, setPitch, setDetune,
setArticulations, setDynamic, setAttributes
```

**创建音符（与 SV2 不同！）**：`SV.create('Note', propsObject)` 用**对象属性**形式，
属性名是 `onset`/`duration`/`pitch`/`lyrics`（不是 SV2 的 `onsetQuarter` 等），
且 `duration` 传了可能不生效，需再 `setDuration(blick)`。例：
```js
var n = SV.create('Note', { onset: 0, pitch: 60, lyrics: 'la' });
n.setDuration(SV.QUARTER);
target.addNote(n);
```

**子对象**：
- `getAttributes()` → `{ muted, articulations, articulationsFixed }`（3 个字段，无方法）
- `getRetakes()` → Retakes 管理器：`getNumTakes, generateTake, deleteTake, setActiveTake`
- Note 层**没有** `getAutomation`/`getParameter`/`getPitchControl`（那是 Target 层的）

---

## 6.2 Automation 对象（`target.getAutomation('loudness')` 等）

```
getType, getDefinition, getInterpolationMethod, get, getLinear, getPoints,
getAllPoints, simplify, add, remove, removeAll
```

实测（Instrument X 1.0.0）：
- `getType()` → `"loudness"`；`getInterpolationMethod()` → `"linear"`
- `getDefinition()` → `{ displayName, typeName, range, defaultValue }`
- **单值读写安全**：`get(x)`（无点返回默认值）、`add(x, value)`、`removeAll()` 均正常，
  `add(0, 0.5)` 后 `get(0)` → `0.5`
- ✅ **读点/定义：宿主内直接调（IX ≥ 1.0.1）** —— `getAllPoints()`（**0 参**）· `getPoints(start, end)`（**2 参**）·
  `getLinear(blick)`（**1 参**）· `get(blick)`（1 参）· `getDefinition()`（0 参，返回 `{displayName, typeName, range, defaultValue}`）。
  返回的是**普通嵌套数字数组**（实测 `getAllPoints()` → `{{0,-800},{1411200000,0},{2822400000,800}}`，原样序列化 **319ms**；
  `range` → `[-800,800]`，**252ms**）⇒ **可安全回传**。
- ⚠️ **参数个数必须对**：写错只抛 `InvocationError`（消息写明「预期 N 个参数」），**不冻桥**。
- 🔴 **IX 1.0.0 上这些调用会冻住宿主**（弹模态框挡住 Lua 主线程，与 `SV-001` 同机制；1.0.1 改成抛错）
  ⇒ **本项目只保留一道防线：版本检测** —— 桥在 `ping`/心跳/boot 报 **`hostOutdated`**，**见到就先让用户升级宿主再做读点类操作**。
  完整证据与复检方案见 `known-bugs` 的 **IX-001**。

### 6.2.1 实测：`.ixp` 里 automation 点存储格式（安全读法）
`library[]` 里每个音符组的 `parameters.<type>` 对象：
```json
"vibratoEnv": {"mode":"linear", "points":[1148865432, 1, 1159890432, 0.7111111, ...]}
```
- **`points` 是扁平交替数组 `[x0,y0, x1,y1, x2,y2, ...]`**（不是 `[{x,y}]` 对象数组！相邻两元素 = 一个点）。
- `x` = **绝对 blick 时间**（如 `1148865432`）；`y` = 参数值（单位随类型：loudness 为 dB，breathiness 为粗粝度）。
- **不能用 `Object.keys(points[i])` 读点**——它输出 `[]`（点是源生数字，非对象），必须按 `i%2` 交替取值。
- 第一轨（Orchestral Piccolo 1，"音符组 5"）实测点分布：
  `vibratoEnv`=38 点（y 0.71~1.29 波动）、`loudness`=50 点（y 从 0 渐降到 -34dB 再回升，音量包络）、
  `breathiness`=46 点（y 从 0 渐降到 -2 再回升）；其余（pitchDelta/tension/voicing/gender/toneShift/mouthOpening）=0 点。

**读 automation 的正确姿势**：解析磁盘 `.ixp` → `tracks[i].groups[].groupID` → `library[该uuid].parameters.<type>.points`，
用扁平交替数组解出 `(x,y)`。**不要在宿主内调 `getPoints/getAllPoints/getLinear/getDefinition`**（会闪退）。

### 6.2.2 音符级 `dynamics` 力度包络格式（新发现，区分 automation）
> 除了组级 automation，**每个音符顶层还有一个 `dynamics` 字段——这是音符内部的力度包络曲线**（mode=cubic）。
> 这才是"dynamic 有没有包络曲线"的正确载体。实测于第一轨（Orchestral Piccolo 1，"音符组 5"）。

音符对象（`library[].notes[]`）顶层：
```json
"dynamics": {
  "mode": "cubic",                                    // 插值模式 = cubic（三次样条）
  "points": [0, 0, 171567123, 0.0928, 705600000, 0.2684]  // 扁平交替 [x,y,x,y,...]
}
```
- **位置**：音符**顶层**键（`dynamics`），**不是** `attributes` 里那个 `dynamic`（标量值）。
- **`mode`**：实测为 **`"cubic"`**（三次曲线插值）。
- **`points`**：扁平交替数组 `[x0,y0, x1,y1, ...]`（同 automation）。
  - `x` = **音符内相对 blick 时间**（0=音符起点；`705600000`=音符全长，即 `SV.QUARTER`=1 拍）。
  - `y` = **相对 `attributes.dynamic` 的偏移**（可为负数，表示该时刻比标量力度弱；正数=强）。
    ⭐ **范围（2026-09-21 · 408 条真实曲线全量核对）**：**`y ∈ [−dynamic, 1−dynamic]`**，也就是「**绝对力度 = `dynamic + y` ∈ [0, 1]**」；
    两端都有精确命中样本（例：`dynamic=0.578` ⇒ `min=−0.578`、`max=+0.4220`）。⚠️ 本行早先写的「范围约 −0.13 ~ +0.27」只是**当时几个样本的观测值**，**不是边界**。
  - `mode` 实测有 **`linear`** 与 **`cubic`** 两种（同一工程里可并存）。
    ⭐ **2026-09-21 实测：宿主载入时会把 `cubic` 归一成 `linear`** —— 把 `cubic` 写进文件 → 用户重载 → recovery 快照**立刻是 `linear`** → 再 **Ctrl+S** ⇒ **保存后的文件也是 `linear`**（sha256 变化、两条都变）。
    ⇒ **用文件路线写曲线一律用 `linear`**（`tools/ixp-dynamics.cjs` 的默认值就是它）；`cubic` 只在「**画完就存、不经重载**」时保留（这解释了真实工程 `gemee.ixp` 的 388 linear / 4 cubic）。
  - 🆕 **工具（2026-09-21）**：`node tools/ixp-dynamics.cjs <file.ixp>` 校验（y 规则 / `x ∈ [0, duration]` / x 递增 / mode / 点数成对）；
    `--write --file … --pitch … --base … --points "t:绝对值,…" [--mode linear|cubic] --apply` 走**文件路线**写曲线（**外科式插入** + 自动 `.bak` + 写后自检，避免整文件 JSON 往返重排；`--mode` **默认 `linear`** —— 与宿主常态一致、点间不超调）；
    守卫 `node tools/check-ixp-dynamics.cjs`（自带正负向自测，可追加真实工程路径）。
  - ⛔ **克隆路线：探明后已否决（2026-09-21 · 用户裁定「不复制」）**：`Note#clone()` **确实会连同 `dynamics` 包络一起复制**（克隆副本 Ctrl+S 后文件里逐点一致、连 `scriptData` 都带），但复制的是**整个音符状态** —— 对"脏模板"（`setArticulations({Staccato,Tenuto})` + `setAttributes({muted=true})` + `setDetune(500)` + `setLanguageOverride('ja')` + `setScriptData`）克隆两次，两个副本一律带 `articulationsFixed=true | muted=true`、`scriptDataKeys=[akdagentDirty]` ⇒ **无关内容一模一样照搬**，要干净得逐项清洗。
    ⇒ **本仓不采用克隆写包络**：要么**等官方 API 更新**（`IX-002` 的复检触发 = 只跟官方文档），要么走 **`.ixp` 文件路线**。
    （留档备查：`local dup = tpl:clone(); dup:setTimeRange(onset, dur); dup:setPitch(p); g:addNote(dup)`；⚠️ 包络的 `x` 是音符内相对 blick、克隆**不随音符长度缩放**。）
    ⛔ **仍然没有「直接设定」包络的 API**：`setDynamics` / `getDynamics` / `*Curve` / `*Envelope` 在 IX 1.0.1 上**不存在**，10 种 `setAttributes` 写法全被静默忽略、`getAttributes()` 也读不到曲线（见 `tools/known-bugs.json` 的 `IX-002`）。
- **只有设了力度曲线的音符才带 `dynamics` 字段**；未设则无此键（如第一轨音符 8/9/10 无）。

第一轨各音符 `dynamics` 曲线（cubic）示例：
```
note0 TrillMinor      : [0,0 → 171567123,0.093 → 705600000,0.268]   渐强
note3 Slur            : [0,0 → 289972602,-0.015 → 705600000,-0.128] 连音下滑
note5 Staccato+Breath : [0,0 → 449457534,-0.052 → 705600000,-0.042]
note7 (无技法)         : [0,0 → 343134246,0.143]
```

### 6.2.3 三个"力度"概念区分（避免混淆）
| 层级 | 字段 | 形态 | 含义 | 范围 |
|---|---|---|---|---|
| **音符力度值** | `note.attributes.dynamic` | 标量 | 音符整体响度 | [0,1] |
| **音符力度曲线** | `note.dynamics` | cubic 曲线 | 音符内随时间变化（如起音冲高/渐强/下落）| y=偏移 ±0.27 |
| **组级响度包络** | `group.parameters.loudness` | linear automation | 跨音符整体响度（Gain）| dB [-48,24] |

> ⚠️ 三者名近义不同：`dynamic`（标量） / `note.dynamics`（音符内曲线，cubic） / `parameters.loudness`（组级 Gain 曲线）。
> 读"力度包络"要看**音符级 `notes[].dynamics`**（cubic）;读"整体响度随时间"看**组级 `parameters.loudness`**（linear）。

---

## 7. `getCurrentTrack()` — Track

```
clone, getIndexInParent, getName, getDisplayColor, getDisplayOrder, isBounced,
getNumGroups, getDuration, setName, setDisplayColor, setBounced,
getGroupReference, addGroupReference, removeGroupReference, getMixer
```

---

## 8. `Track.getMixer()` — Mixer

```
type, getIndexInParent, getGainDecibel, getPan, getFxParams, isMuted, isSolo,
setGainDecibel, setPan, setMuted, setSolo, setFxParams
```

---

## 9. `getMainEditor().getSelection()` — Selection

```
hasUnfinishedEdits, hasSelectedContent, clearAll,
registerSelectionCallback, registerClearCallback,
hasSelectedGroups, getSelectedGroups, selectGroup, unselectGroup, clearGroups,
hasSelectedNotes, getSelectedNotes, selectNote, unselectNote, clearNotes,
getSelectedPoints, selectPoints, unselectPoints,
hasSelectedPitchControls, getSelectedPitchControls, selectPitchControls,
unselectPitchControls, clearPitchControls
```

---

## 10. `getMainEditor().getNavigation()` — Navigation

```
getTimeViewRange, getValueViewRange, getTimePxPerUnit, getValuePxPerUnit,
x2t, y2v, t2x, v2y, snap,
setTimeLeft, setTimeRight, setTimeScale, setValueCenter
```

---

## 11. `SV.getPlayback()` — Playback

```
getPlayhead, getStatus, seek, play, pause, stop, loop
```

> 🔑 **`loop(tBegin, tEnd)` 就是 ixp 里 `loopBegin/loopEnd/loopEnabled` 的 API 入口**
> （用户 2026-09-14 澄清）—— 这三个字段**在 `Project` 上探不到**（`getLoop*` 不存在），循环控制在 **PlaybackControl** 上。

---

## 11.1 ⭐ 2026-09-14 补充：UI 能画什么 vs 写进去算不算数

用户实测（听感判据，方法见 `skills/sv-project-format` 的「判据本身怎么立」）：

| 通道 | UI 可画 | 渲染认不认 |
|---|---|---|
| `loudness` · `vibratoEnv` · `breathiness` | ✅ 原生可画 | ✅（原生参数道） |
| `pitchDelta` · `toneShift` | ❌ 只能走 API | ✅ **实测有效** |
| `voicing` · `gender` · `tension` · `mouthOpening` | ❌ | ❌ **实测无效**（API 能写能读、能保存，渲染不认） |
| 音符级 `dynamics` | — | ✅ **算**，但 **不能直接设、也读不到**（无 getter/setter；2026-09-21 在 1.0.1 上复检 10 种写法仍全被忽略，`getAttributes()` 也读不到曲线）；`clone()` 虽能复制包络但**会连无关字段照搬 ⇒ 用户已否决** ⇒ **等官方 API 或改 `.ixp` 再重载**（**工具**：`node tools/ixp-dynamics.cjs --write … --apply`） |

其它同日澄清的接口语义：

- **官方 API 文档目前只覆盖 Synthesizer V，没写 Instrument X**（用户 2026-09-14 指出）⇒ **IX 侧一律以实测为准**，
  "文档里没有"**不等于**"IX 没有"（反之文档有也未必在 IX 生效）。
- **音符级 `dynamics` 曲线：API 写不了**（三条路全试完）——① `setAttributes({dynamics=…})` 静默忽略（8 种形状）；
  ② `setAttributes({dynamic=<表>})` 该键认但只收数字（表被强转成 0）；③ `setScriptData("dynamics", {…})` 会落盘，
  但只是脚本私有数据，宿主不当包络用。**唯一通路 = 改 `.ixp` 再重载**。
  结构：`{mode:"cubic", points:[x0,y0,x1,y1,…]}`，**x = 音符内相对 blick（0…duration）**、**y = 相对 `attributes.dynamic` 的偏移**、不画就没有该键。
- **`dynamic`（标量 0~1）可写**：`setDynamic(v)` / `setAttributes({dynamic=v})`，保存后文件里是 `attributes.dynamic`。
- **`scriptData`（note/group/project 级）可用且持久化**：`setScriptData(k,v)` 支持表/字符串/数字，会写进 `.ixp`
  （音符顶层出现 `scriptData` 键）；宿主**不解释**其内容 ⇒ 适合挂自定义元数据。
- **`Track:clone()` 会共享**：克隆轨与原轨共享组对象 ⇒ 改副本会污染原轨（要独立就必须另建组并换引用）。
- **`NoteGroupReference:setTarget()` 只能在目标未确定时 set**（文档有写）：已有目标改不动（静默失败）⇒ 用"删旧引用 + 新建引用"。
- **`isInstrumental` = 音频轨**（SV 命名残留，IX 同义）。
- **`pitchControls` 在 IX 可用**：`addPitchControl`/`getPitchControl`/`getNumPitchControls`/`removePitchControl` 全在；
  实测画成 28 条曲线 / 165 点、图案完整（详见 `skills/sv-pit-art`）。

---

## 12. 当前工程实测状态

- 轨道数：1
- 音符组库：0
- 当前组音符数：0（空白工程）
- tempo mark：1 个（默认 120bpm）
- measure mark：1 个

---

## 13. Instrument X 与 SV2 的差异（实测完整清单）

### 13.1 创建/构造对象

| 项目 | SV2 | Instrument X 实测 |
|---|---|---|
| `SV.create('Note', ...)` | 多参数展开：`(onsetQuarter, durationQuarter, pitch, lyrics)` | **对象属性形式**：`( {onset, duration, pitch, lyrics} )`；且 `duration` 传了不生效，需再 `setDuration(blick)` |
| `SV.create` 的参数提示 | 按类型 | `createArity = 0`，无参数提示，只能探测 |
| 属性命名 | 驼峰（`onsetQuarter`/`durationQuarter`） | **小写**（`onset`/`duration`/`pitch`/`lyrics`） |

### 13.2 音符容器 / 自动化

| 项目 | SV2 | Instrument X 实测 |
|---|---|---|
| `target.getAutomation(type)` | 用 `SV.parameterTypes` 常量（枚举值） | **字符串类型名**：`loudness`/`tension`/`breathiness`/`vibratoEnv`/`gender`/`toneShift`/`dynamics`/`pitchDelta`/`voicing`；数字索引全部报 `unknown automation type` |
| `target.getParameter(type)` | 独立 API | **与 `getAutomation` 是同一函数**（错误信息完全一致，为废弃别名） |
| `Automation.getPoints(start,end)`/`getAllPoints()`/`getLinear(blick)` | 返回 JS 数组 | **同样返回普通数组，可安全序列化**（IX ≥1.0.1；⚠️ 参数个数：2 / 0 / 1，写错抛 `InvocationError`）。**IX 1.0.0 上会冻桥** ⇒ 版本检测见 §14 |
| `Automation.remove(b)` / `remove(begin,end)` | 两个重载 | **与 SV2 同构**（官方文档两重载都写了；按 blick 删、返回布尔）；实测 IX 1.0.1 正常。⚠️ **IX 1.0.0 上会冻桥** ⇒ 靠 `hostOutdated` 版本检测 |
| `Automation.get(x)/add(x,v)/removeAll` | 正常 | 正常（`add(0,0.5)` 后 `get(0)`→`0.5`；`removeAll` 安全） |
| `Automation.getDefinition()` | 正常 | 正常：`{displayName, typeName, range, defaultValue}`；`range` 是**普通 `[min,max]` 数组**（宿主权威范围，可用来校表） |
| `Note.getAttributes()` | 方法较多的对象 | 仅 **3 个字段** `{muted, articulations, articulationsFixed}`，无方法 |
| Note 层 `getAutomation/getParameter/getPitchControl` | — | **不存在**（这些是 Target 层 API；Note 只有 `getRetakes()`/`getAttributes()`） |

### 13.3 组 / 轨道管理

| 项目 | SV2 | Instrument X 实测 |
|---|---|---|
| `p.addNoteGroup(name)` | 传字符串名 | **必须传 NoteGroup 对象**（`类型错误 (预期为 'NoteGroup' 类型)`） |
| 主组（main group）加音符 | 允许 | **禁止**：`notes cannot be added to a track's main group`，必须先建普通组 |
| `getCurrentGroup().getVoice()` | — | 仅 2 字段 `{singers, performanceDirection}`，`singers` 是数字（1） |
| `getTarget().getScale()` | — | 仅 2 字段 `{type, root}` |

### 13.4 常量 / 宿主环境

| 项目 | SV2 | Instrument X 实测 |
|---|---|---|
| `SV.scaleTypes/automationTypes/parameterTypes/articulationTypes/dynamicLevels/performanceDirections` | 可枚举常量表 | **返回空/不可枚举**（宿主常量不暴露），枚举不到 |
| `SV.getHostInfo().hostName` | `"Synthesizer V Studio"` 系列 | `"Instrument X"`（AKDAgent 据此判定 isSV2=true） |
| 脚本目录 | 安装目录有 scripts/ | `C:\Program Files\Instrument X` **无开放脚本目录**，桥脚本须从 SV 侧/打包 assets 手动运行 |

### 13.5 一致的部分（确认无差异）

- 全局 `SV` 方法集（`getProject/getMainEditor/getPlayback/getArrangement/getHostInfo`、`blick2Quarter` 等换算）
- Project / TimeAxis / Track / Mixer / Selection / Navigation / Playback 方法集
- TempoMark/MeasureMark 字段
- 时间单位 blick（`SV.QUARTER` 存在）
- 写操作须 `newUndoRecord()`

---

## 14. 桥脚本开发安全守则（Instrument X）

1. 写操作必须先 `SV.getProject().newUndoRecord()`。
2. **版本检测（唯一保留的防线）**：桥在 `ping`/心跳/boot 里报 **`hostOutdated`** ⇒ **IX 1.0.0 上读点类 API 会冻住宿主**（弹框挡 Lua 线程）⇒ **先让用户升级到 ≥1.0.1**，再做读点类操作。1.0.1 起这些 API 正常（见 §6.2）。
3. **删点**（官方 `Automation.md` 有**两个重载**）：`remove(b)` 删**位置 b（blick）处那个点**、`remove(begin, end)` 删区间内所有点，均返回布尔 —— **该位置/区间没有点就返回 `false`**（不是"接口坏了"，`b` 是 blick 不是序号）；别只看返回值，要 `getAllPoints()` 回读。`removeAll()` 清空。实测 IX 1.0.1 全程 69ms 无冻桥。
4. 建测试音符前先确认组不是 main group（`g.isMain()`），main group 加音符会抛错。
5. 创建对象一律用 `SV.create('Type', {props})` 对象形式，属性名以小写开头（`onset` 而非 `onsetQuarter`）。
6. 宿主重启后桥脚本必须重新手动运行（**现役 = `AKDAgentBridge.lua`**，装在 `<宿主 scripts>\Agent\`；脚本菜单里点一次）。

---

## 与 SV2 的差异

- **API 集合与 SV2 完全一致**（本枚举得到的每个对象方法名都能在 SV2 文档找到对应）。
- `getHostInfo().hostName` = `"Instrument X"`（AKDAgent 靠它判定宿主类型 → isSV2=true 强制启用）。
- Instrument X 安装目录（`C:\Program Files\Instrument X`）**没有开放脚本目录**；桥脚本必须从
  SV 侧（`OPSV\Dreamtonics\Synthesizer V Studio\scripts\Agent\AKDAgentBridge.lua`）或
  打包资源的 assets 里手动运行（**现役桥是 `.lua`**；`.js` 是已退役的剪贴板桥）。

---
