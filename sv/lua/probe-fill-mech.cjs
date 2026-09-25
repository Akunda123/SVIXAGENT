#!/usr/bin/env node
/**
 * 诊断：`fill_track_lyrics` 少写音符的**机制**（在真实组上逐下标试写）
 *
 * 回答四个问题：
 *   ① `getNote(i)` 在 i=1..n 上是否都返回对象（还是某个下标给 nil）；
 *   ② `getNote(i)` 的**顺序是否稳定**（连读两次对比）；
 *   ③ 逐下标 `setLyrics` 是否**被宿主拒绝**（pcall + 立即读回）；
 *   ④ 写 `-` 与写真实音节在宿主侧表现是否一致。
 *
 * 用法：node sv/lua/probe-fill-mech.cjs [host]   （在**当前组**上做，建议先造一个 6 音和弦组）
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const HOST = (() => {
  const flag = process.argv.find((a) => a.startsWith('--host='));
  if (flag) return flag.slice('--host='.length);
  return process.argv.slice(2).find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const call = (op, args, opts) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 25000, ...(opts || {}) });

const CODE = `
local proj = SV:getProject()
proj:newUndoRecord()
local g = SV:getMainEditor():getCurrentGroup():getTarget()
local n = g:getNumNotes()

-- ① 顺序稳定性：连读两次
local function order()
  local t = {}
  for i = 1, n do
    local nt = g:getNote(i)
    t[#t + 1] = (nt == nil) and "nil" or (tostring(nt:getPitch()) .. "@" .. tostring(nt:getOnset()))
  end
  return table.concat(t, " ")
end
local o1, o2 = order(), order()

-- ② 逐下标：读 + 试写（pcall） + 立即读回
local rows = {}
for i = 1, n do
  local okGet, nt = pcall(function() return g:getNote(i) end)
  local rec = { i = i, getOk = okGet, isNil = (nt == nil) }
  if okGet and nt ~= nil then
    local okP, p = pcall(function() return nt:getPitch() end); rec.pitch = okP and p or ("ERR:" .. tostring(p))
    local okL, l = pcall(function() return nt:getLyrics() end); rec.lyrBefore = okL and l or ("ERR:" .. tostring(l))
    local tag = "Y" .. tostring(i)
    local okS, e = pcall(function() nt:setLyrics(tag) end)
    rec.setOk = okS
    rec.setErr = (not okS) and tostring(e) or nil
    local okL2, l2 = pcall(function() return nt:getLyrics() end)
    rec.lyrAfter = okL2 and l2 or ("ERR:" .. tostring(l2))
    rec.applied = (rec.lyrAfter == tag)
  end
  rows[#rows + 1] = rec
end

-- ③ 全部写完后再读一次顺序与歌词
local o3, final = order(), {}
for i = 1, n do
  local nt = g:getNote(i)
  final[#final + 1] = (nt == nil) and "nil" or tostring(nt:getLyrics())
end
return { n = n, order1 = o1, order2 = o2, stable = (o1 == o2), rows = rows,
         order3 = o3, final = table.concat(final, "|") }
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log(`宿主：${hb && hb.hostName} ${hb && hb.version} · bridge ${hb && hb.bridge}\n`);
  const r = await call('run_script', { code: CODE });
  if (!r.ok) { console.log('❌ run_script 失败：' + r.error); process.exit(1); }
  const x = r.result.result;
  console.log(`音符数 n = ${x.n}`);
  console.log(`顺序① : ${x.order1}`);
  console.log(`顺序② : ${x.order2}   ⇒ ${x.stable ? '稳定 ✅' : '⚠️ 不稳定（同一次运行内就变）'}`);
  console.log('\n逐下标试写：');
  for (const row of x.rows) {
    if (row.isNil) { console.log(`  #${row.i}  ⚠️ getNote 返回 nil（getOk=${row.getOk}）`); continue; }
    console.log(`  #${row.i}  pitch=${row.pitch}  词前=${JSON.stringify(row.lyrBefore)}  ` +
      `setLyrics → ${row.setOk ? 'ok' : 'ERR ' + row.setErr}  词后=${JSON.stringify(row.lyrAfter)}  ` +
      `${row.applied ? '' : '❌ 未生效'}`);
  }
  console.log(`\n顺序③ : ${x.order3}`);
  console.log(`最终词 : ${x.final}`);
  const applied = x.rows.filter((r2) => r2.applied).length;
  console.log(`\n⇒ 实际写入生效 ${applied}/${x.rows.length}`);
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
