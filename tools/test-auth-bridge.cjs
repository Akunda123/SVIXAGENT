#!/usr/bin/env node
/**
 * test-auth-bridge.cjs —— 单测：`electron/src/auth-bridge.js`（订阅登录桥的落位与读取）
 *
 * 为什么值得单测：这段代码改的是**宿主的 profile patch**，一旦写错（比如写进一个解析不到的名字）
 * 宿主会**整棵插件树加载失败**（实测 `dsh: plugin tree failed to load: … ERR_MODULE_NOT_FOUND`）
 * ⇒ App 起不来。所以这里把三条硬纪律钉住：
 *   ① 两行（服务 + 桥）都写进去；② **幂等**（重复调用不再写、也不会写重复行）；
 *   ③ **fail-soft**：运行时里没有 `@deepseek-ai/dsh-authorization` 时**绝不写那一行**。
 *
 * 用法：node tools/test-auth-bridge.cjs
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ensureAuthBridge, readAuthFlows, readAuthAttempt, writeAuthCmd, readAuthState, PLUGIN_ID, SERVICE_ID, SERVICE_NAME } = require('../electron/src/auth-bridge.js')

const SRC = path.join(__dirname, '..', 'electron', 'src', 'plugins', PLUGIN_ID)
let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name) }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 220) : '')) }
}

/** 造一个"像样"的 home：profiles/web + （可选）运行时侧的 @deepseek-ai/dsh-authorization */
function makeHome({ withService }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-auth-test-'))
  const web = path.join(home, 'profiles', 'web')
  fs.mkdirSync(web, { recursive: true })
  if (withService) {
    // 解析是从 profile 起向上找 ⇒ 放在 profiles/node_modules 与钱包一致（实测真实布局）
    const p = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-authorization')
    fs.mkdirSync(p, { recursive: true })
    fs.writeFileSync(path.join(p, 'package.json'), '{"name":"@deepseek-ai/dsh-authorization","version":"0.1.5-rc.2"}', 'utf8')
  }
  return home
}
const patchOf = (home) => {
  const p = path.join(home, 'profiles', 'web', 'cordis.patch.yml')
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}
const countOf = (text, id) => (text.match(new RegExp('id:\\s*' + id + '\\b', 'g')) || []).length
/** **活着的**条目数（行首 `- id:`；注释行不算）—— 本轮事故的核心判据 */
const activeOf = (text, id) => (text.match(new RegExp('^\\s*-\\s*id:\\s*' + id + '\\b', 'gm')) || []).length

