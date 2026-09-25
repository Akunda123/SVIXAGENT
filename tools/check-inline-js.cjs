#!/usr/bin/env node
/**
 * 所有 Electron 内联 <script> 的语法检查（orb.html / settings.html / key-prompt.html 等）
 * HTML 没法直接 node --check ⇒ 抽出每个内联 script 块写临时文件再 --check。
 * 用法：node tools/check-inline-js.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const DIR = path.join(__dirname, '..', 'electron', 'src')
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html'))

let total = 0, failed = 0
for (const f of files) {
  const html = fs.readFileSync(path.join(DIR, f), 'utf8')
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const parts = []
  blocks.forEach((code, i) => {
    const tmp = path.join(os.tmpdir(), `inline-${f.replace(/\W/g, '_')}-${i}.js`)
    fs.writeFileSync(tmp, code, 'utf8')
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' })
    total++
    if (r.status !== 0) {
      failed++
      parts.push(`  [FAIL] 块 #${i + 1}：` + String(r.stderr || '').split('\n').slice(0, 5).join('\n          '))
    } else {
      parts.push(`  [ok]   块 #${i + 1}（${code.split('\n').length} 行）`)
    }
    try { fs.unlinkSync(tmp) } catch { /* 忽略 */ }
  })
  console.log(`${f}（${blocks.length} 个内联块）`)
  parts.forEach((p) => console.log(p))
}
console.log(`\n共 ${files.length} 个 HTML · ${total} 个内联块 · ${failed ? '❌ ' + failed + ' 个语法错误' : '✅ 全部通过'}`)
process.exit(failed ? 1 : 0)
