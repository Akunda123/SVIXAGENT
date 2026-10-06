#!/usr/bin/env node
/* .acep 工具箱（随 `acep` 技能分发；零依赖，只用 node: 内置）
 *
 * 用法：
 *   node acep.cjs info      <file.acep>
 *   node acep.cjs unpack    <file.acep> <out.json>          ← 两种壳都认（新版→CBOR 树；旧版→内层 JSON）
 *   node acep.cjs get       <file.acep> --path '…'          ← 两种壳都认
 *   node acep.cjs dump      <file.acep> [--tree N] [--find RE] [--json out.json]   ← 两种壳都认
 *   node acep.cjs set-json  <file.acep> --path '…' --value V --out <目录>          ← **只给旧壳（JSON）**
 *   node acep.cjs verify    <file.acep> [--expect "新字节"]
 *   node acep.cjs dump      <file.acep> [--tree N] [--find RE] [--json out.json]
 *   node acep.cjs get       <file.acep> --path 'tracks[0].patterns[0].notes[0].syllable'
 *   node acep.cjs set-text  <file.acep> --old "l an" --new "l a l a" --out <目录>
 *   node acep.cjs set-array <file.acep> --sig v0,v1 --values "1,2,3"|@file --count N --out <目录>
 *   node acep.cjs rap-curve <file.acep> --tones "1234" [--track N --clip M] [--from-lyric-tail] [--create-lane] \
 *                           [--out <目录> | --in-place]   ← rap 音高线（移植 SV1「语调教.js」；不给写入目标时=只出计划）
 *   node acep.cjs vibrato   <file.acep> [--track N --clip M] [--notes uuid,…] [--freq 5.5] [--amp 1.5] \
 *                           [--start 0.14 | --start-tick 133] [--phase 0] [--attack A] [--release R] [--level 1] \
 *                           [--raw JSON] [--clear] [--out <目录> | --in-place]   ← 音符颤音（音高线第三种画法；缺省=全部音符）
 *   node acep.cjs anchor    <file.acep> [--track N --clip M] [--entry I | --append] \
 *                           --points "100:61.5,200:63" [--vuv "0,0"] [--clear] [--out <目录> | --in-place]   ← 锚点 entry（第二种画法；值是**绝对音高**）
 *   node acep.cjs lane-report… 见 scripts/lane-report.cjs / lane-poke.cjs / f0-contour.cjs（随技能分发）
 *
 * 纪律（照技能 §4 / §8）：
 *   · 只写副本：`--out <目录>` 里按 ACE 自己的工程包布局产出
 *     `<目录>/<名字>/<名字>.acep` + `<目录>/<名字>/autosave/<名字>_save_<时间戳>.acep` + `<目录>/<名字>/Samples/`
 *   · 头 1280 B 原样复制，只改 offset 8（头长）/ 16（压缩长）/ 24（原始长）
 *   · `set-text` 只在**唯一命中**时写；`set-array` 长度必须与检测到的元素数一致
 *   · 写完必自检（回读 + CBOR 整段复解 + 新字节在位）
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ─────────────────────────── 容器 ─────────────────────────── */

const HEAD_BYTES = 1280; // 头部长度由文件自身声明；这里只是常见值

/** 先判"壳"：新版二进制 `ACEP2` / 旧版 JSON 外壳（`{"compressMethod":"zstd","content":"<base64>"}`）/ 不认识 */
function probeShell(file) {
  const buf = fs.readFileSync(file);
  const magic = buf.slice(0, 5).toString('latin1');
  if (magic === 'ACEP2') return { kind: 'acep2', buf, magic };
  if (buf.slice(0, 2).toString('latin1') === '{"') return { kind: 'json', buf, magic };
  return { kind: 'unknown', buf, magic };
}

function readContainer(file) {
  const s = probeShell(file);
  if (s.kind === 'json') {
    throw new Error('这是**旧壳（JSON 外壳）**⇒ 编辑用 `acep.cjs set-json`、看内容用 `unpack`/`get`（见技能 §1.0）');
  }
  if (s.kind === 'unknown') throw new Error('不认识的壳（首 5 字节 = ' + JSON.stringify(s.magic) + '）');
  const buf = s.buf;
  const magic = s.magic;
  const headLen = buf.readUInt32LE(8);
  const compLen = Number(buf.readBigUInt64LE(16));
  const rawLen = Number(buf.readBigUInt64LE(24));
  if (magic !== 'ACEP2') throw new Error('不是 ACEP2 容器（magic=' + JSON.stringify(magic) + '）');
  if (headLen < 8 || headLen > buf.length) throw new Error('头部长度不合理：' + headLen);
  if (headLen + compLen !== buf.length) {
    throw new Error(`头部长度+压缩长度 ≠ 文件大小（${headLen}+${compLen} ≠ ${buf.length}）`);
  }
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw new Error('这个 Node 没有 zstd（需要 Node ≥ 22.15 的 zlib.zstdDecompressSync）');
  }
  const payload = Buffer.from(zlib.zstdDecompressSync(buf.slice(headLen, headLen + compLen)));
  return { buf, headLen, compLen, rawLen, payload, declaredRaw: rawLen };
}

/** 重新打包：头原样复制，只改 16/24 两个长度字段 */
function packContainer(head, payload) {
  const comp = zlib.zstdCompressSync(payload);
  const out = Buffer.alloc(head.length + comp.length);
  head.copy(out, 0);
  out.writeUInt32LE(head.length, 8);
  out.writeBigUInt64LE(BigInt(comp.length), 16);
  out.writeBigUInt64LE(BigInt(payload.length), 24);
  comp.copy(out, head.length);
  return out;
}

/* ─────────────────────────── CBOR ─────────────────────────── */

/** 最小 CBOR 解码器。两个已踩过的坑（改动前先读技能 §2.3）：half float 0xf9；head() 已消费浮点负载
 *  opts.offsets = true 时额外返回 `offsets`：每个条目路径 → 它在 payload 里的字节区间（`{start, end}`）——
 *  用来精确插字节（如给空 lane 新建 entry）。路径形如 `$.tracks[0].patterns[0].parameters.pitchDelta`。 */
function decode(buf, opts) {
  let p = 0;
  const recordOffsets = !!(opts && opts.offsets);
  const offsets = {};
  const read = (n) => { const v = buf.slice(p, p + n); p += n; return v; };
  const u = (n) => { let v = 0n; for (const b of read(n)) v = (v << 8n) | BigInt(b); return v; };
  function head() {
    const ib = buf[p++];
    const major = ib >> 5, ai = ib & 0x1f;
    let val;
    if (ai < 24) val = BigInt(ai);
    else if (ai === 24) val = u(1);
    else if (ai === 25) val = u(2);
    else if (ai === 26) val = u(4);
    else if (ai === 27) val = u(8);
    else val = null; // 28-30 保留；31 = 不定长
    return { major, ai, val };
  }
  function half(h) {
    const sign = (h & 0x8000) ? -1 : 1, exp = (h >> 10) & 0x1f, frac = h & 0x3ff;
    if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
    if (exp === 31) return frac ? NaN : sign * Infinity;
    return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
  }
  function item(path) {
    const startOff = p;
    const { major, ai, val } = head();
    const done = (v) => {
      if (recordOffsets && path) offsets[path] = { start: startOff, end: p };
      return v;
    };
    switch (major) {
      case 0: return done(Number(val));
      case 1: return done(-1 - Number(val));
      case 2:
        if (val === null) { const parts = []; while (buf[p] !== 0xff) parts.push(item(path)); p++; return done(Buffer.concat(parts.filter(Buffer.isBuffer))); }
        return done(read(Number(val)));
      case 3:
        if (val === null) { let s = ''; while (buf[p] !== 0xff) s += item(path); p++; return done(s); }
        return done(read(Number(val)).toString('utf8'));
      case 4: {
        const a = [];
        if (val === null) { let i = 0; while (buf[p] !== 0xff) a.push(item(path + '[' + (i++) + ']')); p++; }
        else for (let i = 0; i < Number(val); i++) a.push(item(path + '[' + i + ']'));
        return done(a);
      }
      case 5: {
        const m = {};
        if (val === null) {
          while (buf[p] !== 0xff) { const k = item(path + '.<key>'); const kk = typeof k === 'string' ? k : String(k); m[kk] = item(path + '.' + kk); }
          p++;
        } else {
          for (let i = 0; i < Number(val); i++) { const k = item(path + '.<key>'); const kk = typeof k === 'string' ? k : String(k); m[kk] = item(path + '.' + kk); }
        }
        return done(m);
      }
      case 6: return done({ __tag: Number(val), value: item(path) });
      case 7:
        if (ai === 20) return done(false);
        if (ai === 21) return done(true);
        if (ai === 22) return done(null);
        if (ai === 23) return done(undefined);
        // ⚠️ 这里绝不能再 read()：浮点负载已被 head() 读进 val
        if (ai === 25) return done(half(Number(val)));
        if (ai === 26) { const b = Buffer.alloc(4); b.writeUInt32BE(Number(val) >>> 0); return done(b.readFloatBE(0)); }
        if (ai === 27) { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(val)); return done(b.readDoubleBE(0)); }
        return done({ __simple: val === null ? null : Number(val) });
      default: throw new Error('major 非法 @' + (p - 1));
    }
  }
  const value = item('$');
  return { value, consumed: p, total: buf.length, offsets: recordOffsets ? offsets : undefined };
}

/** CBOR text 项：长度 <24 → 0x60|len；<256 → 0x78 len；<65536 → 0x79 len16 */
function textItem(s) {
  const b = Buffer.from(s, 'utf8');
  if (b.length < 24) return Buffer.concat([Buffer.from([0x60 | b.length]), b]);
  if (b.length < 256) return Buffer.concat([Buffer.from([0x78, b.length]), b]);
  if (b.length < 65536) return Buffer.concat([Buffer.from([0x79, b.length >> 8, b.length & 0xff]), b]);
  throw new Error('文本太长（本工具不支持 ≥64 KB 的 text）');
}

/** float64 项（0xfb + 8 B 大端）—— .acep 的参数数组就是它 */
function floatItem(v) {
  const b = Buffer.alloc(9);
  b[0] = 0xfb;
  b.writeDoubleBE(v, 1);
  return b;
}

/* ─────────────────────────── 路径取值 ─────────────────────────── */

function pickPath(root, expr) {
  const toks = String(expr).replace(/^\$\.?/, '').split(/\.(?![^\[]*\])/).filter(Boolean);
  let cur = root;
  for (const t of toks) {
    const m = t.match(/^([^\[\]]*)((\[\d+\])*)$/);
    if (!m) throw new Error('看不懂的路径段：' + t);
    if (m[1]) cur = cur == null ? undefined : cur[m[1]];
    for (const idx of (m[2].match(/\d+/g) || [])) cur = cur == null ? undefined : cur[Number(idx)];
  }
  return cur;
}

const summarize = (v) => {
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'number') return `array[${v.length}] 首=${v[0]} 尾=${v[v.length - 1]}`;
    return `array[${v.length}]` + (v.length && v[0] && typeof v[0] === 'object' ? ' of map(' + Object.keys(v[0]).slice(0, 12).join(',') + ')' : '');
  }
  if (Buffer.isBuffer(v)) return 'bytes[' + v.length + ']';
  if (v && typeof v === 'object') return 'map(' + Object.keys(v).slice(0, 16).join(',') + ')';
  return JSON.stringify(v);
};

