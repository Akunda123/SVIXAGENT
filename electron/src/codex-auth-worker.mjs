import { createInterface } from 'node:readline'
import { loadRuntime, withStore } from './codex-runtime.mjs'
import catalogModule from './codex-catalog.cjs'
const { PROVIDER, catalog, validGrant, loginTimeoutMs } = catalogModule

// stdin/stdout are a bounded control protocol, never a token transport.
const [root, home, command, method = 'browser'] = process.argv.slice(2)
const abort = new AbortController()
const emit = event => process.stdout.write(JSON.stringify(event) + '\n')
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
let pending, serial = 0, disposeProxy, acceptKey
const keyInput = new Promise(resolve => { acceptKey = resolve })
input.on('line', line => {
  if (line.length > 16384) return
  try {
    const message = JSON.parse(line)
    if (message.type === 'cancel') abort.abort()
    else if (message.type === 'key') acceptKey(message)
    else if (message.type === 'answer' && pending?.id === message.id) pending.resolve(String(message.value || ''))
  } catch { /* Ignore malformed input, never echo it. */ }
})
input.on('close', () => abort.abort())
process.on('SIGTERM', () => abort.abort())
process.on('SIGINT', () => abort.abort())
const timer = setTimeout(() => abort.abort(), loginTimeoutMs(method))
timer.unref()

function promptUser(prompt) {
  if (prompt.type === 'select') {
    const choice = prompt.options.find(o => method === 'device' ? /device/i.test(o.id) : /browser/i.test(o.id))
    if (!choice) throw new Error('UNSUPPORTED_LOGIN')
    return Promise.resolve(choice.id)
  }
  if (prompt.type !== 'manual_code') throw new Error('UNSUPPORTED_PROMPT')
  return new Promise((resolve, reject) => {
    const id = ++serial
    const signal = prompt.signal ? AbortSignal.any([abort.signal, prompt.signal]) : abort.signal
    const finish = (fn, value) => {
      signal.removeEventListener('abort', cancel)
      if (pending?.id === id) pending = undefined
      emit({ type: 'prompt-end', id })
      fn(value)
    }
    const cancel = () => finish(reject, new Error('CANCELLED'))
    pending = { id, resolve: value => finish(resolve, value) }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) return cancel()
    emit({ type: 'prompt', id })
  })
}

try {
  if (!root || !home || !['status', 'catalog', 'login', 'logout', 'set-key'].includes(command)) throw new Error('BAD_COMMAND')
  const runtime = await loadRuntime(root)
  const key = runtime.credentialKey('llm-pi-ai', PROVIDER)
  const provider = runtime.openaiCodexProvider()
  if (command === 'catalog') {
    emit({ type: 'result', ok: true, models: catalog(provider.getModels()) })
  } else await withStore(runtime, home, async store => {
    if (command === 'status') {
      const record = await store.readRecord(key)
      emit({ type: 'result', ok: true, signedIn: validGrant(record) })
    } else if (command === 'logout') {
      await store.deleteRecord(key)
      emit({ type: 'result', ok: true, signedIn: false })
    } else if (command === 'set-key') {
      const { ref, value } = await keyInput
      const name = runtime.credentialRef(ref)
      if (typeof value !== 'string' || value.length > 8192) throw new Error('INVALID_KEY')
      if (value) await store.set(name, value)
      else await store.unset(name)
      emit({ type: 'result', ok: true })
    } else {
      const { installProxyFromEnvironment } = await runtime.load('@deepseek-ai/dsh-http-proxy')
      disposeProxy = await installProxyFromEnvironment({ get: name =>
        process.env[name] === undefined ? undefined : { value: process.env[name] } }, () => { throw new Error('PROXY') })
      const grant = await provider.auth.oauth.login({
        signal: abort.signal,
        prompt: promptUser,
        notify(event) {
          if (event.type === 'auth_url') emit({ type: 'auth-url', url: event.url })
          else if (event.type === 'device_code') emit({ type: 'device-code', url: event.verificationUri, code: event.userCode })
          // Do not forward provider diagnostics (token endpoint bodies can leak secrets).
        },
      })
      abort.signal.throwIfAborted()
      const record = { kind: 'grant', payload: JSON.parse(JSON.stringify(grant)) }
      if (!validGrant(record) || grant.expires <= Date.now()) throw new Error('INVALID_GRANT')
      await store.modifyRecord(key, async () => { abort.signal.throwIfAborted(); return record })
      emit({ type: 'result', ok: true, signedIn: true })
    }
  })
} catch {
  emit({ type: 'result', ok: false, error: abort.signal.aborted ? 'cancelled' : 'auth-failed' })
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  pending = undefined
  input.close()
  await disposeProxy?.()
}
