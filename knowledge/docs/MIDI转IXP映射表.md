# MIDI → IX（.ixp）映射表规格

> 目的：把 `.mid` 文件转成 Instrument X `.ixp` 工程，**保留力度/弯音/分轨**（IX 直接导入会丢力度）。
> 依据：AKDAgent 对 `.ixp` 格式的实测（**`skills/sv-project-format/SKILL.md`** ＋ 运行时 API 实测）。
> 本文档为 `midi2ixp` 工具的**设计规格**（映射规则），生成时据此实现。

---

## 1. 总体原则

- **MIDI 单轨 → IX 单轨 + 单音符组**（按 MIDI track 分轨，保留分轨结构）。
- **音符可重叠**（同音 poly 允许，**不切分/合并**）：MIDI 里重叠的音符直接生成 IX 重叠音符，宿主自行处理。
- **不依赖宿主运行时 API 回报**：生成时直接写 `.ixp` 文件，宿主打开时自动计算实际音高/力度（回避 `getComputed*` 异步问题）。

---

## 2. 音符属性映射（核心）

| # | MIDI | 值域/来源 | → IX 音符字段 | 映射公式 | 状态 |
|---|---|---|---|---|---|
| 1 | `noteNumber` | noteOn 事件 pitch (0~127) | `notes[].pitch` | `pitch = noteNumber` | ✅ 直接 |
| 2 | `velocity` | noteOn 事件力度 (0~127) | `notes[].attributes.dynamic` | `dynamic = velocity/127` | ✅ 线性 |
| 3 | 起拍时间 | deltaTime 累计 (tick) | `notes[].onset` (blick) | 见 §3 时间换算 | ✅ |
| 4 | 时值 | noteOff−noteOn (tick) | `notes[].duration` (blick) | 见 §3 | ✅ |
| 5 | `channel` | 事件 channel (0~15) | 分轨依据 | — | ✅ |
| 6 | MIDI track | track 序号 | `tracks[]` + `library[]` | 1 track → 1 group | ✅ |
| 7 | `programChange` | 0~127 (GM 音色号) | `mainRef.database.name` | 见 §5 乐器映射 | ⚠️ 近似 |

**音符对象**（生成到 `library[].notes[]`）：
```json
{
  "uuid": "<16hex>",
  "onset": <blick>,
  "duration": <blick>,
  "pitch": <noteNumber>,
  "detune": 0,
  "attributes": {
    "dynamic": <velocity/127>,
    "muted": false,
    "articulations": [],
    "articulationsFixed": false
  },
  "takes": { "activeTakeId": 0, "takes": [{"id":0,"seedPitch":0,"seedTimbre":0,"liked":false}] }
}
```

> ⚠️ **`muted` 不参与映射**：生成时恒为 `false`（MIDI 的 noteOff 是"音符结束"→映射到 `duration`，
> **不是**静音；`muted` 是 IX 特有的静音标记，本工具不做 MIDI→muted 映射）。
> 音符级 `muted` 的读写已实测可（`setAttributes({muted:true})` 生效），但不在本映射范围内。

### 2.1 控制映射（CC 控制器 → 轨道 mixer / 组级 automation）

MIDI 的控制变化（CC）是**通道级**控制。处理分层：
- **CC7 / CC10（主音量 / 声像）→ `tracks[].mixer`**（轨道静态增益 / 声像）；**若 CC7 随时间变化 → 增益包络进 `parameters.loudness` 自动化**。
- **CC1 / CC11（调制 / 表情）→ 组级 `parameters` 曲线**（随时间变化的颤音 / 表情）。
- **CC2（气息控制器）→ 组级 `parameters.breathiness`**（气噪/粗粝度）。

| MIDI CC | 名称 | → IX | 映射公式 | 状态 |
|---|---|---|---|---|
| **CC2** | Breath Controller（气息控制）| 组级 `parameters.breathiness`（气噪）| `breathiness = -2 + (CC2/127) × 4`（范围 -2~2）| ✅ |
| **CC7** | Main Volume（主音量）| 静态→`mixer.gainDecibel`；**随时间变化→`parameters.loudness` 增益包络** | `dB = -48 + (CC7/127) × 72`（范围 -48~24）| ✅ |
| **CC10** | Pan（声像）| `tracks[].mixer.pan` | `pan = -1 + (CC10/127) × 2`（范围 -1~1）| ✅ |
| **CC11** | Expression（表情）| 组级 `parameters.loudness`（曲线）| `dB = -48 + (CC11/127) × 72` | ✅ 随时间 |
| **CC1** | Modulation（调制轮）| 组级 `parameters.vibratoEnv`（颤音）| `vibratoEnv = (CC1/127) × 2`（范围 0~2）| ✅ |

