#!/usr/bin/env node
/**
 * 真机验收：对**已移植到 Lua 桥**的只读 op 逐个打一发，断言字段名与单位与 JS 桥一致。
 *
 * 只发**只读** op（外加一个无害的 playback stop），不改任何工程数据。
 * 用法：node sv/lua/verify-readops.cjs [--timeout 5000]
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

const argv = process.argv.slice(2);
const ti = argv.indexOf('--timeout');
const TIMEOUT = ti >= 0 ? Number(argv[ti + 1]) : 5000;

let pass = 0, fail = 0, warn = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 160) : ''}`); }
};
const note = (m) => console.log(`  [--]   ${m}`);
const soft = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  [ok]   ${name}`); }
  else { warn++; console.log(`  [warn] ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 160) : ''}`); }
};

async function call(op, args) {
  const r = await ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: TIMEOUT });
  return r;
}

(async () => {
  console.log(`IPC 目录 = ${ipc.resolveIpcDir()}`);
  const hb = ipc.readHeartbeat(HOST);
  const age = ipc.heartbeatAgeSec(HOST);
  console.log(`心跳：${age}s 前 · 宿主=${hb && hb.hostName} ${hb && hb.version} isSV2=${hb && hb.isSV2} lua=${hb && hb.lua}`);
  console.log(`桥声明的 op（${(hb && hb.ops || []).length}）：${(hb && hb.ops || []).join(', ')}\n`);

  console.log('== 1. ping ==');
  {
    const r = await call('ping', {});
    ok('ping 成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      ok('有 lua 字段（证明来自 Lua 桥）', r.result.lua === 'Lua 5.4' || String(r.result.lua || '').includes('Lua'), r.result.lua);
      ok('indexBase = 1', r.result.indexBase === 1, r.result.indexBase);
      const ops = r.result.ops || [];
      note(`往返 ${r.elapsedMs}ms · 声明 ${ops.length} 个 op`);
      for (const need of ['ping', 'get_project_info', 'get_current_group', 'get_selected_notes',
        'get_measure_info', 'get_note_time', 'get_melody_notes', 'transpose_selected_notes',
        'set_selected_lyrics', 'apply_lyrics', 'playback', 'write_chords', 'create_harmony_group',
        'fill_track_lyrics', 'align_audio', 'apply_tempo']) {
        ok(`声明含 ${need}`, ops.includes(need));
      }
    }
  }

  console.log('\n== 2. get_project_info（字段名对齐 JS：fileName/durationBlicks/numGroupsInLibrary）==');
  let projectInfo = null;
  {
    const r = await call('get_project_info', {});
    ok('成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      projectInfo = r.result;
      ok('fileName 字段存在（JS 同名）', 'fileName' in r.result, Object.keys(r.result));
      ok('durationBlicks 字段存在', 'durationBlicks' in r.result, r.result.durationBlicks);
      ok('numTracks 是数字', typeof r.result.numTracks === 'number', r.result.numTracks);
      ok('numGroupsInLibrary 字段存在', 'numGroupsInLibrary' in r.result, r.result.numGroupsInLibrary);
      const t0 = (r.result.tracks || [])[0];
      ok('tracks[0].name 存在', t0 && 'name' in t0, t0);
      ok('tracks[0].numGroups 存在', t0 && 'numGroups' in t0, t0 && t0.numGroups);
      note(`工程=${r.result.fileName} 轨数=${r.result.numTracks} 库内组数=${r.result.numGroupsInLibrary}`);
      for (const t of (r.result.tracks || []).slice(0, 8)) {
        note(`  轨 ${t.index}「${t.name}」numGroups=${t.numGroups} 组=[${(t.groups || []).map(g => `${g.index}:${g.name}(${g.numNotes})`).join(' ')}]`);
      }
    }
  }

  console.log('\n== 3. get_current_group ==');
  {
    const r = await call('get_current_group', {});
    ok('成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      ok('current 是布尔', typeof r.result.current === 'boolean', r.result.current);
      if (r.result.current) {
        ok('name 字段', 'name' in r.result, r.result.name);
        ok('uuid 字段（Lua 侧 getUUID 是否存在）', 'uuid' in r.result, r.result.uuid);
        ok('noteCount 是数字', typeof r.result.noteCount === 'number', r.result.noteCount);
        ok('timeOffsetBlicks 字段（JS 同名）', 'timeOffsetBlicks' in r.result, r.result.timeOffsetBlicks);
        ok('pitchOffset 字段（JS 同名）', 'pitchOffset' in r.result, r.result.pitchOffset);
        note(`当前组「${r.result.name}」音符=${r.result.noteCount} timeOffset=${r.result.timeOffsetBlicks} pitchOffset=${r.result.pitchOffset}`);
      } else {
        note('当前没有选中的音符组（SV 里点一个组再跑更完整）');
      }
    }
  }

  console.log('\n== 4. get_selected_notes ==');
  {
    const r = await call('get_selected_notes', {});
    ok('成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      ok('count 是数字', typeof r.result.count === 'number', r.result.count);
      note(`选中 ${r.result.count} 个音符`);
      const n0 = (r.result.notes || [])[0];
      if (n0) {
        ok('onsetQuarter（四分音符单位）', typeof n0.onsetQuarter === 'number', n0.onsetQuarter);
        ok('durationQuarter', typeof n0.durationQuarter === 'number', n0.durationQuarter);
        ok('endQuarter', typeof n0.endQuarter === 'number', n0.endQuarter);
        ok('index 是 0 起', n0.index === 0, n0.index);
        ok('lyrics 字段', 'lyrics' in n0, n0.lyrics);
        note(`第 1 个：pitch=${n0.pitch} onsetQ=${n0.onsetQuarter} durQ=${n0.durationQuarter} lyrics=${JSON.stringify(n0.lyrics)}`);
      }
    }
  }

  console.log('\n== 5. get_measure_info（验 prop() 属性/方法双兼容）==');
  {
    const r = await call('get_measure_info', { measure: 1 });
    ok('成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      ok('found = true', r.result.found === true, r.result);
      ok('positionBlick 是数字（prop 垫片在本宿主取到了）', typeof r.result.positionBlick === 'number', r.result.positionBlick);
      ok('numerator 是数字', typeof r.result.numerator === 'number', r.result.numerator);
      ok('denominator 是数字', typeof r.result.denominator === 'number', r.result.denominator);
      ok('positionSeconds 是数字', typeof r.result.positionSeconds === 'number', r.result.positionSeconds);
      note(`第 1 小节：positionBlick=${r.result.positionBlick} 拍号=${r.result.numerator}/${r.result.denominator} 秒=${r.result.positionSeconds}`);
    }
    // 越界小节：真实宿主是报错还是返回延伸位置？（假宿主按有界工程报错，这里实测）
    const r2 = await call('get_measure_info', { measure: 9999 });
    if (r2.ok) note(`越界小节 9999：ok=true found=${r2.result.found} positionBlick=${r2.result.positionBlick}（⇒ 真实宿主不报错）`);
    else note(`越界小节 9999：ok=false err=${String(r2.error).slice(0, 80)}（⇒ 真实宿主会报错）`);
  }

  console.log('\n== 6. get_melody_notes ==');
  let melody = null;
  {
    const r = await call('get_melody_notes', {});
    ok('成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      melody = r.result;
      ok('current 是布尔', typeof r.result.current === 'boolean', r.result.current);
      if (r.result.current) {
        ok('groupName 字段', 'groupName' in r.result, r.result.groupName);
        ok('noteCount 是数字', typeof r.result.noteCount === 'number', r.result.noteCount);
        ok('timeOffsetBlicks 字段', 'timeOffsetBlicks' in r.result, r.result.timeOffsetBlicks);
        const n0 = (r.result.notes || [])[0];
        if (n0) {
          ok('notes[0].onsetBlicks（JS 同名）', typeof n0.onsetBlicks === 'number', n0.onsetBlicks);
          ok('notes[0].durationBlicks', typeof n0.durationBlicks === 'number', n0.durationBlicks);
          ok('notes[0].endBlicks', typeof n0.endBlicks === 'number', n0.endBlicks);
          ok('notes[0].onsetQuarter', typeof n0.onsetQuarter === 'number', n0.onsetQuarter);
          ok('notes[0].onsetSeconds', typeof n0.onsetSeconds === 'number', n0.onsetSeconds);
          ok('notes[0].index 0 起', n0.index === 0, n0.index);
          note(`旋律「${r.result.groupName}」${r.result.noteCount} 音：` +
            (r.result.notes || []).slice(0, 8).map(n => `${n.pitch}@${n.onsetQuarter}q`).join(' '));
        }
      } else {
        note('当前没有音符组');
      }
    }
  }

  console.log('\n== 7. get_note_time（小节内第 0 个音符）==');
  {
    const r = await call('get_note_time', { measure: 1, noteIndex: 0 });
    ok('成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      ok('found 是布尔', typeof r.result.found === 'boolean', r.result.found);
      if (r.result.found) {
        ok('onsetBlick 是数字', typeof r.result.onsetBlick === 'number', r.result.onsetBlick);
        ok('onsetQuarter 是数字', typeof r.result.onsetQuarter === 'number', r.result.onsetQuarter);
        ok('onsetSeconds 是数字（getSecondsFromBlick 可用）', typeof r.result.onsetSeconds === 'number', r.result.onsetSeconds);
        ok('durationQuarter 是数字', typeof r.result.durationQuarter === 'number', r.result.durationQuarter);
        ok('pitch/lyrics 带出', 'pitch' in r.result && 'lyrics' in r.result, r.result);
        note(`第 1 小节第 0 音：onsetBlick=${r.result.onsetBlick} (${r.result.onsetQuarter}q / ${r.result.onsetSeconds}s) pitch=${r.result.pitch}`);
      } else {
        note('第 1 小节内没有音符（found=false）');
      }
    }
  }

  console.log('\n== 8. playback（只发 stop，无害）==');
  {
    const r = await call('playback', { action: 'stop' });
    ok('成功', r.ok === true, r.ok ? null : r.error);
    if (r.ok) {
      soft('status 字段存在（getStatus 可用）', typeof r.result.status === 'string', r.result);
      note(`stop 后 status=${JSON.stringify(r.result.status)}`);
    }
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 / ${warn} 警告（警告多为可选字段）=====`);
  console.log('说明：本脚本只发只读 op（playback 只发 stop），不改动工程数据。');
  process.exit(fail ? 1 : 0);
})();
