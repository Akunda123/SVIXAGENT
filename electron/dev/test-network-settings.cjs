'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const { pathToFileURL } = require('node:url')
const N = require('../src/network-settings')
const { probeNode, registerNetworkSettings } = require('../src/network-settings-ipc')
const base = () => N.schema.defaults()
const custom = (port = 7897, protocol = 'http', host = '127.0.0.1') => ({ ...base(), selected: 'p-test', profiles: [{ id: 'p-test', name: 'Proxy', protocol, host, port }] })
const nodeBin = process.env.AKD_TEST_NODE || process.execPath
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-network-test-'))
test.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
const tlsFixture = process.env.AKD_TEST_TLS_DIR
const nodeVersion = spawnVersion()
function spawnVersion() {
  const { spawnSync } = require('node:child_process')
  const result = spawnSync(nodeBin, ['-p', 'process.versions.node'], { encoding: 'utf8', windowsHide: true })
  const [major, minor] = (result.stdout || '').trim().split('.').map(Number)
  return major > 24 || major === 24 && minor >= 5 || major === 22 && minor >= 21
}

test('strict schema: invalid inputs and unsupported/credential URLs are rejected', () => {
  for (const host of ['http://127.0.0.1','u:p@proxy','proxy/path','proxy?key=secret','proxy#x','proxy;DIRECT','bad host']) assert.throws(() => N.schema.validate(custom(7897,'http',host)))
  for (const port of ['0','65536','7897junk','1.2','-1','']) assert.throws(() => N.schema.validate(custom(port)))
  assert.throws(() => N.schema.validate(custom(1080,'socks5')))
  assert.throws(() => N.schema.validate({ ...base(), selected: 'missing' }))
  assert.throws(() => N.schema.validate({ ...base(), profiles: Array(21).fill(custom().profiles[0]) }))
  assert.throws(() => N.schema.validate({ ...custom(), profiles: [custom().profiles[0], custom().profiles[0]] }))
  assert.equal(N.schema.endpoint(custom(8080,'https','::1').profiles[0]).url, 'https://[::1]:8080')
  assert.equal(N.schema.endpoint(custom(80,'http','代理.example').profiles[0]).host, 'xn--mnq481g.example')
})

test('policy: explicit override, loopback bypass, direct isolation and no input mutation', () => {
  const inherited = { HTTP_PROXY:'http://old:9', http_proxy:'http://lower:9', HTTPS_PROXY:'http://old:10', ALL_PROXY:'socks5://old:11', no_proxy:'.example.test', KEEP:'yes' }
  const before = JSON.stringify(inherited)
  const p = N.resolvePolicy(custom(), inherited), env = N.childEnvironment(inherited,p)
  assert.equal(env.HTTP_PROXY, 'http://127.0.0.1:7897'); assert.equal(env.http_proxy, env.HTTP_PROXY)
  assert.equal(env.HTTPS_PROXY, env.HTTP_PROXY); assert.equal(env.ALL_PROXY, '')
  assert.equal(env.NODE_USE_ENV_PROXY,'1'); assert.ok(env.NO_PROXY.includes('127.0.0.1'))
  assert.equal(env.KEEP,'yes'); assert.equal(JSON.stringify(inherited),before)
  const direct = N.resolvePolicy({ ...base(), selected:'direct' },inherited)
  assert.equal(N.childEnvironment(inherited,direct).NO_PROXY,'*')
  assert.equal(N.childEnvironment(inherited,direct).HTTP_PROXY,'')
  const original = N.resolvePolicy(base(), inherited)
  assert.equal(original.httpProxy,'http://lower:9'); assert.ok(original.noProxy.includes('.example.test'))
  assert.ok(!JSON.stringify(N.publicPolicy(original)).includes('old:'))
  assert.equal(N.resolvePolicy({ ...custom(), profiles:[{...custom().profiles[0],name:'Renamed'}] },inherited).fingerprint,p.fingerprint)
  assert.notEqual(N.resolvePolicy(custom(7898),inherited).fingerprint,p.fingerprint)
})

