#!/usr/bin/env node
/*
 * `svp-inject-audio.cjs` 自测（不需要 SV）
 * =====================================================================
 * 三段：
 *   A. **校验器对真机的可信度**：扫真实 `.svp`，挑出含音频轨的，跑 `--validate` ⇒ 必须**全过**
 *      （若真文件都不过，说明我的 schema 判据写错了）
 *   B. **注入（只在副本上）**：复制一个真实 `.svp` 到临时目录 → 注入一条指向临时 WAV 的音频轨
 *      → 校验输出 → 断言：源文件**字节未变**、输出含 1 条音频轨、时长从 WAV 头解析正确
 *   C. **拒绝路径**：`--out == --in` 必须拒；目标已存在且无 `--force` 必须拒
 *
 * 安全：全程在 `os.tmpdir()` 下的临时目录，**不写任何用户工程的原文件**（源文件只读，且事后比对哈希）。
 * 用法：node tools/test-svp-inject.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const TOOL = path.join(__dirname, 'svp-inject-audio.cjs');
const ROOTS = [
  path.join(os.homedir(), 'Documents', 'Dreamtonics'),
  path.join(os.homedir(), 'Documents', 'OPSV'),
];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? '  → ' + extra : ''}`); }
};

function walk(dir, out = [], depth = 0) {
  if (depth > 5) return out;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (e.name.toLowerCase().endsWith('.svp')) out.push(p);
  }
  return out;
}

/** 造一个 1.5s 的合法 WAV（44100/16bit/mono） */
function makeWav(file, seconds = 1.5) {
  const sr = 44100, ch = 1, bps = 16;
  const byteRate = sr * ch * bps / 8;
  const dataSize = Math.round(byteRate * seconds);
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(ch * bps / 8, 32); buf.writeUInt16LE(bps, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(file, buf);
  return seconds;
}

console.log('扫真实 .svp 找含音频轨的样本…');
const all = ROOTS.flatMap((r) => walk(r));
console.log(`  共 ${all.length} 个 .svp`);

/* ---------- A. 校验器对真机的可信度 ---------- */
console.log('\n【A】校验器 vs 真机（含音频轨的真实工程必须全过）');
const withAudio = [];
for (const f of all) {
  if (withAudio.length >= 6) break;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if ((j.tracks || []).some((t) => t.isInstrumental === true || (t.mainRef && t.mainRef.audio))) withAudio.push(f);
  } catch { /* 跳过坏文件 */ }
}
check(`找到 ${withAudio.length} 个含音频轨的真实工程`, withAudio.length >= 3, `只找到 ${withAudio.length} 个`);
if (withAudio.length) {
  const r = run(['--validate', ...withAudio]);
  check('全部通过结构校验（说明判据与实测 schema 一致）', r.status === 0, (r.stdout || '') + (r.stderr || ''));
  if (r.stdout) console.log(r.stdout.trim().split('\n').map((l) => '     ' + l).join('\n'));
}

/* ---------- B. 注入（副本） ---------- */
console.log('\n【B】注入（只在副本上；源文件必须字节不变）');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svp-inject-test-'));
// 选一个**不含**音频轨的真实工程做底（这样输出里恰好 1 条音频轨）
let base = null;
for (const f of all) {
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const hasAudio = (j.tracks || []).some((t) => t.isInstrumental === true || (t.mainRef && t.mainRef.audio));
    if (!hasAudio && Array.isArray(j.tracks) && j.tracks.length > 0) { base = f; break; }
  } catch { /* */ }
}
check('找到不含音频轨的真实工程做底', !!base, base || '未找到');
if (base) {
  const src = path.join(tmp, 'src.svp');
  const dst = path.join(tmp, 'dst.svp');
  fs.copyFileSync(base, src);
  const before = sha(base);
  const wav = path.join(tmp, 'accomp.wav');
  const secs = makeWav(wav, 1.5);

  const r = run(['--in', src, '--out', dst, '--wav', wav, '--name', '伴奏测试', '--bpm', '120']);
  check('注入命令退出码 0', r.status === 0, (r.stdout || '') + (r.stderr || ''));
  check('输出文件已生成', fs.existsSync(dst));
  check('**源文件字节未变**', sha(base) === before, '源文件被改动了！');
  check('临时副本副本本身未被改（--in 只读）', sha(src) === before);

  if (fs.existsSync(dst)) {
    const v = run(['--validate', dst]);
    check('输出通过结构校验', v.status === 0, (v.stdout || '') + (v.stderr || ''));
    const j = JSON.parse(fs.readFileSync(dst, 'utf8'));
    const auds = j.tracks.filter((t) => t.isInstrumental === true || (t.mainRef && t.mainRef.audio));
    check('恰好注入 1 条音频轨', auds.length === 1, `实际 ${auds.length}`);
    const t = auds[0];
    if (t) {
      check('轨名正确', t.name === '伴奏测试', t.name);
      check(`时长从 WAV 头解析正确（${secs}s）`, Math.abs(t.mainRef.audio.duration - secs) < 0.01, String(t.mainRef.audio.duration));
      check('bpm 写入（可选字段）', t.mainRef.audio.bpm === 120);
      check('groupID === mainGroup.uuid', t.mainRef.groupID === t.mainGroup.uuid);
      check('dispOrder = 原轨数', t.dispOrder === j.tracks.length - 1, String(t.dispOrder));
      check('groups 为空数组', Array.isArray(t.groups) && t.groups.length === 0);
      check('audio.filename 指向给的 wav', t.mainRef.audio.filename === wav);
    }
    // 原有轨道必须原样保留
    const orig = JSON.parse(fs.readFileSync(base, 'utf8'));
    check('原有轨道逐字保留（JSON 深比较）', JSON.stringify(j.tracks.slice(0, orig.tracks.length)) === JSON.stringify(orig.tracks));
    check('顶层其它字段未动', JSON.stringify(Object.keys(j).sort()) === JSON.stringify(Object.keys(orig).sort()));
  }

  /* ---------- C. 拒绝路径 ---------- */
  console.log('\n【C】拒绝路径（安全底线）');
  const same = run(['--in', src, '--out', src, '--wav', wav]);
  check('--out == --in ⇒ 拒绝（退出码 3）', same.status === 3, String(same.status) + ' ' + (same.stderr || ''));
  const noForce = run(['--in', src, '--out', dst, '--wav', wav]);
  check('目标已存在且无 --force ⇒ 拒绝（退出码 3）', noForce.status === 3, String(noForce.status));
  const noWav = run(['--in', src, '--out', path.join(tmp, 'x.svp'), '--wav', path.join(tmp, 'nope.wav')]);
  check('WAV 不可解析且未给 --duration ⇒ 拒绝（退出码 3）', noWav.status === 3, String(noWav.status));
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
process.exit(fail ? 1 : 0);
