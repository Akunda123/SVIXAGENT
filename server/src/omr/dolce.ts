/**
 * **内置识谱（OMR）**：谱子图片 / 扫描件 → MusicXML 文件。
 *
 * 引擎 = vendored 的 [悦谱 Dolce](https://github.com/lodebar2026/dolce)（**MIT**，见 `vendor/dolce-omr/SOURCE.md`）
 * 的**位图五线谱识别**那一路。全链**本地离线**：不起浏览器、不要 canvas、不联网；本阶段也**不跑 OCR**
 * ⇒ 歌词 / 和弦名 / 拍号数字读不出来（拍号靠模板），这一条必须如实告诉用户。
 *
 * ⚠️ 产物质量取决于原图：`stats.unknown`（没归属的图形对象数）与 `stats.full`（时值能凑满的小节数）
 *    就是"识别覆盖率"的硬指标 —— 调用方（工具层）**必须把它们报出去**，别只说一句"导好了"。
 *
 * 为什么图片要先包成单页 PDF：上游的入口是 pdf.js 文档（`recognizeRasterSong(sources, …)`），
 * 它把 PDF 的 operator list 光栅化后自己的流水线吃位图。上游浏览器端用 canvas 包 PDF
 * （`rasteromr/browser.ts::asRasterPdf`），那条路碰 DOM ⇒ 我们在这边用 `pdf-lib` 纯 JS 包
 * （实测 **PNG 直嵌与 JPEG 都行**，两边产物同尺寸；所以**不需要 sharp** 这个原生依赖）。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * 剥掉 prolog 里的 `<!DOCTYPE …>` —— **只作用在我们自己生成的 MusicXML 上**。
 *
 * 为什么必须剥（2026-10-05 端到端真跑抓到的**链断**）：引擎（Dolce）写出的文件带
 * `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.0 Partwise//EN" …>`，
 * 而我们自己的 `parseMusicXML` 为防**外部实体注入 / 实体炸弹**，**一律拒含 `<!DOCTYPE>` 的文件**
 * ⇒ 「我们自己 OMR 出的谱子，我们自己的导入器读不了」。剥掉 prolog 那行即可（MusicXML 不需要 DTD）。
 *
 * ⚠️ 护栏**不因此放松**：第三方文件照旧被严查；本函数只处理我们自己刚生成的那份字符串。
 * 保守实现：只在**根元素之前**的区间里删（正文里出现同名字符串不动），支持 DOCTYPE 带内部子集 `[…]` 的写法。
 */
export function stripPrologDoctype(xml: string): string {
  const rootAt = xml.search(/<(?!!|\?|--)[A-Za-z_]/);   // 第一个真正的元素起点（跳过 `<?xml`/注释/`<!DOCTYPE`）
  if (rootAt < 0) return xml;
  const prolog = xml.slice(0, rootAt);
  if (!/<!DOCTYPE/i.test(prolog)) return xml;
  const cleaned = prolog.replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\]\s*)?>/i, '');
  return cleaned + xml.slice(rootAt);
}

/** 认得的位图后缀（与上游 `omr-cli.mjs` 的列表一致）。 */
export const OMR_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);

/** 单张图体积上限（超过基本不是"一页谱子"，而是误指了大文件）。 */
export const OMR_MAX_IMAGE_BYTES = 48 * 1024 * 1024;

/**
 * 找 vendored 引擎目录。两条布局都要认：
 *   ① 打包运行时：`<resources/server>/dolce-omr`（编译产物在 `<…>/server/dist/omr/`）
 *   ② 开发树：`<repo>/vendor/dolce-omr`
 */
export function dolceEngineDir(): string | null {
  const cands = [
    path.resolve(HERE, '..', '..', 'dolce-omr'),
    path.resolve(HERE, '..', '..', '..', 'vendor', 'dolce-omr'),
  ];
  for (const c of cands) if (fs.existsSync(path.join(c, 'dist-cli', 'index.js'))) return c;
  return null;
}

