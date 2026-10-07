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
const yaml = require('js-yaml')

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

/**
 * **原子写**（tmp + rename）—— 用于宿主 chokidar 正在监听的那几个文件。
 * 为什么（2026-09-27）：`writeFileSync` 是先 truncate 再写；宿主按 `watch: true` 监听
 * `.credentials.yaml`，有几率在"已清空、还没写完"的瞬间去读 ⇒ 读到空文档（对宿主是合法的"空存储"）
 * ⇒ 那一轮请求就没有 key。rename 是原子的 ⇒ 宿主只会看到"整份换掉"这一个事件。
 * rename 失败（Windows 上目标被占用等）时退回普通写，保证不会因为"写不进去"而更糟。
 */
function writeFileAtomic(p, s) {
  const tmp = p + '.akdtmp'
  try {
    fs.writeFileSync(tmp, s, 'utf8')
    fs.renameSync(tmp, p)
    return true
  } catch {
    try { fs.unlinkSync(tmp) } catch { /* 忽略 */ }
    try { writeTextFile(p, s); return true } catch { return false }
  }
}

/**
 * 同步凭据时的**合并**：`refs` 取源（客户端写的东西）、`records` 取隔离家目录那份（宿主自己写的）。
 * 为什么不能整份覆盖（2026-09-27）：`records.client-connection/browser-session` 是**本家目录的**
 * 浏览器会话授权 —— 把源 `~/.dsh` 那份搬进来，等于把**另一个家目录**的授权塞给宿主；反之宿主自己
 * 每次写的那个 record 又会被我们盖掉。两边各有各的所有权，合并才对。
 * @returns {string} 可直接落盘的 YAML
 */
function mergeCredentialDocs(srcText, dstPath, log) {
  const say = typeof log === 'function' ? log : () => {}
  let srcDoc = null
  try { srcDoc = yaml.load(srcText) } catch { srcDoc = null }
  let dstDoc = null
  try { dstDoc = fs.existsSync(dstPath) ? yaml.load(readTextFile(dstPath)) : null } catch { dstDoc = null }
  const srcRefs = isPlainMap(srcDoc) && isPlainMap(srcDoc.refs) ? srcDoc.refs : {}
  const dstRecords = isPlainMap(dstDoc) && isPlainMap(dstDoc.records) ? dstDoc.records : null
  const merged = { version: CRED_VERSION, refs: { ...srcRefs } }
  if (dstRecords && Object.keys(dstRecords).length) merged.records = dstRecords
  const srcRecords = isPlainMap(srcDoc) && isPlainMap(srcDoc.records) ? Object.keys(srcDoc.records) : []
  if (srcRecords.length && !(dstRecords && Object.keys(dstRecords).length)) {
    say('[akdagent] 源的 records 没有搬进隔离家目录（那是**另一个家目录**的会话授权；宿主会写自己的）：' + srcRecords.join(', '))
  }
  return dumpCredentialsDoc(merged)
}

/* ── 宿主凭据文档（.credentials.yaml）的硬约束 ────────────────────────────────
 * 规则**不是我们定的**，是从随包运行时里读出来的（用户机日志里那条
 * `credentials-local: unknown top-level key "DEEPSEEK_API_KEY"` 就是它抛的）：
 *   · `@deepseek-ai/dsh-credentials-local/lib/index.js`  `parseCredentialsDocument()`
 *       - 空文档 = 空存储（允许）；非空映射 ⇒ **必须** `version: 1`      （150/151 行）
 *       - 顶层键**只许** `version` / `refs` / `records` —— 多一个就
 *         `unknown top-level key` ⇒ **整个宿主 boot 失败**（152 行）
 *       - `refs`   = 键匹配 `/^[A-Za-z_][A-Za-z0-9_]*$/`、值必须非空字符串（191-199 行）
 *       - `records` = 键为 `<scope>/<id>`，两半都匹配 `/^[a-z][a-z0-9-]*$/`（202-210 行）
 *       - 段缺席或为 null 都算空（227-231 行 `asSection`）
 *   · `@deepseek-ai/dsh-credentials/lib/index.js`  REF_PATTERN / KEY_SEGMENT_PATTERN（13/15 行）
 *
 * 为什么必须由我们保证（2026-09-27 事故）：客户端的 `setCred()` 用"有没有 refs"判新旧格式，
 * 而全新机器上 DSH 先写的是 `version: 1` + `records`（**还没有 refs**）⇒ 被判成"老扁平格式"
 * ⇒ 用户填的 key 被写成**顶层键**，与 version/records 混在一份文件里 ⇒ 宿主 boot 直接失败
 * ⇒ 宿主进程退出 ⇒ 客户端 500ms 后跟着退出（用户侧看到的就是"过了一会就闪退"，且在"重装"之后依旧）。
 * 宿主自带的扁平迁移（`renderFlatLayoutMigration`，171-189 行）**只认纯扁平文档**（见到 version 就放弃），
 * 混合文档它自己修不了 ⇒ 只能我们修。
 */
