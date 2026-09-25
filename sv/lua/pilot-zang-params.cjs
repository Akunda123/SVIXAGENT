#!/usr/bin/env node
/**
 * 藏腔「尖尖 + 张力/发声/气声」落到音符（手绘 Pit + 参数自动化）。
 *
 * 背景：2023 拜年祭《弈》的吟唱段（14 个 `ei` 音）要按藏腔处理。配方出处：
 *   `skills/sv-scripting/references/11-风格配方.md` §2.3、`07-melody-accent-pitch-params.md` ①
 *   —— 灵魂是**极短促、朝上 ≈3 半音的小尖尖**（带斜度、干净利落）；
 *      **上跳段张力（连带发声）必须画低**，不降既不像又刺耳；「亮而实」⇒ 元音处**气声压低**；
 *      吟唱段基本直音（要加就高频弱颤）。
 *
 * 为什么不用 `sv_write_pit`：
 *   ① 它的曲线合成是 `levelAt(S_all) + bumpsAt(±2 上下文)`，**相邻音全带音头时会重复累加**
 *      （实测把 +3 撑到 +8.47 半音）；accent 计划靠 ~40% 稀疏选点回避，密集的"每音一个尖尖"不成立。
 *   ② 它的 accent 路径把颤音硬编码成 `dF0Vbr 1.2 / fF0Vbr 5.8`，与吟唱段"存在感弱"冲突。
 *   ⇒ 这里**逐点手绘**：点值 = 全局轮廓 − 本音音高，窗口重叠也一致。
 *
 * ⛔ 参数自动化的硬约束（`tools/known-bugs.json`，真机实测）：
 *   **绝不调** `Automation#getPoints()/getAllPoints()/getLinear()/getDefinition()`
 *   —— 调用即**冻桥、宿主重启**。安全读法只有单参采样 `a:get(pos)`（IX 上双参 `get(b,e)` 也失败）。
 *   ⚠️ 首点之前的区段会**按首点值外推** ⇒ 段落首尾必须各锚一个"原值"点，否则会倒着污染前后音符
 *      （纪律抄自 `test-ix-hidden-params.cjs` 的同名注释）。
 *
 * 用法：
 *   node sv/lua/pilot-zang-params.cjs sv                  # 默认 **dry-run**：只找目标 + 读默认值 + 报计划
 *   node sv/lua/pilot-zang-params.cjs sv --apply          # 真正写入
 *   node sv/lua/pilot-zang-params.cjs sv --clean          # 撤掉本脚本写的曲线与参数点
 *   node sv/lua/pilot-zang-params.cjs sv --target=group:试点组名    # 在指定组上跑（试点用）
 *   node sv/lua/pilot-zang-params.cjs sv --dump           # 只打印生成的 Lua（排查用）
 */

const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));

const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';
const APPLY = process.argv.includes('--apply');
const CLEAN = process.argv.includes('--clean');
const targetArg = process.argv.find((a) => a.startsWith('--target='));
const TARGET = targetArg ? targetArg.slice('--target='.length) : 'yi';   // 'yi' | 'group:名字'

/** 《弈》吟唱段 14 个音：{ onsetBlick（组内绝对 onset，与 Note#getOnset 同空间）, pitch }。
 *  取自 2026-09-16 实机选择集（用户选中段），用于**按 onset+pitch 精确重定位**，不靠手动选。 */
const YI = [
  [22579200000, 51], [22932000000, 53], [25401600000, 58], [26460000000, 58],
  [27518400000, 60], [28929600000, 65], [32457600000, 68], [33163200000, 68],
  [34574400000, 67], [35985600000, 65], [39513600000, 65], [40219200000, 60],
  [41630400000, 63], [43041600000, 65],
];

/** 参数取值表：name / 段落基线增量 / 尖尖处增量 / 合法下界 / 合法上界。
 *  实际写入值 = clamp(宿主默认值 + 增量, lo, hi) —— 默认值用安全采样 `get(0)` 读。
 *  依据：tension −1~+1 默认 0（`test-ix-hidden-params.cjs` 实测）；voicing 单极 0~1；
 *  breathiness −1~+1（`functions/05-params.md` 的 VISIBLE_RANGE / UNIPOLAR 表）。 */
const PARAMS = [
  { name: 'tension', base: -0.2, dip: -0.5, lo: -1, hi: 1 },
  { name: 'voicing', base: -0.15, dip: -0.35, lo: 0, hi: 1 },
  { name: 'breathiness', base: -0.3, dip: -0.4, lo: -1, hi: 1 },
];

