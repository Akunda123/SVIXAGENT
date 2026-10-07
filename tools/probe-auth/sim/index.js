/**
 * akd-auth-sim —— **只读模拟器**（dev 用，不属于产品）：把 pi-ai 的**真实**登录流放在**假网络**上跑一遍。
 *
 * 为什么需要它：用户「没有那些订阅账号」，但我们要验证这条链（尤其是**第 2 步**要桥到界面的
 * `notify` / `prompt` 到底长什么样、以及 pi-ai 最后往凭据里写了什么）。
 *   pi-ai 的登录流**全部走 `fetch`**（实测：github-copilot/xai/kimi-coding/anthropic/openai-codex/openrouter 都是）
 *   ⇒ 替换 `globalThis.fetch`，只把 OAuth 端点换成本地应答，**pi-ai 的真实代码一行不改地跑完**
 *   （device code → 轮询 pending → access_token → 换 copilot token → commit 到凭据）。
 *
 * ⛔ 安全：**fail-closed** —— 只要 URL 命中目标厂商域名而我又没有对应假应答，就直接抛错，
 *   **绝不**落到真实网络（不会碰任何账号）。被拦下的 URL 会记进 `<DSH_HOME>/auth-bridge/sim-blocked.log`
 *   —— 一条没覆盖到的端点**不会静默变成超时**，而是留下"这里要补一条假应答"的证据。
 *
 * ── 覆盖（2026-10-06 全部实跑通过，见 e2e-multi-transcript.log）────────────────
 *   · github-copilot  设备码 → 轮询 → copilot token → 拉/开模型
 *   · xai             设备码（form 编码）
 *   · kimi-coding     设备码（JSON）
 *   · anthropic       PKCE + 本机回调(:53692)，走**粘贴授权码**支路 + 令牌交换
 *   · openrouter      PKCE + 本机回调(随机端口)，走**粘贴授权码**支路 + 换 API key
 *   · openai-codex    **两条腿都覆盖**：`select` 选 browser（粘贴码）或 device_code（设备码轮询）
 *                     注意它的 access_token **必须是 JWT**（见 SIM_JWT：pi-ai 要从
 *                     `https://api.openai.com/auth` 这个 claim 里取 `chatgpt_account_id`，取不到就
 *                     `Failed to extract accountId from token`）
 *
 * 它**不注册任何流**（要验证的正是 pi-ai 自己注册的那些）。它做四件事：
 *   ① 装 fetch 拦截；② 等 `authorization.list()` 里出现目标 key；
 *   ③ `begin({key, method:'oauth', interaction})`，把每次 notify/prompt **原样打印**（这就是 UI 要渲染的东西）；
 *   ④ 结束后读 `ctx.credentials.describeRecord(key)`，**把 pi-ai 写进去的凭据原样打印**（grant 形状）。
 */
import fs from 'node:fs'
import path from 'node:path'

export const name = 'akd-auth-sim'
export const inject = []

/* ── 假 JWT：openai-codex 要从中取 `https://api.openai.com/auth`.chatgpt_account_id ──────────
 * pi-ai 用 `atob(payload)` 解（WHATWG forgiving-base64：**不收** `-`/`_`，收 `+`/`/` 与省掉的 `=`）
 * ⇒ 这里用**标准 base64**（Buffer.toString('base64')）而不是 base64url。 */
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64')
const SIM_JWT = [
  b64({ alg: 'none', typ: 'JWT' }),
  b64({ sub: 'sim-user', 'https://api.openai.com/auth': { chatgpt_account_id: 'sim-chatgpt-account' } }),
  'simsig',
].join('.')

/** 一条假应答：裸对象 = 200 + JSON；`{json}` / `{status}` / `{text}` = 显式形态
 *  （设备码轮询的 "pending" 分支很多家要求**非 200**，例如 openai-codex 只认 403/404）。 */
const J = (json) => ({ json })
const ST = (status) => ({ status })

