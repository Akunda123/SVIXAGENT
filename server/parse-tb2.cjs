const fs = require('fs');
const path = require('path');
// ⚠️ 样本文件路径：以前写死开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前改成
//    命令行给（`node server/parse-tb6.cjs <xxx.ixp>`），不给就在家目录下找同名样本。
const os = require('os');
const FILE = process.argv[2] || path.join(os.homedir(), 'Documents', 'ixptest.ixp');
let raw = fs.readFileSync(FILE, 'utf8');
// 找每个 "database":{"name":"X"} 和 之后的 articulations 段（更粗粒度：按 name 出现切）
const dbs = [...raw.matchAll(/"database":\s*\{\s*"name":\s*"([^"]*)"/g)].map(m => ({ name: m[1], i: m.index }));
const all = [...raw.matchAll(/"articulations":\s*\[([^\]]*)\]/g)].map(m => ({ i: m.index, v: [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]) }));
// 每个声库名 → 其后出现的技法（用 name 和下一个 name 之间）
let lastArt = -1;
const byVoice = {};
for (let d = 0; d < dbs.length; d++) {
  const start = dbs[d].i;
  const end = d < dbs.length - 1 ? dbs[d + 1].i : raw.length;
  const set = {};
  for (const a of all) if (a.i > start && a.i < end) for (const v of a.v) set[v] = true;
  byVoice[dbs[d].name] = Object.keys(set).sort();
}
for (const [k, v] of Object.entries(byVoice)) {
  if (v.length) console.log(k + ' => ' + v.join(', '));
}
