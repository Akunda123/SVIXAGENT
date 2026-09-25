#!/usr/bin/env node
/**
 * IX「隐藏参数有没有影响」对照实验 —— **扫描版**（写操作；可重复运行、自带清理与自检）
 *
 * 用户实测（2026-09-14，逐音符平台版）：pitchDelta / voicing / toneShift **有效**；gender 疑似弱效；mouthOpening 没听出来。
 * 本轮换更敏感的判据：**在同一个音符内把参数从极端小线性拉到极端大**（连续扫），
 * 弱效参数会表现为"音色/音高在音符内滑动"，比两句之间对比容易听出来。
 *
 * 三句（同一条轨 ⇒ 乐器/混音完全一致，唯一变量就是参数曲线）：
 *   句1「TEST-对照」    0 拍起 ：5 个音符，**不写任何 automation**（基准）
 *   句2「TEST-逐个扫」 24 拍起 ：5 个音符，**第 k 个音符只扫第 k 条参数**（min→max），音符外保持默认
 *   句3「TEST-全扫」   48 拍起 ：1 个长音符，**5 条参数同时扫**（听整体色彩变化）
 *
 * 扫描区间（标 ✱ 的是范围未在官方定义里确认、按同类参数推测的）：
 *   pitchDelta  −1200 → +1200 cent · voicing 0 → 1 · gender −1 → +1 · toneShift −800 → +800（用户确认 ±800）
 *   mouthOpening −1 → +1 ✱
 * 默认值**向宿主读取**（`Automation.get(b)` 无点即返回默认值，安全读法），不写死。
 *
 * ⛔ 不调用 `getPoints/getAllPoints/getLinear/getDefinition`（实测会让宿主闪退）。
 * ⛔ 不 `SV:create("Track")`：需要新轨时用 `Track:clone()`；本脚本不开新轨。
 * ⛔ 生成的 Lua 里不能出现 `[ {…} ]`：**Lua 没有 JSON 那种数组字面量**（第一版就这么写坏过）。
 *
 * 用法：
 *   node sv/lua/test-ix-hidden-params.cjs ix                 # 建三句并自检
 *   node sv/lua/test-ix-hidden-params.cjs ix --beats=2       # 音符短一点（默认 4 拍）
 *   node sv/lua/test-ix-hidden-params.cjs ix --clean         # 只清理本脚本建的组
 *   node sv/lua/test-ix-hidden-params.cjs ix --dump          # 只打印生成的 Lua（排查用）
 * 跑完请在宿主里 **Ctrl+S** 保存。
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));

const HOST = process.argv[2] === 'sv' ? 'sv' : 'ix';
const CLEAN_ONLY = process.argv.includes('--clean');
const beatsArg = process.argv.find((a) => a.startsWith('--beats='));
const NOTE_BEATS = beatsArg ? Math.max(1, Number(beatsArg.slice(8)) || 4) : 4;
/** 音符之间的**空隙**（拍）：用户 2026-09-14 要求"音符分隔开，避免互相干扰" ——
 *  相邻音符贴在一起时，上一个音符结尾的突变会滑进下一个音符（legato 也会糊在一起），
 *  归因就不干净了。默认留 1 拍空隙，空隙内参数必须是默认值（自检会盯着）。 */
const gapArg = process.argv.find((a) => a.startsWith('--gap='));
const GAP_BEATS = gapArg ? Math.max(0, Number(gapArg.slice(6)) || 0) : 1;
const STRIDE_BEATS = NOTE_BEATS + GAP_BEATS;
const Q = 705600000;

/** 本轮**只测 tension**（用户 2026-09-14 指定）。
 *  范围来自官方 `Automation#getDefinition` 表：tension −1 ~ +1（默认 0）。
 *  装置可信度：同一套装置上一轮已由 pitchDelta / toneShift **明显听出**（阳性对照成立），
 *  且本轮仍保留"无参数对照句" ⇒ 若 tension 也没变化，可以判"对渲染无效"，而不是"装置坏了"。*/
