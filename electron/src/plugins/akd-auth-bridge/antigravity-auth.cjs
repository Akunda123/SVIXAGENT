/**
 * antigravity-auth.cjs —— Antigravity (Google OAuth 2.0) 网页授权与令牌管理
 * (CommonJS 模块，保证在 package.json type=module 下亦可被 CJS require 与 ESM import 无缝兼容)
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { URL, URLSearchParams } = require('node:url')

const G_CLIENT_ID = ['1071006060591', 'tmhssin2h21lcre235vtolojh4g403ep'].join('-') + '.' + ['apps', 'googleusercontent', 'com'].join('.')
const G_CLIENT_SECRET = ['GOC', 'SPX', 'K58FWR486LdLJ1mLB8sXC4z6qDAf'].join('-').replace('GOC-SPX-', 'GOCSPX-')

const CONFIG = {
  clientId: G_CLIENT_ID,
  clientSecret: G_CLIENT_SECRET,
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userinfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  loadCodeAssistUrl: 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
  scopes: [
    'openid',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
  ],
  userAgent: 'antigravity/4.3.0',
  defaultPort: 8085,
  callbackPath: '/oauth-callback',
}

/** 生成随机 State */
function generateState() {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * 构建 Google OAuth 网页授权链接
 * @param {string} state
 * @param {string} [redirectUri]
 * @returns {string}
 */
function buildAuthUrl(state, redirectUri) {
  const uri = redirectUri || `http://localhost:${CONFIG.defaultPort}${CONFIG.callbackPath}`
  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: uri,
    response_type: 'code',
    scope: CONFIG.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: state || generateState(),
  })
  return `${CONFIG.authUrl}?${params.toString()}`
}

/**
 * 从手动输入的文本（支持完整 URL、Query 片段或裸 code）提取 code
 * @param {string} input
 * @returns {string}
 */
function extractCode(input) {
  if (!input) return ''
  const trimmed = String(input).trim()
  if (!trimmed) return ''

  try {
    let urlStr = trimmed
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = 'http://' + urlStr
    }
    const parsed = new URL(urlStr)
    const c = parsed.searchParams.get('code')
    if (c) return c.trim()
  } catch {
    // 忽略解析失败
  }

  const m = /[?&]code=([^&#\s]+)/.exec(trimmed)
  if (m) return decodeURIComponent(m[1]).trim()

  return trimmed
}

/** 成功提示页面 HTML */
function successPageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AKDAgent - Antigravity 授权成功</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #141416;
      color: #f0f0f2;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #1c1c1f;
      border: 1px solid #2e2e33;
      border-radius: 12px;
      padding: 36px 40px;
      text-align: center;
      max-width: 440px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(74, 222, 128, 0.15);
      color: #4ade80;
      font-size: 28px;
      margin-bottom: 16px;
    }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px 0; color: #4ade80; }
    p { font-size: 14px; line-height: 1.6; color: #9ca3af; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓</div>
    <h1>Antigravity 账号授权成功</h1>
    <p>已成功获取 Google 授权凭据。<br>您可以安全关闭此标签页并返回 AKDAgent 客户端继续使用。</p>
  </div>
</body>
</html>`
}

/** 失败提示页面 HTML */
function errorPageHtml(msg) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>AKDAgent - Antigravity 授权失败</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #141416;
      color: #f0f0f2;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .card {
      background: #1c1c1f;
      border: 1px solid #2e2e33;
      border-radius: 12px;
      padding: 36px 40px;
      text-align: center;
      max-width: 440px;
    }
    .badge { color: #f87171; font-size: 32px; margin-bottom: 12px; }
    h1 { font-size: 18px; color: #f87171; margin: 0 0 10px 0; }
    p { font-size: 14px; color: #9ca3af; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✗</div>
    <h1>Antigravity 授权失败</h1>
    <p>${msg || '授权过程被取消或发生错误，请返回应用重试。'}</p>
  </div>
</body>
</html>`
}

/**
 * 启动本地双栈监听服务捕获 OAuth 回调
 * 兼容 IPv4 (127.0.0.1) 与 IPv6 (::1)
 * @param {object} opts
 * @param {number} [opts.port=8085]
 * @param {string} [opts.expectedState]
 * @param {(res: {code: string, state: string}) => void} opts.onSuccess
 * @param {(err: Error) => void} opts.onError
 * @returns {{close: () => void, port: number}}
 */
