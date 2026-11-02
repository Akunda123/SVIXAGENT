#!/usr/bin/env node
/**
 * 从 Dreamtonics 资源页抓 **最新版音素参考表** → 转成我们的 `音素表.json`（并附 `xsampa` 字段）。
 *
 * 背景（2026-11-02，SV2 **2.3.0** 发布）：
 *   官方把音素系统全面重构（简化音素 / X-SAMPA 切换、气泡音音素、新增法语/德语/巴西葡语/意语）。
 *   我们仓库里那张表是 **2.0.0** 时代从 `docs/音素.html` 抽的（7 语种 / 241 条、没有 xsampa）。
 *   而资源页现在把整张表放在 **页面 chunk** 里（`HelpResourcesPage-*.js` 的一个 `{version, table}` 对象），
 *   SSR 只渲染第一个 tab ⇒ 不能用「存网页」的办法拿全。
 *
 * 做法：
 *   1) curl 资源页（带 UA + cookie jar；Cloudflare 只放行带浏览器头的请求）→ 拿 HTML
 *   2) 从 HTML 里找出 `HelpResourcesPage-*.js`，curl 下来
 *   3) 在 chunk 里定位 `{version, table}` 对象（字符串感知的括号配平）→ 求值
 *   4) 转成我们既有的 `{source, extractedAt, tables:[{language, groups:[{title, rows}]}]}` 形状，
 *      rows 里保留 `phoneme/category/example/description`，**新增 `xsampa`**
 *   5) 写 `docs/音素表.json`（生成源）+ `knowledge/docs/音素表.json`（随包）+ `knowledge/docs/音素表.md`（人读）
 *
 * 用法：
 *   node tools/fetch-phoneme-table.cjs                 # 抓取并写三份产物
 *   node tools/fetch-phoneme-table.cjs --dry           # 只抓取+打印统计，不写文件
 *   node tools/fetch-phoneme-table.cjs --html <file> --chunk <file>   # 用本地已有的页面/chunk（离线）
 */
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const RES_URL = 'https://dreamtonics.com/zh-CN/svstudio-resources/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36'

const argv = process.argv.slice(2)
const has = (k) => argv.includes(k)
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }

const DRY = has('--dry')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-phoneme-'))

function say(s) { console.log('[phoneme] ' + s) }