export interface OmrImageResult {
  /** MusicXML 文本；`null` = 这一页没认出谱表（不是异常）。 */
  xml: string | null;
  /** 落盘的 `.musicxml` 路径；`xml` 为 null 时也是 null。 */
  outPath: string | null;
  /** 覆盖率硬指标（上游口径）：`notes` 音符数 · `bars` 小节数 · `full` 时值凑满的小节数 ·
   *  `unknown` 没归属的图形对象数 · `staves` 谱行数 · `systems` 系统数 · `parts` 声部数。 */
  stats: Record<string, unknown>;
  /** 引擎版本信息（供回报）。 */
  engine: { dir: string; version: string };
  ms: number;
}

/** 认一页（或多页 PDF）谱子图，写成 MusicXML。`outPath` 省略 = `<input>.musicxml`（已存在则加序号）。 */
export async function imageToMusicXml(opts: {
  input: string;
  outPath?: string;
  title?: string;
}): Promise<OmrImageResult> {
  const input = path.resolve(opts.input);
  const t0 = Date.now();
  /* 护栏①：**只收绝对本地路径**（与 `sv_import_musicxml` 同一条纪律）——
   * 相对路径 / URL 一律拒，免得"预览的那份"和"写进工程的那份"不是同一个文件。 */
  if (!path.isAbsolute(String(opts.input || ''))) {
    throw new Error('只收**绝对**本地路径（相对路径与 URL 会被拒）：' + String(opts.input || ''));
  }

  const dir = dolceEngineDir();
  if (!dir) {
    throw new Error(
      '找不到内置识谱引擎（vendor/dolce-omr）—— 开发树请确认仓库里有它；打包版请确认 resources/server/dolce-omr 在'
    );
  }
  const st = await fsp.stat(input).catch(() => null);
  if (!st || !st.isFile()) throw new Error('读不到这个文件：' + input);
  if (st.size > OMR_MAX_IMAGE_BYTES) {
    throw new Error(`图片太大（${(st.size / 1048576).toFixed(1)} MB > ${OMR_MAX_IMAGE_BYTES / 1048576} MB）`);
  }

  /* 认格式：**先看后缀，后缀不认再嗅魔数**。
   * 为什么要嗅：用户手里真会出现**没有后缀**的图（实测：DSH 附件落盘就是 `…/objects/3e/3e6069…` 这样一串），
   * 只看后缀会把一张好 PNG 拒掉。嗅探只认两种（我们的解析器也只支持这两种）：PNG `89 50 4E 47`、JPEG `FF D8 FF`。 */
  const head = (await fsp.readFile(input)).subarray(0, 4);
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const ext = path.extname(input).toLowerCase();
  const kind: 'png' | 'jpeg' | null = isPng ? 'png' : isJpeg ? 'jpeg'
    : ext === '.png' ? 'png' : (ext === '.jpg' || ext === '.jpeg') ? 'jpeg' : null;
  if (!kind) {
    throw new Error(
      '只认 PNG / JPEG 位图（其余格式与空文件会被拒）：' + input
      + '（后缀 ' + (ext || '无') + '、文件头 ' + [...head].map((b) => b.toString(16).padStart(2, '0')).join(' ') + '）'
    );
  }

  // 动态 import：引擎不是我们的 TS 模块（vendored 产物），pdfjs / pdf-lib 也只在用到时才加载
  // （server 的启动路径上多两个大包会拖慢开会话那一秒）。
  const [{ PDFDocument }, pdfjs, engine] = await Promise.all([
    import('pdf-lib') as Promise<any>,
    import('pdfjs-dist/legacy/build/pdf.mjs' as string) as Promise<any>,
    import(pathToFileURL(path.join(dir, 'dist-cli', 'index.js')).href) as Promise<any>,
  ]);
  const { recognizeRasterSong, RasterGlyphLookup } = engine;
  if (typeof recognizeRasterSong !== 'function' || typeof RasterGlyphLookup !== 'function') {
    throw new Error('内置识谱引擎导出不对（recognizeRasterSong / RasterGlyphLookup 缺失）—— vendor 目录可能被换过');
  }

  // ① 图片 → 单页 PDF（1px = 1pt，整页铺满）。
  const bytes = await fsp.readFile(input);
  const doc = await PDFDocument.create();
  const img: any = kind === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const page = doc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const pdfBytes = await doc.save();

  // ② pdf.js 打开（Node 里不用 worker）
  const pdf = await pdfjs
    .getDocument({ data: pdfBytes, useSystemFonts: true, isEvalSupported: false, useWorkerFetch: false })
    .promise;
  try {
    // ③ 字形字典（vendored 的 1.4 MB 表，调用方自己读进来）
    const dict = JSON.parse(await fsp.readFile(path.join(dir, 'rasterglyphs.json'), 'utf8'));
    const look = new RasterGlyphLookup(dict);
    const r = await recognizeRasterSong([{ pdf, OPS: pdfjs.OPS }], look, {
      title: opts.title || path.basename(input).replace(/\.[^.]+$/, ''),
    });
    const meta = JSON.parse(await fsp.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}'));

    let outPath: string | null = null;
    if (r.xml) {
      /* ⚠️⚠️ 2026-10-05 真跑抓到的**链断**：引擎写出的 MusicXML 带 prolog `<!DOCTYPE score-partwise PUBLIC …>`，
       *   而我们自己的 `parseMusicXML` 为了防**外部实体注入 / 实体炸弹**，**一律拒含 `<!DOCTYPE>` 的文件**
       *   ⇒ **我们自己 OMR 出的谱子，我们自己的导入器读不了**。
       *   ⇒ 在我们这一侧剥掉 prolog 里那行 DOCTYPE（**只动我们自己生成的**；第三方文件照旧严查，护栏不松）。 */
      const xml = stripPrologDoctype(r.xml);
      const defOut = path.join(path.dirname(input), path.basename(input, path.extname(input)) + '.musicxml');
      outPath = opts.outPath ? path.resolve(opts.outPath) : await uniquePath(defOut);
      await fsp.writeFile(outPath, xml, 'utf8');
    }
    return {
      xml: r.xml || null,
      outPath,
      stats: r.stats || {},
      engine: { dir, version: String(meta.dolceVersion || '0.8.1') },
      ms: Date.now() - t0,
    };
  } finally {
    try { await pdf.destroy?.(); } catch { /* 忽略 */ }
  }
}

