/**
 * e2e-fail —— **失败路径**的端到端（用户问："如果我输错了结果呢"）
 *
 * 目的：把"答错/答空/状态不对"这几种情形**真跑一遍**（走产品文件通道 + 假网络），
 * 并把宿主写出来的 `attempt.json` **翻译成界面会显示的那句话**（直接读 `i18n/settings.json` 的文案模板）。
 *
 * 用法：node tools/probe-auth/e2e-fail.cjs <DSH_HOME> [key]
 *   前置：宿主已用 sim.patch.yml（或 bridge-e2e.patch.yml）+ `akd-auth-bridge` 起好。
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const HOME = process.argv[2]
const KEY = process.argv[3] || 'llm-pi-ai/anthropic'
if (!HOME) { console.error('用法：node e2e-fail.cjs <DSH_HOME> [key]'); process.exit(2) }

const DIR = path.join(HOME, 'auth-bridge')
const F = { flows: path.join(DIR, 'flows.json'), cmd: path.join(DIR, 'cmd.json'), attempt: path.join(DIR, 'attempt.json') }
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'electron', 'src', 'i18n', 'settings.json'), 'utf8'))['zh-Hans']
/** 把 attempt 翻成**界面那句话**（与 settings.html 的渲染一一对应） */
const uiText = (a) => {
  if (!a || !a.state || a.state === 'idle') return '（面板为空）'
  const head = dict['settings.auth.attemptTitle'].replace('{0}', a.label || a.key).replace('{1}', a.state)
  if (a.state === 'authorized') return `${head} — ${dict['settings.auth.authorized']}`
  if (a.state === 'cancelled') return `${head} — ${dict['settings.auth.cancelled']}`
  return `${head} — ${dict['settings.auth.failed'].replace('{0}', a.error || '')}`
}

let cmdId = (read(F.cmd) || {}).id || 0
function send(op, extra) {
  cmdId = Math.max(cmdId + 1, ((read(F.cmd) || {}).id || 0) + 1)
  const tmp = F.cmd + '.tmp'
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify({ id: cmdId, op, at: new Date().toISOString(), ...(extra || {}) }, null, 2), 'utf8')
  fs.renameSync(tmp, F.cmd)
}

/** 跑一次：begin → 等提问 → 用给定答案回答 → 等终态 */
async function attempt(label, answer) {
  const id = (() => { send('begin', { key: KEY, method: 'oauth' }); return cmdId })()
  const t0 = Date.now()
  let answered = false
  while (Date.now() - t0 < 40000) {
    const a = read(F.attempt)
    if (a && a.id === id && a.state && a.state !== 'idle') {
      if (a.awaiting && !answered) {
        answered = true
        const val = typeof answer === 'function' ? answer(a) : answer
        console.log(`  ❓ 提问(${a.awaiting.kind})：${JSON.stringify(a.awaiting.message).slice(0, 90)}`)
        console.log(`     ↳ 本次回答：${JSON.stringify(val).slice(0, 120)}`)
        send('answer', { promptId: a.awaiting.id, value: val })
      }
      if (a.state !== 'running') {
        console.log(`  【界面会显示】${uiText(a)}`)
        console.log(`  【状态】state=${a.state} error=${JSON.stringify(a.error || '')} · 用时 ${Date.now() - t0} ms`)
        return a
      }
    }
    await sleep(250)
  }
  console.log('  ⏱ 40 秒没到终态')
  return null
}

;(async () => {
  let flows = null
  for (let i = 0; i < 60; i++) { const st = read(F.flows); if (st && st.count > 0) { flows = st; break } await sleep(500) }
  if (!flows) { console.error('❌ 等不到 flows.json'); process.exit(1) }
  const hit = (flows.flows || []).find((f) => f.key === KEY)
  console.log(`宿主清单 ${flows.count} 条 · 目标 ${KEY}：${hit ? '在' : '不在'}\n`)
  if (!hit) process.exit(1)

  console.log('① 答**空**（什么都不填就提交）')
  await attempt('空答案', '')

  console.log('\n② 答一条**状态不对**的回调链接（state 与本次不符）')
  await attempt('state 不匹配', (a) => {
    const n = (a.notices || []).map((x) => x.url).find((u) => u && u.includes('state=')) || ''
    const real = /state=([^&]+)/.exec(n)
    return `http://localhost:53692/callback?code=SIM-CODE&state=${real ? 'WRONG-' + real[1] : 'WRONG-STATE'}`
  })

  console.log('\n③ 答一个**乱码**（既不是链接也不是合法授权码 —— 交给厂商去拒）')
  await attempt('乱码', 'not-a-code-@@@')

  console.log('\n④ 控制组：答一个**正常**的码（证明前面的失败没把这次登录弄坏）')
  await attempt('正常码', 'SIM-GOOD-CODE')
})().catch((e) => { console.error('异常：' + (e && e.stack || e)); process.exit(1) })
