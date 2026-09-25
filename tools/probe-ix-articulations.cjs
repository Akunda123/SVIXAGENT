#!/usr/bin/env node
/**
 * **IX 技法（articulations）整轮复验探针**（2026-09-21 立项，为 `docs/待办.md` 的 **P20**）
 *
 * 为什么要有它：P20 要重画两张表 —— ① 每乐器支持矩阵（`skills/sv-ix/references/技法实测.md` §3.1）
 * ② 技法互斥矩阵（同文件 §5.1.1）。这需要 **每轨 × 每技法** 各跑一次"只设一个再读 `incompatible`"
 * （§0-E 的方法更正：**不能两个同时设再读**），几十上百次宿主调用 ⇒ 必须脚本化。
 *
 * 用法：
 *   node tools/probe-ix-articulations.cjs --caps                 # 只读：逐轨列 getSupportedArticulations（含轨名）
 *   node tools/probe-ix-articulations.cjs --matrix               # 写：每轨建自建组+1 音符，逐技法"只设一个再读"
 *   node tools/probe-ix-articulations.cjs --cleanup              # 清理它建的测试组（名字 akdagent-artic-test）
 *   node tools/probe-ix-articulations.cjs --caps --out r.json --json
 *   （公共参数：--host ix|sv（默认 ix）· --out <file> 把完整 JSON 落盘）
 *
 * ⚠️ 纪律（照 `akdagent-playbook`）：
 *   · 只往**自建组**写（组名 `akdagent-artic-test` + `scriptData.akdagentTemp` 标记），先 `newUndoRecord()`
 *   · **绝不调用未确认存在的成员**（先索引 + `type()`）
 *   · 乐器**既读不出也设不了**（Track/Mixer/Group 都没有乐器名）⇒ 轨 ↔ 乐器名 请另用
 *     `node tools/project-digest.cjs <工程文件或 recovery 快照>` 读 `mainRef.database.name`（本工具只按轨序号报）
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const argv = process.argv.slice(2)
const FLAG = (n) => argv.includes(n)
const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const HOST = OPT('--host') || 'ix'
const OUT = OPT('--out')
const AS_JSON = FLAG('--json')

let ipc
try {
  ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'))
} catch (e) {
  console.error('[FAIL] 载入 server/dist/fileipc.js 失败：' + e.message + '\n  先构建：node tools/build-server-runtime.cjs（或 npm run build）')
  process.exit(2)
}

const run = (code, readonly) => ipc.fileIpcSend('run_script', { code, readonly: !!readonly }, { host: HOST, timeoutMs: 15000 })

/** 桥的 run_script 回包是 `{resultType, result}`；MCP 层会剥一层，直连 fileipc 就得自己剥 */
function unwrap(r) {
  if (!r) return null
  const v = r.result
  if (v && typeof v === 'object' && 'resultType' in v) return v.result
  return v
}

const TEST_GROUP = 'akdagent-artic-test'

/** 遍历轨道的 Lua 前奏 */
const PRELUDE = `
local proj = SV:getProject()
local ed = SV:getMainEditor()
local out = {}
local nTracks = proj:getNumTracks()
`

async function caps() {
  const code = PRELUDE + `
for i = 1, nTracks do
  local tr = proj:getTrack(i)
  local row = { index = i, name = tostring(tr:getName()) }
  local okSet = pcall(function() ed:setCurrentTrack(tr) end)
  row.setCurrentTrack = okSet
  if ed['getSupportedArticulations'] ~= nil then
    local ok, sup = pcall(function() return ed:getSupportedArticulations() end)
    row.supportedOk = ok
    if ok and type(sup) == 'table' then
      local a = {}
      for _, x in ipairs(sup) do a[#a + 1] = tostring(x) end
      row.supported = a
    end
  end
  out[#out + 1] = row
end
return { tracks = out }
`
  const r = await run(code, true)   // 只切当前轨、不改工程 ⇒ readonly（桥侧护栏：写脚本必须 newUndoRecord）
  const val = unwrap(r)
  if (!val) throw new Error('run_script 无结果：' + JSON.stringify(r).slice(0, 300))
  const tracks = (val.tracks || []).map((t) => ({
    index: t.index, name: t.name, setCurrentTrack: t.setCurrentTrack,
    supportedOk: t.supportedOk, supported: t.supported || [],
  }))
  return { host: HOST, phase: 'caps', tracks }
}

