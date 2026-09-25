#!/usr/bin/env node
/**
 * 用音高线画画（SV2 彩蛋）—— 走桥执行，遵守 `sv-pit-art` 技能的全部实测约束：
 *   · 一笔 = 一条曲线；多条曲线靠 SV2 逐条渲染 ⇒ 叠出图案
 *   · ‼️ 同一条曲线内 **x(blick) 必须严格递增** ⇒ 按 x 极值切分、递减段**反向写入**、
 *     真竖线给**水平漂移**（默认 1 画布单位 ≈ 4.6px；实测 0.91px 仍看不见）
 *   · 组里**至少要有一个音符**，否则整组不显示 ⇒ 空组时补 1 个占位音符（主组不补，直接报错）
 *   · **默认画在「你现在活跃的那个组」**（当前组，直接 addPitchControl，不改选中焦点、不建新组）
 *     `--new` 才另建独立「AKDAgent画板」组
 *
 * 用法：
 *   node sv/lua/draw-pit-art.cjs [sv|ix] [star|heart|check]   # 画在当前活跃组（默认 star）
 *   node sv/lua/draw-pit-art.cjs [sv|ix] clear [--force]      # 清掉当前活跃组的全部曲线
 *   node sv/lua/draw-pit-art.cjs [sv|ix] remove               # 只删自建的「AKDAgent画板」组
 *   可选：--at=16（画布起点在第 16 拍；默认 = 组内第一个音符的 onset）
 */
const path = require('path');
const DIST = path.join(__dirname, '..', '..', 'server', 'dist');
const ipc = require(path.join(DIST, 'fileipc.js'));

const ARGV = process.argv.slice(2);
const HOST = (() => {
  const f = ARGV.find((a) => a.startsWith('--host='));
  if (f) return f.slice('--host='.length);
  return ARGV.find((a) => a === 'sv' || a === 'ix') || 'sv';
})();
const SHAPE = ARGV.find((a) => ['star', 'heart', 'check', 'pelican', 'clear', 'remove'].includes(a)) || 'star';
const AT_Q = Number((ARGV.find((a) => a.startsWith('--at=')) || '').slice(5)) || 0;   // 0 = 用组内第一个音符 onset
const BASE_OVERRIDE = Number((ARGV.find((a) => a.startsWith('--base=')) || '').slice(7)) || 0;  // 0 = 按锚定规则算
const ANCHOR = ((ARGV.find((a) => a.startsWith('--anchor=')) || '').slice(9)) || 'notes';       // notes | fixed
const HEIGHT_OVERRIDE = Number((ARGV.find((a) => a.startsWith('--height=')) || '').slice(9)) || 0;
const USE_NEW = ARGV.includes('--new');
const FORCE = ARGV.includes('--force');

const GROUP = 'AKDAgent画板';
const WIDTH_Q = 8;        // 画布宽：8 拍
const HEIGHT_SEMI = HEIGHT_OVERRIDE || 14;   // 画布高：14 半音（可 --height= 覆盖）
const BASE_PITCH = 62;    // 兜底基音（anchor=fixed 时用；anchor=notes 时会被锚定值覆盖）
const DRIFT_UNITS = 1;    // 真竖线的总水平漂移（画布单位）

const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 60000 });
const callOk = async (op, args) => {
  const r = await call(op, args);
  if (!r.ok) throw new Error(op + ' 失败：' + r.error);
  return r.result;
};

