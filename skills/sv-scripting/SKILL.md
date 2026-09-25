---
name: sv-scripting
description: Synthesizer V Studio 脚本开发的完整参考，分三部分：api（API 参考，完整类文档）、函数（实用代码模式与官方示例）、流程（脚本类型/调试/最佳实践）
version: 1.1.0
---

# Synthesizer V Studio 脚本开发

## 先看这里：症状索引

带着问题来的（报错/超时/闪退/结果不对），**先定位症状**，再去 `examples/` 里翻对应的那一篇：

| 症状 | 去哪看 |
|---|---|
| 工具报 `spawn ENAMETOOLONG`、请求没到宿主 | `examples/载荷过大-ENAMETOOLONG.md` |
| 桥超时 10s、宿主直接重启 | `examples/桥超时与宿主闪退.md` |
| 工具报 `unknown op: xxx`（改了桥但没生效）| `examples/桥超时与宿主闪退.md`（问题 B）|
| BPM 检测结果和实际不符、"对轨越到后面越偏" | `examples/BPM检测歧义.md` |
| 按小节对齐算出的偏移不对（纯音频工程）| `examples/小节标记失效-纯音频工程.md` |
| 解析乐谱/XML 后字段是 `NaN` / `none` / 空 | `examples/MusicXML解析-NaN.md` |
| 唱出来很机械、像念稿，一点人味都没有 | `examples/演唱机械感-像念稿.md` |
| 颤音听着假、像抽搐，加进去还不如不加 | `examples/颤音假-像抽搐.md` |
| 咬字糊成一团、听不清、口型也不对 | `examples/咬字糊成一团.md` |
| 情绪推不上去、副歌爆发不出来、抒情段一点都不感人 | `examples/情绪推不上去-副歌不燃.md` |
| 有电音感、金属感，参数一动就炸 | `examples/电音感与音色突变.md` |
| 拆完之后能听出是两轨、接缝处断掉或者跳到别的音高 | `examples/拆轨拼接处断开或跳音.md` |
| 报 `X is not a function` / `undefined not callable` | 下面「⚠️ API 勘误」一节 |
| 写操作被拒 / 宿主可撤销性丢失 | 下面「⚠️ API 勘误」第 3 条（`newUndoRecord`）|
| 不确定某件事 API 支不支持（导出音频 / 保存工程 / 导入音频轨 / 挑声库 / 枚举唱法名）| 下面「⛔ 官方 API 做不到的事」 |

## 结构

Synthesizer V Studio 脚本开发的完整参考，组织为四部分：

| 部分 | 目录 | 内容 |
|---|---|---|
| **API** | `api/` | 完整类文档（由官方 Scripting Manual HTML 原封不动转换）：每个类一个子 md，`api/README.md` 为索引。⚠️ **官方镜像，别往里写自研内容**（`tools/api-docs-sync.cjs --update` 整批重写；守卫 `check-api-mirror.cjs`） |
| **参考正文** | `references/` | **`01`–`11` 一条连续编号**（见下）：01–06 偏**代码片段**（官方仓库 + AKD 精选写法）· 07–11 偏**做法与手册**（调声 · Pit · 拆轨 · 声库 · 风格配方）· 另加 `官方API-实测勘误.md`（**实现侧**对官方 API 的实测勘误）。总索引见 `references/README.md` |
| **案例** | `examples/` | 真实踩坑记录：**问题 ⇒ 诊断 ⇒ 怎么改 ⇒ 改后效果 ⇒ 可复用判断标准** |

> 📌 **2026-09-21 目录合并（用户裁「先备份，再 B」）**：原先 `01`–`06` 在 `functions/`、`07`–`11` 在 `workflows/`，
> 现统一并入 **`references/01`–`11`**（编号连续、按**文档性质**分目录，与 `sv-lyricist` / `sv-ix` / `composition` 等技能一致）。
> **改名缘由（史证留着，免得下次又疑惑）**：原两个目录名沿自**上游官方手册的三段式**（站点分区就是 API / Functions / Workflows），
> 并非按我们的内容命名 —— `workflows/` 原定放"脚本类型 / 安装位置 / 调试技巧 / 常见 Bug / 最佳实践"
> （那行字当年写在 `workflows/.gitkeep` 里），但**这批内容始终没导入**，占位反被我们自己的主题手册（07–11）填了
> ⇒ 「名字像工作流、内容其实是手册」的**名实漂移**；且 `01`–`11` 本是连续编号，横跨两目录时**单看 `workflows/` 会以为缺 01–06**。
> ⚠️ **DSH 技能加载器只认"顶层目录里有 `SKILL.md`"**（`dsh-skill-filesystem`：`segments.length === 2 && segments[1] === "SKILL.md"`）
> ⇒ 子目录叫什么、有几层，**不影响注册与调用**；这次合并纯粹是为了**人和模型找东西时的直觉**。

