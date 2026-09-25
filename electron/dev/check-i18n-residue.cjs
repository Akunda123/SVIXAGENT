/**
 * i18n 残留扫描：找出「会被显示给用户的中文字面量」还没接 i18n 的地方。
 *
 * 为什么需要它：渲染测试只能覆盖**当前会渲染出来的**文案；
 * `confirm()` 分支、错误提示、某个未触发的状态等路径测不到，静态扫描兜住这些。
 *
 * 规则：剥掉注释与 console.* 之后，源码里的字符串/模板字面量**不该再含汉字**——
 * 界面文案应写成 `I.t('key')` / `i18n.t('key')`（key 是 ASCII，不会有汉字），
 * HTML 静态文本该挂 `data-i18n`。
 *
 * 用法（仓库根或 electron 目录）：
 *   node electron/dev/check-i18n-residue.cjs            # 报告（退出码恒 0）
 *   node electron/dev/check-i18n-residue.cjs --strict    # 有残留就退出码 1（CI/回归用）
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const SRC = path.join(__dirname, '..', 'src')
const STRICT = process.argv.includes('--strict')

/** 默认扫的文件（界面相关；main.js 里的日志文案会被自动排掉） */
const TARGETS = [
  'main.js',
  'sv-bridge-client.js',
  'file-ipc.js',
  'stt-model.js',
  'orb.html',
  'orb-preload.js',
  'settings.html',
  'settings-preload.js',
  'key-prompt.html',
  'key-prompt-preload.js',
]

/** 逐行剥注释：够用即可（不追求完美解析，宁可有少量误报也别漏） */
function stripComments(line) {
  // 单行块注释 /* ... */（可能一行里出现多次）
  let t = line.replace(/\/\*.*?\*\//g, '')
  // 行注释（避开 http:// 这类）
  t = t.replace(/(^|[^:'"\\])\/\/.*$/, '$1')
  return t
}

function linesOf(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
}

/** 提取 <script> 块内容（HTML 用），返回 [{line, text}] */
function scriptLines(text, file) {
  if (!file.endsWith('.html')) return text.split(/\r?\n/).map((t, i) => ({ line: i + 1, text: t }))
  const out = []
  const lines = text.split(/\r?\n/)
  let inScript = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!inScript && /<script[^>]*>/.test(l)) { inScript = true; continue }
    if (inScript && /<\/script>/.test(l)) { inScript = false; continue }
    if (inScript) out.push({ line: i + 1, text: l })
  }
  return out
}

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/
/** 字符串与模板字面量 */
const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g

/** 行内最后一个分号的位置（-1 = 该行没有结束语句） */
function semiIdx(line) {
  return line.lastIndexOf(';')
}

function scan(file) {
  const abs = path.join(SRC, file)
  if (!fs.existsSync(abs)) return { file, hits: [], skipped: true }
  const raw = fs.readFileSync(abs, 'utf8')
  const hits = []
  let inBlockComment = false
  /** 自上一个分号以来的代码：用来识别**跨行的** console.* 调用（日志不算界面文案） */
  let sinceSemi = ''

  for (const { line, text } of scriptLines(raw, file)) {
    let t = text
    if (inBlockComment) {
      const end = t.indexOf('*/')
      if (end === -1) continue
      t = t.slice(end + 2)
      inBlockComment = false
    }
    const start = t.indexOf('/*')
    if (start !== -1 && t.indexOf('*/', start) === -1) {
      inBlockComment = true
      t = t.slice(0, start)
    }
    t = stripComments(t)
    // 跨行语句的 console.* 判据要在**剥离注释之前**累计（日志字符串常在后续行里）
    const stmtText = sinceSemi + '\n' + text
    if (semiIdx(text) === -1) sinceSemi = stmtText
    else sinceSemi = text.slice(semiIdx(text) + 1)

    // 日志与纯注释性内容不算界面文案
    if (/\bconsole\.(log|error|warn|info|debug)\b/.test(stmtText)) continue
    if (/^\s*\*/.test(t) || /^\s*\/\//.test(t)) continue
    // 显式声明的"中文兜底"行（如数据结构里的 label 兜底）：`// i18n-fallback`
    if (/i18n-fallback/.test(text)) continue

    let m
    LITERAL.lastIndex = 0
    while ((m = LITERAL.exec(t))) {
      const val = m[2]
      if (!HAN.test(val)) continue
      // 跳过"注释尾巴"式的误报：字面量里带 // 且前面像注释
      hits.push({ line, text: val.length > 60 ? val.slice(0, 60) + '…' : val })
    }
  }
  return { file, hits, skipped: false }
}

const results = TARGETS.map(scan)
let total = 0
for (const r of results) {
  if (r.skipped) {
    console.log(`— ${r.file}（不存在，跳过）`)
    continue
  }
  if (r.hits.length === 0) {
    console.log(`✅ ${r.file}：无界面中文残留`)
    continue
  }
  total += r.hits.length
  console.log(`❌ ${r.file}：${r.hits.length} 处疑似未接 i18n`)
  for (const h of r.hits) console.log(`   ${h.line}: ${JSON.stringify(h.text)}`)
}

console.log(`\n合计 ${total} 处残留（日志/注释已排除）`)
process.exit(STRICT && total > 0 ? 1 : 0)
