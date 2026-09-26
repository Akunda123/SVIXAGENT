'use strict'
/* 内嵌 host 的独立 DSH 数据根（DSH_HOME）的初始化与**换代迁移**。
 *
 * 为什么单独成文件：这段逻辑要在真机上对用户数据动手（删目录），必须能脱离 Electron
 *   单独跑测试（`node -e "require('./electron/src/dsh-home.js').migrateProfileHomeIfNeeded(...)"`）。
 *   主进程只调用，不重复实现。
 *
 * 背景（2026-09-21 升级 0.1.5-rc.2 时实测）：
 *   · 新版要求 `$DSH_HOME/profiles/node_modules` 是 **dsh 托管的符号链接回退**
 *     （指向运行时安装目录）。它遇到**真实目录**会直接拒绝启动：
 *       `dsh: … exists and is not a symlink or dsh-managed module proxy; remove it …`
 *   · 新版按**随包模板**生成 profile（`package.json` 里写 `dsh.profile.bundles`）。
 *     旧 home 那份 `profiles/web/package.json` 带着用户私有的 workspace 依赖
 *     （实测 `@deepseek-ai/dsh-profile-beijing-status: workspace:^`），新版装不上 ⇒ 起不来。
 *   ⇒ 换代时必须重置「可再生的那几样」，同时**保留**：patch 层（cordis.patch.yml）、plugins/、
 *     会话历史（sessions/）、storages/、凭据、设置。
 */
const fs = require('node:fs')
const path = require('node:path')

/** profile 目录里由运行时生成、可安全重置的文件/目录（patch 层与 plugins/ 不在其中） */
const REGENERATED = ['node_modules', '.dsh-module-fallback', 'package.json', 'cordis.yml', 'cordis.yaml',
  'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'package-lock.json']

/**
 * 删除文件或目录；**Windows junction/符号链接只摘链接，绝不递归进目标**。
 * （`fs.rmSync(dir,{recursive:true})` 会跟着 junction 进安装目录里删东西 —— 绝不能用。）
 * @param {string} p 目标路径
 */
function rmrf(p) {
  let st
  try { st = fs.lstatSync(p) } catch { return }
  if (st.isSymbolicLink()) { try { fs.unlinkSync(p) } catch { /* 忽略 */ } ; return }
  if (!st.isDirectory()) { try { fs.unlinkSync(p) } catch { /* 忽略 */ } ; return }
  let kids = []
  try { kids = fs.readdirSync(p) } catch { /* 忽略 */ }
  for (const k of kids) rmrf(path.join(p, k))
  try { fs.rmdirSync(p) } catch { /* 忽略 */ }
}

/**
 * 读运行时版本（用作 home 迁移的判据）。两代布局都试。
 * @param {string} dshRoot 运行时根目录
 * @returns {string} 版本号，取不到返回 'unknown'
 */
function runtimeVersionTag(dshRoot) {
  const candidates = [
    path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    path.join(dshRoot, 'package.json'),
  ]
  for (const p of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (j && j.version) return String(j.version)
    } catch { /* 试下一个 */ }
  }
  return 'unknown'
}

/**
 * 读文本文件并**去掉编码噪音**：UTF-8 BOM / UTF-16LE / UTF-16BE 一律还原成普通字符串。
 * 为什么必须做：DSH 的凭据层按 `/^[A-Za-z_][A-Za-z0-9_]*$/` 校验 key 名，文件头那个
 * BOM 会让 ref 变成 `\uFEFFDEEPSEEK_API_KEY` ⇒ 直接拒绝启动（0.1.5-rc.2 实测）。
 * @param {string} p 文件路径
 * @returns {string} 去 BOM 的文本
 */
function readTextFile(p) {
  const buf = fs.readFileSync(p)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le')
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const sw = Buffer.from(buf.slice(2))
    sw.swap16()
    return sw.toString('utf16le')
  }
  let s = buf.toString('utf8')
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  return s
}

/** 写 UTF-8（无 BOM） */
function writeTextFile(p, s) {
  fs.writeFileSync(p, s, 'utf8')
}

