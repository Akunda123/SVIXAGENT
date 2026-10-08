'use strict'
/**
 * 下载传输层（给主进程自己的下载用）—— **走 Electron 的 `net`，也就是 Chromium 网络栈**。
 *
 * 为什么（2026-10-08，用户「stt 也做成跟系统」）：
 *   `stt-model.js` 原来用 Node 的 `https.get` 下语音模型（最大 217 MB）。而 Node：
 *     · **不读** Windows「Internet 设置」/ macOS 系统设置里的代理；
 *     · **也不读** `HTTP(S)_PROXY` 环境变量（`https.get` 要显式给 agent）。
 *   ⇒ 用户把代理设成"系统代理"（或只设了 env）时，**语音模型根本下不下来**（国内尤其明显），
 *     而宿主那边的请求至少还能靠 env 注入救 —— 主进程这个下载连 env 都没有。
 *   Electron 的 `net.request` 用的是 Chromium 网络栈，**天生遵循会话的代理设置**
 *   （默认 = 系统代理，连 PAC 与 SOCKS 都支持，比宿主那条只认 http(s) 的路还宽）。
 *
 * 契约与 `stt-model.js` 的 `downloadFile(url, dest, onProgress)` 一致：
 *   · 先写 `dest + '.part'`，成功后 rename（中途失败不留半个文件）
 *   · 空闲超时（默认 60s 无数据）判失败 —— 与原来那条"按 socket 空闲"的口径一致，
 *     这样上层"换下一个下载源"的兜底照常生效（大文件能下完，卡住时不再无限等）
 *   · 重定向交给 Chromium（`redirect: 'follow'`）
 *
 * 依赖注入（`net` / `fs` / `path`）是为了能单测：用一个假的 `net` 就能把成功 / 非 2xx /
 * 空闲超时 / 中途出错四条路径全跑一遍，不必真联网。
 */
const DEFAULT_IDLE_TIMEOUT_MS = 60000

/**
 * @param {{net:any, fs:any, path?:any, idleTimeoutMs?:number}} deps
 * @returns {(url:string, dest:string, onProgress?:Function) => Promise<void>}
 */
function createElectronDownloader({ net, fs, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS }) {
  if (!net || typeof net.request !== 'function') throw new Error('createElectronDownloader 需要 Electron 的 net 模块')
  if (!fs || typeof fs.createWriteStream !== 'function') throw new Error('createElectronDownloader 需要 fs')

  return function download(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
      const part = dest + '.part'
      let settled = false
      let idle = null
      let req = null
      let out = null
      let res = null

      /* 清理顺序**很重要**（2026-10-08 由 `tools/test-stt-transport.cjs` 的偶发失败揪出来的真 bug）：
       *   原先写的是 `out.close()`（**异步**）**紧接着** `fs.unlinkSync(part)` —— Windows 上写流的句柄
       *   还没释放，unlink 会 EPERM/EBUSY，而那个 catch 把它吞了 ⇒ **失败路径有时留下半个 .part 文件**
       *   （用户侧表现：下载失败后模型目录里残留 `.part`，最多 217 MB/次，且"换下一个源"会再来一份）。
       *   ⇒ 现在：先 abort 请求、destroy 响应，再 **destroy 写流并等它 close（句柄真的放开）之后才 unlink**。 */
      const removePart = () => { try { fs.unlinkSync(part) } catch { /* 本来就没有/已被删 */ } }
      const cleanup = (err) => {
        if (settled) return
        settled = true
        clearTimeout(idle)
        try { if (req) req.abort() } catch { /* 忽略 */ }
        try { if (res) res.destroy() } catch { /* 忽略 */ }
        /* ⚠️ **删干净再 reject**：调用方（`downloadModel` 的换源循环 / 测试）在拿到失败时，
         *   契约就是"不留半个文件"。若先 reject 再删，调用方立刻 `existsSync` 还能看到 `.part`
         *   —— 那是不确定的（2026-10-08 实测：测试因此偶发失败）。 */
        const done = () => { removePart(); reject(err) }
        if (!out || out.closed) return done()
        out.once('close', done)          // ⬅ 等 close（fd 真的释放）再删
        try { out.destroy() } catch { done() }
      }
      const armIdle = () => {
        clearTimeout(idle)
        idle = setTimeout(() => cleanup(new Error(`下载超时（${Math.round(idleTimeoutMs / 1000)}s 无数据）：${url}`)), idleTimeoutMs)
      }

      try { out = fs.createWriteStream(part) } catch (e) { out = null; return cleanup(e) }
      try { req = net.request({ url, redirect: 'follow' }) } catch (e) { return cleanup(e) }

      req.on('response', (r) => {
        if (settled) return
        res = r
        const status = Number(res.statusCode) || 0
        if (status < 200 || status >= 300) return cleanup(new Error(`HTTP ${status} for ${url}`))
        const total = Number((res.headers && res.headers['content-length']) || 0)
        let received = 0
        armIdle()
        res.on('data', (chunk) => {
          received += chunk.length
          armIdle()
          if (onProgress && total) onProgress(received, total)
        })
        res.on('error', cleanup)
        res.pipe(out)
        out.on('error', cleanup)
        out.on('finish', () => {
          if (settled) return
          out.close(() => {
            if (settled) return
            try { fs.renameSync(part, dest) } catch (e) { return cleanup(e) }
            settled = true
            clearTimeout(idle)
            resolve()
          })
        })
      })
      req.on('error', cleanup)
      req.end()
    })
  }
}

module.exports = { createElectronDownloader, DEFAULT_IDLE_TIMEOUT_MS }
