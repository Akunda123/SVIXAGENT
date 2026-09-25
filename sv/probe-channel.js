/*
 * Probe Channel (JS) — 探测 SV 的 JS 脚本环境有没有「非剪贴板」通道
 * =====================================================================
 * 目的：判断「文件 IPC 桥」在 JS 绑定下是否可行。
 *   - 若 require / ActiveXObject / WScript 等存在 → 可保留 JS，只换传输层（最佳）
 *   - 若全部 undefined → JS 沙箱只能走剪贴板，要文件通道就得换 Lua
 *
 * 只读：不写任何文件、不动剪贴板、不改工程。结果用消息框弹出。
 * 用法：放进 SV scripts 目录 → 脚本菜单 → AKDAgent → Probe Channel → 运行。
 */
function getClientInfo() {
  return {
    "name": "Probe Channel (JS)",
    "category": "AKDAgent",
    "author": "AKDAgent",
    "versionNumber": 1,
    "minEditorVersion": 65540
  };
}

function main() {
  var out = [];
  var names = ["require", "module", "exports", "process", "global", "window",
               "ActiveXObject", "WScript", "XMLHttpRequest", "fetch",
               "console", "setTimeout", "Java", "Packages"];
  for (var i = 0; i < names.length; i++) {
    var v;
    try { v = typeof this[names[i]]; } catch (e) { v = "<throw>"; }
    out.push("  " + names[i] + " = " + v);
  }

  out.push("");
  out.push("[SV API]");
  out.push("  getHostClipboard    = " + (typeof SV.getHostClipboard));
  out.push("  setHostClipboard    = " + (typeof SV.setHostClipboard));
  out.push("  getHostInfo         = " + (typeof SV.getHostInfo));
  out.push("  showMessageBox      = " + (typeof SV.showMessageBox));

  try {
    var h = SV.getHostInfo();
    out.push("  hostName            = " + h.hostName);
    out.push("  hostVersion         = " + h.hostVersion);
    out.push("  osType              = " + h.osType);
  } catch (e) { out.push("  getHostInfo: " + e); }

  // 结论行：判定能否脱离剪贴板
  out.push("");
  var hasFs = (typeof this.require !== "undefined") || (typeof this.ActiveXObject !== "undefined") || (typeof this.WScript !== "undefined");
  out.push(hasFs ? "=> 有宿主对象：JS 可能可以走文件通道（保留 JS，只换传输层）"
                 : "=> 无宿主对象：JS 沙箱只能走剪贴板；文件通道需改用 Lua");

  SV.showMessageBox("Probe Channel (JS)", out.join("\n"));
}
