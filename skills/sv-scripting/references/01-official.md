# 官方仓库函数

> 来源：Dreamtonics 官方示例（HelloWorld / Tests_* / Utilities_*，共 11 个 JS 文件）。以下为提取的可复用代码模式，均已去掉翻译与样板，ES5.1（var/function）。

### 异步对话框链（步骤计数）
按全局 `step` 依次弹出不同的异步对话框，回调复用同一个 `next`，可把输入框的 `result` 传入下一步。

```javascript
var step = 0;
function main() {
  SV.showMessageBoxAsync(TITLE, "msg", next);
}
function next(result) {
  if(step == 0)      SV.showOkCancelBoxAsync(TITLE, "ok?", next);
  else if(step == 1) SV.showInputBoxAsync(TITLE, "输入", "default", next);
  else if(step == 2) SV.showMessageBoxAsync(TITLE, "上一步结果:" + result, finish);
  step += 1;
}
function finish() { SV.finish(); }
```

### setTimeout 递归轮询（等待音符生成完）
每帧加一个音符，直到音符数达标才结束。`SV.setTimeout` 内部即递归回调。

```javascript
function onNextFrame() {
  var g = SV.getProject().getNoteGroup(0);
  var i = g.getNumNotes();
  if(i < 9) SV.setTimeout(100, onNextFrame);      // 未完成，继续轮询
  else SV.showMessageBoxAsync("Hello", "Done!", function(){ SV.finish(); });

  var n = SV.create("Note");                       // 每帧真正的工作
  n.setTimeRange(i * SV.QUARTER, SV.QUARTER);
  n.setPitch(scale[i % 5]);
  n.setLyrics(lyricsOptions[i % 2]);
  g.addNote(n);
}
```

### setTimeout 递归做动画（缩放/平移导航）
用计数器驱动正弦波做缩放动画，并随步进移动视图左界，做平滑翻页/缩放。

```javascript
var count = 0;
function intervalCallback() {
  count += 1;
  var nav = SV.getMainEditor().getNavigation();
  var tLeft = nav.getTimeViewRange()[0];
  nav.setTimeScale(nav.getTimePxPerUnit() * (1 + 0.02 * Math.sin(count * 0.1)));
  nav.setTimeLeft(tLeft + SV.QUARTER / count);
  if(count < 100) SV.setTimeout(50, intervalCallback);
  else SV.finish();
}
```

### 二分搜索音符（按位置找当前音符）
假设音符按 onset 排序，在 NoteGroup 中二分查找包含位置 `pos` 的音符。

```javascript
function findSortedNote(group, pos) {
  var idxMin = 0, idxMax = group.getNumNotes() - 1;
  var idxMid = Math.floor((idxMin + idxMax) / 2);
  while(idxMid != idxMin) {
    if(group.getNote(idxMid).getOnset() > pos) idxMax = idxMid;
    else idxMin = idxMid;
    idxMid = Math.floor((idxMin + idxMax) / 2);
  }
  if(idxMin < group.getNumNotes() - 1 &&
     group.getNote(idxMin).getEnd() <= pos) idxMin ++;
  return group.getNote(idxMin);
}
```

### setInterval（用 setTimeout 实现）
SV 无原生 setInterval，用 `callback` + 递归 `SV.setTimeout` 模拟。首轮立即执行。

```javascript
function setInterval(t, callback) {
  callback();
  SV.setTimeout(t, setInterval.bind(null, t, callback));
}
```

### 跳过静音播放（监控播放头）
每 200ms 检查播放头；若落在音符外的静音区，就 seek 到下一个音符起点前。

```javascript
function getNewPos() {
  var scope = SV.getMainEditor().getCurrentGroup();
  var group = scope.getTarget();
  var offset = scope.getTimeOffset();
  var timeAxis = SV.getProject().getTimeAxis();
  var playback = SV.getPlayback();
  var position = timeAxis.getBlickFromSeconds(playback.getPlayhead());

  var N = group.getNumNotes();
  if(N == 0) return SV.finish();
  if(position > group.getNote(N - 1).getEnd() + offset ||
     playback.getStatus() == "stopped") { playback.pause(); SV.finish(); }

  var note = findSortedNote(group, position - offset);
  var padding = SV.QUARTER;
  var onset = note.getOnset() + offset;
  if(!(position + padding >= onset && position - padding <= note.getEnd() + offset))
    playback.seek(timeAxis.getSecondsFromBlick(onset - padding));
}
```

### 平滑翻页（闭包 PageTurner）
`makePageTurner` 返回一个闭包，播放头接近右边界时切换到翻页态，用 0.9/0.1 插值把视图左界缓动到目标。

```javascript
function makePageTurner(coordSystem) {
  var playback = SV.getPlayback();
  var timeAxis = SV.getProject().getTimeAxis();
  var isPageTurning = false, targetPositionLeft = 0;
  return function() {
    var position = timeAxis.getBlickFromSeconds(playback.getPlayhead());
    var viewRange = coordSystem.getTimeViewRange();
    var margin = SV.QUARTER / 4;
    if(isPageTurning && viewRange[0] < targetPositionLeft - margin) {
      coordSystem.setTimeLeft(viewRange[0] * 0.9 + targetPositionLeft * 0.1);
    } else if(position > viewRange[1] - margin) {
      isPageTurning = true; targetPositionLeft = viewRange[1];
    } else { isPageTurning = false; }
  };
}
function main() {
  SV.getPlayback().play();
  var pt = makePageTurner(SV.getMainEditor().getNavigation());
  setInterval(20, function(){ if(SV.getPlayback().getStatus() == "stopped") SV.finish(); else pt(); });
}
```

