'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const C = require('../electron/src/codex-catalog.cjs')
const domRoot = process.env.AKDAGENT_TEST_DOM

test('Codex settings: ordinary/Fast models, login feedback, cancel, locale and selection', {skip:!domRoot}, async () => {
  const {JSDOM} = createRequire(path.join(domRoot,'package.json'))('jsdom')
  const dom = new JSDOM('<section id="root"></section>',{runScripts:'outside-only',url:'http://127.0.0.1/'})
  const {window}=dom
  const state={ok:true,signedIn:false,models:C.catalog(),fastModels:C.catalog().filter(m=>C.FAST_MODELS.includes(m.id)),fastEnabled:false,selected:{},updated:C.UPDATED}
  let listener,finishLogin,cancelled=false,selection
  const dictionary=JSON.parse(fs.readFileSync(path.join(__dirname,'../electron/src/i18n/settings.json'),'utf8'))['zh-Hans']
  const api={
    codexStatus:async()=>state,onCodexEvent:cb=>{listener=cb;return()=>{}},
    codexLogin:()=>new Promise(resolve=>{finishLogin=resolve}),
    codexCancel:()=>{cancelled=true;finishLogin?.({ok:false,error:'cancelled'})},
    codexFast:async enabled=>{state.fastEnabled=enabled;return{ok:true}},
    codexSelect:async(...args)=>{selection=args;return{ok:true}},
    codexRefresh:async()=>({ok:true}),codexLogout:async()=>({ok:true}),
    codexReply:async()=>({ok:true}),openExternal:()=>{},
  }
  window.eval(fs.readFileSync(path.join(__dirname,'../electron/src/codex-settings.js'),'utf8'))
  const root=window.document.getElementById('root')
  window.initCodexSettings(root,api,{t:k=>dictionary[k]||k,onChange:()=>{}})
  const tick=()=>new Promise(resolve=>setImmediate(resolve))
  await tick()
  const button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text)
  assert.ok(root.textContent.includes('GPT-6.1 Sol'))
  assert.ok(root.textContent.includes('GPT-6 Astra'))
  assert.ok(!root.textContent.includes('settings.codex.'))
  const fast=root.querySelector('input[type="checkbox"]')
  fast.checked=true;fast.dispatchEvent(new window.Event('change'))
  await tick()
  let selects=root.querySelectorAll('select')
  selects[0].value=C.FAST_PROVIDER;selects[0].dispatchEvent(new window.Event('change'))
  selects=root.querySelectorAll('select')
  assert.equal(selects[1].options.length,2)
  selects[1].value='gpt-6.1-sol';selects[1].dispatchEvent(new window.Event('change'))
  button('设为默认模型').click();await tick()
  assert.equal(selection[0],C.FAST_PROVIDER);assert.equal(selection[1],'gpt-6.1-sol')
  button('浏览器登录').click();await tick()
  listener({type:'auth-url',url:'https://auth.openai.com/oauth/authorize?state=synthetic'})
  listener({type:'prompt',attempt:'one',id:1})
  assert.ok(root.querySelector('input[type="password"]'))
  assert.equal(button('退出登录'),undefined)
  button('取消登录').click();await tick()
  assert.equal(cancelled,true);assert.ok(root.textContent.includes('登录已取消'))
  assert.equal(root.querySelector('input[type="password"]'),null)
  dom.window.close()
})
