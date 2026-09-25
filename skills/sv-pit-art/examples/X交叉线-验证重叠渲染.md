# 例：画一个 X —— 验证「重叠曲线逐条渲染」

## 目的

整个彩蛋功能成立与否，只取决于一件事：**SV2 面对多条重叠的音高线，是逐条分别渲染，还是合成成一条？**

- **逐条渲染** → 每条笔画 = 一个图层 → **能画图案** ✓
- **合成一条** → 笔画互相吞掉 → 图案退化成一条线 ✗

## 做法

在 `Track 3 1`（379 音符）的**第一个音符处**，画两条交叉直线组成 X：

```javascript
var ref = SV.getMainEditor().getCurrentGroup();
var g = ref.getTarget();
SV.getProject().newUndoRecord();

var t0 = g.getNote(0).getOnset();     // 882000000 blick = 第 1.25 拍
var span = 2 * SV.QUARTER;            // 宽 2 拍（1411200000 blick）
var step = 3000000;                   // 约 4ms/点

function stroke(dir) {
  var pts = [];
  for (var x = 0; x <= span; x += step) {
    var u = x / span;
    var y = dir > 0 ? (u * 10) : ((1 - u) * 10);   // 0→+10 或 +10→0 半音
    pts.push([x, Math.round(y * 1000) / 1000]);
  }
  var c = SV.create("PitchControlCurve");
  c.setPosition(t0);
  c.setPitch(60);                     // 基准音高 60
  c.setPoints(pts);
  g.addPitchControl(c);
}
stroke(1);
stroke(-1);
```

## 结果

| 项 | 值 |
|---|---|
| 起点 | `t0 = 882000000` blick = **第 1.25 拍** |
| 跨度 | `1411200000` blick = **2 拍** |
| 曲线 A | 471 点（0 → +10 半音）|
| 曲线 B | 471 点（+10 → 0 半音）|
| 组内曲线总数 | 2 |

**「我看到了一个 X」** ✓

## 结论

✅ **SV2 逐条分别渲染重叠的音高线** —— **彩蛋功能成立**，可以着手做 SVG → 笔画 → 曲线 的转换器。

## 复现要点

1. 两条曲线的 `setPosition` **相同**、`setPitch` **相同**、点序列**不同** → 在每一时刻都有两个不同的音高值被同时主张
2. 若 SV2 是"求和/合并"，画面会是一条位于中间的线（或乱掉）；实际看到的是**清晰的两条交叉线** ⇒ 逐条绘制
3. 顺便验证了**步长 3,000,000 blick**（120 BPM 下约 4ms）在这首歌上是够平滑的
