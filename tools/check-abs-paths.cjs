#!/usr/bin/env node
'use strict';
/**
 * 守卫：**指向项目外的绝对路径**（2026-09-19 新增）
 *
 * 为什么要有它：2026-09-19 客户端启动失败两次，根因都跟"写死的项目外绝对路径"有关 ——
 *   `electron/src/main.js` 的 `resolveDshRoot()` 写死了
 *   `C:/Users/<user>/Downloads/deepseek-harness-master/...`，用户删掉那个 checkout 后
 *   入口不存在 + cwd 不存在 ⇒ `spawn ENOENT` ⇒ 白等 90s 弹一句误导的
 *   「did not become ready in time」。**同一行还带着真实用户名**，而它是随安装包分发的代码。
 *
 * 三级判据（按"会不会真的带进发布包"分）：
 *   · **unredacted** 未脱敏进包 ⇒ electron/src（asar）· electron/*.yml · server/src（→
 *     resources/server）· sv/（→ resources/assets）。这里出现真实用户名 = **发布包里泄漏**。
 *   · **redacted** 走 `tools/check-redaction.cjs` 脱敏后才进包 ⇒ tools/ · knowledge/docs。
 *     用户名会被换成 `<USER>`，但仍可能是**机器绑定**（换台机就跑不通）⇒ 只报不判死。
 *   · **dev** 其余（docs/ · scripts/ · electron/dev · server/*.cjs …）不进包 ⇒ 只报。
 *
 * 判据四类（本文里写路径示例一律用 `<盘符>`/`<name>`，免得守卫扫到自己）：
 *   ① user-path   `<盘符>:\Users\<非占位符>`  —— 机器绑定 + 可能泄漏
 *   ② proj-abs    绝对路径指向本仓自身        —— 应写相对路径（`__dirname` 起算）
 *   ③ unc         `\\<host>\<share>`         —— 网络路径，别人机器上必然不存在
 *   ④ other-drive 非 C 盘盘符               —— 机器绑定
 * 另报 info 类：`C:\Program Files\…` 等**系统目录**（多是正常引用安装位置，不判死）。
 *
 * 显式豁免：某行含 `abs-path-allow` 即整行跳过（仅供文档示例等确需场合；便于 grep 审计）。
 *
 * 用法：`node tools/check-abs-paths.cjs`（只看问题）· `--all`（连 info 与 dev 一起列）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** 只在"未脱敏就进包"的目录里判死 */
const UNREDACTED = [
  'electron/src',
  'electron/assets',
  'electron/electron-builder.yml',
  'electron/package.json',
  'server/src',
  'sv',
];
/** 脱敏后才进包 */
const REDACTED = ['tools', 'knowledge/docs'];
/** 不进包（开发参考/脚本） */
const DEV = ['docs', 'scripts', 'assets', 'dsh-plugin', 'feedback', 'licenses', 'server'];

const SKIP_DIR = /[\\/](node_modules|release|dist|out|out-|coverage|\.git|dsh-runtime|win-unpacked|\.cache)[\\/]/;
const TEXT_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.ps1', '.py', '.lua', '.json',
  '.yml', '.yaml', '.md', '.html', '.css', '.txt', '.patch', '.cmd', '.bat']);

/** 占位符式用户名（本身就不是真名） */
const PLACEHOLDER_USER = /^(<USER>|<user>|you|yourname|USERNAME|username|\$.*|<.*>)$/;

function tagFor(rel) {
  const norm = rel.replace(/\\/g, '/');
  if (UNREDACTED.some((p) => norm === p || norm.startsWith(p + '/'))) return 'unredacted';
  if (REDACTED.some((p) => norm === p || norm.startsWith(p + '/'))) return 'redacted';
  return 'dev';
}

function walk(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const abs = path.join(dir, e.name);
    if (SKIP_DIR.test(abs + path.sep)) continue;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(abs, out);
    else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(abs);
  }
  return out;
}

