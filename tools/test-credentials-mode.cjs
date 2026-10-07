#!/usr/bin/env node
/**
 * test-credentials-mode.cjs —— 单测：`electron/src/dsh-home.js` 的**凭据文件权限**处理。
 *
 * 为什么值得单测（2026-10-07，mac 用户 `logic` 回传的 `akdagent.log` 里抓到的 P0）：
 *   宿主 `@deepseek-ai/dsh-credentials-local` 启动时校验 `assertOwnerOnly` —— 看到
 *   `mode 644` 就**拒绝加载**，原文：`… is readable beyond its owner (mode 644);
 *   run "chmod 600 …" before starting again`。它一拒，整棵插件树就 `failed to load` ⇒ 宿主 `exit 1`
 *   ⇒ 客户端表现是"启动失败 / 闪退"，用户完全看不出跟权限有关。
 *   而我们写凭据用的是默认 umask（022）⇒ 644 ⇒ **mac 上配过 key 的用户下次启动必然起不来**
 *   （Windows 不查这个，所以本地一直没暴露）。
 *
 * ⚠️ **诚实边界**：Windows 上 `fs.chmodSync` 只切只读位、`stat().mode` 也不是 POSIX 语义 ⇒
 *   本机**验不了"文件真的是 600"**。所以这里分两层：
 *     ① 纯判据 `credentialModeNeedsFix()` —— 与平台无关，**这里全部真验**；
 *     ② 落盘行为 —— 只验"写入不被权限逻辑搞坏"，并把 **POSIX 才算数** 这件事打印出来
 *        （`process.platform === 'linux'` 环境里上面那条会真的生效）。
 *   真正"mac 上文件变 600"的验收，只能在 mac 上做（或看用户的下一份日志里那行"已收紧为 600"）。
 *
 * 用法：node tools/test-credentials-mode.cjs
 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  writeFileAtomic, credentialModeNeedsFix, ensureCredentialsOwnerOnly,
} = require('../electron/src/dsh-home.js')

let pass = 0
let fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name) }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 220) : '')) }
}

console.log('== ① 纯判据：什么权限算"过宽"（与平台无关，真验）==')
ok('644 过宽（宿主拒绝启动的那种）', credentialModeNeedsFix(0o644) === true)
ok('640 也算过宽（组可读）', credentialModeNeedsFix(0o640) === true)
ok('604 也算过宽（其他人可读）', credentialModeNeedsFix(0o604) === true)
ok('600 不算过宽', credentialModeNeedsFix(0o600) === false)
ok('400 不算过宽（更严也行）', credentialModeNeedsFix(0o400) === false)
ok('666 过宽', credentialModeNeedsFix(0o666) === true)

console.log('\n== ② 写文件带 mode 不能把写入搞坏（Windows 上权限位是空操作）==')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-cred-mode-'))
try {
  const p = path.join(dir, '.credentials.yaml')
  const body = 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-test\n'
  ok('writeFileAtomic(p, s, {mode:0o600}) 返回 true', writeFileAtomic(p, body, { mode: 0o600 }) === true)
  ok('内容确实写进去了', fs.readFileSync(p, 'utf8') === body)
  ok('不留 .akdtmp 临时文件', !fs.existsSync(p + '.akdtmp'))
  const p2 = path.join(dir, 'no-mode.txt')
  ok('不带 opts 的调用依旧工作（老调用点不受影响）', writeFileAtomic(p2, 'x') === true && fs.readFileSync(p2, 'utf8') === 'x')
  if (process.platform !== 'win32') {
    ok('POSIX：新写的凭据文件就是 600', (fs.statSync(p).mode & 0o777) === 0o600, (fs.statSync(p).mode & 0o777).toString(8))
  } else {
    console.log('  [i]    本机是 Windows ⇒ 权限位不生效，"文件真的是 600"这条只有 mac/Linux 上才算数')
  }

  console.log('\n== ③ 自愈：已有文件权限过宽时会收紧（中招用户升级后自动恢复的关键）==')
  const home = path.join(dir, 'home')
  fs.mkdirSync(home, { recursive: true })
  const cp = path.join(home, '.credentials.yaml')
  fs.writeFileSync(cp, body, 'utf8')
  let logged = ''
  let r = ensureCredentialsOwnerOnly(home, (m) => { logged += m })
  if (process.platform === 'win32') {
    ok('Windows：明确回报"跳过"，不假装修过', r.skipped === 'win32' && r.changed === false, r)
    ok('Windows：不去动文件（也不会抛）', fs.existsSync(cp))
  } else {
    fs.chmodSync(cp, 0o644)
    r = ensureCredentialsOwnerOnly(home, (m) => { logged += m })
    ok('POSIX：把 644 收紧为 600', r.changed === true && ((fs.statSync(cp).mode & 0o777) === 0o600), r)
    ok('POSIX：日志里说了这件事（用户回传时看得见）', /已收紧为 600/.test(logged), logged.slice(0, 120))
    const again = ensureCredentialsOwnerOnly(home, () => {})
    ok('POSIX：第二次是幂等的（不再改）', again.changed === false, again)
  }

  console.log('\n== ④ 边界：文件不存在 / 目录只读时不许抛 ==')
  const emptyHome = path.join(dir, 'empty')
  fs.mkdirSync(emptyHome, { recursive: true })
  let threw = false
  let r2 = null
  try { r2 = ensureCredentialsOwnerOnly(emptyHome, () => {}) } catch (_) { threw = true }
  ok('凭据文件不存在 ⇒ 不抛、回报 changed:false', !threw && r2 && r2.changed === false, r2)
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail ? 1 : 0)
