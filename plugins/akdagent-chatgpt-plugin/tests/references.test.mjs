import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readReference } from '../scripts/references.mjs';

test('bounded reference reader: pagination, path boundaries, allowed types', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-reference-test-'));
  try {
    fs.mkdirSync(path.join(root, 'sv-scripting'));
    fs.writeFileSync(path.join(root, 'sv-scripting', 'SKILL.md'), 'one\ntwo\nthree');
    assert.deepEqual(readReference(root, { path: 'sv-scripting/SKILL.md', maxLines: 2 }), { path:'sv-scripting/SKILL.md', startLine:1, totalLines:3, nextLine:3, text:'one\ntwo' });
    assert.equal(readReference(root, { path:'sv-scripting/SKILL.md', startLine:3 }).nextLine, null);
    for (const p of ['../secret.md', 'sv-scripting/../secret.md', 'C:/secret.md', 'sv-scripting\\SKILL.md', 'other/SKILL.md', 'sv-scripting/test.exe', '/etc/a.md']) {
      assert.throws(() => readReference(root, { path:p }));
    }
    assert.throws(() => readReference(root, { path:'sv-scripting/SKILL.md', maxLines:401 }));
    assert.throws(() => readReference(root, { path:'sv-scripting/SKILL.md', startLine:0 }));
  } finally { fs.rmSync(root, { recursive:true, force:true }); }
});
