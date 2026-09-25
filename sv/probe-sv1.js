/*
 * Probe SV1 — SV1 通道与环境探测（只读，不改工程）
 * ================================================================
 * 目的（一屏看完）：
 *   A. 宿主身份与版本号（含 hostVersionNumber 的十六进制，便于对照能力闸门）
 *   B. 剪贴板通道是否在（剪贴板桥的硬前提：SV.getHostClipboard / setHostClipboard）
 *   C. 有没有「非剪贴板」通道（require / ActiveXObject / WScript …）→ 决定能否做文件 IPC
 *   D. SV1 / SV2 能力互斥的现场验证（PitchControlCurve / detune / 音素 …）
 *   E. 一次只读实测：轨道数 / 组数 / 音符数 / getAttributes() 键列表
 *
 * 安全：全程只读。不写工程、不写剪贴板、不动选区、不弹写入确认。
 * 兼容：ES5.1 写法（无 let/const/箭头/模板串），SV1 与 SV2 均可直接运行。
 * 用法：放进 SV scripts 目录 → 脚本菜单 → Agent → Probe SV1 → 运行。
 */
function getClientInfo() {
  return {
    "name": "Probe SV1",
    "category": "Agent",
    "author": "AKDAgent",
    "versionNumber": 1,
    "minEditorVersion": 65540
  };
}

/* typeof 探测：对被探测的名字用 eval 包一层，未声明也只会返回 "undefined" */
function pType(name) {
  try { return eval("typeof " + name); } catch (e) { return "<err>"; }
}

