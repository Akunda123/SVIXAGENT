---
name: ace-params
description: ACE Studio（第三方宿主，走它自己的 acestudio-cli / MCP，不经我们的桥）的**参数功能表与写法**：人声参数曲线的真机花名册（dynamic/air/falsetto/tension/energy + 不可用的 formant/pitch 及原因）、每个参数的 scale 与 valueRange、**层模型**（baseline/user/envelope/direct/global，effective 永远只读）+ `role`/`sparse` 两个易漏字段、三种载荷形状（dense 每 tick 一值 / points 锚点 / scalar）与 `--pos-begin`、**两个会被直接拒的门槛**（dense run ≥2 tick、points 擦除形式）、怎么写（`vocalparam layers/read/write`、`midiparam list-lanes/CC/pitchbend、velocity`）、越界一律 INVALID_ARG 不 clamp、以及只在 PowerShell 里会踩的 JSON 引号坑。触发：给 ACE Studio 调参数、ACE 的参数曲线/包络怎么写、**dynamic 是什么（ACE 2 的整体动态宏）**、air/falsetto/tension/energy 是什么、ACE 能不能画音高线、ACE 的 CC / pitchbend、vocalparam、midiparam、ACE 参数层/尺度/路由、ACE 参数写不进去或被拒。
version: 1.2.0
---

# ACE 参数功能表（人声曲线 + MIDI 参数）

> **适用范围**：ACE Studio（`app_version 2.1.8` · CLI `0.17.0` · **surface 17.1**）——
> 它**不走我们的桥**（没有心跳/op/面板），一切通过 `acestudio-cli` 或它的 MCP server（63 个工具，`<域>_read`/`<域>_edit`，与 CLI 同一套 surface）。
> ⚠️ 本技能只讲 ACE；**与 Synthesizer V / Instrument X 的桥、参数名、量纲无关**，别混用。
> 真机数据取自 **2026-10-03**（Verse 2.7 声库 / `singing-mamba` 引擎 / 逻辑 clip）；surface 仍自述 **pre-1.0、接口会变**
> ⇒ 任何结论**先按 §1 自查**，别照抄本文。

## 1. ⛔ 先自查（**最重要的一步**）

