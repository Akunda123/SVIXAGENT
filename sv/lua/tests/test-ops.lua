-- ============================================================================
-- 桥 op 离线回归测试（跑在真 Lua VM 上，宿主是 fake-sv.lua）
-- ============================================================================
-- 运行：python tools/lua-vm.py sv/lua/tests/test-ops.lua
-- 退出码：0 全过 / 1 有失败
--
-- 设计要点：假宿主**严格遵守真实绑定的 1-based 索引**，所以任何"0 起 vs 1 起"的
-- 下标错误在这里会直接表现为越界报错（而不是悄悄读错对象）。

local T = rawget(_G, "__AKDAGENT_TEST_DIR__") or "."
local Q = 705600000

local pass, fail = 0, 0
local function ok(name, cond, extra)
  if cond then
    pass = pass + 1
    print("  [ok]   " .. name)
  else
    fail = fail + 1
    print("  [FAIL] " .. name .. (extra ~= nil and ("  -> " .. tostring(extra)) or ""))
  end
end

local function section(t) print("\n== " .. t .. " ==") end

-- ---------- 1. 装载假宿主 ----------
local Fake = dofile(T .. "/fake-sv.lua")
local H = Fake.install({
  fileName = "离线测试.svp",
  beatsPerBar = 4,
  tracks = {
    { name = "主唱", groups = { {
        name = "main",
        notes = {
          { pitch = 67, onset = 0,        duration = Q, lyrics = "la" },
          { pitch = 69, onset = Q,        duration = Q, lyrics = "li" },
          { pitch = 71, onset = 2 * Q,    duration = Q, lyrics = "lu" },
        },
      } } },
    { name = "伴奏", groups = {} },
    { name = "伴奏音频", groups = { { name = "audio", instrumental = true } } },
  },
  selected = { { track = 1, group = 1, note = 2 }, { track = 1, group = 1, note = 3 } },
  -- 计算接口（SV2 2.1.1+）的**确定性假实现**，用来复现"长度 = numFrames、未算出的帧为 nil"的真实语义：
  --   frames == 8       ⇒ 第 3..6 帧有值（4 个），其余是 nil 洞     —— 测"逐帧遍历 / 不用 #arr"
  --   frames == 4       ⇒ **全 nil**（= 渲染没算出来）              —— 测 notReady + checks 自查
  --   frames == 3       ⇒ 稠密 3 个值                              —— 测全就绪的路径
  --   其它              ⇒ 空表（连长度都没有，最恶劣的情况）
  computedPitch = function(ref, start, interval, frames)
    if frames == 8 then
      return { [3] = 60.1, [4] = 60.2, [5] = 60.3, [6] = 60.4 }   -- 显式下标造 nil 洞
    elseif frames == 4 then
      return {}                                                   -- 真实宿主此时是"长度 4 内容全 nil"
    elseif frames == 3 then
      return { 60.0, 61.0, 62.0 }
    end
    return {}
  end,
  computedAttributes = function(ref)
    if ref._emptyAttrs then return {} end
    return {
      { accent = "1", rapTone = 2, rapIntonation = nil,
        phonemes = { { symbol = "l", language = "mandarin", activity = 0.5, position = 1 },
                     { symbol = "a", language = "mandarin" } } },
      { accent = "", rapTone = nil, rapIntonation = 3,
        phonemes = { { symbol = "n", language = "english", activity = nil, position = nil } } },
    }
  end,
})

-- ---------- 2. 装卸桥（测试模式） ----------
local bridgePath = T .. "/../AKDAgentBridge.lua"   -- tests/ 的上一级就是 lua/
local chunk, cerr = loadfile(bridgePath)
if not chunk then
  print("[FAIL] 无法加载桥文件：" .. tostring(cerr))
  os.exit(1)
end
chunk()   -- 只定义函数、不调 main()（main 由 SV 宿主调用）
local B = _G.__AKDAGENT__
if B == nil then
  print("[FAIL] 桥未导出内部表（__AKDAGENT_TEST__ 没设上？）")
  os.exit(1)
end

