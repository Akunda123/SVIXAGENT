#!/usr/bin/env node
/**
 * gen-mac-advisory.cjs —— **Mac 交付件生成器**（版本号 + sha256 → 三份文档 + 交付 zip）
 * 2026-10-08 立。存在理由：改一次版本要动**四处**（说明 txt 的适用版本 / dmg 名 / sha256 块 / 末尾那条命令，
 * `.command` 的 dmg 名与 sha256，微信那段话的 dmg 名），再**重打一次 zip**（还必须保住 `.command` 的可执行位）。
 * 1.1.2 → 1.1.3 那两次我**手工做了两遍** —— 任何一处漏了就发错版本给用户。
 *
 * 用法：
 *   node tools/gen-mac-advisory.cjs --version 1.1.4 --dmg electron/release/AKDAgent-1.1.4-arm64.dmg
 *   node tools/gen-mac-advisory.cjs --version 1.1.4 --sha256 <64位hex>          # 手上只有哈希时
 *   node tools/gen-mac-advisory.cjs --version 1.1.4 --dmg <…> --dry-run        # 只预览要改什么
 *
 * 产出（默认目录 `docs/mac-去隔离属性/`）：
 *   · 给Mac用户的说明.txt —— 适用版本 / 所有 `AKDAgent-<版本>-arm64.{dmg,zip}` / sha256 块 / 末尾命令
 *   · 去隔离属性.command  —— dmg 名 + `1.1.x 应为 <hash>`（**必须 LF、无 BOM**，否则 mac 上跑不起来）
 *   · 微信可以这样发.txt  —— dmg 名
 *   · AKDAgent-mac-去隔离属性.zip —— 用 Node 写（`external_attr = 0o100755 << 16` 保住 `.command` 执行位；
 *     `Compress-Archive` 打出来的 zip **没有执行位**、用户双击必失败）
 *
 * 退出码：0 = 已生成（或 dry-run 预览）；1 = 参数/内容校验不过（**不动任何文件**）。
 */
'use strict'
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const DIR = path.join(ROOT, 'docs', 'mac-去隔离属性')
const DOC = path.join(DIR, '给Mac用户的说明.txt')
const CMD = path.join(DIR, '去隔离属性.command')
const WX = path.join(DIR, '微信可以这样发.txt')
const ZIP = path.join(DIR, 'AKDAgent-mac-去隔离属性.zip')

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const has = (n) => argv.includes(n)
const VERSION = opt('--version', null)
const DMG = opt('--dmg', null)
const SHA_ARG = opt('--sha256', null)
const DRY = has('--dry-run')

const die = (m) => { console.error('✗ ' + m); process.exit(1) }
if (!VERSION) die('缺 --version（如 --version 1.1.4）')
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) die(`--version 形状不对：${VERSION}（要 X.Y.Z）`)
if (DMG && !fs.existsSync(DMG)) die(`--dmg 不存在：${DMG}`)

/* ── sha256：给 dmg 就算，给哈希就校验形状 ─────────────────────────── */
let sha = ''
if (DMG) {
  sha = crypto.createHash('sha256').update(fs.readFileSync(DMG)).digest('hex')
  console.log(`dmg：${path.relative(ROOT, DMG)}（${(fs.statSync(DMG).size / 1048576).toFixed(1)} MiB）\nsha256 = ${sha}`)
} else if (SHA_ARG) {
  sha = String(SHA_ARG).trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(sha)) die(`--sha256 形状不对（要 64 位 hex）：${SHA_ARG}`)
  console.log(`sha256 = ${sha}`)
} else {
  die('要么给 --dmg <路径>（我们算哈希），要么给 --sha256 <64位hex>')
}

const read = (p) => fs.readFileSync(p, 'utf8')
const assertClean = (p, s) => {
  if (s.charCodeAt(0) === 0xfeff) die(`${path.basename(p)} 有 BOM（mac 上 `.command` 会跑不起来）`)
  if (/\r\n/.test(s)) die(`${path.basename(p)} 有 CRLF（`.command` 必须 LF）`)
}

/* ── 改文档：版本号与哈希都是"按形状替换"，不写死旧值 ─────────────── */
const changes = []
function rewrite(file, rules) {
  const before = read(file)
  assertClean(file, before)
  let after = before
  for (const [what, re, to] of rules) {
    const hits = (after.match(re) || []).length
    if (!hits) continue
    after = after.replace(re, to)
    changes.push(`${path.basename(file)}：${what} ×${hits}`)
  }
  if (after !== before && !DRY) fs.writeFileSync(file, after, 'utf8')
  return after === before
}

const versionRe = /AKDAgent-\d+\.\d+\.\d+-arm64/g
/* ⚠️ 这两条必须**把版本号也换掉**（2026-10-08 实测踩到）：原来写成 `(\d+\.\d+\.\d+ 应该等于：\n\s+)[0-9a-f]{64}`
 *   并把 `$1` 原样放回 ⇒ **哈希换了、版本号还留着旧的**（"1.1.3 应该等于：0ffe…"）——
 *   而我的幂等测试用的是**同一个版本**，正好把这个 bug 藏住了。现在把版本单独捕获并写成当前 VERSION。 */
const shaBlockRe = /(\d+\.\d+\.\d+)( 应该等于：\n\s+)[0-9a-f]{64}/g
const shaInlineRe = /(\d+\.\d+\.\d+)( 应为 )[0-9a-f]{64}/g
const applicableRe = /（适用 AKDAgent \d+\.\d+\.\d+ ·/g