> 时间单位：**blick**，`SV.QUARTER = 705600000` blicks = 一个四分音符。

## 案例（examples/）

每个案例都是**真机踩过的坑**，格式统一为「问题 ⇒ 诊断 ⇒ 怎么改 ⇒ 改后效果 ⇒ 可复用判断标准」。
遇到新问题先查这里；解决了新坑就补一篇（这是最省时间的资产，比重复踩第二次便宜得多）。

- `载荷过大-ENAMETOOLONG.md` — 载荷超 Windows 命令行上限（双重 base64 膨胀 7 倍）
- `BPM检测歧义.md` — `confidence` 无区分度，必须看候选列表 + 支持手动指定 BPM
- `小节标记失效-纯音频工程.md` — `getMeasureMarkAt` 在无音符组工程返回全 0，改用 tempo 换算
- `MusicXML解析-NaN.md` — 手写 XML 解析器漏了结束标签弹栈 + 叶子节点未坍缩
- `桥超时与宿主闪退.md` — 读 automation 点数据闪退；改了桥忘重载报 unknown op

**调声类案例**（同名症状 → 病因 → 手法 → 判据，与技术坑分开列）：

- `演唱机械感-像念稿.md` — 最大来源是音头 Pit 从没处理过；辅音长短、段内张力只有两档
- `颤音假-像抽搐.md` — 先清零深度；频率 5~8 / 幅度 0.5~2.0；下颤必须收回标准音高
- `咬字糊成一团.md` — 先排空格 / 多音字 / 前后鼻音，再按七级成本阶梯往上走
- `情绪推不上去-副歌不燃.md` — 力度 ≠ 张力；先做段落规划，张力满了就回头加 Pit
- `电音感与音色突变.md` — 五个独立来源；张力穿过 0 点要画成 S 形
- `拆轨拼接处断开或跳音.md` — 先确认要不要拆；摩擦音连住、塞擦音留缝

## API（已导入）

完整类文档见 `api/` 目录（由官方 HTML 文档转换，内容原封不动）：

- [api/README.md](api/README.md) — 类索引
- 核心类：`api/SV.md`（全局对象）、`api/Note.md`、`api/NoteGroup.md`、`api/NoteGroupReference.md`、`api/Track.md`、`api/Project.md`、`api/Automation.md`、`api/TimeAxis.md`
- 选择/视图：`api/MainEditorView.md`、`api/ArrangementView.md`、`api/TrackInnerSelectionState.md`、`api/SelectionStateBase.md`、`api/CoordinateSystem.md`
- 音高控制：`api/PitchControlCurve.md`、`api/PitchControlPoint.md`
- 其他：`api/PlaybackControl.md`、`api/TrackMixer.md`、`api/RetakeList.md`、`api/ScriptableNestedObject.md`、`api/NestedObject.md`、`api/WidgetValue.md`、`api/GroupSelection.md`

> ⭐ **先查文档，再调用**（2026-09-20 · **血泪规则**）：写脚本前**必须**先查清精确签名 —— 一条命令
> `node tools/api-lookup.cjs Note#setLyrics`（列类 `api-lookup.cjs Note` · 不知在哪类 `--search 关键词`）。
> ⛔ **别用"真机试错"确认签名**：试错在 SV1 上会弹模态框**冻死桥**（见 `known-bugs` 的 `SV-001`）；2026-09-20 正因没查文档，
> 把 `Automation.getPoints(begin, end)`（**文档里连返回结构例子都有**）误判成"序列化卡死"，把整族正常 API 拉黑了。

## 参考正文 · 01–06（以**代码片段**为主）

