# 参数曲线与音高控制函数
> 从 Synthesizer V 的 AKD 脚本库提取的可复用函数，同名脚本取 SV2（无 SV2 版取 SV1）。时间单位 blick，`SV.QUARTER = 705600000`（一个四分音符）；Automation 时间坐标基于音符组时间轴。
## Automation 参数曲线
### getParamDataArray
读取音符组全部 8 项参数锚点（SV1 用 `getAllPoints`）。
```javascript
function getParamDataArray(group) {
    var names = ["pitchDelta", "vibratoEnv", "loudness", "tension",
                 "breathiness", "voicing", "gender", "toneShift"];
    var arr = [];
    for (var i = 0; i < names.length; i++) { arr.push(group.getParameter(names[i]).getAllPoints()); }
    return arr;   // 每项为 [[pos, value], ...]
}
```
### copyParameterToNotes
把第一个音符的参数曲线复制到其余音符，`doStretch` 时按目标时长等比伸缩。
```javascript
function copyParameterToNotes(param, paramName, srcNote, dstNotes, doStretch) {
    var srcOnset = srcNote.getOnset(), srcDur = srcNote.getDuration();
    var dv = (paramName === "vibratoEnv") ? 1 : 0;
    var def = param.getDefinition();
    if (def && def.defaultValue !== undefined && !isNaN(def.defaultValue)) { dv = def.defaultValue; }
    var points = param.getPoints(srcOnset, srcNote.getEnd());
    if (points.length === 0) { return; }
    for (var i = 1; i < dstNotes.length; i++) {
        var o = dstNotes[i].getOnset(), d = dstNotes[i].getDuration(), e = dstNotes[i].getEnd();
        param.remove(o, doStretch ? e : o + srcDur);
        for (var j = 0; j < points.length; j++) {
            var rel = points[j][0] - srcOnset;
            param.add(doStretch ? rel * d / srcDur + o : rel + o, points[j][1]);
        }
        param.add(o, dv);
        param.add(doStretch ? e : o + srcDur, dv);
    }
}
```
### syncParameter
参数范围同步映射：把 src 曲线叠加到 dst，`doRangeMap` 时先归一化再映射到 dst 范围，最后截断到定义范围。
```javascript
// ⚠️ VISIBLE_RANGE = **归一化常量**（本 helper 把曲线归一化后映射到 dst 范围用的），
//    **不是各参数的单位上下限**！例："toneShift": 1 **不**表示 toneShift 只能写 ±1
//    —— 它单位是**音分**、范围 **−800 ~ 800**（照 ±1 写等于没写，2026-09-20 用户实测踩到）。
var VISIBLE_RANGE = {"pitchDelta": 300, "vibratoEnv": 1, "loudness": 12,
    "tension": 1, "breathiness": 1, "voicing": 1, "gender": 1, "toneShift": 1};
var UNIPOLAR = {"vibratoEnv": true, "voicing": true};
function syncParameter(srcParam, dstParam, srcName, dstName, start, end, beilv, pianyi, doRangeMap) {
    var sMax = VISIBLE_RANGE[srcName] || 1, dMax = VISIBLE_RANGE[dstName] || 1;
    var sMin = UNIPOLAR[srcName] ? 0 : -sMax, dMin = UNIPOLAR[dstName] ? 0 : -dMax;
    var r = dstParam.getDefinition().range;
    dstParam.add(start, dstParam.get(start)); dstParam.add(end, dstParam.get(end));
    var sp = srcParam.getPoints(start, end);
    for (var j = sp.length - 1; j > -1; j--) { dstParam.add(sp[j][0], dstParam.get(sp[j][0])); }
    var dp = dstParam.getPoints(start, end);
    for (var k = 0; k < dp.length; k++) {
        var pos = dp[k][0], sv = srcParam.get(pos);
        var nv = (srcName === dstName) ? beilv * dp[k][1] + pianyi : dp[k][1] + beilv * sv + pianyi;
        if (doRangeMap) { nv = (Math.max(sMin, Math.min(sMax, sv)) - sMin) / (sMax - sMin) * (dMax - dMin) + dMin; }
        dstParam.add(pos, Math.max(r[0], Math.min(r[1], nv)));
    }
}
```
### simplifyParameter
曲线简化：去掉冗余锚点，阈值越大越简化。
```javascript
function simplifyParameter(group, paramName, start, end, threshold) {
    group.getParameter(paramName).simplify(start, end, threshold);
}
```
## 音高控制（PitchControlCurve / PitchControlPoint）
### createPitchControlCurve
新建 `PitchControlCurve` 并写入音符组。点内时间相对 `position`，绝对时间 = `position + 相对时间`。
```javascript
function createPitchControlCurve(group, pos, pitch, pts) {
    var curve = SV.create("PitchControlCurve");
    curve.setPosition(pos);
    curve.setPitch(pitch);
    curve.setPoints(pts);       // [[相对时间, 音高差], ...]
    group.addPitchControl(curve);
}
```
### RemovePitch
删除区间 [b1,b2] 内的音高控制：曲线按包含范围切左右两段，点按命中删除。
```javascript
function RemovePitch(b1, b2) {
    var group = SV.getMainEditor().getCurrentGroup().getTarget();
    for (var i = group.getNumPitchControls() - 1; i >= 0; i--) {
        var pitch = group.getPitchControl(i), pos = pitch.getPosition();
        if (pitch.type !== "PitchControlCurve") {
            if (pos > b1 && pos < b2) { group.removePitchControl(i); }
            continue;
        }
        var point = pitch.getPoints().slice().sort(function(a, b) { return a[0] - b[0]; });
        var span = point[0][0] + pos < b1 && point[point.length - 1][0] + pos > b2;
        var left = [], right = [];
        for (var j = 0; j < point.length; j++) {
            var abs = point[j][0] + pos;
            if (span) { if (abs <= b1) { left.push(point[j]); } else if (abs >= b2) { right.push(point[j]); } }
            else if (abs <= b1 || abs >= b2) { left.push(point[j]); }
        }
        if (span && right.length >= 2) {
            var np = pitch.clone();
            np.setPoints(right);
            group.addPitchControl(np);
        }
        if (left.length >= 2) { pitch.setPoints(left); } else { group.removePitchControl(i); }
    }
}
```
### fixPitch
固定音高：`SV.getComputedPitchForGroup` 逐帧采样（空隙为 null），按 null 分段写入 PitchControlCurve。
```javascript
function fixPitch() {
    var groupRef = SV.getMainEditor().getCurrentGroup(), group = groupRef.getTarget();
    var offset = groupRef.getTimeOffset(), interval = 7500000;
    var pitchs = SV.getComputedPitchForGroup(groupRef, 0, interval,
        Math.floor((groupRef.getDuration() + offset) / interval));
    group.getParameter("pitchDelta").removeAll();
    for (var i = group.getNumPitchControls() - 1; i >= 0; i--) { group.removePitchControl(i); }
    var seg = [], segStart = [], cur = [], curStart = [];
    for (var i = 0; i < pitchs.length; i++) {
        if (pitchs[i] !== null) { cur.push(pitchs[i]); curStart.push(i); }
        else if (cur.length > 0) { seg.push(cur); segStart.push(curStart); cur = []; curStart = []; }
    }
    if (cur.length > 0) { seg.push(cur); segStart.push(curStart); }
    for (var k = 0; k < seg.length; k++) {
        var pts = [];
        for (var i = 0; i < seg[k].length; i++) { pts.push([i * interval, seg[k][i]]); }
        if (pts.length >= 2) {
            var curve = SV.create("PitchControlCurve");
            curve.setPosition(segStart[k][0] * interval - offset);
            curve.setPitch(0);
            curve.setPoints(pts);
            group.addPitchControl(curve);
        }
    }
}
```
### connectPitchAnchors
把选中的 `PitchControlPoint` 用余弦缓动插值串成平滑曲线（相邻锚点间各生成一条 Curve）。
```javascript
function mixedInterpolation(p1, p2, numPoints) {
    var x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    var result = [];
    for (var i = 0; i < numPoints; i++) {
        var t = i / (numPoints - 1);
        result.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * (1 - Math.cos(t * Math.PI)) / 2]);
    }
    return result;
}
function connectPitchAnchors() {
    var group = SV.getMainEditor().getCurrentGroup().getTarget();
    var selected = SV.getMainEditor().getSelection().getSelectedPitchControls();
    var last = null;
    for (var i = 0; i < selected.length; i++) {
        if (selected[i].type !== "PitchControlPoint") { continue; }
        if (last !== null) {
            var curve = SV.create("PitchControlCurve");
            curve.setPosition(last.getPosition());
            curve.setPitch(last.getPitch());
            curve.setPoints(mixedInterpolation([0, 0],
                [selected[i].getPosition() - last.getPosition(),
                 selected[i].getPitch() - last.getPitch()], 20));
            group.addPitchControl(curve);
        }
        last = selected[i];
    }
}
```
### applyTransformToPixel / separateByMonotonicity
旋转/倾斜音高线：先转像素并翻转 Y 轴做几何变换再转回；变换会破坏 x 单调性，用 `separateByMonotonicity` 拆成多段写回。
```javascript
function applyTransformToPixel(p, cmd) {
    var x = p[0], y = p[1], pr = cmd.params;
    if (cmd.type === "rotate") {
        var a = pr[0] * Math.PI / 180, cx = pr.length >= 2 ? pr[1] : 0, cy = pr.length >= 3 ? pr[2] : 0;
        var dx = x - cx, dy = y - cy, c = Math.cos(a), s = Math.sin(a);
        return [cx + dx * c - dy * s, cy + dx * s + dy * c];
    }
    if (cmd.type === "skewX") { return [x + y * Math.tan(pr[0] * Math.PI / 180), y]; }
    if (cmd.type === "skewY") { return [x, y + x * Math.tan(pr[0] * Math.PI / 180)]; }
    if (cmd.type === "translate") { return [x + pr[0], y + (pr.length >= 2 ? pr[1] : 0)]; }
    return p;
}
function applyTransformWithPixelConversion(point, cmd, px, py, height) {
    var np = applyTransformToPixel([point[0] * px, (height - point[1]) * py], cmd);
    return [np[0] / px, height - np[1] / py];
}
function separateByMonotonicity(coords, epsilon) {
    if (coords.length <= 2) { return [coords]; }
    var result = [], cur = [coords[0]], lastTrend = null;
    for (var i = 1; i < coords.length; i++) {
        var prev = coords[i - 1], now = coords[i];
        var trend = now[0] > prev[0] ? "inc" : "dec";
        if (Math.abs(now[0] - prev[0]) < 1e-10) { now = [now[0] + epsilon, now[1]]; }
        if (lastTrend === null) { lastTrend = trend; cur.push(now); }
        else if (trend !== lastTrend) { result.push(cur.slice()); cur = [prev, now]; lastTrend = trend; }
        else { cur.push(now); }
    }
    if (cur.length > 0) { result.push(cur); }
    return result;
}
```
## 音符属性
### applyTransition
音高过渡转 pitch：在音高偏差曲线上写三角过渡（SV1 自动插值）。
```javascript
function applyTransition(pit, begin, peakPos, end, depth) {
    if (begin >= end) { return; }
    pit.remove(begin, end);
    pit.add(begin, 0);
    pit.add(peakPos, depth);     // depth = dF0*100（音分）
    pit.add(end, 0);
}
```
### buildVibEnvelope / cosineInterp / linearInterpEnvelope
颤音包络（梯形 0→1→保持→1→0）与余弦缓动插值、包络点阵取值工具。
```javascript
function buildVibEnvelope(startBlick, endBlick, leftSec, rightSec, timeaxis) {
    var env = [[0, 0]];
    var startSec = timeaxis.getSecondsFromBlick(startBlick);
    var endSec = timeaxis.getSecondsFromBlick(endBlick);
    var vibStart = timeaxis.getBlickFromSeconds(startSec);
    if (leftSec > 0) { env.push([vibStart, 0], [timeaxis.getBlickFromSeconds(startSec + leftSec), 1]); }
    else { env.push([vibStart, 1]); }
    if (rightSec > 0) { env.push([timeaxis.getBlickFromSeconds(endSec - rightSec), 1], [endBlick, 0]); }
    else { env.push([endBlick, 1]); }
    env.push([endBlick + 1, 0]);
    return env;
}
function cosineInterp(p1, p2, x) {
    if (x <= p1[0]) { return p1[1]; }
    if (x >= p2[0]) { return p2[1]; }
    var t = (x - p1[0]) / (p2[0] - p1[0]);
    return p1[1] + (p2[1] - p1[1]) * (1 - Math.cos(t * Math.PI)) / 2;
}
function linearInterpEnvelope(env, x) {
    if (env.length === 0) { return 0; }
    for (var i = 0; i < env.length - 1; i++) {
        if (x >= env[i][0] && x <= env[i + 1][0]) { return cosineInterp(env[i], env[i + 1], x); }
    }
    if (x <= env[0][0]) { return env[0][1]; }
    return env[env.length - 1][1];
}
```
### applyVibrato
颤音转 pitch：按音符属性（起始/左右/深度/频率/相位）采样生成 pitchDelta 点，深度 = `dF0Vbr*50` 音分，用 vibratoEnv 调制。
```javascript
function applyVibrato(pit, group, note, attrs, frontAttrs, afterAttrs, hasFront, hasAfter, timeaxis) {
    var onsetSec = timeaxis.getSecondsFromBlick(note.getOnset());
    var noteendSec = timeaxis.getSecondsFromBlick(note.getEnd());
    function v(a, d) { return isNaN(a) ? d : a; }
    var vbrStart = v(attrs.tF0VbrStart, 0.25), vbrLeft = v(attrs.tF0VbrLeft, 0.2),
        vbrRight = v(attrs.tF0VbrRight, 0.2), vbrDepth = v(attrs.dF0Vbr, 1),
        vbrFreq = v(attrs.fF0Vbr, 5.5), vbrPhase = v(attrs.pF0Vbr, 0);
    if (hasFront && frontAttrs) {
        if (!isNaN(frontAttrs.dF0Vbr)) { vbrDepth = frontAttrs.dF0Vbr; }
        if (!isNaN(frontAttrs.fF0Vbr)) { vbrFreq = frontAttrs.fF0Vbr; }
    }
    var vibStart = timeaxis.getBlickFromSeconds(onsetSec + vbrStart);
    var vibEnd = timeaxis.getBlickFromSeconds(noteendSec +
        (hasAfter && afterAttrs && !isNaN(afterAttrs.tF0VbrStart) ? afterAttrs.tF0VbrStart : 0));
    if (vibStart >= vibEnd) { return; }
    var vib0 = buildVibEnvelope(vibStart, vibEnd, vbrLeft, vbrRight, timeaxis);
    var vib1 = [[0, 0], [vibStart - 1, 0], [vibStart, 1], [vibEnd, 1], [vibEnd + 1, 0]];
    var freqBlick = timeaxis.getBlickFromSeconds(onsetSec + vbrStart + 1 / (4 * vbrFreq)) - vibStart;
    if (freqBlick <= 0) { return; }
    var vib = group.getParameter("vibratoEnv");
    var VibArr = [0, 1, 0, -1], depthCents = vbrDepth * 50, k = 0;
    for (var pos = vibStart - 4 * freqBlick + vbrPhase * 2 * freqBlick; pos < vibEnd; pos += freqBlick) {
        if (pos >= vibStart) {
            pit.add(pos, VibArr[k % 4] * depthCents
                * linearInterpEnvelope(vib0, pos) * linearInterpEnvelope(vib1, pos) * vib.get(pos));
        }
        k++;
    }
}
```
### applyVariableFrequencyVibrato
可改变频率的颤音：把 vibratoEnv 值当频率（Hz）采样生成方波，转成 PitchControlCurve。
```javascript
function applyVariableFrequencyVibrato(group, note, start, end, timeaxis) {
    var pit = group.getParameter("pitchDelta"), vib = group.getParameter("vibratoEnv");
    var point = [], k = 1, l = 0;
    for (var i = start; i < end; ) {
        var f = vib.get(i) * 5 + 0.5;
        if (f <= 0) { f = 0.5; }
        var fb = 0.5 * SV.seconds2Blick(1 / f, timeaxis.getTempoMarkAt(i).bpm);
        if (fb <= 0) { break; }
        point[l] = [i, pit.get(i) * k];     // pitchDelta 作幅度(音分)，k 翻转 → 方波
        k *= -1; i += fb; l++;
    }
    pit.remove(start, end);
    if (point.length < 2) { return; }
    var curve = SV.create("PitchControlCurve");
    curve.setPosition(point[0][0]); curve.setPitch(note.getPitch());
    var pts = [], baseT = point[0][0];
    for (var j = 0; j < point.length; j++) {
        pts.push([point[j][0] - baseT, point[j][1] / 100]);
        if (j < point.length - 1) {
            var dt = point[j + 1][0] - point[j][0];
            for (var s = 1; s < 16; s++) {
                var tt = s / 16, w = (1 - Math.cos(tt * Math.PI)) / 2;
                pts.push([point[j][0] + dt * tt - baseT,
                          (point[j][1] + (point[j + 1][1] - point[j][1]) * w) / 100]);
            }
        }
    }
    curve.setPoints(pts);
    group.addPitchControl(curve);
}
```
### setDetune / applyEDO19Tuning
输入音分：给选中音符设置 detune（±50 音分）。十九平均律：按 19-EDO 度数表量化（pitch 落基准八度内度数，detune 填剩余音分）。
```javascript
function setDetune(detune) {
    var selection = SV.getMainEditor().getSelection();
    if (!selection.hasSelectedNotes()) { return; }
    var notes = selection.getSelectedNotes();
    for (var i = 0; i < notes.length; i++) { notes[i].setDetune(detune); }
}
var EDO19 = [[0,0],[0,0.6316],[1,0.2632],[1,0.8947],[2,0.5263],[3,0.1579],[3,0.7895],[4,0.4211],
    [5,0.0526],[5,0.6842],[6,0.3158],[6,0.9474],[7,0.5789],[8,0.2105],[8,0.8421],[9,0.4737],
    [10,0.1053],[10,0.7368],[11,0.3684]];
function applyEDO19Tuning(selectednotes, degree) {
    if (degree < 1 || degree > 19) { return; }
    var entry = EDO19[degree - 1];
    for (var i = 0; i < selectednotes.length; i++) {
        selectednotes[i].setPitch(parseInt(selectednotes[i].getPitch() / 12) * 12 + entry[0]);
        selectednotes[i].setDetune(entry[1] * 100);
    }
}
```
### adjustPitchOffset
音符组音高偏移：整体微调当前音符组 pitch offset（±1 / ±12 半音）。
```javascript
function adjustPitchOffset(delta) {
    SV.getProject().newUndoRecord();                     // 写操作前建撤销点
    var ref = SV.getMainEditor().getCurrentGroup();
    ref.setPitchOffset(ref.getPitchOffset() + delta); return ref.getPitchOffset();
}
```
## 参数范围对照表
| 参数名 | 完整范围（**单位上下限**）| helper 归一化常量（⚠️ **不是**单位上下限）| 单极 |
|---|---|---|---|
| pitchDelta | -1200 ~ 1200 音分 | 300 | 否 |
| vibratoEnv | 0 ~ 2 | 1 | 是 |
| loudness | -48 ~ 12 dB | 12 | 否 |
| tension | -1 ~ 1 | 1 | 否 |
| breathiness | -1 ~ 1 | 1 | 否 |
| voicing | 0 ~ 1 | 1 | 是 |
| gender | -1 ~ 1 | 1 | 否 |
| toneShift | **−800 ~ 800 音分** | 1 | 否 |

> ⚠️⚠️ **第三列不是参数的上下限，别照它写** —— 2026-09-20 用户实测踩到：按 `toneShift` 那格的 `1` 去写，
> 结果**只写了 ±1（音分）⇒ 等于没写**。它只是官方 AKD 示例脚本 `syncParameter()` 里 `VISIBLE_RANGE` 的
> **归一化常量**（把 src 曲线归一化后映射到 dst 范围用），与参数单位无关。
> **有物理单位的参数真实量级是几十~上千**（`pitchDelta` 音分 · `toneShift` 音分 · `loudness` dB），
> 而 `tension` / `breathiness` / `gender` / `voicing` / `vibratoEnv` **本来就是 ±1（或 0~2）档** —— 两者别混。
> 实际取值约束以 `param.getDefinition().range`（`[min, max]`）为准；`vibratoEnv` 默认 1，其余默认 0。