/* ─────────────────────────── 子命令 ─────────────────────────── */

const argv = process.argv.slice(2);
const cmd = argv[0];
const getArg = (n, d) => { const i = argv.indexOf(n); return i > 0 ? argv[i + 1] : d; };
const need = (c, msg) => { if (!c) { console.error('用法: ' + msg); process.exit(2); } };

/** 按 ACE 自己的布局写出工程包（缺这一步的裸 .acep 会被 ACE 当成"无名临时工程"，见技能 §5.2） */
function writePackage(outDir, name, bytes) {
  const dir = path.join(outDir, name);
  fs.mkdirSync(path.join(dir, 'autosave'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Samples'), { recursive: true });
  const main = path.join(dir, name + '.acep');
  fs.writeFileSync(main, bytes);
  // 快照名照 ACE 自己的习惯：本地时间 + 毫秒（`<名字>_save_2026_10_04_16_32_52_067.acep`）
  const d = new Date();
  const p2 = (n, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getFullYear()}_${p2(d.getMonth() + 1)}_${p2(d.getDate())}_${p2(d.getHours())}_${p2(d.getMinutes())}_${p2(d.getSeconds())}_${p2(d.getMilliseconds(), 3)}`;
  const snap = path.join(dir, 'autosave', `${name}_save_${ts}.acep`);
  fs.writeFileSync(snap, bytes);
  return { main, snap, dir };
}

function cmdInfo(file) {
  const s = probeShell(file);
  if (s.kind !== 'acep2') {
    let which = s.kind === 'json' ? '旧壳（JSON 外壳，不是 ACEP2 二进制容器）' : '不认识（首 5 字节 = ' + JSON.stringify(s.magic) + '）';
    if (s.kind === 'json') {
      try {
        const w = JSON.parse(s.buf.toString('utf8'));
        if (w.compressMethod === 'zstd') which = '历史一：可读的旧壳（base64 → zstd → 内层 JSON）—— 不维护';
        else if (w.content !== undefined && (w.version === 2 || (typeof w.salt === 'string' && w.salt.includes('*')))) which = '历史二：**加密的旧壳**（version 2 · salt 两段）—— **不支持、不尝试解密**';
        else if (w.content === undefined) which = '**不是已知的 .acep 壳**（既没有 compressMethod 也没有 content —— 像普通 JSON，别当工程文件）';
        else which = '旧壳，但不认识它的算法 —— 不维护';
      } catch { /* 不是合法 JSON，就按"旧壳"报 */ }
    }
    console.log(`文件        ${file}`);
    console.log(`大小        ${s.buf.length} B`);
    console.log(`壳          ${which}`);
    console.log(`前 200 字符 ${JSON.stringify(s.buf.slice(0, 200).toString('utf8'))}`);
    console.log('⇒ 只有 `ACEP2` 才是当前格式（§1.1 起讲的就是它）；历史壳见技能 §1.0，不给支持');
    return;
  }
  const c = readContainer(file);
  console.log(`文件        ${file}`);
  console.log(`大小        ${c.buf.length} B`);
  console.log(`magic       ${JSON.stringify(c.buf.slice(0, 5).toString('latin1'))} + ${[...c.buf.slice(5, 8)].map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`头部长度    ${c.headLen}`);
  console.log(`压缩长度    ${c.compLen}   （头+压缩 = ${c.headLen + c.compLen} vs 文件 ${c.buf.length} ✅）`);
  console.log(`原始长度    ${c.rawLen}   （zstd 实解 ${c.payload.length} ${c.payload.length === c.rawLen ? '✅' : '⚠️ 不一致'}）`);
  console.log(`压缩比      ${(c.compLen / c.payload.length * 100).toFixed(1)}%`);
  const dec = decode(c.payload);
  console.log(`CBOR        ${dec.total ? `消费 ${dec.consumed}/${dec.total}` : ''} ${dec.consumed === dec.total ? '✅ 正好用完整段' : '⚠️ 剩 ' + (dec.total - dec.consumed) + ' B'}`);
  if (dec.value && typeof dec.value === 'object' && !Array.isArray(dec.value)) {
    const keys = Object.keys(dec.value);
    console.log(`顶层 map    ${keys.length} 键：${keys.join(' ')}`);
  }
}

function cmdVerify(file, expect) {
  let bad = 0;
  const say = (ok, msg) => { console.log((ok ? '  ok   ' : '  BAD  ') + msg); if (!ok) bad++; };
  const c = readContainer(file);
  say(c.headLen + c.compLen === c.buf.length, '头长 + 压缩长 = 文件大小');
  say(c.payload.length === c.rawLen, `头声明的原始长度 = 实解长度（${c.rawLen} / ${c.payload.length}）`);
  const dec = decode(c.payload);
  say(dec.consumed === dec.total, `CBOR 整段复解正好用完（${dec.consumed}/${dec.total}）`);
  if (expect) say(c.payload.indexOf(Buffer.from(expect, 'utf8')) >= 0, `新字节在位：${JSON.stringify(expect)}`);
  console.log(bad ? `\n❌ ${bad} 项不合格` : '\n✅ 自检全绿');
  process.exit(bad ? 1 : 0);
}

function cmdDump(file, treeDepth, find, jsonOut) {
  const s = probeShell(file);
  let root, payloadLen, how;
  if (s.kind === 'acep2') {
    const c = readContainer(file);
    const dec = decode(c.payload);
    root = dec.value; payloadLen = c.payload.length; how = `CBOR 消费 ${dec.consumed}/${dec.total}`;
  } else if (s.kind === 'json') {
    const r = readJsonShell(file);
    root = r.tree; payloadLen = r.payloadLen; how = '旧壳（内层 JSON 文本）';
  } else {
    throw new Error('不认识的壳（首 5 字节 = ' + JSON.stringify(s.magic) + '）');
  }
  console.log(`payload ${payloadLen} B · ${how}`);
  if (root && typeof root === 'object' && !Array.isArray(root)) {
    console.log(`顶层 map，${Object.keys(root).length} 键：`);
    for (const k of Object.keys(root)) console.log('  ' + k.padEnd(30) + summarize(root[k]));
  }
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(root, (k, v) => (Buffer.isBuffer(v) ? '<bytes ' + v.length + '>' : v), 1), 'utf8');
    console.log('已写 ' + jsonOut);
  }
  if (treeDepth) {
    const maxD = Number(treeDepth), lines = [];
    const walk = (v, p, d) => {
      const pad = '  '.repeat(d);
      if (d > maxD) { lines.push(pad + p + ' …'); return; }
      if (Array.isArray(v)) {
        lines.push(pad + p + `  [array ${v.length}]`);
        const show = Math.min(v.length, 6);
        for (let i = 0; i < show; i++) walk(v[i], '[' + i + ']', d + 1);
        if (v.length > show) lines.push(pad + '  … +' + (v.length - show) + ' 项');
      } else if (v && typeof v === 'object' && !Buffer.isBuffer(v)) {
        lines.push(pad + p + `  {map ${Object.keys(v).length}}`);
        for (const k of Object.keys(v)) walk(v[k], k, d + 1);
      } else {
        lines.push(pad + p + ' = ' + String(Buffer.isBuffer(v) ? '<bytes ' + v.length + '>' : JSON.stringify(v)).slice(0, 90));
      }
    };
    walk(root, '$', 0);
    console.log(`\n--- 结构树（深度 ${maxD}，${lines.length} 行，前 400 行）`);
    console.log(lines.slice(0, 400).join('\n'));
  }
  if (find) {
    const re = new RegExp(find, 'i'), hits = [];
    const walk = (v, p) => {
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, p + '[' + i + ']')); return; }
      if (v && typeof v === 'object' && !Buffer.isBuffer(v)) {
        for (const k of Object.keys(v)) { if (re.test(k)) hits.push({ p: p + '.' + k, v: v[k] }); walk(v[k], p + '.' + k); }
        return;
      }
      if (typeof v === 'string' && re.test(v)) hits.push({ p, v });
    };
    walk(root, '$');
    console.log(`\n--- 搜 /${find}/ 命中 ${hits.length} 处`);
    for (const h of hits.slice(0, 60)) console.log('  ' + h.p + '  =  ' + String(summarize(h.v)).slice(0, 140));
  }
}

function cmdGet(file, expr) {
  need(expr, 'node acep.cjs get <file.acep> --path <表达式>');
  const root = loadTree(file);
  const v = pickPath(root, expr);
  if (v === undefined) { console.error('❌ 路径取不到：' + expr); process.exit(3); }
  console.log(expr + '  =  ' + summarize(v));
  if (Array.isArray(v) && v.length && typeof v[0] === 'number') {
    console.log('  首 8 个： ' + v.slice(0, 8).join(' '));
    console.log('  尾 8 个： ' + v.slice(-8).join(' '));
  }
}

function cmdSetText(file, oldText, newText, outDir) {
  need(oldText !== undefined && newText !== undefined && outDir,
    'node acep.cjs set-text <file.acep> --old <原文本> --new <新文本> --out <目录>');
  const c = readContainer(file);
  const needle = textItem(oldText);
  const at = c.payload.indexOf(needle);
  if (at < 0) { console.error('❌ payload 里找不到 ' + JSON.stringify(oldText)); process.exit(3); }
  const again = c.payload.indexOf(needle, at + 1);
  if (again >= 0) { console.error(`❌ ${JSON.stringify(oldText)} 不唯一（@${at} 与 @${again}）⇒ 拒绝写，先用 dump 看清上下文`); process.exit(3); }
  const repl = textItem(newText);
  const next = Buffer.concat([c.payload.slice(0, at), repl, c.payload.slice(at + needle.length)]);
  // ⚠️ CBOR 的 map/array 长度是"元素个数" ⇒ 换长文本只需改它自己的长度前缀，其余一个字节都不用动
  console.log(`定位 @${at}：${JSON.stringify(oldText)} (${needle.length} B) → ${JSON.stringify(newText)} (${repl.length} B) · payload ${c.payload.length} → ${next.length}`);
  const bytes = packContainer(c.buf.slice(0, c.headLen), next);
  const name = path.basename(file, '.acep');
  const w = writePackage(outDir, name, bytes);
  console.log('写出 ' + w.main + `（${bytes.length} B）`);
  console.log('     ' + w.snap);
  cmdVerify(w.main, newText);
}

