'use strict'
// Full bundled web-host smoke test. Synthetic settings only; no inference or login.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { createRequire } = require('node:module')
const C = require('../electron/src/codex-catalog.cjs')

async function main() {
  const runtime = process.env.AKDAGENT_TEST_RUNTIME
  if (!runtime) throw new Error('Set AKDAGENT_TEST_RUNTIME to a bundled npm runtime')
  const requireRuntime = createRequire(path.join(runtime, 'package.json'))
  const yaml = requireRuntime('js-yaml')
  const parent = fs.realpathSync(os.tmpdir())
  const home = fs.mkdtempSync(path.join(parent, 'akd-codex-host-'))
  let child, diagnostics = ''
  try {
    const probe = net.createServer()
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
    const port = probe.address().port
    await new Promise(resolve => probe.close(resolve))
    const settings = C.configure({}, C.catalog())
    settings['akdagent-codex'] = { fastEnabled: true }
    fs.writeFileSync(path.join(home, 'settings.yaml'), yaml.dump(settings))
    const profile = path.join(home, 'profiles', 'web')
    fs.mkdirSync(profile, { recursive: true })
    const marker = path.join(home, 'smoke-ok.json')
    const assertion = path.join(home, 'assertion.mjs')
    fs.writeFileSync(assertion, `import fs from 'node:fs';
export const inject=['llm'];
export function apply(ctx) {
 let done=false;
 const check=async()=>{
  if(done || !ctx.llm.listProviders().some(p=>p.id==='openai-codex-fast')) return;
  for(const provider of ['openai-codex','openai-codex-fast']) for(const id of ['gpt-6-astra','gpt-6.1-sol']) {
   const model=await ctx.llm.resolveModelInfo(provider,id);
   if(model.context.contextWindow!==1050000) throw new Error('Wrong model capacity');
  }
  done=true; fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ok:true}));
 };
 ctx.on('llm/adapters-updated',()=>{void check().catch(()=>{})}); void check().catch(()=>{});
}`)
    fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), yaml.dump([{insert:[
      {id:'akdagent-codex-fast',name:pathToFileURL(path.resolve(__dirname,'../electron/src/codex-fast-plugin.mjs')).href,
        config:{runtimeRoot:runtime,settingsPath:path.join(home,'settings.yaml')}},
      {id:'codex-smoke-assertion',name:pathToFileURL(assertion).href},
    ]}]))
    const env = {...process.env,DSH_HOME:home}
    for (const key of Object.keys(env)) if (/API_KEY|TOKEN|^DSH_/i.test(key) && key !== 'DSH_HOME') delete env[key]
    child = spawn(process.execPath,[path.join(runtime,'node_modules/@deepseek-ai/dsh/lib/bin.js'),'web','--port',String(port),'--no-open'],
      {cwd:runtime,env,stdio:['ignore','pipe','pipe'],windowsHide:true})
    child.stdout.on('data', d => { diagnostics += d.toString() })
    child.stderr.on('data', d => { diagnostics += d.toString() })
    await new Promise((resolve,reject) => {
      const started=Date.now()
      const timer=setInterval(()=>{
        if(fs.existsSync(marker)) {clearInterval(timer);resolve()}
        else if(child.exitCode!==null || Date.now()-started>45000) {clearInterval(timer);reject(new Error('Host did not resolve both Codex routes'))}
      },200)
    })
    console.log('PASS: real bundled web host loaded the plugin and resolved Astra / 6.1 Sol on ordinary + Fast routes; no model requests.')
  } catch (error) {
    // Synthetic home only; omit ephemeral session URLs and tokens even here.
    console.error(error.message)
    console.error(diagnostics.replace(/https?:\/\/\S+/g,'[URL]').replace(/token[=:]\S+/gi,'token=[redacted]').slice(-3500))
    process.exitCode=1
  } finally {
    if(child && child.exitCode===null) {
      if(process.platform==='win32') spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
      else child.kill()
      await new Promise(resolve=>child.exitCode!==null ? resolve() : child.once('close',resolve))
    }
    const resolved=path.resolve(home)
    if(path.dirname(resolved)!==parent || !path.basename(resolved).startsWith('akd-codex-host-')) throw new Error('Unexpected cleanup path')
    fs.rmSync(resolved,{recursive:true,force:true})
  }
}
main().catch(()=>{console.error('Host smoke setup failed');process.exitCode=1})
