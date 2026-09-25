#!/usr/bin/env node
/*
 * .svp 音频轨注入器 / 结构校验器
 * =====================================================================
 * 为什么需要：**SV 官方脚本 API 造不出音频轨**（无 setAudioFile 类方法，只有只读 + setTimeRange 移动），
 * 所以想把伴奏自动塞进工程只能**在工程关闭时改 .svp**。音频轨的完整结构由
 * `tools/svp-audio-schema.cjs` 从 **1005 个真实 .svp / 26 条音频轨** 实测得出，写在
 * `skills/sv-project-format/SKILL.md` 的「生成 .svp：版本策略 · 音频轨注入 · 196 最小模板」节
 * （2026-09-19 从 `svp-format.md` 并入，后者已删除）。
 *
 * ⚠️ 安全底线（本工具的设计前提）
 *   1. **永不原地改**：`--out` 必须 ≠ `--in`；目标已存在须显式 `--force`；
 *      写之前若 `--backup` 则先备份目标。
 *   2. **只动 `tracks[]`**：其余顶层字段一律原样保留（不重排、不补字段）。
 *   3. **写前先校验**：注入后立刻跑结构校验（26/26 必需键、groupID 一致、类型正确），
 *      校验不过就**不落盘**（`--out` 不生成）。
 *   4. **真机验收不代替**：SV 能否打开、路径能否解析，**必须在 SV 里验**（本工具只保证结构）。
 *
 * 用法
 *   node tools/svp-inject-audio.cjs --validate <file.svp> [...more]
 *   node tools/svp-inject-audio.cjs --in <src.svp> --out <dst.svp> --wav <path.wav>
 *        [--name 伴奏] [--duration 秒] [--offset-blick N] [--bpm N] [--beats 0.5,1.0,...]
 *        [--force] [--backup] [--quiet]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const A = process.argv.slice(2);
const has = (n) => A.includes('--' + n);
const arg = (n, d) => { const i = A.indexOf('--' + n); return i >= 0 && A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : d; };
const QUARTER = 705600000;   // SV.QUARTER

/* ---------------- WAV 时长（标准 RIFF 解析，无依赖） ----------------
 * ⚠️ 必须完全防御：文件不存在/不是 RIFF/长度不足都返回 null，
 *    由调用方走「--duration 未给且解析失败 ⇒ 退出码 3」的正常拒绝路径。
 *    （首版漏了 try/catch，文件不存在时抛 ENOENT ⇒ 退出码 1 + 堆栈，自测抓到）*/
function wavDurationSec(file) {
  let b;
  try { b = fs.readFileSync(file); } catch { return null; }
  try {
    if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
    let off = 12, byteRate = 0, dataSize = 0;
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4);
      const size = b.readUInt32LE(off + 4);
      if (id === 'fmt ') {
        if (off + 16 > b.length) return null;
        byteRate = b.readUInt32LE(off + 8 + 8);
      } else if (id === 'data') { dataSize = size; break; }
      off += 8 + size + (size % 2);
    }
    if (!byteRate || !dataSize) return null;
    return dataSize / byteRate;
  } catch { return null; }
}

/* ---------------- 结构校验（判据 = 实测 schema） ---------------- */
const PARAMS = ['pitchDelta', 'vibratoEnv', 'loudness', 'tension', 'breathiness', 'voicing', 'gender', 'toneShift'];

