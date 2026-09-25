// ============================================================================
// 自动倚音检测与钉住（SV2 · 宿主内 JS 脚本 · ES5.1）
// ============================================================================
// 用途：用户在 SV2 里觉得"这里跑调 / 这个倚音不是我要的"时，用它把疑似被
//       **自动音高**加上去的倚音位置，用一个 PitchControlPoint 钉到音符本身的音高上。
//
// 原理（见 skills/sv-scripting/workflows/08-pit-drawing.md §8.10）：
//   1. 遍历音符：取 onset **稍微靠右、避开音头**的时刻 t = onset + δ；
//   2. 用 SV.getComputedPitchForGroup 取该处的**自动音高计算值** y；
//   3. |y − note.getPitch()| > 阈值 ⇒ 判定"那里被加了自动倚音（或自动音高跑调）"；
//   4. 在该处加一个 PitchControlPoint，pitch = note.getPitch()（组内局部音高）。
//
// 怎么用：
//   1. 把本文件放进 SV2 的脚本目录（如
//      %APPDATA%\Dreamtonics\Synthesizer V Studio 2\scripts\ 下的任意子目录）；
//   2. 在 SV 里「脚本」菜单里运行它（**这是宿主内脚本，不走桥、不依赖 DSH 在线**）；
//   3. 先在钢琴窗里**选中疑似跑调的音符**（只处理局部）；不选则脚本会问"要不要扫整组"。
//
// 官方依据：
//   · SV#getComputedPitchForGroup(groupRef, blickStart, blickInterval, numFrames)
//     —— 半音（MIDI 浮点）；**空隙为 null**；**未算完返回空数组**（非阻塞）；
//        **blickStart 必须是加上该组引用 getTimeOffset() 之后的绝对位置**。
//   · SV#create("PitchControlPoint") —— "A discrete anchor point for guiding the
//     pitch generation inside a NoteGroup" ⇒ 它**引导**音高生成，不需要关掉自动音高。
//   · PitchControlPoint.getPitch() —— **组内局部**音高（相对组的 pitchOffset）；
//     与 PitchControlCurve 的 "anchor + 点偏移" 语义**不同**，别写混。
//
// ⚠️ δ 与阈值是**未标定**的经验默认值，按听感收紧（先用默认跑一次，看报告再调）。
// ⚠️ 坐标系：computed 值可能**含**组级 pitchOffset / transpose；本脚本**写点时一律用
//    note.getPitch()**（与音符同坐标系），并对"整组近似相同的常数偏差"单独识别为
//    "疑似整体移调"，避免把整体移调误当成逐音符倚音。
// ============================================================================

// ---------------------------- 配置 ----------------------------
var DELTA_RATIO   = 0.12;      // δ = 音符时长的比例（避开音头）
var DELTA_MIN_MS  = 30;        // δ 下限（毫秒）
var DELTA_MAX_MS  = 80;        // δ 上限（毫秒）
var INTERVAL      = 7500000;   // 采样间隔（blick）≈10.6ms —— 与仓库 fixPitch 配方一致
var THRESHOLD     = 0.5;       // 判定阈值（半音）
var FLAT_TOL      = 0.1;       // "整组常数偏差"判定的容差（半音）
var FLAT_RATIO    = 0.6;       // 超过该比例的音符偏差近似相同 ⇒ 判为整体移调
var MAX_LIST      = 12;        // 报告里最多列几条

var TITLE = '自动倚音';

function beats(b) { return Math.round(b / 705600000 * 1000) / 1000; }

