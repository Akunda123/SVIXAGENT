# 轨道/工程/杂项函数

> 来源：`Dreamtonics\Synthesizer V Studio\scripts\AKD` 与 `...Synthesizer V Studio 2\scripts\AKD` 的轨道/工程/杂项脚本（分割轨道、跨轨道复制、轨道内复制、工程缩放、自动调整BPM、自动调整音区偏移（低/高音）、清除所有拍号、和声、[SV1]轨道名带RGB的RGB变色、选中轨道RGB变色、选中轨道自定义变色、SV1/SV2添加隐形水印、翻页时有未完成操作自动暂停）。
> 全部代码为 ES5.1（var/function，无箭头/const/let/模板串）；已跳过 `getTranslations` 与弹窗样板，只保留可复用核心。

## 通用工具

### setInterval / capitalize / capitalizeVocalMode / djb2Hash
```javascript
function setInterval(t, callback) {
	callback();
	SV.setTimeout(t, setInterval.bind(null, t, callback));
}
function capitalize(string) {
	return string.charAt(0).toLocaleUpperCase() + string.slice(1).toLocaleLowerCase();
}
function capitalizeVocalMode(vocalMode) {
	var parts = vocalMode.split("_");
	for (var i = 0; i < parts.length; i++) { parts[i] = capitalize(parts[i]); }
	return parts.join("_");
}
function djb2Hash(str) {
	var hash = 5381;
	for (var i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash) + str.charCodeAt(i);
	}
	return hash;
}
```

## 多轨操作

### getTrackRefs / getNotes / splitTrackAtPlayhead
```javascript
function getTrackRefs(track) {
	var refs = [];
	for (var i = 0; i < track.getNumGroups(); i++) {
		refs.push(track.getGroupReference(i));
	}
	return refs;
}
function getNotes() {
	var selection = SV.getMainEditor().getSelection();
	var scope = SV.getMainEditor().getCurrentGroup();
	var group = scope.getTarget();
	if (selection.hasSelectedNotes()) { return selection.getSelectedNotes(); }
	var notes = [];
	for (var i = 0; i < group.getNumNotes(); i++) { notes.push(group.getNote(i)); }
	return notes;
}
function splitTrackAtPlayhead(track, playheadBlicks) {
	var clonetrack = track.clone();
	for (var i = clonetrack.getNumGroups() - 1; i >= 0; i--) {
		var cloneRef = clonetrack.getGroupReference(i);
		var origRef = track.getGroupReference(i);
		var cloneGroup = cloneRef.getTarget();
		if (cloneGroup.getNumNotes() === 0) { continue; }
		var firstOnset = cloneGroup.getNote(0).getOnset() + cloneRef.getTimeOffset();
		var lastEnd = cloneGroup.getNote(cloneGroup.getNumNotes() - 1).getEnd() + cloneRef.getTimeOffset();
		if (lastEnd <= playheadBlicks) { clonetrack.removeGroupReference(i); }
		else if (firstOnset >= playheadBlicks) { track.removeGroupReference(i); }
		else {
			var leftDuration = playheadBlicks - cloneRef.getTimeOffset();
			var rightOnset = playheadBlicks;
			var rightDuration = lastEnd - playheadBlicks;
			cloneRef.setTimeRange(rightOnset, rightDuration);
			origRef.setTimeRange(cloneRef.getTimeOffset(), leftDuration);
		}
	}
	SV.getProject().addTrack(clonetrack);
}
```

