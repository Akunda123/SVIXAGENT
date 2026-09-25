#!/usr/bin/env node
/**
 * 真机验收（写操作 + 音符级字段）
 *
 * 流程：
 *   ① write_chords  → 在空工程里建一个测试和弦组（4 个音符），顺带验收写操作
 *   ② run_script    → 选中该组全部音符（只读语义：只改选区，readonly=true）
 *   ③ get_selected_notes → 验音符级字段（onsetQuarter/durationQuarter/endQuarter/lyrics）
 *   ④ run_script    → 把当前组切到测试组（有 has() 守卫）
 *   ⑤ get_melody_notes / get_note_time → 验第二组音符级读操作
 *   ⑥ transpose_selected_notes +2 / -2 → 验写并还原
 *   ⑦ set_selected_lyrics / apply_lyrics（含中文逐字）→ 验写
 *   ⑧ playback stop（无害）
 *
 * 所有写操作都会先 newUndoRecord ⇒ SV 里 Ctrl+Z 可逐步回退。
 * 用法：node sv/lua/verify-notes.cjs
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

const GROUP = 'AKDAgent测试';
// ⚠️ 期望值必须**由本脚本自己的请求参数推导**，不能硬编码：
//    本脚本种的是 C 三和弦 + Am、各 **4 拍**、整体 `octaveShift: -12` ⇒ 首音 = 60−12 = **48**、时值 **4 拍**。
//    早前这里硬编码 60/C4 与 1 拍，与请求不符 ⇒ 在 SV2 上报了 5 条**假失败**（桥行为其实是对的）。
const CHORD_ROOT = 60;
const OCTAVE_SHIFT = -12;
const CHORD_Q = 4;                                 // 每个和弦 4 拍
const EXPECT_PITCH = CHORD_ROOT + OCTAVE_SHIFT;    // 48 = C3
const TIMEOUT = 8000;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 200) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);

async function call(op, args) {
  return ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: TIMEOUT });
}
async function callOk(op, args) {
  const r = await call(op, args);
  if (!r.ok) throw new Error(`${op} 失败：${r.error}`);
  return r.result;
}

(async () => {
  console.log(`IPC 目录 = ${ipc.resolveIpcDir()}`);
  const hb = ipc.readHeartbeat(HOST);
  console.log(`桥：${hb && hb.bridge} · 宿主 ${hb && hb.hostName} ${hb && hb.version}\n`);

  console.log('== 1. write_chords（写：建测试和弦组）==');
  let wrote = null;
  {
    const r = await callOk('write_chords', {
      trackIndex: 0,
      groupName: GROUP,
      pattern: 'block',
      octaveShift: -12,
      chordSegs: [
        { name: 'C',  startBlick: 0,             durationBlick: 4 * 705600000 },
        { name: 'Am', startBlick: 4 * 705600000, durationBlick: 4 * 705600000 },
      ],
    });
    wrote = r;
    ok('ok = true', r.ok === true, r);
    ok('noteCount = 6（2 个三和弦）', r.noteCount === 6, r.noteCount);
    ok('trackIndex = 0', r.trackIndex === 0, r.trackIndex);
    ok('minPitch/maxPitch 有值', typeof r.minPitch === 'number' && typeof r.maxPitch === 'number',
      `${r.minPitch}/${r.maxPitch}`);
    note(`组「${r.groupName}」${r.noteCount} 音，音域 ${r.minPitch}~${r.maxPitch}`);
  }

  console.log('\n== 2. 读回工程结构（确认组与音符真的进了工程）==');
  {
    const pi = await callOk('get_project_info', {});
    const t0 = (pi.tracks || [])[0] || {};
    const g = (t0.groups || []).find((x) => x.name === GROUP);
    ok(`工程里能找到组「${GROUP}」`, !!g, (t0.groups || []).map((x) => x.name));
    ok('该组 numNotes = 6', g && g.numNotes === 6, g && g.numNotes);
    note(`轨 0「${t0.name}」现有组：${(t0.groups || []).map((x) => `${x.index}:${x.name}(${x.numNotes})`).join(' ')}`);
  }

  console.log('\n== 3. 前置条件：当前组要有音符（**本脚本不造数据**）==');
  // ⚠️ 早期版本会往"当前组"插 6 个音符 —— 空工程里那就是**轨道主组**（isMain=true），
  //    SV2 上主组不可被编辑（用户 2026-09-12 指出）⇒ 改为要求你准备好音符，脚本绝不插音符。
  {
    const cg0 = await callOk('get_current_group', {});
    note(`当前组：${cg0.current ? cg0.name : '(无)'}（${cg0.noteCount} 音符）`);
    if (!cg0.current || cg0.noteCount === 0) {
      console.log('\n⚠️ 当前组没有音符 —— 请在 SV 里画几个音符或用有音符的组，然后重跑。');
      process.exit(2);
    }
  }

  console.log('\n== 4. run_script 选中当前组全部音符（只改选区）==');
  const selectCode = `
local ed = SV:getMainEditor()
local sel = ed:getSelection()
sel:clearNotes()
local g = ed:getCurrentGroup():getTarget()
for k = 1, g:getNumNotes() do sel:selectNote(g:getNote(k)) end
return g:getNumNotes()
`;
  {
    const r = await callOk('run_script', { code: selectCode, readonly: true });
    ok('选中了 6 个音符', r.result === 6, r);
    note(`run_script 返回 ${JSON.stringify(r.result)}（resultType=${r.resultType}）`);
  }

  console.log('\n== 5. get_selected_notes（音符级字段验收）==');
  let selNotes = null;
  {
    const r = await callOk('get_selected_notes', {});
    selNotes = r;
    ok('count = 6', r.count === 6, r.count);
    const n0 = (r.notes || [])[0];
    ok('index 0 起', n0 && n0.index === 0, n0 && n0.index);
    ok(`pitch 是数字（应为 ${EXPECT_PITCH}，= ${CHORD_ROOT}${OCTAVE_SHIFT} 八度移位后的和弦根音）`,
      n0 && n0.pitch === EXPECT_PITCH, n0 && n0.pitch);
    ok('onsetQuarter 是数字', n0 && typeof n0.onsetQuarter === 'number', n0 && n0.onsetQuarter);
    ok(`durationQuarter = ${CHORD_Q}（脚本种的和弦就是 ${CHORD_Q} 拍）`,
      n0 && n0.durationQuarter === CHORD_Q, n0 && n0.durationQuarter);
    ok('endQuarter = onsetQuarter + durationQuarter',
      n0 && Math.abs(n0.endQuarter - (n0.onsetQuarter + n0.durationQuarter)) < 1e-9,
      n0 && `${n0.endQuarter} vs ${n0.onsetQuarter}+${n0.durationQuarter}`);
    ok('lyrics 字段存在（无歌词应为空串）', n0 && 'lyrics' in n0, n0 && n0.lyrics);
    note(`第 1 音：pitch=${n0.pitch} onsetQ=${n0.onsetQuarter} durQ=${n0.durationQuarter} endQ=${n0.endQuarter} lyrics=${JSON.stringify(n0.lyrics)}`);
    note(`全部：${r.notes.map((n) => `${n.pitch}@${n.onsetQuarter}q`).join(' ')}`);
  }

  console.log('\n== 6. get_melody_notes / get_note_time（当前组已是测试组）==');
  {
    const mel = await callOk('get_melody_notes', {});
    ok('get_melody_notes.current = true', mel.current === true, mel);
    ok('noteCount = 6', mel.noteCount === 6, mel.noteCount);
    const m0 = (mel.notes || [])[0];
    ok('notes[0].onsetBlicks 是数字', m0 && typeof m0.onsetBlicks === 'number', m0 && m0.onsetBlicks);
    ok('notes[0].durationBlicks 是数字', m0 && typeof m0.durationBlicks === 'number', m0 && m0.durationBlicks);
    ok('notes[0].endBlicks 是数字', m0 && typeof m0.endBlicks === 'number', m0 && m0.endBlicks);
    ok('notes[0].onsetQuarter 是数字', m0 && typeof m0.onsetQuarter === 'number');
    ok('notes[0].onsetSeconds 是数字', m0 && typeof m0.onsetSeconds === 'number', m0 && m0.onsetSeconds);
    ok('notes[0].index = 0', m0 && m0.index === 0);
    note(`旋律：${(mel.notes || []).slice(0, 8).map((x) => `${x.pitch}@${x.onsetQuarter}q/${x.onsetSeconds}s`).join(' ')}`);

    const nt = await callOk('get_note_time', { measure: 1, noteIndex: 0 });
    ok('get_note_time.found = true', nt.found === true, nt);
    ok('onsetBlick 是数字', typeof nt.onsetBlick === 'number', nt.onsetBlick);
    ok('onsetSeconds 是数字（getSecondsFromBlick 真机可用）', typeof nt.onsetSeconds === 'number', nt.onsetSeconds);
    ok('pitch 与组内第 1 音一致', nt.pitch === EXPECT_PITCH, nt.pitch);
    note(`第 1 小节第 0 音：pitch=${nt.pitch} onsetBlick=${nt.onsetBlick} (${nt.onsetQuarter}q / ${nt.onsetSeconds}s) lyrics=${JSON.stringify(nt.lyrics)}`);
  }

  console.log('\n== 7. transpose_selected_notes +2 然后 -2（写 + 还原）==');
  {
    const up = await callOk('transpose_selected_notes', { semitones: 2 });
    ok('changed = 6', up.changed === 6, up.changed);
    let after = await callOk('get_selected_notes', {});
    ok(`升 2 个半音（${EXPECT_PITCH}→${EXPECT_PITCH + 2}）`, after.notes[0].pitch === EXPECT_PITCH + 2, after.notes[0].pitch);
    const down = await callOk('transpose_selected_notes', { semitones: -2 });
    ok('changed = 6（降回）', down.changed === 6, down.changed);
    after = await callOk('get_selected_notes', {});
    ok(`已还原为 ${EXPECT_PITCH}`, after.notes[0].pitch === EXPECT_PITCH, after.notes[0].pitch);
  }

  console.log('\n== 8. 歌词写入：set_selected_lyrics + apply_lyrics（中文逐字）==');
  // ⚠️ IX 是**乐器宿主、没有歌词** ⇒ 这一段在 IX 上只算"API 计数快照"（changed 数对即可），
  //    **不代表歌词语义正确**（没有声库去解释）。语义验证必须在 SV1/SV2 上做。
  if (HOST === 'ix') note('⚠️ IX 无歌词：本段只验 API 计数，不验语义');
  {
    const s1 = await callOk('set_selected_lyrics', { lyrics: '啊' });
    ok('set_selected_lyrics.changed = 6', s1.changed === 6, s1.changed);
    let after = await callOk('get_selected_notes', {});
    ok('全部歌词 = 啊', after.notes.every((n) => n.lyrics === '啊'), after.notes.map((n) => n.lyrics));

    const s2 = await callOk('apply_lyrics', { lyrics: '我爱你' });
    ok('apply_lyrics.count = 6', s2.count === 6, s2.count);
    ok('tokensTotal = 3（中文按字，不是 9 字节）', s2.tokensTotal === 3, s2.tokensTotal);
    ok('changed = 3', s2.changed === 3, s2.changed);
    after = await callOk('get_selected_notes', {});
    ok('前 3 音 = 我/爱/你', after.notes.slice(0, 3).map((n) => n.lyrics).join('') === '我爱你',
      after.notes.map((n) => n.lyrics));
    ok('余下 3 音 = -（占位）', after.notes.slice(3).every((n) => n.lyrics === '-'),
      after.notes.slice(3).map((n) => n.lyrics));
  }

  console.log('\n== 8. playback stop（无害）==');
  {
    const r = await callOk('playback', { action: 'stop' });
    ok('status 字段存在', typeof r.status === 'string', r);
    note(`stop 后 status=${JSON.stringify(r.status)}`);
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
  console.log(`说明：测试组「${GROUP}」留在工程里了（${wrote ? wrote.noteCount : '?'} 音符）；`);
  console.log('所有写操作都建了 undo 记录 ⇒ SV 里 Ctrl+Z 可逐步回退；不需要就直接删掉该组。');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('异常：' + (e && e.message));
  process.exit(2);
});
