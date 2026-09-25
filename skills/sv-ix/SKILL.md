---
name: sv-ix
description: Instrument X（IX）宿主实操手册 —— IX 与 SV2 的**运行时 API 差异**、**桥脚本安全守则**（哪些 API 会卡死/闪退宿主），以及 IX 独有的**音符技法（articulations）**全套：13 种技法全集 · **每乐器支持矩阵**（Tremolo 震音 / Trill 颤音 · 12 轨实测）· **技法互斥矩阵** · 「写入成功 ≠ 真实可用」（以 `getArticulationState().incompatible` 为准）· 弱音器（Straight/Cup/Stem，仅铜管）· 弦乐演奏开关（奏法/技巧/弱音三组单选、组间可叠加）· `.ixp` 里技法怎么存。触发：Instrument X 怎么用、IX 能不能做某某技法、articulations 怎么设、震音 Tremolo、颤音 Trill / Trill Major / Trill Minor（大小颤音）、弱音器 mute / Cup / Stem / Straight、弦乐开关 Con Sordino / Pizz. / C. Legno / Bridge / Fingerb.、IX 与 SV2 有什么区别、IX 上 main group 不能加音符、IX 里 `SV.create` 怎么传参、`getAutomation` 用什么类型名、getSupportedArticulations / getArticulationState、IX 技法写进去没生效。
version: 1.0.0
---

# Instrument X（IX）实操

> **这份技能管什么**：在 **Instrument X** 这个宿主上干活时**与 SV2 不同的那一半** —— API 差异、安全守则、**技法（articulations）**。
> 分工：**本技能** = IX 运行时 API 与技法；**`sv-project-format`** = `.ixp` 磁盘文件字段（含技法在文件里的存储）；**`sv-scripting/api/`** = 官方脚本手册（SV 侧，别往里写自研内容）；**`akdagent-playbook`** = 干活流程与踩坑。

**数据来历**（都是实测，不是推断）：`.ixp` 样本 `ixptest.ixp`（12 轨管弦）+ 运行时枚举（`getSupportedArticulations()` / `getArticulationState()`）· 2026-08-30 与 09-14 两轮。

## 0. 三句话上手

1. **IX 的 API 集合与 SV2 几乎一致**，差异集中在**构造对象的方式**、**自动化用字符串类型名**、**常量表不暴露**、**main group 禁写**（详见 §3）。
2. **技法（articulations）是 IX 最有价值的部分**：管弦 12 轨实测支持哪些技法有矩阵（§2.2），**但"写进去成功"不等于"能用"** —— 权威判据是 `getArticulationState().incompatible`（§2.4）。
3. ⭐ **先查文档，再调用**：IX 的 API 面**与 SV2 同构**（实测 `Automation` 一族签名与官方镜像**逐条吻合**）⇒ 调用前先 `node tools/api-lookup.cjs Automation#getPoints`；**官方镜像里没有的**（IX 特有）才查 `knowledge/docs/InstrumentX-API枚举.md`。⛔ **别靠真机试错**（会弹框冻桥，见 §1）。
4. **有几条 API 碰了就卡死/闪退宿主**（§1），先读安全守则再动手。

## 1. ⛔ 桥脚本安全守则（IX 侧，实测）