async function matrix() {
  const code = PRELUDE + `
local ARTS = { 'Staccato','Tenuto','Accent','Slur','Tremolo','Breath','Trill Major','Trill Minor','Scoop','Doit','Fall','Harmonics','Portamento','Stopped','Straight','Cup','Stem','Con Sordino','C. Legno','Pizz.','Bridge','Fingerb.' }
proj:newUndoRecord()

local function ser(v)
  if type(v) ~= 'table' then return tostring(v) end
  local p = {}
  for _, x in ipairs(v) do p[#p + 1] = tostring(x) end
  return table.concat(p, '|')
end

local function testGroup(tr)
  local g, ref = nil, nil
  for i = 1, proj:getNumNoteGroupsInLibrary() do
    local c = proj:getNoteGroup(i)
    if c then
      local nm = ''
      pcall(function() nm = c:getName() end)
      if nm == '${TEST_GROUP}' then
        for k = 1, tr:getNumGroups() do
          local r = tr:getGroupReference(k)
          if r then
            local ok, tgt = pcall(function() return r:getTarget() end)
            if ok and tgt == c then g = c ref = r end
          end
        end
      end
    end
  end
  if g ~= nil then return g, ref end
  g = SV:create('NoteGroup')
  g:setName('${TEST_GROUP}')
  pcall(function() g:setScriptData('akdagentTemp', 1) end)
  local n = SV:create('Note', { onset = 0, pitch = 60, lyrics = '' })
  n:setDuration(SV.QUARTER)
  g:addNote(n)
  proj:addNoteGroup(g)
  ref = SV:create('NoteGroupReference')
  ref:setTarget(g)
  ref:setTimeOffset(0)
  pcall(function() tr:addGroupReference(ref) end)
  return g, ref
end

for i = 1, nTracks do
  local tr = proj:getTrack(i)
  local row = { index = i, name = tostring(tr:getName()) }
  pcall(function() ed:setCurrentTrack(tr) end)
  local g, ref = testGroup(tr)
  local n = g:getNote(1)
  row.group = g:getName()
  row.noteCount = g:getNumNotes()

  -- ⭐ 关键：getArticulationState / selectNote 只对「当前组」生效。
  --   实测（2026-09-21）：selection:selectGroup(ref) 只把组选进选区、不切编辑器的当前组（切轨也没用）；
  --   真正管用的是 editor:setCurrentGroup(ref)（成员存在）⇒ 必须调它，否则 selectNote 静默失败、state 全空。
  --   ⚠️ 本段 Lua 在 JS 模板字符串里 ⇒ 注释里不许出现反引号，也不许出现美元花括号插值。
  if ref ~= nil and ed['setCurrentGroup'] ~= nil then
    local okG, eG = pcall(function() ed:setCurrentGroup(ref) end)
    row.setCurrentGroup = okG
    if not okG then row.setCurrentGroupErr = tostring(eG) end
  end
  if ref ~= nil and ed['getSelection'] ~= nil and ed:getSelection()['selectGroup'] ~= nil then
    pcall(function() ed:getSelection():selectGroup(ref) end)
  end
  local curName = ''
  pcall(function() curName = ed:getCurrentGroup():getTarget():getName() end)
  row.curGroup = curName
  row.curGroupIsTest = (curName == '${TEST_GROUP}')

  if ed['getSupportedArticulations'] ~= nil then
    local ok, sup = pcall(function() return ed:getSupportedArticulations() end)
    if ok and type(sup) == 'table' then row.supported = table.concat(sup, '|') end
  end

  local rows = {}
  for _, art in ipairs(ARTS) do
    local rr = { art = art }
    pcall(function() n:setArticulations({}) end)
    local okW = pcall(function() n:setArticulations({ art }) end)
    rr.writeOk = okW
    local okA, a = pcall(function() return n:getAttributes() end)
    if okA and type(a) == 'table' then
      rr.readback = ser(a.articulations)
      rr.fixed = tostring(a.articulationsFixed)
    end
    if ed['getArticulationState'] ~= nil then
      pcall(function() ed:getSelection():clearNotes() end)
      pcall(function() ed:getSelection():selectNote(n) end)
      local okS, st = pcall(function() return ed:getArticulationState() end)
      if okS and type(st) == 'table' then
        rr.incompatible = ser(st.incompatible)
        rr.active = ser(st.active)
        rr.predicted = ser(st.predicted)
        rr.smart = tostring(st.smart)
        rr.slurAvailable = tostring(st.slurAvailable)
      end
    end
    rows[#rows + 1] = rr
  end
  pcall(function() n:setArticulations({}) end)
  row.arts = rows
  out[#out + 1] = row
end
return { tracks = out }
`
  const r = await run(code, false)
  const val = unwrap(r)
  if (!val) throw new Error('run_script 无结果：' + JSON.stringify(r).slice(0, 300))
  return { host: HOST, phase: 'matrix', tracks: val.tracks || [] }
}