/** 假应答：URL 片段 → 依次返回的响应（同一个片段被请求多次时按顺序取，取完停在最后一个）。 */
const RULES = {
  /* ── GitHub Copilot（设备码；已在第 2 步实跑通过）────────────────────────── */
  'github.com/login/device/code': [
    J({ device_code: 'SIM-DEVICE-CODE', user_code: 'SIMU-1234', verification_uri: 'https://github.com/login/device', interval: 1, expires_in: 900 }),
  ],
  'github.com/login/oauth/access_token': [
    J({ error: 'authorization_pending' }),              // 第一轮：走**真实的轮询**分支
    J({ access_token: 'SIM-GH-ACCESS-TOKEN', token_type: 'bearer', scope: 'read:user' }),
  ],
  'api.github.com/copilot_internal/v2/token': [
    J({ token: 'SIM-COPILOT-TOKEN', expires_at: Math.floor(Date.now() / 1000) + 3600 }),
  ],
  /* pi-ai 拿到 token 后还会**拉一次模型列表**（= 验证这份凭据真能用，不只是存下来）。
   * 不喂它这一步，`begin()` 就会以 "fetch failed / blocked" 结束。形状按 OpenAI 兼容的 `/models`。 */
  'api.individual.githubcopilot.com/models': [
    J({ object: 'list', data: [{ id: 'sim-copilot-model', object: 'model', owned_by: 'sim' }] }),
  ],

  /* ── xAI（设备码，application/x-www-form-urlencoded）────────────────────── */
  'auth.x.ai/oauth2/device/code': [
    J({
      device_code: 'SIM-XAI-DEVICE-CODE', user_code: 'XAI-SIM-1',
      verification_uri: 'https://auth.x.ai/device', verification_uri_complete: 'https://auth.x.ai/device?user_code=XAI-SIM-1',
      interval: 1, expires_in: 900,
    }),
  ],
  'auth.x.ai/oauth2/token': [
    /* ⚠️ 实测踩过：xAI 的轮询是 `if (response.ok) → 当成功` ⇒ pending **必须给非 200**
     *   （按 OAuth 设备码规范用 400）。给 200 + {error:authorization_pending} 会被当成功，
     *   然后报 "Invalid xAI OAuth response field: access_token"。Kimi 则相反（它读 body.error，200 也行）。 */
    { status: 400, json: { error: 'authorization_pending' } },
    J({ access_token: 'SIM-XAI-ACCESS-TOKEN', refresh_token: 'SIM-XAI-REFRESH-TOKEN', token_type: 'bearer', expires_in: 3600 }),
  ],

  /* ── Kimi Code（设备码，JSON）──────────────────────────────────────────── */
  'auth.kimi.com/api/oauth/device_authorization': [
    J({
      device_code: 'SIM-KIMI-DEVICE-CODE', user_code: 'KIMI-SIM-1',
      verification_uri: 'https://auth.kimi.com/device', verification_uri_complete: 'https://auth.kimi.com/device?user_code=KIMI-SIM-1',
      interval: 1, expires_in: 900,
    }),
  ],
  'auth.kimi.com/api/oauth/token': [
    J({ error: 'authorization_pending', error_description: '等待用户在浏览器里确认' }),
    J({ access_token: 'SIM-KIMI-ACCESS-TOKEN', refresh_token: 'SIM-KIMI-REFRESH-TOKEN', token_type: 'bearer', expires_in: 3600 }),
  ],

  /* ── Anthropic（PKCE + 本机回调 :53692）───────────────────────────────────
   * 真流程是「本机服务器等回调」与「用户把码粘回来」**赛跑**，谁先到用谁。假网络下没人去点浏览器，
   * 所以走**粘贴支路**：回答里给一个**不带 state** 的码 ⇒ pi-ai 直接 `state = verifier`（它只在客户端
   * 给了 state 且对不上时才报 state mismatch）。之后它会 POST 令牌端点换 access/refresh。 */
  'platform.claude.com/v1/oauth/token': [
    J({ access_token: 'SIM-ANTHROPIC-ACCESS-TOKEN', refresh_token: 'SIM-ANTHROPIC-REFRESH-TOKEN', token_type: 'bearer', expires_in: 3600 }),
  ],

  /* ── OpenRouter（PKCE）───────────────────────────────────────────────────
   * 回调里带的是 code，交换回来的是**一个 API key**（凭据 access = key，refresh 空、expires 取 MAX_SAFE_INTEGER）。 */
  'openrouter.ai/api/v1/auth/keys': [
    J({ key: 'SIM-OPENROUTER-KEY' }),
  ],

  /* ── OpenAI Codex：浏览器腿（PKCE + 本机回调 :1455，同样走粘贴支路）──────── */
  'auth.openai.com/oauth/token': [
    J({ access_token: SIM_JWT, refresh_token: 'SIM-CODEX-REFRESH-TOKEN', token_type: 'bearer', expires_in: 3600, id_token: SIM_JWT }),
  ],
  /* ── OpenAI Codex：设备码腿（先拿 user_code，再轮询；pending 只认 403/404 或 error=deviceauth_authorization_pending）*/
  'auth.openai.com/api/accounts/deviceauth/usercode': [
    J({ device_auth_id: 'SIM-CODEX-DEVICE-AUTH-ID', user_code: 'CODEX-SIM-1', interval: 1 }),
  ],
  'auth.openai.com/api/accounts/deviceauth/token': [
    ST(404),                                             // 第一轮：真实的 pending 分支
    J({ authorization_code: 'SIM-CODEX-AUTH-CODE', code_verifier: 'SIM-CODEX-CODE-VERIFIER' }),
  ],
}

