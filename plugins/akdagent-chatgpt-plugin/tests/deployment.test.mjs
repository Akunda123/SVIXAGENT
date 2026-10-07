import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const plugin = fileURLToPath(new URL('../', import.meta.url));
test('installer preserves other catalog entries and rejects overwrite (Windows)', { skip:process.platform!=='win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'akd-install-test-'));
  try {
    const runtime = path.join(root,'runtime');
    fs.mkdirSync(path.join(runtime,'resources/server/dist'),{recursive:true});
    fs.mkdirSync(path.join(runtime,'resources/dsh/skills'),{recursive:true});
    fs.writeFileSync(path.join(runtime,'resources/server/dist/tools.js'),'// fixture, not executed');
    const catalogDir = path.join(root,'user/.agents/plugins');
    fs.mkdirSync(catalogDir,{recursive:true});
    const catalog = { name:'existing-market', interface:{displayName:'保留此市场'}, plugins:[{ name:'unrelated', source:{source:'local',path:'./other'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}] };
    const catalogPath=path.join(catalogDir,'marketplace.json');
    fs.writeFileSync(catalogPath,JSON.stringify(catalog));
    const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(plugin,'scripts/install.ps1'),'-UserRoot',path.join(root,'user'),'-AKDAgentDir',runtime,'-NodePath',process.execPath];
    const run = spawnSync('powershell.exe',args,{encoding:'utf8'});
    assert.equal(run.status,0,run.stdout+run.stderr);
    const installed = JSON.parse(fs.readFileSync(catalogPath,'utf8'));
    assert.equal(installed.name,catalog.name);
    assert.equal(installed.interface.displayName,catalog.interface.displayName);
    assert.deepEqual(installed.plugins[0],catalog.plugins[0]);
    assert.equal(installed.plugins.length,2);
    assert.equal(fs.readdirSync(catalogDir).filter(n=>n.includes('.backup-')).length,1);
    const before=fs.readFileSync(catalogPath,'utf8');
    const retry=spawnSync('powershell.exe',args,{encoding:'utf8'});
    assert.notEqual(retry.status,0);
    assert.equal(fs.readFileSync(catalogPath,'utf8'),before);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('installer discovers standalone service and references without Agent client (Windows)', { skip:process.platform!=='win32' }, () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'akd-standalone-install-test-'));
  try {
    const version=JSON.parse(fs.readFileSync(path.join(plugin,'.codex-plugin/plugin.json'),'utf8')).version;
    const deployment=path.join(root,'.codex/akdagent',version);
    const service=path.join(deployment,'service');
    const skills=path.join(deployment,'references/skills');
    fs.mkdirSync(path.join(service,'resources/server/dist'),{recursive:true});
    fs.mkdirSync(skills,{recursive:true});
    fs.writeFileSync(path.join(service,'resources/server/dist/tools.js'),'// fixture, not executed');
    const run=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(plugin,'scripts/install.ps1'),'-UserRoot',root,'-NodePath',process.execPath],{encoding:'utf8',env:{...process.env,LOCALAPPDATA:path.join(root,'no-client')}});
    assert.equal(run.status,0,run.stdout+run.stderr);
    const installed=path.join(root,'.codex/plugins/local/akdagent-chatgpt-plugin',version,'.mcp.json');
    const config=JSON.parse(fs.readFileSync(installed,'utf8')).mcpServers.akdagent_chatgpt;
    assert.equal(path.resolve(config.env.AKDAGENT_INSTALL_DIR),service);
    assert.equal(path.resolve(config.env.AKDAGENT_SKILLS_DIR),skills);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
