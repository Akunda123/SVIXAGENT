-- ============================================================================
-- 假 SV 宿主（离线单测用）
-- ============================================================================
-- 目的：在没有 Synthesizer V 的情况下，把 `sv/lua/AKDAgentBridge.lua` 的 op
-- 跑起来做回归。**只模拟桥真正用到的 API 表面**，并且刻意遵守真实绑定的三条规矩：
--   ① **1-based 索引**（getTrack(1) 是第一轨；getTrack(0) 越界报错）
--   ② **冒号方法**（一律 `obj:method(...)`；不存在点调用形式）
--   ③ 未实现的成员**故意不定义** —— 桥的 has() 会返回 false，
--      从而走"能力探测失败"分支，而不是让测试误以为能力存在。
--
-- ⚠️ 这不是 SV 的仿真器：它只保证"桥的代码路径"可跑，不保证音高/时值语义与真机一致。
--    真机验收仍需在 SV 里跑（见 docs/待办.md §10）。
--
-- 单位：blick（SV.QUARTER = 705600000 = 四分音符）。

local Fake = {}

local QUARTER = 705600000

-- ---------- 小工具 ----------
local function outOfRange(what, i, n)
  error(string.format("%s: 访问超出范围（索引为 %d，大小为 %d）", what, i, n), 2)
end