/** prompt 的回答规则（按 message 语义；先命中先用，默认空串）。
 *  ⚠️ 顺序有讲究（实测踩过）：`paste ... redirect URL` 的提示里也带 "URL"，若把企业域名那条
 *  （含 `url`）排在前面，粘贴支路会被答成空串 ⇒ `Missing authorization code`。
 *  企业域名那条只认 blank/optional/enterprise/domain：答非空就会拿它当域名去请求。 */
const ANSWER_RULES = [
  [/paste|authorization code|redirect/i, 'SIM-PASTED-CODE'],
  [/blank|optional|enterprise|domain/i, ''],
  [/device code|user code|粘贴|verification/i, 'SIM-CODE'],
  [/token|key|secret|password/i, 'SIM-SECRET'],
]

/** 厂商域名：**没匹配到规则就拦下**（fail-closed），并留证。 */
const VENDOR = /github\.com|githubcopilot\.com|x\.ai|kimi\.com|openai\.com|anthropic\.com|openrouter\.ai|chatgpt\.com|claude\.ai|claude\.com/

function appendLog(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8')
  } catch { /* 落盘失败不影响流程 */ }
}

function shim() {
  const orig = globalThis.fetch
  const hits = Object.create(null)
  const log = (...a) => console.log('[akd-auth-sim]', ...a)
  const out = process.env.DSH_HOME ? path.join(process.env.DSH_HOME, 'auth-bridge') : null
  const hitLog = out && path.join(out, 'sim-fetch.log')
  const blockedLog = out && path.join(out, 'sim-blocked.log')
  if (blockedLog) { try { fs.rmSync(blockedLog, { force: true }) } catch { /* 忽略 */ } }

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input)
    /* ── 失败路径（2026-10-07 加）：请求体里带 `@@@` ⇒ 像**真厂商**一样拒绝（400 invalid_grant）。
     * 为什么需要：假网络默认对 token 端点一律 200 ⇒ "输错授权码"在模拟里**永远成功**，
     * 于是"厂商拒了以后界面显示什么"根本验不了（用户问的就是这个）。
     * 约定：想验失败路径，就把 `@@@` 放进要提交的那个码里（正常用例不含它，互不影响）。 */
    const bodyText = typeof (init && init.body) === 'string' ? init.body : ''
    if (bodyText.includes('@@@') && /oauth\/token|auth\/keys|deviceauth\/token/.test(url)) {
      const reject = { error: 'invalid_grant', error_description: 'sim: the authorization code is invalid' }
      log(`  ⛔ 假厂商拒绝（body 带 @@@）：${url}`)
      if (hitLog) appendLog(hitLog, { at: new Date().toISOString(), n: 0, method: (init && init.method) || 'POST', url, status: 400, body: JSON.stringify(reject) })
      return new Response(JSON.stringify(reject), { status: 400, headers: { 'content-type': 'application/json' } })
    }
    for (const frag of Object.keys(RULES)) {
      if (!url.includes(frag)) continue
      const seq = RULES[frag]
      const n = hits[frag] = (hits[frag] || 0) + 1
      const entry = seq[Math.min(n - 1, seq.length - 1)]
      /* 裸对象 = 200 + JSON；描述符 = 显式 status/json/text */
      const isDesc = entry && typeof entry === 'object' && ('json' in entry || 'status' in entry || 'text' in entry)
      const status = (isDesc && entry.status) || 200
      const body = isDesc ? (entry.json !== undefined ? JSON.stringify(entry.json) : (entry.text !== undefined ? String(entry.text) : '')) : JSON.stringify(entry)
      log(`  ⇢ 拦截 #${n} ${String(init && init.method || 'GET')} ${url}`)
      log(`     ${status} ${body.slice(0, 200)}`)
      if (hitLog) appendLog(hitLog, { at: new Date().toISOString(), n, method: (init && init.method) || 'GET', url, status, body: body.slice(0, 400) })
      return new Response(body, { status, headers: { 'content-type': 'application/json' } })
    }
    /* fail-closed：目标厂商域名上没匹配到的请求一律拒掉，绝不落到真网络 */
    if (VENDOR.test(url)) {
      log('  ⛔ 未预期的厂商请求，已拦截（fail-closed）：' + url)
      if (blockedLog) appendLog(blockedLog, { at: new Date().toISOString(), method: (init && init.method) || 'GET', url })
      throw new Error('akd-auth-sim: blocked unexpected vendor request ' + url)
    }
    return orig(input, init)
  }
  return { hits, restore: () => { globalThis.fetch = orig } }
}

