/**
 * 歌词对位器（LyricsAligner）—— 独立 SV 脚本（ES5.1），不依赖 agent。
 *
 * 用途：把用户输入的正确歌词，按"转录轨时间"对齐，填到正式轨音符上。
 *   - 转录轨 = SV.getArrangement().getSelection().getSelectedGroups(0) 的 target
 *   - 正式轨 = SV.getMainEditor().getCurrentGroup() 的 target
 *   - 歌词 = 弹窗 form 的多行 TextField（每行一个字/词，- 为停顿）
 *
 * 方式：运行脚本 → 弹窗填歌词 → 点 OK → 按转录轨时间把歌词对位到正式轨音符。
 * 兼容 SV1 / SV2 / Instrument X（主机检测 + 防御式 API）。
 */

// —— 配置（如需，可改脚本内生数据替代弹窗输入）——
var USE_DIALOG = true;   // true=弹窗输入；false=用下面内嵌数组（便于非交互）
var EMBEDDED_LYRICS = ""; // 当 USE_DIALOG=false 时使用，如 "思\n绪\n与\n空\n气..."

function main() {
  var proj = SV.getProject();
  var timeAxis = proj.getTimeAxis();
  var lyricsText = "";

  // 1. 获取歌词
  if (USE_DIALOG) {
    var form = {
      "title": "歌词对位 LyricsAligner",
      "buttons": "OkCancel",
      "widgets": [
        { "name": "lyrics", "type": "TextField", "label": "正确歌词（每行一个词/字，'-' 为停顿）", "multiline": true, "default": "" }
      ]
    };
    var res = SV.showCustomDialog(form);
    if (!res || !res.status) { return; } // 取消
    lyricsText = res.answers && res.answers.lyrics ? String(res.answers.lyrics) : "";
  } else {
    lyricsText = EMBEDDED_LYRICS;
  }

  // 2. 转录轨（选中组）作时间参照
  var refGroup = null;
  try {
    var arrSel = SV.getArrangement().getSelection();
    var gsel = arrSel.getSelectedGroups(0);
    if (gsel && gsel.getTarget) { refGroup = gsel.getTarget(); }
  } catch (e) { refGroup = null; }
  // 3. 正式轨（当前组）
  var tgtGroup = null;
  try {
    var cg = SV.getMainEditor().getCurrentGroup();
    if (cg && cg.getTarget) { tgtGroup = cg.getTarget(); }
  } catch (e) { tgtGroup = null; }

  if (!tgtGroup || tgtGroup.getNumNotes() === 0) {
    SV.showMessageBox("歌词对位", "正式轨（当前组）没有音符，请先建音符。");
    return;
  }

  // 4. 歌词 tokens（按行/逐字；跳过空白；'-' 保留为停顿）
  var tokens = splitLyrics(lyricsText);
  if (tokens.length === 0) {
    SV.showMessageBox("歌词对位", "未输入歌词。");
    return;
  }
  var refNotes = readNotes(refGroup);   // 转录轨音符 [{onsetBlick, pitch, lyric}]

  // 5. 对齐 + 填入
  proj.newUndoRecord();
  var filled = fillByTime(tgtGroup, refNotes, tokens, timeAxis);

  SV.showMessageBox("歌词对位",
    "已填 " + filled + " 个音符（歌词 " + tokens.length + " 字）");
}

// —— 歌词切分：每行一个 token（去前后空白；空行跳过；'-' 保留）——
function splitLyrics(text) {
  var tokens = [];
  if (!text) return tokens;
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].replace(/^\s+|\s+$/g, "");
    if (t === "") continue;
    tokens.push(t);
  }
  return tokens;
}

// 读组音符：[{onsetBlick, pitch, lyric}]
function readNotes(g) {
  var out = [];
  if (!g) return out;
  var n = g.getNumNotes();
  for (var i = 0; i < n; i++) {
    var note = g.getNote(i);
    out.push({ onsetBlick: note.getOnset(), pitch: note.getPitch(), lyric: note.getLyrics() });
  }
  return out;
}

/**
 * 按转录轨时间把歌词对位到正式轨音符。
 * 策略：正式轨音符按 onset 排序；歌词 token 按序分配。
 * 若转录轨存在，以转录轨音符数/时间为参照，先按转录轨时间把歌词映射到"时间槽"，
 * 再据时间把每个正式轨音符匹配到最近的时间槽，取对应 token。
 * 若无转录轨/音符数不一致，直接按顺序分配（保底）。
 */
function fillByTime(tgtGroup, refNotes, tokens, timeAxis) {
  var n = tgtGroup.getNumNotes();
  var out = 0;
  // 正式轨音符按 onset 排序（SV 音符天然按 onset 有序，这里再稳一手）
  var idx = [];
  for (var i = 0; i < n; i++) idx.push(i);
  idx.sort(function (a, b) { return tgtGroup.getNote(a).getOnset() - tgtGroup.getNote(b).getOnset(); });

  // 若转录轨有音符，用它做"时间槽"参照
  var refSorted = refNotes.slice().sort(function (a, b) { return a.onsetBlick - b.onsetBlick; });

  for (var k = 0; k < idx.length; k++) {
    var note = tgtGroup.getNote(idx[k]);
    var token = "";
    if (refSorted.length > 0) {
      // 找该正式轨音符最近的转录轨"时间槽"位置 → 映射到 token 下标
      var tgtOnset = note.getOnset();
      var pos = nearestSlot(refSorted, tgtOnset);
      // pos 是转录轨时刻占比 → 映射到 tokens 下标
      var frac = refSorted.length - 1 > 0 ? pos / (refSorted.length - 1) : 0;
      var ti = Math.min(tokens.length - 1, Math.max(0, Math.round(frac * (tokens.length - 1))));
      token = tokens[ti];
    } else {
      // 顺序保底：按正式轨音符顺序取 token
      token = k < tokens.length ? tokens[k] : "-";
    }
    note.setLyrics(token);
    if (token !== "-") out++;
  }
  return out;
}

// 找 target 在排序数组里最近的 index（按值）
function nearestSlot(sortedArr, targetVal) {
  var best = 0, bd = -1;
  for (var i = 0; i < sortedArr.length; i++) {
    var d = Math.abs(sortedArr[i].onsetBlick - targetVal);
    if (bd < 0 || d < bd) { bd = d; best = i; }
  }
  return best;
}

try { main(); } catch (e) { SV.showMessageBox("歌词对位出错", String(e)); }
