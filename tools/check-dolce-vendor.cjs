#!/usr/bin/env node
// ============================================================================
// check-dolce-vendor.cjs —— 内置识谱（vendored 悦谱 Dolce）守卫：**文件在 ≠ 能跑**
// ============================================================================
// 为什么存在：`vendor/dolce-omr` 是**第三方产物**（悦谱 Dolce，MIT，commit 912447d / v0.8.1），
//   我们只往里拷文件、不编译它 ⇒ 它坏掉的方式**全都是静默的**：
//     · 少拷一个文件（`dist-cli/index.js` 静态引 6 个同名 chunk、`rasterglyphs.json` 是**调用方
//       自己读**的 1.4 MB 字形表、`models/*.onnx` 是简谱那一路要用的）⇒ 用户点"识谱"才发现；
//     · 换了 vendor 目录却没同步 `SOURCE.md` ⇒ 来源记录与实际产物**对不上**，将来没人知道这是哪版；
//     · Node 解析不了 bundle（产物是 ESM、靠同目录 `package.json` 的 `type: module`）；或者
//       **打包 runtime 里缺 `pdf-lib` / `pdfjs-dist`**（runtime 的依赖是**裁剪过**的）⇒ 开发树绿、包里炸。
//   ⇒ 判据分五段（前四段每段都必须**真做**，光看文件在不在证明不了任何事）：
//       ① 关键文件齐（开发树 vendor/ + 每份存在的打包 runtime/）
//       ② 来源可追溯（`SOURCE.md` 记的 commit/version 与 `package.json` 的 `dolceCommit`/`dolceVersion` **一致**）
//       ③ bundle **真能 import**（`recognizeRasterSong` / `RasterGlyphLookup` / `scoreToMusicXml`，
//          以及简谱入口 `omr.js` 的 `recognizeImage` —— `server/src/omr/dolce.ts` 就靠它们）
//       ④ **用打包布局真跑一张谱子图**（优先 `dist/server-runtime*/dolce-omr`，退回 `vendor/dolce-omr`），
//          断言"至少认出 1 个音符" + 产物里没有 `<!DOCTYPE`（引擎写的那行 prolog DTD 我们自己的导入器会拒）
//       ⑤ 质量闸门（F1）—— **需要真值 MIDI，默认不跑**（合成夹具没有真值；用户那几首版权谱不许当夹具）。
//          见 `tools/omr-quality.cjs`（可显式 `--truth <真值.mid>` 打开）。
//
// 夹具：`server/tests/fixtures/omr/`（**上游 MIT 仓库的截图**缩放而来，不用任何版权谱；
//   来源与许可见该目录 `README.md`）。
// 跳过真跑：`AKD_SKIP_OMR=1` ⇒ 只做 ①②③（**会明确打印"已跳过真跑"**），给"只想快查文件齐不齐"的场合。
// 用法：node tools/check-dolce-vendor.cjs [--truth <真值.mid>] [--min-f1 80]
// 退出码：0 = 全过；1 = 有 FAIL。
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'dolce-omr');
const FIXTURE = path.join(ROOT, 'server', 'tests', 'fixtures', 'omr', 'dolce-screenshot-en-1440w.png');
const SKIP_OMR = process.env.AKD_SKIP_OMR === '1';

const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(name); return i >= 0 ? String(argv[i + 1] || '') : ''; };
const TRUTH = argOf('--truth') || process.env.AKD_OMR_TRUTH || '';
const MIN_F1 = argOf('--min-f1') || process.env.AKD_OMR_MIN_F1 || '';

const T0 = Date.now();
let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);
const info = (m) => console.log('  [i]    ' + m);
const warn = (m) => console.log('  [warn] ' + m);

/** 仓库相对路径（打印用；**绝不**在输出/代码里写死项目外的绝对路径） */
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
/** 比较路径用（大小写/分隔符归一） */
const key = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();

/* ------------------------------------------------------------------ 布局发现 */
/** 必需文件：少任何一个都说明拷漏了（`index.js` 静态引 6 个同名 chunk；字形表是调用方自己读的） */
const REQUIRED = [
  'dist-cli/index.js', 'dist-cli/omr.js', 'rasterglyphs.json',
  'SOURCE.md', 'package.json', 'LICENSE',
];

function inspectLayout(dir) {
  const missing = REQUIRED.filter((r) => !fs.existsSync(path.join(dir, r)));
  const models = path.join(dir, 'models');
  const onnx = fs.existsSync(models)
    ? fs.readdirSync(models).filter((f) => f.toLowerCase().endsWith('.onnx'))
    : [];
  // onnx 只要**看着像真货**就行（< 100 KB 基本是 LFS 指针 / 截断）
  const skinny = onnx.filter((f) => fs.statSync(path.join(models, f)).size < 100 * 1024);
  return { missing, onnx, skinny };
}

