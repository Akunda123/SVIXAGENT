/**
 * check-tool-registration.cjs —— 守卫：**定义了却没被调用的 `register*`**
 *
 * 为什么要有它：2026-10-06 一天内踩了两次同一类坑 ——
 *   · 客户端 `renderPdfToPngs()` 写完了**没有调用点**（拖进来的 PDF 不会变 PNG）；
 *   · `ace_import_musicxml` 注册在 `ace/tool-import.ts` 里，而"工具数"守卫只扫 `tools.ts` ⇒ 少算一个、
 *     还把文档里正确的名字误报成"文档多"（连带 6 处数量声明漂移）。
 *   共同点：**"写了" ≠ "接上了"**，而类型检查对此完全无感（导出的函数没人用，编译器不吭声）。
 *   ⇒ 把"每个 `register*` 都必须真的被调用"钉成判据。
 *
 * 判据：
 *   ① `server/src/**` 里每个 `export function registerX(` 都要在**别的文件**里被 import 且被调用；
 *   ② `registerTools` 必须由 `server/src/index.ts` 调用（MCP server 的入口）；
 *   ③ 顺带报出 tools.ts 里 `server.tool(` 的个数（与 check-tool-inventory 的真源口径一致，便于对账）。
 *
 * 用法：node tools/check-tool-registration.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'server', 'src');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

/** 递归收集 server/src 下的 .ts（跳过 tests / node_modules） */
function walk(dir, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/(^|[\\/])(node_modules|tests)([\\/]|$)/.test(p)) continue;
      walk(p, out);
    } else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

let bad = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const no = (m) => { bad++; console.log(`  ❌ ${m}`); };

const files = walk(SRC);
const REG_RE = /export\s+function\s+(register[A-Za-z0-9_]+)\s*\(/g;

console.log('【① 每个 register* 都要真的被调用】');
const found = [];
for (const f of files) {
  const src = read(f) || '';
  let m;
  REG_RE.lastIndex = 0;
  while ((m = REG_RE.exec(src)) !== null) found.push({ name: m[1], file: f });
}

if (!found.length) no('一个 register* 都没找到（路径或正则坏了？）');
for (const { name, file } of found) {
  // 在**其它**文件里找 import + 调用。
  // ⚠️ 2026-10-06 复核指出原判据太松（"别处任一行出现 `name(`" ⇒ 注释/字符串/文档里写一句就算过，
  //    且找不到 import 也只降级成警告仍打 ✅）。现在：**先去注释**、排除 import 行与定义行，
  //    调用点必须带 `(`（不能只是提名字），并且**必须能配上 import**（跨文件调用没 import = 必崩）。
  let importedIn = null, calledIn = null;
  const callRe = new RegExp(`(^|[^\\w.$])${name}\\s*\\(`);
  for (const g of files) {
    if (g === file) continue;
    const raw = read(g) || '';
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const called = code.split(/\r?\n/).some((line) => !/^\s*import\b/.test(line) && callRe.test(line));
    if (!called) continue;
    calledIn = calledIn || g;
    if (!importedIn && new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(raw)) importedIn = g;
  }
  if (calledIn && importedIn) ok(`${name} —— 被 ${rel(calledIn)} 调用，且已 import`);
  else if (calledIn) no(`${name} 在 ${rel(calledIn)} 里被调用，但**配不上 import**（跨文件调用没 import 必崩）`);
  else no(`${name} **只定义、没被调用**（${rel(file)}）—— 写了不等于接上了；补上调用点，或说明它为何是预留接口`);
}

console.log('【② registerTools 必须由入口调用】');
{
  const idx = path.join(SRC, 'index.ts');
  const src = read(idx);
  if (!src) no('读不到 server/src/index.ts');
  else if (/registerTools\s*\(/.test(src)) ok('server/src/index.ts 调用了 registerTools');
  else no('server/src/index.ts 没有调用 registerTools（MCP server 起不来 / 工具全空）');
}

console.log('【③ 工具数对账（口径与 check-tool-inventory 一致）】');
{
  // 同样**扫目录**（别再写文件清单：2026-10-06 就因为清单漏项两次误报）
  let n = 0, filesWithTools = 0;
  for (const f of files) {
    const src = read(f) || '';
    const c = (src.match(/server\.tool\(\s*['"][A-Za-z0-9_]+['"]/g) || []).length;
    if (c) { n += c; filesWithTools++; }
  }
  console.log(`  ℹ️ server/src 下 ${filesWithTools} 个文件共 ${n} 个 server.tool(...)（终局应与文档"共 N 个工具"一致）`);
}

console.log(bad ? `\n❌ 工具注册接线有 ${bad} 处问题` : '\n✅ 工具注册接线完整（每个 register* 都有调用点 · 入口调了 registerTools）');
process.exit(bad ? 1 : 0);