```powershell
`$cli = "`$env:ProgramFiles\ACE Studio\acestudio-cli.exe"
& $cli vocalparam layers --clip-uuid '{...}' --json     # 这一份 clip 到底有哪些参数/层/形状/尺度，available 是什么
```

- **不要按花名册（参数名列表）猜能不能写** —— 官方口径就是"**读 `available` 与 `unavailableReason`**"。
- `available` / `scale` / `valueRange` / `layers[].{layer,role,shape,access,sparse}` 都由这条命令给出；`layers` 为空 = 不可用。
- 参数花名册**随"声库的引擎世代"与"人声控制路由"变**：`engineGeneration`（如 `singing-mamba` / 老 `verse24`）与 `vocalControlRoute`（`dynamic` 或 `legacy-four-params`）都在这一份输出里报。
- 拿 clip-uuid：`clip list --track-index <N>`（**必须先有这个参数**，否则报缺参）。
- ⚠️ **同一个 clip 的读数会变，别缓存**：实测同一条 Sing clip 在几小时内从 `paramCount=1`（只列 `pitch`、且不可用）变成 `paramCount=6`（`air` 可用）——
  原因是**运行期解析出的声源不同**（后来明确是 `Verse23` / generation `v1`）⇒ **每次现读 `layers`**，不要按上一次结果或声库名推断。

## 2. 真机花名册 —— ⚠️ **两代引擎是两套东西**（2026-10-04 A/B：同一工程两条轨同时读）

> **本节最重要的一句话**：**`param` 名字一样 ≠ 同一种参数** —— **尺度 / 范围 / 层集合全都不一样**（引擎世代不同）。

| | **v2 代**：`Ember Rose` / `Verse 2.7` / `singing-mamba` | **v1 代**：`洛天依` / `Verse23` / `verse24` |
|---|---|---|
| `paramCount` | **7** | **6** |
| **`dynamic`** | ✅ `control` `[-1,1]` · 层只有 `user`/**points** | ❌ **根本没有这一项** |
| `air` | ✅ `model` `[0,1]` · `baseline`(ro,dense) + `user`(rw,dense) | ✅ **`envelope`** `[0.2, **2.5**]` · `baseline`(ro) + **`direct`**(rw) + **`envelope`**(rw) |
| `falsetto` | ✅ `model` `[0,1]` · 同上 | ✅ **`envelope`** `[0.3, 3]` · 同上 |
| `tension` | ✅ `model` `[0,1]` · 同上 | ✅ **`envelope`** `[0.3, 2.5]` · 同上 |
| `energy` | ✅ `model` `[0,1]` · 同上 | ✅ **`envelope`** `[0, 2]` · 同上 |
| **`formant`** | ❌ `available:false`（*"the clip's singing-mamba engine generation has no formant parameter"*） | ✅ **可用**：`envelope` `[-1,1]` · 只有 **`envelope`** 层(rw) |
| `pitch` | ❌ `available:false` | ❌ `available:false`（原因同） |
| `vocalControlRoute` | `dynamic` | **`dynamic`**（⚠️ **但一个 control lane 都不列**） |

#### 2.0 四条硬结论（每条都有 A/B 实测支撑）

1. ⛔ **`dynamic` 是新一代（v2 / `singing-mamba`）独有的** —— v1（`verse24`）花名册里**根本没有它**
   ⇒ 用户口径"**它是 ACE 2 的参数**"成立（详 §2b）。
2. ⛔ **"路由 = `dynamic`" ≠ "有 `dynamic` lane"**：v1 那条 clip **也报** `vocalControlRoute: "dynamic"`，
   但 **一个 control lane 都不列**（官方原话 *"a verse24 clip lists no lanes at all"*）
   ⇒ **路由是工程级设置；lane 有没有取决于引擎**。
3. ⛔ **同名参数的尺度/范围随引擎变**：`air` 在 v2 是 `model` `0..1`，在 v1 是 **`envelope` `0.2..2.5`**（**围绕 1.0 的乘数**）
   ⇒ **跨引擎抄数值一定错**；连"往 SV 换算"的公式也**只对它来源的那一代成立**（见 `akdagent-playbook` §四）。
4. ⛔ **层集合也随引擎变**（**我们之前把 v2 的结论外推了，这里纠正**）：
   - **v2**：`baseline`(ro) + **`user`**(rw) —— **没有** `direct`/`envelope`/`global`
   - **v1**：`baseline`(ro) + **`direct`**(rw) + **`envelope`**(rw) —— **没有** `user`
   ⇒ 所以**别再说"`envelope`/`direct` 这些层不存在"**（文档说"可能存在"是对的，**v1 上就存在**）；
   正确表述：**层集合由引擎决定，以 `vocalparam layers` 的矩阵为准**。

> 🔁 **v2 那套的复现**：两个不同声库读过（`Verse 2.7` + `Ember Rose`），字段逐一致 ⇒ 表稳。
> ⚠️ 但**同一条 clip 的读数也会变**（先后读到 `paramCount` 1 与 6，见 §1）⇒ **表可以信，读数必须每次现读**。

#### 2.0b 下面这张是 **v2 那套的逐字段原样**（供照抄/对账）

| 参数 | available | `scale` | `valueRange` | 层（`access` / `shape`） |
|---|---|---|---|---|
| `dynamic` | ✅ | `control` | `[-1, 1]` | `user`: **rw** / **points**（稀疏锚点） |
| `air` | ✅ | `model` | `[0, 1]` | `baseline`: ro / dense · `user`: **rw** / **dense** |
| `falsetto` | ✅ | `model` | `[0, 1]` | 同上 |
| `tension` | ✅ | `model` | `[0, 1]` | 同上 |
| `energy` | ✅ | `model` | `[0, 1]` | 同上 |
| `formant` | ❌ | — | — | reason：**"the clip's singing-mamba engine generation has no formant parameter"** |
| `pitch` | ❌ | `semitones` | — | reason：**"pitch curves are not on this surface yet: the channel stores a delta while the draw primitive takes absolute pitch, and anchors and vibrato ride on top"** |

⚠️ 从这张（v2 的）表直接读出来的两条：

1. **`formant` 与 `pitch` 是"看得见、用不了"**（**仅限 v2**；v1 上 `formant` 是**可用**的，见上面的 A/B 表）。
2. **`pitch` 的原因不是"没做完"，是语义对不上**（通道存 **delta**、draw 原语收 **absolute**，anchors/vibrato 还要叠上去）。

> 🔁 **2026-10-04 复现（换了声库）**：在另一声库（**`Ember Rose` / `Verse 2.7` / generation v2**，同 `singing-mamba` + route=`dynamic`）上再读一次，
> **这 7 行逐字段一致** —— 含 `dynamic` 只有 `user`/`points`、四个 `model` 参数的 `baseline`（只读/dense/`analyzed-pristine`）+ `user`（读写/dense/**sparse**）、
> `formant`/`pitch` 的 `available:false` 与各自原因原样 ⇒ **这张表是稳的**。
> ⚠️ **但"读数"本身会变**：同一条 v1 clip 我们先后读到 `paramCount=1` 和 `6`（见 §1）⇒ **表可以信，读数必须每次现读**。

### 2b. `dynamic` 是什么（**人声**，不是器乐）—— 以及"**为什么你可能没见过它**"

- **它是人声参数**：属于**"人声控制"（vocal controls）**——面板顶部那排 pill / 抽屉，**不是** MIDI/器乐参数。
  器乐那侧在别的域：`midiparam`（CC / pitchbend / velocity）、`instrument`/`fx`/`audio-plugin set-param`（归一化 `0..1`）。
- ⭐ **定性（用户 2026-10-04 确认）**：`dynamic` 是 **ACE 2 的参数，用来调整"整体动态"** ——
  即它**不是**逐音符的力度，而是**整段/整体的动态**（表情）旋钮；这与下面两条完全吻合：
  ① 官方原话 *"Dynamic stands in for those lanes"*（它替掉上一代那四条）；
  ② 我们实测**只在 `singing-mamba`（v2 代）的 clip 上见到它**（两次、两个不同声库都在）；而老一代 `verse24` 的 clip 花名册里**没有它**
  —— **2026-10-04 A/B 实测钉死**（同工程 index 0 = v2 有、index 4 = v1 没有，全表逐行比对，见 §2 表）。
  ⇒ **一句话记法**：`dynamic` = **ACE 2 的整体动态宏**（双极性：一头柔/气、一头力量/胸腔）。
- **它是"四合一替身"**：官方原话 *"Dynamic stands in for those lanes"* ⇒ `dynamic` 一个 lane **合并代表**
  老的四个（`power` / `soft` / `airy` / `chest`）；**它们四个在 `dynamic` 路由下根本不列出来**。
- **语义是双极性的表情宏**（官方示例原话）：**负值偏 Soft / Breathy，正值偏 Power / Chest** ——
  ⇒ ⚠️ 它**不等于"响度"**：它同时带了音色轴。转 SV 时只落 `loudness` 会丢音色那一半
  （要补就得同时给声线/`vocalMode_*`，SV 侧没有单一对应）。
- **它只在一条路由上存在**（`vocalControlRoute`，两条二选一）：
  | 路由 | 面板/花名册列出 | 不列出 |
  |---|---|---|
  | `dynamic` | **`dynamic`** + 该声库发布的其他所有 control | 被它合并的四个（`power`/`soft`/`airy`/`chest`） |
  | `legacy-four-params` | 四个（`power`/`soft`/`airy`/`chest`）+ 其他 control | **`dynamic`** |
- ⚠️ **路由在工程加载时定死、永远不改**：官方原话 *"it is never set"* —— **CLI 改不了、UI 也改不了**
  ⇒ 所以"我在面板上没见过 dynamic"**完全正常**，多半是你那个工程落在 `legacy-four-params` 路由上；
  想见到它只能**换声库/新工程**，没有"切过去"的操作。
- ⚠️ **引擎世代决定 control lane 有没有**：`dynamic`/`rap`/`opera`… 这些**人声控制**挂在 **`singing-mamba`** 面板上，
  官方原话 *"a verse24 clip lists no lanes at all"* —— **但这句话说的是 control lane**：
  实测老 `verse24`（v1 声库）的 clip **仍会列出 `model` 那四个**（我们读到 `paramCount=6`、`air.available=true`）。
  ⇒ 别把"没有 control lane"读成"没有参数"；**一切以当场 `vocalparam layers` 为准**。
- **层形状也特殊**：`dynamic` **只有 `user` 一层、形状 `points`**（没有 `baseline`/`envelope`/`direct`）
  ⇒ 因此它**没有 `global` 旋钮、也就没有 `effective` 合并曲线**（官方两处点名：`effective` 对 Dynamic 缺席）。
  写它就是写**锚点**：`--points '[[0,-0.5],[960,0.8]]'`（**不用** `--pos-begin`）。

## 3. 尺度不可混用（官方原话 "Scales are not interchangeable"）

| 尺度名 | 出现在哪 | 量纲 |
|---|---|---|
| `model` | **v2 代**的 `air`/`falsetto`/`tension`/`energy` | `0..1` |
| **`envelope`** | ⚠️ **它不只是"层"，也可以是参数自己的尺度**：**v1 代**的 `air`/`falsetto`/`tension`/`energy`/`formant` 全是这个尺度 | **围绕 `1.0` 的乘数**（实测范围举例 `air 0.2..2.5` · `falsetto 0.3..3` · `tension 0.3..2.5` · `energy 0..2` · `formant -1..1`） |
| `control` | `dynamic`（以及声库发布的"人声控制"） | lane 通常 `0..1.25`；`dynamic` 是 `[-1, +1]` |
| `semitones` | `pitch`（两代都不可用） | 半音 |

**同一个数字在不同参数上意思不同，写错不会报错 —— 会变成另一种意思。**
⚠️ 而且**同一个参数名在两代引擎上可能属于不同尺度**（`air` = v2 的 `model 0..1` / v1 的 `envelope 0.2..2.5`）
⇒ **凡是跨引擎、跨版本、或"从文档抄来"的数值，一律先 `vocalparam layers` 看它这一代的 `scale` 与 `valueRange`**。

## 4. 层模型（ACE 特有）

| 层 | 角色 | 形状 | 能否写 |
|---|---|---|---|
| `baseline` | `analyzed-pristine` / `synthesized-default` | `dense` | **只读**（引擎自己产出的） |
| `user` | `override` | `dense` 或 `points` | **读写**（"画"出来的那些值） |
| `envelope` | `multiplier` | `dense` | 读写（若该参数有） |
| `direct` | `override`（绝对值） | `dense` | 读写（若该参数有） |
| `global` | `offset` | `scalar` | 读写（若该参数有） |
| `effective` | 各层的**合并结果** | 总是 `dense` | **永远不可写**（合并规则归引擎；写回 = 把合并规则搬到调用方，官方明确拒绝） |

⚠️ **哪些层真的存在，由引擎世代决定**（文档说"可能存在"是对的 —— 是**我们**先前误把 v2 的结论外推了）：

| 引擎 | 实测层集合（`vocalparam layers` 的矩阵） |
|---|---|
| **v2**（`singing-mamba`） | `baseline`(ro) + **`user`**(rw) + `dynamic` 这种 control lane 只有 `user` ⇒ **没有 `direct`/`envelope`** |
| **v1**（`verse24`） | `baseline`(ro) + **`direct`**(rw) + **`envelope`**(rw) ⇒ **没有 `user`**；`formant` **只有 `envelope`** 一层 |

`vocalparam write` **必须点名 `--layer`**（没有默认值 —— 官方说"猜调用方想写哪层正是这个 surface 要防止的错误"）。

**两个容易看漏的字段**（每行 layer 都带）：

- **`role`** 告诉你 **baseline 是从哪来的**（这决定它还值不值得参考）：
  - `analyzed-pristine` = **分析真实音频**得来的（实测：v2 声库 `Verse 2.7` / `singing-mamba` 的 clip）
  - `synthesized-default` = **引擎默认合成**（实测：v1 声库 `Verse23` / `verse24` 的 clip）
  - 其余是层的角色：`override`（`user`/`direct`）· `multiplier`（`envelope`）· `offset`（`global`）
- **`sparse`** 与 `shape` **不是一回事**：`shape: dense` + **`sparse: true`** = 层按 tick 栅格存、但**只在画过的地方有值**，
  读回来**会带 `null`（空档）**；`sparse: false` = 整段连续。写 dense 时用 `null` 抹掉一段（官方把"抹掉"定义为写 `null`）。
  ⇒ 别因为 `shape` 是 `dense` 就假设"每个 tick 都有值"。

### 4b. 实测：读回包长什么样、"实参"是什么、**"谁画过"怎么判**

`vocalparam read --clip-uuid C --param P --layer L` 的回包**固定四块**：

| 块 | 内容 |
|---|---|
| `layers[]` | **你请求的那一层**（请求 `effective` 时**是空数组**）：`{layer, access, role, shape, sparse, points}` |
| **`effective`** | **各层合并后的"实参"**：`{layer:"effective", access:"read-only", role:"merged", shape:"dense", points:[…]}` ⇒ **只读、永不落盘**（`write --layer effective` 被明确拒） |
| `unvoiced[]` | `{begin, end}` 段 —— 未画/无声区间（实测 7680 tick 的片段 3–6 段、12480 tick 的 11 段） |
| 元数据 | `count`（= 片段 tick 数）· `posBegin` · `scale` · `engineGeneration` · `valueRange` · `displayName` |

**三条实测纪律**：

1. ⚠️ **别拿"`effective` 有变化"当"有人画过"**：v2（`model` 尺度）的 `effective` **天生**是引擎逐帧算出的曲线（实测几千种取值、均值 0.75 之类）；
   **要判"被画过没有"，看可写层的非空计数**（`points` 里非 `null` 的个数）。实测同一份工程：v2 clip 的 `air` → `user` **非空 1236/7680**（画过）；
   `tension` → `user` **0/7680**（没画过，`effective` 照样满帧在变）。
2. **`sparse` 的含义在数据上直接可见**：v1 clip 的 `air` → `direct`（`sparse:true`）**1561/12480 非空** · `envelope`（`sparse:false`）**12480/12480 非空**，
   两者合并出 `effective` 0.1938–1.0071（11671 种取值）⇒ **"实参 = baseline ⊗ envelope ⊕ direct"** 的活例。
   ⚠️ **`effective` 的极值可以略微越出 `valueRange`**（实测 min **0.1938** < 声明下限 0.2）—— `valueRange` 约束的是**写入**，不是"实参不会越界"的保证。
3. **`dynamic` 没有 `effective`**（control lane 只有 `user` 层，读 `--layer effective` 直接失败）；`pitch` 在这个 surface 上 `available:false`；`formant` v2 ❌ / v1 ✅。

## 5. 三种载荷形状（写之前先看该层的 `shape`）

> 🆕 **CLI 参数名 → `.acep` 里哪个字段**（2026-10-05 实测钉死，**两名字往往不对应，别猜**）：
> `dynamic` → `patterns[*].vocalControls.__dynamic`（`{global, lines:[{ticks,values}]}`）· `energy/tension/falsetto` → `parameters.mambaEnergy/mambaTension/mambaFalsetto` ·
> **`air` → `parameters.`**`mambaBreathiness`**（⚠️ 不是 `mambaAir`）。**只有 v2（`singing-mamba`）有 `dynamic`，`mamba*` 也只在 v2 clip 上非空。**
> 取证手法（save→写→save 两快照 diff）与完整表见 **`acep` §2.5b**。

| 形状 | 长什么样 | 写的时候 |
|---|---|---|
| `dense` | 从 `posBegin` 起**每 tick 一个值** | **必须给 `--pos-begin`**（实测漏了会被拒：`error[INVALID_ARG]: posBegin is required for a dense write`）；空档写 `null`；长曲线用 `--encoding base64`（`{"dtype":"f64le","count":N,"data":"…"}`） |
| `points` | `[[tick, value], …]` 锚点 | 自带 tick，**不要**给 `--pos-begin` |
| `scalar` | 一个数 | 什么都不用给 |

⚠️ **dense 的粒度是"每 tick 一个值"**：2 小节的 clip 一次 read 回来就是 **3840** 个数 ⇒ 长片段务必 base64。
**点数据走文件/stdin，不逐点命令行**：`--points @curve.json` 或 `--points @-`。

**写回包（实测）**：`{param, layer, posBegin, count, clearedCount, fingerprint:"2:vocalparam-curve:…"}` ——
`fingerprint` 就是下一次写该用的 `--if-match`；**`clearedCount` 报"这次抹掉了多少 tick"**（写 `null` 时它 > 0：
实测 `--points [null×240]` ⇒ **`clearedCount: 240`**，该段回到基准，读回又是 `1.0`）。
⚠️ 写进去的值**读回来会变**（实测写 `1.2` 读回 `1.2000000476837158`、写 `0.8` 读回 `0.800000011920929`）⇒ 是 **f32 级精度**，别按写入值做逐位比对。
⚠️ **`type` 那个字段与"层"无关**：文件里每条 lane entry 的 `type` 实测恒为 `"data"`（见 `acep` §2.2）。

### 5b. 两个会被**直接拒**的门槛（官方明写的规则，踩了就白跑一次）

1. ⛔ **`dense` 的每一段连续 run 至少 2 个 tick**：不管那一段是"值"还是"`null` 空档"。
   会被拒的写法：只有一个元素的载荷 · 长载荷里**孤零零一个值**（`[null,null,0.62,null,null]`）· 在一段值里**只戳一个 `null`** · 载荷边缘只有 1 tick 的 run。
   拒的时候**错误会逐个点名要修的 tick**（还带"那一段是什么"）⇒ 照它改。
   ⇒ 要精确落某个 tick：写一段**越过它两侧**的 run，再**读回来确认**（边缘 tick 有可能被漏掉）。
2. ⛔ **`points` 的"抹除"要用全 gap 载荷**：`[tick, null]` 是**空档标记**，写回去**不会被插值跨过去**（保持断开）；
   而**全 gap 的载荷 = 擦除形式**。锚点是**放置**、不是两两连线 —— 单个锚点也会精确落位（run 规则管不到这个形状）。

### 5c. `midiparam` 先"发现"再读（别一个个试 128 个 CC）

```
& $cli midiparam list-lanes --clip-uuid <UUID>     # 这个 MIDI 片段到底有哪些 lane（cc<N> / pitchbend / velocity），各自 anchor 数
```
官方把这叫 **discovery call**：行里带 `key`（`cc<N>`、`pitchbend`、`velocity`）、MIDI `controller` 号、标准 MIDI `name`（`Modulation`…）、`count`。
⚠️ **只有 GenericMidi 片段有 lane**（其他类型直接拒）。

## 6. 怎么写（照抄改 uuid 即可）

```powershell
`$cli = "`$env:ProgramFiles\ACE Studio\acestudio-cli.exe"
$clip = '{粘贴 clip-uuid}'

