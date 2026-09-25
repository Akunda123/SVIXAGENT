# 旋律重音判断 + 音高线绘制 + 参数应用（workflow）

> 工作流目标：对一段旋律音符，**判断哪些是重音/重点**，并可据此给音符**画音高线（pitch curve）**、
> **应用表情参数（dynamics / vibrato / breathiness 等）**。
> 本文是**基础初稿骨架**，供在此基础上改。约定：**ES5.1**（var/function，无 let/const/箭头/模板串）、
> 时间单位 **blick**（`SV.QUARTER = 705600000` = 一拍）、写操作先 `proj.newUndoRecord()`。
>
> 🔗 **与 08 的分工（重要）**：
>
> | 文档 | 负责 |
> |---|---|
> | **本篇 07** | **判重音** —— 决定**「在哪里加」**音头/表情（§1 的重音检测）|
> | **`08-pit-drawing.md`** | **画法** —— 决定**「怎么加」**（音头 / 颤音 / 音尾三部分、参数取值、方向规则）|
>
> ⚠️ 本篇 §2.4 / §2.4b 的"音头画法 / 音尾画法"是**早期版本**；
> **以 08 的 §6（曲线的画法）为准** —— 08 里已按用户口述精化了参数语义、
> 上/下音头与上/下音尾的定义、方向规律（**音头过冲方向 = 旋律进行方向**）与取值习惯。
>
> **音头位置规则**：**上/下音头都用在「重音」部分** ——
> 即由本篇重音检测判出的重位。所以标准流程是：**本篇 §1 跑出重位列表 → 08 §6 按重位画音头**。

---

## 1. 判断旋律中的重音/重点（乐理 + 脚本思路）

### 1.1 乐理上的"重音"判据（候选规则）

重音/重点不是唯一标准，常见判据可组合打分：

| 规则 | 说明 | 强度 |
|---|---|---|
| **强拍位置** | 4/4 下小节第 1 拍最强、第 3 拍次强；第 2/4 拍弱。`beatInBar = (onset/SV.QUARTER) % beatsPerBar` | 高 |
| **时值长** | 音符持续更久通常更重要（长音 = 段落锚点） | 中 |
| **音高突出** | 音高跳进大（相对前后音）、或到达旋律高点/低点 | 中 |
| **音区极值** | 小节/乐句内的最高/最低音 | 中 |
| **起始位置** | 每小节/每乐句的第一个音符 | 中 |
| **节奏密度** | 音符越短、越密，可能反之是"经过音"（弱）；或越短越强调（看语境） | 低 |

> 实际是**多规则加权打分**：对每个音符算 `score`，超过阈值或取 Top-N 的标为重音。

### 1.2 读取音符并算相关量（脚本）

```javascript
// 读当前组全部音符（pitch/onset/duration/lyrics），拿到组参考（含 timeOffset）
function readNotes(scope) {
  var group = scope.getTarget();
  var timeOffset = scope.getTimeOffset();
  var out = [];
  for (var i = 0; i < group.getNumNotes(); i++) {
    var n = group.getNote(i);
    out.push({
      index: i,
      pitch: n.getPitch(),
      onset: n.getOnset() + timeOffset,        // 绝对 blick
      duration: n.getDuration(),               // blick
      beat: (n.getOnset() + timeOffset) / SV.QUARTER,   // 拍
      lyrics: n.getLyrics ? n.getLyrics() : ""          // 歌词（判断 '-' 用）
    });
  }
  return out;
}
```

### 1.3 强拍判断（需拍号）

```javascript
function beatInBar(onset, beatsPerBar) {
  // onset 为 blick（绝对），SV.QUARTER=1 拍
  var beat = onset / SV.QUARTER;
  return beat % beatsPerBar;   // 0=第1拍(强), beatsPerBar/2 附近=次强, ...
}
// 4/4：beat%4===0 最强；beat%4===2 次强；beat%4 为 1/3 弱
```

### 1.4 分组：处理 `-` 歌词（区分"修饰音/倚音" vs "转音"）

SV 里一个多音节字常拆成几个音符，只有第一个音符带歌词、后面的音符歌词是 `-`。
但 `-` 音符有两种本质不同，**判定标准是"相对主干音符"的长度**：

| 类型 | 特征（相对**主干音符**）| 处理 |
|---|---|---|
| **倚音 / 修饰音**（grace）| `-` 音符**明显短于主干音符**（如 ≤ 主干的一半，且整体很短）| **算作同一个音符**——并入前一有词音符 |
| **转音**（melisma，同音节连续换音高）| `-` 音符**不短于主干**，或**没有主干可相对**（如在乐句首、无前主干）| **算多个音符**——独立成单元，各自参与重音 |

> **主干音符** = 当前有词单元里**时值最长**的那个音符（承担主要时值/音节重心）。
> 对比用**相对比例**（`-` 音 / 主干音），而不是硬编码拍数——不同段落 BPM/时值尺度不同。

```javascript
// 找单元主干音符：单元内时值最长者
function mainNote(unitNotes) {
  var best = unitNotes[0];
  for (var i = 1; i < unitNotes.length; i++) {
    if (unitNotes[i].duration > best.duration) best = unitNotes[i];
  }
  return best;
}

// 把 '-'(或空) 歌词音符，按"相对主干"分组
//  - 倚音：-音时值 <= 主干时值 * graceRatio（默认 0.5）-> 并入前一单元
//  - 转音：-音时值 > graceRatio（相对不短），或无主干可相对 -> 独立成单元
function groupUnits(notes, opts) {
  opts = opts || {};
  var graceRatio = opts.graceRatio || 0.5;   // -音 <= 主干*0.5 视为倚音（并回）
  var units = [];
  var cur = null;
  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    var isDash = (n.lyrics === "-" || n.lyrics === "" || n.lyrics === "- ");
    if (!isDash || !cur) {
      // 有词音符（或首个）：开新单元（先放入，后续再定主干）
      cur = { start: n.onset, end: n.onset + n.duration, onset: n.onset,
              pitch: n.pitch, pitches: [n.pitch], notes: [n] };
      units.push(cur);
      continue;
    }
    // 无词音符：以单元当前主干做相对判断
    var main = mainNote(cur.notes);              // 当前单元主干音符
    var mainDur = main ? main.duration / SV.QUARTER : 0;
    var durBeats = n.duration / SV.QUARTER;
    if (mainDur > 0 && durBeats <= mainDur * graceRatio) {
      // 倚音：明显短于主干 -> 并入（算一个音符）
      cur.end = n.onset + n.duration;
      if (cur.pitches.indexOf(n.pitch) < 0) cur.pitches.push(n.pitch);
      cur.notes.push(n);
      cur.grace = true;
    } else {
      // 转音：相对不短，或(主干事例)无法相对 -> 独立成新单元（算多个音符）
      cur = { start: n.onset, end: n.onset + n.duration, onset: n.onset,
              pitch: n.pitch, pitches: [n.pitch], notes: [n] };
      units.push(cur);
    }
  }
  return units;
}
```

> 可调：
> - `graceRatio`（倚音相对主干的时值比例，默认 0.5）。>0.5 则更多并入（更宽松判倚音）；<0.5 更严（更多转音）。
> - 无主干（如乐句起始就是 `-`）→ 视为转音（独立）。

### 1.5 歌词语义重音（通过歌词判断语义重点）

歌词本身有**语义重音**：**实词（名词/动词/形容词/副词）常重**，**虚词（的/了/在/是/和/吧等助词语气词）常轻**。
**不穷举所有词**——只维护一个**虚词集合**；命中虚词 → 轻（0/负），**否则默认实词 → 重（+1）**。

```javascript
// 虚词/语气词集合（命中=轻；未命中默认=重）。可按语种/风格扩充。
// 思路：虚词集合会随语言变化，但"实词默认重、虚词轻"的规则稳定，不需穷举实词。
var WEAK_WORDS = {
  // 中文 助词/语气词/介词/连词（轻）
  "的":1,"了":1,"在":1,"是":1,"和":1,"吧":1,"呢":1,"吗":1,"啊":1,"呀":1,"哦":1,"了":1,
  "着":1,"过":1,"地":1,"得":1,"把":1,"被":1,"向":1,"跟":1,"从":1,"对":1,"于":1,"之":1,"而":1,"或":1,"与":1,"就":1,"都":1,"也":1,"还":1,"又":1,
  // 英文 冠词/介词/连词/代词（轻）
  "a":1,"the":1,"an":1,"of":1,"to":1,"in":1,"on":1,"at":1,"and":1,"or":1,"but":1,"is":1,"are":1,
  "was":1,"were":1,"be":1,"been":1,"it":1,"that":1,"this":1,"with":1,"for":1,"by":1,"as":1,"from":1
};

// 歌词权重：命中虚词 => 0（轻）；未命中（默认实词）=> 1（重）
function lyricWeight(lyric) {
  if (!lyric) return 0;
  var w = lyric.trim().toLowerCase();
  // 取词（中文逐字/英文按空格分词，这里取整词或首字判断）
  var tokens = w.split(/[\s\-_,，。、]+/);
  var v = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (WEAK_WORDS[tokens[i]]) v = Math.min(v, 0);   // 命中虚词 -> 轻
    else v = Math.max(v, 1);                          // 否则实词 -> 重
  }
  return v;   // 0=轻, 1=重；可扩展为 0.5 弱实词等
}
```

> 这是**规则判断（实词默认重 / 虚词集合轻）**——不用穷举所有词，只维护虚词表（随语言/风格扩充）。
> 想更细：可加**词性标注**（名词/动词重、介词/连词轻）、或**多音节词的音节重音**（em-pha-sis 重音落在某音节）。

> 也可把语义重音作为**独立维度**加进 `scoreUnit`（见 1.6）。

### 1.6 对"单元"打分 + 歌词语义 + 邻音降权

重音打分在**单元**层面，融合：强拍 + 时值 + 音高跳进 + **歌词语义**，并对**重音单元旁边的单元轻微降权**。

```javascript
function scoreUnit(unit, beat, prevUnit) {
  var s = 0;
  // 强拍权重
  var b = beat;
  if (b % 4 === 0) s += 3;        // 每小节首拍
  else if (b % 4 === 2) s += 2;   // 次强
  else s += 0;
  // 时值：长单元加分（如 >=1.5 拍）
  var durBeats = (unit.end - unit.start) / SV.QUARTER;
  if (durBeats >= 1.5) s += 1;
  // 音高突出：与前一单元的音程跳进
  if (prevUnit) {
    var jump = Math.abs(unit.pitch - prevUnit.pitch);
    if (jump >= 4) s += 1;  // 大跳
  }
  // 歌词语义重音：实词重、虚词轻（用单元首音符的歌词）
  var lw = lyricWeight(unit.notes[0] ? unit.notes[0].lyrics : "");
  s += lw;   // 实词 +1，虚词 +0（可给负让虚词更弱）
  return s;
}

// 选重音：逐单元算分，对"重音单元相邻"轻微降权
function pickAccents(units, threshold) {
  var scores = units.map(function (u, i) {
    var beat = u.onset / SV.QUARTER;
    var prev = i > 0 ? units[i - 1] : null;
    return scoreUnit(u, beat, prev);
  });
  var accented = [];
  for (var i = 0; i < units.length; i++) if (scores[i] >= threshold) accented.push(i);
  for (var j = 0; j < accented.length; j++) {
    var a = accented[j];
    [-1, 1].forEach(function (d) {
      var nb = a + d;
      if (nb >= 0 && nb < units.length && scores[nb] >= threshold - 1) scores[nb] -= 0.6;
    });
  }
  var finalAcc = [];
  for (var k = 0; k < units.length; k++) if (scores[k] >= threshold) finalAcc.push(units[k]);
  return finalAcc;
}
```

> 可调参数：
> - `threshold`：重音阈值（如 3）
> - **语义重音**：`WEAK_WORDS` 虚词集合（命中=轻，未命中默认=重；实词无需穷举）
> - `graceRatio`（倚音相对主干的时值比例，默认 0.5；判"算一个音符"vs"转音算多个"）
> - 邻音降权幅度（`-0.6`）

> 打分也可换：加权、每小节/乐句选 Top-N、按音区极值等——在 `scoreUnit` 里改即可。

### 1.7 倚音/修饰音生成（切割音符 + 添加修饰性转音）

> 🛠 **已工具化（2026-09-23 起优先用工具，下面留作原理参考）**：**`sv_apply_ornaments`** ——
> 一次一种装饰音、可套多个目标音符；八型 = 前倚音 / 后倚音 / 向上尖尖 / 波音 / 回音 / 音尾音阶行进（**拆音符**）
> ＋ 反向预备 / 滑音（**只写音符属性**，仅 SV1）。**默认 `dryRun`**；`manual:true` 才把新音符转手动音高；
> `dyn:true` 顺带配 `§2.5` 的那三种配套动态。
> ⚠️ **现行口径**：**装饰音 = 拆分音符，SV2 同样拆音符、不画曲线**；
> **第一段承接原歌词、其余段 `-`**；**拆出的新音符默认是「自动音高」**（一般够用）。
> ⚠️ 下面代码里的 `graceDynamicDip` 那种"写一个点"的做法**已作废** —— 实测**一个点会把该参数在整组变成那个值**，
> 局部形状必须**闭合**（首尾回基线）且**基线先读后写**（用 `sv_write_automation` 的 `probe`）。

**识别**已有 `-` 倚音之外，有时需要**主动给某些音符加装饰**（修饰性转音 / 倚音）：
- 哪些音需要加？常见判据：**重音音符**（`pickAccents` 得到）、**乐句的首音**、强调的词（实词重音）。
- 怎么加？**把主音符切割**出一段短时值，在切口处放一个**短促修饰音（grace note）**，并画音高线做"修饰音 → 主音"的滑入（或滑出）。

