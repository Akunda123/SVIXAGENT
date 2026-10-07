import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc, setJsoncPath } from './jsonc.mjs';

export const clientNames=['claude-code','claude-desktop','cursor','vscode','opencode'];
export function buildProfiles({nodePath,pluginDir,serviceDir,skillsDir}) {
  for(const p of [nodePath,pluginDir,serviceDir,skillsDir])if(!path.isAbsolute(p))throw new Error('Client launch paths must be absolute.');
  const launch={command:nodePath,args:[path.join(pluginDir,'scripts/server.mjs')],env:{AKDAGENT_INSTALL_DIR:serviceDir,AKDAGENT_SKILLS_DIR:skillsDir}};
  return {
    'generic':{mcpServers:{akdagent:launch}},
    'claude-code':{mcpServers:{akdagent:{type:'stdio',...launch}}},
    'claude-desktop':{mcpServers:{akdagent:launch}},
    'cursor':{mcpServers:{akdagent:launch}},
    'vscode':{servers:{akdagent:{type:'stdio',...launch}}},
    'opencode':{$schema:'https://opencode.ai/config.json',mcp:{akdagent:{type:'local',command:[launch.command,...launch.args],environment:launch.env,enabled:true,timeout:180000}}},
    'opencode-v2':{$schema:'https://opencode.ai/config.json',mcp:{servers:{akdagent:{type:'local',command:[launch.command,...launch.args],environment:launch.env,disabled:false,timeout:{catalog:30000,execution:180000}}}}},
  };
}
export function clientTarget(client,{userRoot,appDataRoot,configRoot,openCodeVersion=1}) {
  switch(client) {
    case 'claude-code':return {file:path.join(userRoot,'.claude.json'),keys:['mcpServers','akdagent'],profile:client};
    case 'claude-desktop':return {file:path.join(appDataRoot,'Claude/claude_desktop_config.json'),keys:['mcpServers','akdagent'],profile:client};
    case 'cursor':return {file:path.join(userRoot,'.cursor/mcp.json'),keys:['mcpServers','akdagent'],profile:client};
    case 'vscode':return {file:path.join(appDataRoot,'Code/User/mcp.json'),keys:['servers','akdagent'],profile:client};
    case 'opencode': {
      const directory=path.join(configRoot||path.join(userRoot,'.config'),'opencode');
      const jsonc=path.join(directory,'opencode.jsonc'), json=path.join(directory,'opencode.json');
      const file=fs.existsSync(jsonc)?jsonc:json;
      return {file,keys:openCodeVersion===2?['mcp','servers','akdagent']:['mcp','akdagent'],profile:openCodeVersion===2?'opencode-v2':'opencode'};
    }
    default:throw new Error(`Unsupported client: ${client}`);
  }
}
export function mergeClientConfig(file,keys,entry) {
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw new Error('Configuration is a symlink; merge the exported profile manually.');
  const source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'{}\n';
  const updated=setJsoncPath(source.replace(/^\uFEFF/,''),keys,entry);
  parseJsonc(updated);
  if(updated===source)return {file,changed:false};
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backup=fs.existsSync(file)?`${file}.akdagent-backup-${stamp}`:null;
  if(backup)fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
  // Keep a recoverable backup and preserve file identity/ACLs on Windows.
  if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')!==source)throw new Error('Configuration changed during installation; retry after reviewing the exported profile.');
  fs.writeFileSync(file,updated,'utf8');
  return {file,changed:true,backup};
}
export function exportProfiles(profiles,directory) {
  fs.mkdirSync(directory,{recursive:true});
  for(const [name,data] of Object.entries(profiles))fs.writeFileSync(path.join(directory,`${name}.json`),JSON.stringify(data,null,2)+'\n');
}
function flags(args) {
  const result={};
  for(let i=0;i<args.length;i++){if(!args[i].startsWith('--'))throw new Error('Use named options.');result[args[i].slice(2)]=args[i]==='--apply'?true:args[++i];}
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const a=flags(process.argv.slice(2)), pluginDir=path.resolve(a['plugin-dir']);
    const profiles=buildProfiles({nodePath:path.resolve(a.node),pluginDir,serviceDir:path.resolve(a.service),skillsDir:path.resolve(a.skills)});
    const clients=(a.clients||'').split(',').filter(Boolean);
    if(clients.some(c=>!clientNames.includes(c)))throw new Error('Unknown target client.');
    exportProfiles(profiles,path.resolve(a['export-dir']));
    // Plugin-format launchers share the same root and runtime, without host-specific fields.
    const launch=profiles.generic.mcpServers.akdagent;
    fs.writeFileSync(path.join(pluginDir,'.mcp.json'),JSON.stringify({mcpServers:{akdagent_chatgpt:launch}},null,2)+'\n');
    fs.writeFileSync(path.join(pluginDir,'mcp.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{akdagent_chatgpt:{type:'stdio',command:launch.command,args:['${PLUGIN_ROOT}/scripts/server.mjs'],env:launch.env,cwd:'./'}}},null,2)+'\n');
    fs.writeFileSync(path.join(pluginDir,'clients/codex.mcp.json'),JSON.stringify({mcpServers:{akdagent_chatgpt:{...launch,startup_timeout_sec:30,tool_timeout_sec:180}}},null,2)+'\n');
    const installed=[],manual=[];
    if(a.apply)for(const client of clients) {
      const t=clientTarget(client,{userRoot:path.resolve(a['user-root']),appDataRoot:path.resolve(a['app-data']),configRoot:a['config-root'],openCodeVersion:Number(a['opencode-version']||1)});
      let entry=profiles[t.profile];for(const key of t.keys)entry=entry[key];
      try {installed.push({client,...mergeClientConfig(t.file,t.keys,entry)});}
      catch(error){manual.push({client,file:t.file,error:error.message,export:path.join(a['export-dir'],`${t.profile}.json`)});}
    }
    console.log(JSON.stringify({profiles:Object.keys(profiles),installed,manual},null,2));
    if(manual.length)process.exitCode=2;
  } catch(error){console.error(error.message);process.exitCode=1;}
}