& $cli vocalparam layers --clip-uuid $clip                                   # ① 查：有哪些参数/层/形状/尺度
& $cli vocalparam read  --clip-uuid $clip --param tension --layer user --json  # ② 读：层 + effective
& $cli vocalparam write --clip-uuid $clip --param tension --layer user `
        --pos-begin 0 --points '@curve.json'                                 # ③ 写 dense 层（tension 是 dense）
& $cli vocalparam write --clip-uuid $clip --param dynamic --layer user `
        --points '[[0,0.5],[960,-0.2]]'                                      # ④ 写 points 层（dynamic 是锚点）
& $cli midiparam  write --clip-uuid $clip --lane pitchbend `
        --points '[{"pos":0,"value":8192},{"pos":960,"value":10000}]'        # ⑤ MIDI 轨：CC / pitchbend
& $cli midiparam  set-velocity --clip-uuid $clip --notes '[{"noteUuid":"{...}","velocity":100}]'
```

- **MIDI 轨**：`--lane cc<N>`（`0–127`）或 `pitchbend`（`0–16383`，原始 MIDI）；锚点按 `pos` 升序、不许重复位置；
  **两个锚点就是"直线工具"**（没有单独的 draw 动词）；`--replace lane` 整条替换；端值接不上时宿主会**自动在两端补锚点**保住原包络。
  音符力度是**音符级**的 ⇒ 走 `midiparam set-velocity`，不是 lane 写入。