### copyParameter / copyNoteAttrs / copyNotesByOnset（跨轨复制音符+参数）
```javascript
function copyParameter(srcGroup, dstGroup, paramName, offsetDelta) {
	var srcParam = srcGroup.getParameter(paramName);
	var dstParam = dstGroup.getParameter(paramName);
	dstParam.removeAll();
	var points = srcParam.getAllPoints();
	for (var i = 0; i < points.length; i++) {
		dstParam.add(points[i][0] + offsetDelta, points[i][1]);
	}
}
function copyNoteAttrs(src, dst, N) {
	if (N.lyrics) { dst.setLyrics(src.getLyrics()); }
	if (N.phonemes) { dst.setPhonemes(src.getPhonemes()); }
	if (N.pitch) { dst.setPitch(src.getPitch()); }
	if (N.pitchtransition || N.vibrato || N.tNoteOffset || N.exprGroup || N.dur || N.alt) {
		var a = src.getAttributes();
		var attrs = {};
		if (N.pitchtransition) {
			attrs.tF0Offset = (a.tF0Offset !== undefined) ? a.tF0Offset : 0;
			attrs.tF0Left = (a.tF0Left !== undefined) ? a.tF0Left : 0.07;
			attrs.tF0Right = (a.tF0Right !== undefined) ? a.tF0Right : 0.07;
			attrs.dF0Left = (a.dF0Left !== undefined) ? a.dF0Left : 0.15;
			attrs.dF0Right = (a.dF0Right !== undefined) ? a.dF0Right : 0.15;
		}
		if (N.vibrato) {
			attrs.tF0VbrStart = (a.tF0VbrStart !== undefined) ? a.tF0VbrStart : 0.25;
			attrs.tF0VbrLeft = (a.tF0VbrLeft !== undefined) ? a.tF0VbrLeft : 0.2;
			attrs.tF0VbrRight = (a.tF0VbrRight !== undefined) ? a.tF0VbrRight : 0.2;
			attrs.dF0Vbr = (a.dF0Vbr !== undefined) ? a.dF0Vbr : 1;
			attrs.pF0Vbr = (a.pF0Vbr !== undefined) ? a.pF0Vbr : 0;
			attrs.fF0Vbr = (a.fF0Vbr !== undefined) ? a.fF0Vbr : 5.5;
		}
		if (N.tNoteOffset) { attrs.tNoteOffset = (a.tNoteOffset !== undefined) ? a.tNoteOffset : 0; }
		if (N.exprGroup && a.exprGroup !== undefined) { attrs.exprGroup = a.exprGroup; }
		if (N.dur && a.dur !== undefined) { attrs.dur = a.dur; }
		if (N.alt && a.alt !== undefined) { attrs.alt = a.alt; }
		dst.setAttributes(attrs);
	}
}
function copyNotesByOnset(srcGroup, srcOffset, dstGroup, dstOffset, N) {
	var i = 0, j = 0;
	while (i < srcGroup.getNumNotes() && j < dstGroup.getNumNotes()) {
		var o1 = srcGroup.getNote(i).getOnset() + srcOffset;
		var o2 = dstGroup.getNote(j).getOnset() + dstOffset;
		if (o1 > o2) { j++; }
		else if (o1 < o2) { i++; }
		else { copyNoteAttrs(srcGroup.getNote(i), dstGroup.getNote(j), N); i++; j++; }
	}
}
```

## 工程缩放

### scaleParameter / scaleNoteAttrs / scaleNote / scaleGroup / scaleProject（时间/音高整体缩放）
```javascript
function scaleParameter(group, paramName, beilv) {
	var p = group.getParameter(paramName);
	var pts = p.getAllPoints();
	p.removeAll();
	for (var i = 0; i < pts.length; i++) {
		p.add(pts[i][0] * beilv, pts[i][1]);
	}
}
function scaleNoteAttrs(note, beilv) {
	var a = note.getAttributes();
	var scaled = {};
	if (!isNaN(a.tF0Offset)) { scaled.tF0Offset = a.tF0Offset * beilv; }
	if (!isNaN(a.tF0Left)) { scaled.tF0Left = a.tF0Left * beilv; }
	if (!isNaN(a.tF0Right)) { scaled.tF0Right = a.tF0Right * beilv; }
	if (!isNaN(a.tF0VbrStart)) { scaled.tF0VbrStart = a.tF0VbrStart * beilv; }
	if (!isNaN(a.tF0VbrLeft)) { scaled.tF0VbrLeft = a.tF0VbrLeft * beilv; }
	if (!isNaN(a.tF0VbrRight)) { scaled.tF0VbrRight = a.tF0VbrRight * beilv; }
	if (!isNaN(a.tNoteOffset)) { scaled.tNoteOffset = a.tNoteOffset * beilv; }
	if (Object.keys(scaled).length > 0) { note.setAttributes(scaled); }
}
function scaleNote(note, beilv, isSV2) {
	note.setOnset(note.getOnset() * beilv);
	note.setDuration(note.getDuration() * beilv);
	if (!isSV2) { scaleNoteAttrs(note, beilv); }
}
function scaleGroup(group, beilv, isSV2) {
	if (beilv > 1) {
		for (var k = group.getNumNotes() - 1; k >= 0; k--) { scaleNote(group.getNote(k), beilv, isSV2); }
	} else {
		for (var k = 0; k < group.getNumNotes(); k++) { scaleNote(group.getNote(k), beilv, isSV2); }
	}
}
function scaleProject(proj, beilv, isSV2, paramNames, vmNames) {
	var allRefs = [];
	var seen = {};
	for (var j = 0; j < proj.getNumTracks(); j++) {
		var track = proj.getTrack(j);
		for (var g = 0; g < track.getNumGroups(); g++) {
			var ref = track.getGroupReference(g);
			var group = ref.getTarget();
			allRefs.push(ref);
			var uuid = group.getUUID();
			if (seen[uuid]) { continue; }
			seen[uuid] = true;
			scaleGroup(group, beilv, isSV2);
			for (var p = 0; p < paramNames.length; p++) { scaleParameter(group, paramNames[p], beilv); }
			for (var v = 0; v < vmNames.length; v++) {
				if (vmNames[v]) { scaleParameter(group, "vocalMode_" + capitalizeVocalMode(vmNames[v]), beilv); }
			}
		}
	}
	for (var r = 0; r < allRefs.length; r++) {
		allRefs[r].setTimeOffset(allRefs[r].getTimeOffset() * beilv);
	}
}
```

