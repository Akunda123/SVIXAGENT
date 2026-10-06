# 识谱（OMR）测试夹具

## `dolce-screenshot-en-1440w.png`（264 927 B，1440×900）

**来源（可追溯）**

| 项 | 值 |
|---|---|
| 上游仓库 | `https://github.com/lodebar2026/dolce`（**悦谱 Dolce**） |
| 上游 commit | `912447d`（v0.8.1，2026-10-05） |
| 上游路径 | `docs/screenshot-en.png`（2 880×1 800，448 787 B，sha256 `3947d0a9c9df820c4c3c35fe9ac03db243ad452c43250d14cc958b20b90a0a07`） |
| 许可证 | **MIT**（与 `vendor/dolce-omr/LICENSE` 同一份上游许可；MIT 覆盖该仓内容） |
| 本仓夹具 sha256 | `a6df19d85683e15be60460da91489d08383d9802d408daf986900a03817e4646` |
| 我们对它做了什么 | **只做等比缩放**：`sharp(src).resize({ width: 1440, kernel: 'lanczos3' }).png({ compressionLevel: 9 })` |

图里是**公有领域**的赞美诗 *Holy, Holy, Holy*（词 Reginald Heber 1826 / 曲 John Bacchus Dykes 1861；
图片自身标注 *"This score is part of the Open Hymnal Project 2005 Revision"*），
外圈是 Dolce 自己的应用界面 —— 我们用整张图（不裁切），因为**裁到只剩谱面会掉到识别分辨率门槛之下**（见下）。

**⛔ 纪律**：本目录**只放"非版权谱"**。用户手里那几首正式曲目（一生之幸 / inyourblueeye 等）
**不许**拷进仓库当夹具。要换夹具 ⇒ 换一份**来源明确、许可允许**的图，并把上表连同 `sha256` 一起更新。

## 为什么是这个尺寸（实测，别再优化掉）

Dolce 的位图路有一个**硬分辨率门槛**：同一张图按宽度缩放后跑 `recognizeRasterSong`（vendor 912447d，Windows）：

| 缩放宽度 | 文件体积（字节） | 认出的音符 |
|---|---|---|
| 1300 | 236 416 | **0**（`stats.notes=0`，整张图都不认） |
| 1360 | 250 809 | 294 |
| 1440 | **264 927** | **311**（`bars=32` · `full=16` · `unknown=546` · `staves=8`） |
| 1600 | 311 770 | 219 |
| 2880（原图） | 448 787 | 281 |

⇒ 1300 与 1360 之间是**全有/全无**的断崖，取 1 440 是为了**离断崖有 80 px 余量**、同时体积 < 300 000 字节。
**别为了省体积把它再缩小**（缩到 1300 宽，守卫 ④ 会红）。放大已有小图**没有用**（上游实测 2×/3× 无改善）。

## 它**不是**真值（F1 闸门为什么默认不跑）

这个夹具**没有配套的真值 MIDI**：F1 = 我们的产物 vs 真值，没有真值就只能拿"自己识别的结果"自证（循环论证）；
手画/合成的五线谱又未必是 Dolce 认得的图形。所以：

- `tools/check-dolce-vendor.cjs` ④ 只断言 **"至少认出 1 个音符"**（冒烟判据，默认就跑）；
- `tools/omr-quality.cjs`（F1 闸门）是**显式开关** —— 必须 `--truth <真值.mid>` 才比，默认只解释怎么用；
- 要评价"识别质量好不好"，得由调用方喂一份**真值 MIDI**（用户提供的曲目 MIDI 即可，**别把谱子拷进来**）。

## 谁在用

- `tools/check-dolce-vendor.cjs`（④ 真跑一张谱子图；`AKD_SKIP_OMR=1` 时跳过）
- `tools/omr-quality.cjs`（只在显式给真值时用）
