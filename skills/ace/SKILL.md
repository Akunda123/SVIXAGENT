---
name: ace
description: 【ACE 模式总入口】在 ACE Studio 里干活（或在 AKDAgent 里切到 ACE 皮肤 / 用户提到 ACE）时**先加载本技能**：它给 ACE 模式的分工表（该接着加载哪个官方技能、参数怎么写）、第一步在线自检、任务路线图（看工程 / 加内容 / 生成类 staged job / 出片 / 调声 / 声库与插件）、**能力边界总表**（CLI 能做 / 只能改文件 / 都做不了）+ **文件路线 6 步速查**、以及**我们自己的 3 个 ACE MCP 工具**（`ace_state`/`ace_cli`/`acep`）与「我们的桥」的边界（ACE 不走桥，别去跑 AKDAgentBridge.lua）。触发：ACE Studio、ACE 模式、acestudio-cli、ace-mcp-server、用 ACE 干活、ACE 里加轨道/音符/歌手、ACE 生成歌、ACE 导出音频视频、ACE 调声/参数、ACE 声库/插件、要不要注册 ACE 的 MCP、ACE 音高线/锚点/颤音怎么写。
version: 1.5.0
---

# ACE 模式（总入口）

> **ACE Studio = 第三方宿主**：它**不走我们的桥**（没有心跳文件、没有 op、没有侧栏面板），
> 一切通过它自己的 **`acestudio-cli`** 或 **MCP server**（63 个工具，`<域>_read` / `<域>_edit`，与 CLI **同一套 surface**）。
> （另有**我们自己的 3 个 ACE 工具** `ace_state` / `ace_cli` / `acep` —— 那是 AKDAgent 的便利层，**与官方那套无关**，见 §3b。）
> ⚠️ 所以：**别让 ACE 用户"去跑 `AKDAgentBridge.lua`"**，也别用 `-sv`/`-ix` 那套判据找它的桥。
> 本技能是**入口**：它不重复官方技能的内容，只负责"**该看哪个**"。

## 1. 进 ACE 模式的第一件事：确认它在线

```powershell
$cli = "$env:ProgramFiles\ACE Studio\acestudio-cli.exe"
& $cli project info --json          # exit 0 = 在线；exit 3 = 桥不可达（ACE 没开 / 没开 External Agent Access）
```

- 快速判据：桥握手文件 `%LOCALAPPDATA%\Timedomain\ACE Studio\mcp-bridge.json` **在不在**（ACE 关掉它会消失）。
- **在 ACE 里开 Agent 连接是用户侧的事**（App 右下角 **Connect to Agents**）—— 我们不能替他开；探到 exit 3 就这么告诉他。
- ⚠️ 探到了也**不等于**有工程：没工程时命令会回 `NO_PROJECT_OPEN`，要请用户先开/建一个。
- **CLI 路径别硬编码**（用户可能装到别的盘）：可靠顺序 = **注册表** →
  `HKLM\SOFTWARE\{WOW6432Node}\Microsoft\Windows\CurrentVersion\Uninstall\*` 里找 `Publisher = 'Timedomain Inc.'` 且 `DisplayName like 'ACE Studio*'`
  （⚠️ **DisplayName 会本地化** —— 中文机上是「ACE Studio 版本 2.1.8」，**别精确匹配英文**）→ 取 `InstallLocation`（实测 `C:\Program Files\ACE Studio\`）→ 拼 `\acestudio-cli.exe`；
  再兜底 `%ProgramFiles%` / `%ProgramFiles(x86)%` / `%LOCALAPPDATA%`，最后**问用户**。
- **能力探测用 `--version`**（能用，别猜）—— **它同时兼作在线探测**（第 4 行就是连接状态）：
  ```
  acestudio-cli --version
  acestudio-cli 0.17.0
  Built for ACE Studio 2.1.8
  Remote Control Bridge Surface 17.1
  Connected to ACE Studio 2.1.8 (surface 17.1)     ← 这一行在 = 在线；不在/报错 = 桥不可达
  ```
  ⇒ 版本与本文不符时**按能力降级**，别假设命令都在。
  ⚠️ 读输出时**别只取前 3 行**（我们就是这么把连接那行截掉过一次）。

## 2. 分工表：该接哪一份（**按需加载，别全塞进来**）

| 你要做的事 | 加载/查这个 |
|---|---|
| 连不上、不知道 CLI/MCP 在哪、怎么在 App 里开 Agent 连接 | 官方 **`ace-studio-setup`** |
| ACE 有哪些功能、某个功能是什么、什么时候用 | 官方 **`ace-studio-features`** |
| 跨多步的活儿该怎么排顺序（生成歌 / 从音频返工 / 出谱） | 官方 **`ace-studio-workflows`** |
| 驱动第三方 VST3/AU 或内置效果（含用 computer use 操作插件界面） | 官方 **`ace-studio-audio-plugins`** |
| **调参数**（人声参数曲线、层、尺度、CC/pitchbend、怎么写） | 我们自己的 **`ace-params`**（真机花名册 + 写法规格） |
| **直接读写 `.acep` 工程文件**（容器/CBOR 格式、手改、音高曲线、ACE 认不认） | 我们自己的 **`acep`**（ACEP2 + CBOR + 六步安全写入 + ACE 加载复查行为） |
| 与 Synthesizer V / Instrument X 的**参数对照与换算** | **`akdagent-playbook`** §四 的「第三方宿主 ACE Studio」段 |
| 任何命令的**签名与枚举**（权威） | 见 **§2b**（本地 `help` 树 / `get_docs`） |

### 2b. 文档去哪找（**权威顺序** —— 别在别处瞎找）

1. **本地 `help` 树 = 权威，也是唯一完整的**（CLI 自带、随 ACE 一起装；**没有对应的网站**）：

   ```powershell
   & $cli help                      # 总览：34 个域 + 18 个 topic
   & $cli help vocalparam write     # 单条命令的完整文档
   & $cli help curve-encoding       # topic：error-codes / guardrails / tick-coordinates / pitch-values / jobs …
   & $cli help --search "dynamic"   # 命令 + topic 全文正则搜
   ```

   ⇒ **MCP 侧是同一份**：`get_docs {"path":"vocalparam write"}` —— 不是另一套文档。
   ⚠️ 别去找 `acestudio-cli` 的文档站点，**不存在**（`help` 里唯一的外链是 changelog 提的 keepachangelog 格式说明）。
2. **官方 agent skills 仓**（know-how 层；CLI 在 `help` 末尾自己指过去）：
   `https://github.com/BeatMagic/acestudio_agent_plugin` —— 我们的 `ace-studio-setup` / `-features` / `-workflows` / `-audio-plugins`
   就是它的 `skills/`（MIT，逐字节同版本）。