> 两种方向：
> - **前倚音（accacciatura）**：修饰音在**主音前**，短促挤入，随后滑到主音。
> - **后倚音**：主音**尾部**短促装饰后回到主音（或滑到下一音）。
> 这里以**前倚音**为主例（切割音符开头一段）。

```javascript
// 切割音符：把 note 在 cutoffBlick 处切成两段（返回新段；SV 里需建两个音符替代原音符）
// 说明：SV 音符不能"就地切"，需 removeNote 后 addNote 两段。这里返回切分方案。
function splitNote(note, cutoffBlick) {
  var origOnset = note.getOnset();
  var origDur = note.getDuration();
  var group = ...;  // 所属组
  // 段1（修饰音段）：origOnset .. cutoffBlick
  // 段2（主音段）：cutoffBlick .. origOnset+origDur
  return {
    grace: { onset: origOnset, duration: cutoffBlick - origOnset },
    main:  { onset: cutoffBlick, duration: origOnset + origDur - cutoffBlick }
  };
}

// 给一个音符加"前倚音"：切割开头，放一个短促修饰音（邻音），画滑入曲线。
// 参数：
//   group        音符所属组（写操作）
//   note         目标音符（要加修饰音）
//   gracePitch   修饰音音高（MIDI；常取主音上方/下方邻音）
//   graceRatio   切出的修饰音占主音时长比例（如 0.15）; graceMinBlick 最短时值
//   direction    'down'='下方邻音下滑到主音'; 'up'='上方邻音下滑'
function addFrontGrace(group, note, gracePitch, opts, timeOffset) {
  opts = opts || {};
  var ratio = opts.graceRatio || 0.15;
  var graceMin = opts.graceMinBlick || SV.QUARTER * 0.1;   // 最短(如16分/更短)
  var mainDur = note.getDuration();
  var graceDur = Math.max(graceMin, Math.round(mainDur * ratio / SV.QUARTER) * SV.QUARTER);
  graceDur = Math.min(graceDur, Math.round(mainDur * 0.5));      // 不超过主音一半

  // 1) 切割主音：主音 onset 后移 graceDur，时长减掉
  var newMainOnset = note.getOnset() + graceDur;
  var newMainDur = mainDur - graceDur;
  note.setTimeRange(newMainOnset, newMainDur);      // 缩短主音（移除旧段）

  // 2) 在切口处新建修饰音（grace note）
  var g = SV.create("Note");
  g.setPitch(gracePitch);
  g.setTimeRange(note.getOnset(), graceDur);        // 占原音符开头那段
  g.setLyrics("-");                                  // 无词/同词延续
  group.addNote(g);                                  // 加进组（自动排序）

  // 3) 给修饰音->主音画滑入曲线（PitchControlCurve，锚点=主音 newMainOnset）
  //    从 gracePitch 滑到主音 note.pitch（前倚音"滑入"）
  var pc = SV.create("PitchControlCurve");
  pc.setPosition(newMainOnset - timeOffset);         // 相对组 timeOffset
  // 曲线 time 相对锚点：起点=修饰音末端(负偏移), 终点=主音start(0)
  var pts = [
    [-graceDur, gracePitch - note.getPitch()],       // 修饰音音高（相对主音）
    [0, 0]                                           // 主音
  ];
  pc.setPoints(pts);
  group.addPitchControl(pc);
}

// 判断"是否加倚音"。有**强制规则** + **谨慎规则**：
//  强规则（强制）：前音与当前音相连 + 前音→当前音为大跳（≥5~6度，常为低→高上行）+ 音符长度允许 → 必加（滑入跨过大跳）
//  谨慎规则（可选）：重音 / 乐句首 / 长音 等，仅在明确旋律意图时加（由 opts.cautious 控制，默认 false）
// 前音=前一单元尾音符；当前音=单元首音符；相连=前音结束≈当前音开始（乐句连续）
function shouldAddGrace(unit, prevUnit, accentedList, opts) {
  opts = opts || {};
  var strongJump = opts.strongJump || 5;   // 音高跨度阈值（半音，5~6度）
  var maxGap = opts.maxGapBlick || SV.QUARTER * 0.05;   // "相连"判定：前音结束与当前音开始的间隙上限
  var minDur = opts.graceMinDurBlick || SV.QUARTER * 0.5; // 音符长度允许（当前音够长才切）
  var note = unit.notes[0];
  var curPitch = note.getPitch();
  var curDur = note.getDuration();

  // (0) 音符长度允许：切换音后主音仍够长（否则不切）
  if (curDur < minDur) return false;

  // (1) 强规则：有前音相连 + 大跳 5~6 度（低→高，常为上行）→ 强制
  if (prevUnit) {
    var prevNote = prevUnit.notes[prevUnit.notes.length - 1];  // 前单元尾音符
    var prevPitch = prevNote.getPitch();
    var gap = (note.getOnset() - (prevNote.getOnset() + prevNote.getDuration())) / SV.QUARTER;
    var connected = gap <= maxGap;                          // 相连（间隙小 = 乐句连续）
    var jump = curPitch - prevPitch;                        // 当前音相对前音
    if (connected && Math.abs(jump) >= strongJump) return true;   // 强制：相连 + 大跳 → 加倚音（跨过大跳）
  }

  // (2) 谨慎规则：重音 / 乐句首 / 长音，且 opts.cautious 开启才加
  if (opts.cautious) {
    if (accentedList && accentedList.indexOf(unit) >= 0) return true;
    var durBeats = curDur / SV.QUARTER;
    if (durBeats >= 1.0) return true;
    // 乐句首由调用方传入（此处可加 isPhraseStart 参数）
  }
  return false;
}

// 综合：遍历单元，给符合条件的加前倚音。gracePitch 用主音上方/下方 2 度邻音。
function addGracesToAccents(units, accentedList, group, timeOffset, opts) {
  opts = opts || {};
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    var note = u.notes[0];                          // 单元首音符（主音符）
    var prevUnit = i > 0 ? units[i - 1] : null;     // 前一单元（判相连/大跳）
    if (shouldAddGrace(u, prevUnit, accentedList, opts)) {
      // 修饰音音高：主音上方/下方邻音（默认上方大二度；"低→高"时可用下方邻音滑入）
      var gracePitch = note.getPitch() + (opts.graceInterval || 2);
      addFrontGrace(group, note, gracePitch, { graceRatio: opts.graceRatio || 0.15 }, timeOffset);
    }
  }
}
```

> 可调参数：
> - `graceRatio`（切割比例，默认 0.15）——切主音开头多少放修饰音
> - `graceMinBlick`（修饰音最短时值）
> - `graceInterval`（修饰音相对主音的音程；**按风格分档**，见下表；可 `-2` 走下方、或按调内选）
>
> **`graceInterval` 风格分档表**（「**按风格分档**」，不再一刀切默认 `+2`）：
>
> | 风格族 | 向上装饰音程 | 写法 | 为什么 |
> |---|---|---|---|
> | **通俗 / 流行 / R&B / 说唱** | **略小于全音**（听感"比半音多一点、又不到一个全音"）| `graceInterval: 1.5` | 半音力道不够、接近全音又过头 ⇒ 取中间值最像"滑上去的尖尖" |
> | **民族 / 戏曲 / 美声 / 通用**（原有默认）| **大二度** | `graceInterval: 2`（省略即此值）| 装饰要**清晰可辨**、有棱角（见下面的"音程清晰度"） |
> | 需要更亮的装饰（如某些高腔/花腔）| **大三度或按调内选** | `+4` 或调内音 | 装饰本身当"小花"用，前提是调内不打架 |
>
> - 该档位**对 ① 前倚音（本节）与 ③ 后倚音（§1.8）同时生效**（两者共用 `graceInterval`）；
> - 落到工具：`sv_write_pit` / 生成器侧按目标风格的档位传值；**不确定风格时用 `+2`**（清晰优先）。
> - **强规则**：`strongJump`（大跳阈值，默认 5 半音）、`maxGapBlick`（相连间隙上限，默认 0.05 拍）、`graceMinDurBlick`（主音可切的最短时值）
> - **谨慎规则**：`cautious=true` 才启用（重音 / 乐句首 / 长音）
> - 方向：本节只做**前倚音滑入**；**后倚音**与**音尾音阶行进**已在 **§1.8** 实现（含 `decideOrnament` 自动判型）。波音（mordent）仍未做。
> - **音程清晰度**（来源 `synthv-tuning`，摘要改写，🔸 未实机验证）：
>   **半音转音听起来不清晰**（都-西、咪-发这类），**至少要到全音或小三度**才转得清楚 ——
>   所以默认 **+2 大二度** 是对的，**不要为了"更细腻"退到半音**。
> - ⚠️ **已按用户裁定剔除**：上游还给了"向上装饰的音程量取**比半音多一点、不到一个全音**"——
>   与默认 `+2` **冲突**，**以为准，不要补回**（冲突的不要）。
> - **装饰的形态**：**必须是"极短的尖尖"，碰到那个音高就走、不留平台**；
>   典型组合 = **前倚音 → 极短的向上尖尖 → 回落到本音**（画法见 §2.5）。

> ⚠️ 注意：
> - **切割会改变音符数量/时值**，需在 `newUndoRecord()` 后做；
> - **修饰音音符**加进组会自动按 onset 排序（`group.addNote`）；
> - **音高线 `setPoints`** 用相对锚点的 [time,半音]，这里是"修饰音音高相对主音"的偏移，容易算反（见 §2 画音高线）。
>
> ⚡ **生成倚音后必须配一个动态凹陷**（前倚音处"挖坑"）——这是"音高技巧必然伴随动态变化"的直接应用。
> 具体画法与三种挖坑做法的听感差异见 **§2.5**；音头本身的画法见 **§2.4**。

---

### 1.8 后倚音 · 音尾音阶行进（补全转音五类型的 ③⑤）

> §2.5 的转音五类型里，① 前倚音已有实现（§1.7），这里补上 **③ 后倚音** 与 **⑤ 音尾音阶行进**。
> ② 短暂小幅度转音、④ 反方向音阶行进属"画法"范畴（不改变音符结构），要点在 §2.5，不必生成音符。

> 🛠 **已工具化**：③ 后倚音、⑤ 音尾音阶行进（以及波音 / 回音）现在都走 **`sv_apply_ornaments`**
> （`ornament: "graceBack"` / `"tailRun"` / `"mordent"` / `"turn"`），**默认 `dryRun`**、`dyn:true` 顺带配配套动态。
> ⚠️ **`main` 段一律给"最长的那一段"**（波音/回音的尾段）—— 真机发现：若把短头当 main，
> 原音符会退化成 0.125 拍、**用户的手动音高/手画数据就留在短头上了**。
> 本节下面的实现**是原理参考**，新的别再手写。

#### ①/③/⑤ 的触发关系不同 —— 先分清"往哪边看"

| 类型 | 看哪个音程 | 修饰音音高取谁 | 听感目的 |
|---|---|---|---|
| ① 前倚音 | **前音 → 本音**（多为**上行**大跳）| 本音的邻音（默认 +2）| 从前面滑进来，**跨过大跳** |
| ③ 后倚音 | **本音 → 后音**（**下行**大跳）| **后一个音的音高** | 尾部**提前亮出目标音高**，掉下去不突兀 |
| ⑤ 音尾音阶行进 | 本音 →（自选目标）| 级进序列（2~5 步）| 现代感收尾 |

> ⚠️ 别把 ① ③ 看反：前倚音看**进来**的音程，后倚音看**出去**的音程。

#### 共用工具：调内级进序列

```javascript
// 从 fromPitch 走到 toPitch 的**级进**音高序列（不含 from，含 to）。
//   scaleMask：12 位数组，1 = 该音级在调内（C 大调 = [1,0,1,0,1,1,0,1,0,1,0,1]）
//              不给则按半音级进（会不够"音阶"味）
//   maxSteps： 上限，超出则等分抽稀（避免切出一堆 64 分音符）
function scaleRun(fromPitch, toPitch, scaleMask, maxSteps) {
  if (toPitch === fromPitch) return [];
  var dir = toPitch > fromPitch ? 1 : -1;
  var seq = [];
  var p = fromPitch;
  var guard = 0;
  while (guard++ < 64) {
    var next = p + dir;
    if (scaleMask) {                                  // 跳到该方向上最近的在调内音级
      var probe = 0;
      while (probe < 12 && !scaleMask[((next % 12) + 12) % 12]) { next += dir; probe++; }
    }
    if (dir > 0 ? next > toPitch : next < toPitch) break;   // 越过目标就停
    seq.push(next);
    p = next;
    if (p === toPitch) break;
  }
  if (seq.length === 0 || seq[seq.length - 1] !== toPitch) seq.push(toPitch);  // 收在目标音上
  if (maxSteps && seq.length > maxSteps) {
    var out = [];
    for (var i = 1; i <= maxSteps; i++) out.push(seq[Math.round(i * seq.length / maxSteps) - 1]);
    seq = out;
  }
  return seq;
}
```

#### ③ 后倚音（`addBackGrace`）

