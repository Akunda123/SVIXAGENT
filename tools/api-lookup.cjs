#!/usr/bin/env node
/**
 * 官方 API 查询（2026-09-20 新增）—— 把「**先查文档，再调用**」这条规则变得可执行
 *
 * 为什么存在（当天真机踩出来的教训）：IX 侧 `Automation.getPoints()` 一直报错、旧记录判成"返回宿主内部对象
 *   ⇒ 序列化卡死 ⇒ 禁调用"，据此把一整族 API 标成"危险/未知"，还让真机验收白跑一轮。
 *   **真相是参数个数**：`getPoints(begin, end)` 要 2 个 —— 而这条**官方镜像里一直写着**
 *   （`skills/sv-scripting/api/Automation.md`）。事后真机重测：IX 的签名与官方文档**逐条吻合**。
 *   ⇒ 根因不是"文档没有"，是**我们没先查文档**，改用"真机试错探测"——而试错在 SV1 上会**弹模态框冻死桥**
 *   （见 `known-bugs` 的 SV-001）。
 *
 * 规则（写进 `akdagent-playbook`）：**任何宿主 API 调用/探测之前，先用本工具查官方镜像**；
 *   查不到再考虑"文档缺席"（IX 特有 API 见 `knowledge/docs/InstrumentX-API枚举.md`），最后才真机探测。
 *
 * 数据源 = `skills/sv-scripting/api/*.md`（官方脚本手册的逐页镜像，由 `tools/api-docs-sync.cjs` 维护，
 *   **不要手改**）。本工具只读它，不碰宿主、不出网。
 *
 * 用法：
 *   node tools/api-lookup.cjs Note                     # 列出 Note 的全部方法（名字 + 签名）
 *   node tools/api-lookup.cjs Note#setLyrics           # 打印该方法原文（参数表 / 返回值）
 *   node tools/api-lookup.cjs Note.setLyrics           # 同上（# 与 . 都认）
 *   node tools/api-lookup.cjs --search setLyrics       # 全类搜方法名（不知道在哪个类时用）
 *   node tools/api-lookup.cjs --search 音高 --all      # 连正文一起搜（默认只搜方法名）
 *   node tools/api-lookup.cjs Note --json              # 机器可读
 *   node tools/api-lookup.cjs Note#nope                # 找不到 ⇒ exit 1（可当关卡用）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'skills', 'sv-scripting', 'api');
const IX_DOC = path.join(ROOT, 'knowledge', 'docs', 'InstrumentX-API枚举.md');

const argv = process.argv.slice(2);
const FLAG = (n) => argv.includes(n);
const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const JSON_OUT = FLAG('--json');
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

if (!fs.existsSync(API_DIR)) { console.error('❌ 找不到官方镜像目录：' + API_DIR); process.exit(2); }

/** 读一个类文件 → { class, file, methods: [{ name, sig, args, ret, body, line }] } */
function loadClass(cls) {
  const file = path.join(API_DIR, cls + '.md');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = { class: cls, file: path.relative(ROOT, file), methods: [] };
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+(.+?)\s*$/);
    if (m) {
      if (cur) out.methods.push(cur);
      const sig = m[1];
      const nm = (sig.match(/^([A-Za-z_][\w]*)/) || [])[1] || sig;
      const argsM = sig.match(/\(([^)]*)\)/);
      const retM = sig.match(/→\s*\{(.+?)\}/);
      cur = { name: nm, sig, args: argsM ? argsM[1].trim() : '', ret: retM ? retM[1] : '', line: i + 1, body: [] };
      continue;
    }
    if (cur) cur.body.push(lines[i]);
  }
  if (cur) out.methods.push(cur);
  return out;
}

function allClasses() {
  return fs.readdirSync(API_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md' && f !== '_sync.json')
    .map((f) => f.replace(/\.md$/, ''));
}

function renderMethod(cls, m, withBody) {
  const head = '【' + cls + '#' + m.name + '】 ' + m.sig + '   （' + path.join('skills/sv-scripting/api', cls + '.md') + ':' + m.line + '）';
  if (!withBody) return head;
  const body = m.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return head + '\n' + (body || '（该节无正文）');
}

// ---- 模式一：搜索 ----
if (FLAG('--search')) {
  const term = OPT('--search');
  if (!term) { console.error('❌ --search 需要关键词'); process.exit(2); }
  const lower = term.toLowerCase();
  const hits = [];
  for (const cls of allClasses()) {
    const c = loadClass(cls);
    for (const m of c.methods) {
      const inName = m.name.toLowerCase().includes(lower) || m.sig.toLowerCase().includes(lower);
      const inBody = FLAG('--all') && m.body.join('\n').toLowerCase().includes(lower);
      if (inName || inBody) hits.push({ cls, m });
    }
  }
  if (JSON_OUT) { console.log(JSON.stringify({ term, hits: hits.map((h) => ({ class: h.cls, name: h.m.name, sig: h.m.sig, args: h.m.args, ret: h.m.ret })) }, null, 2)); process.exit(hits.length ? 0 : 1); }
  if (!hits.length) {
    console.log('❌ 官方镜像里没有匹配「' + term + '」的方法。');
    console.log('   · 试 `--all` 连正文一起搜；或确认这是不是 **IX 特有** API（见 ' + path.relative(ROOT, IX_DOC) + '）。');
    process.exit(1);
  }
  console.log('== 官方镜像里匹配「' + term + '」的方法（' + hits.length + ' 个）==');
  for (const h of hits) console.log('   ' + renderMethod(h.cls, h.m, false));
  process.exit(0);
}

// ---- 模式二：查单个类 / 单个方法 ----
const target = positional[0];
if (!target) {
  console.log('用法：node tools/api-lookup.cjs <Class> | <Class#method> | --search <关键词>');
  console.log('可用类（' + allClasses().length + ' 个）：' + allClasses().join(' · '));
  process.exit(0);
}
const parts = target.split(/[#.]/);
const cls = parts[0];
const method = parts[1];
const c = loadClass(cls);
if (!c) {
  console.log('❌ 官方镜像里没有这个类：「' + cls + '」');
  console.log('   可用类：' + allClasses().join(' · '));
  console.log('   ⚠️ 若这是 **IX 特有**（官方文档不覆盖 IX）⇒ 查 ' + path.relative(ROOT, IX_DOC));
  process.exit(1);
}

if (!method) {
  if (JSON_OUT) { console.log(JSON.stringify(c, null, 2)); process.exit(0); }
  console.log('== ' + cls + '（' + c.methods.length + ' 个成员）· ' + c.file + ' ==');
  for (const m of c.methods) console.log('   ' + m.name + (m.args ? '(' + m.args + ')' : '()') + (m.ret ? ' → {' + m.ret + '}' : ''));
  console.log('\n看某个方法原文：node tools/api-lookup.cjs ' + cls + '#' + (c.methods[0] ? c.methods[0].name : 'method'));
  process.exit(0);
}

const found = c.methods.find((m) => m.name.toLowerCase() === method.toLowerCase());
if (!found) {
  const near = c.methods.filter((m) => m.name.toLowerCase().includes(method.toLowerCase())).map((m) => m.name);
  console.log('❌ ' + cls + ' 里没有「' + method + '」' + (near.length ? '（相近：' + near.join(' · ') + '）' : ''));
  console.log('   该类成员：' + c.methods.map((m) => m.name).join(' · '));
  process.exit(1);
}
if (JSON_OUT) { console.log(JSON.stringify({ class: cls, ...found }, null, 2)); process.exit(0); }
console.log(renderMethod(cls, found, true));
