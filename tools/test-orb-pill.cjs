#!/usr/bin/env node
/**
 * 悬浮球三态指示灯的**纯逻辑**回归（2026-09-21）。
 *
 * computeBridgePill 定义在 electron/src/main.js 里 —— 那个文件 require 即启动 Electron，
 * 不能直接 require 来测。这里从源码里**抠出该函数原文**再 eval：
 * 测的是真源码（改了函数就会跟着变），又不启动 app。
 *
 * 用法：node tools/test-orb-pill.cjs   （输出全 ASCII，便于在 PowerShell 里看）
 */
const fs = require('node:fs')
const path = require('node:path')

const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'src', 'main.js'), 'utf8')
const start = src.indexOf('function computeBridgePill(')
if (start < 0) {
  console.log('[FAIL] computeBridgePill not found in electron/src/main.js')
  process.exit(1)
}
// 花括号配平取整段函数（函数体内字符串不含花括号，够用）
let depth = 0
let end = -1
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
}
if (end < 0) {
  console.log('[FAIL] computeBridgePill body is not balanced')
  process.exit(1)
}
const fnSrc = src.slice(start, end)
// eslint-disable-next-line no-new-func
const computeBridgePill = new Function('return (' + fnSrc + ')')()

const hb = (host, ageSec) => ({ host, fresh: ageSec !== null && ageSec <= 15, ageSec })
const noHb = (host) => ({ host, fresh: false, ageSec: null })

let failed = 0
let n = 0
function eq(name, got, want) {
  n++
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) { console.log('  [ok]   ' + name); return }
  failed++
  console.log('  [FAIL] ' + name + '\n         got  ' + g + '\n         want ' + w)
}

// host 没就绪 => 灰点
eq('host down -> down', computeBridgePill(false, hb('sv', 1), hb('ix', 1)),
  { level: 'down', code: 'orb.bridge.hostDown', args: [] })

// 单桥新鲜 => 绿点
eq('sv fresh -> ok', computeBridgePill(true, hb('sv', 3), noHb('ix')),
  { level: 'ok', code: 'orb.bridge.ok', args: ['SV', 3] })

// 只有 IX 新鲜 => 绿点、标签 IX
eq('ix only -> ok(IX)', computeBridgePill(true, noHb('sv'), hb('ix', 7)),
  { level: 'ok', code: 'orb.bridge.ok', args: ['IX', 7] })

// 两桥都新鲜 => 都列出来，age 取最小
eq('both fresh -> ok(SV|IX)', computeBridgePill(true, hb('sv', 12), hb('ix', 2)),
  { level: 'ok', code: 'orb.bridge.ok', args: ['SV ｜ IX', 2] })

// 心跳过期 => 黄点 + 可操作原因（带宿主 tag 与秒数）
eq('sv stale -> warn(stale)', computeBridgePill(true, hb('sv', 42), noHb('ix')),
  { level: 'warn', code: 'orb.bridge.stale', args: ['SV', 42] })

// 都过期 => 报"停得最晚"的那座（ageSec 最小）
eq('both stale -> nearest', computeBridgePill(true, hb('sv', 300), hb('ix', 40)),
  { level: 'warn', code: 'orb.bridge.stale', args: ['IX', 40] })

// 从没跑过桥脚本 => 黄点 + 安装指引
eq('no heartbeat -> warn(none)', computeBridgePill(true, noHb('sv'), noHb('ix')),
  { level: 'warn', code: 'orb.bridge.none', args: [] })

// 探针缺一个（异常兜底）也不能崩
eq('missing probe tolerated', computeBridgePill(true, hb('sv', 1), null),
  { level: 'ok', code: 'orb.bridge.ok', args: ['SV', 1] })

console.log(failed ? '\nFAILED: ' + failed + '/' + n : '\nOK: ' + n + '/' + n + ' passed')
process.exit(failed ? 1 : 0)
