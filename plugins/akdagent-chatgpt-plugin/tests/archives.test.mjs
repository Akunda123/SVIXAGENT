import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

test('optional extracted release integrity', {skip:!process.env.AKD_TEST_BUNDLE}, () => {
  const root=path.resolve(process.env.AKD_TEST_BUNDLE);
  const refs=path.join(root,'akdagent-references');
  const manifest=JSON.parse(fs.readFileSync(path.join(refs,'manifest.json'),'utf8'));
  for(const file of manifest.files) {
    const actual=createHash('sha256').update(fs.readFileSync(path.join(refs,file.path))).digest('hex');
    assert.equal(actual,file.sha256,file.path);
  }
  for(const file of ['akdagent-chatgpt-plugin/.codex-plugin/plugin.json','akdagent-chatgpt-plugin/.mcp.json','akdagent-mcp-service/bridge/AKDAgentBridge.lua','akdagent-mcp-service/resources/server/dist/tools.js','akdagent-references/licenses/SynthVCopilot.LICENSE-ADDITIONAL.md','Deploy.cmd']) assert.ok(fs.existsSync(path.join(root,file)),file);
  for(const file of ['src/audio/prep-mp3.mjs','src/audio/mdx-separate.mjs']) assert.ok(fs.existsSync(path.join(root,'akdagent-mcp-service/resources/server',file)),file);
  const forbidden=/\.(wav|mp3|svp|acep|onnx|key|pem)$/i;
  function walk(dir) {
    for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
      assert.ok(!['node_modules','diagnostics','backups','.git'].includes(e.name),e.name);
      const file=path.join(dir,e.name);
      if(e.isDirectory()) walk(file);
      else assert.ok(!forbidden.test(e.name),file);
    }
  }
  walk(root);
});