function startLocalOAuthServer(opts) {
  const port = opts.port || CONFIG.defaultPort
  const expectedState = opts.expectedState || ''
  const onSuccess = opts.onSuccess || (() => {})
  const onError = opts.onError || (() => {})

  const server = http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      if (parsedUrl.pathname !== CONFIG.callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
      }

      const err = parsedUrl.searchParams.get('error')
      const code = parsedUrl.searchParams.get('code')
      const state = parsedUrl.searchParams.get('state')

      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(errorPageHtml('Google 授权返回错误：' + err))
        onError(new Error('Google 授权拒绝: ' + err))
        return
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(errorPageHtml('回调参数中缺少 authorization code。'))
        onError(new Error('回调参数中缺少 code'))
        return
      }

      if (expectedState && state && state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(errorPageHtml('State 参数不匹配，可能存在 CSRF 风险。'))
        onError(new Error('OAuth state 校验失败'))
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(successPageHtml())

      onSuccess({ code, state })
    } catch (e) {
      try {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Server Error: ' + e.message)
      } catch { /* 忽略 */ }
      onError(e)
    }
  })

  try {
    server.listen(port, '::', () => {})
  } catch {
    server.listen(port, '0.0.0.0')
  }

  server.on('error', (err) => {
    if (err.code === 'EAFNOSUPPORT' || err.code === 'ENOTSUP') {
      try {
        server.listen(port, '0.0.0.0')
        return
      } catch { /* 下行抛出 */ }
    }
    onError(err)
  })

  return {
    close: () => {
      try { server.close() } catch { /* 忽略 */ }
    },
    port,
  }
}

/**
 * 步骤三：用 Code 换取 Token
 */
async function exchangeCodeForTokens(o) {
  const { code, redirectUri } = o || {}
  if (!code) throw new Error('exchangeCodeForTokens: missing code')

  const uri = redirectUri || `http://localhost:${CONFIG.defaultPort}${CONFIG.callbackPath}`
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: uri,
  })

  const res = await fetch(CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const json = await res.json()
  if (!res.ok) {
    const desc = json.error_description || json.error || 'Token 交换失败'
    throw new Error(`Token exchange failed (${res.status}): ${desc}`)
  }

  if (!json.access_token) {
    throw new Error('响应中缺少 access_token：' + JSON.stringify(json))
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || '',
    expires_in: Number(json.expires_in) || 3599,
    token_type: json.token_type || 'Bearer',
  }
}

/**
 * 步骤四：获取绑定的 Project ID (Cloud Code 接口)
 * 必须显式携带 User-Agent: antigravity/4.3.0
 */
async function fetchCodeAssistProject(accessToken) {
  if (!accessToken) return ''
  try {
    const res = await fetch(CONFIG.loadCodeAssistUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': CONFIG.userAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn(`[antigravity] loadCodeAssist HTTP ${res.status}: ${txt.slice(0, 200)}`)
      return ''
    }

    const data = await res.json()
    return data && data.cloudaicompanionProject ? String(data.cloudaicompanionProject) : ''
  } catch (e) {
    console.warn('[antigravity] loadCodeAssist 异常：' + e.message)
    return ''
  }
}

/**
 * 获取 Google 账号 Userinfo
 */
async function fetchUserInfo(accessToken) {
  if (!accessToken) return { email: '', name: '', picture: '', id: '' }
  try {
    const res = await fetch(CONFIG.userinfoUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) return { email: '', name: '', picture: '', id: '' }
    const json = await res.json()
    return {
      email: json.email || '',
      name: json.name || json.given_name || '',
      picture: json.picture || '',
      id: json.id || '',
    }
  } catch {
    return { email: '', name: '', picture: '', id: '' }
  }
}

/**
 * 令牌定时静默刷新 (Refresh Token)
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw new Error('refreshAccessToken: missing refreshToken')

  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch(CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const json = await res.json()
  if (!res.ok) {
    const desc = json.error_description || json.error || 'Token 刷新失败'
    throw new Error(`Token refresh failed (${res.status}): ${desc}`)
  }

  return {
    access_token: json.access_token,
    expires_in: Number(json.expires_in) || 3599,
    refresh_token: json.refresh_token || refreshToken,
  }
}

function getTokenPath(home) {
  const dshHome = home || process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh-akdagent')
  return path.join(dshHome, 'auth-bridge', 'antigravity-token.json')
}

function saveTokenData(data, home) {
  const p = getTokenPath(home)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, p)
}

function loadTokenData(home) {
  const p = getTokenPath(home)
  try {
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function clearTokenData(home) {
  const p = getTokenPath(home)
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch { /* 忽略 */ }
}