const CRED_VERSION = 1
const CRED_TOP_KEYS = ['version', 'refs', 'records']
const CRED_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const CRED_SEG_RE = /^[a-z][a-z0-9-]*$/

/** YAML 里"普通映射"的判据（数组/null/标量都不算） */
function isPlainMap(v) { return !!v && typeof v === 'object' && !Array.isArray(v) }

/** 这份文档宿主读得了吗？措辞尽量贴宿主报错，便于和日志对照。
 * @returns {string[]} 问题清单；空数组 = 宿主能读 */
function credentialDocProblems(doc) {
  if (doc === undefined || doc === null) return []            // 空文档 = 空存储（允许）
  if (!isPlainMap(doc)) return ['不是映射（must be a mapping）']
  const keys = Object.keys(doc)
  if (keys.length === 0) return []                            // 空映射（允许）
  const problems = []
  if (!('version' in doc)) problems.push('缺 version（宿主认作 pre-release flat layout）')
  else if (doc.version !== CRED_VERSION) problems.push(`version=${JSON.stringify(doc.version)}（本构建只认 1）`)
  for (const k of keys) if (!CRED_TOP_KEYS.includes(k)) problems.push(`unknown top-level key "${k}"`)
  if (doc.refs !== undefined && doc.refs !== null) {
    if (!isPlainMap(doc.refs)) problems.push('refs 不是映射')
    else for (const [k, v] of Object.entries(doc.refs)) {
      if (!CRED_REF_RE.test(k)) problems.push(`refs 名 "${k}" 不合法（须匹配 ${String(CRED_REF_RE)}）`)
      else if (typeof v !== 'string') problems.push(`refs["${k}"] 不是字符串`)
      else if (v.length === 0) problems.push(`refs["${k}"] 是空串`)
    }
  }
  if (doc.records !== undefined && doc.records !== null) {
    if (!isPlainMap(doc.records)) problems.push('records 不是映射')
    else for (const k of Object.keys(doc.records)) {
      const parts = k.split('/')
      if (parts.length !== 2 || !parts.every((s) => CRED_SEG_RE.test(s))) problems.push(`records 键 "${k}" 不是 <scope>/<id>`)
    }
  }
  return problems
}

/**
 * **就地**把凭据文档规范化成"宿主一定读得了"的新格式（会改传入对象）。
 *   · 保证 `version: 1`、`refs` 是映射
 *   · 顶层杂键（老扁平格式、或被我们写坏的键）⇒ 名字合法且值是非空字符串就**搬进 refs**，否则丢弃
 *   · `records` 原样保留（不是映射则丢弃）
 *   · 已经合规 ⇒ `report.changed === false`（不做无谓改动）
 * @returns {{doc:object, report:{moved:string[], dropped:string[], versionFixed:boolean, changed:boolean}}}
 */