/** `x.musicxml` 已存在 ⇒ `x-2.musicxml`、`x-3.musicxml`…（**绝不覆盖**用户已有产物）。 */
async function uniquePath(p: string): Promise<string> {
  const dir = path.dirname(p);
  const base = path.basename(p).replace(/\.musicxml$/i, '');
  for (let i = 1; i < 1000; i++) {
    const cand = path.join(dir, i === 1 ? base + '.musicxml' : `${base}-${i}.musicxml`);
    if (!fs.existsSync(cand)) return cand;
  }
  return path.join(dir, `${base}-${Date.now()}.musicxml`);
}

/* ============================ 简谱那一路 ============================ */

/** 简谱 OMR 能吐的格式（上游 `OMR_EMITTERS`；**默认 `123`** —— Dolce 的简谱主格式）。 */
export const JIANPU_FORMATS = ['123', 'jpwabc', 'abc', 'tomato', 'shige', 'jly', 'jcx'] as const;
export type JianpuFormat = (typeof JIANPU_FORMATS)[number];

export interface JianpuResult {
  /** 识别出的简谱文本（`null` = 没认出）。 */
  text: string | null;
  /** 落盘路径（默认 `<input>.123`；`text` 为 null 时也是 null）。 */
  outPath: string | null;
  format: JianpuFormat;
  /** 用了哪个解码器 —— **这个值会写进回报**，因为它影响精度（见下）。 */
  decoder: 'js' | 'sharp';
  stats: Record<string, unknown>;
  engine: { dir: string; version: string };
  ms: number;
}

/**
 * 简谱图 → 简谱文本（123 / 诗歌本 / ABC / jpwabc…）。
 *
 * ⚠️ **解码器不是无关紧要的实现细节**（上游 `omr/decode.node.ts` 的原话）：它那些尺寸判据
 *   是在**浏览器解码出的像素**上标定的；实测附点块「浏览器与 sharp 都出 9×13（判附点）、
 *   纯 JS `jpeg-js` 出 9×14（落选 ⇒ **附点消失**）」。所以：
 *     · `decoder:'sharp'`（默认）= 上游给的正路，与浏览器逐像素一致；
 *     · `decoder:'js'`    = 零原生依赖（pngjs + jpeg-js），但**换了一套精度基线**，细节可能丢。
 *   ⇒ 选哪个由调用方决定，**但必须如实回报**（`decoder` 字段），别让结果看起来一样。
 */