- **护栏**：`--if-match <TOKEN>`（写前带上一手读到的指纹，防覆盖别人的改动）+ `--wait-busy`（宿主忙时等）。
- ⚠️ **PowerShell 传 JSON：内层双引号要转义成 `\"`**（`--tracks '[{\"trackIndex\":0}]'` ✓；不转义 ⇒ ACE 报 `invalid JSON (key must be a string)`）。
  `--%`（停止解析）会把 `2>&1` 之类原样当参数传进去，别用。

## 7. 能力边界（截至 2026-10-03 · surface 17.1）

| 想做的事 | ACE 现状 |
|---|---|
| **参数包络（人声）** | ✅ `vocalparam write`（按层写；见 §2 的 5 个可用参数） |
| **MIDI 轨 CC / pitchbend** | ✅ `midiparam write`（⚠️ **只限 GenericMidi 片段**，Sing/Instrument 片段直接拒） |
| **音符音高**（唱哪个音） | ✅ **`note move --pitch <C4\|60>`**（锚点音符绝对、其余按同 delta 平移）· **`--pitch-by <半音>`**（整体移调）· `note add`。⇒ **音高 ≠ 音高曲线** |
| **人声音高曲线**（滑音/颤音/锚点，即钢琴窗那条线） | ❌ **这个 surface 不存在**：`pitch` 是 `available:false`，`read`/`write` 都拒（`INVALID_ARG`，原因见 §2 第 3 条）。⚠️ **`available:false` 是全有全无** —— 连"读"都拒，**与你用绝对音高 / 半音数 / delta 表达无关**（surface 上没有这个参数位）；`unavailableReason` 解释的是"为什么还没做"，不是"换个格式就收" ⇒ 只能改到"音级"，**改不了"怎么滑过去、怎么颤"**；要画曲线得走 SV/IX（SV2 的 `PitchControlCurve`），或 ACE `export midi` 后进 SV |
| **`formant`** | ⚠️ **看引擎**：**v1（`verse24`）✅ 可用**（`envelope` `-1..1`，只有 `envelope` 层）；**v2（`singing-mamba`）❌ 不可用** ⇒ 永远**查 `available`**（别按声库名推） |
| 声线控制（Rap/Opera/中文戏腔…） | 随**声库模型**发布，名字不预先枚举；列在 `vocalparam layers` 的输出里（**路由 `dynamic` 时列 `dynamic` + 其他 control；`legacy-four-params` 时列四个且不列 `dynamic`** —— 见 §2b） |

