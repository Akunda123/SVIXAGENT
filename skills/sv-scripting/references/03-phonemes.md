# 音素与呼吸音函数

> 来源：Synthesizer V Studio 2 的 AKD 脚本目录（`AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\scripts\AKD`）；同名脚本在 SV1 目录（`Documents\Dreamtonics\Synthesizer V Studio\scripts\AKD`）亦存在，取 SV2 版本。已跳过 `getTranslations` 与弹窗样板。代码为 ES5.1（`var`/`function`）。
> 源脚本：分割元音.js、分割辅音.js、音素替换.js、批量替换音素.js、批量更改辅音长度.js、输入音素比例.js、添加呼吸音.js、删除选中音符呼吸音.js、移动呼吸音延音至新轨道.js、取消延音呼吸音符选择.js、给多音节音符按音节添加+.js、[SV2]音符组音符偏移.js。

## 公共约定

- `SV.getPhonemesForGroup(groupRef)` → 与音符组内音符一一对应的音素字符串数组（空格分隔），`phonemes[idx]` 即第 idx 个音符。
- `SV.getComputedAttributesForGroup(groupRef)[idx]` → 第 idx 音符合成属性：`.phonemes[0].activity !== null` 判定首音素是否为辅音；`.phonemes[0].language` 为语种代码（`mandarin/english/japanese/cantonese/spanish/korean`）。
- `SV.QUARTER` = 一个四分音符的 blick 数（705600000）。时长以 blick 计；`dur` 音符属性为按音素顺序的长度比例数组，`dur[0]` 是首音素（辅音）长度。
- 音符组偏移（SV2 专用，`minEditorVersion`≥131330）：`getPitchOffset()` / `setPitchOffset(n)`。
- 呼吸音/延音判定：歌词为 `"-"` 或匹配 `/^(l?br\d*)$/`。
- 版本检测：`var isSV2 = SV.getHostInfo().hostVersionNumber >= 131329;`

