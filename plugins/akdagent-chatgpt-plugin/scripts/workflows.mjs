import fs from 'node:fs';
import path from 'node:path';
const names = new Set(['sv-live','sv-vocal-tuning','sv-lyrics','sv-composition','sv-project']);
const docs = new Set(['runtime.md','references.md','clients.md','standalone.md','testing.md']);
export function readWorkflow(root, { path: relative, startLine=1, maxLines=200 }) {
  const bits = typeof relative==='string' ? relative.split('/') : [];
  if (!(bits.length===3 && bits[0]==='skills' && names.has(bits[1]) && bits[2]==='SKILL.md') && !(bits.length===2 && bits[0]==='docs' && docs.has(bits[1]))) throw new Error('Use an allowed skills/<name>/SKILL.md or docs/<guide>.md path.');
  if (!Number.isInteger(startLine)||startLine<1||!Number.isInteger(maxLines)||maxLines<1||maxLines>400) throw new Error('Invalid line range.');
  const base=fs.realpathSync(root), target=fs.realpathSync(path.join(base,...bits));
  const rel=path.relative(base,target);
  if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('Workflow escapes plugin directory.');
  const lines=fs.readFileSync(target,'utf8').split(/\r?\n/), end=Math.min(lines.length,startLine-1+maxLines);
  return {path:relative,startLine,totalLines:lines.length,nextLine:end<lines.length?end+1:null,text:lines.slice(startLine-1,end).join('\n')};
}
