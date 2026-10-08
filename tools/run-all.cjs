#!/usr/bin/env node
/**
 * run-all.cjs —— 一键跑批（**给"全绿"这个信号做的**）· 2026-10-08 立
 *
 * 起因（两件真事）：
 *   ① 我自己的跑批命令是 `node $f *> $null` ⇒ **失败时输出被吞掉**，只留一个文件名。
 *      那天 `test-stt-transport.cjs` 偶发挂了一次，我**拿不到原因**，只能靠单独压 10 遍去猜。
 *   ② "允许失败"一直是**口头基线**（"2 个 check + 1 个 test 是已知的"）⇒ 新人/未来的我
 *      无法用机器判断"这次到底有没有新问题"，真回归会淹在已知失败里。
 *   ⇒ 这个脚本把两件事**写进代码**：失败打输出尾部；允许失败 = **带条件的白名单**（不是无条件放行）。
 *
 * 用法：
 *   node tools/run-all.cjs                     # 全部（check + test）
 *   node tools/run-all.cjs --group check       # 只跑 tools/check-*.cjs
 *   node tools/run-all.cjs --group test        # 只跑 tools/test-*.cjs
 *   node tools/run-all.cjs --group client      # 客户端六套（慢，需 electron）
 *   node tools/run-all.cjs --group all         # check + test + client
 *   node tools/run-all.cjs --only stt          # 只跑名字里含 stt 的项
 *   node tools/run-all.cjs --verbose           # 全过也输出尾部
 *   node tools/run-all.cjs --list              # 只列清单不跑
 *
 * 退出码：0 = 没有意料之外的失败；1 = 有（**SKIP 不算失败**，但会在汇总里点名）。
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const TOOLS = path.join(ROOT, 'tools')
const ELECTRON = path.join(ROOT, 'electron')

const argv = process.argv.slice(2)
const has = (n) => argv.includes(n)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const GROUP = opt('--group', 'default')          // default | check | test | client | all
const ONLY = opt('--only', null)
const TAIL = Number(opt('--tail', '12')) || 12
const VERBOSE = has('--verbose')

/* ── 允许失败的白名单：**带条件**，不是无条件放行 ─────────────────────
 * 每条都必须能回答"什么条件下它失败是可接受的"，并且把条件**现场探一遍**。 */
const ALLOW = [
  {
    name: 'check-panel-probe.cjs',
    why: '需要真机宿主里的桥在线（它探的是侧栏面板那条链路）',
    needsBridge: true,
  },
  {
    name: 'test-electron-e2e.cjs',
    why: '需要真机宿主里的桥在线（端到端要走文件通道）',
    needsBridge: true,
  },
]

/** 桥在不在线（用**客户端自己的**判据，不另发明一套） */
function bridgeStatus() {
  try {
    const client = require(path.join(ELECTRON, 'src', 'sv-bridge-client.js'))
    const info = client.probeBridge('sv') || {}
    return { online: !!info.online && !!info.fresh, ageSec: info.ageSec, reason: info.reason || '' }
  } catch (e) {
    return { online: false, ageSec: null, reason: '探测桥失败：' + ((e && e.message) || e) }
  }
}

function listOf(group) {
  const out = []
  if (group === 'check' || group === 'default' || group === 'all') {
    for (const f of fs.readdirSync(TOOLS).filter((x) => /^check-.*\.cjs$/.test(x)).sort()) out.push({ kind: 'check', name: f, cmd: [path.join(TOOLS, f)] })
  }
  if (group === 'test' || group === 'default' || group === 'all') {
    for (const f of fs.readdirSync(TOOLS).filter((x) => /^test-.*\.cjs$/.test(x)).sort()) out.push({ kind: 'test', name: f, cmd: [path.join(TOOLS, f)] })
  }
  if (group === 'client' || group === 'all') {
    for (const s of ['test:i18n', 'test:settings-ui', 'test:badge', 'test:host-pick']) out.push({ kind: 'client', name: 'npm run ' + s, cwd: ELECTRON, cmd: ['npm', 'run', s, '--silent'], shell: true })
    for (const f of ['dev/test-pdf-render.cjs', 'dev/test-audio-decode.cjs']) out.push({ kind: 'client', name: 'electron ' + f, cwd: ELECTRON, cmd: ['npx', 'electron', f], shell: true })
  }
  return ONLY ? out.filter((x) => (x.name + ' ' + x.kind).toLowerCase().includes(ONLY.toLowerCase())) : out
}

