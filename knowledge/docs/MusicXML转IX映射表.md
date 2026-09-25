# MusicXML → IX（.ixp）演奏方式映射表规格

> 目的：把 **MusicXML**（.musicxml/.xml）乐谱转成 **Instrument X .ixp** 工程时，**保留演奏信息**（技法/力度/技法细节/歌词/多声部），
> 让转出来的乐谱在 IX 里**按原谱意图演奏**，而不是只导一个"干巴巴的音符音高+时值"。
> 依据：AKDAgent 对 `.ixp` 格式的实测（**`skills/sv-project-format/SKILL.md`** + **`skills/sv-ix/`（IX 技法/力度/自动化实测，2026-09-19 从 `knowledge/docs/InstrumentX-API枚举.md` 搬入）** 的
> Note 技法/力度/自动化实测）+ MusicXML 3.1 结构。
> 本文档为 `sv_import_musicxml` 工具（MusicXML → 工程）的**设计规格（映射规则）**。

---

## 0. 与 MIDI 映射的区别（为什么 MusicXML 更能体现 IX 演奏）

| 维度 | MIDI（midi2ixp） | MusicXML（本表） |
|---|---|---|
| 音高 | noteNumber | step/alter/octave（更语义化，含升降名）|
| 时值 | tick 累计 | divisions/duration（清晰，含附点/tie）|
| 技法 | 只能**推断** Staccato/Slur/Tenuto（易误判）| **明确标记** `<staccato>/<tenuto>/<accent>/<trill>` 等，直接可靠 |
| 力度 | velocity 0~127 | **力度记号** `<dynamics>p/f/mf` + `velocity`，语义明确 |
| 歌词 | 无 | `<lyric>` 直接有 |
| 多声部 | 无 | `<voice>` / `<staff>` / 多个 `<score-part>` |
| 连音 | 无 | `<tie>` / `<slur>` 明确 |

> **MusicXML 是"谱面级"格式**，比 MIDI 的"演奏事件流"更贴近记谱意图，所以映射到 IX 的**技法/力度/歌词**都更准。

---

## 1. 总体原则

- **MusicXML 单个 `<score-part>`（声部）→ IX 1 轨 + 1 音符组**（按 part 分轨，保留多声部结构）。
- **一个 `<measure>` 内的多个 `<note>`（含多 voice）** → 按 voice 归入同组（IX 单组内音符顺序排），或按 voice 分多组（见 §7 可配）。
- **休止 `<rest>`** → 只占时机（推进 onset），不生成音符（IX 无需休止符对象）。
- **和弦内音 `<chord>`** → 同 onset 生成多个重叠音符（IX 允许 poly）。
- **不依赖宿主运行时 API 回报**：生成时写 `.ixp` 文件，宿主打开自动计算（同 midi2ixp 原则）。

---

## 2. 音符基础属性映射

| # | MusicXML | → IX 音符字段 | 映射公式 | 状态 |
|---|---|---|---|---|
| 1 | `<pitch><step>+<alter>+<octave>` | `notes[].pitch` | `pitch = 12*(octave+1) + step_pc + alter`；`step_pc` C=0,D=2,E=4,F=5,G=7,A=9,B=11 | ✅ |
| 2 | `<duration>` ÷ `<divisions>` | `notes[].onset` / `duration` (blick) | `beat = duration/divisions`；`blick = beat × 705600000` | ✅ |
| 3 | `<type>`（whole/half/…）| `notes[].duration` | `beat = typeBase(<type>)` 或直接用 duration/divisions | ✅ 时值 |
| 4 | `<dot>` 附点 | `notes[].duration` | `duration ×= 1.5`（单附点）/ ×1.75（双附点）| ✅ |
| 5 | `<rest>` | （不生成音符）| 仅推进 onset | ✅ |
| 6 | `<voice>` | 音符所在声部 | 用于分轨/分组（见 §7）| ✅ |
| 7 | `<staff>` | 谱表 | 同 voice 处理 | ⚠️ |
| 8 | `<lyric><text>` | `notes[].lyrics` | 首个 lyric 文本 | ✅ |
| 9 | `<chord>` | 同 onset 多音符 | 与前一音同 onset | ✅ |

**音符对象**（生成到 `library[].notes[]`）：
```json
{
  "uuid": "<16hex>",
  "onset": <blick>,
  "duration": <blick>,
  "pitch": <midi>,
  "detune": 0,
  "lyrics": "<lyric text>",
  "phonemes": "",
  "attributes": { "dynamic": <from velocity/dynamics>, "muted": false, "articulations": [<技法>], "articulationsFixed": false },
  "takes": { "activeTakeId": 0, "takes": [{"id":0,"seedPitch":0,"seedTimbre":0,"liked":false}] }
}
```