function normalizeCredentialsDoc(doc) {
  const report = { moved: [], dropped: [], versionFixed: false, changed: false }
  if (!isPlainMap(doc)) {
    report.changed = true
    report.dropped.push('(整份不是映射 ⇒ 重建成空凭据文档)')
    return { doc: { version: CRED_VERSION, refs: {} }, report }
  }
  if (Object.keys(doc).length === 0) return { doc, report }     // 空文档本来就合规
  if (doc.version !== CRED_VERSION) { doc.version = CRED_VERSION; report.versionFixed = true; report.changed = true }
  if (!isPlainMap(doc.refs)) {
    if (doc.refs !== undefined) report.dropped.push('refs（不是映射）')
    doc.refs = {}
    report.changed = true
  }
  for (const k of Object.keys(doc)) {
    if (CRED_TOP_KEYS.includes(k)) continue
    const v = doc[k]
    delete doc[k]
    report.changed = true
    if (CRED_REF_RE.test(k) && typeof v === 'string' && v.length > 0) { doc.refs[k] = v; report.moved.push(k) }
    else report.dropped.push(k)
  }
  if (doc.records !== undefined) {
    if (!isPlainMap(doc.records)) { delete doc.records; report.dropped.push('records（不是映射）'); report.changed = true }
    else {
      /* 只清掉**形状就不对**的条目（键不是 <scope>/<id>、或值不是映射）——
       * 留着它们 = 宿主照样拒读 = 白走一次"整份挪走"。**字段级**校验（record 里有哪些 kind/field）
       * 交给宿主：那些条目是宿主自己写的，我们不越权解读。 */
      for (const [k, v] of Object.entries(doc.records)) {
        const parts = k.split('/')
        if (parts.length !== 2 || !parts.every((s) => CRED_SEG_RE.test(s)) || !isPlainMap(v)) {
          delete doc.records[k]
          report.dropped.push('records.' + k)
          report.changed = true
        }
      }
    }
  }
  return { doc, report }
}

/** 统一用同一套缩进/无 BOM 落盘格式 */
function dumpCredentialsDoc(doc) {
  return yaml.dump(doc, { indent: 2, lineWidth: -1 })
}

/**
 * 把凭据**文本**规范化。`version` 是别的数字时**不动它**（那可能是更新版 DSH 的格式，
 * 我们不认识、也绝不该喂给随包的这个运行时）。
 * @returns {{ok:boolean, text:string, report?:object, reason?:string}}
 */
function normalizeCredentialsText(text, log) {
  const say = typeof log === 'function' ? log : () => {}
  // 空文件 = 空存储（宿主允许）⇒ 原样，别无谓改写成 version/refs 让人以为动过手
  if (String(text).trim() === '') return { ok: true, text, report: { moved: [], dropped: [], versionFixed: false, changed: false } }
  let doc
  try { doc = yaml.load(text) } catch (e) { return { ok: false, text, reason: 'YAML 解析失败：' + (e && e.message ? e.message : e) } }
  if (isPlainMap(doc) && 'version' in doc && doc.version !== CRED_VERSION) {
    return { ok: false, text, reason: `version=${JSON.stringify(doc.version)}（不是本构建认的 1）` }
  }
  const { doc: fixed, report } = normalizeCredentialsDoc(doc)
  if (report.changed) {
    say('[akdagent] 凭据文档已规范化（宿主只认 version/refs/records）：'
      + (report.versionFixed ? ' version→1' : '')
      + (report.moved.length ? ' 搬进 refs：' + report.moved.join(', ') : '')
      + (report.dropped.length ? ' 丢弃：' + report.dropped.join(', ') : ''))
  }
  return { ok: true, text: dumpCredentialsDoc(fixed), report }
}

/**
 * 启动自检 + 自愈：隔离家目录那份凭据读不了就**别让宿主去读**（宿主读不了 ⇒ 整个起不来 ⇒ 用户看到闪退）。
 * 顺序：能规范化就就地规范化（留 `.bak`）；规范化后仍不合规 ⇒ **挪走**（`…rejected-<ts>`），
 * 让宿主先能起来（代价是没 key ⇒ 回到"看得见的 401/未配置"，而不是"凭空消失"）。
 * @param {string} home DSH_HOME
 * @param {(m:string)=>void} [log]
 * @param {{allowQuarantine?:boolean}} [opts] 源 `~/.dsh` 那份**只规范化、绝不挪走**（那是用户的文件）
 */
