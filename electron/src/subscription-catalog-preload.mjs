// Runs only in AKDAgent's owned DSH child, before the host imports its SDK.
// No inference, credential access, global env mutation, or installed SDK writes.
import fs from 'node:fs'
import * as nodeModule from 'node:module'
const catalog = JSON.parse(fs.readFileSync(new URL('./subscription-models.json', import.meta.url), 'utf8'))
const { default: overlay } = await import(new URL('./subscription-catalog.js', import.meta.url))
// DSH may load a second SDK copy through its owned profile dependency tree.
// Hook the catalog owner in every such module instance, including copies that
// are first created while booting. No proxy files or SDK files are rewritten.
const suffix = '/node_modules/@earendil-works/pi-ai/dist/models.generated.js'
const apply = '\n;(' + overlay.applyCatalog.toString() + ')(MODELS,' + JSON.stringify(catalog) + ');\n'
if (typeof nodeModule.registerHooks !== 'function') {
  console.warn('[akdagent] Model catalog extension needs Node >=22.15; using the SDK catalog unchanged.')
} else nodeModule.registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (new URL(url).pathname.endsWith(suffix) && result.format === 'module') {
      const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8')
      return { ...result, source: source + apply }
    }
    return result
  },
})