---

## 3. 力度映射（dynamic）

MusicXML 的音符力度来自两个来源，合并考虑：

| # | MusicXML | → IX | 映射公式 |
|---|---|---|---|
| 1 | `<velocity>`（note 属性，0~127）| `notes[].attributes.dynamic` | `dynamic = velocity/127`（线性，或 `(v/127)^γ`）|
| 2 | `<dynamics>` 力度记号（`p/f/mf/fff/pp`）| `notes[].attributes.dynamic` | 查力度等级表映射到 0~1（见 §3.1）|
| 3 | 力度随演奏变化 | `note.dynamics`（cubic 曲线）| MusicXML 无逐音符内力度曲线 → 需要时可用记号生成包络 |

**优先级**：`<velocity>` > note 级记号 > **小节级 `<dynamics>` 记号（running state）**。

> ✅ **2026-09-21 复核落地（P5）**：`<dynamics>` 的真实位置是**小节级 `<direction>`**，而旧实现只读 `note.dynamics`
> ⇒ **力度记号从来没被读到过**。现已补：① `<direction><direction-type><dynamics><mf/></direction-type>` ⇒ 查 §3.1；
> ② `<sound dynamics="N">`（**百分比 0~100**）⇒ `/100`；③ 记号状态**跨小节延续**（没换记号就沿用）。
> ⚠️ **已知粒度限制**：本仓解析器用 fast-xml-parser **默认配置（不保序）** ⇒ 力度按**小节粒度**生效，
> **同一小节内多个记号取最后一个**（MusicXML 本意是按文档顺序在音与音之间生效；要逐位置得全量改
> `preserveOrder:true` 解析，收益不抵风险，故不做）。实测：`<mf/>` + 4 个音 ⇒ 4 个音都 0.6。

### 3.1 力度记号 → dynamic 值（0~1 映射经验表）

| MusicXML 记号 | IX dynamic（0~1）|
|---|---|
| `pp` | 0.15 |
| `p` | 0.30 |
| `mp` | 0.45 |
| `mf` | 0.60 |
| `f` | 0.75 |
| `ff` | 0.90 |
| `fff` | 1.00 |

（可用 `--dynamic-map` 自定义，或 `--velocity-curve` 用 `(v/127)^γ`。）

> 每个 `<note>` 的力度记号（若在该音符方向内）取最近的有效力度值。

---

## 4. 技法映射（articulations）—— MusicXML → IX 技法表

MusicXML 的音符 `<notations><articulations>` **明确标记**，直接可靠映射（优于 MIDI 推断）。

### 4.1 通用技法映射（核心表）

| # | MusicXML 元素 | 含义 | → IX `attributes.articulations` | 备注 |
|---|---|---|---|---|
| 1 | `<staccato/>` | 断奏 | `["Staccato"]` | ✅ |
| 2 | `<tenuto/>` | 保持音 | `["Tenuto"]` | ✅ |
| 3 | `<accent/>` | 重音 | `["Accent"]` | ✅ |
| 4 | `<strong-accent/>` | 强加重音 | `["Accent"]` | 同 Accent |
| 5 | `<detached-legato/>` | 断连音 | `["Slur"]` | 圆滑 |
| 6 | `<spiccato/>` | 跳弓/断奏 | `["Staccato"]` | 近似断奏 |
| 7 | `<staccatissimo/>` | 极断奏 | `["Staccato"]` | 近似 |
| 8 | `<trill-mark/>`（或`<trill-mordent/>`）| 颤音 | `["Trill Minor"]` 或 `["Trill Major"]` | 见 §4.2 |
| 9 | `<tie>`（type start/stop）| 延音线 | `["Slur"]` | 连音 |
| 10 | `<slur>` | 连奏线 | `["Slur"]` | 圆滑 |
| 11 | `<doit/>` | 上滑 | `["Doit"]` | 铜管/木管 |
| 12 | `<falloff/>` | 下滑 | `["Fall"]` | |
| 13 | `<bend/>` | 滑音 | `["Portamento"]` | 连滑 |
| 14 | `<breath-mark/>` | 呼吸 | `["Breath"]` | |
| 15 | `<tremolo/>` | 震音 | `["Tremolo"]` | 同音快速重复 |
| 16 | `<harmon-mute/>` | **铜管 harmon 弱音器** | `["Stem"]` | ⚠️ **2026-09-21 复核改正**：旧表写 `Harmonics` 是**概念错** —— IX 的 `Harmonics` 是**弦乐泛音**；铜管 harmon 弱音器在 IX 里叫 `Stem`（依据：IX 官方术语 ↔ 存储键对照 + P20 实测）|
| 17 | `<harmonic/>` | 弦乐泛音 | `["Harmonics"]` | ⚠️ 同上：这才是 `Harmonics` 的正主（新增）|