function luaParams() {
  const rows = PARAMS.map((p) =>
    `{ name = ${JSON.stringify(p.name)}, base = ${p.base}, dip = ${p.dip}, lo = ${p.lo}, hi = ${p.hi} }`);
  return `{ ${rows.join(', ')} }`;
}

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
local ED = SV:getMainEditor()
local P = SV:getProject()
local TA = call(P, "getTimeAxis")
local function sec(b) return call(TA, "getSecondsFromBlick", b) end
local function blick(s)
  local b = call(TA, "getBlickFromSeconds", s)
  if b == nil then b = s * 1411200000 end
  return math.floor(b + 0.5)
end

local TARGET = __TARGET__
local YI = __YI_PAIRS__
local SPECS = __PARAM_SPECS__
local APPLY = __APPLY__
local CLEAN = __CLEAN__

local AMP = 3          -- 尖尖幅度（半音）
local VAMP, VHZ = 0.3, 8
local STEP = 0.01      -- 采样步长（秒）
local RISE, PEAK_AT, SETTLE = 0.05, 0.01, 0.08   -- 相对 onset：起始上升 / 峰值 / 回落结束（秒）
local JUMPSEMI = 3     -- 判定"上跳"的音程（半音）：上跳位尖尖按全量，其余按 60%
local SOFT = 0.6

