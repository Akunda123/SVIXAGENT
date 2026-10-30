/**
 * afterPack 钩子（2026-10-30）
 *
 * 为什么需要它：**electron-builder 26 会把 extraResources 源目录里的 node_modules
 * 「提到」(hoist) 应用自己的 app.asar.unpacked/node_modules** —— 于是
 *   resources/dsh/node_modules（内嵌 dsh host 的依赖）与
 *   resources/server/node_modules（MCP server 的依赖）
 * 在包里整目录消失。1.1.7 因此一启动就报「内嵌 dsh host 入口不存在」：
 *   resources/dsh/apps/.../bin.js（实际入口原本在 resources/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js）。
 * 在 filter 里显式写 node_modules 通配也救不回来（实测），所以必须在本钩子里手工补拷。
 *
 * 时机：electron-builder 的 afterPack 在「应用目录打包完成之后、生成 NSIS/DMG 之前」执行
 *   ⇒ 这里拷进去的文件会进安装包。
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')

/** 递归拷贝（保留符号链接指向的真实内容） */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  let files = 0
  let bytes = 0
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, ent.name)
    const dst = path.join(to, ent.name)
    if (ent.isSymbolicLink()) {
      let real = null
      try { real = fs.realpathSync(src) } catch { real = null }
      if (!real || !fs.existsSync(real)) continue
      const st = fs.statSync(real)
      if (st.isDirectory()) {
        const r = copyDir(real, dst); files += r.files; bytes += r.bytes
      } else {
        fs.copyFileSync(real, dst); files++; bytes += st.size
      }
      continue
    }
    if (ent.isDirectory()) { const r = copyDir(src, dst); files += r.files; bytes += r.bytes; continue }
    if (ent.isFile()) { const st = fs.statSync(src); fs.copyFileSync(src, dst); files++; bytes += st.size }
  }
  return { files, bytes }
}

exports.default = async function afterPack(context) {
  const isMac = context.electronPlatformName === 'darwin'
  const isWin = context.electronPlatformName === 'win32'
  if (!isMac && !isWin) return

  const appOut = context.appOutDir
  const resources = isMac
    ? path.join(appOut, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(appOut, 'resources')

  const repo = path.resolve(__dirname, '..', '..')   // electron/ 的上一级
  const jobs = [
    { name: 'dsh', from: path.join(repo, 'dsh-runtime', 'dsh', 'node_modules'), to: path.join(resources, 'dsh', 'node_modules') },
    { name: 'server', from: path.join(repo, 'dist', 'server-runtime', 'node_modules'), to: path.join(resources, 'server', 'node_modules') }
  ]

  for (const j of jobs) {
    if (!fs.existsSync(j.from)) {
      console.warn(`[afterPack] ⚠️ 源目录不存在，跳过 ${j.name}: ${j.from}`)
      continue
    }
    if (fs.existsSync(j.to)) fs.rmSync(j.to, { recursive: true, force: true })
    const t0 = Date.now()
    const r = copyDir(j.from, j.to)
    console.log(`[afterPack] ✅ ${j.name}/node_modules 已补回：${r.files} 个文件 / ${(r.bytes / 1048576).toFixed(1)} MB（${Date.now() - t0} ms）`)
  }

  /* 自检：缺任何一条，装完就是"起不来 / 没工具" */
  const must = [
    path.join(resources, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    path.join(resources, 'server', 'node_modules'),
    path.join(resources, 'server', 'dist', 'index.js')
  ]
  for (const p of must) {
    if (!fs.existsSync(p)) throw new Error('[afterPack] 自检失败，包不完整：' + p)
  }
  console.log('[afterPack] ✅ 自检通过（dsh 入口 / server 依赖 / server 入口 都在）')
}
