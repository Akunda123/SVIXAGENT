#!/usr/bin/env node
/**
 * orb.html 内联 <script> 的语法检查（HTML 本身没法 node --check）
 * 做法：抽出最后一个 <script>…</script> 块，写入临时 .js，用 node --check 验证。
 * 用法：node tools/check-orb-inline-js.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const file = path.join(__dirname, '..', 'electron', 'src', 'orb.html')
const html = fs.readFileSync(file, 'utf8')
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
if (!blocks.length) { console.log('（没有内联 script 块）'); process.exit(0) }
console.log('内联 script 块：' + blocks.length + ' 个')

let failed = 0
blocks.forEach((code, i) => {
  const tmp = path.join(os.tmpdir(), `orb-inline-${i}.js`)
  fs.writeFileSync(tmp, code, 'utf8')
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' })
  if (r.status === 0) {
    console.log(`  [ok]   块 #${i + 1}（${code.split('\n').length} 行）`)
  } else {
    failed++
    console.log(`  [FAIL] 块 #${i + 1}：` + String(r.stderr || '').split('\n').slice(0, 6).join('\n          '))
  }
  try { fs.unlinkSync(tmp) } catch { /* 忽略 */ }
})
console.log(failed ? `\n❌ ${failed} 个块语法错误` : '\n✅ 全部通过')
process.exit(failed ? 1 : 0)
