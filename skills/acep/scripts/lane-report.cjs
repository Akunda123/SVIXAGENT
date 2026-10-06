/* 看 .acep 里的参数 lane 到底有没有真数据（每条 entry 的 offset / 长度 / 非零数 / 极值 / 粗略形状）
 *
 * 用法：
 *   node scripts/lane-report.cjs <file.acep> [--lane RE] [--spark] [--all-tracks]
 *   node scripts/lane-report.cjs <dumped.json> [同上]      ← 也可直接喂 acep.cjs dump --json 的产物
 *
 * 背景（见 `acep` 技能 §2.2 / §3.3 / §4b）：
 *   parameters.<lane> = [ {type:"data", offset, values:[float64…]}, … ]  —— 可以有多条 entry。
 *   ⚠️ 2026-10-04 实测：ACE **接受**文件级的 pitchDelta 改动（重开 + save 逐值保留、渲染照唱）；
 *   而"值被清成 0"的旧结论其实是**我方写值 bug**（`rapPoints` 未排序 ⇒ 整段求值为 0）。
 *   ⇒ 写完必须用**独立读法**核对形状：这个脚本就是干这个的（别只信工具自己的"值一致 ✅"）。
 *
 * 坐标：tick = offset + i * 15/16（1024 Hz 栅格），见技能 §3.1。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ACEP = path.join(__dirname, 'acep.cjs');

const argv = process.argv.slice(2);
if (!argv.length) {
  console.error('用法: node scripts/lane-report.cjs <file.acep|dumped.json> [--lane RE] [--spark] [--all-tracks]');
  process.exit(2);
}
const input = argv[0];
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const laneRe = new RegExp(opt('--lane', '.'), 'i');
const wantSpark = flag('--spark');
const allTracks = flag('--all-tracks');

const err = (m) => { console.error('error: ' + m); process.exit(1); };

let tree, tmp = null;
if (/\.json$/i.test(input)) {
  tree = JSON.parse(fs.readFileSync(input, 'utf8'));
} else {
  if (!fs.existsSync(input)) err('文件不存在: ' + input);
  tmp = path.join(os.tmpdir(), 'acep-lane-report-' + process.pid + '.json');
  execFileSync(process.execPath, [ACEP, 'dump', input, '--json', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
  tree = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt = (x, n = 4) => (num(x) ? x.toFixed(n) : String(x));

// 一条曲线的粗略形状：按 60 列重采样，用 ▁▂▃▄▅▆▇█ 画
const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(vals) {
  const cols = 60;
  if (vals.length < 2) return '';
  const out = [];
  for (let c = 0; c < cols; c++) {
    const a = Math.floor((c * vals.length) / cols);
    const b = Math.max(a + 1, Math.floor(((c + 1) * vals.length) / cols));
    let mn = Infinity, mx = -Infinity;
    for (let i = a; i < b; i++) { mn = Math.min(mn, vals[i]); mx = Math.max(mx, vals[i]); }
    out.push(Math.abs(mx - mn) < 1e-9 ? SPARK[4] : (mx > 0 && mn >= 0 ? SPARK[6] : (mx <= 0 && mn < 0 ? SPARK[2] : SPARK[5])));
  }
  return out.join('');
}

function statEntry(e) {
  // ⚠️ pitchDelta 有**两种存储形态**（2026-10-05 用户工程实测）：
  //   ① `type:"data"`   + `offset` + `values`     —— 逐采样 **delta**（相对音符音高）
  //   ② `type:"anchor"` + `points` + `pointsVUV`  —— 锚点，**没有 offset/values**；
  //        `points` = [tick, 绝对音高, tick, 绝对音高, …] 一维数组；`pointsVUV` = 每个点一个 0/1
  //   ⇒ 老版本只认 `values`，把 anchor 显示成"0 样本 / 全零"，**误导**（这条是读用户工程时照出来的）。
  if (Array.isArray(e.points)) {
    const pts = e.points.map(Number).filter((v) => num(v));
    const n = Math.floor(pts.length / 2);
    const ticks = [];
    const vals = [];
    for (let i = 0; i < n; i++) { ticks.push(pts[i * 2]); vals.push(pts[i * 2 + 1]); }
    const vuv = Array.isArray(e.pointsVUV) ? e.pointsVUV.map(Number) : null;
    return {
      kind: 'points', type: e.type, offset: null, n,
      tickBegin: ticks.length ? ticks[0] : 0, tickEnd: ticks.length ? ticks[n - 1] : 0,
      nz: vals.filter((v) => v !== 0).length,
      mn: vals.length ? Math.min(...vals) : 0, mx: vals.length ? Math.max(...vals) : 0,
      firstNz: -1, lastNz: -1, vals, ticks, vuv,
    };
  }
  const vals = Array.isArray(e.values) ? e.values : [];
  let nz = 0, mn = Infinity, mx = -Infinity, firstNz = -1, lastNz = -1;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!num(v)) continue;
    if (v !== 0) { nz++; if (firstNz < 0) firstNz = i; lastNz = i; }
    if (v < mn) mn = v; if (v > mx) mx = v;
  }
  const offset = typeof e.offset === 'number' ? e.offset : 0;
  return {
    kind: 'values', type: e.type, offset, n: vals.length,
    tickBegin: offset, tickEnd: offset + (vals.length * 15) / 16,
    nz, mn: nz ? mn : 0, mx: nz ? mx : 0, firstNz, lastNz, vals,
  };
}

const tracks = Array.isArray(tree.tracks) ? tree.tracks : [];
console.log('文件  ' + input);
console.log('轨道数 ' + tracks.length + '（' + (allTracks ? '全部' : '只列有内容的') + '）');

for (let ti = 0; ti < tracks.length; ti++) {
  const t = tracks[ti];
  const pats = Array.isArray(t.patterns) ? t.patterns : [];
  if (!pats.length) continue;

  // 先算该轨有没有任何 lane 数据，决定要不要打
  const blocks = [];
  for (let pi = 0; pi < pats.length; pi++) {
    const p = pats[pi];
    const params = p.parameters && typeof p.parameters === 'object' ? p.parameters : {};
    const notes = Array.isArray(p.notes) ? p.notes : [];
    const lines = [];
    for (const lane of Object.keys(params)) {
      if (!laneRe.test(lane)) continue;
      const entries = Array.isArray(params[lane]) ? params[lane] : [];
      if (!entries.length) continue;
      const stats = entries.map(statEntry);
      const totalNz = stats.reduce((a, s) => a + s.nz, 0);
      lines.push({ lane, stats, totalNz });
    }
    if (lines.length) blocks.push({ pi, p, notes, lines, vocal: p.vocalControls });
  }
  if (!blocks.length) continue;

  console.log('\n── 轨道[' + ti + '] ' + (t.name || '(无名)') + '  type=' + t.type + '  patterns=' + pats.length
    + '  uuid=' + String(t.uuid).slice(0, 8) + '…');

  // ⚠️ 5.4 的判据：`externalFxChain` 里插了 `kind:0`（乐器）⇒ 这条 **Sing 轨的出声被接走**，导出会是**数字静音**。
  //    实测（2026-10-05）：ACE 原生效果都是 `kind:1`；那条轨上插了「Synthesizer V Studio 2 ARA Plugin」(kind 0)
  //    时 `export audio` 报 succeeded 但整段 max 幅度 0.00000；把 externalFxChain 置空后立刻有声。
  const fx = Array.isArray(t.externalFxChain) ? t.externalFxChain : [];
  const instruments = fx.filter((x) => x && Number(x.kind) === 0);
  if (instruments.length) {
    const names = instruments.map((x) => x.displayName || x.pluginName || x.typeId).join(' / ');
    console.log('     ⛔ externalFxChain 里有 ' + instruments.length + ' 个 **kind:0（乐器）** 插槽：' + names);
    console.log('        ⇒ 这条 Sing 轨的出声被乐器接走，**导出会是数字静音**（音素/时长都正常，只是没声）。');
    console.log('        实测修复：把 externalFxChain 置空（副本上验过）⇒ 立刻有声。见技能 §5.4。');
  }

  for (const b of blocks) {
    const p = b.p;
    // ⚠️ pattern 的键名是 `pos`/`dur`（不是 `position`/`duration`）—— 老版本读错了，一直显示 undefined（2026-10-05 修）
    const pPos = p.pos !== undefined ? p.pos : p.position;
    const pDur = p.dur !== undefined ? p.dur : p.duration;
    // ⚠️ `timeUnit` 可为 `tick` | `sec`（**`sec` = 音频片段**）—— 把 sec 明确标出来，别让人以为 tick 换算适用
    const tu = p.timeUnit !== undefined ? String(p.timeUnit) : '(缺省 tick)';
    console.log('\n   pattern[' + b.pi + ']  notes=' + b.notes.length
      + '  pos=' + pPos + ' dur=' + pDur
      + '  timeUnit=' + tu + (tu === 'sec' ? '  ⛔ **音频片段：tick 栅格换算不适用**' : '')
      + (p.clipPos !== undefined ? '  clipPos=' + p.clipPos + ' clipDur=' + p.clipDur : ''));
    if (b.notes.length) {
      const ns = b.notes.map((n) => n.pitch + '/' + (n.lyric == null ? '·' : n.lyric));
      console.log('     音符: ' + ns.slice(0, 40).join(' ') + (ns.length > 40 ? ' …' : ''));
      // 音高线的**第三种画法**不在这条 lane 里：它是音符自己的 `vibrato` 字段（跟随音符走，startPos 是音符内偏移）。
      // ⚠️ 没有颤音的音符**连键都没有** ⇒ 用 `'vibrato' in n` 判，别用真假值。
      const vib = b.notes.filter((n) => n && typeof n === 'object' && 'vibrato' in n);
      if (vib.length) {
        console.log('     ★ notes[*].vibrato（第三种画法：跟随音符走的颤音）' + vib.length + '/' + b.notes.length + ' 个音符有：');
        for (const n of vib) {
          const v = n.vibrato || {};
          console.log('       pos=' + n.pos + ' pitch=' + n.pitch + ' dur=' + n.dur
            + '  startPos=' + v.startPos + '（音符内偏移）  frequency=' + v.frequency + '  amplitude=' + v.amplitude
            + '  phase=' + v.phase + '  attack=' + v.attackRatio + '/' + v.attackLevel + '  release=' + v.releaseRatio + '/' + v.releaseLevel);
        }
      }
    }
    if (b.vocal) {
      const keys = Object.keys(b.vocal);
      console.log('     vocalControls 键: ' + keys.join(' '));
      if (b.vocal.__dynamic) {
        const d = b.vocal.__dynamic;
        const ln = Array.isArray(d.lines) ? d.lines.length : 0;
        console.log('       __dynamic: global=' + JSON.stringify(d.global) + ' lines=' + ln);
      }
    }
    for (const L of b.lines) {
      console.log('\n     lane ' + L.lane + ' —— entry ' + L.stats.length + ' 条，非零点共 ' + L.totalNz);
      for (let k = 0; k < L.stats.length; k++) {
        const s = L.stats[k];
        if (s.kind === 'points') {
          const vuvNote = s.vuv ? '  pointsVUV=' + s.vuv.length + '（取值 ' + [...new Set(s.vuv)].join('/') + '）' : '';
          console.log('       [' + String(k).padStart(2) + '] ' + String(s.type || '?').padEnd(8)
            + ' **锚点** ' + String(s.n).padStart(3) + ' 个'
            + ' tick=[' + s.tickBegin.toFixed(1) + ',' + s.tickEnd.toFixed(1) + ']'
            + ' 值域=[' + fmt(s.mn) + ',' + fmt(s.mx) + ']' + vuvNote);
          console.log('            点（tick→值）: ' + s.ticks.map((t, i) => t.toFixed(0) + '→' + fmt(s.vals[i], 3)).join('  '));
          continue;
        }
        console.log('       [' + String(k).padStart(2) + '] ' + String(s.type || '?').padEnd(8)
          + ' offset=' + String(s.offset).padStart(7)
          + ' 样本=' + String(s.n).padStart(5)
          + ' tick=[' + s.tickBegin.toFixed(0) + ',' + s.tickEnd.toFixed(0) + ']'
          + ' 非零=' + String(s.nz).padStart(5)
          + (s.nz ? ' 值域=[' + fmt(s.mn) + ',' + fmt(s.mx) + '] 首个非零@' + s.firstNz + ' 末个@' + s.lastNz : ' ← 全零/空'));
        if (wantSpark && s.nz) {
          console.log('            值抽稀: ' + [0, 0.25, 0.5, 0.75, 1].map((f) => fmt(s.vals[Math.min(s.n - 1, Math.round(f * (s.n - 1)))] , 3)).join('  '));
          console.log('            ' + sparkline(s.vals));
        }
      }
    }
  }
}
