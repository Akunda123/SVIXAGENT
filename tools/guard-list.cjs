// ============================================================================
// guard-list.cjs —— 生成《守卫一览》：把仓里所有守卫 + 它们防的哪条坑，落成一张表
// ============================================================================
// 为什么存在：坑很多、守卫也很多，但**没有一处汇总** ⇒ 新人（和未来的我）既不知道有哪些守卫，
//   也不知道"某条坑到底有没有守卫看着"。本脚本**机检生成**，避免手写表漂移。
//
// 用法：node tools/guard-list.cjs            # 生成 docs/守卫一览.md
//       node tools/guard-list.cjs --print    # 只打印，不写文件
// 判据：
//   · 守卫 = `tools/check-*.cjs` + `sv/lua/check-*.cjs` + 各测试套件（server tests / lua tests / electron dev）
//   · 「关联坑」= 守卫文件里**直接点名**的缺陷 ID（`IX-xxx` / `SV-xxx` / `API-xxx` / `DSH-xxx`）
//   · 「无守卫的坑」= `known-bugs.json` 里**没有任何守卫点名**、且 `recheckOn` 没标"只跟文档走"的条目
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRINT_ONLY = process.argv.includes('--print');
const OUT = path.join(ROOT, 'docs', '守卫一览.md');

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

// ---------- 1. 找守卫 ----------
const guards = [];
for (const f of fs.readdirSync(path.join(ROOT, 'tools'))) {
  if (/^check-.*\.cjs$/.test(f)) guards.push({ kind: '守卫脚本', file: path.join('tools', f) });
}
const luaDir = path.join(ROOT, 'sv', 'lua');
if (fs.existsSync(luaDir)) {
  for (const f of fs.readdirSync(luaDir)) {
    if (/^check-.*\.cjs$/.test(f)) guards.push({ kind: '守卫脚本(Lua 侧)', file: path.join('sv', 'lua', f) });
  }
}
const TESTS = [
  ['离线自测（桥）', 'sv/lua/tests/test-ops.lua'],
  ['离线自测（面板）', 'sv/lua/tests/test-panel.lua'],
  // 2026-09-25 加：客户端"当前宿主"判据 + 两台宿主同时服务（IX 与 SV 并用）
  ['离线自测（宿主选择）', 'electron/dev/test-host-pick.cjs'],
  ['离线自测（面板双宿主）', 'tools/test-panel-dual.cjs'],
  ['离线自测（技法规则）', 'server/tests/articulations.mjs'],
  ['离线自测（旋律）', 'server/tests/melody-check.mjs'],
  ['离线自测（歌词分类）', 'server/tests/lyric-classify.mjs'],
  ['离线自测（歌词复核）', 'server/tests/lyric-check.mjs'],
  ['离线自测（织体）', 'server/tests/texture.mjs'],
  ['离线自测（MusicXML）', 'server/tests/musicxml.mjs'],
  ['离线自测（音素）', 'server/tests/phoneme.mjs'],
];
for (const [kind, rel] of TESTS) if (fs.existsSync(path.join(ROOT, rel))) guards.push({ kind, file: rel });

// ---------- 2. 抽标题 / 关联缺陷 ----------
const BUG_IDS = /(IX|SV|API|DSH)-\d{3}/g;
for (const g of guards) {
  const t = read(path.join(ROOT, g.file)) || '';
  g.lines = t.split(/\r?\n/).length;
  // 标题 = 头部 ==== 块之后第一行有实质内容的注释
  const head = t.split(/\r?\n/).slice(0, 60);
  let title = '';
  let seenRule = false;
  for (const ln of head) {
    const isRule = /^\/\/ ={5,}/.test(ln.trim());
    if (isRule) { if (seenRule && title) break; seenRule = true; continue; }   // 第二条 ==== 才收工
    if (!seenRule) continue;
    const m = ln.match(/^\/\/\s*(.+)$/);
    if (m && m[1].trim()) { title = m[1].trim(); break; }
  }
  if (!title) {
    // 回退：JS doc 注释风格（`#!/usr/bin/env node` + `/** … * **标题** … */`）
    for (const ln of head) {
      const m = ln.match(/^\s*\*\s*(\S.*)$/);
      if (m && !/^[*\/]+$/.test(m[1].trim())) { title = m[1].trim(); break; }
    }
  }
  g.title = title.replace(/^[\s*]+/, '').replace(/\*\*/g, '').slice(0, 120);
  // 为什么存在 / 来历
  const why = t.match(/\/\/[^\n]*(为什么存在|来历|起因)[^\n]*/);
  g.why = why ? why[0].replace(/^\/\/\s*/, '').slice(0, 150) : '';
  const ids = new Set((t.match(BUG_IDS) || []));
  g.bugs = [...ids];
}