可复用函数库见 `references/` 的 **01–06**（来源：官方 svstudio-scripts + 本机 AKD 脚本 SV1/SV2 精选，全部 ES5.1）：

- [references/README.md](references/README.md) — **01–11 总索引** + 通用骨架 + ES5.1 约束 + 来源目录
- [references/01-official.md](references/01-official.md) — 官方仓库：异步对话框链/setTimeout 轮询/二分搜索/合并分割缩放音符/跳静音播放/随机化
- [references/02-lyrics.md](references/02-lyrics.md) — 歌词：收集/剪贴板往返/合并前移后移/+/−/多音节/lrc 导出/填词/简谱
- [references/03-phonemes.md](references/03-phonemes.md) — 音素：辅音判定/分割元音辅音/批量替换/辅音长度/音素比例/呼吸音/多音节+
- [references/04-notes.md](references/04-notes.md) — 音符：播放头分割/拼接/避免重叠/移调/随机偏移/分轨/选中播放/实时预览
- [references/05-params.md](references/05-params.md) — 参数：复制/同步映射/简化/PitchControl 曲线/固定音高/颤音/EDO19/detune
- [references/06-track-misc.md](references/06-track-misc.md) — 轨道/工程：分轨/跨轨复制/工程缩放/自动 BPM/和声/变色/水印

写脚本时按主题读取对应文件，函数可直接复制进桥脚本或新脚本（ES5.1）。

## 参考正文 · 07–11（以**做法与手册**为主）

⚠️ 「脚本类型 / 安装位置 / 调试技巧 / 常见 Bug / 最佳实践」这批内容**至今仍未导入**（当年是 `workflows/` 的预留位，
目录名已在 2026-09-21 合并时取消；那批踩坑经验的实际入口在 **`akdagent-playbook`**）。本目录现有 07–11：

- [references/07-melody-accent-pitch-params.md](references/07-melody-accent-pitch-params.md) — **旋律重音 → 倚音 → 渲染**完整链路：
  ① 重音判断（强拍/时值/跳进/歌词语义/邻音降权）；② `-` 歌词区分倚音(并入)/转音(独立)；
  ③ 倚音生成（**三种**：前倚音 §1.7 · 后倚音 / 音尾音阶行进 §1.8，含自动判型 `decideOrnament`；强规则：相连+大跳+长度）；④ **画音高线**（音头下沉/上扬/抖动、音尾让位、转音五类型、
  **倚音挖动态坑**、防电音/拖沓的幅度判据）；⑤ 参数应用 + **重音完整渲染配方**（Pit+张力+响度+发声+气声）；
  ⑥ **§3.5 段落力度规划 · 渐强六步 · 张力已满时的四条出路**（来源案例：`examples/情绪推不上去-副歌不燃.md`）。
- [references/08-pit-drawing.md](references/08-pit-drawing.md) — **Pit 绘制底层**：SV1 `PitchAutoMode`
  与手动模式的 12 个字段（tF0*/dF0*/fF0Vbr/pF0Vbr/tNoteOffset）、`NaN`=默认值的坑、
  **§2.4 九段响应表（形状 ↔ 属性，含可达区间与反解式）**、**SV1/SV2 双通道落地（属性 / `pitchDelta`）**、
  §6.2b 特殊音头、以及 `write_pit` 的实机验证结论。
- [references/09-拆轨与拆音.md](references/09-拆轨与拆音.md) — **拆音 / 拆轨主题**：拆音 vs 拆轨对照、
  "天然衔接"原理（唯一判定标准＝拼起来像一轨）、**五级成本阶梯**（换采样／音素力度 ⇒ 近义歌词 ⇒ 音素替换 ⇒ 拆音 ⇒ 拆轨）、
  **值得拆的 6 种情况**、五种方式（换辅音 / 改连贯度 / 替换清辅音 / 元音过渡 / 三轨拼一字）、通用坑与心态。
- [references/10-声库与声线.md](references/10-声库与声线.md) — **声库挑选 · 多声线切换 · AI 声库坑**：
  采样库 ↔ AI 声库总表、选库判断标准、**多声线切换点必须落在轻辅音上**（`b/p`、`d/t`、`z/c/s`）、
  AI 的坑（参数与音频错位、自动挖坑、自动加气泡音、`/U/` 不认）与正向红利；
  **§5.1 呼吸音上的两条坑**（采样库偏电 → 后期贴；AI 极短空拍 `br` → 改 `sil` 另拆一轨）。