function main() {
  var editor   = SV.getMainEditor();
  var groupRef = editor.getCurrentGroup();
  if (groupRef === null || groupRef === undefined) {
    SV.showMessageBox(TITLE, '请先在钢琴窗里点进一个音符组，再运行本脚本。');
    SV.finish();
    return;
  }
  var group    = groupRef.getTarget();
  var timeAxis = SV.getProject().getTimeAxis();
  var offset   = groupRef.getTimeOffset();

  // ---------------- 选范围：局部 / 全组（规定动作：先问一句）----------------
  var selected = editor.getSelection().getSelectedNotes();
  var all = [];
  var i;
  for (i = 0; i < group.getNumNotes(); i++) { all.push(group.getNote(i)); }
  if (all.length === 0) {
    SV.showMessageBox(TITLE, '当前组里没有音符。');
    SV.finish();
    return;
  }

  var scope, scopeName;
  if (selected.length > 0) {
    var ans = SV.showYesNoCancelBox(TITLE,
      '选中了 ' + selected.length + ' 个音符（组内共 ' + all.length + ' 个）。\n\n' +
      '【是】只处理选中的 ' + selected.length + ' 个（局部）\n' +
      '【否】扫描整组 ' + all.length + ' 个\n' +
      '【取消】放弃');
    if (ans === 'yes')       { scope = selected; scopeName = '选中 ' + selected.length + ' 个'; }
    else if (ans === 'no')   { scope = all;      scopeName = '整组 ' + all.length + ' 个'; }
    else { SV.finish(); return; }
  } else {
    var ok = SV.showOkCancelBox(TITLE,
      '没有选中音符 ⇒ 将扫描整组 ' + all.length + ' 个。\n继续？');
    if (!ok) { SV.finish(); return; }
    scope = all; scopeName = '整组 ' + all.length + ' 个';
  }

  // ---------------- 一次采完整段 computed 音高 ----------------
  // ‼️ 实测陷阱（2026-09-13）：`blickStart` **必须用组开头的绝对位置（= timeOffset）**。
  //    用 `blickStart = 0` 会返回**空数组**（很容易误判成"宿主还没算完"）；改用 timeOffset 即正常返回。
  //    采样起点 = offset ⇒ 第 i 帧对应组内局部位置 i × INTERVAL。
  var frames  = Math.floor(groupRef.getDuration() / INTERVAL) + 2;
  var pitchs  = SV.getComputedPitchForGroup(groupRef, offset, INTERVAL, frames);
  if (pitchs === null || pitchs === undefined || pitchs.length === 0) {
    SV.showMessageBox(TITLE,
      '取不到 computed 音高（返回空数组）。\n\n' +
      '先确认两点：\n' +
      '1) 组开头是否在时间轴更右侧（本脚本已按 timeOffset 采样）；\n' +
      '2) 宿主是否还没算完 —— 等一两秒后再运行一次。');
    SV.finish();
    return;
  }

  // ---------------- 逐音符比较 ----------------
  var minB = Math.round(timeAxis.getBlickFromSeconds(DELTA_MIN_MS / 1000));
  var maxB = Math.round(timeAxis.getBlickFromSeconds(DELTA_MAX_MS / 1000));
  var hits = [], devs = [], nulls = 0, idx;

  for (i = 0; i < scope.length; i++) {
    var note  = scope[i];
    var p     = note.getPitch();
    var onset = note.getOnset();
    var dur   = note.getDuration();
    var delta = Math.round(dur * DELTA_RATIO);
    if (delta < minB) { delta = minB; }
    if (delta > maxB) { delta = maxB; }
    if (delta > dur * 0.5) { delta = Math.round(dur * 0.5); }   // 极短音符兜底
    var tLocal = onset + delta;

    idx = Math.round(tLocal / INTERVAL);      // 采样起点=offset ⇒ 索引用**组内局部**位置
    var y = (idx >= 0 && idx < pitchs.length) ? pitchs[idx] : null;
    if (y === null || y === undefined) { nulls++; continue; }

    var dev = y - p;
    if (Math.abs(dev) > THRESHOLD) {
      hits.push({ note: note, tLocal: tLocal, pitch: p, dev: dev, auto: note.getPitchAutoMode() });
    }
    devs.push(dev);
  }

  if (devs.length === 0) {
    SV.showMessageBox(TITLE, '范围内 ' + scope.length + ' 个音符，全部取不到 computed 音高（空隙/未算完）。\n换个位置或稍后再试。');
    SV.finish();
    return;
  }

  // ---------------- 识别"整组近似常数偏差"= 疑似整体移调，而不是逐音符倚音 ----------------
  var sorted = devs.slice().sort(function (a, b) { return a - b; });
  var median = sorted[Math.floor(sorted.length / 2)];
  var flats = 0;
  for (i = 0; i < devs.length; i++) { if (Math.abs(devs[i] - median) <= FLAT_TOL) { flats++; } }
  var flatLike = (flats / devs.length >= FLAT_RATIO) && (Math.abs(median) > THRESHOLD);

  // ---------------- 报告 ----------------
  var lines = [];
  lines.push('范围：' + scopeName);
  lines.push('可采样音符：' + devs.length + ' 个（取不到 = ' + nulls + ' 个）');
  lines.push('阈值：' + THRESHOLD + ' 半音 · 判定可疑：' + hits.length + ' 个');
  if (hits.length > 0) {
    lines.push('');
    lines.push('可疑位置（偏差 = computed − 音符音高）：');
    for (i = 0; i < hits.length && i < MAX_LIST; i++) {
      lines.push('  · 第 ' + Math.round(beats(hits[i].tLocal) * 1000) / 1000 + ' 拍处  pitch=' + hits[i].pitch +
                 '  偏差=' + Math.round(hits[i].dev * 1000) / 1000 + ' 半音' +
                 (hits[i].auto ? '（音高自动）' : '（音高手动）'));
    }
    if (hits.length > MAX_LIST) { lines.push('  … 共 ' + hits.length + ' 个'); }
  }
  if (flatLike) {
    lines.push('');
    lines.push('⚠️ 注意：' + Math.round(flats / devs.length * 100) + '% 的音符偏差都接近 ' +
               Math.round(median * 1000) / 1000 + ' 半音 —— 这更像**整体移调**' +
               '（组级 transpose / pitchOffset），而不是逐音符自动倚音。');
    lines.push('   建议先查组级移调与 voice.improviseAttackRelease，再决定是否钉点。');
  }

  // ---------------- 确认后写入 ----------------
  var doWrite;
  if (hits.length === 0) {
    lines.push('');
    lines.push('结论：没有超过阈值的可疑位置，无需钉点。');
    SV.showMessageBox(TITLE, lines.join('\n'));
    SV.finish();
    return;
  }
  if (flatLike) {
    doWrite = SV.showOkCancelBox(TITLE, lines.join('\n') + '\n\n仍要按逐音符钉点处理吗？');
  } else {
    doWrite = SV.showOkCancelBox(TITLE, lines.join('\n') + '\n\n在以上 ' + hits.length + ' 处加 PitchControlPoint 钉到该音符音高？');
  }
  if (!doWrite) { SV.finish(); return; }

  var proj = SV.getProject();
  proj.newUndoRecord();                       // 一次 undo 记录覆盖这一批写入
  var added = 0, failed = 0;
  for (i = 0; i < hits.length; i++) {
    var okAdd = true;
    try {
      var pc = SV.create('PitchControlPoint');
      pc.setPosition(hits[i].tLocal);         // 组内局部 blick
      pc.setPitch(hits[i].pitch);             // 组内局部音高（点型 pitch 就是实际音高）
      group.addPitchControl(pc);              // 按 anchor 位置自动排序
      added++;
    } catch (e) {
      okAdd = false; failed++;
    }
    if (!okAdd) { /* 单个失败不打断整批 */ }
  }

  SV.showMessageBox(TITLE,
    '已加 ' + added + ' 个音高控制点（失败 ' + failed + ' 个）。\n\n' +
    '下一步：听一遍确认（**验收以你的听感为准**）；不满意就 Ctrl+Z 撤销。\n' +
    '若仍怀疑跑调，可再运行一次本脚本复核。');
  SV.finish();
}

main();
