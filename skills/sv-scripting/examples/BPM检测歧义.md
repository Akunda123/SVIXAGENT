# 案例：BPM 检测歧义（同一首歌报 150 / 120 / 75 都"置信度 1"）

> 分类：音频分析 ｜ 症状：对轨后音频和节拍线整体错位、越到后面越不准

## 问题

`sv_align_audio` 对一首 120 BPM 的歌（《怖画》）自动对轨，结果节拍线整体对不上：
- 自由检测报 **150 BPM**，`confidence: 1`
- 限定区间 110-130 再检测，报 **120 BPM**，`confidence` 也是 **1**
- 60-90 区间报 **87**，`confidence` 还是 **1**

用户明确说"BPM 不是 120 吗"，但工具按 150 算了 offset。

## 诊断

**`@audio/beat` 的 `confidence` 没有区分度**——同一段音频在不同 `minBpm/maxBpm` 窗口下都能给出 `conf=1` 的不同 BPM。
根因是它会在"整数倍/半拍"之间混淆：150 ≈ 120 × 1.25、75 = 150/2，节拍脉冲的周期性在多种周期假设下都能自洽。

**判定方法**：不要只看主 BPM 和 confidence。**换区间再检测一次**，如果不同区间给出不同"高置信度"结果，就是有歧义。

## 怎么改

1. **`sv_analyze_audio` 返回 `bpmCandidates`**——用 `tempo()` 的 candidates + 在 110-130 / 140-160 / 60-90 / 90-110 区间各 detect 一次，汇总去重：

```javascript
const tr = tempo(signal, { fs: sr, minBpm: 60, maxBpm: 200 });
// tr.candidates 拿候选；再补区间 detect
for (const [lo, hi] of [[110,130],[140,160],[60,90],[90,110]]) {
  const d2 = detect(signal, { fs: sr, minBpm: lo, maxBpm: hi });
  // 去重后并入 cands
}
```

2. **`sv_analyze_audio` / `sv_align_audio` / `sv_apply_tempo` 都加 `bpm` 参数**——传入后走 `beatTrack(signal, { fs, bpm })` 按指定 BPM 重算拍点，绕开误检：

```javascript
const beatArr = opts?.bpm
  ? beatTrack(signal, { fs: sr, bpm: opts.bpm }).beats   // 按指定 BPM 打拍
  : detect(signal, { fs: sr }).beats;                    // 自由检测
if (opts?.bpm) result.bpm = opts.bpm;                     // 主值也用指定值
```

## 改后效果

- `sv_analyze_audio` 返回 `bpmCandidates: [{bpm:120},{bpm:112},{bpm:150},{bpm:87}]`，**把歧义暴露给用户**。
- 用户判断真实 BPM 后传 `bpm:120`，对轨准确。

## 可复用判断标准

1. **`confidence` 高 ≠ BPM 对**。本库的 confidence 无区分度，**必须看候选列表**。
2. 遇到"对轨越到后面越偏"→ 大概率 BPM 错倍数（×1.25 / ÷2 这种），不是 offset 错。
3. **有歧义时以用户/乐曲常识为准**（120 是常见 BPM，150 常是 120 的误检）。
4. 任何依赖 BPM 的工具都应支持**手动指定 BPM 覆盖**，不要只信自动检测。

## 相关

- 用户明确给出 BPM 时（如"这是 120 的歌"），**直接用**，不要再用自动检测去"纠正"。
