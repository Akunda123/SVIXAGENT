# AKDAgent 第三方组件与模型许可声明

本文件列出 AKDAgent 使用的**开源软件库**和**第三方模型**及其许可证、来源。
遵循各许可证的署名/再分发要求。**分发（打包/安装）本产品时必须随附本文件。**

> 说明：本项目所有自研代码（`server/src/*`、`electron/src/*`、`sv/*`、`docs/*` 等）由 AKDAgent 作者持有，
> 不适用本清单。本清单仅覆盖**第三方**依赖与模型。
> 生成日期：2026-09-07。

---

## 一、JavaScript 运行时依赖

### server（MCP server）依赖

| 包名 | 许可证 | 用途 | 来源仓库 |
|---|---|---|---|
| `@audio/beat` | MIT | 节拍/BPM 检测 | — |
| `@modelcontextprotocol/sdk` | MIT | MCP 协议 SDK | modelcontextprotocol/modelcontextprotocol |
| `midi-file` | MIT | MIDI 解析/生成 | — |
| `mpg123-decoder` | MIT | 音频解码 | — |
| `ndarray` | MIT | 数值数组 | scijs/ndarray |
| `ndarray-fft` | MIT | FFT | scijs/ndarray-fft |
| `onnxruntime-node` | MIT | ONNX 推理运行时 | microsoft/onnxruntime |
| `zod` | MIT | 参数校验 | colinhacks/zod |

> **MIT 许可证**：允许自由使用/修改/再分发（含商用），**需保留版权声明与许可文本**。各包 LICENSE 见其
> `node_modules/<pkg>/LICENSE`（多数已随包分发）。

### electron（桌面客户端）依赖

| 包名 | 许可证 | 用途 | 来源仓库 |
|---|---|---|---|
| `sherpa-onnx-node` | **Apache-2.0** | 语音识别引擎（Node 绑定）| csukuangfj/sherpa-onnx |
| `sherpa-onnx-win-x64` | **Apache-2.0** | 语音识别引擎（x64 二进制）| csukuangfj/sherpa-onnx |
| `ws` | MIT | WebSocket | websockets/ws |

> **Apache-2.0**：允许商用/再分发，**需**：
> 1. 保留版权与许可声明；
> 2. 若修改了上游 NOTICE 文件需注明修改；
> 3. 附带指向 Apache-2.0 全文的引用。
> **sherpa-onnx 还依赖若干第三方组件**（如 kaldi-native-fbank、onnxruntime 等），各有其独立许可，
> 见其上游仓库 LICENSE/NOTICE：<https://github.com/csukuangfj/sherpa-onnx>

---

## 二、第三方模型文件（独立于库，尤其重要）

模型文件**不是代码**，其许可由各自上游项目定义，**单独确认、单独标注**。

| 模型文件 | 用途 | 上游项目 | 来源 |
|---|---|---|---|
| `server/models/crepe/full.onnx` | 音高检测（降采样）| CREPE | [marl/crepe](https://github.com/marl/crepe) |
| `server/models/crepe/medium.onnx` | 音高检测 | CREPE | 同上 |
| `server/models/crepe/small.onnx` | 音高检测（快速）| CREPE | 同上 |
| `server/models/Kim_Vocal_2.onnx` | 人声/伴奏分离 | mel-roformer 系列 / MDX 生态 | [mel-roformer-kim-vocal-2](https://huggingface.co/mlx-community/mel-roformer-kim-vocal-2-mlx) |
| `server/models/UVR-MDX-NET-Inst_HQ_3.onnx` | 乐器优先分离 | MDX-Net / UVR | [UVR MDX-NET 模型](https://github.com/nomadkaraoke/python-audio-separator) |

> ⚠️ **模型许可重点提示**：
> - **CREPE**（marl/crepe）为 **MIT** 许可（论文 "CREPE: A Convolutional Representation for Pitch
>   Estimation"，Google 出品）。
> - **`Kim_Vocal_2`**：确认来源为 **mel-roformer-kim-vocal-2** 系列，其 HF 模型卡标注 **`license: MIT`** ✅
>   （商用安全）。
> - **`UVR-MDX-NET-Inst_HQ_3`**：属 UVR MDX-NET 模型家族，对应有 **`UVR_MDXNET_Main.LICENSE`** 许可文件，
>   但其**具体条款（MIT 或含非商用限制）需按该 LICENSE 正文最终确认**。⚠️ **商用分发前必须核对该 LICENSE**。
>   注：分发此模型所用的宿主工具 `python-audio-separator` 本身为 **MIT**（Copyright karaokenerds），
>   **但模型权重许可独立于工具**，以 `UVR_MDXNET_Main.LICENSE` / 模型原发布者为准。

---

## 三、分发合规要求（清单）

| 项 | 要求 | 状态 |
|---|---|---|
| MIT 库版权声明 | 保留各包 LICENSE（随 `node_modules` 或汇总 NOTICE）| 建议随发行提供 |
| Apache-2.0（sherpa-onnx）| 保留 NOTICE + 指向 Apache-2.0 全文 | ✅ 本文件已列 |
| **模型（CREPE/MDX）** | **逐模型确认许可**；商用留意非商用限制 | ⚠️ 需逐一核对 |
| 本 NOTICE | 随安装包/发行版随附 | ✅ 本文件 |

### 已随附的 LICENSE 文件（`licenses/` 目录）

以下各包的 LICENSE 正文已整理到项目 `licenses/` 目录（随发行提供）：

```
licenses/
├── beat.LICENSE            # @audio/beat (MIT)
├── ndarray.LICENSE         # ndarray (MIT)
├── ndarray-fft.LICENSE     # ndarray-fft (MIT)
├── sdk.LICENSE             # @modelcontextprotocol/sdk (MIT)
├── ws.LICENSE              # ws (MIT)
└── zod.LICENSE             # zod (MIT)
```

> **下述包为 MIT 但 node_modules 未随附独立 LICENSE 文件**（许可声明在各自 package.json `license` 字段）：
> `midi-file`、`mpg123-decoder`、`onnxruntime-node`（均 MIT，保留版权声明即可）。

---

## 四、建议后续动作

1. **逐模型确认许可**：核对 `Kim_Vocal_2.onnx`、`UVR-MDX-NET-Inst_HQ_3.onnx` 的原始发布许可
   （若含 `CC BY-NC` 等非商用条款，需在发行前处理）。
2. **补全各 MIT 库的 LICENSE 正文**：可将 `node_modules/<pkg>/LICENSE` 汇总到 `licenses/` 目录随发行
   （已尽量收集，见上）。
3. **Apache-2.0 全文**：若严格合规，附上 Apache-2.0 的完整文本并链接 sherpa-onnx 上游 NOTICE。
