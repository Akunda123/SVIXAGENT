#!/usr/bin/env node
'use strict';
/**
 * 全仓脱敏（2026-09-25 立，为「把仓库公开到 GitHub」准备）
 *
 * 与 `tools/check-redaction.cjs` 的分工：
 *   · check-redaction = **随包集合**（knowledge/docs → dist/knowledge，进安装包）的脱敏；
 *   · 本工具        = **整个仓库**（= 会推到 GitHub 的那些文件）的脱敏。
 *   替换规则同源：都来自 `tools/lib-redact.cjs`。
 *
 * 判据（也是 `tools/check-publish-redaction.cjs` 的判据）：
 *   一行**需要脱敏** ⟺ `redactOnlyUser(该行) !== 该行`，即**真的出现了本机用户名**。
 *   为什么不用 `findSensitive()` 当判据：它会把**故意的占位符**（`C:/Users/you/…`、
 *   `C:\Users\<name>`、`C:\Users\<u>`、`$env:USERNAME`）也报出来，而那些**不该动**
 *   （UI 提示语里 `you` 比 `<USER>` 友好；`<name>` 本来就是占位符）。
 *
 * 文件集 = **git 真正会放进仓库的**（tracked + untracked-but-not-ignored）⇒ `.gitignore` 挡住的
 *   `docs/`、草案 README、node_modules、dsh-runtime 等天然不参与。
 *
 * ⚠️ 本工具**只做文本占位符替换**。若真实路径是**代码要用的**（不是文档示例），替换会把它改成
 *   跑不通的路径 ⇒ 那种地方要**改成从 `__dirname` / `os.homedir()` 推**。2026-09-25 已按这个
 *   原则先改掉 6 处（tools/clone-overlap-audit.cjs、tools/gen-github-readme.cjs、
 *   server/scripts/gen-seed.mjs、scripts/html2md-svapi.py、scripts/scan-akd.py、server/parse-tb*.cjs）。
 *
 * 用法：
 *   node tools/redact-repo.cjs            # 只列（默认；不改文件）
 *   node tools/redact-repo.cjs --apply    # 真改（UTF-8 BOM 与行尾原样保留）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { redactOnlyUser, findSensitive, currentUser, TEXT_EXT } = require('./lib-redact.cjs');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

/** git 会放进仓库的文件（相对路径）；git 不可用则退化为走查全仓（跳过常见忽略目录） */
function publishableFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\0').filter(Boolean);
  } catch {
    console.log('（git 不可用 ⇒ 退化为全仓走查）');
    const SKIP = /[\\/](node_modules|dsh-runtime|release|dist|out|\.git|__pycache__)[\\/]/;
    const acc = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const abs = path.join(d, e.name);
        if (e.isDirectory()) { if (!SKIP.test(abs + path.sep)) walk(abs); continue; }
        if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) acc.push(path.relative(ROOT, abs));
      }
    })(ROOT);
    return acc;
  }
}

/** 读文件：拆出 UTF-8 BOM，正文按 UTF-8 解（BOM 原样写回） */
function readText(abs) {
  const buf = fs.readFileSync(abs);
  const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  return { hasBom, text: buf.slice(hasBom ? 3 : 0).toString('utf8') };
}
function writeText(abs, text, hasBom) {
  const body = Buffer.from(text, 'utf8');
  fs.writeFileSync(abs, hasBom ? Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), body]) : body);
}

/** 给一行里"真正被替换掉的地方"贴个类别标签（纯展示用） */
function labelOf(line, user) {
  const hits = findSensitive(line, user).filter((h) => h.kind !== 'ipv4');
  return hits.length ? hits[0].kind : 'username';
}

const user = currentUser();
const files = publishableFiles().filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()));
console.log(`待公开文件 ${files.length} 个（文本类）；判定用的本机用户名：${user || '（取不到）'}\n`);

let changed = 0, hitLines = 0;
const perKind = new Map();
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  let loaded;
  try { loaded = readText(abs); } catch { continue; }
  const { text, hasBom } = loaded;
  if (text.includes('\u0000')) continue;                    // 二进制

  const lines = text.split('\n');
  const notes = [];
  lines.forEach((line, i) => {
    if (line.includes('redact-allow')) return;              // 显式豁免（与 abs-path-allow 同族）
    const after = redactOnlyUser(line, user);
    if (after === line) return;                             // 没真出现本机用户名 ⇒ 不动
    const kind = labelOf(line, user);
    perKind.set(kind, (perKind.get(kind) || 0) + 1);
    hitLines++;
    notes.push(`   L${i + 1} [${kind}] ${line.trim().slice(0, 108)}\n        → ${after.trim().slice(0, 108)}`);
  });
  if (!notes.length) continue;

  changed++;
  console.log(`-- ${rel}  (${notes.length})`);
  for (const n of notes.slice(0, 8)) console.log(n);
  if (notes.length > 8) console.log(`   … 另有 ${notes.length - 8} 处`);

  if (APPLY) writeText(abs, redactOnlyUser(text, user), hasBom);
}

if (!changed) { console.log('✅ 没有需要替换的地方（本机用户名没出现在待公开文件里）'); process.exit(0); }
const kinds = [...perKind].map(([k, n]) => `${k} ${n}`).join(' · ');
if (APPLY) { console.log(`\n✅ 已就地替换 ${changed} 个文件 / ${hitLines} 行（${kinds}）；BOM 与行尾原样保留`); process.exit(0); }
console.log(`\n共 ${changed} 个文件 / ${hitLines} 行待替换（${kinds}）`);
console.log('（未加 --apply ⇒ 一个文件都没改）');