/** 该 patch 条目指向的插件在当前运行时里能不能加载 */
function patchNameResolvable(name, profileDir, dshRoot) {
  if (!name) return true
  const n = String(name).trim().replace(/^['"]|['"]$/g, '')
  if (n.startsWith('./') || n.startsWith('../')) {
    return fs.existsSync(path.resolve(profileDir, n))
  }
  if (n.startsWith('@')) {
    const [scope, pkg] = n.split('/')
    return !!pkg && fs.existsSync(path.join(dshRoot, 'node_modules', scope, pkg))
  }
  if (/^[a-z0-9@]/i.test(n) && !n.includes('/')) {
    return fs.existsSync(path.join(dshRoot, 'node_modules', n))
  }
  return true   // 认不出的形态不动它
}

/**
 * 清掉 patch 层里"当前运行时没有"的插件条目 —— **只注释、不删除**。
 *
 * 为什么必须做：新旧发行版装的东西不一样。实测用户 patch 里有
 *   `- insert: [{ id: beijing-status, name: '@deepseek-ai/dsh-profile-beijing-status' }]`
 * 而新 npm 树里没有这个包 ⇒ 加载器 `AggregateError` ⇒ **整个宿主起不来**。
 * 注释掉既让宿主能起，又把原文留给用户（加 `# [akdagent]` 标记说明原因）。
 *
 * @returns {{file:string, disabled:string[]}} 被注释掉的条目名
 */
function sanitizePatchLayer(profileDir, dshRoot, log) {
  const say = typeof log === 'function' ? log : () => {}
  const file = path.join(profileDir, 'cordis.patch.yml')
  if (!fs.existsSync(file)) return { file, disabled: [] }
  let lines
  try { lines = readTextFile(file).split(/\r?\n/) } catch { return { file, disabled: [] } }

  // 找出所有「- id:」条目块（同缩进为准），再逐块判断其 name: 能否解析
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)- id:\s*(\S+)\s*$/.exec(lines[i])
    if (m) starts.push({ i, indent: m[1].length, id: m[2] })
  }
  const disabled = []
  for (let k = 0; k < starts.length; k++) {
    const cur = starts[k]
    const end = (k + 1 < starts.length && starts[k + 1].indent === cur.indent) ? starts[k + 1].i - 1 : lines.length - 1
    let nameLine = -1
    let name = null
    for (let i = cur.i; i <= end; i++) {
      const m = /^\s*name:\s*(.+?)\s*$/.exec(lines[i])
      if (m) { nameLine = i; name = m[1].trim().replace(/^['"]|['"]$/g, ''); break }
    }
    if (nameLine < 0 || patchNameResolvable(name, profileDir, dshRoot)) continue
    // 整块注释掉（含 name 行之后的 config 行）
    for (let i = cur.i; i <= end; i++) lines[i] = '# ' + lines[i]
    lines[cur.i] = `# [akdagent] 已停用（当前运行时没有 ${name}）\n` + lines[cur.i]
    disabled.push(`${cur.id}(${name})`)
  }
  if (disabled.length) {
    writeTextFile(file, lines.join('\n'))
    say('[akdagent] patch 层停用了运行时不存在的插件：' + disabled.join(', '))
  }
  return { file, disabled }
}

/** 把凭据/设置重写成无 BOM 的 UTF-8（BOM 会让凭据层拒绝启动） */
function normalizeCredentialFiles(home, log) {
  const say = typeof log === 'function' ? log : () => {}
  const fixed = []
  for (const f of ['.credentials.yaml', 'settings.yaml']) {
    const p = path.join(home, f)
    if (!fs.existsSync(p)) continue
    try {
      const raw = fs.readFileSync(p)
      const text = readTextFile(p)
      const clean = Buffer.from(text, 'utf8')
      // 只在"确有编码噪音"时改写（BOM / UTF-16 / CRLF 之外的长度变化）
      const hasBom = raw.length >= 2 && ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff) || (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf))
      if (hasBom && !clean.equals(raw)) { writeTextFile(p, text); fixed.push(f) }
    } catch { /* 忽略 */ }
  }
  if (fixed.length) say('[akdagent] 凭据/设置已去 BOM（新版凭据层按正则校验 key 名）：' + fixed.join(', '))
  return fixed
}

/**
 * 运行时换代 ⇒ 重置可再生的 profile/模块回退（幂等；同版本直接返回）。
 * @param {string} home DSH_HOME
 * @param {string} dshRoot 运行时根目录
 * @param {(m:string)=>void} [log]
 * @returns {{migrated:boolean, from:string|null, to:string, removed:string[], disabled:string[]}}
 */
function migrateProfileHomeIfNeeded(home, dshRoot, log) {
  const say = typeof log === 'function' ? log : () => {}
  const marker = path.join(home, '.akdagent-runtime-version')
  const now = runtimeVersionTag(dshRoot)
  let seen = null
  try { seen = fs.readFileSync(marker, 'utf8').trim() || null } catch { /* 首次 */ }
  if (seen === now) return { migrated: false, from: seen, to: now, removed: [], disabled: [] }

  const removed = []
  const profiles = path.join(home, 'profiles')
  if (fs.existsSync(profiles)) {
    // ① 父级 node_modules：真实目录 or 旧版 junction ⇒ 一律摘掉，让运行时重建托管回退
    const shared = path.join(profiles, 'node_modules')
    if (fs.existsSync(shared)) { rmrf(shared); removed.push('profiles/node_modules') }
    // ② 各 profile：只重置"运行时生成"的那几样，patch 层与 plugins/ 留着
    let names = []
    try { names = fs.readdirSync(profiles) } catch { /* 忽略 */ }
    for (const name of names) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const dir = path.join(profiles, name)
      try { if (!fs.statSync(dir).isDirectory()) continue } catch { continue }
      for (const child of REGENERATED) {
        const p = path.join(dir, child)
        try { if (!fs.existsSync(p)) continue } catch { continue }
        rmrf(p)
        removed.push(`profiles/${name}/${child}`)
      }
    }
  }
  try { fs.writeFileSync(marker, now, 'utf8') } catch { /* 写不了也不致命（下次再迁移一遍） */ }
  say(`[akdagent] DSH home 迁移：${seen || '(首次)'} → ${now}（重置 profile/模块回退，保留 patch 与会话历史）`)
  if (removed.length) say('[akdagent]   重置项：' + removed.join(', '))
  return { migrated: true, from: seen, to: now, removed, disabled: [] }
}