1. 写操作**先** `SV.getProject().newUndoRecord()`。
2. **读 automation 点：宿主内直接调就行**（IX ≥ **1.0.1**）—— `getAllPoints()`（**0 参**，一把拿全部折点）· `getPoints(start, end)`（**2 参**）· `getLinear(blick)`（**1 参**）· `get(blick)`（1 参）；返回的是**普通嵌套数字数组** `{{位置,值},…}`，**可原样 `return`**（实测序列化 319ms 正常）。⚠️ **参数个数写错会抛 `InvocationError`**（消息里写明「预期 N 个参数」，照它改）。⚠️ **IX 1.0.0 上这些调用会冻住宿主**（弹模态框挡住 Lua 主线程，与 `SV-001` 同机制）⇒ **本项目只保留这一道防线 = 版本检测**：桥在 `ping`/心跳/boot 里报 **`hostOutdated`**，**见到就先让用户升级 Instrument X（≥1.0.1）**，再做读点类操作。
3. **删点按 blick 删**（官方语义，见 `skills/sv-scripting/api/Automation.md`）：`remove(b)` 删**位置 b 处那个点**（返回布尔）· `remove(begin, end)` 删区间内所有点 · `removeAll()` 清空。⚠️ **`b` 是 blick 不是序号** —— `remove(1)` 返回 `false`，是因为 blick 1 上**本来就没有点**（文档原话 "if there is one"），**不是"接口坏了"**；**别只看返回值，要 `getAllPoints()` 回读**。2026-09-20 实测（IX 1.0.1，自造 4 个点逐形式打）：`remove(0)`→`true` 点真没、`remove(2*Q)`→`true`、`remove(1)`→`false`，**全程 69ms、无冻桥**。
4. **main group 不能加音符**：`notes cannot be added to a track's main group` ⇒ 先建普通组（我们的 `write_chords` / `create_harmony_group` 本就是新建组）。
5. **构造对象用对象形式 + 小写属性**：`SV.create('Note', {onset, duration, pitch, lyrics})`；`duration` 传了可能不生效，需再 `setDuration(blick)`。
6. 宿主重启后桥脚本要**重新手动运行**（脚本菜单点一次）；Lua 桥常驻，改完要 `stop` 再重跑。
7. **别对「主组」调 `selectGroup`**（实测 2026-09-20）：对主组引用调 `editor:getSelection():selectGroup(主组)` 会抛 `InvocationError … 无法选择主音符组`，**但当前组可能因此变成主组** ⇒ 之后任何「写当前组」的 op（`write_pit` / `set_note_*` / `fill_track_lyrics` 等）都会被写守卫拒（`isMain=true`）。⚠️ **机制未隔离**（可能是那次报错调用的副作用）；要在主组上写就**先新建普通组**。

## 2. 技法（articulations）

### 2.1 存在哪、怎么写

- 每个音符：**`note.getAttributes()`** → `{muted, articulations, articulationsFixed}`（IX 上只有这 3 个字段，没有方法）。
- 写法：`note.setArticulations([...])`（字符串数组）；`.ixp` 里落在 `attributes.articulations`。
- **顺位由宿主决定**：**通用奏法在前、弱音器/弦乐开关在后**（实测：传 `['Pizz.','Staccato']` 回读成 `["Staccato","Pizz."]`）。
- 组合可以是单/双/三值：`["Staccato","Slur"]`、`["Accent","Slur","Fall"]`、`["Doit"]`；顺序有意义。

### 2.2 每乐器支持哪些技法（⭐ 本技能最常被问的一条）

**Tremolo（震音＝同音快速重复）支持的**：Piccolo · Flute · Trumpet · **Viola**。
**Trill（颤音＝两音交替）支持的**：Piccolo · Flute · Oboe · Clarinet · Bassoon · Viola。

> ✅ **2026-09-21 整轮复验**（17 轨 · 全管弦 + 1 条空乐器对照 · 工具 `node tools/probe-ix-articulations.cjs --caps`）：
> 本矩阵**逐条复现**（含 Tremolo/Trill 支持者名单），并补齐弦乐三件 —— **Violin / Cello / Contrabass 与 Viola 同为 16 项**
> （`Staccato·Tenuto·Accent·Slur·Portamento·Tremolo·Breath·Harmonics·Fall·Con Sordino·C. Legno·Pizz.·Bridge·Fingerb.·Trill Major·Trill Minor`）
> ⇒ **弦乐四件支持集完全相同**。
> ⛔ **对照：未指定乐器的轨 = 0 项**（**不是**"通用全集 8 项" —— 旧说法把一条 Piccolo 轨当成了空乐器轨；详见 `references/技法实测.md` §0.5-B）。

> ⚠️ **`Tremolo` ≠ `Trill`，别混**：前五种木管都支持 **Trill**，但**只有 Piccolo / Flute 支持 Tremolo**；Oboe / Clarinet / Bassoon **不支持 Tremolo**。
> ⚠️ **"颤音大小"不是数值滑块**，而是 `Trill Major`（大二度交替）/ `Trill Minor`（小二度交替）**两个各自独立的技法键**（✅ 二者「**互斥**」**已于 2026-09-21 坐实**：正解"**只设一个**再读" —— 设 `Trill Major` ⇒ `incompatible` 含 `Trill Minor`，反向同理；但**写入层不拦**、两者能并存）；IX 上**没有** `trillDepth` / `tremoloRate` 这类 automation（写了报 `unknown automation type`）。整体振音强度才是 automation：`vibratoEnv`，range **[0,2]**，默认 1。

完整 12 轨支持全集与逐音符序列 → **`references/技法实测.md` 的 §3.1 / §5**。

### 2.3 弱音器 / 弦乐开关（都在同一个 `articulations` 数组里）

