#!/usr/bin/env node
/**
 * gen-demo-newfun.cjs —— 生成 **1.1.0 新功能录制页**：`docs/demo/rec-newfun.html`
 *
 * 为什么要它：用户要「用 rec.html 的页面样式做个新功能页面，录视频用」。
 *   `rec.html` 本身是**生成物**（`tools/gen-demo-rec.cjs` 从 `index.html` 换几个常量而来），
 *   内容（`DEMO.nav`）来自根目录 `README-发布版草案-v2.md` 的用户手册正文 —— 那是**整本手册**，
 *   而这次要录的是**本轮新功能**。所以这里做一份**派生页**：
 *     样式 / 片头 / 交互 全部沿用 rec.html（一个字都不改），**只换 `DEMO.nav` 数据 + 标题 + 起始条目**。
 *   ⛔ 不手改 `rec.html`（那是生成物，会被 `gen-demo-rec` 覆盖）；本页也是生成物 ⇒ **改内容改本文件**再重跑。
 *
 * 顺序（用户 2026-10-06 指定）：**① 修 bug · ② BPM · ③ 识谱 · ④ ACE**（ACE 的"宿主接入"与"侧边工具"合成一条）。
 * 密度（用户 2026-10-06 指定）：**不做 hover 展开的要点**，每条**只用一行概括功能，不废话**
 *   ⇒ 所有条目 `items: []`（没有那排可点的小格）、`blocks: []`（除开场那张总览卡，它只放 4 行目录）。
 *
 * 用法：`node tools/gen-demo-newfun.cjs`
 * 产物：`docs/demo/rec-newfun.html`（`docs/` 不进版本库；`bg.png` / 片头 logo 同目录，相对路径天然可用）
 * 录制提示：`rec-newfun.html` = 录制版（左侧 3 条、字号大）；`?intro=0` 不播片头；`?intro=NNNN` 跳到 NNNN 毫秒并停住；
 *           ↑↓←→ 换条目 · 数字键 1–9 跳条目 · E 折叠左侧弧。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'demo', 'rec.html');
const DST = path.join(ROOT, 'docs', 'demo', 'rec-newfun.html');

/* ══════════════════════════════════════════════════════════════════
   内容：1.1.0 新功能（口径与 `docs/release-notes-1.1.0.md` §1–§8 一致）
   schema（照抄 rec.html 的 DEMO.nav 条目）：{ num, label, sub, lead, items, blocks }
     · `sub:0` = 章（右侧只有导语 + blocks）· `sub:1` = 小节
     · 本页**只用 `lead` 一行**：`items` / `blocks` 一律空 ⇒ 右边不会出现可点小格与展开文本
     · `label` 在录制版里会被 `LABEL_MAX=13` 截断 ⇒ **标签控制在 13 字以内**
   ══════════════════════════════════════════════════════════════════ */
const NAV = [
  {
    num: '◆', label: '这次更新了什么', sub: 0,
    lead: '<b>AKDAgent 1.1.0</b>：修「配好了还是只回一个 error」，让设置里能看到<b>真正在用的模型</b>；' +
          '新增<b>速度包络测量</b> · <b>内置识谱</b> · <b>ACE Studio</b> 支持。',
    items: [],
    blocks: [
      { t: 'ul', items: [
        '<b>① 修复一些模型 bug</b> —— 失败给原因，模型设置不再哑失败',
        '<b>② 速度包络测量</b> —— 音频出「时间 → 速度」曲线，不需要宿主在线',
        '<b>③ 内置识谱</b> —— 谱子图片 / PDF 直接变成音符，全程离线',
        '<b>④ ACE Studio</b> —— 接入第三方宿主 + 补齐 ACE 侧工具',
      ] },
    ],
  },
  {
    num: '1', label: '修复一些模型 bug', sub: 1,
    lead: '失败不再只回一句「回合结束（error）」，而是<b>把原因与提供方的原始错误直接摆出来</b>；' +
          '设置里也能看到<b>真正在用的模型</b>，填错显示名当场纠正。',
    items: [], blocks: [],
  },
  {
    num: '2', label: '速度包络测量', sub: 1,
    lead: '给一段音频就产出「<b>时间 → 速度</b>」曲线，专治 <b>118–122 这种小幅浮动</b>的伴奏 / 现场录音，' +
          '<b>不需要任何宿主在线</b>，并附一份点击轨让你听一遍就知道准不准。',
    items: [], blocks: [],
  },
  {
    num: '3', label: '内置识谱', sub: 1,
    lead: '谱子图片 / PDF <b>直接认成 MusicXML</b> 再导进工程，<b>全程本地离线</b>（不联网、不上传）；' +
          '导入前给预览、覆盖率如实报。',
    items: [], blocks: [],
  },
  {
    num: '4', label: 'ACE 支持与工具', sub: 1,
    lead: '接入第三方宿主 <b>ACE Studio</b>（走它自己的 CLI，不走我们的桥），并补齐 ACE 侧成体系工具：' +
          '<b>导入乐谱 · 歌词 · 人声参数</b>，加上宿主无关的统一写入器。',
    items: [], blocks: [],
  },
];

