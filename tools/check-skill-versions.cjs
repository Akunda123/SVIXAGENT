#!/usr/bin/env node
/* 技能 frontmatter 与「真源→镜像」一致性守卫
 *
 * 判据：
 *   ① 每个内置技能目录里必须有 SKILL.md，且 frontmatter 齐备：
 *        name:        与目录名一致
 *        description: 非空
 *        version:     x.y.z（加载器会忽略它，这是**给我们自己看的**）
 *   ② 版本约定（改内容请照此 +版本 —— 下一次升级时才知道"谁新谁旧"）：
 *        PATCH +0.0.1 = 文字更正 / 小补
 *        MINOR +0.1.0 = 新增小节 / 参数 / 风格
 *        MAJOR +1.0.0 = 结构调整 或 规范变更（改数值＝改规范）
 *   ③ 镜像一致：真源 skills/<名字>/ 与 dsh-runtime/dsh/skills/<名字>/ **逐文件 SHA-256 一致**。
 *      只改真源不同步 ⇒ 跑起来的代理读到的还是旧内容（开发态的 bundled 层就是这个镜像）。
 *      镜像目录不存在时**跳过**这一项（dsh-runtime 不进仓库，全新 clone 没有它），只提示。
 *
 * 用法：
 *   node tools/check-skill-versions.cjs          # 检查
 *   node tools/check-skill-versions.cjs --sync   # 把真源 skills/ 单向同步进镜像（真源优先，多出的文件删掉）
 *
 * ⚠️ 本守卫**不碰** ~/.dsh/skills（那是用户层：用户自己的 skill 放那儿、且它会遮蔽镜像；
 *    见 docs 里那份「用户数据分层」说明）。开发机要把它灌一遍用 scripts/sync-skills.ps1，那是另一回事。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'skills');
const MIRROR = path.join(ROOT, 'dsh-runtime', 'dsh', 'skills');
const SYNC = process.argv.includes('--sync');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  BAD  ') + m); if (!c) bad++; };

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
/** 递归列出目录下所有文件（相对路径，正斜杠） */
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

/* ── ① ② frontmatter ── */
const skills = fs.readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();
console.log(`\n── frontmatter（${skills.length} 个技能）`);
for (const s of skills) {
  const p = path.join(SRC, s, 'SKILL.md');
  if (!fs.existsSync(p)) { ok(false, `${s}/SKILL.md 存在`); continue; }
  const m = fs.readFileSync(p, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) { ok(false, `${s}: 有 YAML frontmatter`); continue; }
  const fm = m[1];
  const name = (fm.match(/^name:[ \t]*(.+)$/m) || [])[1];
  const desc = (fm.match(/^description:[ \t]*(.+)$/m) || [])[1];
  const ver = (fm.match(/^version:[ \t]*(\S+)$/m) || [])[1];
  ok(name && name.trim() === s, `${s}: name 与目录一致（${name && name.trim()}）`);
  ok(!!(desc && desc.trim()), `${s}: description 非空`);
  ok(!!(ver && /^\d+\.\d+\.\d+$/.test(ver)), `${s}: version 形如 x.y.z（${ver || '缺失'}）`);
}

/* ── ③ 镜像一致性 ── */
console.log('\n── 真源 → 镜像（dsh-runtime/dsh/skills）');
if (!fs.existsSync(MIRROR)) {
  console.log(`  --   镜像目录不存在，跳过：${path.relative(ROOT, MIRROR)}（dsh-runtime 不进仓库，属正常）`);
} else {
  const changes = { add: [], update: [], remove: [] };
  const srcSkills = skills.filter((s) => fs.existsSync(path.join(SRC, s, 'SKILL.md')));
  const mirSkills = fs.readdirSync(MIRROR, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name).sort();

  for (const s of mirSkills) if (!srcSkills.includes(s)) changes.remove.push(`${s}/`);
  for (const s of srcSkills) {
    const a = path.join(SRC, s), b = path.join(MIRROR, s);
    const fa = walk(a);
    const fb = fs.existsSync(b) ? walk(b) : [];
    for (const f of fb) if (!fa.includes(f)) changes.remove.push(`${s}/${f}`);
    for (const f of fa) {
      const dst = path.join(b, f);
      if (!fs.existsSync(dst)) changes.add.push(`${s}/${f}`);
      else if (sha(path.join(a, f)) !== sha(dst)) changes.update.push(`${s}/${f}`);
    }
  }
  const total = changes.add.length + changes.update.length + changes.remove.length;
  if (!SYNC) {
    ok(total === 0, total === 0
      ? '镜像与真源逐文件一致'
      : `镜像有 ${total} 处不一致（新增 ${changes.add.length} · 改动 ${changes.update.length} · 多余 ${changes.remove.length}）⇒ 跑 --sync`);
    if (total) {
      for (const x of changes.add.slice(0, 8)) console.log(`         + ${x}`);
      for (const x of changes.update.slice(0, 8)) console.log(`         ~ ${x}`);
      for (const x of changes.remove.slice(0, 8)) console.log(`         - ${x}`);
      if (total > 24) console.log(`         …（共 ${total} 处）`);
    }
  } else {
    for (const x of changes.remove) {
      const p = path.join(MIRROR, x);
      if (x.endsWith('/')) fs.rmSync(p, { recursive: true, force: true });
      else fs.rmSync(p, { force: true });
    }
    for (const x of [...changes.add, ...changes.update]) {
      const dst = path.join(MIRROR, x);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(SRC, x), dst);
    }
    console.log(`  ok   已同步：+${changes.add.length} · ~${changes.update.length} · -${changes.remove.length}`);
    /* 同步完再核一遍，确认真的一致（防"同步了但还是不一致"这种假绿） */
    let left = 0;
    for (const s of srcSkills) {
      const a = path.join(SRC, s), b = path.join(MIRROR, s);
      for (const f of walk(a)) {
        const dst = path.join(b, f);
        if (!fs.existsSync(dst) || sha(path.join(a, f)) !== sha(dst)) left++;
      }
    }
    ok(left === 0, `同步后复查：仍不一致 ${left} 处`);
  }
}

console.log(bad ? `\n${bad} 项不通过` : '\n全部通过');
process.exit(bad ? 1 : 0);
