#!/usr/bin/env node
/**
 * 打包前脱敏扫描 / 生成脱敏副本（2026-09-14 新增）
 *
 * 背景：用户 2026-09-14 裁定「安装包里把 `tools/` + `docs/` + `skills/` 全打进去」。
 *   本仓 `docs/` 里有开发机绝对路径（含用户名）等内部痕迹 ⇒ **发包前必须过一遍**。
 *
 * 两种用法：
 *   ① 扫描（默认）：`node tools/check-redaction.cjs [目录…]` —— 有命中就列出并 **exit 1**
 *   ② 生成脱敏副本：`node tools/check-redaction.cjs --redact-to <目标目录> [源目录…]`
 *      ⇒ 把源目录按原结构复制到目标目录，**文本文件内容脱敏**、二进制原样复制，并复扫一遍确认干净
 *
 * 默认源目录：`tools` `docs` `skills`（= 要打包进安装包的知识集）
 * 跳过：`node_modules` / `release` / `dist` / `.git` / `_bak-*` / 图片等二进制
 *   （历史：`legacy/` 已于 2026-09-19 删除，跳过名单里保留该名字只为兼容旧调用）
 */
const fs = require('fs');
const path = require('path');
const { redactText, findSensitive, currentUser, TEXT_EXT } = require('./lib-redact.cjs');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const FLAG = (n) => argv.includes(n);

const REDACT_TO = OPT('--redact-to');
const SKIP_DIRS = new Set(['node_modules', 'legacy', 'release', 'dist', '.git', '.vscode']);
const SKIP_NAME = /^_bak-|\.bak$|\.bak\./;

if (FLAG('--help') || FLAG('-h')) {
  console.log('用法：');
  console.log('  node tools/check-redaction.cjs [目录…]                     # 扫描（默认 tools docs skills；有命中 exit 1）');
  console.log('  node tools/check-redaction.cjs --redact-to <目标目录> [目录…] # 生成脱敏副本并复扫（0 命中才 exit 0）');
  console.log('');
  console.log('检查项：Windows/POSIX 用户目录路径 · 裸用户名 · 非内网 IPv4 · 邮箱');
  console.log('跳过：node_modules / release / dist / .git / _bak-* 与非文本文件（legacy/ 已删除）');
  process.exit(0);
}

function listFiles(dir, base) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = base ? path.join(base, e.name) : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || SKIP_NAME.test(e.name)) continue;
      out.push(...listFiles(full, rel));
    } else if (e.isFile()) {
      if (SKIP_NAME.test(e.name)) continue;
      out.push({ full, rel });
    }
  }
  return out;
}

function scanDirs(dirs) {
  const user = currentUser();
  const hits = [];
  let scanned = 0, skippedBinary = 0;
  for (const d of dirs) {
    const abs = path.isAbsolute(d) ? d : path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    // ⚠️ 目标里的目录名取**源的 basename**：传 `knowledge/docs` ⇒ 落到 `<目标>/docs/…`
    //    （否则会落成 `<目标>/knowledge/docs/…`，与 electron-builder 的 extraResources 对不上）
    const base = path.basename(path.resolve(abs));
    for (const f of listFiles(abs, base)) {
      if (!TEXT_EXT.has(path.extname(f.rel).toLowerCase())) { skippedBinary++; continue; }
      let text;
      try { text = fs.readFileSync(f.full, 'utf8'); } catch { continue; }
      scanned++;
      const found = findSensitive(text, user);
      if (found.length) {
        /* 🆕 2026-10-08：**按"脱敏后能不能清掉"分流**，而不是无脑判失败。
         *   起因：裸跑时 6 个命中**全在 `tools/` 里的脱敏工具自身**（它们在定义/举例那些模式：
         *   `lib-redact.cjs` / `redact-repo.cjs` / `check-publish-redaction.cjs` / `lib-paths.cjs` /
         *   `check-abs-paths.cjs` / `voice-name-table.cjs`）⇒ 是**自我指涉的假阳性**，
         *   而发包流程 `--redact-to`（默认源就含 `tools`）会把它们改写掉、复扫 0 命中。
         *   ⇒ 判据改成可核实的：**把这处文本过一遍 `redactText` 再扫**——
         *     残留 0 = "发包时会被改写"（提示，不算失败）；**残留 > 0 = 脱敏也盖不住的真泄漏（仍然失败）**。
         *   ⚠️ 别再退回"文件白名单"：那会让**真的**把用户路径写进这些工具文件时也蒙混过关。 */
        const residual = findSensitive(redactText(text, user), user);
        hits.push({
          file: f.rel.replace(/\\/g, '/'),
          count: found.length,
          residual: residual.length,
          samples: [...new Set(found.map((h) => h.kind + ': ' + h.snippet))].slice(0, 3),
          residualSamples: [...new Set(residual.map((h) => h.kind + ': ' + h.snippet))].slice(0, 3),
        });
      }
    }
  }
  return { hits, scanned, skippedBinary };
}