export async function jianpuToText(opts: {
  input: string;
  outPath?: string;
  format?: JianpuFormat;
  decoder?: 'js' | 'sharp';
}): Promise<JianpuResult> {
  const t0 = Date.now();
  if (!path.isAbsolute(String(opts.input || ''))) {
    throw new Error('只收**绝对**本地路径（相对路径与 URL 会被拒）：' + String(opts.input || ''));
  }
  const input = path.resolve(opts.input);
  const dir = dolceEngineDir();
  if (!dir) throw new Error('找不到内置识谱引擎（vendor/dolce-omr）—— 见 vendor/dolce-omr/SOURCE.md');
  const st = await fsp.stat(input).catch(() => null);
  if (!st || !st.isFile()) throw new Error('读不到这个文件：' + input);

  const format = (opts.format || '123') as JianpuFormat;
  if (!JIANPU_FORMATS.includes(format)) {
    throw new Error('不认的简谱格式：' + format + '（可用：' + JIANPU_FORMATS.join(' / ') + '）');
  }
  const wantDecoder = opts.decoder === 'js' ? 'js' : 'sharp';

  // ① 模型目录：上游按 env `OMR_MODELS` → 产物旁 `models/` → 仓库 dev 路径 找（见 omr/runtime.node.ts）
  const models = path.join(dir, 'models');
  if (fs.existsSync(models)) process.env.OMR_MODELS = models;

  // ② 引擎（简谱那路是另一个入口：`dist-cli/omr.js`；五线谱那路是 `index.js`）
  const engine: any = await import(pathToFileURL(path.join(dir, 'dist-cli', 'omr.js')).href);
  if (typeof engine.recognizeImage !== 'function') {
    throw new Error('简谱引擎导出不对（recognizeImage 缺失）—— dist-cli/omr.js 可能被换过');
  }

  // ③ 装配解码器：**在 import 之后设**（bundle 载入时已用 sharp 装过一次；后设的覆盖前者）
  if (wantDecoder === 'js') {
    if (typeof engine.setImageDecoder !== 'function') {
      throw new Error('引擎没有 setImageDecoder ⇒ 无法注入纯 JS 解码器（请改用 decoder:"sharp"）');
    }
    const [{ PNG }, jpeg] = await Promise.all([
      import('pngjs' as string) as Promise<any>,
      import('jpeg-js' as string) as Promise<any>,
    ]);
    const jsDecode = async (bytes: Uint8Array, mime?: string) => {
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        || (mime || '').includes('png');
      if (isPng) {
        const png = PNG.sync.read(Buffer.from(bytes));
        return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
      }
      const raw = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true });
      return { data: new Uint8ClampedArray(raw.data), width: raw.width, height: raw.height };
    };
    engine.setImageDecoder(jsDecode);
  }

  const bytes = new Uint8Array(await fsp.readFile(input));
  const mime = path.extname(input).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const r = await engine.recognizeImage(bytes, { mime, format });
  const text = (r && r.text) || null;
  const meta = JSON.parse(await fsp.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}'));

  let outPath: string | null = null;
  if (text) {
    const ext = format === 'jpwabc' ? '.jpwabc' : format === '123' ? '.123' : '.' + format;
    const defOut = path.join(path.dirname(input), path.basename(input, path.extname(input)) + ext);
    outPath = opts.outPath ? path.resolve(opts.outPath) : defOut;
    // 简谱文本格式里只有 `.jpwabc` 要 UTF-16LE+BOM（上游 omr-cli.mjs 的口径），其余 UTF-8
    if (format === 'jpwabc') await fsp.writeFile(outPath, '\ufeff' + text, 'utf16le');
    else await fsp.writeFile(outPath, text, 'utf8');
  }
  return {
    text,
    outPath,
    format,
    decoder: wantDecoder,
    stats: (r && r.stats) || {},
    engine: { dir, version: String(meta.dolceVersion || '0.8.1') },
    ms: Date.now() - t0,
  };
}