// ---------- 图形（归一化 [0,1]²，y 向上）----------
function star() {
  const R = 0.46, r = R * 0.382, cx = 0.5, cy = 0.5, pts = [];
  for (let k = 0; k <= 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5;
    const rad = (k % 2 === 0) ? R : r;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return [pts];
}
function heart(n = 240) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n * 2 * Math.PI;
    pts.push([16 * Math.pow(Math.sin(t), 3),
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return [pts.map(([x, y]) => [(x - x0) / (x1 - x0), (y - y0) / (y1 - y0)])];
}
function check() {
  const a = [], b = [];
  for (let k = 0; k <= 60; k++) { const u = k / 60; a.push([0.05 + u * 0.30, 0.42 - u * 0.30]); }
  for (let k = 0; k <= 90; k++) { const u = k / 90; b.push([0.35 + u * 0.60, 0.12 + u * 0.72]); }
  return [a, b];
}
// 圆的折线（闭合）。‼️ 起笔点取**正右方**（a=0° = x 极值），不要取正下方：
//    切分只按 x 单调性 ⇒ 圆必在左右两个 x 极值处断开；若起笔点落在半圆中间（如正下方），
//    那一半会被"首尾接缝"再劈一刀 ⇒ 上半圆 1 条 + 下半圆 2 个 1/4（2026-09-12 用户观察到的现象）。
//    起笔点放在 x 极值 ⇒ 上下半圆各一条（实测：3 条 → 2 条）。
function circle(cx, cy, r, n = 24) {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = k / n * 2 * Math.PI; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return p;
}
function arc(cx, cy, r, a0, a1, n = 16) {
  const p = [];
  for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return p;
}
// 🚲 鹈鹕骑自行车（归一化 [0,1]²，y 向上；车在下方，鸟在上方，车头朝右）
function pelican() {
  const RH = [0.24, 0.16], FH = [0.74, 0.16], BB = [0.50, 0.16], SEAT = [0.44, 0.46], BARS = [0.70, 0.46];
  return [
    circle(RH[0], RH[1], 0.125),                              // 后轮
    circle(FH[0], FH[1], 0.125),                              // 前轮
    [RH, BB],                                                 // 后下叉
    [RH, SEAT],                                               // 后上叉
    [BB, SEAT],                                               // 座管
    [SEAT, BARS],                                             // 上管
    [BB, BARS],                                               // 下管
    [BARS, FH],                                               // 前叉
    [[0.70, 0.46], [0.765, 0.435]],                           // 车把
    [BB, [0.565, 0.095]],                                     // 曲柄
    [[0.545, 0.095], [0.60, 0.095]],                          // 脚踏
    [[0.28, 0.25], [0.36, 0.25], [0.36, 0.42]],               // 后货架（可选装饰）
    circle(0.46, 0.63, 0.14, 26),                             // 鹈鹕身体（圆润）
    [[0.53, 0.70], [0.56, 0.79], [0.605, 0.835]],             // 脖子
    circle(0.635, 0.845, 0.035, 16),                          // 头
    [[0.662, 0.855], [0.80, 0.845], [0.865, 0.815]],          // 上喙（长）
    [[0.665, 0.832], [0.74, 0.755], [0.83, 0.80], [0.865, 0.815]], // 喉囊（招牌大兜）
    circle(0.652, 0.860, 0.011, 10),                          // 眼
    [[0.355, 0.665], [0.45, 0.715], [0.545, 0.655]],          // 翅膀
    [[0.33, 0.625], [0.245, 0.575]],                          // 尾羽
    [[0.455, 0.52], [0.53, 0.26], [0.575, 0.11]],             // 腿（后）
    [[0.495, 0.52], [0.56, 0.28], [0.60, 0.12]],              // 腿（前）
    arc(0.46, 0.63, 0.085, Math.PI * 0.15, Math.PI * 0.85, 12), // 腹部弧线
  ];
}
const SHAPES = { star, heart, check, pelican };

// 数据**内联进 Lua 源码**（可行且更稳），并加「组名 + 音符数」护栏（防止被另一个宿主接单画错工程）。
// ⚠️ 更正（2026-09-13）：这里原先写"实测常驻桥 scope 恒为 nil、注入不生效"——**那是我读错了变量名**。
//    桥的 `scope` 语义是**把它的"内容"逐键注入成独立全局变量**（脚本里读 `x`/`strokes`，而不是 `scope.x`），
//    注入一直是好的。证据与正确写法：`sv/lua/probe-scope-semantics.cjs` · `skills/sv-pit-art/SKILL.md` §0.4。
const luaNum = (x) => (Math.round(x * 1e6) / 1e6).toString();
const luaStrokes = (strokes) => '{\n' +
  strokes.map((st) => '  { ' + st.map(([u, v]) => '{' + luaNum(u) + ',' + luaNum(v) + '}').join(', ') + ' }').join(',\n') +
  '\n}';

const buildLua = (strokes, opt) => `
local proj = SV:getProject()
proj:newUndoRecord()
local ed = SV:getMainEditor()
local track = ed:getCurrentTrack()

-- 参数（内联；不用 scope —— 见文件头说明）
local scope = {
  useNew = ${opt.useNew ? 'true' : 'false'},
  groupName = ${JSON.stringify(GROUP)},
  atBlick = ${opt.atBlick},
  basePitch = ${BASE_PITCH},
  height = ${opt.height},
  anchorNotes = ${opt.anchorNotes ? 'true' : 'false'},
  baseOverride = ${opt.baseOverride},
  widthQ = ${WIDTH_Q},
  drift = ${Math.round(DRIFT_UNITS * (WIDTH_Q * 705600000 / 100))},
  strokes = ${luaStrokes(strokes)},
  expectGroup = ${opt.expectGroup === null ? 'nil' : JSON.stringify(opt.expectGroup)},
  expectNotes = ${opt.expectNotes === null ? 'nil' : String(opt.expectNotes)},
}

-- ① 定位目标组：默认 = 当前活跃组；--new 才按名字找/建独立画板组（绝不碰主组）
local target, ref, created = nil, nil, false
if scope.useNew then
  for i = 1, track:getNumGroups() do
    local r = track:getGroupReference(i)
    local t = r:getTarget()
    local okM, isMain = pcall(function() return r:isMain() end)
    if t ~= nil and t:getName() == scope.groupName and okM and not isMain then target, ref = t, r end
  end
  if target == nil then
    local g = SV:create("NoteGroup")
    g:setName(scope.groupName)
    local n = SV:create("Note")
    n:setPitch(scope.basePitch)
    n:setTimeRange(0, 4 * SV.QUARTER)
    n:setLyrics("la")
    g:addNote(n)
    proj:addNoteGroup(g)
    ref = SV:create("NoteGroupReference")
    ref:setTarget(g)
    ref:setTimeOffset(scope.atBlick)
    track:addGroupReference(ref)
    target, created = g, true
  end
else
  ref = ed:getCurrentGroup()
  if ref == nil then error("没有当前组") end
  target = ref:getTarget()
  if target == nil then error("当前组取不到 NoteGroup") end
end

local okM, isMain = pcall(function() return ref:isMain() end)
local out = { group = target:getName(), created = created, isMain = okM and isMain or nil }

-- ①.5 护栏：确认接单的宿主就是客户端刚探到的那个工程（两个 SV 同时在跑时会抢答同一条通道）
if not created and scope.expectGroup ~= nil then
  if target:getName() ~= scope.expectGroup or target:getNumNotes() ~= scope.expectNotes then
    error("目标组与预检不符（预检 " .. tostring(scope.expectGroup) .. "/" .. tostring(scope.expectNotes) ..
      "，实到 " .. tostring(target:getName()) .. "/" .. tostring(target:getNumNotes()) ..
      "）—— 可能是另一个 SV 实例接单了，已中止，未做任何写入")
  end
end

-- ② 组里必须有音符，否则整组不显示
if target:getNumNotes() == 0 then
  if okM and isMain then error("当前是主组且没有音符：插入占位音符会改主组，已中止（请换一个组或加 --new）") end
  local n = SV:create("Note")
  n:setPitch(scope.basePitch)
  n:setTimeRange(scope.atBlick, 4 * SV.QUARTER)
  n:setLyrics("la")
  target:addNote(n)
  out.placeholderNote = true
end

-- ②.5 垂直锚定（2026-09-12 教训：不锚定就会"画在天上"）
--   ① 先按**本组音符音高**的中位数定画布中心；
--   ② 再读**钢琴窗视图坐标**把画布**夹进可见音高区间**：
--      CoordinateSystem.getValueViewRange() → { 低, 高 }（钢琴窗单位 = MIDI 半音）
--   ③ 报告落点的**屏幕像素**（v2y）与可见区间，便于一眼判断"看不看得见"。
local base, med = scope.basePitch, nil
local ps = {}
for i = 1, target:getNumNotes() do ps[#ps + 1] = target:getNote(i):getPitch() end
if #ps > 0 then table.sort(ps); med = ps[math.floor((#ps + 1) / 2)] end
if med ~= nil and scope.anchorNotes then base = med - scope.height / 2 end
out.noteMedian = med

local visLo, visHi, pxPerSemi = nil, nil, nil
-- ‼️ 组引用的 pitchOffset：曲线坐标（含 anchor pitch）都是**组内局部**坐标，
--    显示音高 = pitchOffset + 曲线 anchor + 点偏移 ⇒ 可见性比较必须带上它（2026-09-12 用户提醒）。
local okOff, pitchOff = pcall(function() return ref:getPitchOffset() end)
pitchOff = (okOff and pitchOff) or 0
out.pitchOffset = pitchOff
local okNav = pcall(function()
  local nav = SV:getMainEditor():getNavigation()
  local vr = nav:getValueViewRange()
  visLo, visHi = vr[1], vr[2]
  pxPerSemi = nav:getValuePxPerUnit()
end)
out.visLo, out.visHi, out.pxPerSemitone = visLo, visHi, pxPerSemi
if okNav and visLo ~= nil and visHi ~= nil then
  local dispTop, dispBot = pitchOff + base + scope.height, pitchOff + base
  if dispTop > visHi then base = visHi - scope.height - pitchOff end    -- 显示顶部越界 ⇒ 下压
  if dispBot < visLo then base = visLo - pitchOff end                   -- 显示底部越界 ⇒ 上抬
end
if scope.baseOverride > 0 then base = scope.baseOverride end
base = math.floor(base + 0.5)
out.base = base
out.top = base + scope.height
if okNav then
  local yTop, yBot = nil, nil
  pcall(function()
    local nav = SV:getMainEditor():getNavigation()
    yTop, yBot = nav:v2y(pitchOff + base + scope.height), nav:v2y(pitchOff + base)
  end)
  if yTop ~= nil then out.drawYPx = math.floor(yTop) .. ".." .. math.floor(yBot) end
end

-- ③ 拆「一笔」成若干条 x 严格递增的曲线
local function splitMonotonic(pts)
  local runs, start, dir = {}, 1, 0
  for i = 2, #pts do
    local d = pts[i][1] - pts[i - 1][1]
    local nd = (d > 0) and 1 or ((d < 0) and -1 or 0)
    if nd ~= 0 then
      if dir == 0 then dir = nd
      elseif nd ~= dir then runs[#runs + 1] = { start, i - 1 }; start, dir = i - 1, nd end
    end
  end
  runs[#runs + 1] = { start, #pts }
  local res = {}
  for r = 1, #runs do
    local seg = {}
    for i = runs[r][1], runs[r][2] do seg[#seg + 1] = { pts[i][1], pts[i][2] } end
    if #seg >= 2 then
      if seg[1][1] > seg[#seg][1] then                    -- 递减段 → 反向（同一条几何线）
        local rev = {}
        for i = #seg, 1, -1 do rev[#rev + 1] = seg[i] end
        seg = rev
      end
      local vstep = math.max(1, math.floor(scope.drift / 39))   -- 竖线漂移步长
      local fixed = { seg[1] }
      for k = 2, #seg do
        local lx, nx = fixed[#fixed][1], seg[k][1]
        if nx <= lx then
          -- ‼️ 末点通常是**与相邻曲线共享的 x 极值顶点**：只挪 1 blick 保严格递增，
          --    否则两条曲线在同一顶点给出不同 x ⇒ 接缝错开（2026-09-12 截图上看到的断口）
          if k == #seg then nx = lx + 1 else nx = lx + vstep end
        end
        fixed[#fixed + 1] = { nx, seg[k][2] }
      end
      res[#res + 1] = fixed
    end
  end
  return res
end

-- ④ 归一化笔画 → 曲线
local t0 = (scope.atBlick > 0) and scope.atBlick or target:getNote(1):getOnset()
out.origin = t0
local span = scope.widthQ * SV.QUARTER
local curves, points = 0, 0
for s = 1, #scope.strokes do
  local stroke = scope.strokes[s]
  local mapped = {}
  for i = 1, #stroke do
    mapped[i] = { t0 + stroke[i][1] * span, base + stroke[i][2] * scope.height }
  end
  for _, c in ipairs(splitMonotonic(mapped)) do
    local pts, org = {}, c[1][1]
    for i = 1, #c do
      -- ‼️‼️ SV 的点 y 是**相对 anchor pitch 的偏移量**，不是绝对音高！
      --   官方：getPoints() → "value is the pitch offset from the anchor position"；
      --         getPitch()  → "the anchor pitch value … relative to the pitch offset of the note group"。
      --   故实际音高 = base + y。**写成绝对值 ⇒ 图案被整体抬高一个 base**（2026-09-12 用户实测：
      --   pitch=62 而 y=69.76 ⇒ 实际到 ~132，看上去像"画在天上"，实为 62+69.76）。
      pts[i] = { math.floor(c[i][1] - org + 0.5), math.floor((c[i][2] - base) * 1000 + 0.5) / 1000 }
    end
    local cv = SV:create("PitchControlCurve")
    cv:setPosition(math.floor(org + 0.5))
    cv:setPitch(base)
    cv:setPoints(pts)
    target:addPitchControl(cv)
    curves, points = curves + 1, points + #pts
  end
end
out.curves, out.points = curves, points
out.totalCurves = target:getNumPitchControls()
out.noteCount = target:getNumNotes()
out.timeOffset = ref:getTimeOffset()
return out
`;

const LUA_CLEAR = `
local proj = SV:getProject()
proj:newUndoRecord()
local ref = SV:getMainEditor():getCurrentGroup()
local t = ref:getTarget()
local n = 0
for k = t:getNumPitchControls(), 1, -1 do t:removePitchControl(k); n = n + 1 end
return { removed = n, left = t:getNumPitchControls(), group = t:getName() }
`;

const buildRemove = (groupName) => `local proj = SV:getProject()
proj:newUndoRecord()
local track = SV:getMainEditor():getCurrentTrack()
local groupName = ${JSON.stringify(groupName)}
for i = track:getNumGroups(), 1, -1 do
  local r = track:getGroupReference(i)
  local t = r:getTarget()
  local okM, isMain = pcall(function() return r:isMain() end)
  if t ~= nil and t:getName() == groupName and okM and not isMain then
    local notes = t:getNumNotes()
    track:removeGroupReference(i)
    proj:removeNoteGroup(t)
    return { removedGroup = groupName, notes = notes }
  end
end
return { removedGroup = nil }
`;

// ---- 画完**读回核对**（教训：只看脚本自报会出现"画在天上/接缝断口"却不自知）----
// 读回指定组的全部音高曲线 → 与"预期笔画逐段"比对：覆盖了多少段、缺哪段、包围盒、可见性。
const buildReadback = (groupName) => `
local ed = SV:getMainEditor()
local track = ed:getCurrentTrack()
local groupName = ${JSON.stringify(groupName)}
local g = nil
for i = 1, track:getNumGroups() do
  local t = track:getGroupReference(i):getTarget()
  if t ~= nil and t:getName() == groupName then g = t; gr = track:getGroupReference(i) end
end
if g == nil then return { found = false } end
local out = { found = true, group = g:getName(), noteCount = g:getNumNotes(), curveCount = g:getNumPitchControls(), curves = {} }
if gr ~= nil then
  out.timeOffset = gr:getTimeOffset()
  local okP, p = pcall(function() return gr:getPitchOffset() end)
  out.pitchOffset = okP and p or 0
end
local nav = nil
pcall(function() nav = SV:getMainEditor():getNavigation() end)
if nav ~= nil then
  local vr = nav:getValueViewRange()
  out.visLo, out.visHi = vr[1], vr[2]
  local tr = nav:getTimeViewRange()
  out.timeLo, out.timeHi = tr[1], tr[2]
end
for i = 1, g:getNumPitchControls() do
  local c = g:getPitchControl(i)
  if c ~= nil then
    local pts = c:getPoints()
    local flat = {}
    if pts ~= nil then
      if type(pts[1]) == "table" then
        for k = 1, #pts do flat[#flat + 1] = pts[k][1]; flat[#flat + 1] = pts[k][2] end
      else
        for k = 1, #pts do flat[#flat + 1] = pts[k] end
      end
    end
    out.curves[#out.curves + 1] = { pos = c:getPosition(), pitch = c:getPitch(), pts = flat }
  end
end
return out
`;

/** 把读回结果与"预期笔画"逐段比对 */
function verifyReadback(strokes, o, rb) {
  const span = WIDTH_Q * 705600000;
  const useH = HEIGHT_SEMI;
  const origin = o.origin, base = o.base;
  const segs = [];
  for (const st of strokes) {
    for (let i = 0; i + 1 < st.length; i++) {
      segs.push([
        [origin + st[i][0] * span, base + st[i][1] * useH],
        [origin + st[i + 1][0] * span, base + st[i + 1][1] * useH],
      ]);
    }
  }
  const polys = (rb.curves || []).map((c) => {
    const a = [];
    // ‼️ 读回的值也要按官方语义还原：**实际音高 = 曲线 anchor pitch + 点 y（偏移量）**；
    //    x 同理：绝对 = 曲线 position + 点 x。写成绝对值/偏移量任一处搞反，这里就会与预期不符 ⇒ 自动报错。
    for (let i = 0; i + 1 < c.pts.length; i += 2) a.push([c.pos + c.pts[i], c.pitch + c.pts[i + 1]]);
    return a;
  });
  const tolX = 2000000, tolY = 0.02;   // x 容差覆盖竖线漂移（vstep≈1.45M blick）
  const missing = [];
  const has = (a, b) => polys.some((pl) => pl.some((p, i) => {
    const q = pl[i + 1];
    if (!q) return false;
    return (Math.abs(p[0] - a[0]) <= tolX && Math.abs(p[1] - a[1]) <= tolY &&
            Math.abs(q[0] - b[0]) <= tolX && Math.abs(q[1] - b[1]) <= tolY) ||
           (Math.abs(p[0] - b[0]) <= tolX && Math.abs(p[1] - b[1]) <= tolY &&
            Math.abs(q[0] - a[0]) <= tolX && Math.abs(q[1] - a[1]) <= tolY);
  }));
  for (const [a, b] of segs) if (!has(a, b)) missing.push({ a, b });

  const all = polys.flat();
  const ys = all.map((p) => p[1]);
  const bbox = { yLo: Math.min(...ys), yHi: Math.max(...ys) };
  const drawn = (rb.curves || []).length;
  const totalPts = polys.reduce((s, p) => s + p.length, 0);
  const fitView = (rb.visLo == null) ? null : (bbox.yLo >= rb.visLo - 0.01 && bbox.yHi <= rb.visHi + 0.01);
  return { expected: segs.length, drawn, totalPts, missing, bbox, fitView, visLo: rb.visLo, visHi: rb.visHi };
}

(async () => {
  const hb = ipc.readHeartbeat(HOST);

  if (!hb) { console.log('❌ 没有 ' + HOST + ' 的心跳（桥未运行）'); process.exit(2); }
  console.log('宿主：' + hb.hostName + ' ' + hb.version + ' · bridge ' + hb.bridge + ' · isSV2=' + hb.isSV2 +
    ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');
  if (hb.isSV2 !== true) { console.log('❌ 画图需要 SV2/IX（`addPitchControl` 系 2.1.0+；SV1 不支持）'); process.exit(2); }
  const scope = { groupName: GROUP, useNew: USE_NEW, atBlick: Math.round(AT_Q * 705600000) };

  if (SHAPE === 'clear' || SHAPE === 'remove') {
    if (SHAPE === 'clear') {
      const cg = await callOk('get_current_group', {});
      console.log('目标组：' + cg.name + '（组内音符 ' + cg.noteCount + ' 个）');
      if (!FORCE) { console.log('⚠️ clear 会清掉该组**所有**音高曲线（含你自己画的）。确认后加 --force 重跑。'); return; }
      const r = await callOk('run_script', { code: LUA_CLEAR });
      console.log('🧽 已清：' + JSON.stringify(r.result));   // 写法：响应 {ok,result:{result,resultType}}
      return;
    }
    const r = await callOk('run_script', { code: buildRemove(GROUP) });
    console.log('🗑️ 删自建画板组：' + JSON.stringify(r.result));
    return;
  }

  const strokes = SHAPES[SHAPE]();
  // 预检（写前读）：记下当前活跃组的名字与音符数，作为写入时的护栏
  const cg = await callOk('get_current_group', {});
  if (!cg.current) { console.log('❌ 没有当前组'); process.exit(3); }
  console.log('预检：当前活跃组「' + cg.name + '」· 音符 ' + cg.noteCount +
    ' 个 · isMain（桥 op 未回该字段，写入脚本内自行判定）');
  console.log('图形：' + SHAPE + ' · 笔画 ' + strokes.length + ' 条 · 画布 ' + WIDTH_Q + ' 拍 × ' + HEIGHT_SEMI +
    ' 半音 · 目标：' + (USE_NEW ? '自建「' + GROUP + '」组' : '**当前活跃组**') +
    ' · 起点：' + (AT_Q > 0 ? '第 ' + AT_Q + ' 拍' : '组内第一个音符 onset'));

  const code = buildLua(strokes, {
    useNew: USE_NEW,
    atBlick: Math.round(AT_Q * 705600000),
    expectGroup: USE_NEW ? null : cg.name,
    expectNotes: USE_NEW ? null : cg.noteCount,
    height: HEIGHT_SEMI,
    anchorNotes: ANCHOR !== 'fixed',
    baseOverride: BASE_OVERRIDE,
  });
  const r = await callOk('run_script', { code });
  // ‼️ run_script 的 `result` 是 {result:<Lua值>, resultType} 的**包封**；callOk 已剥掉响应外层，
  //    所以这里 r.result 就是 Lua 值。**只剥一层**（2026-09-12 我多剥一层 ⇒ 打印全 undefined，
  //    还据此误判成"两个修订抢答"，见 C4/A2 的更正记录）。
  const raw = r.result;
  const o = (raw && raw.result !== undefined && raw.resultType !== undefined) ? raw.result : (raw || {});
  console.log('✅ 画完：曲线 ' + o.curves + ' 条 / ' + o.points + ' 点 · 组「' + o.group + '」' +
    (o.isMain ? '（主组）' : '') + (o.created ? '（新建）' : '') + (o.placeholderNote ? '（补了占位音符）' : '') +
    ' · 组内曲线共 ' + o.totalCurves + ' 条 · 音符 ' + o.noteCount + ' 个 · 起点 ' + o.origin + ' blick');
  console.log('   画布：基音 ' + o.base + ' .. ' + o.top + '（组内音符中位数 ' + o.noteMedian +
    '）' + (o.visLo != null ? ' · 钢琴窗可见 ' + o.visLo.toFixed(2) + '..' + o.visHi.toFixed(2) : '') +
    (o.drawYPx ? ' · 落点屏幕 y=' + o.drawYPx + 'px（' + (o.pxPerSemitone || '?') + 'px/半音）' : ''));

  // ---- 画完**读回核对**：不信自报，直接读宿主里的曲线，与预期笔画逐段比对 ----
  if (!ARGV.includes('--no-verify')) {
    const rbRaw = (await callOk('run_script', { code: buildReadback(o.group || GROUP), readonly: true })).result;
    const rb = (rbRaw && rbRaw.result !== undefined && rbRaw.resultType !== undefined) ? rbRaw.result : (rbRaw || {});
    if (!rb.found) {
      console.log('⚠️ 读回核对：没找到组「' + (o.group || GROUP) + '」，跳过');
    } else {
      const v = verifyReadback(strokes, o, rb);
      console.log('🔍 读回核对：组内曲线 ' + v.drawn + ' 条 / ' + v.totalPts + ' 点 · 预期笔画段 ' + v.expected +
        ' ⇒ **缺 ' + v.missing.length + ' 段**' + (v.missing.length === 0 ? ' ✅ 图案完整' : ' ❌ 有断口'));
      console.log('   实际音高范围 ' + v.bbox.yLo.toFixed(2) + '..' + v.bbox.yHi.toFixed(2) +
        (v.visLo != null ? ' · 可见区 ' + v.visLo.toFixed(2) + '..' + v.visHi.toFixed(2) +
          ' ⇒ ' + (v.fitView ? '**完全可见** ✅' : '⚠️ **有部分在可见区外**（用户要滚动才看得全）') : ''));
      v.missing.slice(0, 6).forEach((m) => console.log('   缺失段：pitch ' + m.a[1].toFixed(2) + '→' + m.b[1].toFixed(2) +
        '（x ' + Math.round(m.a[0]) + '→' + Math.round(m.b[0]) + '）'));
    }
  }
  console.log('撤销：SV 里 Ctrl+Z（每次写入都建了 undo 记录）｜清曲线：… clear --force｜删画板组：… remove');
})().catch((e) => { console.error('异常：' + (e && e.message)); process.exit(2); });