```javascript
// 后倚音：从主音**尾部**切一段，放一个"承接后一个音"的短促修饰音。
// 用途（§2.5 类型③）：**从很高的音往下掉**时，提前把目标音高亮出来。
//   与前端音的差别：主音 onset 不动、只缩短尾部；曲线从主音滑**出**到修饰音。
function addBackGrace(group, note, nextNote, opts, timeOffset) {
  opts = opts || {};
  var ratio = opts.graceRatio || 0.15;                      // 切主音尾部的比例
  var graceMin = opts.graceMinBlick || SV.QUARTER * 0.1;    // 修饰音最短时值
  var mainDur = note.getDuration();
  var graceDur = Math.max(graceMin, Math.round(mainDur * ratio / SV.QUARTER) * SV.QUARTER);
  graceDur = Math.min(graceDur, Math.round(mainDur * 0.5)); // 不超过主音一半

  var mainOnset = note.getOnset();
  var mainPitch = note.getPitch();
  var newMainDur = mainDur - graceDur;
  if (newMainDur < SV.QUARTER * 0.25) return null;          // 主音被切太短 → 放弃
  note.setTimeRange(mainOnset, newMainDur);                 // 主音缩短（尾部让出）

  // 修饰音音高：**优先承接后一个音**；没有后音（句尾）才退到邻音
  var gracePitch = (opts.pitch !== undefined)
    ? opts.pitch
    : (nextNote ? nextNote.getPitch() : mainPitch - (opts.graceInterval || 2));

  var g = SV.create("Note");
  g.setPitch(gracePitch);
  g.setTimeRange(mainOnset + newMainDur, graceDur);
  g.setLyrics("-");
  group.addNote(g);

  // 滑出曲线：主音音高 → 修饰音音高。锚点=主音 onset，覆盖到主音新结束点为止。
  // ⚠️ 曲线**不要越过 newMainDur**，否则会盖掉修饰音自己的音高。
  var pc = SV.create("PitchControlCurve");
  pc.setPosition(mainOnset - timeOffset);
  pc.setPoints([[0, 0], [newMainDur, gracePitch - mainPitch]]);
  group.addPitchControl(pc);

  return { gracePitch: gracePitch, graceDur: graceDur };
}
```

#### ⑤ 音尾音阶行进（`addTailScaleRun`）

```javascript
// 音尾音阶行进：把主音**尾部**切成 K 个极短音符，做一段级进（真音符 = 真跑动）。
// ⚠️ 这是**风格性**手段（"较现代"），必须显式开启，不要自动加。
function addTailScaleRun(group, note, opts, timeOffset) {
  opts = opts || {};
  var K = Math.max(2, Math.min(opts.steps || 3, 5));         // 2~5 步；再多就成"跑句"了
  var ratio = opts.graceRatio || 0.3;                        // 整段占主音比例
  var stepMin = opts.stepMinBlick || SV.QUARTER * 0.0625;    // 单步最短（1/64）
  var mainDur = note.getDuration();
  var total = Math.max(stepMin * K, Math.round(mainDur * ratio / SV.QUARTER) * SV.QUARTER);
  total = Math.min(total, Math.round(mainDur * 0.5));
  var step = Math.max(stepMin, Math.round(total / K / SV.QUARTER) * SV.QUARTER);
  total = step * K;

  var mainOnset = note.getOnset();
  var mainPitch = note.getPitch();
  var newMainDur = mainDur - total;
  if (newMainDur < SV.QUARTER * 0.25) return null;           // 主音被切太短 → 放弃
  note.setTimeRange(mainOnset, newMainDur);

  // 目标音高：默认在本音方向上 +2（大二度，见 §1.7 的音程清晰度）；也可给 interval/pitch
  var target = (opts.pitch !== undefined)
    ? opts.pitch
    : mainPitch + (opts.direction === "down" ? -1 : 1) * (opts.interval || 2);
  var seq = scaleRun(mainPitch, target, opts.scaleMask, K);

  var cursor = mainOnset + newMainDur;
  for (var i = 0; i < seq.length; i++) {
    var g = SV.create("Note");
    g.setPitch(seq[i]);
    g.setTimeRange(cursor, step);
    g.setLyrics("-");
    group.addNote(g);
    cursor += step;
  }
  return { steps: seq.length, stepBlick: step, totalBlick: total, pitches: seq };
}
```

#### 触发判定：`decideOrnament`（①③⑤ 一条链）

```javascript
// 返回 "front" / "back" / "tailrun" / null
function decideOrnament(unit, prevUnit, nextUnit, opts) {
  opts = opts || {};
  var strongJump = opts.strongJump || 5;                     // 大跳阈值（半音）
  var maxGap = opts.maxGapBlick || SV.QUARTER * 0.05;        // "相连"间隙上限（拍）
  var minDur = opts.graceMinDurBlick || SV.QUARTER * 0.5;    // 主音够长才切
  var note = unit.notes[0];
  if (note.getDuration() < minDur) return null;

  // ① 前倚音：**进来**是上涨大跳 → 滑入跨过
  if (prevUnit) {
    var prev = prevUnit.notes[prevUnit.notes.length - 1];
    var gapIn = (note.getOnset() - (prev.getOnset() + prev.getDuration())) / SV.QUARTER;
    var jumpIn = note.getPitch() - prev.getPitch();
    if (gapIn <= maxGap && jumpIn >= strongJump) return "front";
  }

  // ③ 后倚音：**出去**是下跌大跳 → 尾部提前亮出目标音高（§2.5："从很高的音往下掉时用"）
  if (nextUnit) {
    var next = nextUnit.notes[0];
    var gapOut = (next.getOnset() - (note.getOnset() + note.getDuration())) / SV.QUARTER;
    var jumpOut = next.getPitch() - note.getPitch();
    if (gapOut <= maxGap && jumpOut <= -strongJump) return "back";
  }

  // ⑤ 音尾音阶行进：风格性，必须显式开启（长音才考虑）
  if (opts.tailRun && note.getDuration() >= SV.QUARTER * 2) return "tailrun";

  // 谨慎规则（默认关）：重音 / 长音 → 前倚音
  if (opts.cautious) {
    if (note.getDuration() / SV.QUARTER >= 1.0) return "front";
  }
  return null;
}

// 批量入口：按判定分发，并返回**动态配套清单**（交给调用方去画响度/发声）。
function applyOrnaments(units, group, timeOffset, opts) {
  opts = opts || {};
  var report = [];
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    var prevUnit = i > 0 ? units[i - 1] : null;
    var nextUnit = i < units.length - 1 ? units[i + 1] : null;
    var kind = decideOrnament(u, prevUnit, nextUnit, opts);
    if (!kind) continue;
    var note = u.notes[0];
    var onset = note.getOnset();
    var dur = note.getDuration();
    var res = null;

    if (kind === "front") {
      res = addFrontGrace(group, note, note.getPitch() + (opts.graceInterval || 2),
                          { graceRatio: opts.graceRatio || 0.15 }, timeOffset);
      // 动态：修饰音处挖坑（§2.5 核心规则）
      report.push({ i: i, kind: kind, dipAt: onset, dipLen: Math.round(dur * 0.15) });

    } else if (kind === "back") {
      res = addBackGrace(group, note, nextUnit ? nextUnit.notes[0] : null, opts, timeOffset);
      // 动态：尾部渐弱（不是挖坑 —— 后倚音是"交代"，不是"强调"）
      report.push({ i: i, kind: kind, fadeFrom: onset + Math.round(dur * 0.85), fadeTo: onset + dur });

    } else if (kind === "tailrun") {
      res = addTailScaleRun(group, note, opts, timeOffset);
      // 动态：每步递减（跑动要"越跑越轻"），由调用方按 res.steps 画
      if (res) report.push({ i: i, kind: kind, steps: res.steps, stepBlick: res.stepBlick,
                             runFrom: onset + (dur - res.totalBlick) });
    }
    if (res !== null || kind === "front") report[report.length - 1].result = res;
  }
  return report;
}
```

> **可调参数（§1.8 新增）**
> - `steps`（音尾音阶行进的步数，默认 3，上限 5）· `stepMinBlick`（单步最短，默认 1/64）
> - `direction`（音尾音阶行进方向，默认 up）· `interval`（目标音程，默认 +2 大二度）
> - `scaleMask`（调内音级表；**给了才是"音阶行进"**，不给就是半音级进）
> - `tailRun`（是否允许音尾音阶行进，**默认 false** —— 风格性手段，必须显式开）
> - `allowBack`（是否允许后倚音，默认 true）
>
> **三条注意**
> 1. **切割都是"缩短主音 + 新建短音"**，一律在 `newUndoRecord()` 之后做（同 §1.7）。
> 2. **曲线不要越界**：后倚音的滑出曲线只覆盖到主音新结束点，越界会盖掉修饰音自己的音高。
> 3. **SV1 没有 `PitchControlCurve`**（§1.4：`addPitchControl` 系 2.1.0+）⇒ SV1 上改用**修饰音的属性**做滑入/滑出：
>    前倚音给修饰音 `dF0Right`/`tF0Right`，后倚音给主音 `dF0Left`/`tF0Left`（响应表见 §2.4，SV1 双通道见 §1.4）。
>    **音符层面的切割/新增在 SV1 上完全一样可用**，只有曲线那一步要换写法。

---

## 2. 给音符画音高线（pitch curve）

SV 的音高线 = **PitchControlPoint / PitchControlCurve**，挂在 **NoteGroup** 上（`addPitchControl`）。

### 2.1 API 要点

- `group.addPitchControl(curveOrPoint)` —— 加音高控制对象（2.1.0+）
- `PitchControlCurve`：`setPosition(blick)`（锚点位置）+ `setPoints([[time,value],...])`（相对锚点的 [时间,blick, 音高偏移,半音]）
- `PitchControlPoint`：`setPosition(blick)` + `setPitch(semitones)`（固定值点）

### 2.2 在某个音符上画一段音高线（滑音/装饰）

```javascript
function applyPitchCurve(group, note, curve) {
  // curve: [{timeBlick, valueSemitone}] 相对音符 onset
  // 用 PitchControlCurve：锚点 = 音符 onset，time 相对锚点
  var pc = SV.create("PitchControlCurve");
  pc.setPosition(note.onset - timeOffset);        // 相对组 timeOffset 的 blick
  var pts = [];
  for (var i = 0; i < curve.length; i++) {
    pts.push([curve[i].timeBlick, curve[i].valueSemitone]);
  }
  pc.setPoints(pts);
  group.addPitchControl(pc);
}
```

> 注意：`setPoints` 的 `time` 是**相对曲线锚点**的 blick，`value` 是**相对锚点音高的半音偏移**。
> 锚点位置是**相对组 timeOffset**。这就是"画音高线"的关键换算——容易踩坑。

### 2.3 音符级固定音高偏移（pitch bend）

```javascript
// 给音符加一个"距锚点半音偏移"的固定点
var pt = SV.create("PitchControlPoint");
pt.setPosition(note.onset - timeOffset);
pt.setPitch(offsetSemitone);   // +2 = 升两半音
group.addPitchControl(pt);
```

> 常用：音符内做**滑音（先低后目标）**或**收尾微降**。

### 2.4 音头画法（重音的核心）

> ⚠️ **本节为早期草稿** —— **以 `08-pit-drawing.md` §6.2 为准**。
> 两处关键差异：
> 1. **方向规律**：`08` 已确认 **音头过冲方向 = 旋律进行方向**
>    （上行 → 上音头；下行 → 下音头；同音 → 下音头）。
> 2. **`dF0Left` 符号**：沿用 SV1 语义（**正 = 走旋律方向、负 = 反向**），
>    不是"符号直接定方向"。

§1 判断出"哪些是重音"之后，**怎么把它画出来**是另一回事。重音主要靠**音头**，音头有三种：

| 类型 | 声音状态 | 情绪 | 画法（相对目标音高，单位半音）|
|---|---|---|---|
| **音头下沉** | 前音收尾松弛、本字再收紧 | 沉稳、笃定 | 自目标音高**下方**逐级抬上来 |
| **音头上扬** | 前音收尾憋力、本字炸开 | 激动、强调 | 由**上方**坠到目标音高 |
| **音头抖动** | **重音**（最贴"强调"）| 铿锵、强调 | 先压到目标音高**下方** → **冲过头** → 再回落到目标 |

```javascript
// 音头下沉（最常用，用量可以是上扬的很多倍）
// 从 -1.5 半音走到 0（目标），占音符开头一小段
var dip = [{ timeBlick: 0, valueSemitone: -1.5 }, { timeBlick: headLen, valueSemitone: 0 }];

// 音头抖动（重音）：下方 → 冲过目标 → 回落
var shake = [
  { timeBlick: 0,            valueSemitone: -1.0 },  // 下方蓄力
  { timeBlick: headLen*0.5,  valueSemitone: +1.0 },  // 冲过头
  { timeBlick: headLen,      valueSemitone: 0 }      // 回落目标
];
```

> ⚠️ **最常见的错误：把音头下沉/抖动画在本字的元音上。**
> **正确位置是"前一个音的音尾"或"本字的辅音段"**——**元音起点必须已经回到标准音高**。
> 一旦画在本字的元音上，出来的人声就完全不像人在唱。

> ⚠️ **轻辅音上画 Pit 完全无效**——轻辅音没有音高特性（噪波）。
> 只有**浊辅音/半元音（m/n/l/r/y/w）**有音高，可以画、也必须画。
> 碰到 w/y/m/n/l/r 打头的字，**下沉段得往前推到辅音起点之前**，好让整段辅音都从低处往上爬；
> 要是只覆盖元音那一截，听感就成了先降后升，很怪。

> **前提（关键）**：想让某个字的音头突显，**前一个音的音尾必须适当画下去**——否则音头做得再狠也顶不出来。
> 音头与音尾是配套的（见 §2.4b）。

### 2.4b 音尾画法（给下一个音头让位）

| 类型 | 声音状态 | 情绪 |
|---|---|---|
| 下沉 | 突然放松 | 气势或消沉 |
| 上扬 | 爆发力 | 俏皮或紧张 |
| 下沉再上扬 | 松下来之后猛地使劲 | 撩人或者委屈（**效果强但很腻，只作偶尔点缀**）|

