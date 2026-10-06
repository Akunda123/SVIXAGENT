/**
 * `skills/acep/scripts/*` 的**离线回归**（不碰 ACE、不碰任何用户工程）
 *
 * 核心手法：**自己造一个合成 ACEP2** —— 自写 1280 B 头 + 自写 CBOR 编码器 + Node 自带 `zlib.zstdCompressSync`。
 *   这样夹具自带"独立编码器"⇒ 与 `acep.cjs` 的解码器互为交叉验证，且**不需要**任何真实工程文件。
 *   （头里那 1248 B 高熵区对本技能的工具是黑盒，填空即可 —— 只有 ACE 自己才读它。）
 *
 * 覆盖（都是踩过坑或高风险的点）：
 *   ① 容器：`verify` 全绿（CBOR 用满整段）
 *   ② 音高线**三种画法**共存时 `lane-report` 三种都要报对（data / anchor 点数+绝对音高+pointsVUV / 音符 vibrato）
 *   ③ `vibrato` 子命令三条路：**键不存在⇒插入**、**已存在⇒替换**、`--clear`⇒删键（含 map 计数 -1）
 *   ④ `rap-curve` 在**只有 anchor** 的 lane 上必须**拒绝**（语义不同：锚点存绝对音高，不能拿 delta 覆盖）
 *   ⑤ `lane-poke --emit lane --split N` 的分段几何
 *   ⑥ `anchor` 子命令：追加/替换/清除三条路 + 六个负例 + **空 lane 长出第一条 entry**（留档工程就是空的）
 *   ⑦ lyric-tones 声调映射（含轻声 0、多音字、纯表回退）· ⑧ 工具内置 selftest · ⑨ `timeUnit:"sec"` 拒写
 *   ⑩ 旧壳（历史一）读/set-json 往返 + 新壳工具拒 + ⑪ `kind:0` 乐器 ⇒ 导出静音告警
 *
 * 用法：node tools/test-acep.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const ACEP = path.join(ROOT, 'skills', 'acep', 'scripts', 'acep.cjs');
const REPORT = path.join(ROOT, 'skills', 'acep', 'scripts', 'lane-report.cjs');
const POKE = path.join(ROOT, 'skills', 'acep', 'scripts', 'lane-poke.cjs');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 260) : '')); }
};
const run = (script, args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') };
};

/* ───────── 极简 CBOR 编码器（独立实现，用于造夹具）───────── */
const head = (major, n) => {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
  if (n < 0x10000) return Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n >>> 0, 1); return b;
};
const uint = (n) => (n >= 0 ? head(0, n) : head(1, -1 - n));
const text = (s) => { const b = Buffer.from(String(s), 'utf8'); return Buffer.concat([head(3, b.length), b]); };
const arr = (items) => Buffer.concat([head(4, items.length), ...items]);
const map = (pairs) => Buffer.concat([head(5, pairs.length), ...pairs.flatMap(([k, v]) => [text(k), v])]);
const dbl = (x) => { const b = Buffer.alloc(9); b[0] = 0xfb; b.writeDoubleBE(x, 1); return b; };
const floats = (xs) => arr(xs.map(dbl));
const bool = (x) => Buffer.from([x ? 0xf5 : 0xf4]);

/* ───────── 合成 ACEP2 ───────── */
const HEAD_LEN = 1280;
function packAcep2(payload) {
  const head = Buffer.alloc(HEAD_LEN, 0x5a);                       // 高熵区：内容随意（工具是黑盒复制）
  head.write('ACEP2', 0, 'latin1');
  head.writeUInt32LE(HEAD_LEN, 8);
  const comp = zlib.zstdCompressSync(payload);
  head.writeBigUInt64LE(BigInt(comp.length), 16);
  head.writeBigUInt64LE(BigInt(payload.length), 24);
  return Buffer.concat([head, comp]);
}

/** 两个音符（note0 无颤音、note1 有）+ pitchDelta（1 data + 1 anchor）+ vuv（1 data）
 *  `withInstrument: true` 再给这条轨挂一个 `kind:0`（乐器）的 FX 插槽 —— 用来验 §5.4 的静音判据。
 *  `timeUnit: 'sec'` 造一个**音频片段**（用来验 §2.5 的 tick 栅格守卫）。 */
