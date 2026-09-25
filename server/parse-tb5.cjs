const fs = require('fs');
const path = require('path');
// ⚠️ 样本文件路径：以前写死开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前改成
//    命令行给（`node server/parse-tb6.cjs <xxx.ixp>`），不给就在家目录下找同名样本。
const os = require('os');
const FILE = process.argv[2] || path.join(os.homedir(), 'Documents', 'ixptest.ixp');
let raw = fs.readFileSync(FILE, 'utf8');
const dbRe = /"database":\s*\{\s*"name":\s*"([^"]*)"/g;
const dbs = [];
let m;
while ((m = dbRe.exec(raw))) dbs.push({ name: m[1], i: m.index });
const trackRe = /\{"name":\s*"未命名音轨[^"]*"/g;
const tracks = [];
while ((m = trackRe.exec(raw))) tracks.push({ i: m.index, name: raw.substr(m.index + 9, 18) });
// 打印每个声库对应的轨道名（精确到最近前面的 track name）
const prints = [];
for (let d = 0; d < dbs.length; d++) {
  let owner = '?';
  for (const t of tracks) if (t.i < dbs[d].i) owner = t.name;
  if (dbs[d].name.indexOf('Trumpet') >= 0 || dbs[d].name.indexOf('Trombone') >= 0 || dbs[d].name.indexOf('French') >= 0 || dbs[d].name.indexOf('Tuba') >= 0)
    prints.push('db[' + d + '] ' + dbs[d].name + ' <- ' + owner);
}
console.log(prints.join('\n'));