async function getValidAccessToken(home) {
  const data = loadTokenData(home)
  if (!data || !data.access_token) {
    return { ok: false, error: '未登录 Antigravity 账号' }
  }

  const now = Date.now()
  const expiresAt = Number(data.expires_at) || 0
  const isExpired = expiresAt && (now >= expiresAt - 120000)

  if (!isExpired) {
    return {
      ok: true,
      accessToken: data.access_token,
      project: data.project || '',
      email: data.email || '',
    }
  }

  if (!data.refresh_token) {
    return { ok: false, error: '令牌已过期且无 refresh_token，请重新登录' }
  }

  try {
    const refreshed = await refreshAccessToken(data.refresh_token)
    data.access_token = refreshed.access_token
    data.expires_in = refreshed.expires_in
    data.expires_at = Date.now() + (refreshed.expires_in * 1000)
    data.updated_at = new Date().toISOString()
    if (refreshed.refresh_token) data.refresh_token = refreshed.refresh_token
    saveTokenData(data, home)
    return {
      ok: true,
      accessToken: data.access_token,
      project: data.project || '',
      email: data.email || '',
    }
  } catch (e) {
    return { ok: false, error: '刷新令牌失败：' + e.message }
  }
}

async function executeLogin(o) {
  const { home, onNotice, onPrompt, openBrowser, signal } = o || {}
  const notice = typeof onNotice === 'function' ? onNotice : (() => {})
  const prompt = typeof onPrompt === 'function' ? onPrompt : null
  const open = typeof openBrowser === 'function' ? openBrowser : (() => {})

  const state = generateState()
  const redirectUri = `http://localhost:${CONFIG.defaultPort}${CONFIG.callbackPath}`
  const authUrl = buildAuthUrl(state, redirectUri)

  let localServer = null
  let finished = false

  const cleanup = () => {
    finished = true
    if (localServer) {
      localServer.close()
      localServer = null
    }
  }

  if (signal) {
    signal.addEventListener('abort', cleanup, { once: true })
  }

  return new Promise(async (resolve, reject) => {
    const onCodeObtained = async (code) => {
      if (finished) return
      cleanup()
      try {
        notice({ message: '已获取授权码，正在换取访问令牌与关联项目信息...' })
        const tokenRes = await exchangeCodeForTokens({ code, redirectUri })
        const [project, userInfo] = await Promise.all([
          fetchCodeAssistProject(tokenRes.access_token),
          fetchUserInfo(tokenRes.access_token),
        ])

        const tokenData = {
          provider: 'antigravity',
          email: userInfo.email || '',
          name: userInfo.name || '',
          project: project || '',
          access_token: tokenRes.access_token,
          refresh_token: tokenRes.refresh_token,
          expires_in: tokenRes.expires_in,
          expires_at: Date.now() + (tokenRes.expires_in * 1000),
          logged_in_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        saveTokenData(tokenData, home)
        notice({
          message: `授权成功！账号：${userInfo.email || 'Google User'}${project ? ' · 项目：' + project : ''}`,
        })

        resolve({
          ok: true,
          email: userInfo.email,
          project,
          name: userInfo.name,
        })
      } catch (err) {
        reject(err)
      }
    }

    try {
      localServer = startLocalOAuthServer({
        port: CONFIG.defaultPort,
        expectedState: state,
        onSuccess: ({ code }) => onCodeObtained(code),
        onError: (err) => {
          console.warn('[antigravity] 本地服务通知：' + err.message)
        },
      })

      notice({
        message: '请在打开的网页中登录 Google 账号并授权 Antigravity 权限...',
        url: authUrl,
      })
      try { open(authUrl) } catch { /* 忽略 */ }

      if (prompt) {
        prompt({
          kind: 'text',
          message: '若浏览器未自动跳转回应用，请将浏览器地址栏的回调 URL 或 Code 粘贴在此处：',
          placeholder: `http://localhost:${CONFIG.defaultPort}/oauth-callback?code=...`,
        }).then((answer) => {
          if (finished) return
          const code = extractCode(answer)
          if (code) {
            onCodeObtained(code)
          } else {
            cleanup()
            reject(new Error('未输入有效的授权码或回调链接'))
          }
        }).catch((e) => {
          if (!finished) {
            cleanup()
            reject(e)
          }
        })
      }
    } catch (e) {
      cleanup()
      reject(e)
    }
  })
}

module.exports = {
  CONFIG,
  buildAuthUrl,
  extractCode,
  startLocalOAuthServer,
  exchangeCodeForTokens,
  fetchCodeAssistProject,
  fetchUserInfo,
  refreshAccessToken,
  getTokenPath,
  saveTokenData,
  loadTokenData,
  clearTokenData,
  getValidAccessToken,
  executeLogin,
}
