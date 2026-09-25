#!/usr/bin/env node
/*
 * .svp 音频轨 schema 提取器 v2（只读）
 * =====================================================================
 * 为「diff .svp 注入」方案的 ① 步提供**实测 schema**：
 *   SV 脚本 API 造不出音频轨（只有只读 + setTimeRange 移动）⇒ 只能走文件层，
 *   把音频轨的 JSON 块写进 .svp。本脚本从**真实工程**反推它的完整结构。
 *
 * v2 相比 v1 增加：
 *   ① **深层键路径**聚合（`mainRef.audio.filename`、`mixer.gainDecibel`、`groups[].x` …）
 *   ② **一条完整音频轨样本**（UUID/路径做匿名化缩写，便于照抄结构）
 *   ③ `takes` 的真实位置（v1 在 mainRef.audio 下没找到，说明在别处）
 *   ④ 与人声轨的**深层路径差异**
 *
 * 只读：不改任何 .svp；仅写一份报告到 %TEMP%。
 * 用法：node svp-audio-schema.cjs [目录...]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      path.join(os.homedir(), 'Documents', 'Dreamtonics'),
      path.join(os.homedir(), 'Documents', 'OPSV'),
      path.join(os.homedir(), 'Documents'),
    ];

function walk(dir, out = [], depth = 0) {
  if (depth > 6) return out;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (e.name.toLowerCase().endsWith('.svp')) out.push(p);
  }
  return out;
}

const T = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const ell = (s, n = 70) => { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; };
const isUUID = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
const redact = (v) => {
  if (isUUID(v)) return '<uuid>';
  if (typeof v === 'string' && (v.includes('/') || v.includes('\\')) && v.length > 24) {
    return '<path>' + v.slice(-18);
  }
  return v;
};

// 递归收集「叶子键路径」；数组折叠为 `[]`
function pathsOf(obj, prefix, acc) {
  if (Array.isArray(obj)) {
    // 只看第一个元素当代表（数组元素同构）
    if (obj.length && typeof obj[0] === 'object' && obj[0] !== null) {
      pathsOf(obj[0], prefix + '[]', acc);
    } else if (obj.length) {
      acc[prefix + '[]'] = acc[prefix + '[]'] || { n: 0, t: T(obj[0]), sample: redact(obj[0]) };
      acc[prefix + '[]'].n++;
    }
    return acc;
  }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      const p = prefix ? prefix + '.' + k : k;
      const v = obj[k];
      if (v && typeof v === 'object') pathsOf(v, p, acc);
      else {
        acc[p] = acc[p] || { n: 0, t: T(v), sample: redact(v) };
        acc[p].n++;
      }
    }
  }
  return acc;
}

const files = [...new Set(ROOTS.flatMap((r) => walk(r)))];
console.log(`找到 ${files.length} 个 .svp\n`);

const audioPaths = {}, vocalPaths = {};
let nAudio = 0, nVocal = 0;
const samples = [];           // 收集几条音频轨原文（用于整条样本）
const takeHits = {};          // `takes` 出现位置统计

for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }

  // 顺带统计 takes 出现的位置（只在音频轨里找）
  for (const t of (j.tracks || [])) {
    const isAudio = t.isInstrumental === true || (t.mainRef && t.mainRef.audio !== undefined);
    if (!isAudio) continue;
    nAudio++;
    pathsOf(t, '', audioPaths);
    for (const k of Object.keys(t)) {
      if (JSON.stringify(t[k]).includes('"takes"')) takeHits[k] = (takeHits[k] || 0) + 1;
    }
    if (t.mainRef && t.mainRef.takes) takeHits['mainRef.takes'] = (takeHits['mainRef.takes'] || 0) + 1;
    if (samples.length < 3) samples.push({ file: path.basename(f), track: t });
  }
  for (const t of (j.tracks || [])) {
    const isAudio = t.isInstrumental === true || (t.mainRef && t.mainRef.audio !== undefined);
    if (!isAudio) { nVocal++; pathsOf(t, '', vocalPaths); }
  }
}

const table = (m, total) => Object.entries(m).sort((a, b) => b[1].n - a[1].n)
  .map(([k, v]) => `| \`${k}\` | ${v.n}/${total} | ${v.n === total ? '**必有**' : '可选'} | ${v.t} | \`${String(ell(v.sample, 60)).replace(/\|/g, '\\|')}\` |`)
  .join('\n');

const onlyAudio = Object.keys(audioPaths).filter((k) => !(k in vocalPaths));
const onlyVocal = Object.keys(vocalPaths).filter((k) => !(k in audioPaths));
const shared = Object.keys(audioPaths).filter((k) => k in vocalPaths);

const L = [];
L.push('# .svp 音频轨 schema（v2 · 深层键路径实测）', '');
L.push(`扫描 .svp **${files.length}** 个 · 音频轨 **${nAudio}** 条 · 人声轨 ${nVocal} 条`, '');
L.push('## 音频轨 深层键路径（含出现率）', '', '| 路径 | 出现 | 判定 | 类型 | 示例 |', '|---|---|---|---|---|');
L.push(table(audioPaths, nAudio));
L.push('', '## 音频轨**独有**的路径', '');
L.push(onlyAudio.map((k) => `- \`${k}\`  ${audioPaths[k].n}/${nAudio}  ${audioPaths[k].t}  \`${ell(audioPaths[k].sample, 60)}\``).join('\n') || '（无）');
L.push('', '## 人声轨**独有**的路径', '');
L.push(onlyVocal.map((k) => `- \`${k}\`  ${vocalPaths[k].n}/${nVocal}  ${vocalPaths[k].t}`).join('\n') || '（无）');
L.push('', `## 共有的路径（${shared.length} 条）`, '');
L.push(shared.map((k) => `\`${k}\``).join(' · '));
L.push('', '## `takes` 出现在哪', '');
L.push(Object.entries(takeHits).map(([k, c]) => `- \`${k}\` × ${c}`).join('\n') || '- 音频轨里**没有** takes（只在人声轨？）');

for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  L.push('', `## 音频轨完整样本 ${i + 1}（来自 ${s.file}；UUID→\`<uuid>\`、长路径→\`<path>…\`）`, '', '```json');
  L.push(JSON.stringify(s.track, (k, v) => redact(v), 2).split('\n').slice(0, 120).join('\n'));
  L.push('```');
}

const out = path.join(os.tmpdir(), 'svp-audio-track-schema.md');
fs.writeFileSync(out, L.join('\n'), 'utf8');

console.log(`音频轨 ${nAudio} 条 / 人声轨 ${nVocal} 条`);
console.log(`报告：${out}\n`);
console.log('音频轨深层路径（出现率 ≥ 90%）：');
for (const [k, v] of Object.entries(audioPaths).sort((a, b) => b[1].n - a[1].n)) {
  if (v.n / nAudio >= 0.9) console.log(`  ${k.padEnd(42)} ${v.n}/${nAudio}  ${v.t}  ${ell(v.sample, 48)}`);
}
console.log('\n音频轨独有路径：');
for (const k of onlyAudio) console.log(`  ${k.padEnd(42)} ${audioPaths[k].n}/${nAudio}`);
console.log('\ntakes 位置：', Object.keys(takeHits).join(', ') || '(未找到)');