> **音尾要配合音头用**：要让下一个字的音头站出来，就得把前一个音的音尾压下去一截。
> 这也是 §1.6 里"邻音降权"在**听感层**的对应做法——判重音时邻音降权，画线时邻音音尾下沉。

### 2.5 转音画法 + 倚音必须配"动态坑"（呼应 §1.7）

§1.7 用切割 + 加音符的方式生成倚音；这里补**画法**与**配套的动态处理**。

**转音的五种类型**（前两种最常用）：

| # | 类型 | 说明 | 实现 |
|---|---|---|---|
| 1 | **前倚音** | **最常见**。在目标长音前做一个小小的音高装饰 | ✅ **§1.7 `addFrontGrace`** |
| 2 | 短暂、小幅度转音 | 对长音起装饰作用 | 📐 画法（不改音符结构）|
| 3 | **后倚音** | 承接后一个音符的音高；**从很高的音往下掉时用**，否则掉得太突兀 | ✅ **§1.8 `addBackGrace`**（补）|
| 4 | 改变音高时反方向的音阶行进 | 点到为止 | 📐 画法 |
| 5 | 音尾出现的短暂音阶行进 | 较现代的唱法 | ✅ **§1.8 `addTailScaleRun`**（补，须显式开 `tailRun`）|

> **③⑤ 的画法要点**（与 §1.8 的生成配套）
> - **③ 后倚音**：尾部那一下要**短促、干净地"交代"**目标音高，**不要带平台**；滑出方向与后音一致的下降斜度。
>   形态上是"**先顿一下再落**"——顿的那一下就是后倚音。**从很高的音往下掉**时没有它就会显得突兀。
> - **⑤ 音尾音阶行进**：**每步递减**（越跑越轻），收尾要**干净截断**、别拖尾巴；步数 2~5，
>   再多就不是"行进"而是"跑句"了。**只能在长音上考虑**，且必须显式开（风格性手段）。
> - 两者都属于"**现代/流行**"取向；民族、戏曲类曲风**优先用 ① 前倚音**（甩腔、哭腔的直上直下见 §2.6）。
> - ② ④ 是**纯画法**（不切音符）：② 就是在本音上做一小段幅度很小的音高浮动；
>   ④ 是"要往上走之前先向下点一下再上行"（反之亦然），**点到为止**，别做成第二条旋律。

**⚡ 核心规则：转音/倚音必须配合动态。前倚音的位置要在动态上压出一个下凹的小三角。**

> **三种装饰的动态配套不一样**（§1.8 `applyOrnaments` 会返回清单交给调用方）：
> | 装饰 | 动态做法 | 为什么 |
> |---|---|---|
> | ① 前倚音 | **挖坑**（下面的坑表）| 强调音头、收敛深情 |
> | ③ 后倚音 | **尾部渐弱**（不是坑）| 后倚音是"交代目标音高"，不是"强调"；挖坑会让它变成一个新的重音 |
> | ⑤ 音尾音阶行进 | **每步递减** | 跑动要越跑越轻，否则收尾像"滑倒" |

| 挖坑做法 | 听感 |
|---|---|
| 不挖坑 | 自如、放开的唱法 |
| 挖坑（**坑越深越哽咽**）| 更收敛、更深情 |
| 纯 **响度** 坑 | 像用力收起了嗓子（总线，容易夸张）|
| 画 **发声** 坑 | 只降谐波、气声还在 → 像嗓子哑了一下，**更适合哽咽** |
| 两者配合 | 折中 |

```javascript
// 生成倚音后，给这个字配一个动态凹陷（呼应 §1.7 的 addFrontGrace）
// 用发声坑（更适合哽咽）或响度坑
function graceDynamicDip(group, onsetBlick, dipBlick, depth) {
  // depth：负值（如 -0.15 的 dynamic 或若干 dB）
  applyAutomation(group, "loudness", [        // 或 "voicing" 做发声坑
    { timeBlickAbs: onsetBlick,                value: 0 },
    { timeBlickAbs: onsetBlick + dipBlick/2,   value: depth },   // 坑底
    { timeBlickAbs: onsetBlick + dipBlick,     value: 0 }
  ]);
}
```

**装饰的形态**（来源 `synthv-tuning`，摘要改写，🔸 未实机验证）：
- **必须是"极短的尖尖"——碰到那个音高就走，不留平台**（顶到目标音高后立刻回落，别停在那儿）。
- 典型组合：**前倚音 → 极短的向上尖尖 → 回落到本音**。
- 与 §2.6 的判据一致：**"一划到位"** 才算对，留平台就是拖沓。

**连续转音**：
- **快速连续**：只在头一个前倚音上做明暗对比 + 一处突出的动态变化，**往后的密集段仅留适当的张力变化**——
  每个转音都做明显动态变化会**磕磕巴巴**。
- **慢速连续**：逐音各自做一次渐强，每个音的音头都先压后回；细画，听上去音音都有掌控。
- **相邻两个转音之间要把音高浮动切得足够明显**，否则会**连成一条滑音**。
- 连续转音要改就让**响度/发声/张力**去动（咬字还是同一个，拿音区偏移去改会闹得口型忽大忽小）。

**滑音 = 非常慢的转音**（转音慢到某程度就是滑音，无明确界限）。作用是柔化旋律、增加诉说感。
> ⚠️ **滑音一多就非常油腻扭捏**——整句挑一处点一下足矣，剩下的字一律走直音。

### 2.6 幅度与时值判据（避免电音 / 拖沓 / 跑调）

| 判据 | 数值/规则 |
|---|---|
| **普通音头突出幅度** | 大致 **3 个半音**；只有情绪走到极端、快破音时才往上加 |
| 整体觉得过头 | 将 Pit 整体程度砍到 **50%**，一般就恢复正常 |
| **画得太陡 → 出电音** | 一堆 Pit 技巧挨得太紧、每笔都拐直角，必然出电音 |
| **画得太长 → 拖沓** | 听者判音准盯的是这个音的**主干位置**；Pit 拖得过久，就会被听成"这音半天才挪过去" |
| **唯一判据** | 能不能"**一划到位**" |
| 核心原则 | **转音/音头的幅度和时值都要控制——转丢了就是跑调**；长度以"听不出这是在转音"为限 |
| **Pit 直上直下** | 只有三种地方这么画：民歌甩腔、哭腔、音尾上扬。**别处都得留出过渡斜度**（完全直上直下会电）|

> **注意音频技巧的用量**：一首歌里像"向上飞的颤音""下沉再上扬"这类强效果，**点一两次就够，用多了非常怪**。

---

## 3. 各种参数的应用（automation）

SV 音符组的**表情/气息/振动**等是 ``` Automation``` 对象，通过 `group.getParameter(type)` 拿，然后 `add(x,y)` / `removeAll()`。

> 🔑 **使用策略**：**大多数参数"用户提出才用"** ——
> **不要主动替用户调参**；但**可以提醒用户"这种情况该用哪个参数"**（给建议、由用户拍板）。
> 📌 **在 Pit 已稳定的前提下，剩下的参数里 `tension` 影响最大**（→ §3.2e）——
> ⚠️ **本节不含 Pit，而 Pit 的优先级永远在参数之前**；Pit 稳定后才轮到参数。

#### 参数 × 宿主 适用性总表（索引，2026-09-11）

| 参数 | SV1 | SV2 | IX | 备注 |
|---|---|---|---|---|
| `pitchDelta` | ✅ | ⚠️ **一般不用**（SV2 能直接划线）| ✅ 对**乐器音高**有效 | ⚠️ IX **编辑器里改不了**，只能脚本写（§3.2b）|
| `vibratoEnv` | ✅（乘手动音符 `dF0Vbr`）| ⚠️ 自动音符的自动颤音可用；**画了音高控制线的区段不可用** | ✅（IX **乐器颤音幅度**）| §3.2c |
| `loudness` | ✅ | ✅ | ✅ **效果一致** | §3.2d |
| `tension` / `breathiness` / `voicing` / `gender` / `mouthOpening` | ✅ | **未说明** | **未说明** | 用户**未逐个说明宿主差异** ⇒ 按既定约定**别假定**，要用先问 |
| `toneShift` | ✅（AI 声库）| ✅（AI 声库）| ✅（AI 声库）| **仅 AI 声库适用** —— 采样声库走采样音阶（上游经验，见 §3.2h 增补）|
| 那 12 个 `tF0*` / `dF0*`（音符属性）| ✅ **专属** | ❌ | ❌ | 见 §1.2 / §5 |

### 3.1 可用参数 type（`Automation.getDefinition().typeName`）

| typeName | 含义 | 取值范围（示意） | 用途 |
|---|---|---|---|
| `pitchDelta` | 音高偏移 | **cent（±1200）** | **SV1 音符属性的补充**；SV2 能直接划线 ⇒ **一般不用**；**对 IX 乐器音高也有效但编辑器改不了**（见 §3.2b）|
| `vibratoEnv` | **颤音倍数**（乘在 `dF0Vbr` / 自动颤音 / IX 乐器颤音幅度上）| 0~2 | 见 **§3.2c** |
| `loudness` | 响度（**就是音量**）| dB（最低档 ≈ −48）| 贴伴奏起伏 / **跨轨无缝拼接** → 见 **§3.2d**（**IX 上效果一致**）|
| `tension` | **注音力度**（`>0` 强力 / `<0` 柔和）| — | 强弱对比；⚠️ **0 附近音色突变** → 见 **§3.2e** |
| `breathiness` | **噪波量**（气声 / 粗粝度）| -2~2 | 见 **§3.2f** |
| `voicing` | **谐波量**（发声 / "实"的成分）| — | 见 **§3.2f** |
| `gender` | **性别 / 共振峰** | — | **拉高变粗厚**（口型大，像慢放）↔ **拉低变尖紧**（像快放）→ 见 **§3.2g** |
| `toneShift` | **发声位置偏移**（音高不变，换音区音色）| **cent** | 借别的音区的音色 → 见 **§3.2h** |
| `mouthOpening` | **开口度** | — | 见 **§3.2i** |

> 确切取值以 `getDefinition().range` 为准（但**实测 `getDefinition()` 的 range 字段在桥脚本里可能闪退**，见坑点）。建议读磁盘 `.svp` 对照，或只 `add(x,y)` 用已知合理值。

### 3.2 设置某段参数（如 vibrato / loudness）

```javascript
function applyAutomation(group, type, points) {
  // points: [{timeBlickAbs, value}]（绝对 blick）→ automation.add(x, y)
  var auto = group.getParameter(type);
  if (!auto) return;
  auto.removeAll();
  for (var i = 0; i < points.length; i++) {
    auto.add(points[i].timeBlickAbs, points[i].value);
  }
}
// 示例：给整个组加一个从 0.2 渐到 1 的颤音
function setVibrato(group, startAbs, endAbs, fromVal, toVal) {
  applyAutomation(group, "vibratoEnv", [
    { timeBlickAbs: startAbs, value: fromVal },
    { timeBlickAbs: endAbs,   value: toVal }
  ]);
}
```

> 注意：`Automation.add(x, y)` 的 `x` 是**绝对 blick**（automat points 存 `[x,y...]`）。
> **SV2 / IX 里 `getPoints/getAllPoints/getLinear/getDefinition` 可能卡死/闪退宿主**——读 automation 数据走磁盘或 `add/get(x)` 安全读写。

### 3.2b 通用特性 与 `pitchDelta` 的定位

#### ① 所有 parameter 都支持「局部改」

**不必 `removeAll()` 整条替换** —— 可以只增 / 删 / 改需要的那一段（API 见 `api/Automation.md`）。

> ⚠️ §3.2 的 `applyAutomation()` 示例开头就是 `removeAll()`，那是**"整条替换"写法**：
> **只想改一段时不要抄它**，否则会把工程里已有的自动化全清掉。

#### ② 三层叠加：**实际参数 = 引用层 `getVoice()` ＋（SV1）主音符组 ＋ 音符组 automation**

| # | 层 | 载体 / API | 作用对象 |
|---|---|---|---|
| 1 | **引用层**（group 引用的 voice 默认值）| `groupReference.getVoice()` / **`setVoice(attributes)`** | 该 **引用**下的音符（**可读写**）|
| 2 | **主音符组** —— **仅 SV1** | 同轨 main group 的同类参数 | 同轨**非主音符组**的音符 |
| 3 | **音符组 automation** | `group.getParameter(type)`（§3.2 那套）| 本组音符，**逐时间点** |

**第 1 层（引用层）细节** —— `getVoice()` 返回的对象（`api/NoteGroupReference.md`）：

| 字段 | 含义 |
|---|---|
| `paramLoudness` | 响度（dB）|
| `paramTension` / `paramBreathiness` / `paramGender` / `paramToneShift` | 张力 / 气声 / 性别 / 音色偏移 |
| `vocalModeParams`（2.1.1+）| 每个 vocal mode（如 `"Soft"`/`"Powerful"`）→ `pitch` / `timbre` / `pronunciation`，各 **0~150** |
| **仅 SV1** 的 9 个音高字段 | `tF0Left` `tF0Right` `dF0Left` `dF0Right` `tF0VbrStart` `tF0VbrLeft` `tF0VbrRight` `dF0Vbr` `fF0Vbr` |

- ✅ **第 1 层可以用 `setVoice(attributes)` 改数值**，而且**只给要改的属性即可**，未给的不动
  （API 原文：*"The attribute object does not have to be complete; **only the given properties will be updated**"*）⇒ 与 ① 的"局部改"一致。
- 第 2 层：**叠加后可达约两倍上限**，⚠️ 但**上限档声音已经很扭曲**，**一般不考虑**用这个特性顶上限。
- ⚠️ **SV2 已经没有主音符组** —— 第 2 层**只对 SV1 成立**。判定 API：`NoteGroupReference.isMain()`
  *"Whether this NoteGroupReference refers to the **parent Track's main group**."*