function main() {
  var L = [];
  function add(s) { L.push(s); }

  /* ---------- A. 宿主 ---------- */
  add("===== A. 宿主 =====");
  try {
    var h = SV.getHostInfo();
    add("hostName          = " + h.hostName);
    add("hostVersion       = " + h.hostVersion);
    add("hostVersionNumber = " + h.hostVersionNumber + "  (0x" + h.hostVersionNumber.toString(16) + ")");
    add("osType / language = " + h.osType + " / " + h.languageCode);
  } catch (e) {
    add("getHostInfo 失败: " + (e && e.message ? e.message : e));
  }

  /* ---------- B. 剪贴板通道（桥的前提）---------- */
  add("");
  add("===== B. 剪贴板通道（剪贴板桥的硬前提）=====");
  add("SV.getHostClipboard = " + pType("SV.getHostClipboard"));
  add("SV.setHostClipboard = " + pType("SV.setHostClipboard"));
  add(pType("SV.getHostClipboard") === "function" && pType("SV.setHostClipboard") === "function"
      ? "=> 桥可以在这台宿主上跑起来" : "=> 缺剪贴板 API，剪贴板桥无法启动");

  /* ---------- C. 非剪贴板通道 ---------- */
  add("");
  add("===== C. 有没有「非剪贴板」通道 =====");
  var names = ["require", "module", "exports", "process", "global", "window",
               "ActiveXObject", "WScript", "XMLHttpRequest", "fetch",
               "Java", "Packages", "console", "setTimeout"];
  var fsOK = false;
  for (var i = 0; i < names.length; i++) {
    var v = pType(names[i]);
    if (names[i] === "require" || names[i] === "ActiveXObject" || names[i] === "WScript") {
      if (v !== "undefined" && v !== "<err>") fsOK = true;
    }
    add("  " + names[i] + " = " + v);
  }
  add(fsOK ? "=> 有宿主对象：JS 可能可以走文件通道"
           : "=> 全部 undefined：JS 沙箱只能走剪贴板（文件 IPC 需换 Lua）");

  /* ---------- D. 能力互斥现场验证 ---------- */
  add("");
  add("===== D. SV1 / SV2 能力互斥 =====");
  add("  SV.create                 = " + pType("SV.create"));
  add("  SV.refreshSidePanel       = " + pType("SV.refreshSidePanel") + "   [SV2 2.1.2+]");
  add("  SV.getComputedPitchForGroup = " + pType("SV.getComputedPitchForGroup") + "   [SV2 2.1.1+]");
  add("  SV.getComputedAttributesForGroup = " + pType("SV.getComputedAttributesForGroup") + "   [SV2 2.1.1+]");
  add("  SV.print                  = " + pType("SV.print") + "   [SV2 2.1.1+]");
  /* ⚠️ 故意【不】实调 SV.create("PitchControlCurve")：
     音高控制线（PitchControlCurve）是 SV2 专有 API，SV1 没有这个类型。
     本探测只做 typeof 判定，绝不实例化 SV2 才有的类型（用户 2026-09-11 指出）。 */
  add("  已跳过: SV.create('PitchControlCurve') —— SV1 无此 API，不做 SV2 专有调用");
  try {
    var p0 = SV.getProject();
    add("  project.newUndoRecord     = " + (typeof p0.newUndoRecord));
    add("  project.getNumTracks      = " + (typeof p0.getNumTracks));
  } catch (e) { add("  project 探测失败"); }

  /* ---------- E. 只读实测 ---------- */
  add("");
  add("===== E. 只读实测（不改工程）=====");
  try {
    var p = SV.getProject();
    add("  轨道数 = " + p.getNumTracks());
    if (p.getNumTracks() > 0) {
      var tr = p.getTrack(0);
      add("  轨0: getNumGroups = " + (typeof tr.getNumGroups));
      var ng = tr.getNumGroups();
      add("  轨0 组数 = " + ng);
      if (ng > 0) {
        var gr = tr.getGroupReference(0);
        var g = gr.getTarget();
        add("  组0 名称 = " + (typeof g.getName === "function" ? g.getName() : "(无 getName)"));
        var nn = g.getNumNotes();
        add("  组0 音符数 = " + nn);
        if (nn > 0) {
          var n = g.getNote(0);
          add("  音符0: lyrics=" + n.getLyrics() + "  pitch=" + n.getPitch() + "  onset=" + n.getOnset() + "  dur=" + n.getDuration());
          var a = n.getAttributes();
          var keys = [];
          for (var k in a) { if (a.hasOwnProperty(k)) keys.push(k); }
          add("  getAttributes() 键 (" + keys.length + " 个):");
          add("    " + keys.join(", "));
        }
      }
    }
  } catch (e) {
    add("  实测失败: " + (e && e.message ? e.message : e));
  }

  /* ---------- F. SV1 专有面 / SV2 缺口（不依赖工程里有音符）----------
     说明：工程为空时 E 段拿不到音符。这里用 SV.create("Note") 造一个【游离对象】
     （不 addNote、不进任何 Group）来读它自己的属性键 —— 对工程零改动。
     注意：只对 SV1 也有的类型这么做；SV2 专有类型（如 PitchControlCurve）一律不实调。 */
  add("");
  add("===== F. SV1 专有面 / SV2 缺口 =====");

  var gRef2 = null;
  try {
    var p2 = SV.getProject();
    if (p2.getNumTracks() > 0) {
      var tr2 = p2.getTrack(0);
      if (tr2.getNumGroups() > 0) { gRef2 = tr2.getGroupReference(0); }
    }
  } catch (e) { }

  if (gRef2) {
    var tg = gRef2.getTarget();
    add("  [桥的能力判据 canCurve —— SV1 应为 undefined]");
    add("    group.getNumPitchControls = " + (typeof tg.getNumPitchControls) + "   [SV2 2.1.0+]");
    add("    group.addPitchControl     = " + (typeof tg.addPitchControl) + "   [SV2 2.1.0+]");
    add("    group.getPitchControl     = " + (typeof tg.getPitchControl) + "   [SV2 2.1.0+]");
    add("  [引用层 getVoice —— SV1 预期返回空对象]");
    try {
      add("    groupRef.getVoice = " + (typeof gRef2.getVoice));
      var vv = gRef2.getVoice();
      var vk = [];
      for (var k3 in vv) { if (vv.hasOwnProperty(k3)) vk.push(k3); }
      add("    getVoice() 键 (" + vk.length + " 个): " + (vk.length ? vk.join(", ") : "(空对象)"));
    } catch (e) { add("    getVoice 探测失败: " + (e && e.message ? e.message : e)); }
    try {
      add("    track.getMixer = " + (typeof SV.getProject().getTrack(0).getMixer) + "   [SV2 2.1.1+]");
      add("    groupRef.isMuted = " + (typeof gRef2.isMuted) + "   [SV2 2.1.1+]");
    } catch (e) { }
  } else {
    add("  (工程里没有 Group，跳过 group 侧探测)");
  }

  add("  [游离 Note 对象 —— 不加入工程]");
  try {
    var nNew = SV.create("Note");
    add("    SV.create('Note') = " + (nNew ? "OK（SV1 支持）" : "null"));
    if (nNew) {
      add("    note.getDetune / setDetune = " + (typeof nNew.getDetune) + " / " + (typeof nNew.setDetune) + "   [SV2 2.1.1+]");
      add("    note.getRetakeList         = " + (typeof nNew.getRetakeList) + "   [SV2 2.1.1+]");
      add("    note.getPhonemes           = " + (typeof nNew.getPhonemes));
      var a2 = nNew.getAttributes();
      var ks = [];
      for (var k2 in a2) { if (a2.hasOwnProperty(k2)) ks.push(k2); }
      add("    getAttributes() 键 (" + ks.length + " 个):");
      add("      " + ks.join(", "));
    }
  } catch (e) {
    add("    SV.create('Note') 失败: " + (e && e.message ? e.message : e));
  }

  SV.showMessageBox("Probe SV1", L.join("\n"));
}