function fixture({ anchorOnly = false, withInstrument = false, timeUnit = 'tick', emptyLane = false } = {}) {
  const n0 = map([
    ['uuid', text('{n0}')], ['pos', uint(0)], ['dur', uint(480)], ['pitch', uint(62)], ['lyric', text('啦')],
    ['extraInfo', map([])],
  ]);
  const n1 = map([
    ['uuid', text('{n1}')], ['pos', uint(480)], ['dur', uint(480)], ['pitch', uint(64)], ['lyric', text('啦')],
    ['vibrato', map([
      ['startPos', uint(133)], ['frequency', dbl(6)], ['amplitude', dbl(2.9125)], ['phase', dbl(0)],
      ['attackRatio', dbl(0.4446505010128021)], ['attackLevel', dbl(1)],
      ['releaseRatio', dbl(0.2425110936164856)], ['releaseLevel', dbl(1)],
    ])],
    ['extraInfo', map([])],
  ]);
  const data = map([['type', text('data')], ['offset', uint(0)], ['values', floats([0, 0.5, -1.25, 2, 0])]]);
  const anchor = map([
    ['type', text('anchor')],
    ['points', floats([100, 61.5, 200, 63.25, 300, 58.0])],
    ['pointsVUV', arr([uint(0), uint(0), uint(0)])],
  ]);
  const lane = emptyLane ? arr([]) : anchorOnly ? arr([anchor]) : arr([data, anchor]);
  const vuv = arr([map([['type', text('data')], ['offset', uint(0)], ['values', floats([1, 1, 1, 1])]])]);

  const pattern = map([
    ['uuid', text('{p0}')], ['name', text('P')], ['timeUnit', text(timeUnit)], ['pos', uint(0)], ['dur', uint(3840)],
    ['notes', arr([n0, n1])],
    ['parameters', map([['pitchDelta', lane], ['vuv', vuv]])],
  ]);
  const trackPairs = [
    ['uuid', text('{t0}')], ['type', text('sing')], ['name', text('T')], ['gain', uint(0)], ['pan', uint(0)],
    ['mute', bool(false)], ['solo', bool(false)], ['extraInfo', map([])],
  ];
  if (withInstrument) {
    // 混一个 kind:1（效果）与一个 kind:0（乐器）—— 判据必须只抓后者
    trackPairs.push(['externalFxChain', arr([
      map([['typeId', text('ace.native.reverb')], ['displayName', text('Little Reverb')], ['kind', uint(1)]]),
      map([['typeId', text('VST3-Synthesizer V Studio 2 ARA Plugin-x')], ['displayName', text('Synthesizer V Studio 2 ARA Plugin')], ['kind', uint(0)]]),
    ])]);
  }
  trackPairs.push(['patterns', arr([pattern])]);
  const track = map(trackPairs);
  const root = map([
    ['version', uint(22)], ['duration', uint(3840)], ['tracks', arr([track])], ['extraInfo', map([])],
  ]);
  return packAcep2(root);
}

/** 旧壳（历史一）：**包装 JSON + base64(zstd(内层 JSON 文本))** —— 只有 `set-json` 能改，
 *  ⚠️ 用户的**老工程全是这种壳**（senpa / 激光镜头 / 我曾遇到…），而此前它**零回归**。 */
