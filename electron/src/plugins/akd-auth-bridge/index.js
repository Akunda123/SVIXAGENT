/**
 * akd-auth-bridge —— AKDAgent 的「**订阅登录**」桥（宿主侧插件）
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 * AKDAgent 的设置页原先只有「API 密钥（keyenv）」一种凭据入口，而**订阅制**（ChatGPT Plus/Pro、
 * Claude Pro/Max、GitHub Copilot、Kimi 编程套餐、xAI…）要走 **OAuth 登录**：宿主的 `ctx.authorization`
 * 服务提供 `registerFlow / list / describe / begin / cancel`，pi-ai（`@deepseek-ai/dsh-llm-pi-ai`）
 * 已经为每个自带登录的提供方注册了一条流（key = `llm-pi-ai/<providerId>`）。
 *
 * ⛔ 三条硬事实（都是 2026-10-06 实测出来的，别忘）：
 *   ① 该服务**默认没被挂**：`@deepseek-ai/dsh-authorization` 只是 pi-ai 的 peerDependency，
 *      没有任何装配清单列出它 ⇒ `ctx.inject(['authorization'], …)` 永不触发 ⇒ **一条登录流都不注册、且不报错**。
 *      客户端会在 profile 的 `cordis.patch.yml` 里写一行把服务挂上（见 `electron/src/auth-bridge.js`）。
 *   ② **注册是异步的**：boot 那一瞬 `list()` 是 0 条，约 1.5 秒后才有（实测 39 条）⇒ 快照必须**定时重发**。
 *   ③ `registerFlow()` 必须在**注入回调里同步调**；而**直读 `ctx.authorization` 需要插件在 `inject` 里声明过**
 *      （否则 `cannot get property "authorization" without inject`）⇒ 探测一律 `ctx.get('authorization')`。
 *
 * ── 与客户端怎么对话（**文件通道**，与 SV 桥同款形状）────────────────────────
 * 目录：`<outDir>`（= `<DSH_HOME>/auth-bridge`）
 *   · `flows.json`   ← 插件写：可登录清单快照（label + methods + inFlight），每 5 s 重发
 *   · `cmd.json`     ← 客户端写：命令（原子写，单槽位，按 `id` 递增去重）
 *        { id: 1, op: 'begin',  key: 'llm-pi-ai/github-copilot', method: 'oauth' }
 *        { id: 2, op: 'answer', promptId: 'p1', value: '……' }     // secret 型提交后本文件会被插件清空
 *        { id: 3, op: 'cancel' }
 *   · `attempt.json` ← 插件写：**当前这次尝试**的全过程，界面照着渲染
 *        { id, key, label, method, state: 'running'|'authorized'|'cancelled'|'failed',
 *          notices: [{message,url,code,at}],
 *          prompts: [{id,kind,message,placeholder,options,answer,at}],   // secret 型的 answer 只留占位
 *          awaiting: {id,kind,message,placeholder,options} | null,
 *          error, at }
 *
 * 为什么用文件而不是 HTTP：宿主插件没有现成的路由注册面，而 AKDAgent 早就有"请求/响应文件"这套成熟形状
 * （SV 桥就是），复用它的解析时序、幂等与排障经验，零新协议。
 *
 * ⛔ 安全：`secret` 型答案绝不回写进 `attempt.json`（只留 `'（已提交）'`），并且**消费后立刻清空 `cmd.json` 的 value**。
 */
import fs from 'node:fs'
import path from 'node:path'

export const name = 'akd-auth-bridge'
export const inject = []   // 不声明依赖：服务不在时也要能写出"我在等"的状态（探测用 ctx.get）

const FLOW_POLL_MS = 5000      // flows.json 重发间隔（注册是异步的，且 inFlight 会变）
const CMD_POLL_MS = 400        // cmd.json 轮询间隔（用户点了按钮要"立刻"有反应）
const ANSWER_WAIT_MS = 15 * 60 * 1000   // 等用户回答一个 prompt 的上限