function cmdSetArray(file, sigArg, valuesArg, countArg, outDir) {
  need(sigArg && valuesArg && outDir, 'node acep.cjs set-array <file.acep> --sig v0,v1 --values a,b,c|@file --count N --out <目录>');
  const c = readContainer(file);
  const sig = sigArg.split(/[,\s]+/).filter(Boolean).map(Number);
  if (sig.some((x) => !Number.isFinite(x))) { console.error('❌ --sig 里有非数字'); process.exit(2); }
  const sigBytes = Buffer.concat(sig.map(floatItem));
  const at = c.payload.indexOf(sigBytes);
  if (at < 0) { console.error('❌ 找不到这个签名（前两个 float64）'); process.exit(3); }
  if (c.payload.indexOf(sigBytes, at + 1) >= 0) { console.error('❌ 签名不唯一 ⇒ 拒绝写（加长签名或改用 set-text 的思路）'); process.exit(3); }
  // 数组元素是连续的 0xfb+8B；数到第一个不是它的字节为止
  let n = 0;
  while (c.payload[at + n * 9] === 0xfb && at + (n + 1) * 9 <= c.payload.length) n++;
  console.log(`定位 @${at}：连续 float64 元素 ${n} 个`);
  let vals;
  if (valuesArg.startsWith('@')) vals = fs.readFileSync(valuesArg.slice(1), 'utf8').split(/[\s,;]+/).filter(Boolean).map(Number);
  else vals = valuesArg.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (vals.some((x) => !Number.isFinite(x))) { console.error('❌ --values 里有非数字'); process.exit(2); }
  if (vals.length !== n) {
    console.error(`❌ 值个数 ${vals.length} ≠ 该处元素数 ${n} —— 原位覆盖**长度必须不变**（这是能绕开 CBOR 重编码的全部原因）`);
    console.error('   （若这确实是你要改的数组，先想清楚：加/减采样点必须整段重编码，本工具不干这事）');
    process.exit(3);
  }
  if (countArg && Number(countArg) !== n) { console.error(`❌ --count ${countArg} 与检测到的 ${n} 不一致 ⇒ 拒绝写`); process.exit(3); }
  const next = Buffer.from(c.payload);
  vals.forEach((v, i) => { const b = floatItem(v); b.copy(next, at + i * 9); });
  const bytes = packContainer(c.buf.slice(0, c.headLen), next);
  const name = path.basename(file, '.acep');
  const w = writePackage(outDir, name, bytes);
  console.log('写出 ' + w.main + `（${bytes.length} B）`);
  console.log('     ' + w.snap);
  cmdVerify(w.main);
}

/* ─────────────────── 旧壳（JSON 外壳）：读 / 写 ───────────────────
 * 形态：`{compressMethod:"zstd", content:"<base64 zstd>", salt, version:1000, debugInfo}`
 * ⚠️ 内层是 **JSON 文本** ⇒ 改法是"整段改 + 重压缩 + 重 base64 + 重写包装"，不能用新壳的"等长原位覆盖"。
 * ⚠️ `version:2`（加密壳）**弃用不处理**（用户裁定 2026-10-04）。 */

function readJsonShell(file) {
  const s = probeShell(file);
  if (s.kind !== 'json') throw new Error('不是 JSON 外壳（首 5 字节 = ' + JSON.stringify(s.magic) + '）');
  const wrapper = JSON.parse(s.buf.toString('utf8'));
  if (wrapper.compressMethod !== 'zstd') {
    if (wrapper.content === undefined) {
      throw new Error('不是已知的 .acep 壳：既没有 `compressMethod`，也没有 `content`（像是一份普通 JSON，不是工程文件）');
    }
    throw new Error('这是 **version:' + wrapper.version + '** 的加密历史壳（content 不是 zstd/gzip/deflate/brotli）⇒ 弃用不处理（技能 §1.0）');
  }
  const raw = Buffer.from(String(wrapper.content), 'base64');
  const Z = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  let payload;
  try {
    payload = raw.slice(0, 4).equals(Z) ? Buffer.from(zlib.zstdDecompressSync(raw))
      : Buffer.from(zlib.zstdDecompressSync(Buffer.concat([Z, raw])));   // 无魔数的 zstd 帧
  } catch (e) { throw new Error('旧壳 content 解不开：' + String(e.message).slice(0, 120)); }
  const text = payload.toString('utf8').replace(/\u0000+$/, '');
  return { wrapper, tree: JSON.parse(text), payloadLen: payload.length, compLen: raw.length };
}

/** 改完包装回去：只换 `content`（长度会变），`compressMethod`/`salt`/`version`/`debugInfo` 与键序都保留 */
function packJsonShell(wrapper, tree) {
  const text = JSON.stringify(tree);
  const comp = zlib.zstdCompressSync(Buffer.from(text, 'utf8'));
  const out = Object.assign({}, wrapper);
  out.content = comp.toString('base64');
  return Buffer.from(JSON.stringify(out), 'utf8');
}

/** 路径赋值（与 pickPath 同一套语法 `a.b[0].c`） */
function setPath(root, expr, value) {
  const toks = String(expr).replace(/^\$\.?/, '').split(/\.(?![^\[]*\])/).filter(Boolean);
  if (!toks.length) throw new Error('路径为空');
  let cur = root;
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    const m = t.match(/^([^\[\]]*)((\[\d+\])*)$/);
    if (!m) throw new Error('看不懂的路径段：' + t);
    if (m[1]) cur = cur[m[1]];
    for (const idx of (m[2].match(/\d+/g) || [])) cur = cur[Number(idx)];
    if (cur === undefined || cur === null) throw new Error('路径中断在：' + t);
  }
  const last = toks[toks.length - 1];
  const m = last.match(/^([^\[\]]*)((\[\d+\])*)$/);
  if (!m) throw new Error('看不懂的末段：' + last);
  const idxs = (m[2].match(/\d+/g) || []).map(Number);
  let target = cur;
  if (idxs.length) {
    if (m[1]) target = target[m[1]];
    for (let i = 0; i < idxs.length - 1; i++) target = target[idxs[i]];
    target[idxs[idxs.length - 1]] = value;
  } else {
    target[m[1]] = value;
  }
}

/** 统一入口：拿任意壳的树（get/dump 用） */
function loadTree(file) {
  const s = probeShell(file);
  if (s.kind === 'acep2') return decode(readContainer(file).payload).value;
  if (s.kind === 'json') return readJsonShell(file).tree;
  throw new Error('不认识的壳（首 5 字节 = ' + JSON.stringify(s.magic) + '）');
}