/** 抓一行里所有"项目外绝对路径"，返回 [{kind, text, severity}] */
function inspect(line, relFile) {
  const found = [];
  const add = (kind, text, severity) => found.push({ kind, text, severity });

  // ① <盘符>:\Users\<name> / <盘符>:/Users/<name>
  for (const m of line.matchAll(/\b([A-Za-z]:[\\/]Users[\\/])([^\\/\s"'`),;]+)/g)) {
    const name = m[2];
    if (PLACEHOLDER_USER.test(name)) continue;
    // 指向本仓自身 ⇒ 更准确的类别
    const isProj = /Documents[\\/]AKDAgent\b/i.test(line.slice(m.index, m.index + 200));
    if (isProj) add('proj-abs', m[0] + '…', 'fail');
    else add('user-path', m[0], 'fail');
  }
  // ② 项目自身绝对路径（不限于 Users 形态，例如 <盘符>:\work\AKDAgent）
  for (const m of line.matchAll(/\b[A-Za-z]:[\\/][^\s"'`),;]*?[\\/]AKDAgent[\\/]/g)) {
    add('proj-abs', m[0], 'fail');
  }
  // ③ UNC
  for (const m of line.matchAll(/\\\\[A-Za-z0-9_.\-]+\\[A-Za-z0-9_$]/g)) add('unc', m[0], 'fail');
  // ④ 非 C 盘
  for (const m of line.matchAll(/\b([D-Zd-z]):[\\/][^\s"'`),;]*/g)) add('other-drive', m[0], 'fail');
  // info：系统目录（正常引用安装位置）
  for (const m of line.matchAll(/\b[A-Za-z]:[\\/](?:Program Files(?: \(x86\))?|ProgramData|Windows)\b/gi)) {
    add('system-dir', m[0], 'info');
  }
  // 去重（同一行同一串别报两遍）
  const seen = new Set();
  return found.filter((h) => {
    const k = h.kind + '|' + h.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function main() {
  const showAll = process.argv.includes('--all');
  const files = [];
  for (const d of [...UNREDACTED, ...REDACTED, ...DEV]) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    const st = fs.statSync(abs);
    if (st.isFile()) files.push(abs);
    else walk(abs, files);
  }
  for (const f of ['README.md', 'README-发布版草案.md', 'THIRD-PARTY-NOTICES.md']) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) files.push(abs);
  }
  const uniq = [...new Set(files)];

  const hits = [];
  for (const abs of uniq) {
    const rel = path.relative(ROOT, abs);
    const tag = tagFor(rel);
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue;                      // 二进制
    text.split(/\r?\n/).forEach((line, i) => {
      // 显式豁免：该行含 `abs-path-allow`（写文档示例/确实需要时用，便于 grep 审计）
      if (line.includes('abs-path-allow')) return;
      if (!/[A-Za-z]:[\\/]|\\\\/.test(line)) return;
      for (const h of inspect(line, rel)) {
        hits.push({ rel, line: i + 1, tag, ...h });
      }
    });
  }

  // 判死条件：未脱敏进包 + fail 类
  const fails = hits.filter((h) => h.tag === 'unredacted' && h.severity === 'fail');
  const redactedWarn = hits.filter((h) => h.tag === 'redacted' && h.severity === 'fail');
  const devWarn = hits.filter((h) => h.tag === 'dev' && h.severity === 'fail');
  const infos = hits.filter((h) => h.severity === 'info');

  const byFile = (list) => {
    const m = new Map();
    for (const h of list) {
      if (!m.has(h.rel)) m.set(h.rel, []);
      m.get(h.rel).push(h);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  };
  const show = (title, list, level) => {
    if (!list.length) { console.log(`\n${title}：0 处`); return; }
    console.log(`\n${title}：${list.length} 处 / ${byFile(list).length} 个文件`);
    for (const [rel, hs] of byFile(list)) {
      console.log(`  ${level} ${rel}  (${hs.length})`);
      for (const h of hs.slice(0, 6)) console.log(`      L${h.line} [${h.kind}] ${h.text}`);
      if (hs.length > 6) console.log(`      … 另有 ${hs.length - 6} 处`);
    }
  };

  console.log(`扫描 ${uniq.length} 个文本文件（已跳过 node_modules / release / dist / dsh-runtime）`);
  show('❌ 未脱敏就进包 + 项目外绝对路径（**这是发布包泄漏 / 启动失败源头**）', fails, '·');
  show('⚠️ 走脱敏后进包（产物里会变 <USER>，但仍可能机器绑定）', redactedWarn, '·');
  if (showAll) {
    show('· 仅开发态、不进包', devWarn, '·');
    show('· info：系统目录引用（一般正常）', infos, '·');
  } else {
    console.log(`\n（开发态 ${devWarn.length} 处 · info ${infos.length} 处 —— 加 --all 看明细）`);
  }

  if (fails.length) {
    console.log(`\n✗ 判死：${fails.length} 处必须修（未脱敏进包的代码里不许出现项目外绝对路径）`);
    process.exit(1);
  }
  console.log('\n✅ 未脱敏进包的代码里没有指向项目外的绝对路径');
}

main();
