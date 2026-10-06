# vendor/dolce-omr —— 第三方 OMR（悦谱 Dolce）· **MIT**

## 这是什么

[悦谱 Dolce](https://github.com/lodebar2026/dolce) 的**五线谱识别内核**（位图那一路）打成 Node ESM 产物，
放进 AKDAgent 是为了给"**丢一张谱子图片/扫描件进来，出 MusicXML**"提供本地、离线、可自动化的识别能力
（用户 2026-10-05 裁「用 dolce 识别」→「能出 xml 就下载源码接进来」）。

- 上游：`https://github.com/lodebar2026/dolce` · **commit `912447d`** · 版本 **0.8.1**（release v0.8.1，2026-10-05）
- 许可证：**MIT**（见同目录 `LICENSE`，`Copyright (c) 2026 lodebar2026`）
- 取法与构建（**别手改产物**，上游更新时照做）：

```bash
curl -L -H "Authorization: Bearer $(gh auth token)" \
  -o dolce.tar.gz https://api.github.com/repos/lodebar2026/dolce/tarball/main
tar -xzf dolce.tar.gz && cd lodebar2026-dolce-*
npm ci --no-audit --no-fund      # 119 包 / 约 24 s
npm run build:cli               # vite --ssr → dist-cli/*.js（target: node20）
# 需要拷的就在下面"内容"那三行
```

## 内容（= 跑通"图片 → MusicXML"所需的最小集）

| 文件 | 说明 |
|---|---|
| `dist-cli/index.js`（892 KB）+ 6 个同名 chunk | `npm run build:cli` 的产物；`src/cli/index.ts` 明确只汇**不碰 DOM**的模块（`vite.cli.config.ts`：`ssr: true`、`target: node20`） |
| `rasterglyphs.json`（1.4 MB） | 字形字典，**调用方自己读进来**交给 `new RasterGlyphLookup(dict)`（不是被打进 bundle 的） |
| `LICENSE` | 上游 MIT 原文 |

## 用法（已实测）

```js
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';                        // 纯 JS
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { recognizeRasterSong, RasterGlyphLookup } from './dist-cli/index.js';

// 图片 → 单页 PDF（1px = 1pt；PNG 直嵌就行，**不需要 sharp**，实测与 JPEG 路径同样出 21008 字节）
const doc = await PDFDocument.create();
const img = await doc.embedPng(pngBytes);                     // JPEG 用 embedJpg
const page = doc.addPage([img.width, img.height]);
page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

const pdf = await getDocument({ data: await doc.save(), useSystemFonts: true, isEvalSupported: false, useWorkerFetch: false }).promise;
const look = new RasterGlyphLookup(JSON.parse(await readFile('./rasterglyphs.json', 'utf8')));
const r = await recognizeRasterSong([{ pdf, OPS }], look, { title: '…' });
// r.xml = MusicXML 字符串；r.stats = { notes, bars, full, unknown, staves, systems, parts, … }
```

实测（620×309 缩略图）：**0.7 s** → 21 KB MusicXML，`score-partwise 3.0`、双谱表 G/F、C 大调、4/4、
134 音符（41 和弦）、`staves:4 / systems:2 / parts:1`。

## ⚠️ 已知边界（如实记，别当它能包打天下）

1. **质量取决于原图**。同一张缩略图：`stats.unknown = 39~40`、16 个小节里只有 `full = 9` 节时值能凑满 ——
   所以**必须把 `stats` 如实报给用户**（这是"识别覆盖率"的硬指标），别只回一句"导好了"。
2. **不跑 OCR**：本 vendor 集**不含** PaddleOCR 模型（`public/redist/ocr/*.onnx` 21 MB + 4.6 MB）⇒
   **歌词 / 和弦名 / 拍号数字读不出来**（拍号靠模板、其余留空）。要歌词就得再接 OCR（onnxruntime + 那两个模型），
   那是第二阶段的事。
3. **pdf.js 的输入是 PDF**：图片要先包成单页 PDF（上面那段）。上游的 `rasteromr/browser.ts::asRasterPdf` 干这事，
   但它碰 canvas ⇒ 不进 Node 链，我们自己在调用方包。
4. **只是"出 MusicXML"**：写进工程仍然走我们既有的 `sv_import_musicxml`（护栏/预览/指纹/权利确认都在那边）。

## 还没做的（接入清单，做一项勾一项）

- [ ] server 依赖加 `pdfjs-dist` + `pdf-lib`（**都不需要原生模块**；`sharp` 已实测**不需要**）
- [ ] `server/src/omr/dolce.ts` 驱动（图片 → MusicXML 文件）
- [ ] 新 MCP 工具（暂定名 `sv_omr_image`），带既有护栏：只认本地绝对路径 / 体积上限 / 把 `stats` 如实回报
- [ ] `licenses/dolce.LICENSE` + `THIRD-PARTY-NOTICES.md` 追加（**随包分发才需要**，别提前写进 1.1.0 的发布说明）
- [ ] 守卫：`tools/check-dolce-vendor.cjs`（三样文件在 + 来源记录在 + bundle 能 import 出 `recognizeRasterSong`）
- [ ] 打包：`dist/server-runtime*` 三平台重建（`tools/build-server-runtime.cjs`）
- [x] 版本：**并进 1.1.0**（用户 2026-10-06 裁 A）。1.1.0 从未发布过 ⇒ 识谱算它的一部分，**不开 1.2.0**；
      产品与 server 两处 `package.json` 保持 `1.1.0`，发布清单与 release-notes 文件名均不改。
