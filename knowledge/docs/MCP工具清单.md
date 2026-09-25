# AKDAgent MCP 工具清单

> 共 **42** 个工具。所有工具都可在 `sv`（Synthesizer V Studio）或 `ix`（Instrument X）宿主下运行（`host` 参数可选，默认自动探测；宿主在线是前提，先 `sv_ping`）。

> 概括：`sv_ping` 探宿主 → `sv_*_notes/lyrics` 读写选中 → 音频/乐谱类在本地做分析/生成 → 通过桥 `executeOp` 写入宿主。

## 分类索引

| # | 分类 | 工具 |
|---|---|---|
| 1 | 宿主/工程 | `sv_ping`<br>`sv_get_project_info` |
| 2 | 选中/当前组 | `sv_get_selected_notes`<br>`sv_get_current_group` |
| 3 | 其它 | `sv_get_computed_pitch`<br>`sv_get_computed_attributes`<br>`sv_fix_mixed_lyric_language`<br>`sv_mark_mandarin_tones`<br>`sv_fix_consonant_intrusion`<br>`sv_list_phonemes`<br>`sv_replace_phonemes`<br>`sv_get_layout`<br>`sv_check_melody`<br>`sv_check_lyrics`<br>`sv_write_texture`<br>`sv_apply_articulations`<br>`sv_write_pit` |
| 4 | 音符编辑 | `sv_transpose_selected_notes`<br>`sv_set_selected_lyrics` |
| 5 | 歌词对位 | `sv_apply_lyrics`<br>`sv_align_lyrics`<br>`sv_fill_lyrics_to_track` |
| 6 | 播放 | `sv_playback` |
| 7 | 音频处理 | `sv_separate_vocals`<br>`sv_separate_vocals_dual`<br>`sv_convert_audio`<br>`sv_analyze_audio`<br>`sv_analyze_emotion`<br>`sv_extract_notes` |
| 8 | 旋律/和声 | `sv_generate_melody`<br>`sv_generate_harmony`<br>`sv_run_script` |
| 9 | 音频对轨 | `sv_align_audio`<br>`sv_apply_tempo` |
| 10 | 声库/风格 | `sv_list_voice_styles`<br>`sv_list_voice_styles_detail`<br>`sv_combine_voice_styles`<br>`sv_style_create`<br>`sv_style_adjust` |
| 11 | 和弦/乐谱 | `sv_analyze_chord`<br>`sv_write_chords`<br>`sv_import_musicxml` |

---

## 详细列表

