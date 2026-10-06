'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawn } = require('node:child_process')
const C = require('../electron/src/codex-catalog.cjs')
const { authUrl, createCodexService } = require('../electron/src/codex-service.cjs')
const root = process.env.AKDAGENT_TEST_RUNTIME
const worker = path.resolve(__dirname, '../electron/src/codex-auth-worker.mjs')

test('verified models, capabilities and retired models', () => {
  const models = C.catalog([{ id:'gpt-5.3-codex-spark' }, {id:'legacy', reasoning:true, thinkingLevelMap:{xhigh:null}, input:['text']}])
  assert.ok(models.some(m => m.id === 'gpt-6.1-sol'))
  assert.ok(models.some(m => m.id === 'gpt-6-astra'))
  assert.ok(!models.some(m => m.id === 'gpt-5.3-codex-spark'))
  assert.ok(!Object.hasOwn(models.find(m=>m.id==='legacy').reasoningEfforts, 'xhigh'))
  assert.ok(!Object.hasOwn(models[0].reasoningEfforts, 'minimal'))
  const original = { other:{keep:true}, 'llm-pi-ai':{providers:{google:{apiKeyEnv:'GOOGLE_API_KEY'},
    'openai-codex':{baseURL:'https://example.invalid',apiKeyEnv:'WRONG',headers:{Authorization:'synthetic'},models:[{id:'gpt-6-astra',contextWindow:800000}]}}} }
  const configured = C.configure(original, models)
  assert.equal(configured['llm-pi-ai'].providers['openai-codex'].baseURL, undefined)
  assert.equal(configured['llm-pi-ai'].providers['openai-codex'].models.find(m=>m.id==='gpt-6-astra').contextWindow,800000)
  assert.deepEqual(configured.other, original.other)
  assert.deepEqual(configured['llm-pi-ai'].providers.google, original['llm-pi-ai'].providers.google)
  assert.equal(original['llm-pi-ai'].providers['openai-codex'].baseURL, 'https://example.invalid')
})

test('only official authorization URLs can open a browser', () => {
  assert.ok(authUrl('https://auth.openai.com/oauth/authorize?state=test'))
  assert.ok(authUrl('https://auth.openai.com/codex/device'))
  for(const url of ['javascript:alert(1)','https://auth.openai.com.evil.test/oauth/authorize','https://user:pass@auth.openai.com/oauth/authorize','http://auth.openai.com/oauth/authorize','https://auth.openai.com:9000/oauth/authorize']) assert.equal(authUrl(url), null)
})

test('login single flight, stale replies, cancellation and late sign-out', async () => {
  let child, input=''
  const events=[], opened=[]
  const service=createCodexService({ paths:()=>({node:'node',worker:'worker',root:'root',home:'home'}),
    emit:e=>events.push(e),openExternal:u=>opened.push(u),
    spawnWorker(){child=new EventEmitter(); child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.on('data',d=>input+=d);child.kill=()=>child.emit('close',1);return child} })
  const pending=service.login('browser')
  assert.equal((await service.login('browser')).error,'busy')
  assert.equal((await service.logout()).error,'busy')
  child.stdout.write(JSON.stringify({type:'prompt',id:1})+'\n')
  const prompt=events.find(e=>e.type==='prompt')
  assert.equal(service.reply('stale',1,'callback').ok,false)
  assert.equal(service.reply(prompt.attempt,1,'callback').ok,true)
  assert.ok(input.includes('callback'))
  child.stdout.write(JSON.stringify({type:'auth-url',url:'https://auth.openai.com/oauth/authorize'})+'\n')
  assert.equal(opened.length,1)
  service.cancel(); assert.ok(input.includes('cancel'))
  child.stdout.write('{"type":"result","ok":false,"error":"cancelled"}\n');child.emit('close',0)
  assert.equal((await pending).error,'cancelled')
  assert.ok(!JSON.stringify(events).includes('callback'))
  service.dispose()
})

function runWorker(home, command, message) {
  return new Promise((resolve,reject) => {
    const child=spawn(process.execPath,[worker,root,home,command],{stdio:['pipe','pipe','pipe'],windowsHide:true})
    let stdout='',stderr=''
    child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d)
    child.on('error',reject)
    child.on('close',code=>{
      try { resolve({code,stdout,stderr,result:JSON.parse(stdout.trim().split('\n').pop())}) } catch(e){reject(e)}
    })
    if(message) child.stdin.write(JSON.stringify(message)+'\n')
  })
}

