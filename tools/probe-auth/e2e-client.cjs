/**
 * E2E 客户端（dev 用）：**扮演 AKDAgent 客户端**，只用文件通道驱动订阅登录。
 * 与 `electron/src/auth-bridge.js` 的 `writeAuthCmd/readAuthState` 行为一致（这里是独立实现，
 * 免得把产品代码当测试夹具；两边对同一份契约）。
 *
 * 用法：node tools/probe-auth/e2e-client.cjs <DSH_HOME> [keys] [method]
 *   keys 逗号分隔；key 可写成 `<key>@<select 选项>` 指定 select 型 prompt 的答案
 *   （例如 `llm-pi-ai/openai-codex@device_code` ⇒ 走设备码那条腿；默认给浏览器腿）。
 *   省略 keys = 跑**全部**带 oauth 的订阅提供方（六家）。
 *   前置：宿主已用 `sim.patch.yml` + `bridge-e2e.patch.yml` 启动（授权服务 + 桥插件 + 假网络）
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const HOME = process.argv[2]
const METHOD = process.argv[4] || 'oauth'
if (!HOME) { console.error('用法：node e2e-client.cjs <DSH_HOME> [keys] [method]'); process.exit(2) }

/** 默认：全部带 oauth 的订阅提供方（openai-codex 先走浏览器腿，稍后单独再走设备码腿）。 */
const DEFAULT_KEYS = [
  'llm-pi-ai/github-copilot',
  'llm-pi-ai/openai-codex',
  'llm-pi-ai/anthropic',
  'llm-pi-ai/openrouter',
  'llm-pi-ai/xai',
  'llm-pi-ai/kimi-coding',
]
const SPECS = (process.argv[3] ? process.argv[3].split(',') : DEFAULT_KEYS).map((s) => {
  const [key, select] = s.split('@')
  return { key: key.trim(), select: select && select.trim() }
})

const DIR = path.join(HOME, 'auth-bridge')
const F = {
  flows: path.join(DIR, 'flows.json'), cmd: path.join(DIR, 'cmd.json'),
  attempt: path.join(DIR, 'attempt.json'), fetch: path.join(DIR, 'sim-fetch.log'),
  blocked: path.join(DIR, 'sim-blocked.log'),
}
const TRANSCRIPT = path.join(__dirname, 'e2e-multi-transcript.log')
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const readLines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) } catch { return [] } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let cmdId = (read(F.cmd) || {}).id || 0
const out = []
function say(line) { console.log(line); out.push(line) }
function send(op, extra) {
  /* ⛔ 严格递增：桥上"消费 answer 时回写 answer-consumed"用的是**同一个 id**，
   *   所以只要我们的下一个 id 严格大于盘上的，就不会被它的回写盖掉。 */
  cmdId = Math.max(cmdId + 1, ((read(F.cmd) || {}).id || 0) + 1)
  const cmd = { id: cmdId, op, at: new Date().toISOString(), ...(extra || {}) }
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = F.cmd + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cmd, null, 2), 'utf8')
  fs.renameSync(tmp, F.cmd)
  return cmdId
}

/** 按语义回答一个 prompt（`select` 用调用方指定的选项或第一个选项）。
 *  ⚠️ 顺序有讲究（实测踩过）：粘贴码的提示里也带 "redirect URL"，企业域名那条不能排在前面。 */
function answerFor(spec, awaiting) {
  const msg = String(awaiting.message || '')
  const opts = Array.isArray(awaiting.options) ? awaiting.options : []
  if (awaiting.kind === 'select' && opts.length) {
    const want = spec.select && opts.find((o) => o.id === spec.select)
    return (want || opts[0]).id
  }
  if (/paste|authorization code|redirect/i.test(msg)) return 'SIM-PASTED-CODE' // anthropic/openrouter/openai-codex 的粘贴支路
  if (/blank|optional|enterprise|domain/i.test(msg)) return ''                 // Copilot 企业域名：空串 = github.com
  return 'SIM-INPUT'
}