console.log('== ① 服务在：两行都写进去 + 插件文件落位 ==')
{
  const home = makeHome({ withService: true })
  const r = ensureAuthBridge({ home, srcDir: SRC })
  ok('返回 ok', r.ok === true, r)
  ok('服务行写了', r.serviceRow === true, r)
  ok('桥行写了', r.bridgeRow === true, r)
  const patch = patchOf(home)
  ok('patch 里有 id: authorization', countOf(patch, SERVICE_ID) === 1, patch.slice(-400))
  ok('patch 里有 id: akd-auth-bridge', countOf(patch, PLUGIN_ID) === 1, patch.slice(-400))
  ok('patch 里有插件名（loader 要按名字解析）', patch.includes(`name: '${PLUGIN_ID}'`))
  ok('patch 里有 outDir 配置', /outDir:\s*'[^']*auth-bridge'/.test(patch), patch.slice(-260))
  const dest = path.join(home, 'profiles', 'web', 'node_modules', PLUGIN_ID)
  ok('插件 index.js 已落位', fs.existsSync(path.join(dest, 'index.js')))
  ok('插件 package.json 已落位', fs.existsSync(path.join(dest, 'package.json')))
  ok('插件 package.json 的 name 与目录同名', JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8')).name === PLUGIN_ID)

  console.log('== ② 幂等：再调一次不该重复写 ==')
  const r2 = ensureAuthBridge({ home, srcDir: SRC })
  ok('第二次不再写', r2.wrote === false, r2)
  const patch2 = patchOf(home)
  ok('authorization 仍只出现一次', countOf(patch2, SERVICE_ID) === 1, countOf(patch2, SERVICE_ID))
  ok('桥仍只出现一次', countOf(patch2, PLUGIN_ID) === 1, countOf(patch2, PLUGIN_ID))
  ok('没有重复追加（行数不增）', patch2.split('\n').length === patch.split('\n').length)
  fs.rmSync(home, { recursive: true, force: true })
}

console.log('== ③ fail-soft：运行时里没有那个服务包 ⇒ 绝不写服务那一行 ==')
{
  const home = makeHome({ withService: false })
  const r = ensureAuthBridge({ home, srcDir: SRC })
  ok('返回 ok（不抛）', r.ok === true, r)
  ok('服务行**没写**', r.serviceRow === false, r)
  ok('桥行照写', r.bridgeRow === true, r)
  const patch = patchOf(home)
  ok('patch 里**没有** authorization（否则宿主起不来）', countOf(patch, SERVICE_ID) === 0, patch.slice(-300))
  ok('skipped 里点名了缺的包', (r.skipped || []).join(' ').includes(SERVICE_NAME), r.skipped)
  fs.rmSync(home, { recursive: true, force: true })
}

console.log('== ④ readAuthFlows：缺文件 / 正常 / 过期 ==')
{
  const home = makeHome({ withService: false })
  const miss = readAuthFlows(home)
  ok('缺文件时 ok=false 且 why=no-file', miss.ok === false && miss.why === 'no-file', miss)

  const dir = path.join(home, 'auth-bridge')
  fs.mkdirSync(dir, { recursive: true })
  const at = '2026-10-06T12:00:00.000Z'
  fs.writeFileSync(path.join(dir, 'flows.json'), JSON.stringify({
    state: 'ok', tag: 'poll', at, count: 2,
    flows: [
      { key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', inFlight: false, methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }] },
      { key: 'llm-pi-ai/anthropic', label: 'Anthropic', inFlight: true, methods: [{ id: 'oauth', label: 'x' }, { id: 'api-key', label: 'y' }] },
    ],
  }), 'utf8')
  const fresh = readAuthFlows(home, { now: Date.parse(at) + 3000, staleMs: 20000 })
  ok('正常读：ok/count/flows 对', fresh.ok === true && fresh.count === 2 && fresh.flows.length === 2, fresh)
  ok('刚写的：stale=false', fresh.stale === false, fresh)
  ok('保留了 label / methods / inFlight', fresh.flows[1].inFlight === true && fresh.flows[1].methods.length === 2, fresh.flows[1])
  const stale = readAuthFlows(home, { now: Date.parse(at) + 60000, staleMs: 20000 })
  ok('过了 staleMs：stale=true', stale.stale === true, stale)

  fs.writeFileSync(path.join(dir, 'flows.json'), '{ 坏 JSON', 'utf8')
  const bad = readAuthFlows(home)
  ok('坏 JSON 不抛、如实报', bad.ok === false && String(bad.why).startsWith('parse:'), bad)
  fs.rmSync(home, { recursive: true, force: true })
}

console.log('== ⑤ 命令通道：writeAuthCmd（递增 id / 原子写）与 readAuthAttempt ==')
{
  const home = makeHome({ withService: false })
  const a = writeAuthCmd(home, 'begin', { key: 'llm-pi-ai/openai-codex', method: 'oauth' })
  const b = writeAuthCmd(home, 'answer', { promptId: 'p1', value: 'x' })
  const c = writeAuthCmd(home, 'cancel', {})
  ok('三次都成功', a.ok && b.ok && c.ok, { a, b, c })
  ok('id 递增 1/2/3', a.cmd.id === 1 && b.cmd.id === 2 && c.cmd.id === 3, [a.cmd.id, b.cmd.id, c.cmd.id])
  const onDisk = JSON.parse(fs.readFileSync(path.join(home, 'auth-bridge', 'cmd.json'), 'utf8'))
  ok('盘上是最后一条（单槽位）', onDisk.op === 'cancel' && onDisk.id === 3, onDisk)
  ok('带上了 at 时间戳', typeof onDisk.at === 'string' && onDisk.at.length > 10)

  const miss = readAuthAttempt(home)
  ok('没有 attempt.json 时 ok=false / no-file', miss.ok === false && miss.why === 'no-file', miss)

  fs.writeFileSync(path.join(home, 'auth-bridge', 'attempt.json'), JSON.stringify({
    id: 3, key: 'llm-pi-ai/github-copilot', label: 'GitHub Copilot', method: 'oauth', state: 'running',
    notices: [{ message: 'Enter this code…', url: 'https://github.com/login/device', code: 'SIMU-1234', at: new Date().toISOString() }],
    prompts: [{ id: 'p1', kind: 'text', message: 'Enterprise URL/domain', options: [], answer: '', at: new Date().toISOString() }],
    awaiting: { id: 'p1', kind: 'text', message: 'Enterprise URL/domain', options: [] },
    error: '', at: new Date().toISOString(),
  }), 'utf8')
  const at = readAuthAttempt(home)
  ok('attempt 解析：state/key/label', at.ok && at.state === 'running' && at.key === 'llm-pi-ai/github-copilot' && at.label === 'GitHub Copilot', at)
  ok('notices 三件套在（message/url/code）', at.notices[0].message && at.notices[0].url && at.notices[0].code, at.notices[0])
  ok('awaiting 在（界面要据此提问）', at.awaiting && at.awaiting.id === 'p1' && at.awaiting.kind === 'text', at.awaiting)

  const both = readAuthState(home)
  ok('readAuthState 一次给齐 flows + attempt', both.ok && both.flows && both.attempt, Object.keys(both))
  fs.rmSync(home, { recursive: true, force: true })
}

console.log('== ⑥ 真机事故回归（2026-10-07）：被消毒器误注释的条目要**自愈**，注释行不许算"已存在" ==')
{
  const home = makeHome({ withService: true })
  const web = path.join(home, 'profiles', 'web')
  /* 下面这段是**用户机器上抓到的原文**（`~/.dsh-akdagent/profiles/web/cordis.patch.yml` 尾部）：
   * 授权服务那行活着，我们插件那行被消毒器注释掉了（根因见 dsh-home.js 的 patchNameResolvable 注释）。 */
  const realTail = [
    '',
    '# AKDAgent：订阅登录（ctx.authorization）—— 由客户端启动时自动写入。',
    '- insert:',
    `    - id: ${SERVICE_ID}`,
    `      name: '${SERVICE_NAME}'`,
    `# [akdagent] 已停用（当前运行时没有 ${PLUGIN_ID}）`,
    `#     - id: ${PLUGIN_ID}`,
    `#       name: '${PLUGIN_ID}'`,
    '#       config:',
    `#         outDir: '${path.join(home, 'auth-bridge').replace(/\\/g, '/')}'`,
    '# ',
    '',
  ].join('\n')
  fs.mkdirSync(web, { recursive: true })
  fs.writeFileSync(path.join(web, 'cordis.patch.yml'), realTail, 'utf8')

  const r = ensureAuthBridge({ home, srcDir: SRC })
  const patch = patchOf(home)
  ok('返回 ok', r.ok === true, r)
  ok('桥行被补回（bridgeRow=true）', r.bridgeRow === true, r)
  ok('标记行被清掉', !patch.includes('已停用（当前运行时没有 ' + PLUGIN_ID + '）'), patch.slice(-300))
  ok('注释副本没留下', !/^#\s+- id:\s*akd-auth-bridge/m.test(patch), patch.slice(-300))
  ok('活着的桥行 = 1', activeOf(patch, PLUGIN_ID) === 1, activeOf(patch, PLUGIN_ID))
  ok('活着的服务行仍 = 1（没被重复写）', activeOf(patch, SERVICE_ID) === 1, activeOf(patch, SERVICE_ID))
  ok('改 patch 前留了备份 .bak-authbridge', fs.existsSync(path.join(web, 'cordis.patch.yml.bak-authbridge')))
  const r2 = ensureAuthBridge({ home, srcDir: SRC })
  ok('再调一次仍幂等（不再写）', r2.wrote === false, r2)
  fs.rmSync(home, { recursive: true, force: true })
}

console.log('== ⑦ 事故根因：profile 本地的**裸名**插件不许被消毒器停用 ==')
{
  const { patchNameResolvable, sanitizePatchLayer } = require('../electron/src/dsh-home.js')
  const home = makeHome({ withService: true })
  const web = path.join(home, 'profiles', 'web')
  const fakeRuntime = path.join(home, 'dsh-runtime')       // 假 runtime：里面**没有**我们的插件
  fs.mkdirSync(path.join(fakeRuntime, 'node_modules'), { recursive: true })
  const plug = path.join(web, 'node_modules', PLUGIN_ID)
  fs.mkdirSync(plug, { recursive: true })
  fs.writeFileSync(path.join(plug, 'package.json'), '{"name":"' + PLUGIN_ID + '","type":"module"}', 'utf8')

  ok('裸名只在 profile 的 node_modules ⇒ 可解析', patchNameResolvable(PLUGIN_ID, web, fakeRuntime) === true)
  ok('裸名两处都没有 ⇒ 不可解析', patchNameResolvable('no-such-plugin-xyz', web, fakeRuntime) === false)
  ok('相对路径名照旧按 profile 解析', patchNameResolvable('./plugins/ide-context-injector.ts', web, fakeRuntime) === false)
  ok('scope 名在 runtime 侧 ⇒ 可解析', patchNameResolvable(SERVICE_NAME, web, path.join(home, 'profiles')) === true)

  fs.writeFileSync(path.join(web, 'cordis.patch.yml'), [
    '- insert:',
    `    - id: ${PLUGIN_ID}`,
    `      name: '${PLUGIN_ID}'`,
    '',
  ].join('\n'), 'utf8')
  const out = sanitizePatchLayer(web, fakeRuntime)
  ok('消毒器**没有**停用这一条', Array.isArray(out.disabled) && out.disabled.length === 0, out)
  ok('文件里没有"已停用"标记', !patchOf(home).includes('已停用'), patchOf(home))
  ok('活着的桥行还在', activeOf(patchOf(home), PLUGIN_ID) === 1, activeOf(patchOf(home), PLUGIN_ID))
  fs.rmSync(home, { recursive: true, force: true })
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail ? 1 : 0)
