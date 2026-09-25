#!/usr/bin/env node
/**
 * 面板/桥/客户端 文案符号替换工具（2026-09-16）
 *
 * 背景：emoji 自带字体与行高 ⇒ 信息框行距不齐（用户实测截图确认）。用户选定 **B 档（半角符号）**：
 *   ✅→✓   ❌→✗   ⚠️→!   ⏳→(去掉，句子自带…)   ⏹→·   ⏭→»   ✔→✓   ℹ️→i
 *   （A 档纯 ASCII 备选：✓→[OK] 等，见 --tier A；C 档=保留 emoji）
 *
 * 用法：
 *   node tools/apply-emoji-set.cjs --dry          # 只打印将改哪些行（安全）
 *   node tools/apply-emoji-set.cjs --tier B       # 应用 B 档（默认）
 *   node tools/apply-emoji-set.cjs --tier A       # 应用 A 档（纯 ASCII，最保守）
 *
 * 覆盖文件：面板 `sv/panel/AKDAgentPanel.js` · 桥 `sv/lua/AKDAgentBridge.lua` · 四语 `electron/src/i18n/common.json`
 * ⚠️ 改完要：面板→跑 test-panel-js + 部署（宿主重载）；桥→跑 Lua VM + 部署（重跑桥）；四语→校验键数（重启客户端）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const tier = (() => { const i = argv.indexOf('--tier'); return (i >= 0 ? argv[i + 1] : 'B') || 'B'; })();

/** 档位映射：⚠️ 与 B 档符号都**单色且等大** ⇒ 保留（用户 2026-09-16 裁定：
 *  「允许使用无色等大的 emoji 如 ⚠️」）；只换**彩色** emoji（✅❌⏳⏹⏭），它们自带行高、行距不齐。 */
const TIERS = {
  A: [['✅', '[OK]'], ['❌', '[X]'], ['✔', '[OK]'], ['⏭', '>>'], ['⏹', '[.]'], ['ℹ️', '[i]'], ['ℹ', '[i]'], ['🧑', '<'], ['⏳ ', '']],
  B: [['✅', '✓'], ['❌', '✗'], ['✔', '✓'], ['⏭', '»'], ['⏹', '·'], ['ℹ️', 'i'], ['ℹ', 'i'], ['🧑', '<'], ['⏳ ', '']],
  C: [],
};

/** 只在**字符串字面量内部**替换：注释（// * /* -- ）与标识符一律不动
 *  （本仓注释里大量用 ⚠️ 作标记，改了会毁约定 —— dry-run 抓到过）。 */
function transformLine(line, map) {
  let out = '';
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') { out += ch + (line[i + 1] || ''); i++; continue; }   // 转义
      if (ch === quote) { quote = null; out += ch; continue; }
      // 在引号内：逐条映射（含多字符键）
      let matched = false;
      for (const [a, b] of map) {
        if (line.startsWith(a, i)) { out += b; i += a.length - 1; matched = true; break; }
      }
      if (!matched) out += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    out += ch;
  }
  return out;
}

const FILES = [
  { f: 'sv/panel/AKDAgentPanel.js', desc: '面板（JS）' },
  { f: 'sv/lua/AKDAgentBridge.lua', desc: '桥（Lua）' },
  { f: 'electron/src/i18n/common.json', desc: '客户端四语文案' },
];

const map = TIERS[tier];
if (!map) { console.error('❌ 未知档位：' + tier + '（可选 A / B / C）'); process.exit(2); }
if (!map.length) { console.log('档位 C = 保留 emoji，无需改动。'); process.exit(0); }

console.log('== 符号替换（档位 ' + tier + '）' + (DRY ? ' [dry-run]' : '') + ' ==');
console.log('映射：' + map.map(([a, b]) => a + '→' + b).join('  '));
console.log('');

let totalHits = 0;
for (const { f, desc } of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log('⚠️ 跳过（不存在）：' + f); continue; }
  const src = fs.readFileSync(p, 'utf8');
  const lines = src.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const before = lines[i];
    const after = transformLine(before, map);
    if (after !== before) {
      hits.push({ line: i + 1, before: before.trim().slice(0, 96), after: after.trim().slice(0, 96) });
      lines[i] = after;
    }
  }
  console.log('── ' + desc + '（' + f + '）—— ' + hits.length + ' 行受影响');
  for (const h of hits) console.log('   ' + h.line + ': ' + h.before + '\n        → ' + h.after);
  totalHits += hits.length;
  if (!DRY && hits.length) fs.writeFileSync(p, lines.join('\n'), 'utf8');
  console.log('');
}

// ⏳ 在四语里是"进行中"的标记：B 档去掉它（句子本身已带 … 或 working…）
const CJ = path.join(ROOT, 'electron/src/i18n/common.json');
if (!DRY && fs.existsSync(CJ)) {
  const t = fs.readFileSync(CJ, 'utf8');
  const t2 = t.replace(/⏳ /g, '');
  if (t2 !== t) { fs.writeFileSync(CJ, t2, 'utf8'); console.log('── 四语：去掉「⏳ 」前缀（句子自带省略号）'); totalHits += 1; }
  else console.log('── 四语：已无 ⏳ 前缀');
}

console.log('合计 ' + totalHits + ' 行' + (DRY ? '（dry-run，未写盘）' : '，已写盘'));
console.log('');
console.log('后续（别漏）：');
console.log('  面板：node tools/test-panel-js.cjs && node tools/build-panel-lua.cjs --deploy ix');
console.log('  桥　：python tools/lua-vm.py sv/lua/tests/test-ops.lua  然后复制到各宿主 scripts\\Agent\\');
console.log('  四语：校验四语键数一致 → 用户重启客户端');