function healCredentialsFile(home, log, opts) {
  const say = typeof log === 'function' ? log : () => {}
  const allowQuarantine = !(opts && opts.allowQuarantine === false)
  /* 标签只用于日志：这个函数**源 `~/.dsh` 与隔离家目录都会调**，不写清是哪一份，
   * 排障时两行一模一样的日志等于没有信息（2026-09-27）。 */
  const label = (opts && opts.label) || home
  const p = path.join(home, '.credentials.yaml')
  if (!fs.existsSync(p)) return { existed: false, action: 'none' }
  let text
  try { text = readTextFile(p) } catch (e) { return { existed: true, action: 'unreadable', reason: e && e.message } }
  let doc = null
  let parseErr = null
  try { doc = yaml.load(text) } catch (e) { doc = undefined; parseErr = e }
  const problems = parseErr ? ['YAML 解析失败：' + (parseErr.message || parseErr)] : credentialDocProblems(doc)
  if (problems.length === 0) return { existed: true, action: 'ok' }
  if (isPlainMap(doc) && 'version' in doc && doc.version !== CRED_VERSION) {
    // 更新版 DSH 的格式：不猜、不改 —— 但也不能让随包运行时去读它
    if (allowQuarantine) {
      const to = p + '.rejected-' + Date.now()
      try { fs.renameSync(p, to) } catch { /* 忽略 */ }
      say(`[akdagent] ⚠ ${label}的凭据是 version=${JSON.stringify(doc.version)}（不是本构建认的 1）⇒ 已挪走为 ${path.basename(to)}，宿主先能起来`)
      return { existed: true, action: 'quarantined', problems, to }
    }
    return { existed: true, action: 'untouched', problems }
  }
  const { doc: fixed, report } = normalizeCredentialsDoc(doc)
  const still = credentialDocProblems(fixed)
  if (still.length === 0) {
    try { fs.copyFileSync(p, p + '.bak') } catch { /* 忽略 */ }
    writeFileAtomic(p, dumpCredentialsDoc(fixed))
    say('[akdagent] ⚠ ' + label + '的凭据不合宿主规则（' + problems.join('；') + '）⇒ 已就地规范化'
      + (report.moved.length ? `（搬进 refs：${report.moved.join(', ')}）` : '')
      + (report.dropped.length ? `（丢弃：${report.dropped.join(', ')}）` : '') + '；原件留 ' + path.basename(p) + '.bak')
    return { existed: true, action: 'normalized', problems, moved: report.moved, dropped: report.dropped }
  }
  if (!allowQuarantine) return { existed: true, action: 'untouched', problems }
  const to = p + '.rejected-' + Date.now()
  try { fs.renameSync(p, to) } catch { /* 忽略 */ }
  say('[akdagent] ⚠ ' + label + '的凭据修不好（' + still.join('；') + '）⇒ 已挪走为 ' + path.basename(to) + '，宿主先能起来（客户端会让你重填 key）')
  return { existed: true, action: 'quarantined', problems, to }
}

/** 该 patch 条目指向的插件在当前运行时里能不能加载
 *
 *  ⛔ **2026-10-07 真机事故（发布前查出来的）**：裸包名原先**只查 `dshRoot/node_modules`**，
 *  而 DSH 加载器是从 **profile 目录**解析插件名的 —— 我们自己的 `akd-auth-bridge` 就落在
 *  `<home>/profiles/web/node_modules/`（`auth-bridge.js` 的 `resolvableFrom` 也正是这么找的）。
 *  两者口径不一致的后果：**第二次启动** App 时消毒器把刚写好的那一行判成"运行时不存在"并**注释掉**，
 *  而 `auth-bridge.js` 的 `hasBridge` 正则又能匹配到被注释的行 ⇒ 永不补回 ⇒ **订阅登录首次启动能用、
 *  之后每次启动静默失效**（用户机器上实测：日志 `patch 层停用了运行时不存在的插件：akd-auth-bridge`，
 *  且 `flows.json` 停在上一轮的时间）。
 *  ⇒ 现在**两处都查**，口径与 `resolvableFrom` 一致；`auth-bridge.js` 侧另有"注释行不算存在 + 自我修复"。
 */