## 自动 BPM / 音区偏移 / 清拍号

### adjustBpmAtNote / applyToneShift / clearTimeSignatures
```javascript
// BPM：playheadBlicks = timeAxis.getBlickFromSeconds(playhead) - scope.getTimeOffset()，且 > note.getOnset()
function adjustBpmAtNote(note, scope, timeAxis, playheadBlicks) {
	var globalOnset = note.getOnset() + scope.getTimeOffset();
	var mark = timeAxis.getTempoMarkAt(globalOnset);
	if (!mark) { return; }
	var newBpm = mark.bpm * note.getDuration() / (playheadBlicks - note.getOnset());
	timeAxis.addTempoMark(globalOnset, newBpm);
}
// 音区偏移：dir=1 低音抬升(threshold=pitch+48)、-1 高音压低(+69)；ton = group.getParameter("toneShift")
function applyToneShift(selectedNotes, group, ton, threshold, dir) {
	for (var i = 0; i < selectedNotes.length; i++) {
		var note = selectedNotes[i];
		var inRange = (dir === 1) ? (note.getPitch() < threshold) : (note.getPitch() > threshold);
		if (!inRange) { continue; }
		var idx = note.getIndexInParent();
		var shift = (dir === 1) ? (threshold - note.getPitch()) * 100 : -(note.getPitch() - threshold) * 100;
		var hasFront = (idx > 0 && group.getNote(idx - 1).getEnd() === note.getOnset());
		var hasAfter = (idx < group.getNumNotes() - 1 && note.getEnd() === group.getNote(idx + 1).getOnset());
		if (!hasFront) { ton.add(note.getOnset(), 0); }
		ton.add(note.getOnset() + 1, shift);
		ton.add(note.getEnd() - 1, shift);
		if (!hasAfter) { ton.add(note.getEnd(), 0); }
	}
}
function clearTimeSignatures(timeAxis) {
	var marks = timeAxis.getAllMeasureMarks();
	for (var i = 1; i < marks.length; i++) {
		timeAxis.removeMeasureMark(timeAxis.getMeasureAt(marks[i].positionBlick));
	}
}
```

## 和声生成

