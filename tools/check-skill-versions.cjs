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
 *   ④ **第三方技能（vendored）单列一条轨**（2026-10-03 加，ACE Studio 官方技能是第一个）：
 *      它们不是我们的内容 ⇒ **不要求 version:**、**一个字都不改**（便于整目录对比上游升级）；
 *      改用 `tools/vendored-skills.json` 里的 **treeHash** 钉住：真源一变就红（改回去，或用
 *      `--update-vendored` 显式登记新版本）。
 *
 * 用法：
 *   node tools/check-skill-versions.cjs                # 检查
 *   node tools/check-skill-versions.cjs --sync         # 把真源 skills/ 单向同步进镜像（真源优先，多出的文件删掉）
 *   node tools/check-skill-versions.cjs --update-vendored   # 重算并写回 vendored-skills.json 的 treeHash
 *
 * ⚠️ 本守卫**不碰** ~/.dsh/skills（那是用户层：用户自己的 skill 放那儿、且它会遮蔽镜像；
 *    见 docs 里那份「用户数据分层」说明）。开发机要把它灌一遍用 scripts/sync-skills.ps1，那是另一回事。
 *
 * ⚠️ `--sync` 是**以真源为准**的：镜像里多出来的目录会被**删掉**。第三方技能（以及任何"只想放镜像里"的东西）
 *    必须先落进真源 `skills/`，否则会被下一次 --sync 清掉（2026-10-03 差点这么删掉 ACE 官方技能）。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'skills');
const MIRROR = path.join(ROOT, 'dsh-runtime', 'dsh', 'skills');
const VENDORED_PATH = path.join(ROOT, 'tools', 'vendored-skills.json');
const SYNC = process.argv.includes('--sync');
const UPDATE_VENDORED = process.argv.includes('--update-vendored');

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
/** 第三方技能的指纹：按路径排序，每行 "<相对路径> <文件SHA-256>"，对整块（\n 连接）取 SHA-256
 *  （与 tools/gen-vendored-skills.cjs 同一算法 —— 两边必须一致，否则"生成完立刻红"） */
function treeHash(dir) {
  const lines = walk(dir).sort().map((rel) => rel + ' ' + sha(path.join(dir, rel)));
  return crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

/* ── ④ 第三方技能清单（缺失即当作"没有第三方技能"，不报错） ── */
let vendored = null;
try { vendored = JSON.parse(fs.readFileSync(VENDORED_PATH, 'utf8')); } catch { vendored = null; }
const vendoredOf = (name) => (vendored && Array.isArray(vendored.skills)
  ? vendored.skills.find((s) => s.name === name) : null);

if (UPDATE_VENDORED) {
  if (!vendored) { console.error('读不到 ' + path.relative(ROOT, VENDORED_PATH)); process.exit(2); }
  let n = 0;
  for (const s of vendored.skills) {
    const dir = path.join(SRC, s.name);
    if (!fs.existsSync(dir)) { console.error('缺目录：skills/' + s.name); process.exit(2); }
    const h = treeHash(dir);
    if (h !== s.treeHash) { console.log(`  ~ ${s.name}: ${String(s.treeHash).slice(0, 8)} → ${h.slice(0, 8)}`); s.treeHash = h; n++; }
  }
  fs.writeFileSync(VENDORED_PATH, JSON.stringify(vendored, null, 2) + '\n', 'utf8');
  console.log(`已写 ${path.relative(ROOT, VENDORED_PATH)}（更新 ${n} 条）`);
  console.log('别忘了：把 upstreamCommit 改成新 commit，并同步 THIRD-PARTY-NOTICES.md / licenses/。');
  process.exit(0);
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
  const v = vendoredOf(s);
  if (v) {
    /* 第三方技能：不要求 version（那不是我们的版本轴），改按 treeHash 钉住 */
    const h = treeHash(path.join(SRC, s));
    const same = h === v.treeHash;
    ok(same, `${s}: 与上游 ${String(v.upstreamCommit || '').slice(0, 7)} **逐字节一致**（treeHash ${String(v.treeHash).slice(0, 8)}）`
      + (same ? '' : `　实际 ${h.slice(0, 8)} ⇒ 要么改回去，要么跑 --update-vendored 显式登记新版本`));
    continue;
  }
  ok(!!(ver && /^\d+\.\d+\.\d+$/.test(ver)), `${s}: version 形如 x.y.z（${ver || '缺失'}）`);
}
if (vendored && Array.isArray(vendored.skills)) {
  const missing = vendored.skills.filter((s) => !skills.includes(s.name)).map((s) => s.name);
  ok(!missing.length, `vendored-skills.json 登记了 ${vendored.skills.length} 个第三方技能：`
    + vendored.skills.map((s) => s.name).join(', ')
    + (missing.length ? `　⚠️ 真源里缺：${missing.join(', ')}` : ''));
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
