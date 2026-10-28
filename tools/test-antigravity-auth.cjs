#!/usr/bin/env node
/**
 * test-antigravity-auth.cjs —— 单元测试：Antigravity (Google OAuth 2.0) 授权模块
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const ag = require('../electron/src/antigravity-auth.js')

let pass = 0
let fail = 0

function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  [ok]   ' + name)
  } else {
    fail++
    console.log('  [FAIL] ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''))
  }
}

async function run() {
  console.log('== ① 核心配置与授权 URL 构建 ==')
  {
    ok('配置存在', !!ag.CONFIG)
    ok('Client ID 正确', !!ag.CONFIG.clientId && ag.CONFIG.clientId.includes('apps.googleusercontent.com'))
    ok('Client Secret 正确', !!ag.CONFIG.clientSecret && ag.CONFIG.clientSecret.startsWith('GOCSPX-'))
    ok('User-Agent 伪装正确', ag.CONFIG.userAgent === 'antigravity/4.3.0')
    ok('默认端口为 8085', ag.CONFIG.defaultPort === 8085)
    ok('回调路径为 /oauth-callback', ag.CONFIG.callbackPath === '/oauth-callback')

    const authUrl = ag.buildAuthUrl('test-state-123')
    ok('包含 Auth URL', authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'))
    ok('包含 client_id', authUrl.includes('client_id=' + encodeURIComponent(ag.CONFIG.clientId)))
    ok('包含 redirect_uri', authUrl.includes('redirect_uri=' + encodeURIComponent('http://localhost:8085/oauth-callback')))
    ok('包含 response_type=code', authUrl.includes('response_type=code'))
    ok('包含 access_type=offline (用于获取 refresh_token)', authUrl.includes('access_type=offline'))
    ok('包含 prompt=consent', authUrl.includes('prompt=consent'))
    ok('包含 state', authUrl.includes('state=test-state-123'))
    ok('包含 cloud-platform scope', authUrl.includes('cloud-platform'))
    ok('包含 cclog scope', authUrl.includes('cclog'))
    ok('包含 experimentsandconfigs scope', authUrl.includes('experimentsandconfigs'))
  }

  console.log('== ② 授权码解析提取 (extractCode) ==')
  {
    ok('裸 code 提取', ag.extractCode('4/0AeanS-xyz123') === '4/0AeanS-xyz123')
    ok('带空格的裸 code 提取', ag.extractCode('  4/0AeanS-xyz123  ') === '4/0AeanS-xyz123')
    ok('完整回调 URL 提取', ag.extractCode('http://localhost:8085/oauth-callback?code=4/0AeanS-xyz123&state=abc') === '4/0AeanS-xyz123')
    ok('https URL 提取', ag.extractCode('https://localhost:8085/oauth-callback?code=4/0AeanS-xyz123') === '4/0AeanS-xyz123')
    ok('带端口无协议的 URL 提取', ag.extractCode('localhost:8085/oauth-callback?code=4%2F0AeanS-xyz123') === '4/0AeanS-xyz123')
    ok('空字符串安全处理', ag.extractCode('') === '')
    ok('null 安全处理', ag.extractCode(null) === '')
  }

  console.log('== ③ 本地双栈 HTTP 回调服务 ==')
  {
    const testPort = 18085
    let receivedCode = ''
    let receivedState = ''

    const server = ag.startLocalOAuthServer({
      port: testPort,
      expectedState: 'test-state-456',
      onSuccess: ({ code, state }) => {
        receivedCode = code
        receivedState = state
      },
      onError: (err) => {
        console.error('Test server error:', err.message)
      },
    })

    ok('服务对象包含 close 与 port', typeof server.close === 'function' && server.port === testPort)

    // 发起 HTTP 请求测试回调
    await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${testPort}/oauth-callback?code=mock-code-789&state=test-state-456`, (res) => {
        let body = ''
        res.on('data', (d) => { body += d })
        res.on('end', () => {
          ok('回调响应状态码 200', res.statusCode === 200)
          ok('返回 HTML 提示页', body.includes('Antigravity 账号授权成功'))
          resolve()
        })
      })
      req.on('error', (e) => {
        console.error('Request error:', e)
        resolve()
      })
    })

    ok('成功接收到 code', receivedCode === 'mock-code-789')
    ok('成功接收到 state', receivedState === 'test-state-456')

    server.close()
  }

  console.log('== ④ 令牌存储、读取与清理 ==')
  {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-ag-test-'))
    ok('初始状态下无凭据', ag.loadTokenData(tmpHome) === null)

    const tokenData = {
      provider: 'antigravity',
      email: 'user-mock-account',
      name: 'Test User',
      project: 'projects/1234567890',
      access_token: 'ya29.mock-access-token',
      refresh_token: '1//mock-refresh-token',
      expires_in: 3600,
      expires_at: Date.now() + 3600000,
      logged_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    ag.saveTokenData(tokenData, tmpHome)
    const loaded = ag.loadTokenData(tmpHome)
    ok('成功读取持久化凭据', !!loaded)
    ok('邮箱字段匹配', loaded.email === 'user-mock-account')
    ok('项目字段匹配', loaded.project === 'projects/1234567890')
    ok('Access Token 匹配', loaded.access_token === 'ya29.mock-access-token')
    ok('Refresh Token 匹配', loaded.refresh_token === '1//mock-refresh-token')

    const validRes = await ag.getValidAccessToken(tmpHome)
    ok('未过期令牌直接可用', validRes.ok && validRes.accessToken === 'ya29.mock-access-token')
    ok('返回的项目信息一致', validRes.project === 'projects/1234567890')

    ag.clearTokenData(tmpHome)
    ok('清除后无凭据', ag.loadTokenData(tmpHome) === null)

    fs.rmSync(tmpHome, { recursive: true, force: true })
  }

  console.log('== ⑤ 模块接口完整性 ==')
  {
    ok('executeLogin 函数存在', typeof ag.executeLogin === 'function')
    ok('exchangeCodeForTokens 函数存在', typeof ag.exchangeCodeForTokens === 'function')
    ok('fetchCodeAssistProject 函数存在', typeof ag.fetchCodeAssistProject === 'function')
    ok('fetchUserInfo 函数存在', typeof ag.fetchUserInfo === 'function')
    ok('refreshAccessToken 函数存在', typeof ag.refreshAccessToken === 'function')
  }

  console.log(`\n测试汇总: ${pass} 通过，${fail} 失败`)
  if (fail > 0) process.exit(1)
}

run().catch((err) => {
  console.error('Fatal error in tests:', err)
  process.exit(1)
})
