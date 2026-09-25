// 用音高线写汉字：大 / 市 / 唱  —— 采用标定后的竖线规则
//   真竖线：40 点，总水平漂移 = 1 画布单位（每步 ≈506,585 blick ≈ 4.6 px）
//   其他笔画：横/撇/捺自带大 x 跨度；横折的竖段只需 +1 blick 保证严格递增
var ref = SV.getMainEditor().getCurrentGroup();
var g = ref.getTarget();
SV.getProject().newUndoRecord();

var wiped = g.getNumPitchControls();
for (var i = g.getNumPitchControls() - 1; i >= 0; i--) g.removePitchControl(i);

// ---------- 画布 ----------
var t0 = g.getNote(0).getOnset();
var H = 14;                       // 字高 14 半音
var basePitch = 56;
var q100 = H * 0.2;               // 100 单位 ≈ 2.8 拍（方形标定）
var bpUnit = q100 / 100 * SV.QUARTER;   // 1 画布单位 = 19,756,800 blick
var STEP = 6000000;
var DRIFT_UNIT = 1;               // ★ 真竖线总漂移（画布单位）= 标定值
var NP = 40;                      // ★ 真竖线点数
var stepV = Math.max(1, Math.round(DRIFT_UNIT * bpUnit / (NP - 1)));   // 每步 blick

// ---------- 字形骨架（y: 0 在下, 100 在上）----------
var G = {
  // 大：3 画，无竖线（对照组）
  DA: [
    [[16,72],[84,72]],                      // 横
    [[50,98],[14,0]],                       // 撇
    [[50,98],[90,0]]                        // 捺
  ],
  // 市：5 画 = 亠(点·横) + 巾(左竖·横折钩·中竖)
  SHI: [
    [[50,100],[50,88]],                     // 亠 点 → 写短竖   ★
    [[18,84],[82,84]],                      // 横
    [[34,78],[34,6]],                       // 巾 左竖         ★
    [[30,78],[70,78],[70,6]],               // 巾 横折钩（上横 + 右竖）
    [[52,78],[52,6]]                        // 巾 中竖         ★
  ],
  // 唱：11 画 = 口(3) + 上日(4) + 下日(4)
  CHANG: [
    [[8,78],[8,50]],                        // 口 左竖         ★
    [[8,78],[38,78],[38,50]],               // 口 横折
    [[8,50],[38,50]],                       // 口 底横
    [[48,98],[48,58]],                      // 上日 左竖       ★
    [[48,98],[94,98],[94,58]],              // 上日 横折
    [[48,78],[94,78]],                      // 上日 中横
    [[48,58],[94,58]],                      // 上日 底横
    [[48,50],[48,4]],                       // 下日 左竖       ★
    [[48,50],[94,50],[94,4]],               // 下日 横折
    [[48,30],[94,30]],                      // 下日 中横
    [[48,4],[94,4]]                         // 下日 底横
  ]
};

var LAYOUT = [
  { g: "DA",    ox: 0   },
  { g: "SHI",   ox: 110 },
  { g: "CHANG", ox: 220 }
];

