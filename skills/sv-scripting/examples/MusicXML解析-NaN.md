# 案例：手写 XML 解析器导致 MusicXML 音符 pitch=NaN / duration=0

> 分类：数据解析 ｜ 症状：解析成功、结构对了，但**所有音高变 NaN、时值变 0**

## 问题

在 `midi2ixp.html` 里手写了一个零依赖的 `parseXml()` 把 MusicXML 转成对象，然后 `convertMusicXml()` 消费它。
`tracks` / `library` 数量都对（2 part → 2 track），但每个音符：

```
note0 pitch=NaN dur=0拍 art=["Staccato"]   ← 技法对了，音高时值全废
```

技法读到了、音高时值读不到 —— 说明**嵌套结构解析有偏差**。

## 诊断

打印解析出的原始 note 对象：

```json
{"pitch":{"step":{"#text":"E"},"octave":{"#text":"4"}},
 "duration":{"#text":"4"}, "voice":{"#text":"1"}, ...}
```

**根因**：`<step>E</step>` 这种**叶子元素**被解析成了 `{"#text":"E"}` 对象，而不是字符串 `"E"`。
于是 `note.pitch.step` 拿到的是对象 → `STEP_PC[对象]` = undefined → NaN；`Number({#text:"4"})` = NaN → dur 0。

**第一个 bug（更隐蔽）**：`<part>` 元素被堆进了 `part-list` 里，顶层没有 `part` 键：
```json
spw keys: ["@_version", "part-list"]      ← 没有 part！
spw.part: undefined
```
根因：解析循环**没有处理结束标签 `</tag>`** 来弹栈。`cur` 指针一直停在最后一个开标签上，
`</part-list>` 之后 cur 仍是 part-list，于是后面的 `<part>` 全被当成 part-list 的子节点。

## 怎么改

**① 补结束标签弹栈**（否则兄弟节点层级全错）：

```javascript
// 正则里加一个 </tag> 分支（第 4 组）
var re = /<([A-Za-z0-9_\-]+)([^>]*?)(\/)?>|<\/\s*([A-Za-z0-9_\-]+)\s*>|…/g;
// 循环里：
if (m[4] !== undefined) {                 // 结束标签 → 弹栈
  if (stack.length > 1) { stack.pop(); cur = stack[stack.length - 1]; }
  else { stack.pop(); cur = null; }
  continue;
}
```

**② 叶子元素坍缩成字符串**（无属性、无子元素 → 直接返回文本）：

```javascript
function pure(node) {
  var o = {}, at = node.attrs || {};
  for (var k in at) o["@_" + k] = at[k];
  var children = node.children || [];
  var hasElem = false;
  for (var i = 0; i < children.length; i++) if (children[i].tag !== undefined) { hasElem = true; break; }
  if (!hasElem && Object.keys(at).length === 0) {          // 叶子 → 返回文本
    var s = ""; for (var j = 0; j < children.length; j++) if (children[j].text !== undefined) s += children[j].text;
    return s;                                              // "<step>E</step>" → "E"
  }
  // 否则递归折叠子元素…
}
```

**③ 顶层包一层 tag 名**（消费方按 `obj["score-partwise"]` 取）：

```javascript
if (root) { var t = {}; t[root.tag] = pure(root); return t; }   // {score-partwise:{...}}
```

## 改后效果

```
track0 "Flute" instr=Orchestral Piccolo 1
  note0 pitch=64(E4) dur=1拍 dyn=0.71 art=["Staccato"]   ← 全对
  note1 pitch=65(F)  art=["Tenuto","Slur"]
  note6 pitch=72(C5) dur=0.5拍(八分) art=["Trill Minor"]
track1 "Violin" instr=Orchestral Violin 1（含 voice 8 的 C3 低音）
```

## 可复用判断标准

1. **手写 XML 解析器必须处理 `</tag>` 弹栈**——漏了会让所有兄弟节点变成"最后一个开标签的子节点"。
   典型症状：**顶层少键、兄弟节点互相嵌套**。
2. **叶子元素要坍缩成字符串**——否则每个值都是 `{#text:...}`，下游 `Number()` 全 NaN。
3. **解析完先打印一处原始结构再写消费逻辑**（`JSON.stringify(node)`），比猜快得多。
4. **"部分字段对、部分全 None/NaN"** 是结构偏差的典型信号：能读到的（技法/art）说明层级浅；
   读不到的（pitch/duration）说明该分支多套了一层。
5. 用 `fast-xml-parser` 时注意属性前缀是 `@_`（`sound["@_tempo"]`），元素才是普通键。