3. **给人看的用户手册**（GitBook）：`https://docs.acestudio.ai` —— 讲的是 **UI 层**（面板上有什么、怎么操作）。
   ⚠️ **层模型 / `scale` / `valueRange` / `vocalControlRoute` 这类实现细节它没有** ⇒ 那些只在 ① 里。
   ⇒ 一句话：**"面板上有没有这个按钮"看 ③ · "这个数是什么量纲、能不能写"看 ①。**

## 3. 工具面（两种走法，选一种）

| 走法 | 前提 | 说明 |
|---|---|---|
| **CLI（默认首选）** | ACE 装上就有 | `acestudio-cli <域> <子命令>`；文档自带（`help` / `help --search`） |
| MCP（可选） | 在 DSH profile 里注册 `ace-mcp-server.exe`（`serverName: ace-studio`） | 工具名会是 `mcp__ace-studio__<域>_read/_edit`；**代价**：多一个 ~12MB 进程 + 63 个工具进上下文 |

- **不注册也能干活**（CLI 路线已实测可用）——要不要注册问用户，别默认加。
- 两套 surface 的工具名/子命令**一一对应**，所以文档查一次两边都适用。
  实测核对（2026-10-03）：各域 `_read`+`_edit` 的 `subcommand` 总数 = CLI 同域命令数，**322 = 322、34/34 个域完全相同**
  ⇒ 注册 MCP **不会多也不会少任何操作**，只是换个调用面。
- ⚠️ **但 MCP 是"薄壳"，不是另一份文档**：**62/63** 个工具只有 `{subcommand, arguments}`，`arguments` 是**自由 object**；
  真正的参数细节只能**按 `subcommand` 去 `get_docs`（= CLI help 原文）查**
  ⇒ **参数权威始终在 CLI 的 help 树**（见 §2b），这也是默认首选 CLI 的理由。

### 3b. 我们自己的 ACE MCP 工具组（**2026-10-05 加，与官方 `ace-mcp-server` 无关**）

AKDAgent 的 MCP server（`server/src/ace/`）现在挂了 **3 个 ACE 工具**，把"CLI + 文件工具"两条路都包起来：

| 工具 | 干什么 | 为什么有它（不是多此一举的地方） |
|---|---|---|
| **`ace_state`** | 开工自检：ACE 在不在线、当前工程名/**路径**/`dirty`/`isTempProject`、CLI 位置、6 个技能脚本是否就位 | 一条命令替代"CLI 探测 + 脚本路径探测"；⚠️ 它内部走 **`project dirty`**（`project info` **没有** path/dirty） |
| **`ace_cli`** | 跑任意 `acestudio-cli` 子命令（**参数传数组、不经 shell**） | 绕开 PowerShell 的**引号/BOM/编码**三坑（`--points '[[0,0.5]]'` 这类 JSON 参数在 PS 5.1 下极易被吃掉）；自动补 `--json` 并解析 |
| **`acep`** | 跑 `skills/acep/scripts/*`（`acep` / `lane-report` / `tree-diff` / `lyric-tones` / `lane-poke` / `f0-contour`），**带写护栏** | MCP 加得上、裸脚本加不上的东西：**`--in-place` 默认拒**（把 `acep` 技能那套「只写副本」纪律变成可执行版）；允许时若 ACE 正打开该文件且 `dirty:true` 再拒一次 |

- ⚠️ **与官方 MCP 的边界**：官方那套（`mcp__ace-studio__*`，63 个薄壳）是**它自己**的 surface，与 CLI 一一对应；
  我们这 3 个是**AKDAgent 侧**的便利层 —— 两者可以并存，**都代替不了 `help` 树**（参数细节仍查 §2b）。