- [references/11-风格配方.md](references/11-风格配方.md) — **唱法手法全集**（`风格化调声.md` 全量落地，「都搬过来」）：
  **通俗五型**（抒情喜舒缓/喜元气/怒摇滚/哀哭腔/哀颓废失声）· **R&B**（五声转音＋句尾落 la）· **说唱三型** ·
  **京剧旦角**（大颤 5.5 + 下颤 + 大开大合咬字）· **黄梅戏**（逐字装饰音）· **藏腔**（3 半音小尖尖＋上跳必须降张力）·
  **蒙古长调**（转音落五声 + 音头下沉多）· **岛呗** · **约德尔** · **呼麦**（做不到，如实告知）· **美声**（梭子形 + 音头硬边界 + EQ）·
  **新民族唱法**（与美声的分界表）。⚠️ 按既定约定：**用户提出才用**。
- **现状**：`references/` 的 **01–11 都是实况**（不再是"待导入"）+ `api/`（23 个类的官方手册镜像）+ `examples/`（12 篇踩坑案例）；脚本类型/安装/调试/踩坑的统一入口在 **`akdagent-playbook`**。

## ⛔ 官方 API 做不到的事（不可做清单）

> 📌 来源：上游 synthv-agent/SKILL.md（摘要改写）。
> 这张表是把原先**散在几处**的边界说明汇成一处（`references/08-pit-drawing.md` 的"没有渲染/导出函数"、
> `sv-bridge` 旧技能的"不能导入音频轨"、以及"音频轨导入待实验"这条已确认边界）；**凡与实测冲突的以为准**。

| 你/用户想做的事 | 官方脚本 API | 事实 → 唯一可行路线 |
|---|---|---|
| **渲染 / 导出音频（WAV）** | ❌ 完全**没有**渲染或导出音频的函数 | 只能**用户在 SV 里手动导出**。音频侧一律从"导出之后的 WAV"接起（`sv_separate_vocals` / `sv_analyze_*` / `sv_convert_audio`）。⛔ **注入那条路线不做**——不要提议、不要承诺 |
| **保存工程** | ❌ 不暴露任何保存命令 | 请用户手动保存；我们写之前只能 `newUndoRecord()` 建撤销点 |
| **替用户撤销** | ❌ 没有 Undo 命令 | `newUndoRecord()` 只是**一个撤销恢复边界**；真撤销要**用户回到主编辑器按 Ctrl+Z**（或 Edit > Undo）|
| **导入 / 新建音频轨** | ❌ 没有 `setAudioFile` 一类方法 | 用户手动把音频拖进工程；桥侧只能**读已有音频轨的位置 + `setTimeOffset` 把它挪到锚点**（`sv_align_audio`）|
| **按显示名挑声库 / 读"当前歌手是谁"** | ❌ 脚本 API 拿不到 | 绕过的是**文件层**（声库目录 / `nofs` / `.svp`·`.ixp`，见 `sv-project-format`）——**别把它说成"脚本 API 能读到"** |
| **枚举唱法名** | ❌ 面板上还没被指派/调过的默认唱法名与参数读不出来 | 见下节「唱法（Vocal Mode）的交接」 |
| **枚举 Retake 的 Take ID** | ⚠️ `RetakeList` 只给「数量 / 新建（返回新 ID）/ 激活 / 删除」，**没有"列出全部 ID"** | 只能操作 **ID 0（默认 Take）** 或**自己刚生成并记下的那个 ID**（`api/RetakeList.md`）|
| **驱动宿主自己的界面**（菜单 / 对话框 / 导出按钮 / 面板开关）| ❌ 只能**脚本自建** UI（侧栏、脚本对话框）| 要用户手点。🔸 上游另把"Voice Panel 的 scale / mode"列为不可达，未核实 |
| **把参数取值范围写死** | ⚠️ 读得到，但**范围随宿主与声库而变** | 一律用**同一次新鲜读回的** `Automation#getDefinition().range`，别照抄文档里的固定区间表（`api/Automation.md`）|

