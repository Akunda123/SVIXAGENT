/* Mechanical, hash-verified 1.1.1 backport. Never installs or alters the live app. */
'use strict'
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { spawnSync } = require('node:child_process'), assert = require('node:assert/strict')
const repo = path.resolve(__dirname, '..'), runtime = path.join(repo, 'dist/ux-fix-runtime')
const asar = require(path.join(repo, 'dist/network-test-runtime/node_modules/@electron/asar'))
const current = 'D:/Program Files/Synthesizer V Studio 2 Pro/AKDAgent/resources/app.asar'
const original = process.env.AKD_UX_BASE_ASAR || current
const stage = fs.mkdtempSync(path.join(runtime, 'stage-1.1.1-network.2-')), output = path.join(repo, 'dist/AKDAgent-Network-Addon-1.1.1-network.2')
const snapshot = path.join(runtime, 'source-before')
const changed = ['main.js', 'settings.html', 'orb.html', 'orb-preload.js', 'settings-preload.js', 'network-settings-ui.js', 'i18n/index.js', 'i18n/network.json', 'plugins/akd-auth-bridge/index.js']
const added = ['session-binding.js', 'subscription-profiles.js', 'chat-markdown.js', 'subscription-catalog.js', 'subscription-catalog-preload.mjs', 'subscription-models.json', 'i18n/uxFixes.json', 'vendor/markdown-it-15.0.2.min.js', 'vendor/markdown-it-LICENSE.txt',
  ...['entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro'].map((name) => 'vendor/' + name + '-LICENSE.txt')]
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
const norm = (p) => p.replace(/^[\\/]/, '').replaceAll('\\', '/')
const native = (p) => p.replaceAll('/', path.sep)
const stat = (p, file) => asar.statFile(p, native(file))
// Installer backups intentionally contain only changed unpacked files. Other
// unpacked assets were not touched and remain in the live installation.
const extract = (p, file) => asar.extractFile(p === original && original !== current && stat(p, file).unpacked ? current : p, native(file))
const files = (p) => asar.listPackage(p).map(norm).filter((f) => !stat(p, f).files)
function run(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw new Error('Backport refused: ' + result.stderr)
}
;(async () => {
  fs.mkdirSync(runtime, { recursive: true }); fs.mkdirSync(output, { recursive: true })
  for (const file of files(original)) {
    const target = path.join(stage, native(file))
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, extract(original, file))
  }
  for (const name of changed) {
    const after = path.join(repo, 'electron/src', name), before = path.join(snapshot, name)
    if (!fs.existsSync(before)) {
      fs.mkdirSync(path.dirname(before), { recursive: true })
      if (name === 'settings-preload.js') {
        // Only our one callback was added since this already-dirty file's snapshot.
        const current = fs.readFileSync(after, 'utf8')
        assert.equal((current.match(/^  onModelCatalogChanged:.*$/gm) || []).length, 1)
        fs.writeFileSync(before, current.replace(/^  onModelCatalogChanged:.*\r?\n/m, ''))
      } else if (name === 'plugins/akd-auth-bridge/index.js') {
        // This file was clean at preflight; HEAD is its exact pre-change source.
        const result = spawnSync('git', ['show', 'HEAD:electron/src/' + name], { cwd: repo })
        assert.equal(result.status, 0); fs.writeFileSync(before, result.stdout)
      } else throw new Error('Missing source snapshot: ' + name)
    }
    const diff = spawnSync('git', ['diff', '--no-index', '--', before, after], { cwd: repo, encoding: 'utf8', windowsHide: true })
    assert.equal(diff.status, 1, 'Expected an actual scoped change: ' + name)
    const patch = diff.stdout.split('\n').map((line) => line.startsWith('diff --git ') ? `diff --git a/src/${name} b/src/${name}`
      : line.startsWith('--- ') ? `--- a/src/${name}` : line.startsWith('+++ ') ? `+++ b/src/${name}` : line).join('\n')
    const patchFile = path.join(runtime, 'patches', name.replaceAll('/', '_') + '.patch')
    fs.mkdirSync(path.dirname(patchFile), { recursive: true }); fs.writeFileSync(patchFile, patch)
    const destination = path.relative(repo, stage).replaceAll('\\', '/')
    run(['apply', '--check', '--whitespace=nowarn', '--directory=' + destination, patchFile])
    run(['apply', '--whitespace=nowarn', '--directory=' + destination, patchFile])
  }
  for (const name of added) {
    const target = path.join(stage, 'src', name)
    assert.ok(!fs.existsSync(target)); fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(repo, 'electron/src', name), target)
  }
  const pkgPath = path.join(stage, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgPath))
  assert.equal(pkg.version, '1.1.1-network.1'); pkg.version = '1.1.1-network.2'
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  const oldFiles = files(original), streams = [], oldEntries = new Set(asar.listPackage(original).map(norm))
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + entry.name, full = path.join(dir, entry.name)
      const unpacked = oldEntries.has(name) && !!stat(original, name).unpacked
      if (entry.isDirectory()) { streams.push({ type: 'directory', path: native(name), unpacked }); walk(full, name + '/') }
      else { assert.ok(entry.isFile()); streams.push({ type: 'file', path: native(name), unpacked, stat: fs.statSync(full), streamGenerator: () => fs.createReadStream(full) }) }
    }
  }
  walk(stage); const next = path.join(output, 'app.asar')
  await asar.createPackageFromStreams(next, streams); asar.uncache(next)
  const changedSet = new Set(['package.json', ...changed.map((f) => 'src/' + f)]), newFiles = files(next)
  let unchanged = 0
  for (const file of oldFiles) {
    assert.ok(newFiles.includes(file)); assert.equal(!!stat(original, file).unpacked, !!stat(next, file).unpacked)
    if (!changedSet.has(file)) { assert.equal(hash(extract(original, file)), hash(extract(next, file)), 'Unrelated file changed: ' + file); unchanged++ }
  }
  assert.deepEqual(newFiles.filter((f) => !oldFiles.includes(f)).sort(), added.map((f) => 'src/' + f).sort())
  const updates = [{ relative: 'resources/app.asar', source: 'app.asar', before: hash(fs.readFileSync(current)) },
    ...['stt-model.js', 'network-probe.js'].map((name) => ({ relative: 'resources/app.asar.unpacked/src/' + name, source: 'app.asar.unpacked/src/' + name, before: hash(extract(current, 'src/' + name)) }))]
    .map((item) => ({ ...item, after: hash(fs.readFileSync(path.join(output, item.source))) }))
  const currentVersion = JSON.parse(extract(current, 'package.json')).version
  const manifest = { name: 'AKDAgent UX and Network Fixes', version: pkg.version, baseVersion: currentVersion, createdAt: new Date().toISOString(), updates, unchangedFilesVerified: unchanged, changedFiles: [...changedSet], addedFiles: added }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const name of ['Install-Network-Addon.ps1', 'Install-Network-Addon.cmd', 'Restore-Network-Addon.cmd']) fs.copyFileSync(path.join(repo, 'tools', name), path.join(output, name))
  fs.copyFileSync(path.join(repo, 'docs/AKDAgent-四项修复-20261008.md'), path.join(output, '使用说明.md'))
  for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md']) fs.copyFileSync(path.join(repo, name), path.join(output, name))
  console.log(JSON.stringify({ output, version: pkg.version, unchanged, updates }, null, 2))
})().catch((error) => { console.error(error.stack); process.exitCode = 1 })