- ⚠️ **不是必需**：这 3 个工具只是把上面两条路包了一层。**没有它们也能干活**（一样是跑 CLI / 跑脚本）。
- ⚠️ MCP server 改完要**重启**才生效（跑的是 `server/dist`）⇒ 新工具没出现先想到这个。

## 4. 常见任务路线图（先读后写）

1. **看现状**：`project info` → `track list` → `clip list --track-index <N>` →（要看音符）`note get --note-uuid …`
   · 选区/光标：`selection get` / `caret get` · 编辑器状态：`editor status`
2. **加内容**：`track create --type <sing|instrument|genericMidi|audio|video|marker>` →
   `sound-source load`（或 `voice load`）→ `clip create --type … --pos/--dur` → `note add` / `lyric fill` / `chord insert`
3. **生成类**（Inspire Me / Music Enhancer）：它们是 **staged job** ⇒ `generative` 起 → `job list` / `job wait` → `job results` / `job place`
   ⚠️ 要额度：**`generative` 可能要 credits**（`CREDIT_INSUFFICIENT`），别当成失败重试。
4. **出片**：`export audio` / `export video`（**也是 job**）；⚠️ `export vocal-sample` **要 membership**（`MEMBERSHIP_REQUIRED`）。
   ⚠️ **CLI 没有"合成"命令**；要逼它真渲染一次就用 `export audio`（起 `export-audio` 作业 → `job wait <id>`），`project synthesis-status` 只报"当前有没有在跑"。
   ⚠️ 渲染**不会**把结果（分析 / 音素时长 / 音高）写回 `.acep`：实测渲染前后文件字节一致 ⇒ **文件里读得到的只有"被写过的数据"**。
5. **调声**：见 **`ace-params`**（先 `vocalparam layers` 读 `available`/`scale`/`shape`，再 `read`，最后 `write`）。
6. **换音色/插件/效果**：`voice list|load` · `sound-source get|set` · `instrument` / `fx` / `audio_plugin`（插件参数 `set-param` 用 `--value`(0..1) 或 `--display`(插件自己的文本)）。

### 4a. 能力边界总表：**CLI 能做 / 只能改文件 / 都做不了**（2026-10-05 实测汇总）

> 这张表是"遇到需求先判路线"用的。**能走 CLI 就别走文件**（CLI 有撤销、有指纹、ACE 立即认账）；
> 文件路线只在 CLI 没开放的地方用，且它有代价：**改完要 ACE 重开**（重载有明显提示）+ 没有撤销（只有你留的副本）。

| 需求 | CLI | 文件（`.acep`） | 备注 |
|---|---|---|---|
| 轨道 / 片段 / 音符 / 歌词 / 语言 / 音素拼写 | ✅ 全套（`track` `clip` `note` `lyric` `phoneme set`） | 也读得到 | — |
| **音素时长**（pin / 头尾辅音长度） | ✅ `phoneme move-boundary` · `set-consonant-timing` · `reset*` | 读得到，**写工具没做** | ⚠️ 换声库会**静默丢掉**另一种表示的时长（实测）；pin 的字节判据见 `acep` §2.4 |
| 参数曲线：`dynamic` / `air` / `falsetto` / `tension` / `energy` … | ✅ `vocalparam layers/read/write`（见 `ace-params`） | 读得到（`patterns[*].parameters`） | `energy`/`tension`/`air` 栅格 = **1 样本/tick**，pitchDelta 是 **15/16** |
| **人声音高线（`pitchDelta`）** | ⛔ **不能**（`pitch` 行 `available:false`；`midiparam` 的 `pitchbend` 只对 MIDI 片段） | ✅ `acep` 的 **`rap-curve`**（曲线形态，delta） | 三种画法：①曲线=`data` ②锚点=`anchor`（绝对音高）③颤音=音符字段 |
| **音符颤音（`notes[k].vibrato`）** | ⛔ **不能**（`note` 子命令没有 vibrato、`note get` 不报） | ✅ `acep` 的 **`vibrato`**（键不存在会自动插入） | 量纲：`frequency`=Hz、`amplitude`=峰峰值半音 |
| **锚点 `anchor` / `pointsVUV`** | ⛔ 不能 | ✅ **写已做**：`acep` 的 **`anchor`**（`--points "tick:绝对音高,…" [--vuv]`；插 entry 只能 `--append`） | 语义：`points`=绝对音高成对，`pointsVUV`=每点 0/1（含义未定）。✅ 手写真机验收：ACE 打开 + save 后逐值保留 |
| `vuv` / `extraInfo` | ⛔ 不能 | 读 ✅ · **写 ✅ 已验证**（`acep set-value`）：手写 `vuv`（8 样本 data entry）与 `notes[k].extraInfo`（嵌套对象）**ACE 打开 + save 后都原样保留** | `vuv` 是"编辑器里画线"的随写产物（只播放/渲染不写），但**ACE 不擦手写的**；`extraInfo` 可当"跟着工程走"的自留地 |
| 速度 / 拍号 / 循环 / 画布 | ✅ `tempo` `timesig` | 读得到 | — |
| 导出 | ✅ `export audio/video/midi/musicxml/…`（job） | — | ⚠️ **没有"合成"命令**；逼渲染用 `export audio`；渲染**不落** `.acep` |
| 生成类（Inspire Me / Music Enhancer / Voice Changer） | ✅ `generative`（staged job，可能吃额度） | — | — |