local out = { ok = true, steps = {}, defaults = {}, written = {}, removed = {}, targets = 0 }
local function step(s) out.steps[#out.steps + 1] = tostring(s) end

local function groupByName(nm)
  for t = 1, (call(P, "getNumTracks") or 0) do
    local tr = call(P, "getTrack", t)
    for r = 1, (call(tr, "getNumGroups") or 0) do
      local g = call(call(tr, "getGroupReference", r), "getTarget")
      if g ~= nil and tostring(call(g, "getName")) == nm then return g end
    end
  end
  return nil
end
local function groupWithYi()
  for t = 1, (call(P, "getNumTracks") or 0) do
    local tr = call(P, "getTrack", t)
    for r = 1, (call(tr, "getNumGroups") or 0) do
      local g = call(call(tr, "getGroupReference", r), "getTarget")
      if g ~= nil then
        local hit = 0
        for i = 1, (call(g, "getNumNotes") or 0) do
          local nt = call(g, "getNote", i)
          local on, pt = call(nt, "getOnset"), call(nt, "getPitch")
          for k = 1, #YI do
            if on == YI[k][1] and pt == YI[k][2] then hit = hit + 1 break end
          end
        end
        if hit > 0 then return g, hit end
      end
    end
  end
  return nil, 0
end

local G, hits = nil, 0
if TARGET == "yi" then
  G, hits = groupWithYi()
else
  G = groupByName(string.sub(TARGET, 7))
  hits = G and (call(G, "getNumNotes") or 0) or 0
end
if G == nil then
  out.ok = false
  out.error = "找不到目标组（--target=" .. TARGET .. "）—— 弈没导入？或改用 --target=group:<组名>"
  return out
end
step("目标组 = " .. tostring(call(G, "getName")) .. " · 组内音符 " .. tostring(call(G, "getNumNotes")) ..
     " · 命中目标 " .. tostring(hits))

-- 收目标音符：yi ⇒ 按 onset+pitch 精确匹配；group:xxx ⇒ 全组
local all = (TARGET ~= "yi")
local notes = {}
for i = 1, (call(G, "getNumNotes") or 0) do
  local nt = call(G, "getNote", i)
  local on, pt = call(nt, "getOnset"), call(nt, "getPitch")
  local want = all
  if not want then
    for k = 1, #YI do
      if on == YI[k][1] and pt == YI[k][2] then want = true break end
    end
  end
  if want then
    notes[#notes + 1] = { note = nt, onset = on, endB = call(nt, "getEnd"), pitch = pt }
  end
end
if #notes == 0 then
  out.ok = false
  out.error = "组内没有可画的音符"
  return out
end
table.sort(notes, function(a, b) return a.onset < b.onset end)
out.targets = #notes

-- 每音：onset/end（秒）、弱颤起点（长音用 k=0.5×时长，封顶 1s；短音从尖尖落定后起）、是否上跳
local N = #notes
for i = 1, N do
  local m = notes[i]
  m.o = sec(m.onset)
  m.e = sec(m.endB)
  local dur = m.e - m.o
  local durBeats = (m.endB - m.onset) / Q
  local k = 0
  if durBeats >= 1.5 then
    k = 0.5 * dur
    if k > 1 then k = 1 end
  end
  m.vbrFrom = m.o + math.max(0.10, k)
  m.up = (i > 1) and (m.pitch - notes[i - 1].pitch >= JUMPSEMI) or false
end

-- 全局轮廓（绝对音高，半音）：进入下一音的上升段落在本音末尾 RISE 内
local function contour(t)
  local i = 1
  for j = 1, N do
    if t >= notes[j].o and t < notes[j].e then i = j break end
    if t < notes[1].o then i = 1 break end
    i = j
  end
  local m = notes[i]
  local v = m.pitch
  if t >= m.vbrFrom and t <= m.e then
    local fade = 1
    if t > m.e - 0.05 then fade = math.max(0, (m.e - t) / 0.05) end
    v = v + VAMP * fade * math.sin(2 * math.pi * VHZ * (t - m.vbrFrom))
  end
  if i < N then
    local nxt = notes[i + 1]
    if t >= nxt.o - RISE then
      local u = (t - (nxt.o - RISE)) / (RISE + PEAK_AT)
      if u > 1 then u = 1 end
      v = m.pitch + (nxt.pitch + AMP - m.pitch) * u
    end
  end
  local pk = m.o + PEAK_AT
  if t >= pk and t < m.o + SETTLE then
    v = (m.pitch + AMP) - AMP * ((t - pk) / (SETTLE - PEAK_AT))
  end
  return v
end

-- ── ① 手绘 Pit ──────────────────────────────────────────
local function existingCurveAt(group, posB)
  for r = (call(group, "getNumPitchControls") or 0), 1, -1 do
    local c = call(group, "getPitchControl", r)
    if c ~= nil and call(c, "getPosition") == posB then return r end
  end
  return nil
end

if CLEAN then
  local ws = blick(notes[1].o - 0.06)
  local we = blick(notes[N].e + 0.06)
  for r = (call(G, "getNumPitchControls") or 0), 1, -1 do
    local c = call(G, "getPitchControl", r)
    local pos = c and call(c, "getPosition") or nil
    if pos ~= nil and pos >= ws and pos <= we then
      call(G, "removePitchControl", r)
      out.removed[#out.removed + 1] = "curve@" .. tostring(pos)
    end
  end
end

local guardB = tonumber(SV and SV.QUARTER) or Q
if APPLY and not CLEAN then
  for i = 1, N do
    local m = notes[i]
    local ws, we = m.o - 0.06, m.e + 0.06
    local posB = blick(ws)
    local old = existingCurveAt(G, posB)
    if old ~= nil then call(G, "removePitchControl", old) end       -- 幂等：窗口起点一致就替换
    local pts, mx = {}, -99
    local t = ws
    while t <= we do
      local y = contour(t) - m.pitch
      if y > mx then mx = y end
      pts[#pts + 1] = { blick(t) - posB, y }
      t = t + STEP
    end
    local c = SV:create("PitchControlCurve")
    call(c, "setPosition", posB)
    call(c, "setPitch", m.pitch)
    call(c, "setPoints", pts)
    call(G, "addPitchControl", c)
    out.written[#out.written + 1] = "idx" .. tostring(i) .. " pitch=" .. tostring(m.pitch) ..
      " 尖尖峰值=" .. string.format("%.2f", mx) .. " 点=" .. tostring(#pts) ..
      (m.up and " [上跳]" or "")
  end
end

-- ── ② 参数：tension / voicing / breathiness ─────────────
local pStart = blick(notes[1].o - 0.5)          -- 段落前 1 拍
local pEnd = blick(notes[N].e + 0.5)            -- 段落后 1 拍
for si = 1, #SPECS do
  local sp = SPECS[si]
  local a = call(G, "getParameter", sp.name)
  if a == nil then
    out.defaults[#out.defaults + 1] = { name = sp.name, exists = false }
  else
    local def = tonumber(call(a, "get", 0))
    if def == nil then def = 0 end
    local function clamp(v)
      if v < sp.lo then return sp.lo end
      if v > sp.hi then return sp.hi end
      return v
    end
    local baseV, dipV = clamp(def + sp.base), clamp(def + sp.dip)
    local rec = { name = sp.name, exists = true, def = def, base = baseV, dip = dipV }
    out.defaults[#out.defaults + 1] = rec
    if CLEAN then
      call(a, "remove", pStart, pEnd)                   -- 半开区间 [begin, end)
      out.removed[#out.removed + 1] = sp.name .. " 区间点"
    elseif APPLY then
      call(a, "add", pStart, def)                       -- 锚：段落前保持原值（防外推污染）
      for i = 1, N do
        local m = notes[i]
        local d = m.up and dipV or clamp(def + sp.dip * SOFT)
        local on = blick(m.o)
        call(a, "add", blick(m.o - RISE), baseV)        -- 尖尖前回基线
        call(a, "add", blick(m.o + PEAK_AT), d)         -- 尖尖处最深处（与 Pit 尖尖对齐）
        call(a, "add", blick(m.o + SETTLE), baseV)      -- 尖尖后回基线
        call(a, "add", blick(m.e - 0.02), baseV)
      end
      call(a, "add", pStart + Q, def)                    -- 段落内起段仍按基线（占位，避免首点外推）
      call(a, "add", pEnd, def)                          -- 到尾回原值
      rec.wrote = N
    end
  end
end

out.passage = { startBlick = notes[1].onset, endBlick = notes[N].endB, notes = N,
                apply = APPLY, clean = CLEAN, target = TARGET }
out.curvesNow = call(G, "getNumPitchControls")
return out
`;

function buildCode() {
  const code = CODE
    .replace('__TARGET__', JSON.stringify(TARGET))
    .replace('__YI_PAIRS__', `{ ${YI.map((p) => `{ ${p[0]}, ${p[1]} }`).join(', ')} }`)
    .replace('__PARAM_SPECS__', luaParams())
    .replace('__APPLY__', APPLY ? 'true' : 'false')
    .replace('__CLEAN__', CLEAN ? 'true' : 'false');
  const bad = code.split('\n').findIndex((l) => /\[\s*\{/.test(l));
  if (bad >= 0) throw new Error(`生成的 Lua 第 ${bad + 1} 行含 JSON 数组语法 [ { —— Lua 不支持，请用 { { … } }`);
  return code;
}

(async () => {
  if (process.argv.includes('--dump')) {
    buildCode().split('\n').forEach((l, i) => console.log(String(i + 1).padStart(3) + '| ' + l));
    return;
  }
  const hb = ipc.readHeartbeat(HOST);
  const age = hb ? Math.round(ipc.heartbeatAgeSec(HOST)) : -1;
  console.log(`桥 ${hb ? hb.hostName + ' ' + hb.version : '无'} · bridge=${hb && hb.bridge} · age=${age}s`);
  if (!hb || age > 15) { console.log('⚠️ 心跳过期 ⇒ 先在宿主里把桥跑起来。'); process.exit(2); }
  console.log(`模式：${CLEAN ? 'CLEAN（撤掉本脚本写的）' : (APPLY ? 'APPLY（写入）' : 'DRY-RUN（不写）')} · 目标：${TARGET}`);

  // dry-run 用 readonly 跳过 newUndoRecord 门；写/清必须带 newUndoRecord
  const code = (APPLY || CLEAN) ? `local proj = SV:getProject()\ncall = nil\n${buildCode()}` : buildCode();
  const r = await ipc.fileIpcSend('run_script', { code, readonly: !(APPLY || CLEAN) }, { host: HOST, timeoutMs: 60000 });
  if (!r.ok) { console.log('❌ ' + r.error); process.exit(1); }
  const rx = r.result;
  const o = (rx && rx.resultType !== undefined) ? rx.result : rx;
  if (!o || o.ok === false) { console.log('❌ ' + JSON.stringify(o)); process.exit(1); }

  (o.steps || []).forEach((s) => console.log('  · ' + s));
  console.log(`\n目标音符 ${o.targets} 个 · 组内当前曲线 ${o.curvesNow}`);
  console.log('\n参数（默认值向宿主读取；写入值 = clamp(默认+增量)）：');
  (o.defaults || []).forEach((d) => {
    if (d.exists === false) console.log(`  ${String(d.name).padEnd(12)} ✗ getParameter 返回 nil（本宿主不支持？）`);
    else console.log(`  ${String(d.name).padEnd(12)} 默认=${d.def}  基线=${d.base}  尖尖=${d.dip}`);
  });
  if ((o.written || []).length) { console.log('\n已写曲线：'); o.written.forEach((w) => console.log('  · ' + w)); }
  if ((o.removed || []).length) { console.log('\n已撤：'); o.removed.forEach((w) => console.log('  · ' + w)); }
  if (!APPLY && !CLEAN) {
    console.log('\n（DRY-RUN：没有改工程。确认上面目标与取值无误后加 --apply 写入；写坏了用 --clean 撤。）');
  }
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
