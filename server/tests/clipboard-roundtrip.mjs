/**
 * 剪贴板模块往返测试（无需 SV）：set 一段文本 → get 读回 → 比对。
 * 用法: node tests/clipboard-roundtrip.mjs
 */

import { setClipboardText, getClipboardText } from "../dist/clipboard.js";

const payload = 'SVCMD:{"v":1,"id":"roundtrip-test","op":"ping","args":{}}';

try {
  await setClipboardText(payload);
  const back = await getClipboardText();
  if (back === payload) {
    console.log("clipboard roundtrip OK ✔");
  } else {
    console.error("MISMATCH:\n  sent:    " + payload + "\n  received: " + back);
    process.exit(1);
  }
} catch (e) {
  console.error("clipboard roundtrip FAILED:", e.message);
  process.exit(1);
}
