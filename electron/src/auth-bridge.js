/**
 * auth-bridge.js —— AKDAgent 侧：**把「订阅登录」插件落进 profile，并把它的快照读回来**
 *
 * 分工：
 *   · 落位（`ensureAuthBridge`）：把 `src/plugins/akd-auth-bridge/` 复制到
 *     `$DSH_HOME/profiles/web/node_modules/akd-auth-bridge/`（loader 是从 **profile 目录**解析插件名的，
 *     放运行时树里会 ERR_MODULE_NOT_FOUND —— 2026-10-06 实测踩过），并在 profile 的 `cordis.patch.yml`
 *     里写两行（幂等、写前备份 `.bak-authbridge`）：
 *       ① `@deepseek-ai/dsh-authorization` —— **挂上服务**（它只是 pi-ai 的 peerDependency，
 *          默认没有任何装配清单列出它 ⇒ 不挂就一条登录流都不会注册、而且不报错）；
 *       ② `akd-auth-bridge` —— 我们的只读快照插件。
 *   · 读取（`readAuthFlows`）：读 `<DSH_HOME>/auth-bridge/flows.json`（插件写的快照）。
 *
 * ⛔ **fail-soft 铁律**：profile 的 patch 里出现**解析不到的名字**会让宿主**整个插件树加载失败**
 *   （实测：`dsh: plugin tree failed to load: … ERR_MODULE_NOT_FOUND`）⇒ 写之前必须逐个确认能解析；
 *   解析不到就**不写那一行**，并如实告诉调用方（宁可没有这个功能，也不能让 App 起不来）。
 *
 * 用法（main.js）：
 *   const { ensureAuthBridge, readAuthFlows } = require('./auth-bridge.js')
 *   ensureAuthBridge({ home: AKDAGENT_DSH_HOME, srcDir: <app 里的插件源目录>, log: console.log })
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const PLUGIN_ID = 'akd-auth-bridge'
const SERVICE_ID = 'authorization'
const SERVICE_NAME = '@deepseek-ai/dsh-authorization'
const PLUGIN_FILES = ['package.json', 'index.js']

/**
 * 从 `dir` 起**向上**找 `<dir>/node_modules/<name>`（与 Node 的解析顺序一致，但不加载模块、
 * 不依赖 `require.resolve` 对 ESM 的条件导出行为）。
 * @returns 命中目录，或 null
 */
