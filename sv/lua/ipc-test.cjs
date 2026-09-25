#!/usr/bin/env node
/*
 * AKDAgent Lua 文件通道 — 客户端测试器（Node CLI）
 * =====================================================================
 * 用途：在 MCP server / Electron 接入之前，先用命令行把文件通道跑通。
 *       桥在 SV 里运行后，本工具即可发请求、收响应、看心跳与日志。
 *
 * 用法：
 *   node ipc-test.cjs ping
 *   node ipc-test.cjs selftest
 *   node ipc-test.cjs get_project_info
 *   node ipc-test.cjs run_script '{"readonly":true,"code":"return 1+1"}'
 *   node ipc-test.cjs hb                 # 只看心跳
 *   node ipc-test.cjs log [n]            # 打印桥日志最后 n 行（默认 40）
 *   node ipc-test.cjs raw '{"op":"ping"}'  # 原样发一个请求体
 *   [--host ix] [--timeout 8000] [--dir <path>]
 *
 * 通道（与 AKDAgentBridge.lua 严格一致）：
 *   <dir>/akdagent-req-<host>.json   客户端 → 桥（Node 原子 rename 写入）
 *   <dir>/akdagent-res-<host>.json   桥 → 客户端
 *   <dir>/akdagent-hb-<host>.json    桥心跳
 *   <dir>/akdagent-log-<host>.txt    桥日志
 *   <dir>/akdagent-boot-<host>.json  桥启动结果
 * dir 解析顺序：① %USERPROFILE%\AKDAgent\ipc（存在才用）② tmpdir()
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- 参数 ----------
const argv = process.argv.slice(2);
let seqCounter = 0;      // 见下面 seq 生成处的说明（尺度要与 fileipc.ts 一致）
function flag(name, def) {
  const i = argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}
const host = flag('host', 'sv');
const timeoutMs = Number(flag('timeout', 8000));
const dirOverride = flag('dir', null);

const cmd = argv[0] || 'ping';
const argRaw = argv[1];

// ---------- 目录解析（与 Lua 侧同序） ----------
const candidates = [];
if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, 'AKDAgent', 'ipc'));
candidates.push(os.tmpdir());

function pickDir() {
  if (dirOverride) return dirOverride;
  for (const d of candidates) {
    try {
      fs.accessSync(d, fs.constants.W_OK);
      return d;
    } catch (_) { /* 不存在或不可写 → 下一个 */ }
  }
  return os.tmpdir();
}
const DIR = pickDir();
const P = (kind) => path.join(DIR, `akdagent-${kind}-${host}.json`);
const PLOG = path.join(DIR, `akdagent-log-${host}.txt`);
const PBOOT = path.join(DIR, `akdagent-boot-${host}.json`);

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };
const writeAtomic = (p, text) => {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);   // Windows 上 Node 用 MoveFileEx(REPLACE_EXISTING)，可覆盖
};

// ---------- 子命令 ----------
if (cmd === 'hb') {
  const hb = readJson(P('hb'));
  if (!hb) {
    console.log(`❌ 没有心跳文件：${P('hb')}`);
    console.log(`   候选目录：\n     - ${candidates.join('\n     - ')}`);
    process.exit(1);
  }
  console.log('心跳：', JSON.stringify(hb, null, 2));
  const age = hb.ts ? (Math.floor(Date.now() / 1000) - hb.ts) : null;
  console.log(`\n最后心跳：${age} 秒前 ${age !== null && age < 15 ? '✅ 桥在线' : '⚠️ 可能已停止'}`);
  const boot = readJson(PBOOT);
  if (boot) console.log('启动记录：', JSON.stringify(boot));
  process.exit(age !== null && age < 15 ? 0 : 2);
}

if (cmd === 'log') {
  const n = Number(argv[1] || 40);
  if (!fs.existsSync(PLOG)) { console.log(`❌ 无日志：${PLOG}`); process.exit(1); }
  const lines = fs.readFileSync(PLOG, 'utf8').split('\n');
  console.log(lines.slice(-n - 1).join('\n'));
  process.exit(0);
}