async function runOne(spec, flows, fetchMark, blockedMark) {
  const hit = (flows.flows || []).find((f) => f.key === spec.key)
  say(`\n──────── ${spec.key}${spec.select ? '@' + spec.select : ''} ────────`)
  if (!hit) { say(`  ❌ 清单里没有这条流（方法应有 oauth）`); return { key: spec.key, ok: false, why: 'NO_FLOW' } }
  say(`  流在：${hit.label} · 方法 ${hit.methods.map((m) => m.id).join('/')}`)

  let beginId = send('begin', { key: spec.key, method: METHOD })
  let answered = new Set()
  let last = null
  let seenOurs = false
  let sentAt = Date.now()
  const t0 = Date.now()
  let state = null
  while (Date.now() - t0 < 90000) {
    const a = read(F.attempt)
    /* ⛔ 必须等 `id` 对上我们的 begin：否则会读到**上一次**留下的终态，直接误判成功。 */
    if (a && a.id === beginId && a.state && a.state !== 'idle') {
      seenOurs = true
      if (JSON.stringify(a) !== JSON.stringify(last)) {
        last = a
        for (const n of (a.notices || [])) {
          if (!answered.has('n' + JSON.stringify(n))) {
            answered.add('n' + JSON.stringify(n))
            say(`    📣 notify → message=${JSON.stringify(n.message)} url=${JSON.stringify(n.url)} code=${JSON.stringify(n.code)}`)
          }
        }
        if (a.awaiting) {
          const id = a.awaiting.id
          if (!answered.has('p' + id)) {
            answered.add('p' + id)
            const val = answerFor(spec, a.awaiting)
            say(`    ❓ prompt(${a.awaiting.kind}) → ${JSON.stringify(a.awaiting.message)}`)
            say(`       placeholder=${JSON.stringify(a.awaiting.placeholder || '')} options=${JSON.stringify((a.awaiting.options || []).map((o) => o.id))} ↳ 回答 ${JSON.stringify(val)}`)
            send('answer', { promptId: id, value: val })
          }
        }
      }
      if (a.state !== 'running') { state = a; break }
    }
    /* 桥上「已有尝试在跑就忽略新的 begin」（一次只跑一个）⇒ 若 8 秒还没见到属于本次的 attempt，
     * 说明我们那条 begin 被丢了（多半是上一次尝试还没收尾），重下一次。 */
    if (!seenOurs && Date.now() - sentAt > 8000) {
      const id2 = send('begin', { key: spec.key, method: METHOD })
      say(`    ↻ 8 秒没见到本次 attempt（id=${beginId}），重下 begin（id=${id2}）`)
      beginId = id2
      sentAt = Date.now()
    }
    await sleep(300)
  }

  const fetches = readLines(F.fetch).slice(fetchMark).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const blocked = readLines(F.blocked).slice(blockedMark).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  for (const f of fetches) say(`    ⇢(假网络) ${f.method || 'GET'} ${f.url} → ${f.status}`)
  if (blocked.length) for (const b of blocked) say(`    ⛔(被拦) ${b.url}`)

  if (!state) { say(`  ❌ 90 秒没等到终态`); return { key: spec.key, ok: false, why: 'TIMEOUT', fetches, blocked } }
  const ok = state.state === 'authorized'
  say(`  ${ok ? '✅' : '❌'} state=${state.state}${state.error ? ' error=' + state.error : ''} · 用时 ${Date.now() - t0} ms · notify ${(state.notices || []).length} · prompt ${(state.prompts || []).length}`)
  for (const p of (state.prompts || [])) say(`    prompt 记录：kind=${p.kind} answer=${JSON.stringify(p.answer)}`)
  return { key: spec.key + (spec.select ? '@' + spec.select : ''), ok, why: ok ? '' : (state.error || state.state), fetches, blocked }
}

;(async () => {
  say('== ① 等清单（注册是异步的） ==')
  let flows = null
  for (let i = 0; i < 60; i++) {
    const st = read(F.flows)
    if (st && st.count > 0) { flows = st; break }
    await sleep(500)
  }
  if (!flows) { console.error('❌ 等不到 flows.json（宿主没起？插件没挂？）'); process.exit(1) }
  say(`  清单 ${flows.count} 条`)

  /* 起跑前等宿主把上一次尝试收尾（桥上"已有尝试在跑就忽略新的 begin"，抢跑会被静默丢掉）。 */
  for (let i = 0; i < 40; i++) {
    const a = read(F.attempt)
    if (!a || !a.state || a.state !== 'running') break
    if (i === 0) say(`  宿主上还有一次尝试在跑（id=${a.id} ${a.key}）⇒ 先等它收尾`)
    await sleep(500)
  }

  const results = []
  for (const spec of SPECS) {
    const r = await runOne(spec, flows, readLines(F.fetch).length, readLines(F.blocked).length)
    results.push(r)
  }

  say('\n== ③ 汇总 ==')
  let bad = 0
  for (const r of results) {
    if (!r.ok) bad++
    say(`  ${r.ok ? '✅ 通' : '❌ 不通'}  ${r.key}${r.why ? '  （' + r.why + '）' : ''}`)
  }
  const allBlocked = [...new Set(results.flatMap((r) => (r.blocked || []).map((b) => b.url)))]
  if (allBlocked.length) {
    say('\n  ⛔ 有端点没被假网络覆盖（fail-closed 拦下的，正是**该补规则**的地方）：')
    for (const u of allBlocked) say('     ' + u)
  }
  say(`\n  ${results.length - bad}/${results.length} 家端到端通过` + (bad ? ' ❌' : ' ✅'))
  /* **追加**而不是覆盖：一轮"全部六家" + 一轮"codex 设备码腿"是两份证据，都留在同一份日志里。 */
  const header = `\n===== 运行 ${new Date().toISOString()} · method=${METHOD} · keys=${SPECS.map((s) => s.key + (s.select ? '@' + s.select : '')).join(',')} =====`
  fs.appendFileSync(TRANSCRIPT, header + '\n' + out.join('\n') + '\n', 'utf8')
  say(`  （全程记录已落 ${TRANSCRIPT}）`)
  process.exit(bad ? 1 : 0)
})()
