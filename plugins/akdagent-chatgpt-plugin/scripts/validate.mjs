import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin/plugin.json'),'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(root,'clients/codex.mcp.json'),'utf8'));
assert.equal(manifest.name,'akdagent-chatgpt-plugin');
assert.equal(config.mcpServers.akdagent_chatgpt.command,'node');
assert.equal(manifest.skills,'./skills/');
assert.equal(manifest.mcpServers,'./clients/codex.mcp.json');
const portable=JSON.parse(fs.readFileSync(path.join(root,'plugin.json'),'utf8'));
const claude=JSON.parse(fs.readFileSync(path.join(root,'.claude-plugin/plugin.json'),'utf8'));
assert.equal(portable.version,manifest.version);assert.equal(claude.version,manifest.version);
assert.equal(portable.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
const mcp=JSON.parse(fs.readFileSync(path.join(root,'mcp.json'),'utf8'));
assert.equal(mcp.mcpServers.akdagent_chatgpt.type,'stdio');
let skills = 0;
for (const entry of fs.readdirSync(path.join(root,'skills'))) {
  const dir = path.join(root,'skills',entry);
  const text = fs.readFileSync(path.join(dir,'SKILL.md'),'utf8');
  assert.match(text,/^---\r?\nname: [a-z-]+\r?\ndescription: .+/);
  for (const [,link] of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(link)) continue;
    assert.ok(fs.existsSync(path.resolve(dir,link.split('#')[0])), `Missing link: ${link}`);
  }
  skills++;
}
assert.equal(skills,5);
let officialSchemasValidated=false;
if(process.env.AKD_SCHEMA_DIR) {
  const {loadDependency}=await import('./runtime.mjs');
  const pkg=loadDependency('ajv/dist/2020.js'),Ajv=pkg.default||pkg;
  const ajv=new Ajv({strict:false,allErrors:true});
  for(const [file,data] of [['plugin.schema.json',portable],['mcp.schema.json',mcp]]) {
    const validate=ajv.compile(JSON.parse(fs.readFileSync(path.join(process.env.AKD_SCHEMA_DIR,file),'utf8')));
    assert.ok(validate(data),JSON.stringify(validate.errors));
  }
  officialSchemasValidated=true;
}
console.log(JSON.stringify({ok:true,version:manifest.version,skills,officialSchemasValidated}));