export function apply(ctx, config) {
  const cfg = config || {}
  const key = cfg.key || 'llm-pi-ai/github-copilot'
  const method = cfg.method || 'oauth'
  const log = (...a) => console.log('[akd-auth-sim]', ...a)

  const { hits } = shim()
  log('fetch 拦截已装（规则 ' + Object.keys(RULES).length + ' 条，其余厂商请求 fail-closed）')
  /* ⛔ cordis 硬规矩（2026-10-06 实测踩到的）：`ctx.authorization` 这种**直读**要求插件在 `inject` 里
   *   声明过该服务，否则抛 `cannot get property "authorization" without inject`（我一开始就这么把自己搞崩的）。
   *   诊断一律用 `ctx.get('名字')` —— 它不需要声明。 */
  const svcOf = (n) => { try { return ctx.get(n) } catch { return undefined } }
  log('apply 时的 ctx：authorization=' + (svcOf('authorization') ? '在' : '不在') +
    ' · credentials=' + (svcOf('credentials') ? '在' : '不在'))

  /* `drive: false` = **只装假网络，不自己 begin** —— 给"客户端走文件通道驱动登录"的 E2E 用
   * （那时由 `akd-auth-bridge` 插件去 begin，本模拟器只负责把厂商端点换成本地应答）。 */
  if (cfg.drive === false) {
    log('drive=false ⇒ 只装拦截，不自己发起登录（等 akd-auth-bridge 走 cmd.json）')
    return
  }

  /* ⚠️ 不用 `ctx.inject(['authorization'], …)`：第一次实测它**没触发**（原因未查明），
   *   改成自己轮询 `ctx.get('authorization')` —— 更直白，也不会被注入时序绊住。 */
  let triesLeft = 60
  const waitService = () => {
    const auth = (() => { try { return ctx.get('authorization') } catch { return undefined } })()
    if (!auth) {
      if (--triesLeft <= 0) { log('❌ 30 秒都没等到 ctx.authorization（服务没挂上？）'); return }
      return setTimeout(waitService, 500)
    }
    log('✅ 等到 ctx.authorization（服务在）· list() = ' + (() => { try { return auth.list().length } catch (e) { return 'list 抛错 ' + e.message } })() + ' 条')
    drive(auth)
  }
  waitService()

  function drive(auth) {
  const creds = svcOf('credentials')   // apply 时它还没就绪 ⇒ 用到时再取一次
  if (!creds) log('（note: ctx.get("credentials") 仍为空 ⇒ 稍后读凭据那步会失败，不影响流程本身）')
    const start = (tries) => {
      const list = (() => { try { return auth.list() } catch { return [] } })()
      const hit = list.find((e) => String(e.key) === key)
      if (!hit) {
        if (tries <= 0) {
          log('❌ 等不到流：' + key + '（现有 ' + list.length + ' 条）')
          return
        }
        return setTimeout(() => start(tries - 1), 500)
      }
      log('✅ 流已注册：' + String(hit.key) + ' · ' + hit.label + ' · 方法 ' +
        ((hit.methods || []).map((m) => m.id + (m.label ? '(' + m.label + ')' : '')).join(', ')))

      const notices = []
      const prompts = []
      const interaction = {
        notify: (n) => {
          notices.push(n)
          log('  📣 notify → ' + JSON.stringify(n))
        },
        prompt: async (p) => {
          prompts.push(p)
          log('  ❓ prompt → ' + JSON.stringify({ kind: p.kind, message: p.message, options: (p.options || []).map((o) => o.id || o.label) }))
          if (cfg.decline) throw new Error('akd-auth-sim: 按配置拒绝')
          /* 按**语义**回答：这些 prompt 是 pi-ai 真流程里的分歧点（实测第一条就是
           * "GitHub Enterprise URL/domain (blank for github.com)" —— 答非空就会拿它当域名去请求）。 */
          let answer = ''
          for (const [re, val] of ANSWER_RULES) if (re.test(String(p.message || ''))) { answer = val; break }
          if (p.options && p.options.length && p.options[0]) answer = p.options[0].id || p.options[0].label || answer
          log('     ↳ 回答 ' + JSON.stringify(answer))
          return answer
        },
      }

      log('▶ 开始 begin(' + key + ', method=' + method + ')')
      const t0 = Date.now()
      Promise.resolve()
        .then(() => auth.begin({ key: hit.key, method, interaction }))
        .then(async (out) => {
          log('★ begin() 返回：' + JSON.stringify(out) + ' · 用时 ' + (Date.now() - t0) + ' ms')
          log('★ 交互次数：notify ' + notices.length + ' · prompt ' + prompts.length)
          log('★ fetch 命中：' + JSON.stringify(hits))
          try {
            const rec = await creds.describeRecord(hit.key)
            log('★ 凭据记录：' + JSON.stringify(rec && rec.kind ? rec : rec).slice(0, 1200))
            if (rec && rec.payload) {
              const p = rec.payload
              const shape = {}
              for (const k of Object.keys(p)) shape[k] = typeof p[k] === 'string' ? p[k].slice(0, 18) + (p[k].length > 18 ? '…' : '') : p[k]
              log('★ 凭据字段形状：' + JSON.stringify(shape))
            }
          } catch (e) {
            log('★ 读凭据记录失败：' + (e && e.message))
          }
        })
        .catch((e) => log('★ begin() 抛错：' + (e && e.code ? e.code + ' — ' : '') + (e && e.message)))
    }
    start(40)   // 最多等 20 秒（注册是异步的）
  }
}