### detectKey / shiftNoteInKey / createHarmonyGroup（按音程加音符）
```javascript
function detectKey(notes) {
	var k = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
	var kmin = 0;
	for (var i = 0; i < 12; i++) {
		for (var m = 0; m < notes.length; m++) {
			if (SV.blackKey(notes[m].getPitch() - i)) { k[i]++; }
		}
	}
	for (var i = 1; i < 12; i++) {
		if (k[i] < k[kmin]) { kmin = i; }
	}
	return kmin;
}
function shiftNoteInKey(note, targetSteps, direction, key) {
	var safety = 0;
	for (var j = 0; j < targetSteps; ) {
		note.setPitch(note.getPitch() + direction);
		if (SV.blackKey(note.getPitch() - key) === 0) { j++; }
		safety++;
		if (safety > 127) { break; }
	}
}
function createHarmonyGroup(selectednote, scope, name) {
	var Nscope = SV.create("NoteGroupReference");
	var Ngroup = SV.create("NoteGroup");
	Ngroup.setName(name);
	SV.getProject().addNoteGroup(Ngroup, 0);
	Nscope.setTarget(Ngroup);
	Nscope.setTimeOffset(scope.getTimeOffset());
	var clones = [];
	for (var n = 0; n < selectednote.length; n++) {
		var clone = selectednote[n].clone();
		Ngroup.addNote(clone);
		clones.push(clone);
	}
	SV.getMainEditor().getCurrentTrack().addGroupReference(Nscope);
	return clones;
}
```

## RGB 变色

### hexToRGB / rgbToHex / cycleTrackColor / cycleRgbTracks（轨道名 RGB 解析变色、选中轨道变色）
```javascript
function hexToRGB(hex) {
	var a = hex.length >= 8 ? hex.substring(0, 2) : "ff";
	var r = hex.length >= 8 ? hex.substring(2, 4) : hex.substring(0, 2);
	var g = hex.length >= 8 ? hex.substring(4, 6) : hex.substring(2, 4);
	var b = hex.length >= 8 ? hex.substring(6, 8) : hex.substring(4, 6);
	return {a: a, r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16)};
}
function rgbToHex(r, g, b, a) {
	var ah = a || "ff";
	var rh = Math.round(r).toString(16);
	var gh = Math.round(g).toString(16);
	var bh = Math.round(b).toString(16);
	return ah + (rh.length < 2 ? "0" : "") + rh + (gh.length < 2 ? "0" : "") + gh + (bh.length < 2 ? "0" : "") + bh;
}
function cycleTrackColor(track, colors) {
	var group = track.getGroupReference(0).getTarget();
	var i = parseInt(group.getName(), 10);
	if (isNaN(i)) { i = 0; }
	i++;
	if (i >= colors.length) { i = 0; }
	track.setDisplayColor(colors[i]);
	group.setName(String(i));
}
function cycleRgbTracks(colors) {
	var proj = SV.getProject();
	for (var j = 0; j < proj.getNumTracks(); j++) {
		var track = proj.getTrack(j);
		if (track.getName().toLowerCase().indexOf("rgb") !== -1) {
			cycleTrackColor(track, colors);
		}
	}
}
// 用 setInterval(50, RGB) 驱动；调色板为 ["ff00ffff","ff10ffe0",...,"ffff00ff"]（AARRGGBB，45 项）
```

## 水印读写

### setWatermarkSV2 / setWatermarkSV1（SV2 用工程级 ScriptData，SV1 用首个组名存储）
```javascript
function setWatermarkSV2(keyword, content) {
	SV.getProject().setScriptData(djb2Hash(keyword), content);
}
function setWatermarkSV1(content) {
	var g = SV.getProject().getTrack(0).getGroupReference(0).getTarget();
	if (g.getName() === "main") { g.setName(djb2Hash(content)); }
}
// SV2 读回用 SV.getProject().getScriptData(djb2Hash(keyword))；SV1 用组名与 "main" 比对判断是否可写
```

## 未完成操作检测

### pauseNearPageTurn（翻页到视图尾部且仍有未完成编辑时自动暂停）
```javascript
function pauseNearPageTurn() {
	var playback = SV.getPlayback();
	if (playback.getStatus() !== "playing") { return; }
	if (!SV.getMainEditor().getSelection().hasUnfinishedEdits()) { return; }
	var position = SV.getProject().getTimeAxis().getBlickFromSeconds(playback.getPlayhead());
	var viewRange = SV.getMainEditor().getNavigation().getTimeViewRange();
	if (position > viewRange[0] + 0.98 * (viewRange[1] - viewRange[0])) {
		playback.pause();
	}
}
// 用 setInterval(20, pauseNearPageTurn) 常驻检测
```
