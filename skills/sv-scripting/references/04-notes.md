# 音符操作函数

> 来源：本机 AKD 脚本目录（SV1/SV2，同名脚本取 SV1 版）。已去掉 `getTranslations` 与弹窗样板，ES5.1（`var`/`function`）。
> 覆盖脚本：分割音符 / 自动拼接音符 / 避免音符重叠 / 音符上移·下移 / 音符随机偏移 / 选中之后的所有音符 / 快速选中时间轴音符 / 按音符分配轨道 / 每两个音符分配轨道 / 选中音符播放·带回退 / 居中播放 / 实时预览音符音高 ×2。
> 注：`SV.QUARTER = 705600000`（一个四分音符的 blick 数）；时间单位为 blick。

## ⚖️ 音符布局铁律（**先看这条**）

> **在 SV 中，保证「发声用的」音符组（和声参照等不算）同一时间不出现重叠音符，保证音符之间尽量不出现微小缝隙；在 IX 中允许音符并列排布。**

| 宿主 / 用途 | 同一时间多个音符 | 音符之间 |
|---|---|---|
| **SV · 发声组**（真正要唱的组）| ❌ **不允许重叠** | **尽量无缝**（前一个 `end` = 后一个 `onset`）|
| **SV · 非发声组**（和声参照 / 画图轨 / 草图对照 等）| ✅ 不受限 | 不受限 |
| **IX · 乐器轨** | ✅ **允许并列排布**（和弦 / 复调本来就该同时响）| 按音乐需要 |

**两条含义**

1. **「不重叠」是硬约束**：SV 人声组是**单音**的 —— 同组内两个音符在时间上重叠，宿主会拒绝或自动调整，
   **我们自己的生成器（导入 / 写和弦 / 和声 / 批量填词）绝不能造出来**。
   - 已有对应防线：`sv_import_musicxml` **拒绝复调 lane**（✅ 2026-09-21 才真正落地：多 `<voice>` 或同 onset 多音**默认拒绝**，`allowPolyphony:true` 才放行；此前文档这么写但代码里并没有）。
   - ⚠️ **首尾相接不算重叠** —— 要的是 `prev.end == next.onset`，**不是**留空。
2. **「缝隙」—— 2026-09-18 用户新口径（**这条推翻旧的"不留缝"**）**：
   - ✅ **允许留缝**；**检测到缝要「告知」用户**（不是禁止，也不是擅自消）。
   - **只有用户同意后，才去消缝**（消缝 = 移动音符 onset 或改时值，属"改用户的乐谱"）。
   - 🆕 **我们生成新音符时，默认不留"短缝"** —— 生成侧自律：自己写出来的音符要首尾相接；
     **对既有短缝只报告、不擅自动**。
   - 判据：**缝 ≤ 1/16 拍**（`SV.QUARTER/16`）算"**短缝**"（桥的 `LAYOUT.scan` 会单独列进 `smallGaps`）。
   - ⚠️ 旧文里"**不要为了塑造发音人为留缝**"这条**仍然成立**（那是审美/可唱性建议），
     但**不再是硬约束**：发音/咬字该用**音素时值·力度 / Voice / 自动化 / `leftOffset`** 去做。
   - 🛠 **桥侧已代码化（0.3.16）**：`write_chords` 等写操作的返回值里带 **`layout`** 报告 ——
     `overlapCount`（**重叠=违规，必须报**）· `gapCount`（**缝隙=允许，仅告知**）· `smallGapCount`（短缝）· `policy`（策略原文）。

**既有音符一律视为「用户拥有的乐谱结构」**：音符 / 歌词 / onset / 时值 / 间隙 / 休止 ——
除非用户明确要求改那一处，否则**一律保留**；来源不确定就当作用户所有。

> 相关：`references/09-拆轨与拆音.md`（拆轨是**有意的多轨并列**，不属于"同组重叠"）；
> AKD 脚本目录里的 `避免音符重叠` 是同类思路的现成工具。