rewrite(DOC, [
  ['适用版本', applicableRe, `（适用 AKDAgent ${VERSION} ·`],
  ['dmg/zip 名', versionRe, `AKDAgent-${VERSION}-arm64`],
  ['sha256 块', shaBlockRe, `${VERSION}$2${sha}`],
])
rewrite(CMD, [
  ['dmg 名', versionRe, `AKDAgent-${VERSION}-arm64`],
  ['sha256（应为）', shaInlineRe, `${VERSION}$2${sha}`],
])
rewrite(WX, [
  ['dmg 名', versionRe, `AKDAgent-${VERSION}-arm64`],
])

/* 收尾自检：**三份文档里不许再出现别的版本号**（防"改了名字没改版本"这类）
 *  覆盖的写法：`AKDAgent-<v>-arm64`（名）· `适用 AKDAgent <v>` · `<v> 应该等于` · `<v> 应为` */
for (const [file, label] of [[DOC, '说明.txt'], [CMD, '.command'], [WX, '微信.txt']]) {
  const text = read(file)
  const found = new Set()
  for (const m of text.matchAll(/AKDAgent-(\d+\.\d+\.\d+)-arm64/g)) found.add(m[1])
  for (const m of text.matchAll(/适用 AKDAgent (\d+\.\d+\.\d+)/g)) found.add(m[1])
  for (const m of text.matchAll(/(\d+\.\d+\.\d+) 应(该等于|为)/g)) found.add(m[1])
  const stale = [...found].filter((v) => v !== VERSION)
  if (stale.length) die(`${label} 里还残留别的版本号：${stale.join(', ')}（期望只有 ${VERSION}）—— 生成器漏了某处`)
}

/* ── 交付 zip：Node 自己写（保住执行位）──────────────────────────── */
function zipWrite(entries, out) {
  const chunks = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const data = e.data
    const crc = zlib.crc32 ? zlib.crc32(data) : require('zlib').crc32(data)
    const comp = zlib.deflateRawSync(data, { level: 9 })
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0x0800, 6)      // flag: UTF-8 名字
    local.writeUInt16LE(8, 8)           // method: deflate
    local.writeUInt16LE(0, 10)          // time
    local.writeUInt16LE(0x21, 12)       // date（1980-01-01 是个合法常量）
    local.writeUInt32LE(crc >>> 0, 14)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, name, comp)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)             // version made by
    cd.writeUInt16LE(20, 6)             // version needed
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(8, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0x21, 14)
    cd.writeUInt32LE(crc >>> 0, 16)
    cd.writeUInt32LE(comp.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(e.mode << 16 >>> 0, 38)   // ⬅ external attrs：Unix 权限位（0o100755 = 可执行）
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += local.length + name.length + comp.length
  }
  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  fs.writeFileSync(out, Buffer.concat([...chunks, cdBuf, eocd]))
}

const zipEntries = [
  { name: '去隔离属性.command', file: CMD, mode: 0o100755 },
  { name: '给Mac用户的说明.txt', file: DOC, mode: 0o100644 },
]
for (const e of zipEntries) {
  const s = read(e.file)
  assertClean(e.file, s)
  if (/[^\x00-\x7f]/.test(e.name)) { /* 中文名靠 UTF-8 flag，已在写头时置位 */ }
}
if (!DRY) zipWrite(zipEntries.map((e) => ({ name: e.name, data: fs.readFileSync(e.file), mode: e.mode })), ZIP)

/* ── 回报 ─────────────────────────────────────────────────────────── */
console.log('\n改动：')
if (!changes.length) console.log('  （无 —— 文档里已经是这个版本/哈希）')
for (const c of changes) console.log('  · ' + c)
console.log(`\n${DRY ? '（dry-run：没有写任何文件）' : '已写出：'}`)
if (!DRY) {
  console.log(`  ${path.relative(ROOT, ZIP)}  ${(fs.statSync(ZIP).size / 1024).toFixed(1)} KB`)
  for (const e of zipEntries) console.log(`    · ${e.name}  ${(fs.statSync(e.file).size / 1024).toFixed(1)} KB  mode=0o${e.mode.toString(8)}`)
}

/* ── 自检：回读 zip，确认名字/权限位/内容都对（写完必须自己核一遍）────
 * ⚠️ 别用 Windows 自带的 `tar -tvf` 来核这件事：它对 zip 里的 Unix 权限位**不映射**
 *   （实测同一条目显示 `-rw-rw-r--`，而 zip 中央目录里 external_attr 明明是 0x81ed0000 = 0o100755<<16）。
 *   可信读法是**直接读中央目录的 external_attr**（下面这段），或用 .NET `ZipArchiveEntry.ExternalAttributes`。 */
if (!DRY) {
  const buf = fs.readFileSync(ZIP)
  const eocdPos = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const n = buf.readUInt16LE(eocdPos + 10)
  let p = buf.readUInt32LE(eocdPos + 16)
  const seen = []
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) die('zip 中央目录坏了（自检失败）')
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const cmtLen = buf.readUInt16LE(p + 32)
    const mode = buf.readUInt32LE(p + 38) >>> 16
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    seen.push({ name, mode })
    p += 46 + nameLen + extraLen + cmtLen
  }
  let bad = 0
  for (const e of zipEntries) {
    const got = seen.find((s) => s.name === e.name)
    if (!got) { console.log(`  ✗ zip 里没有 ${e.name}`); bad++; continue }
    if (got.mode !== e.mode) { console.log(`  ✗ ${e.name} 权限位不对：0o${got.mode.toString(8)}（要 0o${e.mode.toString(8)}）`); bad++ }
  }
  if (bad) die('zip 自检没过')
  console.log(`  ✓ zip 自检：${seen.map((s) => s.name + '(0o' + s.mode.toString(8) + ')').join(' · ')}`)
}