**技法组合规则**（同 MIDI 映射，§互斥矩阵）：
- **互斥**：`Staccato`⇄`Tremolo`/`Trill Major`/`Trill Minor`；`Tremolo`⇄`Slur`；`Trill Major`⇄`Trill Minor`。
- **可叠加**：`Tenuto`/`Accent`/`Breath` 可与任何技法叠加。
- **排序**：通用奏法（Staccato/Tenuto/Accent…）排**前**，弦乐开关/弱音器排**后**（宿主会自动重排，但我们尽量按规范输出）。

### 4.2 颤音大小（Trill Major / Trill Minor）

MusicXML 无明确"大颤音/小颤音"标记。**缺省映射**：
- `<trill-mark/>` → 默认 `["Trill Minor"]`（小二度，最常见）。
- 若谱面用 `<trill-mark/>` 且音程为大二度 → `["Trill Major"]`（可 `--trill` 指定）。
- ⚠️ `Trill Major` 与 `Trill Minor` **互斥**（`getArticulationState().incompatible` 判定）。

---

## 5. 弦乐 / 铜管特有技法（IX 扩展）

IX 有**弦乐演奏开关**（奏法/技巧组单选）和**铜管弱音器**，MusicXML 对应元素可映射：

| # | MusicXML | → IX `articulations` | 说明 |
|---|---|---|---|
| 1 | `<pizzicato/>` | `["Pizz."]` | 弦乐拨奏（技巧组）|
| 2 | `<snap-pizzicato/>` | `["Pizz."]` | 近似拨奏 |
| 3 | （弱音）`<mute>` 音效 | `["Con Sordino"]` | 弦乐弱音 |
| 4 | （弓奏）| `["C. Legno"]` 或 `["Bridge"]` | 弦乐奏法组（弓奏/琴桥）|
| 5 | （指板）| `["Fingerb."]` | 弦乐技巧组 |
| 6 | 铜管弱音（`<mute>` 铜管）| `["Straight"]`/`["Cup"]`/`["Stem"]` | 铜管弱音器 |

> **弦乐开关组**：奏法组（常规/`C. Legno`/`Bridge`）单选；技巧组（常规/`Fingerb.`/`Pizz.`）单选；弱音（`Con Sordino`）独立开关。不同组可叠加（`["Pizz.","Con Sordino"]`）。
> **铜管弱音器**：`Straight`/`Cup`/`Stem`，与技法同一数组（`["Staccato","Stem"]`）。

---

## 6. 乐器映射（part → IX 声库）

MusicXML 每个 `<score-part>` 的 `<midi-instrument>`（GM program，如 40=Violin）或 `<part-name>` → 映射到 IX 的 15 个已装声库（复用 `MIDI转IXP映射表` §5 GM→IX 表）。

| MusicXML part | GM program | GM 类别 | → IX 首选声库 |
|---|---|---|---|
| 弦乐 `part-name` 含 Violin/Cello 等 | 40~47 | Strings | Orchestral Violin 1 / Viola 1 / Cello 1 / Contrabass 1 |
| 木管（Flute/Clarinet/Oboe…）| 72~79 | Woodwinds | Orchestral Flute 1 / Clarinet 1 (A) / Oboe 1 / Bassoon 1 / Piccolo 1 |
| 铜管（Trumpet/Horn/Trombone…）| 56~59 | Brass | Orchestral Trumpet 1 (Bb) / French Horn 1 / Trombone 1 / Tuba 1 |
| 萨克斯 | 65~71 | Saxophones | Jazz Alto/Tenor Saxophone 1 |
| 无对应 → 默认声库 或 跳过 | 其余 | — | — |

**策略**：`part-name` 含关键字 > `midi-instrument` GM program > 按音域精调。已装 15 声库清单见 MIDI 映射表 §5.1。