// ---------- 工具 ----------
function isVertical(pts) {
  for (var i = 1; i < pts.length; i++) if (pts[i][0] !== pts[0][0]) return false;
  return true;
}
function densify(pts, n) {
  var out = [];
  for (var i = 0; i + 1 < pts.length; i++) {
    for (var k = 0; k < n; k++) {
      var t = k / n;
      out.push([pts[i][0] + (pts[i+1][0] - pts[i][0]) * t,
                pts[i][1] + (pts[i+1][1] - pts[i][1]) * t]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function splitMonotonic(pts, step) {
  if (pts.length < 2) return [];
  var runs = [], start = 0, dir = 0;
  for (var i = 1; i < pts.length; i++) {
    var d = pts[i][0] - pts[i-1][0];
    var nd = d > 0 ? 1 : (d < 0 ? -1 : 0);
    if (nd === 0) continue;
    if (dir === 0) { dir = nd; continue; }
    if (nd !== dir) { runs.push([start, i-1]); start = i-1; dir = nd; }
  }
  runs.push([start, pts.length - 1]);
  var out = [];
  for (var r = 0; r < runs.length; r++) {
    var seg = pts.slice(runs[r][0], runs[r][1] + 1);
    if (seg.length < 2) continue;
    if (seg[0][0] > seg[seg.length-1][0]) seg.reverse();
    var res = [seg[0]];
    for (var k = 1; k < seg.length; k++) {
      var lx = res[res.length-1][0], nx = seg[k][0];
      if (nx <= lx) nx = lx + step;
      res.push([nx, seg[k][1]]);
    }
    if (res.length >= 2) out.push(res);
  }
  return out;
}
function resampleByX(pts) {
  var out = [], n = pts.length;
  if (n < 2) return pts;
  for (var i = 0; i + 1 < n; i++) {
    var x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i+1][0], y1 = pts[i+1][1];
    var dx = x1 - x0;
    if (dx <= 0) { out.push([x1, y1]); continue; }
    var cnt = Math.max(1, Math.round(dx / STEP));
    for (var k = 0; k < cnt; k++) {
      var t = k / cnt;
      out.push([Math.round(x0 + dx * t), y0 + (y1 - y0) * t]);
    }
  }
  out.push([pts[n-1][0], pts[n-1][1]]);
  return out;
}

// ---------- 生成 ----------
var made = 0, totalPts = 0, rep = [], nV = 0, driftGot = 0;
for (var li = 0; li < LAYOUT.length; li++) {
  var it = LAYOUT[li], strokes = G[it.g], nC = 0, vHere = 0, oxb = it.ox * bpUnit;
  for (var s = 0; s < strokes.length; s++) {
    var st = strokes[s], vert = isVertical(st);
    var raw = vert ? densify(st, NP - 1) : densify(st, 6);
    var mapped = [];
    for (var p = 0; p < raw.length; p++) {
      mapped.push([Math.round(raw[p][0] * bpUnit + oxb),
                   basePitch + raw[p][1] / 100 * H]);
    }
    var pieces = splitMonotonic(mapped, vert ? stepV : 1);
    if (vert) { vHere++; nV++; }
    if (vert && pieces.length === 1) {
      driftGot = pieces[0][pieces[0].length-1][0] - pieces[0][0][0];
    }
    nC += pieces.length;
    for (var q = 0; q < pieces.length; q++) {
      var rs = resampleByX(pieces[q]);
      if (rs.length < 2) continue;
      var po = [];
      for (var z = 0; z < rs.length; z++) {
        po.push([rs[z][0] - rs[0][0], Math.round((rs[z][1] - basePitch) * 1000) / 1000]);
      }
      var cv = SV.create("PitchControlCurve");
      cv.setPosition(t0 + rs[0][0]);
      cv.setPitch(basePitch);
      cv.setPoints(po);
      g.addPitchControl(cv);
      made++; totalPts += po.length;
    }
  }
  rep.push(it.g + " 笔画" + strokes.length + "→曲线" + nC + "（真竖线" + vHere + "）");
}

return { wiped: wiped, curvesMade: made, totalPoints: totalPts,
  curvesInGroup: g.getNumPitchControls(),
  driftUnitPerVertical: DRIFT_UNIT,
  stepBlick: stepV,
  verticalPoints: NP,
  trueVerticalCount: nV,
  gotDriftBlick: driftGot,
  gotDriftPx: Math.round(driftGot / bpUnit * 4.6 * 10) / 10,
  t0Quarter: t0 / SV.QUARTER,
  spanQuarter: Math.round(330 * bpUnit / SV.QUARTER * 100) / 100,
  pitchRange: [basePitch, basePitch + H], detail: rep };