function redactDirs(dirs, target, clean) {
  const user = currentUser();
  const absTarget = path.isAbsolute(target) ? target : path.join(ROOT, target);
  // ⚠️ **只复制不清理** ⇒ 源里删掉的文件会以"幽灵副本"留在目标（2026-09-19 实测：`knowledge/skills` 与
  //    已搬家的旧文档都留在 dist/knowledge 里，若直接打包就会把**不该发的东西发出去**）。
  //    `--clean` = 先把目标整个删掉再生成；不给时**警告**目标已存在。
  if (fs.existsSync(absTarget)) {
    if (clean) {
      fs.rmSync(absTarget, { recursive: true, force: true });
      console.log('（--clean：已清空目标 ' + path.relative(ROOT, absTarget) + '）');
    } else {
      const top = fs.readdirSync(absTarget).filter((n) => !n.startsWith('.'));
      console.log('⚠️ 目标已存在且**未清理**（可能有上一次的幽灵副本）：' + top.join(' / ') + ' —— 发布前建议加 `--clean`');
    }
  }
  fs.mkdirSync(absTarget, { recursive: true });
  let copied = 0, rewritten = 0;
  for (const d of dirs) {
    const abs = path.isAbsolute(d) ? d : path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    const base = path.basename(path.resolve(abs));
    for (const f of listFiles(abs, base)) {
      const dest = path.join(absTarget, f.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const isText = TEXT_EXT.has(path.extname(f.rel).toLowerCase());
      if (!isText) { fs.copyFileSync(f.full, dest); copied++; continue; }
      const raw = fs.readFileSync(f.full, 'utf8');
      const clean = redactText(raw, user);
      fs.writeFileSync(dest, clean, 'utf8');
      copied++;
      if (clean !== raw) rewritten++;
    }
  }
  return { target: absTarget, copied, rewritten };
}

const SOURCES = argv.filter((a) => !a.startsWith('--') && a !== REDACT_TO);
// 默认只脱敏**随包集合**（用户 2026-09-19：「新建一个文件夹，把打包的放进去」）：
//   `knowledge/docs` = 随包文档（真源在 knowledge/）· `tools` = 随包工具（整体，0.4 MB）
//   `docs/` 已降级为**开发参考**，不再随包；`skills/` 走自己的分发链（dsh-runtime），也不在这里。
const DIRS = SOURCES.length ? SOURCES : ['knowledge/docs', 'tools'];

if (REDACT_TO) {
  console.log('== 生成脱敏副本 ==');
  console.log('源：' + DIRS.join(' · '));
  const r = redactDirs(DIRS, REDACT_TO, FLAG('--clean'));
  console.log('→ ' + r.target + ' · 复制 ' + r.copied + ' 个文件（其中 ' + r.rewritten + ' 个文本被改写）');
  console.log('');
  console.log('== 复扫副本（必须 0 命中）==');
  const again = scanDirs([r.target]);
  console.log('扫描 ' + again.scanned + ' 个文本文件 · 命中 ' + again.hits.length + ' 处');
  for (const h of again.hits) console.log('  ✗ ' + h.file + ' (' + h.count + ') ' + h.samples.join(' | '));
  process.exit(again.hits.length ? 1 : 0);
}

console.log('== 打包前脱敏扫描（源：' + DIRS.join(' · ') + '）==');
const res = scanDirs(DIRS);
console.log('扫描 ' + res.scanned + ' 个文本文件（跳过二进制 ' + res.skippedBinary + ' 个）');
console.log('');
if (!res.hits.length) {
  console.log('✅ 干净：没有发现用户名 / 用户目录路径 / IP / 邮箱');
  process.exit(0);
}
/* 🆕 2026-10-08：分流成两类（判据见 scanDirs 里那段注释） */
const cleanable = res.hits.filter((h) => h.residual === 0);
const real = res.hits.filter((h) => h.residual > 0);
if (cleanable.length && !real.length) {
  console.log('ℹ️ ' + cleanable.length + ' 个文件里有**可被脱敏改写**的命中（不算失败）：');
  for (const h of cleanable) console.log('  · ' + h.file + ' —— ' + h.count + ' 处（脱敏后残留 0）');
  console.log('');
  console.log('说明：这些命中在**打包脱敏副本时会被改写**（`--redact-to` 的默认源就含 `tools`，复扫要求 0 命中）——');
  console.log('     典型是脱敏工具**自身**在定义/举例这些模式（自我指涉）。真要发包仍走：');
  console.log('     node tools/check-redaction.cjs --redact-to dist/knowledge --clean');
  process.exit(0);
}
console.log('⛔ 命中 ' + real.length + ' 个文件**脱敏也盖不住**（真泄漏，必须处理）：');
for (const h of real) {
  console.log('  ✗ ' + h.file + ' —— 命中 ' + h.count + ' 处，脱敏后仍剩 ' + h.residual + ' 处');
  for (const s of h.residualSamples) console.log('      ' + s);
}
if (cleanable.length) {
  console.log('');
  console.log('（另有 ' + cleanable.length + ' 个文件只是**可被脱敏改写**的命中，未计入失败）');
}
console.log('');
console.log('处理方式（二选一）：');
console.log('  ① 直接生成脱敏副本（推荐，源文件不动）：');
console.log('     node tools/check-redaction.cjs --redact-to dist/knowledge --clean');
// ⚠️ 2026-10-05 更正：这里原先把命令写成 `--redact-to dist\knowledge --tools docs skills` —— 那是**旧默认源**
//    时代（docs+skills 也随包）的写法。现在默认源是 `knowledge/docs` + `tools`（`docs/` 已降级为开发参考、
//    `skills/` 走 dsh-runtime 自己的分发链），而 `--tools`/`docs`/`skills` 这些位置参数会被当成**源目录** ⇒
//    照抄会把 `docs/` 与 `skills/` 拷进知识包（并让 `check-package-assets` ⑧ 的份数对不上）。
console.log('  ② 逐条改源文件（注意：`docs/` 里的路径多用于说明，通常保留占位符即可）');
process.exit(1);
