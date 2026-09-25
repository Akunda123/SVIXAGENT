const fs = require('fs');
const path = require('path');
// ⚠️ 样本文件路径：以前写死开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前改成
//    命令行给（`node server/parse-tb6.cjs <xxx.ixp>`），不给就在家目录下找同名样本。
const os = require('os');
const FILE = process.argv[2] || path.join(os.homedir(), 'Documents', 'ixptest.ixp');
let raw = fs.readFileSync(FILE, 'utf8');
// 找 Orchestral Trombone 1 的位置
const idx = raw.indexOf('Orchestral Trombone 1');
if (idx < 0) { console.log('not found'); process.exit(0); }
const seg = raw.slice(idx, idx + 6000);
// 提取该段的 articulations 数组
const arts = [...seg.matchAll(/\"articulations\":\s*\[([^\]]*)\]/g)].map(m => ({ i: m.index, v: [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]) }));
const seen = {};
for (const a of arts) for (const v of a.v) seen[v] = true;
console.log('长号段技法去重:', Object.keys(seen).sort().join(', '));
console.log('长号段 articulations 数组数:', arts.length);
// 输出该段所有音符的 attrs（含可能特殊值）
console.log('\n长号段原始片段（找 checkbox 相关）：');
const m = raw.match(/"name":\s*"Orchestral Trombone 1"[^}]*"attributes":\s*\{(.{0,200})/s);
if (m) console.log(m[0].slice(0, 500));
