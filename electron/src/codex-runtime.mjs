import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'

// Resolve peers from the bundled runtime, never a global npm install or another
// client's home. The Electron parent supplies this trusted installation path.
export async function loadRuntime(root) {
  const require = createRequire(path.join(root, 'package.json'))
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  const piRequire = createRequire(require.resolve('@deepseek-ai/dsh-llm-pi-ai'))
  // pi-ai 0.85.1 exports only the ESM `import` condition, so require.resolve
  // cannot resolve its provider subpaths. Use Node's dependency search roots.
  const piRoot = piRequire.resolve.paths('@earendil-works/pi-ai')
    .map(dir => path.join(dir, '@earendil-works', 'pi-ai'))
    .find(dir => existsSync(path.join(dir, 'package.json')))
  if (!piRoot) throw new Error('Bundled pi-ai not found')
  const pi = file => import(pathToFileURL(path.join(piRoot, 'dist', file)).href)
  const [{ Context }, { credentialKey, credentialRef }, { LocalCredentialProvider },
    { openaiCodexProvider }, llm, adapter] = await Promise.all([
    load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-credentials'),
    load('@deepseek-ai/dsh-credentials-local'), pi('providers/openai-codex.js'),
    load('@deepseek-ai/dsh-llm'), load('@deepseek-ai/dsh-llm-pi-ai'),
  ])
  return { Context, credentialKey, credentialRef, LocalCredentialProvider, openaiCodexProvider,
    ...llm, ...adapter, load }
}

export async function withStore(runtime, home, operation) {
  const ctx = new runtime.Context()
  const fiber = ctx.plugin(runtime.LocalCredentialProvider, { dshHome: home, watch: false })
  try { await fiber; return await operation(ctx.credentials) }
  finally { await fiber.dispose() }
}