生成要点：
- **CC2 → 组级曲线**：序列写 `parameters.breathiness.points`（y -2~2，扁平数组）。
- **CC7 静态**（只一个值，不随时间变）：→ `tracks[i].mixer.gainDecibel`（单值，通道增益）。
- **CC7 随时间变化（增益包络）**：→ 写 `parameters.loudness.points`（扁平 `[x,y,x,y,...]`，x=blick, y=dB），
  **同时可保留 mixer 用其末值或默认 0**（增益包络与轨道增益可共存/叠加，按需要）。
- **CC10 → 轨道**：`tracks[i].mixer.pan`（单值）。
- **CC1 / CC11 → 组级曲线**：序列写 `parameters.vibratoEnv.points`（y 0~2）/ `parameters.loudness.points`（y dB）。
- 固定 CC（不随时间变）→ 写单个全段值，或写首尾锚点。
- ⚠️ 这些 automation 点同样用**扁平数组**存储，读/写走磁盘 `.ixp` 或桥安全 `add(x,y)`。

`tracks[].mixer`（通道增益/声像/静音）：
```json
"mixer": { "gainDecibel": <从CC7静态或0>, "pan": <从CC10>, "mute": false, "solo": false, "display": true }
```

### 2.2 技法推断（可选，默认关闭）

> ⚠️ **MIDI 没有标准"技法"控制器**（Staccato/Tenuto/Accent/Slur 等是 IX 高层演奏指令）。
> 唯一可靠的数据源是**音符时值**（noteOff−noteOn 相对拍长）和**相邻间隙**。只能粗略推断
> **Staccato / Tenuto / Slur** 三种，其余（Accent/Tremolo/Trill/Harmonics 等）无法从 MIDI 推断。
> **默认关闭**（易误判），用 `--articulate` 开启。

**推断算法**：
```
durBeats = noteDur / beatBlick                 # 音符占几拍
gapToNext = nextOnset − noteOff                 # 与下一音符的间隙（拍）

if gapToNext <= slurGapThreshold (0.02):        # 紧接下一音
    → "Slur"                                     # 连音
elif durBeats <= staccatoThreshold (0.5):       # 不足半拍
    → "Staccato"                                 # 断奏
elif durBeats >= tenutoThreshold (0.95):        # 接近满拍
    → "Tenuto"                                   # 保持
else:
    → （无技法）
```

| 推断 | 条件 | 技法 |
|---|---|---|
| Slur | `gapToNext ≤ 0.02` 拍 | `Slur` |
| Staccato | `durBeats ≤ 0.5` | `Staccato` |
| Tenuto | `durBeats ≥ 0.95` | `Tenuto` |
| 正常 | 其余 | 空 |

- **每个音符只填一个技法**（Staccato/Slur 互斥、Slur/Tremolo 互斥，见 §5.1.1 互斥矩阵），避免冲突。
- 若启用但某音符不满足任何条件 → `articulations: []`。

---

## 3. 时间换算（tick → blick）

```
标准：1 tick = microsecondsPerBeat / ticksPerBeat 秒
      blick = tick × (tempo 换算)
```

- `ticksPerBeat`：MIDI 头 `header.timeDivision`（如 480）
- 逐事件累加 `deltaTime`；遇 `setTempo` 事件改 `microsecondsPerBeat` → bpm
- `SV.QUARTER = 705600000` blick（1 四分音符）

**BPM 来源：从 MIDI 映射**（`setTempo` 事件）：
```
bpm = 60000000 / microsecondsPerBeat        # 每分钟拍数
```
- 取 MIDI 第一个 `setTempo` 事件的 bpm，写进 `.ixp` 的 `time.tempo[0].bpm`。
- 若 MIDI 无 setTempo 事件 → 默认 120 bpm。
- 生成时,`onset`/`duration` 全部按该 bpm 计算（blick 与 bpm 绑定）。

换算步骤（保留可变 tempo 支持）：
```
tickSeconds = cumulativeDeltaTime_ticks × (microsecondsPerBeat / 1e6) / ticksPerBeat   # 秒
blick = tickSeconds × (SV.QUARTER / 拍秒)    # 拍秒 = 60/bpm
```
> 简单场景：`bpm` 恒定（取自第一个 setTempo），`time.tempo = [{position:0, bpm:<setTempo得到的bpm>}]`。
> 复杂（变速）：逐段用各 setTempo 的 bpm 换算，并在 `time.tempo` 写多个点（本版先支持恒定 bpm，
> 多个 setTempo 取第一个，变速留作增强）。