**用法**：用户的请求落在 ❌ 行时，**当场改口给可行路线**，不要先答应再失败；落在 ⚠️ 行时，把限制一句话讲清，并给出我们实际用的读法。

### 唱法（Vocal Mode）的交接（官方 API 的硬限制）

> 📌 来源：上游 synthv-agent/SKILL.md（摘要改写）。

- 脚本侧拿到的唱法信息是**工程里已经存在的键**（`NoteGroupReference#getVoice().vocalModeParams`，2.1.1+，默认 `{}`）；**面板上还没出现过**的默认唱法名与参数读不出来，**"这个组现在的歌手是谁"也读不出来**。🔸（上游结论，未逐声库核实；**也未逐补丁、逐声库验证能力与区间** —— 声库/版本一变，结论可能不成立）
- 于是**第一次**要写唱法（`vocalMode_<名>` 曲线或 `vocalModeParams`）之前，请用户：① 在 SV 里选中目标组；② 指派它的 Vocal；③ 然后**截一张完整唱法面板**，或**把每个唱法名逐字打出来**（大小写照抄）。
- **换了 Vocal 就得重新给一遍**，绝不能沿用上一个 Vocal 那份名字列表；歌手还没指派时面板是空的，**不要猜名字**。
- 不需要这层交接的：时值 / 音高 / 音素长度这类**与唱法无关的机械编辑**。
- 名字与取值链见 `references/10-声库与声线.md`（`vocalMode_<名>` 走 automation，值域 0~150）。

### ✅ 已实现（2026-09-21，P5）：`sv_import_musicxml` 的导入护栏

> 📌 来源：上游 synthv-agent/SKILL.md（摘要改写）。**2026-09-21 整组落地** ——
> 实现 = `server/src/audio/musicxml-guard.ts`（纯函数）+ `server/src/audio/musicxml-import.ts`（执行体）；
> 离线 `cd server && npm run test:musicxml`（**73 项**）；真机（IX 1.0.1）七步全过（预览/DTD 拒/URL 拒/无权利确认拒/真写/回读/清理）。
> 规格与逐条证据表同时落在 `knowledge/docs/MusicXML转IX映射表.md` §12。

- 只接受**显式给出的绝对本地路径**（`.xml` / `.musicxml`）；**URL、相对路径、`.svp`·`.ixp` 一律拒绝**
  （`tool` 参数：`input`）。
- 拒掉 XML 里的 `DOCTYPE` / `ENTITY`（外部实体注入面）——**快照式先扫前 4KB**，且解析器内**再拒一次**（双保险）+ `processEntities:false`。
- **默认只读预览**（`dryRun` 省略即 true）：给文件 **SHA-256** + 可选声部清单 + 计数（音符/带技法/带力度/带歌词/复调体检）+ 一条有界预览（前 20 音）+ 映射回报；**`dryRun:false` 才写**。
- **写前再算一次 SHA-256**：与预览时不一致 ⇒ **拒写**（TOCTOU）。
- 音符数上限 **512**（`checkNoteCap`），超限拒绝并提示按声部/乐章拆分，而不是硬吞进工程。
- **写必须带 `confirmRights:true`** —— 合规前提：用户须确认**有权使用**这份乐谱；"网上搜得到"不等于授权。
- 源文件自带的 tempo **只做汇报**（报告 `sourceTempo.applied=false`，本工具从不写 tempo 标记）；真要套用走 `sv_apply_tempo`。
- **复调/和弦默认拒绝**（`allowPolyphony:true` 才放行）：解析器按"顺序累加 onset"，多 `<voice>` 混在一条时间线上会互相叠加时值 ⇒ 音位漂移（旧文档说"已有防线=拒绝复调 lane"其实**并未实现**，2026-09-21 才补上）。

