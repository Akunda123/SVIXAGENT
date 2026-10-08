'use strict'
const { app, BrowserWindow, ipcMain, session, net: electronNet } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const source=process.env.AKD_TEST_ASAR?path.join(process.env.AKD_TEST_ASAR,'src'):path.join(__dirname,'../src')
const N = require(path.join(source,'network-settings'))
const { registerNetworkSettings, probeBrowser, probeNode, electronDownloadTransport } = require(path.join(source,'network-settings-ipc'))
const i18n = require(path.join(source,'i18n'))
const artifacts = path.join(__dirname,'../../dist/network-test-runtime/evidence'+(process.env.AKD_TEST_ASAR?'-packaged':''))
fs.mkdirSync(artifacts,{recursive:true})
const userData=fs.mkdtempSync(path.join(artifacts,'userdata-'))
app.setPath('userData',userData)
app.on('window-all-closed',()=>{})
setTimeout(()=>app.exit(3),55000).unref()
const checks=[]
const check=(name,ok)=>{checks.push({name,ok});console.log((ok?'PASS ':'FAIL ')+name);assert.ok(ok,name)}

app.whenReady().then(async()=>{
  i18n.init({getPath:()=>userData,getSystemLocale:()=> 'zh-CN',getLocale:()=> 'zh-CN'})
  ipcMain.on('akdagent-i18n-sync',(e)=>{e.returnValue={locale:i18n.getLocale(),dict:i18n.dictFor('settings')}})
  const errors=[]
  const win=new BrowserWindow({width:900,height:900,show:false,webPreferences:{preload:path.join(__dirname,'test-settings-preload.cjs'),contextIsolation:true,nodeIntegration:false}})
  win.webContents.on('console-message',(_e,level,msg)=>{if(level>=3&&!msg.includes('Electron Security Warning'))errors.push(msg)})
  const store=N.createStore(userData), active=N.resolvePolicy(N.schema.defaults(),{})
  const handlers=new Map()
  let idle=true,restarts=0,confirmations=0
  registerNetworkSettings({ipcMain:{handle:(k,f)=>{handlers.set(k,f);ipcMain.handle(k,f)}},session,store,inherited:{},getActive:()=>active,getSender:()=>win.webContents,
    resolveNodeBin:()=>process.env.AKD_TEST_NODE,
    checkIdle:async()=>{if(!idle)throw N.codeError('busy')},askRestart:async()=>{confirmations++;return false},restart:()=>restarts++,
  })
  await win.loadFile(path.join(source,'settings.html'))
  const js=(code)=>win.webContents.executeJavaScript(code)
  const wait=()=>new Promise((r)=>setTimeout(r,100))
  const click=(id)=>js(`document.getElementById(${JSON.stringify(id)}).click()`)
  const input=(id,value)=>js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`)
  await js(`activatePage('network')`);await wait()
  check('initial route is original; no automatic network test',await js(`document.getElementById('network-route').value==='inherit' && document.getElementById('network-feedback').textContent===''`))
  check('network navigation is a keyboard-focusable button',await js(`document.querySelector('[data-page=network]').tagName==='BUTTON'`))
  await click('network-add');await wait();await click('network-save');await wait()
  check('empty name focuses first invalid and exposes a described error',await js(`document.activeElement.id==='network-name' && document.activeElement.getAttribute('aria-invalid')==='true' && !!document.activeElement.getAttribute('aria-describedby')`))
  await input('network-name','Clash 本地代理');await input('network-port','0');await click('network-save');await wait()
  check('port validation does not persist draft',store.read().revision===0 && await js(`document.activeElement.id==='network-port'`))
  await input('network-port','7897')
  const pid=await js(`document.getElementById('network-profile').value`)
  await input('network-route',pid)
  await click('network-save');await click('network-save');await wait()
  check('save uses real IPC/store once and leaves active route unchanged',store.read().revision===1 && store.read().selected===pid && active.mode==='inherit')
  check('saved versus active and restart-pending message are visible',await js(`document.getElementById('network-saved').textContent.includes('7897') && document.getElementById('network-pending').textContent.includes('重启') && !document.getElementById('network-apply').disabled`))
  idle=false;await click('network-apply');await wait()
  check('busy backend prevents confirmation/restart',confirmations===0&&restarts===0)
  idle=true;await click('network-apply');await wait()
  check('cancelled restart leaves saved settings intact',confirmations===1&&restarts===0&&store.read().selected===pid)
  const replace=(k,handler)=>{ipcMain.removeHandler(k);ipcMain.handle(k,handler)}
  replace('akdagent-network-save',async()=>({ok:false,code:'write'}))
  await input('network-name','Keep this draft');await click('network-save');await wait()
  check('failed save retains inputs and enables retry',await js(`document.getElementById('network-name').value==='Keep this draft' && !document.getElementById('network-save').disabled && document.getElementById('network-feedback').textContent.includes('保存失败')`))
  replace('akdagent-network-save',handlers.get('akdagent-network-save'))
  await click('network-discard');await wait()
  check('discard restores acknowledged profile and focus',await js(`document.getElementById('network-name').value==='Clash 本地代理' && document.activeElement.id==='network-route'`))
  let releaseTest,tests=0
  replace('akdagent-network-test',async()=>{tests++;return new Promise((r)=>{releaseTest=r})})
  await click('network-test');await click('network-test');await wait()
  check('test prevents duplicate requests but allows draft edits',tests===1 && await js(`document.getElementById('network-test').disabled && !document.getElementById('network-port').disabled`))
  await input('network-port','7898')
  releaseTest({ok:true,checks:[{kind:'node',ok:true,status:204},{kind:'browser',ok:true,status:204}]});await wait()
  check('late test result cannot certify edited route',await js(`document.getElementById('network-feedback').textContent.includes('重新测试') && !document.getElementById('network-feedback').textContent.includes('两个网络通路')`))
  await click('network-discard');await wait()
  replace('akdagent-network-test',async()=>({ok:false,checks:[{kind:'node',ok:false},{kind:'browser',ok:true,status:204}]}))
  await click('network-test');await wait()
  check('partial failure reports both routes without losing inputs',await js(`document.getElementById('network-feedback').textContent.includes('模型后台') && document.getElementById('network-port').value==='7897'`))
  for(const locale of i18n.LOCALES){
    i18n.setLocale(locale);win.webContents.send('akdagent-i18n-update',{locale,dict:i18n.dictFor('settings')});await wait()
    check('locale '+locale+' preserves profile and translates route feedback',await js(`document.getElementById('network-name').value==='Clash 本地代理' && !document.getElementById('page-network').textContent.includes('network.error.') && document.getElementById('page-network').querySelector('h1').textContent===window.svi18n.t('network.title')`))
    win.setSize(900,900);await wait();await js(`document.getElementById('main').scrollTop=0`)
    fs.writeFileSync(path.join(artifacts,'network-'+locale+'-900.png'),(await win.webContents.capturePage()).toPNG())
    win.setSize(620,900);await wait()
    check('locale '+locale+' has no horizontal overflow at 620px',await js(`document.body.scrollWidth<=innerWidth && document.getElementById('main').scrollWidth<=document.getElementById('main').clientWidth`))
    fs.writeFileSync(path.join(artifacts,'network-'+locale+'-620.png'),(await win.webContents.capturePage()).toPNG())
    await js(`document.getElementById('main').scrollTop=document.getElementById('main').scrollHeight`);await wait()
    fs.writeFileSync(path.join(artifacts,'network-'+locale+'-620-actions.png'),(await win.webContents.capturePage()).toPNG())
  }
  i18n.setLocale('zh-Hans');win.webContents.send('akdagent-i18n-update',{locale:'zh-Hans',dict:i18n.dictFor('settings')});await wait()
  await click('network-remove');await wait()
  check('selected-profile removal falls back only in draft',await js(`document.getElementById('network-route').value==='inherit'`) && store.read().selected===pid)
  await click('network-discard');await wait()
  check('remove can be reversed before save',await js(`document.getElementById('network-route').value===${JSON.stringify(pid)}`))
  check('no renderer script errors',errors.length===0 && await js(`document.querySelectorAll('[data-rej]').length===0`))
  check('i18n dictionary parity',Object.keys(i18n.audit()).length===0)

  // Exercise Chromium's real network stack and the injected speech-download transport locally.
  const origin=http.createServer((q,r)=>{if(q.url==='/redirect'){r.writeHead(302,{Location:'/payload'});r.end()}else{r.writeHead(200,{'content-length':7});r.end('payload')}})
  await new Promise((r)=>origin.listen(0,'127.0.0.1',r));const originPort=origin.address().port
  let proxied=0
  const proxy=http.createServer((q,r)=>{proxied++;const request=http.request({host:'127.0.0.1',port:originPort,path:new URL(q.url).pathname,method:q.method},(resp)=>{r.writeHead(resp.statusCode,resp.headers);resp.pipe(r)});q.pipe(request)})
  await new Promise((r)=>proxy.listen(0,'127.0.0.1',r));const proxyPort=proxy.address().port
  const candidate={...N.schema.defaults(),selected:'p-local',profiles:[{id:'p-local',name:'Local test',protocol:'http',host:'127.0.0.1',port:proxyPort}]}
  const route=N.resolvePolicy(candidate,{})
  const passed=await probeBrowser(session,route,'http://akd-probe.invalid:'+originPort+'/',3000)
  check('Chromium actually traverses selected HTTP proxy',passed.ok&&proxied>0)
  const countBefore=proxied
  const local=await probeBrowser(session,route,'http://127.0.0.1:'+originPort+'/',3000)
  check('Chromium loopback bypass',local.ok&&proxied===countBefore)
  const downloadSession=session.fromPartition('akd-download-test');await downloadSession.setProxy(route.chromium)
  const stt=require(path.join(source,'stt-model'));stt.setDownloadTransport(electronDownloadTransport(electronNet,downloadSession))
  const output=path.join(artifacts,'speech-transport-test.bin')
  await stt.downloadFile('http://akd-probe.invalid:'+originPort+'/redirect',output)
  check('speech download uses proxy, follows redirect, preserves payload',fs.readFileSync(output,'utf8')==='payload'&&proxied>countBefore)
  await downloadSession.closeAllConnections();proxy.closeAllConnections();origin.closeAllConnections();proxy.close();origin.close()

  if(process.env.AKD_TEST_LIVE_PROXY==='1'){
    const live=N.resolvePolicy({...candidate,profiles:[{...candidate.profiles[0],port:7897}]},{})
    const results=await Promise.all([probeNode(process.env.AKD_TEST_NODE,{},live),probeBrowser(session,live)])
    checks.push({name:'live HTTPS public probe (no model calls)',results})
    console.log('LIVE '+JSON.stringify(results))
  }
  fs.writeFileSync(path.join(artifacts,'network-verification.json'),JSON.stringify({electron:process.versions.electron,checks,errors,installedAppModified:false},null,2))
  console.log('Evidence: '+artifacts)
  app.exit(0)
}).catch((e)=>{console.error(e.stack);app.exit(1)})
