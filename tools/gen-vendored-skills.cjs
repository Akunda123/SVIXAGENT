#!/usr/bin/env node
/* 生成/刷新 tools/vendored-skills.json 里的 treeHash（与守卫 check-skill-versions.cjs 用同一算法）
 * 用法：node tools/gen-vendored-skills.cjs [--commit <sha>]
 * 临时脚本？—— 不，留在仓里：升级第三方技能时它就是"重算指纹"那一步（守卫也有 --update-vendored，
 * 但那个只能刷新已有条目的 hash；新增技能用这个）。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'skills');
const OUT = path.join(ROOT, 'tools', 'vendored-skills.json');

const VENDORED = [
  { name: 'ace-studio-audio-plugins', desc: 'ACE Studio 官方技能：音频插件（VST3/AU + 内置效果）怎么驱动' },
  { name: 'ace-studio-features', desc: 'ACE Studio 官方技能：有哪些功能、什么时候用哪个' },
  { name: 'ace-studio-setup', desc: 'ACE Studio 官方技能：连不上时怎么指路（CLI / MCP）' },
  { name: 'ace-studio-workflows', desc: 'ACE Studio 官方技能：端到端工作流的顺序' },
];

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
/** treeHash = 把「相对路径 + 该文件 SHA-256」按路径排序拼成行，再对整块取 SHA-256（缺文件 ⇒ 空串缺失标记） */
function treeHash(dir) {
  const lines = walk(dir).sort().map((rel) => {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');
    return rel + ' ' + h;
  });
  return crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

const commit = (() => {
  const i = process.argv.indexOf('--commit');
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 'ca4bab84bd4ffae7e776d91204d7b89f91cc4f82';
})();

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const doc = {
  note: [
    '第三方 Agent 技能：**原样内置、一个字都不改**（便于将来整目录对比上游升级）。',
    '因为它们不是我们的内容，所以**不要求 frontmatter 里有 version:**（那是我们自研技能的规矩）；',
    '改用下面的 treeHash 钉住：真源 skills/<name>/ 一变，check-skill-versions.cjs 就会红。',
    '升级流程：改 upstreamCommit → 用上游新内容覆盖 skills/<name>/ → node tools/gen-vendored-skills.cjs --commit <新sha>',
    '         → node tools/check-skill-versions.cjs --sync（同步镜像）→ 许可若有变化，同步 THIRD-PARTY-NOTICES.md。',
    'treeHash 算法：按路径排序，每行 "<相对路径> <文件SHA-256>"，对整块（\\n 连接）取 SHA-256。',
  ].join('\n'),
  upstream: 'https://github.com/BeatMagic/acestudio_agent_plugin',
  license: 'MIT (Copyright (c) 2026 Timedomain Inc.) — 全文见 licenses/acestudio-skills.LICENSE',
  upstreamCommit: commit,
  skills: VENDORED.map((v) => {
    const dir = path.join(SRC, v.name);
    if (!fs.existsSync(dir)) throw new Error('缺技能目录：' + v.name);
    const files = walk(dir).sort();
    const old = prev && prev.skills ? prev.skills.find((x) => x.name === v.name) : null;
    const hash = treeHash(dir);
    return {
      name: v.name,
      what: v.desc,
      files: files.length,
      treeHash: hash,
      upstreamCommit: old && old.treeHash === hash ? old.upstreamCommit || commit : commit,
    };
  }),
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log('已写 ' + path.relative(ROOT, OUT));
for (const s of doc.skills) console.log('  ' + s.name.padEnd(28) + s.files + ' 文件  ' + s.treeHash.slice(0, 16));