- **弱音器（仅铜管）**：`Straight`（直音）/ `Cup`（杯形）/ `Stem`（梗形）；与技法**同数组、可叠加**（如 `["Staccato","Stem"]`）。
- **弦乐（Violin/Viola/Cello/Contrabass）三组「单选互斥」开关**，**组间可叠加**：

| 维度 | 选项（UI → 存储键）|
|---|---|
| 奏法组 | 常规（无键）/ 弓奏 `C. Legno` / 琴桥 `Bridge` |
| 技巧组 | 常规（无键）/ 指板 `Fingerb.` / 拨奏 `Pizz.` |
| 弱音（独立开关）| 无 / 有弱音 `Con Sordino` |

⇒ 一个音符的 `articulations` = **各维度"选一或选默认"之和**（例：`["Con Sordino","Fingerb."]`），再叠加通用奏法（断音/持音/重音/连音/滑音/震音/泛音…）。Viola 的 `getSupportedArticulations()` 返回 16 项，其中弦乐专属 5 项。

### 2.4 ⭐ 「写入成功 ≠ 真实可用」（最容易误报的一条）

- `setArticulations([...])` **几乎不拒绝任何组合**（宿主照单全收，甚至 `['Trill Major','Trill Minor']` 也写成功、回读并存）。
- **能不能用**只有一个权威判据：**选中音符后读 `getMainEditor().getArticulationState().incompatible`**。
- **互斥规律**：冲突集中在**"同音性/姿态类"**之间 —— `Staccato` ⇄ `Tremolo`/`Trill*`；`Tremolo` ⇄ `Staccato`/`Slur`/`Portamento`/`Trill*`；**`Trill Major` ⇄ `Trill Minor`（已坐实）**；而 **`Accent` / `Breath` / `Stopped` 与谁都不冲突**（`Tenuto` 只与弦乐 `C. Legno` 冲突）。铜管四弱音态互斥（`Straight`/`Cup`/`Stem`/`Open`）；弦乐 `Con Sordino ⇄ Senza Sordino`、`Pizz. ⇄ Arco`。
- 所以：**别对用户说"我已经帮你设上震音了"** —— 先读 `incompatible` 确认。
> ✅ **2026-09-21 整轮复验（17 轨 · IX 1.0.1 · 桥 0.3.21）**：完整互斥图见 `references/技法实测.md` §5.1.1。三条要点：
> ① **这张图是「宿主全局规则」、与乐器无关** —— 17 条不同乐器的轨在同一技法下**只有一种签名**（唯一例外：空乐器轨全空）
>   ⇒ **别再按 `getSupportedArticulations()` 取交集**（旧说法把"跨族项"当误报，其实是全局图的正常内容）；
> ② **`Trill Major ⇄ Trill Minor` 坐实**（正解是"**只设一个**再读"；2026-09-20 那次"没复现"确是方法 artifact）；
> ③ ⚠️ **读 state 前必须 `editor:setCurrentGroup(该组引用)`** —— `getArticulationState()` 与 `selectNote()` **只对"当前组"生效**；
>   `setCurrentTrack` / `selection:selectGroup()` **都不够**（实测切完 `hasSelectedNotes()=false`、`incompatible=[]`、`smart` 读不到）。

完整互斥矩阵 → **`references/技法实测.md` 的 §5.1.1**。

## 3. IX 与 SV2 的差异（速查，全表见 `knowledge/docs/InstrumentX-API枚举.md` 的「13. Instrument X 与 SV2 的差异」）