/** 关掉「插件包清单」请求贡献者 —— 内嵌 host 上**必须**，否则每条消息都发不出去。
 *
 *  2026-09-21 实测根因（报错 `REQUEST_EXTENSION: DeepSeek request extension preparation failed`）：
 *  `@deepseek-ai/dsh-plugin-package-inventory-deepseek` 在发请求前会把**所有活跃 loader entry**
 *  解析成包身份，遇到解析不到的**裸包名**就抛
 *  `cannot resolve active package "<name>"`；而我们的 profile 是**客户端插入**的
 *  `mcp-akdagent → '@deepseek-ai/dsh-mcp-client'`（裸包名），该包**只存在于运行时根**、
 *  **不在 profile 的 node_modules 回退里**（回退只镜像一部分）⇒ 解析失败 ⇒ 整个 DeepSeek 请求
 *  在 HTTP 之前被拒（用户侧表现 = 一发消息就报错，且 `turn/end` 是 `kind:'error'`）。
 *  A/B 实测：只停用这一个 entry ⇒ 同一轮 `kind:'completed'`（真跑通）；停用别的都不行。
 *  该贡献者只往请求里加 `dsh_plugin_packages` 元数据（**零模型 token，只多几个请求字节**），
 *  停用没有任何功能损失。用户自己的 DSH 不触发，是因为它的 profile 把 mcp-akdagent 指向
 *  **相对路径** `./plugins/mcp-client/lib/index.js`（相对路径走 nearestManifest，不抛）。
 *
 *  ⚠️ 幂等：patch 里已有这个 id 就不再写。只追加，不动用户其它内容。
 * @returns {boolean} 本次是否写入
 */
function ensureInventoryContributorDisabled(profileDir, log) {
  const say = typeof log === 'function' ? log : () => {}
  const file = path.join(profileDir, 'cordis.patch.yml')
  let text = ''
  try { text = fs.existsSync(file) ? readTextFile(file) : '' } catch { return false }
  if (/^\s*-\s*id:\s*plugin-package-inventory-deepseek\s*$/m.test(text)) return false
  const block = [
    '',
    '# AKDAgent：停用「插件包清单」请求贡献者 —— 它解析不了本 profile 里客户端插入的裸包名',
    '# （mcp-akdagent → @deepseek-ai/dsh-mcp-client，该包只在运行时根、不在 profile 的 node_modules 回退里）',
    '# ⇒ 抛 cannot resolve active package ⇒ 每个 DeepSeek 请求都在 HTTP 前失败（REQUEST_EXTENSION）。',
    '# 该贡献者只加请求元数据（零模型 token），停用无功能损失。2026-09-21 实测：停用它后同一轮 completed。',
    '- id: plugin-package-inventory-deepseek',
    '  disabled: true',
    '',
  ].join('\n')
  try {
    if (fs.existsSync(file) && text.trim()) fs.copyFileSync(file, file + '.bak-inventory')
    writeTextFile(file, text.replace(/\s*$/, '') + '\n' + block)
    say('[akdagent] 已停用 plugin-package-inventory-deepseek（否则每条消息都会 REQUEST_EXTENSION）')
    return true
  } catch { return false }
}