export function apply(ctx, config) {
  const cfg = config || {}
  const outDir = cfg.outDir || path.join(process.env.DSH_HOME || process.cwd(), 'auth-bridge')
  const log = (...a) => console.log('[akd-auth-bridge]', ...a)
  const files = {
    flows: path.join(outDir, 'flows.json'),
    cmd: path.join(outDir, 'cmd.json'),
    attempt: path.join(outDir, 'attempt.json'),
  }

  const writeAtomic = (file, obj) => {
    try {
      fs.mkdirSync(outDir, { recursive: true })
      const tmp = file + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
      fs.renameSync(tmp, file)
    } catch (e) {
      log('写 ' + path.basename(file) + ' 失败：' + (e && e.message))
    }
  }
  const readJson = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
  }

  writeAtomic(files.flows, { state: 'waiting-service', at: new Date().toISOString(), count: 0, flows: [] })
  /* ⛔ 开机把"当前尝试"清成 idle（2026-10-07 实测：不清的话，**上一次没跑完的尝试会一直挂在界面上** ——
   *   用户重启后看到「登录中：Anthropic（running）」和一个已经作废的提问框）。 */
  writeAtomic(files.attempt, { state: 'idle', at: new Date().toISOString() })
  log('已挂载 · outDir=' + outDir + '（等服务 ctx.authorization）')

  /* ── 服务侧：探测用 ctx.get（直读 ctx.authorization 需要 inject 声明，会抛） ── */
  let svc = null
  let svcTries = 0
  const waitService = () => {
    try { svc = ctx.get('authorization') } catch { svc = null }
    if (svc) {
      log('服务在 · 流 ' + (() => { try { return svc.list().length } catch { return '?' } })() + ' 条')
      snapshot('boot')
      const t = setInterval(() => snapshot('poll'), FLOW_POLL_MS)
      if (typeof t.unref === 'function') t.unref()
      try { ctx.on('authorization/settled', () => snapshot('settled')) } catch { /* 老宿主没这事件就靠轮询 */ }
      const c = setInterval(pollCmd, CMD_POLL_MS)
      if (typeof c.unref === 'function') c.unref()
      return
    }
    if (++svcTries > 120) { log('⚠️ 60 秒没等到 ctx.authorization（服务没挂上？）'); return }
    setTimeout(waitService, 500)
  }
  waitService()

  function snapshot(tag) {
    let flows = []
    let why = ''
    try { flows = svc.list() } catch (e) { why = (e && e.message) || String(e) }
    writeAtomic(files.flows, {
      state: why ? 'list-failed' : 'ok',
      tag,
      at: new Date().toISOString(),
      count: flows.length,
      why,
      flows: flows.map((e) => ({
        key: String(e.key),
        label: e.label,
        inFlight: !!e.inFlight,
        methods: (e.methods || []).map((m) => ({ id: m.id, label: m.label })),
      })),
    })
  }

  /* ── 尝试（attempt）：一次一个；界面照 attempt.json 渲染 ─────────────── */
  let active = null          // 正在跑的那次
  /* ⛔ boot 时**认领但不重放**盘上那条命令（2026-10-06 实测踩到：重启宿主会把上一次留下的 `begin`
   *   又跑一遍 ⇒ 等于"开机自动发起一次登录"；更糟的是旧的 `answer`——prompt id 每轮都从 p1 重来，
   *   一条陈旧的 secret 可能被当成本轮 p1 的答案消费掉）。所以只处理比挂载时 id **更新**的命令。 */
  let lastCmdId = 0
  try { const c0 = readJson(files.cmd); if (c0 && Number.isFinite(c0.id)) lastCmdId = c0.id } catch { /* 忽略 */ }
  if (lastCmdId) log('挂载时盘上已有命令 id=' + lastCmdId + ' ⇒ 认领但不重放（避免开机自动登录 / 旧答案被消费）')
  let pending = null         // { promptId, resolve, reject, timer }

  function publish() {
    if (!active) { writeAtomic(files.attempt, { state: 'idle', at: new Date().toISOString() }); return }
    writeAtomic(files.attempt, {
      id: active.id, key: active.key, label: active.label, method: active.method, state: active.state,
      notices: active.notices, prompts: active.prompts, awaiting: active.awaiting,
      error: active.error || '', at: new Date().toISOString(),
    })
  }

  function finish(state, error) {
    if (!active) return
    active.state = state
    active.awaiting = null
    active.error = error || ''
    if (pending) { try { pending.reject(new Error('attempt finished')) } catch { /* 忽略 */ } pending = null }
    publish()
    log('尝试结束：' + state + (error ? '（' + error + '）' : ''))
  }

  function pollCmd() {
    const c = readJson(files.cmd)
    if (!c || !Number.isFinite(c.id) || c.id === lastCmdId) return
    lastCmdId = c.id
    if (c.op === 'begin') return doBegin(c)
    if (c.op === 'cancel') { cancelActive(); return }
    if (c.op === 'answer') return doAnswer(c)
    log('不认识的命令：' + JSON.stringify(c.op))
  }

  function doBegin(c) {
    /* ⛔ 2026-10-07 实测事故：**一个卡住的尝试会把整个区锁死**（用户在界面上点任何「登录」都只看到
     *   `已有尝试在跑…忽略新的 begin`；旧版界面还会把按钮全禁用 ⇒「什么按钮都点不了」）。
     *   现在：**显式点「登录」= 明确意图** ⇒ 先取消当前这次，再开始新的（切换/重试都走这条路）。 */
    if (active && active.state === 'running') {
      log('begin ' + c.key + '：先取消正在跑的 ' + active.key + '（一次只跑一个，直接 begin 会被忽略）')
      cancelActive()
    }
    let hit = null
    try { hit = svc.list().find((e) => String(e.key) === String(c.key)) } catch { /* 忽略 */ }
    if (!hit) { log('begin：流里没有 ' + c.key); active = { id: c.id, key: c.key, label: '', method: c.method, state: 'failed', notices: [], prompts: [], awaiting: null, error: 'NO_FLOW' }; publish(); return }
    active = { id: c.id, key: String(hit.key), label: hit.label, method: c.method, state: 'running', notices: [], prompts: [], awaiting: null, error: '' }
    const owner = active
    publish()
    log('begin：' + active.key + '（' + active.method + '）')

    const interaction = {
      notify: (n) => {
        if (active !== owner || owner.state !== 'running') return
        active.notices.push({ message: String(n && n.message || ''), url: (n && n.url) || '', code: (n && n.code) || '', at: new Date().toISOString() })
        publish()
      },
      prompt: (p) => new Promise((resolve, reject) => {
        if (active !== owner || owner.state !== 'running') { reject(new Error('已取消')); return }
        const promptId = 'p' + (active.prompts.length + 1)
        const entry = {
          id: promptId,
          kind: String(p && p.kind || 'text'),
          message: String(p && p.message || ''),
          /* `placeholder` 是宿主规范化后**特意留下**的提示（`manual_code` 型的它就是本机回调地址，
           *  如 `http://localhost:53692/callback`）—— pi-ai 的三家 PKCE 流都靠它告诉用户该粘什么。 */
          placeholder: String((p && p.placeholder) || ''),
          options: (p && p.options ? p.options : []).map((o) => ({ id: String(o.id), label: String(o.label || o.id) })),
          answer: '', at: new Date().toISOString(),
        }
        active.prompts.push(entry)
        active.awaiting = { id: entry.id, kind: entry.kind, message: entry.message, placeholder: entry.placeholder, options: entry.options }
        publish()
        const timer = setTimeout(() => {
          if (pending?.owner === owner) pending = null
          if (active === owner) { active.awaiting = null; publish() }
          reject(new Error('等用户回答超时'))
        }, ANSWER_WAIT_MS)
        if (typeof timer.unref === 'function') timer.unref()
        pending = {
          owner,
          promptId,
          entry,
          resolve: (v) => { clearTimeout(timer); resolve(v) },
          reject: (e) => { clearTimeout(timer); reject(e) },
        }
        /* 宿主侧的取消信号（cancel(key) / 尝试被撤回）也要能打断提问 */
        if (p && p.signal) {
          const onAbort = () => {
            if (pending?.owner === owner && pending.promptId === promptId) {
              const item = pending; pending = null
              if (active === owner) { active.awaiting = null; publish() }
              item.reject(new Error('已取消'))
            }
          }
          try { p.signal.addEventListener('abort', onAbort, { once: true }) } catch { /* 忽略 */ }
        }
      }),
    }

    Promise.resolve()
      .then(() => active === owner && owner.state === 'running'
        ? svc.begin({ key: hit.key, method: c.method, interaction }) : { status: 'cancelled' })
      .then((out) => {
        if (active !== owner || owner.state !== 'running') return
        const st = out && out.status === 'authorized' ? 'authorized' : 'cancelled'
        finish(st)
        snapshot('after-' + st)
      })
      .catch((e) => {
        if (active === owner && owner.state === 'running') finish('failed', (e && e.code ? e.code + ' — ' : '') + ((e && e.message) || String(e)))
      })
  }

  function doAnswer(c) {
    if (!pending || pending.promptId !== c.promptId) { log('answer：没有在等的 prompt ' + c.promptId); return }
    const val = String(c.value == null ? '' : c.value)
    const kind = pending.entry.kind
    pending.entry.answer = kind === 'secret' ? '（已提交）' : val
    active.awaiting = null
    publish()
    /* ⛔ 立刻把命令槽位里的答案清掉：secret 不该留在盘上 */
    writeAtomic(files.cmd, { id: c.id, op: 'answer-consumed', at: new Date().toISOString() })
    const p = pending
    pending = null
    p.resolve(val)
  }

  function cancelActive() {
    if (!active || active.state !== 'running') return
    try { svc.cancel(active.key) } catch (e) { log('cancel 抛错：' + (e && e.message)) }
    if (pending) { const p = pending; pending = null; try { p.reject(new Error('已取消')) } catch { /* 忽略 */ } }
    finish('cancelled')
  }
}