> ⚠️ **重要例外：那 12 个属性（`tF0*` / `dF0*`，音高线的形状参数）不是"叠加"**
>
> - **音符级 `Note.getAttributes()` 是「替换」引用层默认值**，**不是相加**；
> - **引用层（`getVoice()`）里的这些属性只对「默认音符」生效** —— 音符一旦被单独编辑过，就以音符级的值为准。
> - 📌 **概念边界：音符组 / `getVoice()` 里没有"音高"** —— 这些字段是**过渡与颤音参数**（时长/深度/频率）；
>   **音高本身在音符上**（`Note.getPitch()`）。
> - 🔗 这与两条**已实测**的结论完全吻合：SV1 的 `getAttributes()` **只返回非默认字段**；
>   要把某音符**恢复默认**必须写 **`NaN`**（写回默认 ⇒ 回落到引用层的值）。
> - **完整回落链**：**① 音符自己的值 → ② `getVoice()` → ③ JS 脚本里写的默认值**
>   （脚本默认值那张表见 `08-pit-drawing.md §5.1`；且 `getVoice()` 只有 9 个音高字段，缺 `tF0Offset`/`pF0Vbr`/`tNoteOffset` ⇒ 这 3 个直接落到第③档）。
>
> ⇒ **这 12 个属性是「覆盖（override）」模型，参数层才是「叠加（add）」模型 —— 两者别混。**

#### ③ `pitchDelta` 的定位

- 它是 **SV1 音符属性的补充**；**SV2 能直接划线**，所以 —— **一般不用**。
- 公式：**实际音高 = 自动音高 / 音符属性音高 + `pitchDelta`**
  （音高的构成详见 `08-pit-drawing.md §1.1`；`§2.3` 的脚本声明了它却从未使用，正好印证"一般不用"）。
- 🔸 **对 IX（Instrument X）的乐器音高也有控制效果**——
  ⚠️ 但**用户的编辑器里无法直接在 IX 上编辑它** ⇒ 只能**用脚本写**。
- ✅ **什么时候用它**：**音符属性不够用的时候** ——
  **大多数情况"左右过渡 + 颤音"就够**；不够时把**颤音强度归零 + 其余参数归 `NaN`**（音高近乎一条直线，
  **但保留 `dF0Left`/`dF0Right`**，完全平直会太死板），**再用 `pitchDelta` 把想要的形状画出来**
  （详见 `08-pit-drawing.md §1.4` 末）。
- ✅ **算"不够用"的三种情形**：
  ① **复杂音头**（音头要拐多个弯）；② **复杂变频颤音**（颤音频率/幅度要渐变）；
  ③ **复杂音尾**。 —— 都超出"一个左过渡 + 稳定颤音 + 一个右过渡"的模型。

#### 上游增补（来源 `synthv-tuning`，摘要改写）

**① 局部改的两个"编辑器层"坑**

| 坑 | 说明 |
|---|---|
| **SV2 参数不跟随音符移动** | SV1 里拖动音符参数会跟着走；**SV2 不跟随 ⇒ 拖完必须重新对齐**（参数栏有透明度可用来对齐）|
| **SV1 工程用 SV2 打开时部分参数不识别** | 跨版本打开工程，改参数前先核一遍 |

> 📌 工程上"局部改"的实现路径：**打包成音符组、只在组内调参**（同一轨内完成，不用来回切轨）；
> 代价是**组内外交界处不好卡准**。

**② "三层叠加"的另一套口径（上游版）—— 与本节②并存，别混**

| 口径 | 三层分别是什么 | 可累积上限 |
|---|---|---|
| **（API 层）** | 引用层 `getVoice()` / SV1 **主音符组** / 音符组 automation | 主音符组叠加可达**约两倍**上限 |
| **上游（工程层）** | **组内 automation / 组外 automation / 音轨默认参数** | 以音区偏移为例：**单层 400 音分 → 两层 8 半音 → 三层 12 半音（一个八度）** |

- 上游明确：**第三层已经明显不自然**，用之前先确认那个音域的发声状态吃不吃得下。
- 上游给的触发条件很具体：**AI 长音要拉回真声音域、单层拉到底还不够**时，才走"打包音符组"这条路。

**③ 那 12 个属性的作用范围（补一条边界）**

**作用范围只圈在本音符之内 —— 前面的辅音够不着。** 想在**辅音段**动手画音高，只能把**辅音音素单独拆成一个音符**。

**④ 使用策略上，上游口径与我们相反（引用时别混）**

上游是"**AI 主动把整套参数铺完**"（十步流程 + 技巧优先级）；我们是"**建议 + 用户拍板**"（见本节开头的策略）。
⇒ 引用上游素材时，**取它"怎么调"，不要取它"直接动手"的惯性**。

### 3.2c `vibratoEnv` —— **颤音的倍数**

> ### 🔑 **有效颤音幅度 = `dF0Vbr` × `vibratoEnv`**
> **倍率乘在 `dF0Vbr` 这个参数值上**—— 不是乘在最终音频幅度上。
> ⇒ 这正是"**借倍率放大 `dF0Vbr`**"能成立的原因：`dF0Vbr` 的 UI 上限是 **2 半音**，而倍率足以把有效幅度顶过这个上限。

**它不是"颤音强度"，而是乘在颤音幅度上的一个倍率。** 作用于**三处**：

| # | 作用对象 | 说明 |
|---|---|---|
| 1 | **手动音符的 `dF0Vbr`** | SV1 手动音符：倍率乘在颤音深度上 |
| 2 | **自动音符的自动颤音** | 自动音符（宿主自己算颤音）靠它调幅度。<br>⚠️ **SV2 上画了音高控制线的区段不可用** |
| 3 | **IX 乐器的颤音幅度** | Instrument X 的乐器颤音 |

**主要用途**：

| 场景 | 怎么用 |
|---|---|
| **戏腔 / 美声** | **拉大**（这两种唱法本来就要大幅度颤音）|
| **需要超过 `dF0Vbr` 上限** | **用倍率把 `dF0Vbr` 放大** —— 相当于"借 `vibratoEnv` 突破 `dF0Vbr` 的 UI 上限" |
| **长时间颤音** | 让倍率**小幅波动**（起伏），**长颤音就不死板** |
| **用户点名"某区间颤音要更大"** | **只在那一段**把倍率提上去（局部改，不必整条替换 → §3.2b①）|
| **想在某一段"掐掉"颤音** | 把倍率**压到 0 附近** —— 因为是**乘在 `dF0Vbr` 上**，有效幅度趋近 0。<br>比去改 `dF0Vbr` 省事，而且**只影响这一段**（`dF0Vbr` 是逐音符的）|

> 🔗 相关：颤音各字段与画法见 `08-pit-drawing.md §6.3`；
> `dF0Vbr` 的 UI 范围是 **0~2 半音**（08 §2.1），而属性**可以直接写超出范围**（08 §2.1 注）。

#### 上游增补（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用）

**标准阶梯写法（上游把它当"第二级放大器"）**：
**先把音符属性里的颤音深度（`dF0Vbr`）拉满，仍不够，再在颤音包络里继续往上画。**

**常见加幅**：

| 风格 | 加幅 |
|---|---|
| **美声** | 大约**再往上加一半** |
| 京剧 | 长音继续拉高 |
| 摇滚 / power | 深度先拉到最大（2），再继续用包络加 |
| **新民族（喜庆型）** | 高音处包络画得**特别大** |

**参照数值（审美边界）**：颤音幅度常规 **0.5 ~ 2.0**、频率 **5 ~ 8 Hz**；
**8 / 9 或直接拉满 = 鬼畜**；**戏曲 / 美声走 ≈ 5.5 Hz**。

> ⚠️ **包络只管"幅度"，不管"上下偏移"**：面板给的是**围绕标准音高的对称摆动**；
> 要做**下颤 / 上颤**（音高中心整体偏上/偏下），得**在 Pit 上把整段音高偏移**之后再叠颤音。

### 3.2d `loudness` —— 响度（dB），**就是音量**

**非常简单粗暴 —— 它就是音量。** 两个实际用法：

> 📌 **IX（Instrument X）也适用，且效果一致**——
> 下面两个用法在 IX 上照用（`loudness` 在 IX 与 SV 上表现相同）。

#### ① 顺着伴奏走（**用户要求时才做**）

**若先**分析伴奏轨的音量包络**，再让**目标轨的响度顺着伴奏轨大致变化**
（不是凭空画，而是**从伴奏里提取走势**，让目标轨"贴着伴奏"起伏）。

#### ② 跨轨无缝拼接（crossfade，**总电平不变**）

要在 **track2 / track3 的某处无缝拼接**时，在**恰当时机**让：

| 轨 | 走向 |
|---|---|
| 轨 2 | **−48 → 0** |
| 轨 3 | **0 → −48** |

**两条互补 ⇒ 总电平不变** ⇒ 听不出接缝。
（−48 就是响度能到的最低档，用户给的就是这个写法。）

> ⚠️ 关键是那个**"恰当时机"**：两条的交叉段要对齐，而且**和声 / 咬字在那个位置得接得上**
> —— 不是随便挑个时间点做淡入淡出就行。

> 🔗 与 §3.4「重音渲染配方」的区别：那边是**音符级 / 短时**的响度（挖坑、音头加重）；
> 这里是**跨轨 / 长时**的响度（整体起伏、轨间交接）。

#### 上游增补（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用）

**定位**：响度 = **谐波 + 噪波的总和 ⇒ 相当于"总线"**。
⚠️ **画过头**的听感是"**人声忽大忽小、像麦克风没拿稳**"。

**🔑 主次关系**：**动态的主力是张力（`tension`），响度只作辅助** ——
反着用（拿响度当动态主力）是上游点名的**新手最常见错误**。

**AI 上响度画不到"绝对零"**：拉到底频谱仍有残留（只是耳机听不出）⇒
要**彻底消掉**必须 **响度 + 气声 + 发声 三管齐下**。
（这也解释了本节 −48 最低档：那只是"响度这一路"的底。）

**动态要画得比理想更夸张**：混音一上压缩就会把动态压平，**编曲越满越要画足**。

**拼接的选点与曲线 —— 给本节②补上可执行规则**：

| 规则 | 内容 |
|---|---|
| **选点** | **必须选在转音处**（转音自带音量变化，接得顺）**或颤音的波谷**（用颤音自带的动态盖掉不连贯）；在**平直、无音量变化**的音上做，一定不自然 |
| **曲线形状** | 交叉段要画成**一对相向的等功率抛物线**；**画成直线，中间音量会塌下去** |
| **前置铁律** | ① 总响度必须**平滑无突变**；② **两轨 Pit 必须完全重合**（差一点就像突然卡到另一个音高）|
| **AI 额外动作** | 原轨要**响度 + 气声 + 发声一起**才能把谐波彻底消掉 |
| **辅音细节** | 送气辅音（`h`/`t`/`p`/`ch`）后面留一点送气、**响度画成斜坡**（直角会听出断开）；摩擦音切点要极细重合；塞擦音必须留隔断 |

### 3.2e `tension` —— **注音力度**（`>0` 强力 / `<0` 柔和）

**含义**：**音符的力度** —— **大于 0 = 强力**，**小于 0 = 柔和**。

> 🔑 **它是"Pit 之外"影响最大的参数**——
> **前提是 Pit 已经稳定**；**本节不含 Pit，而 Pit 的优先级永远在参数之前**。
> ⇒ 要动"强弱 / 力度感"时，**先把 Pit 画对，再优先考虑 `tension`**。

> ### ⚠️ **最关键的一条：在 0 附近音色会发生突变** ⇒ **跨 0 线一定要慎重**
> 要做跨 0 的变化，就得**设计好过渡**；别让相邻两个音从 −0.2 直接跳到 +0.2。
>
> 📌 **"慎重"≠"不许跨"**：**需要改变的时候就是要改变** ——
> 比如 §3.4 里"Pit 挖坑时张力也跟着挖坑"就是**有意为之的正确写法**。
> 要避免的是**无意义 / 突兀**的跨 0，不是禁止跨 0。

**主要作用**：

| 场景 | 怎么画 |
|---|---|
| **需要强弱明显对比** | **强力的音符（主要是音头那一段）张力 `> 0`**；**弱的部分张力 `< 0`** —— 用**正负**制造对比 |
| **弱歌 / 弱段落** | **减小**（往负走）|
| **主歌 / 需要张力大的地方** | **增大**（往正走）|

#### 上游增补（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用）

**机制**：张力调的是**共振峰的强弱（含超高频共鸣）** —— **拉高更明亮**；
**拉低则高频泛音减少、基频占比升高 ⇒ 听感柔软、变弱**。

**⚡ 0 点的非线性 —— 给"慎重"补上手法**：

| 事实 | 手法 |
|---|---|
| **0 以下比 0 以上敏感得多**（上下不对称）| 接近 0 时把曲线画成 **S 形过渡**，别用直线穿过去 |

**AI 上"低于 0 就发哑"的三条补救**（按上游推荐序）：
① 换**更软的声线**；② **改用音区偏移（`toneShift`）压低 —— 首选**（比张力顺滑、**基本没有突变点**）；③ **音区偏移 + 少量张力**配合。

**声库敏感度规律**：

- 声库录得越**明亮 / 强硬** ⇒ 张力反馈**越敏感、越难控**，要**小幅细画**；
- 越**软 / 暗 / 弱** ⇒ 越顺滑，但要**花更多时间用响度配合**才做得出动态；
- **高音区张力极度敏感**。

**张力拉满之后怎么办**（**别再叠张力，只会电**）：挑一两个字**把力度落下去** / 部分高音**转假声** /
高音堆里的低音**降力度** / **根本解法是加 Pit 技巧**。
⚠️ **张力全程拉满会造成听觉疲劳**。