function patchNameResolvable(name, profileDir, dshRoot) {
  if (!name) return true
  const n = String(name).trim().replace(/^['"]|['"]$/g, '')
  if (n.startsWith('./') || n.startsWith('../')) {
    return fs.existsSync(path.resolve(profileDir, n))
  }
  const parts = n.split('/')
  const at = (base) => fs.existsSync(path.join(base, 'node_modules', ...parts))
  if (n.startsWith('@')) return !!parts[1] && (at(profileDir) || at(dshRoot))   // scope 包：两处都查
  if (/^[a-z0-9@]/i.test(n) && !n.includes('/')) return at(profileDir) || at(dshRoot)   // 裸名（本事故的根因）
  return true   // 认不出的形态不动它（保持原判据，别扩大行为变化）
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
  /* ⛔ 2026-09-28（用户「AKDAgent 夺舍了 DSH」反馈 · 方案 ABCD）：**源 `~/.dsh` 一律只读。**
   *   以前这里做两件"动用户文件"的事：
   *     ① `healCredentialsFile(sourceHome, …)` —— 启动时就地**规范化改写**用户的凭据文件（带 .bak）；
   *     ② 每次启动把源的凭据/设置**覆盖**进隔离家目录。
   *   现在：**绝不写源、绝不建源目录**；只在"隔离家目录缺这份文件"或"缺某个 ref"时**单向导入**
   *   （读源 → 写我们自己的那份）。⇒ 用户自己那份 DSH 的数据从此完全不受影响；
   *   代价（已知并接受）：我们在客户端里的改动**不再回流**到用户自己的 DSH（两边各填一次）。 */
  const docAt = (p) => { try { return fs.existsSync(p) ? yaml.load(readTextFile(p)) : undefined } catch { return undefined } }
  const refNames = (doc) => (isPlainMap(doc) && isPlainMap(doc.refs)
    ? Object.keys(doc.refs).filter((k) => typeof doc.refs[k] === 'string' && doc.refs[k]) : [])
  const synced = []
  for (const f of ['.credentials.yaml', 'settings.yaml']) {
    const s = path.join(sourceHome, f)
    const d = path.join(home, f)
    if (!fs.existsSync(s)) continue
    try {
      const text = readTextFile(s)
      /* ⚠️ 凭据文件**必须先规范化再进隔离家目录**（2026-09-27 事故）：以前逐字抄一份过去 ——
       * 可"客户端能读"≠"宿主能读"：源里有顶层杂键（老扁平格式）时宿主 boot 就
       * `unknown top-level key` 直接失败 ⇒ 宿主退出 ⇒ 客户端跟着退出（用户看到"闪退"）。
       * ⚠️ 规范化**只作用在我们自己的拷贝上**（源那份一个字都不动）。 */
      if (f === '.credentials.yaml') {
        const out = normalizeCredentialsText(text, say)
        if (!out.ok) {
          say(`[akdagent] ⚠ 源的 ${f} 读不懂（${out.reason}）⇒ 不导入；隔离家目录里那份保持不动（源未改动）`)
          continue
        }
        if (!fs.existsSync(d)) {
          // 首次导入：隔离那份还不存在 ⇒ 用规范化后的源那份（records 不搬：那是**另一个家目录**的授权）
          writeFileAtomic(d, mergeCredentialDocs(out.text, d, say))
          synced.push(f + '(首次导入)')
        } else {
          /* 已有我们那份 ⇒ 只把**源里有、我们这份没有的 ref** 补进来（只增不改）。
           * ⚠️ refs 必须取**并集、且以我们这份为准**（2026-09-28 修的真 bug）：
           *   `mergeCredentialDocs` 的 refs 是**整份取源**的 —— 它诞生时客户端只写源，源必然是超集；
           *   现在客户端写的是**我们这份**，于是"源有 K、我们有 J"时按它合并会把 **J 弄丢**
           *   （用户自己填的 key 消失，且不报错）。⇒ 这里显式并集：`{ ...我们的, ...新增的 }`。 */
          const dDoc = docAt(d)
          const dRefs = isPlainMap(dDoc) && isPlainMap(dDoc.refs) ? dDoc.refs : {}
          let srcDoc = null
          try { srcDoc = yaml.load(out.text) } catch { srcDoc = null }
          const toAdd = refNames(srcDoc).filter((k) => !(k in dRefs))
          if (toAdd.length) {
            const addRefs = {}
            for (const k of toAdd) addRefs[k] = srcDoc.refs[k]
            const dstRecords = isPlainMap(dDoc) && isPlainMap(dDoc.records) ? dDoc.records : null
            const outDoc = { version: CRED_VERSION, refs: { ...dRefs, ...addRefs } }
            if (dstRecords && Object.keys(dstRecords).length) outDoc.records = dstRecords
            writeFileAtomic(d, dumpCredentialsDoc(outDoc))
            synced.push(f + '(补齐 ' + toAdd.join(',') + ')')
          }
        }
      } else {
        /* settings：**只在隔离那份不存在时**导入一次；之后以隔离那份为准（那是我们的写入目标）。
         * 以前每次启动都用源的覆盖 ⇒ 用户在客户端改的语言会被源里那份"顶回去"。 */
        if (!fs.existsSync(d)) { writeFileAtomic(d, text); synced.push(f + '(首次导入)') }
      }
    } catch (e) {
      // ⚠️ 以前这里是静默 catch —— 同步失败时用户照样没 key，而我们一无所知（2026-09-26 改）
      say(`[akdagent] ⚠ 导入 ${f} 失败（宿主会读不到）：${e && e.message ? e.message : e}`)
    }
  }
  if (synced.length && !firstTime) say(`[akdagent] 已从源 ~/.dsh 只读导入：${synced.join(', ')}`)
  /* 起宿主**之前**的最后一道闸：隔离家目录那份自己也得是宿主读得了的。
   * 为什么单列这一步（而不是只靠同步）：源里没有凭据时同步整段跳过 ⇒ 隔离家目录里
   * 那份**历史遗留**（旧版客户端写坏的混合文档 / 扁平文档）会一直留着 ⇒ 宿主每次启动都失败。
   * 这份是**我们自己的拷贝**，可以放心规范化、必要时挪走（源那份不动）。 */
  healCredentialsFile(home, say, { label: '隔离家目录' })
  /* 同步后自检（2026-09-27 判据换成**规则层**，不再用"sk- 开头的正则"）：
   *   ① 隔离家目录那份**宿主读得了吗** —— 读不了就是"宿主起不来/闪退"，必须当场喊出来；
   *   ② 源里有哪些 ref **没进**隔离家目录 —— 旧判据是"值像 sk-xxx"或"refs 段非空"，
   *      对非 `sk-` 开头的提供方会**漏报**，而"refs 非空"又可能把别的东西当 key。 */
  try {
    const dstDoc = docAt(path.join(home, '.credentials.yaml'))
    const dstProblems = credentialDocProblems(dstDoc)
    if (dstProblems.length) {
      say('[akdagent] ⚠ 自检未通过：隔离家目录的凭据**宿主读不了**（' + dstProblems.join('；') + '）⇒ 宿主会起不来（把这段日志发回来）')
    }
    const missing = refNames(docAt(path.join(sourceHome, '.credentials.yaml'))).filter((k) => !refNames(dstDoc).includes(k))
    if (missing.length) {
      // ⚠️ 2026-09-28 起语义变了：源只读、我们只会"补齐"它——所以这里能剩下的，
      //    只有**源里那份规范化时被丢掉**的 ref（键名不合法 / 值为空 / records 形状不对）。
      //    不再是"同步没跑"，而是"源里那几个 key 我们不敢往宿主送"。
      say('[akdagent] ⚠ 源 ~/.dsh 里有 ' + missing.join(', ') +
        '，但没进隔离家目录（多因键名/值不符合宿主凭据格式）⇒ 这几个 key 宿主取不到；' +
        '源文件我们**只读**、一个字都没改（把这段日志发回来）')
    }
  } catch { /* 忽略 */ }
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

module.exports = { rmrf, readTextFile, writeTextFile, writeFileAtomic, runtimeVersionTag, patchNameResolvable,
  sanitizePatchLayer, sanitizeAllPatches, ensureInventoryContributorDisabled, normalizeCredentialFiles,
  migrateProfileHomeIfNeeded, ensureHome, REGENERATED,
  // 宿主凭据文档的硬约束（2026-09-27）：main.js 的写侧与守卫都用这几个
  CRED_VERSION, CRED_TOP_KEYS, CRED_REF_RE, CRED_SEG_RE,
  credentialDocProblems, normalizeCredentialsDoc, normalizeCredentialsText, dumpCredentialsDoc, healCredentialsFile,
  mergeCredentialDocs }