-- ---------- 音符 ----------
local function newNote(o, state)
  local n = {
    _onset = o.onset or 0,
    _duration = o.duration or QUARTER,
    _pitch = o.pitch or 60,
    _lyrics = o.lyrics or "la",
    _parent = o.parent,
    _attrs = {},            -- SV1：稀疏属性（只存非默认写入的）
    _scriptData = {},       -- SV2：ScriptData
    _auto = true,           -- 音高自动模式
  }
  function n:getOnset() return self._onset end
  function n:setOnset(v) self._onset = v end
  function n:getDuration() return self._duration end
  function n:setDuration(v) self._duration = v end
  function n:getEnd() return self._onset + self._duration end
  function n:setTimeRange(onset, duration) self._onset = onset; self._duration = duration end
  function n:getPitch() return self._pitch end
  function n:setPitch(v) self._pitch = v end
  function n:getLyrics() return self._lyrics end
  function n:setLyrics(v) self._lyrics = v end
  function n:getIndexInParent()
    -- 真实绑定：Lua 侧 1-based
    if self._parent == nil then return 0 end
    for i, x in ipairs(self._parent._notes) do
      if x == self then return i end
    end
    return 0
  end
  function n:getAttributes() return self._attrs end
  -- 语言 / 说唱属性（2026-09-18 新增：给 get_lyrics_attrs / set_note_languages / set_note_rap_accents 用）
  function n:getLanguageOverride() return self._lang or "" end
  function n:setLanguageOverride(v)
    self._lang = v
    self._attrs.languageOverride = v
    if state then state.calls[#state.calls + 1] = "note.setLanguageOverride" end
  end
  function n:getPhonemes() return self._phonemes or "" end
  function n:setPhonemes(v)
    self._phonemes = tostring(v)
    if state then state.calls[#state.calls + 1] = "note.setPhonemes" end
  end
  function n:getMusicalType() return self._musicalType or "sing" end
  function n:setMusicalType(v) self._musicalType = v end
  function n:getRapAccent() return self._accent or "" end
  function n:setRapAccent(v)
    self._accent = tostring(v)
    if state then state.calls[#state.calls + 1] = "note.setRapAccent" end
  end
  function n:setAttributes(a)
    for k, v in pairs(a or {}) do self._attrs[k] = v end
    if state then state.calls[#state.calls + 1] = "note.setAttributes" end
  end
  function n:getScriptData(k) return self._scriptData[k] end
  function n:setScriptData(k, v) self._scriptData[k] = v end
  function n:setPitchAutoMode(b)
    self._auto = b and true or false
    if state then state.calls[#state.calls + 1] = "note.setPitchAutoMode" end
  end
  function n:isPitchAutoMode() return self._auto end
  -- 真实 SV1 的绑定名是 `getPitchAutoMode`（2026-09-23 真机确认）；`isPitchAutoMode` 是旧的假实现名。
  -- 两个都留着：桥与测试用哪个都行，避免"假宿主没有这个方法 ⇒ call() 静默返回 nil"的假阴性。
  function n:getPitchAutoMode() return self._auto end
  function n:getPitchControls() return {} end
  return n
end

-- ---------- 音符组（NoteGroup，目标对象） ----------
local function newGroup(o, state)
  local g = { _notes = {}, _name = o.name or "Group", _curves = {} }
  function g:getName() return self._name end
  function g:setName(v) self._name = v end
  function g:getNumNotes() return #self._notes end
  function g:getNote(i)
    if i < 1 or i > #self._notes then outOfRange("getNote", i, #self._notes) end
    return self._notes[i]
  end
  function g:addNote(n)
    n._parent = self
    self._notes[#self._notes + 1] = n
    return n
  end
  function g:removeNote(i)
    if i < 1 or i > #self._notes then outOfRange("removeNote", i, #self._notes) end
    table.remove(self._notes, i)
  end
  function g:getDuration() return 4 * QUARTER end
  function g:getUUID() return "fake-uuid-" .. tostring(o.name or "g") end
  -- 参数自动化（Automation）：2026-09-23 新增，给 `set_automation` op 用。
  -- ⚠️ 只实现**安全那一面**：`add(b,v)` 写点 + `get(b)` 单点采样。
  --    `getPoints` / `getAllPoints` / `getLinear` / `getDefinition` / `remove(index)` 属 crash 清单（IX-001），
  --    **故意不实现** —— 桥若误调就会在这里报 nil，等于给"绝不许调"加了一道离线防线。
  function g:getParameter(t)
    if type(t) ~= "string" or t == "" then return nil end
    local k = t:lower()
    local known = { loudness = true, tension = true, breathiness = true, voicing = true,
                    gender = true, vibratoenv = true, pitchdelta = true }
    if not known[k] and k:sub(1, 10) ~= "vocalmode_" then return nil end
    self._auto = self._auto or {}
    if self._auto[k] == nil then
      local a = { pts = {} }
      function a:add(b, v)
        for i = 1, #self.pts do
          if self.pts[i].b == b then self.pts[i].v = v return false end
        end
        self.pts[#self.pts + 1] = { b = b, v = v }
        if state then state.calls[#state.calls + 1] = "auto.add" end
        return true
      end
      function a:get(b)
        for i = 1, #self.pts do if self.pts[i].b == b then return self.pts[i].v end end
        -- 2026-09-23：**没有点时回"默认值"**，与真机一致（实测 voicing/vibratoEnv = 1、其余 = 0）。
        -- 这条很关键：`apply_ornaments` 的 dyn 要**先读基线再写闭合形状**，基线读不到就整条跳过。
        return state and state.autoDefaults and state.autoDefaults[k] or nil
      end
      self._auto[k] = a
    end
    return self._auto[k]
  end
  -- PitchControl（SV2 2.1.0+）：curve 路线要用
  function g:getNumPitchControls() return #self._curves end
  function g:getPitchControl(i)
    if i < 1 or i > #self._curves then outOfRange("getPitchControl", i, #self._curves) end
    return self._curves[i]
  end
  function g:addPitchControl(c)
    self._curves[#self._curves + 1] = c
    if state then state.calls[#state.calls + 1] = "group.addPitchControl" end
    return c
  end
  function g:removePitchControl(i)
    if i < 1 or i > #self._curves then outOfRange("removePitchControl", i, #self._curves) end
    table.remove(self._curves, i)
    if state then state.calls[#state.calls + 1] = "group.removePitchControl" end
  end
  for _, spec in ipairs(o.notes or {}) do
    g:addNote(newNote(spec, state))
  end
  return g
end

-- ---------- 组引用（NoteGroupReference，放在轨道上的实例） ----------
local function newGroupRef(o, state)
  local target = o.target or newGroup(o, state)   -- ⚠️ 要传整个 o（含 notes）+ state，否则音符/记账都会丢
  local r = { _target = target, _onset = o.onset or 0, _pitchOffset = o.pitchOffset or 0 }
  function r:getTarget() return self._target end
  function r:getOnset() return self._onset end
  function r:setOnset(v) self._onset = v end
  function r:getPitchOffset() return self._pitchOffset end
  function r:setPitchOffset(v) self._pitchOffset = v end
  function r:getVoice() return nil end   -- SV1 实测返回空表/nil，照实模拟
  function r:getTimeOffset() return self._onset end
  function r:setTimeOffset(v) self._onset = v end
  function r:getDuration() return self._dur or target:getDuration() end
  function r:setTimeRange(onset, duration)
    self._onset = onset
    self._dur = duration
    if state then state.calls[#state.calls + 1] = "ref.setTimeRange" end
  end
  function r:isMain() return o.isMain ~= false end
  function r:isInstrumental() return o.instrumental == true end
  function r:setTarget(t) self._target = t end
  return r
end

-- ---------- 轨道 ----------
-- ⚠️ state 必须**显式传进来**：早先版本在闭包里直接引用 `state`，实际拿到的是全局 nil，
--    于是 removeGroupReference 里的记账语句抛错、被桥的 call() 悄悄吞掉（
--    表现为"功能对了但调用记录缺失"）。是离线测试把这个 bug 抓出来的。
local function newTrack(o, state)
  local t = { _name = o.name or "Track", _refs = {} }
  function t:getName() return self._name end
  function t:setName(v) self._name = v end
  function t:getNumGroups() return #self._refs end
  function t:getGroupReference(i)
    if i < 1 or i > #self._refs then outOfRange("getGroupReference", i, #self._refs) end
    return self._refs[i]
  end
  function t:addGroupReference(r) self._refs[#self._refs + 1] = r; return r end
  function t:removeGroupReference(i)
    if i < 1 or i > #self._refs then outOfRange("removeGroupReference", i, #self._refs) end
    table.remove(self._refs, i)
    if state then state.calls[#state.calls + 1] = "track.removeGroupReference" end
  end
  -- 乐器 database：真实侧是 track.getMainReference().getDatabase() 上的 name/backendType/version。
  -- 这里用 **setter 方法**模拟（Lua 绑定更可能长这样），桥的 ALG.setprop 会先试 setter。
  -- 🆕 2026-09-25：主引用还要**能 getTarget**（真侧它就是 NoteGroupReference）——
  --   `write_chords` / `create_harmony_group` 的 `target="main"` 路线靠 `getMainReference():getTarget()`
  --   拿到主组，再往里 addNote。**必须缓存**：桥会多次调用本方法（写 instrument database、查主组音符数/末尾），
  --   每次都新建 stub 的话，db 上的写入会在下一次调用时丢掉。
  function t:getMainReference()
    if self._mainRef ~= nil then return self._mainRef end
    local ref = self._refs[1]                     -- 本轨第一条引用就是"主组"（安装 spec 里名字叫 main）
    local db = { _name = "", _backendType = "", _version = "" }
    function db:setName(v) self._name = v end
    function db:getName() return self._name end
    function db:setBackendType(v) self._backendType = v end
    function db:getBackendType() return self._backendType end
    function db:setVersion(v) self._version = v end
    function db:getVersion() return self._version end
    local mr = {
      getDatabase = function() return db end,
      getTarget = function() return ref and ref:getTarget() or nil end,
      isMain = function() return true end,
      getTimeOffset = function() return 0 end,
      getPitchOffset = function() return 0 end,
    }
    self._mainRef = mr
    return mr
  end
  function t:getNumNotes()
    local n = 0
    for _, r in ipairs(self._refs) do n = n + r:getTarget():getNumNotes() end
    return n
  end
  function t:getIndexInParent() return o.index or 1 end
  for _, spec in ipairs(o.groups or {}) do
    t:addGroupReference(newGroupRef(spec, state))
  end
  return t
end

-- ---------- 主编辑器 / 选区 ----------
local function newEditor(state)
  local sel = {}
  function sel:getSelectedNotes()
    local arr = {}
    for _, n in ipairs(state.selected) do arr[#arr + 1] = n end
    -- state.selNotArray = true ⇒ 模仿**本机 SV2**：返回对象**没有数组长度**（`#` 恒 0），
    -- 条数只能靠 getNumSelectedNotes 拿。真机上 write_pit 就在这儿把"选了 N 个"当成"没选"
    -- 而退化成整个组（462 音的真轨被整条当目标）—— 这条开关就是那个 bug 的护栏。
    if state.selNotArray then
      return setmetatable(arr, { __len = function() return 0 end })
    end
    return arr
  end
  function sel:getNumSelectedNotes() return #state.selected end
  function sel:hasSelectedNotes() return #state.selected > 0 end
  function sel:clearNotes() state.selected = {} end
  function sel:selectNote(n)
    state.selected[#state.selected + 1] = n
  end

  local ed = {}
  function ed:getSelection() return sel end
  function ed:getCurrentGroup()
    -- 真实 API：返回当前编辑的 NoteGroupReference（可能为 nil）
    return state.currentGroupRef
  end
  function ed:setCurrentGroup(r) state.currentGroupRef = r end
  function ed:getCurrentTrack() return state.currentTrack end
  function ed:setCurrentTrack(t) state.currentTrack = t end
  function ed:getPlayhead() return state.playheadSec end
  function ed:setPlayhead(sec) state.playheadSec = sec end
  return ed, sel
end

-- ---------- 播放控制 ----------
-- 真实 API：Playback#getStatus() 返回 "playing" / "paused" / "stopped"
local function newPlayback(state)
  local pb = {}
  local function set(s) state.playStatus = s end
  function pb:getStatus() return state.playStatus end
  function pb:isPlaying() return state.playStatus == "playing" end
  function pb:play() set("playing"); state.calls[#state.calls + 1] = "playback.play" end
  function pb:pause() set("paused"); state.calls[#state.calls + 1] = "playback.pause" end
  function pb:stop() set("stopped"); state.calls[#state.calls + 1] = "playback.stop" end
  function pb:getPlayhead() return state.playheadSec end
  function pb:setPlayhead(sec) state.playheadSec = sec end
  function pb:seek(sec) state.playheadSec = sec; state.calls[#state.calls + 1] = "playback.seek" end
  return pb
end

-- ---------- 工程 ----------
local function newProject(state)
  local proj = {}
  function proj:getFileName() return state.fileName end
  function proj:getDuration() return state.durationBlicks or (16 * QUARTER) end
  function proj:getNumTracks() return #state.tracks end
  function proj:getTrack(i)
    if i < 1 or i > #state.tracks then outOfRange("getTrack", i, #state.tracks) end
    return state.tracks[i]
  end
  function proj:addTrack(t) state.tracks[#state.tracks + 1] = t; return t end
  function proj:addNoteGroup(group, suggestedIndex)
    -- 真实签名：addNoteGroup(group, suggestedIndex?)，省略则追加到末尾
    state.library = state.library or {}
    if suggestedIndex == nil then
      state.library[#state.library + 1] = group
    else
      table.insert(state.library, suggestedIndex + 1, group)   -- 真实索引 0 起 ⇒ 这里 +1
    end
    state.calls[#state.calls + 1] = "proj.addNoteGroup" .. (suggestedIndex == nil and "(noIdx)" or "(idx)")
    return #state.library
  end
  function proj:getNumNoteGroupsInLibrary() return #(state.library or {}) end
  function proj:newUndoRecord()
    state.undoCount = state.undoCount + 1
    state.calls[#state.calls + 1] = "proj.newUndoRecord"
  end
  function proj:getTimeAxis()
    local ta = {}
    -- MeasureMark：真实 JS 侧是**属性**（positionBlick/numerator/denominator），
    -- Lua 侧按 getter 方法模拟 —— 桥的 prop() 两条路都要能走通（这里测方法路径）。
    local function newMark(pos, num, den)
      local m = {}
      function m:getPositionBlick() return pos end
      function m:getNumerator() return num end
      function m:getDenominator() return den end
      return m
    end
    local perBar = state.beatsPerBar or 4
    function ta:getTempoMarkAt() return { bpm = state.bpm, position = 0 } end
    function ta:getMeasureMarkAt(measure)
      -- 真实签名：getMeasureMarkAt(**小节号，1 起**)
      -- 假宿主按**有界工程**建模（默认 64 小节）：越界报错，让桥的 mark==nil 分支可测。
      -- ⚠️ 真实宿主对"超出工程长度的小节"是报错还是返回延伸位置，尚未实测（见台账「真机」列）。
      if measure < 1 or measure > (state.numMeasures or 64) then
        outOfRange("getMeasureMarkAt", measure, state.numMeasures or 64)
      end
      return newMark((measure - 1) * perBar * QUARTER, state.numerator or 4, state.denominator or 4)
    end
    function ta:getMeasureMarkAtBlick(b)
      -- 真实签名：getMeasureMarkAtBlick(**blick**)
      local idx = math.floor(b / (perBar * QUARTER))
      return newMark(idx * perBar * QUARTER, state.numerator or 4, state.denominator or 4)
    end
    function ta:getSecondsFromBlick(b)
      -- 秒 = blick / QUARTER * (60 / bpm)，单速（fake 不支持变速）
      return b / QUARTER * (60 / state.bpm)
    end
    function ta:getNumTempoMarks() return #state.tempoMarks end
    function ta:getAllTempoMarks()
      -- 返回**副本**（真实 API 也是新数组），字段用 position（blick）
      local out = {}
      for i = 1, #state.tempoMarks do out[i] = { position = state.tempoMarks[i].blick, bpm = state.tempoMarks[i].bpm } end
      return out
    end
    function ta:addTempoMark(b, bpm)
      state.tempoMarks[#state.tempoMarks + 1] = { blick = b, bpm = bpm }
      state.calls[#state.calls + 1] = "timeAxis.addTempoMark"
    end
    function ta:removeTempoMark(b)
      for i = #state.tempoMarks, 1, -1 do
        if state.tempoMarks[i].blick == b then table.remove(state.tempoMarks, i) end
      end
      state.calls[#state.calls + 1] = "timeAxis.removeTempoMark"
    end
    function ta:getBlickFromSeconds(t)
      -- 单速换算：blick = 秒 × (bpm/60) × QUARTER（测试只需算术一致）
      return t * (state.bpm / 60) * QUARTER
    end
    function ta:getTimeSignatureAt() return { numerator = perBar, denominator = 4 } end
    return ta
  end
  return proj
end

-- ============================================================================
-- 构建并安装假宿主
-- ============================================================================
-- opts（都可省）：
--   fileName  : 工程文件名
--   tracks    : { {name=..., groups={ {name=..., notes={ {pitch=,onset=,duration=,lyrics=} } } } } }
--   selected  : { {track=1, group=1, note=1} } 选中哪些音符
--   beatsPerBar, bpm, playheadSec
function Fake.install(opts)
  opts = opts or {}
  local state = {
    fileName = opts.fileName or "fake.svp",
    tracks = {}, selected = {}, calls = {},
    bpm = opts.bpm or 120,
    beatsPerBar = opts.beatsPerBar or 4,
    playheadSec = opts.playheadSec or 0,
    playing = false, playStatus = "stopped", undoCount = 0, tempoMarks = {},
    -- 参数自动化的**默认值**（没有点时 `get` 回它）—— 照真机实测：voicing / vibratoEnv = 1，其余 = 0
    autoDefaults = opts.autoDefaults or {
      voicing = 1, vibratoenv = 1,
      loudness = 0, tension = 0, breathiness = 0, gender = 0, pitchdelta = 0,
    },
  }

  for ti, tspec in ipairs(opts.tracks or {}) do
    tspec.index = ti
    state.tracks[#state.tracks + 1] = newTrack(tspec, state)
  end

  -- 默认当前组 = 第一轨第一组；默认当前轨 = 第一轨
  if state.tracks[1] and state.tracks[1]:getNumGroups() > 0 then
    state.currentGroupRef = state.tracks[1]:getGroupReference(1)
  end
  state.currentTrack = state.tracks[1]
  state.library = {}

  local editor, sel = newEditor(state)
  local playback = newPlayback(state)
  local project = newProject(state)

  -- 选区：把 {track,group,note} 换成真实对象
  for _, s in ipairs(opts.selected or {}) do
    local n = state.tracks[s.track]:getGroupReference(s.group):getTarget():getNote(s.note)
    sel:selectNote(n)
  end

  local SV = {}
  SV.QUARTER = QUARTER
  SV.getProject = function(self) return project end
  SV.getMainEditor = function(self) return editor end
  SV.getPlayback = function(self) return playback end
  SV.getHostInfo = function(self)
    return { hostName = opts.hostName or "Synthesizer V Studio Pro (fake)",
             hostVersion = opts.hostVersion or "1.11.2",
             hostVersionNumber = opts.hostVersionNumber or 68354 }
  end
  SV.create = function(self, what)
    state.calls[#state.calls + 1] = "SV.create:" .. tostring(what)
    if what == "Note" then return newNote({}, state) end
    if what == "NoteGroup" then return newGroup({ name = "" }, state) end
    if what == "NoteGroupReference" then return newGroupRef({ target = newGroup({ name = "tmp" }, state) }, state) end
    if what == "PitchControlCurve" then
      -- 真实 API：setPosition/setPitch/setPoints/getPoints/getPosition
      --   ⚠️ 真实 PitchControlCurve 继承 **ScriptableNestedObject** ⇒ 也有 scriptData 四件套；
      --   桥用它给曲线打"属于哪个音符"的标记（否则和弦里同 onset 的曲线会互相误删）⇒ 假宿主必须一并提供。
      local c = { _pos = 0, _pitch = 60, _pts = {}, _scriptData = {} }
      function c:setPosition(v) self._pos = v end
      function c:getPosition() return self._pos end
      function c:setPitch(v) self._pitch = v end
      function c:getPitch() return self._pitch end
      function c:setPoints(p) self._pts = p end
      function c:getPoints() return self._pts end
      function c:getScriptData(k) return self._scriptData[k] end
      function c:setScriptData(k, v) self._scriptData[k] = v end
      function c:hasScriptData(k) return self._scriptData[k] ~= nil end
      function c:removeScriptData(k) self._scriptData[k] = nil end
      return c
    end
    return {}
  end
  -- 计算接口（SV2 2.1.1+，**可选**：只有测试显式传 opts 时才存在，用来复现"SV1 没有这两个方法"）
  --   opts.computedPitch(ref, start, interval, frames) -> table（**可带 nil 洞**，照真实宿主：长度 = frames、未算出为 nil）
  --   opts.computedAttributes(ref) -> table（每个音符一项）
  if opts.computedPitch then
    SV.getComputedPitchForGroup = function(self, ref, start, interval, frames)
      state.calls[#state.calls + 1] = "SV.getComputedPitchForGroup"
      return opts.computedPitch(ref, start, interval, frames)
    end
  end
  if opts.computedAttributes then
    SV.getComputedAttributesForGroup = function(self, ref)
      state.calls[#state.calls + 1] = "SV.getComputedAttributesForGroup"
      return opts.computedAttributes(ref)
    end
  end
  SV.finish = function(self) state.calls[#state.calls + 1] = "SV.finish" end
  SV.setTimeout = function(self, ms, cb)
    state.calls[#state.calls + 1] = "SV.setTimeout"
    return 1
  end

  _G.SV = SV
  -- 真实宿主里 SVH 由桥自己创建（`local SVH = {}`），这里不注入，避免和桥的定义打架。

  return {
    state = state, SV = SV, project = project, editor = editor,
    selection = sel, playback = playback,
    -- 取对象的便捷方法（1-based，与真实一致）
    track = function(i) return project:getTrack(i) end,
    group = function(ti, gi) return project:getTrack(ti):getGroupReference(gi) end,
    target = function(ti, gi) return project:getTrack(ti):getGroupReference(gi):getTarget() end,
    note = function(ti, gi, ni) return project:getTrack(ti):getGroupReference(gi):getTarget():getNote(ni) end,
    calls = state.calls,
  }
end

return Fake
