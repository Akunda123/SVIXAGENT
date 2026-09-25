#!/usr/bin/env node
/**
 * **技能完整性守卫**（2026-09-23 立）
 *
 * 为什么要有它：当天我用批处理脚本清 skill 文案时，把 `akdagent-playbook/SKILL.md`
 *   **写成了 0 字节**；而当时的"核对"只查了 **"文件有没有变大"**（只减不增）——
 *   **0 字节当然是变小** ⇒ 从网里漏过去了，直到技能目录里那份技能**整个消失**才发现。
 *   ⇒ 教训：**"只减不增"不是完整性判据**，必须另有"没被清空 / 没被截断"的硬检查。
 *
 * 三条判据：
 *   ① **不许 0 字节**（`skills/**\/*.md`）；
 *   ② **SKILL.md 必须结构完好**：以 `---` 开头、含 `name:` 与 `description:`（缺 frontmatter ⇒ 宿主加载不到该技能）；
 *   ③ **不许相对基线大幅缩水**（默认 30%）：基线文件 `tools/skill-baseline.json`；
 *      首次用 `--baseline` 写基线；文件新增/删除不判错（只判"行数骤降"）。
 *
 * 用法：
 *   node tools/check-no-empty-md.cjs            # 检查（无基线时只跑 ①②）
 *   node tools/check-no-empty-md.cjs --baseline # 写/刷新基线
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');
const BASELINE = path.join(ROOT, 'tools', 'skill-baseline.json');
const WRITE = process.argv.includes('--baseline');
const DROP_LIMIT = 0.30;   // 行数掉超过 30% 即判异常

function walk(d) {
  const out = [];
  (function r(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, e.name);
      if (e.isDirectory()) r(f); else if (f.endsWith('.md')) out.push(path.relative(ROOT, f).replace(/\\/g, '/'));
    }
  })(SKILLS);
  return out;
}

const files = walk(SKILLS);
const stats = {}; const problems = [];
for (const rel of files) {
  const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = t.split(/\r?\n/).length;
  stats[rel] = lines;
  if (t.length === 0) problems.push('① **0 字节**：' + rel);
  if (/\/SKILL\.md$/.test(rel)) {
    if (!/^---\r?\n/.test(t)) problems.push('② frontmatter 缺失（不以 `---` 开头）：' + rel);
    else {
      if (!/^name:/m.test(t)) problems.push('② frontmatter 缺 `name:`：' + rel);
      if (!/^description:/m.test(t)) problems.push('② frontmatter 缺 `description:`：' + rel);
    }
  }
}

// ③ 基线比对
let base = null;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { }
const shrunk = [];
if (base) {
  for (const [rel, n] of Object.entries(stats)) {
    const b = base[rel];
    if (typeof b !== 'number' || b <= 0) continue;
    if (n < b * (1 - DROP_LIMIT)) shrunk.push(rel + '：' + b + ' → ' + n + ' 行（掉 ' + Math.round((1 - n / b) * 100) + '%）');
  }
}

console.log('== 技能完整性守卫 ==');
console.log('扫描 ' + files.length + ' 个 .md · 基线 ' + (base ? Object.keys(base).length + ' 条' : '（无，跑 --baseline 建立）'));
if (problems.length) { console.log('\n🔴 结构问题 ' + problems.length + ' 处：'); for (const p of problems) console.log('  · ' + p); }
if (shrunk.length) { console.log('\n🔴 行数骤降 ' + shrunk.length + ' 处（> ' + (DROP_LIMIT * 100) + '%）：'); for (const s of shrunk) console.log('  · ' + s); }

if (WRITE) {
  fs.writeFileSync(BASELINE, JSON.stringify(stats, null, 1), 'utf8');
  console.log('\n已写基线 -> ' + path.relative(ROOT, BASELINE).replace(/\\/g, '/'));
  process.exit(problems.length ? 1 : 0);
}
if (problems.length || shrunk.length) { console.log('\n❌ 技能库完整性异常'); process.exit(1); }
console.log('✅ 无 0 字节 · SKILL.md frontmatter 完好' + (base ? ' · 无行数骤降' : ''));