function run(item) {
  const t0 = Date.now()
  const r = spawnSync(item.shell ? item.cmd[0] : process.execPath, item.shell ? item.cmd.slice(1) : item.cmd, {
    cwd: item.cwd || ROOT,
    shell: !!item.shell,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, AKDAGENT_NO_DIALOG: '1' },
  })
  const out = String(r.stdout || '') + String(r.stderr || '')
  return { code: r.status === null ? 124 : r.status, ms: Date.now() - t0, out }
}

const items = listOf(GROUP)
if (!items.length) { console.error('没有匹配的项（--group=' + GROUP + (ONLY ? ' --only=' + ONLY : '') + '）'); process.exit(2) }
if (has('--list')) {
  const b = bridgeStatus()
  console.log(`桥状态：${b.online ? '在线（' + b.ageSec + 's 前有心跳）' : '不在线' + (Number.isFinite(b.ageSec) ? '（心跳 ' + b.ageSec + 's 前）' : '（没读到心跳）')}`)
  for (const it of items) console.log(`  [${it.kind}] ${it.name}`)
  process.exit(0)
}

const bridge = bridgeStatus()
const bridgeText = bridge.online
  ? '在线'
  : '不在线' + (Number.isFinite(bridge.ageSec) ? '（心跳 ' + bridge.ageSec + 's 前）' : '（没读到心跳）')
console.log(`跑批：${items.length} 项（group=${GROUP}）· 桥：${bridgeText}`)
console.log(`  允许失败白名单：${ALLOW.map((a) => a.name + '（' + a.why + '）').join(' · ')}\n`)

const results = []
for (const it of items) {
  const r = run(it)
  const allow = ALLOW.find((a) => a.name === it.name)
  let verdict = r.code === 0 ? 'PASS' : 'FAIL'
  let skipWhy = ''
  if (verdict === 'FAIL' && allow) {
    if (allow.needsBridge && !bridge.online) { verdict = 'SKIP'; skipWhy = allow.why + ' —— 现在桥不在线，属于环境性跳过' }
  }
  results.push({ ...it, ...r, verdict, skipWhy })
  const mark = verdict === 'PASS' ? '✓' : (verdict === 'SKIP' ? '–' : '✗')
  console.log(`${mark} [${it.kind}] ${it.name}  ${(r.ms / 1000).toFixed(1)}s  ${verdict}${verdict === 'SKIP' ? '（' + skipWhy + '）' : ''}`)
  if (verdict === 'FAIL' || (VERBOSE && r.code !== 0)) {
    /* 失败现场 = **先抽关键行**（断言失败/异常那几行），再给尾部。
     * 为什么不是"只看尾部"：2026-10-08 实测 —— `test-stt-transport.cjs` 有 28 条断言，
     * 失败那条在**中段**，尾 12 行里只有 "20 通过 / 1 失败"，等于没说。 */
    const lines = r.out.split(/\r?\n/).filter((l) => l.trim())
    const salient = lines.filter((l) => /\[FAIL\]|\[fail\]|AssertionError|Error:|error:|异常|不合格|不符合|✗/.test(l)).slice(0, 14)
    if (salient.length) {
      console.log('    ── 关键行 ' + salient.length + ' 条（断言失败/异常）:')
      for (const l of salient) console.log('      ' + l.trim().slice(0, 200))
    } else {
      console.log('    ── 没抽到关键行（下面给尾部）')
    }
    const tail = lines.slice(-TAIL)
    console.log('    ── 输出尾部 ' + tail.length + ' 行（**失败必须带现场**，这是本脚本存在的理由）:')
    for (const l of tail) console.log('      ' + l.slice(0, 200))
  } else if (VERBOSE) {
    const tail = r.out.split(/\r?\n/).filter((l) => l.trim()).slice(-3)
    for (const l of tail) console.log('      ' + l.slice(0, 200))
  }
}

const pass = results.filter((r) => r.verdict === 'PASS').length
const skip = results.filter((r) => r.verdict === 'SKIP')
const fail = results.filter((r) => r.verdict === 'FAIL')
console.log(`\n===== 汇总：${pass} 通过 · ${skip.length} 环境性跳过 · ${fail.length} 失败（共 ${results.length} 项）=====`)
for (const s of skip) console.log(`  – 跳过 ${s.name}：${s.skipWhy}`)
for (const f of fail) console.log(`  ✗ 失败 ${f.name}（exit ${f.code}）`)
if (fail.length) { console.log('\n有**意料之外**的失败 ⇒ exit 1（环境性项已在白名单里被识别为 SKIP，见上）'); process.exit(1) }
console.log('✓ 没有意料之外的失败')