**文件路线速查（6 步，别省任何一步）**：

```powershell
acestudio-cli project dirty --json                 # ① 先落盘：dirty 必须 false（true 就先 project save；别默认 discard）
node skills/acep/scripts/lane-report.cjs <file.acep>   # ② 看清现状（lane/音符/有没有 kind:0 乐器插槽）
node skills/acep/scripts/acep.cjs rap-curve|vibrato|anchor … --in-place   # ③ 写（自动 .bak；或 --out 出副本）
acestudio-cli project open <file.acep> --discard-changes           # ④ 让 ACE 重开（不重开它看不到）
node skills/acep/scripts/lane-report.cjs <file.acep>   # ⑤ 独立读回核对（形状/非零数，不只看工具自检）
acestudio-cli export audio --path <tmp.wav> --scope master  # ⑥ 要验"真唱出来了"，渲染 + f0-contour.cjs 测
```

> 走 MCP 时同一套步骤就是：`ace_state`（① 的前半）· `ace_cli ['project','dirty']` / `['project','save']` · **`acep`**（②③⑤ 的脚本，写要 `--out` 或显式 `allowInPlace`）· `ace_cli ['project','open',…]`（④）（见 §3b）。

> ⚠️ **`timeUnit:"sec"` 的 pattern（音频片段）不要走 tick 工具**：`rap-curve`/`vibrato` 会**明确拒绝**（2026-10-05 起有守卫），因为 tick 栅格换算不适用。
> ⚠️ 重载代价：**UI 状态会复位**（光标/选区/面板可见性），且重开后约 15–20 s ACE 会**自己把工程标脏** ⇒ 别拿 `dirty` 当"用户改没改过"的判据（细节见 `acep` §3.5）。

### 4b. 读面地图（**想知道 X → 读 Y**；全部实测可读）