function validateAudioTrack(t) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  const isStr = (v) => typeof v === 'string';
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  need(isStr(t.name) && t.name.length > 0, 'name 缺失/空');
  need(isStr(t.dispColor), 'dispColor 缺失');
  need(isNum(t.dispOrder), 'dispOrder 缺失');
  need(typeof t.renderEnabled === 'boolean', 'renderEnabled 缺失');
  const mx = t.mixer || {};
  need(isNum(mx.gainDecibel) && isNum(mx.pan) && typeof mx.mute === 'boolean'
    && typeof mx.solo === 'boolean' && typeof mx.display === 'boolean', 'mixer 五字段不全');

  const mg = t.mainGroup || {};
  need(isStr(mg.name) && isStr(mg.uuid), 'mainGroup.name/uuid 缺失');
  const pr = mg.parameters || {};
  const missingP = PARAMS.filter((k) => !pr[k] || !isStr(pr[k].mode) || !Array.isArray(pr[k].points));
  need(missingP.length === 0, `mainGroup.parameters 缺 ${missingP.join(',')}`);
  need(mg.vocalModes && typeof mg.vocalModes === 'object', 'mainGroup.vocalModes 缺失');
  need(Array.isArray(mg.notes) && mg.notes.length === 0, 'mainGroup.notes 必须是空数组');

  const mr = t.mainRef || {};
  need(isStr(mr.groupID), 'mainRef.groupID 缺失');
  need(mr.groupID === mg.uuid, 'mainRef.groupID 必须等于 mainGroup.uuid');
  need(isNum(mr.blickAbsoluteBegin) && isNum(mr.blickAbsoluteEnd), 'blickAbsoluteBegin/End 缺失');
  need(isNum(mr.blickOffset) && isNum(mr.pitchOffset), 'blickOffset/pitchOffset 缺失');
  need(mr.isInstrumental === true, 'mainRef.isInstrumental 必须为 true');
  need(mr.systemPitchDelta && isStr(mr.systemPitchDelta.mode) && Array.isArray(mr.systemPitchDelta.points), 'systemPitchDelta 结构不对');

  const au = mr.audio || {};
  need(isStr(au.filename) && au.filename.length > 0, 'mainRef.audio.filename 缺失/空');
  need(isNum(au.duration) && au.duration > 0, 'mainRef.audio.duration 必须是正数');

  const db = mr.database || {};
  ['name', 'language', 'phoneset', 'languageOverride', 'phonesetOverride', 'backendType', 'version']
    .forEach((k) => need(isStr(db[k]), `mainRef.database.${k} 缺失（音频轨也要带空骨架）`));
  need(isStr(mr.dictionary), 'mainRef.dictionary 缺失');
  const v = mr.voice || {};
  need(typeof v.vocalModeInherited === 'boolean' && isStr(v.vocalModePreset) && v.vocalModeParams && typeof v.vocalModeParams === 'object',
    'mainRef.voice 三字段不全');
  ['pitchTakes', 'timbreTakes'].forEach((k) => {
    const tk = mr[k] || {};
    need(isNum(tk.activeTakeId) && Array.isArray(tk.takes) && tk.takes.length > 0, `mainRef.${k} 缺（注意是两个 take 容器，不是单个 takes）`);
  });
  need(Array.isArray(t.takes) === false, '⚠️ 出现顶层 takes —— 实测 schema 里没有这个字段（应为 mainRef.pitchTakes/timbreTakes）');
  need(Array.isArray(t.groups) && t.groups.length === 0, 'groups 必须是空数组');
  return errs;
}

function validateFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let j;
  try { j = JSON.parse(raw); } catch (e) { return { file, ok: false, tracks: 0, audio: 0, errs: ['JSON 解析失败: ' + e.message] }; }
  const errs = [];
  if (!Array.isArray(j.tracks)) errs.push('顶层 tracks 不是数组');
  const tracks = j.tracks || [];
  const audioIdx = [];
  tracks.forEach((t, i) => {
    const isAudio = t.isInstrumental === true || (t.mainRef && t.mainRef.audio !== undefined);
    if (isAudio) { audioIdx.push(i); validateAudioTrack(t).forEach((e) => errs.push(`轨[${i}] ${e}`)); }
  });
  return { file, ok: errs.length === 0, version: j.version, tracks: tracks.length, audio: audioIdx.length, audioIdx, errs };
}

/* ---------------- 注入 ---------------- */
function buildAudioTrack(opts) {
  const uuid = crypto.randomUUID();
  const t = {
    name: opts.name,
    dispColor: opts.dispColor || 'ffd14f5b',
    dispOrder: opts.dispOrder,
    renderEnabled: false,
    mixer: { gainDecibel: 0, pan: 0, mute: false, solo: false, display: true },
    mainGroup: {
      name: 'main',
      uuid,
      parameters: PARAMS.reduce((o, k) => (o[k] = { mode: 'cubic', points: [] }, o), {}),
      vocalModes: {},
      notes: [],
    },
    mainRef: {
      groupID: uuid,
      blickAbsoluteBegin: 0,
      blickAbsoluteEnd: -1,
      blickOffset: opts.blickOffset,
      pitchOffset: 0,
      isInstrumental: true,
      systemPitchDelta: { mode: 'cubic', points: [] },
      audio: { filename: opts.filename, duration: opts.duration },
      database: {
        name: '', language: '', phoneset: '', languageOverride: '', phonesetOverride: '',
        backendType: '', version: '-2',
      },
      dictionary: '',
      voice: { vocalModeInherited: true, vocalModePreset: '', vocalModeParams: {} },
      pitchTakes: { activeTakeId: 0, takes: [{ id: 0, expr: 0, liked: false }] },
      timbreTakes: { activeTakeId: 0, takes: [{ id: 0, expr: 0, liked: false }] },
    },
    groups: [],
  };
  if (opts.bpm) t.mainRef.audio.bpm = opts.bpm;
  if (opts.beats) t.mainRef.audio.beatLocations = opts.beats;
  return t;
}