> ✅ **2026-09-21 已落地（P5 收尾；用户裁定「可以直接映射库名，没装的库会提示更改、不会实质影响」）** ——
> 不再"每族一个近似名"，改为**逐乐器给实际已装库名**。表 = `server/src/audio/ix-library-map.ts`（纯函数，可离线单测）。
>
> **库名来源 = 不猜**：从用户 IX 工程 `mainRef.database.name` 读出的**实际已装 15 个库**
> （`Orchestral Piccolo 1` · `Flute 1` · `Oboe 1` · `Clarinet 1 (A)` · `Bassoon 1` · `Jazz Alto Saxophone 1` ·
> `Jazz Tenor Saxophone 1` · `Orchestral Trumpet 1 (Bb)` · `French Horn 1` · `Trombone 1` · `Tuba 1` ·
> `Orchestral Violin 1` · `Viola 1` · `Cello 1` · `Contrabass 1`；backendType 全 `W`、version `100`）。
>
> **解析顺序**：**`part-name` 关键字 > `midi-program` 精确号 > 同族兜底 > 不映射**（`part-name` 是导出软件按乐器写的，
> 比 GM program 可信 —— 实测 MuseScore 给巴松写 70、给圆号写 60，都会踩旧表的族区间）。
> 中英关键字都收（`巴松`/`Bassoon`、`Double Bass`→Contrabass 而非 Bassoon、`Alto Saxophone`→Alto 而非 Tenor、`English Horn`→Oboe）。
>
> ⚠️ **1-based 换算（旧实现的隐藏错）**：MusicXML `<midi-program>` 规范是 **1~128**，而 GM 表按 **0-based** 编号
> ⇒ 本模块先 `gm0 = program - 1` 再查表（MuseScore 的 Violin = 41 ⇒ gm0 = 40 ⇒ Violin ✓）。
>
> ⚠️ **同轮改正的两处旧错**：① 旧表 `65~71 → Sax` ⇒ **Oboe(68)/English Horn(69)/Bassoon(70)/Clarinet(71) 全被误判成萨克斯**
> （巴松管导进来自动变成 `Jazz Alto Saxophone 1`）；② 旧表 `56~59 Brass` **漏了 French Horn(60)** ⇒ 圆号 part 根本映射不到乐器。
>
> ⚠️ **Harp(46)/Timpani(47) 故意不映射**（已装库里没有，拿小提琴当竖琴/定音鼓是错的）；`Piano` 等非管弦 part 同样不映射，交给宿主默认。
> ⚠️ **能不能读回？** 宿主 API **读不到**组/轨的乐器 ⇒ "写入成功"只代表 op 没报错，**乐器是否真被设上要你在宿主 UI 里看**（或存盘后读 `.ixp` 的 `mainRef.database`）。
> 若目标机没装某个库：**宿主会提示更换**，不影响工程打开与其它轨（用户 2026-09-21 口径）。

`mainRef.database`：
```json
"database": { "name": "<IX声库名>", "backendType": "W", "version": "100" }
```

---

## 7. 多声部 / 多轨处理

| MusicXML | → IX | 说明 |
|---|---|---|
| 多个 `<score-part>` | 多个 IX 轨（每 part 一轨）| `--parts` 可指定取哪几个 part |
| 一个 part 内多个 `<voice>` | 同轨多组，或同组内排序 | `--voice-split` 可每个 voice 一组 |
| `<staff>` 1/2 | 同 voice 处理 | 多谱表（如钢琴双手）→ 分 2 组 |

**时间换算**（同 MIDI §3）：`divisions` = 每四分音符 tick；`blick = (duration/divisions) × 705600000`。

---

## 8. 不可映射 / 需丢弃

| MusicXML | 处理 |
|---|---|
| `<footnote>` / `<page-layout>` / 排版元素 | 忽略 |
| `<metronome>` 速度文字 | 读取为 tempo（`<sound tempo>`）|
| 多连音 `<tuplet>` 时值的精确分组 | 时值已算对，tuplet 标记忽略 |
| 歌词换音（`<syllabic>` begin/end/middle）| 只取 `<text>`，忽略换音标记 |
| 装饰音 `<ornaments>`（mordent/turn）| 暂不映射（可作增强）|

---

## 9. 生成 `.ixp` 顶层结构（同 MIDI 映射）

```json
{
  "version": 201, "uuid": "<uuid>",
  "time": { "meter":[{"index":0,"numerator":4,"denominator":4}], "tempo":[{"position":0,"bpm":<from musicxml tempo or 120>}], "startTimeSeconds":0 },
  "library": [ /* 每声部一个音符组（notes 含 dynamic/articulations/lyrics + parameters）*/ ],
  "tracks": [ /* 每声部一个 track（mainRef.database + groups[].groupID→library）*/ ],
  "renderConfig": { ... },
  "projectMixer": { "linkRoomSettings": true },
  "loopBegin": 0, "loopEnd": 0, "loopEnabled": false
}
```

**引用关系**：`tracks[i].groups[0].groupID = library[j].uuid`；`tracks[i].mainGroup` = 空组（name="main"，不可加音符，见 IX API 实测 §13.3）。

---

