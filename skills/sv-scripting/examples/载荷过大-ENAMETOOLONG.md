# 案例：载荷过大 → `spawn ENAMETOOLONG`（**剪贴板时代的形态**）

> 分类：桥/协议故障 ｜ 症状：工具报 `spawn ENAMETOOLONG`，op 根本没到宿主
> 📌 **2026-09-19 说明**：这个坑**发生在已退役的剪贴板通道上**（载荷经 PowerShell `-EncodedCommand` 走命令行，撞 ~32K 上限）。
> 现役**文件通道**不再有命令行上限，但**"别把展开后的音符塞进请求"这条纪律照旧成立** —— 桥端要 JSON 解析 + 逐音符建对象，而**响应体量护栏至今未实现**（见 `akdagent-protocol` §护栏）。桥内实现现叫 **`ALG.chordSegsToNotes`**（`sv/lua/AKDAgentBridge.lua` 的 `write_chords` op）。

## 问题

`sv_write_chords` 要把一首歌的和弦写成音符，MCP 侧展开出 **198 个音符**，一次性塞进 `executeOp("write_chords", {notes:[...198个...]})`。

结果：`{"ok":false,"error":"spawn ENAMETOOLONG"}` —— 桥完全没收到请求。

## 诊断

载荷经**双重 base64 膨胀**：

```
payload(单行 JSON)      15,610 字符
→ UTF-16LE base64       41,628 字符
→ 内嵌进 PS script      41,753 字符
→ -EncodedCommand base64 111,344 字符   ← Windows 命令行上限 ~32,767
```

**当年（剪贴板时代）`server/src/clipboard.ts` 的写入路径**（该文件与整个剪贴板通道**均已删除**）是 `execFile(PS, [...PS_OPTS, "-EncodedCommand", encodeCommand(script)])`：
script 里内嵌 `$b64='<payload的base64>'`，而 script 自己**又**被 `encodeCommand` 转一次 base64。
结果是"base64 的 base64"，膨胀约 **7 倍**。

**判定方法**：数 payload 长度 × 7 是否超 32K。音符数组是最容易超的（每个音符 ≈ 50 字符 JSON）。

## 怎么改

把**展开/生成逻辑移到桥端**，MCP 只传**短指令**：

```javascript
// ❌ 改前：MCP 展开好 198 个音符再传
executeOp("write_chords", { notes: notePayload /* 198 个对象 */ });

// ✅ 改后：只传 57 条和弦（每条约 15 字符），桥端自己展开成音符
executeOp("write_chords", {
  chordSegs: [{ name:"Dm7", startBlick:…, durationBlick:… }, …],  // 57 条
  pattern: "block",
  octaveShift: -12,
});
```

桥端（现役 = Lua 桥 `write_chords` op 里的 `ALG.chordSegsToNotes`；下例是**当年 JS 桥**的写法）新增 `chordSegs` 分支，在宿主内展开：

```javascript
if (args.chordSegs && args.chordSegs.length) {
  notesIn = svhChordSegsToNotes(args.chordSegs, pattern, octaveShift);  // 宿主内展开（JS 桥时代函数名）
} else if (args.notes) {
  notesIn = args.notes;   // 兼容旧路径
}
```

## 改后效果

- payload 从 15.6KB → **约 1KB**（57 条 × ~15 字符），`EncodedCommand` 降到 ~7KB，**远低于 32K 上限**。
- 198 音符正确写入宿主（`noteCount:198`）。

## 可复用判断标准

1. **传给桥的载荷（JSON 字符串长度）超过约 3000 字符就要警惕**（×7 ≈ 21K，接近上限）。
2. **"批量生成"类操作优先在桥端展开**——MCP 传**种子/配方**（和弦名、pattern、参数），桥端算音符。
3. 真正的大数据（几十万音符）不要走剪贴板协议，应**直接写 `.svp`/`.ixp` 文件**（磁盘 JSON）。
4. 遇到 `ENAMETOOLONG` 先算 payload 长度，不要怀疑宿主或桥的语法。
