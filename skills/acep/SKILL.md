---
name: acep
description: ACE Studio 工程文件 `.acep` 的**格式与安全改写**：`ACEP2` 容器（1280 B 头 + 一个 zstd 帧，打包时**只有 3 个长度字段会变**、1248 B 高熵区原样复制）、payload 是 **CBOR**（不是 JSON；顶层 26 键 / 轨道 / pattern / notes 的形态，以及"**map/array 长度 = 元素个数**"这条能省掉整段重编码的关键性质）、参数曲线 lane 的编码（`values` = float64 大端 `0xfb`+8B = 9 B/值 ⇒ **等长原位覆盖**）与栅格（`offset` = 样本 0 的 tick，步长 15/16 tick = 1024 Hz 分析栅格）、六步安全写入（写副本 + 头原样 + 双重自检）、**rap 音高线**（`pitchDelta` 半音偏移；`rap-curve` 移植 SV1「语调教.js」的 0–4 调型表）与**歌词→声调序列**（`lyric-tones`：按词定音 / 纯表回退 + 21k 字声调表）、**ACE 加载时会复查什么**（合法的音素覆盖认账并报 `overrideLegal`；非法值被**静默丢弃并把工程弄脏**；**文件级的 `pitchDelta` 音高线改动 ACE 是认的** —— 重开 + 保存逐值保留、离线用 `--create-lane` 造的 entry 也留、渲染真按曲线唱，**已验 2026-10-04**；工程必须成"包" `<名字>\<名字>.acep` + `autosave\` + `Samples\`，光秃秃一个 `.acep` 会被当成"无名临时工程"）、**三种壳**（在用 ACEP2 / 可读旧壳 `{"compressMethod"` / 已弃用的加密旧壳 `version:2`）、**三种画法都能手写**（曲线 `data` / **锚点 `anchor`** / 音符 `vibrato`，逐项真机验收）、**CLI 参数名↔文件字段对应表**（`dynamic` → `vocalControls.__dynamic`；`air` → **`mambaBreathiness`**；`tree-diff` 两快照取证）、以及**能力边界**（音高线是函数 ⇒ 交叉 / 圆环 / 线稿画不了，只能画"每列只有一段"的垂直凸图形，真画图回 SV 侧）。触发：.acep、ACEP2、ACE 工程文件、acep 文件格式/结构、直接改 ACE 工程文件、手改 .acep 写音高曲线、写 pitchDelta、**写音高锚点**、**rap 音高线/语调/声调**、**歌词自动识别、歌词→声调、多音字按词定音**、ACE 音高线能不能画、ACE 认不认手改的工程、**CLI 写的参数落到文件哪个字段**、zstd + CBOR、syllable/音素覆盖写进文件、ACE 工程文件夹里的 autosave / Samples 是什么、acep 自检回读、旧版 acep / 加密 acep。
version: 1.15.0
---

# `.acep` 工程文件：格式与安全改写

> 适用 **ACE Studio 2.1.8** · `acestudio-cli 0.17.0` · surface **17.1**（第三方宿主，**不走我们的桥**）。
> 本文数字全是**真机实测**（2026-10-04；样本 = 5.5 KB 单音符 Sing 工程 / 20.5 KB 带音高曲线工程 / 2 MB 真实歌曲工程 / 本机 93 个 `.acep` 普查）。
> surface 自述 pre-1.0、接口会变 ⇒ **先按 §0 判断该不该走文件**，别照抄本文。

## 0. ⛔ 先问三句（顺序不能反）

1. **CLI 能不能做？** 能 ⇒ **永远走 CLI**。CLI 有撤销栈（`history undo`）、指纹（`--if-match`）、原子拒写（失败什么都不改）；
   文件改**三样都没有** —— 没有撤销、没有指纹、没有校验回执，只有你自己写的自检。
   已知**只有文件里才有**的典型：**人声音高曲线**（`vocalparam` 里 `pitch` 恒 `available:false`）—— 那才是走文件的理由。
2. **ACE 加载时会不会把我的改动丢掉？** 会（实测：非法音素覆盖被静默清掉，见 §5.1）⇒ 写完**必须让 ACE 读回来复核**。
3. **我怎么验收？** 只读命令能不能证明改动生效（`clip note-content` / `phoneme list` / `project info`）？
   证明不了就别急着交付 —— 用**文件级自检 + ACE 读回**两层。

## 1. 容器：`ACEP2` = 1280 B 头 + 一个 zstd 帧

```
off 0        "ACEP2" + 01 01 00          魔数 + 版本三字节
off 8        u32   头部长度（= payload 起点；实测 1280）
off 12       u32   0
off 16       u64   压缩长度   ← 头长 + 压缩长 = 文件大小（可用来判"文件被截断没有"）
off 24       u64   原始长度   ← 解压后应有的字节数
off 32..1279       1248 B 高熵区（香农熵 7.84 bit/B；gzip/deflate/brotli/裸 zstd 全解不开）—— 用途未知
off 1280           zstd 帧（魔数 28 b5 2f fd …），解出来就是 payload
```

### 1.0 万一打不开：`.acep` 还有两种历史壳（**正常情况不用管**）

> 当前格式就是 §1 的 `ACEP2`，**正常路径不需要判壳**。只有"解不开/首字节不是 `ACEP2`"时才对一下下面两条——
> 工具 `info` 会直接点名是哪种（`unpack` / `get` / `dump` 三种壳里可读的两种都认）。

- **历史一（可读、可编辑）**：首字节 `{"compressMethod":"zstd"` —— 包装 JSON（`content` = base64 的 zstd 帧、`salt`、`version:1000`），解出来是**内层 JSON 文本**。
  改法**不是** §4，走 `set-json`（整树解析 → 改路径 → 重 stringify → 重 zstd → 重 base64 → 重建包装，只换 `content`）。
  实测（`我曾遇到.acep`，2023-08，改轨名）：**回读一致 ✅、包装键齐全 ✅**（内层 259,818 B → 文件 25,651 B）。
- **历史二（加密、已弃用，不处理）**：首字节 `{"content"` 且**没有** `compressMethod`（`salt` 是两段 `16 B*8 B`）——
  `content` 解 base64 后 **zstd（含补魔数）/gzip/deflate/brotli 全解不开**、熵 **7.978 bit/B** ⇒ **是加密**。
  **不尝试解密**（`info` 会明说"不碰"）；要那份工程只能用当年那版 ACE 打开后另存。
  ⚠️ `version:2` 只是它**唯一样本**的特征，**不是判据** —— 别拿版本号下结论。

> ✅ **旧壳会被 ACE 自己升级成新壳**（2026-10-04 实测，**很实用**）：拿一份"历史一"工程（`senpa.acep`，213,087 B）
> 让 ACE `project open` → `project save`，落盘后 `info` 报 **`ACEP2`**、76,152 B，**内容无损**（67 个音符、23 条 `pitchDelta` entry 与值域原样）。
> ⇒ **想让旧工程走文件路线（如画音高线）**：先让 ACE 打开并保存一次，升成 `ACEP2` 再动手（我们的写工具只吃新壳）。

### 1.1 打包（重新压缩）时只动三处

| 位置 | 写什么 |
|---|---|
| `off 8` | 头部长度（**不变**，仍是 1280） |
| `off 16` | 新压缩长度 |
| `off 24` | 新原始长度 |

**其余头部字节从源文件原样复制**，尤其那 1248 B 高熵区。

> 为什么敢原样复制：拿一份 ACE 自己存的工程，只改 payload 里的一个文本项、其余头字节照抄 ⇒ 头部**逐字节相同**、ACE 正常打开
> ⇒ 这说明高熵区**不是 payload 的校验和**（payload 都变了它却没变），也说明它至少不拦这种改法。

## 2. payload 是 **CBOR**（不是 JSON、也不是自定义二进制）

### 2.1 顶层与对象形态

顶层是 map（实测 **26 键**）：

```
version(22) versionRevision duration trackCells pianoCells colorIndex mergedPatternIndex
recordPatternIndex trackControlPanelW loop singer_library_id extraInfo patternIndividualColorIndex
tempoBrushOn minBpm(60) maxBpm(180) tempoTrackHeight canvas{width,height,frameRate,adaptive}
vocalControlRoute tempos[] timeSignatures[] master **tracks[100]** chordTrack videoTracks[] pianoDisplayConfig
```

- `tracks` 恒 **100 个槽位**（空槽也在，且被自动配色吃过颜色 —— 这就是 CLI 里"空轨道槽"的来源；读回来时空槽没有 `trackUuid`）。
- 轨道对象：`uuid/type/name/gain/pan/mute/solo/record/listen/color/externalFxChain/extraInfo/inputSource/`
  `soundSourceMetadata/singers/choirConfig/roomEffect/language/recordMode` + **`patterns[]`**。
- pattern 对象：`uuid/name/timeUnit/pos/dur/clipPos/clipDur/enabled/color/fadeIn/fadeOut/extraInfo`
  + **`notes[]`** + **`parameters{}`** + `vocalControls{}`。
- 音符里的歌词/读音：`lyric`（字）+ **`syllable`**（音素覆盖，空格分隔符号串；`""` = 没有覆盖、用默认发音）
  + `freezedDefaultSyllable`（冻结的默认读音）+ `headConsonants` / `tailConsonants`（**头/尾辅音长度，秒**）
  + `brLen`（呼吸长度）+ **`phonemeTimings`**（v2 的 pins：**数组的数组** `[[符号, 秒], …]`）—— 时长的两套存法见 **§2.4**。
  CLI 侧 `clip note-content` 的 `syllable` 字段就是它。

### 2.2 参数曲线 lane

```
tracks[i].patterns[j].parameters.<lane> = [ { type, offset, values }, … ]   // 实测 1 条或多条 entry
```

| lane | 样本数 | `offset` | 说明 |
|---|---|---|---|
| **`pitchDelta`** | **3095** | **360** | **人声音高曲线**（半音偏移，相对音符音高）—— 文件里唯一能改音高的地方 |
| `vuv` | 3095 | 360 | 有声/无声（0/1） |
| **`energy` / `tension` / `air`（envelope 系）** | **1 样本/tick** | 段起点 tick | ✅ **2026-10-05 定量**：`vocalparam read --param energy --range-begin 10000 --range-end 11000` 回 **`count:1000`、每层 `points:1000`** ⇒ **960 Hz**（**不是** pitchDelta 的 15/16 tick/样本） |
| `gender` / `mamba*` | 空 | — | ⚠️ 只在**新世代（singing-mamba）** clip 上有；ACE 明说"lane exist on the singing-mamba generation, this clip's singer is verse24" |

**编码**：`values` 是 CBOR 数组，每项 `0xfb` + **float64 大端** = **9 字节/值**
⇒ **元素个数不变时可以直接原位覆盖**，**完全不用重编码 CBOR**。这是本技能所有写法的地基。

- ⚠️ **entry 里的 tick 是「片段内局部坐标」，不是工程绝对 tick**（2026-10-05 实测）：
  绝对位置 = `pattern.pos` + entry 的 `offset`/`points` 里的 tick。
  证据：用户工程 `pattern.pos=3120`、`pitchDelta[0].offset=177` ⇒ 渲染音频的第一声正好在 `(3120+177)/960 = 3.434 s` ✓
  （`notes[].pos` 也是同一个局部坐标系 ⇒ 画曲线时**不要**自己加 `pattern.pos`。）

- ⚠️ **一条 lane 可以有 N 条 entry（曲线是分段存的）**：实测一份 2023 工程 `pitchDelta` **95 条**、`tension` **85 条**、`vuv` **78 条**
  （每条 entry 带自己的 `offset` + `values`）；我们自己的新工程常见 1 条（一条 lane 一条 entry）。
  - ✅ **ACE 保存时会"合并"分段**（2026-10-04 实测）：我们写 3 条 entry（offset `0`/`1121`/`2243`，覆盖 tick `0–3362`），ACE `save` 后变成**1 条** entry（offset `0` / 3586 样本），
    **值逐样本保留**（非零数与值域不变）。⇒ 多 entry 写是安全的；**别指望"写完还是几条"**，回读要按"合并后的那一条"比。

**⛔ 音高线有「三种画法」，落在「三个不同的地方」**（2026-10-05：用户指认画法 + 读其工程 `%USERPROFILE%\Documents\lala-resaved\未命名.acep` 照出存储位置）：

| 画法（UI 口径，用户 2026-10-05 指认） | 存在哪 | 形态 | 坐标语义 |
|---|---|---|---|
| ① **曲线** | `patterns[*].parameters.pitchDelta[i]` | `type:"data"` + `offset` + `values`（float64 数组） | **delta（半音，相对音符音高）** |
| ② **锚点** | 同一个 `pitchDelta` 里的另一条 entry | `type:"anchor"` + `points` + `pointsVUV`（**没有 `offset`/`values`**） | **绝对音高**（不是 delta！）`points` = `[tick, 音高, tick, 音高, …]`；`pointsVUV` = 每点一个 `0/1` |
| ③ **颤音（跟随音符走）** | **`notes[k].vibrato`**（音符自己的字段，**不在 lane 里**） | 对象，8 个字段（见下） | **音符内偏移**（`startPos` 相对本音符起点）⇒ 音符一挪，颤音跟着走 |

⇒ 所以 ① ② 会**混在同一条 lane 里**（一串 entry，按时间顺序接力），③ 则完全不在 lane 里。
⇒ **三种都能手写**（2026-10-05 逐项验收，见 §5.5）：① 等长原位覆盖；② 走 `scripts/acep.cjs anchor`（插 entry 只能追加到 lane 末尾）；③ 走 `scripts/acep.cjs vibrato`（没有颤音的音符要**插键**）。

> 💡 ACE 自己就是这么说的（`vocalparam layers` 里 pitch 行 `available:false` 的 `unavailableReason` 原文）：
> **"the channel stores a delta while the draw primitive takes absolute pitch, and anchors and vibrato ride on top"**
> —— "channel 存 delta" = ①，"**anchors** 取绝对音高" = ②，"**vibrato** 叠在上面" = ③。三句话正好对上三种画法。

**③ 颤音对象的字段（实测原值 + 量纲已定）**：

```json
"vibrato": { "startPos": 133, "frequency": 6, "amplitude": 2.9124999046325684, "phase": 0,
             "attackRatio": 0.4446505010128021, "attackLevel": 1,
             "releaseRatio": 0.2425110936164856, "releaseLevel": 1 }
```

- ✅ **量纲（2026-10-05 渲染实测定的，两点标定）**：
  - **`frequency` = Hz**（文件 `6` → 23ms 分析窗实测 **5.984 Hz**）
  - **`amplitude` = 颤音的峰峰值，单位 = 半音**（文件 `2.9125` → 12ms 窗实测 2.784；改成 **`4.0`** → 实测 **3.926** ⇒ 线性、比值 0.94–0.98）
  - **`attackRatio` × 音符时长 = 线性起振斜坡时长**（2026-10-05 实测：2 s 长音、`startPos=0`，`0.2` → 斜坡 0.4 s（90% 穿越实测 0.366 s）、`0.8` → 1.6 s（实测 1.371 s），都在一个分析格内 ⇒ 就是"比例 × 音符时长"）
  - ⚠️ `releaseRatio` 同族但**未单独测**；`attackLevel`/`releaseLevel` 是斜坡**目标高度**（ACE 自己写的常见组合是 `0.8` / `1`）。
  - ⚠️ 测法有系统偏差：自相关**分析窗越长越削颤音幅度**（46ms 窗只剩 ~0.85），定量纲要用短窗（12ms）看收敛值。工具 `scripts/f0-contour.cjs`（`--ramp` 打 20 段包络 + 到 50%/90% 用时）。
  - 💡 **ACE 自己写的默认值**（从真实工程 77 个带颤音音符读到的多数值）：`frequency 6 / attackRatio 0.2 / attackLevel 0.8 / releaseRatio 0.1 / releaseLevel 1` —— `scripts/acep.cjs vibrato` 的默认值就照这组。
- ⚠️ **没有颤音的音符是「连键都没有」**（不是空对象/`null`）⇒ 判"这个音有没有颤音"要用 `'vibrato' in note`。
- ✅ **手写颤音 ACE 认，连"新插入的键"也认**（2026-10-05 实测）：用 `scripts/acep.cjs vibrato` 写进文件 → ACE 打开后**渲染出来的颤音完全跟着变**。
  干净验收（单长音 2 s、无任何曲线干扰）：写 `frequency 5.5 / amplitude 2.0` → 渲染实测 **5.492 Hz / 峰峰值 1.995 半音**，中位音高 62.04（不偏移音高）✓。
  ⚠️ 验的时候别用短音符（0.5 s 窗里塞不满 2 个周期，速率测不准），也别在**有①②曲线**的区段上测（曲线的摆动会盖过颤音）。

**实测样本**（那份工程，4 个音符 `62/64/65/66` 都唱「啦」，pos/dur = `240/660`、`900/1020`、`1920/840`、`2760/1020`；**只有第 4 个音带 `vibrato`**）：

- ① 曲线：`[0] data` offset **177** / 624 样本（tick `177–762`）/ delta 值域 `[−3.2375, +1.0938]` —— 平滑拱形（谷 −3.24 → 峰 +0.89）
- ② 锚点：`[1] anchor` **6 点**（tick `799.3–1253.6`，绝对音高 `58.03–64.28`）、`[2] anchor` **7 点**（tick `1513.4–2171.9`，绝对音高 `59.89–67.59`），两条 `pointsVUV` 全 `0`
  —— **同一画法画了两笔就有两条 entry**（别把"entry 条数"当成"画法种数"）
- ③ 颤音：在 `notes[3]`（pitch 66 / dur 1020）上，`vibrato` 就是上面那个对象（`startPos 133` ⇒ 音符内 133 tick 处起颤）
- 伴随 lane：`vuv` 1 条 `data` entry，**offset 也是 177**（与 ① 同起点）/ 700 样本 / **值全 1.0**


- ⚠️ **`type` 不全是 `data`** ⇒ 遍历/写值时必须**先看字段**（有 `values` 才是逐采样形态）；只认 `values` 的读法会把 anchor 当成"空 entry"（工具已修，见 §6 `lane-report`）。
- ⚠️ **`type` 与"层"无关**：`baseline`/`user`/`direct`/`envelope` 是**引擎侧**概念（写的时候用 `vocalparam write --layer` 点名，见 `ace-params` §4/§4b），
  文件里**没有**这个维度 —— 别把 `type:"anchor"` 读成"另一种层"。
- **`dynamic` 宏不在这套 lane 里**：它存 `patterns[].vocalControls.__dynamic`（形态见 §2.5）。

### 2.3 一个能省掉整段重编码的 CBOR 性质

**CBOR 的 map/array 长度是"元素个数"，不是字节数** ⇒ 把某个 text 字符串换长/换短，只要改**它自己的长度前缀**，
外层容器一个字节都不用动（实测：把 `"l an"` 换成 `"l a l a"`，payload 17686 → 17689 B，只多了那 3 个字节）。

**写解码器必踩的两个坑**（都已在 `scripts/acep.cjs` 修好，改它之前先看这两条）：
1. **必须处理 half float（`0xf9`）**，漏了会少消费 2 字节 ⇒ 后面整段错位（症状：出现 `1e185` 之类的垃圾数）。
2. 更阴的：`head()` 已经把浮点负载字节读进 `val` 了，`major=7` 分支**绝不能再 read 一次** ⇒ 每个 double 多吃 8 字节，解到 `minBpm` 就崩。

### 2.4 音素时长：**两套存法**（按"这个音符自己带着什么"，不是按轨的模型）

| | v2 那套（Verse 2.6+）**pins** | v1 那套（Verse24）**辅音长度** |
|---|---|---|
| `.acep` 字段 | **`phonemeTimings`**：**数组的数组** —— 每个音素是 `[符号, 秒]`（字节实测 `82 82 61 6c fb …`；⚠️ **不是 map**，别按 `{0:…,1:…}` 解析） | **`headConsonants` / `tailConsonants`**：**秒**为单位的 float 数组 |
| 实测 | `[["l",0.07546485260770976],["a",0.626938775510204]]` | `[0.06965986394557823]`（字母 b 的头辅音） |
| 语义 | **时长**（不是位置 —— 官方原话："a phoneme stores a duration and never a position"，拖边界只是手势）；⚠️ 实测这份表是**上次合成算出的时长快照**，**不等于"现在实际唱的"** | 头/尾辅音**请求的长度** |
| 键在不在 | v2 音符**有** `phonemeTimings`、`headConsonants` 为空 | v1 音符**根本没有** `phonemeTimings` 键（实测同一份工程两条轨，正好互为镜像） |

**✅ 「pin」在文件里到底长什么样（2026-10-05 实测关掉这条未知）**：**`phonemeTimings` 的元素长度就是判据** ——

| 元素 | 含义 |
|---|---|
| **`[符号, 秒]`（2 元素）** | **没被 pin**：那个秒数只是上次合成的时长 |
| **`[符号, 一个数, 秒]`（3 元素）** | **被 pin**：**第 3 个**是被固定的时长（第 2 个含义**未定** —— 两次把 pin 改成不同值它都没变） |

实测：在一份 **v2**（Ember Rose）工程上渲染后 `phoneme move-boundary --note <uuid> --index 0 --to 0.08`（`--to` 是**边界的绝对时间、clip-local 秒**，**不是时长**；给得小于跨度起点会被夹到下限）⇒ 文件从**没有** `phonemeTimings` 变成
`[["m",0.06965986394557823,0.0010000000000000009],["ing",0.40634920634920635]]`，回读 `phoneme list` 里 `m` 的 **`isPinned: true`** ✅。
⇒ 这也解释了早先那条观察：**"`phonemeTimings` 里 `isPinned` 全是 false"= 那些都是 2 元素行**。
⚠️ **v1（辅音长度那套）没有"pin"这个概念**：同一动作在 v1 上只是把 `headConsonants` 的秒数改掉（实测 `0.08127 → 0.0058`），**键集不变、`isPinned` 恒 false**（CLI 自己回 `representation:"consonant-lengths"`）。
⚠️ **换声库会丢掉另一种表示的时长**（实测：v1 的 `headConsonants:[0.0813]` 换成 Ember Rose 后变 `[]`）—— 官方说"Switching on the model would strand the data in both"，实测印证 ⇒ **静默丢数据，改声库前先备份**。

- ⚠️ **文件里这张表 = 上次合成的时长快照，不是"实际唱的"**（实测同一个「啦」音符）：文件 `l` = 0.0755 s，而现读 `durationSec` = **0.4818 s**
  （两行都 `isPinned:false`）；元音 `a` 两边逐位一致（0.626938775510204）。**"实际唱的"只在读面**：`effectiveDurationSec`（元音那行，实测 = 0.625 = 音符总长）。
  ⇒ **别拿文件里的值当实际长度**；要"当前值/实际值"必须现读。
- **单位一律是秒（float64）**；音符自己的 `pos` / `dur` 才是 tick。实测这些秒值都精确落在 44.1 kHz 的采样整数上
  （`0.06965986394557823 × 44100 = 3072`、`0.16253968253968254 × 44100 = 7168`）⇒ 内部有采样级量化。
- ⚠️ **同名不同义**：`headConsonants` 在 `clip note-content` 里是**数字数组（秒）**，在 `phoneme list` 里是**符号数组**（`["b"]`）
  —— 脚本里别按字段名硬解析类型。
- ⚠️ **别手改 `phonemeTimings`**：pins **整段 span 一起生效**（span 内每个音素都 pinned 才算 pinned），只写其中一条 ≈ 静默不生效。
  要改走动词：`phoneme move-boundary --to <秒>`（裸数字、从片段起点算、可负、**超界 clamp 不拒**）与
  `phoneme set-consonant-timing --length 0.08s|80ms|40t`（**拒绝 tempo-relative**，因为界是秒）—— 两者是**同一次编辑的两个命名**，
  落在哪套由轨决定、回包报 `representation`；都有 `--dry-run`。
- **"存的是请求，不是结果"**：`phoneme list --with-timings` 的 `durationSec` 是请求值，`effectiveDurationSec` 才是真唱的
  （会被相邻音符压掉，**永不写回**）。
- 清时长用 reset 类动词：它清**实际存在的那套**，并用 `clearedTimings` 回报（Vocal2Midi 导入的音符即便在 Verse24 轨上也是 pinned）。

### 2.5 文档模型：**每个形状有哪些键**（新壳实测并集，三份真实工程）

> 取法：`dump` / `unpack` 出整棵树后按"形状"汇总键集合。**顶层 `version: 22`** 是当前格式（旧格式有别的版本号，状态见 §1.0）。

| 形状 | 键（实测出现过的全部） |
|---|---|
| `$` 顶层（**30 键**） | `version` `versionRevision` `duration` `colorIndex` `mergedPatternIndex` `recordPatternIndex` `trackCells` `pianoCells` `trackControlPanelW` `tempoBrushOn` `minBpm` `maxBpm` `tempoTrackHeight` `canvas` `vocalControlRoute` `singer_library_id` `extraInfo` `patternIndividualColorIndex` `loop`（对象 `{valid,active,start,end}`） `svcResults` `tempos` `timeSignatures` `master` **`tracks`** `chordTrack` `videoTracks` `pianoDisplayConfig` |
| `tracks[*]`（23 键） | `uuid` `type` `name` `gain` `pan` `mute` `solo` `record` `listen` `color` `language` `recordMode` `inputChannelIndex` `inputSource` `patterns` `singers` `choirInfo` `choirConfig` `roomEffect` `builtInFx` `externalFxChain` `soundSourceMetadata` `extraInfo` |
| `patterns[*]`（18 键） | `uuid` `name` `timeUnit`（**`tick` \| `sec`** —— `sec` 是**音频片段**） `pos` `dur` `clipPos` `clipDur` `enabled` `color` `gain` `fadeIn` `fadeOut` `path`（音频片段的文件路径） `analysedBeat` `notes` `parameters` `vocalControls` `extraInfo` |

> ⛔ **`timeUnit:"sec"` 的 pattern（音频片段）不能用 tick 工具**：本技能所有栅格换算（步长 15/16 tick、960 tick/秒）
> 都只对 `tick` 成立 ⇒ `rap-curve` / `vibrato` **2026-10-05 起会明确拒绝**（`assertTickPattern`），`lane-report` 会在 pattern 行标出
> `timeUnit=sec ⛔ 音频片段：tick 栅格换算不适用`。此前全脚本 grep `timeUnit` **0 命中** ⇒ 拿 sec 片段进来会**静默写错位置**。
| `notes[*]`（14 键） | `uuid` `pos` `dur` `pitch` `lyric` `language` `syllable` `freezedDefaultSyllable` `headConsonants` `tailConsonants` `brLen` `phonemeTimings` **`vibrato`**（对象 —— ⚠️ **可选键：没有颤音的音符根本不出现这个键**；字段与语义见 §2.2 画法③） `extraInfo` |
| `patterns[*].parameters`（15 条 lane） | `pitchDelta` `vuv` `energy` `gender` `tension` `breathiness` `falsetto` **`realEnergy`/`realTension`/`realBreathiness`/`realFalsetto`**（老世代那套）· **`mambaEnergy`/`mambaTension`/`mambaBreathiness`/`mambaFalsetto`**（新世代那套） |
| `parameters.<lane>[*]`（3 键） | `type`（实测 `"data"`） `offset`（样本 0 的 tick） `values`（float64 数组；长度随工程任意，实测 0 到 29872 都出现过） |
| `patterns[*].vocalControls` | **`__dynamic`**（对象）—— CLI 的 **`dynamic`** 宏就住在这里（对应 `ace-params` §2b） |
| `tracks[*].singers[*]` | `singer`（对象） `gain` `mute` `randomSeed` |
| `tracks[*].soundSourceMetadata` | `id` `name` `group` `state` |
| `chordTrack` | 与轨道同构 + `patterns[]`（和弦片段） |
| `tempos[*]` | `position` `bpm` `bend` `isLerp` |
| `timeSignatures[*]` | `barPos` `numerator` `denominator` |
| `master` / `canvas` / `pianoDisplayConfig` | `{gain}` / `{width,height,frameRate,adaptive}` / `{backgroundHint}` |

- **`tracks` 数组里绝大多数槽位不是真轨道**：实测 `type` 取值 `sing | audio | data | empty | chord`，其中 `data` / `empty` 是占位（上百个）⇒ 遍历时**先按 `type` 过滤**，别按索引数轨道。
- ⚠️ 这张表是**并集**（三份真实工程），**不代表每个工程都带全部键**；读的时候一律**先看键在不在**再取值。

### 2.5b CLI 参数名 → **文件里哪个字段**（2026-10-05 钉死，v2 / `singing-mamba`）

> **为什么要这张表**：CLI 的参数名叫 `energy`/`air`…，文件里的 lane 叫 `mambaEnergy`/`mambaBreathiness`…，**两边名字不对应**，
> 靠猜一定错（`air` → `mambaBreathiness` 就是反直觉的那条）。**验法**：在正规包副本上做 **save → CLI 写 → save** 两次快照，
> 用 `scripts/tree-diff.cjs` 逐字段比 ⇒ 只剩"真的变了的那一个字段"（本表每行都是这样测出来的，一次写入只动 1 处）。

| CLI（`vocalparam write --param … --layer user`） | 落到文件 | 形态 |
|---|---|---|
| **`dynamic`**（`scale:control`，`[-1,1]`） | **`patterns[*].vocalControls.__dynamic`** | `{"global":0,"lines":[{"ticks":[0,960],"values":[0.5,-0.2]}]}` —— **`ticks` = 片段内局部 tick**（与 `notes[].pos` 同系）、`values` = 写进去的那串值；`count` = 片段 tick 数 |
| `energy` | `patterns[*].parameters.mambaEnergy` | lane entry 数组（**1 样本/tick**，§2.2） |
| **`air`** | `patterns[*].parameters.`**`mambaBreathiness`** | ↑ 同上（⚠️ **名字不是 `mambaAir`**） |
| `tension` | `patterns[*].parameters.mambaTension` | ↑ |
| `falsetto` | `patterns[*].parameters.mambaFalsetto` | ↑ |

- **v2 才有 `dynamic`**（v1 花名册里没有这项，见 `ace-params` §2.0）；`mamba*` 这四条 lane **只在 v2 clip 上非空**（v1 clip 上是空数组，§2.2 表）。
- 反过来读：**只看文件就能知道"这段被人在 CLI/界面上调过什么"** —— `__dynamic` 存在 = 有 dynamic 锚点；`mambaXxx` 非空 = 有那一路的用户曲线。
- ✅ 这套对应关系**已双向闭合**：CLI `vocalparam read --param dynamic --layer user` 回读到的 `points [[0,0.5],[960,-0.2]]` 与我们写进 `__dynamic.lines[0]` 的 `ticks/values` **逐值一致**。

### 2.6 默认读音 / 覆盖 / tenuto（"null 值"其实是别的形状）

- **"没有覆盖、按默认唱"**：文件里是 **`syllable: ""`**（**空串，不是 null**），**默认读音另存一栏 `freezedDefaultSyllable`**
  （一被解析就冻结，如 `"l a"`）；CLI 侧 `phoneme list` 同时给 **`defaultPhonemes`**（派生默认）+ `phonemes`（当前生效）+ **`isOverride: false`**。
  实测：一份 551 音符的真实工程里 **`syllable` 全是 `""`、`freezedDefaultSyllable` 全非空、音符对象里 `null` 一个都没有**。
  ⇒ **判"有没有覆盖"看 `syllable === ""` / `isOverride`，别等 `null` 出现**。
- **tenuto（延续音符，歌词就是字面量 `-`）没有自己的音素**：`phoneme list --note <tenuto 音符>` 会**解析成它所属组的头音符那一行**
  （实测：查一个刚被改成 `-` 的音符，返回的却是**前一个音符**的 uuid 与读音 —— 官方原话 "A tenuto resolves to its group's head note"）。
  文件里它的 `headConsonants` 会被清空、`freezedDefaultSyllable` 仍在；**句子层也不把它算作一个词**（`clip lyrics` 的句子 `lyric` 里没有它）。
  写 tenuto：`note set-lyric --note-uuid … --lyric -`（撤销项名 = **「编辑歌词」**，整笔可 `history undo`；实测还原后 `tailConsonants` 也回来了）。
- **真正"缺值"是字段缺席、不是 `null`**：v1（consonant-lengths）那套的**元音行没有 `durationSec`**；`overrideLegal` 只在**有覆盖**时出现
  —— 别把这些当成"读失败"或"没写进去"。

## 3. 栅格与"能画成什么样"

### 3.1 `pitchDelta` 的栅格

```
sample i  ↔  tick = offset + i × 15/16          （offset = 360 = 样本 0 的 tick）
即 1024 样本/秒（分析栅格）÷ 960 tick/s = 15/16 tick/样本
```

两条独立证据吻合：① `offset` 正好等于样本 0 的 tick；② 从截图几何反解出的 hop ≈ 0.94、起点 ≈ 373（量测误差内）。
⚠️ **别的 lane（`energy`/`gender`，1939 样本）栅格不同**，不要套这个步长，要单独校。

### 3.2 ⛔ 能力边界：音高线是**函数**，画不了图

一个 x 只能有一个 y。两笔只要在 x 上重叠，笔就得在"同列的多个段"之间来回跳，**一跳就在那个 x 上留一条竖线**。
用户真机实测：**交叉（X）、圆环、细线线稿全部失败**（会退化成锯齿 / 竖栅 / 排线）。
✅ 能画的是 **"每列只有一段"的垂直凸图形**：曲线、阶梯、方波、剪影。
⇒ 想真正"画图"回 **SV 侧**（多层 `PitchControlCurve` 可重叠）。

### 3.3 rap 音高线（`rap-curve`，移植自 SV1「语调教.js」）

**出发点**：ACE 的 `pitch` 在 CLI 上 `available:false` ⇒ 说唱/语调的音高**只能改 `.acep` 的 `pitchDelta`**（半音偏移、0 = 音符音高）。

⛔ **"那走 CLI 不就行了"—— 三条路都封死（2026-10-05 现场取证）**，所以音高线只有两条路：**ACE 界面里人画**，或**我们改文件 + 重开**（重开代价见 §3.5）。

| 看起来能走的 CLI 路 | 实测结果 |
|---|---|
| `vocalparam read/write` | 只有 `layers` / `read` / `write` 三条；`layers` 里 **Pitch 行 = `available:false`**，ACE 给的理由（原文）：**"pitch curves are not on this surface yet: the channel stores a delta while the draw primitive takes absolute pitch, and anchors and vibrato ride on top"** |
| `midiparam … pitchbend` | 只对 **MIDI 片段**：在 sing 片段上报 **`error[INVALID_ARG]` "Clip '{…}' is a sing clip; MIDI params exist only on MIDI clips"**（hint：`clip list` 找一个 GenericMidi clip） |
| `note …`（改音符音高） | 只改**音符自己的音高**（`note move --pitch/--pitch-by`），**不是曲线** |

> 💡 ACE 那句理由顺带证实了文件侧的读法：**channel 存的是 delta**（= 我们的 `pitchDelta`）、**anchors 与 vibrato 叠在上面**
> —— 正好对上真实工程里见到的 `type:"anchor"` entry（§2.2）与 vibrato 字段。

调型表**照搬**那份 JS（它用 **cent**，这里 ÷100 换成 ACE 的**半音**；每个音符区间两端都锚 0）：

| tone（脚本口径） | 控制点（相对音符起点的 tick → cent） |
|---|---|
| `1` 阴平 | **不动**（平） |
| `2` | `onset+1 → −400`、`onset+0.3·dur → −400`（升感） |
| `3` | `onset+1 → −800`、`onset+0.7·dur → −800`（降升） |
| `4` | `end−1 → −1200`（降） |
| `0` 轻声 | `onset+1 → −400`、`end−1 → −800` |

```powershell
node scripts/acep.cjs rap-curve <file.acep> --tones "1234" --track 0 --clip 0            # 只出计划（默认）
node scripts/acep.cjs rap-curve <file.acep> --tones "1234" --from-lyric-tail …          # 声调取自歌词末位数字
node scripts/acep.cjs rap-curve <file.acep> --tones "12" --track 4 --clip 0 --out <目录>  # 写副本
node scripts/acep.cjs rap-curve <file.acep> --tones "12" --track 4 --clip 0 --in-place   # 原地改（自动 .bak）+ 之后必须让 ACE 重开
```

- `--tones` 只吃 `0–4`（其它字符忽略，与那份 JS 的输入框同口径）；`--notes uuid,…` 可只处理选中的那批（按 onset 排序对齐声调）。
- ✅ **ACE 认文件级的音高线改动**（2026-10-04 真机验定，**推翻早先"被清成 0"的结论**）：把整条 lane 写成常量 `+1.5`、写成 6 档阶梯 `+1.5 / −1.5 / −4 / −6 / −8 / −12`、以及 rap 曲线，
  **ACE 重开 + `project save` 后逐值保留**（阶梯在钢琴窗里就是那串台阶），**渲染出来的音频也真按曲线唱**
  （实测 `2142232`：明 58.3 / 天 64.2 / 取 53.8 / 钱 54.8（正从 54 滑向 56）—— 期望 58 / 64 / 54 / 56）。
  ⇒ **离线写音高线就是正路**，不需要"先让 ACE 分析出 entry 再覆盖"。
- 两个写入口都可用：有 entry ⇒ **等长原位覆盖**（`--in-place` 自动 `.bak`）；空 lane ⇒ `--create-lane` **新建 entry**
  （**ACE 也接受**：结构留着、值也留着 —— 离线造工程那条 3586 样本的 entry 经 ACE 两次 `save` 仍在）。
- ✅ **支持多 entry 分段**（真实工程必需：实测有 95 条 entry 的 `pitchDelta`）：工具会**逐条**按自己的 `offset` 换算 tick、逐条等长原位覆盖，
  跳过没有 `values` 的 `anchor` entry，自检也逐条比；⚠️ 但 **ACE `save` 会把它们合并成一条**（值保留，见 §2.2）—— 回读按合并后的结果比。
- ⛔ **只写「逐采样 `data`」形态，且只写 delta**：`rap-curve` 认的是带 `values` 的 entry（§2.2 画法①）；
  **`anchor`（画法②）既不读也不写** ——
  ① 那条 lane 里 anchor 会被**静默跳过**（其它 entry 照写）；
  ② 若整条 lane **只有** anchor，工具会报「没有一条带 values」而**拒写**（这是有意的：改锚点等于改绝对音高，语义不同，不能拿 delta 覆盖）。
  ⇒ 想在**有锚点的 lane** 上画线，先看清它在哪一段：锚点段与我们的 delta 段可能**在时间上并排**（用户工程实测就是 177–762 / 799–1254 / 1513–2172 三段接力）。
- ⛔ **画法③（音符颤音 `notes[k].vibrato`）也不在 lane 里**，`rap-curve` 完全不碰它。
  改它用 **`scripts/acep.cjs vibrato`**（缺省=该 pattern 全部音符；`--notes uuid,…` 选几个；`--freq/--amp/--start/--raw/--clear`；
  **键不存在会自动插入**、已存在则替换、`--clear` 删键并正确减 map 计数）—— ✅ **已验 ACE 认账**（见 §2.2 画法③ 的干净验收数字）。
- ⛔ **2026-10-04 踩过的坑（别再犯）**：`rapPoints` 曾把 `{t:end, v:0}` 拼在平台点**之前**，而 `evalPoints` 假定点列**升序**
  ⇒ 区间内插值全落在那条 0 值段上，**整段被写成 0（ACE 里看就是一条平线）**；当时的"自检值一致 ✅"查不出来 ——
  因为自检比的是"我打算写的"，而错在"**打算写的就是 0**"。现在：① `rapPoints` 按 `t` 升序返回；② 自检多一项**形状**
  （回读非零样本数 == 计划非零样本数，不等即 `exit 1`）。
  ⇒ 通用教训：**回读自检只能证明"写进去的 == 打算写的"，证明不了"打算写的对"**；形状/语义要另用读法核对（下面的报表，或直接在 ACE 里看/听）。

**核对写法**（随技能分发，见 §6）：

```powershell
node scripts/lane-report.cjs <file.acep> --lane pitchDelta --spark   # entry 数 / offset / 样本数 / 非零数 / 值域 + 形状条
node scripts/lane-poke.cjs   <file.acep> --const 1.5 --out v.json   # 造任意值 JSON，配 set-value 做"值敏感度"实验
```

### 3.4 歌词 → 声调序列（喂 §3.3 的 `rap-curve`）

`scripts/lyric-tones.cjs`：读 ACE 工程的歌词，输出**逐音符一个 `0–4`** 的声调串（**直接就是 `rap-curve --tones` 能吃的东西**）。
口径：**阴平 1 · 阳平 2 · 上声 3 · 去声 4 · 轻声 → 0**；**延音 `-` / 非中文 / 定不出 → 1（不动）** —— 逐音符 1:1，**不会错位**。

```powershell
node scripts/lyric-tones.cjs                                  # 连 CLI 读当前工程（第一个 Sing 轨/片段）
node scripts/lyric-tones.cjs --track 4 --clip 1 --notes <uuid,…>
node scripts/lyric-tones.cjs --acep <file.acep> --track 0 --clip 0   # 读工程文件（经 acep.cjs unpack；可读旧壳也认）
node scripts/lyric-tones.cjs --json <clip-note-content.json> --out tones.txt
```

两条定调路径（**纯规则、无 AI**）：

1. **有上下文（推荐）**：仓里装了 `pinyin-pro`（`server/node_modules/pinyin-pro`）⇒ 把连续中文段拼成整段交给它**分词定音**
   —— **多音字按词取音**（实测 银行 `yín háng` / 行走 `xíng zǒu`）。`--no-pinyin-pro` 可关掉这条。
2. **零依赖回退**：查 `references/char-tone.json`（**21,131 字**；由 `tools/gen-char-tone.cjs` 从 pinyin-pro 的字典 `dict1.mjs` 反解 ——
   1 阴平 4564 · 2 阳平 5062 · 3 上声 2974 · 4 去声 6114 · 5 轻声 23 · **多音字 2394**）。
   单音字直接给调；**多音字/表外字给 1 并在表里标「需上下文」**（单字查表本来就定不了多音字）。

- ⚠️ **多音字必须靠上下文**：回退路径会把它们**逐个列出来**，别把那个 1 当成"这个字是一声"。
- ⚠️ **轻声音节：pinyin-pro 给的是 `de0`（0），不是 `de5`** —— 2026-10-05 修过一个 bug：解析正则原先只认 `[1-5]`，
  导致**轻声字全部落到"定不出 ⇒ 1"**（「的」输出 1，应为 0）。现在 **0 与 5 都收，统一映射成 0**（轻声音 = 音高不动）。
  回归见 `tools/test-acep.cjs` §⑥（「的」→0、`2142232`、1:1 对齐、`--no-pinyin-pro` 回退、多音字提示）。
- 表与脚本都**随技能分发**（零依赖可跑）；依赖升级后用 `node tools/gen-char-tone.cjs`（带 `--check` 只比对）重生成。

### 3.5 什么时候该走文件路线（**用户口径 2026-10-05：只适合大改动**）

⛔ **别把"改文件 + 让 ACE 重开"当成随手改的工具** —— 用户明确：**重载时 ACE 会有明显提示**，
所以这条路线**只对大型 / 批量改动有用，小改动不适合直接编辑工程**。
小改动优先 **CLI**（`note` / `lyric` / `phoneme` / `vocalparam` 那套）；文件路线留给"CLI 没开放 **且** 一次要改很多"的场合（典型就是 §3.3 的音高线批量画）。

实测（2026-10-05，同一台机）：

| 操作 | 7 音符 / 5.8 KB | 205 音符 / 1.5 MB（旧壳） |
|---|---|---|
| `project open` | 2.6 s | 1.2 s（旧壳）→ `save` 0.3 s 变 ACEP2 **622 KB** → 重开 1.6 s |
| 文件改写（`rap-curve --in-place` + 自检） | 0.3 s | — |
| `project open --discard-changes`（重开加载） | 1.9 s | 1.6 s |

**重开的副作用（实测）**：

1. **UI 状态复位**：光标 `1000t` → `0`；编辑器选区 `1000t–1500t` → `0–0`；钢琴窗可见性回 `false`（`editor status`）。
2. `caret set` / `editor open` / `selection set` **单独都不会弄脏工程**（隔离实测，dirty 全程 false）。
3. ⚠️ **重开后约 15–20 秒，ACE 自己把工程标成 `dirty:true`**（实测 +15 s false → +20 s true，之后一直 true；`bpm` 未变、撤销栈只有一笔 `actor:""` 的「更改选择」）
   ⇒ **`dirty` 不是"用户有没有真改过"的判据**；要重开就**先 `project save`**（保用户改动），别指望"dirty=false 才动手"。

**dirty 时的原文**（写脚本要认这个）：

```
exit 1 · error[UNSAVED_CHANGES] the current project has unsaved changes
hint: save first (project save / project save-as), or pass discardChanges to drop them
```

✅ **重开真的生效**（不是"看起来生效"）：调型从 `2142232` 换成全 `3`（每音 −8 半音）→ 重开 → `export audio` → 测窗口中位音高：
明 **183 Hz（MIDI 53.9，期望 54）**、天 **204.6 Hz（55.8，期望 56）**；上一版（`2142232`）是 236.9 Hz（58.3）/ 333.8 Hz（64.2）。

**推荐形态**：① **批量**——一次改完 N 处（或 N 份工程）**只重开一次**；② **保守**——只写文件不重开，告诉用户"在 ACE 里重新打开就生效"；③ ⛔ **绝不**每改一小处就重开。

## 4. 安全写入六步

```
① 读 .acep → 校验 off8/off16/off24（头长 + 压缩长 = 文件大小）
② zstd 解 payload（解出长度应等于 off24 声明的原始长度）
③ 定位：文本项用"唯一命中"校验；float64 数组用"前两个值的 0xfb+8B 签名 + 连续 count 验证"
④ 原位覆盖（文本只改自己的长度前缀；数组**元素个数必须不变**）
⑤ 重新 zstd 压缩 → 重建头部（照 §1.1 只改 16/24，高熵区原样复制）→ **写成副本**
⑥ 自检两条：同流程回读逐值比对；**CBOR 整段复解应恰好消费完所有字节**
```

**永远写副本、别动用户原文件**；产出照 §5.2 的"工程包"布局落地。

**旧壳（历史一）不是这六步**：它内层是 JSON 文本 ⇒ 走 `set-json`（整树解析 → 改路径 → 重 `JSON.stringify` → 重 zstd → 重 base64 → 重建包装 JSON，只换 `content`），
同样**只写副本 + 自检回读**（实测见 §1.0）。

### 4b. **离线空造工程**（造 / 改 `.acep` **不需要 ACE**）

> 用户口径（2026-10-04）：**"自己造 .acep 不需要走 ACE"**。ACE 只在两处需要：① 用它自己的 CLI 建工程/音符；② **打开**它做验收（看/听）。
> 下面这条路已**真机验收**：手造工程被 ACE 当**正常有名工程**打开（`isTempProject:false`、名字对、音符与句子层全对）。

**步骤**：

1. **拿一份真工程当模板**（别从零拼 CBOR）。实测模板 `A.acep`：洛天依 v1、1 个音符、片段 3840 tick、15 条 lane **键都在但数组为空**（`pitchDelta` 键在 ⇒ `--create-lane` 可用）。
2. **换 notes**（数组长度可变，工具会改数组头并插字节）：
   ```powershell
   node scripts/acep.cjs set-value <模板.acep> --path 'tracks[0].patterns[0].notes' \
        --value-file <音符数组.json> --name 'ACE-离线新工程-明天去银行取钱' --out <输出目录>
   ```
   产出 `<输出目录>/<名字>/<名字>.acep` + `<名字>/autosave/<名字>_save_<时间戳>.acep` + `<名字>/Samples/`
   —— **必须成套**（只有裸 `.acep` 会被当成"无名临时工程"，§5.2）。
3. **音符 JSON 照模板的键序写**（实测模板键：`uuid,pos,dur,pitch,extraInfo,lyric,language,headConsonants,tailConsonants,syllable,freezedDefaultSyllable,brLen`），并且：
   - ⛔ **必须清 `syllable` 与 `freezedDefaultSyllable`（置 `""`）** —— 它们承载"**这个音怎么读**"：不清就会**唱模板的旧读音**（实测模板里是 `l an` / `l a`）。
     清掉之后 ACE 会**按新歌词重算**（实测：明→`m ing`、天→`t ian`、行→`x ing`）✅
   - `headConsonants` / `tailConsonants` 置 `[]`、`brLen` 置 `0`、`extraInfo` 置 `{}`。
   - `language` 用**文件侧三字母**（`CHN` / `ENG` …）—— ⚠️ CLI 侧报的是全名（`Chinese`），**两边写法不同**。
   - `uuid` 自造即可（唯一就行）。
4. **自检 + 验收**：`verify`（头长 + 解压长 + CBOR 用满）→ `get` 回读 → **让 ACE 打开**：
   `acestudio-cli project open "<输出目录>\<名字>\<名字>.acep" --discard-changes` → 再 `project info` / `clip note-content` / `clip lyrics` 读回。

**⚠️ 已知边界（实测，别当能行）**：

- **ACE 不会自己补分析**：渲染（`export audio` → job）与 `project save` **都不会**给这份 clip 写入 `pitchDelta` / `vuv` / `phonemeTimings`
  （实测：离线造工程渲染前后文件都是 5794 B、音符键集不变）⇒ 这些 lane **只反映"文件里被写过的东西"**，不是引擎分析的落盘。
  ⚠️ 但 ACE 自建的工程里确实见过 `vuv`（0/1 的 voiced 曲线，与 `pitchDelta` 同 offset/同样本数）—— **是谁、什么时候写的还没定论**（§7）。
- 反过来说：~~新建 entry 的值会被 ACE 清成 0~~ —— **该结论 2026-10-04 已被推翻**（那是我方写值 bug，见 §3.3）：
  `--create-lane` 造的 entry **结构与值都被 ACE 留住**，曲线也真被渲染 ⇒ **"离线造音符 + 画音高线"整条链路成立**，不必等 ACE 先分析。
- **ACE 的音素是逐音符 g2p（不看词）**：实测同一个「行」ACE 给 `x ing`，而按词定音（`lyric-tones`）给 `háng` —— 声调相同的字看不出来，
  但**多音字跨词义会分歧**（如 长 cháng2/zhǎng3）⇒ **声调/读音要显式写，别指望 ACE 猜**。

## 5. ACE 会复查什么（**写完必须让它读回来**）

### 5.1 加载时复查：合法值认账，非法值**静默丢弃**

| 文件里写的 | ACE 打开后读回 |
|---|---|
| `syllable = "l an"`（合法覆盖，v1 引擎） | ✅ `isOverride: true`、**`overrideLegal: true`**、`phonemes ["l","an"]` |
| `syllable = "l a l a"`（形状非法） | ❌ `syllable: ""`、`isOverride: false`，**且工程立刻变脏**（紧接着 `project open` 被 `UNSAVED_CHANGES` 挡下） |

⇒ ① **文件级写入 ACE 是认的**；② 非法值不是"忽略"，是"**加载时改内存丢掉并弄脏工程**"——
所以**只读命令读回来才算数**：值没了 = ACE 判你非法，不是你没写进去。

### 5.5 手写的字段 ACE 到底认哪些（**2026-10-05 逐项真机验收**）

**验法**（这套验法可复用到任何新字段）：正规**工程包**里改副本 → `project open <path> --discard-changes` → `project save`（**看 `savedPath` 报出**、比**文件大小/SHA 变了**才证明 ACE 真重写了文件）→ 再读回 / 再重开一次。

| 我们手写的 | ACE 打开 | `project save` 后 | 结论 |
|---|---|---|---|
| `parameters.pitchDelta`（`data`/delta 画法） | ✅ | ✅ 逐值保留 | 既定（§3.3 已用于 rap 音高线） |
| **`parameters.pitchDelta`（`anchor` 画法）** | ✅ | ✅ **逐值保留**（3 点 `100/200/300` = `61.5/63.25/58`、`pointsVUV` = `1/0/1` 全对；save 后重开仍在） | ✅ **手写锚点 ACE 认**（`scripts/acep.cjs anchor`） |
| **`parameters.vuv`**（手写一条 8 样本 `data` entry，全 1） | ✅ | ✅ 原样保留（**没有被 ACE 的分析覆盖**） | ✅ ACE 认手写 `vuv` |
| **`notes[k].extraInfo`**（埋 `{"akdagent":{"probe":"hello","n":1,"tags":["a","b"]}}`） | ✅ | ✅ **逐字段保留**（嵌套 map/数组都在） | ✅ `extraInfo` 是**安全的自留地**（ACE 不碰、不清） |
| `notes[k].vibrato`（含**新插入的键**） | ✅ | ✅ 保留，且**渲染真按它唱**（§2.2③） | ✅ |

- ⚠️ **别把"ACE 自己保存时的连带改动"算到我们头上**：`tree-diff` 实测一次 `save` 里，**换歌手（v1 洛天依 → v2 Ember Rose）会让 ACE 重算 `notes[*].phonemeTimings` 的秒数**（辅音时长变了），这与参数写入无关。
  ⇒ 判"我们改了什么"永远用 **save→改→save 两快照 diff**，不要拿"打开前的文件"跟"保存后的文件"直接比。
- 只有 `pitchDelta` 的 `data` 形态能用**等长原位覆盖**；`anchor`/`vuv`/`extraInfo` 都是**变长**写（走 `set-value` 的重编码或 `anchor` 的 lane 数组计数维护）。

### 5.2 ⛔ 工程必须成"包"：`<名字>\<名字>.acep` + `autosave\` + `Samples\`

ACE 自己 `save-as` 出来的目录长这样：

```
<名字>\<名字>.acep
<名字>\autosave\<名字>_save_2026_10_04_16_32_52_067.acep     ← 同名快照（本地时间 + 毫秒）
<名字>\Samples\                                              ← 采样目录（可为空）
```

**只放一个 `.acep` 的文件夹**会发生什么（实测）：

```
$ acestudio-cli project open …\<名字>\<名字>.acep --json
exit 0  →  { "isNewProject": false, "isTempProject": true, "projectName": "", "projectPath": "" }
```

内容读得到、exit 0，**但被当成"无名临时工程"**（对照：正常的回 `projectName` + 真实 `projectPath`）。
⇒ **"打开成功" ≠ "被当成有路径的工程"**。写文件路线要照上面把包补齐（含一份 autosave 快照）。

**✅ 到底哪个子目录是必需的（2026-10-05 实测，五种布局对照）**：

| 布局 | `isTempProject` |
|---|---|
| `<名>\<名>.acep` + **`autosave\`** + `Samples\` | **false** ✅ |
| `<名>\<名>.acep` + **只有 `autosave\`** | **false** ✅（**这就够**） |
| `<名>\<名>.acep` + 只有 `Samples\` | true ❌ |
| `<名>\<名>.acep`（同名目录，两个子目录都没有） | true ❌ |
| `<别的名>\<名>.acep`（裸文件） | true ❌ |

⇒ **起决定作用的是 `autosave\` 子目录**；`Samples\` 对"被认成有路径工程"没有影响（内容仍能读，只是被当无名临时工程）。**同名目录本身不够**。

### 5.3 打开/保存的 CLI 语义（会用得上）

- `project open` 在当前工程有未保存改动时**拒绝**：`UNSAVED_CHANGES`（hint：先 `project save`，或传 `discardChanges`）。
- `project save-as <目录>\<名字>.acep` 会**自己创建** `<名字>\` + `autosave\` + `Samples\`。
- CLI 写操作可**一笔撤销**（`history list --json` 看 `actor:"远程控制"` → `history undo --json`）；
  **文件改没有撤销**，只能靠你留的副本。
- **想让 ACE 真渲染一次**：`export audio --path <临时.wav> --scope master` 会起一个 `export-audio` 作业（`job wait <id>`）；
  `project synthesis-status` 只报"当前有没有合成在跑"，**CLI 没有"合成"命令**。⚠️ 渲染**不会**把结果写回 `.acep`（上一条）。

### 5.4 ⚠️ 导出「数字静音」的一种成因：轨上插了 `kind:0` 的乐器（2026-10-05 实测）

症状：`export audio` 作业报 `succeeded`，WAV 长度也对，但**整段是数字静音**（全曲最大幅度 `0.00000`）；
而音素/时长面一切正常（`phoneme list` 有 `l a` + timings ⇒ 这条 clip **合成过**）。

成因：该轨 `externalFxChain` 里插了一个 **`kind:0`（乐器）** 的插件 —— 实测是
`{"typeId":"VST3-Synthesizer V Studio 2 ARA Plugin-…","pluginFormatName":"VST3","kind":0}`，
而 ACE 原生效果（Vocal EQ / Compressor / De-Esser / Reverb）都是 **`kind:1`（效果）**。
⇒ 乐器插槽把这条 **Sing 轨的出声接走**，ACE 声库（洛天依）不再出声。

- **判据**：先量一下 WAV（`scripts/f0-contour.cjs <wav> --info`，看"最大幅度"是不是 0）× 再看轨上 `kind`。
- **验证过的最小修复**：把 `track.externalFxChain` 置 `[]`（副本上做的）→ 同一工程立刻**有声**（最大幅度 0.087）。
- ⚠️ 这也解释了"为什么这条轨在界面里也听不见" —— 不是声库/语种问题。

## 6. 工具：`scripts/acep.cjs`（随本技能分发，零依赖）

```powershell
node scripts/acep.cjs info      <file.acep>                      # 壳判别 + 头字段 + 长度校验 + CBOR 用量 + 顶层键
node scripts/acep.cjs unpack    <file.acep> <out.json>           # 整棵树落成 JSON（新壳 CBOR→JSON；旧壳内层 JSON）
node scripts/acep.cjs get       <file.acep> --path '…'           # 两种可读壳都认
node scripts/acep.cjs set-json  <file.acep> --path '…' --value V --out <目录>   # **旧壳（历史一）的编辑入口**（重压缩 + 重 base64 + 自检）
node scripts/acep.cjs verify    <file.acep> [--expect "新字节"]   # 自检：长度 / 原始长 / CBOR 用满 / 新字节在位
node scripts/acep.cjs dump      <file.acep> [--tree 3] [--find pitchDelta] [--json out.json]
node scripts/acep.cjs set-text  <file.acep> --old "l an" --new "l a l a" --out <目录>
node scripts/acep.cjs set-value <file.acep> --path '…' --value '<JSON>'|--value-file f [--name 新名字] [--out <目录>|--in-place]   # 通用子值替换（**空造工程/改结构**，长度可变）
node scripts/acep.cjs set-array <file.acep> --sig v0,v1 --values "@值文件" --count N --out <目录>
node scripts/acep.cjs rap-curve <file.acep> --tones "1234" [--track N --clip M] [--from-lyric-tail] [--create-lane] [--out <目录>|--in-place]   # rap 音高线（见 §3.3）
node scripts/acep.cjs vibrato   <file.acep> [--track N --clip M] [--notes uuid,…] [--freq 5.5] [--amp 1.5] [--start 0.14|--start-tick N] [--raw JSON] [--clear] [--out <目录>|--in-place]   # 音符颤音（第三种画法，见 §2.2③）
node scripts/acep.cjs anchor    <file.acep> [--track N --clip M] [--entry I | --append] --points "100:61.5,200:63.25" [--vuv "1,0"] [--clear] [--out <目录>|--in-place]   # 锚点（第二种画法，值是**绝对音高**，见 §2.2②）
                                                                          #   ⚠️ 插 entry 只能 `--append`（插中间会动后面所有 entry 的字节位移）；`--clear` 必须配 `--entry` 且**只删 anchor**（data 形态拒删）
node scripts/lyric-tones.cjs [--track N --clip M | --acep <file.acep> | --json <f>] [--no-pinyin-pro] [--out tones.txt]   # 歌词 → 声调串（见 §3.4）
node scripts/tree-diff.cjs <a.acep> <b.acep> [--json] [--max N] [--only RE]   # **两快照逐字段 diff**：定位"哪个字段被改动了"（§2.5b / §5.5 的取证工具）
                                                                          #   用法：save→快照 A → 做一件事 → save→快照 B → diff；退出码 1 = 有差异
                                                                          #   长数值数组只报"长度/值域/差异下标"，不刷屏（`--full` 全列）
node scripts/lane-report.cjs <file.acep> [--lane RE] [--spark]        # **独立核对**：每条 lane 的 entry/样本/非零数/值域/形状（见 §3.3）
                                                                    #   ⚠️ 两种形态都读：`data` 报样本/值域/形状条；`anchor` 报**点数 + tick→绝对音高 + pointsVUV**
                                                                    #   ⛔ 还会警告 `externalFxChain` 里的 `kind:0`（乐器）插槽 ⇒ 导出会静音（§5.4）
node scripts/f0-contour.cjs <wav> --scan|--info|--win a:b           # **渲染音频核对**：F0 轮廓/颤音速率与深度（定/复核 §2.2 画法③ 的量纲）
                                                                    #   ⚠️ 分析窗越长越削颤音幅度；定量纲用 --winlen 512 --hop 55 看收敛值
node scripts/acep.cjs selftest                                      # **自检**（43 项，零依赖不碰工程）：rapPoints 升序 / evalPoints / 栅格 / CBOR round-trip（含 half float、不定长）/ 打包头字段
node scripts/lane-poke.cjs   <file.acep> [--const V|--range A-B:V|--at I:V] --out values.json   # 造任意值 JSON（配 set-value 做值实验）
```

- `set-text` / `set-array`（新壳等长原语）与 `set-json`（旧壳）都**只写副本**，并按 §5.2 的工程包布局产出（`<目录>/<名字>/…` + autosave 快照 + `Samples\`），写完**自动跑自检**。
- 它**只在安全时写**：文本项命中不唯一 ⇒ 拒；数组元素数与给定值个数不一致 ⇒ 拒（**原位覆盖长度必须不变**）。
- 它**不做**整段 CBOR 重编码 ⇒ **不能加/删音符、不能加/删采样点**。这类改动要么整段重编码，要么回 CLI 做。
- 读取路径语法：`a.b[0].c`（`--path` 省略 `$` 也认）。

**离线回归**（`node tools/test-acep.cjs`，**84 项**，2026-10-05 建；**自己造夹具**、不碰 ACE、不碰用户工程）：

- **新壳合成夹具**：自写 1280 B 头 + 自写 CBOR 编码器 + Node 自带 `zlib.zstdCompressSync` ⇒ 与 `acep.cjs` 的解码器**互为交叉验证**。
- 覆盖：容器自检 · **三种画法**在 `lane-report` 里都报对 · `vibrato` 的**插入/替换/清除** · `rap-curve` 对 anchor-only lane **拒写** · **`anchor` 的追加/替换/清除 + 6 个负例 + 空 lane 长出第一条 entry** · `lane-poke` 分段几何 · `lyric-tones` 声调映射（含**轻声 →0 那个 bug**） · §5.4 的 `kind:0` 静音判据 · **`timeUnit:"sec"` 守卫**（正反两面） · **旧壳（历史一）的读 / `set-json` 往返 / 新壳工具必须拒**。
- ⚠️ **旧壳覆盖是 2026-10-05 才补的**（此前零测试）—— 而**用户的真实老工程全是旧壳**（`senpa` / `激光镜头` / `我曾遇到` …），`set-json` 是改它们唯一的入口。

## 7. 已知未知（**别当事实**）

1. **头部 1248 B 高熵区是什么**（校验？签名？密钥？）—— 机制仍不明，但 **2026-10-05 实测：把它整段清零（byte 32..1279）ACE 照常打开**（`isTempProject:false`、名字/路径对、7 个音符与歌词全对）⇒ **它不是"打开时的校验"**（也可能是 ACE 保存时会重算）。结论：**当黑盒原样复制即可，不必理解**。
2. ~~ACE 打开手改文件时会不会重算分析、把 `pitchDelta` 覆盖掉~~ —— **已验（2026-10-04）**：不会。重开 + `project save` 后逐值保留（常量 / 阶梯 / rap 曲线都试过）。
3. ~~写进 `pitchDelta` 的值会不会真被唱出来~~ —— **已验**：会（导出音频测窗口中位音高，逐音对上期望，见 §3.3）。
4. ~~其它 lane 的栅格（`energy`/`gender` 1939 那套）~~ —— **已验（2026-10-05）**：`energy`/`tension`/`air` 是 **1 样本/tick（960 Hz）**（ACE 元数据：1000 tick → 1000 点），**别套 pitchDelta 的 15/16**；`gender`/`mamba*` 只在**新世代 clip** 上（见 §2.2 表）。
5. ~~`autosave\` / `Samples\` 是必要条件还是仅仅相关~~ —— **已验（2026-10-05）**：**`autosave\` 才是必需的**，`Samples\` 无关；同名目录本身不够（§5.2 五种布局对照）。
6. ~~**"pin" 在文件里长什么样**~~ —— **已验（2026-10-05）**：`phonemeTimings` 的**元素长度**就是判据（2 元素 = 未 pin；**3 元素 = 被 pin**，第 3 个是 pin 的秒数）；v1 的"辅音长度"那套**没有 pin 概念**。仅剩**第 2 个元素**含义未定（见 §2.4）。
7. ~~**`vuv` 是谁写的**~~ —— **已验（2026-10-05）**：
   - **只播放、只渲染都不写**（1 音符级的干净对照：`transport play` 8 s + `save`、`export audio` + `save`，两次 lane 里都**只有 `pitchDelta`**）；
   - **在编辑器里画一次音高线会写**（用户工程实测：`vuv` 那条 entry 与同 lane 的 `data` 曲线**同 offset=177**、值全 1.0）。
   ⇒ **`vuv` 是"编辑动作"的产物**（分析/演唱结果的随写缓存），不是渲染副产物 —— 这也解释了为什么我们离线造工程渲染完它也不出现。
   - ✅ **但 ACE 不会擦掉手写的 `vuv`**（2026-10-05 补测）：手写一条 8 样本、值全 1 的 `data` entry → 打开 + `save` 后**原样还在**（§5.5）⇒ 想预置 `vuv` 是可行的。
8. **`notes[k].extraInfo` 是安全的"自留地"** —— **已验（2026-10-05）**：埋进去的嵌套对象/数组（`{"akdagent":{…}}`）打开 + `save` 后**逐字段保留**，ACE 不清、不改（§5.5）⇒ 需要"跟着工程走"的元数据可以放这儿（但**别指望 ACE 的 UI 会显示它**）。
9. **"谁改了这个文件"要靠两快照 diff，不能靠单次前后比** —— **已验（2026-10-05）**：ACE 自己 `save` 会连带重算东西（换歌手 ⇒ 重算 `phonemeTimings` 秒数；分段 entry 会被合并，§2.2）⇒ 取证一律 `save→快照 A → 操作 → save→快照 B → tree-diff`。


## 8. 纪律

0. **改工程的纪律与 SV 侧同一套（用户 2026-10-04 指定）**：① 先让宿主**落盘**（`project dirty` 得 `false`；有未保存改动就先 `project save`）；
   ② **备份**原文件（`--in-place` 会自动写 `<file>.bak-<时间戳>`）；③ **只改必要字节**（等长原语优先；要改长度就整体重编码）；④ 改完让 ACE **重新打开**那份工程
   （`project open <path> --discard-changes`；ACE 里那份是旧内存状态，不重载看不到）；⑤ **读回核对**（工具自检 + ACE 侧只读命令 + 真机看/听）。
   ⇒ 一句话：**我在后台改文件，改完你重开工程**；没有第 ④⑤ 步的改动不算完成。
1. **能走 CLI 就走 CLI**；文件路线只在 CLI 没开放的能力上用（当前已知：人声音高曲线）。
2. **只写副本**；原文件一律不动，产出带时间戳落到 <目录>。正常就是 §4 那套（当前格式）；**万一文件解不开**再看 §1.0 的两种历史壳（可读的那种走 `set-json`，加密的那种**弃用不处理**）。
3. **写完必须让 ACE 读回来**（§5.1）—— 文件级自检只证明"字节写对了"，证明不了"ACE 认"。
4. 改**长度不变**的东西（这是绕开重编码的前提）；长度要变，先想清楚怎么整段重编码。
5. **别把技能当事实源**：ACE 版本一变（surface 会变），先用 `info` / `verify` 在真工程上复核一遍再动手。
6. 涉及**用户工程**时要先备份并说清"这是副本"；别在用户正在编辑的工程上原地改。
7. 改动数值/口径记得 +版本：文字更正 +0.0.1 · 新增小节 +0.1.0 · 结构调整或规范变更 +1.0.0。
