// Explicit opt-in acceptance test. Uses only a separately authorized test home.
// It never imports tokens from another client and never prints response content.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { loadRuntime } from '../electron/src/codex-runtime.mjs'
import { createFastAdapter } from '../electron/src/codex-fast-plugin.mjs'
import C from '../electron/src/codex-catalog.cjs'

const root=process.env.AKDAGENT_TEST_RUNTIME
const home=process.env.AKDAGENT_LIVE_TEST_HOME
if (process.env.AKDAGENT_LIVE_TEST !== '1' || !root || !home || !path.isAbsolute(home) ||
    ['.dsh','.dsh-akdagent','.codex'].includes(path.basename(home))) throw new Error('Explicit isolated live-test home required')
const require=createRequire(path.join(root,'package.json'))
const yaml=require('js-yaml')
const runtime=await loadRuntime(root)
const { installProxyFromEnvironment }=await runtime.load('@deepseek-ai/dsh-http-proxy')
const disposeProxy=await installProxyFromEnvironment({get:name=>process.env[name]===undefined?undefined:{value:process.env[name]}},()=>{throw new Error('Proxy setup failed')})
const ctx=new runtime.Context()
const fibers=[]
const report={requests:[],refresh:false,toolRoundTrips:0}
const reportPath=path.join(home,'live-model-review.json')
const persist=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2))
async function request(provider,model,messages,tools) {
  const chunks=[]
  for await (const chunk of ctx.llm.stream({provider,model,messages,tools,reasoningEffort:'low',maxTokens:256,
    system:'This is a short integration test. Follow the user instruction exactly.',signal:AbortSignal.timeout(90000)})) chunks.push(chunk)
  const finish=chunks.findLast(c=>c.type==='finish')
  const blocks=chunks.filter(c=>c.type==='block-end').map(c=>c.block)
  const row={provider,model,finish:finish?.reason?.kind,code:finish?.reason?.failure?.code||finish?.reason?.code,
    text:blocks.some(b=>b.type==='text'),toolCalls:blocks.filter(b=>b.type==='tool-call').map(b=>b.name)}
  report.requests.push(row);persist();console.log(JSON.stringify(row))
  if(!finish||['error','aborted'].includes(finish.reason.kind)) throw new Error('Live request failed')
  return {blocks,finish}
}
try {
  fibers.push(ctx.plugin(runtime.LocalCredentialProvider,{dshHome:home,watch:false}));await fibers.at(-1)
  const key=runtime.credentialKey('llm-pi-ai',C.PROVIDER)
  if(!C.validGrant(await ctx.credentials.readRecord(key)))throw new Error('Sign in to the isolated test app first')
  const settings=C.configure(yaml.load(fs.readFileSync(path.join(home,'settings.yaml'),'utf8'))||{},C.catalog(runtime.openaiCodexProvider().getModels()))
  settings['akdagent-codex']={fastEnabled:true}
  fibers.push(ctx.plugin(runtime.LlmRuntime));await fibers.at(-1)
  fibers.push(ctx.plugin({name:'review-pi',inject:runtime.inject,Config:runtime.Config,apply:runtime.apply},settings['llm-pi-ai']));await fibers.at(-1)
  ctx.llm.registerAdapter([C.FAST_PROVIDER],createFastAdapter(runtime,ctx,()=>settings))
  // Expire only the new test grant's local metadata. The real SDK must rotate it
  // under the shared store lock; no user/client credential is touched.
  await ctx.credentials.modifyRecord(key,async current=>({...current,payload:{...current.payload,expires:0}}))
  const schema={name:'codex_review_echo',description:'Read-only verification tool; returns the value argument unchanged.',
    parameters:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}
  for(const provider of [C.PROVIDER,C.FAST_PROVIDER])for(const model of C.FAST_MODELS){
    const marker='AKD_READY_62'
    const messages=[runtime.createUserMessage({source:{kind:'plugin',plugin:'codex-live-review'},
      content:[{type:'text',text:`Call codex_review_echo with value "${marker}". After the tool returns, reply only with that returned value.`}]})]
    const first=await request(provider,model,messages,[schema])
    const call=first.blocks.find(b=>b.type==='tool-call'&&b.name===schema.name)
    if(!call || JSON.parse(call.arguments).value!==marker)throw new Error('Expected verification tool call')
    messages.push(runtime.createAssistantMessage({content:first.blocks,source:{provider,model,...first.finish.replayState?{replayState:first.finish.replayState}:{}}}))
    messages.push(runtime.createToolResultMessage({callId:call.id,content:[{type:'text',text:marker}],isError:false}))
    const second=await request(provider,model,messages,[schema])
    if(!second.blocks.some(b=>b.type==='text'&&b.text.includes(marker)))throw new Error('Tool result was not returned')
    report.toolRoundTrips++;persist()
  }
  const refreshed=await ctx.credentials.readRecord(key)
  report.refresh=C.validGrant(refreshed)&&refreshed.payload.expires>Date.now()
  if(!report.refresh)throw new Error('Grant was not refreshed')
  report.ok=true;persist()
} catch {
  report.ok=false;persist();console.error('Live acceptance failed; see sanitized status report.');process.exitCode=1
} finally {
  for(const fiber of fibers.reverse())await fiber.dispose()
  await disposeProxy?.()
}
