#!/usr/bin/env node
/* 修复被"两个 host 同时写同一个会话"写坏的 DSH 会话日志（多帧 zstd jsonl）。
 *
 * 症状（实测）：`corrupt session log: seq gap in committed region at line N (expected X, got Y)`
 * 成因：两个客户端实例共用同一 DSH_HOME + 同一张段表 ⇒ 同一个会话；两个内嵌 host 各自从
 *   相同的 seq 基线往后追加 ⇒ 提交区出现**回退/重复**的 seq ⇒ DSH 读日志时报错、会话 resume 不了。
 *
 * 修法：保留 seq **严格递增**的那一支（第一个写入者），丢掉后写入者的重复段；
 *   不带 seq 的流式行（assistant/chunk 等）原样保留在它原来的位置。
 *   改前自动备份 `<file>.corrupt-<时间戳>.bak`；写完再读回来校验。
 *
 * 用法：
 *   node tools/repair-dsh-session-log.cjs akdagent-orb-temp-g1            # 只看（dry-run）
 *   node tools/repair-dsh-session-log.cjs akdagent-orb-temp-g1 --apply    # 真改（带备份）
 *   node tools/repair-dsh-session-log.cjs "<完整路径>" --apply --force   # 指定文件
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const force = args.includes('--force');
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('用法: node tools/repair-dsh-session-log.cjs <sessionId|路径> [--apply] [--force]');
  process.exit(2);
}

/** 找会话日志：给了路径就用路径，否则在几个 DSH_HOME 候选下按会话 id 找
 *  ⚠️ 环境变量 DSH_HOME 可能指着**主 harness**（~/.dsh），而客户端内嵌 host 用的是
 *  ~/.dsh-akdagent ⇒ 两个都搜。 */
function resolveLog(t) {
  if (fs.existsSync(t)) return t;
  const homes = [
    process.env.AKDAGENT_DSH_HOME,
    path.join(os.homedir(), '.dsh-akdagent'),
    process.env.DSH_HOME,
    path.join(os.homedir(), '.dsh'),
  ].filter(Boolean);
  const hits = [];
  for (const home of homes) {
    const root = path.join(home, 'sessions');
    if (!fs.existsSync(root)) continue;
    for (const proj of fs.readdirSync(root)) {
      const p = path.join(root, proj, t);
      if (!fs.existsSync(p)) continue;
      for (const f of fs.readdirSync(p)) {
        if (f === 'session.jsonl.zstd' || f === 'session.jsonl') hits.push(path.join(p, f));
      }
    }
    if (hits.length) break;
  }
  if (!hits.length) { console.error('没找到会话：' + t + '（搜过 ' + homes.join(' / ') + '）'); process.exit(2); }
  return hits[0];
}

/** 多帧 zstd：按魔数切帧逐个解（Node 的 zstdDecompressSync 一次只解一帧） */
function readLog(file) {
  const buf = fs.readFileSync(file);
  if (file.endsWith('.jsonl')) return buf.toString('utf8');
  const offs = [];
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) offs.push(i);
  }
  let text = '';
  let frames = 0;
  for (let k = 0; k < offs.length; k++) {
    const start = offs[k];
    let done = false;
    for (let j = k + 1; j <= offs.length && !done; j++) {
      const stop = j < offs.length ? offs[j] : buf.length;
      try { text += zlib.zstdDecompressSync(buf.subarray(start, stop)).toString('utf8'); frames++; done = true; k = j - 1; }
      catch { /* 不是完整帧，扩大范围再试 */ }
    }
  }
  return { text, frames, bytes: buf.length };
}

/** 单帧压缩（与 DSH 写入端一致：带校验和） */
function frame(str) {
  return zlib.zstdCompressSync(Buffer.from(str, 'utf8'), { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } });
}

const file = resolveLog(target);
console.log('日志文件：' + file);
const fileEnding = file.endsWith('.jsonl.zstd') ? 'zstd' : 'plain';