| 项 | SV2 | IX |
|---|---|---|
| `SV.create('Note', …)` | 多参数展开 | **对象形式**；属性**小写**（`onset`/`duration`）；`duration` 可能要先传再 `setDuration(blick)` |
| `target.getAutomation(type)` | `SV.parameterTypes` 常量 | **字符串类型名**（`loudness`/`tension`/`breathiness`/`vibratoEnv`/`gender`/`toneShift`/`pitchDelta`/`voicing`）；**数字索引报 `unknown automation type`**。⛔ **`dynamics` 不是 automation**（是音符级力度包络）：传进去**不报错**，但返回**假对象** ⇒ 见下条 |
| `target.getParameter(type)` | 独立 API | **与 `getAutomation` 同一函数**（废弃别名） |
| `Automation.getPoints(start,end)`/`getAllPoints()`/`getLinear(blick)`/`getDefinition()`/`get(blick)` | 正常 | **IX ≥1.0.1 正常**（返回普通数组，可序列化；⚠️ 参数个数：2 / 0 / 1 / 0 / 1）。**IX 1.0.0 上会冻桥** ⇒ 靠 `hostOutdated` 版本检测（见 §1 第 2 条）。⛔⛔ **但只对真正的 automation 对象**：`getAutomation("dynamics")` 拿到的是**假对象**（`getType`/`getDefinition` 都给得出东西、折点表却没初始化）⇒ 在它上面读点/写点会把**宿主内存写坏、延时崩宿主**（2026-09-25 两次：`0xc0000409` fail-fast @0x1561bf1 / `0xc0000005` AV @0xf1d8ef，空工程也复现）。**桥已硬拒**（`set_automation` 直接拒 `dynamics`；`run_script` 静态拦 `getAutomation/getParameter("dynamics")`）；改力度包络走 `.ixp` 文件路线 |
| `Automation.remove(b)` / `remove(begin,end)` / `removeAll()` | 两个重载 + 清空 | **与 SV2 同构**（官方文档两个重载都写了；按 **blick** 删、返回布尔，该处无点就是 `false`）；实测 IX ≥1.0.1 正常（`remove(0)`→true、`remove(1)`→false）。**1.0.0 上会冻桥** ⇒ 同靠 `hostOutdated` |
| `p.addNoteGroup(name)` | 传字符串 | **必须传 NoteGroup 对象** |
| main group 加音符 | 允许 | **禁止** |
| 常量表（`SV.articulationTypes` 等）| 可枚举 | **不暴露/不可枚举** ⇒ 改用 `getMainEditor().getSupportedArticulations()` |
| 宿主识别 | `hostName = "Synthesizer V Studio…"` | `"Instrument X"`（AKDAgent 据此判 `isSV2=true`）|
| **音符重叠** | 判**违规**（要报给用户）| **允许**⇒ 我们的 `get_layout` 据此按宿主出策略、带 `overlapAllowedByHost`，IX 上**只告知、不判违规** |
| **音高线（PitchControlCurve）** | 原实现 | IX 侧是宿主**暴力移植**实现、**当前该处有 bug**（具体表现未定位、上游是否修**未知**）⇒ **和弦音高线别当「已验证」**（细节见 `references/技法实测.md` 的 §0-F）|

**一致的部分**（别重复造轮子）：全局 `SV` 方法集 · Project/TimeAxis/Track/Mixer/Selection/Navigation/Playback 方法集 · TempoMark/MeasureMark 字段 · blick 时间单位（`SV.QUARTER`）· 写前 `newUndoRecord()`。

## 4. 怎么落到我们的工具

- **给 IX 音符写技法**：`sv_run_script`（宿主内 Lua，索引 1 起、冒号调用）里 `note:setArticulations({...})`，写完**回读 + 读 `getArticulationState().incompatible`**。
- **批量/按规则设**：先 `sv_get_selected_notes` 或 `get_melody_notes` 拿目标，再 run_script 批量写（**别把上千音符塞进一次请求**）。
- ⭐ **按段落 / 按走向批量设技法（路线 A，2026-09-21 落地）—— MCP 工具 `sv_apply_articulations`**（**默认 dry-run**，`dryRun:false` 才写）：
  `rules:true` 跑 **10 条走向规则**（`style` 按官方五档缩放阈值）；`segments:["beats=A-B,技法"]` 或 `["phrases=1,3,技法"]` 做段落级批量开关（**乐句按旋律缺口切**，≥1 拍换句；无缺口则不切、不做乐句级规则）。
  **省略 `host` 默认走 `ix`**（技法是 IX 独有 API，SV2 没有）。命令行等价入口：`node tools/apply-articulations.cjs`（`--rules` / `--segment` / `--apply`）。
  规则集见 **`references/articulation-rules.md`**（10 条走向规则 + 6 个风格档 + 5 条安全规则）。工具自带四道护栏：
  **只写该轨 `getSupportedArticulations()` 里的键**（不支持退 fallback，无退路如实跳过）· **跳过 `articulationsFixed=true` 的音符**（除 `force`）· **按全局互斥图消解冲突** · **族外规则静默跳过**（如萨克斯 Scoop/Doit 落到弦乐上）；写前打印计划/`newUndoRecord()`、写后**逐个回读**并报告回读为空的音符。
  ⚠️ **一次写就是一道单向门**：`setArticulations` 会把音符**永久置 `articulationsFixed=true`**（**连写空表也一样**，API 清不掉 ⇒ 只能 Ctrl+Z 或 UI 里重开 Smart）⇒ 所以默认 dry-run、且只覆盖少数音符。
  ✅ 风格档 5 个档的阈值（`minBeatsScale`/`leapSemitones`/`runCount`/`shortBeats`）**已由用户 2026-09-21 定稿**（原话「阈值就这么定了」）⇒ 现行规范，别再当"建议值/待验收"。
