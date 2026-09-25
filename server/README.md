# akdagent-mcp-server

DSH 与 Synthesizer V Studio 之间的 MCP server（stdio）。把 SV 桥脚本的能力封装成 MCP 工具，DSH 通过 `@deepseek-ai/dsh-mcp-client` 插件接入后，模型即可调用 `mcp__sv__*` 工具。

## 开发

```powershell
npm install
npm run build      # tsc -> dist/
npm run smoke      # SDK 客户端冒烟测试（校验工具列表）
```

## 注册到 DSH

在 `C:\Users\<USER>\.dsh\profiles\web\cordis.patch.yml` 追加：

```yaml
- insert:
    - id: mcp-akdagent
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: sv
        transport: stdio
        command: 'C:/Program Files/nodejs/node.exe'
        args: ['C:/Users/<USER>/Documents/SVAgent/server/dist/index.js']
        # 剪贴板工具秒级返回；sv_separate_vocals 本地 CPU 推理较慢（全曲可能数分钟）
        toolCallTimeoutMs: 900000
```

## 工具清单

| 工具 | 说明 |
|---|---|
| `sv_ping` | 检测 SV 桥是否在线 |
| `sv_get_selected_notes` | 读选中音符（音高/时值/歌词） |
| `sv_get_current_group` | 读当前音符组 |
| `sv_get_project_info` | 读工程信息 |
| `sv_transpose_selected_notes(semitones)` | 选中音符移调（-12=降八度） |
| `sv_set_selected_lyrics(lyrics)` | 选中音符统一设歌词 |
| `sv_playback(action, position?)` | 播放/暂停/停止/跳转 |
| `sv_separate_vocals(input, outDir?)` | 音频（wav/mp3）分离人声/伴奏（MDX-Net Kim_Vocal_2，本地离线，CPU 较慢） |

## 音频分离说明

`sv_separate_vocals` 使用 `src/audio/` 下的本地管线：

- `mdx-separate.mjs`：MDX-Net 推理（44.1k 立体声 WAV → vocal.wav / accompaniment.wav）。参数对齐 UVR（hop=1024、周期 hann、reflect 填充、时域 OLA 分片、前 3 bin 清零）。模型在 `server/models/Kim_Vocal_2.onnx`（63.7MB）。
- `prep-mp3.mjs`：MP3 等压缩格式 → mpg123 解码 + 线性重采样到 44.1k。
- `audio.ts`：`separateVocals()` 统一入口，自动探测输入格式。
  - **WAV 直读**（16/24/32-bit、48k 等任意采样率）：不走 mpg123——mpg123 对 24-bit WAV 解码会产出垃圾时长与数据（如 48k/24bit 240s 被解成 609s）。WAV 由 `readWavPcm()` 直读 + `prepareWav()` 重采样。
  - 非 WAV（mp3/flac/ogg/m4a…）走 mpg123；文件魔数无法识别时直接报错（拒绝损坏/伪装文件，避免白跑十几分钟）。

前置条件：Synthesizer V Studio 已打开，且已运行 `sv/SVAgentBridge.js`（见仓库根 README）。
