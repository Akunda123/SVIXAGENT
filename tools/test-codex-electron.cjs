'use strict'
// Run as a tiny packaged Electron app with copied production sources. The build
// recipe is in CODEX-INTEGRATION.md. Uses a dedicated home, never ~/.dsh.
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const assert = require('node:assert/strict')
const home = process.env.AKDAGENT_REVIEW_HOME
if (!home || !path.isAbsolute(home)) throw new Error('Dedicated AKDAGENT_REVIEW_HOME required')
fs.mkdirSync(home,{recursive:true})
app.setPath('userData',path.join(home,'electron'))
const root = path.join(process.resourcesPath,'dsh')
const node = path.join(process.resourcesPath,'node',process.platform==='win32'?'node.exe':'node')
const requireRuntime=createRequire(path.join(root,'package.json'))
const yaml=requireRuntime('js-yaml')
const src=path.join(__dirname,'src')
const unpacked=file=>path.join(src,file).replace(/app\.asar([\\/])/,'app.asar.unpacked$1')
const {createCodexService}=require(path.join(src,'codex-service.cjs'))
const {registerCodexIPC}=require(path.join(src,'codex-controller.cjs'))
const C=require(path.join(src,'codex-catalog.cjs'))
const settingsFile=path.join(home,'settings.yaml')
const reportFile=path.join(home,'electron-review.json')
const report={packaged:app.isPackaged,checks:[]}
const persist=()=>fs.writeFileSync(reportFile,JSON.stringify(report,null,2))
const check=(name,ok)=>{assert.ok(ok,name);report.checks.push(name);persist()}
const readSettings=()=>fs.existsSync(settingsFile)?yaml.load(fs.readFileSync(settingsFile,'utf8'))||{}:{}
const hasGrant=()=>{try{return C.validGrant(yaml.load(fs.readFileSync(path.join(home,'.credentials.yaml'),'utf8'))?.records?.['llm-pi-ai/openai-codex'])}catch{return false}}
let win
const service=createCodexService({paths:()=>({root,home,node,worker:unpacked('codex-auth-worker.mjs')}),
  emit:event=>{
    if(win&&!win.isDestroyed())win.webContents.send('akdagent-codex-event',event)
    // No access/refresh token ever enters this test report.
    if(['auth-url','device-code'].includes(event.type)){report.authorization=event;persist()}
  },openExternal:url=>shell.openExternal(url),
})
registerCodexIPC({ipcMain,getSettingsWindow:()=>win,service,readSettings,hasGrant,
  writeSettings:settings=>{fs.writeFileSync(settingsFile,yaml.dump(settings),{mode:0o600});return true}})
const dictionary=JSON.parse(fs.readFileSync(path.join(src,'i18n/settings.json'),'utf8'))['zh-Hans']
ipcMain.on('akdagent-i18n-sync',e=>{e.returnValue={locale:'zh-Hans',dict:dictionary}})
app.on('window-all-closed',()=>{})
app.on('before-quit',()=>service.dispose())
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,width:900,height:800,webPreferences:{contextIsolation:true,nodeIntegration:false,
    preload:path.join(src,'settings-preload.js')}})
  const page=path.join(__dirname,'review.html')
  await win.loadFile(page)
  const call=(method,...args)=>win.webContents.executeJavaScript(`window.svsettings[${JSON.stringify(method)}](...${JSON.stringify(args)})`)
  check('actual packaged Electron',app.isPackaged)
  check('native worker outside asar',fs.existsSync(unpacked('codex-auth-worker.mjs')))
  const status=await call('codexStatus')
  report.startSignedIn=status.signedIn
  check('preload IPC accepted main settings frame',status.ok)
  check('Astra and 6.1 Sol reach renderer',C.FAST_MODELS.every(id=>status.models.some(m=>m.id===id)))
  check('Fast enable persisted', (await call('codexFast',true)).ok&&readSettings()['akdagent-codex'].fastEnabled)
  check('Fast selection persisted',(await call('codexSelect',C.FAST_PROVIDER,'gpt-6.1-sol','high')).ok&&readSettings()['agent-default-model'].provider===C.FAST_PROVIDER)
  check('ordinary selection persisted',(await call('codexSelect',C.PROVIDER,'gpt-6-astra','high')).ok)
  const untrusted=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(src,'settings-preload.js')}})
  await untrusted.loadFile(page)
  check('different window IPC rejected',(await untrusted.webContents.executeJavaScript('window.svsettings.codexStatus()')).error==='forbidden')
  untrusted.destroy()
  await fs.promises.writeFile(path.join(home,'settings-preview.png'),(await win.webContents.capturePage()).toPNG())
  if(process.env.AKDAGENT_REVIEW_LOGOUT==='1'){
    check('saved authorization survived a new Electron process',status.signedIn)
    check('real authorization removed via settings IPC',(await call('codexLogout')).ok&&!hasGrant())
    check('signed-out state reaches renderer',!(await call('codexStatus')).signedIn)
    report.phase='signed-out';persist()
  } else if(process.env.AKDAGENT_REVIEW_LIVE==='1'){
    report.phase='waiting-for-browser-authorization';persist()
    const signed=await call('codexLogin',process.env.AKDAGENT_REVIEW_METHOD||'browser')
    report.loginResult={ok:signed.ok,error:signed.error};persist()
    check('real OAuth login completed',signed.ok&&hasGrant())
    delete report.authorization
    check('persisted authorization visible after status refresh',(await call('codexStatus')).signedIn)
    report.phase='authorized';persist()
  } else {report.phase='offline-passed';persist()}
  service.dispose();win.destroy();app.quit()
}).catch(error=>{
  report.phase='failed';report.error=String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,300);persist()
  service.dispose();app.exit(1)
})