| 想知道 | 命令 |
|---|---|
| 工程是否打开 / 时长 / 名字 | `project info`（还有 `project dirty` / `recent`） |
| **当前工程的路径** | **`project dirty`** 的 **`projectPath`** —— ⚠️ **`project info` 不给路径**（只有 name/临时状态/时长）；`project recent` 给历史（最新在前）· `project save-as` 回 `savedPath` |
| **临时（未保存）工程在哪** | 没有 `.acep`（`projectPath` 为 `""`）；工作区在 `%LOCALAPPDATA%\Timedomain\ACE Studio\project\temp_workspace\working_document\`（**空 = 当前没有临时工程**） |
| 速度 / 拍号 / 画布 | `tempo get` · `timesig get` · `canvas info` |
| 有哪些轨 | `track list [--type sing\|instrument\|genericMidi\|audio\|video\|marker\|chord] [--include-empty]` |
| 一条轨的全部属性 | `track get --track-index N`（color / mixer / recordInput / soundSourceInfo） |
| 有哪些片段 | `clip list --track-index N` |
| 片段里的音符（**批量**） | `clip note-content --track-index N --clip-index M`（**回包里带 `fingerprint`**，写前拿它） |
| 单个音符 / 歌词 | `note get --note-uuid …` · `clip lyrics …` |
| 句子层歌词（哪些音符共享一句）/ **填词计划** | `clip lyrics` · **`lyric fill … --dry-run`**（见 §4e） |
| 音素 | `phoneme list` · `phoneme inventory` · `phoneme g2p` |
| **人声参数与分层** | `vocalparam layers --clip-uuid …` · `read`（还能拿 **`effective`**＝"实参"） —— 细节看 **`ace-params`**（§4b：读回包四块 + "谁画过"的判据） |
| **音高线（`pitchDelta`）** | **CLI 三条路全封死**（`vocalparam layers` 的 `Pitch` 行 = `available:false`；`midiparam` 的 `pitchbend` 只对 **MIDI 片段**，sing 片段报 `INVALID_ARG … is a sing clip`；`note move` 只改音符音高不是曲线）⇒ 只有**文件路线**：`acep` §3.3（已验 ACE 认账并真渲染）；想画就 `rap-curve`。⚠️ 改文件后**要 ACE 重开才生效**，而**重载有明显提示** ⇒ **只值得做批量改动**（用户口径 + 实测，见 `acep` §3.5） |
| 声源 / 声库 | `sound-source get --track-index N` · `voice list` / `get` / `synth-models` |
| 插件参数 / 预设 / 状态 | `fx` / `instrument` / `audio-plugin` 的 `list-params` · `get-params` · `list-presets` · `get-state`（⚠️ 多有必填参数，先 `help`） |
| 编辑器 / 选区 / 光标 | `editor status` · `selection get` · `caret get` |
| 走带 / 设备 | `transport state` · `device current` |
| 撤销栈 | `history list` |
| MIDI 参数 lane | `midiparam list-lanes` · `read`（**仅 GenericMidi 片段**） |
| 作业 / 生成结果 | `job list` / `get` / `results` · `tempo get-analysis` · `generative * history list` |
| **"这个字段是谁改的"** | **`acep` 的 `tree-diff`**：`project save`→快照 A → 做一件事 → `project save`→快照 B → diff（**只有两快照 diff 才可信**：ACE 自己保存时会连带重算 `phonemeTimings`、合并分段 entry）—— 也是"CLI 参数名 → 文件字段"的取证手法（`acep` §2.5b） |

⇒ 一句话：**"工程里现在有什么"几乎都能读**，而且读**不需要 ACE 在前台**（CLI 不抢焦点）。

### 4c. 驱动要素（写脚本/工具必知）

- **单位与坐标**：**960 tick/s · 480 PPQ · 1 小节(4/4) = 1920 tick**（实测 tick 5760 = 6.000 s）。
  ⚠️ `--track-index` **按 region 计数**（`arrangement` 默认 / `video` / `marker` / `chord`），**不是全局编号**；片段用 `--track-index + --clip-index`，音符用 **uuid**。
- **退出码**（照 `help exit-codes` 原文）：`0` 成功 · `1` 命令失败（细看 `error.code`）· `2` **用法错**（CLI 解析层，**命令根本没跑**）· `3` 桥不可达 · `4` = **`job wait --timeout` 超时**。
  ⚠️ **`4` 不是失败**：作业没取消、还在跑；而且 `job wait` 对**终态是 `failed`** 的作业也回 `0`（要从结果的 `lifecycle` 读）；Ctrl-C 中断等同样**从不取消**作业。
- ⚠️ **`--json` 模式下错误信封写在 `stderr`**（不是 stdout）⇒ 脚本里要**分别捕获**两路。
- **正常传参别经 shell**（`& $cli @('track','set','--color',$hex)` 这种数组 splatting / 或直接 exec 数组）——经 cmd/PowerShell 字符串会踩引号与代码页坑（§5 第 6 条）。
- **`error.code` → 你该做什么**（权威清单：`& $cli help error-codes`；下面是实测/文档里最常见的）：

  | `error.code` | 含义 | 处置 |
  |---|---|---|
  | `INVALID_ARG` | 参数或值被拒（**越界也走这个**） | 读 `hint`/`message` 照改；**别替它夹值**（§5 第 3 条） |
  | `NOT_FOUND` | uuid / 名字不存在 | 先 `list` 拿合法 ID。⚠️ **用户换过工程后旧 uuid 会失效**（我们刚遇到过） |
  | `NO_PROJECT_OPEN` | 没工程 | 请用户先开/建一个 |
  | `HANDLER_FAILED` | 宿主端执行失败 | 看 `details`（可能可恢复，如磁盘；也可能是真 bug） |
  | `CONFIRMATION_REQUIRED` | 破坏性命令没人确认 | **命令根本没跑**，加 `-y` 重跑 |
  | `USER_BUSY` / `STALE_WRITE` / `FINGERPRINT_SCOPE_MISMATCH` | 并发 / 护栏 | 重读指纹再写；宿主忙时 `--wait-busy` |
  | `CREDIT_INSUFFICIENT` / `MEMBERSHIP_REQUIRED` | 额度 / 会员 | **如实告诉用户**，别当失败重试 |
  | `UNKNOWN_COMMAND` | 命令不存在（**版本差**） | 按能力降级；`help --search <正则>` 找替代 |
  | `AUDITION_NOT_SUPPORTED` / `EDITOR_NOT_OPEN` / `NOT_RESIZABLE` / `NO_EMBEDDED_VIEW` / `TIMEOUT` | 前置条件不满足 / 超时 | 先满足前置（开编辑器、换轨道类型…）；`TIMEOUT` 已对所有原子公开 |

### 4d. 插件参数（`fx` / `instrument` / `audio-plugin`）：**优先用 `--display`**

- 两套写法：**`--value`** = 归一化 `0..1`（唯一所有插件所有参数通用的刻度）· **`--display '<插件界面上的文本>'`**（如 `-18 dB` / `High Shelf` / `On`）。
- **回环三步**：`get-params` 读 **`valueText`** → 改数字 → `--display` 写回（**不用碰归一化曲线**）。
- 宿主怎么把文本变成值：① 先让**插件自己**做 text→value，再渲染回来比对；② 对不上就在**进程内搜**（`choice` 按选项名 ·
  `boolean`/`stepped` 逐位置渲染 · 连续量**二分**）⇒ **不管探多少次，线上只有一次调用**。权威在插件：宿主**不解释**任何单位或曲线。
- **容忍**：大小写 · 空格 · 小数位数（`200 Hz` ↔ `200.0 Hz`、`high shelf` ↔ `High Shelf`）。
- **拒绝**（`INVALID_ARG`，**不近似、不猜**）：单位不符（给百分比传 `-3 dB`）· 超出该参数能显示的范围 · `choice` 里没有的名字 · 既非数字也非选项。
  ⇒ **`error.hint` 会列出该参数实际能显示什么**（两端值或选项列表），照它改。
- ⚠️ **回包里的 `valueText` 才是"实际达成的值"**（插件显示精度有限：要 `33.3 %` 可能只落到 `33 %`）⇒ 比 `valueText`，**别再读一次**。
- `--if-match` 对 `--display` 与 `--value` **一样有效**（护栏挂在命令上，不在参数上）。

### 4e. 歌词层：三层分工 + `lyric fill`（**句子层**）

**三层**（官方口径，别混）：一个音符自己的文字 = **`note set-grapheme`**（`note set-lyric` 是它的永久别名）；
**一个音符怎么发音** = **`phoneme`** 域；夹在中间的是 **`lyric fill`** —— "把一段文字铺到一串音符上，跟 App 自己的输入框/歌词面板一样"。

- 语法：`lyric fill --clip <UUID> --sentence <N> --text <TEXT>`（句序按 `clip lyrics` 报的来）或 `lyric fill --note <UUID>... --text <TEXT>`
  （必须同片段；**按片段内顺序**填，跟你给的 flag 顺序无关）。
- **`--dry-run` 只出计划、不动撤销栈**（回包 `undoPushed:false`），计划里逐音符给
  `lyricBefore/After` · `languageBefore/After` · `languageChanged` · `filled` · `promoted` ⇒ **拿不准就先干跑**。
- `--text` 的字母表（原样记，别自己发明）：grapheme · **`-`（tenuto 延音）** · `_`（本音符留空） · `?`（占位） ·
  `+`（多音节词里的连字符） · **`#N`（多音节词的第 N 个音节）**。