test('bundled runtime: native and Fast model resolution, shared locked credentials, worker logout', {skip:!root}, async () => {
  const {loadRuntime,withStore}=await import(pathToFileURL(path.resolve(__dirname,'../electron/src/codex-runtime.mjs')))
  const {createFastAdapter,sharedStore,priorityProvider}=await import(pathToFileURL(path.resolve(__dirname,'../electron/src/codex-fast-plugin.mjs')))
  const runtime=await loadRuntime(root)
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'akd-codex-'))
  const key=runtime.credentialKey('llm-pi-ai',C.PROVIDER)
  const unrelated=runtime.credentialKey('test','untouched')
  const grant={kind:'grant',payload:{type:'oauth',access:'synthetic-access',refresh:'synthetic-refresh',accountId:'synthetic-account',expires:Date.now()+3600000}}
  try {
    const settings=C.configure({}, C.catalog(runtime.openaiCodexProvider().getModels()))
    settings['akdagent-codex']={fastEnabled:true}
    await withStore(runtime,home,async credentials=>{
      await credentials.set(runtime.credentialRef('KEEP_KEY'),'synthetic-key')
      await credentials.modifyRecord(key,async()=>grant)
      await credentials.modifyRecord(unrelated,async()=>({kind:'api-key',key:'synthetic-other'}))
      const ctx=new runtime.Context()
      const llmFiber=ctx.plugin(runtime.LlmRuntime)
      await llmFiber
      const adapter=ctx.plugin({name:'test-pi',inject:runtime.inject,Config:runtime.Config,apply:runtime.apply},settings['llm-pi-ai'])
      try {
        await adapter
        for(const id of C.FAST_MODELS) {
          const model=await ctx.llm.resolveModelInfo(C.PROVIDER,id)
          assert.equal(model.id,id)
          assert.equal(model.context.contextWindow,1050000)
        }
      } finally { await adapter.dispose(); await llmFiber.dispose() }
      const fast=createFastAdapter(runtime,{credentials,get:()=>undefined},()=>settings)
      assert.deepEqual((await fast.listModels(C.FAST_PROVIDER)).map(m=>m.id).sort(),[...C.FAST_MODELS].sort())
      for(const id of C.FAST_MODELS) assert.equal((await fast.resolveModel(C.FAST_PROVIDER,id)).context.contextWindow,1050000)
      const shared=sharedStore(runtime,credentials)
      await shared.modify(C.PROVIDER,async value=>({...value,access:'synthetic-rotated'}))
      assert.equal((await credentials.readRecord(key)).payload.access,'synthetic-rotated')
      assert.equal((await credentials.readRecord(unrelated)).key,'synthetic-other')
      await assert.rejects(shared.read('google'))
      const body={model:'gpt-6.1-sol'}
      let captured
      const decorated=priorityProvider({streamSimple(_m,_c,options){captured=options;return 'stream'}})
      decorated.streamSimple({}, {}, {onPayload:p=>({...p,keep:true})})
      assert.deepEqual(await captured.onPayload(body,{}),{model:'gpt-6.1-sol',keep:true,service_tier:'priority'})
      assert.equal(body.service_tier,undefined)
      settings['akdagent-codex'].fastEnabled=false
      assert.deepEqual(await fast.listModels(C.FAST_PROVIDER),[])
      await assert.rejects(async()=>{for await (const _ of fast.stream({provider:C.FAST_PROVIDER,model:'gpt-6-astra',messages:[]})){}},/Enable Codex Fast/)
    })
    const before=await runWorker(home,'status');assert.equal(before.result.signedIn,true)
    const [keySave] = await Promise.all([
      runWorker(home,'set-key',{type:'key',ref:'ANOTHER_KEY',value:'synthetic-new-key'}),
      withStore(runtime,home,credentials=>credentials.modifyRecord(key,async current=>{
        await new Promise(resolve=>setTimeout(resolve,50))
        return {...current,payload:{...current.payload,access:'synthetic-concurrent'}}
      })),
    ])
    assert.equal(keySave.result.ok,true)
    await withStore(runtime,home,async credentials=>{
      assert.equal((await credentials.readRecord(key)).payload.access,'synthetic-concurrent')
      assert.equal((await credentials.resolve(runtime.credentialRef('ANOTHER_KEY'))).value,'synthetic-new-key')
    })
    const logout=await runWorker(home,'logout');assert.equal(logout.result.ok,true)
    assert.equal((await runWorker(home,'status')).result.signedIn,false)
    await withStore(runtime,home,async credentials=>assert.equal((await credentials.readRecord(unrelated)).key,'synthetic-other'))
    for(const result of [before,keySave,logout]) {
      assert.ok(!result.stdout.includes('synthetic-'));assert.equal(result.stderr,'')
    }
  } finally { fs.rmSync(home,{recursive:true,force:true}) }
})
