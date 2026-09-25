--[[ P10 / C3 · rap 模式真机探针（只读 + 可还原）
     用法（宿主里跑，或经 MCP 的 run_script op）：
       - 宿主：把本文件丢进 SV2 的 scripts 目录直接 Run
       - MCP ：node tools/… 或 sv_run_script 传本文件内容
     它做四件事，**不改用户内容**（先用现有音符；改完立刻还原）：
       ① 探四个方法的可用性：getMusicalType / setMusicalType / getRapAccent / setRapAccent
       ② 读当前音符的 musicalType 与 rapAccent（以及与 rap 相关的 rTone / rIntonation）
       ③ 写 "rap" + accent "1"，**回读**确认是否真的落盘
       ④ 还原原值，再回读一次确认还原成功
     依据：skills/sv-scripting/api/Note.md（getMusicalType/setMusicalType/getRapAccent/setRapAccent，
           均 since 1.9.0b2；rapAccent 仅普通话用，五种 1~5）
]]

local proj = SV:getProject()
proj:newUndoRecord()

local out = {}
local okH, hi = pcall(function() return SV:getHostInfo() end)
out.host = okH and tostring(hi and (hi.name or hi.version) or hi) or tostring(hi)

local grp = proj:getTrack(1):getGroupReference(1):getTarget()
out.noteCount = grp:getNumNotes()
if out.noteCount < 1 then
  out.note = "本组没有音符 ⇒ 先随便写一个音符再跑（或让我用 run_script 建临时音符并删除）"
  return out
end

local note = grp:getNote(1)
out.has = {}
for _, m in ipairs({ "getMusicalType", "setMusicalType", "getRapAccent", "setRapAccent" }) do
  local ok = pcall(function() return note[m] end)
  out.has[m] = ok
end

local function read()
  local r = {}
  local okT, t = pcall(function() return note:getMusicalType() end)
  r.type = okT and tostring(t) or ("err:" .. tostring(t))
  local okA, a = pcall(function() return note:getRapAccent() end)
  r.accent = okA and tostring(a) or ("err:" .. tostring(a))
  local okAt, at = pcall(function() return note:getAttributes() end)
  if okAt and type(at) == "table" then
    r.rTone = at.rTone
    r.rIntonation = at.rIntonation
  end
  return r
end

out.read = read()
out.note = { pitch = note:getPitch(), lyric = note:getLyrics() }

local okS1, e1 = pcall(function() note:setMusicalType("rap") end)
out.wrote = { setMusicalType = okS1 and "ok" or ("err:" .. tostring(e1)) }
local okS2, e2 = pcall(function() note:setRapAccent("1") end)
out.wrote.setRapAccent = okS2 and "ok" or ("err:" .. tostring(e2))
out.afterWrite = read()

-- 还原（原值可能是 nil/空串，用 pcall 兜住）
pcall(function()
  if out.read.type ~= nil then note:setMusicalType(out.read.type) end
end)
pcall(function()
  if out.read.accent ~= nil then note:setRapAccent(out.read.accent) end
end)
out.restored = read()

return out
