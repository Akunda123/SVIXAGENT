# 歌词处理函数
来源：SV1/SV2 AKD 脚本目录（`C:\Users\<USER>\Documents\Dreamtonics\Synthesizer V Studio\scripts\AKD` 与 `C:\Users\<USER>\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\scripts\AKD`；同名脚本内容一致，取内容较新者）。仅保留可运行核心逻辑，已去除 `getTranslations`、弹窗样板与纯显示类辅助。全部 ES5.1（`var`/`function`）。
### collectSortedNotes
取选中音符，未选中则取整组；按 onset 升序，歌词类脚本公共入口。
```javascript
function collectSortedNotes() {
  var sel = SV.getMainEditor().getSelection();
  var group = SV.getMainEditor().getCurrentGroup().getTarget();
  var notes = sel.hasSelectedNotes() ? sel.getSelectedNotes() : [];
  var i;
  if (!sel.hasSelectedNotes()) { for (i = 0; i < group.getNumNotes(); i++) { notes.push(group.getNote(i)); } }
  notes.sort(function(a, b) { return a.getOnset() - b.getOnset(); });
  return notes;
}
```
### noteAtPlayhead
返回播放头所在音符下标；不在任何音符内返回 -1。用于"当前音符"类操作。
```javascript
function noteAtPlayhead(notes) {
  var ta = SV.getProject().getTimeAxis();
  var scope = SV.getMainEditor().getCurrentGroup();
  var blicks = ta.getBlickFromSeconds(SV.getPlayback().getPlayhead()) - scope.getTimeOffset();
  for (var i = 0; i < notes.length; i++) {
    if (notes[i].getOnset() < blicks && notes[i].getEnd() > blicks) { return i; }
  }
  return -1;
}
```
### countSyllables
按元音集合统计音节数（多音节判定/加 + 共用）。
```javascript
var allVowels = ["a","A","o","@","e","7","U","u","i","i\\","i`","y","AU","@U","ia","iA","iAU","ie","iE","iU","i@U","y{","yE","ua","uA","u@","ue","uo","ae","ah","ao","aw","ax","ay","eh","er","ey","ih","iy","ow","oy","uh","uw","aa","6","E","O","9","8","N","m=","N=","M","V","e_o"];
function countSyllables(phonemeStr) {
  var parts = phonemeStr.split(" ");
  var syllables = 0;
  for (var j = 0; j < parts.length; j++) {
    if (allVowels.indexOf(parts[j]) != -1) { syllables++; }
  }
  return syllables;
}
```
### autoParts
智能分词：换行/制表符=空格；中文无空格→逐字，日文无空格→逐假名，英文无空格→整串；空格占比≥25% 或含空格→按空格。
```javascript
function autoParts(text) {
  var t = text.replace(/[\r\n\t]+/g, " ");
  var cjkPunct = /[？！。，、；：""''（）《》〈〉【】…—·～]/;
  var hasKana = /[\u3040-\u30ff]/.test(t);
  var hasHanzi = /[\u4e00-\u9fff]/.test(t);
  var spaceRatio = (text.match(/ /g) || []).length / text.length;
  var parts = [], chars, i;
  function pushChars() { chars = t.replace(/\s+/g, "").split(""); for (i = 0; i < chars.length; i++) { if (!cjkPunct.test(chars[i])) { parts.push(chars[i]); } } }
  if (hasHanzi && !hasKana) {
    if (spaceRatio >= 0.25) { parts = t.split(" "); } else { pushChars(); }
  } else if (spaceRatio >= 0.25 || (hasKana && t.indexOf(" ") != -1)) { parts = t.split(" "); }
  else if (hasKana) { pushChars(); }
  else if (t.indexOf(" ") != -1) { parts = t.split(" "); }
  else { parts = [t]; }
  var cleaned = [];
  for (i = 0; i < parts.length; i++) { if (parts[i]) { cleaned.push(parts[i]); } }
  return cleaned;
}
```
### copyLyricsToClipboard
复制所选（或全部）音符歌词，空格拼接后写入宿主剪贴板。
```javascript
function copyLyricsToClipboard() {
  var notes = collectSortedNotes();
  if (!notes.length) { return; }
  var lyrics = notes[0].getLyrics();
  for (var i = 1; i < notes.length; i++) { lyrics = lyrics + " " + notes[i].getLyrics(); }
  SV.setHostClipboard(lyrics);
}
```
### pasteLyricsToNotes
从宿主剪贴板读取歌词，经 autoParts 分词后按顺序填入所选音符（词不足则少填，不循环复用）。
```javascript
function pasteLyricsToNotes() {
  var notes = collectSortedNotes();
  if (!notes.length) { return; }
  var raw = SV.getHostClipboard();
  if (!raw) { return; }
  var parts = autoParts(raw);
  var n = Math.min(parts.length, notes.length);
  for (var i = 0; i < n; i++) { notes[i].setLyrics(parts[i]); }
}
```
### copyNoteAttributes
将第一个选中音符的属性复制给其余选中音符。
```javascript
function copyNoteAttributes() {
  var notes = collectSortedNotes();
  if (notes.length < 2) { return; }
  var srcAttrs = notes[0].getAttributes();
  for (var i = 1; i < notes.length; i++) { notes[i].setAttributes(srcAttrs); }
}
```
### mergeNextLyricShiftLeft
把播放头处音符歌词与下一音符合并，其后歌词整体前移一格。
```javascript
function mergeNextLyricShiftLeft() {
  var notes = collectSortedNotes();
  var i = noteAtPlayhead(notes);
  if (i < 0 || i >= notes.length - 1) { return; }
  notes[i].setLyrics(notes[i].getLyrics() + notes[i + 1].getLyrics());
  for (var j = i + 1; j < notes.length - 1; j++) { notes[j].setLyrics(notes[j + 1].getLyrics()); }
}
```
### deleteLyricShiftLeft
删除播放头处音符歌词，其后歌词整体前移一格。
```javascript
function deleteLyricShiftLeft() {
  var notes = collectSortedNotes();
  var i = noteAtPlayhead(notes);
  if (i < 0) { return; }
  for (var j = i; j < notes.length - 1; j++) { notes[j].setLyrics(notes[j + 1].getLyrics()); }
}
```
### addSymbolShiftRight
把播放头处音符歌词设为连音标记（symbol 为 + 或 -），其后歌词整体后移一格。+/- 逻辑对称，合并为一个函数。
```javascript
function addSymbolShiftRight(symbol) {
  var notes = collectSortedNotes();
  var i = noteAtPlayhead(notes);
  if (i < 0) { return; }
  for (var j = notes.length - 1; j > i; j--) { notes[j].setLyrics(notes[j - 1].getLyrics()); }
  notes[i].setLyrics(symbol);
}
```
### addPlusMultisyllable
对多音节音符（音节数>1 且未含 +）按音节数在其后插入 "+" 并整体后移；先统计后统一后移避免音素错位。
```javascript
function addPlusMultisyllable() {
  var notes = collectSortedNotes();
  var phonemes = SV.getPhonemesForGroup(SV.getMainEditor().getCurrentGroup());
  var addCounts = [], i, s, k;
  for (i = 0; i < notes.length; i++) {
    addCounts[i] = 0;
    if (notes[i].getLyrics().indexOf("+") != -1) { continue; }
    var syl = countSyllables(phonemes[notes[i].getIndexInParent()]);
    if (syl > 1) { addCounts[i] = syl - 1; }
  }
  for (i = notes.length - 1; i >= 0; i--) {
    var shift = addCounts[i];
    if (shift <= 0) { continue; }
    for (s = notes.length - 1; s > i; s--) { if (s - shift >= i) { notes[s].setLyrics(notes[s - shift].getLyrics()); } }
    for (k = 1; k <= shift; k++) { if (i + k < notes.length) { notes[i + k].setLyrics("+"); } }
  }
}
```
### formatTime
生成 LRC 时间戳 `[mm:ss.cc]`，支持负号与偏移。
```javascript
function fixZeroStart(str) { return (Array(2).join(0) + str).slice(-2); }
function formatTime(seconds, offsetSec) {
  var t = seconds + offsetSec, abs = Math.abs(t), sign = t < 0 ? "-" : "";
  var min = parseInt(abs / 60).toString();
  var sec = parseInt(abs % 60).toString();
  var cs = parseInt((abs * 100) % 100).toString();
  return "[" + sign + fixZeroStart(min) + ":" + fixZeroStart(sec) + "." + fixZeroStart(cs) + "]";
}
```
### exportLRC
按呼吸音/间隙把音符分成行组，跳过 -/+，多音节 CJK 词加括号，相邻重复行合并时间戳，输出 LRC 并写入剪贴板。`isCJK` 由调用方检测（SV2 可查 `SV.getComputedAttributesForGroup` 的语言）。
```javascript
function exportLRC(offsetSec, isCJK) {
  var scope = SV.getMainEditor().getCurrentGroup(), ta = SV.getProject().getTimeAxis(), groupOnset = scope.getTimeOffset();
  var notes = collectSortedNotes();
  var phonemes = SV.getPhonemesForGroup(scope);
  var rows = [[]], g = 0, k = 0, i, n;
  for (i = 0; i < notes.length; i++) {
    var lyr = notes[i].getLyrics();
    if (/^(l?br\d*)$/.test(lyr)) { continue; }
    if (lyr != "-" && lyr != "+") { rows[g].push({ "Duration": notes[i].getDuration(), "Lyrics": lyr, "Onset": notes[i].getOnset(), "Phonemes": phonemes[notes[i].getIndexInParent()] }); k++; }
    if (i < notes.length - 1 && (notes[i].getEnd() != notes[i + 1].getOnset() || /^(l?br\d*)$/.test(notes[i + 1].getLyrics()))) { rows.push([]); g++; k = 0; }
  }
  var separate = isCJK ? "" : " ", lrc = "", lastLyric = "";
  for (g = 0; g < rows.length; g++) {
    var line = "";
    for (n = 0; n < rows[g].length; n++) { var l = rows[g][n].Lyrics; if (isCJK && l.length > 1 && countSyllables(rows[g][n].Phonemes) > 1) { l = "(" + l + ")"; } line = line + l + separate; }
    if (separate == " ") { line = line.slice(0, -1); }
    var ts = formatTime(ta.getSecondsFromBlick(rows[g][0].Onset + groupOnset), offsetSec);
    if (line == lastLyric) {
      var lines = lrc.split("\n");
      var lb = lines[lines.length - 1];
      lines[lines.length - 1] = ts + lb.substring(lb.indexOf("]") + 1);
      lrc = lines.join("\n");
      continue;
    }
    lastLyric = line;
    lrc = lrc + ts + line + "\n";
  }
  SV.setHostClipboard(lrc);
  return lrc;
}
```
### applyLyricsToNotes
把一行歌词按分割方式填入一组音符；展开紧凑括号成多字词，可选按音节插入 "+"，词数不足时循环复用。
```javascript
function applyLyricsToNotes(groupRow, NoteGroup, lyricsText, separate, doPlus, phonemes) {
  var Lyr1 = (separate == "auto") ? autoParts(lyricsText) : lyricsText.split(separate), Lyr2 = [], q, q2, n, u;
  for (q = 0; q < Lyr1.length; q++) {
    var tk = Lyr1[q];
    if (tk.length > 2 && tk.charAt(0) == "(" && tk.charAt(tk.length - 1) == ")") {
      Lyr2.push("(");
      var inner = tk.substring(1, tk.length - 1).split("");
      for (q2 = 0; q2 < inner.length; q2++) { Lyr2.push(inner[q2]); }
      Lyr2.push(")");
    } else { Lyr2.push(tk); }
  }
  Lyr1 = Lyr2;
  var LyricsOfNote = [];
  for (n = 0; n < Lyr1.length; n++) {
    if (Lyr1[n] == "(") {
      n++;
      var note = "";
      while (n < Lyr1.length && Lyr1[n] != ")") { note = note + Lyr1[n]; n++; }
      LyricsOfNote.push(note);
    } else { LyricsOfNote.push(Lyr1[n]); }
  }
  if (doPlus) {
    var N = [];
    for (n = 0; n < LyricsOfNote.length; n++) {
      N.push(LyricsOfNote[n]);
      var idx = groupRow[n] ? groupRow[n].index : 0;
      for (u = 0; u < (phonemes[idx] ? countSyllables(phonemes[idx]) : 1) - 1; u++) { N.push("+"); }
    }
    LyricsOfNote = N;
  }
  if (LyricsOfNote.length == 0) { LyricsOfNote.push(""); }
  for (var o = 0; o < groupRow.length; o++) { var num = (LyricsOfNote.length == 1) ? 0 : (o % LyricsOfNote.length); NoteGroup.getNote(groupRow[o].index).setLyrics(LyricsOfNote[num]); }
}
```
### setJianpuPitch
解析简谱文本并把音高写入所选音符。记法：`1-7` 唱名，`q`/`w` 升/降八度，`#`/`b` 升/降半音，`-` 休止不改音高。
```javascript
function setJianpuPitch(text, diaoshi, manual) {
  var notes = collectSortedNotes();
  var chars = text.split("");
  var textnumber = [0], j = 1, i;
  for (i = 0; i < chars.length; i++) { if ("01234567-".indexOf(chars[i]) != -1) { textnumber[j] = i + 1; j++; } }
  var yinjie = [0, 0, 2, 4, 5, 7, 9, 11];
  for (j = 0; j < textnumber.length - 1 && j < notes.length; j++) {
    var pit = 60 + diaoshi;
    for (i = textnumber[j]; i < textnumber[j + 1]; i++) {
      if (chars[i] == "q") { pit += 12; } else if (chars[i] == "w") { pit -= 12; }
      else if (chars[i] == "#") { pit += 1; } else if (chars[i] == "b") { pit -= 1; }
    }
    var noteNum = Number(chars[textnumber[j + 1] - 1]);
    if (!isNaN(noteNum)) { pit += yinjie[noteNum]; }
    notes[j].setPitch(pit);
    if (manual) { notes[j].setPitchAutoMode(0); }
  }
}
```
### createNotesFromJianpu
从简谱在播放头处创建音符。记法同 setJianpuPitch，另 `0` 休止，`=` 延长前一首符，`.` 附点（1.5x），`_` 缩短（0.5x）。
```javascript
function createNotesFromJianpu(text, diaoshi, defaultLyrics, manual) {
  var chars = text.split("");
  var textnumber = [0], j = 1, i;
  for (i = 0; i < chars.length; i++) { if ("01234567-".indexOf(chars[i]) != -1) { textnumber[j] = i + 1; j++; } }
  var yinjie = [0, 0, 2, 4, 5, 7, 9, 11];
  var group = SV.getMainEditor().getCurrentGroup().getTarget();
  var lastoffset = SV.getMainEditor().getNavigation().snap(SV.getProject().getTimeAxis().getBlickFromSeconds(SV.getPlayback().getPlayhead()) - SV.getMainEditor().getCurrentGroup().getTimeOffset());
  for (j = 0; j < textnumber.length - 1; j++) {
    var Duration = SV.QUARTER;
    var pit = 60 + diaoshi;
    for (i = textnumber[j]; i < textnumber[j + 1]; i++) {
      if (chars[i] == "q") { pit += 12; } else if (chars[i] == "w") { pit -= 12; }
      else if (chars[i] == ".") { Duration *= 1.5; } else if (chars[i] == "_") { Duration *= 0.5; }
      else if (chars[i] == "#") { pit += 1; } else if (chars[i] == "b") { pit -= 1; }
    }
    if (chars[textnumber[j + 1] - 1] == "0") { lastoffset += Duration; }
    else if (chars[textnumber[j + 1] - 1] == "=") {
      if (group.getNumNotes() > 0) { var lastNote = group.getNote(group.getNumNotes() - 1); lastNote.setDuration(lastNote.getDuration() + Duration); }
      lastoffset += Duration;
    } else {
      var noteNum = Number(chars[textnumber[j + 1] - 1]);
      if (!isNaN(noteNum)) { pit += yinjie[noteNum]; }
      var n = SV.create("Note");
      n.setPitch(pit);
      n.setTimeRange(lastoffset, Duration);
      n.setLyrics(defaultLyrics);
      if (manual) { n.setPitchAutoMode(0); }
      group.addNote(n);
      lastoffset = lastoffset + Duration;
    }
  }
}
```
### autoJoinNotes
让相邻音符首尾相接：前一首符时长设为与下一首 onset 之差。
```javascript
function autoJoinNotes() {
  var notes = collectSortedNotes();
  if (notes.length < 2) { return; }
  for (var i = 1; i < notes.length; i++) { notes[i - 1].setDuration(notes[i].getOnset() - notes[i - 1].getOnset()); }
}
```