## 通用小工具

### getPlayheadBlicks
读取播放头在当前音符组内的位置（blicks，已减去组时间偏移）。几乎所有音符选择/分割/预览脚本共用。

```javascript
function getPlayheadBlicks() {
  var timeAxis = SV.getProject().getTimeAxis();
  var scope = SV.getMainEditor().getCurrentGroup();
  var playhead = SV.getPlayback().getPlayhead();
  return timeAxis.getBlickFromSeconds(playhead) - scope.getTimeOffset();
}
```

### setInterval
用 `SV.setTimeout` 递归实现定时轮询（回调立即执行一次再排下一次）。用于循环播放、居中滚动、实时预览等。

```javascript
function setInterval(t, callback) {
  callback();
  SV.setTimeout(t, setInterval.bind(null, t, callback));
}
```

## 音符编辑

### splitNoteAtPlayhead
在播放头位置分割音符：右侧克隆为新音符（歌词 `-`），原音符缩短。`playheadBlicks` 用 `SV.getMainEditor().getNavigation().snap(...)` 吸附后的值更准。SV1 下额外裁剪右侧的 tF0/颤音属性。

```javascript
function splitNoteAtPlayhead(playheadBlicks) {
  var group = SV.getMainEditor().getCurrentGroup().getTarget();
  var timeAxis = SV.getProject().getTimeAxis();
  var notes = SV.getMainEditor().getSelection().getSelectedNotes();
  var isSV2 = SV.getHostInfo().hostVersionNumber >= 131329;
  for (var i = 0; i < notes.length; i++) {
    var note = notes[i];
    if (note.getOnset() < playheadBlicks && note.getEnd() > playheadBlicks) {
      var cloned = note.clone();
      cloned.setOnset(playheadBlicks);
      cloned.setDuration(note.getEnd() - playheadBlicks);
      cloned.setLyrics("-");
      if (!isSV2) {
        var srcAttrs = note.getAttributes();
        var sec = timeAxis.getSecondsFromBlick(playheadBlicks - note.getOnset());
        var cl = { tF0Offset: 0, tF0Left: 0.07, dF0Left: 0.15 };
        var lf = { tF0Right: 0.07, dF0Right: 0.15 };
        if (!isNaN(srcAttrs.tF0VbrStart)) {
          cl.tF0VbrStart = Math.max(srcAttrs.tF0VbrStart - sec, 0);
          if (cl.tF0VbrStart == 0) cl.tF0VbrLeft = 0;
          lf.tF0VbrRight = 0;
        }
        cloned.setAttributes(cl);
        note.setAttributes(lf);
      }
      group.addNote(cloned);
      note.setDuration(playheadBlicks - note.getOnset());
      break;
    }
  }
}
```

### joinNotes
把选中音符按 onset 排序后逐首拼接：每个音符的时长 = 下一音符 onset − 自身 onset。

```javascript
function joinNotes(notes) {
  if (notes.length < 2) return;
  notes.sort(function (a, b) { return a.getOnset() - b.getOnset(); });
  for (var i = 1; i < notes.length; i++) {
    notes[i - 1].setDuration(notes[i].getOnset() - notes[i - 1].getOnset());
  }
}
```

### avoidNoteOverlap
消除组内重叠：后一个音符 `onset` 落在前一音符 `end` 内时，把它移到一个新建的 NoteGroup（并挂到当前轨道）。反复扫描直到无重叠。

```javascript
function avoidNoteOverlap(group) {
  var Nscope = SV.create("NoteGroupReference");
  var Ngroup = SV.create("NoteGroup");
  SV.getProject().addNoteGroup(Ngroup, 0);
  Nscope.setTarget(Ngroup);
  Nscope.setTimeOffset(group.getTimeOffset() + 1);
  var finish = false;
  while (finish == false) {
    var i;
    for (i = 0; i < group.getNumNotes() - 1; i++) {
      if (group.getNote(i).getEnd() > group.getNote(i + 1).getOnset()) {
        Ngroup.addNote(group.getNote(i + 1).clone());
        group.removeNote(i + 1);
        break;
      }
    }
    if (i == group.getNumNotes() - 1) finish = true;
  }
  SV.getMainEditor().getCurrentTrack().addGroupReference(Nscope);
}
```

