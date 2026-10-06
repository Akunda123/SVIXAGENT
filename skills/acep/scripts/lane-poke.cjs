/* 把一个 lane entry 的 values 改成任意期望值，导出 JSON（配 `acep.cjs set-value --path '…values' --value-file` 用）
 *
 * 用法：
 *   node scripts/lane-poke.cjs <file.acep> [--lane pitchDelta] [--track 0] [--clip 0] [--entry 0] \
 *        [--const V] [--at I:V] [--range A-B:V] [--scale K] [--echo N] [--emit values|lane] [--split N] [--out values.json]
 *
 * 用途：判定 ACE 对某条 lane 的接受规则（幅度？单点？全量？）——实测 2026-10-04：pitchDelta 的**任意值都收**
 *   （常量 +1.5、6 档阶梯 +1.5/−1.5/−4/−6/−8/−12 重开 + save 后逐值保留）。
 *   原值只读，绝不写 .acep —— 写 .acep 交给 acep.cjs set-value（它有自检 + 备份）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ACEP = path.join(__dirname, 'acep.cjs');
const argv = process.argv.slice(2);
const input = argv[0];
if (!input) { console.error('用法见文件头'); process.exit(2); }
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

const lane = opt('--lane', 'pitchDelta');
const track = Number(opt('--track', 0));
const clip = Number(opt('--clip', 0));
const entry = Number(opt('--entry', 0));
const out = opt('--out', null);

const tmp = path.join(os.tmpdir(), 'acep-lane-poke-' + process.pid + '.json');
execFileSync(process.execPath, [ACEP, 'dump', input, '--json', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
const tree = JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.unlinkSync(tmp);

const pat = tree.tracks[track].patterns[clip];
const entries = pat.parameters[lane];
if (!Array.isArray(entries) || !entries.length) { console.error('这条 lane 没有 entry'); process.exit(1); }
const e = entries[entry];
const vals = (e.values || []).map(Number);
console.log(`lane=${lane} track=${track} clip=${clip} entry=${entry}  type=${e.type} offset=${e.offset} 样本=${vals.length}`);

const ops = [];
if (opt('--const', null) !== null) ops.push(['const', Number(opt('--const', 0))]);
if (opt('--scale', null) !== null) ops.push(['scale', Number(opt('--scale', 1))]);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--at') { const [ix, v] = String(argv[i + 1]).split(':'); ops.push(['at', Number(ix), Number(v)]); }
  if (argv[i] === '--range') { const [r, v] = String(argv[i + 1]).split(':'); const [a, b] = r.split('-'); ops.push(['range', Number(a), Number(b), Number(v)]); }
}
for (const o of ops) {
  if (o[0] === 'const') { vals.fill(o[1]); console.log(`  op const ${o[1]}`); }
  else if (o[0] === 'scale') { for (let i = 0; i < vals.length; i++) vals[i] = vals[i] * o[1]; console.log(`  op scale ${o[1]}`); }
  else if (o[0] === 'at') { if (o[1] < 0 || o[1] >= vals.length) throw new Error('--at 越界'); vals[o[1]] = o[2]; console.log(`  op at ${o[1]} = ${o[2]}`); }
  else if (o[0] === 'range') { for (let i = o[1]; i <= o[2] && i < vals.length; i++) vals[i] = o[3]; console.log(`  op range ${o[1]}..${o[2]} = ${o[3]}`); }
}
if (!ops.length) console.log('  （没有 op，只回显原值）');

let nz = 0, mn = Infinity, mx = -Infinity;
for (const v of vals) { if (v !== 0) nz++; if (v < mn) mn = v; if (v > mx) mx = v; }
console.log(`结果：非零 ${nz}/${vals.length} 值域=[${mn},${mx}]`);

const echo = Number(opt('--echo', 6));
if (echo) console.log('抽稀：' + Array.from({ length: echo }, (_, k) => vals[Math.round((k * (vals.length - 1)) / Math.max(1, echo - 1))]).join(' '));

// —— 输出：默认给"values 数组"（配 set-value --path '…values'）；
//    `--emit lane --split N` 给"整条 lane 的 entry 数组"（配 set-value --path '…pitchDelta'）——用来造多 entry 场景
const emit = opt('--emit', 'values');
const split = Math.max(1, Number(opt('--split', 1)));
if (out) {
  let json;
  if (emit === 'lane') {
    const per = Math.ceil(vals.length / split);
    const out2 = [];
    for (let s = 0; s < split; s++) {
      const from = s * per, to = Math.min(vals.length, from + per);
      if (from >= to) break;
      out2.push({ type: 'data', offset: Math.round(e.offset + from * 15 / 16), values: vals.slice(from, to) });
    }
    json = out2;
    console.log(`emit=lane split=${split} ⇒ ${out2.length} 条 entry：` + out2.map((x) => `off${x.offset}/${x.values.length}样本`).join(' · '));
  } else {
    json = vals;
  }
  fs.writeFileSync(out, JSON.stringify(json));
  console.log('写出 ' + out + '（' + fs.statSync(out).size + ' B）');
}