const PARAMS = [
  { type: 'tension', min: -1, max: 1 },
];
const PITCHES = [60, 64, 67];   // C4 E4 G4 —— 3 个音符，每个都在中点突变一次，便于听三次确认
const PREFIXES = ['TEST-'];
/** 同一音符内**中间突变**：前半段 = min，中点瞬间跳到 = max（比线性扫更容易听出来） */

const CODE = `
local function has(o, m)
  if o == nil then return false end
  local ok, f = pcall(function() return o[m] end)
  if not ok or f == nil then return false end
  local t = type(f)
  return t == "function" or t == "userdata" or t == "table"
end
local function call(o, m, ...)
  if not has(o, m) then return nil end
  local f = o[m]
  local ok, v = pcall(f, o, ...)
  if ok then return v end
  return nil
end
local Q = 705600000
local function bl(b) return math.floor(b * Q + 0.5) end
local function nameMatches(nm)
  for _, pre in ipairs(__PREFIXES__) do
    if string.sub(nm, 1, #pre) == pre then return true end
  end
  return false
end
local function luaStr(s) return tostring(s) end

local PARAMS = __PARAMS__
local PITCHES = __PITCHES__
local NB = __NOTE_BEATS__
local STRIDE = __STRIDE_BEATS__      -- 音符时长 + 空隙（音符之间留白，避免互相干扰）
local CLEAN_ONLY = __CLEAN_ONLY__

local p = SV:getProject()
local out = { steps = {}, defaults = {}, sweep = {}, allSweep = {}, verify = {}, tracks = {}, ok = true }
local function step(s) out.steps[#out.steps + 1] = tostring(s) end

local t = call(p, "getTrack", 1)
if t == nil then return { ok = false, error = "getTrack(1) 返回 nil" } end
-- 乐器名：database 是 userdata，name 是**属性**（不是方法）⇒ 直接索引，读不到就算了
local mainRef = call(t, "getMainReference")
local db = mainRef and call(mainRef, "getDatabase") or nil
local dbName = "(读不到)"
if db ~= nil then
  local okN, nm = pcall(function() return db.name end)
  if okN and nm ~= nil then dbName = tostring(nm) end
end
out.instrument = { track = tostring(call(t, "getName")), database = dbName }

p:newUndoRecord()

-- 清理本脚本建的组（前缀匹配；先删各轨引用，再按**库索引**删组）
local removedRef, removedGroup = 0, 0
for ti = 1, (call(p, "getNumTracks") or 0) do
  local tr = call(p, "getTrack", ti)
  for i = (call(tr, "getNumGroups") or 0), 1, -1 do
    local r = call(tr, "getGroupReference", i)
    local tg = call(r, "getTarget")
    local nm = tg ~= nil and tostring(call(tg, "getName")) or ""
    if nameMatches(nm) then
      call(tr, "removeGroupReference", i)
      removedRef = removedRef + 1
    end
  end
end
for i = (call(p, "getNumNoteGroupsInLibrary") or 0), 1, -1 do
  local g = call(p, "getNoteGroup", i)
  local nm = g ~= nil and tostring(call(g, "getName")) or ""
  if nameMatches(nm) then
    call(p, "removeNoteGroup", i)
    removedGroup = removedGroup + 1
  end
end
step("清理旧实验组：引用 " .. removedRef .. " · 库组 " .. removedGroup)

if CLEAN_ONLY then
  for ti = 1, (call(p, "getNumTracks") or 0) do
    local tr = call(p, "getTrack", ti)
    local ns = {}
    for i = 1, (call(tr, "getNumGroups") or 0) do
      local r = call(tr, "getGroupReference", i)
      ns[#ns + 1] = tostring(call(call(r, "getTarget"), "getName"))
    end
    out.tracks[#out.tracks + 1] = tostring(ti) .. ":" .. tostring(call(tr, "getName")) .. " [" .. table.concat(ns, ", ") .. "]"
  end
  return out
end

-- 建句：name / 起始拍 / 音符 pitch 表（**音符之间按 STRIDE 留空隙**）
local function makePhrase(name, startBeat, pitches)
  local g = SV:create("NoteGroup")
  call(g, "setName", name)
  for i = 1, #pitches do
    local nt = SV:create("Note")
    call(nt, "setPitch", pitches[i])
    call(nt, "setTimeRange", bl((i - 1) * STRIDE), bl(NB))
    call(g, "addNote", nt)
  end
  call(p, "addNoteGroup", g)
  local ref = SV:create("NoteGroupReference")
  call(ref, "setTarget", g)
  call(ref, "setTimeOffset", bl(startBeat))
  call(t, "addGroupReference", ref)
  return g
end

local gCtrl = makePhrase("TEST-对照", 0, PITCHES)
step("句1「TEST-对照」0 拍起 · " .. #PITCHES .. " 音符 × " .. NB .. " 拍（间隔 " .. (STRIDE - NB) .. " 拍，无参数）")

for _, e in ipairs(PARAMS) do
  local a = call(gCtrl, "getParameter", e.type)
  out.defaults[#out.defaults + 1] = { type = e.type, exists = (a ~= nil), def = a and call(a, "get", 0) or nil }
end

-- 各句起始拍自动排布：句长 = (n-1)*STRIDE + NB，句间再留 4 拍，避免两句贴在一起互相干扰
local CTRL_START = 0
local SWEEP_START = CTRL_START + (#PITCHES - 1) * STRIDE + NB + 4
local ALL_START = SWEEP_START + (#PARAMS - 1) * STRIDE + NB + 4

-- 句2：第 k 个音符只跳第 k 条参数（min→max）；音符外（含空隙）保持默认
local gSweep = makePhrase("TEST-逐个跳", SWEEP_START, PITCHES)
step("句2「TEST-逐个跳」" .. SWEEP_START .. " 拍起 · 每音符跳一条参数（音符间留 " .. (STRIDE - NB) .. " 拍空隙）")
for k, e in ipairs(PARAMS) do
  local a = call(gSweep, "getParameter", e.type)
  if a == nil then
    out.sweep[#out.sweep + 1] = { type = e.type, error = "getParameter 返回 nil" }
  else
    local def = 0
    for _, d in ipairs(out.defaults) do
      if d.type == e.type and d.def ~= nil then def = d.def end
    end
    local s0, s1 = bl((k - 1) * STRIDE), bl((k - 1) * STRIDE + NB)
    local mid = bl((k - 1) * STRIDE + NB / 2)      -- 音符中点 = 突变点
    -- 首点之前的区段会按首点值外推 ⇒ 先在自己的音符前把值钉回默认，避免倒着污染前面音符
    if s0 > 0 then
      call(a, "add", 0, def)
      call(a, "add", s0 - 1, def)
    end
    -- **中间突变**：前半段 = min，中点瞬间跳到 = max，音符结束后回默认（空隙里必须是默认）
    call(a, "add", s0, e.min)
    call(a, "add", mid - 1, e.min)
    call(a, "add", mid, e.max)
    call(a, "add", s1 - 1, e.max)
    call(a, "add", s1, def)
    out.sweep[#out.sweep + 1] = {
      type = e.type, note = k, beats = ((k - 1) * STRIDE) .. "~" .. ((k - 1) * STRIDE + NB),
      midBeats = (k - 1) * STRIDE + NB / 2, from = e.min, to = e.max, def = def,
    }
  end
end

-- 句3：一个长音符（= NB*2 拍），所有参数**同时在中点突变**。
-- 只在测 ≥3 条参数时才建：单参数时它和句2 信息重复，且排布上容易压到别的句子（实测踩过）。
local ALL_START = SWEEP_START + (#PARAMS - 1) * STRIDE + NB + 4
if #PARAMS >= 3 then
  local gAll = makePhrase("TEST-全跳", ALL_START, { 60 })
  local allMid = bl(NB)                       -- 该长音符的中点
  for k, e in ipairs(PARAMS) do
    local a2 = call(gAll, "getParameter", e.type)
    if a2 ~= nil then
      local def = 0
      for _, d in ipairs(out.defaults) do
        if d.type == e.type and d.def ~= nil then def = d.def end
      end
      call(a2, "add", 0, e.min)
      call(a2, "add", allMid - 1, e.min)
      call(a2, "add", allMid, e.max)
      call(a2, "add", bl(NB * 2) - 1, e.max)
      call(a2, "add", bl(NB * 2), def)
      out.allSweep[#out.allSweep + 1] = { type = e.type, from = e.min, to = e.max, def = def }
    end
  end
  step("句3「TEST-全跳」" .. ALL_START .. " 拍起 · 1 个 " .. (NB * 2) .. " 拍长音符，参数同时在中点突变")
end
out.starts = { ctrl = CTRL_START, sweep = SWEEP_START, all = ALL_START, noteBeats = NB, stride = STRIDE }

-- 自检：句2 每条参数 —— 句首/空隙/下一音符 = 默认；本音符前半段 ≈ min、后半段 ≈ max
for k, e in ipairs(PARAMS) do
  local a = call(gSweep, "getParameter", e.type)
  if a ~= nil then
    local s = (k - 1) * STRIDE
    out.verify[#out.verify + 1] = {
      type = e.type,
      atZero = call(a, "get", 0),
      atOwnStart = call(a, "get", bl(s + NB / 4)),            -- 本音符前半段中点
      atOwnEnd = call(a, "get", bl(s + NB * 3 / 4)),          -- 本音符后半段中点
      atGap = (STRIDE - NB) > 0 and call(a, "get", bl(s + NB + (STRIDE - NB) / 2)) or nil,  -- 音符后的空隙
      atNext = call(a, "get", bl(k * STRIDE + NB / 4)),       -- 下一个音符的前半段（应是**另一条**参数的地盘）
    }
  end
end

for ti = 1, (call(p, "getNumTracks") or 0) do
  local tr = call(p, "getTrack", ti)
  local ns = {}
  for i = 1, (call(tr, "getNumGroups") or 0) do
    local r = call(tr, "getGroupReference", i)
    local tg = call(r, "getTarget")
    ns[#ns + 1] = tostring(call(tg, "getName")) .. "(" .. tostring(call(tg, "getNumNotes")) .. "音@"
      .. string.format("%.0f", (call(r, "getTimeOffset") or 0) / Q) .. "拍)"
  end
  out.tracks[#out.tracks + 1] = tostring(ti) .. ":" .. tostring(call(tr, "getName")) .. " [" .. table.concat(ns, ", ") .. "]"
end
return out
`;