function main() {
  /* --- 校验模式 --- */
  if (has('validate')) {
    const files = A.filter((x, i) => x !== '--validate' && !x.startsWith('--') && A[i - 1] !== '--validate');
    const useFiles = files.length ? files : A.slice(A.indexOf('--validate') + 1).filter((x) => !x.startsWith('--'));
    if (!useFiles.length) { console.error('用法：--validate <file.svp> [...]'); process.exit(2); }
    let bad = 0;
    for (const f of useFiles) {
      const r = validateFile(f);
      const tag = r.ok ? '✅' : '❌';
      console.log(`${tag} ${path.basename(f)}  version=${r.version}  轨=${r.tracks}  音频轨=${r.audio}`);
      if (!r.ok) { bad++; r.errs.slice(0, 12).forEach((e) => console.log('     · ' + e)); }
    }
    process.exit(bad ? 1 : 0);
  }

  /* --- 注入模式 --- */
  const inF = arg('in'), outF = arg('out'), wav = arg('wav');
  if (!inF || !outF || !wav) { console.error('用法：--in <src.svp> --out <dst.svp> --wav <path.wav> [--name 伴奏] [--duration 秒] [--offset-blick N] [--bpm N] [--beats a,b] [--force] [--backup]'); process.exit(2); }
  const inAbs = path.resolve(inF), outAbs = path.resolve(outF);
  if (inAbs === outAbs) { console.error('❌ 拒绝：--out 不能等于 --in（本工具永不原地改）'); process.exit(3); }
  if (!fs.existsSync(inAbs)) { console.error('❌ 源文件不存在：' + inAbs); process.exit(3); }
  if (fs.existsSync(outAbs) && !has('force')) { console.error('❌ 目标已存在，需 --force：' + outAbs); process.exit(3); }

  const j = JSON.parse(fs.readFileSync(inAbs, 'utf8'));
  if (!Array.isArray(j.tracks)) { console.error('❌ 源文件没有 tracks 数组'); process.exit(3); }

  let dur = Number(arg('duration', '0')) || wavDurationSec(wav);
  if (!dur || !isFinite(dur)) { console.error('❌ 拿不到音频时长：--duration 未给，且 WAV 解析失败（需标准 RIFF/WAVE）'); process.exit(3); }
  dur = Math.round(dur * 1e6) / 1e6;

  const beats = arg('beats') ? arg('beats').split(',').map(Number).filter((x) => isFinite(x)) : null;
  const track = buildAudioTrack({
    name: arg('name', '伴奏'),
    dispOrder: j.tracks.length,
    filename: wav,
    duration: dur,
    blickOffset: Number(arg('offset-blick', '0')) || 0,
    bpm: arg('bpm') ? Number(arg('bpm')) : null,
    beats,
  });

  // 注入前先单独校验这条新轨
  const preErrs = validateAudioTrack(track);
  if (preErrs.length) { console.error('❌ 生成的音频轨未通过结构校验：\n   ' + preErrs.join('\n   ')); process.exit(4); }

  j.tracks.push(track);       // **只动 tracks[]**
  const tmp = outAbs + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(j), 'utf8');

  const post = validateFile(tmp);
  if (!post.ok) {
    fs.rmSync(tmp, { force: true });
    console.error('❌ 注入后结构校验失败，**未写出目标文件**：\n   ' + post.errs.slice(0, 12).join('\n   '));
    process.exit(5);
  }
  if (fs.existsSync(outAbs) && has('backup')) fs.copyFileSync(outAbs, outAbs + '.bak');
  fs.renameSync(tmp, outAbs);

  if (!has('quiet')) {
    console.log(`✅ 已注入音频轨`);
    console.log(`   源       ${inAbs}  （只读，未改动）`);
    console.log(`   目标     ${outAbs}`);
    console.log(`   音频     ${wav}`);
    console.log(`   时长     ${dur}s${arg('duration') ? '（显式指定）' : '（从 WAV 头解析）'}`);
    console.log(`   轨道     名="${track.name}"  dispOrder=${track.dispOrder}  blickOffset=${track.mainRef.blickOffset}`);
    console.log(`   校验     26/26 必需键 ✅  groupID==uuid ✅  groups=[] ✅`);
    console.log(`   轨数     ${post.tracks}（原 ${post.tracks - 1}）`);
    console.log(`\n⚠️ 真机验收仍需你：**关掉工程**再替换文件 → 打开 SV 看轨道是否出现、音频是否定位正确。`);
  }
}

main();
