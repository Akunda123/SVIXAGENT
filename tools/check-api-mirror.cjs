#!/usr/bin/env node
/**
 * 官方镜像纯净度守卫（2026-09-20 新增）
 *
 * **为什么需要**：`skills/sv-scripting/api/*.md` 是**官方脚本手册的逐页镜像**
 *   （`api/README.md` 明写"不要往里写自己的东西"），而 `tools/api-docs-sync.cjs --update`
 *   是**整文件覆盖、零保留**（L224 `writeFileSync`）。
 *   ⇒ 2026-09-20 实测发现：有人（我们）往镜像里写了 **258 行实测注解**
 *     （`api/Note.md` **244 行** + `api/SV.md` **12 行**）—— **跑一次 --update 就静默抹掉**。
 *   已把那些内容搬到 `skills/sv-scripting/references/官方API-实测勘误.md`，本守卫负责**别再犯**。
 *
 * 判据：镜像 md 里出现下面任一**只可能出自我们**的标记 ⇒ 报错：
 *   `实测补充` · `akdagent` · `known-bugs` · `真机` · `本仓` · `踩过` · `⇒` · `用户 20`
 *   （官方手册是英文 JSDoc，不会出现这些中文/项目词。）
 *
 * 用法：
 *   node tools/check-api-mirror.cjs                 # 扫镜像目录（有问题 ⇒ exit 1）
 *   node tools/check-api-mirror.cjs --file <path>   # 只扫指定文件（负向自测用：可指向 .bak 副本）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIRROR = path.join(ROOT, 'skills', 'sv-scripting', 'api');
const MARKERS = ['实测补充', 'akdagent', 'known-bugs', '真机', '本仓', '踩过', '⇒', '用户 20'];
const argv = process.argv.slice(2);
const only = argv[argv.indexOf('--file') + 1];
const isOnly = argv.includes('--file');

let files;
if (isOnly) {
  if (!only || !fs.existsSync(only)) { console.error('❌ --file 需要存在的路径'); process.exit(2); }
  files = [only];
} else {
  if (!fs.existsSync(MIRROR)) { console.error('❌ 找不到镜像目录：' + MIRROR); process.exit(2); }
  files = fs.readdirSync(MIRROR).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => path.join(MIRROR, f));
}

const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = MARKERS.find((k) => l.includes(k));
    if (m) hits.push(path.relative(ROOT, f) + ':' + (i + 1) + '  含本地标记「' + m + '」  ' + l.trim().slice(0, 70));
  });
}

if (hits.length) {
  console.log('❌ 官方镜像里混进了**我们自己的注解**（' + hits.length + ' 处 / 扫 ' + files.length + ' 个文件）：');
  hits.slice(0, 20).forEach((h) => console.log('   · ' + h));
  if (hits.length > 20) console.log('   …还有 ' + (hits.length - 20) + ' 处');
  console.log('');
  console.log('   ⚠️ `tools/api-docs-sync.cjs --update` 会**整文件覆盖**这些文件 ⇒ 写在这里的注解迟早被抹掉。');
  console.log('   ⇒ 实测补充/勘误请写到 `skills/sv-scripting/references/官方API-实测勘误.md`（或 functions/、技能正文）。');
  process.exit(1);
}
console.log('✅ 官方镜像纯净：扫 ' + files.length + ' 个文件，没有本地注解标记。');
