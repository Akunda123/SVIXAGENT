#!/usr/bin/env node
/**
 * **BOM 守卫**（2026-09-21 立）
 *
 * 来历：2026-09-21 我用 **PowerShell `Get-Content` / `Set-Content` 对仓内文件做字符串往返**
 *   —— 手册《⛔ 改仓内文件的唯一姿势》明令禁止的那件事（也是 `docs/待办.md` 事故 I1/I2 的同族）。
 *   结果：**PS 5.1 的 `Set-Content -Encoding UTF8` 会写 UTF-8 BOM**，`node --check` 当场报
 *   `Invalid or unexpected token`（BOM 卡在 `#!/usr/bin/env node` 前面）。
 *   这条守卫就是那把尺子：**仓内文本文件的首字节不许是 `EF BB BF`**。
 *
 * 已知豁免（写入下方 ALLOW，按 info 报、不计 exit code）：
 *   · `electron/src/stt-model.js` —— 2026-09-21 前既存（手写源文件，非生成物）；Node 加载 CJS 时
 *     会剥掉 BOM ⇒ 功能无碍；且它与本仓任何改动无关，故不为了"干净"去动它。
 *   · `server/ref_lyrics.txt` —— 2026-09-21 前既存；全仓 grep 无代码引用（无引用的数据文件）。
 *     若将来有代码读它，注意 Node 的 `readFileSync(…,'utf8')` **不剥 BOM**（只有模块加载会剥）⇒ 首行首字符会是 U+FEFF。
 *
 * 用法：node tools/check-no-bom.cjs [--all]
 *   --all  连被跳过目录（node_modules / release / dsh-runtime 等）也扫（默认跳过，避免慢）
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const EXT = ['.cjs', '.js', '.mjs', '.json', '.md', '.lua', '.html', '.ts', '.yml', '.yaml', '.ps1', '.py', '.txt']
const SKIP_DIR = ['node_modules', 'release', 'dsh-runtime', 'dist', 'out', '.git', '.bak']
const ALLOW = {
  'electron/src/stt-model.js': '既存；Node 加载 CJS 模块时会剥 BOM',
  'server/ref_lyrics.txt': '既存且全仓无代码引用（数据文件）；⚠️ 若将来有代码读它，Node 的 readFileSync 不剥 BOM',
}

const wantAll = process.argv.includes('--all')
function skipDir(name) {
  if (wantAll) return false
  return SKIP_DIR.includes(name)
}

const offenders = []
function walk(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!skipDir(e.name)) walk(p); continue }
    if (!e.isFile()) continue
    if (!EXT.includes(path.extname(e.name).toLowerCase())) continue
    let fd
    try {
      fd = fs.openSync(p, 'r')
      const buf = Buffer.alloc(3)
      const n = fs.readSync(fd, buf, 0, 3, 0)
      if (n === 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) offenders.push(path.relative(ROOT, p))
    } catch { /* 读不了就跳过 */ } finally { if (fd !== undefined) fs.closeSync(fd) }
  }
}
walk(ROOT)

const allowed = offenders.filter((f) => ALLOW[f.replace(/\\/g, '/')])
const bad = offenders.filter((f) => !ALLOW[f.replace(/\\/g, '/')])

console.log('== BOM 守卫（首字节不许是 EF BB BF）==')
console.log('扫描根：' + ROOT + (wantAll ? '（--all）' : '（默认跳过 node_modules/release/dsh-runtime/dist）'))
console.log('命中 BOM：' + offenders.length + ' 个')
for (const f of allowed) console.log('  [i]    ' + f + '  —— 已知豁免：' + ALLOW[f.replace(/\\/g, '/')])
for (const f of bad) console.log('  [FAIL] ' + f + '  —— 首字节是 BOM（多由 PowerShell `Set-Content -Encoding UTF8` 造成）')

if (bad.length) {
  console.log('\n❌ ' + bad.length + ' 个文件带 BOM。修法：**用 read/write 工具重写该文件**（write 写出的就是无 BOM UTF-8）；')
  console.log('   ⛔ 不要再用 PowerShell 的字符串往返 —— 那正是 BOM 的来源。')
  process.exit(1)
}
console.log('\n✅ 没有非豁免的 BOM 文件')
process.exit(0)
