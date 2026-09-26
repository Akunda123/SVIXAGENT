#!/usr/bin/env node
/**
 * 守卫：MCP server **不许** 静态 import ONNX 相关模块（2026-09-26 立）
 *
 * 起因（用户机事故链）：`server/src/tools.ts` 原本静态 `import { extractNotes } from "./audio/note-extract.js"`，
 * 而 note-extract **静态** `import * as ort from "onnxruntime-node"` ⇒ onnxruntime 的原生绑定
 * （`*_binding.node`）在用户机上加载失败时（最常见：缺 Microsoft Visual C++ 运行库；也见过杀软拦），
 * **整颗 MCP server exit 1**，44 个工具一起没。
 * 实测（把 binding 移开再跑）：
 *   · 改前：`Error: Cannot find module '…/onnxruntime_binding.node'` + 退出码 1（连 ready 都打不出）
 *   · 改后：server 正常起、`tools/list` = 44，只有 `sv_extract_notes` 一个工具报错
 *
 * 本守卫盯：
 *   ① `server/src/tools.ts` 不得出现指向 note-extract 的**静态** import（应为运行时 `await import(...)`）；
 *   ② 编译产物 `server/dist/tools.js` 顶部不得有 note-extract 的 static import；
 *   ③ `server/src/index.ts` 的启动横幅必须**默认静音**（`AKDAGENT_MCP_VERBOSE=1` 才打）——
 *      否则客户端会把 host 的 stderr 记成 `ERROR [dsh:err] …`，用户以为出故障（2026-09-26 实际发生过）。
 *
 * 用法：node tools/check-mcp-lazy-onnx.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);
const info = (m) => console.log('  [i]    ' + m);

const STATIC_IMPORT_RE = /^\s*import\s[^;]*from\s*["'][^"']*note-extract[^"']*["']/m;

console.log('== ① server/src/tools.ts：note-extract 必须懒加载 ==');
{
  const p = path.join(ROOT, 'server', 'src', 'tools.ts');
  if (!fs.existsSync(p)) fail('找不到 server/src/tools.ts');
  else {
    const t = fs.readFileSync(p, 'utf8');
    if (STATIC_IMPORT_RE.test(t)) {
      fail('tools.ts 里仍有指向 note-extract 的静态 import —— onnx 一缺，整颗 server 就起不来');
    } else {
      ok('没有静态 import note-extract');
    }
    if (/await import\(\s*["'][^"']*note-extract[^"']*["']\s*\)/.test(t)) {
      ok('sv_extract_notes 走运行时 await import(...)');
    } else {
      fail('没找到对 note-extract 的 `await import(...)`（是不是把调用删了？）');
    }
  }
}

console.log('\n== ② 编译产物 server/dist/tools.js 顶部不得有 note-extract 静态 import ==');
{
  const p = path.join(ROOT, 'server', 'dist', 'tools.js');
  if (!fs.existsSync(p)) info('还没构建（server/dist/tools.js 不存在）—— 跳过');
  else {
    const head = fs.readFileSync(p, 'utf8').split(/\r?\n/).slice(0, 40).join('\n');
    if (STATIC_IMPORT_RE.test(head)) fail('dist/tools.js 顶部仍有 note-extract 静态 import（重建一下：cd server && npm run build）');
    else ok('产物顶部没有 note-extract 静态 import');
  }
}

console.log('\n== ③ 启动横幅默认静音（只有 AKDAGENT_MCP_VERBOSE=1 才写 stderr）==');
{
  const p = path.join(ROOT, 'server', 'src', 'index.ts');
  if (!fs.existsSync(p)) fail('找不到 server/src/index.ts');
  else {
    const t = fs.readFileSync(p, 'utf8');
    if (/AKDAGENT_MCP_VERBOSE/.test(t)) ok('横幅受 AKDAGENT_MCP_VERBOSE 控制');
    else fail('index.ts 里没看到 AKDAGENT_MCP_VERBOSE —— 横幅会默认打到 stderr，被客户端记成 ERROR');
    if (/log\(["']server ready/.test(t)) ok('仍保留 ready 这行（默认静音）');
  }
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格`); process.exit(1); }
console.log('✓ MCP lazy-onnx / 横幅守卫通过');