const before = fs.statSync(file);
const { text, frames, bytes } = fileEnding === 'zstd' ? readLog(file) : { text: readLog(file), frames: 1, bytes: before.size };
const lines = text.split('\n');
const hadTrailingNewline = text.endsWith('\n');
if (hadTrailingNewline) lines.pop();
console.log(`读取：${bytes} 字节 / ${frames} 帧 / ${lines.length} 行`);

/* 逐行解析 + 贪心保留 seq 严格递增的一支 */
const kept = [];
const dropped = [];
let lastSeq = -1;
let header = null;
for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  if (!raw.trim()) continue;
  let o = null;
  try { o = JSON.parse(raw); } catch { kept.push(raw); continue; }
  if (i === 0 || o.type === 'session') { header = raw; continue; }
  const seq = typeof o.seq === 'number' ? o.seq : null;
  if (seq === null) { kept.push(raw); continue; }          // 流式行（无 seq）：原样保留
  if (seq > lastSeq) { kept.push(raw); lastSeq = seq; }
  else dropped.push({ line: i + 1, seq, type: o.type || o.kind || '?' });
}
console.log(`保留 ${kept.length} 行（末尾 seq=${lastSeq}）；丢弃 ${dropped.length} 行（seq 回退/重复）`);
if (dropped.length) {
  const byRange = new Map();
  dropped.forEach((d) => { const k = Math.floor(d.seq / 50) * 50; byRange.set(k, (byRange.get(k) || 0) + 1); });
  console.log('  丢弃分布（seq 段 → 条数）：' + [...byRange.entries()].sort((a, b) => a[0] - b[0])
    .map(([k, n]) => `${k}~${k + 49}:${n}`).join('  '));
  console.log('  前几条：' + dropped.slice(0, 5).map((d) => `行${d.line}/seq${d.seq}/${d.type}`).join('  '));
}

if (!dropped.length) {
  console.log('\n✅ 这份日志的 seq 本来就是严格递增的 —— 没有需要修的地方。');
  process.exit(0);
}

/* ── 截断模式（**推荐**，2026-09-17 二次修正）──────────────────────────
 * 为什么不能只丢重复行：DSH 的判定是 `if (event.seq !== this.events.length)`
 *   —— 期望值 = **已收事件数**，即 seq 必须从 0 **连续**递增。丢掉重复行会留下空洞，
 *   于是它读到下一处又报 `expected X, got Y`（实测：修完从 1177 变成 1191）。
 * 截断模式：只保留**损坏起点之前**的行。这段前缀是 DSH 自己已经成功解析过的字节
 *   ⇒ 合法性由构造保证；代价是丢掉损坏点之后的对话记录（备份里有全量）。 */
