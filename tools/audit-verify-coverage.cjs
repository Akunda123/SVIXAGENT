#!/usr/bin/env node
/**
 * 覆盖率审计：**每个桥 op 有没有真机验收脚本涉及**（以及哪个脚本）
 *
 * 用途：`docs/lua桥移植进度.md` 的进度表容易过期（"白名单"那列已经随剪贴板退休而失效），
 *   这个脚本从**真源**（`sv/lua/verify-*.cjs` 实际调用的 op 名）反推覆盖矩阵，
 *   让"还差什么"有客观依据，而不是靠记忆。
 *
 * 用法：node tools/audit-verify-coverage.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'sv', 'lua');

// 桥声明的 op 真源：从 Lua 桥的 `OPS.xxx = function` 定义抓（OP_NAMES 是运行时由 OPS 键生成的）
const lua = fs.readFileSync(path.join(ROOT, 'sv', 'lua', 'AKDAgentBridge.lua'), 'utf8');
const bridgeOps = [...lua.matchAll(/^(?:function\s+OPS\.([A-Za-z_]\w*)|OPS\.([A-Za-z_]\w*)\s*=\s*function)/gm)]
  .map((m) => m[1] || m[2]).sort();
if (!bridgeOps.length) bridgeOps.push('(未能从源码解析 OPS.* 定义)');

const files = fs.readdirSync(DIR).filter((f) => /^verify-.*\.cjs$/.test(f)).sort();
const text = new Map(files.map((f) => [f, fs.readFileSync(path.join(DIR, f), 'utf8')]));

// 每个 op 被哪些脚本"真的调用"（排除脚本自身的注释行）
const hit = {};
for (const op of bridgeOps) {
  const re = new RegExp(`['"\`]${op}['"\`]`);
  hit[op] = files.filter((f) => {
    const lines = text.get(f).split(/\r?\n/).filter((l) => !/^\s*(\*|\/\/|--)/.test(l));
    return lines.some((l) => re.test(l));
  });
}

console.log(`桥声明的 op：${bridgeOps.length} 个`);
console.log(`真机验收脚本：${files.length} 个\n`);
let missing = 0;
for (const op of bridgeOps) {
  const who = hit[op];
  if (!who.length) missing++;
  console.log(`  ${who.length ? '✅' : '❌'} ${op.padEnd(26)}${who.map((f) => f.replace(/^verify-|\.cjs$/g, '')).join(', ') || '(无脚本涉及)'}`);
}
console.log(`\n覆盖：${bridgeOps.length - missing}/${bridgeOps.length}` + (missing ? ` · 未涉及 ${missing} 个` : ' · 全覆盖'));

// 顺带列出每个脚本的规模与"宿主是否可指定"（HOST 统一约定：argv 里给 sv/ix 或 --host=）
console.log('\n脚本清单：');
for (const f of files) {
  const s = text.get(f);
  const lines = s.split(/\r?\n/).length;
  let host = '⚠️ 硬编码 sv';
  if (/const HOST = \(\(\) =>/.test(s)) host = '✅ 可指定 host（sv/ix）';
  else if (/const host = process\.argv\[2\]/.test(s)) host = '✅ 可指定 host（argv[2]）';
  console.log(`  ${f.padEnd(28)} ${String(lines).padStart(4)} 行  ${host}`);
}
