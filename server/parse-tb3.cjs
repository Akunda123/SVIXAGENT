const fs = require('fs');
const path = require('path');
// ⚠️ 样本文件路径：以前写死开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前改成
//    命令行给（`node server/parse-tb6.cjs <xxx.ixp>`），不给就在家目录下找同名样本。
const os = require('os');
const FILE = process.argv[2] || path.join(os.homedir(), 'Documents', 'ixptest.ixp');
let raw = fs.readFileSync(FILE, 'utf8');
// 找 Orchestral Trombone 1 的 database 位置，取其后的组(s)音符
const seg = raw.split('"Orchestral Trombone 1"');
console.log('长号出现次数:', seg.length - 1);
// 找长号相关的所有音符 attributes（该声库的 groupReference 段）
// 简化：找含 Trombone 之后到下一个 database 之前的 attributes
const dbRe = /"name":\s*"Orchestral Trombone 1"/g;
let m, start = -1;
const positions = [];
while ((m = dbRe.exec(raw))) positions.push(m.index);
if (positions.length) {
  const s = positions[0];
  // 长号到下一个声库名之间
  const rest = raw.slice(s);
  // 取该段所有 attributes
  const attrs = [...rest.matchAll(/"attributes":\s*\{([^}]*)\}/g)].map(x => x[0]);
  // 提取每个 attributes 里的 articulations
  const arrs = [...rest.matchAll(/"articulations":\s*\[([^\]]*)\]/g)].map(x => x[1]);
  console.log('attributes 数:', attrs.length, ' articulations 数:', arrs.length);
  const seen = {};
  for (const a of arrs) for (const v of a.matchAll(/"([^"]*)"/g)) seen[v[1]] = true;
  console.log('长号技法去重:', Object.keys(seen).sort().join(', '));
  console.log('\n长号 attributes 样例(前3):');
  attrs.slice(0, 3).forEach(a => console.log(' ', a));
}
