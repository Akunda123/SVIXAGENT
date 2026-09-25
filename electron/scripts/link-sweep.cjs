/**
 * link-sweep.cjs — materialize (or drop) every remaining symlink under
 * node_modules so WiX/MSI can package the tree. WiX cannot follow symlinks.
 *
 * Run with cwd = the staged runtime root.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const nm = path.join(process.cwd(), 'node_modules')
const filter = (s) =>
  !s.includes(`${path.sep}node_modules${path.sep}`) && !s.endsWith(`${path.sep}node_modules`)

let fixed = 0
let removed = 0

function walk(dir) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    let st
    try { st = fs.lstatSync(p) } catch { continue }
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(p)
      const abs = path.resolve(path.dirname(p), target)
      try {
        const tst = fs.statSync(abs)
        if (tst.isDirectory()) {
          const tmp = p + '.svh-tmp'
          fs.mkdirSync(tmp)
          fs.cpSync(abs, tmp, { recursive: true, filter })
          fs.rmSync(p, { recursive: true, force: true })
          fs.renameSync(tmp, p)
        } else {
          const tmp = p + '.svh-tmp'
          fs.copyFileSync(abs, tmp)
          fs.rmSync(p, { force: true })
          fs.renameSync(tmp, p)
        }
        fixed++
      } catch {
        fs.rmSync(p, { recursive: true, force: true })
        removed++
      }
    } else if (st.isDirectory()) {
      walk(p)
    }
  }
}

walk(nm)
console.log(`link-sweep: materialized ${fixed} symlinks, removed ${removed} dangling`)
