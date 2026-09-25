#!/usr/bin/env node
/**
 * SV2 桥恢复后的**一批只读核查**（不动工程；唯一可能的写入只有"明确标注"的那一步，默认跳过）
 *
 * 跑这几件事：
 *   ① 心跳/版本/selftest —— 确认常驻的是不是磁盘上那份桥
 *   ② **`args.scope` 注入复测**（最关键：验证在 SV2 里重跑桥之后是否恢复）
 *   ③ `getVoice()` 到底返回哪些键 —— 直接检验 `transposeSemitones` / `relaxedPronunciation` 是否在 API 里
 *   ④ `getComputedAttributesForGroup` 取样 —— rap tone/intonation 是否可读（为 rap 适配铺路）
 *   ⑤ `getComputedPitchForGroup` 取样 —— 我的"自动倚音钉点脚本"的前提是否成立（返回数组还是空）
 *   ⑥ 当前组基本状态（组名/isMain/音符数/曲线数/引用偏移）
 *
 * 用法：node sv/lua/probe-sv2-api.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';

const call = (op, args) => ipc.fileIpcSend(op, args || {}, { host: HOST, timeoutMs: 30000 });
const unwrap = (r) => { const x = r && r.ok ? r.result : null; return (x && x.resultType !== undefined) ? x.result : x; };

// ---- ② scope 注入（2026-09-13 已查明语义：**scope 的内容会变成独立全局变量**，不是注入一个叫 scope 的对象）----
const SCOPE_PROBE = 'return { x = x or -1, typeScope = type(scope) }';

// ---- 只读大探针 ----
const READ_PROBE = `
local ed = SV:getMainEditor()
local ref = ed:getCurrentGroup()
local out = { hostVersion = tostring(SV), notes = {} }
if ref == nil then out.noGroup = true; return out end
local g = ref:getTarget()
out.group = g:getName()
local okM, m = pcall(function() return ref:isMain() end)
out.isMain = okM and m or "pcall失败"
out.noteCount = g:getNumNotes()
out.curveCount = g:getNumPitchControls()
out.timeOffset = ref:getTimeOffset()
out.pitchOffset = ref:getPitchOffset()

-- ③ getVoice() 返回哪些键（只读！）
local okV, v = pcall(function() return ref:getVoice() end)
out.getVoiceOk = okV
if okV and type(v) == "table" then
  local keys = {}
  for k, val in pairs(v) do
    local t = type(val)
    if t == "table" then
      local sub = {}
      for k2 in pairs(val) do sub[#sub + 1] = k2 end
      keys[#keys + 1] = k .. "={table:" .. table.concat(sub, ",") .. "}"
    else
      keys[#keys + 1] = k .. "=" .. tostring(val)
    end
  end
  table.sort(keys)
  out.voiceKeys = keys
  out.hasTransposeSemitones = (v.transposeSemitones ~= nil)
  out.hasTransposeCents = (v.transposeCents ~= nil)
  out.hasRelaxed = (v.relaxedPronunciation ~= nil)
  -- singers 里到底装了什么（SV2 的 Voice 只有 singers/spacing/vocalModeParams）
  if type(v.singers) == "table" and #v.singers > 0 then
    local s1 = v.singers[1]
    if type(s1) == "table" then
      local sk = {}
      for k3, v3 in pairs(s1) do
        sk[#sk + 1] = k3 .. "=" .. (type(v3) == "table" and ("table:" .. tostring(#v3)) or tostring(v3))
      end
      table.sort(sk)
      out.singerKeys = table.concat(sk, " · ")
    else
      out.singerKeys = "singers[1] 不是表：" .. tostring(s1)
    end
  end
end

-- ④ getComputedAttributesForGroup（只读；可能返回空数组 = 还没算完）
local okA, attrs = pcall(function() return SV:getComputedAttributesForGroup(ref) end)
out.computedAttrsOk = okA
if okA and type(attrs) == "table" then
  out.computedAttrsCount = #attrs
  if #attrs > 0 then
    local a = attrs[1]
    local k = {}
    for kk, vv in pairs(a) do k[#k + 1] = kk .. "=" .. tostring(type(vv) == "table" and ("table:" .. #vv) or vv) end
    table.sort(k)
    out.computedAttrsFirst = table.concat(k, " · ")
  end
end

-- ⑤ getComputedPitchForGroup（只读；绝对位置、空隙 null、未算完空数组）
local okP, pit = pcall(function()
  local interval = 7500000
  local n = math.floor((ref:getDuration() + ref:getTimeOffset()) / interval) + 2
  return SV:getComputedPitchForGroup(ref, 0, interval, n)
end)
out.computedPitchOk = okP
if okP and type(pit) == "table" then
  out.computedPitchCount = #pit
  local shown, nulls = {}, 0
  for i = 1, #pit do
    if pit[i] == nil then nulls = nulls + 1
    elseif #shown < 6 then shown[#shown + 1] = math.floor(pit[i] * 1000) / 1000 end
  end
  out.computedPitchNulls = nulls
  out.computedPitchSample = table.concat(shown, ", ")
end
return out
`;

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('=== ① 桥状态 ===');
  if (!hb) { console.log('❌ 没有心跳（桥没跑）'); process.exit(2); }
  console.log('  host=' + hb.hostName + ' ' + hb.version + ' · isSV2=' + hb.isSV2 +
    ' · bridge=' + hb.bridge + ' · age=' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's' +
    ' · ops=' + hb.ops.length + ' · opsRun=' + hb.opsRun);

  const st = await call('selftest', {});
  if (st.ok) {
    const s = (st.result && st.result.result) || st.result || {};
    console.log('  selftest：bridge=' + s.bridge + ' · lua=' + s.lua +
      ' · okOps=' + (s.capabilities && s.capabilities.okOps) + ' · blockedOps=' + (s.capabilities && s.capabilities.blockedOps));
  } else {
    console.log('  selftest 失败：' + st.error);
  }

  console.log('\n=== ② scope 注入（语义：scope 的内容 → 独立全局变量） ===');
  const sc = await call('run_script', { code: SCOPE_PROBE, readonly: true, scope: { x: 42 } });
  const so = unwrap(sc);
  console.log('  ' + (sc.ok ? JSON.stringify(so) : 'ERR ' + sc.error));
  if (sc.ok && so && so.x === 42) {
    console.log('  ✅ 注入正常：脚本里**直接读 `x`**（`typeScope=nil` 是正常的 —— 本来就没有名为 scope 的对象）');
  } else {
    console.log('  ❌ 注入没生效 —— 先确认请求文件里确实带了 args.scope，再看 _ENV（见 probe-scope-semantics.cjs）');
  }

  console.log('\n=== ③④⑤⑥ 只读大探针（computed pitch 会重试，因为它非阻塞） ===');
  let o = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const rp = await call('run_script', { code: READ_PROBE, readonly: true });
    if (!rp.ok) { console.log('  ERR ' + rp.error); return; }
    o = unwrap(rp);
    if (o.computedPitchCount > 0 || attempt === 3) break;
    console.log('  （第 ' + attempt + ' 次：computed pitch 帧数 0 ⇒ 1.5s 后重试）');
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('  当前组：' + o.group + ' · isMain=' + JSON.stringify(o.isMain) +
    ' · 音符 ' + o.noteCount + ' · 曲线 ' + o.curveCount +
    ' · timeOffset=' + o.timeOffset + ' · pitchOffset=' + o.pitchOffset);
  console.log('  getVoice() 可读=' + o.getVoiceOk +
    ' · 含 transposeSemitones=' + o.hasTransposeSemitones + ' · transposeCents=' + o.hasTransposeCents +
    ' · relaxedPronunciation=' + o.hasRelaxed);
  if (o.voiceKeys) console.log('  voice 键：' + o.voiceKeys.join(' | '));
  if (o.singerKeys) console.log('  singers[1]：' + o.singerKeys);
  console.log('  getComputedAttributesForGroup：ok=' + o.computedAttrsOk + ' · 条数=' + o.computedAttrsCount +
    (o.computedAttrsFirst ? '\n    第 1 条：' + o.computedAttrsFirst : ''));
  console.log('  getComputedPitchForGroup：ok=' + o.computedPitchOk + ' · 帧数=' + o.computedPitchCount +
    ' · null 帧=' + o.computedPitchNulls + (o.computedPitchSample ? '\n    样本：' + o.computedPitchSample : ''));
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