test('Windows static system parsing: split schemes, direct, PAC/SOCKS and non-Windows rejection', () => {
  const q = (map) => (name) => map[name] || ''
  assert.deepEqual(N.readSystemProxy('win32',q({ProxyEnable:'0x1',ProxyServer:'127.0.0.1:7897'})),{httpProxy:'http://127.0.0.1:7897',httpsProxy:'http://127.0.0.1:7897'})
  assert.deepEqual(N.readSystemProxy('win32',q({ProxyEnable:'0x1',ProxyServer:'http=proxy:8080;https=https://secure:8443'})),{httpProxy:'http://proxy:8080',httpsProxy:'https://secure:8443'})
  assert.deepEqual(N.readSystemProxy('win32',q({ProxyEnable:'0x0'})),{httpProxy:'',httpsProxy:''})
  const off=N.resolvePolicy({...base(),selected:'system'},{HTTP_PROXY:'http://old:9'},()=>({httpProxy:'',httpsProxy:''}))
  assert.equal(N.childEnvironment({HTTP_PROXY:'http://old:9'},off).NO_PROXY,'*')
  assert.throws(() => N.readSystemProxy('win32',q({AutoConfigURL:'https://example.invalid/proxy.pac'})),{code:'pacUnsupported'})
  assert.throws(() => N.readSystemProxy('win32',q({ProxyEnable:'0x1',ProxyServer:'socks=proxy:1080'})),{code:'systemUnsupported'})
  assert.throws(() => N.readSystemProxy('darwin',q({})),{code:'systemUnsupported'})
})

test('atomic persistence, previous-file recovery, stale revision and corrupt-file preservation', () => {
  const dir = fs.mkdtempSync(path.join(fixture,'akd-network-store-'))
  const store = N.createStore(dir)
  assert.deepEqual(store.read(),base())
  const a = store.write(custom()); assert.equal(a.revision,1)
  assert.throws(() => store.write(custom()),{code:'conflict'})
  const b = store.write({...a, selected:'direct'}); assert.equal(b.revision,2)
  assert.equal(JSON.parse(fs.readFileSync(store.file+'.previous')).revision,1)
  assert.equal(fs.readdirSync(dir).filter((f)=>f.endsWith('.tmp')).length,0)
  fs.writeFileSync(store.file,'broken-test-file')
  assert.throws(()=>store.read(),{code:'read'}); assert.throws(()=>store.write(base()),{code:'read'})
  assert.equal(fs.readFileSync(store.file,'utf8'),'broken-test-file')
})

test('IPC: sender restriction, save acknowledgment, apply cancellation/busy/race and duplicate guard', async () => {
  const store = N.createStore(fs.mkdtempSync(path.join(fixture,'akd-network-ipc-')))
  const handles = new Map(), sender = { isDestroyed:()=>false, getURL:()=>pathToFileURL(path.join(__dirname,'../src/settings.html')).href }, active=N.resolvePolicy(base(),{})
  let idle=true, consent=false, restarts=0, dialogResolve
  const api = registerNetworkSettings({
    ipcMain:{handle:(k,f)=>handles.set(k,f)}, session:{}, store, inherited:{}, getActive:()=>active, getSender:()=>sender,
    resolveNodeBin:()=>nodeBin,
    checkIdle:async()=>{if(!idle)throw N.codeError('busy')},
    askRestart:async()=>dialogResolve ? new Promise((r)=>{dialogResolve=r}) : consent,
    restart:()=>restarts++,
  })
  const call=(k,...args)=>handles.get('akdagent-network-'+k)({sender},...args)
  const forbidden=await handles.get('akdagent-network-save')({sender:{isDestroyed:()=>false}},custom())
  assert.equal(forbidden.code,'forbidden'); assert.equal(store.read().revision,0)
  const safeUrl=sender.getURL;sender.getURL=()=> 'https://untrusted.invalid/'
  assert.equal((await call('save',custom())).code,'forbidden');sender.getURL=safeUrl
  const result=await call('save',custom()); assert.equal(result.pending,true); assert.equal(result.config.revision,1)
  assert.equal((await call('save',custom())).code,'conflict')
  assert.equal((await call('apply',0)).code,'conflict')
  idle=false; assert.equal((await call('apply',1)).code,'busy'); assert.equal(restarts,0)
  idle=true; assert.equal((await call('apply',1)).cancelled,true); assert.equal(restarts,0)
  dialogResolve=true
  const applying=call('apply',1); await new Promise((r)=>setImmediate(r))
  assert.equal(api.isApplying(),true)
  assert.equal((await call('apply',1)).code,'busy'); assert.equal((await call('save',store.read())).code,'busy')
  idle=false; dialogResolve(true)
  assert.equal((await applying).code,'busy'); assert.equal(restarts,0); assert.equal(api.isApplying(),false)
  dialogResolve=null; idle=true; consent=true
  assert.equal((await call('apply',1)).restarting,true); assert.equal(restarts,1)
  assert.equal(api.isApplying(),true,'Keep prompts blocked until the scheduled restart actually exits')
  assert.equal((await call('apply',1)).code,'busy')
})