async function cleanup() {
  const code = PRELUDE + `
proj:newUndoRecord()
for i = 1, nTracks do
  local tr = proj:getTrack(i)
  local refs = {}
  for k = 1, tr:getNumGroups() do
    local r = tr:getGroupReference(k)
    if r then
      local ok, tgt = pcall(function() return r:getTarget() end)
      if ok and tgt then
        local nm = ''
        pcall(function() nm = tgt:getName() end)
        if nm == '${TEST_GROUP}' then refs[#refs + 1] = k end
      end
    end
  end
  table.sort(refs, function(a, b) return a > b end)
  for _, k in ipairs(refs) do
    local ok = pcall(function() tr:removeGroupReference(k) end)
    out[#out + 1] = 'track' .. i .. ' removeGroupReference(' .. k .. ')=' .. tostring(ok)
  end
end
local libs = {}
for i = 1, proj:getNumNoteGroupsInLibrary() do
  local g = proj:getNoteGroup(i)
  if g then
    local nm = ''
    pcall(function() nm = g:getName() end)
    if nm == '${TEST_GROUP}' then libs[#libs + 1] = i end
  end
end
table.sort(libs, function(a, b) return a > b end)
for _, i in ipairs(libs) do
  local ok = pcall(function() proj:removeNoteGroup(i) end)
  out[#out + 1] = 'removeNoteGroup(' .. i .. ')=' .. tostring(ok)
end
out[#out + 1] = 'AFTER: library=' .. tostring(proj:getNumNoteGroupsInLibrary())
return { log = out }
`
  const r = await run(code, false)
  const val = unwrap(r)
  return { host: HOST, phase: 'cleanup', log: (val && val.log) || [] }
}

function renderCaps(res) {
  const L = []
  L.push('== 逐轨 getSupportedArticulations（host=' + res.host + '）==')
  for (const t of res.tracks) {
    L.push('  track[' + t.index + '] "' + t.name + '"  n=' + t.supported.length + '  setCurrentTrack=' + t.setCurrentTrack)
    L.push('      ' + t.supported.join(' · '))
  }
  return L.join('\n')
}

function renderMatrix(res) {
  const L = []
  for (const t of res.tracks) {
    L.push('')
    L.push('== track[' + t.index + '] "' + t.name + '"  supported=' + (t.supported || '(?)') + ' ==')
    L.push('   art            write  readback         fixed  incompatible')
    for (const a of t.arts || []) {
      L.push('   ' + String(a.art).padEnd(14) + String(a.writeOk).padEnd(7) + String(a.readback || '-').padEnd(17) +
        String(a.fixed || '-').padEnd(7) + (a.incompatible || '-'))
    }
  }
  return L.join('\n')
}

;(async () => {
  try {
    let res
    if (FLAG('--cleanup')) res = await cleanup()
    else if (FLAG('--matrix')) res = await matrix()
    else res = await caps()
    if (OUT) {
      fs.writeFileSync(OUT, JSON.stringify(res, null, 2), 'utf8')
      if (!AS_JSON) console.log('（完整 JSON 已写 ' + OUT + '）')
    }
    if (AS_JSON) { console.log(JSON.stringify(res, null, 2)); process.exit(0) }
    if (res.phase === 'caps') console.log(renderCaps(res))
    else if (res.phase === 'matrix') console.log(renderMatrix(res))
    else console.log(res.log.join('\n'))
    process.exit(0)
  } catch (e) {
    console.error('[FAIL] ' + e.message)
    process.exit(1)
  }
})()
