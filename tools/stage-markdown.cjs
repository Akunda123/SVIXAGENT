#!/usr/bin/env node
'use strict'
// Reproducible offline browser assets; no CDN or runtime download.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const root = path.join(__dirname, '../electron')
const pkg = require.resolve('markdown-it/package.json', { paths: [root] })
const version = JSON.parse(fs.readFileSync(pkg, 'utf8')).version
if (version !== '15.0.2') throw new Error('Unexpected markdown-it version: ' + version)
const from = path.dirname(pkg), to = path.join(root, 'src/vendor')
const assets = [['dist/browser/markdown-it.umd.min.js', 'markdown-it-' + version + '.min.js'], ['LICENSE', 'markdown-it-LICENSE.txt']]
// Keep the dependency license texts with the bundled parser too, independently
// of electron-builder's node_modules exclusions.
for (const name of Object.keys(JSON.parse(fs.readFileSync(pkg, 'utf8')).dependencies)) {
  let dir = path.dirname(require.resolve(name, { paths: [from] }))
  while (!fs.existsSync(path.join(dir, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name) {
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('Could not resolve license owner: ' + name)
    dir = parent
  }
  const license = fs.readdirSync(dir).find((file) => /^LICENSE(?:-MIT)?(?:\.txt|\.md)?$/i.test(file))
  if (!license) throw new Error('Dependency license missing: ' + name)
  assets.push([path.join(dir, license), 'markdown-licenses/' + name + '-LICENSE.txt'])
}
for (const [source, target] of assets) {
  const bytes = fs.readFileSync(path.resolve(from, source)), dest = path.join(to, target)
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(dest) || !bytes.equals(fs.readFileSync(dest))) throw new Error('Markdown asset missing or stale: ' + target)
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, bytes)
  }
  console.log('Markdown asset verified: ' + target + ' ' + crypto.createHash('sha256').update(bytes).digest('hex'))
}