function curl(url, out) {
  const jar = path.join(TMP, 'cf.txt')
  execFileSync('curl.exe', [
    '-sSL', '--max-time', '90', '-o', out,
    '-c', jar, '-b', jar,
    '-A', UA, '--compressed',
    '-H', 'Accept: text/html,application/xhtml+xml,application/javascript,*/*',
    '-H', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    url
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0
  if (!size) throw new Error('下载为空: ' + url)
  return size
}

/* ── 1) 页面 HTML ─────────────────────────────────────────────── */
let htmlPath = opt('--html', '')
if (!htmlPath) {
  htmlPath = path.join(TMP, 'resources.html')
  const n = curl(RES_URL, htmlPath)
  say('资源页 ' + (n / 1024).toFixed(1) + ' KB')
}
const html = fs.readFileSync(htmlPath, 'utf8')
if (!/音素参考表|Phoneme Reference/i.test(html)) throw new Error('页面里没找到"音素参考表"（可能被 Cloudflare 拦了）')
const ver = (html.match(/截至\s*([0-9.]+)/) || html.match(/as of\s*([0-9.]+)/i) || [])[1] || 'unknown'
say('页面标注版本 = ' + ver)

/* ── 2) 页面 chunk（数据在这里）──────────────────────────────── */
let chunkPath = opt('--chunk', '')
if (!chunkPath) {
  const names = [...new Set([...html.matchAll(/\/assets\/(HelpResourcesPage-[A-Za-z0-9_.\-]+\.js)/g)].map((m) => m[1]))]
  if (!names.length) throw new Error('没在页面里找到 HelpResourcesPage-*.js')
  chunkPath = path.join(TMP, names[0])
  const n = curl('https://dreamtonics.com/assets/' + names[0], chunkPath)
  say('数据 chunk = ' + names[0] + '  ' + (n / 1024).toFixed(1) + ' KB')
}
const chunk = fs.readFileSync(chunkPath, 'utf8')

/* ── 3) 定位 {version, table} 对象（字符串感知配平）───────────── */
const anchor = chunk.indexOf('"groups":[{"group_name"')
if (anchor < 0) throw new Error('chunk 里没找到 "groups":[{"group_name"（结构可能又变了）')
let depth = 0
let start = -1
let inStr = false
let quote = ''
let literal = null
for (let i = 0; i < chunk.length; i++) {
  const ch = chunk[i]
  if (inStr) { if (ch === '\\') { i++; continue } if (ch === quote) inStr = false; continue }
  if (ch === '"' || ch === "'" || ch === '`') { inStr = true; quote = ch; continue }
  if (ch === '{' || ch === '[') { if (depth === 0) start = i; depth++ }
  else if (ch === '}' || ch === ']') {
    depth--
    if (depth === 0 && start >= 0 && start < anchor && i > anchor) { literal = chunk.slice(start, i + 1); break }
  }
}
if (!literal) throw new Error('没能定位数据对象')
let obj = null
try { obj = JSON.parse(literal) } catch { obj = new Function('return ' + literal)() }
const table = obj && obj.table ? obj.table : obj
if (!table || !Array.isArray(table.groups)) throw new Error('数据里没有 groups')

/* ── 4) 转成我们的形状 ───────────────────────────────────────── */
const capitalize = (s) => String(s || '').replace(/(^|[-_\s])([a-z])/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase()).trim()
const tables = table.groups.map((g) => ({
  language: (g.group_name && g.group_name.en) || (g.group_name && g.group_name.key) || 'Unknown',
  languageKey: (g.group_name && g.group_name.key) || '',
  languageZh: (g.group_name && g.group_name.zh) || '',
  groups: (g.sections || []).map((s) => ({
    title: (s.section_name && s.section_name.en) || '',
    titleZh: (s.section_name && s.section_name.zh) || '',
    rows: (s.section_items || []).map((it) => ({
      phoneme: it.phoneme,
      category: capitalize(it.category),
      example: it.example || '',
      /* 2.3.0 的 desc 是**多语言对象** {en,zh,jp}；我们既有 schema 里 description 是字符串（gen-phoneme-sets 会把它当 string）
       * ⇒ 这里拍平成中文（缺则英文），原始对象另存 descriptionI18n，别丢信息。 */
      description: (it.desc && typeof it.desc === 'object') ? (it.desc.zh || it.desc.en || it.desc.jp || null) : (it.desc || null),
      descriptionI18n: (it.desc && typeof it.desc === 'object') ? it.desc : null,
      xsampa: it.xsampa || null
    }))
  }))
}))
const out = {
  source: 'Synthesizer V Studio Phoneme Reference (' + ver + ') · ' + RES_URL,
  extractedAt: new Date().toISOString().slice(0, 10),
  version: ver,
  tables
}

/* ── 5) 统计 + 写盘 ─────────────────────────────────────────── */
const cats = new Map()
let total = 0
for (const t of tables) {
  let n = 0
  for (const g of t.groups) for (const r of g.rows) { n++; cats.set(r.category, (cats.get(r.category) || 0) + 1) }
  total += n
  say('  ' + String(t.language).padEnd(34) + String(n).padStart(4) + ' 条  (' + (t.languageZh || '') + ', key=' + t.languageKey + ')')
}
say('合计 ' + total + ' 条 / ' + tables.length + ' 个语种（含常用音素）')
say('categories = ' + [...cats.entries()].map(([k, v]) => k + '(' + v + ')').join(', '))

const withXs = tables.reduce((a, t) => a + t.groups.reduce((b, g) => b + g.rows.filter((r) => r.xsampa).length, 0), 0)
say('带 xsampa 字段 = ' + withXs + ' 条')

if (DRY) { say('--dry ⇒ 不写盘'); process.exit(0) }

const pOut = path.join(ROOT, 'docs', '音素表.json')
fs.writeFileSync(pOut, JSON.stringify(out, null, 1), 'utf8')
say('✅ ' + path.relative(ROOT, pOut))

const pShip = path.join(ROOT, 'knowledge', 'docs', '音素表.json')
fs.writeFileSync(pShip, JSON.stringify(out, null, 1), 'utf8')
say('✅ ' + path.relative(ROOT, pShip))

/* 人读版 */
const md = []
md.push('# Synthesizer V Studio 音素参考表（' + ver + '）')
md.push('')
md.push('> 抓取自 ' + RES_URL + ' · ' + out.extractedAt + ' · 共 ' + total + ' 条 / ' + tables.length + ' 个语种')
md.push('')
for (const t of tables) {
  md.push('## ' + t.language + (t.languageZh ? '（' + t.languageZh + '）' : ''))
  md.push('')
  for (const g of t.groups) {
    md.push('### ' + g.title + (g.titleZh ? '（' + g.titleZh + '）' : ''))
    md.push('')
    md.push('| 音素 | 类别 | X-SAMPA | 示例 |')
    md.push('|---|---|---|---|')
    for (const r of g.rows) md.push('| `' + r.phoneme + '` | ' + r.category + ' | ' + (r.xsampa ? '`' + r.xsampa + '`' : '—') + ' | ' + (r.example || '') + ' |')
    md.push('')
  }
}
const pMd = path.join(ROOT, 'knowledge', 'docs', '音素表.md')
fs.writeFileSync(pMd, md.join('\n'), 'utf8')
say('✅ ' + path.relative(ROOT, pMd))
say('提示：接着跑 `node tools/gen-phoneme-sets.cjs` 重新生成 server/src/lyric/phoneme-sets.ts')