`time` 顶层：
```json
"time": { "meter":[{"index":0,"numerator":4,"denominator":4}], "tempo":[{"position":0,"bpm":<fromMIDI>}], "startTimeSeconds":0 }
```

---

## 4. 弯音（pitchBend）→ pitchDelta 自动化（✅ 实测可行）

> ⚠️ **pitchBend 是"随时间变化的音高弯曲曲线"，不是"整体移调（transpose）"**。
> - **transpose（整体移调）**：整轨/音符升降固定半音 → 改 `note.pitch`（本工具可不做或另有 `--transpose`）。
> - **pitchBend（弯音曲线）**：播放中音高连续变化（滑音/表演性弯音）→ **映射为 `parameters.pitchDelta.points` 自动化曲线**（随时间变化的点）。
> 二者不可混同：pitchBend 落到 pitchDelta 曲线，不是改 pitch。

| MIDI | → IX | 公式 | 状态 |
|---|---|---|---|
| `pitchBend` (-8192~+8191) | `parameters.pitchDelta.points` | `pitchDelta_cent = (pitchBend/8192) × semitones × 100` | ✅ 实测（安全 add/get）|

- **默认全量程**：`semitones = 2`（±2 半音，即 ±200 cent），可用 `--bend-semitones` 覆盖。
- **落点格式**：写 `parameters.pitchDelta.points`（扁平 `[x,y,x,y,...]`，x=blick, y=cent），mode=linear。
- **生成时机**：pitchBend 事件序列 → 在音符 onset~end 时间窗内采样 → 写该组 `pitchDelta`。

### 采样策略（避免 points 爆量）
pitchBend 是连续控制事件，不能全落点。用其中一种：
- **时间步长采样**：按固定间隔（如每 1/16 拍，`quarterBlick/4`）采样该时刻 pitchBend 值 → 落点。
- **仅值变化时落点**：遍历 pitchBend 事件，只在值变化（或变化超过阈值）时加一个点，相邻近似值去重。
- **首尾闭合**：第一点用音符起点值（默认 0），最后一点恢复到 0（或尾值），避免曲线悬空。

**换算**：`pitchDelta_cent = (pitchBend/8192) × semitones × 100`，`pitchBend` 用 14-bit 值（-8192~+8191）。

示例（`--bend-semitones 2` 满量程）：`pitchBend=8191 → +200 cent`（弯上 2 半音），`-8192 → -200 cent`。

验证记录（已实测）：
- `target.getAutomation('pitchDelta')` 存在，`interp=linear`，range [-1200,1200] cent。
- `add(x, cent)` 写入 + `get(x)` 回读**安全**（`get(0)=0, get(Q)=-100` 精确线性插值）。
- ⚠️ 勿用 `getPoints/getAllPoints/getLinear`、`remove(index)`（闪退）。

---

## 5. 乐器映射（programChange → database.name）

> **完整乐器清单来源**：`%APPDATA%\Dreamtonics\Instrument X\databases\meta\*.json`（每个已安装声库一个 meta json，
> 含 `name`/`instrumentCategory`/`pitchRangeMinNote`/`pitchRangeMaxNote`）。这是**权威的已装乐器列表**，
> 比 `server-translations`（仅翻译字符串）和 `.ixp` 工程（仅用到的）都全。

### 5.1 已安装全部乐器（15 个，实测）

| 乐器名 `database.name` | 类别 | 音域 (note) |
|---|---|---|
| Orchestral Piccolo 1 | Woodwinds | 74-106 |
| Orchestral Flute 1 | Woodwinds | 59-98 |
| Orchestral Oboe 1 | Woodwinds | 58-91 |
| Orchestral Clarinet 1 (A) | Woodwinds | 49-91 |
| Orchestral Bassoon 1 | Woodwinds | 34-77 |
| Jazz Alto Saxophone 1 | Saxophones | 49-85 |
| Jazz Tenor Saxophone 1 | Saxophones | 44-80 |
| Orchestral Trumpet 1 (Bb) | Brass | 51-89 |
| Orchestral French Horn 1 | Brass | 36-77 |
| Orchestral Trombone 1 | Brass | 34-77 |
| Orchestral Tuba 1 | Brass | 24-70 |
| Orchestral Violin 1 | Strings | 55-98 |
| Orchestral Viola 1 | Strings | 48-86 |
| Orchestral Cello 1 | Strings | 36-76 |
| Orchestral Contrabass 1 | Strings | 23-62 |

