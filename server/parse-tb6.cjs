const fs = require('fs');
const path = require('path');
// ⚠️ 样本文件路径：以前写死开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前改成
//    命令行给（`node server/parse-tb6.cjs <xxx.ixp>`），不给就在家目录下找同名样本。
const os = require('os');
const FILE = process.argv[2] || path.join(os.homedir(), 'Documents', 'ixptest.ixp');
let raw = fs.readFileSync(FILE, 'utf8');
const mutes = ['Straight', 'Cup', 'Stem', 'Stopped'];
const dbRe = /"database":\s*\{\s*"name":\s*"([^"]*)"/g;
const dbs = [];
let m;
while ((m = dbRe.exec(raw))) dbs.push({ name: m[1], i: m.index });
// 找每个 mute 值出现在哪个 database 之后
for (const mu of mutes) {
  const locs = [];
  let idx = -1;
  while ((idx = raw.indexOf('"' + mu + '"', idx + 1)) !== -1) {
    // 找该位置前最近的 database
    let owner = '?';
    for (const d of dbs) if (d.i < idx) owner = d.name;
    locs.push(owner);
  }
  console.log(mu + ' -> ' + [...new Set(locs)].join(', '));
}