function cmdSetJson(file, expr, valueArg, valueFile, outDir) {
  need(expr && (valueArg !== undefined || valueFile) && outDir,
    'node acep.cjs set-json <file.acep> --path <表达式> (--value <值> | --value-file <文件>) --out <目录>');
  const shell = readJsonShell(file);
  const root = shell.tree;
  const before = pickPath(root, expr);
  if (before === undefined) { console.error('❌ 路径取不到：' + expr + '（旧壳只有 JSON 树，路径写全）'); process.exit(3); }
  let value;
  if (valueFile) value = fs.readFileSync(valueFile, 'utf8').replace(/\r?\n$/, '');
  else if (valueArg === 'true' || valueArg === 'false') value = valueArg === 'true';
  else if (valueArg === 'null') value = null;
  else if (/^-?\d+(\.\d+)?$/.test(valueArg)) value = Number(valueArg);
  else if (/^[[{]/.test(valueArg)) { try { value = JSON.parse(valueArg); } catch { value = valueArg; } }
  else value = valueArg;
  setPath(root, expr, value);
  const bytes = packJsonShell(shell.wrapper, root);
  const name = path.basename(file, '.acep');
  const w = writePackage(outDir, name, bytes);
  console.log(`旧壳（JSON）改 ${expr}`);
  console.log(`  ${JSON.stringify(before).slice(0, 60)} → ${JSON.stringify(value).slice(0, 60)}`);
  console.log(`  内层 JSON payload ${shell.payloadLen} B → 重压缩后文件 ${bytes.length} B`);
  console.log('写出 ' + w.main);
  console.log('     ' + w.snap);
  // 自检：按同流程回读，取值比对
  const back = readJsonShell(w.main);
  const got = pickPath(back.tree, expr);
  const okv = JSON.stringify(got) === JSON.stringify(value);
  console.log(`  ok   回读 ${expr} = ${JSON.stringify(got).slice(0, 60)}  ${okv ? '✅' : '❌ 不一致'}`);
  console.log(`  ok   包装键仍在：${Object.keys(back.wrapper).join(', ')}`);
  if (!okv) process.exit(1);
}

/** 拆壳：新版走 CBOR→JSON 树；旧版走 base64→zstd→**内层 JSON**。两种都只写到 out */
function cmdUnpack(file, out) {
  need(out, 'node acep.cjs unpack <file.acep> <out.json>');
  const s = probeShell(file);
  if (s.kind === 'acep2') {
    const c = readContainer(file);
    const root = decode(c.payload).value;
    fs.writeFileSync(out, JSON.stringify(root, (k, v) => (Buffer.isBuffer(v) ? '<bytes ' + v.length + '>' : v), 1), 'utf8');
    console.log('壳 = ACEP2（头 + zstd → CBOR）');
    console.log(`  头 ${c.headLen} B · 压缩 ${c.compLen} · 解出 payload ${c.payload.length} B`);
    console.log(`  顶层 map ${Object.keys(root).length} 键 → 已写 ${out}（${fs.statSync(out).size} B）`);
    return;
  }
  if (s.kind === 'unknown') throw new Error('不认识的壳（首 5 字节 = ' + JSON.stringify(s.magic) + '）');
  const wrapper = JSON.parse(s.buf.toString('utf8'));
  console.log('壳 = 旧版 JSON 外壳');
  console.log('  包装键：' + Object.keys(wrapper).join(', '));
  console.log('  version=' + wrapper.version + ' · compressMethod=' + wrapper.compressMethod
    + ' · salt=' + JSON.stringify(wrapper.salt) + '（' + (wrapper.salt ? wrapper.salt.length + ' 字符' : '无') + '）'
    + ' · debugInfo=' + JSON.stringify(wrapper.debugInfo));
  if (wrapper.compressMethod !== 'zstd') {
    if (wrapper.content === undefined) {
      throw new Error('不是已知的 .acep 壳（既没有 compressMethod 也没有 content —— 像一份普通 JSON，不是工程文件）');
    }
    throw new Error('这是**加密的历史壳**（`version:' + wrapper.version + '`、salt 两段、content 无任何标准压缩头：zstd/gzip/deflate/brotli 都解不开）'
      + ' ⇒ 不支持、也不尝试解密（见技能 §1.0；要那份工程只能用当年那版 ACE 打开后另存）');
  }
  const raw = Buffer.from(String(wrapper.content), 'base64');
  const ZMAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  console.log(`  content ${String(wrapper.content).length} 字符 base64 → ${raw.length} B，首 4 字节 ${[...raw.slice(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
  let payload;
  try {
    payload = raw.slice(0, 4).equals(ZMAGIC) ? Buffer.from(zlib.zstdDecompressSync(raw))
      // 有些 zstd 帧是"无魔数"写法 ⇒ 补上魔数再试（仍未验证能覆盖多少样本）
      : Buffer.from(zlib.zstdDecompressSync(Buffer.concat([ZMAGIC, raw])));
  } catch (e) {
    throw new Error('解不开这个旧壳的 content（试过 zstd 与"补魔数"）：' + e.message.slice(0, 120));
  }
  let txt = payload.toString('utf8');
  // 尾部可能有 \0 填充
  const trimmed = txt.replace(/\u0000+$/, '');
  console.log(`  zstd 解出 ${payload.length} B` + (trimmed.length !== txt.length ? `（尾部 \\0 填充 ${txt.length - trimmed.length} B 已去掉）` : ''));
  const tree = JSON.parse(trimmed);
  fs.writeFileSync(out, JSON.stringify(tree), 'utf8');
  console.log(`  内层是 **JSON 文本**：顶层 ${Object.keys(tree).length} 键 → 已写 ${out}（${fs.statSync(out).size} B）`);
  console.log('  前 12 个键：' + Object.keys(tree).slice(0, 12).join(', '));
}

/* ─────────────── rap 音高线：移植 SV1「语调教.js」（单位照搬 cent，ACE 侧 ÷100 = 半音） ───────────────
 * ACE 的 `pitchDelta` = **半音偏移（相对音符音高）**，0 = 音符音高；栅格 `tick = offset + i × 15/16`（1024 Hz）。
 * 调型（照搬那份 JS，单位 cent；0=轻声 1=阴平(不动) 2 3 4）：
 *   2 → 起始 −400 平台（升感）· 3 → −800 长平台（降升）· 4 → 末尾 −1200（降）· 0 → 起始 −400 + 末尾 −800
 *   每个音符区间**两端都锚 0**。
 * ⚠️ 前置（实测）：lane **键永远在**，但可能只有键没有 entry（留档工程两条轨都是 `array[0]`，因为片段没被 ACE 分析/合成过）
 *   ⇒ 有 entry 走**等长原位覆盖**；空 lane 要 `--create-lane` 新建 entry（**ACE 认不认未验证**，务必写副本 + 真机验收）。
 * 纪律：默认只出计划（`--dry-run` 是默认）；写副本用 `--out <目录>`；改工程本体用 `--in-place`（**自动 .bak 备份**），改完必须让 ACE 重新打开。
 */
function cborUint(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error('CBOR 整数非法：' + n);
  if (n < 24) return Buffer.from([n]);
  if (n < 0x100) return Buffer.from([0x18, n]);
  if (n < 0x10000) return Buffer.from([0x19, n >> 8, n & 0xff]);
  if (n < 0x100000000) { const b = Buffer.alloc(5); b[0] = 0x1a; b.writeUInt32BE(n >>> 0, 1); return b; }
  throw new Error('整数太大：' + n);
}
function cborArrayHeader(n) {
  if (n < 24) return Buffer.from([0x80 | n]);
  if (n < 0x100) return Buffer.from([0x98, n]);
  if (n < 0x10000) return Buffer.from([0x99, n >> 8, n & 0xff]);
  throw new Error('数组太长：' + n);
}
function cborMapHeader(n) {
  if (n < 24) return Buffer.from([0xa0 | n]);
  if (n < 0x100) return Buffer.from([0xb8, n]);
  if (n < 0x10000) return Buffer.from([0xb9, n >> 8, n & 0xff]);
  throw new Error('map 太大：' + n);
}
/** lane entry 的字节：`{type:"data", offset:<tick>, values:[float64…]}` */
function encodeLaneEntry(offset, values) {
  const parts = [cborMapHeader(3),
    textItem('type'), textItem('data'),
    textItem('offset'), cborUint(offset),
    textItem('values'), cborArrayHeader(values.length)];
  for (const v of values) parts.push(floatItem(v));
  return Buffer.concat(parts);
}
/** 读放在 off 处的 CBOR 数组头 → {n, hdr}（不定长拒绝） */
function arrayHeaderAt(buf, off) {
  const b0 = buf[off];
  if ((b0 >> 5) !== 4) throw new Error(`@${off} 不是数组头（0x${b0.toString(16)}）`);
  const ai = b0 & 0x1f;
  if (ai < 24) return { n: ai, hdr: 1 };
  if (ai === 24) return { n: buf[off + 1], hdr: 2 };
  if (ai === 25) return { n: buf.readUInt16BE(off + 1), hdr: 3 };
  if (ai === 26) return { n: buf.readUInt32BE(off + 1), hdr: 5 };
  throw new Error('不定长数组不支持');
}

/** 写回数组头的元素计数（**宽度必须不变**：跨过宽度边界就拒绝，交给调用方整段重建） */
function bumpArrayCount(buf, off, hdr, count) {
  const b0 = buf[off];
  if ((b0 >> 5) !== 4) throw new Error(`@${off} 不是数组头`);
  const ai = b0 & 0x1f;
  if (ai < 24) {
    if (count > 23) throw new Error('数组元素数跨过 24 ⇒ 头要变宽，本工具不处理（请手工重建这一小节）');
    buf[off] = 0x80 | count;
  } else if (ai === 24) {
    if (count > 0xff) throw new Error('数组元素数跨过 256 ⇒ 头要变宽，本工具不处理');
    buf[off + 1] = count;
  } else if (ai === 25) {
    if (count > 0xffff) throw new Error('数组元素数跨过 65536 ⇒ 头要变宽，本工具不处理');
    buf.writeUInt16BE(count, off + 1);
  } else if (ai === 26) {
    buf.writeUInt32BE(count >>> 0, off + 1);
  } else throw new Error('不定长数组头不支持计数回写');
}
/** 调型 → 控制点（cent，**按 t 升序返回**）；null = 该音符不动
 *  ⚠️ 2026-10-04 实测踩坑：`evalPoints` 假定点列升序，而这里原本把 `{t:end, v:0}` 拼在平台点之前
 *  ⇒ 区间内插值全落在 (onset,end) 那条 0 值段上 = **整段写成 0**（曲线被"画平"），
 *    且自检（回读写入的数组）查不出来 —— 自检比的是"我打算写的"，而错在"我打算写的就是 0"。
 *    症状：ACE 里音高线是平的。所以这里必须排序，且**回读要用独立报表核对形状**（`scripts/lane-report.cjs`）。
 */
function rapPoints(tone, onset, dur) {
  const end = onset + dur;
  const base = [{ t: onset, v: 0 }, { t: end, v: 0 }];
  let pts = null;
  if (tone === 2) pts = base.concat([{ t: onset + 1, v: -400 }, { t: onset + dur * 0.3, v: -400 }]);
  else if (tone === 3) pts = base.concat([{ t: onset + 1, v: -800 }, { t: onset + dur * 0.7, v: -800 }]);
  else if (tone === 4) pts = base.concat([{ t: end - 1, v: -1200 }]);
  else if (tone === 0) pts = base.concat([{ t: onset + 1, v: -400 }, { t: end - 1, v: -800 }]);
  else return null;                                // tone 1（阴平）与其它：平，不动
  return pts.slice().sort((a, b) => a.t - b.t);    // ⚠️ 必须升序（见上方踩坑）
}
/** 折线求值（cent）；区间外取端点 */
function evalPoints(pts, t) {
  if (!pts.length) return 0;
  if (t <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const a = pts[i - 1], b = pts[i];
      return b.t === a.t ? b.v : a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t));
    }
  }
  return pts[pts.length - 1].v;
}

/** ⛔ 只支持 `timeUnit:"tick"` 的 pattern —— **音频片段的 `"sec"` 会让所有 tick 换算失效**。
 *  2026-10-05 补：此前全脚本 grep `timeUnit` **0 命中** ⇒ 若拿一个 `sec` 单位的 pattern 进来，
 *  `rap-curve`/`vibrato` 会把"秒"当"tick"解释并**静默写错位置**（技能 §2.5：`timeUnit` 可为 `tick` | `sec`，
 *  `sec` = 音频片段）。这条守卫就是把这个静默错误变成明确拒绝。 */
function assertTickPattern(pattern, where) {
  const u = pattern && pattern.timeUnit !== undefined ? String(pattern.timeUnit) : 'tick';
  if (u !== 'tick') {
    throw new Error(`${where} 的 timeUnit = "${u}"（不是 "tick"）⇒ 这是**音频片段**，`
      + '本工具的 tick 栅格换算（步长 15/16 tick、960 tick/秒）**不适用，拒绝操作**。'
      + '确实要动它的话：先手工确认那份数据的坐标系（见技能 §2.5），或把它转成 Sing pattern。');
  }
}

function cmdRapCurve(file, o) {
  need(o.outDir || o.inPlace || o.dryRun, 'node acep.cjs rap-curve <file.acep> --tones STR [--track N --clip M] [--out 目录 | --in-place]  （默认只出计划）');
  const c = readContainer(file);
  const dec = decode(c.payload, { offsets: true });
  const root = dec.value;
  const offs = dec.offsets;

  // —— 目标 lane（按路径过滤）——
  let lanes = Object.keys(offs).filter((k) => /\.parameters\.pitchDelta$/.test(k));
  const idx = (k) => { const m = k.match(/tracks\[(\d+)\]\.patterns\[(\d+)\]/); return m ? { t: Number(m[1]), p: Number(m[2]) } : null; };
  if (o.track !== null) lanes = lanes.filter((k) => { const i = idx(k); return i && i.t === o.track; });
  if (o.clip !== null) lanes = lanes.filter((k) => { const i = idx(k); return i && i.p === o.clip; });
  if (o.lane) lanes = lanes.filter((k) => k === o.lane || k === '$' + o.lane);
  // 有些工程**连 pitchDelta 键都不写**：给了 --track/--clip 且要 --create-lane 时，按路径规律自己拼一条
  if (lanes.length === 0 && o.createLane && o.track !== null && o.clip !== null) {
    const guess = `$.tracks[${o.track}].patterns[${o.clip}].parameters.pitchDelta`;
    if (offs[guess.replace(/\.pitchDelta$/, '')]) lanes = [guess];
  }
  if (lanes.length === 0) throw new Error('找不到匹配的 pitchDelta lane（用 --track/--clip 指定）');
  if (lanes.length > 1) {
    console.log('候选 lane：');
    lanes.forEach((k) => { const i = idx(k); console.log('  ' + k + (i ? `   (track ${i.t} / pattern ${i.p})` : '')); });
    throw new Error('有多个候选，请用 --track/--clip/--lane 指定唯一一条');
  }
  const lanePath = lanes[0];
  const patPath = lanePath.replace(/\.parameters\.pitchDelta$/, '');
  assertTickPattern(pickPath(root, patPath.replace(/^\$\./, '')), patPath);
  const laneArr = pickPath(root, lanePath.replace(/^\$\./, ''));
  // 有些工程**连 pitchDelta 键都不写** ⇒ `--create-lane` 时先往 parameters map 插一个空 lane（元素计数 +1）
  let srcPayload = c.payload;
  let srcOffs = offs;
  if (srcOffs[lanePath] === undefined && o.createLane) {
    const pRng = srcOffs[lanePath.replace(/\.pitchDelta$/, '')];
    if (!pRng) throw new Error('拿不到 parameters map 的字节区间 ⇒ 无法插入 pitchDelta 键');
    srcPayload = insertMapEntry(srcPayload, pRng, 'pitchDelta', cborArrayHeader(0));
    srcOffs = decode(srcPayload, { offsets: true }).offsets;
    console.log('（原文件没有 pitchDelta 键 ⇒ 已先插入一个空 lane）');
  }
  const allNotes = (pickPath(root, patPath.replace(/^\$\./, '') + '.notes') || []).slice()
    .sort((a, b) => a.pos - b.pos);
  if (!allNotes.length) throw new Error('该 pattern 没有音符');

  // —— 目标音符（--notes uuid 子集，按 onset 排序；缺省=全部）——
  let notes = allNotes;
  if (o.notes) {
    const want = String(o.notes).split(/[,\s]+/).filter(Boolean);
    const set = new Set(want.map((s) => s.replace(/[{}]/g, '')));
    notes = allNotes.filter((n) => set.has(String(n.uuid).replace(/[{}]/g, '')));
    if (!notes.length) throw new Error('--notes 里没有一个 uuid 落在该 pattern');
    notes.sort((a, b) => a.pos - b.pos);
  }

  // —— 声调 ——
  let digits;
  if (o.fromLyricTail) {
    digits = notes.map((n) => { const last = String(n.lyric || '').slice(-1); return /^[0-4]$/.test(last) ? Number(last) : null; });
  } else {
    let text = o.tones || '';
    if (text.startsWith('@')) text = fs.readFileSync(text.slice(1), 'utf8');
    const d = String(text).replace(/[^0-4]/g, '').split('').map(Number);
    if (!d.length) throw new Error('--tones 里没有 0–4 的数字');
    digits = d;
  }
  const plan = notes.map((n, i) => ({ note: n, tone: digits[i] === undefined ? null : digits[i] }));

  // —— lane 现状：有 entry 就逐条等长覆盖（**真实工程常是多条 entry 分段存**）；空 lane 要 --create-lane ——
  //   entries[] = [{ idx, offset, values }]；idx 是 lane 数组里的下标（写字节时要按它取 values 的区间）
  let mode, entries;
  if (Array.isArray(laneArr) && laneArr.length >= 1) {
    mode = 'overwrite';
    entries = laneArr.map((e, idx) => ({ idx, type: e.type, offset: e.offset, values: Array.isArray(e.values) ? e.values.map(Number) : null }))
      .filter((e) => e.values);                      // `type:"anchor"` 那种没有 values，跳过
    if (!entries.length) throw new Error(`这条 lane 有 ${laneArr.length} 条 entry，但没有一条带 values（都是 anchor？）⇒ 本工具不处理，请手工确认`);
  } else if (o.createLane) {
    mode = 'create';
    const maxEnd = Math.max(...notes.map((n) => n.pos + n.dur));
    const n = Math.ceil(maxEnd * 16 / 15) + 2;
    entries = [{ idx: 0, type: 'data', offset: 0, values: new Array(n).fill(0) }];
  } else {
    throw new Error('这条 pitchDelta lane 是**空的**（ACE 还没分析/合成过该片段）⇒ 先在 ACE 里渲染/播放一次让它有 entry，或显式用 --create-lane（未验证 ACE 是否接受）');
  }
  const totalSamples = entries.reduce((a, e) => a + e.values.length, 0);

  // —— 逐样本生成（对**每条 entry** 各自按自己的 offset 换算 tick）——
  const ptsByNote = plan.map((p) => ({ onset: p.note.pos, end: p.note.pos + p.note.dur, tone: p.tone, pts: p.tone === null ? null : rapPoints(p.tone, p.note.pos, p.note.dur) }));
  let touched = 0;
  const rnd = (x) => Math.round(x * 1e6) / 1e6;
  for (const en of entries) {
    for (let i = 0; i < en.values.length; i++) {
      const tick = en.offset + i * 15 / 16;
      for (const q of ptsByNote) {
        if (!q.pts) continue;
        if (tick >= q.onset && tick < q.end) { en.values[i] = rnd(evalPoints(q.pts, tick) / 100); touched++; break; }
      }
    }
  }
  const nzPlanned = entries.reduce((a, e) => a + e.values.reduce((b, v) => b + (v !== 0 ? 1 : 0), 0), 0);

  console.log(`文件     ${file}`);
  console.log(`lane     ${lanePath}（track ${idx(lanePath).t} / pattern ${idx(lanePath).p}） 模式=${mode} entry ${entries.length} 条 / 样本共 ${totalSamples}`);
  entries.slice(0, 8).forEach((e) => console.log(`  entry[${String(e.idx).padStart(3)}] type=${e.type || '?'} offset=${String(e.offset).padStart(7)} 样本=${e.values.length}`));
  if (entries.length > 8) console.log(`  …（还有 ${entries.length - 8} 条）`);
  console.log(`音符 ${notes.length} 个（全部 ${allNotes.length} 个，按 onset 排序）：`);
  plan.forEach((p, i) => {
    const n = p.note;
    const pts = p.tone === null ? '(无调号，跳过)' : (rapPoints(p.tone, n.pos, n.dur) || []).map((q) => `${Math.round(q.t)}t→${q.v}c`).join(' ');
    console.log(`  [${String(i).padStart(2)}] pos=${String(n.pos).padStart(6)} dur=${String(n.dur).padStart(5)} pitch=${String(n.pitch).padStart(3)} lyric=${JSON.stringify(String(n.lyric || ''))} tone=${p.tone === null ? '-' : p.tone}  ${pts}`);
  });
  console.log(`落在音符区间内的样本 ${touched} 个（半音值；0=音符音高），其中**非零**（真画出曲线）${nzPlanned} 个`
    + (nzPlanned === 0 ? '\n⚠️ 计划里全是 0 ⇒ 曲线会是平的（检查调型：1=阴平不动；也检查音符 pos/dur）' : ''));
  if (o.dryRun && !o.outDir && !o.inPlace) { console.log('\n（dry-run：未写任何文件）'); return; }

  // —— 写 ——
  let payload;
  if (mode === 'overwrite') {
    payload = Buffer.from(srcPayload);
    for (const en of entries) {
      const k1 = lanePath + `[${en.idx}].values`, k2 = '$' + lanePath + `[${en.idx}].values`;
      const rng = srcOffs[k1] !== undefined ? srcOffs[k1] : srcOffs[k2];
      if (!rng) throw new Error(`拿不到 entry[${en.idx}] values 数组的字节区间`);
      const { n, hdr } = arrayHeaderAt(payload, rng.start);
      if (n !== en.values.length) throw new Error(`entry[${en.idx}] 数组元素数不符（${n} vs ${en.values.length}）`);
      const first = rng.start + hdr;
      for (let i = 0; i < n; i++) {
        if (payload[first + i * 9] !== 0xfb) throw new Error(`entry[${en.idx}] 第 ${i} 个元素不是 float64（0x${payload[first + i * 9].toString(16)}）⇒ 拒绝写`);
      }
      for (let i = 0; i < n; i++) payload.writeDoubleBE(en.values[i], first + i * 9 + 1);
      console.log(`  entry[${String(en.idx).padStart(3)}] 等长原位覆盖 values @${first} … ${first + n * 9 - 1}（${n} × 9 B）`);
    }
  } else {
    const rng = srcOffs[lanePath];
    if (!rng || srcPayload[rng.start] !== 0x80 || rng.end - rng.start !== 1) {
      throw new Error('这条 lane 不是"空数组 0x80"（拿不到可替换的一字节）⇒ 拒绝新建');
    }
    const en = entries[0];
    const laneBytes = Buffer.concat([cborArrayHeader(1), encodeLaneEntry(en.offset, en.values)]);
    payload = Buffer.concat([srcPayload.slice(0, rng.start), laneBytes, srcPayload.slice(rng.end)]);
    console.log(`\n新建 entry：0x80 @${rng.start} → ${laneBytes.length} B`);
    console.log('⚠️ 这条 lane 是我们**新建**的 entry（2026-10-04 实测：ACE 接受，值与结构都留）');
  }
  const bytes = packContainer(c.buf.slice(0, c.headLen), payload);

  // —— 落盘 ——
  let target = null;
  if (o.inPlace) {
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const bak = `${file}.bak-${ts}`;
    fs.copyFileSync(file, bak);
    fs.writeFileSync(file, bytes);
    target = file;
    console.log(`写出（原地）${file}\n     备份      ${bak}`);
    console.log(`⚠️ ACE 里那份是旧内容 ⇒ 让它重新打开：acestudio-cli project open "${file}" --discard-changes`);
  } else {
    const name = path.basename(file, '.acep');
    const w = writePackage(o.outDir, name, bytes);
    target = w.main;
    console.log(`写出 ${w.main}\n     ${w.snap}（${bytes.length} B）`);
  }

  // —— 自检：回读新文件，逐 entry 核对长度 / 逐值 / **形状（非零数）** ——
  const chk = readContainer(target);
  const d2 = decode(chk.payload, { offsets: true });
  const lane2 = pickPath(d2.value, lanePath.replace(/^\$\./, ''));
  let same = 0, nzGot = 0, budget = totalSamples, okAll = true;
  for (const en of entries) {
    const got = lane2 && lane2[en.idx] ? lane2[en.idx].values : null;
    if (!got || got.length !== en.values.length) { okAll = false; continue; }
    for (let i = 0; i < en.values.length; i++) {
      if (Math.abs(got[i] - en.values[i]) < 1e-9) same++;
      if (got[i] !== 0) nzGot++;
    }
  }
  console.log(`自检：entry 数=${lane2 ? lane2.length : '?'}（写 ${entries.length} 条）长度一致=${okAll ? '✅' : '❌'} 值一致 ${same}/${budget}${okAll && same === budget ? ' ✅' : ' ❌'}`);
  console.log(`自检形状：回读非零样本 ${nzGot}/${budget}（计划 ${nzPlanned}）${nzGot === nzPlanned ? ' ✅' : ' ❌ 曲线被写平了'}`);
  if (!okAll || same !== budget || nzGot !== nzPlanned) process.exit(1);
}

/* ─────────────── 通用 CBOR 编码 + 子值替换（离线造工程/改结构用，**不需要 ACE**） ─────────────── */

function cborNegInt(n) {                      // major 1：值为 -(n+1)
  const m = -1 - n;
  if (m < 24) return Buffer.from([0x20 | m]);
  if (m < 0x100) return Buffer.from([0x38, m]);
  if (m < 0x10000) return Buffer.from([0x39, m >> 8, m & 0xff]);
  const b = Buffer.alloc(5); b[0] = 0x3a; b.writeUInt32BE(m >>> 0, 1); return b;
}
function cborBytesHeader(n) {
  if (n < 24) return Buffer.from([0x40 | n]);
  if (n < 0x100) return Buffer.from([0x58, n]);
  if (n < 0x10000) return Buffer.from([0x59, n >> 8, n & 0xff]);
  const b = Buffer.alloc(5); b[0] = 0x5a; b.writeUInt32BE(n >>> 0, 1); return b;
}
/** 把「解码出来的 JS 值」重新编码成 CBOR（整数走最短形式，非整数走 float64） */
function encodeValue(v) {
  if (v === null || v === undefined) return Buffer.from([0xf6]);
  if (typeof v === 'boolean') return Buffer.from([v ? 0xf5 : 0xf4]);
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v >= 0 ? cborUint(v) : cborNegInt(v);
    return floatItem(v);
  }
  if (typeof v === 'string') return textItem(v);
  if (Buffer.isBuffer(v)) return Buffer.concat([cborBytesHeader(v.length), v]);
  if (Array.isArray(v)) return Buffer.concat([cborArrayHeader(v.length), ...v.map(encodeValue)]);
  if (typeof v === 'object') {
    if (v.__tag !== undefined) throw new Error('tag 值不支持重编码');
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    const parts = [cborMapHeader(keys.length)];
    for (const k of keys) parts.push(textItem(k), encodeValue(v[k]));
    return Buffer.concat(parts);
  }
  throw new Error('不能编码的值：' + typeof v);
}
function mapHeaderAt(buf, off) {
  const b0 = buf[off];
  if ((b0 >> 5) !== 5) throw new Error(`@${off} 不是 map 头（0x${b0.toString(16)}）`);
  const ai = b0 & 0x1f;
  if (ai < 24) return { count: ai, hdr: 1 };
  if (ai === 24) return { count: buf[off + 1], hdr: 2 };
  if (ai === 25) return { count: buf.readUInt16BE(off + 1), hdr: 3 };
  if (ai === 26) return { count: buf.readUInt32BE(off + 1), hdr: 5 };
  throw new Error('不定长 map 不支持');
}
function bumpMapCount(buf, off, hdr, count) {
  if (hdr === 1) buf[off] = 0xa0 | count;
  else if (hdr === 2) buf[off + 1] = count;
  else if (hdr === 3) buf.writeUInt16BE(count, off + 1);
  else buf.writeUInt32BE(count >>> 0, off + 1);
}
/** 往一个**定长 map** 末尾插一对键值（元素计数 +1）：给空 lane 建键、或给 extraInfo 挂东西 */
function insertMapEntry(payload, rng, key, valueBytes) {
  const { count, hdr } = mapHeaderAt(payload, rng.start);
  const copy = Buffer.from(payload);
  bumpMapCount(copy, rng.start, hdr, count + 1);
  return Buffer.concat([copy.slice(0, rng.end), textItem(key), valueBytes, copy.slice(rng.end)]);
}

function cmdSetValue(file, pathExpr, valueArg, valueFile, outDir, nameArg, inPlace) {
  need(pathExpr && (valueArg !== undefined || valueFile),
    'node acep.cjs set-value <file.acep> --path <表达式> (--value <JSON> | --value-file <f>) [--name 新名字] [--out <目录> | --in-place]');
  const c = readContainer(file);
  const dec = decode(c.payload, { offsets: true });
  const key = pathExpr.startsWith('$') ? pathExpr : '$.' + pathExpr;
  const rng = dec.offsets[key];
  if (!rng) throw new Error('路径取不到：' + pathExpr + '（先 dump --find 看看真实路径）');
  const value = valueFile ? JSON.parse(fs.readFileSync(valueFile, 'utf8')) : JSON.parse(valueArg);
  const bytes = encodeValue(value);
  const oldLen = rng.end - rng.start;
  const payload = Buffer.concat([c.payload.slice(0, rng.start), bytes, c.payload.slice(rng.end)]);
  console.log(`替换 ${key}`);
  console.log(`  旧 ${oldLen} B → 新 ${bytes.length} B（payload ${c.payload.length} → ${payload.length}）`);
  const packed = packContainer(c.buf.slice(0, c.headLen), payload);
  const name = nameArg || path.basename(file, '.acep');

  let target;
  if (inPlace) {
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    fs.copyFileSync(file, `${file}.bak-${ts}`);
    fs.writeFileSync(file, packed);
    target = file;
    console.log(`写出（原地）${file}  备份 ${file}.bak-${ts}`);
  } else if (outDir) {
    const w = writePackage(outDir, name, packed);
    target = w.main;
    console.log(`写出 ${w.main}\n     ${w.snap}（${packed.length} B）`);
  } else {
    throw new Error('要么给 --out <目录>，要么给 --in-place');
  }

  // 自检：回读同一路径，逐字比 JSON
  const chk = readContainer(target);
  const d2 = decode(chk.payload);
  const got = pickPath(d2.value, key.replace(/^\$\./, ''));
  const same = JSON.stringify(got) === JSON.stringify(value);
  console.log(`自检：回读${same ? '一致 ✅' : '不一致 ❌'}（${JSON.stringify(value).length} 字符）`);
  if (!same) {
    console.log('  期望 ' + JSON.stringify(value).slice(0, 200));
    console.log('  实得 ' + JSON.stringify(got).slice(0, 200));
    process.exit(1);
  }
}

/* ─────────────── 锚点（第二种画法）：`pitchDelta` 里的 `type:"anchor"` entry ───────────────
 * 形态（2026-10-05 实测）：`{type:"anchor", points:[tick,绝对音高, tick,绝对音高,…], pointsVUV:[0/1,…]}`
 *   ⚠️ **值是绝对音高，不是 delta**（`data` 形态才是 delta）—— ACE 原话："the channel stores a delta while the
 *      draw primitive takes absolute pitch, and **anchors** … ride on top"。
 *   ⚠️ 没有 `offset`：位置就在 `points` 的 tick 里（片段内局部坐标，与 `notes[].pos` 同系）。
 * 为什么要有它：`rap-curve` 只写 `data`（delta）形态，遇到 anchor-only 的 lane 会**拒写**；
 *   而"按编辑器口径生成绝对音高锚点"这条路此前**完全没有工具**。
 * ⚠️ 删/加 entry 会动 **lane 数组的元素计数**（`bumpArrayCount`），所以插入只能**追加到末尾**。
 */
function cmdAnchor(file, o) {
  need(o.outDir || o.inPlace || o.dryRun,
    'node acep.cjs anchor <file.acep> [--track N --clip M] [--entry I | --append] --points "t,v,t,v,…" [--vuv "0,1,…"] [--clear] [--out <目录>|--in-place]');
  const c = readContainer(file);
  const dec = decode(c.payload, { offsets: true });
  const root = dec.value;
  const offs = dec.offsets;

  // —— 目标 lane（与 rap-curve 同一套发现逻辑）——
  let lanes = Object.keys(offs).filter((k) => /\.parameters\.pitchDelta$/.test(k));
  const idx = (k) => { const m = k.match(/tracks\[(\d+)\]\.patterns\[(\d+)\]/); return m ? { t: Number(m[1]), p: Number(m[2]) } : null; };
  if (o.track !== null) lanes = lanes.filter((k) => { const i = idx(k); return i && i.t === o.track; });
  if (o.clip !== null) lanes = lanes.filter((k) => { const i = idx(k); return i && i.p === o.clip; });
  if (!lanes.length && o.track !== null && o.clip !== null) lanes = [`$.tracks[${o.track}].patterns[${o.clip}].parameters.pitchDelta`];
  if (!lanes.length) throw new Error('找不到匹配的 pitchDelta lane（用 --track/--clip 指定）');
  if (lanes.length > 1) {
    console.log('候选 lane：'); lanes.forEach((k) => console.log('  ' + k));
    throw new Error('有多个候选，请用 --track/--clip 指定唯一一条');
  }
  const lanePath = lanes[0];
  const patPath = lanePath.replace(/\.parameters\.pitchDelta$/, '');
  assertTickPattern(pickPath(root, patPath.replace(/^\$\./, '')), patPath);
  const laneArr = pickPath(root, lanePath.replace(/^\$\./, '')) || [];

  // —— 解析 points（tick,绝对音高 成对；--points "100:61.5,200:63" 或 "100,61.5,200,63" 都收）——
  let pairs = [];
  if (o.points) {
    const flat = String(o.points).trim().split(/[,\s]+/).filter(Boolean).map((s) => s.split(':').map(Number)).flat();
    if (flat.length % 2 !== 0) throw new Error('--points 必须是 tick,音高 成对（收到 ' + flat.length + ' 个数）');
    for (let i = 0; i < flat.length; i += 2) {
      if (!Number.isFinite(flat[i]) || !Number.isFinite(flat[i + 1])) throw new Error('--points 里有非数字：' + flat[i] + ',' + flat[i + 1]);
      pairs.push({ t: flat[i], v: flat[i + 1] });
    }
    // 消费方（含编辑器画线）按 tick 顺序处理 ⇒ 要求升序；实测样本也都是升序
    for (let i = 1; i < pairs.length; i++) if (pairs[i].t < pairs[i - 1].t) throw new Error('--points 的 tick 必须升序（第 ' + (i + 1) + ' 个 ' + pairs[i].t + ' < 上一个 ' + pairs[i - 1].t + '）');
  }
  const vuv = o.vuv ? String(o.vuv).split(/[,\s]+/).filter(Boolean).map(Number) : null;
  if (vuv && pairs.length && vuv.length !== pairs.length) throw new Error(`--vuv 个数（${vuv.length}）必须等于点数（${pairs.length}）`);
  const entryObj = o.clear ? null : { type: 'anchor', points: pairs.flatMap((p) => [p.t, p.v]), pointsVUV: vuv || pairs.map(() => 0) };

  // —— 现状 ——
  const anchors = laneArr.map((e, i) => ({ i, e })).filter((x) => x.e && x.e.type === 'anchor');
  console.log(`文件    ${file}`);
  console.log(`lane    ${lanePath}（entry ${laneArr.length} 条：` + laneArr.map((e) => e.type || '?').join('/') + '）');
  if (o.clear) console.log('动作    清除锚点 entry');
  else console.log('写入    ' + JSON.stringify(entryObj).slice(0, 160));

  if (!o.clear && !pairs.length) throw new Error('要么给 --points，要么给 --clear');
  if (o.clear && o.entry === null) throw new Error('--clear 必须配 --entry I（说清删哪一条锚点）');
  if (!o.clear && o.entry === null && !o.append) {
    if (anchors.length === 1) { o.entry = anchors[0].i; console.log(`（lane 里正好 1 条锚点 ⇒ 默认替换 entry[${o.entry}]）`); }
    else if (anchors.length === 0) { o.append = true; console.log('（lane 里没有锚点 ⇒ 追加一条新 entry）'); }
    else { console.log('现有锚点：'); anchors.forEach((a) => console.log(`  entry[${a.i}]  ${(a.e.points || []).length / 2} 点  tick[${a.e.points ? a.e.points[0] : '?'}…]`)); throw new Error('lane 里有多条锚点 ⇒ 请用 --entry I 指定要替换哪条，或 --append 另加一条'); }
  }
  if (o.dryRun) { console.log('\n（dry-run：未写任何文件）'); return; }

  // —— 写 ——
  let payload = c.payload;
  const laneRng = offs[lanePath] !== undefined ? offs[lanePath] : offs['$' + lanePath];
  const entryBytes = entryObj ? encodeValue(entryObj) : null;

  if (o.append) {
    if (!laneRng) throw new Error('拿不到 lane 数组的字节区间');
    const { n, hdr } = arrayHeaderAt(payload, laneRng.start);
    const next = Buffer.concat([payload.slice(0, laneRng.end), entryBytes, payload.slice(laneRng.end)]);
    bumpArrayCount(next, laneRng.start, hdr, n + 1);
    payload = next;
    console.log(`  追加 entry 到末尾（数组 ${n} → ${n + 1}）@${laneRng.end}（+${entryBytes.length} B）`);
  } else {
    const key = lanePath + `[${o.entry}]`;
    const rng = offs[key] !== undefined ? offs[key] : offs['$' + lanePath + `[${o.entry}]`];
    if (!rng) throw new Error(`拿不到 entry[${o.entry}] 的字节区间`);
    const cur = laneArr[o.entry];
    if (!cur) throw new Error(`entry[${o.entry}] 不存在`);
    if (o.clear) {
      if (cur.type !== 'anchor') throw new Error(`entry[${o.entry}] 是 "${cur.type}"，不是 anchor ⇒ 拒删（` + '删 data 形态会动到音高曲线本身）');
      if (!laneRng) throw new Error('拿不到 lane 数组的字节区间');
      const { n, hdr } = arrayHeaderAt(payload, laneRng.start);
      const next = Buffer.concat([payload.slice(0, rng.start), payload.slice(rng.end)]);
      bumpArrayCount(next, laneRng.start, hdr, n - 1);
      payload = next;
      console.log(`  删 entry[${o.entry}]（数组 ${n} → ${n - 1}）`);
    } else {
      payload = Buffer.concat([payload.slice(0, rng.start), entryBytes, payload.slice(rng.end)]);
      console.log(`  entry[${o.entry}] ${rng.end - rng.start} B → ${entryBytes.length} B`);
    }
  }
  const packed = packContainer(c.buf.slice(0, c.headLen), payload);
  const name = o.name || path.basename(file, '.acep');

  let target;
  if (o.inPlace) {
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    fs.copyFileSync(file, `${file}.bak-${ts}`);
    fs.writeFileSync(file, packed);
    target = file;
    console.log(`写出（原地）${file}\n     备份      ${file}.bak-${ts}`);
    console.log('⚠️ ACE 里那份是旧内容 ⇒ 让它重新打开：acestudio-cli project open "' + file + '" --discard-changes');
  } else {
    const w = writePackage(o.outDir, name, packed);
    target = w.main;
    console.log(`写出 ${w.main}\n     ${w.snap}（${packed.length} B）`);
  }

  // —— 自检：回读整条 lane 的锚点 ——
  const chk = readContainer(target);
  const d2 = decode(chk.payload);
  const lane2 = pickPath(d2.value, lanePath.replace(/^\$\./, '')) || [];
  const anchors2 = lane2.filter((e) => e && e.type === 'anchor');
  if (o.clear) {
    const okClear = anchors2.length === anchors.length - 1;
    console.log(`自检：锚点 ${anchors.length} → ${anchors2.length} 条${okClear ? ' ✅' : ' ❌'}`);
    if (!okClear) process.exit(1);
  } else {
    const hit = anchors2.find((e) => JSON.stringify(e.points) === JSON.stringify(entryObj.points));
    const okVal = !!hit && JSON.stringify(hit.pointsVUV) === JSON.stringify(entryObj.pointsVUV);
    console.log(`自检：锚点 ${anchors2.length} 条，本次写入的那条${okVal ? '逐值一致 ✅' : '没找到/值不符 ❌'}（${pairs.length} 点）`);
    if (!okVal) { console.log('  期望 ' + JSON.stringify(entryObj)); console.log('  实得 ' + JSON.stringify(anchors2.map((e) => e.points))); process.exit(1); }
  }
}

/* ─────────────── 音符颤音（音高线第三种画法）：`notes[k].vibrato` 的读/改 ───────────────
 * 为什么要有这条子命令（2026-10-05 实测）：
 *   · **CLI 完全碰不到颤音**：`note` 子命令里没有 vibrato、`note get` 不报这个字段、
 *     `vocalparam` 的 pitch 行是 `available:false`（ACE 原话："…anchors and vibrato ride on top"）、
 *     中/英两份 CLI 文档全文搜 `vibrato`/`颤音` **0 命中** ⇒ 只有"界面里人画"或"改文件"两条路。
 *   · 手拼 JSON 有两个坑：① **没有颤音的音符连 `vibrato` 键都不存在** ⇒ `set-value`（只替换既有路径）插不进去，
 *     必须往 map 里**插键**；② 批量改多个音符时每插一次后面字节就位移一次 ⇒ 必须**按字节从后往前**处理。
 * 量纲（渲染实测定的，见 SKILL.md §2.2 画法③）：`frequency` = **Hz**；`amplitude` = **峰峰值（半音）**；
 *   `startPos` = 音符内 tick（本音起点起算，"跟随音符走"就靠它）。
 * ⚠️ `attackRatio`/`releaseRatio` 的换算**未定**（见 §2.2）⇒ 默认值直接抄 ACE 自己写出来的那一组，别当"比例×时值"用。
 */
function vibratoObject(o) {
  if (o.raw) return JSON.parse(o.raw);
  const num = (v, d) => (v === null || v === undefined || v === '' ? d : Number(v));
  const startTick = o.startTick !== null ? num(o.startTick, 0) : Math.round(num(o.start, 0) * 960);
  // 默认值 = **ACE 自己写出来的那一组**（2026-10-05 从一份真实工程的 77 个带颤音音符里读到的多数值：
  //   freq 6 / attackRatio 0.2 / attackLevel 0.8 / releaseRatio 0.1 / releaseLevel 1）。
  // 量纲：frequency = Hz；amplitude = **峰峰值（半音）**；attackRatio × 音符时长 = 线性起振斜坡时长（实测，见 SKILL.md §2.2③）。
  const lv = num(o.level, null);
  return {
    startPos: startTick,
    frequency: num(o.freq, 6),
    amplitude: num(o.amp, 1.5),
    phase: num(o.phase, 0),
    attackRatio: num(o.attack, 0.2),
    attackLevel: num(o.attackLevel, lv === null ? 0.8 : lv),
    releaseRatio: num(o.release, 0.1),
    releaseLevel: num(o.releaseLevel, lv === null ? 1 : lv),
  };
}

function cmdVibrato(file, o) {
  need(o.outDir || o.inPlace || o.dryRun,
    'node acep.cjs vibrato <file.acep> [--track N --clip M] [--notes uuid,…] [--freq 5.5] [--amp 1.5] [--start 0.14 | --start-tick 133] [--phase 0] [--attack A] [--release R] [--level 1] [--raw JSON] [--clear] [--out <目录>|--in-place]');
  const c = readContainer(file);
  const dec = decode(c.payload, { offsets: true });
  const root = dec.value;
  const offs = dec.offsets;

  // —— 目标 pattern ——
  let patPath = null;
  if (o.track !== null && o.clip !== null) patPath = `$.tracks[${o.track}].patterns[${o.clip}]`;
  else {
    const cands = [];
    (root.tracks || []).forEach((t, ti) => (t.patterns || []).forEach((p, pi) => {
      if ((p.notes || []).length) cands.push({ p: `$.tracks[${ti}].patterns[${pi}]`, n: p.notes.length });
    }));
    if (!cands.length) throw new Error('这个工程里没有带音符的 pattern');
    if (cands.length > 1) {
      console.log('候选 pattern：');
      cands.forEach((x) => console.log('  ' + x.p + '  ' + x.n + ' 个音符'));
      throw new Error('有多个候选，请用 --track/--clip 指定唯一一个');
    }
    patPath = cands[0].p;
  }
  const pattern = pickPath(root, patPath.replace(/^\$\./, ''));
  if (!pattern || !Array.isArray(pattern.notes)) throw new Error('路径下没有 notes：' + patPath);
  assertTickPattern(pattern, patPath);

  // —— 目标音符（缺省 = 该 pattern 全部；--notes 按 uuid 过滤）——
  const want = o.notes
    ? new Set(String(o.notes).split(/[,\s]+/).map((s) => s.replace(/[{}]/g, '')).filter(Boolean))
    : null;
  const targets = [];
  pattern.notes.forEach((n, i) => {
    if (want && !want.has(String(n.uuid).replace(/[{}]/g, ''))) return;
    targets.push({ i, note: n, path: `${patPath}.notes[${i}]`, key: `${patPath}.notes[${i}].vibrato` });
  });
  if (!targets.length) throw new Error('没有命中任何音符（--notes 里的 uuid 都不在这个 pattern？）');

  const obj = o.clear ? null : vibratoObject(o);
  console.log(`文件    ${file}`);
  console.log(`pattern ${patPath}  音符 ${pattern.notes.length} 个，命中 ${targets.length} 个`);
  console.log(o.clear ? '动作    清除颤音（删键）' : '写入    ' + JSON.stringify(obj));
  for (const t of targets) {
    const has = Object.prototype.hasOwnProperty.call(t.note, 'vibrato');
    const old = has ? JSON.stringify(t.note.vibrato) : '（无颤音·键都不存在）';
    const act = o.clear ? (has ? '删除' : '跳过（本来就没有）') : (has ? '替换' : '**插入新键**');
    console.log(`  note[${String(t.i).padStart(2)}] pos=${String(t.note.pos).padStart(5)} dur=${String(t.note.dur).padStart(5)} pitch=${String(t.note.pitch).padStart(3)}  ${act}   原: ${old.slice(0, 96)}`);
  }
  if (o.dryRun) { console.log('\n（dry-run：未写任何文件）'); return; }

  // —— 取字节区间 → **按 start 降序**应用（每插/删一次后面就位移）——
  const actions = [];
  for (const t of targets) {
    const has = Object.prototype.hasOwnProperty.call(t.note, 'vibrato');
    if (o.clear) {
      if (!has) continue;
      const rng = offs[t.key];
      if (!rng) throw new Error('拿不到 ' + t.key + ' 的字节区间');
      actions.push({ kind: 'remove', start: rng.start - textItem('vibrato').length, end: rng.end, noteRange: offs[t.path], label: `note[${t.i}]` });
    } else if (has) {
      const rng = offs[t.key];
      if (!rng) throw new Error('拿不到 ' + t.key + ' 的字节区间');
      actions.push({ kind: 'replace', start: rng.start, end: rng.end, bytes: encodeValue(obj), label: `note[${t.i}]` });
    } else {
      const rng = offs[t.path];
      if (!rng) throw new Error('拿不到 ' + t.path + ' 的 map 区间');
      actions.push({ kind: 'insert', start: rng.end, end: rng.end, noteRange: rng, bytes: encodeValue(obj), label: `note[${t.i}]` });
    }
  }
  if (!actions.length) { console.log('\n没有任何动作（都跳过了）⇒ 不写文件'); return; }
  actions.sort((a, b) => b.start - a.start);
  let payload = c.payload;
  for (const a of actions) {
    if (a.kind === 'remove') {
      const { count, hdr } = mapHeaderAt(payload, a.noteRange.start);
      const next = Buffer.concat([payload.slice(0, a.start), payload.slice(a.end)]);
      bumpMapCount(next, a.noteRange.start, hdr, count - 1);
      payload = next;
      console.log(`  ${a.label} 删键（map ${count} → ${count - 1}）`);
    } else if (a.kind === 'replace') {
      payload = Buffer.concat([payload.slice(0, a.start), a.bytes, payload.slice(a.end)]);
      console.log(`  ${a.label} 替换 @${a.start}（${a.end - a.start} → ${a.bytes.length} B）`);
    } else {
      payload = insertMapEntry(payload, a.noteRange, 'vibrato', a.bytes);
      console.log(`  ${a.label} 插键 @${a.noteRange.end}（+${textItem('vibrato').length + a.bytes.length} B）`);
    }
  }
  const packed = packContainer(c.buf.slice(0, c.headLen), payload);
  const name = o.name || path.basename(file, '.acep');

  let target;
  if (o.inPlace) {
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    fs.copyFileSync(file, `${file}.bak-${ts}`);
    fs.writeFileSync(file, packed);
    target = file;
    console.log(`写出（原地）${file}\n     备份      ${file}.bak-${ts}`);
    console.log('⚠️ ACE 里那份是旧内容 ⇒ 让它重新打开：acestudio-cli project open "' + file + '" --discard-changes');
  } else {
    const w = writePackage(o.outDir, name, packed);
    target = w.main;
    console.log(`写出 ${w.main}\n     ${w.snap}（${packed.length} B）`);
  }

  // —— 自检：回读，逐个音符比 ——
  const chk = readContainer(target);
  const d2 = decode(chk.payload, { offsets: true });
  let same = 0;
  const bad = [];
  for (const t of targets) {
    const got = pickPath(d2.value, t.path.replace(/^\$\./, ''));
    const have = got && Object.prototype.hasOwnProperty.call(got, 'vibrato');
    if (o.clear) { if (!have) same++; else bad.push(`note[${t.i}] 仍有 vibrato`); continue; }
    if (!have) { bad.push(`note[${t.i}] 没有 vibrato`); continue; }
    const g = got.vibrato;
    const okAll = Object.keys(obj).every((k) => Math.abs(Number(g[k]) - Number(obj[k])) < 1e-6);
    if (okAll) same++; else bad.push(`note[${t.i}] 值不符：${JSON.stringify(g)}`);
  }
  console.log(`自检：${same}/${targets.length} 个音符${o.clear ? '已清除' : '值一致'}${same === targets.length ? ' ✅' : ' ❌'}`);
  if (bad.length) { bad.slice(0, 5).forEach((b) => console.log('  ' + b)); process.exit(1); }
}

/* ─────────────── 自检（`acep.cjs selftest`）：把"踩过的坑"锁进工具本身 ───────────────
 * 为什么要有它（2026-10-05）：`rapPoints` 曾把 `{t:end,v:0}` 拼在平台点**之前**、而 `evalPoints` 假定升序
 *   ⇒ 整段曲线被写成 0（ACE 里看就是一条平线），而当时的"值一致 ✅"自检查不出来（自检比的是"我打算写的"）。
 *   这条自检就是给这类**纯函数**上一道锁；跑起来零依赖、不碰 ACE、不碰任何工程文件。
 */
function cmdSelfTest() {
  let pass = 0, fail = 0;
  const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  [ok]   ' + name); }
    else { fail++; console.log('  [FAIL] ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra).slice(0, 200))); }
  };

  console.log('== rap 调型：控制点必须**升序**且数值对 ==');
  for (const tone of [2, 3, 4, 0]) {
    const pts = rapPoints(tone, 1000, 400);
    const asc = pts.every((p, i) => i === 0 || p.t >= pts[i - 1].t);
    ok(`tone ${tone} 点列升序（${pts.map((p) => Math.round(p.t) + '→' + p.v).join(' ')}）`, asc, pts);
    ok(`tone ${tone} 首尾都锚 0`, pts[0].t === 1000 && pts[0].v === 0 && pts[pts.length - 1].t === 1400 && pts[pts.length - 1].v === 0, pts);
  }
  ok('tone 1（阴平）= null（不动）', rapPoints(1, 0, 100) === null);
  ok('tone 2 平台 −400 cent', rapPoints(2, 0, 100).some((p) => p.v === -400));
  ok('tone 3 平台 −800 cent', rapPoints(3, 0, 100).some((p) => p.v === -800));
  ok('tone 4 在 end−1 处 −1200 cent', (() => { const p = rapPoints(4, 0, 100); return p.some((x) => x.t === 99 && x.v === -1200); })());

  console.log('\n== evalPoints：升序折线求值 ==');
  const pts = rapPoints(3, 0, 100);                       // [0,0] [1,-800] [70,-800] [100,0]
  ok('区间内取到平台值 −800（这正是当年写成 0 的地方）', evalPoints(pts, 35) === -800, evalPoints(pts, 35));
  ok('起点取 0', evalPoints(pts, 0) === 0);
  ok('区间外取端点（负方向）', evalPoints(pts, -50) === 0);
  ok('区间外取端点（正方向）', evalPoints(pts, 999) === 0);
  ok('单调段插值正确（tone 2 的上升沿中点 ≈ −200）', Math.abs(evalPoints(rapPoints(2, 0, 100), 0.5) - (-200)) < 1e-9, evalPoints(rapPoints(2, 0, 100), 0.5));

  console.log('\n== 栅格：tick = offset + i·15/16（1024 Hz）==');
  ok('i=16 ⇒ 15 tick', Math.abs(0 + 16 * 15 / 16 - 15) < 1e-12);
  ok('3586 样本覆盖 3362 tick（离线造工程那条 lane）', Math.abs(3586 * 15 / 16 - 3361.875) < 1e-9);

  console.log('\n== CBOR：编码→解码 round-trip（独立路径，互为交叉验证）==');
  const cases = [
    ['整数 0', 0], ['整数 23', 23], ['整数 255', 255], ['整数 70000', 70000],
    ['负数 −1', -1], ['负数 −100', -100],
    ['double', -3.2375], ['double 0.4446505010128021', 0.4446505010128021],
    ['字符串（中文）', '啦'], ['布尔', true],
    ['数组', [1, 2.5, -3, '明']],
    ['嵌套 map', { a: 1, b: [2, 3], c: { d: '啦' } }],
  ];
  for (const [name, v] of cases) {
    const back = decode(encodeValue(v)).value;
    ok('round-trip ' + name, JSON.stringify(back) === JSON.stringify(v), back);
  }
  ok('half float（0xf9）解得出 1.0（漏了它会后面整段错位）', decode(Buffer.from([0xf9, 0x3c, 0x00])).value === 1);
  ok('float64（0xfb）解得出 −3.2375', Math.abs(decode(Buffer.from([0xfb].concat([...Buffer.alloc(8)]))).value || 0) === 0); // 0.0 也是合法 double
  // 解码器**支持不定长**（case 2/3/4/5 都有 `val === null` 分支）—— 这点原先没写进技能，自检把它钉住。
  // ⚠️ 反过来说：**写**侧的 `arrayHeaderAt`/`mapHeaderAt` 只认定长（遇到 0x9f / 0xbf 会抛错），两侧策略不同是刻意的。
  ok('不定长空数组 0x9f 0xff ⇒ []', JSON.stringify(decode(Buffer.from([0x9f, 0xff])).value) === '[]');
  ok('不定长数组 0x9f 01 02 ff ⇒ [1,2]', JSON.stringify(decode(Buffer.from([0x9f, 0x01, 0x02, 0xff])).value) === '[1,2]');
  ok('不定长字符串 0x7f 61 61 ff ⇒ "a"', decode(Buffer.from([0x7f, 0x61, 0x61, 0xff])).value === 'a');
  ok('不定长映射 0xbf 61 61 01 ff ⇒ {a:1}', JSON.stringify(decode(Buffer.from([0xbf, 0x61, 0x61, 0x01, 0xff])).value) === '{"a":1}');
  ok('不定长字节串 0x5f 41 41 ff ⇒ <Buffer 41>', Buffer.isBuffer(decode(Buffer.from([0x5f, 0x41, 0x41, 0xff])).value));

  console.log('\n== 打包：只改 off8/16/24，头其余字节原样 ==');
  const payload = Buffer.concat([mapStub(), textItem('x')]);
  const head = Buffer.alloc(1280, 0x5a);
  head.write('ACEP2', 0, 'latin1');
  const packed = packContainer(head, payload);
  const tmp = path.join(require('node:os').tmpdir(), 'acep-selftest-' + process.pid + '.acep');
  fs.writeFileSync(tmp, packed);
  const back = readContainer(tmp);
  fs.unlinkSync(tmp);
  ok('解出来的 payload 与写进去的一致', back.payload.equals(payload));
  ok('off8 = 头长 1280', back.headLen === 1280);
  ok('off24 = 原始长度', back.declaredRaw === payload.length);
  ok('头里 off16 = 压缩长度（头+压缩 = 文件大小）', 1280 + back.compLen === packed.length);
  ok('头其余部分（含 1248 B 高熵区）原样复制', packed.slice(32, 1280).equals(head.slice(32, 1280)));

  console.log(`\n===== 自检结果：${pass} 通过 / ${fail} 失败 =====`);
  if (fail) process.exit(1);
}
/** 自检用的最小 map：{k: 1} */
function mapStub() { return Buffer.concat([cborMapHeader(1), textItem('k'), cborUint(1)]); }

/* ─────────────────────────── 入口 ─────────────────────────── */

const FILE = argv[1];
// `selftest` 不需要文件：纯函数自检（rapPoints 升序 / evalPoints / 栅格 / CBOR round-trip / 打包）
if (cmd === 'selftest') { cmdSelfTest(); process.exit(0); }
if (!cmd || !FILE) {
  console.error(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(2);
}
try {
  switch (cmd) {
    case 'info': cmdInfo(FILE); break;
    case 'verify': cmdVerify(FILE, getArg('--expect', null)); break;
    case 'unpack': cmdUnpack(FILE, argv[2]); break;
    case 'dump': cmdDump(FILE, getArg('--tree', null), getArg('--find', null), getArg('--json', null)); break;
    case 'get': cmdGet(FILE, getArg('--path', null)); break;
    case 'set-text': cmdSetText(FILE, getArg('--old', undefined), getArg('--new', undefined), getArg('--out', null)); break;
    case 'set-json': cmdSetJson(FILE, getArg('--path', null), getArg('--value', undefined), getArg('--value-file', null), getArg('--out', null)); break;
    case 'set-value': cmdSetValue(FILE, getArg('--path', null), getArg('--value', undefined), getArg('--value-file', null), getArg('--out', null), getArg('--name', null), argv.includes('--in-place')); break;
    case 'rap-curve': {
      const tA = getArg('--track', null), cA = getArg('--clip', null);
      const outA = getArg('--out', null), inA = argv.includes('--in-place');
      cmdRapCurve(FILE, {
        tones: getArg('--tones', null),
        fromLyricTail: argv.includes('--from-lyric-tail'),
        track: tA === null ? null : Number(tA),
        clip: cA === null ? null : Number(cA),
        notes: getArg('--notes', null),
        lane: getArg('--lane', null),
        createLane: argv.includes('--create-lane'),
        outDir: outA,
        inPlace: inA,
        dryRun: !outA && !inA,
      });
      break;
    }
    case 'set-array': cmdSetArray(FILE, getArg('--sig', null), getArg('--values', null), getArg('--count', null), getArg('--out', null)); break;
    case 'vibrato': {
      const tA = getArg('--track', null), cA = getArg('--clip', null);
      const outA = getArg('--out', null), inA = argv.includes('--in-place');
      cmdVibrato(FILE, {
        track: tA === null ? null : Number(tA),
        clip: cA === null ? null : Number(cA),
        notes: getArg('--notes', null),
        freq: getArg('--freq', null), amp: getArg('--amp', null),
        start: getArg('--start', null), startTick: getArg('--start-tick', null),
        phase: getArg('--phase', null), attack: getArg('--attack', null), release: getArg('--release', null),
        attackLevel: getArg('--attack-level', null), releaseLevel: getArg('--release-level', null),
        level: getArg('--level', null), raw: getArg('--raw', null),
        clear: argv.includes('--clear'),
        name: getArg('--name', null),
        outDir: outA, inPlace: inA,
        dryRun: !outA && !inA,
      });
      break;
    }
    case 'anchor': {
      const tA = getArg('--track', null), cA = getArg('--clip', null);
      const outA = getArg('--out', null), inA = argv.includes('--in-place');
      const eA = getArg('--entry', null);
      cmdAnchor(FILE, {
        track: tA === null ? null : Number(tA),
        clip: cA === null ? null : Number(cA),
        entry: eA === null ? null : Number(eA),
        append: argv.includes('--append'),
        points: getArg('--points', null),
        vuv: getArg('--vuv', null),
        clear: argv.includes('--clear'),
        name: getArg('--name', null),
        outDir: outA, inPlace: inA,
        dryRun: !outA && !inA,
      });
      break;
    }
    default: console.error('未知子命令：' + cmd); process.exit(2);
  }
} catch (e) {
  console.error('❌ ' + e.message);
  process.exit(1);
}