## 8. 越界与错误（**与别的宿主可能相反，注意**）

- **越界一律 `INVALID_ARG` 拒绝，从不 clamp**（`vocalparam` / `track` / `midiparam` / 插件参数**全都这样**）——
  别指望"它会帮你夹到边界"；数值要在自己这边先夹好再发。
- 写只读层（`baseline`/`effective`）、写没列出的参数、给错形状的载荷（如 dense 不给 `--pos-begin`）都会被**明确拒绝并带原因** —— **当错误是信息**，照它改。

## 9. 操作纪律（省时间的那几条）

1. **先读后写**：`vocalparam layers` → `vocalparam read`（拿 `posBegin`/指纹）→ 再 `write`。
2. **只读探测**：确认 ACE 在线用 `acestudio-cli project info --json`（exit 0 = 在线；exit 3 = 桥不可达）；
   桥握手文件在 `%LOCALAPPDATA%\Timedomain\ACE Studio\mcp-bridge.json`（ACE 关掉它会消失）。
3. **改工程前先问用户**（建轨/建 clip/写曲线都是真改）；探针用完**自行复原**并读回核对。
4. **API 细节一律先查文档**：`acestudio-cli help <域> <子命令>`，或 MCP 的 `get_docs {"path":"vocalparam write"}`；
   本技能只写"实测过、且容易踩"的部分，**签名以 `help` 为准**。