## 10. 运行流程（MusicXML → IX）

```
输入 .musicxml/.xml
  → fast-xml-parser 解析 score-partwise
  → 每 part 逐 measure 累计时间，提取音符(pitch,onset,dur,velocity,lyrics) + 技法(articulations) + 力度
  → 技法/力度按 §4/§3 映射成 IX articulations/dynamic
  → 多声部/多轨映射（§7）、乐器映射（§6）
  → 生成 library[]/tracks[] → 写 .ixp / 或桥写入 SV/IX 工程
```

依赖：`server/node_modules/fast-xml-parser`（XML 解析）。

---

## 11. 用户可配参数（sv_import_musicxml，可扩展）

| 参数 | 默认 | 说明 |
|---|---|---|
| `input` | — | **绝对本地路径**（`.musicxml`/`.xml`）；URL / 相对路径 / `.svp`·`.ixp` 一律拒 |
| `part` | 1（第一个含音符的 part）| 取第几个声部 |
| `groupName` | "Import" | 音符组名 |
| `lyrics` | 保留 MusicXML 或空 | 歌词填充 |
| `dryRun` | **true** | **默认只读预览**（护栏第 ⑤ 条）；`false` 才写 |
| `confirmRights` | — | 写操作**必须**显式 `true`（护栏第 ⑥ 条：用户须确认有权使用该乐谱）|
| `allowPolyphony` | false | 该 part 有多 `<voice>`/和弦时默认**拒绝**（会算错音位）；确要导才置 true |

> ⚠️ 表里 `--voice-split` / `--instrument` / `--velocity-curve` / `--trill` 是**设计参数，尚未实现**（写在这里当规格）。
> 已实现的见上表 + 「§12 导入护栏」。

---

## 12. 导入护栏（✅ 2026-09-21 已落地，P5）

规格原文见 `skills/sv-scripting/SKILL.md`；实现在 `server/src/audio/musicxml-guard.ts`（纯函数，可离线单测）+ `musicxml-import.ts`（执行体）。
**离线**：`cd server && npm run test:musicxml`（**73 项**）；**真机**（IX 1.0.1）：预览/DTD 拒/URL 拒/无权利确认拒/真写 4 音/回读 `[Staccato][Accent][Harmonics][]`/清理，七步全过。

| # | 护栏 | 落点 | 真机/离线证据 |
|---|---|---|---|
| ① | 只收**绝对本地路径**；URL·相对路径·`.svp`·`.ixp`·非 xml 扩展一律拒 | `guardMusicXmlPath` | 离线 11 项；真机 `http://` ⇒ `guard:"path"` |
| ② | 拒 `<!DOCTYPE>` / `<!ENTITY>`（外部实体面） | `scanXmlSafety` + **parser 内部也拒**（双保险）+ `processEntities:false` | 离线 DTD/实体炸弹样本；真机 DTD ⇒ `guard:"xml-safety"` |
| ③ | **SHA-256 一致性**：预览算一次，写前再算一次，变了就拒 | `sha256OfFile` ×2 | 离线"改一个音哈希就变" |
| ④ | 音符数上限 **512**，超限拒绝 | `checkNoteCap` | 离线 512 过 / 513 拒 |
| ⑤ | **只读预览为默认**（给 hash + 声部清单 + 计数 + 有界预览 + 映射回报） | `dryRun !== false` | 真机预览报告全字段 |
| ⑥ | **权利确认**：写必须 `confirmRights:true` | 写前判 | 真机不带 ⇒ `guard:"rights"`，**未写** |
| ⑦ | 源 tempo **只汇报不套用** | 报告 `sourceTempo.applied=false`，本模块从不写 tempo | 真机 `tempo=96 applied=false` |
| ⑧ | **复调/和弦默认拒绝**（多 `<voice>` 混一条时间线会算错音位） | `detectPolyphony` + `isPolyphonic` | 离线：和弦/双 voice ⇒ 拒；真机单声部通过 |

> 🆕 **同轮修掉的一个真 bug**：旧处理体被一次 PowerShell 文本往返事故揉成一行，`articulations`/`tieStart`
> 落在 `//` 注释之后 ⇒ **技法映射算好了却从没发出去**（死代码）。真机回读是它的判据。

---

## 13. 相关参考

- `knowledge/docs/MIDI转IXP映射表.md` — MIDI→IX（迁移基础，技法/力度/乐器映射复用）
- `docs/InstrumentX-ixp格式参考.md` — IXP 顶层/结构
- **`skills/sv-ix/`** — IX 技法/力度/自动化实测（技法矩阵与互斥 · IX vs SV2 差异 · 安全守则）
