import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildProfiles,mergeClientConfig,clientTarget} from '../scripts/client-configs.mjs';
import {parseJsonc,setJsoncPath} from '../scripts/jsonc.mjs';
import {readWorkflow} from '../scripts/workflows.mjs';
import {fileURLToPath} from 'node:url';

test('JSONC update preserves comments, unrelated servers and Unicode',()=>{
  const source=`{\n// keep this note\n"settings":{"url":"https://a/b//c","quote":"\\\""},\n"mcpServers":{"other":{"command":"保留"},},\n}`;
  const next=setJsoncPath(source,['mcpServers','akdagent'],{command:'node',args:['D:\\a path\\server.mjs']});
  const parsed=parseJsonc(next).value;
  assert.equal(parsed.mcpServers.other.command,'保留');
  assert.equal(parsed.settings.url,'https://a/b//c');
  assert.ok(next.includes('// keep this note'));
  assert.ok(next.includes('"other":{"command":"保留"}'));
  const updated=setJsoncPath(next,['mcpServers','akdagent'],{command:'new'});
  assert.equal(parseJsonc(updated).value.mcpServers.akdagent.command,'new');
  assert.ok(updated.includes('// keep this note'));
  for(const broken of ['{"x":1,"x":2}','{"x":}','{'])assert.throws(()=>parseJsonc(broken));
});
test('client configuration backup and malformed-config preservation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'akd-client-test-'));
  try{
    const file=path.join(root,'mcp.jsonc'),original='{"servers":{"other":{"command":"keep"}},"account":{"value":"fixture"}}';
    fs.writeFileSync(file,original);
    const result=mergeClientConfig(file,['servers','akdagent'],{type:'stdio',command:'node'});
    assert.equal(fs.readFileSync(result.backup,'utf8'),original);
    assert.equal(parseJsonc(fs.readFileSync(file,'utf8')).value.account.value,'fixture');
    const malformed=path.join(root,'broken.json');fs.writeFileSync(malformed,'{bad');
    assert.throws(()=>mergeClientConfig(malformed,['servers','akdagent'],{}));
    assert.equal(fs.readFileSync(malformed,'utf8'),'{bad');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('all client profiles resolve the same server and runtime',()=>{
  const root=path.resolve('fixture'),profiles=buildProfiles({nodePath:path.join(root,'node.exe'),pluginDir:path.join(root,'plugin'),serviceDir:path.join(root,'service'),skillsDir:path.join(root,'skills')});
  for(const name of ['claude-code','claude-desktop','cursor'])assert.deepEqual(profiles[name].mcpServers.akdagent.args,profiles.generic.mcpServers.akdagent.args);
  assert.equal(profiles.vscode.servers.akdagent.type,'stdio');
  assert.deepEqual(profiles.opencode.mcp.akdagent.command,[profiles.generic.mcpServers.akdagent.command,...profiles.generic.mcpServers.akdagent.args]);
  assert.equal(profiles['opencode-v2'].mcp.servers.akdagent.disabled,false);
  assert.deepEqual(clientTarget('opencode',{userRoot:root,appDataRoot:root,openCodeVersion:2}).keys,['mcp','servers','akdagent']);
  assert.throws(()=>buildProfiles({nodePath:'node',pluginDir:root,serviceDir:root,skillsDir:root}));
});
test('workflows are accessible without client filesystem skills',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const first=readWorkflow(root,{path:'skills/sv-live/SKILL.md',maxLines:3});
  assert.equal(first.nextLine,4);assert.match(first.text,/sv-live/);
  assert.match(readWorkflow(root,{path:'docs/clients.md'}).text,/Claude Desktop/);
  for(const p of ['../LICENSE','scripts/server.mjs','skills/sv-live/../../LICENSE','docs/unknown.md'])assert.throws(()=>readWorkflow(root,{path:p}));
});