function oldShellFixture() {
  const inner = {
    version: 1000,
    duration: 3840,
    tracks: [{
      uuid: '{t0}', type: 'sing', name: '旧壳轨',
      patterns: [{
        uuid: '{p0}', timeUnit: 'tick', pos: 0, dur: 3840,
        notes: [{ uuid: '{n0}', pos: 0, dur: 480, pitch: 62, lyric: '明', language: 'CHN' }],
        parameters: { pitchDelta: [] },
      }],
    }],
  };
  const comp = zlib.zstdCompressSync(Buffer.from(JSON.stringify(inner), 'utf8'));
  return Buffer.from(JSON.stringify({
    compressMethod: 'zstd', content: comp.toString('base64'), salt: 'ab'.repeat(8), version: 1000, debugInfo: '',
  }), 'utf8');
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'acep-test-'));
const FIX = path.join(TMP, 'fix.acep');
fs.writeFileSync(FIX, fixture());
const FIX_ANCHOR_ONLY = path.join(TMP, 'fix-anchor-only.acep');
fs.writeFileSync(FIX_ANCHOR_ONLY, fixture({ anchorOnly: true }));
const FIX_EMPTY_LANE = path.join(TMP, 'fix-empty-lane.acep');
fs.writeFileSync(FIX_EMPTY_LANE, fixture({ emptyLane: true }));
const OUT1 = path.join(TMP, 'o1');
const OUT2 = path.join(TMP, 'o2');

console.log('== ① 容器：合成夹具自身可解、CBOR 用满 ==');
{
  const r = run(ACEP, ['verify', FIX]);
  ok('verify 全绿（exit 0）', r.code === 0, r.err || r.out);
  ok('报了"CBOR 整段复解正好用完"', /正好用完|用满/.test(r.out), r.out.slice(-200));
  const r2 = run(ACEP, ['info', FIX]);
  ok('info 认它是 ACEP2 且头/压缩/原始长度自洽', /ACEP2/.test(r2.out) && !/⚠️/.test(r2.out), r2.out.slice(0, 200));
}

console.log('\n== ② lane-report：三种画法都要报对 ==');
{
  const r = run(REPORT, [FIX]);
  ok('报出 data 形态（样本 5）', /\[ 0\] data\s+offset=\s+0 样本=\s+5/.test(r.out), r.out);
  ok('报出 anchor 形态：**锚点** 3 个', /\*\*锚点\*\*\s+3 个/.test(r.out), r.out);
  ok('anchor 报出绝对音高值域（58–63.25）', /值域=\[58\.0000,63\.2500\]/.test(r.out), r.out);
  ok('anchor 报出 pointsVUV（3 个、取值 0）', /pointsVUV=3（取值 0）/.test(r.out), r.out);
  ok('报出第三种画法：notes[*].vibrato 1/2 个音符', /notes\[\*\]\.vibrato.*1\/2 个音符有/.test(r.out), r.out);
  ok('vibrato 行标出 startPos 是音符内偏移', /startPos=133（音符内偏移）/.test(r.out), r.out);
}