> ✅ **口径已统一**：**"`tension` 影响最大"的前提是 Pit 已经稳定** ——
> 本节的比较范围**不含 Pit**。上游那句 **"Pit 画平了，拿最强的 power 声库也没力度"** 说的是**另一个层级**：
> **Pit 与参数之间，Pit 优先**。
> **表述顺序永远是：先 Pit，后参数；Pit 稳定后，参数里先看 `tension`。**
> （旁证：上游认为 **Pit 是唯一跨引擎、跨声库可套同一套标准的参数**，优先练它。）

### 3.2f `breathiness` / `voicing` —— **噪波量 / 谐波量**

**先讲原理（这条决定这两个参数该怎么用）**：

> ### 🔑 **SV 与 IX 的歌声合成 = 把音频分成「谐波」和「噪波」两部分，分开合成，最后合并。**
>
> | 参数 | 对应的是 |
> |---|---|
> | **`breathiness`** | **噪波（noise）的量** |
> | **`voicing`** | **谐波（harmonic）的量** |

**由此直接读出**：

- `breathiness` 越高 ⇒ **气声 / 沙沙的成分越多**（噪波多）；
- `voicing` 越高 ⇒ **声带"实"的成分越多**（谐波多）；
- 两者是**同一套"谐波 + 噪波"混合的两个量**，调任何一个都是在改这个混合比。

#### 两个量是**各自独立增减**的（✅ 用户确认 → 原"待确认"已结）

**不归一化、也不此消彼长** —— 提高 `breathiness` **不会**自动减少 `voicing`，反之亦然。
⇒ 所以"降发声 + 提气声"这类写法是**两个动作**，**要各写各的**。

#### `breathiness` 用法

| 场景 | 怎么做 |
|---|---|
| **用户说"气噪太高 / 太低"** | 就调 `breathiness`（这就是它的直接对应物）|
| **需要气声大的唱腔**（如某些**哭腔**）| **增大** |

#### `voicing` 用法

| # | 用法 | 说明 |
|---|---|---|
| 1 | **动态减小以突出气声** | 把 `voicing` 压低 ⇒ 气声（噪波）成分相对突出；常与"提 `breathiness`"配合使用 |
| 2 | **清化浊辅音（改字技巧）** | 见下 ② |
| 3 | **悄悄话 / 让元音不发音** | 见下 ③ |

**② 清化浊辅音 —— 借"改字 + 抹发声"拿到更紧的咬字**（✅ 用户口述的例子）：

1. 用户想发 **「跑」**，但直接输「跑」效果不理想；
2. **建议用户改输 `bao`**；
3. 把**辅音段的 `voicing` 抹掉**（抹掉发声）⇒ 实际唱出来是 **`pao`**；
4. **此时的咬字会比直接输原字更"紧"** —— 这正是用它的目的。

**③ 抹掉发声 = 悄悄话**：同一手法**可以让某些元音也不发音** ⇒ 得到**耳语 / 悄悄话**的效果。

#### 上游增补（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用）

**⚡ 决定"该动发声还是动气声"的前置事实**：
**清辅音只有噪波、浊辅音才含谐波** ⇒ **气声对轻辅音影响最明显**；
**浊辅音上，发声（`voicing`）的影响比气声大**。

**⚡ 成组取值配方表（13 条）—— 把语义直接变成可用的组合**：

| 目标 | 组合 |
|---|---|
| 气音夸张 | 发声低 + 气声高 |
| 模拟假声 | 张力到底 + 气声高 |
| 烟嗓 | 张力满 + 气声满 |
| power + 沙哑 | 张力往上抬 + 气声往上抬 |
| 非常闷 | 张力低 + 气声低 |
| 让声音更集中（暗系声库的救星）| 张力往上、气声往下 |
| 清哼 / 轻声 | 张力低 + 发声低 + 气声大 |
| 不咬字但气声不断 | 发声到底 |
| 高音刺耳 | 张力低 + 性别微抬 |
| 历经沧桑 | 性别高 + 气声高 + 张力下 |
| 音头重音型 | 音头张力高、音尾张力下 |
| **句尾吐息** | 加一个短音素后**把发声拉掉**（不是气声、不是张力、不是响度），再用响度或气声微调力度 |
| 沙哑过头 | 只把**气声**降回去 |

**真假声转换的参数配方**：真→假 = **张力明显突变掉下去 + 发声拉下去**（让气声占比变大）；
假→真 = **落到真声音域后把张力拉上来**。

**分离导出（"谐波 + 噪波"模型的可验证实操）**：导出时选**气音输出 → 分离气声**，
会得到**纯谐波**与 **`_asp` 纯气声/噪波**两个文件。
（要做夸张 EQ 就先分离，因为噪波里混着轻辅音。）

**反向手法（与 ② 清化浊辅音成一对正反例）**：`g` / `f` 这类辅音**不够长会带进基频、听起来像浊辅音**
⇒ **用发声切掉那一小段**。

> ⚠️ 两个量**在 AI 上分离得并不干净**（某些频段有残留尖峰）⇒ "降发声 + 提气声"不是无限可分的。

> ✅ **上游的口诀已采纳（同向画）**：
> **一起画的时候，张力 ↑、发声 ↑、气声 ↓（同向走）** —— 这是画法上的走向惯例。
> 本节前面说的"两个量各自独立、不互相归一化"是**参数之间的**事实 ——
> ⇒ **两者并存：画法上同向走，参数上互不牵连。**

### 3.2g `gender` —— **性别 / 共振峰**（**方向已订正**，2026-09-11）

**一句话**：它挪的是**共振峰**，听感上直接改变"**性别感 / 口型大小**"。

| 方向 | 听感 |
|---|---|
| **拉高** | 声音**变粗 / 变厚 / 更圆润**、**口型更宽（听起来增大）** —— 像**慢放** |
| **拉低** | **咬字变紧**、发声**变尖**、**口型更窄** —— 像**鸭子叫**，像**快放的音频** |

> 🔑 **好记的类比**：**拉高 ≈ 慢放**（口型更宽、变粗厚）；**拉低 ≈ 快放**（音色变尖、变紧、口型更窄）。
>
> ⚠️ **方向曾被记反过一次**—— **以本表为准**：
> **上拉 = 更宽**。这也与 08 §6.2b「怒音 · 性别参数拉高 → 把声音做厚做圆润」**一致**。

#### 上游增补（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用）

**⚡ 使用边界（原本缺这条）**：**偏移量要控制在小范围内，否则声线保不住。**

**用途清单**：

| 场景 | 怎么用 |
|---|---|
| 高音刺耳 | **微抬一丢丢**（量很小）|
| 美声 | **往上拉**（口型立体、声音厚重）|
| 京剧（旦角）| **调低**（配假声音阶，味道最正）|
| 新民族 | 一般**保持默认** |
| 沧桑感 | 性别**高** + 气声高 + 张力下 |
| 怒音 | **往上拉**，把声音做厚做圆润（与 08 §6.2b 一致）|
| AI 跨音区音色不统一 | 用它救；**音程跨度大**导致音色不统一时也配它 |
| 哭腔 | 音头画高再慢慢拉下，**模拟喉位不稳**（闭口音更明显）|
| 单库做合唱 | 每轨给**不同**的性别值 |
| 全局音色粗细 | **全局属性层**适合设整体粗细，其余参数留在音轨 / 音符层逐处画 |

> ⚠️ **上游的方向说反了**（上游 `SKILL.md` / `咬字与音素.md` 说"拉高 → 口型更窄、更立体"）——
> **正确答案：上拉 = 更宽**。
> ⇒ **以本节上面的方向表（口径）为准**；引用上游素材时，"口型大小"的说法要**按口径重写**。
> **只采纳它那条边界：偏移量要小。**

### 3.2h `toneShift` —— **发声位置（音区）偏移**

**它调的不是音高，而是"用哪个音区的音色唱出来"。**

- 一个 **pitch = 60** 的音放在钢琴窗里，正常情况下**就用 60 的音色**发声 —— **不同音高音色不同**。
- 对人声：**高音处会自动出现假声**；**极高 / 极低处会出现"唱不上去"的现象**。

**单位是 cent**（1 半音 = 100）：

| 操作 | 实际音高 | 音色（发声位置）|
|---|---|---|
| pitch 60（不动）| **C4 (60)** | 60 的音色 |
| pitch 60 **+ `toneShift` 400** | **仍然是 C4 (60)** | **按 64 的音色**唱（≈ 借高音区的音色）|
| pitch 60 **− `toneShift` 1200**（拉低一个八度）| **仍然是 C4 (60)** | **按低一个八度的（C3）音色**唱 ⇒ **有可能"唱不下来"** |

> ### 🔑 **一句话：音高始终不变，变的是"用哪个音区的音色唱出来"。**
> ⇒ 由此可以做"**用正常音高拿到别的音区的音色**"：高音唱不上去就借更高的音色，或反过来故意用低音区音色做特殊效果。

> ⚠️ **范围与"写多少才有效"（2026-09-20 用户实测踩到）**：`toneShift` 范围 = **−800 ~ 800 音分**。
> **写 ±1 等于没写**（1 音分 ≈ 听不出来）—— 真实工程里的量级是 **±100 ~ ±800**（扫 51 个工程实测：
> `9.28.svp` / `一棵稗子的春天` 都到 **800**）。⚠️ 别被 `references/05-params.md` 里那个 `1` 骗了：
> 那是官方 AKD 示例 helper 的**归一化常量**，**不是**单位上下限（单一事实源 = `tools/param-units.json`，
> 守卫 = `node tools/check-param-units.cjs`）。

> 🔸 **待核**：用户口述把低八度那处写作"58C3"，按 −12 半音换算应为 **C3 = 48** —— 数字以用户后续说法为准（**区间换算本身没问题**）。

#### 用法：把发声位置挪回"能唱 / 想要的那个音区"

| 情形 | 怎么调 |
|---|---|
| 声库**在 D5 处换假声**，而现在有个 **E5 的音要用真声** | **拉低 200 ~ 300**（cent）⇒ 发声位置落回**真声区间** |
| **C6 唱不上去** | **拉低到 −1000 左右**，挪到**还能发声的区间** |
| **低音唱不下来** | **同理，往反方向（拉高）** |

> 🔑 **口诀：音高交给音符，音区交给 `toneShift`。**
> 想让某个音"**换一副嗓子唱**"就调它 —— 换真/假声、救唱不上去的音，都是这个用法。
> ⚠️ 它**不改音高**：调完还是唱原来的音高，只是**"用哪副嗓子"变了**。

#### 上游增补（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用 —— 这一节补得最多）

**⚡ 数值上限**：**单层 ±400 音分 = 4 个半音**（就是上面例子里的那个 400）。
多层可累积（见 §3.2b 上游口径表：两层 8 半音、三层 12 半音）。

**⚡ 六条使用边界**：

| # | 边界 |
|---|---|
| 1 | 本身在**低音区**时**反馈不明显** ⇒ 必须**配响度** |
| 2 | **高音区**画着画着会**掉进假声音域** |
| 3 | **会连带改变咬字口型**（它学的不只是发声方式；某些场合这是你不想要的）|
| 4 | **连续转音**要改回**响度 / 发声 / 张力**（否则口型忽大忽小）|
| 5 | **浊辅音上要画平缓**（浊辅音带音高，突变会破坏咬字连贯）|
| 6 | **要和辅音对准**（不同音区的咬字有细微差别）|

**⚡ 在 AI 上优先用它替代张力打底**：变化基本**顺滑、没有突变点**（不必躲张力那个零点），
很多时候可以拿它模拟张力的效果，**甚至张力只画很少**。

**原理一句话**：它是**模拟换采样** —— 把发声方式切到另一个音区
（**更高 = 更亮**；**更低 = 更暗、更沙哑**）。

**"换声点之上还要真声"怎么办** ⇒ **把音区偏移往上画**，把发声状态压回真声区，再配**一点点**张力；
换**更强的 power 系声线**也能抬高真声上限。

**⚠️ 非直觉的相互作用**：**中间那个音会被它前后两个音的真假声状态带偏** ——
某音拉回真声后力度仍不够，不妨**把它前面那个已转假声的音一并提前拉回真声**。

**音程跨度大**时拉它会造成**音色不统一** ⇒ 配**性别**参数，再试音素力度。

**它是 AI 声库专属**（采样声库走采样音阶）⇒ 可据此把 §3 开头宿主表里 `toneShift` 那格收窄。

> ⚠️ 上游用"**口型大小**"描述音区偏移的高低端 —— 与的方向描述**不在同一套话语**里，
> 引用时按口径重写（免得和 §3.2g 打架）。

### 3.2i `mouthOpening` —— **开口度**

**就是开口度** —— 字面意思：**嘴张多大 / 口型大小**。

> 用户暂未给具体用法与取值经验 ⇒ 按 §3 开头的策略：**用户提出才用**，要用到时先问。

#### 上游增补（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用）

上游**没有同名参数**，但有一整条**"改口型"的手段链** —— `mouthOpening` 是这条链上**最直接的一环**：

> 换备用采样 / **AI 改音素力度** → 换**口型更大或更小的近义歌词** → **音素替换**
> （大写 `A`/`E` 口型大且立体；小写 `a`/`e` 小且扁）→ 拆音 → 性别参数微调 → 拆轨

**最接近 `mouthOpening` 的旋钮是 AI 的「音素力度」**：
**元音力度拉大 ⇒ 口型变大**；辅音力度拉大 ⇒ 辅音更清晰、**拉小 ⇒ 变糊 / 浊化**。

