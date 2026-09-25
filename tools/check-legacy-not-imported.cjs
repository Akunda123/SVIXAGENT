#!/usr/bin/env node
/**
 * 守卫：**不许引用 `legacy/`**
 *
 * 历史：用户 2026-09-12 裁定"保留、不删、**标记好别使用**"；**2026-09-19 用户改判「legacy 可以直接退役了」⇒ 目录已删除**
 *（退役前备份在 `%TEMP%\legacy-retired-20260919\`）。本守卫**保留并升级**为"反引入"检查：
 * 活代码里再出现指向 `legacy/` 的 import/require 就报错（目录都没了，写了必崩）；同时报告该目录当前是否存在。
 *
 * 扫描活代码目录（server / electron/src / sv / tools / scripts）里的 require/import/路径字符串，
 * 出现指向 `legacy/` 的引用就**报错**（代码里出现即违反；注释里提到名字允许 —— 见下）。
 *
 * 判定规则：
 *   · 命中 `require(...)` / `import ... from` / `import(...)` 里含 `legacy` 的 ⇒ ❌ 报错；
 *   · 普通注释里出现 `legacy/...` 之类**只提名字**的 ⇒ ✅ 允许（历史说明需要）；
 *   · `node_modules`、`dsh-runtime`、`electron/release` ⇒ 跳过。
 *
 * 用法：node tools/check-legacy-not-imported.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['server/src', 'server/scripts', 'electron/src', 'sv', 'tools'];
const EXT = /\.(ts|cts|mts|js|cjs|mjs|ps1|lua)$/;
const SKIP_DIR = /(^|[\\/])(node_modules|release|legacy|\.git)([\\/]|$)/;

// 只关心"真的把 legacy 当模块引用"的写法
const IMPORT_RE = /(require\s*\(\s*['"][^'"]*legacy[^'"]*['"]|from\s+['"][^'"]*legacy[^'"]*['"]|import\s*\(\s*['"][^'"]*legacy[^'"]*['"])/;

const files = [];
(function walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (SKIP_DIR.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (EXT.test(e.name)) files.push(p);
  }
})(ROOT);

let bad = 0, scanned = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (!SCAN_DIRS.some((d) => rel.startsWith(d + '/'))) continue;
  scanned++;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    // 去掉行内注释再判（"注释里提名字"是允许的）
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/--.*$/, '').replace(/^\s*\*.*$/, '');
    if (IMPORT_RE.test(code)) {
      bad++;
      console.log(`  [FAIL] ${rel}:${i + 1} 引用了 legacy/  -> ${line.trim().slice(0, 120)}`);
    }
  });
}

console.log(`扫描 ${scanned} 个活代码文件`);
const legacyDir = path.join(ROOT, 'legacy');
const legacyExists = fs.existsSync(legacyDir);
if (bad) {
  console.log(`\n❌ 有 ${bad} 处引用 legacy/ —— 该目录**已删除**（2026-09-19 退役），活代码必须改用：`);
  console.log('   · 桥：sv/lua/AKDAgentBridge.lua（Lua 文件通道）');
  console.log('   · 通道：server/src/fileipc.ts / electron/src/file-ipc.js');
  process.exit(1);
}
console.log(`✅ 没有任何活代码引用 legacy/（该目录${legacyExists ? '当前**又被建出来了**，注意是不是误操作' : '已删除，仅历史记录里仍有提及'}）`);