- ⚠️ **字母表外的字符在切分阶段被静默丢掉**（实测）：`--text "云123"` ⇒ **只有 `云` 落位、其余音符被清空**（`notesFilled: 1`），
  而 **`discardedText` 仍是 `""`**（那个字段只报"放不下"的词，**不报"不合法"**）。数字、`!`、emoji 都属此类 ——
  `phoneme g2p --language Chinese --grapheme 1 --json` 实测 **`resolved:false` + `phonemes: []`**（引擎根本不给音素）；
  对照 `云` → `phonemes ["y","vn"]` ✓、`A` → `["a"]` ✓（拉丁字母在中文里按拼音解析）。
  ⇒ **要唱数字就写读音字**（中文 `一/二/三`、英文 `one/two/three`）；**先问引擎**：`phoneme g2p --language <L> --grapheme <TEXT> --json` 看 `resolved`（**只读，不用写工程**）。
- 标点 / 空白是**分隔符**：`--text "云, ABC!"` ⇒ 2 个词（`云`、`ABC`），且 `ABC` 作为**一整个词落在同一个音符**（拉丁串不拆字母）。
- ⚠️ `normalizedText` **原样回显输入**（含被丢掉的字符）⇒ 判落位要看每个 `notes[].lyricAfter`，别看 `normalizedText`。

**实测（2026-10-04，真机；v2 轨 Ember Rose + v1 轨 洛天依 各一条）**：

| 事实 | 证据 |
|---|---|
| **`#N` 不用我们输入 —— 引擎自己生成** | `--text banana` 铺 3 个音符 ⇒ 写成 `banana#1/#2/#3`；**手写 `banana#1 banana#2 banana#3` 与只给整词的结果逐条一致** |
| 音节切分是**语言相关**的活，切得对 | 回读音素 `b+ah` / `n+ae` / `n+ah` = **ba-na-na**（还带重音判断）；`syllable` 仍是 `""` ⇒ 不是手工音素覆盖 |
| **语言由引擎按字形切、并写进音符** | 26 个单字母（v1 轨）：`a/e/i/o/u/m/n/v` 在拼音里成立 ⇒ **留 Chinese**；其余 18 个 ⇒ 切 **English**（`matchGraphemeLanguage` 默认 true） |
| 单个拉丁字母被当**词**（读字母名），**可能多音节** | `w` = "double u" ⇒ **吃掉 3 个音符**（`w#1/#2/#3`），把后面的字母顶掉一格；辅音字母读字母名（`b`=`b iy`、`c`=`s iy`、`h`=`ey ch`、`x`=`eh k s`…） |
| **文字放不下 = 静默丢弃，不是报错** | 同一次调用照样回 `filled=26/26`，只有 **`discardedText:"y z"`** 说了实话 ⇒ **必须读这个字段** |
| 音节比音符少时，多余音符**留空（`""`）而不是 `-`** | `--text hello`（2 音节）铺 3 音符 ⇒ 第 3 个 `filled:false`、`lyricAfter:""` |

- **跨音符的两套表示，别混**：读的一侧看 `clip lyrics` 的 **`sentences[].noteUuids`**（多音符共享一句 = 一个词跨音符）；
  音符**原语**一侧的延续音符写**字面量 `-`**（`la`,`-`,`-`,`-` = 一个跨 4 个音符的音节）。
- ⚠️ `clip lyrics` 的句子是**按时值间隙机械切**的（可能与自然断句不同）⇒ 它是**读的入口**，别当语义真值。

### 4f. 音素时长：**两套表示 + 两个动词**（单位都是**秒**）