> 🔸 用户未给 `mouthOpening` 的用法与取值经验 ⇒ **要用先问**（见 §3 开头的策略）。

---

### 3.2j 参数 × 风格：取值经验（来源 `synthv-tuning`，摘要改写）

> 只列与 **张力 / 发声 / 气声 / 响度 / 性别 / 音区偏移** 有关的经验。
> ⚠️ 涉及 `gender` 方向的说法已按**口径**（§3.2g）重写。

| 风格 | 参数取值经验 |
|---|---|
| **京剧（旦角）** | 颤音频率约 **5.5**、幅度极大，长音用**包络继续拉高**；元音部分把**气声拉下去**；**性别调低**（配假声音阶）；动态主要在颤音上体现，本体的动态画得糙一点 |
| **黄梅戏** | 唱段较快、颤音频率相对高、无大颤，但**句尾仍用大颤** |
| **美声** | **张力维持在一半以上**；唱弱用"**张力略降 + 响度画弱**"（把张力拉到底不符合美声）；**所有元音的气声都要拉低**；**性别往上拉**；**颤音包络再加约一半**；音尾颤音不必落回标准音高 |
| **藏腔** | "亮而实" ⇒ **元音处气声必须降下去**；破音式上跳段**张力（连带发声）必须画低**，不降会刺耳且不像 |
| **蒙古长调** | 声线厚重；张力**舒缓悠扬、大量"由弱到强"**；**大颤**、长音幅度更大频率更低、**用下颤** |
| **新民族** | **性别往往保持默认**；元音处气声比例太高要拉下去；喜庆型**高音处颤音包络画得特别大** |
| **R&B** | 重拍字辅音拉长、弱拍极短（弱拍虚词甚至**拆出一个音把响度拉掉**）；转音之间做动态变化、**可画得比听感更夸张**（压缩会压平）；真假声转换要有张力 / 发声配合 |
| **说唱** | `zi`/`ci`/`shi` 类字元音与辅音口型一致 ⇒ **直接用发声把元音部分拉掉**；重拍辅音拉长、前字元音缩短 |
| **摇滚 / 怒音** | 元音部分**气声拉低**（声音**扎实**）；"power + 沙哑" = **张力高 + 气声高**；**性别拉高**把声音做厚做圆润 → 怒音细节见 **08 §6.2b③** |
| **颓废 / 唱到失声** | 字尾做成接近**纯气声** = 张力拉到底 + 发声降 + 气声上；**下一个字的辅音要切小**，否则会从一片气声里突兀蹦出 |
| **抒情·哀（哭腔）** | 半元音处**张力画低**、到元音再回来；**转音处动态多画**；**挖坑用发声**更像哽咽 → 哭腔整体做法见 **08 §6.2b⑤** |
| **句尾吐息（通用）** | 加一个短 `hen`/`heng` 后**把发声拉到 0**（不是气声、不是张力、不是响度），再用响度或气声微调力度 → 见 **08 §6.5 长音收尾** |
| **气泡音（通用）** | **见 `08 §6.2b①`**（四步：音高拉低 + 响度梳状 + 提气声/降发声 + 张力可拉高）—— 本节不重复正文 |

> 📌 这些是**风格化的起点，不是硬规则**；用的时候按约定（既定约定）—— **用户提出才用**。
>
> ⚠️ **全部取值都以「Pit 已经画好」为前提**（呼应 §3 开头的策略：**先 Pit，后参数**）。
>
> 🔗 **交叉核对**：**特殊音头的参数形态不在本节重复** —— 正文在 **`08 §6.2b`**
> （气泡音 / 噎音 / 怒音 / 咆哮·嘶吼 / 哭腔），本表只挂指针。
> 反过来 08 那边的"参数 × 风格"索引也以本表为准，两处**不各写一份**。

### 3.2k 风格配方（**五条最常用速查**）

> 📌 **全量正本已单独成篇：`references/11-风格配方.md`**（「都搬过来」）——
> 那里包含：通俗五型（抒情喜舒缓/喜元气/怒摇滚/哀哭腔/哀颓废失声）· **说唱三型**（固定音高 / 随声调 / 语调校）·
> **京剧旦角** · **岛呗** · **约德尔** · **呼麦（做不到，如实告知）** · **新民族唱法** · 美声其余（颤音/咬字/EQ）· 民族通用注意。
> **本节只留下面五条做速查；要改风格内容请改 `11`**（避免两处不一致）。
>
> 来源 `synthv-tuning` 的 `风格化调声.md`（摘要改写）。
> **与 §3.2j 互补**：那边是**参数取值**，这里是**整套手法组合（Pit / 装饰音 / 硬性边界）**。
> ⚠️ 按既定约定：**这类特定唱法内容，用户提出才用** —— 不要主动给用户加。

**① 藏腔 —— 「3 半音小尖尖 ＋ 上跳必须降张力」**

- **音色**：薄、尖、亮（高原声带偏薄偏脆）。用本身尖亮的库，**几乎不用捏音色**；**"亮而实" ⇒ 元音处气声必须压下去**。
- **Pit 是灵魂**：在音与音之间 / 转音处点一个**极短促、朝上的小尖尖**，用来模仿那种"将破未破"的破音边缘（真声一瞬跳去假声、马上又拉回真声）：
  - 幅度 **≈3 个半音**；时值**短促**；**留一点斜度**（直上直下会变电音）；干净利落（上去慢、下来慢都很别扭）
  - ⚡ **上跳段要记得把张力（连带发声）压下来** —— 否则**不像而且刺耳**：上跳时要是张力不跟着降，听感就**像被外力顶上去**，而不是自己甩上去的
  - **长音上可以连做 2~3 个小尖尖** 增加丰富度
- 其他 Pit 手法：拿二度/小三度做**音高甩动加花**；长音碰上音程变化就走一段**下滑**；音头补一个很短的滑音（一味平直会没韵味）。
- **吟唱段**（"诶嘿"这类）：**基本保持直音**，要加就用高频、存在感弱的；**口型必须稳定**（**一个音素到底**，如全程 `a`）；
  那个尖尖**靠 Pit 本身做、元音不变** —— `h`（呵）这类辅音会收拢口型破坏连贯，非要用就压到极短且与 Pit 上下对得极准。
- **反例**：只画 Pit 不降张力 → 尖、刺耳；加慢速大颤 + 细碎动态 → 辽阔潇洒、直来直去的那股味道就毁了。

**② 黄梅戏 —— 「逐字装饰音」**

- **主要在真声音域**演唱（京剧旦角偏混声/假声）⇒ 用**真声音阶**，捏圆润、把尖亮压下去。
- **装饰音更密**：**词头几乎处处都挂装饰音**（形式都是小的**二度上/下装饰组合**），曲子因此更花。
- **颤音**：唱段较快、频率相对高、**没有大颤**；但**句尾仍用大颤**。
- 咬字求圆润；音程变化大、拖得长的音要**顿开成两部分唱**（力度立刻上来），**断开处 Pit 必须先降后升**，音尾拿响度利落收掉。

**③ 蒙古长调 / 内蒙民歌 —— 「转音必须落在五声音阶内」**

- **音色**：厚重、醇厚、宽厚、霸气（**与藏腔的薄尖亮正相反**）。
- **Pit**：**大量滑音**（音头滑音可夸张、拖久，更沉稳悠扬；音尾从上往下滑做"草原风声"感）；音头**二度/小三度装饰音**；
  转音一律**不能跑出五声音阶**，而且还存在**几套固定的连续转音套路在反复使用**；同样有"要破不破"的上跳，只是数量比藏腔少。
- ⚡ **与藏腔最关键的差异**：**长调需要"音头 Pit 下沉"的地方比藏腔多得多**
  （蒙古沉稳＝草原大地；藏腔往上跳＝高原飘渺高亢）。
- **颤音**：**大颤**，长音**幅度更大、频率更低**，**靠音高整体压低来实现下颤**，而**音尾一律要拉回标准音高**。
- **张力**：舒缓悠扬、**大量"由弱到强"**。

**④ 美声 —— 「连续转音＝梭子形」**

- **硬性边界**：**音头只能从本音高、或比本音高更低的位置进来**（哭腔式地往上蹦一下属于声带边缘化，跟美声要的"集中、厚重、圆润"完全相悖）；
  **音尾同理，收在本音高及更低处**。有些地方看着像"音头上扬"，实际上是**音头 Pit 下沉 + 幅度比较大的音头音高浮动**
  ⇒ **判据：看音符起点那一刻，Pit 落在本音高上方还是下方**。
- **连续转音**：每次转音的音头都让 **Pit 先往下去一点（走得比目标更狠些）再折回来**，整条线看上去像串起来的**一串梭子**；
  **张力、响度都随 Pit 一起上下**（Pit 走高 → 张力响度也走高；Pit 走低 → 两者跟着走低）。这样出来的效果最自然、也最接近美声（听感**像小提琴**）。下探多深，看你要多大力度。
- **跳音（花腔）**：起音时从偏低处往上画、**略微冲过目标音高，鼓出一个小山坡**，收尾再掉下去接后一个音（人声的跳音本就落不准、也稳不住）；
  **音头音尾用响度画成陡坡切干脆**，顿感才出来——**不切就会黏连成梭形**。
- **颤音**：与转音**无缝衔接**（不是"颤音弱化再重起"，而是颤音相位自然接到下一个音高，看 Pit 像一条连续颤音、只是颤到了不同音高）；
  音尾滑音同理（颤着颤着就滑到下一个音）。**出现频率远高于民族唱法**，弱唱时也可以有。
- **参数**：**所有元音部分的气声都要拉低**；**张力基本维持在一半以上**（唱弱时走"**张力略降 + 响度画弱**"这条路——
  张力压到底，声音会变得过分轻柔，不是美声该有的样子）。
- **声库**：**中高音阶**（也就是发声状态偏紧绷的那一档）跟美声的发声方式最贴近。

**⑤ R&B —— 「五声转音 ＋ 句尾落 la」**

- **五声音阶转音是灵魂**：Blues 是 R&B 的源头，而 Blues 音阶里压根没有 fa 和 si，余下的**正好就是中国五声音阶**
  ⇒ **句尾那种连续四个下行转音，收在 `la` 上**（要是收在大调的 `si` 就没味了）。
- 半音（都-西、咪-发）这种转法听不清 ⇒ **怎么也得走到全音或小三度**（呼应 §1.7 的音程清晰度）。
- **结构提示**：一过 **Bridge**，加花的密度就直线往上窜，R&B 的味道也最足。
- **边界**：**落在五声音阶上 ≠ R&B** —— 古风的转音讲究"有力道"，而 R&B 追求的是**自由灵动、丝滑、快而密集**。

> **已全部搬入 `references/11-风格配方.md`**（「都搬过来」）：京剧旦角 · 岛呗 · 约德尔 ·
> **呼麦**（⚠️ 现有工具做不到，**要如实告诉用户**）· 新民族唱法 · 抒情喜怒哀五型 · 说唱 —— 使用前按既定约定（**用户提出才用**）。

### 3.2l AI 声库的坑（**指针** —— 正本在 `10-声库与声线.md §5/§6`）

> 📌 **本节内容已由 `10-声库与声线.md` 承担，不要在这里重复维护**：
> - **§5「AI 库的坑（逐条 + 应对）」9 条** —— 含 ⚡ **会自动造动态坑（转音处冒出幅度夸张、方向常与你相反的坑 ⇒ 手动抹平/反向修掉，别以为是自己画的）** ·
>   自动塞气泡音 · 参数与实际生效位置有偏差（换声点最明显）· 低音区+快咬字糊 · `g`/`f` 带基频 · **`/U/` 不认改 `/o/`** · 气声谐波分不干净 · **张力 <0 变哑**（→ §3.2e）· **响度画不到绝对零**
> - **10 §6「AI 库的红利」4 条** —— 音素够短自动抹平停顿（**拆音更自由**）· 音尾 Pit 下沉接下沉呼吸音**自带吐息** · **`cl` 直接做气泡音** · 音区偏移平滑可打底
> - **§7** —— `styles` 自定义风格参数**只适合大批量合声**，**主音轨自己画**
>
> 上游原文：`synthv-tuning/references/` 下的 `声库与参数.md` §七（已摘要改写进 `10`，故此处不再重抄）。

### 3.3 音符级力度（dynamic）—— 与组级 automation 不同

| 层 | 载体 | 说明 |
|---|---|---|
| 音符力度值 | `note.attributes.dynamic`（0~1）| 整体响度 |
| 音符力度曲线 | `note.dynamics`（cubic，points 扁平 [x,y,...]）| 音符内随时间 |
| 组级响度 | `group.getParameter("loudness")` | 跨音符 GB gain |

```javascript
// 音符级 dynamic（0~1）
note.setAttributes({ dynamic: 0.9 });   // 或 setDynamic(0.9)（视版本）
```
> **音符级 `setAttributes`/`setDynamic`**：SV2/IX 的 Note 有 `setAttributes({dynamic})`；具体以 `api/Note.md` 为准。

### 3.4 重音的完整渲染配方（Pit + 参数配合）⚡核心

§1 找出重音、§2.4 画好音头之后，**配套的参数**是重音能不能"蹦"出来的关键。
目标效果：**音头加重、随即力度收掉**（"蹦"出来的唱法）。

| # | 维度 | 做法 |
|---|---|---|
| 1 | **Pit** | 先把音头往下压一点 → 来一个小的**音头浮动**（猛地冲高、再落回）→ 随后接一段**频率偏高、并逐渐收掉的颤音** |
| 2 | **张力** | 音头之后**立刻收下去** |
| 3 | **响度** | **音头处加重** |
| 4 | **发声** | 到后半段收到几乎全是气声（要做叹息感，**必须**让它和发声配合）|
| 5 | **气声** | 音头想要更重，就把音头那一段的**气声略往下压** |
| 6 | **前提** | **得先把前一个音的音尾画下去**（见 §2.4b），要不然音头怎么也顶不出来；前一字渐强时，本字的辅音须调短 |