- 🆕 **写入时直接带技法（2026-09-21 暴露）**：`sv_write_texture` 与 `sv_write_chords` 都新增 **`articulations?: string[]`** —— 统一给本次写入的**所有**音符设同一组技法（如整段 `['Pizz.']`、或 `['Con Sordino','Tenuto']`）。
  - 写入前按**实测全局互斥图**做**组内自洽化**（`pruneList`：保前丢后、去重），结果与剔除原因进回包 `articulations`（`requested`/`used`/`dropped`）。
  - ⚠️ **只解自相冲突**：**该轨支不支持读不出来**（IX API 读不到乐器）⇒ 回包里明说「写入成功 ≠ 可用」，要逐音确认请用 `sv_apply_articulations` 或读 `getArticulationState().incompatible`。
  - 两条落地通道（**都不需要改桥**）：`sv_write_texture` 走**逐音载荷**（桥的显式音符通道，`AKDAgentBridge.lua` 已支持 `notes[].articulations`）；`sv_write_chords` 的音符在**桥端**由 `chordSegs` 展开 ⇒ 写完后用回包 `groupName` **再补一次** `setArticulations`（`applyToGroupCode`）。
  - 逐音精修（按走向规则/段落开关）仍走 **`sv_apply_articulations`**（默认 dry-run）。
- **改 `.ixp` 文件层**（技法落在 `library[].notes[].attributes.articulations`）：安全三步 = 用户先保存 → 我们改写 → 用户重载，详见 **`sv-project-format`**。

## 5. 参考文件

- **`references/技法实测.md`**（**本技能自带**）—— 技法实测：`getAttributes` 结构 · 13 技法全集 · 12 轨乐器与**每乐器支持矩阵** · `.ixp` 里技法存储 · 逐音符序列 · **互斥矩阵** · 弱音器 · 弦乐开关。🆕 含 **§0.5 2026-09-21 整轮复验**（17 轨）· **§2.5 官方术语 ↔ 存储键 + Smart Articulation** · **§5.1.1 全局互斥图**。
- **`references/articulation-matrix.json`**（**本技能自带 · 实测单一事实源**）—— 17 轨乐器支持集（含 `(未指定乐器)` 对照）+ **全局互斥图 22 行** + 词表 22 + **4 个隐式键**（`Open`/`Arco`/`Senza Sordino`/`Center`）+ 方法事实（`setCurrentGroup` · `articulationsFixed` · 写层不拦）。守卫 `tools/check-articulation-matrix.cjs`（`--live` 可与真机比对漂移）。
- **`references/articulation-rules.md`** + **`references/articulation-rules.json`**（**本技能自带 · `status: confirmed`**：规则集**与五档阈值**均已定稿）—— 「按旋律走向覆盖技法」的规则表（**路线 A**：默认不写、只覆盖少数、其余留给宿主 Smart Articulation）+ 5 条安全规则 + **10 条**走向规则 + 段落级色彩。**规则引擎唯一实现 = `server/src/articulations/engine.ts`**（MCP 工具 `sv_apply_articulations` 与 `tools/apply-articulations.cjs` 共用同一份，别再抄第二遍）；离线自测 `cd server && npm run test:articulations`。守卫 `tools/check-articulation-rules.cjs`。
- **`knowledge/docs/InstrumentX-API枚举.md`**（**仓内开发参考，不在技能里**）—— IX 运行时 API 枚举：`SV` / Project / TimeAxis / MainEditor / NoteGroup / Note / Automation / Track / Mixer / Selection / Navigation / Playback 的对象与方法 · automation 点存储 · UI 能画什么 vs 写进去算不算数 · 「13 与 SV2 的差异」完整清单 · 「14 安全守则」。

> 📌 来历：2026-09-19 先把整份 `knowledge/docs/InstrumentX-API枚举.md` 搬进本技能，同日**按用户要求把「枚举」那一半挪回 `docs/`**（枚举属于开发参考、不必当技能内容），**「技法」那一半留在本技能**（它是实操矩阵，模型常按需加载）。引用旧路径的地方按上面两处改指。