async function listen(server,t) {
  const sockets=new Set()
  server.on('connection',(s)=>{sockets.add(s);s.on('close',()=>sockets.delete(s))})
  await new Promise((r)=>server.listen(0,'127.0.0.1',r))
  t.after(()=>{for(const s of sockets)s.destroy();server.close()})
  return server.address().port
}
function proxyServer(make, originPort, count) {
  const server=make((req,res)=>{
    count.requests++
    const target=http.request({host:'127.0.0.1',port:originPort,path:new URL(req.url).pathname,method:req.method},(r)=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)})
    req.pipe(target);target.on('error',()=>res.end())
  })
  server.on('connect',(_req,socket,head)=>{
    count.requests++
    const upstream=net.connect(originPort,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket)})
    socket.on('close',()=>upstream.destroy());upstream.on('error',()=>socket.destroy())
  })
  return server
}

test('actual Node routing: HTTP proxy, loopback bypass, failed endpoint and timeout',{skip: !nodeVersion && 'Requires Node >=22.21 or >=24.5'},async(t)=>{
  const origin=http.createServer((_q,r)=>{r.writeHead(204);r.end()})
  const originPort=await listen(origin,t),count={requests:0}
  const port=await listen(proxyServer(http.createServer,originPort,count),t)
  const policy=N.resolvePolicy(custom(port),{})
  const through=await probeNode(nodeBin,{},policy,'http://akd-probe.invalid:'+originPort+'/',3000)
  assert.equal(through.ok,true);assert.ok(count.requests>0)
  const before=count.requests
  const local=await probeNode(nodeBin,{},policy,'http://127.0.0.1:'+originPort+'/',3000)
  assert.equal(local.ok,true);assert.equal(count.requests,before)
  const dead=http.createServer();await new Promise((r)=>dead.listen(0,'127.0.0.1',r));const deadPort=dead.address().port;await new Promise((r)=>dead.close(r))
  const bad=await probeNode(nodeBin,{},N.resolvePolicy(custom(deadPort),{}),'http://akd-probe.invalid/',600)
  assert.equal(bad.ok,false)
  const stalled=net.createServer(()=>{}), stalledPort=await listen(stalled,t)
  const slow=await probeNode(nodeBin,{},N.resolvePolicy(custom(stalledPort),{}),'https://akd-probe.invalid/',500)
  assert.equal(slow.ok,false)
})

test('actual HTTPS proxy + HTTPS target, certificate validation stays enabled',{skip: (!tlsFixture || !nodeVersion) && 'Set AKD_TEST_TLS_DIR to local-only test TLS fixtures; see README'},async(t)=>{
  const certPath=path.join(tlsFixture,'test-proxy-cert.pem'),keyPath=path.join(tlsFixture,'test-proxy-key.pem')
  assert.ok(fs.existsSync(certPath),'Generate the documented local TLS fixtures before this test')
  const tls={cert:fs.readFileSync(certPath),key:fs.readFileSync(keyPath)}
  const origin=https.createServer(tls,(_q,r)=>{r.writeHead(204);r.end()})
  const originPort=await listen(origin,t), count={requests:0}
  const port=await listen(proxyServer((handler)=>https.createServer(tls,handler),originPort,count),t)
  const p=N.resolvePolicy(custom(port,'https'),{})
  const yes=await probeNode(nodeBin,{NODE_EXTRA_CA_CERTS:certPath},p,'https://akd-probe.invalid:'+originPort+'/',3000)
  assert.equal(yes.ok,true);assert.ok(count.requests>0)
  const no=await probeNode(nodeBin,{},p,'https://akd-probe.invalid:'+originPort+'/',1000)
  assert.equal(no.ok,false,'Untrusted certificates must not be accepted')
})