/** 把 JS 数组转成 **Lua 表字面量**（Lua 没有 `[…]` 数组字面量，别用 JSON.stringify 偷懒） */
function luaArrayOfTables(rows, keyOrder) {
  const cells = rows.map((o) => {
    const keys = keyOrder || Object.keys(o);
    return '{ ' + keys.map((k) => `${k} = ${JSON.stringify(o[k])}`).join(', ') + ' }';
  });
  return '{ ' + cells.join(', ') + ' }';
}

function buildCode() {
  const code = CODE
    .replace('__PREFIXES__', `{ ${PREFIXES.map((g) => JSON.stringify(g)).join(', ')} }`)
    .replace('__PARAMS__', luaArrayOfTables(PARAMS, ['type', 'min', 'max']))
    .replace('__PITCHES__', `{ ${PITCHES.join(', ')} }`)
    .replace('__NOTE_BEATS__', String(NOTE_BEATS))
    .replace('__STRIDE_BEATS__', String(STRIDE_BEATS))
    .replace('__CLEAN_ONLY__', CLEAN_ONLY ? 'true' : 'false');
  const bad = code.split('\n').findIndex((l) => /\[\s*\{/.test(l));
  if (bad >= 0) throw new Error(`生成的 Lua 第 ${bad + 1} 行含 JSON 数组语法 [ { —— Lua 不支持，请用 { { … } }`);
  return code;
}

(async () => {
  if (process.argv.includes('--dump')) {
    buildCode().split('\n').slice(0, 34).forEach((l, i) => console.log(String(i + 1).padStart(3) + '| ' + l));
    return;
  }
  const hb = ipc.readHeartbeat(HOST);
  const age = hb ? Math.round(ipc.heartbeatAgeSec(HOST)) : -1;
  console.log(`桥 ${hb ? hb.hostName + ' ' + hb.version : '无'} · bridge=${hb && hb.bridge} · age=${age}s`);
  if (!hb || age > 15) { console.log('⚠️ 心跳过期 ⇒ 先在宿主里把桥跑起来。'); process.exit(2); }

  const r = await ipc.fileIpcSend('run_script', { code: buildCode() }, { host: HOST, timeoutMs: 30000 });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  const rx = r.result;
  const o = (rx && rx.resultType !== undefined) ? rx.result : rx;
  if (!o || o.ok === false) { console.log('❌ ' + JSON.stringify(o)); process.exit(1); }

  console.log('\n乐器（A/B 前提）：轨「' + o.instrument.track + '」database = ' + o.instrument.database);
  (o.steps || []).forEach((s) => console.log('  · ' + s));

  console.log('\n参数默认值（向宿主读取）：');
  (o.defaults || []).forEach((d) => console.log(`  ${d.type.padEnd(12)} 存在=${d.exists} 默认=${d.def}`));

  console.log('\n句2 逐音符扫描：');
  (o.sweep || []).forEach((w) => {
    if (w.error) console.log(`  ${w.type}: ${w.error}`);
    else console.log(`  音符 ${w.note}（${w.beats} 拍）${w.type}: ${w.from} → ${w.to}（音符外回默认 ${w.def}）`);
  });
  console.log('\n句3 全扫（长音符内 5 条同时）：');
  (o.allSweep || []).forEach((w) => console.log(`  ${w.type.padEnd(12)} ${w.from} → ${w.to}`));

  console.log('\n自检（句首 / 本音符前半 / 本音符后半 / 空隙 / 下一音符）：');
  let bad = 0;
  (o.verify || []).forEach((v) => {
    const d = (o.defaults || []).find((x) => x.type === v.type) || {};
    const p = (o.sweep || []).find((x) => x.type === v.type) || {};
    const near = (a, b) => a !== null && a !== undefined && Math.abs(Number(a) - Number(b)) < Math.max(1, Math.abs(Number(b)) * 0.25);
    const okStart = near(v.atOwnStart, p.from);
    const okEnd = near(v.atOwnEnd, p.to);
    const okGap = v.atGap === null || Number(v.atGap) === Number(d.def);
    const okNext = Number(v.atNext) === Number(d.def);
    if (!okStart || !okEnd || !okGap || !okNext) bad++;
    console.log(`  ${okStart && okEnd && okGap && okNext ? '✅' : '❌'} ${v.type.padEnd(12)} 前半=${v.atOwnStart}(${p.from}) · 后半=${v.atOwnEnd}(${p.to}) · 空隙=${v.atGap}(${d.def}) · 下一音符=${v.atNext}(${d.def})`);
  });
  if (bad) console.log(`  ⚠️ 有 ${bad} 条没达预期，试听结论不干净 —— 先告诉我。`);

  console.log('\n轨道现状：');
  (o.tracks || []).forEach((t) => console.log('  ' + t));
  const st = o.starts || {};
  const parts = [`${st.ctrl} 拍=对照`, `${st.sweep} 拍=逐个跳（每音符跳一条参数）`];
  if ((o.allSweep || []).length) parts.push(`${st.all} 拍=全跳（长音符，多参数同时跳）`);
  console.log('\n试听：' + parts.join(' · '));
  console.log(`      （音符 ${st.noteBeats} 拍 + 空隙 ${(st.stride || 0) - (st.noteBeats || 0)} 拍）`);
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