const TITLE = 'AKDAgent 1.1.0 新功能 · 录制版（左侧 3 条）';
const ICON = { 1: '⚠', 2: '〰', 3: '♪', 4: '◉' };

/* ── 生成 ─────────────────────────────────────────────────────── */
let html = fs.readFileSync(SRC, 'utf8');

/** 按花括号配对，抠出 `const DEMO = {...};` 整块（数据里含 `}` 与引号 ⇒ 不能靠正则） */
function demoBlockRange(s) {
  const at = s.indexOf('const DEMO = ');
  if (at < 0) throw new Error('rec.html 里找不到 `const DEMO = `（模板变了？）');
  const open = s.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return [at, i + 1]; }
  }
  throw new Error('DEMO 的花括号不配对');
}

const [a, b] = demoBlockRange(html);
html = html.slice(0, a) + 'const DEMO = {nav:' + JSON.stringify(NAV) + '}' + html.slice(b);

// 标题
html = html.replace(/<title>[^<]*<\/title>/, '<title>' + TITLE + '</title>');

// 开局落在第一条（开场卡）
html = html.replace(
  /const START = NAV\.findIndex\(c => c\.num === '[^']*'\);/,
  "const START = NAV.findIndex(c => c.num === '\u25c6');"
);

// 图标表（章底下的小节用；本页没有小节，留着不影响）
html = html.replace(
  /const ICON = \{[^}]*\};/,
  'const ICON = ' + JSON.stringify(ICON).replace(/"/g, "'") + ';'
);

// 来源说明（别让 rec.html 那句"由 gen-demo-rec 生成"误导后来人）
html = html.replace(
  /<!-- ⚠️ 本文件由 tools\/gen-demo-rec\.cjs[\s\S]*?-->/,
  '<!-- ⚠️ 本文件由 **tools/gen-demo-newfun.cjs** 生成（= rec.html 的样式/片头/交互 + 1.1.0 新功能内容）。\n' +
  '     要改内容请改 tools/gen-demo-newfun.cjs 里的 NAV，再重跑：node tools/gen-demo-newfun.cjs —— 别手改这份 -->'
);

for (const [what, re] of [
  ['标题', /<title>AKDAgent 1\.1\.0 新功能/],
  ['内容', /"label":"内置识谱"/],
  ['顺序（BPM 在识谱前）', /"label":"速度包络测量"[\s\S]*?"label":"内置识谱"/],
  ['没有 hover 要点（功能条目 items/blocks 全空）', /"label":"修复一些模型 bug","sub":1,"lead":"[^"]*","items":\[\],"blocks":\[\]/],
  ['起始条目', /c\.num === '\u25c6'/],
  ['来源说明', /gen-demo-newfun\.cjs/],
]) if (!re.test(html)) throw new Error(`自检失败：${what} 没写进去`);

fs.writeFileSync(DST, html, 'utf8');
console.log(`✓ 已生成 ${path.relative(ROOT, DST)}`);
console.log('  顺序：' + NAV.filter((e) => e.sub).map((e) => e.num + ' ' + e.label).join('  →  '));
console.log(`  共 ${NAV.length} 条（1 开场 + ${NAV.filter((e) => e.sub).length} 功能）· 每条只有一行 lead · ${(html.length / 1024).toFixed(1)} KB`);
console.log('  录制提示：?intro=0 不播片头 · ?intro=NNNN 跳到 NNNN 毫秒停住 · ↑↓←→ 换条目 · 数字键 1-9 跳条目 · E 折叠左侧');