> 只安装这些（无 Piano/Bass/Guitar/Drums 声库）。MIDI 里其他 GM 音色号无对应 IX 声库。

### 5.2 GM program 区间 → IX 类别/乐器

| GM program 区间 | GM 类别 | → IX 类别 | 首选 IX 乐器 |
|---|---|---|---|
| 40~47 | Strings | Strings | Violin 1 / Viola 1 / Cello 1 / Contrabass 1 |
| 65~71 | Saxophones | Saxophones | Jazz Alto Saxophone 1 / Jazz Tenor Saxophone 1 |
| 56~59 | Brass（小号/圆号/长号/大号）| Brass | Trumpet 1 (Bb) / French Horn 1 / Trombone 1 / Tuba 1 |
| 72~79 | Reeds/Woodwinds | Woodwinds | Flute 1 / Clarinet 1 (A) / Oboe 1 / Bassoon 1 / Piccolo 1 |
| 其余 | Piano/Guitar/Bass/Drums 等 | **无对应声库** | 落默认声库 或 跳过 |

### 5.3 选乐器策略（可配置）
1. **按 GM program → 类别** 粗选（§5.2）。
2. **按音域精调**：在同类乐器里，用 `pitchRangeMinNote/MaxNote` 挑覆盖 MIDI 音符音域最匹配的（如高音区选 Piccolo/Flute，低音区选 Contrabass/Tuba）。
3. **用户手选覆盖**：命令行 `--instrument "Orchestral Flute 1"` 直接指定，绕过自动映射。

`mainRef`：
```json
"mainRef": {
  "database": { "name": "<IX声库名>", "backendType": "W", "version": "100" }
}
```

---

## 6. 不可映射 / 需丢弃

| MIDI | 处理 |
|---|---|
| `controller`（CC）| **已映射**：CC1→vibrato, CC7/11→loudness, CC10→pan（见 §2.1）；**其余 CC 丢弃**（CC64 sustain 无对应，丢弃）|
| `noteOff` 的 velocity（release）| 丢弃（只取 noteOn velocity）|
| SysEx / 大部分 meta 事件 | 忽略 |
| `pitchBend` 高精度 | 按步长采样近似 |

---

## 7. 生成 `.ixp` 顶层结构

```json
{
  "version": 201,
  "uuid": "<uuid>",
  "time": { "meter":[{"index":0,"numerator":4,"denominator":4}], "tempo":[{"position":0,"bpm":120}], "startTimeSeconds":0 },
  "library": [ /* 每轨一个音符组（含 notes + parameters + musicalScale） */ ],
  "tracks": [ /* 每轨一个 track（mainRef.database + groups[].groupID→library） */ ],
  "renderConfig": { "destination":"", "filename":"", "numChannels":2, "bitDepth":24, "sampleRate":48000, "exportMixDown": true, "exportPitch": false, "bypassPan": false, "bypassGain": false, "bypassEffects": false },
  "projectMixer": { "linkRoomSettings": true },
  "loopBegin": 0, "loopEnd": 0, "loopEnabled": false
}
```

**关键引用关系**：
- `tracks[i].groups[0].groupID = library[j].uuid`（组引用指向库组）。
- `tracks[i].mainGroup` = 空组（name="main"，不可加音符）。
- `library[j]` 的 `parameters` 含 9 个固定键（`pitchDelta,vibratoEnv,loudness,tension,breathiness,voicing,gender,toneShift,mouthOpening`），其中 `pitchDelta` 有 pitchBend 点，其余空。

---

## 8. 用户可配参数（命令行选项，均已定稿）

| 参数 | 默认 | 说明 |
|---|---|---|
| `--bpm` | 取自 MIDI tempo 或 120 | 生成 tempo + 时间基准 |
| `--bend-semitones` | 2 | pitchBend 全量程半音数（±2 半音 = ±200 cent）|
| `--instrument` / GM 映射 | 自动映射 | 指定乐器或走 GM→IX 表 |
| `--dynamic-curve` | **linear**（默认）| 力度映射：`linear` 用 `v/127`；传数值 γ 则用 `(v/127)^γ` 曲线 |

---

## 9. 运行流程（midi2ixp）

```
输入 .mid
  → midi-file parseMidi(data)          # {header, tracks}
  → 每 track 逐事件累计时间，提取 noteOn/noteOff/pitchBend/programChange
  → 组织音符(pitch,onset,dur,velocity) + pitchDelta点 + 乐器名
  → 生成 library[] / tracks[] JSON
  → 写 .ixp 文件（UTF-8 JSON）
```

依赖：`server/node_modules/midi-file`（`parseMidi`）。