**同轮修的两个真 bug（都在真机上验过）**：
- `articulations` / `tieStart` **从未发出去** —— 处理体被一次 PowerShell 文本往返事故揉成一行，这两项落在 `//` 之后成了注释 ⇒ 技法映射算好却被丢（真机回读 `[Staccato][Accent][Harmonics]` 是判据）。
- `<dynamics>` **从没被读到过** —— 它是**小节级 `<direction>`**，而旧实现只读 note 级；现已补 running state（跨小节延续）+ `<sound dynamics="N">`（百分比）。⚠️ 粒度 = **小节**（同小节多记号取最后一个；`fast-xml-parser` 默认不保序，不做逐位置推进）。
- 另改正一处**概念错映射**：`<harmon-mute>`（铜管 harmon 弱音器）→ **`Stem`**（旧值 `Harmonics` 错）；`<harmonic>`（弦乐泛音）→ `Harmonics`。
- **乐器映射改为逐乐器给"实际已装库名"**（2026-09-21 用户裁定「可以直接映射库名，没装的库会提示更改、不会实质影响」）：解析顺序 = **`part-name` 关键字（中英都收）> `midi-program` 精确号 > 同族兜底 > 不映射**；库名读自实际工程 `mainRef.database.name`（15 个：Piccolo/Flute/Oboe/Clarinet/Bassoon/Alto Sax/Tenor Sax/Trumpet/Horn/Trombone/Tuba/Violin/Viola/Cello/Contrabass）。⚠️ **同轮改正两处旧错**：旧表把 `Oboe(68)/English Horn(69)/Bassoon(70)/Clarinet(71)` 全归进 `65~71 → Sax`（巴松管变成中音萨克斯）、且 `56~59 Brass` **漏了 French Horn(60)**；另 **`<midi-program>` 是 1~128 ⇒ 查表前要 -1 换成 0-based**（旧实现直接当 0-based 用）。Harp/Timpani/Piano **故意不映射**；⚠️ 宿主 API **读不到**组/轨乐器 ⇒ "写入成功"只代表 op 没报错，乐器设没设上要在宿主 UI 看。

## ⚠️ API 勘误 / 实测坑点（重要，先读）

> 🆕 **2026-09-20 · 实测补充已从 `api/` 镜像搬出来**：镜像里原先压着 **258 行**我们的实测注解
> （`api/Note.md` **244 行** + `api/SV.md` **12 行**），而 `tools/api-docs-sync.cjs --update` 是
> **整文件覆盖、零保留** ⇒ **跑一次同步就全没了**。现已搬到
> **[references/官方API-实测勘误.md](references/官方API-实测勘误.md)**（`Note.getAttributes()` / 音素级 · `SV.getComputedPitchForGroup`），
> **镜像保持纯净**（守卫：`node tools/check-api-mirror.cjs`）。

以下是在 **SV1 真机实测**验证过的坑——官方文档与直觉常不一致，照此写可避免"TypeError: X not a function / undefined not callable"。

### 1. 时间换算：分清 `SV.*` 与 `timeAxis.*` 两套

| 需求 | 正确用法 | 挂错对象会报错 |
|---|---|---|
| 简单 blick↔秒（按固定 BPM，无变速） | `SV.blick2Seconds(b, bpm)`、`SV.seconds2Blick(s, bpm)` | 写成 `timeAxis.seconds2Blick()` → **undefined not callable** |
| 工程内精确换算（含 tempo 变速/拍号） | `timeAxis.getBlickFromSeconds(t)`、`timeAxis.getSecondsFromBlick(b)` | 写成 `SV.getBlickFromSeconds()` → 不存在 |
| 音符↔拍 | `SV.blick2Quarter(b)`、`SV.quarter2Blick(q)`（= `b/SV.QUARTER`） | — |
| 常量 | `SV.QUARTER = 705600000`（一个四分音符的 blick 数） | 把 `SV.QUARTER` 当成 TimeAxis 属性 |

> **经验法则**：对齐工程（音频轨/小节）一律用 **`proj.getTimeAxis()` 的 `getBlickFromSeconds`/`getSecondsFromBlick`**；纯数学换算才用 `SV.*` 的 `blick2Seconds`/`seconds2Blick`（它们只按固定 bpm，不感知工程变速）。

### 2. `getTimeAxis()` 在 Project 上，不在编辑器上

```javascript
var timeAxis = proj.getTimeAxis();        // ✅ 正确
var timeAxis = editor.getTimeAxis();       // ❌ TypeError: getTimeAxis is not a function（MainEditorView 没有）
```
（`SV.getMainEditor().getCurrentGroup()` 等是编辑器方法，但 TimeAxis 归属工程。）