// ---------- 发请求 ----------
let args = {};
let op = cmd;
if (cmd === 'raw') {
  // 支持 @file：把 JSON 体写进文件再传路径，绕开 PowerShell 吃引号的问题（与下面的 args 同款约定）
  // ⚠️ 去掉 BOM：Windows PowerShell 的 Set-Content -Encoding UTF8 会写入 BOM，
  //    直接 JSON.parse 会报 "Unexpected token '\ufeff'"（踩过）。
  const readJsonText = (p) => {
    const s = fs.readFileSync(p, 'utf8');
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  };
  const bodyText = (argRaw && argRaw.startsWith('@'))
    ? readJsonText(argRaw.slice(1))
    : (argRaw || '{}');
  const body = JSON.parse(bodyText);
  op = body.op;
  args = body.args || {};
} else if (argRaw && argRaw.startsWith('@')) {
  // 从文件读参数 —— 绕开 PowerShell 吃掉 JSON 引号的问题
  const s = fs.readFileSync(argRaw.slice(1), 'utf8');
  args = JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
} else if (argRaw) {
  args = JSON.parse(argRaw);
}

// ⚠️ seq 的**尺度**要与 server/src/fileipc.ts 一致（Date.now()*1000 + 计数）：
//    桥历史上按"seq 必须大于 lastSeq"去重，两个客户端尺度不同（*1000 vs 不乘）
//    会让先发大 seq 的那个把另一个**永久挤死**（实测踩到）。桥已改成按 id 去重，
//    这里再对齐一次尺度，避免将来又有人按 seq 大小做判断。
const seq = Date.now() * 1000 + (seqCounter = (seqCounter + 1) % 1000);
const id = `cli-${seq}`;
const req = { v: 1, seq, id, op, args };

// 先看桥在不在（心跳）
const hb = readJson(P('hb'));
if (!hb) {
  const boot = readJson(PBOOT);
  console.log(`⚠️ 没有心跳文件 —— 桥可能没在运行。`);
  console.log(`   目录: ${DIR}`);
  if (boot) console.log(`   启动记录: ${JSON.stringify(boot)}`);
  console.log(`   请确认：SV 里 脚本菜单 → Agent → AKDAgent Bridge (Lua) 已运行。\n`);
} else if (hb.ts && Math.floor(Date.now() / 1000) - hb.ts > 15) {
  console.log(`⚠️ 心跳已过期 ${Math.floor(Date.now() / 1000) - hb.ts} 秒 —— 桥可能已停止。\n`);
}

if (op !== 'ping' && hb && hb.ops) {
  if (!hb.ops.includes(op)) {
    console.log(`⚠️ 桥报告它没有 op '${op}'。可用：${hb.ops.join(', ')}\n`);
  }
}

// 清掉旧响应，避免读到上一次的
try { fs.unlinkSync(P('res')); } catch (_) {}

writeAtomic(P('req'), JSON.stringify(req));
console.log(`→ ${op}  seq=${seq}  dir=${DIR}`);

const t0 = Date.now();
let res = null;
while (Date.now() - t0 < timeoutMs) {
  const r = readJson(P('res'));
  if (r && r.seq === seq) { res = r; break; }
  // 忙等（这是 CLI 工具，不需要优雅）
  const until = Date.now() + 60;
  while (Date.now() < until) { /* spin */ }
}

if (!res) {
  console.log(`\n❌ ${timeoutMs}ms 内没等到响应（seq=${seq}）`);
  const boot = readJson(PBOOT);
  if (boot) console.log('   启动记录: ' + JSON.stringify(boot));
  if (fs.existsSync(PLOG)) {
    console.log('   桥日志尾部:');
    console.log(fs.readFileSync(PLOG, 'utf8').split('\n').slice(-15).join('\n'));
  }
  process.exit(1);
}

console.log(`← ${Date.now() - t0}ms  ok=${res.ok}`);
if (res.ok) {
  console.log(JSON.stringify(res.result, null, 2));
} else {
  console.log('ERROR: ' + res.error);
  process.exit(3);
}