### transposeNotes
对音符整体移调。`semitones` 为正则上移、为负则下移（`+1`/`-1` 即上下移一个半音）。

```javascript
function transposeNotes(notes, semitones) {
  for (var i = 0; i < notes.length; i++) {
    notes[i].setPitch(notes[i].getPitch() + semitones);
  }
}
// 上移: transposeNotes(notes, +1);  下移: transposeNotes(notes, -1);
```

### randomizeGroup
给组内每个音符的 onset 加一个 `[-range, +range]` 的随机偏移（`range` 为四分音符数），并保证不叠到前一音符之后。

```javascript
function randomizeGroup(group, range) {
  for (var k = 0; k < group.getNumNotes(); k++) {
    var note = group.getNote(k);
    var off = (2 * Math.random() - 1) * range * SV.QUARTER;
    var prevEnd = k > 0 ? group.getNote(k - 1).getEnd() : -1;
    var newOnset = Math.max(note.getOnset() + off, prevEnd);
    var dur = note.getEnd() + off - newOnset;
    if (dur > 0) { note.setOnset(newOnset); note.setDuration(dur); }
  }
}
```

## 选择

### selectNotesAfterPlayhead
选中播放头位置及之后的所有音符（含正处播放头的音符，按 `end > playheadBlicks` 判定）。

```javascript
function selectNotesAfterPlayhead() {
  var sel = SV.getMainEditor().getSelection();
  var group = SV.getMainEditor().getCurrentGroup().getTarget();
  var blicks = getPlayheadBlicks();
  for (var i = 0; i < group.getNumNotes(); i++) {
    if (group.getNote(i).getEnd() > blicks) sel.selectNote(group.getNote(i));
  }
}
```

### selectNoteAtPlayhead
快速选中播放头正处的那一个音符（`onset <= blicks <= end`）；无则清空选择并返回 `false`。

```javascript
function selectNoteAtPlayhead() {
  var sel = SV.getMainEditor().getSelection();
  var group = SV.getMainEditor().getCurrentGroup().getTarget();
  var blicks = getPlayheadBlicks();
  for (var i = 0; i < group.getNumNotes(); i++) {
    var onset = group.getNote(i).getOnset();
    var end = group.getNote(i).getEnd();
    if (blicks >= onset && blicks <= end) {
      sel.clearAll();
      sel.selectNote(group.getNote(i));
      return true;
    }
  }
  sel.clearAll();
  return false;
}
```

## 分轨

### splitNotesToTracks
按音符分配轨道：源组每个音符克隆到一个新建轨道。

```javascript
function splitNotesToTracks(srcGroup) {
  for (var i = 0; i < srcGroup.getNumNotes(); i++) {
    var track = SV.create("Track");
    var b = SV.getProject().addTrack(track);
    SV.getProject().getTrack(b).getGroupReference(0).getTarget()
      .addNote(srcGroup.getNote(i).clone());
  }
}
```

### splitNotesToTracksByTwo
每两个音符分配到一个新轨道（最后一个不足两个时只加一个）。

```javascript
function splitNotesToTracksByTwo(srcGroup) {
  for (var i = 0; i < srcGroup.getNumNotes(); i += 2) {
    var track = SV.create("Track");
    var b = SV.getProject().addTrack(track);
    var target = SV.getProject().getTrack(b).getGroupReference(0).getTarget();
    target.addNote(srcGroup.getNote(i).clone());
    if (i + 1 < srcGroup.getNumNotes()) target.addNote(srcGroup.getNote(i + 1).clone());
  }
}
```

## 播放与预览

