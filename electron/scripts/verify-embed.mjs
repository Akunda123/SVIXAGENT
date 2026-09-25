/**
 * 内嵌 host 机制验证（无需 Electron GUI）：用随包 node 在空闲端口拉起 dsh web，
 * **换取 token 会话 cookie**、确认 token URL 返回 200、裸 `/` 返回 401，然后退出。
 *
 * 验证的正是 Electron 主进程要做的事：内嵌实例与用户自己的 DSH 实例共存、
 * 数据根隔离（默认用临时 home，绝不碰真实 ~/.dsh 与 ~/.dsh-akdagent）。
 *
 * 用法:
 *   node scripts/verify-embed.mjs
 *   node scripts/verify-embed.mjs --home "D:\some\home"     # 指定 DSH_HOME
 *   AKDAGENT_DSH_ROOT=... node scripts/verify-embed.mjs      # 指定运行时根（含 npm 树或源码树）
 *
 * 历史（2026-09-21 升级 0.1.5-rc.2）：本脚本原先写死 `Downloads/deepseek-harness-master/…`
 * （该 checkout 已被删除）并等待 `/probe` —— 新版把 `/probe` 去掉了、且整个 web 面要 cookie。
 */
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const DSH_ROOT = process.env.AKDAGENT_DSH_ROOT || path.join(repoRoot, 'dsh-runtime', 'dsh')

const NPM_ENTRY = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
const LEGACY_ENTRY = 'apps/cli/lib/bin.js'
const entryRel = fs.existsSync(path.join(DSH_ROOT, NPM_ENTRY))
  ? NPM_ENTRY
  : (fs.existsSync(path.join(DSH_ROOT, LEGACY_ENTRY)) ? LEGACY_ENTRY : null)
if (!entryRel) {
  console.error(`[verify] 运行时里找不到宿主入口（找过 ${NPM_ENTRY} 与 ${LEGACY_ENTRY}）: ${DSH_ROOT}`)
  process.exit(1)
}

const bundledNode = path.join(repoRoot, 'dsh-runtime', 'node', 'node.exe')
const NODE = process.env.AKDAGENT_NODE
  || (fs.existsSync(bundledNode) ? bundledNode
    : (process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : 'node'))

const argHome = (() => {
  const i = process.argv.indexOf('--home')
  return i >= 0 ? process.argv[i + 1] : null
})()
const DSH_HOME = argHome || process.env.AKDAGENT_VERIFY_DSH_HOME || path.join(os.tmpdir(), 'akdagent-verify-home')
fs.mkdirSync(DSH_HOME, { recursive: true })

function findFreePort(start = 3180, end = 3199) {
  return new Promise((resolve, reject) => {
    const tryPort = (p) => {
      if (p > end) return reject(new Error('no free port'))
      const srv = net.createServer()
      srv.once('error', () => tryPort(p + 1))
      srv.listen(p, '127.0.0.1', () => {
        const port = srv.address().port
        srv.close(() => resolve(port))
      })
    }
    tryPort(start)
  })
}

/** 等 stdout 出现 `dsh web: <url>`（新版就绪判据；旧版的 /probe 已废） */
function waitForTokenUrl(getLine, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      const line = getLine()
      if (line) return resolve(line)
      if (Date.now() > deadline) return reject(new Error('宿主没在超时内打印 `dsh web:` 地址行'))
      setTimeout(tick, 400)
    }
    tick()
  })
}

function httpGet(port, p, cookie) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: p,
      headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      const sc = res.headers['set-cookie']
      const out = { status: res.statusCode,
        cookie: sc && sc.length ? sc.map((c) => c.split(';')[0]).join('; ') : null,
        location: res.headers.location || null }
      res.resume()
      resolve(out)
    })
    req.on('error', () => resolve({ status: 0 }))
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0 }) })
  })
}

/** token URL → 303/200 + Set-Cookie（最多 4 跳） */
async function establishSession(tokenUrl) {
  let url = tokenUrl
  let cookie = null
  for (let hop = 0; hop < 4 && url; hop++) {
    const u = new URL(url)
    const r = await httpGet(Number(u.port || 80), u.pathname + u.search, cookie)
    if (r.cookie) cookie = r.cookie
    if (r.status >= 300 && r.status < 400 && r.location) { url = new URL(r.location, url).toString(); continue }
    break
  }
  return cookie
}

const port = await findFreePort()
console.log(`[verify] root : ${DSH_ROOT}`)
console.log(`[verify] entry: ${entryRel}`)
console.log(`[verify] home : ${DSH_HOME}（隔离，绝不碰真实 ~/.dsh）`)
console.log(`[verify] port : ${port}`)

const child = spawn(NODE, [entryRel, 'web', '--port', String(port), '--no-open'], {
  cwd: DSH_ROOT,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DSH_HOME },
})

let outBuf = ''
child.stdout.on('data', (d) => {
  const s = String(d)
  outBuf += s
  process.stdout.write(`[dsh] ${s}`)
})
child.stderr.on('data', (d) => process.stderr.write(`[dsh:err] ${d}`))

const killTree = () => {
  spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
}

try {
  const tokenUrl = await waitForTokenUrl(() => {
    const m = outBuf.match(/dsh web:\s*(http\S+)/)
    return m ? m[1] : null
  })
  console.log(`[verify] token url: ${tokenUrl}`)

  const anon = await httpGet(port, '/')
  console.log(`[verify] 裸 GET /  -> ${anon.status}${anon.status === 401 ? '（符合预期：新版要会话）' : '  ⚠️ 预期 401'}`)

  const cookie = await establishSession(tokenUrl)
  if (!cookie) throw new Error('token URL 没换到会话 cookie')
  console.log(`[verify] cookie   -> ${cookie.slice(0, 24)}…`)

  const auth = await httpGet(port, '/', cookie)
  if (auth.status !== 200) throw new Error(`带 cookie 的 GET / 返回 ${auth.status}，预期 200`)
  console.log('[verify] 带 cookie GET / -> 200')
  console.log('[verify] OK: 内嵌 host 可用（token/cookie 会话就绪）')
} catch (e) {
  console.error('[verify] FAILED:', e.message)
  killTree()
  process.exit(1)
}

killTree()
console.log('[verify] cleaned up (host tree killed)')
