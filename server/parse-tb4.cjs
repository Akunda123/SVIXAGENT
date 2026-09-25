const fs = require('fs');
const path = require('path');
// ⚠️ 样本文件路径：以前写死开发机绝对路径（含用户名）—— 2026-09-25 公开仓库前改成
//    命令行给（`node server/parse-tb6.cjs <xxx.ixp>`），不给就在家目录下找同名样本。
const os = require('os');
const FILE = process.argv[2] || path.join(os.homedir(), 'Documents', 'ixptest.ixp');
let raw = fs.readFileSync(FILE, 'utf8');
// 每个 track 对象含 "mainRef":{"database":{"name":"X"}} 或 group 的 database
// 找所有 database name 位置
const dbRe = /"database":\s*\{\s*"name":\s*"([^"]*)"/g;
const dbs = [];
let m;
while ((m = dbRe.exec(raw))) dbs.push({ name: m[1], i: m.index });
// 找所有 track 的边界（"track" 或 name）
const trackRe = /\{"name":\s*"未命名音轨[^"]*"/g;
const tracks = [];
while ((m = trackRe.exec(raw))) tracks.push({ i: m.index });
console.log('声库数:', dbs.length, ' 轨道数:', tracks.length);
// 大致映射：每个 track 后最近的 database（每个 track 有一个 mainRef/database）
for (let d = 0; d < dbs.length; d++) {
  // 该 database 之前最近的轨道
  let owner = '?';
  for (const t of tracks) if (t.i < dbs[d].i) owner = raw.substr(t.i, 30).replace(/\"/g, '');
  console.log('db[' + d + ']', dbs[d].name, ' <- ', owner.slice(0, 20));
}