官方口径（`help phonemes-and-timings`）：**哪套表示存在，是这个音符自己的事实，不是轨的模型**——
① **pins**（Verse 2.6 那套）：**一个音素上的时长**；② **头/尾辅音长度**（Verse24 那套）：**秒**。
两个"混着来"的已知情形正是 reset 动词存在的理由：**Vocal2Midi 导入的音符即便在 Verse24 轨上也是 pinned**（导入把抽出的辅音时长转成 pins）；
老工程在 Verse 2.6 轨上也可能仍带着 Verse24 的长度。

- **读**：`phoneme list --with-timings [durations|boundaries|both]`（裸用 = 两种都给，它们**同构**，只给一种更省流量）。
  `timings[]` 每项：`index`（**0 起**，= 写入要传的 `--index`）· `name` · `isVowel` · `isPinned` · `spanIndex` · `durationSec`
  （pins 那条还有 `startSec` / `boundaryDraggable` / `boundaryMinSec` / `boundaryMaxSec`；元音有 **`effectiveDurationSec`**）。
  `spans[]`：`kind`（`note` / `lead-in`）· `available`（没合成过就是 `false` + `unavailableReason:"not-synthesized"`）· `startSec`/`endSec` · `members[].noteUuid`。
  ⚠️ **span 与 note 不对齐**：一个音符的**头辅音落在它自己起点左边那段 span 里**，所以一个 span 常同时装"前一个音符的元音+尾辅音"和"后一个音符的头辅音"。
- **写（同一次编辑的两个命名，选哪个是"你"的事实）**：
  - `phoneme move-boundary --note … --index … --to <SECONDS>` —— `--to` 是**裸数字**（不是 time value），
    以 **`timeBase` 声明的那个帧**（实测 `clip-local`）从片段起点算，**可以有负数**；超 `boundaryMin/MaxSec` **clamp 而不拒**，回包说落在哪。
    它是"移动"不是"改时长"：delta 先由范围内的**元音按显示长度按比例吸收**，中间那些 rigid 辅音**原长平移**。
  - `phoneme set-consonant-timing --note … --index … --length 0.08s|80ms|40t` —— 只对**辅音**有意义（元音没有自己的长度），
    **拒绝 tempo-relative**（因为写入所受的界是秒）。
  - 两个动词都：落点由轨决定（回包 `representation`）、都有 `--dry-run`（不动撤销栈）、都会在"这个音符没有可动的东西"时报
    `PHONEME_TIMINGS_UNAVAILABLE`。
  - ⚠️ **写 pin = 整个 span 一起 pin**（span 内**每个**音素都 pinned 才算 pinned，"部分写"不是部分编辑，而是静默不发声）；
    ⇒ 也解释了那个反直觉现象：**清掉一个音符的 pins，可能把它邻居的 span 拖出 pinned 集**（那个 span 自己的 pins 还在，只是不再"完整"，跟改一次歌词的效果一样）。
- **读得出多少，两套不一样**（实测）：
  **v2 / pins** 那套给得出**位置**（`startSec` · `boundaryMinSec`/`boundaryMaxSec` · `boundaryDraggable`）与**实际唱的** `effectiveDurationSec`（元音那行），`spans[].available = true`；
  **v1 / consonant-lengths** 那套**只给请求值** —— 辅音的 `durationSec`（与文件里的 `headConsonants` 逐位相同），**没有 `effectiveDurationSec`**，
  而且**没合成过时连位置都没有**（`spans[]` 全 `available:false` + `unavailableReason:"not-synthesized"`）
  ⇒ v1 要想读到"实际唱的"得**先渲染**（渲染后是否出现 effective，**未验证**）。
- ⚠️ **"存的值"是快照，读的才是当前值**：同一个音符，文件 `phonemeTimings` 里 `l` = 0.0755 s，而现读 `durationSec` = **0.4818 s**
  —— 因为这个头辅音落在**前一个音符的共享 span** 里，而那段被改动过 ⇒ 重算结果变了。想拿"实际唱的"只认 `effectiveDurationSec`。
- ⚠️ **同名不同义（实测踩到）**：`headConsonants` 在 `clip note-content` 里是**数字数组（秒）**，在 `phoneme list` 里是**符号数组**（`["b"]`）。
- ⚠️ **"存的是请求，不是结果"**：头/尾辅音长度是**用户要的**；真正唱的会在读的时候按与邻居共享的界压缩 —— 说"实际唱的"要用 **`effective`**，裸词留给"请求值"。清时长时看回包的 **`clearedTimings`**（它说的是**实际清掉了哪套**，不是"这个世代应该是哪套"）。
- 文件里这两套怎么落地（`phonemeTimings` / `headConsonants` 的字节形态与实测值）⇒ 见 **`acep` §2.4**。

### 4g. 撤销栈：**全局共享**，撤之前先看清（我们踩过）

- `history list --json` → `{entries[{index,name,actor,applied}], count, index, canUndo, canRedo}`；**`entries` 最新在前**
  （实测 `entries[0]` 的 `index` 最大，与 help 的 "newest first" 一致 —— 我按"尾部=最新"读过一次，直接误判）。
- **`actor` 是关键**：`"远程控制"` = 走 CLI 写进去的（我们或用户的脚本）；`""` = 人在 UI 里点的
  （`更改选择` / `移动光标` / `选择音符` / `更改轨道颜色` / `转调音符`…）。