/** 遍历 home 里的所有 profile 目录，逐个做 patch 体检 */
function sanitizeAllPatches(home, dshRoot, log) {
  const say = typeof log === 'function' ? log : () => {}
  const disabled = []
  const profiles = path.join(home, 'profiles')
  let names = []
  try { names = fs.readdirSync(profiles) } catch { return disabled }
  for (const name of names) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const dir = path.join(profiles, name)
    try { if (!fs.statSync(dir).isDirectory()) continue } catch { continue }
    ensureInventoryContributorDisabled(dir, say)
    disabled.push(...sanitizePatchLayer(dir, dshRoot, say).disabled)
  }
  return disabled
}

/**
 * 确保独立 DSH_HOME 可用：首次只抄凭据/设置（**不抄用户的 profiles**，且去 BOM），再跑换代迁移。
 * @param {{home:string, sourceHome:string, dshRoot:string, log?:(m:string)=>void}} opts
 */
function ensureHome(opts) {
  const { home, sourceHome, dshRoot, log } = opts
  const say = typeof log === 'function' ? log : () => {}
  const firstTime = !fs.existsSync(home)
  if (firstTime) {
    fs.mkdirSync(home, { recursive: true })
    say(`[akdagent] initialized isolated DSH_HOME: ${home}`)
  }
  // ⚠️ 凭据/设置**每次启动都同步**（2026-09-26 修；以前只在"首次创建隔离家目录"时抄一次）。
  //    客户端**只**往 `~/.dsh` 那份写（main.js 的 CREDENTIALS_PATH / SETTINGS_PATH），
  //    隔离家目录里的拷贝**从不被本地编辑** ⇒ 覆盖同步是安全的。
  //    修之前的必然序列（干净机器）：
  //      ① 首次启动：隔离家目录不存在 ⇒ 抄一次 —— 可这时用户**还没填 key** ⇒ 抄了个空；
  //      ② 用户在客户端里填 key ⇒ 写进 `~/.dsh/.credentials.yaml`，**不是**隔离家目录；
  //      ③ 之后每次启动：隔离家目录已存在 ⇒ 老代码**再也不抄** ⇒ 宿主永远没有 key
  //         ⇒ 每个请求都在 HTTP 层被拒（AUTH/401，实测 1.4 秒）⇒ 用户侧正是
  //         「一发消息就 回合结束（error）」，新建对话也一样，而他在界面上"明明配好了 key"。
  //    只同步凭据 + 设置；**不抄 profiles**（用户 profile 带私有 workspace 依赖会让宿主起不来，实测）。
  //    必须走 writeTextFile（去 BOM/UTF-16）：新版凭据层按正则校验 key 名，BOM 会让它拒启动（实测）。
  const synced = []
  for (const f of ['.credentials.yaml', 'settings.yaml']) {
    const s = path.join(sourceHome, f)
    if (!fs.existsSync(s)) continue
    try {
      writeTextFile(path.join(home, f), readTextFile(s))
      synced.push(f)
    } catch { /* 忽略 */ }
  }
  if (synced.length && !firstTime) say(`[akdagent] 已同步凭据/设置：${synced.join(', ')}`)
  // 每次启动都做的两件体检（都幂等且便宜；失败模式是宿主直接起不来，代价太大）：
  //   ① 凭据/设置的 BOM —— 新版凭据层按正则校验 key 名
  //   ② patch 层里指不到的插件 —— 加载器硬失败（实测 beijing-status 就是这样）
  normalizeCredentialFiles(home, say)
  const disabled = sanitizeAllPatches(home, dshRoot, say)
  // ⚠️ 干净机器上 `profiles/web` 还不存在（要等宿主第一次启动才生成）⇒ 这里**先把目录与
  //    停用项写好**，否则"第一次发消息"仍会踩 REQUEST_EXTENSION（实测过的失败模式）。
  //    运行时接受"只有 cordis.patch.yml 的 profile 目录"（会自己补齐 package.json/cordis.yml）。
  try {
    const webDir = path.join(home, 'profiles', 'web')
    fs.mkdirSync(webDir, { recursive: true })
    ensureInventoryContributorDisabled(webDir, say)
  } catch { /* 写不了也不致命：下次启动补 */ }
  const r = migrateProfileHomeIfNeeded(home, dshRoot, say)
  return { ...r, disabled }
}

module.exports = { rmrf, readTextFile, writeTextFile, runtimeVersionTag, patchNameResolvable,
  sanitizePatchLayer, sanitizeAllPatches, ensureInventoryContributorDisabled, normalizeCredentialFiles,
  migrateProfileHomeIfNeeded, ensureHome, REGENERATED }
