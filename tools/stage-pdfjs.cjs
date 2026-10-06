/**
 * stage-pdfjs.cjs —— 把 `pdfjs-dist` 的 **min legacy 构建**落位到客户端的渲染目录
 *
 * 为什么要它：`electron/src/pdf-render.html`（客户端 PDF→PNG 渲染页，识谱用）按相对路径 import
 *   `./vendor/pdfjs/legacy/build/pdf.min.mjs`。那两个文件来自第三方包、**不进版本库**
 *   （`electron/src/vendor/**` 由 .gitignore 挡住）⇒ 必须由本脚本从 `server/node_modules/pdfjs-dist` 落位。
 *
 * 用法：
 *   node tools/stage-pdfjs.cjs            # 落位（或按版本/哈希刷新）
 *   node tools/stage-pdfjs.cjs --check    # 只核对（缺文件/版本不符/哈希不符 ⇒ exit 1），不写盘
 *
 * 纪律：
 *   · **只拷 min 版两个文件**（`pdf.min.mjs` ≈0.5 MB + `pdf.worker.min.mjs` ≈1.3 MB）；
 *     非 min 版是 3.3 MB（`pdf.mjs` 1.0 + `pdf.worker.mjs` 2.3）—— 别整目录拷。
 *   · 落位后写 `VERSION.json`（pdfjs 版本 + 每个文件的 sha256/字节数）⇒ 守卫能机检出"版本漂了"。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const SRC_DIR = path.join(ROOT, 'server', 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const DST_DIR = path.join(ROOT, 'electron', 'src', 'vendor', 'pdfjs', 'legacy', 'build');
const FILES = ['pdf.min.mjs', 'pdf.worker.min.mjs'];

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function readPkgVersion() {
  const p = path.join(ROOT, 'server', 'node_modules', 'pdfjs-dist', 'package.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).version;
}

let failed = 0;
const say = (s) => console.log(s);

if (!fs.existsSync(SRC_DIR)) {
  say(`❌ 找不到源：${path.relative(ROOT, SRC_DIR)}（先在 server/ 里装依赖：npm i）`);
  process.exit(1);
}
const version = readPkgVersion();
const manifestPath = path.join(DST_DIR, 'VERSION.json');
const had = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

if (CHECK) {
  say(`【核对】pdfjs-dist@${version} → ${path.relative(ROOT, DST_DIR)}`);
  if (!had) { say('  ❌ 缺 VERSION.json（没落位过）⇒ 跑 node tools/stage-pdfjs.cjs'); process.exit(1); }
  if (had.pdfjsVersion !== version) { say(`  ❌ 版本不符：落位的是 ${had.pdfjsVersion}，装的是 ${version}`); failed++; }
  for (const f of FILES) {
    const dst = path.join(DST_DIR, f);
    if (!fs.existsSync(dst)) { say(`  ❌ 缺文件：${f}`); failed++; continue; }
    const buf = fs.readFileSync(dst);
    const want = had.files && had.files[f];
    const ok = want && want.sha256 === sha256(buf) && want.bytes === buf.length;
    if (!ok) { say(`  ❌ 哈希/字节对不上：${f}`); failed++; }
    else say(`  ✅ ${f}  ${(buf.length / 1048576).toFixed(2)} MB  ${sha256(buf).slice(0, 12)}`);
  }
  say(failed ? '❌ 未落位/已漂' : '✅ 客户端 pdfjs 落位一致');
  process.exit(failed ? 1 : 0);
}

fs.mkdirSync(DST_DIR, { recursive: true });
const files = {};
for (const f of FILES) {
  const src = path.join(SRC_DIR, f);
  if (!fs.existsSync(src)) { say(`❌ 源缺文件：${f}`); process.exit(1); }
  const buf = fs.readFileSync(src);
  fs.writeFileSync(path.join(DST_DIR, f), buf);
  files[f] = { sha256: sha256(buf), bytes: buf.length };
  say(`  ${f}  ${(buf.length / 1048576).toFixed(2)} MB → ${path.relative(ROOT, path.join(DST_DIR, f))}`);
}
fs.writeFileSync(manifestPath, JSON.stringify({ pdfjsVersion: version, stagedAt: new Date().toISOString(), files }, null, 2) + '\n', 'utf8');
say(`✅ 已落位 pdfjs-dist@${version}（${Object.keys(files).length} 个文件）→ ${path.relative(ROOT, DST_DIR)}`);
