/**
 * check-pdf-render-wiring.cjs —— 守卫：客户端 **PDF → PNG（识谱入口）** 这条链**接没接上**
 *
 * 为什么要有它：2026-10-05 我写完 `renderPdfToPngs`（主进程，隐藏窗 + Chromium canvas）却
 *   **忘了接调用点** —— 函数在、附件链没走它 ⇒ 拖进来的 `.pdf` 还是原样交给智能体（识谱读不出位图）。
 *   这种"有定义、没接线"的死代码**任何类型检查都抓不到**，只有把接线本身钉成判据才防得住。
 *
 * 判据（全部静态可查，不需要起 Electron）：
 *   ① 渲染页存在，且它 import 的 pdfjs 是**已落位的 min 版**（两个文件都在，且非 min 版不在用）
 *   ② 落位的版本/哈希与 `server/node_modules/pdfjs-dist` **一致**（`tools/stage-pdfjs.cjs --check` 的同款判据）
 *   ③ 主进程真的有 `akdagent-pdf-render` 这个 IPC 口子，且**口子里调用了 renderPdfToPngs**
 *   ④ preload 暴露了同名的转发方法（渲染页与附件条都靠它）
 *   ⑤ `orb.html` 的附件入口（addPaths）**真的调用了** pdfRender（这条就是"接线"本身）
 *   ⑥ 打包清单覆盖 `src/**\/*`（否则 vendor 里的 pdfjs 不进安装包）
 *   ⑦ `.gitignore` 挡住 `electron/src/vendor/`（1.8 MB 第三方构建不进版本库）
 *   ⑧ 4 个语种都有那 3 条 PDF 文案（否则附件条会露出原始 key）
 *
 * 用法：node tools/check-pdf-render-wiring.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const P = (...a) => path.join(ROOT, ...a);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

let bad = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const no = (m) => { bad++; console.log(`  ❌ ${m}`); };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

console.log('【① 渲染页 + 随包 pdfjs（min 版）】');
const HTML = P('electron', 'src', 'pdf-render.html');
const html = read(HTML);
if (!html) no(`缺渲染页 ${rel(HTML)}`);
else {
  const imp = /import\s+\*\s+as\s+pdfjs\s+from\s+'([^']+)'/.exec(html);
  const wrk = /workerSrc\s*=\s*[\s\S]{0,120}?'([^']*pdf\.worker[^']*)'/.exec(html);
  if (!imp) no('渲染页里找不到 pdfjs 的 import');
  else {
    const target = path.resolve(path.dirname(HTML), imp[1]);
    if (!fs.existsSync(target)) no(`渲染页 import 的 pdfjs 不存在：${imp[1]}（跑 node tools/stage-pdfjs.cjs）`);
    else {
      const buf = fs.readFileSync(target);
      if (!/pdf\.min\.mjs$/.test(target)) no(`import 的应是 **min** 版（省 1.5 MB），现在是 ${path.basename(target)}`);
      else ok(`import ${imp[1]}（${(buf.length / 1048576).toFixed(2)} MB）`);
    }
    if (!wrk) no('渲染页没有显式设 workerSrc（会退到假 worker，慢）');
    else {
      const wt = path.resolve(path.dirname(HTML), wrk[1]);
      if (!fs.existsSync(wt)) no(`workerSrc 指向的文件不存在：${wrk[1]}`);
      else ok(`workerSrc → ${path.basename(wt)}（${(fs.statSync(wt).size / 1048576).toFixed(2)} MB）`);
    }
  }
}

console.log('【② 落位版本/哈希 vs 装的 pdfjs-dist】');
const DST = P('electron', 'src', 'vendor', 'pdfjs', 'legacy', 'build');
try {
  const inst = JSON.parse(read(P('server', 'node_modules', 'pdfjs-dist', 'package.json')) || '{}').version;
  const man = JSON.parse(read(path.join(DST, 'VERSION.json')) || 'null');
  if (!inst) no('读不到 server/node_modules/pdfjs-dist 的版本');
  else if (!man) no('缺 VERSION.json（没落位过：node tools/stage-pdfjs.cjs）');
  else if (man.pdfjsVersion !== inst) no(`落位版本 ${man.pdfjsVersion} ≠ 装的 ${inst}（重跑 stage-pdfjs）`);
  else {
    let drift = 0;
    for (const f of Object.keys(man.files || {})) {
      const fp = path.join(DST, f);
      if (!fs.existsSync(fp)) { no(`缺落位文件 ${f}`); drift++; continue; }
      const b = fs.readFileSync(fp);
      if (man.files[f].sha256 !== sha256(b) || man.files[f].bytes !== b.length) { no(`落位文件已变：${f}`); drift++; }
    }
    if (!drift) ok(`pdfjs-dist@${inst} · ${Object.keys(man.files || {}).length} 个文件哈希一致`);
  }
} catch (e) { no('核对落位时出错：' + e.message); }

console.log('【③ 主进程 IPC 口子 + 真的调用了渲染函数】');
const mainJs = read(P('electron', 'src', 'main.js')) || '';
{
  const m = /ipcMain\.handle\(\s*'akdagent-pdf-render'[\s\S]{0,800}?\n\}\)/.exec(mainJs);
  if (!m) no("main.js 里没有 ipcMain.handle('akdagent-pdf-render')");
  else if (!/renderPdfToPngs\(/.test(m[0])) no('这个 IPC 口子里**没有调用** renderPdfToPngs（口子是空的）');
  else ok('akdagent-pdf-render → renderPdfToPngs（有口子、有调用）');
  if (!/async function renderPdfToPngs\(/.test(mainJs)) no('main.js 里没有 renderPdfToPngs 的定义');
}

console.log('【④ preload 转发 + ⑤ 附件入口真的调用了（接线本身）】');
const pre = read(P('electron', 'src', 'orb-preload.js')) || '';
if (/ipcRenderer\.invoke\(\s*'akdagent-pdf-render'/.test(pre)) ok('orb-preload.js 暴露了 pdfRender → akdagent-pdf-render');
else no('orb-preload.js 没有转发 akdagent-pdf-render');
const orb = read(P('electron', 'src', 'orb.html')) || '';
if (/window\.akdagent\.pdfRender\(/.test(orb)) ok('orb.html 的附件入口调用 window.akdagent.pdfRender(');
else no('orb.html 没有调用 pdfRender ⇒ 拖进来的 .pdf 不会变成 PNG（这条就是 2026-10-05 漏掉的接线）');
{
  // 更严一层：调用点必须在 addPaths 里（否则可能是死代码）
  const i = orb.indexOf('function addPaths(');
  const j = orb.indexOf('function flashAttach(');
  const seg = i >= 0 && j > i ? orb.slice(i, j) : '';
  if (!seg) no('找不到 addPaths 函数体（附件入口改了名？）');
  else if (!/pdfRender\(/.test(seg)) no('pdfRender 的调用不在 addPaths 里（附件入口没走它）');
  else ok('调用点在 addPaths（附件入口）里');
}

console.log('【⑥ 打包清单 / ⑦ .gitignore】');
const yml = read(P('electron', 'electron-builder.yml')) || '';
// ⚠️ 这个 yml 里的条目**不缩进**（`files:` 下一行直接是 `- src/**/*`）⇒ 必须用 m 标志逐行匹配，
//    之前写成 `^files:...` 没有 m ⇒ 只在整串开头找，误报"没覆盖"。
if (/^files:\s*$/m.test(yml) && /^\s*-\s+src\/\*\*\/\*/m.test(yml)) ok('electron-builder.yml 的 files 覆盖 src/**/*（vendor/pdfjs 会进包）');
else no('electron-builder.yml 的 files 段没有覆盖 src/**/*（vendor 里的 pdfjs 不会进包）');
// ⑥b：还要**放实盘** —— ESM import + Web Worker 从 asar 里读有历史坑（拿不到 worker 只能退到假 worker：能跑但慢且不报错）
if (/^\s*-\s+src\/vendor\/pdfjs\/\*\*\s*$/m.test(yml)) ok('asarUnpack 把客户端 pdfjs 放实盘（避开 asar 里读 worker 的坑）');
else no('asarUnpack 里没有 `src/vendor/pdfjs/**`（打包后可能拿不到 pdfjs worker，只能退到假 worker）');
const gi = read(P('.gitignore')) || '';
if (/^\s*electron\/src\/vendor\/\s*$/m.test(gi)) ok('.gitignore 挡住 electron/src/vendor/（第三方构建不进库）');
else no('.gitignore 里没有 electron/src/vendor/（1.8 MB 第三方构建会被提交）');

console.log('【⑧ 4 个语种的 PDF 文案】');
try {
  const doc = JSON.parse(read(P('electron', 'src', 'i18n', 'orb.json')));
  const need = ['orb.files.pdfRendering', 'orb.files.pdfRendered', 'orb.files.pdfFailed'];
  for (const loc of Object.keys(doc)) {
    const miss = need.filter((k) => typeof doc[loc][k] !== 'string');
    if (miss.length) no(`${loc} 缺文案：${miss.join(', ')}`);
  }
  const locs = Object.keys(doc);
  // ⚠️ 断言必须与文案一致（2026-10-06 复核查出：原先是 `if (!locs.some(...)) ok(...)` —— **反了**，
  //    只在"没有一个语种齐全"时才打 ✅；而且不校验语种个数，删掉一个语种照样过）。
  const need4 = locs.length >= 4 && locs.every((l) => need.every((k) => typeof doc[l][k] === "string"));
  if (need4) ok(`${locs.length} 个语种都有 3 条 PDF 文案`);
  else no(`语种文案不全：共 ${locs.length} 个语种（应 ≥4），要求**每个**语种都有那 3 条`);
} catch (e) { no('读 orb.json 出错：' + e.message); }

console.log(bad ? `\n❌ PDF→PNG 接线有 ${bad} 处不合格` : '\n✅ PDF→PNG 接线完整（渲染页 · pdfjs 落位 · IPC · preload · 附件入口 · 打包 · 文案）');
process.exit(bad ? 1 : 0);