local OPS = B.OPS
section("桥导出自检")
ok("导出 OPS 表", type(OPS) == "table")
ok("导出 dispatch", type(B.dispatch) == "function")
ok("op 清单非空", type(B.OP_NAMES) == "table" and #B.OP_NAMES > 0, B.OP_NAMES and table.concat(B.OP_NAMES, ","))
ok("索引基准 = 1（写死，不探测）", B.CFG.INDEX_BASE == 1)

section("op: ping")
do
  local r = OPS.ping({})
  ok("pong = true", r.pong == true)
  ok("transport = file", r.transport == "file", r.transport)
  ok("indexBase = 1", r.indexBase == 1)
  ok("lua 版本带出", type(r.lua) == "string" and r.lua:find("Lua") ~= nil, r.lua)
  ok("ops 清单含 ping", (function()
    for _, v in ipairs(r.ops or {}) do if v == "ping" then return true end end
    return false
  end)())
end

section("op: get_project_info（1-based 下标的关键回归）")
do
  local r = OPS.get_project_info({})
  ok("numTracks = 3", r.numTracks == 3, r.numTracks)
  -- ⚠️ 与 JS 桥逐字一致的字段名（改名会让客户端读到 nil）
  ok("fileName 字段（JS 同名）", r.fileName == "离线测试.svp", r.fileName)
  ok("durationBlicks 字段（JS 同名）", type(r.durationBlicks) == "number", tostring(r.durationBlicks))
  ok("numGroupsInLibrary 字段（JS 同名）", r.numGroupsInLibrary ~= nil, tostring(r.numGroupsInLibrary))
  ok("tracks[].name/numGroups（JS 同名）", r.tracks and r.tracks[1] and r.tracks[1].name == "主唱" and r.tracks[1].numGroups == 1)
  -- 下标若写成 0 起，假宿主会报「访问超出范围」⇒ call() 返回 nil ⇒ 轨缺失
  ok("tracks 数量 = 3（下标 1 起正确）", type(r.tracks) == "table" and #r.tracks == 3, r.tracks and #r.tracks)
  if type(r.tracks) == "table" and r.tracks[1] then
    ok("轨 1 名称 = 主唱", r.tracks[1].name == "主唱", r.tracks[1].name)
    ok("轨 1 numGroups = 1", r.tracks[1].numGroups == 1, r.tracks[1].numGroups)
    ok("轨 2 名称 = 伴奏", r.tracks[2] and r.tracks[2].name == "伴奏", r.tracks[2] and r.tracks[2].name)
    ok("轨 2 numGroups = 0", r.tracks[2] and r.tracks[2].numGroups == 0)
    local g = r.tracks[1].groups and r.tracks[1].groups[1]
    ok("组 1 名称 = main", g and g.name == "main", g and g.name)
    ok("组 1 numNotes = 3", g and g.numNotes == 3, g and g.numNotes)
  end
end

section("op: get_current_group（与 JS 逐字对齐）")
do
  local r = OPS.get_current_group({})
  ok("current = true", r.current == true, tostring(r.current))
  ok("name = main", r.name == "main", r.name)
  ok("uuid 带出", type(r.uuid) == "string" and #r.uuid > 0, r.uuid)
  ok("noteCount = 3", r.noteCount == 3, tostring(r.noteCount))
  ok("timeOffsetBlicks 字段（JS 同名）", type(r.timeOffsetBlicks) == "number", tostring(r.timeOffsetBlicks))
  ok("pitchOffset 字段（JS 同名）", r.pitchOffset ~= nil, tostring(r.pitchOffset))
  -- 无当前组时的形状
  local saved = H.state.currentGroupRef
  H.state.currentGroupRef = nil
  local r2 = OPS.get_current_group({})
  ok("无当前组 ⇒ {current:false}", r2.current == false and r2.name == nil, tostring(r2.current))
  H.state.currentGroupRef = saved
end

section("op: get_selected_notes（协议字段与单位）")
do
  local r = OPS.get_selected_notes({})
  ok("count = 2", r.count == 2, r.count)
  ok("indexBase = 1（Lua 侧）", r.indexBase == 1)
  local n1 = r.notes and r.notes[1]
  if n1 then
    ok("index 0 起（协议）", n1.index == 0, n1.index)
    ok("pitch = 69", n1.pitch == 69, n1.pitch)
    ok("onsetQuarter = 1（四分音符单位）", n1.onsetQuarter == 1, tostring(n1.onsetQuarter))
    ok("durationQuarter = 1", n1.durationQuarter == 1, tostring(n1.durationQuarter))
    ok("endQuarter = 2", n1.endQuarter == 2, tostring(n1.endQuarter))
    ok("lyrics = li", n1.lyrics == "li", n1.lyrics)
    ok("附加 blick 字段", n1.onsetBlick == 705600000, tostring(n1.onsetBlick))
  end
end

section("dispatch 分发")
do
  local r = B.dispatch("ping", {})
  ok("dispatch(ping) 返回 pong", type(r) == "table" and r.pong == true, type(r))
  local okBad, errBad = pcall(B.dispatch, "does_not_exist", {})
  ok("未知 op 报错", okBad == false, errBad)
end

section("op: transpose_selected_notes（写）")
do
  local before = H.state.undoCount
  local r = OPS.transpose_selected_notes({ semitones = 2 })
  ok("changed = 2", r.changed == 2, tostring(r.changed))
  ok("semitones 回显", r.semitones == 2, tostring(r.semitones))
  ok("音高真的改了（69→71）", H.note(1, 1, 2):getPitch() == 71, H.note(1, 1, 2):getPitch())
  ok("音高真的改了（71→73）", H.note(1, 1, 3):getPitch() == 73, H.note(1, 1, 3):getPitch())
  ok("建了 undo 记录", H.state.undoCount == before + 1, H.state.undoCount)
  -- 还原
  OPS.transpose_selected_notes({ semitones = -2 })
  ok("可反向还原", H.note(1, 1, 2):getPitch() == 69 and H.note(1, 1, 3):getPitch() == 71)
  -- 无选中：changed=0 且**不建 undo**（与 JS 一致：先判断再 newUndoRecord）
  H.selection:clearNotes()
  local u0 = H.state.undoCount
  local r0 = OPS.transpose_selected_notes({ semitones = 5 })
  ok("无选中 ⇒ changed=0", r0.changed == 0 and r0.semitones == 5, tostring(r0.changed))
  ok("无选中 ⇒ 不建 undo", H.state.undoCount == u0, H.state.undoCount)
  local okBad = pcall(OPS.transpose_selected_notes, {})
  ok("缺 semitones ⇒ 报错", okBad == false)
  H.selection:selectNote(H.note(1, 1, 2)); H.selection:selectNote(H.note(1, 1, 3))
end

section("op: set_selected_lyrics（写）")
do
  local r = OPS.set_selected_lyrics({ lyrics = "啊" })
  ok("changed = 2", r.changed == 2, tostring(r.changed))
  ok("lyrics 回显", r.lyrics == "啊", r.lyrics)
  ok("音符 2 歌词已改", H.note(1, 1, 2):getLyrics() == "啊", H.note(1, 1, 2):getLyrics())
  ok("音符 3 歌词已改", H.note(1, 1, 3):getLyrics() == "啊")
  H.selection:clearNotes()
  local r0 = OPS.set_selected_lyrics({ lyrics = "x" })
  ok("无选中 ⇒ changed=0", r0.changed == 0 and r0.lyrics == "x")
  H.selection:selectNote(H.note(1, 1, 2)); H.selection:selectNote(H.note(1, 1, 3))
  -- 还原歌词
  OPS.set_selected_lyrics({ lyrics = "li" })
  OPS.run_script({ code = 'SV:getProject():newUndoRecord() local g = SV:getMainEditor():getCurrentGroup():getTarget() g:getNote(3):setLyrics("lu")' })
end

section("op: apply_lyrics（对位切分）")
do
  -- 选中 2 个音符 + 5 个词 ⇒ tokensUsed=2，多余忽略
  local r = OPS.apply_lyrics({ lyrics = "do re mi fa sol" })
  ok("count = 2（选中优先）", r.count == 2, tostring(r.count))
  ok("tokensTotal = 5", r.tokensTotal == 5, tostring(r.tokensTotal))
  ok("tokensUsed = 2", r.tokensUsed == 2, tostring(r.tokensUsed))
  ok("changed = 2", r.changed == 2)
  ok("音符 2 得到 do", H.note(1, 1, 2):getLyrics() == "do", H.note(1, 1, 2):getLyrics())
  ok("音符 3 得到 re", H.note(1, 1, 3):getLyrics() == "re", H.note(1, 1, 3):getLyrics())

  -- 无选中 ⇒ 回退当前组（3 个音符），中文逐字：**必须 3 个字，不能是 9 个字节**
  H.selection:clearNotes()
  local r2 = OPS.apply_lyrics({ lyrics = "我爱你" })
  ok("回退当前组 ⇒ count = 3", r2.count == 3, tostring(r2.count))
  ok("中文按字切分（3 个 token，不是 9 字节）", r2.tokensTotal == 3, tostring(r2.tokensTotal))
  ok("音符 1 = 我", H.note(1, 1, 1):getLyrics() == "我", H.note(1, 1, 1):getLyrics())
  ok("音符 2 = 爱", H.note(1, 1, 2):getLyrics() == "爱", H.note(1, 1, 2):getLyrics())
  ok("音符 3 = 你", H.note(1, 1, 3):getLyrics() == "你", H.note(1, 1, 3):getLyrics())

  -- 音符多于字 ⇒ 余下填 "-"
  local r3 = OPS.apply_lyrics({ lyrics = "好" })
  ok("1 字 3 音符 ⇒ tokensTotal = 1", r3.tokensTotal == 1, tostring(r3.tokensTotal))
  ok("changed = 1", r3.changed == 1, tostring(r3.changed))
  ok("音符 1 = 好", H.note(1, 1, 1):getLyrics() == "好")
  ok("音符 2 = -（占位）", H.note(1, 1, 2):getLyrics() == "-", H.note(1, 1, 2):getLyrics())
  ok("音符 3 = -（占位）", H.note(1, 1, 3):getLyrics() == "-")

  -- 标点也应被当作分隔符（英文句）
  local r4 = OPS.apply_lyrics({ lyrics = "la, li; lu" })
  ok("标点分隔 ⇒ 3 个 token", r4.tokensTotal == 3, tostring(r4.tokensTotal))
  ok("音符 1 = la", H.note(1, 1, 1):getLyrics() == "la")

  -- 回归：**含「标点后继字节」的汉字**不得被当分隔符。旧实现拿中文标点写 Lua 字符类，
  -- 而 `[...]` 是逐字节匹配 ⇒ `，`= EF BC 8C 把 0x8C 混进集合 ⇒ 歌=E6 AD 8C 命中判成分隔符
  -- ⇒ 整行按**字节** gmatch 切碎：真机上「夜空之下轻声歌唱」只切出 2 个 token，第一个还断在半个字上。
  -- ⚠️ 下面几条会把歌词写进**共用的** 3 个音符（后面的 get_note_time 仍在断言 la/li/lu）⇒ 测完原样复原
  local savedLyr = { H.note(1, 1, 1):getLyrics(), H.note(1, 1, 2):getLyrics(), H.note(1, 1, 3):getLyrics() }
  local r5 = OPS.apply_lyrics({ lyrics = "夜空之下轻声歌唱" })
  ok("8 字中文（含「歌」）⇒ 8 个 token", r5.tokensTotal == 8, tostring(r5.tokensTotal))
  ok("逐字落到音符：夜/空/之", H.note(1, 1, 1):getLyrics() == "夜"
     and H.note(1, 1, 2):getLyrics() == "空" and H.note(1, 1, 3):getLyrics() == "之")
  local r6 = OPS.apply_lyrics({ lyrics = "一星雪" })
  ok("三个触发字节样本（一 E4B880 / 星 E6989F / 雪 E99BAA）⇒ 3 个 token",
     r6.tokensTotal == 3, tostring(r6.tokensTotal))
  local r7 = OPS.apply_lyrics({ lyrics = "夜，空" })
  ok("全角逗号仍作分隔符 ⇒ 2 个 token", r7.tokensTotal == 2, tostring(r7.tokensTotal))
  local r8 = OPS.apply_lyrics({ lyrics = "a·b" })
  ok("「·」不在判定集 ⇒ 与 JS 同为逐字：3 个 token", r8.tokensTotal == 3, tostring(r8.tokensTotal))
  for i = 1, 3 do H.note(1, 1, i):setLyrics(savedLyr[i]) end
  H.selection:selectNote(H.note(1, 1, 2)); H.selection:selectNote(H.note(1, 1, 3))
end

section("op: playback")
do
  local r = OPS.playback({ action = "play" })
  ok("play ⇒ status = playing", r.status == "playing", tostring(r.status))
  ok("pause ⇒ status = paused", OPS.playback({ action = "pause" }).status == "paused")
  ok("stop ⇒ status = stopped", OPS.playback({ action = "stop" }).status == "stopped")
  ok("toggle（stopped）⇒ playing", OPS.playback({ action = "toggle" }).status == "playing")
  ok("toggle（playing）⇒ paused", OPS.playback({ action = "toggle" }).status == "paused")
  local r5 = OPS.playback({ action = "seek", position = 12.5 })
  ok("seek ⇒ 播放头 = 12.5", H.state.playheadSec == 12.5, tostring(H.state.playheadSec))
  ok("seek 也返回 status", r5.status ~= nil)
  local okBad = pcall(OPS.playback, { action = "nope" })
  ok("未知 action ⇒ 报错", okBad == false)
  local okBad2 = pcall(OPS.playback, { action = "seek" })
  ok("seek 缺 position ⇒ 报错", okBad2 == false)
  OPS.playback({ action = "stop" })
end

section("op: get_measure_info（小节号 1 起，不是 blick）")
do
  local r = OPS.get_measure_info({ measure = 2 })
  ok("found = true", r.found == true, tostring(r.found))
  ok("positionBlick = 4 拍（4/4、BPM120）", r.positionBlick == 4 * Q, tostring(r.positionBlick))
  ok("numerator = 4", r.numerator == 4, tostring(r.numerator))
  ok("denominator = 4", r.denominator == 4, tostring(r.denominator))
  -- BPM120：一个四分音符 = 0.5s ⇒ 第 2 小节起点 = 4 拍 = 2.0s
  ok("positionSeconds = 2.0（BPM120 换算）", math.abs((r.positionSeconds or -1) - 2.0) < 1e-9, tostring(r.positionSeconds))
  ok("measure 回显", r.measure == 2)
  local okBad = pcall(OPS.get_measure_info, { measure = 0 })
  ok("measure < 1 ⇒ 报错", okBad == false)
  -- 字段/方法两种暴露方式都要能读（prop 垫片）
  local fakeMark = { positionBlick = 123, numerator = 3, denominator = 8 }
  ok("prop 兼容字段式（JS 属性风格）", fakeMark.positionBlick == 123)
end

section("op: get_note_time（小节内第 N 个音符，0 起）")
do
  -- 当前组 = 轨1/组1，音符 onset = 0, 1 拍, 2 拍；第 2 小节起点 = 4 拍 ⇒ 都不在第 2 小节
  local r0 = OPS.get_note_time({ measure = 2, noteIndex = 0 })
  ok("第 2 小节内无音符 ⇒ found=false", r0.found == false, tostring(r0.found))
  local r = OPS.get_note_time({ measure = 1, noteIndex = 1 })
  ok("第 1 小节第 2 个音符 ⇒ found=true", r.found == true, tostring(r.found))
  ok("onsetBlick = 1 拍", r.onsetBlick == Q, tostring(r.onsetBlick))
  ok("onsetQuarter = 1", r.onsetQuarter == 1, tostring(r.onsetQuarter))
  ok("onsetSeconds = 0.5", math.abs((r.onsetSeconds or -1) - 0.5) < 1e-9, tostring(r.onsetSeconds))
  ok("pitch = 69", r.pitch == 69, tostring(r.pitch))
  ok("durationQuarter = 1", r.durationQuarter == 1)
  ok("lyrics = li", r.lyrics == "li", r.lyrics)
  local okBad = pcall(OPS.get_note_time, { measure = 1 })
  ok("缺 noteIndex ⇒ 报错", okBad == false)
  local okBad2 = pcall(OPS.get_note_time, { measure = 9999, noteIndex = 0 })
  ok("小节越界 ⇒ 报错（假宿主按有界工程；真机行为待验）", okBad2 == false)
end

section("op: get_melody_notes（当前组旋律）")
do
  local r = OPS.get_melody_notes({})
  ok("current = true", r.current == true)
  ok("groupName = main", r.groupName == "main", r.groupName)
  ok("noteCount = 3", r.noteCount == 3, tostring(r.noteCount))
  ok("notes 数量 = 3", #r.notes == 3, #r.notes)
  ok("index 0 起", r.notes[1].index == 0 and r.notes[3].index == 2)
  ok("pitch 序列 67/69/71", r.notes[1].pitch == 67 and r.notes[2].pitch == 69 and r.notes[3].pitch == 71)
  ok("onsetBlicks/durationBlicks 字段（JS 同名）", r.notes[2].onsetBlicks == Q and r.notes[2].durationBlicks == Q)
  ok("endBlicks = 2 拍", r.notes[2].endBlicks == 2 * Q, tostring(r.notes[2].endBlicks))
  ok("onsetQuarter = 1", r.notes[2].onsetQuarter == 1)
  ok("onsetSeconds = 0.5", math.abs(r.notes[2].onsetSeconds - 0.5) < 1e-9, tostring(r.notes[2].onsetSeconds))
  ok("lyrics 带出", r.notes[1].lyrics ~= nil, tostring(r.notes[1].lyrics))
  local r2 = OPS.get_melody_notes({ maxNotes = 2 })
  ok("maxNotes = 2 生效", #r2.notes == 2 and r2.noteCount == 3, #r2.notes)
  local saved = H.state.currentGroupRef
  H.state.currentGroupRef = nil
  local r3 = OPS.get_melody_notes({})
  ok("无当前组 ⇒ {current:false, notes:{}}", r3.current == false and #r3.notes == 0)
  H.state.currentGroupRef = saved
end

section("op: create_harmony_group（写：建组 + 引用）")
do
  local libBefore = #H.state.library
  local r = OPS.create_harmony_group({
    groupName = "Harmony",
    notes = {
      { pitch = 64, onsetBlicks = 0, durationBlicks = Q, lyrics = "do" },
      { pitch = 67, onsetBlicks = Q, durationBlicks = Q },
    },
  })
  ok("ok = true", r.ok == true, tostring(r.ok))
  ok("groupName = Harmony", r.groupName == "Harmony", r.groupName)
  ok("noteCount = 2", r.noteCount == 2, tostring(r.noteCount))
  ok("组进了 NoteGroup 库（+1）", #H.state.library == libBefore + 1, #H.state.library)
  ok("**未传 suggestedIndex**（避免 0/1 起歧义）", (function()
    for _, c in ipairs(H.calls) do if c == "proj.addNoteGroup(noIdx)" then return true end end
    return false
  end)())
  ok("引用挂到了当前轨", H.track(1):getNumGroups() == 2, H.track(1):getNumGroups())
  local newRef = H.track(1):getGroupReference(2)
  ok("引用的 target 是新组", newRef:getTarget():getName() == "Harmony", newRef:getTarget():getName())
  ok("音符带上了歌词", newRef:getTarget():getNote(1):getLyrics() == "do", newRef:getTarget():getNote(1):getLyrics())
  ok("音符时值正确", newRef:getTarget():getNote(2):getOnset() == Q and newRef:getTarget():getNote(2):getDuration() == Q)
  ok("音高正确", newRef:getTarget():getNote(1):getPitch() == 64)
  -- 载荷校验：缺 durationBlicks ⇒ 报错且**不往库里塞组**
  local libNow = #H.state.library
  local okBad = pcall(OPS.create_harmony_group, { notes = { { pitch = 60, onsetBlicks = 0 } } })
  ok("载荷不全 ⇒ 报错", okBad == false)
  ok("报错时未污染库（先校验后写）", #H.state.library == libNow, #H.state.library)
  local okEmpty = pcall(OPS.create_harmony_group, { notes = {} })
  ok("空 notes ⇒ 报错", okEmpty == false)
end

section("op: fill_track_lyrics（写：按轨/组填词）")
do
  -- 未指定 track ⇒ 用当前轨（轨1、组1），3 个音符
  local r = OPS.fill_track_lyrics({ lyrics = "a b c" })
  ok("ok = true", r.ok == true)
  ok("track 名 = 主唱", r.track == "主唱", tostring(r.track))
  ok("group 名 = main", r.group == "main", tostring(r.group))
  ok("notes = 3", r.notes == 3, tostring(r.notes))
  ok("lyricTotal = 3", r.lyricTotal == 3, tostring(r.lyricTotal))
  ok("filled = 3", r.filled == 3, tostring(r.filled))
  ok("音符 1 歌词 = a", H.note(1, 1, 1):getLyrics() == "a", H.note(1, 1, 1):getLyrics())
  ok("音符 3 歌词 = c", H.note(1, 1, 3):getLyrics() == "c")

  -- 按**0 起**索引指定轨（轨 2 = 索引 1）——轨 2 无组 ⇒ 报错，正好验证索引换算走了正确的轨
  local okNoGroup, errNoGroup = pcall(OPS.fill_track_lyrics, { lyrics = "x", track = 1 })
  ok("track=1（0 起 ⇒ 第 2 轨）无组 ⇒ 报错", okNoGroup == false, errNoGroup)
  local okName = pcall(OPS.fill_track_lyrics, { lyrics = "x", track = "不存在" })
  ok("按名找不到轨 ⇒ 报错", okName == false)

  -- 中文逐字 + 余下填 "-"：先给 3 个音符的组写 1 个字
  local r2 = OPS.fill_track_lyrics({ lyrics = "好" })
  ok("1 字 ⇒ lyricTotal = 1", r2.lyricTotal == 1, tostring(r2.lyricTotal))
  ok("filled = 1", r2.filled == 1, tostring(r2.filled))
  ok("余下填 -", H.note(1, 1, 2):getLyrics() == "-" and H.note(1, 1, 3):getLyrics() == "-")
  local r3 = OPS.fill_track_lyrics({ lyrics = "我爱你" })
  ok("中文 3 字（不是 9 字节）", r3.lyricTotal == 3, tostring(r3.lyricTotal))
  ok("歌词逐字对上", H.note(1, 1, 1):getLyrics() == "我" and H.note(1, 1, 3):getLyrics() == "你")

  -- 同一字节陷阱的第二条路：真机就是 fill_track_lyrics 把整串塞进第 1 个音（还断在半个字上）
  local r3b = OPS.fill_track_lyrics({ lyrics = "夜空之下轻声歌唱" })
  ok("fill：8 字中文 ⇒ lyricTotal = 8（旧实现为 2）", r3b.lyricTotal == 8, tostring(r3b.lyricTotal))
  ok("fill：逐字落到音符：夜/空/之", H.note(1, 1, 1):getLyrics() == "夜"
     and H.note(1, 1, 2):getLyrics() == "空" and H.note(1, 1, 3):getLyrics() == "之")

  -- 返回值必须能反映"**真正写入**"（真机坑：早前 filled 计数在 nil 判断之外 ⇒ 虚报）
  ok("返回值含 uniqueNotes / duplicateNotes / written / failed / order",
     r3.uniqueNotes ~= nil and r3.duplicateNotes ~= nil and r3.written ~= nil
     and r3.failed ~= nil and type(r3.order) == "string", r3)
  ok("uniqueNotes = 3（无重复返回）", r3.uniqueNotes == 3, tostring(r3.uniqueNotes))
  ok("duplicateNotes = 0", r3.duplicateNotes == 0, tostring(r3.duplicateNotes))
  ok("written = 3（每个音符都成功写了）", r3.written == 3, tostring(r3.written))
  ok("failed = 0", r3.failed == 0, tostring(r3.failed))
  ok("filled = 真正写入的非 '-' 音符数 = 3", r3.filled == 3, tostring(r3.filled))
  -- 1 个 token、3 个音符 ⇒ 后两个写 "-" ⇒ filled 只数真实音节
  local r4 = OPS.fill_track_lyrics({ lyrics = "独" })
  ok("token 少于音符：filled = 1 / written = 3（含写 '-' 的）",
     r4.filled == 1 and r4.written == 3, tostring(r4.filled) .. "/" .. tostring(r4.written))
  OPS.fill_track_lyrics({ lyrics = "a b c" })   -- 复原 3 个音节，别污染后面的重音/ACC 断言

  -- 空组回归（真机 bug 的离线护栏）：把**排头**的组清空后，op 必须**跳过它、去挑别的有音符的组**。
  -- 真机上排头就是"空的轨道主组"，早前实现会挑中它 ⇒ 明明轨上有音符却报含糊的
  -- "track has no fillable notes"（用户工程里主组通常就是空的，见进度 §9.5）。
  -- 本 run 里轨上还有前面用例建的「Harmony」(2 音符) ⇒ 正好构成"空组在前、有音符组在后"的场景。
  local gg = H.target(1, 1)
  local savedNotes = { gg:getNote(1), gg:getNote(2), gg:getNote(3) }
  for i = 3, 1, -1 do gg:removeNote(i) end
  ok("清空后：组 1 为 0 音符", gg:getNumNotes() == 0, gg:getNumNotes())
  local resEmpty = OPS.fill_track_lyrics({ lyrics = "x" })
  ok("排头组为空 ⇒ **跳过它**，挑到别的有音符的组",
     resEmpty.group ~= "main" and resEmpty.notes > 0, resEmpty.group .. "/" .. tostring(resEmpty.notes))
  ok("跳过空组后填词仍成功（filled ≥ 1）", resEmpty.filled >= 1, resEmpty.filled)
  for i = 1, #savedNotes do gg:addNote(savedNotes[i]) end
  local r5 = OPS.fill_track_lyrics({ lyrics = "a b c" })
  ok("音符补回后填词恢复（filled = 3，且回到排头组）", r5.filled == 3 and r5.group == "main",
     tostring(r5.filled) .. "/" .. tostring(r5.group))
end

section("op: write_chords（和弦展开 + 写入）")
do
  -- 轨 2（0 起索引 1）没有组 ⇒ 是"第一个非 instrumental 轨"？不：按 JS 规则，
  -- 没有任何组的轨 isAud=false ⇒ 会被选中。这里显式指定 trackIndex 更可控。
  local before = #H.state.library
  local r = OPS.write_chords({
    trackIndex = 0,
    groupName = "Chords",
    pattern = "block",
    chordSegs = {
      { name = "C",  startBlick = 0, durationBlick = 4 * Q },
      { name = "Am", startBlick = 4 * Q, durationBlick = 4 * Q },
    },
  })
  ok("ok = true", r.ok == true, tostring(r.ok))
  ok("trackIndex = 0", r.trackIndex == 0, tostring(r.trackIndex))
  ok("groupName = Chords", r.groupName == "Chords", r.groupName)
  ok("noteCount = 6（2 个三和弦 × 3 音）", r.noteCount == 6, tostring(r.noteCount))
  ok("minPitch/maxPitch 有值", type(r.minPitch) == "number" and type(r.maxPitch) == "number",
     tostring(r.minPitch) .. "/" .. tostring(r.maxPitch))
  ok("组进了库", #H.state.library == before + 1, #H.state.library)
  ok("引用挂上轨 1（原有 2 个 ⇒ 现在 3 个）", H.track(1):getNumGroups() == 3, H.track(1):getNumGroups())

  -- C 和弦（octaveShift 默认 -12 ⇒ ref = 48）应是 48/52/55
  local lastRef = H.track(1):getGroupReference(3)
  local g = lastRef:getTarget()
  local p1 = g:getNote(1):getPitch()
  ok("C 和弦最低音 = 48（C3）", p1 == 48, tostring(p1))
  ok("和弦排列是 48/52/55", g:getNote(2):getPitch() == 52 and g:getNote(3):getPitch() == 55,
     g:getNote(2):getPitch() .. "/" .. g:getNote(3):getPitch())
  ok("时值 = 4 拍（block）", g:getNote(1):getDuration() == 4 * Q, tostring(g:getNote(1):getDuration()))
  ok("ref 的 timeOffset = 0（位置靠 onset 表达）", lastRef:getTimeOffset() == 0, tostring(lastRef:getTimeOffset()))

  -- 幂等：同名再写一次，应先把旧的摘掉 ⇒ 轨上仍只有 1 个 Chords
  local r2 = OPS.write_chords({ trackIndex = 0, groupName = "Chords",
    chordSegs = { { name = "F", startBlick = 0, durationBlick = 2 * Q } } })
  local chCount = 0
  for i = 1, H.track(1):getNumGroups() do
    if H.track(1):getGroupReference(i):getTarget():getName() == "Chords" then chCount = chCount + 1 end
  end
  ok("幂等：同名组只留 1 个", chCount == 1, chCount)
  ok("第二次写入 3 个音（F 三和弦）", r2.noteCount == 3, tostring(r2.noteCount))
  ok("幂等时确实调用了 removeGroupReference", (function()
    for _, c in ipairs(H.calls) do if c == "track.removeGroupReference" then return true end end
    return false
  end)())

  -- broken 琶音：4 拍 3 音 ⇒ subQ = 1
  local r3 = OPS.write_chords({ trackIndex = 0, groupName = "Arp", pattern = "broken",
    chordSegs = { { name = "C", startBlick = 0, durationBlick = 4 * Q } } })
  local arpRef = nil
  for i = 1, H.track(1):getNumGroups() do
    if H.track(1):getGroupReference(i):getTarget():getName() == "Arp" then arpRef = H.track(1):getGroupReference(i) end
  end
  ok("broken 组已建", arpRef ~= nil)
  if arpRef then
    local ag = arpRef:getTarget()
    ok("琶音 3 个音、各 1 拍", ag:getNumNotes() == 3 and ag:getNote(1):getDuration() == Q and ag:getNote(3):getDuration() == Q)
    ok("琶音 onset 递增 0/1/2 拍", ag:getNote(1):getOnset() == 0 and ag:getNote(2):getOnset() == Q and ag:getNote(3):getOnset() == 2 * Q)
  end

  -- 对象式音符 + 力度/技法（IX 属性走 setAttributes 分支）
  local r4 = OPS.write_chords({ trackIndex = 0, groupName = "IX",
    notes = { { pitch = 60, onsetBlicks = 0, durationBlicks = Q, lyrics = "do", dynamic = 0.8,
                articulations = { "accent" } } } })
  ok("对象式音符可写", r4.noteCount == 1, tostring(r4.noteCount))
  ok("minPitch = maxPitch = 60", r4.minPitch == 60 and r4.maxPitch == 60)

  -- 显式 trackIndex 越界 ⇒ 报错
  local okBad = pcall(OPS.write_chords, { trackIndex = 9, notes = { { pitch = 60, onsetBlicks = 0, durationBlicks = Q } } })
  ok("trackIndex 越界 ⇒ 报错", okBad == false)
  local okBad2 = pcall(OPS.write_chords, { trackIndex = 0 })
  ok("既无 notes 也无 chordSegs ⇒ 报错", okBad2 == false)
end

section("和弦解析算法（纯函数）")
do
  local B = _G.__AKDAGENT__
  -- ALG 不在导出表里 ⇒ 通过 op 行为间接验证；这里直接测 write_chords 展开结果已覆盖。
  -- 补充：非法和弦名应被跳过（不报错、不产生音符）
  local r = OPS.write_chords({ trackIndex = 0, groupName = "Bad", chordSegs = {
    { name = "H", startBlick = 0, durationBlick = Q },        -- 非法根音
    { name = "C7", startBlick = 0, durationBlick = Q },       -- 合法：四音
  } })
  ok("非法和弦名被跳过、合法照写（4 音）", r.noteCount == 4, tostring(r.noteCount))
  ok("无有效和弦 ⇒ 报错", pcall(OPS.write_chords, { trackIndex = 0, groupName = "None",
    chordSegs = { { name = "H", startBlick = 0, durationBlick = Q } } }) == false)
end

section("op: align_audio（音频轨用绝对 onset 对齐）")
do
  -- BPM120 ⇒ 1 拍 = 0.5s = Q blick；getBlickFromSeconds(0.5) = Q（假宿主按单速换算）
  local r = OPS.align_audio({ firstBeatSec = 0.5, anchor = "measure", measure = 2 })
  ok("ok = true", r.ok == true, tostring(r.ok))
  ok("anchor = measure", r.anchor == "measure", tostring(r.anchor))
  ok("measureStartBlick = 4 拍", r.measureStartBlick == 4 * Q, tostring(r.measureStartBlick))
  ok("find 到音频轨（轨 3 ⇒ 0 起索引 2）", r.trackIndex == 2, tostring(r.trackIndex))
  ok("firstBeatBlick = 1 拍", r.firstBeatBlick == Q, tostring(r.firstBeatBlick))
  -- 绝对 onset = 锚点(4 拍) - 第一拍在音频内的位置(1 拍) = 3 拍
  ok("absoluteOnsetBlicks = 3 拍", r.absoluteOnsetBlicks == 3 * Q, tostring(r.absoluteOnsetBlicks))
  ok("useOnset = true（假宿主有 setTimeRange）", r.useOnset == true)
  ok("真的调了 setTimeRange", (function()
    for _, c in ipairs(H.calls) do if c == "ref.setTimeRange" then return true end end
    return false
  end)())
  local aref = H.track(3):getGroupReference(1)
  ok("音频轨 onset 已设为 3 拍", aref:getOnset() == 3 * Q, tostring(aref:getOnset()))
  ok("time offset 恒 0（位置靠 onset 表达）", aref:getTimeOffset() == 3 * Q) -- 假宿主里 offset=onset（同一字段），仅作占位
  ok("durationBlicks 有值", type(r.durationBlicks) == "number")

  -- 指定 audioTrackIndex（0 起）：指错 ⇒ 报错
  local okBadIdx = pcall(OPS.align_audio, { firstBeatSec = 0.5, audioTrackIndex = 0 })
  ok("audioTrackIndex 指向非音频轨 ⇒ 报错", okBadIdx == false)

  -- anchor='note'：当前组第一个音符 onset = 0 ⇒ 目标 blick = 0 - intro
  local r2 = OPS.align_audio({ firstBeatSec = 0, anchor = "note", introBeats = 2, bpm = 120 })
  ok("anchor = note", r2.anchor == "note", tostring(r2.anchor))
  ok("introBlick = 2 拍", r2.introBlick == 2 * Q, tostring(r2.introBlick))
  ok("锚点 = 音符 onset - 前奏 = -2 拍", r2.anchorNoteOnsetBlick - r2.introBlick == -2 * Q,
     tostring(r2.anchorNoteOnsetBlick) .. "-" .. tostring(r2.introBlick))

  -- bpm 参数 ⇒ 顺带打一个 tempo 标
  local marksBefore = #H.state.tempoMarks
  OPS.align_audio({ firstBeatSec = 0.5, anchor = "measure", measure = 1, bpm = 128 })
  ok("给 bpm ⇒ 打了 tempo 标", #H.state.tempoMarks == marksBefore + 1, #H.state.tempoMarks)
  ok("缺 firstBeatSec ⇒ 报错", pcall(OPS.align_audio, {}) == false)
  ok("measure < 1 ⇒ 报错", pcall(OPS.align_audio, { firstBeatSec = 0, measure = 0 }) == false)
end

section("op: apply_tempo（浮动 BPM 逐段打标）")
do
  H.state.tempoMarks = {}
  local r = OPS.apply_tempo({ tempoMarks = {
    { blick = 0, bpm = 120 },
    { blick = 4 * Q, bpm = 121.5 },
    { seconds = 4.0, bpm = 122 },     -- 秒 → blick（BPM120 ⇒ 4s = 8 拍）
  } })
  ok("ok = true", r.ok == true)
  ok("count = 3", r.count == 3, tostring(r.count))
  ok("first.bpm = 120", r.first.bpm == 120 and r.first.blick == 0)
  ok("last.bpm = 122", r.last.bpm == 122, tostring(r.last.bpm))
  ok("seconds 换算成 blick（8 拍）", r.applied[3].blick == 8 * Q, tostring(r.applied[3].blick))
  ok("宿主侧确实收到 3 个标", #H.state.tempoMarks == 3, #H.state.tempoMarks)

  -- clearExisting：先清后写
  local r2 = OPS.apply_tempo({ tempoMarks = { { blick = 0, bpm = 100 } }, clearExisting = true })
  ok("clearedExisting = 3", r2.clearedExisting == 3, tostring(r2.clearedExisting))
  ok("清后只剩 1 个标", #H.state.tempoMarks == 1, #H.state.tempoMarks)
  ok("新标 bpm = 100", H.state.tempoMarks[1].bpm == 100)

  -- 非法输入
  ok("空 tempoMarks ⇒ 报错", pcall(OPS.apply_tempo, { tempoMarks = {} }) == false)
  ok("缺 blick/seconds ⇒ 报错", pcall(OPS.apply_tempo, { tempoMarks = { { bpm = 120 } } }) == false)
  ok("bpm <= 0 ⇒ 报错", pcall(OPS.apply_tempo, { tempoMarks = { { blick = 0, bpm = 0 } } }) == false)
end

section("重音检测层 ACC（07 §1 移植）")
do
  local ACC = B.ACC
  ok("ACC 已导出", type(ACC) == "table")
  if type(ACC) == "table" then
    -- 歌词权重：虚词 0 / 实词 1
    ok("虚词「的」= 0", ACC.lyricWeight("的") == 0, tostring(ACC.lyricWeight("的")))
    ok("实词「爱」= 1", ACC.lyricWeight("爱") == 1)
    ok("「的-爱」取最大 = 1", ACC.lyricWeight("的-爱") == 1, tostring(ACC.lyricWeight("的-爱")))
    ok("英文虚词 the = 0", ACC.lyricWeight("the") == 0)
    ok("英文实词 love = 1", ACC.lyricWeight("love") == 1)
    ok("the love = 1", ACC.lyricWeight("the love") == 1)
    ok("空歌词 = 0", ACC.lyricWeight("") == 0 and ACC.lyricWeight(nil) == 0)
    -- 回归：虚词表里含「标点后继字节」的字曾被切碎 ⇒ 匹配不上表 ⇒ 误判成实词（重音打分跟着偏）。
    -- 着 = E7 9D 80 撞 。/、 的 0x80；和 = E5 92 8C 撞 ，的 0x8C。
    ok("虚词「着」= 0（旧实现误判为 1）", ACC.lyricWeight("着") == 0, tostring(ACC.lyricWeight("着")))
    ok("虚词「和」= 0（旧实现误判为 1）", ACC.lyricWeight("和") == 0, tostring(ACC.lyricWeight("和")))
    ok("实词「歌」= 1（含 8C 字节，不得被切碎）", ACC.lyricWeight("歌") == 1, tostring(ACC.lyricWeight("歌")))

    -- 拍号：4/4 与 3/4
    local ta = H.project:getTimeAxis()
    ok("4/4 工程 ⇒ beatsPerBar = 4", ACC.beatsPerBar(ta, 0) == 4, tostring(ACC.beatsPerBar(ta, 0)))

    -- 单元分组：'-' 短音并入前一单元（倚音），长音独立（转音）
    -- ⚠️ 用**合成音符对象**测，不再 install 第二个假宿主 —— 那会覆盖全局 SV，
    --    把后面 run_script 等依赖主宿主的测试一起带偏（上一版就踩了这个坑）。
    --    ACC 只通过 call() 读写音符，任何带这些方法的表都能当音符用。
    local function fakeNote(pitch, onset, dur, lyr)
      local n = {}
      function n:getOnset() return onset end
      function n:getDuration() return dur end
      function n:getPitch() return pitch end
      function n:getLyrics() return lyr end
      return n
    end
    local notes2 = {
      fakeNote(60, 0,         2 * Q,     "a"),
      fakeNote(62, 2 * Q,     Q / 2,     "-"),    -- 0.5 拍 ≤ 2×0.5 ⇒ 倚音，并入
      fakeNote(64, 2.5 * Q,   1.5 * Q,   "-"),    -- 1.5 拍 > 2×0.5 ⇒ 转音，独立
      fakeNote(65, 4 * Q,     Q,         "b"),
    }
    local units = ACC.groupUnits(notes2, 0.5)
    ok("单元数 = 3（短 '-' 并入、长 '-' 独立）", #units == 3, tostring(#units))
    ok("单元 1 含 2 个音符且标记 grace", units[1] and #units[1].notes == 2 and units[1].grace == true,
       units[1] and (#units[1].notes .. "/" .. tostring(units[1].grace)))
    ok("单元 1 的 endB 延伸到位（2.5 拍）", units[1] and units[1].endB == 2.5 * Q, units[1] and tostring(units[1].endB))
    ok("单元 2 是独立转音（1 个音符）", units[2] and #units[2].notes == 1, units[2] and tostring(#units[2].notes))
    ok("单元 index 为 0 起", units[1] and units[1].index == 0 and units[3] and units[3].index == 3)

    -- 边界：恰好等于 mainBeats × graceRatio 时**并入**（与 JS 的 <= 一致）
    local edge = ACC.groupUnits({
      fakeNote(60, 0, 2 * Q, "a"),
      fakeNote(62, 2 * Q, Q, "-"),      -- 1 拍 == 2×0.5 ⇒ 并入
    }, 0.5)
    ok("边界值：恰好等于阈值 ⇒ 并入（与 JS 同）", #edge == 1 and #edge[1].notes == 2, tostring(#edge))

    -- 打分：首拍 + 长音 + 实词 应显著高于 弱拍 + 短音 + 虚词
    local strong = { start = 0, endB = 2 * Q, onset = 0, pitch = 67, notes = { fakeNote(67, 0, 2 * Q, "爱") }, index = 0 }
    local weak   = { start = Q, endB = Q + Q / 2, onset = Q, pitch = 68, notes = { fakeNote(68, Q, Q / 2, "的") }, index = 1 }
    local sStrong = ACC.score(strong, 4, nil, {})
    local sWeak   = ACC.score(weak, 4, nil, {})
    ok("首拍长音实词得分高于弱拍短音虚词（" .. tostring(sStrong) .. " > " .. tostring(sWeak) .. "）", sStrong > sWeak)
    -- 大跳加成：从前音 60 跳到 67（≥7 ⇒ +2）
    local prev = { start = 0, endB = Q, onset = 0, pitch = 60, notes = { fakeNote(60, 0, Q, "a") }, index = 0 }
    local jumpUnit = { start = Q, endB = Q + Q / 2, onset = Q, pitch = 67, notes = { fakeNote(67, Q, Q / 2, "的") }, index = 1 }
    local sNoJump = ACC.score(jumpUnit, 4, nil, {})
    local sJump = ACC.score(jumpUnit, 4, prev, {})
    ok("大跳 ≥7 得 +2", sJump - sNoJump == 2, tostring(sJump - sNoJump))

    -- Top-N 比例选取：10 个单元取 40% ⇒ 4 个
    local many = {}
    for i = 1, 10 do
      many[i] = {
        start = (i - 1) * Q, endB = (i - 1) * Q + Q, onset = (i - 1) * Q,
        pitch = 60 + i, notes = { fakeNote(60 + i, (i - 1) * Q, Q, "la") }, index = i - 1
      }
    end
    local top = ACC.pickTop(many, 4, 0.4, {})
    ok("Top-N：10 个单元 × 0.4 ⇒ 4 个", #top.picked == 4, tostring(#top.picked))
    ok("返回截断分与并列信息", top.cutoffScore ~= nil and top.tiedAtCutoff ~= nil and top.takenAtCutoff ~= nil)
    ok("空单元 ⇒ 不报错且 picked 为空", #ACC.pickTop({}, 4, 0.4, {}).picked == 0)
    ok("比例极小 ⇒ 至少取 1 个", #ACC.pickTop(many, 4, 0.01, {}).picked >= 1)
    -- 邻位降权：全同分时，被选中的邻位应被 −0.6（用绝对阈值模式观察）
    local picked = ACC.pick(many, 4, 2, {})
    ok("绝对阈值模式能选出重音", #picked >= 1, tostring(#picked))
  end
end

section("JSON 大整数精度（真机 bug 回归）")
do
  -- 2026-09-12 真机实测：请求 seq=1789175384220009 被回成 "seq":1.78917538422e+15，
  -- 客户端按 seq 匹配全部失败。根因是 jnumber 的 `< 1e15` 门槛把大整数推给 "%.14g"。
  local big = 1789175384220009
  local enc = B.jenc({ seq = big, id = "fileipc-" .. tostring(big) })
  ok("大整数不用科学计数法", string.find(enc, "e+", 1, true) == nil and string.find(enc, "E+", 1, true) == nil, enc)
  ok("大整数按字面输出（末位不丢）", string.find(enc, tostring(big), 1, true) ~= nil, enc)
  local dec = B.jdec(enc)
  ok("往返后数值相等", tonumber(dec.seq) == big, tostring(dec.seq))
  ok("往返后类型仍是整数", math.type == nil or math.type(dec.seq) == "integer", math.type and math.type(dec.seq))
  -- 边界：刚好 1e15 附近（旧门槛两侧）
  for _, v in ipairs({ 999999999999999, 1000000000000000, 1000000000000001, 9007199254740991 }) do
    local e2 = B.jenc({ n = v })
    local d2 = B.jdec(e2)
    ok("整数 " .. tostring(v) .. " 往返无损", tonumber(d2.n) == v and string.find(e2, "e+", 1, true) == nil, e2)
  end
  -- 浮点仍按浮点输出（不能被 %.0f 吃掉小数）
  local e3 = B.jenc({ x = 1.5, y = 0.001, z = -2.25 })
  ok("浮点小数保留", string.find(e3, "1.5", 1, true) ~= nil and string.find(e3, "0.001", 1, true) ~= nil, e3)
end

section("op: stop（自管理：让桥结束好加载新版本）")
do
  local r = OPS.stop({ delayMs = 50 })
  ok("ok = true", r.ok == true, tostring(r.ok))
  ok("带桥版本号（用于区分跑的是哪一版）", type(r.bridge) == "string" and #r.bridge > 0, r.bridge)
  ok("finishInMs 回显", r.finishInMs == 50, tostring(r.finishInMs))
  ok("已安排 setTimeout", r.scheduled == true, tostring(r.scheduled))
  ok("确实调了 SV:setTimeout", (function()
    for _, c in ipairs(H.calls) do if c == "SV.setTimeout" then return true end end
    return false
  end)())
  ok("提示里说明要重新运行脚本", type(r.note) == "string" and r.note:find("重新运行") ~= nil, r.note)
end

section("op: pollOnce 去重（回归：两个客户端 seq 尺度不同）")
do
  -- 真机 bug（2026-09-12）：fileipc.ts 用 Date.now()*1000+n（≈1.79e15），
  -- ipc-test.cjs 用 Date.now()+n（≈1.79e12）。桥原先按"seq > lastSeq"去重
  -- ⇒ 先来大 seq 的那个客户端把桥**永久毒化**，之后小 seq 请求被静默忽略
  --   （reqSeen 卡住、心跳照跳、日志只剩 resend）。现在按 **id** 去重。
  local tmp = (os.getenv("TEMP") or ".") .. "\\akdagent-test-dedup"
  os.execute('mkdir "' .. tmp .. '" 2>nul')
  B.PATH.req = tmp .. "\\req.json"
  B.PATH.res = tmp .. "\\res.json"
  B.PATH.log = tmp .. "\\log.txt"
  B.ST.dir = tmp
  B.ST.done, B.ST.order, B.ST.lastId = {}, {}, nil
  B.ST.reqSeen, B.ST.lastSeq = 0, -1

  local function sendReq(id, seq, op)
    local f = assert(io.open(B.PATH.req, "w"))
    f:write(B.jenc({ v = 1, seq = seq, id = id, op = op or "ping", args = {} }))
    f:close()
    os.remove(B.PATH.res)
    B.pollOnce()
    local r = io.open(B.PATH.res, "r")
    if not r then return nil end
    local txt = r:read("*a"); r:close()
    return B.jdec(txt)
  end

  local BIG = 1789000000000000      -- fileipc 尺度
  local SMALL = 1789000000000       -- ipc-test 旧尺度

  local r1 = sendReq("cli-A", BIG)
  ok("大 seq 请求被处理", r1 ~= nil and r1.ok == true, r1 and r1.id)
  ok("响应 id 正确", r1 and r1.id == "cli-A", r1 and r1.id)

  local r2 = sendReq("cli-B", SMALL)
  ok("**小 seq 请求也必须被处理**（旧实现会静默忽略）", r2 ~= nil and r2.ok == true, r2 and r2.id)
  ok("响应 id = cli-B", r2 and r2.id == "cli-B", r2 and r2.id)
  ok("reqSeen 计到 2", B.ST.reqSeen == 2, tostring(B.ST.reqSeen))

  -- 同一个 id 重发 ⇒ 重发缓存、不重复执行
  local before = B.ST.opsRun
  local r3 = sendReq("cli-B", SMALL)
  ok("同 id 重发返回缓存", r3 ~= nil and r3.id == "cli-B", r3 and r3.id)
  ok("同 id 重发不重复执行 op", B.ST.opsRun == before, tostring(B.ST.opsRun) .. "/" .. tostring(before))

  -- 清理
  os.remove(B.PATH.req); os.remove(B.PATH.res); os.remove(B.PATH.log)
  os.execute('rmdir "' .. tmp .. '" 2>nul')
end

section("PIT 音高线层（纯函数）")
do
  local PIT = B.PIT
  ok('PIT 已导出', type(PIT) == "table")
  if type(PIT) == "table" then
    ok('11 个参数键', #PIT.KEYS == 11, #PIT.KEYS)
    ok('默认 tF0Left = 0.07', PIT.DEFAULTS.tF0Left == 0.07)
    -- 方向：上行→上（+1）；下行/同音→下（−1）；dF0 为负则反向
    ok('音头·上行 → +1', PIT.dirLeft(64, 62, 0.15) == 1)
    ok('音头·下行 → −1', PIT.dirLeft(62, 64, 0.15) == -1)
    ok('音头·同音 → −1（默认「下」）', PIT.dirLeft(64, 64, 0.15) == -1)
    ok('音头·dF0Left 为负 ⇒ 反向', PIT.dirLeft(64, 62, -0.15) == -1)
    ok('音尾·后音更高 → −1（下）', PIT.dirRight(60, 64, 0.13) == -1)
    ok('音尾·后音更低 → +1（上）', PIT.dirRight(64, 60, 0.13) == 1)
    ok('音尾·句尾无后音 → +1（上）', PIT.dirRight(60, nil, 0.13) == 1)
    -- 分段余弦插值：端点外保持端点值；中点 = 两端均值；单调
    local pts = { { 0, 0 }, { 1, 2 } }
    ok('seg 左端外 = 首个值', PIT.seg(pts, -0.5) == 0)
    ok('seg 右端外 = 末个值', PIT.seg(pts, 5) == 2)
    ok('seg 中点 = 均值（余弦插值对称）', math.abs(PIT.seg(pts, 0.5) - 1) < 1e-9, PIT.seg(pts, 0.5))
    ok('seg 单点/空表 ⇒ 0', PIT.seg({ { 0, 5 } }, 0.3) == 0 and PIT.seg({}, 0.3) == 0)
    -- 颤音：窗口内正弦、窗口外 0、幅度 = dVbr/2、fF0Vbr=0 时恒 0
    ok('vib 窗口外 = 0', PIT.vib(0.1, 1, 2, 0.1, 0.1, 1, 5.5, 0) == 0)
    ok('vib fF0Vbr = 0 ⇒ 0', PIT.vib(1.5, 1, 2, 0, 0, 1, 0, 0) == 0)
    local vmax = 0
    for k = 0, 40 do
      local v = math.abs(PIT.vib(1 + k * 0.025, 1, 2, 0, 0, 1, 5.5, 0))
      if v > vmax then vmax = v end
    end
    ok('vib 峰值 ≈ dVbr/2 = 0.5', math.abs(vmax - 0.5) < 0.02, vmax)
    -- 电平：三个音的平台值应分别是各自音高
    local S = {
      { O = 0, E = 1, P = 60, tFL = 0.07, tFR = 0.07 },
      { O = 1, E = 2, P = 64, tFL = 0.07, tFR = 0.07 },
      { O = 2, E = 3, P = 62, tFL = 0.07, tFR = 0.07 },
    }
    ok('levelAt 首音平台 = 60', PIT.levelAt(0.5, S) == 60, PIT.levelAt(0.5, S))
    ok('levelAt 第二音平台 = 64', PIT.levelAt(1.5, S) == 64, PIT.levelAt(1.5, S))
    ok('levelAt 第三音平台 = 62', PIT.levelAt(2.5, S) == 62, PIT.levelAt(2.5, S))
    -- 出口窗必须有上界（历史 bug：t 超出窗尾被永久吞掉）
    ok('levelAt 末音之后回落末音音高', PIT.levelAt(10, S) == 62, PIT.levelAt(10, S))
    ok('levelAt 空表 ⇒ 60', PIT.levelAt(1, {}) == 60)
    -- 彩蛋触发词
    ok('egg: C47', PIT.eggRequested({ text = '来个 C47' }) == true)
    ok('egg: C047', PIT.eggRequested({ text = 'C047 效果' }) == true)
    ok('egg: 震撼哭腔', PIT.eggRequested({ text = '震撼哭腔一下' }) == true)
    ok('egg: 普通文本不触发', PIT.eggRequested({ text = '正常调声' }) == false)
    ok('egg: 显式 egg=true', PIT.eggRequested({ egg = true }) == true)
    -- 参数合并：top 覆盖 base
    local m = PIT.merge({ dF0Left = 1, dF0Right = 2 }, { dF0Left = 9 })
    ok('merge 覆盖', m.dF0Left == 9 and m.dF0Right == 2)
    ok('merge nil base 不崩', PIT.merge(nil, { a = 1 }).a == 1)
    -- 音尾峰点规则（用户裁定 09-12）：**峰点落在两音符交界 = 本音结束位置 E**（不是"内移"）。
    -- 定位交界的是**后音**的 tF0Offset：负值 ⇒ 峰点略提前（落在两音符之间）；后音无参 ⇒ 0 ⇒ 峰压在 end。
    local ta0 = H.project:getTimeAxis()
    local ns = { H.note(1, 1, 1), H.note(1, 1, 2), H.note(1, 1, 3) }
    local E1 = ta0:getSecondsFromBlick(ns[1]:getEnd())
    local E3 = ta0:getSecondsFromBlick(ns[3]:getEnd())
    local cMid = PIT.buildCurve(nil, ns, 1, ta0, { dF0Right = 2 })
    local cTail = PIT.buildCurve(nil, ns, 3, ta0, { dF0Right = 2 })
    local pkMid = cMid.segs[2][2][1]     -- 音尾段（pit5）的峰点时间
    local pkTail = cTail.segs[2][2][1]
    ok('音尾·有后音但后音无参 ⇒ 峰正好压在 end（交界）', math.abs(pkMid - E1) < 1e-9, pkMid .. ' vs ' .. E1)
    ok('音尾·句尾无后音 ⇒ 峰也在 end', math.abs(pkTail - E3) < 1e-9, pkTail .. ' vs ' .. E3)
    -- ⚠️ 假宿主的 setAttributes 是**合并**语义（清不掉已在的键）⇒ 用 scriptData 构造
    --    （`setScriptData(k, nil)` 即删除；ownParam 的优先级：attributes → scriptData → 默认值）。
    local function setN2(t)
      ns[2]:setScriptData("tF0Offset", t.tF0Offset)
      ns[2]:setScriptData("tF0Left", t.tF0Left)
      ns[2]:setScriptData("dF0Left", t.dF0Left)
    end
    -- 后音带 tF0Offset 但**自己没有音头参数** ⇒ 顶点**恒等于 end**（用户 09-12：顶点始终在 end）
    setN2({ tF0Offset = -0.05 })
    local pkNoHead = PIT.buildCurve(nil, ns, 1, ta0, { dF0Right = 2 }).segs[2][2][1]
    ok('音尾·后音只有 tF0Offset、没有音头 ⇒ 顶点仍精确 = end',
       math.abs(pkNoHead - E1) < 1e-9, pkNoHead .. ' vs ' .. E1)
    -- 后音**有音头**（dF0Left）⇒ 与后音音头冲突 ⇒ **前挪**（挪量 = 后音的 tF0Offset）
    setN2({ tF0Offset = -0.05, dF0Left = 2 })
    local pkOff = PIT.buildCurve(nil, ns, 1, ta0, { dF0Right = 2 }).segs[2][2][1]
    ok('音尾·后音有音头 + tF0Offset=-0.05 ⇒ 顶点前挪到 end − 0.05',
       math.abs(pkOff - (E1 - 0.05)) < 1e-9, pkOff .. ' vs ' .. (E1 - 0.05))
    -- 只写 tF0Left（音头宽度）也算"有音头"（现行判据：tF0Left / dF0Left 任一）
    setN2({ tF0Offset = -0.05, tF0Left = 0.1 })
    local pkW = PIT.buildCurve(nil, ns, 1, ta0, { dF0Right = 2 }).segs[2][2][1]
    ok('音尾·后音只写 tF0Left 也算"有音头" ⇒ 顶点前挪到 end − 0.05',
       math.abs(pkW - (E1 - 0.05)) < 1e-9, pkW .. ' vs ' .. (E1 - 0.05))
    ok('音尾·峰点不再含 0.45·tF0Right 的内移项', math.abs(pkOff - E1) < 0.2)
    setN2({})   -- 清空后音自身参数（不影响后面断言）
    ok('音尾·峰点在音尾段正中（左右对称，底宽 = 2·tF0Right）',
       math.abs((pkMid - cMid.segs[2][1][1]) - (cMid.segs[2][3][1] - pkMid)) < 1e-12,
       tostring(cMid.segs[2][1][1]) .. ' / ' .. tostring(pkMid) .. ' / ' .. tostring(cMid.segs[2][3][1]))
  end
end

section("op: write_pit（SV1 属性路线 + 曲线路线 + 幂等 + accent）")
do
  local PIT = B.PIT
  -- ⚠️ 2026-09-22 起 **默认 plan = accent**（只改算出来的重音音符）。本段绝大多数断言验证的是"全写"
  --    的落地细节（属性 / 曲线 / 幂等 / 和弦 / 归属标记）⇒ 一律显式 plan="explicit"，用 wp() 包一层；
  --    新默认的口径与"选区范围"另有专门断言（见本段末尾 ⑦）。
  local function wp(t)
    t = t or {}
    if t.plan == nil then t.plan = 'explicit' end
    return OPS.write_pit(t)
  end
  -- ⚠️ 必须先清选区：write_pit 的目标优先级是 indices → **选中音符** → 全部，
  --    前面的测试留下了 2 个选中音符，不清就会只处理 2 个（上一版测试就栽在这里）。
  H.selection:clearNotes()
  -- 当前组 = 轨1/组1（3 个音符：67/69/71，lyrics la/li/lu，各 1 拍，紧密相连）
  local g = H.target(1, 1)
  -- ① SV1 属性路线（假宿主 ST.isSV2 = false ⇒ mode 默认 attr）
  local r = wp({ dryRun = true })
  ok('dryRun 不写、返回 processed = 3', r.processed == 3 and r.dryRun == true, r.processed)
  ok('mode = attr（SV1）', r.mode == 'attr', r.mode)
  ok('dryRun 不计写入', r.attrs == 0, r.attrs)

  -- 不给任何参数时：参数全是默认值 ⇒ 属性路线**什么都不写**（这是正确行为：默认值不落盘）
  local r0 = wp({})
  ok('无参数 ⇒ attrs = 0 / skipped = 3（默认值不写）', r0.attrs == 0 and r0.skipped == 3,
     tostring(r0.attrs) .. '/' .. tostring(r0.skipped))

  -- 给了非默认参数才真正写属性
  local r2 = wp({ params = { dF0Left = 2 } })
  ok('有非默认参数：attrs = 3', r2.attrs == 3, r2.attrs)
  ok('确实调了 setAttributes', (function()
    for _, c in ipairs(H.calls) do if c == 'note.setAttributes' then return true end end
    return false
  end)())
  ok('确实切了手动模式（有属性要写时）', (function()
    for _, c in ipairs(H.calls) do if c == 'note.setPitchAutoMode' then return true end end
    return true
  end)())
  local attrs0 = H.note(1, 1, 1):getAttributes()
  ok('dF0Left 非默认 ⇒ 已写入', attrs0.dF0Left == 2, attrs0.dF0Left)
  ok('tF0Offset 仍是默认 0 ⇒ 未写入（稀疏属性）', attrs0.tF0Offset == nil, attrs0.tF0Offset)
  -- 显式把参数设回**默认值**：目标=默认 而音符残留非默认 ⇒ 写 NaN 让它回到组默认
  -- （不给参数时不会走这条路：resolve 会读到音符自己的残留值当目标，与 JS 一致）
  local r2b = wp({ params = { dF0Left = 0.15 } })
  ok('残留非默认值 + 目标=默认 ⇒ 写 NaN 清回', (function()
    local a = H.note(1, 1, 1):getAttributes()
    return a.dF0Left ~= nil and a.dF0Left ~= a.dF0Left   -- NaN ~= NaN
  end)(), H.note(1, 1, 1):getAttributes().dF0Left)

  -- ② 曲线路线（同一宿主显式指定 mode='curve'）
  H.note(1, 1, 1):setAttributes({ dF0Left = 0 })   -- 清掉 NaN，避免干扰
  H.note(1, 1, 2):setAttributes({ dF0Left = 0 })
  H.note(1, 1, 3):setAttributes({ dF0Left = 0 })
  local r3 = wp({ mode = 'curve' })
  ok('mode = curve', r3.mode == 'curve', r3.mode)
  ok('canCurve = true（假宿主有 PitchControl API）', r3.canCurve == true)
  ok('生成了 3 条曲线', r3.curves == 3, r3.curves)
  ok('组里确实有 3 条曲线', g:getNumPitchControls() == 3, g:getNumPitchControls())
  local c1 = g:getPitchControl(1)
  local pts = c1:getPoints()
  ok('曲线点数 ≥ 2', type(pts) == 'table' and #pts >= 2, type(pts) == 'table' and #pts)
  ok('点值是 [相对时间, 半音] 对', type(pts[1]) == 'table' and #pts[1] == 2, pts[1])
  ok('相对时间从 0 起', pts[1][1] == 0, pts[1][1])
  ok('setPitch = 本音音高 67', c1:getPitch() == 67, c1:getPitch())
  local ymax, yAtOn = 0, nil
  for i = 1, #pts do
    ymax = math.max(ymax, math.abs(pts[i][2]))
    if yAtOn == nil and pts[i][1] >= 0 then yAtOn = pts[i][2] end
  end
  ok('点值量级合理（|y| < 4 半音）', ymax < 4, ymax)
  ok('本音起点处 y ≈ 0（点值 = 全局轮廓 − 本音音高）', math.abs(yAtOn) < 0.6, yAtOn)

  -- ③ 幂等：再写一次 ⇒ 同窗口起点的旧曲线先被移除
  local before = g:getNumPitchControls()
  local r4 = wp({ mode = 'curve' })
  ok('幂等：曲线数不翻倍', g:getNumPitchControls() == before, g:getNumPitchControls())
  ok('removedCurves > 0', r4.removedCurves > 0, r4.removedCurves)

  -- ④ clear='all' 清空全组曲线
  local r5 = wp({ mode = 'curve', clear = 'all', dryRun = true })
  ok('dryRun 时 clear 不生效', g:getNumPitchControls() == before, g:getNumPitchControls())
  wp({ mode = 'curve', clear = 'all' })
  ok('clear=all 后曲线被清掉再重建（仍是 3 条）', g:getNumPitchControls() == 3, g:getNumPitchControls())

  -- ④' 🆕 2026-09-20 IX 真机踩到：**和弦（同 onset）写曲线会丢**
  --     旧幂等只按"窗口起点一致"删，而和弦里多个音 onset 相同 ⇒ 后写的把先写的当旧版删掉
  --     （真机给同 onset 的两个音各写一条 ⇒ 只剩 1 条，返回里只报 removedCurves、不报丢音）。
  --     修法：写入时用 scriptData 打"属于哪个音符"的标记，重写只删自己那条。
  -- ⚠️ 清底不能靠 `write_pit({clear='all'})` —— 它清完会**接着重建**（曲线数仍是 3）。
  --    直接从组上删干净，才有一个干净的计数起点。
  while g:getNumPitchControls() > 0 do g:removePitchControl(1) end
  ok("清底：组上 0 条曲线", g:getNumPitchControls() == 0, g:getNumPitchControls())
  local cn1, cn2 = H.note(1, 1, 1), H.note(1, 1, 2)
  local savedOnset = cn2:getOnset()
  cn2:setOnset(cn1:getOnset())                     -- 造和弦：前两个音同 onset（窗口起点也一样）
  local rc = wp({ mode = 'curve' })
  ok("★ 和弦：同 onset 的两个音**各留一条**曲线（不是只剩 1 条）",
     g:getNumPitchControls() == 3, g:getNumPitchControls())
  ok("★ 返回 curves = 3", rc.curves == 3, rc.curves)
  local tags = {}
  for i = 1, g:getNumPitchControls() do
    local c = g:getPitchControl(i)
    tags[#tags + 1] = c.getScriptData and tostring(c:getScriptData("akdagentNoteIndex")) or "no-tag"
  end
  table.sort(tags, function(a, b) return a < b end)
  ok("★ 每条曲线都带音符归属标记（0/1/2）", table.concat(tags, ",") == "0,1,2", table.concat(tags, ","))
  local rc2 = wp({ mode = 'curve' })
  ok("★ 重写仍 3 条（只删自己那条，不误删同伴）", g:getNumPitchControls() == 3, g:getNumPitchControls())
  ok("★ 重写 removedCurves = 3（按标记认领）", rc2.removedCurves == 3, rc2.removedCurves)

  -- ④'' 🆕 0.3.19/0.3.20：目标里有**同 onset 音符（和弦/齐奏）**时，**只在 IX 上**如实加警告
  --     （`chordStarts`/`chordNotes`/`chordHint`）。**⚠️ 用户 2026-09-20 口径**：
  --     「**IX 对参数编辑的限制不要影响到 SV 里去**」⇒ **SV1**（attr 路线、逐音符属性、无共享骨架）
  --     与 **SV2**（骨架是既定设计）都**不得**出现这条提示；只有 **IX**（叠加宿主侧那个 bug，登记 IX-005）要提示。
  local savedHost2, savedIsSV22 = B.ST.host, B.ST.isSV2
  B.ST.host, B.ST.isSV2 = "ix", true
  local rIx = wp({ mode = 'curve', dryRun = true })
  ok("★ IX + 和弦：chordStarts = 1", rIx.chordStarts == 1, tostring(rIx.chordStarts))
  ok("★ IX + 和弦：chordNotes = 2（两个音同 onset）", rIx.chordNotes == 2, tostring(rIx.chordNotes))
  ok("★ IX + 和弦：chordHint 存在且点名「同 onset」",
     type(rIx.chordHint) == 'string' and rIx.chordHint:find('同 onset', 1, true) ~= nil, tostring(rIx.chordHint))
  ok("★ IX + 和弦：文案点到宿主侧那个 bug（「暴力移植」）",
     type(rIx.chordHint) == 'string' and rIx.chordHint:find('暴力移植', 1, true) ~= nil, tostring(rIx.chordHint))
  ok("★ IX + 和弦：dryRun 也带警告（那才是推荐路径）", type(rIx.chordHint) == 'string', tostring(rIx.chordHint))
  -- 判据必须按**目标集**算、不是按全组：此刻组里确有和弦，但**只点名其中一个音** ⇒ 目标里没有同 onset 对
  local rOne = wp({ indices = { 0 }, mode = 'curve', dryRun = true })
  ok("★ IX：只说和弦里的一个音 ⇒ 不警告（判据按目标集、不是全组）",
     rOne.chordHint == nil, tostring(rOne.chordHint))
  -- IX 上走 attr 路线本就不写曲线 ⇒ 没有骨架问题，不该提示
  local rAttrIx = wp({ mode = 'attr', dryRun = true })
  ok("★ IX + attr 路线 ⇒ 不警告（没画曲线就没有骨架问题）", rAttrIx.chordHint == nil, tostring(rAttrIx.chordHint))

  cn2:setOnset(savedOnset)                         -- 复原，别影响后面的用例
  -- 负向：**没有**和弦时不许出这条警告（否则警告会被当噪声忽略；也防"恒真"式回归）
  local rnc = wp({ mode = 'curve', dryRun = true })
  ok("★ 负向：无和弦 ⇒ 不出 chordHint", rnc.chordHint == nil, tostring(rnc.chordHint))
  ok("★ 负向：无和弦 ⇒ 不出 chordStarts", rnc.chordStarts == nil, tostring(rnc.chordStarts))

  -- ⛔⛔ **外溢防线**（用户 2026-09-20 口径）：IX 这条提示**绝不许出现在 SV 上**
  B.ST.host, B.ST.isSV2 = "sv", true               -- SV2：走**同一套**骨架代码，但按设计提示不该出现
  cn2:setOnset(cn1:getOnset())                     -- 再造成和弦，确认"不是因为没有和弦才不报"
  local rSv2 = wp({ mode = 'curve', dryRun = true })
  ok("★ 外溢防线①：SV2 + 和弦 ⇒ **不出** chordHint", rSv2.chordHint == nil, tostring(rSv2.chordHint))
  ok("★ 外溢防线①：SV2 + 和弦 ⇒ **不出** chordStarts", rSv2.chordStarts == nil, tostring(rSv2.chordStarts))
  ok("★ 外溢防线①：SV2 上曲线照写（功能没被牵连）", rSv2.curves == 3, tostring(rSv2.curves))
  B.ST.host, B.ST.isSV2 = "sv", false              -- SV1：attr 路线（逐音符属性、无共享骨架）
  local rSv1 = wp({ mode = 'attr', dryRun = true })
  ok("★ 外溢防线②：SV1 + attr ⇒ **不出** chordHint（那是假警报）",
     rSv1.chordHint == nil, tostring(rSv1.chordHint))
  B.ST.host, B.ST.isSV2 = savedHost2, savedIsSV22
  cn2:setOnset(savedOnset)                         -- 复原

  -- ⑦ 🆕 0.3.25 · P23 ②③：**交界一致性自检**（2026-09-22 · 用户裁「2+3」）
  --    背景：curve 值 = 全局骨架(当时快照) − 本音音高 + bumps(本次 params) ⇒ **一致性只在同一次调用内成立**；
  --    只重写一个音、邻音还是旧曲线 ⇒ 交界处会出现两条**有间距**的线。
  --    ⚠️ **口径**：只进回包（`junction` / `junctionHint`），**不上面板、不提示用户**（"用户不必知道写的过程"）。
  do
    wp({ mode = 'curve' })                        -- 整组写一遍 ⇒ 每条都带指纹
    local allFp = true
    for i = 1, g:getNumPitchControls() do
      local c = g:getPitchControl(i)
      local fp = (c.getScriptData and c:getScriptData("akdagentCurveFp")) or nil
      if type(fp) ~= 'string' or #fp == 0 then allFp = false end
    end
    ok('⑦ 写入的每条曲线都带指纹（akdagentCurveFp）', allFp)

    -- ② 同批把**全组相邻音**都写掉 ⇒ 判据按目标集 ⇒ 不报警（这就是推荐用法）
    local rAllJ = wp({ mode = 'curve', dryRun = true })
    ok('⑦ ② 同批写全组（相邻音都在目标里）⇒ 不报 junction', rAllJ.junction == nil,
       tostring(rAllJ.junction and rAllJ.junction.neighbours))
    -- ② 只把 0/1 一起写：**0–1 这个交界干净**，但 **1–2 的交界仍要报**（精确到"哪一对"）
    local rPair = wp({ mode = 'curve', indices = { 0, 1 }, dryRun = true })
    ok('⑦ ② 只写 0/1 ⇒ 只报 1–2（不误报 0–1）', (function()
      if rPair.junction == nil or rPair.junction.neighbours ~= 1 then return false end
      for _, it in ipairs(rPair.junction.items) do
        if not (it.index == 1 and it.neighbour == 2) then return false end
      end
      return true
    end)(), tostring(rPair.junction and rPair.junction.neighbours))

    -- ② 只写一个音、邻音已有曲线 ⇒ 报 junction
    local rOne2 = wp({ mode = 'curve', indices = { 0 }, dryRun = true })
    ok('⑦ ② 只写一个音 ⇒ 报 junction', type(rOne2.junction) == 'table', tostring(rOne2.junction))
    ok('⑦ ② junction.neighbours ≥ 1', rOne2.junction ~= nil and rOne2.junction.neighbours >= 1,
       tostring(rOne2.junction and rOne2.junction.neighbours))
    ok('⑦ ② 文案提到「两条」与「同一次调用」',
       type(rOne2.junctionHint) == 'string'
       and rOne2.junctionHint:find('两条', 1, true) ~= nil
       and rOne2.junctionHint:find('同一次调用', 1, true) ~= nil, tostring(rOne2.junctionHint))
    ok('⑦ ② 邻音在 items 里如实点名', (function()
      if rOne2.junction == nil then return false end
      for _, it in ipairs(rOne2.junction.items) do if it.neighbour == 1 then return true end end
      return false
    end)())
    ok('⑦ ② dryRun 也自检（那才是推荐路径）', type(rOne2.junctionHint) == 'string')

    -- ③ 旧快照：改动**几何**（邻音 1 的时值）后再只写音 0 ⇒ stale
    local n1j = H.note(1, 1, 2)
    local savedDur = n1j:getDuration()
    n1j:setDuration(savedDur + 705600000)
    local rStale = wp({ mode = 'curve', indices = { 0 }, dryRun = true })
    ok('⑦ ③ 邻音几何已变 ⇒ 判为旧快照（stale）', (function()
      if rStale.junction == nil then return false end
      for _, it in ipairs(rStale.junction.items) do
        if it.neighbour == 1 and it.stale == true then return true end
      end
      return false
    end)(), tostring(rStale.junction and rStale.junction.stale))
    ok('⑦ ③ stale 计数 ≥ 1', rStale.junction ~= nil and rStale.junction.stale >= 1,
       tostring(rStale.junction and rStale.junction.stale))
    n1j:setDuration(savedDur)                      -- 复原

    -- ③ 无指纹（旧版写的曲线）⇒ 记 unknown，**不硬判** stale
    for i = g:getNumPitchControls(), 1, -1 do
      local c = g:getPitchControl(i)
      if c.getScriptData and tonumber(c:getScriptData("akdagentNoteIndex")) == 1 then
        c:setScriptData("akdagentCurveFp", nil)
      end
    end
    local rUnk = wp({ mode = 'curve', indices = { 0 }, dryRun = true })
    ok('⑦ ③ 无指纹 ⇒ unknown=true 且 stale=false', (function()
      if rUnk.junction == nil then return false end
      for _, it in ipairs(rUnk.junction.items) do
        if it.neighbour == 1 and it.unknown == true and it.stale == false then return true end
      end
      return false
    end)(), tostring(rUnk.junction and rUnk.junction.unknown))
    ok('⑦ ③ 文案点出「无指纹」', type(rUnk.junctionHint) == 'string'
       and rUnk.junctionHint:find('无指纹', 1, true) ~= nil, tostring(rUnk.junctionHint))
    wp({ mode = 'curve' })                        -- 重写全组，恢复指纹

    -- 负向①：只算 ±1 邻音 —— 音 0 与音 2 **不相邻**，不该被算进音 2 的交界
    local rFar = wp({ mode = 'curve', indices = { 2 }, dryRun = true })
    ok('⑦ 负向：只算 ±1 邻音（音 0 不算进音 2 的交界）', (function()
      if rFar.junction == nil then return false end
      for _, it in ipairs(rFar.junction.items) do if it.neighbour == 0 then return false end end
      return true
    end)())

    -- 负向②：attr 路线（SV1 逐音符属性、无共享骨架）⇒ 没有曲线就没有交界问题 ⇒ 不报
    local rAttrJ = wp({ mode = 'attr', dryRun = true })
    ok('⑦ 负向：attr 路线 ⇒ 不出 junction', rAttrJ.junction == nil, tostring(rAttrJ.junction))
  end

  -- ⑤ plan='accent'：只给重音位写，非重音位一律不动
  local r6 = wp({ plan = 'accent', mode = 'attr', dryRun = true })
  ok('accent 报告存在', type(r6.accent) == 'table')
  ok('报告含 beatsPerBar = 4', r6.accent.beatsPerBar == 4, r6.accent.beatsPerBar)
  ok('报告含 unitCount / syllableUnits', r6.accent.unitCount == 3 and r6.accent.syllableUnits == 3,
     tostring(r6.accent.unitCount) .. '/' .. tostring(r6.accent.syllableUnits))
  ok('targetRatio 默认 0.4', r6.accent.targetRatio == 0.4, r6.accent.targetRatio)
  ok('accentCount ≤ 音节单元数', r6.accent.accentCount <= 3, r6.accent.accentCount)
  ok('selected = 选中的目标数', r6.accent.selected == r6.processed, tostring(r6.accent.selected))
  if #r6.accent.picked > 0 then
    local p1 = r6.accent.picked[1]
    ok('picked 项含 index/score/gesture/tF0VbrStart',
      p1.index ~= nil and p1.score ~= nil and p1.gesture ~= nil and p1.tF0VbrStart ~= nil, p1)
    ok('gesture 是「上音头」或「下音头」', p1.gesture == '上音头' or p1.gesture == '下音头', p1.gesture)
  end
  -- 呼吸音/延续音不参与重音（把第 2 个音符歌词改成 '-' 再跑）
  H.note(1, 1, 2):setLyrics('-')
  local r7 = wp({ plan = 'accent', dryRun = true })
  ok('延续音被剔除出音节单元', r7.accent.syllableUnits <= 2, r7.accent.syllableUnits)
  H.note(1, 1, 2):setLyrics('li')
  H.note(1, 1, 2):setLyrics('br')
  local r8 = wp({ plan = 'accent', dryRun = true })
  ok('呼吸音被单独计数', r8.accent.skippedBreath >= 1, r8.accent.skippedBreath)
  H.note(1, 1, 2):setLyrics('li')

  -- ⑥ 参数/边界
  ok('indices 指定单个音符', wp({ indices = { 1 }, dryRun = true }).processed == 1)
  ok('越界 indices 被忽略 ⇒ 报错（无有效目标）', pcall(OPS.write_pit, { indices = { 99 }, dryRun = true }) == false)

  -- 回归（真机 bug）：本机 SV2 的 getSelectedNotes() **不是数组**（`#` 恒 0）。旧实现只看 `#`
  -- ⇒ 把"选了 2 个"当成"没选" ⇒ 退化成**整个组**（真轨上就是 462 音被整条当目标）。
  -- 有牙靠 fake-sv 的 state.selNotArray 开关：数组形态下旧代码也能过，所以必须开这个开关。
  H.selection:clearNotes()
  H.selection:selectNote(g:getNote(2))
  H.selection:selectNote(g:getNote(3))
  H.state.selNotArray = true
  local rSel = wp({ dryRun = true })
  ok('选中对象无数组长度（模拟 SV2）⇒ 只处理选中的 2 个，不吃整组',
     rSel.processed == 2, tostring(rSel.processed))
  local rSelRead = OPS.get_selected_notes({})
  ok('同一兜底也惠及 get_selected_notes ⇒ count = 2', rSelRead.count == 2, tostring(rSelRead.count))
  H.state.selNotArray = false
  H.selection:clearNotes()
  local r9 = wp({ params = { dF0Left = 1.234 }, dryRun = true })
  ok('params 覆盖被接受', r9.processed == 3, r9.processed)
  local r10 = wp({ perNote = { ['0'] = { dF0Left = 9 } }, dryRun = true })
  ok('perNote 覆盖被接受', r10.processed == 3, r10.processed)
  -- SV1 传 mode='curve' 时若宿主没有曲线 API ⇒ 必须报错而不是静默降级
  local savedNum = g.getNumPitchControls
  g.getNumPitchControls = nil
  local okNoCurve, errNoCurve = pcall(OPS.write_pit, { mode = 'curve' })
  ok('无 PitchControl API 时 mode=curve ⇒ 报错', okNoCurve == false, errNoCurve)
  g.getNumPitchControls = savedNum

  -- ⑦ 🆕 2026-09-22 默认口径（用户重申原始设想：**只有算出来的重音音符才该被改成手动 / 才该划线**）
  --    默认 plan = accent；要回到"全写"必须显式 plan="explicit"；给 indices 则按点名。
  H.selection:clearNotes()
  H.note(1, 1, 2):setLyrics('li')                 -- 上面几段改过歌词，复原成正常音节
  local d1 = OPS.write_pit({ dryRun = true })
  ok('默认 plan = accent（不点名就只动重音）', d1.plan == 'accent', d1.plan)
  ok('默认 scope = whole-group（未选中、未给 indices）', d1.scope == 'whole-group', d1.scope)
  ok('默认 processed = 重音命中数（< 全组 3）', d1.processed == d1.accent.selected and d1.processed < 3,
     tostring(d1.processed) .. '/' .. tostring(d1.accent.selected))
  ok('accent 报告带 scope.scanned = 3', type(d1.accent.scope) == 'table' and d1.accent.scope.scanned == 3,
     type(d1.accent.scope) == 'table' and d1.accent.scope.scanned)
  local d2 = OPS.write_pit({ plan = 'explicit', dryRun = true })
  ok('显式 plan=explicit ⇒ 回到全写（3 个）', d2.processed == 3, d2.processed)
  -- 选中 2 个 + 默认 ⇒ 评分域 = **选区**（选区外一个都不碰）
  H.selection:selectNote(g:getNote(1))
  H.selection:selectNote(g:getNote(2))
  local d3 = OPS.write_pit({ dryRun = true })
  ok('选中 2 个 ⇒ scope = selection', d3.scope == 'selection', d3.scope)
  ok('accent 只在选区内评分（scanned = 2）', d3.accent.scope.scanned == 2, d3.accent.scope.scanned)
  ok('选区外不吃：processed ≤ 2 且命中下标都在 {0,1}', (function()
    if d3.processed > 2 then return false end
    for _, p in ipairs(d3.accent.picked) do if p.index > 1 then return false end end
    return true
  end)(), tostring(d3.processed))
  H.selection:clearNotes()
  -- 点名 indices + 默认 ⇒ 按点名（等价 explicit）
  local d4 = OPS.write_pit({ indices = { 0, 2 }, dryRun = true })
  ok('给 indices + 默认 ⇒ scope = indices 且只写这 2 个', d4.scope == 'indices' and d4.processed == 2,
     tostring(d4.scope) .. '/' .. tostring(d4.processed))
end

section("selftest 能力探测段（只读）")
do
  local r = OPS.selftest({})
  local cap = r.capabilities
  ok('selftest 带 capabilities', type(cap) == 'table', type(cap))
  if type(cap) == 'table' and cap.detail then
    ok('有 okOps / blockedOps 计数', type(cap.okOps) == 'number' and type(cap.blockedOps) == 'number',
       tostring(cap.okOps) .. '/' .. tostring(cap.blockedOps))
    ok('detail 覆盖全部 op（≥20）', (function()
      local n = 0
      for _ in pairs(cap.detail) do n = n + 1 end
      return n >= 20
    end)())
    ok('context 标记了当前环境', cap.context ~= nil and cap.context.hasCurrentGroup == true, cap.context)
    ok('extras.canCurve = true（假宿主有 PitchControl）', cap.extras.canCurve == true)
    ok('extras.noteHasAttributes = true', cap.extras.noteHasAttributes == true)
    ok('extras.hasGetAllTempoMarks = true', cap.extras.hasGetAllTempoMarks == true)
    ok('write_pit 未被判 blocked', cap.detail.write_pit and cap.detail.write_pit.ok == true, cap.detail.write_pit)
    ok('align_audio 未被判 blocked（有 setTimeRange 或 setTimeOffset）',
       cap.detail.align_audio and cap.detail.align_audio.ok == true, cap.detail.align_audio)
    ok('每个 op 都有 ok/missing 字段', (function()
      for _, v in pairs(cap.detail) do
        if type(v.ok) ~= 'boolean' or type(v.missing) ~= 'table' then return false end
      end
      return true
    end)())

    -- 负向①：抽掉 pitch control API ⇒ canCurve 应变 false（write_pit 仍可走属性路线）
    local g1 = H.target(1, 1)
    local savedAdd = g1.addPitchControl
    g1.addPitchControl = nil
    local cap2 = OPS.selftest({}).capabilities
    ok('抽掉 addPitchControl ⇒ canCurve = false', cap2.extras.canCurve == false, cap2.extras.canCurve)
    ok('此时 write_pit 仍 ok（属性路线可用）', cap2.detail.write_pit.ok == true, cap2.detail.write_pit)
    g1.addPitchControl = savedAdd

    -- 负向②：抽掉两种参数来源 ⇒ write_pit 必须被判 blocked
    local n0 = H.note(1, 1, 1)
    local savedAttr, savedSD = n0.getAttributes, n0.getScriptData
    n0.getAttributes, n0.getScriptData = nil, nil
    local cap3 = OPS.selftest({}).capabilities
    ok('两种参数来源都缺 ⇒ write_pit blocked', cap3.detail.write_pit.ok == false, cap3.detail.write_pit)
    ok('blocked 原因写明"二者需有其一"', (function()
      for _, m in ipairs(cap3.detail.write_pit.missing) do
        if tostring(m):find('二者需有其一') ~= nil then return true end
      end
      return false
    end)(), cap3.detail.write_pit.missing)
    n0.getAttributes, n0.getScriptData = savedAttr, savedSD

    -- 负向③：没有当前组时，依赖当前组的 op 应报"缺少对象"而不是崩
    local savedRef = H.state.currentGroupRef
    H.state.currentGroupRef = nil
    local okNoCtx, cap4 = pcall(function() return OPS.selftest({}).capabilities end)
    ok('无当前组时探测不崩', okNoCtx == true, cap4)
    if okNoCtx and type(cap4) == 'table' and cap4.detail then
      ok('hasCurrentGroup = false', cap4.context.hasCurrentGroup == false, cap4.context)
      ok('依赖当前组的 op 被标 blocked 且注明缺少对象', (function()
        local d = cap4.detail.get_current_group
        if d == nil or d.ok then return false end
        for _, m in ipairs(d.missing) do
          if tostring(m):find('缺少对象') ~= nil then return true end
        end
        return false
      end)(), cap4.detail.get_current_group)
    end
    H.state.currentGroupRef = savedRef
  else
    ok('capabilities 结构完整', false, cap and cap.error)
  end
end

section("run_script（Lua 语义）")
do
  local r = OPS.run_script({ code = "return 1 + 1", readonly = true })
  ok("只读脚本可跑", r.result == 2, tostring(r.result))
  ok("resultType = number", r.resultType == "number", r.resultType)
  local okW, errW = pcall(OPS.run_script, { code = "return 1" })
  ok("写脚本缺 newUndoRecord ⇒ 拒绝", okW == false, errW)
  local r2 = OPS.run_script({ code = "local p = SV:getProject(); p:newUndoRecord(); return p:getNumTracks()" })
  ok("带 newUndoRecord 的写脚本可跑", r2.result == 3, tostring(r2.result))
  local r3 = OPS.run_script({ code = "return SV.QUARTER", readonly = true })
  ok("脚本能拿到 SV 全局", r3.result == 705600000, tostring(r3.result))
  local r4 = OPS.run_script({ code = "return tostring(1) .. '/' .. type(pairs) .. '/' .. type(string.format)", readonly = true })
  ok("标准库未丢失（_ENV 兜住 _G）", r4.result == "1/function/function", tostring(r4.result))
  local r5 = OPS.run_script({ code = "return tostring(x) .. tostring(y)", readonly = true, scope = { x = "A", y = 2 } })
  ok("scope 注入生效", r5.result == "A2", tostring(r5.result))
  -- 新 undo 记录被真正调用（写脚本必须经过 newUndoRecord）
  local before = H.state.undoCount
  OPS.run_script({ code = "SV:getProject():newUndoRecord(); return true" })
  ok("写脚本触发 newUndoRecord", H.state.undoCount == before + 1, H.state.undoCount)
  local okC, errC = pcall(OPS.run_script, { code = "return 1 +", readonly = true })
  ok("语法错脚本 ⇒ 报编译错", okC == false and tostring(errC):find("compile error") ~= nil, errC)
end

section("op: get_computed_pitch / get_computed_attributes（空值语义 · 2026-09-18 裁定）")
do
  -- ① 全 nil：真实宿主是"长度 = numFrames、内容全 null"⇒ 必须报 notReady + 自查，且**不能**把 nil 洞当成空表
  local r4 = OPS.get_computed_pitch({ numFrames = 4 })
  ok("全 nil ⇒ numeric = 0", r4.numeric == 0, r4.numeric)
  ok("全 nil ⇒ nulls = numFrames（不是空表）", r4.nulls == 4, r4.nulls)
  ok("全 nil ⇒ notReady = true", r4.notReady == true)
  ok("全 nil ⇒ retryAfterMs 给出", r4.retryAfterMs == 500, r4.retryAfterMs)
  ok("全 nil ⇒ 带 checks 自查（两条真前置）", type(r4.checks) == "table" and r4.checks.groupNoteCount == 3, r4.checks)
  ok("全 nil ⇒ hint 提到渲染前置 / 语种", type(r4.hint) == "string" and r4.hint:find("NoteGroupReference") ~= nil
     and r4.hint:find("音素") ~= nil, r4.hint)

  -- ② nil 洞：第 3..6 帧有值 ⇒ 逐帧遍历才能数对（`#arr` 会给出 0 或错值）
  local r8 = OPS.get_computed_pitch({ numFrames = 8 })
  ok("nil 洞 ⇒ numeric = 4", r8.numeric == 4, r8.numeric)
  ok("nil 洞 ⇒ nulls = 4", r8.nulls == 4, r8.nulls)
  ok("nil 洞 ⇒ firstFrame = 3 / lastFrame = 6", r8.firstFrame == 3 and r8.lastFrame == 6,
     tostring(r8.firstFrame) .. "/" .. tostring(r8.lastFrame))
  ok("nil 洞 ⇒ values 紧凑（不丢下标对应关系）", #r8.values == 4 and r8.values[1] == 60.1 and r8.values[4] == 60.4, r8.values)
  ok("有值时 notReady = false", r8.notReady == false)
  ok("有值时不给 retryAfterMs", r8.retryAfterMs == nil, r8.retryAfterMs)

  -- ③ 稠密：全部就绪
  local r3 = OPS.get_computed_pitch({ numFrames = 3 })
  ok("稠密 ⇒ numeric = 3 / nulls = 0", r3.numeric == 3 and r3.nulls == 0, r3.numeric .. "/" .. r3.nulls)
  ok("稠密 ⇒ 默认 startBlick = reference 的 timeOffset", r3.startBlick == r3.timeOffset, r3.startBlick)
  ok("稠密 ⇒ 默认 intervalBlick = 四分音符/8", r3.intervalBlick == math.floor(705600000 / 8), r3.intervalBlick)

  -- ④ op 存在性 & 名字
  local names = table.concat(B.OP_NAMES, ",")
  ok("op 清单含 get_computed_pitch", names:find("get_computed_pitch", 1, true) ~= nil)
  ok("op 清单含 get_computed_attributes", names:find("get_computed_attributes", 1, true) ~= nil)

  -- ⑤ 计算属性：accent / rapTone / rapIntonation / phonemes[].language
  local ra = OPS.get_computed_attributes({})
  ok("属性 ⇒ count = 2", ra.count == 2, ra.count)
  ok("属性 ⇒ 第 1 个音符 accent = 1 / rapTone = 2", ra.notes[1].accent == "1" and ra.notes[1].rapTone == 2, ra.notes[1])
  ok("属性 ⇒ 空 accent 不进 accents 汇总", #ra.accents == 1 and ra.accents[1] == "1", ra.accents)
  ok("属性 ⇒ rapIntonation 只有第 2 个音符有", ra.notes[1].rapIntonation == nil and ra.notes[2].rapIntonation == 3)
  ok("属性 ⇒ 音素数 = 2 / 1", ra.notes[1].phonemeCount == 2 and ra.notes[2].phonemeCount == 1,
     ra.notes[1].phonemeCount .. "/" .. ra.notes[2].phonemeCount)
  ok("属性 ⇒ 语种汇总去重且排序 = english,mandarin", #ra.languages == 2 and ra.languages[1] == "english"
     and ra.languages[2] == "mandarin", ra.languages)
  ok("属性 ⇒ 逐音符带语种列表", ra.notes[1].phonemeLanguages[1] == "mandarin" and ra.notes[2].phonemeLanguages[1] == "english")
  ok("属性 ⇒ 音素字段原样带出（symbol/language/activity/position）",
     ra.notes[1].phonemes[1].symbol == "l" and ra.notes[1].phonemes[1].activity == 0.5, ra.notes[1].phonemes[1])

  -- ⑥ 空 ⇒ notReady（"还没算完 / 不可渲染"两条都要靠调用方自查）
  local ref = H.state.currentGroupRef
  ref._emptyAttrs = true
  local re = OPS.get_computed_attributes({})
  ok("属性空 ⇒ count = 0 / notReady", re.count == 0 and re.notReady == true, re.count)
  ok("属性空 ⇒ hint 指向渲染前置 / 语种", type(re.hint) == "string" and re.hint:find("不可渲染") ~= nil, re.hint)
  ref._emptyAttrs = nil
end

section("op: get_lyrics_attrs / set_note_languages / set_note_rap_accents（语言与说唱声调 · 2026-09-18）")
do
  local la = OPS.get_lyrics_attrs({})
  ok("读整组：current = true", la.current == true)
  ok("读整组：3 个音符", #la.notes == 3, #la.notes)
  ok("读整组：index 0 起", la.notes[1].index == 0 and la.notes[3].index == 2,
     tostring(la.notes[1].index) .. "/" .. tostring(la.notes[3].index))
  ok("读整组：带歌词（字符串，非 nil）", type(la.notes[1].lyrics) == "string" and type(la.notes[2].lyrics) == "string",
     tostring(la.notes[1].lyrics))
  ok("读整组：语言覆盖默认 \"\"（继承）", la.notes[1].languageOverride == "", tostring(la.notes[1].languageOverride))
  ok("读整组：musicalType 默认 sing", la.notes[1].musicalType == "sing", tostring(la.notes[1].musicalType))
  ok("读整组：rapAccent 默认 \"\"", la.notes[1].rapAccent == "", tostring(la.notes[1].rapAccent))

  -- 写语言：只动"少数派"（0 起索引 1 = 第二个音符）
  local rl = OPS.set_note_languages({ items = { { index = 1, language = "english" } } })
  ok("设语言：changed = 1", rl.changed == 1, rl.changed)
  ok("设语言：回读一致并带回歌词", rl.applied[1].language == "english" and type(rl.applied[1].lyrics) == "string",
     tostring(rl.applied[1].lyrics))
  ok("设语言：failed 为空", #rl.failed == 0, rl.failed[1] and rl.failed[1].reason)
  local after = OPS.get_lyrics_attrs({})
  ok("设语言：整组读回已生效", after.notes[2].languageOverride == "english", after.notes[2].languageOverride)
  ok("设语言：没动的音符仍是继承", after.notes[1].languageOverride == "" and after.notes[3].languageOverride == "")

  -- 越界必须报 failed（协议 0 起 / 宿主 1 起，最容易错的地方）
  local rb = OPS.set_note_languages({ items = { { index = 3, language = "english" } } })
  ok("设语言：越界 ⇒ changed = 0 且写进 failed", rb.changed == 0 and #rb.failed == 1, rb.failed[1] and rb.failed[1].reason)
  ok("设语言：越界原因写明组内音符数", tostring(rb.failed[1].reason):find("越界") ~= nil, rb.failed[1].reason)

  -- 标声调（用户订正：1 阴平 / 2 阳平 / 3 上声 / 4 去声 / 5 轻声）
  local rt = OPS.set_note_rap_accents({ items = { { index = 0, accent = "3" }, { index = 2, accent = 5 } } })
  ok("标声调：changed = 2", rt.changed == 2, rt.changed)
  ok("标声调：数字 5 被当字符串处理（轻声）", rt.applied[2].accent == "5", rt.applied[2].accent)
  local after2 = OPS.get_lyrics_attrs({})
  ok("标声调：整组读回一致", after2.notes[1].rapAccent == "3" and after2.notes[3].rapAccent == "5",
     tostring(after2.notes[1].rapAccent) .. "/" .. tostring(after2.notes[3].rapAccent))
  local rt2 = OPS.set_note_rap_accents({ items = { { index = 9, accent = "1" } } })
  ok("标声调：越界 ⇒ failed", rt2.changed == 0 and #rt2.failed == 1, rt2.failed[1] and rt2.failed[1].reason)

  -- 手动音素（说唱咬字）：写读回 + 越界
  local rp = OPS.set_note_phonemes({ items = { { index = 0, phonemes = "hh ah" } } })
  ok("写音素：changed = 1 且回读一致", rp.changed == 1 and rp.applied[1].phonemes == "hh ah", rp.applied[1])
  local after3 = OPS.get_lyrics_attrs({})
  ok("写音素：整组读回 phonemes 字段", after3.notes[1].phonemes == "hh ah", tostring(after3.notes[1].phonemes))
  local rp2 = OPS.set_note_phonemes({ items = { { index = 7, phonemes = "a" } } })
  ok("写音素：越界 ⇒ failed", rp2.changed == 0 and #rp2.failed == 1, rp2.failed[1] and rp2.failed[1].reason)
  ok("写音素：空 items ⇒ 报错", pcall(OPS.set_note_phonemes, {}) == false)

  -- 缺参必须报错（不是静默成功）
  local okE1 = pcall(OPS.set_note_languages, {})
  local okE2 = pcall(OPS.set_note_rap_accents, { items = {} })
  ok("空 items ⇒ 报错", okE1 == false and okE2 == false)
end

section("op: set_note_phoneme_attrs / set_note_dur（A：辅音抢前一个音符 · 2026-09-18）")
do
  local la = OPS.get_lyrics_attrs({})
  ok("读整组：带 phonemeAttrs 字段", type(la.notes[1].phonemeAttrs) == "table", type(la.notes[1].phonemeAttrs))
  ok("读整组：带 durationQuarter", type(la.notes[1].durationQuarter) == "number", la.notes[1].durationQuarter)

  -- SV2：写音素属性整数组（辅音 leftOffset 收边）
  local r1 = OPS.set_note_phoneme_attrs({ items = { { index = 0, phonemes = { { leftOffset = -0.05, strength = 0.5 } } } } })
  ok("写音素属性：changed = 1", r1.changed == 1, r1.changed)
  ok("写音素属性：带 before/after 计数", r1.applied[1].afterCount == 1, r1.applied[1].afterCount)
  local after = OPS.get_lyrics_attrs({})
  ok("写音素属性：读回 leftOffset = -0.05", after.notes[1].phonemeAttrs[1] and after.notes[1].phonemeAttrs[1].leftOffset == -0.05,
     after.notes[1].phonemeAttrs[1] and after.notes[1].phonemeAttrs[1].leftOffset)
  local rb = OPS.set_note_phoneme_attrs({ items = { { index = 5, phonemes = { {} } } } })
  ok("写音素属性：越界 ⇒ failed", rb.changed == 0 and #rb.failed == 1, rb.failed[1] and rb.failed[1].reason)
  ok("写音素属性：空 items ⇒ 报错", pcall(OPS.set_note_phoneme_attrs, {}) == false)

  -- SV1：写 dur 比例数组
  local r2 = OPS.set_note_dur({ items = { { index = 1, dur = { 0.65, 1 } } } })
  ok("写 dur：changed = 1 且回读 \"0.65,1\"", r2.changed == 1 and r2.applied[1].dur == "0.65,1", r2.applied[1] and r2.applied[1].dur)
  local after2 = OPS.get_lyrics_attrs({})
  ok("写 dur：读回 dur 数组（第 1 项 = 0.65）", type(after2.notes[2].dur) == "table" and after2.notes[2].dur[1] == 0.65,
     type(after2.notes[2].dur) == "table" and after2.notes[2].dur[1] or "nil")
  local r2b = OPS.set_note_dur({ items = { { index = 9, dur = { 0.5 } } } })
  ok("写 dur：越界 ⇒ failed", r2b.changed == 0 and #r2b.failed == 1, r2b.failed[1] and r2b.failed[1].reason)
end

section("P7：布局报告（重叠=违规 · 缝隙=允许但告知）+ 写守卫")
do
  ok("导出 LAYOUT.scan", type(B.LAYOUT) == "table" and type(B.LAYOUT.scan) == "function")
  local rl = OPS.get_layout({})
  ok("op: get_layout 只读可用（current = true）", rl.current == true and type(rl.overlapCount) == "number", rl.current)
  local ref = H.state.currentGroupRef
  local grp = ref:getTarget()
  local r0 = B.LAYOUT.scan(grp)
  ok("连续组：无重叠无缝隙", r0.overlapCount == 0 and r0.gapCount == 0,
     tostring(r0.overlapCount) .. "/" .. tostring(r0.gapCount))
  ok("策略文本写明「缝隙=允许（要告知）」", type(r0.policy) == "table" and tostring(r0.policy.gap):find("允许") ~= nil)
  grp:getNote(3):setOnset(2 * Q + math.floor(Q / 32))   -- 1/32 拍 ⇒ 属于"短缝"（≤1/16 拍）
  local r1 = B.LAYOUT.scan(grp)
  ok("留缝 ⇒ gapCount = 1（允许但必须告知）", r1.gapCount == 1 and r1.overlapCount == 0,
     tostring(r1.gapCount) .. "/" .. tostring(r1.overlapCount))
  ok("≤1/16 拍 ⇒ 记进 smallGaps", r1.smallGapCount == 1, tostring(r1.smallGapCount))
  grp:getNote(3):setOnset(math.floor(Q * 1.5))
  local r2 = B.LAYOUT.scan(grp)
  ok("重叠 ⇒ overlapCount = 1（违规，必须报）", r2.overlapCount == 1, tostring(r2.overlapCount))
  grp:getNote(3):setOnset(2 * Q)
  local r3 = B.LAYOUT.scan(grp)
  ok("复原后回到 0/0", r3.overlapCount == 0 and r3.gapCount == 0)
  local okG, res = pcall(B.dispatch, "set_note_languages", { items = { { index = 0, language = "english" } } })
  ok("SV1：写守卫不拦截（放行）", okG == true and type(res) == "table" and res.changed == 1,
     okG and (type(res) == "table" and res.changed or "n/a") or tostring(res))

  -- ── 2026-09-20 真机（IX 1.0.1）踩到两条，这里补回归 ──
  -- ① 柱式和弦（同 onset）曾被判成"重叠违规"：真机 4 小节柱式报了 6 处，而策略文案要求"必须报给用户"
  --    ⇒ agent 会把正常和弦当违规去"修"。同 onset 是**和弦/齐奏**，任何宿主都允许（旧判据见 0.3.17）。
  grp:getNote(3):setOnset(Q)                       -- 与第 2 音同 onset
  local rc = B.LAYOUT.scan(grp)
  ok("★ 同 onset（和弦）**不算重叠** ⇒ overlapCount = 0", rc.overlapCount == 0, tostring(rc.overlapCount))
  ok("★ 同 onset 记进 chordCount", rc.chordCount == 1, tostring(rc.chordCount))
  grp:getNote(3):setOnset(math.floor(Q * 1.5))     -- 错位重叠（后音起在前音内部）
  local ro = B.LAYOUT.scan(grp)
  ok("错位重叠**仍然**判为重叠（没被一起放宽掉）", ro.overlapCount == 1, tostring(ro.overlapCount))
  ok("错位重叠时 chordCount = 0", ro.chordCount == 0, tostring(ro.chordCount))

  -- ② 重叠是否"违规"取决于宿主：**IX 允许重叠**（用户 2026-09-20 明确）；SV 侧仍判违规
  local savedHost, savedIsSV2 = B.ST.host, B.ST.isSV2
  B.ST.host, B.ST.isSV2 = "ix", true
  local rix = B.LAYOUT.scan(grp)
  ok("★ IX：overlapAllowedByHost = true", rix.overlapAllowedByHost == true, tostring(rix.overlapAllowedByHost))
  ok("★ IX：策略文案写明「IX 允许」", tostring(rix.policy.overlap):find("IX 允许") ~= nil,
     tostring(rix.policy.overlap))
  ok("IX：重叠仍如实**计数**（只是不判违规）", rix.overlapCount == 1, tostring(rix.overlapCount))
  -- ②' 写守卫文案必须**按宿主**出名字（真机上 IX 报的是"SV2 主组"，误导）
  local okIx, resIx = pcall(B.dispatch, "set_note_languages", { items = { { index = 0, language = "english" } } })
  ok("★ IX：写守卫拦截，且文案报「Instrument X 主组」",
     okIx == false and tostring(resIx):find("Instrument X 主组") ~= nil, tostring(resIx))
  ok("★ IX：不再出现「SV2 主组」字样", tostring(resIx):find("SV2 主组") == nil, tostring(resIx))
  B.ST.host = "sv"                                 -- isSV2 仍为 true ⇒ 同一条守卫，只换名字
  local okSv, resSv = pcall(B.dispatch, "set_note_languages", { items = { { index = 0, language = "english" } } })
  ok("★ SV2：文案报「SV2 主组」", okSv == false and tostring(resSv):find("SV2 主组") ~= nil, tostring(resSv))
  B.ST.host, B.ST.isSV2 = savedHost, savedIsSV2
  grp:getNote(3):setOnset(2 * Q)                   -- 复原，别影响后续
  local rf = B.LAYOUT.scan(grp)
  ok("复原后回到 0/0/0 且策略按宿主恢复",
     rf.overlapCount == 0 and rf.gapCount == 0 and rf.chordCount == 0 and rf.overlapAllowedByHost == false,
     tostring(rf.overlapCount) .. "/" .. tostring(rf.gapCount) .. "/" .. tostring(rf.chordCount))
end

section("宿主版本检测（0.3.21 · 唯一保留的『危险 API』防线）")
do
  -- 用户 2026-09-20 指示：清掉"禁调用"痕迹，只留一道**版本检测** —— 探到 IX 1.0.0 就让用户先升级。
  -- 判据 = CFG.hostIsOutdated(host, verNum)；1.0.0 = 65536，1.0.1 = 65537。
  ok("★ IX 1.0.0(65536) ⇒ 判为过旧", B.CFG.hostIsOutdated("ix", 65536) == true,
     tostring(B.CFG.hostIsOutdated("ix", 65536)))
  ok("★ IX 1.0.1(65537) ⇒ 不过旧（读点类 API 已可用）", B.CFG.hostIsOutdated("ix", 65537) == false,
     tostring(B.CFG.hostIsOutdated("ix", 65537)))
  -- 负向①：SV 与本条无关，任何版本都不许报过旧（否则会在 SV 上瞎提示）
  ok("★ 负向：SV 任何版本都不判过旧",
     B.CFG.hostIsOutdated("sv", 100) == false and B.CFG.hostIsOutdated("sv", 131585) == false,
     tostring(B.CFG.hostIsOutdated("sv", 100)) .. "/" .. tostring(B.CFG.hostIsOutdated("sv", 131585)))
  -- 负向②：版本号拿不到（0 / nil / 非数字）时不许误报
  ok("★ 负向：版本号拿不到 ⇒ 不误报",
     B.CFG.hostIsOutdated("ix", 0) == false and B.CFG.hostIsOutdated("ix", nil) == false
     and B.CFG.hostIsOutdated("ix", "abc") == false,
     tostring(B.CFG.hostIsOutdated("ix", 0)) .. "/" .. tostring(B.CFG.hostIsOutdated("ix", nil)))
  -- 载荷如实回传：agent 靠 ping/心跳里的这两个字段决定"先让用户升级"
  local p0 = B.OPS.ping({})
  ok("★ ping 载荷含 hostOutdated 字段（默认 false）", p0.hostOutdated == false, tostring(p0.hostOutdated))
  ok("★ ping 载荷含 hostWarning 字段（默认 nil）", p0.hostWarning == nil, tostring(p0.hostWarning))
  local sh, sd, sw = B.ST.host, B.ST.hostOutdated, B.ST.hostWarning
  B.ST.host, B.ST.hostOutdated, B.ST.hostWarning = "ix", true, "⚠️ 测试用提示"
  local p1 = B.OPS.ping({})
  ok("★ ping 如实回传 hostOutdated = true", p1.hostOutdated == true, tostring(p1.hostOutdated))
  ok("★ ping 如实回传 hostWarning 原文", p1.hostWarning == "⚠️ 测试用提示", tostring(p1.hostWarning))
  B.ST.host, B.ST.hostOutdated, B.ST.hostWarning = sh, sd, sw
end

section("装饰音 ORN 计划器（纯函数 · 8 型 · 2026-09-23 新增）")
do
  local ORN = B.ORN
  ok("导出了 ORN 计划器", ORN ~= nil and type(ORN.plan) == "function")
  ok("八个 kind 全在 DEF 里", #ORN.KINDS == 8, #ORN.KINDS)
  -- 风格档（照 07 §1.7 的分档表：通俗系 1.5 / 民族·戏曲·美声·通用 2）
  ok("★ 通俗系默认音程 1.5", ORN.intervalFor("pop") == 1.5, tostring(ORN.intervalFor("pop")))
  ok("★ 民族默认音程 2", ORN.intervalFor("minzu") == 2, tostring(ORN.intervalFor("minzu")))
  ok("显式 interval 覆盖风格档", ORN.intervalFor("pop", 3) == 3, tostring(ORN.intervalFor("pop", 3)))
  ok("未知风格回落 2", ORN.intervalFor("nope") == 2, tostring(ORN.intervalFor("nope")))

  local ctx = { onsetQ = 1, durQ = 1, pitch = 65, nextPitch = 67 }

  -- ① 前倚音：默认**下方**（用户 2026-09-23 裁定）、默认 0.125 拍
  local p = ORN.plan(ctx, { kind = "graceFront" })
  ok("前倚音 ok", p.ok == true, p.reason)
  ok("前倚音切两段", #p.segs == 2, #p.segs)
  ok("★ 前倚音默认在**下方**（65−2=63）", p.segs[1].pitch == 63, tostring(p.segs[1].pitch))
  ok("前倚音：aux 在前 + 承接原词", p.segs[1].role == "aux" and p.segs[1].lyric == "keep")
  ok("★ 前倚音：main 起点后移 0.125", math.abs(p.segs[2].onsetQ - 1.125) < 1e-9, tostring(p.segs[2].onsetQ))
  ok("★ 前倚音：main 时值 0.875", math.abs(p.segs[2].durQ - 0.875) < 1e-9, tostring(p.segs[2].durQ))
  ok("★ 前倚音：过渡处写 dF0Left = 1.0（默认）", p.segs[2].attrs.dF0Left == 1.0,
     tostring(p.segs[2].attrs.dF0Left))
  ok("前倚音：dir 可改成上方（65+2=67）", ORN.plan(ctx, { kind = "graceFront", dir = "above" }).segs[1].pitch == 67)
  ok("前倚音：显式 df 覆盖默认", ORN.plan(ctx, { kind = "graceFront", df = 0.5 }).segs[2].attrs.dF0Left == 0.5)
  ok("前倚音：时值不足 ⇒ ok=false + 原因",
     ORN.plan({ onsetQ = 0, durQ = 0.1, pitch = 60 }, { kind = "graceFront" }).ok == false)

  -- 向上尖尖：形状同前倚音，但**默认在上方、更短**
  local sp = ORN.plan(ctx, { kind = "spikeUp" })
  ok("★ 上尖默认在**上方**", sp.segs[1].pitch == 67, tostring(sp.segs[1].pitch))
  ok("★ 上尖比前倚音更短（0.0625 < 0.125）", sp.segs[1].durQ == 0.0625, tostring(sp.segs[1].durQ))

  -- ③ 后倚音：音高取**后一音**；无后音则本音 ∓ iv
  local gb = ORN.plan(ctx, { kind = "graceBack" })
  ok("后倚音切两段", #gb.segs == 2, #gb.segs)
  ok("★ 后倚音音高取**后一音**（67）", gb.segs[2].pitch == 67, tostring(gb.segs[2].pitch))
  ok("后倚音：main 在前且承接原词", gb.segs[1].role == "main" and gb.segs[1].lyric == "keep")
  ok("后倚音：aux 在后且歌词 '-'", gb.segs[2].role == "aux" and gb.segs[2].lyric == "-")
  local gb2 = ORN.plan({ onsetQ = 0, durQ = 1, pitch = 65 }, { kind = "graceBack" })
  ok("★ 无后音 ⇒ 本音 ∓ iv（65−2=63）", gb2.segs[2].pitch == 63, tostring(gb2.segs[2].pitch))

  -- 波音：主-邻-主
  local mo = ORN.plan(ctx, { kind = "mordent" })
  ok("波音切三段", #mo.segs == 3, #mo.segs)
  ok("★ 波音：主-上邻-主", mo.segs[1].pitch == 65 and mo.segs[2].pitch == 67 and mo.segs[3].pitch == 65,
     tostring(mo.segs[1].pitch) .. "/" .. tostring(mo.segs[2].pitch) .. "/" .. tostring(mo.segs[3].pitch))
  ok("波音：只有第一段承接原词", mo.segs[1].lyric == "keep" and mo.segs[2].lyric == "-" and mo.segs[3].lyric == "-")
  -- ★ 2026-09-23 真机发现：**main 要给最长的那段**（否则原音符退化成短头、尾段变新建音符）
  ok("★ 波音：main 是**尾段**（最长，原音符留给它）",
     mo.segs[1].role == "aux" and mo.segs[2].role == "aux" and mo.segs[3].role == "main",
     mo.segs[1].role .. "/" .. mo.segs[2].role .. "/" .. mo.segs[3].role)
  ok("★ 波音 dir=below ⇒ 下波音（65/63/65）",
     ORN.plan(ctx, { kind = "mordent", dir = "below" }).segs[2].pitch == 63)

  -- 回音：主-上邻-主-下邻-主
  local tu = ORN.plan(ctx, { kind = "turn" })
  ok("回音切五段", #tu.segs == 5, #tu.segs)
  ok("★ 回音：主-上邻-主-下邻-主",
     tu.segs[1].pitch == 65 and tu.segs[2].pitch == 67 and tu.segs[3].pitch == 65
     and tu.segs[4].pitch == 63 and tu.segs[5].pitch == 65,
     tostring(tu.segs[1].pitch) .. "/" .. tostring(tu.segs[4].pitch))
  ok("★ 回音：main 是**尾段**（最长）",
     tu.segs[5].role == "main" and tu.segs[1].role == "aux" and tu.segs[4].role == "aux",
     tu.segs[1].role .. "/" .. tu.segs[4].role .. "/" .. tu.segs[5].role)
  ok("★ 回音：只有**第一段**承接原词（角色与歌词互不绑定）",
     tu.segs[1].lyric == "keep" and tu.segs[5].lyric == "-", tu.segs[1].lyric .. "/" .. tu.segs[5].lyric)

  -- ⑤ 音尾音阶行进：尾部 steps 段、逐段 −iv
  local tr = ORN.plan(ctx, { kind = "tailRun", steps = 3 })
  ok("音尾行进切 1+3 段", #tr.segs == 4, #tr.segs)
  ok("★ 音尾行进：逐段递减 63/61/59",
     tr.segs[2].pitch == 63 and tr.segs[3].pitch == 61 and tr.segs[4].pitch == 59,
     tostring(tr.segs[2].pitch) .. "/" .. tostring(tr.segs[3].pitch) .. "/" .. tostring(tr.segs[4].pitch))
  ok("音尾行进：steps 封顶 5", #ORN.plan(ctx, { kind = "tailRun", steps = 99 }).segs == 6)
  ok("音尾行进：steps 下限 2", #ORN.plan(ctx, { kind = "tailRun", steps = 0 }).segs == 3)

  -- 属性类：不切音符
  local an = ORN.plan(ctx, { kind = "anticipate" })
  ok("★ anticipate **不切音符**（无 segs、只回 attrs）", #an.segs == 0 and type(an.attrs) == "table",
     #an.segs)
  ok("★ anticipate：dF0Left 取**反方向**（SV1：负）", an.attrs.dF0Left == -1.0, tostring(an.attrs.dF0Left))
  local sl = ORN.plan(ctx, { kind = "slide" })
  ok("★ slide：只改音头时长 tF0Left = 0.25", #sl.segs == 0 and sl.attrs.tF0Left == 0.25,
     tostring(sl.attrs and sl.attrs.tF0Left))
  ok("未知 kind ⇒ ok=false", ORN.plan(ctx, { kind = "nope" }).ok == false)
end

section("op: apply_ornaments（拆音符 · 真机已验证的做法）")
do
  H.selection:clearNotes()
  local g = H.target(1, 1)
  local n0 = g:getNumNotes()          -- 3（67/69/71，各 1 拍）

  -- ① 默认 dryRun：只出计划、不碰工程
  local r = OPS.apply_ornaments({ ornament = "graceFront", indices = { 0 } })
  ok("★ 默认 dryRun（真写要显式 false）", r.dryRun == true, tostring(r.dryRun))
  ok("dryRun 不动音符数", g:getNumNotes() == n0, g:getNumNotes())
  ok("dryRun 有 plan（两段）", type(r.plans[1]) == "table" and #r.plans[1].segs == 2, #r.plans[1].segs)
  ok("dryRun changed = 1 / failed = 0", r.changed == 1 and #r.failed == 0, tostring(r.changed))

  -- ② 真写前倚音（⚠️ 前面若干段落已改过本组歌词 ⇒ 原词要**现取**，不能硬编码 "la"）
  local origLyric = g:getNote(1):getLyrics()
  local r2 = OPS.apply_ornaments({ ornament = "graceFront", indices = { 0 }, dryRun = false })
  ok("写入 changed = 1", r2.changed == 1 and #r2.failed == 0, tostring(r2.changed))
  ok("★ 组内音符 3 → 4", g:getNumNotes() == n0 + 1, g:getNumNotes())
  local m = g:getNote(1)
  ok("★ 主音：起点后移 0.125 拍", m:getOnset() == math.floor(0.125 * Q + 0.5), tostring(m:getOnset()))
  ok("★ 主音：时值 0.875 拍", m:getDuration() == math.floor(0.875 * Q + 0.5), tostring(m:getDuration()))
  ok("★ 主音：歌词改 '-'（延音）", m:getLyrics() == "-", tostring(m:getLyrics()))
  ok("★ 主音：真的写进了 dF0Left = 1.0", m:getAttributes().dF0Left == 1.0,
     tostring(m:getAttributes().dF0Left))
  local gr = g:getNote(n0 + 1)
  ok("★ 新音符：音高 = 本音 − 大二度（65）", gr:getPitch() == 65, tostring(gr:getPitch()))
  ok("★ 新音符：承接原歌词（='" .. origLyric .. "'）", gr:getLyrics() == origLyric, tostring(gr:getLyrics()))
  ok("新音符：落在主音前面（onset 0）", gr:getOnset() == 0, tostring(gr:getOnset()))

  -- ③ manual:true 才转手动音高（默认不碰 autoMode —— 用户 2026-09-23：新音符默认自动音高够用）
  local mark = #H.calls
  OPS.apply_ornaments({ ornament = "graceFront", indices = { 1 }, dryRun = false })
  local sawAutoDefault = false
  for i = mark + 1, #H.calls do if H.calls[i] == "note.setPitchAutoMode" then sawAutoDefault = true end end
  ok("★ 默认**不**改 autoMode（新音符走自动音高）", sawAutoDefault == false)
  mark = #H.calls
  OPS.apply_ornaments({ ornament = "graceFront", indices = { 1 }, dryRun = false, manual = true })
  local sawManual = false
  for i = mark + 1, #H.calls do if H.calls[i] == "note.setPitchAutoMode" then sawManual = true end end
  ok("★ manual:true ⇒ 调 setPitchAutoMode", sawManual == true)

  -- ④ 属性类：不新建音符
  local beforeN = g:getNumNotes()
  local ra = OPS.apply_ornaments({ ornament = "anticipate", indices = { 0 }, dryRun = false })
  ok("anticipate：changed = 1", ra.changed == 1, tostring(ra.changed))
  ok("★ 属性类**不新建音符**", g:getNumNotes() == beforeN, g:getNumNotes())
  ok("★ anticipate 写进反方向 dF0Left（−1.0）", m:getAttributes().dF0Left == -1.0,
     tostring(m:getAttributes().dF0Left))
  OPS.apply_ornaments({ ornament = "slide", indices = { 0 }, dryRun = false })
  ok("★ slide 写进 tF0Left = 0.25", m:getAttributes().tF0Left == 0.25, tostring(m:getAttributes().tF0Left))

  -- ⑤ 时值不足：如实报原因、不硬切
  local rf = OPS.apply_ornaments({ ornament = "mordent", indices = { 0 },
                                   len = 0.5, headLen = 0.5, dryRun = false })
  ok("★ 波音时值不足 ⇒ failed + 原因", #rf.failed == 1 and type(rf.failed[1].reason) == "string",
     rf.failed[1] and rf.failed[1].reason)

  -- ⑥ SV2：属性路线如实报不支持（拆分型不受影响）
  local sv = B.ST.isSV2
  B.ST.isSV2 = true
  local r2sv = OPS.apply_ornaments({ ornament = "anticipate", indices = { 0 }, dryRun = false })
  ok("★ SV2：属性路线如实报「仅 SV1」",
     #r2sv.failed == 1 and r2sv.failed[1].reason:find("仅 SV1", 1, true) ~= nil,
     r2sv.failed[1] and r2sv.failed[1].reason)
  local r3sv = OPS.apply_ornaments({ ornament = "graceFront", indices = { 2 }, dryRun = true })
  ok("★ SV2：拆分型照做（dryRun 出计划）", r3sv.changed == 1 and #r3sv.plans > 0, tostring(r3sv.changed))
  B.ST.isSV2 = sv

  -- ⑦ 参数校验
  ok("未知 ornament ⇒ 报错", pcall(OPS.apply_ornaments, { ornament = "nope" }) == false)
  ok("缺 ornament ⇒ 报错", pcall(OPS.apply_ornaments, {}) == false)
end

section("op: set_automation（写点 + 单点回读 · 2026-09-23 新增）")
do
  H.selection:clearNotes()
  local g = H.target(1, 1)

  local r = OPS.set_automation({ parameter = "voicing",
                                 points = { { onsetQuarter = 0.125, value = 2 } }, dryRun = true })
  ok("默认/显式 dryRun：不写", r.dryRun == true and r.written == 1, tostring(r.written))
  ok("★ 写前按取值域 clamp（voicing 上限 1）", r.applied[1].value == 1 and r.applied[1].clamped == true,
     tostring(r.applied[1].value))

  local r2 = OPS.set_automation({ parameter = "voicing",
                                  points = { { onsetQuarter = 0.125, value = 0.5 } }, dryRun = false })
  ok("写入后**单点回读**一致（Automation#get）", r2.applied[1].readBack == 0.5,
     tostring(r2.applied[1].readBack))
  ok("★ 回读用的 blick 正确（0.125 拍）", r2.applied[1].onsetQuarter == 0.125)

  local r3 = OPS.set_automation({ parameter = "tension",
                                  points = { { onsetQuarter = 0, value = -5 } }, dryRun = true })
  ok("★ tension clamp 到 −1", r3.applied[1].value == -1, tostring(r3.applied[1].value))
  local r4 = OPS.set_automation({ parameter = "vocalMode_Soft",
                                  points = { { onsetQuarter = 0, value = 999 } }, dryRun = true })
  ok("★ vocalMode_* 走 0~150 的域", r4.applied[1].value == 150, tostring(r4.applied[1].value))
  local r5 = OPS.set_automation({ parameter = "loudness",
                                  points = { { onsetQuarter = 0, value = 99 } }, dryRun = true })
  ok("★ loudness clamp 到 12 dB", r5.applied[1].value == 12, tostring(r5.applied[1].value))
  local r6 = OPS.set_automation({ parameter = "vocalMode_Soft",
                                  points = { { onsetQuarter = 0, value = 1 } }, dryRun = true })
  ok("回包带 range（供调用方核对量纲）", r6.range ~= nil and r6.range[1] == 0 and r6.range[2] == 150,
     tostring(r6.range and r6.range[1]))
  ok("★ 参数名不在宿主/假宿主的清单里 ⇒ 报错、**不盲写**",
     pcall(OPS.set_automation, { parameter = "unknownParam", points = { { onsetQuarter = 0, value = 1 } } }) == false)

  ok("未知参数名 ⇒ getParameter 返回 nil ⇒ 报错",
     pcall(OPS.set_automation, { parameter = "nope", points = { { onsetQuarter = 0, value = 0 } } }) == false)
  ok("缺 points ⇒ 报错", pcall(OPS.set_automation, { parameter = "voicing" }) == false)
  ok("点里缺 onsetQuarter/value ⇒ 报错（无可用点）",
     pcall(OPS.set_automation, { parameter = "voicing", points = { { value = 1 } } }) == false)

  -- ⛔ 离线防线：假宿主**故意不提供** crash 清单上的方法 ⇒ 桥若误调，这里会立刻红
  local auto = g:getParameter("voicing")
  ok("★ 假宿主的 Automation 不提供 getPoints（crash 清单）", auto.getPoints == nil)
  ok("★ 假宿主的 Automation 不提供 getAllPoints（crash 清单）", auto.getAllPoints == nil)
  ok("★ 假宿主的 Automation 不提供 getLinear（crash 清单）", auto.getLinear == nil)
  ok("★ 假宿主的 Automation 不提供 getDefinition（crash 清单）", auto.getDefinition == nil)
  ok("★ 假宿主的 Automation 确实提供 add / get（安全那一面）",
     type(auto.add) == "function" and type(auto.get) == "function")
end

section("配套动态 dyn（§2.5 · **形状必须闭合** · 2026-09-23）")
do
  local ORN = B.ORN
  local ctx = { onsetQ = 1, durQ = 1, pitch = 65, nextPitch = 67 }

  ok("★ 只有三种装饰配动态（§2.5）：前倚音/上尖=发声 · 后倚音/行进=响度",
     ORN.dynParam("graceFront") == "voicing" and ORN.dynParam("spikeUp") == "voicing"
     and ORN.dynParam("graceBack") == "loudness" and ORN.dynParam("tailRun") == "loudness",
     tostring(ORN.dynParam("graceFront")) .. "/" .. tostring(ORN.dynParam("graceBack")))
  ok("★ 波音/回音/反向预备/滑音**不配**动态",
     ORN.dynParam("mordent") == nil and ORN.dynParam("turn") == nil
     and ORN.dynParam("anticipate") == nil and ORN.dynParam("slide") == nil)

  local c1, k1 = ORN.clampValue("voicing", 5)
  ok("clampValue：发声域 0~1（超上限夹住并标记）", c1 == 1 and k1 == true, tostring(c1))
  local c2, k2 = ORN.clampValue("loudness", -99)
  ok("clampValue：响度域 −48~12", c2 == -48 and k2 == true, tostring(c2))
  local c3, k3 = ORN.clampValue("notAParam", 7)
  ok("clampValue：未收录参数不动它", c3 == 7 and k3 == false, tostring(c3))

  -- ① 前倚音挖坑：3 点、**首尾都回基线**
  local pp = ORN.dynPlan("graceFront", ORN.plan(ctx, { kind = "graceFront" }), 1.0)
  ok("前倚音 dyn = 三点", #pp.points == 3, #pp.points)
  ok("★ 坑在**发声**上", pp.param == "voicing", pp.param)
  ok("★ **形状闭合**：首尾都等于基线",
     pp.points[1].value == 1.0 and pp.points[3].value == 1.0,
     tostring(pp.points[1].value) .. "/" .. tostring(pp.points[3].value))
  ok("★ 坑底 = 基线 −0.25（发声往下 = 更像「哑一下」）",
     math.abs(pp.points[2].value - 0.75) < 1e-9, tostring(pp.points[2].value))
  ok("坑底落在装饰音中点", math.abs(pp.points[2].onsetQuarter - 1.0625) < 1e-9, tostring(pp.points[2].onsetQuarter))
  ok("★ dyn 计划字段名 = `onsetQuarter`（0.3.29 统一；0.3.28 漏出内部名 `onsetQ`）",
     pp.points[1].onsetQ == nil and pp.points[1].onsetQuarter ~= nil, tostring(pp.points[1].onsetQ))

  -- ③ 后倚音尾部渐弱：不是坑，是**一路淡出**再回基线
  local pb = ORN.dynPlan("graceBack", ORN.plan(ctx, { kind = "graceBack" }), 0)
  ok("★ 后倚音 dyn 在**响度**上", pb.param == "loudness", pb.param)
  ok("★ 渐弱到底 = 基线 −2 dB", math.abs(pb.points[#pb.points - 1].value + 2) < 1e-9,
     tostring(pb.points[#pb.points - 1].value))
  ok("★ 渐弱**闭合**（末尾回到基线 0）", pb.points[#pb.points].value == 0,
     tostring(pb.points[#pb.points].value))

  -- ⑤ 音尾行进：每步递减（−1.5 dB/步）＋ 收尾闭合
  local pt = ORN.dynPlan("tailRun", ORN.plan(ctx, { kind = "tailRun", steps = 3 }), 0)
  ok("★ 行进 dyn = 锚点 + 3 步 + 收尾 = 5 点", #pt.points == 5, #pt.points)
  ok("★ 每步递减 −1.5 dB",
     math.abs(pt.points[2].value + 1.5) < 1e-9 and math.abs(pt.points[3].value + 3) < 1e-9
     and math.abs(pt.points[4].value + 4.5) < 1e-9,
     tostring(pt.points[2].value) .. "/" .. tostring(pt.points[3].value) .. "/" .. tostring(pt.points[4].value))
  ok("★ 行进**闭合**（收尾回基线）", pt.points[5].value == 0, tostring(pt.points[5].value))

  ok("dynDepth / dynStep 可覆盖默认",
     math.abs(ORN.dynPlan("graceFront", ORN.plan(ctx, { kind = "graceFront" }), 1.0,
                          { dynDepth = -0.1 }).points[2].value - 0.9) < 1e-9)
end

section("op: apply_ornaments + dyn（真机发现的『一个点会平掉整组』对策）")
do
  H.selection:clearNotes()
  local g = H.target(1, 1)

  -- dyn 的 dryRun：会给动态计划 + **基线读数**
  -- ⚠️ 基线要**相对**断言：本文件前面的 set_automation 段已经在假宿主里留下过点，
  --    所以那一处的 voicing 基线不一定是默认 1（这正是"先读基线"存在的理由）。
  local callsBefore = #H.calls
  local r = OPS.apply_ornaments({ ornament = "graceFront", indices = { 0 }, dyn = true })
  ok("★ dyn=true 的 dryRun 带动态计划", r.applied[1].dyn ~= nil and #r.applied[1].dyn.plan.points == 3,
     r.applied[1].dyn and #r.applied[1].dyn.plan.points)
  ok("★ 计划带**基线读数**（先读后写）", type(r.applied[1].dyn.base) == "number",
     tostring(r.applied[1].dyn.base))
  ok("★ 坑底 = 基线 −0.25（相对基线，不是写死 1）",
     math.abs(r.applied[1].dyn.plan.points[2].value - (r.applied[1].dyn.base - 0.25)) < 1e-9,
     tostring(r.applied[1].dyn.plan.points[2].value))
  ok("dryRun 不写自动化（没有新的 auto.add）", (function()
    for i = callsBefore + 1, #H.calls do if H.calls[i] == "auto.add" then return false end end
    return true
  end)())

  -- 真写：拆音符 + 写动态（同一条 undo 记录）
  local before = #H.calls
  local r2 = OPS.apply_ornaments({ ornament = "graceFront", indices = { 0 }, dyn = true, dryRun = false })
  local dynInfo = r2.applied[1].dyn
  ok("★ dyn 真写：3 个点都回读到了", dynInfo ~= nil and dynInfo.written == 3, dynInfo and dynInfo.written)
  ok("★ 回读值与写入一致（Automation#get 单点）",
     math.abs(dynInfo.points[1].readBack - dynInfo.base) < 1e-6
     and math.abs(dynInfo.points[2].readBack - (dynInfo.base - 0.25)) < 1e-6,
     tostring(dynInfo.points[1].readBack) .. "/" .. tostring(dynInfo.points[2].readBack))
  ok("★ 形状闭合：首尾回读都等于基线",
     math.abs(dynInfo.points[1].readBack - dynInfo.base) < 1e-6
     and math.abs(dynInfo.points[3].readBack - dynInfo.base) < 1e-6,
     tostring(dynInfo.points[3].readBack))
  local sawAdd = false
  for i = before + 1, #H.calls do if H.calls[i] == "auto.add" then sawAdd = true end end
  ok("确实调了 Automation#add", sawAdd == true)

  -- 不配动态的型：dyn=true 也不写
  local r3 = OPS.apply_ornaments({ ornament = "mordent", indices = { 2 }, dyn = true, dryRun = false })
  ok("波音 dyn=true ⇒ dyn 段为 nil（§2.5 没给它配动态）", r3.applied[1].dyn == nil,
     tostring(r3.applied[1].dyn))
end

section("op: set_automation 的 **probe**（只读采样 · 不写、不建 undo）")
do
  H.selection:clearNotes()
  local g = H.target(1, 1)
  local u0 = H.undoCount or 0

  local r = OPS.set_automation({ parameter = "voicing", probe = { 0, 0.125, 3.5 } })
  ok("★ probe 模式：mode = probe", r.mode == "probe", tostring(r.mode))
  ok("★ probe 回三个采样", #r.samples == 3 and r.samples[1].value ~= nil, #r.samples)
  ok("★ 没写工程（undo 计数不变）", (H.undoCount or 0) == u0, tostring(H.undoCount))
  ok("probe 元素非数字 ⇒ 如实报", (function()
    local rr = OPS.set_automation({ parameter = "voicing", probe = { "x" } })
    return rr.samples[1].reason ~= nil
  end)())

  -- 写过之后再 probe：读到的是写进去的值
  OPS.set_automation({ parameter = "tension", points = { { onsetQuarter = 2, value = 0.4 } }, dryRun = false })
  local r2 = OPS.set_automation({ parameter = "tension", probe = { 2 } })
  ok("★ 写后再 probe ⇒ 读到写入值", math.abs(r2.samples[1].value - 0.4) < 1e-6, tostring(r2.samples[1].value))

  ok("既没 points 也没 probe ⇒ 报错",
     pcall(OPS.set_automation, { parameter = "voicing" }) == false)
end

print(string.format("\n===== 结果：%d 通过 / %d 失败 =====", pass, fail))
os.exit(fail == 0 and 0 or 1)