```javascript
// 选中音符，否则取整个音符组（跨脚本通用）
function getSelectedOrAllNotes(selection, group) {
  var notes;
  if (selection.hasSelectedNotes()) {
    notes = selection.getSelectedNotes();
  } else {
    notes = [];
    for (var i = 0; i < group.getNumNotes(); i++) { notes[i] = group.getNote(i); }
  }
  return notes;
}

// 跨语种元音核心集（多音节按音节添加+ 用）
var ALL_VOWELS = ["a","A","o","@","e","7","U","u","i","i\\","i`","y","AU","@U","ia","iA","iAU","ie","iE","iU","i@U","y{","yE","ua","uA","u@","ue","uo","ae","ah","ao","aw","ax","ay","eh","er","ey","ih","iy","ow","oy","uh","uw","aa","6","E","O","9","8","N","m=","N=","M","V","e_o"];
// 辅音核心集（SV2 下 activity 判定优先；完整表见分割元音.js / 批量更改辅音长度.js）
var FUYIN = ["b","d","g","k","p","t","l","r","m","n","N","f","s","sh","ch","x","j","z","ts","h","w","y","v","zh","th","dh","ng"];
var BREATH_PATTERN = /^(l?br\d*)$/;
// 呼吸音/延音判定（取消延音呼吸音符选择 用 unselectNote 复用此判定）
function isBreathOrSustain(lyr) { return lyr == "-" || BREATH_PATTERN.test(lyr); }
```

## 音素表（人可读速查）

> 📌 来源：SynthVCopilot-SKILLS\synthv-tuning\references\咬字与音素.md + examples\咬字糊.md（摘要改写；上游 source-available，不逐字照抄）

前面几节讲的是"怎么调 API"，这一节补上"表里到底有什么"。拼 `dur[]`、写 `setPhonemes`、做批量替换之前先在这里对一眼：音素归哪一类，基本就决定了它该被拉长还是压短、能不能放心拆。

> 🆕 **官方全表已入仓（2026-09-18 用户提供页面存档）** —— 原先只有下面这张十类速查 + 代码集合，**逐音素的本体是缺的**，现在补齐：
>
> | 产物 | 内容 |
> |---|---|
> | 官方 *Synthesizer V Studio Phoneme Reference (2.0.0 update)* 页面存档 | **抽取源**（ dev 侧保留；按 2026-09-19 打包改判，**网页资产不随包分发**）⇒ 要读表看下面两行 |
> | `knowledge/docs/音素表.json` / `knowledge/docs/音素表.md` | 机器可读 / 人读版，**7 种语言 · 239 条**，每条带官方 **Category + Example/Description** |
> | `tools/extract-phoneme-table.cjs` | 从 HTML 抽表（`--md` 另出 md） |
> | `server/src/lyric/phoneme-sets.ts` | **按语言的音素类别 + 辅音集**（`tools/gen-phoneme-sets.cjs` 生成，含 `isConsonant(phoneme, language)`） |
>
> **7 张表**：English-ARPABET 43 · Japanese-ROMAJI 36 · **Mandarin-XSAMPA 55** · Cantonese-XSAMPA 42 · Spanish-XSAMPA 30 · Korean-XSAMPA 30 · Common 3。
> **判辅音的层次（重要）**：① **优先用宿主的计算属性**（SV2 `getComputedAttributesForGroup` 的 `activity` 非 null ⇒ 辅音）；
> ② 拿不到时**按语言查表**（`phoneme-sets.ts` 的 `CONSONANTS_BY_LANGUAGE`）——比本节下面那张跨语种粗集 `FUYIN` 准；
> ③ 再退，才用粗集。**辅音大类** = Stop / Affricate / Fricative / Aspirate / Nasal / Liquid（同官方 Category）；`Semivowel`（`/w/` `/j/`）与 `Coda`（韵尾）**单列**，别混进辅音。
> 📌 这条与 **A（短音符的辅音抢前一个音符 → 压 `dur[0]`）**直接相关：普通话要压的就是那 **20 个辅音**（`p ph t th k kh ts\ ts tsh ts` ts`h x f s s` ts\h s\ m n l`）。

> 记号约定：下文把音素包在 `/xx/` 里，为的是跟拼音区分开；括号内的两个字是例字，方便快速定位。

### 十类音素与代表音素

| 类别 | 代表音素（例字） | 脚本里主要动什么 |
| --- | --- | --- |
| 元音 | `/a/`(三 谈)、`/A/`(长 航)、`/o/`(波 坡)、`/@/`(深 生)、`/e/`(谁 妹)、`/7/`(这 了)、`/U/`(通 空)、`/u/`(都 湖)、`/i/`(你 京)、`/i\/`(四 子)、`` /i`/ ``(吃 日)、`/y/`(女 去) | `dur[k]` 定时值；AI 声库用 `phonemes[k].strength` 定口型 |
| 双元音 | `/AU/`(少 考)、`/@U/`(走 楼)、`/ia/`(家 下)、`/iA/`(强 亮)、`/iAU/`(小 鸟)、`/ie/`(接 些)、`/iE/`(前 边)、`/iU/`(窘 兄)、`/I@U/`(秋 牛)、`/y{/`(元 卷)、`/yE/`(云 寻)、`/ua/`(抓 欢)、`/uA/`(双 广)、`/u@/`(昏 轮)、`/ue/`(回 催)、`/uo/`(说 摸) | 拆音的主要目标；`dur[]` 里分区配权重 |
| 韵尾 | `:\i`(爱 北)、`` /r`/ ``(儿)、`/:n/`(看 人)、`/N/`(上 用) | `dur[k]` 直接决定口型开合（规则 4） |
| 爆破音 | `/p/`(笔 白)、`/ph/`(皮 派)、`/t/`(地 带)、`/th/`(体 太)、`/k/`(鼓 盖)、`/kh/`(库 开) | `dur[0]`；送气与否只看有没有那个 `h` |
| 塞擦音 | `/ts\/`(机 九)、`/ts\h/`(去 切)、`/ts/`(字 在)、`/tsh/`(粗 猜)、`` /ts`/ ``(这 张)、`` /ts`h/ ``(吃 沉) | `dur[0]` 偏短；拖长了会把基频带进来（规则 13） |
| 送气音 | `/x/`(哈 黑) | `dur[0]`；必要时配合发声切段 |
| 摩擦音 | `/f/`(发 风)、`/s/`(四 搜)、`` /s`/ ``(是 深)、`/s\/`(下 寻) | 抒情段压短（规则 2）；AI 声库可用 `strength` 变形 |
| 鼻音 | `/m/`(米 卖)、`/n/`(你 奶)、`/N/`(上 用) | 落点靠 `position` 控制（规则 5） |
| 流音 | `/l/`(里 来) | `dur[0]`；弹舌类硬拼时要用极短时值 |
| 半元音 | `` /z`/ ``(如 然)、`/w/`(为 外)、`/j/`(要 云) | 插到衔接处改连贯度（规则 16） |

### 三个「不发声」的音素，语义并不一样

| 音素 | 语义 | 落地注意 |
| --- | --- | --- |
| `/pau/` | 停顿：让发声真正断开 | 用在句读、气口处；给多长就停多久 |
| `/sil/` | 静音分隔：只把前后两次发声隔开，不制造停顿感 | 用来消掉音素之间意外的粘连 |
| `/cl/` | 喉塞音 | **只有 AI 声库发得出来**；采样声库把它当普通静音，写了等于白写 |

这三个既不在 `BREATH_PATTERN`（`/^(l?br\d*)$/`）里，也不等于延音 `"-"`。写批量清理脚本时别顺手把它们一起删掉。

### 呼吸音族

| 写法 | 说明 |
| --- | --- |
| `/br/` | 短呼吸（AI 声库） |
| `/br1/` ~ `/br9/` | 编号呼吸音，编号不同＝气息长短与气量不同，逐个试 |
| `/brl1/` ~ `/brl9/` | 长呼吸，**声库得带这套采样**才出声，没带就是哑的 |
| `"-"` | 延音：接着前一个音符把声音继续拖下去，不是呼吸音，但常与呼吸音一起处理 |

本文件「呼吸音增删与移动」一节就是围绕这一族写的，判定用的是 `/^(l?br\d*)$/`。**该正则只认 `br`、`brN` 以及前缀写法 `lbrN`，认不出后缀写法 `brlN`** —— 批量脚本要不要补一条，按你工程里实际的写法决定。

### 空格是硬规则

音素串里相邻音素**必须靠空格分开**，这是引擎唯一的分词依据：

- **空格漏了** → 这一段不被识别，根本不发声，波形同样空白；
- **空格多打、音素拼错** → 引擎拿相近的音素顶替，出来的就是另一个音；
- ⇒ 遇到"某个音素不发声"，**排查顺序固定：先数空格，再对拼写**；别一上来就拆音、换采样。

### 多音字重灾区：用拼音兜底

SV 碰到多音字时倾向于挑生僻的那个读音，正式调校前必须逐字过一遍：

| 字 | 容易被念成 | 想要的 |
| --- | --- | --- |
| 读 | `dòu` | `dú` |
| 落 | `là` | `luò` |
| 车 | `jū` | `chē` |

**兜底做法**：把这个音符的歌词直接换成目标读音的拼音（`du` / `luo` / `che`），让引擎自己去转音素；转出来还是不对，再手动 `setPhonemes` 钉死音素串。要批处理就维护一张「字 → 拼音」对照表，遍历歌词命中即改。

### 表里每一条都能脚本化

`Note.attributes` 里与音素相关的三个数组（`dur` / `alt` 一直都有，`phonemes` 是 2.1.1+）：

```javascript
var attrs = group.getNote(i).getAttributes();  // 只返回「非默认」的字段
attrs.dur;       // 按音素顺序的长度缩放，[0] 是首音素（通常为辅音）
attrs.alt;       // 按音素顺序的备用采样索引
attrs.phonemes;  // 2.1.1+ 逐音素对象数组

// 写回时只给要改的键，不必补全
group.getNote(i).setAttributes({
  dur: [1.6, 1.0, 0.4],
  phonemes: [
    { position: 0.5, strength: 0.8, leftOffset: -0.1 },
    { activity: 0.9, muted: false }
  ]
});
```

逐音素对象 `phonemes[k]` 的字段（2.1.1 起）与本文经验的对应关系：

| 字段 | 含义 | 配合哪条经验 |
| --- | --- | --- |
| `position` | 该音素在音符内的位置 | 规则 5（鼻音落点）、规则 6（整体前移） |
| `leftOffset` | 叠加在该音素左边界上的偏移 | 同上，用于微调衔接 |
| `activity` | 音素的起音/活动量 | 「公共约定」里判首音素是否辅音 |
| `strength` | 音素发音力度 | 规则 12（AI 声库的口型与清晰度） |
| `muted` | 该音素是否静音 | 规则 13（切掉带进基频的那一小段） |

⇒ **上面表里列出的每一类音素，脚本都改得动**：分类只决定你动哪个字段、给多大的数 —— 元音与韵尾看 `dur` / `strength`，辅音看 `dur[0]` / `activity`，特殊音素（`pau` / `sil` / `cl`）与呼吸音族则是直接把字符串换掉。

## 音素判定与切分

### isConsonant
判断首音素是否为辅音。SV2 用合成属性 `activity`（非 null 即辅音）更可靠，SV1 回退辅音表。
```javascript
function isConsonant(phonemeStr, noteIdx, groupRef, fuyin) {
  var first = phonemeStr.split(" ")[0];
  if (!first) { return false; }
  if (SV.getHostInfo().hostVersionNumber >= 131329) {
    var comp = SV.getComputedAttributesForGroup(groupRef)[noteIdx];
    if (comp && comp.phonemes && comp.phonemes.length > 0) {
      return comp.phonemes[0].activity !== null;
    }
  }
  return fuyin.indexOf(first) != -1;
}
```
### splitVowels
把多音素音符按音素数均分时值，克隆成多个音符各持一个音素。
```javascript
function splitVowels(selection) {
  var groupReference = SV.getMainEditor().getCurrentGroup();
  var group = groupReference.getTarget();
  var phonemes = SV.getPhonemesForGroup(groupReference);
  var selectedNotes = getSelectedOrAllNotes(selection, group);
  for (var k = 0; k < selectedNotes.length; k++) {
    var notePhonemes = phonemes[selectedNotes[k].getIndexInParent()];
    if (!notePhonemes) { continue; }
    var notePhoneme = notePhonemes.split(" ");
    if (isConsonant(notePhonemes, selectedNotes[k].getIndexInParent(), groupReference, FUYIN)) {
      // 辅音+元音先合成一段
      if (notePhoneme.length >= 2) {
        notePhoneme.splice(0, 2, String(notePhoneme[0]) + " " + String(notePhoneme[1]));
      }
    }
    if (notePhoneme.length <= 1) { continue; }
    for (var i = 0; i < notePhoneme.length - 1; i++) {
      var playhead = selectedNotes[k].getOnset() + (i + 1) * selectedNotes[k].getDuration() / notePhoneme.length;
      var cloned = selectedNotes[k].clone();
      cloned.setOnset(playhead);
      cloned.setDuration(selectedNotes[k].getDuration() / notePhoneme.length);
      cloned.setPhonemes(notePhoneme[i + 1]);
      group.addNote(cloned);
    }
    selectedNotes[k].setDuration(selectedNotes[k].getDuration() / notePhoneme.length);
    selectedNotes[k].setPhonemes(notePhoneme[0]);
  }
}
```
### splitConsonants
把辅音从原音符拆出，在前一音符后（或原音符前）插入独立辅音音符。从后往前避免索引错位。
```javascript
function splitConsonants(selection) {
  var groupRef = SV.getMainEditor().getCurrentGroup();
  var group = groupRef.getTarget();
  var phonemes = JSON.parse(JSON.stringify(SV.getPhonemesForGroup(groupRef)));
  var selectedNotes = getSelectedOrAllNotes(selection, group);
  selectedNotes.sort(function(a, b) { return a.getIndexInParent() - b.getIndexInParent(); });
  for (var i = selectedNotes.length - 1; i >= 0; i--) {
    var idx = selectedNotes[i].getIndexInParent();
    var phonemeStr = phonemes[idx];
    if (!phonemeStr || !isConsonant(phonemeStr, idx, groupRef, FUYIN)) { continue; }
    var duration;
    if (idx > 0) {
      var prevNote = group.getNote(idx - 1);
      if (prevNote.getEnd() < selectedNotes[i].getOnset()) {
        duration = selectedNotes[i].getOnset() - prevNote.getEnd();
        if (duration > SV.QUARTER / 8) { duration = SV.QUARTER / 8; }
      } else if (prevNote.getDuration() > SV.QUARTER / 4) {
        duration = SV.QUARTER / 8;
        prevNote.setDuration(prevNote.getDuration() - SV.QUARTER / 8);
      } else {
        duration = prevNote.getDuration() / 2;
        prevNote.setDuration(prevNote.getDuration() / 2);
      }
    } else { duration = SV.QUARTER / 8; }
    var newNote = selectedNotes[i].clone();
    newNote.setTimeRange(selectedNotes[i].getOnset() - duration, duration);
    newNote.setPhonemes(phonemeStr.split(" ")[0]);
    selectedNotes[i].setPhonemes(phonemeStr.split(" ").slice(1).join(" "));
    group.addNote(newNote);
  }
}
```

## 音素替换

### replaceAll
ES5.1 安全的全局字符串替换。
```javascript
function replaceAll(str, search, replacement) {
  var result = "";
  var searchLength = search.length;
  var i = 0;
  while (i < str.length) {
    if (str.substr(i, searchLength) === search) {
      result += replacement;
      i += searchLength;
    } else { result += str[i]; i++; }
  }
  return result;
}
```
### batchReplacePhonemes
在整组音素字符串里把 `find` 子串替换为 `replace`。
```javascript
function batchReplacePhonemes(groupRef, notes, find, replace) {
  var phonemes = JSON.parse(JSON.stringify(SV.getPhonemesForGroup(groupRef)));
  for (var i = 0; i < notes.length; i++) {
    var idx = notes[i].getIndexInParent();
    if (phonemes[idx].indexOf(find) != -1) {
      notes[i].setPhonemes(replaceAll(phonemes[idx], find, replace));
    }
  }
}
```
## 辅音长度与音素比例

### setConsonantLength
把选中音符 `dur` 属性首元素（辅音长度）缩放为 `newLength`。
```javascript
function setConsonantLength(groupRef, notes, newLength) {
  var phonemes = JSON.parse(JSON.stringify(SV.getPhonemesForGroup(groupRef)));
  for (var i = 0; i < notes.length; i++) {
    var idx = notes[i].getIndexInParent();
    var parts = phonemes[idx].split(" ");
    if (parts.length > 0 && FUYIN.indexOf(parts[0]) != -1) {
      var dur = notes[i].getAttributes().dur;
      if (!dur || dur.length === 0) { dur = [1]; }
      dur[0] = newLength;
      notes[i].setAttributes({dur: dur});
    }
  }
}
```
### inputPhonemeRatios
按用户输入的每个音素比例写回 `dur` 数组；未填项保留原值或默认 1。`maxDurLen` 按音素表统计（default 下 `dur` 为空不能用它估算），供弹窗动态建控件。`options["dur"+(d+1)]` 来自弹窗 TextBox。
```javascript
function getMaxDurLen(groupRef, notes) {
  var phonemes = SV.getPhonemesForGroup(groupRef);
  var maxDurLen = 0;
  for (var i = 0; i < notes.length; i++) {
    var parts = phonemes[notes[i].getIndexInParent()].split(" ");
    if (parts.length > maxDurLen) { maxDurLen = parts.length; }
  }
  if (maxDurLen < 2) { maxDurLen = 2; }
  return maxDurLen;
}
function inputPhonemeRatios(notes, options, maxDurLen) {
  for (var i = 0; i < notes.length; i++) {
    var oldDur = notes[i].getAttributes().dur || [];
    var newDur = [];
    var hasChange = false;
    for (var d = 0; d < maxDurLen; d++) {
      var val = parseFloat(options["dur" + (d + 1)]);
      if (!isNaN(val)) { newDur[d] = val; hasChange = true; }
      else { newDur[d] = (oldDur[d] !== undefined) ? oldDur[d] : 1; }
    }
    if (hasChange) { notes[i].setAttributes({dur: newDur}); }
  }
}
```

## 音素长度规则集

> 📌 来源：SynthVCopilot-SKILLS\synthv-tuning\references\咬字与音素.md + examples\咬字糊.md（摘要改写；上游 source-available，不逐字照抄）

上一节给了 `dur[]` 与 `phonemes[]` 两个抓手，这一节回答"到底该给多少"。十七条规则，每条都点明落到哪个字段、给什么量级 —— 可以直接照着写脚本。

### 规则清单

1. **逐字变化是核心原则。** 长度不是整组共用的一个常数，必须逐音符算。整组套同一个 `dur[0]`，咬字一定死板机械。一个能直接用的分配：落在整拍上的音符辅音给 1.5~1.8，反拍、十六分位置压到 0.4~0.6；一拍里塞两个字的，第二个字再降一档。
   ```javascript
   // 辅音长度随拍位走，而不是整组一个数
   function consonantDurFor(onset) {
     return (onset % SV.QUARTER === 0) ? 1.6 : 0.5;   // 整拍 vs 反拍
   }
   ```
2. **抒情歌里 `/s/`、`/x/`、`` /s`/ `` 这类摩擦音要压短。** 慢速段把摩擦音拖长会一路漏气，听感发毛、字也散。落到字段：该音素的 `dur[k]` 取 0.3~0.5。**压的是摩擦音那一段，不是整个字的时值。**
3. **复合元音的时长按"主音素吃满、滑向音只点一下"分配。** `dur[]` 就是按音素顺序给的权重数组，干这件事正合适。例：`ai` 在音素层面是 `/a/` 加 `:\i`，`dur` 给成 `[1.8, 0.25]`；把滑向的那一段拖长会变成"啊——诶——"，字听着就瘪了。`ao`、`ei`、`ou` 同理。
4. **韵尾越长口型越小，越短口型越大。** 这条直接对应 `:\i`、`` /r`/ ``、`/:n/`、`/N/` 的 `dur[k]`：想"含着收住"就往上给（1.4~2.0），想"张口放开"就往下压（0.5~0.8）。但两头都不能过头 —— 压到 0.3 以下会认成别的字（`tian` 的 `:n` 被压没了，听感就往 `tie` 滑）。
5. **高音处把鼻音的落点往后放。** 鼻音（`/N/`、`/:n/`、`/m/`、`/n/`）起得太早，咬字和旋律会错位。除了在 `dur` 上给足长度，还可以把 `phonemes[k].position` 往大调一点（或给正的 `leftOffset`），把它的落点整体右移。**注意**这会挤压前一个元音实际可用的时长，两边要一起看。
6. **音素整体前移可以弱化口型变化。** 方向对了但过程太夸张时，把该音素往前挪一点（`position` 调小、或 `leftOffset` 给负值，量级 -0.05~-0.1），口型的变化过程就被压缩了。这是"修过头"最省事的手段，不必换字也不必拆音。
7. **相邻音素会联动。** 动任何一段的长度都会挤压它的邻居：把某个字的辅音拉长，它前面那个字元音的可用时长就跟着缩水。脚本上有条硬性建议 —— **一次性算完整条 `dur` 数组再 `setAttributes`**，别一个下标一个下标分多次写；否则每次 `getAttributes()` 拿到的都是上一次的结果，写法顺序一变结果就变。
8. **看波形判断长度，别只盯数字。** `dur[]` 是**相对缩放**而不是秒数：同一个 `dur[0] = 1.5`，挂在八分音符和全音符上得到的实际辅音宽度差好几倍。所以流程是"改 `dur` → 导出 → 在波形上量辅音实际占了多少 → 再回来改"，最后以听感定稿。
9. **快歌口糊是正常的，取舍时保辅音。** 真人唱快嘴本来就会丢一部分咬字清晰度，在可控范围内糊一点反而自然，太清晰反而假。落到字段：砍时长时**只砍元音与韵尾，给辅音 `dur[0]` 留一个下限**（例如不低于 0.8），必要时把张力整体压低一点配合。
10. **把元音单独拉长不会改变发音。** 在音符时值固定的前提下，一个单元音拉长还是那个音，除非它后面还接别的音素。所以"想让口型变大"别指望拉长元音来解决 —— 得换音素、换采样（`alt`）或动 `strength`。
11. **换采样改的是口型，而且会牵连前后。** 采样声库对每个音素都备了备用采样，脚本里就是 `attributes.alt[]`（按音素顺序的备用采样索引）。三条经验：
    - 替换**辅音**对口型的影响大于替换元音，光是 `alt` 的排列组合就能做出很丰富的咬字变化；没有"1 号是什么特质"这种规律，只能试；
    - 改一个音素会连带改变前后音素的发音（采样是拼接出来的）；
    - 副作用是**经常把下一个字带坏**，规避不了就只能把这个字拆去另一条轨 —— 这是最常见的一种拆轨理由。
    - AI 声库没有备用采样，这条路走不通，改用 `strength`。
12. **`strength`（音素力度）的三个高价值用法。** AI 声库独有：元音拉大＝口型变大，辅音拉小＝变糊/浊化、拉大＝更清晰有力。注意 `getAttributes()` 里它的默认值是 `NaN`（表示走默认），要改就得显式给数。
    - 把 `/s/` 的 `strength` 压到最低，直接变成英语 `/θ/`（AI 声库最划算的一招）；
    - `/f/` 的 `strength` 调小**加上** `dur` 缩短 → 口型不变，发音往 `/v/` 靠；
    - 跨音区音色不统一（同一句里高音段与低音段的发声状态对不上）时，用 `strength` 配合性别参数救回来。
13. **`g`、`f` 这类辅音不够长会把基频带进来**，听感上像浊辅音。对策不是继续拉长 `dur[0]`，而是**用"发声"把那一小段切掉** —— 参数类型名 `voicing`（范围 0~1，默认 1），取法 `group.getParameter("voicing")`。"降发声 / 提气声"的取舍与清化浊辅音的反向手法见 `references/07-melody-accent-pitch-params.md` §3.2f。
14. **拆音。** 逐条条目见下面「拆音条目表」。
15. **拆音的副作用与止损。** 拆开会改变原有的采样链接，出现不连贯是正常的，不是做错了。止损顺序：
    1. 第一反应先在**张力**（`tension`）上画一下把过渡柔化，多数突兀感到这一步就没了；
    2. 一次只拆一小段，先 `newUndoRecord()` 再改，试听—回退的成本才低；
    3. **拆不动就换手段** —— 同一个字采样声库拆不出满意效果而 AI 声库能拆动（反过来也有），换采样、改字、动 `strength` 都行，别在一个字上死磕。
    - 另外：**不要为了拆而拆。** 本来咬字没问题的字硬拆一遍只会更差。
16. **半元音的道理：`/w/`、`/y/` 归进后一个音的辅音。** 它们因此能从上一个字顺顺当当地滑进来；换成两个各自都能独立成立的元音（比如 `/U/` 接 `/u/`），中间就必然出现音量或力度上的起伏。**想把两个字连起来，衔接处就写成半元音；想要停顿感，就用彼此独立的元音。** 脚本上无非是在音素串里插一个 `/w/` 或 `/y/`，或者把某段整个换掉再拆成两个音符。
17. **拆清辅音必须带元音。** 清辅音拆出来之后，后面挂哪个元音会改变它实际发出来的音 —— 动手之前先想清楚前后衔接是不是你要的，否则拆完整个字的音色都变了。

### 拆音条目表

| 原字（拼音） | 拆法 | 音素层面的变化 |
| --- | --- | --- |
| `chang` | `che` + `ang` | 由 `/A/` 变成 `/7 A/` |
| `huang` | `huo` + `ang` | 由 `/uA/` 变成 `/uo A/` |
| `huang` | `hu` + `/ua N/` | 由 `/uA/` 变成 `/u uA/` |
| `tian` | `tie` + `en` | 由 `/iE/` 变成 `/ie @/` |
| `tian` | `ti` + `/iE @ :n/`（韵母整串接在后面） | 由 `/iE/` 变成 `/i iE @/` |
| `chun` | `chu` + `en`；或 `ch` + `uo` + `n` | 拆出过渡口型 |
| `shui` | `shu` + `ei` | 同上 |
| `zhuang` | `zhuo` + `ang` | 同上 |
| `yuan` | `ye` + `an`；或 `/y E an/` | 口型更饱满圆润 |
| `liu` | `l` + `ie` + `o` | 尾韵落点更明确 |
| `feng` | `f` + `o` + `ng` | 同上 |
| `zhui` | `zh` + `u` + `a` + `i`；或在中间插一个 `/o/` | 突出 `u`→`a` 的口型过程 |
| `diao` | `d` 单独拆出，尾韵后再补一个 `/w/` | 让 `u` 落得标准 |
| `jie` / `xie` | 干脆落到 `/ai/` 的发音上 | 长音口型变化太拖沓时用 |

**让尾韵落得准**：尾韵是 `i` 时在前面加一个半元音 `/y/`，非常明确地落到 `i` 口型；尾韵是 `u` 时在后面加一个半元音 `/w/`，强制标准地落到 `u` 口型。另一招是后面故意多挂一个音，再用响度把不要的那段切掉，等于换掉尾韵落点。

**句首/句尾"带口型再切掉"**：某个字的发音听不出是什么时，先在它前面补一个目标元音当口型，再把这一段的响度压到底切走 —— 口型立刻被掰正。句尾一样处理。

脚本实现上，短音素串直接 `setPhonemes`，成批处理用本文件前面的 `batchReplacePhonemes`，需要按音素切音符时用 `splitVowels` / `splitConsonants`。

### 规则 → 字段对照表

| 想改什么 | 字段 / API | 量级参考 |
| --- | --- | --- |
| 单个音素的长短 | `dur[k]`（k＝音素序号） | 0.3 ~ 2.0，1 为默认 |
| 辅音起始长度 | `dur[0]` | 0.4（弱拍）~ 1.8（重拍） |
| 音素整体位置 | `phonemes[k].position` / `leftOffset` | `position` 微调 ±0.1；`leftOffset` -0.1 ~ +0.1 |
| 音素力度（口型 / 清晰度） | `phonemes[k].strength`（AI，2.1.1+） | 默认 `NaN`，要改就显式给数 |
| 音素是否发声 | `phonemes[k].activity` / `muted` | `activity` 非 null 即辅音起头 |
| 换备用采样 | `alt[k]` | 索引，逐个试，没有规律 |
| 换音素 / 拆音 | `setPhonemes` / `batchReplacePhonemes` | 一轨内完成，遵循引擎拼接规则 |
| 抹掉某段的发声 | `voicing` 自动化（`getParameter("voicing")`） | 0 ~ 1，默认 1 |

## 呼吸音增删与移动

### addBreathNotes
在音符间隔 ≥ `minBlicks` 的缝隙插入呼吸音音符；间隔超过 `maxBlicks` 取最大值，否则填满缝隙。`maxBlicks`/`minBlicks` 由拍数 × `SV.QUARTER` 得到。
```javascript
function addBreathNotes(group, maxBlicks, minBlicks) {
  for (var i = group.getNumNotes() - 1; i > 0; i--) {
    var gap = group.getNote(i).getOnset() - group.getNote(i - 1).getEnd();
    if (gap >= minBlicks) {
      var Nnote = SV.create("Note");
      Nnote.setPitch(group.getNote(i).getPitch());
      Nnote.setLyrics("br");
      if (gap >= maxBlicks) {
        Nnote.setTimeRange(group.getNote(i).getOnset() - maxBlicks, maxBlicks);
      } else {
        Nnote.setTimeRange(group.getNote(i - 1).getEnd(), gap);
      }
      group.addNote(Nnote);
    }
  }
}
```
### deleteBreathNotes
删除选中（或整组）中歌词匹配呼吸音模式的音符。
```javascript
function deleteBreathNotes(group, notes) {
  for (var i = notes.length - 1; i >= 0; i--) {
    if (BREATH_PATTERN.test(notes[i].getLyrics())) {
      group.removeNote(notes[i].getIndexInParent());
    }
  }
}
```
### moveBreathToNewTrack
把呼吸音与延音（`"-"`）音符克隆到新建音符组并挂到当前轨道，再从原组移除。
```javascript
function moveBreathToNewTrack() {
  var scope = SV.getMainEditor().getCurrentGroup();
  var group = scope.getTarget();
  var Nscope = SV.create("NoteGroupReference");
  var Ngroup = SV.create("NoteGroup");
  SV.getProject().addNoteGroup(Ngroup, 0);
  Nscope.setTarget(Ngroup);
  Nscope.setTimeOffset(scope.getTimeOffset());
  for (var i = group.getNumNotes() - 1; i >= 0; i--) {
    var note = group.getNote(i);
    if (isBreathOrSustain(note.getLyrics())) {
      Ngroup.addNote(note.clone());
      group.removeNote(i);
    }
  }
  SV.getMainEditor().getCurrentTrack().addGroupReference(Nscope);
}
```
## 多音节歌词

### addPlusToMultisyllable
统计每个音符音素中的元音数（音节数），>1 时在后续音符插入对应数量 `"+"`，并把原歌词后移。两阶段处理避免边改边判错位。
```javascript
function addPlusToMultisyllable(selection) {
  var scope = SV.getMainEditor().getCurrentGroup();
  var group = scope.getTarget();
  var selectedNotes = getSelectedOrAllNotes(selection, group);
  var phonemes = SV.getPhonemesForGroup(scope);
  selectedNotes.sort(function(a, b) { return a.getOnset() - b.getOnset(); });
  var addCounts = [];
  for (var i = 0; i < selectedNotes.length; i++) {
    addCounts[i] = 0;
    if (selectedNotes[i].getLyrics().indexOf("+") != -1) { continue; }
    var parts = phonemes[selectedNotes[i].getIndexInParent()].split(" ");
    var syllables = 0;
    for (var j = 0; j < parts.length; j++) {
      if (ALL_VOWELS.indexOf(parts[j]) != -1) { syllables++; }
    }
    if (syllables > 1) { addCounts[i] = syllables - 1; }
  }
  for (var i2 = selectedNotes.length - 1; i2 >= 0; i2--) {
    var shift = addCounts[i2];
    if (shift <= 0) { continue; }
    for (var s = selectedNotes.length - 1; s > i2; s--) {
      var from = s - shift;
      if (from >= i2) { selectedNotes[s].setLyrics(selectedNotes[from].getLyrics()); }
    }
    for (var k = 1; k <= shift; k++) {
      if (i2 + k < selectedNotes.length) { selectedNotes[i2 + k].setLyrics("+"); }
    }
  }
}
```

## 音符组偏移（SV2 侧边栏）

### adjustPitchOffset
对当前音符组整体移调 `delta` 半音（`getPitchOffset`/`setPitchOffset` 为 SV2 专用）。写操作前先建撤销点。
```javascript
function adjustPitchOffset(delta) {
  SV.getProject().newUndoRecord();
  var ref = SV.getMainEditor().getCurrentGroup();
  ref.setPitchOffset(ref.getPitchOffset() + delta);
}
```

---

## 音素替换（MCP 工具 · 2026-09-22）

官方那段"音素替换.js"是**交互式**的（宿主里弹出 ComboBox 逐个音素选）；我们把它拆成**对话可用的两步**：

| 工具 | 作用 |
|---|---|
| `sv_list_phonemes`（只读） | 读目标音符的**实际发音串**（`get_phonemes` op = `SV:getPhonemesForGroup`，含 T2P 默认），按**每个音符的实际语种**给每个音素**按相似度排名的候选** |
| `sv_replace_phonemes`（写，**默认 dry-run**） | 基于同一实际发音串**批量替换**：`mode:"map"`（`replacements:[{from,to}]`，**音素 token 精确匹配**，等价官方脚本的 `replaceAll`）/ `mode:"set"`（`items` 逐音符整串写，**空串=清手动音素回 T2P**） |

**范围**：`indices` → 选中的音符 → 全组。

**候选怎么来**（三层数据，`tools/gen-phoneme-data.cjs` 合成 → `server/src/phoneme/data.ts`）：
1. **官方音素表**（`knowledge/docs/音素表.json`，7 表 239 音素）—— 管**合法性**（"表外拒写"）与**例词显示**；
2. **用户那份参考脚本**（`音素替换.js`，逐字留档在里）：6 语言的 `Vowels[6 族]`（**听感手工分类**）/`Vowels0`（族内参考顺序）/`Consonants0`；
3. **我们的修订层**（`tools/phoneme-overrides.cjs`）：把"落不进任何族"的 `j`(mandarin)/`u`(japanese)/`y`(cantonese) 补进最贴近的族（原脚本给它们的候选是**空**）。

**相似度（启发式，`topN` 自适应）**：
- **元音**：Jaccard = 共享族数 ÷ 并集族数（族完全一致 ⇒ 1.0）；同分时按族内参考顺序**邻近**者优先；
- **辅音**：字母重合率（沿用官方脚本"字母近似"的直觉，`hh`→`jh/dh/ch/sh/th/zh`）；
- **条数**：取 score ≥ 最高分 50% 的一档（**最少 3、最多 10**）；`topN` 可显式覆盖，`0`=全列；
- ⚠️ **无相似信息时如实标注**（族/字母都不重合 ⇒ 列出的只是"本语言同类清单（按表序）"，不代表相似度）。

**拒写口径**：目标串里任何 token 不在清单里 ⇒ **一个都不写**（用户裁定"表外音素直接拒写"），并给近邻候选。
⚠️ **待用户最终确认**：官方表与参考脚本的辅音清单**不一致**（korean `pp`/`tt` 只在参考表；官方表另有 `p_t`/`t_t`/`dz\h` 等）⇒ 现默认**取并集**放行，另留 `strict:"official"` 只认官方表。

**纪律**：默认 dry-run；写前 `newUndoRecord`、写完**回读**；**不改歌词、不改语种**（跨语种候选需显式 `crossLanguage:true`，且工具**不会替你写 `languageOverride`**）；⚠️ SV2 的 phonemes **引擎会消费但不回显到 computed** ⇒ **效果只能听感验收**。IX 上直接拒绝（音素是人声专属）。

### 真机验收 + 两条环境差异（2026-09-22 · **SV1 1.11.2** · 日语轨 · 4 音符）

全链路实测通过：**候选** → **dry-run** → **表外拒写** → **真写** → **回读双源**：

| 环节 | 实测 |
|---|---|
| `get_phonemes`（实际发音） | ✅ SV1 上**可用**：`duo→"d u o"` · `xie→"i e"` · `shi→"sh i"` · `cong→"o ny gy"`（罗马字 T2P）；而 `get_lyrics_attrs` 的 `phonemes`（**手动串**）**全空** ⇒ 印证"替换必须基于 `get_phonemes`" |
| 候选（language=japanese） | `d`→`dy` · `u`→`N/w/v` · `i`→`y` · `sh`→`s/ts/h/ch/hy` · `ny`/`gy`→拗音全族；`o`/`e` 在日语里同族只有它自己 ⇒ 工具**如实标注"无相似信息"** |
| dry-run `gy→by` | ✅ 只动第 4 个音符：`o ny gy` → `o ny by` |
| 表外拒写 | ✅ 写 `M_`（日语没有）⇒ `ok:false, rejected:true`，并给日语近邻候选 |
| 真写 + 回读 | ✅ `{changed:1, failed:[]}`；回读 `get_phonemes` = `[…,"o ny by"]`（**实际发音跟着手动串走**）、`getPhonemes()` = `["","","","o ny by"]` |

⚠️ **SV1 上没有 `getComputedAttributesForGroup`**（如实 `unsupported`）⇒ **读不到语种**：必须显式传 `language`（如 `language:"japanese"`），或音符上有 `languageOverride`；两者都没有时工具会提示"**按全语言退化**"（候选照给，但不再限定语种）。

⚠️ **刚建组 / 刚改完可能要等引擎算**：第一次读回 `phonemes: []`，稍后再读才有值 —— 别急着判"没有音素"。

⚠️ **改语种 = 该音符的全部音素按新语种重算**（T2P 重来）；而本工具的写入是**整串** `setPhonemes`（整串被钉住）。
**只想改一个音素**却要跨语种 ⇒ **先把这个音符拆成两个**（各带自己的语种）。
工具会在结果串里出现**外来音素**（不属于本语言清单、也不是 common）时自动带回 `warnings` + `foreignTokens`/`foreignLanguages`，并原话提醒拆分。

### 真机证据：SV2 探针（2026-09-22 · SV2 2.2.1 · 英文声库 · 16 音符探针组）

读 `getComputedAttributesForGroup`（**引擎实际吐出的音素**，比任何表都权威）：

| 语种 | 歌词 | 引擎实际音素 | 结论 |
|---|---|---|---|
| mandarin | `duo` | `t uo` | 官方表能解释（`t` = 不送气 /t/） |
| mandarin | `ya` | **`j ia`** | **`j` 真在用**（落不进族的那个 ⇒ 补族必需） |
| mandarin | `ri` / `hai` | `z\` i\`` / `x a` **`:\i`** | `:\i` 只在官方表，引擎真用 |
| japanese | `u` / `nyu` | **`u`** / `ny u` | **日语 `u` 真在用** |
| cantonese | `syu` / `gwaa` | `s` **`y`** / `kw a` | **粤语 `y` 真在用** |
| korean | `ppa` / `tta` / `kka` | **`p_t 6`** / **`t_t 6`** / **`k_t 6`** | **引擎用官方写法**（不是参考脚本的 `pp`/`tt`/`kk`） |
| korean | `ja` | **`dz\ 6`** | ⚠️ **两份清单都没有** ⇒ 已按"引擎实测"补进官方表（`cat:"engine-observed"`） |
| english / spanish | `cat`/`think`/`perro`/`gato` | `k ae t` / `th ih ng k` / `p e rr o` / `g a t o` | 与表一致 |

**由此定下的三条**：① **拒写取并集**（官方 ∪ 参考脚本 ∪ 引擎实测）—— 实测写 `pp 6` 后 computed 就是 `pp 6`（**引擎不归一化**），两种写法都接受；② **候选排序优先官方写法**（那才是 T2P 原生输出）；③ **引擎实测到的符号必须补进合法集**，否则"表外拒写"会误拒它。

⚠️ **computed 的前置条件：该组必须有歌手（voice）** —— 探针组刚建好、还没指定声库时，`getComputedAttributesForGroup` 对 16 个音符**全空**；指定英文声库后立刻出数。排查顺序：**先看有没有 voice**，再看语种兼容/组是否挂上轨。

⚠️ **`get_computed_attributes` 的 `index` 在桥 0.3.23 及以前是 1 起**（与协议"对外一律 0 起"不一致，会让按 0 起消费的调用方整体错位一位）—— **桥 0.3.24 已改为 0 起**；用 0.3.23 时记得 `index - 1`。