| 工具 | 参数 | 作用 |
|---|---|---|
| `sv_ping` | host? | 检 Synthesizer V Studio 桥脚本是否在线，返回宿主名称/版本/isSV2。调用其 sv_* 工具前建议先调用本工具确认桥已启动。⚠️ **先看 `hostOut… |
| `sv_get_selected_notes` | host? | 读取当前 Synthesizer V Studio 中选中的音符列表。返回每个音符的 index（**本次选中结果数组内的序号，0 起**，≠ 组内下标）、pitch（MIDI 音… |
| `sv_get_current_group` | host? | 读取当前编辑的音符组信息：名称、UUID、音符数量、时间偏移、音高偏移。可 host 指定目标宿主（sv/ix） |
| `sv_get_project_info` | host? | 读取当前工程信息：文件名、时长、轨道列表（名称与组数量）、NoteGroup 库数量。可 host 指定目标宿主（sv/ix） |
| `sv_get_computed_pitch` | （见 schema） | 读取宿主**计算出的音高曲线**（SV2 2.1.1+；SV1 无此接口）。返回 values（半音 / MIDI 音高浮点）、numeric（有值帧数）、nulls（未算出帧数）… |
| `sv_get_computed_attributes` | （见 schema） | 读取宿主**计算出的音符属性**（SV2 2.1.1+）：每个音符的 accent（重音）、rapTone/rapIntonation（说唱语调，仅 rap 音符有值）、phone… |
| `sv_fix_mixed_lyric_language` | （见 schema） | **混合语种**：扫描当前组所有音符的歌词，**按语义**判每个音符的语种（① 字形：CJK⇒中文·假名⇒日文·谚文⇒韩文 ② **拉丁字母按词法再判**：带声调符号或 `ni3`… |
| `sv_mark_mandarin_tones` | （见 schema） | **中文声调自动标记**（用户觉得 **rap 声调不准**时用）：读当前组歌词，**按词**查普通话声调（`pinyin-pro`，多音字按词定音；歌词自带调号/`ni3` 式数… |
| `sv_fix_consonant_intrusion` | （见 schema） | **修「短音符的辅音吃掉前一个音符」**（唱歌 / rap 都会出）：扫当前组找**短音符**（默认 ≤ 0.25 四分音符 = 16 分音符；也可用 `indices` 点名）→… |
| `sv_list_phonemes` | （见 schema） | **列出可替换的音素候选**（只读）：读目标音符的**实际发音音素串**（`SV:getPhonemesForGroup`，含 T2P 默认；拿不到则退回首动串）， |
| `sv_replace_phonemes` | （见 schema） | **批量替换音素**（写；**默认 dry-run**）：基于**实际发音串**（`SV:getPhonemesForGroup`，含 T2P 默认）改音素 —— |
| `sv_get_layout` | （见 schema） | 读**当前组的布局报告**（只读，不改任何东西）：把组内音符按 onset 排序，逐对比较 → 返回 `overlapCount`（**重叠 = 违规，必须报给用户**）、`gap… |
| `sv_transpose_selected_notes` | semitones, host? | 将当前选中的音符整体移调。semitones 为半音数（整数）：正数升高、负数降低，例如 -12 表示降低一个八度 7 表示升高纯五度。操作会先创建撤销记录，可 SV 内撤销。可 … |
| `sv_set_selected_lyrics` | lyrics, host? | 将当前选中的音符歌词统一设置为指定文本（如 'la'、'啊'、'love'）。操作会先创建撤销记录。可 host 指定目标宿主（sv/ix） |
| `sv_apply_lyrics` | lyrics, host? | 把一段歌词逐字/按词分配到当前选中的音符（歌词-音符对位）。中文按单字切分、英 含空格按词切分，按音符顺序逐个 setLyrics。音符多于字符时剩余 '-'，字符多于音符则多余忽… |
| `sv_align_lyrics` | lrc, apply?, host? | 歌词时序对齐：读取当前组音符 onset 时间（秒），按歌 LRC 的时间戳，把每段歌词的字/词按到达顺序对位到对应时间段的音符，并回填歌词。歌词用 LRC 格式（每 [mm:ss… |
| `sv_fill_lyrics_to_track` | lyrics, track?, host? | 把一段歌词（正确歌词）按音符顺序/时间填到指定轨道的音符（歌词-音符对位，可指定正式轨）。track 可填轨道名称（如 'Track 2'）或数字索引（**0 起**的轨道下标）；… |
| `sv_playback` | action, position?, host? | 控制 Synthesizer V Studio 的播放：play 播放 / pause 暂停 / stop 停止 / toggle 播放暂停切换 / seek 跳转到指定秒数（需 … |
| `sv_separate_vocals` | input, model?, outDir? | 将音频文件（wav/mp3）分离为人声与伴奏，使用内置 MDX-Net 模型（Kim_Vocal_2，本地离线推理）。输入可为任意 mpg123 可解码格式，非 44.1kHz 会… |
| `sv_separate_vocals_dual` | input, vocal?, accompaniment?, outDir? | 双模型分离人声与伴奏，两者都尽可能干净：人声用 Kim_Vocal_2（人声优先模型，取 vocal），伴奏 UVR-MDX-NET-Inst_HQ_3（乐器优先模型，取其 voc… |
| `sv_convert_audio` | input, outPath?, maxSeconds? | 将音频文件（mp3/wav/m4a/其他 mpg123 可解码格式）转换 44.1kHz 立体 WAV。完全本地处理（mpg123-decoder WASM 解码 + 重采样），不… |
| `sv_analyze_audio` | input, startSec?, endSec?, bpm? | 分析音频文件（WAV）的特征：响 RMS、BPM、节拍序列、调性（key，Krumhansl）、频谱质心、音高中位数（Hz）。可指定时间窗口（startSec/endSec）分析局… |
| `sv_analyze_emotion` | input, startSec?, endSec? | 分析音频文件（WAV）的情感：基于调性大/小调、BPM、RMS 能量、音高中位数，映射到四象限（Valence-Arousal）得情感标签（喜 宁静/愤 悲伤）。返 { valen… |
| `sv_extract_notes` | input | 从干声（人声 WAV）提取音符块（音高+起止时间），基于 CREPE onnx 音高检测模型（本地推理，精度高）。返回 [{midi（C4=60  onsetSec, durati… |
| `sv_generate_melody` | key, mood?, bpm?, barCount?, chordProgression?, useArpeggio?, seed?, outPath? | 用乐理规则算法生成旋律 MIDI/音符序列（主旋律 + 可选伴奏琶音），供人声 SV 或乐器进 IX。**v2 结构引擎**：主题(动机)跨小节发展（A→A'模进→B对比→A''回… |
| `sv_check_melody` | （见 schema） | **给已经写好的旋律做复核**（人工写的 / 自动生成的 / 别人给的都适用），并按判据列出一份**建议清单 + 严重度（error/warn/info）** —— **只列不改，… |
| `sv_check_lyrics` | （见 schema） | **给已经写好（或已填进工程）的歌词做复核**：按判据列出**问题清单 + 替换意见**，**只列不改**（改不改由用户定，一次只改一处）。<br>⚠️ **触发：用户提出检查，或… |
| `sv_generate_harmony` | accompaniment?, direction?, interval?, avoidDissonance?, keyRoot?, groupName?, host? | 根据当前主旋律音符（SV 当前组）和伴奏音频的调性，生成和声部并写入新的和声组轨道。流程：①读 SV 当前组主旋律音符 ②分析伴奏 WAV 的调性（纯 JS Krumhansl）③… |
| `sv_run_script` | code, readonly?, scope?, host? | 在 Synthesizer V / Instrument X 内执行一段 **Lua** 脚本（桥是 Lua 桥，run_script op 用 load 执行）。脚本应为函数体（… |
| `sv_align_audio` | input, bpm?, anchor?, measure?, introBeats?, introSec?, audioTrackIndex?, shiftBeats?, setBpm?, host? | 测音频 BPM 与第一拍偏移，并把 Synthesizer V 内音频轨（instrumental 轨）移动到锚点，使音频节拍对齐。anchor='measure'（默认）对齐到第… |
| `sv_apply_tempo` | input, bpm?, segmentBeats?, beatOffsetSec?, measureStart?, clearExisting?, host? | 按音频的实际浮动 BPM 在 Synthesizer V 工程 TimeAxis 上逐段 tempo 标，使小节线贴合音频（适合 BPM 浮动 120-122 的伴奏）。流程：①本… |
| `sv_list_voice_styles` | — | 列出 flat 版全部声库， vocoder 分组（refresh 自动忽略）。每组列出声库名与各自的 styles 名称。用于找 vocoder 声库之间的风格移植目标 |
| `sv_list_voice_styles_detail` | voice | 列出指定声库 styles 详情（名 + data 摘要 + 长度）。用 voice 指定声库目录名， 'POPY AI' |
| `sv_combine_voice_styles` | sourceVoice, targetVoice, styleNames[], renameAs? | 把源声库的指 styles 复制到目标声库（同 vocoder 才能移植；refresh 忽略）。styleNames 用源声库 style 名称（如 'Powerful','Me… |
| `sv_style_create` | targetVoice, name, baseOnVoiceStyle?|random, adjust? | 在目标声库新建一 style。name 必填；data 来源二选一：baseOnVoiceStyle（如 'POPY AI/Powerful' 复制 data，需 vocoder）… |
| `sv_style_adjust` | targetVoice, styleName, index?, count?, amplitude? | 调整已有 style 的浮点数向量（data = 32 个 float32）。index 指定微调单个下标（0~31）；省略则随机微调 count 个（默认全部）。amplitud… |
| `sv_analyze_chord` | input, startSec?, endSec?, maxCandidates? | 估计音频文件（WAV）的和弦：直接从波形算 chroma（12 音级能量曲线），再与和弦模板（大 小三/七和弦等）匹配打分。纯音频、无 MIDI、无需音符提取。返回最优候选（ ro… |
| `sv_write_chords` | input, bpm?, keyRoot?, keyMode?, segBeats?, pattern?, groupName?, trackIndex?, startMeasure?, host? | 分析音频的和弦随时间变化，把和弦拆成实际音符写入当前宿主工程的和弦伴奏音符轨（可播放）。流程：①本地分析伴奏 WAV 得调性/BPM ②逐段（默认一小节）提取和弦序列（互相关模板评… |
| `sv_write_texture` | （见 schema） | 按乐器铺织体（伴奏型）到当前宿主，主要给 IX 用，SV 侧同样可写。**和弦来源三种**：① notes（默认）＝从工程内音符按小节推和弦（与 IX 侧边栏「旋律和弦生成」同口径… |
| `sv_apply_articulations` | （见 schema） | 按**旋律走向**自动标注 IX 技法（articulations），或做**段落级批量开关**。**默认 dry-run**（只出计划，不改工程）。 |
| `sv_write_pit` | （见 schema） | 绘制/改写音高线（Pit，即 SV 的 pitch 曲线）。🆕 **默认只改算出来的重音音符**（`plan` 省略 ⇒ `accent`：按重音检测挑命中的少数音符，其余保持 … |
| `sv_import_musicxml` | input, part?, groupName?, trackIndex?, lyrics?, host? | 解析 MusicXML（.musicxml/.xml）乐谱成音符并写入目标轨道。**默认只读预览**（`dryRun:false` 才写）—— 先给文件 SHA-256、可选声部清… |
| `sv_apply_ornaments` | ornament, indices?, interval?, dir?, len?, headLen?, steps?, df?, style?, manual?, dryRun?, host? | 给音符加**装饰音**（八型）：前倚音 / 后倚音 / 向上尖尖 / 波音 / 回音 / 音尾音阶行进 —— 六个**拆音符**；反向预备 / 滑音 —— 两个只写**音符属性**（仅 SV1）。**默认 `dryRun`**；新音符默认自动音高（`manual:true` 才设手动）。 |
| `sv_write_automation` | parameter, points[], dryRun?, host? | 写当前组的**参数自动化点**（张力/响度/气声/发声/性别/颤音包络/音高偏移/声线）。写前按取值域 **clamp**；回读只走 `Automation#get(b)` **单点采样**（`getPoints`/`getAllPoints`/`getLinear`/`getDefinition`/`remove(index)` 在已知缺陷 IX-001 的 crash 清单上，一律不调）。**默认 `dryRun`**。 |
