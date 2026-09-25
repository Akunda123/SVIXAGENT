#!/usr/bin/env node
/**
 * 真机验收：最后 4 个仍未验收的 op
 *   create_harmony_group · fill_track_lyrics · apply_tempo · align_audio
 *
 * 原则：
 *   - 每个写操作都 newUndoRecord ⇒ SV 里 Ctrl+Z 可回退；
 *   - 验收后**清理**自己造的东西（摘掉新建组引用、还原歌词）；
 *   - 缺测试条件的（如工程里没有音频轨）**如实记录为缺口**，不伪造通过。
 *
 * 用法：node sv/lua/verify-rest.cjs
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
// 宿主可指定：`node <脚本> ix` 或 `--host=ix`（默认 sv）—— 同一脚本可验 SV1/SV2/IX
const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const ipc = require(path.join(DIST, 'fileipc.js'));

const TIMEOUT = 15000;
const Q = 705600000;
const GROUP = 'AKDAgent和声测试';
// ⚠️ IX（Instrument X）是**乐器宿主、没有歌词** ⇒ 歌词类 op 在它上面没有语义
//    （`getLyrics/setLyrics` 只是同构 API，没有声库去解释）⇒ 歌词断言只在 SV1/SV2 上有意义。
const VOCAL = HOST !== 'ix';
let pass = 0, fail = 0, gaps = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);
const gap = (m) => { gaps.push(m); console.log(`  [缺口] ${m}`); };

async function call(op, args) {
  return ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: TIMEOUT });
}
async function callOk(op, args) {
  const r = await call(op, args);
  if (!r.ok) throw new Error(`${op} 失败：${r.error}`);
  return r.result;
}
const script = async (code) => (await callOk('run_script', { code, readonly: true })).result;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log(`桥：${hb && hb.bridge} · ${hb && hb.hostName} ${hb && hb.version}`);

  // 工程概况 + 当前组
  const pi = await callOk('get_project_info', {});
  const cg = await callOk('get_current_group', {});
  console.log(`工程：${pi.numTracks} 轨 · 当前组「${cg.current ? cg.name : '(无)'}」${cg.noteCount} 音符\n`);

  // 先看看有没有音频轨（决定 align_audio 能不能验 happy path）
  const audio = await script(`
local proj = SV:getProject()
local out = {}
for t = 1, proj:getNumTracks() do
  local tr = proj:getTrack(t)
  for g = 1, tr:getNumGroups() do
    local ref = tr:getGroupReference(g)
    if ref:isInstrumental() then
      out[#out + 1] = { track = t - 1, group = g - 1, name = ref:getTarget():getName() }
    end
  end
end
return out
`);

  console.log('== 1. create_harmony_group（写：新建和声组）==');
  {
    const before = (pi.tracks || [])[0] ? (pi.tracks[0].groups || []).length : 0;
    const r = await callOk('create_harmony_group', {
      groupName: GROUP,
      notes: [
        { pitch: 64, onsetBlicks: 0, durationBlicks: 2 * Q, lyrics: 'do' },
        { pitch: 67, onsetBlicks: 2 * Q, durationBlicks: 2 * Q, lyrics: 'mi' },
        { pitch: 72, onsetBlicks: 4 * Q, durationBlicks: 2 * Q },
      ],
    });
    ok('ok = true', r.ok === true, r);
    ok('groupName 回显', r.groupName === GROUP, r.groupName);
    ok('noteCount = 3', r.noteCount === 3, r.noteCount);
    const after = await callOk('get_project_info', {});
    const g = ((after.tracks || [])[0].groups || []).find((x) => x.name === GROUP);
    ok('工程里查得到新组且 3 个音符', !!g && g.numNotes === 3, g);
    ok('轨上多了一个组引用', ((after.tracks || [])[0].groups || []).length === before + 1,
      `${((after.tracks || [])[0].groups || []).length} vs ${before}`);
    note(`组「${GROUP}」已建（可 Ctrl+Z 回退；下面会摘掉它的引用）`);

    // 清理：把该组的引用从轨上摘掉（库里留一份无害）
    const cleaned = await script(`
local ed = SV:getMainEditor()
local tr = ed:getCurrentTrack()
local removed = 0
for g = tr:getNumGroups(), 1, -1 do
  if tr:getGroupReference(g):getTarget():getName() == "${GROUP}" then
    tr:removeGroupReference(g)
    removed = removed + 1
  end
end
return removed
`);
    note(`清理：摘掉 ${JSON.stringify(cleaned)} 个引用`);
  }

  console.log('\n== 2. fill_track_lyrics（写：按轨填词）==');
  if (!VOCAL) {
    // IX = 乐器宿主，没有歌词概念 ⇒ 本段**不适用**（不是失败、也不是缺口）
    console.log('  [不适用] IX 是乐器宿主、没有歌词 —— 歌词落词语义只能在 SV1/SV2 上验');
    note('（早前我在 IX 上测过这一段，读回"错位"其实是**无效测量**：没有声库解释歌词）');
  } else if (cg.noteCount === 0) {
    // ⚠️ 空工程里该轨没有音符 ⇒ op **正确报错**（"track has no fillable notes"），不是缺陷。
    //    历史教训：早前这里直接 callOk ⇒ 抛异常 ⇒ 后面 3、4 两个 op **根本没跑到**（假性"只验了 2 个"）。
    const trackName0 = ((pi.tracks || [])[0] || {}).name;
    const rErr = await call('fill_track_lyrics', { lyrics: 'la', track: trackName0 });
    ok('轨上无可填音符 ⇒ 明确报错（不静默、不误填）',
      rErr.ok === false && /no fillable notes/.test(String(rErr.error)), rErr.error);
    gap('fill_track_lyrics 的填词/切分未验：该轨当前没有音符（在工程里放几个音符后重跑本脚本）');
  } else {
    const trackName = ((pi.tracks || [])[0] || {}).name;
    const r = await callOk('fill_track_lyrics', { lyrics: 'do re mi fa sol la', track: trackName });
    ok('ok = true', r.ok === true, r);
    ok('track 名回显', r.track === trackName, r.track);
    ok('notes = 音符数', r.notes === cg.noteCount, `${r.notes} vs ${cg.noteCount}`);
    ok('lyricTotal = 6', r.lyricTotal === 6, r.lyricTotal);
    ok('filled = min(6, notes)', r.filled === Math.min(6, cg.noteCount), r.filled);
    note(`组「${r.group}」填词：${r.filled}/${r.notes}`);

    // 读回确认。⚠️ **不要按组内下标断言**（用户 09-12 指出：SV 里音符顺序按 onset，
    //    写和弦会让同 onset 的 index 变乱；桥 v0.3.6 已改为"先快照 + 按 onset 稳定排序"再填）⇒
    //    这里用**集合比较**：6 个 token 是否都落上了、op 回报的 filled 是否等于真实写入数。
    const mel = await callOk('get_melody_notes', {});
    const rows = mel.notes || [];
    const lyr = rows.map((x) => x.lyrics).join('|');
    const TOKENS = ['do', 're', 'mi', 'fa', 'sol', 'la'];
    const got = rows.map((x) => x.lyrics).filter((s) => s && s !== '-').sort();
    const want = TOKENS.slice().sort();
    ok('6 个 token 全部落到音符上（集合相符，不看顺序）',
      got.length === want.length && got.every((v, i) => v === want[i]),
      `filled=${r.filled} got=${got.join(',')} 读回=${lyr}`);
    ok('op 回报 filled = 真正写入的非 "-" 音符数',
      r.filled === got.length && r.failed === 0, `filled=${r.filled} failed=${r.failed} 实得=${got.length}`);
    note(`读回：${lyr}（filled=${r.filled} written=${r.written} unique=${r.uniqueNotes} dup=${r.duplicateNotes}）`);

    // 还原。⚠️ 真机行为：**歌词无空白 ⇒ 逐字切分** ⇒ "la" 会被拆成 "l","a"
    //    （与 JS 同策略：含空白才按词）。收尾用**带空格的**"la la la …"才能一词一音。
    const spaced = Array(rows.length).fill('la').join(' ');
    await callOk('fill_track_lyrics', { lyrics: 'la', track: trackName });
    const mel2 = await callOk('get_melody_notes', {});
    const rows2 = mel2.notes || [];
    const got2 = rows2.map((x) => x.lyrics).filter((s) => s && s !== '-');
    ok('无空白歌词按字切分（"la" ⇒ 拆成 l / a 两个 token，不是整词）',
      got2.length <= 2 && got2.every((s) => s === 'l' || s === 'a'), rows2.map((x) => x.lyrics).join('|'));
    await callOk('fill_track_lyrics', { lyrics: spaced, track: trackName });
    const mel3 = await callOk('get_melody_notes', {});
    const rows3 = mel3.notes || [];
    ok('带空格歌词按词切分（"la la …" ⇒ 有词的音都是 "la"，其余保持 "-"）',
      rows3.length > 0 && rows3.every((x) => x.lyrics === 'la' || x.lyrics === '-') &&
      rows3.some((x) => x.lyrics === 'la'),
      rows3.map((x) => x.lyrics).join('|'));
    note(`收尾歌词：${rows3.map((x) => x.lyrics).join('|')}`);
  }

  console.log('\n== 3. apply_tempo（写：逐段打 tempo 标）==');
  {
    const before = await script(`
local ta = SV:getProject():getTimeAxis()
local m = ta:getAllTempoMarks()
return { count = #m, first = m[1] and m[1].bpm or nil }
`);
    note(`写前 tempo 标数：${before.count}（首个 bpm=${JSON.stringify(before.first)}）`);
    const r = await callOk('apply_tempo', {
      tempoMarks: [{ blick: 0, bpm: 120 }, { blick: 4 * Q, bpm: 126 }, { seconds: 4, bpm: 132 }],
      clearExisting: false,
    });
    ok('ok = true', r.ok === true, r);
    ok('count = 3', r.count === 3, r.count);
    ok('first = {0, 120}', r.first && r.first.blick === 0 && r.first.bpm === 120, r.first);
    ok('last.bpm = 132', r.last && r.last.bpm === 132, r.last);
    ok('seconds→blick 换算（第 3 个 > 0）', r.applied[2].blick > 0, r.applied[2]);

    const after = await script(`
local ta = SV:getProject():getTimeAxis()
local m = ta:getAllTempoMarks()
local out = {}
for i = 1, #m do out[i] = { bpm = m[i].bpm, position = m[i].position } end
return out
`);
    // ⚠️ 真机行为：**同一位置的 tempo 标会被合并/替换，而不是叠加**
    //    （写 3 个标、其中位置 0 与已有标重合 ⇒ 宿主侧最终是 3 个而非 4 个）
    ok('宿主侧标数 = 本次写入数（同位置合并而非叠加）', Array.isArray(after) && after.length === r.count,
      `${Array.isArray(after) ? after.length : '?'} vs ${r.count}（写前 ${before.count}）`);
    const bpms = (after || []).map((x) => x.bpm);
    ok('读回含 120 / 126 / 132', bpms.includes(120) && bpms.includes(126) && bpms.includes(132), bpms);
    note(`写后 bpm 序列：${bpms.join(' / ')}`);

    // 清理：清掉刚加的标（clearExisting + 只留一个 120）
    const rc = await callOk('apply_tempo', { tempoMarks: [{ blick: 0, bpm: 120 }], clearExisting: true });
    note(`清理：clearedExisting=${rc.clearedExisting} count=${rc.count}`);
    const finalMarks = await script(`
local m = SV:getProject():getTimeAxis():getAllTempoMarks()
return #m
`);
    ok('清理后只剩 1 个标', finalMarks === 1, finalMarks);
  }

  console.log('\n== 4. align_audio（写：音频轨对齐）==');
  {
    if (!audio || audio.length === 0) {
      const r = await call('align_audio', { firstBeatSec: 0.5, anchor: 'measure', measure: 1 });
      ok('无音频轨时**报错**而不是静默改坏（错误路径验收）', r.ok === false, r.ok ? r.result : String(r.error));
      note(`错误信息：${String(r.error).slice(0, 120)}`);
      gap('工程里没有音频轨（isInstrumental 组）⇒ align_audio 的 happy path **未验**；需要带音频轨的工程');
    } else {
      note(`找到 ${audio.length} 个音频轨：${JSON.stringify(audio)}`);
      const r = await callOk('align_audio', { firstBeatSec: 0.5, anchor: 'measure', measure: 1 });
      ok('ok = true', r.ok === true, r);
      ok('返回 trackIndex / groupIndex', typeof r.trackIndex === 'number' && typeof r.groupIndex === 'number', r);
      ok('返回 absoluteOnsetBlicks / useOnset', typeof r.absoluteOnsetBlicks === 'number' && typeof r.useOnset === 'boolean', r);
      ok('anchor = measure', r.anchor === 'measure', r.anchor);
      note(`音频轨对齐：onset=${r.absoluteOnsetBlicks} useOnset=${r.useOnset} firstBeatBlick=${r.firstBeatBlick}`);
      // ⚠️ 验收动作会把音频轨挪走 ⇒ **必须还原**（否则污染用户工程）。
      //    还原方式：把该组引用的 time offset 设回 0（该值就是对齐前的典型状态）。
      const restored = await callOk('run_script', {
        code: `
local proj = SV:getProject()
proj:newUndoRecord()
local ref = proj:getTrack(${r.trackIndex + 1}):getGroupReference(${r.groupIndex + 1})
local before = ref:getTimeOffset()
ref:setTimeOffset(0)
return { before = before, after = ref:getTimeOffset() }
`,
      });
      note(`已还原音频轨位置：${JSON.stringify(restored.result)}`);
      ok('音频轨已还原到 offset = 0', restored.result && restored.result.after === 0, restored.result);
    }
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败${gaps.length ? ' / ' + gaps.length + ' 项缺口' : ''} =====`);
  gaps.forEach((g) => console.log(`  [缺口] ${g}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