/** 打包运行时：`dist/server-runtime`（本平台）+ `dist/server-runtime-*`（跨平台预装），本平台优先 */
function listRuntimes() {
  const distDir = path.join(ROOT, 'dist');
  if (!fs.existsSync(distDir)) return [];
  const out = [];
  for (const e of fs.readdirSync(distDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name !== 'server-runtime' && !/^server-runtime-/.test(e.name)) continue;
    const root = path.join(distDir, e.name);
    out.push({ name: e.name, root, engine: path.join(root, 'dolce-omr') });
  }
  out.sort((a, b) => (a.name === 'server-runtime' ? -1 : b.name === 'server-runtime' ? 1 : a.name.localeCompare(b.name)));
  return out;
}

const runtimes = listRuntimes();

/* ------------------------------------------------------------------ ① 关键文件 */
console.log('== ① 关键文件齐（开发树 vendor/ + 每份存在的打包 runtime/）==');
const layouts = [];
{
  if (!fs.existsSync(VENDOR)) {
    fail(`找不到 ${rel(VENDOR)} —— 开发树的识谱引擎整个不在`);
  } else {
    layouts.push({ label: rel(VENDOR) + '（开发树）', dir: VENDOR, runtime: null, ...inspectLayout(VENDOR) });
  }
  for (const rt of runtimes) {
    if (!fs.existsSync(path.join(rt.engine, 'dist-cli', 'index.js'))) {
      fail(`${rel(rt.engine)} 不在（${rt.name} 存在但没有 dolce-omr）⇒ 重跑 node tools/build-server-runtime.cjs`);
      continue;
    }
    layouts.push({ label: rel(rt.engine) + '（打包）', dir: rt.engine, runtime: rt, ...inspectLayout(rt.engine) });
  }
  if (!runtimes.length) info('没有 dist/server-runtime*（还没出包/还没建 runtime）⇒ 只查开发树');
}
for (const L of layouts) {
  if (L.missing.length) fail(`${L.label} 缺 ${L.missing.length} 个必需文件：${L.missing.join(' · ')}`);
  else if (!L.onnx.length) fail(`${L.label} 的 models/ 里没有 .onnx（简谱那一路 PP-OCR 会静默失效）`);
  else if (L.skinny.length) fail(`${L.label} 的 onnx 体积可疑（< 100 KB，像是 LFS 指针/截断）：${L.skinny.join(' · ')}`);
  else ok(`${L.label}：${REQUIRED.length}/${REQUIRED.length} 必需文件 + models/ ${L.onnx.length} 个 onnx`);
}
if (!layouts.length) fail('一个可检布局都没有 —— 上面的失败已说明原因');