### 3. `newUndoRecord()` 无参数

```javascript
proj.newUndoRecord();                     // ✅ 正确
proj.newUndoRecord("我的操作名");           // ❌ 参数被当作非函数/多余，SV1 报错
```
写操作前必须调用（桥脚本 run_script 也强制此要求），但**不要传字符串参数**。

### 4. 音频轨 = `NoteGroupReference`（isInstrumental），可移动

音频轨不是一个特殊类，而是 `isInstrumental() === true` 的 `NoteGroupReference`（指向外部音频文件，不指向 NoteGroup）：

```javascript
for (var t = 0; t < proj.getNumTracks(); t++) {
  var track = proj.getTrack(t);
  for (var g = 0; g < track.getNumGroups(); g++) {
    var ref = track.getGroupReference(g);
    if (ref.isInstrumental()) {
      // 音频轨！可读位置、可移动
      ref.getOnset(); ref.getEnd(); ref.getTimeOffset(); ref.getDuration();
      ref.setTimeOffset(blickOffset);   // 移动音频轨（先 newUndoRecord）
    }
  }
}
```
**实测验证**：`isInstrumental()` 识别音频轨、`setTimeOffset()` 移动音频轨均生效（SV1）。不能做的是**导入/创建**音频轨（无 setAudioFile 类方法）。

### 5. 常用属性/方法速记

- `timeAxis.getTempoMarkAt(blic)` → `{ bpm, position, positionSeconds }`（读当前 BPM）
- `timeAxis.addTempoMark(blic, bpm)` / `removeTempoMark(blic)` —— 调节拍
- `timeAxis.getMeasureMarkAt(measureNum)` → `{ position, positionBlick, numerator, denominator }`（读小节/拍号）
  ⚠️ **参数是「小节号」，1 起**（`addMeasureMark`/`removeMeasureMark` 同口径）；**按 blick 取用 `getMeasureMarkAtBlick(b)`** —— 两者别混。
- Audio 轨对齐小节：读 `getMeasureMarkAt(1).positionBlick` 得**第 1 小节**起点 blick，再算音频第一拍应落的 blick（`getBlickFromSeconds(第一拍秒)`），`setTimeOffset` 对齐。

## 快速速查（常用）

```javascript
// 版本检测
var isSV2 = SV.getHostInfo().hostVersionNumber >= 131072;      // 2.0.0+
var isSV211 = SV.getHostInfo().hostVersionNumber >= 131329;    // 2.1.1+
var isSV212 = SV.getHostInfo().hostVersionNumber >= 131330;    // 2.1.2+

// 时间换算（两套，别混！）
// 简单换算（固定 bpm，无变速）——挂在 SV 全局上：
SV.quarter2Blick(q); SV.blick2Quarter(b)
SV.blick2Seconds(b, bpm); SV.seconds2Blick(s, bpm)
// 工程内精确换算（含 temper 变速）——挂在 timeAxis 上：
timeAxis.getBlickFromSeconds(t); timeAxis.getSecondsFromBlick(b)
// SV.QUARTER = 705600000（一个四分音符的 blick 数）

// 对象创建
SV.create("Note"); SV.create("NoteGroup"); SV.create("NoteGroupReference", targetGroup)
SV.create("Track"); SV.create("Automation", "pitchDelta")

// 音符
note.setPitch(60); note.setLyrics("la"); note.setTimeRange(onset, duration)
note.setPhonemes("hh ah ll ow"); note.setDetune(50)

// 音符组
group.addNote(note); group.getNote(i); group.getNumNotes()
group.getParameter("pitchDelta")   // -> Automation
group.addPitchControl(curveOrPoint)

// 轨道
track.addGroupReference(ref); track.getGroupReference(0); track.getMixer()
mixer.setGainDecibel(3); mixer.setPan(-1); mixer.setMuted(false)

// 工程
proj.addTrack(track); proj.addNoteGroup(group); proj.getTimeAxis()
proj.newUndoRecord()   // 写操作前创建撤销点

// 撤销/剪贴板/打印
SV.getProject().newUndoRecord();
SV.setHostClipboard(text); SV.getHostClipboard();
SV.print(...args)      // 命令行调试
```