### playSelectedNotes
选中音符循环播放：播放时轮询，把播放头正处的音符选中。带 `trackedIndex` 缓存，命中 O(1)，未命中则从该位置向后扫。

```javascript
var trackedIndex = -1;
function playSelectedNotes() {
  trackedIndex = -1;
  SV.getPlayback().play();
  setInterval(50, timeleft);
}
function timeleft() {
  if (SV.getPlayback().getStatus() == "stopped") { SV.finish(); return; }
  var group = SV.getMainEditor().getCurrentGroup().getTarget();
  var sel = SV.getMainEditor().getSelection();
  var blicks = getPlayheadBlicks();
  if (trackedIndex >= 0 && trackedIndex < group.getNumNotes()) {
    var on = group.getNote(trackedIndex).getOnset();
    var en = group.getNote(trackedIndex).getEnd();
    if (blicks >= on && blicks <= en) {
      sel.clearAll(); sel.selectNote(group.getNote(trackedIndex)); return;
    }
  }
  for (var i = Math.max(0, trackedIndex); i < group.getNumNotes(); i++) {
    var onset = group.getNote(i).getOnset();
    var end = group.getNote(i).getEnd();
    if (blicks >= onset && blicks <= end) {
      trackedIndex = i;
      sel.clearAll(); sel.selectNote(group.getNote(i)); return;
    }
    if (blicks < onset) break;
  }
  sel.clearAll();
}
```

### playSelectedNotesBacktrack
选中音符循环播放（带回退）：每次全量扫描，回退播放时也能正确选中。

```javascript
function playSelectedNotesBacktrack() {
  SV.getPlayback().play();
  setInterval(50, timeleft);
}
function timeleft() {
  if (SV.getPlayback().getStatus() == "stopped") { SV.finish(); return; }
  var group = SV.getMainEditor().getCurrentGroup().getTarget();
  var sel = SV.getMainEditor().getSelection();
  var blicks = getPlayheadBlicks();
  for (var i = 0; i < group.getNumNotes(); i++) {
    var onset = group.getNote(i).getOnset();
    var end = group.getNote(i).getEnd();
    if (blicks >= onset && blicks <= end) {
      sel.clearAll(); sel.selectNote(group.getNote(i)); return;
    }
  }
  sel.clearAll();
}
```

### centeredPlayback
居中滚动播放：播放时每帧把视图左界设为「播放头 − 视图宽/2」，让播放头始终居中。

```javascript
function centeredPlayback() {
  SV.getPlayback().play();
  setInterval(10, timeleft);
}
function timeleft() {
  var navigation = SV.getMainEditor().getNavigation();
  var timeAxis = SV.getProject().getTimeAxis();
  var viewRange = navigation.getTimeViewRange();
  var range = viewRange[1] - viewRange[0];
  var blicks = timeAxis.getBlickFromSeconds(SV.getPlayback().getPlayhead());
  navigation.setTimeLeft(blicks - range / 2);
  if (SV.getPlayback().getStatus() == "stopped") { SV.finish(); }
}
```

### previewNotePitch
实时预览音符音高：选中音符时用 `playback.loop` 循环播放该音高换算出的秒段，取消选中则停止。原脚本依赖硬编码轨道名/UUID（已废弃），此处保留通用思路；「跟随走带位置」版在未选中时额外把视图左界随播放头滚动。

```javascript
function previewNotePitch() {
  setInterval(100, onTick);
}
function onTick() {
  var sel = SV.getMainEditor().getSelection();
  var timeAxis = SV.getProject().getTimeAxis();
  var playback = SV.getPlayback();
  if (sel.hasSelectedNotes()) {
    var note = sel.getSelectedNotes()[0];
    var startSec = timeAxis.getSecondsFromBlick((note.getPitch() - 12) * 2000000000);
    var endSec = timeAxis.getSecondsFromBlick((note.getPitch() - 11) * 2000000000);
    playback.loop(startSec, endSec);
  } else {
    playback.loop(0, 0);
    playback.stop();
  }
}
```