/* ------------------------------------------------------------------ ② 来源 */
console.log('\n== ② 来源可追溯（SOURCE.md 记的 commit/version ↔ package.json 的 dolceCommit/dolceVersion）==');
{
  const soPath = path.join(VENDOR, 'SOURCE.md');
  const pjPath = path.join(VENDOR, 'package.json');
  const licPath = path.join(VENDOR, 'LICENSE');
  let so = '', pj = null;
  try { so = fs.readFileSync(soPath, 'utf8'); } catch { fail('读不到 ' + rel(soPath)); }
  try { pj = JSON.parse(fs.readFileSync(pjPath, 'utf8')); } catch { fail('读不到/解析不了 ' + rel(pjPath)); }
  const lic = (() => { try { return fs.readFileSync(licPath, 'utf8'); } catch { return ''; } })();

  if (so && pj) {
    const srcCommit = (so.match(/commit\s*[`*]*\s*([0-9a-f]{7,40})/i) || [])[1] || '';
    const srcVersion = (so.match(/版本\s*[`*]*\s*([0-9]+\.[0-9]+\.[0-9]+)/) || [])[1] || '';
    const pjCommit = String(pj.dolceCommit || '');
    const pjVersion = String(pj.dolceVersion || '');
    if (!srcCommit) fail('SOURCE.md 里抠不出 commit（`commit \\`xxxxxxx\\``）—— 来源记录不完整');
    if (!srcVersion) fail('SOURCE.md 里抠不出版本号（`版本 **x.y.z**`）—— 来源记录不完整');
    if (!pjCommit || !pjVersion) fail('package.json 缺 dolceCommit / dolceVersion（vendor 侧的机器可读来源）');

    if (srcCommit && pjCommit && srcCommit.toLowerCase() !== pjCommit.toLowerCase()) {
      fail(`来源**对不上**：SOURCE.md 的 commit \`${srcCommit}\` ≠ package.json 的 dolceCommit \`${pjCommit}\``);
    } else if (srcCommit && pjCommit) {
      ok(`commit 一致：SOURCE.md \`${srcCommit}\` = package.json \`${pjCommit}\``);
    }
    if (srcVersion && pjVersion && srcVersion !== pjVersion) {
      fail(`来源**对不上**：SOURCE.md 的版本 \`${srcVersion}\` ≠ package.json 的 dolceVersion \`${pjVersion}\``);
    } else if (srcVersion && pjVersion) {
      ok(`版本一致：SOURCE.md \`${srcVersion}\` = package.json \`${pjVersion}\``);
    }

    // 仓库地址三方对得上（SOURCE.md 里那份是给人看的、package.json 里那份是给机器看的）
    const repo = String(pj.dolceRepo || '');
    if (!repo) info('package.json 没有 dolceRepo（不影响功能，但来源链少一环）');
    else if (!so.includes(repo)) fail(`SOURCE.md 里没有 package.json 的 dolceRepo（${repo}）—— 来源链断了`);
    else ok(`仓库地址一致：${repo}`);

    // LICENSE：MIT + 权利人（换错许可文件是最容易发生的"静默错误"）
    const owner = (repo.match(/github\.com\/([^/]+)\//) || [])[1] || '';
    if (!/MIT License/i.test(lic)) fail('LICENSE 里没有 "MIT License" —— 许可文件可能被换错了');
    else if (owner && !lic.includes(owner)) fail(`LICENSE 里没有权利人 ${owner}（换错许可文件了？）`);
    else ok(`LICENSE = MIT${owner ? '（权利人 ' + owner + '）' : ''}`);
  }
}

/* ------------------------------------------------------------------ ③ import */
console.log('\n== ③ bundle 真能 import（Node 解析 + 导出齐全）==');
/** 每个布局要拿到的导出：五线谱入口 index.js 三个 + 简谱入口 omr.js 一个（dolce.ts 就靠这几个） */
const WANT = [
  ['dist-cli/index.js', ['recognizeRasterSong', 'RasterGlyphLookup', 'scoreToMusicXml']],
  ['dist-cli/omr.js', ['recognizeImage']],
];

async function importChecks() {
  for (const L of layouts) {
    if (L.missing.length) { info(`${L.label}：① 已红（文件缺）⇒ 跳过 import`); continue; }
    for (const [file, names] of WANT) {
      const p = path.join(L.dir, file);
      let mod;
      try {
        mod = await import(pathToFileURL(p).href);
      } catch (e) {
        fail(`${L.label} 的 ${file} **import 失败**：${String(e && e.message).slice(0, 200)}`);
        continue;
      }
      const gone = names.filter((n) => typeof mod[n] !== 'function');
      if (gone.length) fail(`${L.label} 的 ${file} 少了导出：${gone.join(' · ')}（vendor 目录可能被换过/拷漏）`);
      else ok(`${L.label} ${file} ⇒ ${names.join(' / ')} ✓`);
    }
  }
}

/* ------------------------------------------------------------------ ④ 真跑 */
function findRunTarget() {
  const rtOk = runtimes.find((r) => fs.existsSync(path.join(r.engine, 'dist-cli', 'index.js')));
  if (rtOk) {
    const driver = path.join(rtOk.root, 'dist', 'omr', 'dolce.js');
    if (fs.existsSync(driver)) {
      return { route: '打包 runtime 的编译驱动（生产件）', driver, engineDir: rtOk.engine, reqBase: path.join(rtOk.root, 'package.json'), label: rtOk.name };
    }
    return { route: '内联等价路径（打包布局优先）', driver: null, engineDir: rtOk.engine, reqBase: path.join(rtOk.root, 'package.json'), label: rtOk.name };
  }
  const devDriver = path.join(ROOT, 'server', 'dist', 'omr', 'dolce.js');
  if (fs.existsSync(devDriver)) {
    return { route: '开发树编译驱动', driver: devDriver, engineDir: VENDOR, reqBase: path.join(ROOT, 'server', 'package.json'), label: 'server/dist' };
  }
  return { route: '内联等价路径（开发树 vendor/）', driver: null, engineDir: VENDOR, reqBase: path.join(ROOT, 'server', 'package.json'), label: 'vendor' };
}

/** 打包侧依赖必须从**被检布局那侧**解析：runtime 的 `node_modules` 是裁剪过的（pdfjs 33 MB → 19 MB） */
async function loadDeps(reqBase) {
  const req = createRequire(reqBase);
  const libUrl = pathToFileURL(req.resolve('pdf-lib')).href;
  const pdfUrl = pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
  const lib = await import(libUrl);
  const pdfjs = await import(pdfUrl);
  const PDFDocument = lib.PDFDocument || (lib.default && lib.default.PDFDocument);
  if (typeof PDFDocument !== 'function') throw new Error('pdf-lib 里拿不到 PDFDocument');
  return { PDFDocument, pdfjs };
}

/** 内联等价路径：逐字镜像 `server/src/omr/dolce.ts` 的三步（图片 → 单页 PDF → pdf.js → 引擎） */
async function runInline(target, image, outPath) {
  const fsp = fs.promises;
  const { PDFDocument, pdfjs } = await loadDeps(target.reqBase);
  const engine = await import(pathToFileURL(path.join(target.engineDir, 'dist-cli', 'index.js')).href);

  const bytes = await fsp.readFile(image);
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(bytes);
  const page = doc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const pdf = await pdfjs.getDocument({
    data: await doc.save(), useSystemFonts: true, isEvalSupported: false, useWorkerFetch: false,
  }).promise;
  try {
    const dict = JSON.parse(await fsp.readFile(path.join(target.engineDir, 'rasterglyphs.json'), 'utf8'));
    const look = new engine.RasterGlyphLookup(dict);
    const r = await engine.recognizeRasterSong([{ pdf, OPS: pdfjs.OPS }], look, {
      title: path.basename(image).replace(/\.[^.]+$/, ''),
    });
    // ⚠️ 内联路线**没有**走 dolce.ts 的 `stripPrologDoctype` ⇒ 这里如实落盘引擎原始输出
    //    （下面 ④ 的 DOCTYPE 断言因此只对"编译驱动"路线生效）
    if (r.xml) await fsp.writeFile(outPath, r.xml, 'utf8');
    return { xml: r.xml || null, stats: r.stats || {}, engineDir: target.engineDir };
  } finally {
    try { await pdf.destroy(); } catch { /* 忽略 */ }
  }
}

async function realRun() {
  console.log('\n== ④ 真跑一张谱子图（Node 侧，不起 Electron）==');
  if (!fs.existsSync(FIXTURE)) {
    fail(`夹具不在：${rel(FIXTURE)}（来源与许可见同目录 README.md）—— 没有它就证不了"真能跑"`);
    return null;
  }
  const buf = fs.readFileSync(FIXTURE);
  info(`夹具 ${rel(FIXTURE)} · ${(buf.length / 1024).toFixed(0)} KB · sha256 ${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}…`);

  const target = findRunTarget();
  info(`路线：${target.route} · 引擎 ${rel(target.engineDir)}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-omr-guard-'));
  const outPath = path.join(tmpDir, 'guard-run.musicxml');
  const t0 = Date.now();
  let res;
  try {
    if (target.driver) {
      const mod = await import(pathToFileURL(target.driver).href);
      if (typeof mod.imageToMusicXml !== 'function') throw new Error(`${rel(target.driver)} 里没有 imageToMusicXml`);
      if (typeof mod.dolceEngineDir === 'function') {
        const got = mod.dolceEngineDir();
        if (!got || key(got) !== key(target.engineDir)) {
          warn(`驱动的 dolceEngineDir() = ${got ? rel(got) : '（null）'}，与预期 ${rel(target.engineDir)} 不一致`);
        }
      }
      const r = await mod.imageToMusicXml({ input: FIXTURE, outPath, title: 'dolce-vendor-guard' });
      res = { xml: r.xml, stats: r.stats || {}, engineDir: r.engine && r.engine.dir, version: r.engine && r.engine.version };
    } else {
      res = await runInline(target, FIXTURE, outPath);
      res.version = '';
    }
  } catch (e) {
    fail(`真跑失败（${target.route}）：${String(e && e.message).slice(0, 300)}`);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
    return null;
  }
  const ms = Date.now() - t0;

  const notes = Number(res.stats && res.stats.notes);
  const has = Number.isFinite(notes) && notes >= 1;
  const line = `认出的音符 ${Number.isFinite(notes) ? notes : '?'} · 小节 ${res.stats.bars} · 时值凑满 ${res.stats.full} · `
    + `没归属图形 ${res.stats.unknown} · 谱行 ${res.stats.staves} · 用了 ${ms} ms`;
  if (!has) fail(`真跑**一个音符都没认出来**（stats.notes = ${notes}）—— 引擎/依赖/夹具哪一环坏了：${line}`);
  else if (notes < 50) warn(`认出的音符偏少（${notes}）—— 夹具或引擎可能被换过：${line}`);
  else ok(line);
  if (res.version && res.version !== '0.8.1') info(`引擎自报版本 ${res.version}（当前 vendor 是 0.8.1，跟上就对了）`);

  // 产物断言：有 MusicXML、且**没有** prolog 的 `<!DOCTYPE`（引擎会写，我们自己的导入器一律拒含 DTD 的文件）
  if (!res.xml || !/<score-partwise/.test(res.xml)) {
    fail('引擎没吐出 MusicXML（没有 <score-partwise>）');
  } else {
    const written = (() => { try { return fs.readFileSync(outPath, 'utf8'); } catch { return null; } })();
    if (written === null) fail(`引擎说写了 ${rel(outPath)}，但读不到它`);
    else if (target.driver && /<!DOCTYPE/i.test(written)) {
      fail('产物里还有 prolog <!DOCTYPE …> —— `stripPrologDoctype` 失效时，我们自己的 MusicXML 导入器会**拒收我们自己的产物**');
    } else {
      const extra = target.driver ? '、且 prolog 已剥掉 <!DOCTYPE>' : '（内联路线：未过 dolce.ts 的 DOCTYPE 剥离）';
      ok(`产物可读：${(written.length / 1024).toFixed(0)} KB MusicXML${extra}`);
    }
  }
  return { outPath, stats: res.stats, dir: tmpDir };
}

/* ------------------------------------------------------------------ ⑤ F1 闸门 */
function qualityGate(run) {
  console.log('\n== ⑤ 质量闸门（F1，比对真值 MIDI）==');
  if (SKIP_OMR) { info('AKD_SKIP_OMR=1 ⇒ ⑤ 一并跳过'); return; }
  if (!TRUTH) {
    info('**默认不跑** —— F1 需要一份**真值 MIDI**，而这张合成夹具没有真值');
    info('（用户那几首版权谱**不许**当夹具/真值；我们也不拿"自己识别的结果"当真值自证）');
    info('要跑：node tools/check-dolce-vendor.cjs --truth <真值.mid> [--min-f1 80]　或　AKD_OMR_TRUTH=<真值.mid>');
    info('单跑闸门：node tools/omr-quality.cjs --truth <真值.mid> --xml <我们出的.musicxml>');
    return;
  }
  if (!run) { warn('真跑没成功（④ 已红）⇒ F1 无从谈起，跳过'); return; }
  const args = [path.join(__dirname, 'omr-quality.cjs'), '--truth', TRUTH, '--xml', run.outPath];
  if (MIN_F1) args.push('--min-f1', MIN_F1);
  info(`真值 ${TRUTH} ⇒ 调 ${rel(path.join(__dirname, 'omr-quality.cjs'))}`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) fail(`F1 闸门没过（exit=${r.status}${r.error ? ' · ' + r.error.message : ''}）`);
  else if (MIN_F1) ok(`F1 闸门通过（门槛 ${MIN_F1}%）`);
  else ok('F1 已算出（**没给 --min-f1 ⇒ 只报告不判死**；要当门槛用就加 --min-f1 <百分数>）');
}

/* ------------------------------------------------------------------ main */
(async () => {
  await importChecks();

  let run = null;
  if (SKIP_OMR) {
    console.log('\n== ④ 真跑一张谱子图（Node 侧，不起 Electron）==');
    info('**已跳过真跑**（AKD_SKIP_OMR=1）：只做了 ①②③ —— 文件齐/来源对/能 import，**没证明能识别**');
  } else {
    run = await realRun();
  }
  qualityGate(run);

  if (run) { try { fs.rmSync(run.dir, { recursive: true, force: true }); } catch { /* 忽略 */ } }

  const secs = ((Date.now() - T0) / 1000).toFixed(1);
  console.log('');
  if (bad) {
    console.log(`✗ 有 ${bad} 项不合格（${secs}s）—— 修完再出包（识谱是"用户点下去才发现坏"的那类功能）`);
    process.exit(1);
  }
  console.log(`✓ 内置识谱（vendor/dolce-omr）守卫通过（${secs}s）`
    + (SKIP_OMR ? '　⚠️ 本次 **跳过了真跑**（AKD_SKIP_OMR=1）' : ''));
})();
