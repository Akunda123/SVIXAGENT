# IX 技法「按旋律走向覆盖」规则表（**已确认 2026-09-21**）

> **路线 A**：**默认不写技法**（留给宿主自带的 **Smart Articulation**），只在下表事件命中处**覆盖少数音符**。
> 机器可读版：**`articulation-rules.json`**（本文件与它一一对应；改规则两份一起改，守卫 `tools/check-articulation-rules.cjs` 会查一致性）。
> 依赖：**`articulation-matrix.json`**（支持集 + 全局互斥图）—— 本表里的技法键必须在其词表内、且不与互斥图冲突。
> ✅ **状态**：规则集已由用户 2026-09-21 拍板（10 条全留 · 阈值按风格分档 · 乐句按缺口切 · 段落级批量开关要做）。
> ✅ **已定稿（「阈值就这么定了」）**：下表的规则、五个风格档的数值、缺口切句口径、段落级开关**都是现行规范**。将来要调数值 = **改规范**（先问用户），不算改规则。

## 0. 为什么是"只覆盖少数"（路线 A 的依据）

- 官方（[Instrument X: First Look](https://www.dreamtonics.com.cn/ix-first-look/)）明确：技法面板可在 **automated「Smart Articulation」** 与逐音符手动之间切换 —— **宿主自己会按上下文配技法**。
- 2026-09-21 实测：**smart 模式的音符 `smart=true`，但 `active` / `predicted` / `incompatible` 全空** ⇒ **Smart 的决定读不出来**，我们**无法避让**它已经做的选择。
- 能可靠识别的是 **`articulationsFixed`**：`true` = 已有显式技法（人工或前次结果）⇒ **默认跳过**。
- ⇒ 做法：**只做"少数高信号事件"的覆盖**，其余音符一个不碰（保持 `fixed=false`，Smart 继续管）。

## 1. 五条安全规则（工具必须实现）

| id | 规则 |
|---|---|
| `defaultNoWrite` | **默认不写**：只有命中规则事件才 `setArticulations`，其余保持 `articulationsFixed=false` |
| `skipFixed` | **跳过 `articulationsFixed=true` 的音符**（认知到那是人工/前次结果）—— 除非显式 `--force` |
| `supportedOnly` | **只写该乐器 `getSupportedArticulations()` 里有的键**（运行时读；并与矩阵交叉校验） |
| `mutexPrune` | 写入前用**全局互斥图**消解冲突（本音符既有技法 + 本次要加的） |
| `onePerNote` | 每音符默认**只给 1 个**技法（`--max` 可调）；**不碰**弦乐三组开关与弱音器（见 §5） |

## 2. 风格档（阈值按档缩放）

官方五个风格预设 = 工程里的 `performanceDirection`（`Adagio` / `Allegro` / `con Fuoco` / `Pop` / `Ballade`）；**未指定风格用 `(default)`**。

| 档 | 含义 | `minBeatsScale`（乘所有"最少拍数"判据） | `leapSemitones`（大跳阈值） | `runCount`（连续个数阈值） | `shortBeats`（短音上限） |
|---|---|---|---|---|---|
| `Adagio` | 慢速·抒情 | **1.5** | 7 | 3 | 0.5 |
| `Allegro` | 快速·敏捷 | **0.5** | 5 | 3 | 0.25 |
| `con Fuoco` | 强烈·激烈 | **0.75** | 5 | 4 | 0.25 |
| `Pop` | 现代流行 | 1.0 | 5 | 3 | 0.5 |
| `Ballade` | 柔和叙事 | **1.5** | 7 | 3 | 0.5 |
| `(default)` | 未指定风格 | 1.0 | 7 | 3 | 0.5 |

> 判据里的符号值（`minBeatsScale` / `leapSemitones` / `runCount` / `shortBeats`）在 `articulation-rules.json` 的
> `styleTiers` 里定义，规则条目**只引用符号名**（如 `"minBeats": "2 × minBeatsScale"`）⇒ 换档即整套缩放。

## 3. 乐句怎么切（**按旋律缺口**）

- **判据**：相邻两音之间（前音**结束** → 后音**开始**）的空档 **≥ `minGapBeats`（默认 1 拍）** ⇒ 认为换句。
- **没有缺口 ⇒ 不切分**：整段视为一个乐句，且**不做乐句级规则**（`phraseEndLong` / `fallResolution` 这类以"句末"为判据的规则**不触发**）。
  > 用户 2026-09-21 原话口径：**"乐句有旋律缺口的按缺口，没有不管"** —— 宁可不动，也不瞎猜句法。

## 4. 走向规则（10 条）

| # | id | 事件（判据） | 覆盖成 | 不支持时 | 适用族（提示） |
|---|---|---|---|---|---|
| 1 | `phraseEndLong` | 句末长音：乐句最后一音，时值 **≥ 2 × minBeatsScale** | `Tenuto` | —— | 全部 |
| 2 | `leapIn` | 大跳接入：前音→本音音程 **≥ leapSemitones** | `Portamento` | 退 `Accent` | 弦乐 · 铜管 |
| 3 | `highPointApproach` | 上行冲高到**乐句最高点**（上行 ≥ 2 半音进入） | `Accent` | —— | 全部 |
| 4 | `fallResolution` | 下行收尾：高点之后回落 **≥ 3 半音**、且落在句末 | `Fall` | 退 `Tenuto` | 木管 · 萨克斯 · 铜管 · 弦乐 |
| 5 | `sameNoteRepeat` | 同音快速重复：同音 **≥ runCount**、时值 **≤ shortBeats** | `Tremolo` | 跳过 | Piccolo·Flute·Trumpet·弦乐四件 |
| 6 | `twoNoteAlternation` | 两音交替 **≥ runCount** 次、交替音程 **≤ 2 半音** | `Trill Major` / `Trill Minor`（大二度→Major、小二度→Minor） | 跳过 | 木管 · 弦乐 |
| 7 | `stepwiseRun` | 级进同向 **≥ runCount** 音、每步 **≤ 2 半音** | `Slur` | —— | 全部 |
| 8 | `staccatoRun` | 短促断奏段：连续 **≥ runCount** 个、**≤ shortBeats**、**排除同音重复** | `Staccato` | —— | 全部 |
| 9 | `saxScoop` | 萨克斯上行进入长音：上行 **≥ 3 半音** 进入 **≥ 1 × minBeatsScale** 的音 | `Scoop` | 跳过 | 仅 Jazz Sax（Alto/Tenor） |
| 10 | `doitExit` | **萨克斯下行离开长音**（与 `saxScoop` 对称）：离开 **≥ 1 × minBeatsScale** 的长音、下行 **≥ 3 半音** | `Doit` | 跳过 | 仅 Jazz Sax（Alto/Tenor） |

**命中多条时的优先级**（上 → 下取第一条）：

```
sameNoteRepeat  >  twoNoteAlternation  >  leapIn  >  highPointApproach
>  fallResolution  >  staccatoRun  >  stepwiseRun  >  phraseEndLong
>  saxScoop  >  doitExit
```

（`sameNoteRepeat` 压过 `staccatoRun`：同音快速重复本质是**震音**，不是断奏。）

## 5. 段落级批量开关（`colorBySegment`，不做逐音规则）

弦乐三组开关 / 铜管弱音器**按「段」统一设置**，由用户指定段落：

- 弦乐：奏法 `C. Legno`（col legno）/ `Bridge`（sul ponticello，靠琴桥）/ 默认态 `Center`；技巧 `Pizz.`（拨奏）/ `Fingerb.`（sul tasto，靠指板）/ 默认态 `Arco`；弱音 `Con Sordino` ⇄ `Senza Sordino`。
- 铜管：`Straight` / `Cup` / `Stem`（harmon 弱音器）/ 默认态 `Open` —— 四态互斥，**一次只能一个**。

**工具**：MCP `sv_apply_articulations`（`segments:["beats=16-40,Pizz."]`，**默认 dry-run**）；命令行等价 `node tools/apply-articulations.cjs --segment "beats=16-40,Pizz."`（`--apply` 才写）。

- **段落怎么指认（v1，已实现）**：① 按**组内拍区间** `beats=A-B`（单位 = 四分音符 = 1 拍，**组内局部时间**，含左端、不含右端）② 按缺口切出的乐句序号 `phrases=1,3`。
- ⚠️ **`bars=A-B`（按小节）尚未实现**（v2：需要小节长度表；`beats=` 是它现在的替代写法）。引擎遇到 `bars=` 会**明确报错**而不是猜。
- **只作用于**该段内、且 `articulationsFixed=false` 的音符（要覆盖已 fixed 的，显式 `force`）。
- ⚠️ **写一次就是单向门**：`setArticulations` 会把音符**永久置 `articulationsFixed=true`**（连写空表也一样，API 清不掉 ⇒ 只能 Ctrl+Z 或 UI 里重开 Smart）。

## 6. 还没定的（开放项）

1. ~~**各风格档数值**（`minBeatsScale` 1.5 / 0.5 / 0.75… · `leapSemitones` · `runCount` · `shortBeats`）—— 听感验收后定稿。~~ ✅ **「阈值就这么定了」** ⇒ 五档数值即现行规范（见 §2 风格档表）。
2. **`Scoop` / `Doit` 要不要也给非萨克斯乐器？** 官方未单列、实测只有 Alto/Tenor Sax 支持 ⇒ 现状只在 sax 生效。
3. **段落还想按别的指认吗**（现在是"小节区间"与"缺口乐句序号"两种）？

> 守卫：`node tools/check-articulation-rules.cjs` —— 键必须在矩阵词表内 · 同一条规则不许自相冲突（按互斥图逐对查）· 族名必须是矩阵里的 · 优先级 id 必须存在 · **风格档四个缩放量必须齐备且被判据引用** · **本文件的锚点与 `status` 一致**。
