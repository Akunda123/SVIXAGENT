import fs from 'node:fs';
import path from 'node:path';

const allowed = new Set(['akdagent-playbook', 'akdagent-protocol', 'sv-scripting', 'sv-project-format', 'sv-lyricist', 'composition', 'sv-texture', 'sv-ix']);
export function readReference(root, { path: relative, startLine = 1, maxLines = 200 }) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes(':') || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Use a relative forward-slash reference path without traversal.');
  if (!allowed.has(relative.split('/')[0]) || !/\.(md|json)$/.test(relative)) throw new Error('Not an allowed documentation path.');
  if (!Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(maxLines) || maxLines < 1 || maxLines > 400) throw new Error('Invalid line range.');
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.join(base, relative));
  const resolved = path.relative(base, file);
  if (resolved.startsWith('..') || path.isAbsolute(resolved)) throw new Error('Reference escapes documentation directory.');
  if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('Reference exceeds 2 MiB limit.');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const end = Math.min(lines.length, startLine - 1 + maxLines);
  return { path: relative, startLine, totalLines: lines.length, nextLine: end < lines.length ? end + 1 : null, text: lines.slice(startLine - 1, end).join('\n') };
}