const truncate = args.includes('--truncate');
if (truncate) {
  let maxSeq = -1;
  let onset = -1;
  for (let i = 0; i < lines.length; i++) {
    let o = null;
    try { o = JSON.parse(lines[i]); } catch { onset = i; break; }
    if (i === 0 || o.type === 'session') continue;
    const seq = typeof o.seq === 'number' ? o.seq : null;
    if (seq === null) continue;                              // 流式行（展开成多事件）不参与
    if (seq <= maxSeq) { onset = i; break; }                 // 第一次回退/重复 = 损坏起点
    maxSeq = seq;
  }
  if (onset < 0) { console.log('\n✅ 没有发现回退点，无需截断。'); process.exit(0); }
  const keepRows = lines.slice(0, onset);                     // header 在 keepRows[0]
  console.log(`\n损坏起点：第 ${onset + 1} 行（上一个 seq=${maxSeq}）`);
  console.log(`截断方案：保留前 ${keepRows.length} 行（含 header），丢弃之后 ${lines.length - keepRows.length} 行`);
  const tailTypes = [];
  for (let i = onset; i < Math.min(lines.length, onset + 6); i++) {
    let o = null; try { o = JSON.parse(lines[i]); } catch { /* 坏行 */ }
    tailTypes.push(((o && (o.type || o.kind)) || 'BAD') + (o && typeof o.seq === 'number' ? '/' + o.seq : ''));
  }
  console.log('  被丢的前几行：' + tailTypes.join('  '));
  if (!apply) { console.log('\n（dry-run）要真改请加 --apply（会先备份）'); process.exit(0); }

  const st = fs.statSync(file);
  if (!force && (st.size !== before.size || st.mtimeMs !== before.mtimeMs)) {
    console.error('\n⚠️ 文件在读取期间被改动（客户端可能在写）⇒ 中止。请先关客户端，或加 --force。');
    process.exit(3);
  }
  const stampT = new Date().toISOString().replace(/[:.]/g, '-');
  const backupT = `${file}.corrupt-${stampT}.bak`;
  fs.copyFileSync(file, backupT);
  console.log('\n已备份：' + path.basename(backupT));
  const headT = keepRows[0];
  const restT = keepRows.slice(1).join('\n') + '\n';
  if (fileEnding === 'zstd') fs.writeFileSync(file, Buffer.concat([frame(headT + '\n'), restT ? frame(restT) : Buffer.alloc(0)]));
  else fs.writeFileSync(file, headT + '\n' + restT, 'utf8');
  console.log('已写回：' + fs.statSync(file).size + ' 字节');
  const chk = fileEnding === 'zstd' ? readLog(file).text : readLog(file);
  const cl = chk.split('\n').filter((l) => l.trim());
  let p = -1, bad2 = 0, max2 = -1;
  cl.forEach((raw) => {
    let o = null; try { o = JSON.parse(raw); } catch { return; }
    if (typeof o.seq !== 'number') return;
    if (o.seq <= p) bad2++;
    p = o.seq; if (o.seq > max2) max2 = o.seq;
  });
  console.log(`校验：${cl.length} 行 / 末尾 seq=${max2} / 回退 ${bad2} 处`);
  console.log(bad2 ? '⚠️ 仍不正常，请用备份恢复' : '\n✅ 已截断到损坏起点之前，这段前缀 DSH 原本就读得通。');
  process.exit(bad2 ? 4 : 0);
}

if (!apply) {
  console.log('\n（dry-run）要真改请加 --apply（会先备份成 *.corrupt-<时间戳>.bak）');
  console.log('提示：丢重复行的修法会留下 seq 空洞 ⇒ DSH 仍会报 gap，建议改用 --truncate。');
  process.exit(0);
}

/* 改之前确认文件没被别人动过（客户端可能正在写） */
const mid = fs.statSync(file);
if (!force && (mid.size !== before.size || mid.mtimeMs !== before.mtimeMs)) {
  console.error('\n⚠️ 文件在读取期间被改动（可能客户端正在写）⇒ 中止。请先关掉客户端，或加 --force。');
  process.exit(3);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${file}.corrupt-${stamp}.bak`;
fs.copyFileSync(file, backup);
console.log('\n已备份：' + path.basename(backup));

const body = header !== null ? header + '\n' + kept.join('\n') + '\n' : kept.join('\n') + '\n';
if (fileEnding === 'zstd') {
  // 与 DSH 写入端一致：头部单独一帧，其余合一帧
  const out = header !== null ? Buffer.concat([frame(header + '\n'), frame(kept.join('\n') + '\n')]) : frame(body);
  fs.writeFileSync(file, out);
} else {
  fs.writeFileSync(file, body, 'utf8');
}
console.log('已写回：' + fs.statSync(file).size + ' 字节');

/* 读回来校验 */
const after = fileEnding === 'zstd' ? readLog(file) : { text: readLog(file) };
const al = after.text.split('\n').filter((l) => l.trim());
let prev = -1, bad = 0, maxSeq = -1;
al.forEach((raw, i) => {
  let o = null; try { o = JSON.parse(raw); } catch { return; }
  if (typeof o.seq !== 'number') return;
  if (o.seq <= prev) bad++;
  prev = o.seq; if (o.seq > maxSeq) maxSeq = o.seq;
});
console.log(`校验：${al.length} 行 / 末尾 seq=${maxSeq} / 回退或重复 ${bad} 处`);
if (bad) { console.error('⚠️ 校验没过 —— 请用备份恢复：' + backup); process.exit(4); }
console.log('\n✅ 修复完成，seq 已严格递增。回滚：把备份覆盖回去即可。');
