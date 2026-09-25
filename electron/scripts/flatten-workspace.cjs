/**
 * flatten-workspace.cjs — make a pnpm hoisted workspace symlink-free for WiX/MSI.
 *
 * Why: pnpm hoisted keeps public deps at root node_modules as REAL dirs, but
 * workspace packages are not hoisted — each member has its own node_modules
 * with @deepseek-ai/* symlinks, and node_modules/.pnpm holds ~35k symlink
 * scaffolding (0 MB real data). WiX (MSI linker) fails on ANY symlink
 * (LGHT0103), so:
 *   1) copy every workspace/vendored package into node_modules/<scope>/<name>
 *      as REAL directories, so all @deepseek-ai/* imports resolve from root
 *   2) (caller) deletes per-package node_modules dirs and node_modules/.pnpm
 *
 * Run with cwd = the staged runtime root.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const nm = path.join(root, 'node_modules')
const found = []

function scan(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name === '.git') continue
    const p = path.join(dir, e.name)
    const pkgFile = path.join(p, 'package.json')
    if (fs.existsSync(pkgFile)) {
      found.push(p)
      // A workspace ROOT can itself carry a package.json (e.g. native/landlock-run ->
      // "@deepseek-ai/node-addon-landlock-run-workspace", private) while the publishable
      // members live under its packages/ subdir. Stopping at the first package.json
      // silently dropped "@deepseek-ai/node-addon-landlock-run", and the packaged host
      // then died at boot with
      //   Cannot find package '@deepseek-ai/node-addon-landlock-run'
      // (dsh-sandbox-local/lib/index.js imports it unconditionally). So: descend into
      // private (= workspace root) package dirs, and into plain grouping dirs.
      // Public packages are leaves -- no need to walk their src/tests fixtures.
      let isPrivate = true
      try { isPrivate = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).private === true } catch { /* 解析失败：按根处理，继续下潜 */ }
      if (isPrivate) scan(p)
    } else {
      scan(p)
    }
  }
}

for (const r of ['packages', 'apps', 'vendor', 'native', 'examples', 'website', 'python']) {
  scan(path.join(root, r))
}

// skip copying a node_modules dir while copying a package
const filter = (s) =>
  !s.includes(`${path.sep}node_modules${path.sep}`) && !s.endsWith(`${path.sep}node_modules`)

let copied = 0
let skipped = 0
for (const d of found) {
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')) } catch { skipped++; continue }
  const name = pkg.name
  if (!name || !name.startsWith('@')) { skipped++; continue }
  const [scope, short] = name.split('/')
  const dest = path.join(nm, scope, short)
  if (fs.existsSync(dest)) { skipped++; continue }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(d, dest, { recursive: true, filter })
  copied++
}
console.log(`flatten-workspace: copied ${copied} workspace packages to node_modules, skipped ${skipped}`)