// ---------- 3. 已知缺陷：谁有守卫 ----------
const kbRaw = read(path.join(ROOT, 'tools', 'known-bugs.json'));
let bugs = [];
try { const j = JSON.parse(kbRaw); bugs = j.bugs || j.items || (Array.isArray(j) ? j : []); } catch { }
const guardedIds = new Set(guards.flatMap((g) => g.bugs));
for (const b of bugs) b._guarded = guardedIds.has(b.id);

// ---------- 4. 出表 ----------
const md = [];
md.push('# 守卫一览（机检生成）', '');
md.push('> 由 `node tools/guard-list.cjs` 生成 —— **别手改这张表**（手改必漂移）。');
md.push('> 定位：**这是仓库运维台账，不进 skill、不进安装包**（技能里那类"本仓守卫"内容正在被清掉）。');
md.push('> 「关联坑」= 守卫文件里**直接点名**的缺陷 ID；没点名的坑**不等于没守卫**（可能被通用守卫覆盖）。', '');
md.push('## 一、守卫清单（' + guards.length + ' 项）', '');
md.push('| 类型 | 文件 | 防什么 | 关联缺陷 | 行数 |');
md.push('|---|---|---|---|---|');
for (const g of guards.sort((a, b) => a.file.localeCompare(b.file))) {
  md.push('| ' + g.kind + ' | `' + g.file + '` | ' + (g.title || '—') + ' | ' + (g.bugs.length ? g.bugs.join(' · ') : '—') + ' | ' + g.lines + ' |');
}
md.push('');
md.push('## 二、已知缺陷 × 有无守卫（' + bugs.length + ' 条）', '');
md.push('| 缺陷 | 类别 | 状态 | 标题 | 有守卫点名？ |');
md.push('|---|---|---|---|---|');
for (const b of bugs) {
  md.push('| `' + b.id + '` | ' + (b.kind || b.class || '') + ' | ' + (b.status || '') + ' | ' +
    String(b.title || '').replace(/\|/g, '\\|').slice(0, 80) + ' | ' + (b._guarded ? '✅' : '❌ **无**') + ' |');
}
const unguarded = bugs.filter((b) => !b._guarded);
md.push('');
md.push('### 无守卫点名的（' + unguarded.length + ' 条）', '');
for (const b of unguarded) {
  const only = b.recheckOn && b.recheckOn.includes('doc');
  md.push('- **`' + b.id + '`**（' + (b.kind || '') + '）' + String(b.title || '').slice(0, 90) +
    (only ? '　← `recheckOn:["doc"]`：**只跟官方文档更新走**，不靠静态守卫' : ''));
}
md.push('');
md.push('> ⚠️ 这张表只回答"**缺陷表里的条目**有没有守卫点名"；',
  '>    `docs/开发坑记录.md` 与 `akdagent-playbook` 里还有大量**只能靠纪律**的坑（编码/单位/重启/宿主差异…），',
  '>    它们的"守卫"是**人工纪律 + 离线自测**，不在这张表里。', '');

const text = md.join('\n');
if (PRINT_ONLY) console.log(text);
else { fs.writeFileSync(OUT, text, 'utf8'); console.log('written ' + path.relative(ROOT, OUT) + ' · 守卫 ' + guards.length + ' 项 · 缺陷 ' + bugs.length + ' 条（无守卫点名 ' + unguarded.length + '）'); }