**变体"一声叹息"**：音头上加强调，再让音尾塌成一声叹息的效果（**发声下沉 + 响度配合**）。

#### 动态与 Pit 的绑定（为什么必须配套）

要把音高改掉，气息和声带肌肉都得跟着挪，**音高技巧因此必然带来动态变化**：

- **倚音（尤其前倚音）上，动态会凹下去一小块**——**情绪越充沛，凹陷越明显**（见 §2.5 挖坑）。
- **颤音处，动态有周期性的起伏**——颤音幅度越大起伏越明显。
- **一般规律：张力到哪儿，Pit 先到哪儿**——Pit 往上走，张力跟着上走；Pit 挖了坑，张力也同样挖坑；Pit 一路下坠，张力就陪着下坠。

#### 响度 vs 发声：什么时候该用哪一个（判据）

| 判据 | 选择 |
|---|---|
| **辅音会不会被牵连** | 用响度画下去会让前面辅音接元音时突变 → **改用发声**（发声不影响辅音强度）|
| **想要沙哑还是哽咽** | 只画**发声** → 谐波降、噪波比例多 → **沙哑**；只画**响度**（总线，气声也被减）→ **哽咽** |
| **切干净还是留余韵** | 拆轨/切音素要连噪波一起消掉 → 用**响度** |

#### 辅音的动态处理（最常被忽略）

- **做渐强时辅音要跟着弱下去**——只处理元音不处理轻辅音，结果是"元音有动态了，但轻辅音还很重，
  每个字头都在往外砸"，把柔和旋律毁了。
- **整段极弱时辅音的响度也要拉低**——元音已很轻、辅音太响就成了"辅音在打耳朵"。
  **轻辅音拿张力管不住**（轻辅音对张力根本没有响应），只能靠响度或发声。
- **逐字渐强时**每个字的辅音力度必须控制精确，这一步一定要画得足够细。
- 音头爆一下（某些声库采样问题）→ 用**发声**拉一下（不影响整体辅音和气声）。

> **声库差异**：低音区的采样声库，只画张力基本听不出变化，**非配响度不可**。
> AI 声库：张力画小无效、画大嗓子一下就哑 → **换成音区偏移来顶替张力**更顺滑，力度还不够再补一点点张力。

---

#### ⚠️ 上游增补：五件套**不能都挤在同一个瞬间**（来源 `synthv-tuning`，摘要改写；✅ 用户裁定采用）

**病因定位**：某个字"**抽一下 / 像打嗝**"，来源就是 **Pit 太陡**，
或者**颤音 + 音头浮动 + 转音这三个技巧挤在同一段时间里互相打架**。

**正解**：**给每个技巧排好出现时机和时值 —— 让颤音、音头浮动、转音彼此错开时间。**

**相关硬边界**：

- **真假声转换得留出一点斜度**，要是直上直下就成电音了；
- 约德尔那类极端跳法：**前一个音符的变化时长可以到 0，后一个音符必须留一个很短的非零时长**；
- 密集 Pit **每笔画成直角必定电**；
- **Pit 变化拖太长**，听者会以为"这音老半天才挪过去"、还会觉得像跑调 ——
  这常**不是幅度问题，而是位置与时长的分配问题**；
- **动态也要错开**：碰上快速连续转音，**只让头一个前倚音承载明显动态**，后面密集段仅留适当的张力变化；
- **所有技巧的进出都要淡入淡出。**

> 🔗 **与本节配方的接点**：本节的五件套（Pit + 张力 + 响度 + 发声 + 气声）**是同时在同一个音头上动**的 ——
> **落地时务必按上面的"错开"原则排时间**，否则就是那个"抽一下"。

### 3.5 段落力度规划 · 渐强配方 · 张力已满时的出路（来源 `synthv-tuning`，摘要改写）

> 📌 本节是**结论与阈值**层；"怎么发生、怎么诊断"的现场记录见
> `examples/情绪推不上去-副歌不燃.md`（两处不重复）。

**① 前提结论：力度 ≠ 张力。**

张力只对谐波起作用，**它买不到力度**。Pit 平的时候，哪怕换上最猛的 power 声库也顶不出来；
反过来，张力压到顶之后再叠加，得到的只有电音。所以顺序固定：
**先按段落定力度区间 → 再逐字把 Pit 画厚 → 最后才用张力 / 响度 / 发声 / 气声去补。**

**② 段落力度区间（开工前的框架，建议值）**

| 段落 | 力度定位 | Pit 技巧 | 动态 | 咬字 |
|---|---|---|---|---|
| 主歌一段 | 全曲最低，整段先压住 | 稀疏：偶发滑音 + 句尾颤音 + 必要转音 | **全曲最细**：逐字递进、转音挖坑、气声收 | 收着，尾韵一律收 |
| 主歌二段 | 明显抬高，跟着伴奏波形走 | 音头下沉；颤音的次数与幅度都加 | 有推进，但不缠绵 | 可以放开 |
| 预副歌 | 蓄力、递推 | 蓄力那一处音头下沉；动态先压后推 | 长音上推 + 颤音 | —— |
| 副歌 | 高 | 音头下沉 + 音高浮动大 + 颤音大；转音处浮动夸张 | **粗线条**（细腻留给主歌）| 大口型、有力 |
| 桥段 | 常常是全曲最弱 | 假声音阶 + 滑音 + 真假声转换 | 音头给力、音尾掉下来 | —— |
| 末次副歌 | 全曲最大 | 音头下沉与颤音幅度都最夸张 | 只管甩；气声该压就压 | 全换开口大的元音 |
| 尾声 | 又落回极弱 | 慢颤（取 5.4）+ 动态起伏很大 | 渐弱收尾，用气声送出去 | —— |

> 🔑 **主歌必须留余量**：该转假声的高音就转，否则副歌无处可去，只能靠硬顶参数、结果出电音。

**③ 渐强的六步配方**

1. 起点张力给到足够低（全曲第一句尤其要整体压低）。
2. **挑落点**：让乐句最后一个字往下收，把旋律上行的那个字指定为渐强落点。
3. 张力一路往上推 → 不够再叠响度（保持正相关、幅度收得住）→ 再不够才让发声一起配合。
4. **辅音跟着弱化**：后一个字的辅音缩时值，给力度腾空间。
5. 气声做一点点反向配合。
6. 音高平的地方，**在音尾加一个深度小、频率偏高的颤音**——层次感立刻出来。

**④ 张力已经拉满时的四条出路**（按有效性排序）

1. **挑一两个字落下去**做对比（分界感最直接）。
2. **部分高音改假声**——假声夹在真声里反而突出。
3. **高音堆里的低音，把它的力度降下去。**
4. **回头把 Pit 的技巧加上去**：音头再往下沉一点、浮动开大、颤音幅度加大、转音处做夸张。

**⑤ 段落对比：加法失效就改用减法**

第一段已调满、第二段加不上花时，**反过来做**——先把第二段能用的技巧全铺上，再回头把第一段的同类技巧**弱化**。
配套三条：同一句在两段换技巧不换情绪；咬字口型也分层（一段收、二段放）；
弱段里埋一个亮点（挑一个字用假声 + Pit 蓄力夸张上冲再滑回）。

**⑥ 三条硬判据**

| 判据 | 阈值 / 规则 |
|---|---|
| **参数同向** | 张力、Pit、气声、响度、颤音必须全部指向同一情绪；出现"想哀却画得铿锵"就是没定清楚 |
| **气质不可兼得** | 爆发段就一条线拉到底；细腻只留给抒情段。两边都要 ⇒ 两边都不像 |
| **动态宁大勿小** | 混音压缩会把动态压平；编曲越满越燃，动态越要画足。判据是"压完之后还听不听得出来" |

> 📌 来源：上游 synthv-tuning/examples/情绪不到位.md（摘要改写）

## 4. 综合示例：重音 → 应用（骨架）

```javascript
function main() {
  var proj = SV.getProject();
  var scope = SV.getMainEditor().getCurrentGroup();
  if (!scope) { SV.finish(); return; }
  var group = scope.getTarget();
  var notes = readNotes(scope);
  if (!notes.length) { SV.finish(); return; }

  proj.newUndoRecord();   // 写操作先撤销点

  // 1. 分组（区分'－'歌词的修饰音 vs 转音），再打分选重音
  var opts = { graceRatio: 0.5 };   // -音 <= 主干时值*0.5 视为倚音(并入)；否则转音(独立)
  var units = groupUnits(notes, opts);
  var accented = pickAccents(units, 3);          // threshold=3；含邻音轻微降权 + 歌词语义

  // 2. 给重音单元画音高线（示例：微上扬；用单元首音）
  for (var j = 0; j < accented.length; j++) {
    var u = accented[j];
    applyPitchCurve(group, u.notes[0], [
      { timeBlick: 0, valueSemitone: 0 },
      { timeBlick: u.notes[0].duration * 0.3, valueSemitone: 0.5 }  // 起音微扬
    ]);
  }

  // 3. 给整组 apply vibrato
  // setVibrato(group, notes[0].onset, notes[notes.length-1].onset + 1, 0.2, 0.8);

  SV.finish();
}
```

> 注意：`applyPitchCurve(group, note, ...)` 期望传**真实音符**（读 pitch/onset/duration），所以这里用
> `u.notes[0]`（单元的首音符）。若想让整单元都画线，可对 `u.notes` 遍历或按单元 start/end 画。

---

## 5. 坑点提醒（照 sv-scripting 勘误）

1. **时间换算**：音符 onset/duration 是 blick；`SV.QUARTER=705600000`。音高曲线的 `time` 是**相对锚点**，锚点是**相对组 timeOffset**——最容易算错。
2. **`newUndoRecord()` 无参**；写操作必须调。
3. **automation 读**：`getPoints/getAllPoints/getLinear/getDefinition` 在桥脚本里**卡死/闪退宿主**；只用 `add(x,y)`/`get(x)`/`removeAll()`，或读磁盘 `.svp`。
4. **main group 不能加音符**（Instrument X 要建普通组）；`group.getParameter` 在 Target（音符容器）层，不在 Note 层。
5. **版本**：`addPitchControl` 需 `2.1.0+`（`hostVersionNumber >= 131329`）。
6. (`PitchControlCurve.setPoints`) 的 value 是**半音偏移**（可负）。

### 画 Pit / 配参数的坑（来自 §2.4-2.6 / §3.4）

7. **音头下沉/抖动不能画在本字元音上** —— 正确位置是**前一个音的音尾**或**本字辅音段**；元音起点必须已回到标准音高。
8. **轻辅音上画 Pit 无效**（没有音高特性，是噪波）；只有浊辅音/半元音（m/n/l/r/y/w）可画。
   碰上 w/y/m/n/l/r 打头的字，下沉段要**一路推到辅音起点之前**。
   **呼吸音同理无效**——它是纯噪波、根本没有音高，在它上面画 Pit 是白费功夫。
9. **音头与音尾配套**：要让音头突显，**前一个音的音尾必须先画下去**——否则白做。
10. **画太陡 → 电音；画太长 → 拖沓**（人耳看的是"主干位置"）。判断标准只有一条：能不能"**一划到位**"。
11. **Pit 直上直下只用在三种场合**（民歌甩腔、哭腔、音尾上扬），其他地方留过渡斜度。
12. **幅度参考 3 半音**；整体过头时把 Pit 程度收到 **50%**。
13. **重音必须配参数**（§3.4）——只画 Pit 不配张力/响度，重音"蹦"不出来；低音区尤其要配**响度**。
14. **轻辅音用张力控制不了**（对张力无反馈）——极弱段/渐强的辅音只能用**响度或发声**。
15. **强效果用量克制**：滑音"一句点一下"，"向上飞的颤音""下沉再上扬"之类"一首歌点一两次"——
    用多了非常油腻/非常怪。

---

## 附：可进一步扩展
- 把"重音判断"做成**阈值/权重可在面板调**（侧边栏 WidgetValue）
- 重音 → 自动套**力度(micro-dynamics)** 或 **嘴巴开合(咬字)** 而非只画音高线
- 按乐句（非固定小节）分段，乐段首尾音更强调
- 把 §3.4 的渲染配方做成**一键套用**（给定重音列表 → 自动画音头 + 配张力/响度/发声曲线）
- ~~转音五类型（§2.5）里，只有"前倚音"已实现；可补**后倚音、音尾音阶行进**~~
  → ✅ **已补（09-11）**：新增 **§1.8** —— `addBackGrace`（③后倚音）· `addTailScaleRun`（⑤音尾音阶行进）·
  `scaleRun`（调内级进序列）· `decideOrnament`（自动判型：①看**进来**的音程、③看**出去**的音程）·
  `applyOrnaments`（批量入口，并返回**三种装饰各自的动态配套清单**）；§2.5 五类型表加了"实现"列，
  ③⑤ 的画法要点已补齐；**SV1 无 `PitchControlCurve` ⇒ §1.8 末尾给了属性替代写法**。
  剩 ② 短暂小幅转音、④ 反方向音阶行进属**纯画法**（不切音符），要点已在 §2.5。

---

> **来源说明**：§2.4-2.6、§3.4 的**画法与判据**提炼自 SynthVCopilot/SKILLS 的
> `synthv-tuning`（`音高与Pit.md`、`语气与强弱.md`），结合我们"先判断重音、再渲染"的工作流重写，
> 并接上 §1 的重音判断与 §2.4 的音头画法。该上游许可为 source-available（Apache-2.0 + Commons Clause），
> 本篇为**自行撰写**内容。