console.log('\n== ③ vibrato 子命令：插入 / 替换 / 清除 ==');
{
  const dry = run(ACEP, ['vibrato', FIX, '--freq', '5.5', '--amp', '2.0', '--start', '0.1']);
  ok('dry-run 不写文件（提示未写）', /dry-run/.test(dry.out), dry.out);
  ok('note0 判为"插入新键"、note1 判为"替换"', /note\[ 0\].*\*\*插入新键\*\*/.test(dry.out) && /note\[ 1\].*替换/.test(dry.out), dry.out);

  const w = run(ACEP, ['vibrato', FIX, '--freq', '5.5', '--amp', '2.0', '--start', '0.1', '--out', OUT1]);
  ok('写入（--out）自检 2/2 一致', /自检：2\/2 个音符值一致 ✅/.test(w.out), w.out);
  const written = path.join(OUT1, 'fix', 'fix.acep');
  ok('产出落在工程包布局里', fs.existsSync(written), written);
  ok('写出的文件 verify 仍全绿', run(ACEP, ['verify', written]).code === 0);

  const g0 = run(ACEP, ['get', written, '--path', 'tracks[0].patterns[0].notes[0].vibrato']);
  ok('原来没有 vibrato 的音符：**新键插入成功**', /map\(startPos,frequency/.test(g0.out), g0.out);
  const g1 = run(ACEP, ['get', written, '--path', 'tracks[0].patterns[0].notes[1].vibrato']);
  ok('原有 vibrato 的音符：已被替换（仍是同一形状）', /map\(startPos,frequency/.test(g1.out), g1.out);
  ok('替换后 frequency 真变成 5.5（读原始字节里的 double）',
    (() => {
      const d = run(ACEP, ['dump', written, '--json', path.join(TMP, 'w.json')]);
      if (d.code !== 0) return false;
      const t = JSON.parse(fs.readFileSync(path.join(TMP, 'w.json'), 'utf8'));
      const ns = t.tracks[0].patterns[0].notes;
      return Math.abs(ns[0].vibrato.frequency - 5.5) < 1e-9 && Math.abs(ns[1].vibrato.frequency - 5.5) < 1e-9
        && Math.abs(ns[0].vibrato.amplitude - 2.0) < 1e-9 && ns[0].vibrato.startPos === 96;
    })());

  const c = run(ACEP, ['vibrato', written, '--clear', '--out', OUT2]);
  ok('--clear 自检 2/2 已清除', /自检：2\/2 个音符已清除 ✅/.test(c.out), c.out);
  const cleared = path.join(OUT2, 'fix', 'fix.acep');
  ok('清完 verify 仍全绿（map 计数 -1 没算错）', run(ACEP, ['verify', cleared]).code === 0, run(ACEP, ['verify', cleared]).err);
  const k = run(ACEP, ['get', cleared, '--path', 'tracks[0].patterns[0].notes[0]']);
  ok('清除后音符键集里没有 vibrato', !/vibrato/.test(k.out), k.out);
  const k1 = run(ACEP, ['get', cleared, '--path', 'tracks[0].patterns[0].notes[1]']);
  ok('清除后第二个音符也没有 vibrato', !/vibrato/.test(k1.out), k1.out);
  ok('清除没伤到别的键（uuid/pos/dur/pitch/lyric 还在）', /uuid/.test(k1.out) && /pitch/.test(k1.out), k1.out);
}

console.log('\n== ④ rap-curve：只有 anchor 的 lane 必须拒绝 ==');
{
  const r = run(ACEP, ['rap-curve', FIX_ANCHOR_ONLY, '--tones', '12', '--track', '0', '--clip', '0', '--out', path.join(TMP, 'o3')]);
  ok('拒绝写入（非 0 退出）', r.code !== 0, { code: r.code, out: r.out, err: r.err });
  ok('给出的理由提到"没有一条带 values"', /没有一条带 values/.test(r.err + r.out), (r.err + r.out).slice(0, 200));
  const okCase = run(ACEP, ['rap-curve', FIX, '--tones', '12', '--track', '0', '--clip', '0', '--out', path.join(TMP, 'o4')]);
  ok('同一命令在"有 data entry"的 lane 上能正常出计划', okCase.code === 0 && /模式=overwrite/.test(okCase.out), okCase.out.slice(0, 200));
}

console.log('\n== ⑤ lane-poke：分段几何 ==');
{
  const p = path.join(TMP, 'lanes3.json');
  const r = run(POKE, [FIX, '--emit', 'lane', '--split', '2', '--out', p]);
  ok('emit=lane 能产出 2 条 entry', r.code === 0 && fs.existsSync(p), r.err || r.out);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  ok('两条 entry 都是 type=data，样本等长（5 → 3+2）', j.length === 2 && j.every((e) => e.type === 'data') && j[0].values.length === 3 && j[1].values.length === 2, j.map((e) => e.values.length));
  // ⚠️ offset 是**整数 tick**（真实工程的 entry offset 都是整数：177/1121/2243…）⇒ 工具按 round 推进：
  //    第 2 条从第 3 个样本起 ⇒ 3×15/16 = 2.8125 → round = 3。（这条期望值原先写成 2.8125，是测试写错了。）
  ok('第二条 entry 的 offset 按栅格推进并取整（round(3×15/16) = 3）', j[1].offset === 3, j[1].offset);
}

console.log('\n== ⑥ lyric-tones：声调映射 + 1:1 对齐（喂合成 notes JSON，不碰工程）==');
{
  const LYR = path.join(ROOT, 'skills', 'acep', 'scripts', 'lyric-tones.cjs');
  const hasPinyinPro = (() => { try { require.resolve('pinyin-pro', { paths: [path.join(ROOT, 'server'), ROOT] }); return true; } catch { return false; } })();
  const notesJson = (lyrics) => {
    const p = path.join(TMP, 'lyr-' + lyrics.join('_').replace(/[^\w\u4e00-\u9fa5-]/g, '') + '.json');
    fs.writeFileSync(p, JSON.stringify({
      notes: lyrics.map((l, i) => ({ uuid: '{n' + i + '}', pos: i * 480, dur: 480, pitch: 60 + i, lyric: l })),
    }));
    return p;
  };
  const tones = (lyrics, extra = []) => {
    const out = path.join(TMP, 'tones-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.txt');
    const r = run(LYR, ['--json', notesJson(lyrics), '--out', out, ...extra]);
    return { code: r.code, out: r.out, err: r.err, tones: fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim() : null };
  };

  const a = tones(['明', '天', '去', '银', '行', '取', '钱']);
  ok('「明天去银行取钱」⇒ 2142232', a.tones === '2142232', { tones: a.tones, err: a.err.slice(0, 200) });
  ok('逐音符 1:1（7 字 7 个字符）', (a.tones || '').length === 7, a.tones);

  const b = tones(['的', '啦']);
  ok('轻声「的」⇒ 0；阴平「啦」⇒ 1', b.tones === '01', { tones: b.tones, hasPinyinPro });

  const c = tones(['-', 'la', '明']);
  ok('延音 `-` 与英文 `la` ⇒ 1（不动），中文照常', c.tones === '112', c.tones);

  const d = tones(['明', '天'], ['--no-pinyin-pro']);
  ok('纯表回退路径也能给 21', d.tones === '21', d.tones);

  const poly = tones(['成', '长'], ['--no-pinyin-pro']);
  ok('表回退遇多音字（长）⇒ 1 且"why"里说明需上下文',
    poly.tones === '11' || /上下文|多音/.test(poly.out), { tones: poly.tones, out: poly.out.slice(-300) });
  const poly2 = tones(['长', '江']);
  ok('有上下文时（长江）长 = 2' + (hasPinyinPro ? '（pinyin-pro 在）' : '（无 pinyin-pro ⇒ 跳过此项）'),
    !hasPinyinPro || poly2.tones === '21', { tones: poly2.tones, hasPinyinPro });
}

console.log('\n== ⑦ §5.4 判据：kind:0 乐器 ⇒ lane-report 必须警告"导出会静音" ==');
{
  const FIX_FX = path.join(TMP, 'fix-fx.acep');
  fs.writeFileSync(FIX_FX, fixture({ withInstrument: true }));
  const r = run(REPORT, [FIX_FX]);
  ok('报出 ⛔ kind:0 乐器插槽', /⛔ externalFxChain 里有 1 个 \*\*kind:0（乐器）\*\*/.test(r.out), r.out);
  ok('点名是哪个插件', /Synthesizer V Studio 2 ARA Plugin/.test(r.out), r.out);
  ok('给出"导出会是数字静音"与修复方向', /数字静音/.test(r.out) && /置空/.test(r.out), r.out);
  const r2 = run(REPORT, [FIX]);
  ok('没有乐器插槽的工程**不**误报', !/⛔ externalFxChain/.test(r2.out), r2.out.slice(0, 300));
}

console.log('\n== ⑧ A1 自检挂在工具里（`acep.cjs selftest`）==');
{
  const r = run(ACEP, ['selftest']);
  ok('selftest exit 0', r.code === 0, (r.err || r.out).slice(-300));
  ok('报 0 失败', /0 失败/.test(r.out), r.out.slice(-120));
  ok('含"升序"与"CBOR round-trip"两类断言', /升序/.test(r.out) && /round-trip/.test(r.out), r.out.slice(0, 200));
}

console.log('\n== ⑨ ⛔ timeUnit:"sec"（音频片段）必须拒（tick 栅格不适用，不能静默写错）==');
{
  const FIX_SEC = path.join(TMP, 'fix-sec.acep');
  fs.writeFileSync(FIX_SEC, fixture({ timeUnit: 'sec' }));
  const r1 = run(ACEP, ['vibrato', FIX_SEC, '--track', '0', '--clip', '0']);
  ok('vibrato 拒（并点名 timeUnit="sec"）', r1.code !== 0 && /timeUnit = "sec"/.test(r1.err + r1.out), (r1.err + r1.out).slice(0, 240));
  const r2 = run(ACEP, ['rap-curve', FIX_SEC, '--tones', '1', '--track', '0', '--clip', '0']);
  ok('rap-curve 拒（并点名 timeUnit="sec"）', r2.code !== 0 && /timeUnit = "sec"/.test(r2.err + r2.out), (r2.err + r2.out).slice(0, 240));
  const r3 = run(REPORT, [FIX_SEC]);
  ok('lane-report 标注 timeUnit=sec 并警告', /timeUnit=sec/.test(r3.out) && /音频片段/.test(r3.out), r3.out.slice(0, 300));
  const r4 = run(REPORT, [FIX]);
  ok('tick 的工程照常（timeUnit=tick，无警告）', /timeUnit=tick/.test(r4.out) && !/音频片段/.test(r4.out), r4.out.slice(0, 200));
}

console.log('\n== ⑩ 旧壳（历史一）：读 / set-json 往返 / 新壳工具必须拒 ==');
{
  const OLD = path.join(TMP, 'old.acep');
  fs.writeFileSync(OLD, oldShellFixture());
  const i = run(ACEP, ['info', OLD]);
  ok('info 认它是"历史一：可读的旧壳"', /历史一/.test(i.out), i.out.slice(0, 200));
  const g = run(ACEP, ['get', OLD, '--path', 'tracks[0].patterns[0].notes[0].lyric']);
  ok('get 能读旧壳的内层 JSON', /明/.test(g.out), g.out);
  const uj = path.join(TMP, 'old.json');
  const u = run(ACEP, ['unpack', OLD, uj]);
  ok('unpack 出内层 JSON 树', u.code === 0 && fs.existsSync(uj), (u.err || u.out).slice(0, 160));
  const OLD2 = path.join(TMP, 'old2');
  const s = run(ACEP, ['set-json', OLD, '--path', 'tracks[0].name', '--value', '"改过的名字"', '--out', OLD2]);
  ok('set-json 写入成功', s.code === 0, (s.err || s.out).slice(0, 200));
  const written = path.join(OLD2, 'old', 'old.acep');
  ok('产出落在工程包布局里', fs.existsSync(written), written);
  if (fs.existsSync(written)) {
    const w = JSON.parse(fs.readFileSync(written, 'utf8'));
    ok('包装键与版本保留（compressMethod/salt/version）',
      w.compressMethod === 'zstd' && w.version === 1000 && typeof w.salt === 'string', Object.keys(w));
    ok('回读是新值', /改过的名字/.test(run(ACEP, ['get', written, '--path', 'tracks[0].name']).out));
    ok('内层其它数据没被动坏（音符歌词还在）',
      /明/.test(run(ACEP, ['get', written, '--path', 'tracks[0].patterns[0].notes[0].lyric']).out));
  }
  const bad = run(ACEP, ['vibrato', OLD, '--track', '0', '--clip', '0']);
  ok('新壳工具（vibrato）对旧壳**明确拒绝**（提示走 set-json）',
    bad.code !== 0 && /旧壳/.test(bad.err + bad.out), (bad.err + bad.out).slice(0, 200));
}

console.log('\n== ⑪ anchor：追加 / 替换 / 清除（第二种画法 = lane 里的绝对音高锚点 entry）==');
{
  const OUT3 = path.join(TMP, 'o5'), OUT4 = path.join(TMP, 'o6'), OUT5 = path.join(TMP, 'o7'), OUT6 = path.join(TMP, 'o8');
  const laneOf = (f) => {
    const p = path.join(TMP, 'lane-' + Math.random().toString(36).slice(2) + '.json');
    const d = run(ACEP, ['dump', f, '--json', p]);
    if (d.code !== 0) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')).tracks[0].patterns[0].parameters.pitchDelta;
  };
  const anchorsOf = (f) => (laneOf(f) || []).filter((e) => e && e.type === 'anchor');

  // —— dry-run（默认动作：lane 里正好 1 条锚点 ⇒ 替换它）——
  const dry = run(ACEP, ['anchor', FIX, '--points', '0:60,480:65']);
  ok('anchor dry-run 不写文件', /dry-run/.test(dry.out), dry.out);
  ok('lane 里正好 1 条锚点 ⇒ 默认替换 entry[1]', /默认替换 entry\[1\]/.test(dry.out), dry.out);

  // —— 五个负例（都必须**在写之前**就拒掉）——
  const bad1 = run(ACEP, ['anchor', FIX, '--append', '--points', '480:60,100:65', '--out', OUT3]);
  ok('tick 非升序 ⇒ 拒（点名第 2 个点）', bad1.code !== 0 && /升序/.test(bad1.err + bad1.out) && /480/.test(bad1.err + bad1.out), (bad1.err + bad1.out).slice(0, 200));
  const bad2 = run(ACEP, ['anchor', FIX, '--append', '--points', '100:60,200:65,300', '--out', OUT3]);
  ok('数值个数不整（3 个）⇒ 拒（提"成对"）', bad2.code !== 0 && /成对/.test(bad2.err + bad2.out), (bad2.err + bad2.out).slice(0, 200));
  const bad3 = run(ACEP, ['anchor', FIX, '--entry', '1', '--points', '100:60,200:65', '--vuv', '1,1,1', '--out', OUT3]);
  ok('--vuv 个数 ≠ 点数 ⇒ 拒', bad3.code !== 0 && /--vuv 个数/.test(bad3.err + bad3.out), (bad3.err + bad3.out).slice(0, 200));
  const bad4 = run(ACEP, ['anchor', FIX, '--clear', '--out', OUT3]);
  ok('--clear 不配 --entry ⇒ 拒（说不清删哪一条）', bad4.code !== 0 && /必须配 --entry/.test(bad4.err + bad4.out), (bad4.err + bad4.out).slice(0, 200));
  const bad5 = run(ACEP, ['anchor', FIX, '--entry', '0', '--clear', '--out', OUT3]);
  ok('--clear 点到 data 形态 ⇒ 拒（不许动音高曲线本身）', bad5.code !== 0 && /不是 anchor/.test(bad5.err + bad5.out), (bad5.err + bad5.out).slice(0, 200));
  const bad6 = run(ACEP, ['anchor', FIX, '--out', OUT3]);
  ok('既无 --points 又无 --clear ⇒ 拒', bad6.code !== 0 && /要么给 --points/.test(bad6.err + bad6.out), (bad6.err + bad6.out).slice(0, 200));
  ok('六个负例都没落任何文件', !fs.existsSync(path.join(OUT3, 'fix', 'fix.acep')));

  // —— 替换（等长/变长都要能落到原 entry 的字节区间）——
  const rep = run(ACEP, ['anchor', FIX, '--entry', '1', '--points', '0:60,480:65', '--vuv', '1,0', '--out', OUT3]);
  const f3 = path.join(OUT3, 'fix', 'fix.acep');
  ok('替换：自检"逐值一致 ✅"', /逐值一致 ✅/.test(rep.out), rep.out);
  ok('替换：产出在工程包布局里且 verify 全绿', fs.existsSync(f3) && run(ACEP, ['verify', f3]).code === 0, run(ACEP, ['verify', f3]).err);
  const a3 = anchorsOf(f3);
  ok('替换：仍是 1 条锚点、2 点、值就是新写的', a3.length === 1 && JSON.stringify(a3[0].points) === JSON.stringify([0, 60, 480, 65]), a3);
  ok('替换：pointsVUV 跟着走 [1,0]', JSON.stringify(a3[0] && a3[0].pointsVUV) === JSON.stringify([1, 0]), a3[0] && a3[0].pointsVUV);
  ok('替换没伤到同 lane 的 data entry（样本 5、第三个值仍是 -1.25）', (() => {
    const d = laneOf(f3)[0];
    return d && d.type === 'data' && d.values.length === 5 && d.values[2] === -1.25;
  })(), laneOf(f3)[0]);
  ok('替换没伤到音符（音符数 2、note1 的 vibrato 还在）', (() => {
    const p = path.join(TMP, 'rep-notes.json');
    run(ACEP, ['dump', f3, '--json', p]);
    const ns = JSON.parse(fs.readFileSync(p, 'utf8')).tracks[0].patterns[0].notes;
    return ns.length === 2 && !!ns[1].vibrato;
  })());

  // —— 追加（只能追加到 lane 末尾：插中间会动后面所有 entry 的字节位移）——
  const app = run(ACEP, ['anchor', f3, '--append', '--points', '600:70,700:68.5', '--vuv', '1,1', '--out', OUT4]);
  const f4 = path.join(OUT4, 'fix', 'fix.acep');
  ok('追加：自检"逐值一致 ✅"', /逐值一致 ✅/.test(app.out), app.out);
  ok('追加：lane 2 → 3 条 entry（数组计数 +1 没算错）', laneOf(f4).length === 3, laneOf(f4).map((e) => e.type));
  ok('追加：锚点变 2 条，先前那条原样还在', anchorsOf(f4).length === 2 && JSON.stringify(anchorsOf(f4)[0].points) === JSON.stringify([0, 60, 480, 65]), anchorsOf(f4).map((e) => e.points));
  ok('追加：verify 全绿', run(ACEP, ['verify', f4]).code === 0);
  const amb = run(ACEP, ['anchor', f4, '--points', '0:60', '--out', path.join(TMP, 'o9')]);
  ok('两条锚点又没指定 ⇒ 拒，逼用户 --entry / --append 二选一', amb.code !== 0 && /多条锚点/.test(amb.err + amb.out), (amb.err + amb.out).slice(0, 240));

  // —— 清除（逐条删到没有）——
  const clr = run(ACEP, ['anchor', f4, '--entry', '2', '--clear', '--out', OUT5]);
  const f5 = path.join(OUT5, 'fix', 'fix.acep');
  ok('清除：自检"锚点 2 → 1 条 ✅"', /锚点 2 → 1 条 ✅/.test(clr.out), clr.out);
  ok('清除：lane 3 → 2 条 entry 且 verify 全绿', laneOf(f5).length === 2 && run(ACEP, ['verify', f5]).code === 0, laneOf(f5).map((e) => e.type));
  const clr2 = run(ACEP, ['anchor', f5, '--entry', '1', '--clear', '--out', OUT6]);
  const f6 = path.join(OUT6, 'fix', 'fix.acep');
  ok('再清掉最后一条 ⇒ 锚点 1 → 0，lane 只剩 data', anchorsOf(f6).length === 0 && laneOf(f6).length === 1 && laneOf(f6)[0].type === 'data', laneOf(f6).map((e) => e.type));
  ok('全清后 data 形态与值都没被动（样本 5、-1.25 还在）', laneOf(f6)[0].values.length === 5 && laneOf(f6)[0].values[2] === -1.25);
  ok('全清后 verify 仍全绿', run(ACEP, ['verify', f6]).code === 0);
  const rpt = run(REPORT, [f6]);
  ok('全清后 lane-report 不再报锚点（音符 vibrato 照常报）', !/\*\*锚点\*\*/.test(rpt.out) && /vibrato/.test(rpt.out), rpt.out.slice(0, 300));

  // —— 空 lane（真实"留档工程"就是这个样子：键在、一条 entry 都没有）——
  const emp = run(ACEP, ['anchor', FIX_EMPTY_LANE, '--append', '--points', '0:62,960:60', '--vuv', '1,0', '--out', path.join(TMP, 'o10')]);
  const f7 = path.join(TMP, 'o10', 'fix-empty-lane', 'fix-empty-lane.acep');
  ok('空 lane 追加：自检"逐值一致 ✅"', /逐值一致 ✅/.test(emp.out), emp.out);
  ok('空 lane 追加：数组 0 → 1 条 entry（0x80 → 0x81 长出来了）', fs.existsSync(f7) && anchorsOf(f7).length === 1, fs.existsSync(f7) ? laneOf(f7) : emp.err);
  ok('空 lane 追加：verify 全绿', fs.existsSync(f7) && run(ACEP, ['verify', f7]).code === 0, run(ACEP, ['verify', f7]).err);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
