import fs from 'node:fs';
import path from 'node:path';
import {loadSdk} from './runtime.mjs';
const directory=path.resolve(process.argv[2]);
const {Client}=await loadSdk('client/index.js');
const {StdioClientTransport}=await loadSdk('client/stdio.js');
const results=[];
for(const name of ['generic','claude-code','claude-desktop','cursor','vscode','opencode','opencode-v2']) {
  const profile=JSON.parse(fs.readFileSync(path.join(directory,`${name}.json`),'utf8'));
  let entry=profile.mcpServers?.akdagent||profile.servers?.akdagent||profile.mcp?.akdagent||profile.mcp?.servers?.akdagent;
  const command=Array.isArray(entry.command)?entry.command[0]:entry.command;
  const args=Array.isArray(entry.command)?entry.command.slice(1):entry.args;
  const transport=new StdioClientTransport({command,args,env:{...process.env,...(entry.env||entry.environment)},stderr:'pipe'});
  const client=new Client({name:'akdagent-profile-readonly-check',version:'1.0.0'});
  const record={profile:name,projectWrites:0};
  try {
    await client.connect(transport);
    const tools=(await client.listTools()).tools;
    record.toolCount=tools.length;
    for(const [tool,arguments_] of [['akdagent_status',{}],['akdagent_read_workflow',{path:'skills/sv-vocal-tuning/SKILL.md',maxLines:5}],['akdagent_read_reference',{path:'sv-scripting/SKILL.md',maxLines:5}]]) {
      const result=await client.callTool({name:tool,arguments:arguments_});
      if(result.isError)throw new Error(`${tool} returned an error`);
    }
    record.ok=true;
  }catch(error){record.ok=false;record.error=error.message;process.exitCode=1;}
  finally {await client.close().catch(()=>{});await transport.close().catch(()=>{});}
  results.push(record);
}
console.log(JSON.stringify({profiles:results,allOk:results.every(r=>r.ok)},null,2));