### 合并音符（处理 ./-/+ 特殊歌词）
音符必须首尾相接；把后续歌词按规则拼到第一个音符，并删掉后续音符。`.`=读音输入，`-`=连音，`+`=分音符。

```javascript
var first = selectedNotes[0];
var lyricsMerged = first.getLyrics();
var lastEnd = first.getEnd();
for(var i = 1; i < selectedNotes.length; i ++) {
  var note = selectedNotes[i];
  if(note.getOnset() != lastEnd) { /* 不相连，报错退出 */ }
  var lyr = note.getLyrics();
  if(lyr.length > 0) {
    if(lyr[0] == ".") lyricsMerged += " " + lyr.substring(1);
    else if(lyr == "-") {}   // legato，忽略
    else if(lyr == "+") {}   // 分音符，忽略
    else lyricsMerged += " " + lyr;
  }
  lastEnd = note.getEnd();
}
first.setLyrics(lyricsMerged);
first.setDuration(lastEnd - first.getOnset());
for(var i = 1; i < selectedNotes.length; i ++)
  group.removeNote(selectedNotes[i].getIndexInParent());
```

### 分割音符（在播放头或中点）
太短音符跳过；默认在中间切，若播放头落在音符内则从播放头切。右半新建音符、歌词设为 `-`。

```javascript
var playheadBlicks = timeAxis.getBlickFromSeconds(playhead) - scope.getTimeOffset();
for(var i = 0; i < selectedNotes.length; i ++) {
  var note = selectedNotes[i];
  var originalOnset = note.getOnset(), originalEnd = note.getEnd();
  if(note.getDuration() < SV.QUARTER / 16) continue;
  var durationLeft = Math.round(note.getDuration() / 2);
  if(playheadBlicks > originalOnset && playheadBlicks < originalEnd)
    durationLeft = playheadBlicks - originalOnset;
  note.setDuration(durationLeft);
  var splitted = SV.create("Note");
  splitted.setPitch(note.getPitch());
  splitted.setTimeRange(note.getEnd(), originalEnd - note.getEnd());
  splitted.setLyrics("-");
  group.addNote(splitted);
  selection.selectNote(splitted);
}
```

### 缩放选中音符
按 upscale/downscale 系数缩放时长与位置；`relative` 为真时以选区起点为基准，为假则以 0 为基准。相邻音符保持首尾相接。

```javascript
function scale(options) {
  var selectedNotes = SV.getMainEditor().getSelection().getSelectedNotes();
  if(selectedNotes.length == 0) return;
  selectedNotes.sort(function(a, b){ return a.getOnset() - b.getOnset(); });
  var firstOnset = options.relative ? selectedNotes[0].getOnset() : 0;
  var prevEnd = -1;
  for(var i = 0; i < selectedNotes.length; i ++) {
    var currOnset = selectedNotes[i].getOnset() - firstOnset;
    var currEnd = selectedNotes[i].getEnd() - firstOnset;
    if(currOnset == currEnd) { selectedNotes.removeNote(i); break; }
    if(i > 0 && prevEnd == currOnset)
      selectedNotes[i].setOnset(selectedNotes[i - 1].getEnd());
    else
      selectedNotes[i].setOnset(firstOnset + currOnset * options.upscale / options.downscale);
    selectedNotes[i].setDuration(
      currEnd * options.upscale / options.downscale -
      (selectedNotes[i].getOnset() - firstOnset));
    prevEnd = currEnd;
  }
}
```

### 移除短静音
把音符按 onset 排序；若相邻音符之间的间隙小于 `threshold * QUARTER`，就把前一个音符拉长补上。

```javascript
function noteGetter(arr_like, index) {
  return Array.isArray(arr_like) ? arr_like[index] : arr_like.getNote(index);
}
function processNoteSequence(arr_like, N, threshold) {
  for(var i = 1; i < N; i ++) {
    var currOnset = noteGetter(arr_like, i).getOnset();
    var prevEnd = noteGetter(arr_like, i - 1).getEnd();
    if(currOnset != prevEnd && currOnset - prevEnd < SV.QUARTER * threshold)
      noteGetter(arr_like, i - 1).setDuration(currOnset - noteGetter(arr_like, i - 1).getOnset());
  }
}
// 用法：先 sortNotes，再对选区数组或 NoteGroup 调用 processNoteSequence
```

### 随机化音高/张力（平滑低通）
给参数加随机点并用低通平滑（`yPrev * smooth + y * (1-smooth)`），可生成自然的 pitch/张力曲线。

```javascript
function randomizeParameter(param, numPoints, range, smooth) {
  var y = 0, yPrev = 0;
  for(var i = 0; i < numPoints; i ++) {
    var x = i * SV.QUARTER / 8;
    y = (Math.random() - 0.5) * range;
    y = (yPrev * smooth + y * (1 - smooth)) * 0.99;
    yPrev = y;
    param.add(x, y);
  }
}
// 用法：randomizeParameter(group.getParameter("PitchDelta"), 1024, 500, 0.9);
```

### 自定义对话框表单（widgets）
`showCustomDialog` 返回 `{status, answers}`，`answers` 按 widget 的 `name` 取各自值。

```javascript
var form = {
  "title": "Title", "buttons": "OkCancel",
  "widgets": [
    {"name":"threshold","type":"Slider","label":"Threshold","format":"%.0f","minValue":1,"maxValue":32,"interval":1,"default":2},
    {"name":"scope","type":"ComboBox","label":"Scope","choices":["A","B","C"],"default":0},
    {"name":"check","type":"CheckBox","text":"启用","default":true}
  ]
};
var result = SV.showCustomDialog(form);
if(result.status) {
  var t = result.answers.threshold, s = result.answers.scope;
  // 按 scope 值分别处理选区 / 当前轨 / 整个项目
}
```
