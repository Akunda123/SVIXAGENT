/* Build-only: preserve the official ASAR's unpack layout and verify every unchanged file. */
'use strict'
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const repo=path.join(__dirname,'..'),runtime=path.join(repo,'dist/network-test-runtime')
const asar=require(path.join(runtime,'node_modules/@electron/asar'))
const original=process.argv[2]||'D:/Program Files/Synthesizer V Studio 2 Pro/AKDAgent/resources/app.asar'
const stage=path.join(runtime,'addon-1.1.1')
const output=path.join(repo,'dist/AKDAgent-Network-Addon-1.1.1-network.1')
const hash=(buffer)=>crypto.createHash('sha256').update(buffer).digest('hex')
const changed=new Set(['package.json','src/main.js','src/settings.html','src/settings-preload.js','src/stt-model.js','src/i18n/index.js'])
const added=new Set(['src/network-schema.js','src/network-settings.js','src/network-settings-ipc.js','src/network-settings-ui.js','src/network-probe.js','src/i18n/network.json'])
const norm=(p)=>p.replace(/^[\\/]/,'').replaceAll('\\','/')
const native=(name)=>name.replaceAll('/',path.sep)
const stat=(p,name)=>asar.statFile(p,native(name))
const extract=(p,name)=>asar.extractFile(p,native(name))
const files=(p)=>asar.listPackage(p).map(norm).filter((name)=>!stat(p,name).files)
;(async()=>{
  fs.mkdirSync(output,{recursive:true})
  const oldFiles=files(original)
  const streams=[]
  function walk(dir,prefix=''){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const name=prefix+entry.name,full=path.join(dir,entry.name)
      const originalEntry=asar.listPackage(original).map(norm).includes(name)?stat(original,name):null
      if(entry.isDirectory()){streams.push({type:'directory',path:native(name),unpacked:!!originalEntry?.unpacked});walk(full,name+'/')}
      else {assert.ok(entry.isFile(),'Unexpected link: '+name);streams.push({type:'file',path:native(name),unpacked:name==='src/network-probe.js'||!!originalEntry?.unpacked,stat:fs.statSync(full),streamGenerator:()=>fs.createReadStream(full)})}
    }
  }
  walk(stage)
  await asar.createPackageFromStreams(path.join(output,'app.asar'),streams)
  asar.uncache(path.join(output,'app.asar'))
  const next=path.join(output,'app.asar'),newFiles=files(next)
  let unchanged=0
  for(const file of oldFiles){
    assert.ok(newFiles.includes(file),'Missing original file: '+file)
    assert.equal(!!stat(original,file).unpacked,!!stat(next,file).unpacked,'Unpack flag changed: '+file)
    if(!changed.has(file)){assert.equal(hash(extract(original,file)),hash(extract(next,file)),'Unrelated change: '+file);unchanged++}
  }
  assert.deepEqual(newFiles.filter((name)=>!oldFiles.includes(name)).sort(),[...added].sort())
  assert.ok(stat(next,'src/network-probe.js').unpacked)
  const updates=[
    {relative:'resources/app.asar',source:'app.asar',before:hash(fs.readFileSync(original))},
    {relative:'resources/app.asar.unpacked/src/stt-model.js',source:'app.asar.unpacked/src/stt-model.js',before:hash(extract(original,'src/stt-model.js'))},
    {relative:'resources/app.asar.unpacked/src/network-probe.js',source:'app.asar.unpacked/src/network-probe.js',before:null},
  ].map((item)=>({...item,after:hash(fs.readFileSync(path.join(output,item.source)))}))
  const manifest={name:'AKDAgent Network Addon',version:'1.1.1-network.1',baseVersion:'1.1.1',createdAt:new Date().toISOString(),originalAsar:updates[0].before,updates,unchangedFilesVerified:unchanged,changedFiles:[...changed],addedFiles:[...added]}
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
  for(const name of ['Install-Network-Addon.ps1','Install-Network-Addon.cmd','Restore-Network-Addon.cmd'])fs.copyFileSync(path.join(repo,'tools',name),path.join(output,name))
  fs.copyFileSync(path.join(repo,'docs/AKDAgent-网络代理增强版说明.md'),path.join(output,'使用说明.md'))
  for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md'])fs.copyFileSync(path.join(repo,name),path.join(output,name))
  console.log(JSON.stringify({output,unchanged,updates},null,2))
})().catch((e)=>{console.error(e.stack);process.exitCode=1})