function resolvableFrom(name, dir) {
  let d = path.resolve(dir)
  for (let i = 0; i < 5; i++) {
    const p = path.join(d, 'node_modules', ...name.split('/'))
    if (fs.existsSync(p)) return p
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  return null
}

/**
 * 删掉消毒器**误注释**掉的、我们自己的那一条（含它的标记行与紧随其后的连续注释块）。
 *
 * 标记行由 `dsh-home.js` 的 `sanitizePatchLayer` 写，形如：
 *   `# [akdagent] 已停用（当前运行时没有 akd-auth-bridge）`
 * 后面跟着一整段被 `# ` 前缀注释掉的原文。我们只对自己这两个 id 做这件事（别人的条目一律不碰），
 * 删干净后由调用方按常规路径重新追加一行 ⇒ 幂等、且不会残留半截注释。
 * @returns {{text:string, removed:number}} removed = 清掉了几处标记
 */
function stripDisabledBlock(text, id) {
  const lines = String(text).split('\n')
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const marker = new RegExp('^#\\s*\\[akdagent\\]\\s*已停用（当前运行时没有 ' + esc + '）\\s*$')
  let removed = 0
  for (let i = 0; i < lines.length; i++) {
    if (!marker.test(lines[i].trim())) continue
    let j = i + 1
    while (j < lines.length && /^#/.test(lines[j])) j++
    lines.splice(i, j - i)
    removed++
    i--
  }
  return { text: removed ? lines.join('\n') : String(text), removed }
}

/**
 * 把插件与两行 patch 落进 profile（幂等；源文件每次启动覆盖 ⇒ 客户端升级即生效）。
 * @param {{home:string, srcDir:string, log?:(m:string)=>void}} o
 * @returns {{ok:boolean, pluginDir?:string, wrote?:boolean, serviceRow?:boolean, bridgeRow?:boolean, skipped?:string[], why?:string}}
 */
function ensureAuthBridge(o) {
  const { home, srcDir } = o || {}
  const log = (o && o.log) || (() => {})
  if (!home || !srcDir) return { ok: false, why: 'ensureAuthBridge 需要 { home, srcDir }' }

  const webDir = path.join(home, 'profiles', 'web')
  const skipped = []
  try {
    /* ① 落位插件（先落位再写 patch：patch 里的名字必须解析得到） */
    const dest = path.join(webDir, 'node_modules', PLUGIN_ID)
    fs.mkdirSync(dest, { recursive: true })
    for (const f of PLUGIN_FILES) {
      const s = path.join(srcDir, f)
      if (!fs.existsSync(s)) return { ok: false, why: '插件源缺文件：' + s }
      fs.copyFileSync(s, path.join(dest, f))
    }

    /* ② 逐个确认"写了之后宿主能不能解析"——解析不到就不写那一行（见文件头 fail-soft 铁律） */
    const canService = !!resolvableFrom(SERVICE_NAME, webDir)
    if (!canService) skipped.push(SERVICE_NAME + '（运行时里没有这个包）')
    const canBridge = !!resolvableFrom(PLUGIN_ID, webDir)
    if (!canBridge) skipped.push(PLUGIN_ID + '（刚复制过去却解析不到？）')

    const patchPath = path.join(webDir, 'cordis.patch.yml')
    let text = fs.existsSync(patchPath)
      ? fs.readFileSync(patchPath, 'utf8')
      : '# dsh profile patch（由 AKDAgent 客户端维护；用户手改的部分保留）\n'
    /* ⛔ 先清掉"被消毒器误注释"的**我们自己**那条（2026-10-07 真机事故，详见 dsh-home.js 的
     *   `patchNameResolvable` 注释）：消毒器曾把 profile 本地插件判成"运行时不存在"⇒ 注释掉整块，
     *   而下面那两个正则**能匹配到注释行** ⇒ 永不补回。这里删掉标记行与它后面那段注释，
     *   再走常规路径重新追加一行 ⇒ 已经中招的机器**下次启动自愈**。 */
    const fixedService = stripDisabledBlock(text, SERVICE_ID)
    const fixedBridge = stripDisabledBlock(text, PLUGIN_ID)
    text = fixedBridge.text
    const repaired = fixedService.removed + fixedBridge.removed
    /* ⚠️ 判据必须**只认活着的行**（行首的 `- id:`）：注释行里有同样的字样，用子串判断会永远认为"已经有了" */
    const active = (id) => new RegExp('^\\s*-\\s*id:\\s*' + id + '\\b', 'm').test(text)
    const hasService = active(SERVICE_ID)
    const hasBridge = active(PLUGIN_ID)
    const needService = canService && !hasService
    const needBridge = canBridge && !hasBridge
    if (repaired) log(`[akdagent] 订阅登录：修好了被误注释的 patch 条目 ×${repaired}（消毒器口径已一并修正）`)

    if (needService || needBridge || repaired) {
      const lines = [
        '',
        '# AKDAgent：订阅登录（ctx.authorization）—— 由客户端启动时自动写入。',
        '#   服务那行是**必须的**：不挂服务，pi-ai 的登录流一条都不会注册（且不报错）。',
        '#   插件那行是我们的只读快照桥（把可登录的清单写成 <DSH_HOME>/auth-bridge/flows.json 给客户端读）。',
        '- insert:',
      ]
      if (needService) lines.push(`    - id: ${SERVICE_ID}`, `      name: '${SERVICE_NAME}'`)
      if (needBridge) {
        lines.push(
          `    - id: ${PLUGIN_ID}`,
          `      name: '${PLUGIN_ID}'`,
          '      config:',
          `        outDir: '${path.join(home, 'auth-bridge').replace(/\\/g, '/')}'`
        )
      }
      lines.push('')
      if (fs.existsSync(patchPath)) fs.copyFileSync(patchPath, patchPath + '.bak-authbridge')
      fs.writeFileSync(patchPath, text.replace(/\s*$/, '') + '\n' + lines.join('\n'), 'utf8')
      log(`[akdagent] 订阅登录已写入 profile：服务 ${needService ? '✓' : '·'} · 插件 ${needBridge ? '✓' : '·'}`)
    } else if (!hasService && !canService) {
      log('[akdagent] 订阅登录：运行时里没有 dsh-authorization ⇒ 本次不写（不会影响宿主启动）')
    }
    if (skipped.length) log('[akdagent] 订阅登录跳过：' + skipped.join(' · '))
    return { ok: true, pluginDir: dest, wrote: needService || needBridge, serviceRow: needService, bridgeRow: needBridge, skipped }
  } catch (e) {
    return { ok: false, why: (e && e.message) || String(e), skipped }
  }
}

/**
 * 读插件写的快照。
 * @param {string} home DSH home
 * @param {{now?:number, staleMs?:number}} [opts]
 * @returns {{ok:boolean, state?:string, at?:string, ageMs?:number|null, stale?:boolean, count?:number, flows?:unknown[], why?:string, path?:string}}
 */
function readAuthFlows(home, opts) {
  const now = (opts && opts.now) || Date.now()
  const staleMs = (opts && opts.staleMs) || 20000
  const p = path.join(home, 'auth-bridge', 'flows.json')
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    return { ok: false, why: e && e.code === 'ENOENT' ? 'no-file' : String((e && e.message) || e), path: p }
  }
  try {
    const j = JSON.parse(raw)
    const at = Date.parse(String(j.at || '')) || 0
    const ageMs = at ? Math.max(0, now - at) : null
    return {
      ok: true,
      state: typeof j.state === 'string' ? j.state : 'unknown',
      at: j.at || null,
      ageMs,
      stale: ageMs === null ? true : ageMs > staleMs,
      count: Number.isFinite(j.count) ? j.count : (Array.isArray(j.flows) ? j.flows.length : 0),
      flows: Array.isArray(j.flows) ? j.flows : [],
      why: typeof j.why === 'string' ? j.why : '',
      path: p,
    }
  } catch (e) {
    return { ok: false, why: 'parse: ' + String((e && e.message) || e), path: p }
  }
}

/**
 * 读宿主插件写的**当前这次登录尝试**（`<home>/auth-bridge/attempt.json`）。
 * 界面就照这个渲染：notices（要显示 message/url/code）+ prompts/awaiting（要问用户）。
 * @param {string} home
 * @returns {{ok:boolean, state?:string, key?:string, label?:string, method?:string, notices?:unknown[], prompts?:unknown[], awaiting?:unknown|null, error?:string, at?:string, ageMs?:number|null, why?:string, path?:string}}
 */
function readAuthAttempt(home) {
  const p = path.join(home, 'auth-bridge', 'attempt.json')
  let raw
  try { raw = fs.readFileSync(p, 'utf8') } catch (e) {
    return { ok: false, why: e && e.code === 'ENOENT' ? 'no-file' : String((e && e.message) || e), path: p }
  }
  try {
    const j = JSON.parse(raw)
    const at = Date.parse(String(j.at || '')) || 0
    return {
      ok: true,
      state: typeof j.state === 'string' ? j.state : 'unknown',
      key: j.key || '', label: j.label || '', method: j.method || '',
      notices: Array.isArray(j.notices) ? j.notices : [],
      prompts: Array.isArray(j.prompts) ? j.prompts : [],
      awaiting: j.awaiting && typeof j.awaiting === 'object' ? j.awaiting : null,
      error: typeof j.error === 'string' ? j.error : '',
      at: j.at || null,
      ageMs: at ? Math.max(0, Date.now() - at) : null,
      path: p,
    }
  } catch (e) {
    return { ok: false, why: 'parse: ' + String((e && e.message) || e), path: p }
  }
}

/**
 * 给宿主插件下一条命令（`<home>/auth-bridge/cmd.json`，单槽位、按递增 `id` 去重）。
 * 插件 400ms 轮询一次；`answer` 的 value 会被插件**消费后立刻清空**（secret 不留盘）。
 * @param {string} home
 * @param {'begin'|'answer'|'cancel'} op
 * @param {Record<string, unknown>} [extra] begin: {key, method} · answer: {promptId, value}
 * @returns {{ok:boolean, cmd?:object, why?:string}}
 */
function writeAuthCmd(home, op, extra) {
  const dir = path.join(home, 'auth-bridge')
  const file = path.join(dir, 'cmd.json')
  try {
    let prevId = 0
    try { prevId = Number(JSON.parse(fs.readFileSync(file, 'utf8')).id) || 0 } catch { /* 首次/坏文件都从 0 起 */ }
    const cmd = { id: prevId + 1, op, at: new Date().toISOString(), ...(extra || {}) }
    fs.mkdirSync(dir, { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(cmd, null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return { ok: true, cmd }
  } catch (e) {
    return { ok: false, why: (e && e.message) || String(e) }
  }
}

/** 一次读齐：可登录清单 + 当前尝试（界面一次 IPC 拿全，少一次竞态）。 */
function readAuthState(home, opts) {
  return { ok: true, flows: readAuthFlows(home, opts), attempt: readAuthAttempt(home) }
}

module.exports = { ensureAuthBridge, readAuthFlows, resolvableFrom, readAuthAttempt, writeAuthCmd, readAuthState, PLUGIN_ID, SERVICE_ID, SERVICE_NAME }
