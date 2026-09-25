#!/usr/bin/env node
'use strict';
/**
 * 守卫：**公开仓库前**该守住的三件事（2026-09-25 立，为「把仓库推上 GitHub」准备）
 *
 * ① 真实用户名：待公开文件里**不许**出现本机用户名（`redactOnlyUser(某行) !== 该行` 即命中）。
 *    口径与 `tools/redact-repo.cjs` 完全一致 —— 故意的占位符（`C:/Users/you/…`、`C:\Users\<name>`、
 *    `$env:USERNAME`）**不算命中**，只有真名才算。
 *    （历史：2026-09-25 公开前扫出 11 个文件 / 14 行带真实用户名，其中 `knowledge/docs/` 两份
 *     还**随安装包分发** ⇒ 既泄漏又难看；已按"文档用占位符、代码改成从 __dirname/os.homedir() 推"改掉。）
 * ② 内部文件确实被 .gitignore 挡住：`docs/`（工作台账）、草案 README、node_modules、dsh-runtime、
 *    dist、release、模型权重 —— 一旦哪天 .gitignore 被人改动，这里会立刻变红。
 * ③ 体积：GitHub 单文件硬上限 100 MB（超了直接拒 push），>50 MB 会警告。
 *
 * 用法：node tools/check-publish-redaction.cjs
 * （想改掉命中：文档类跑 `node tools/redact-repo.cjs --apply`；**代码类不要用占位符**，
 *   要改成从 `__dirname` / `os.homedir()` 推，否则脚本在别人机器上跑不通。）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { redactOnlyUser, currentUser, TEXT_EXT, PLACEHOLDER } = require('./lib-redact.cjs');

const ROOT = path.resolve(__dirname, '..');
const user = currentUser();
let bad = 0;
const fail = (s) => { console.log('  [FAIL] ' + s); bad++; };
const ok = (s) => console.log('  [ok]   ' + s);

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function publishable() {
  return git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
}

console.log('== ① 待公开文件里不许有真实用户名 ==');
console.log(`   判据：redactOnlyUser(行) !== 行（本机用户名 ${user || '取不到'}；占位符 <name>/you/$env:USERNAME 不算）`);
if (!user) {
  console.log('  [--]   取不到本机用户名，跳过（Windows/mac 正常都能取到）');
} else {
  const hits = [];
  for (const rel of publishable()) {
    if (!TEXT_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      if (line.includes('redact-allow')) return;            // 显式豁免（便于 grep 审计）
      if (redactOnlyUser(line, user) !== line) hits.push({ rel, line: i + 1 });
    });
  }
  if (!hits.length) ok(`0 处（已全部换成 ${PLACEHOLDER} 或改成可移植写法）`);
  else {
    const byFile = new Map();
    for (const h of hits) byFile.set(h.rel, [...(byFile.get(h.rel) || []), h.line]);
    for (const [rel, ls] of byFile) fail(`${rel}  L${ls.slice(0, 6).join(', L')}${ls.length > 6 ? ` …共 ${ls.length} 处` : ''}`);
    console.log(`        修法：文档类 \`node tools/redact-repo.cjs --apply\`；代码类改成从 __dirname / os.homedir() 推`);
  }
}

console.log('\n== ② 内部文件/产物确实被 .gitignore 挡住 ==');
for (const p of ['docs/工作台账-示例.md', 'README-发布版草案-v2.md', 'node_modules/x.js', 'dsh-runtime/dsh/package.json',
                 'dist/knowledge/docs/x.md', 'electron/release/x.exe', 'server/models/crepe/full.onnx', 'electron/node_modules/x.js',
                 '__pycache__/x.pyc', 'dsh-runtime/node/node.exe']) {
  let ignored = false;
  try { git(['check-ignore', '-q', p]); ignored = true; } catch { ignored = false; }
  if (ignored) ok(`已忽略：${p}`);
  else fail(`${p} **没有被忽略** —— 它会被 push 上去（内部台账/几百 MB 产物）`);
}

console.log('\n== ③ 体积（GitHub 单文件 100 MB 硬上限）==');
{
  const files = publishable();
  const big = [];
  let total = 0, max = 0, maxF = '';
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    total += st.size;
    if (st.size > max) { max = st.size; maxF = rel; }
    if (st.size > 50 * 1048576) big.push({ rel, mb: st.size / 1048576 });
  }
  const over100 = big.filter((b) => b.mb > 100);
  for (const b of big) {
    if (b.mb > 100) fail(`${b.rel}  ${b.mb.toFixed(1)} MB > 100 MB ⇒ push 会被 GitHub 拒`);
    else console.log(`  [warn] ${b.rel}  ${b.mb.toFixed(1)} MB > 50 MB（能推但偏大）`);
  }
  ok(`共 ${files.length} 个文件 / ${(total / 1048576).toFixed(1)} MB；最大 ${maxF} ${(max / 1048576).toFixed(2)} MB`);
  if (!over100.length && !big.length) ok('没有超过 50 MB 的文件');
}

console.log('');
if (bad) { console.log(`❌ ${bad} 项不过 —— 修完再推`); process.exit(1); }
console.log('✅ 可以公开：没有真实用户名、内部文件都被挡住、体积也没问题');