- **undo/redo 全局共享**（连人在 UI 里的操作一起撤）⇒ **实验/演示完自己复原**：能撤的自己撤；撤不到基准的**写回基准值**
  （例如参数曲线写 `null` 清回"未画"）。
- ⚠️ **别连撤到"别人的账"**：撤之前先 `history list` 确认栈顶就是你那一笔，**一次只撤一笔**。
  实测事故：连撤 4 笔时第 4 笔吃到一笔**不是我的** `编辑歌词`，只能靠 `history redo` 原样还原。
- 栈会长（实测一场会话 307 → 442 条），**几乎每个动作都 push**（连 `选择音符` 都 push）。

### 4h. ACE 自己的目录（排障、找东西用）

```
%LOCALAPPDATA%\Timedomain\ACE Studio\
    project\recents.ini                        ← 最近工程列表（明文 path%23N=…；⚠️ **GBK 编码**，按 UTF-8 读中文路径会乱码）
    project\temp_workspace\working_document\   ← **临时（未保存）工程的工作区**（空 = 当前没有临时工程）
    project\<32 位 hash>\默认名字_1.acep         ← ACE 1.x 时代留下的"默认名字"工程（历史残留）
    log\acelog-*.acelog · user\temp\*.dmp       ← 日志 / 崩溃转储
    mcp-bridge.json                            ← 外部 Agent 连接的握手文件
%APPDATA%\Timedomain\ACE Studio\
    UserDefaults\project_init                  ← `[project_record_group]` + `auto_save=`（自动保存开关）
    UserDefaults\*.ini · ClientSetUp\*.json     ← 用户偏好 / 声库与插件许可缓存
```

⚠️ 这些是**宿主自己的地盘**：只读用于诊断，**别往里写**（改工程走 CLI 或副本路线）。

## 5. 纪律（ACE 专属，容易踩）

1. **改工程前先问用户**（建轨/建 clip/写曲线/生成/导出都是真改他的工程）；探针用完**自行复原**并读回核对。
2. **只读优先**：能用 `list/get/info/layers/read` 问清楚的事，不要用写操作试。
3. **数值越界一律被拒（`INVALID_ARG`），从不 clamp** ⇒ 在自己这边先夹好；**拒绝信息里带原因**，照它改，别猜。
4. **写前拿指纹**：`--if-match <TOKEN>`（上一手读到的）防覆盖别人的改动；宿主忙时 `--wait-busy`。
5. **批量点数据走文件/stdin**：`--points @curve.json` / `@-`（没有逐点 flag，也不该有）。
6. ⚠️ **PowerShell 传 JSON 参数：内层双引号要写成 `\"`**（不转义 ⇒ ACE 报 `invalid JSON`）。
7. **签名以 `help` / `get_docs` 为准**（入口见 **§2b**），本文只写"实测过、且容易踩"的部分；surface 自述 **pre-1.0、接口会变**。
8. ⚠️ **写动词的回包不一定是 JSON**：如 `track set` 成功后回**人话** `Track 0 updated.`；而 `vocalparam read/write` 是**永远回 JSON**。
   ⇒ 脚本里**别对输出无脑 `ConvertFrom-Json`**（会抛 `ArgumentException`，而且**写入已经生效**，看起来像失败实则成功）；
   要结构化就给读动词加 `--json`，写动词的回包按文本处理或 try/catch 兜住。

### 5b. ⛔ 别做的六件事（**边界集中在这里**）

1. **别让 ACE 用户去跑我们的桥**（`AKDAgentBridge.lua` / 面板 / `-sv`·`-ix` 判据）—— ACE **不走我们的桥**，它走自己的 CLI/MCP。
2. **别默认注册 ACE 的 MCP**（问用户；CLI 路线够用，注册的代价是多一个进程 + 全部工具进上下文）。
3. **别假设命令都存在**：surface 自述 **pre-1.0**；用 `--version` + `help --search` 探能力，探不到就**如实说"这个版本没有"**。
4. **别替用户开 Agent 连接 / 别替他点 UI**（那是用户侧的事：App 右下角 Connect to Agents）。
5. **别不问就改工程**（建轨/建 clip/写曲线/生成/导出都是真改）；**探针用完自行复原**并读回核对。
6. **别把"读不到"讲成"不存在"**：先分清是 ① 没工程（`NO_PROJECT_OPEN`）② 桥不可达（`exit 3`）③ 该参数在本 clip 不可用（`available:false` + `unavailableReason`）④ 版本没有这个命令（`UNKNOWN_COMMAND`）—— 四种的**给用户的话术完全不同**。

## 6. 出处（结论的有效期）

- 真机环境：**ACE Studio 2.1.8** · CLI **0.17.0** · **Remote Control Bridge Surface 17.1**；工具面 63 个（`granted=59`）。
- 实测日期：**2026-10-03**（人声花名册、可写层、尺度、越界行为都在真机上核过）；
  **2026-10-04** 补 **§4e 歌词层**（`lyric fill` 的字母表 / `#N` 由引擎生成 / 语言按字形自动切 / 溢出静默丢弃 / 单字母被当词）。
- 换版本后**先按 §1 自检 + `vocalparam layers` 复核**，再信本文的任何具体数值。
