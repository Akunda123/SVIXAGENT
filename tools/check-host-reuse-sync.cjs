#!/usr/bin/env node
/**
 * 守卫：**「每次启动的凭据同步」不许再挂在 spawnHost 里 + 宿主记录必须有版本戳**
 * （2026-09-26 立 · 当天定位「装了 1.0.1 仍每轮 AUTH/401，手工 copy 凭据却立刻好」）
 *
 * 现场（真因）：客户端复用了一个**孤儿内嵌 host**（客户端被强杀/卸载残留留下的 node 进程；
 *   `embedded-host.json` 里的 cookie 有效期 **30 天** ⇒ 复用窗口很长），而复用成功时不走
 *   `spawnHost()` ⇒ 挂在 `spawnHost()` 里的 `ensureAkdagentDshHome()` 整段被跳过
 *   ⇒ 宿主永远拿不到用户后填的 key（它读的是隔离家目录 `~/.dsh-akdagent/.credentials.yaml`）。
 *   手工 copy 之所以立刻好：宿主对该文件是 chokidar **热重载**，与客户端版本无关。
 *
 * 修法（两条，都在 electron/src/main.js，本守卫就钉这两条）：
 *   ① `ensureAkdagentDshHome()` 移到 ready 段、**复用判定之前**（复用与新起两条路都覆盖）；
 *   ② `embedded-host.json` 里记**客户端版本** `v`，复用条件加 `prevHost.v === clientVersion`
 *      —— 版本不一致就 killTree 旧宿主 + 重起（治本：老客户端起的宿主体内没有客户端侧修复）。
 *
 * 用法：node tools/check-host-reuse-sync.cjs
 *       node tools/check-host-reuse-sync.cjs --file <某份 main.js>   # 反向验证：修复前那份应当 FAIL
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argFile = (() => {
  const i = process.argv.indexOf('--file');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const MAIN = argFile ? path.resolve(argFile) : path.join(ROOT, 'electron', 'src', 'main.js');

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

if (!fs.existsSync(MAIN)) {
  console.log('  [FAIL] 找不到 ' + MAIN);
  process.exit(1);
}
const t = fs.readFileSync(MAIN, 'utf8');
console.log('检查 ' + path.relative(ROOT, MAIN) + '（' + t.split(/\r?\n/).length + ' 行）');

// ── 定位：spawnHost 函数体 / ready 段 / 复用分支 ──────────────────────────
function bodyOf(fnSig) {
  const i = t.indexOf(fnSig);
  if (i < 0) return null;
  const j = t.indexOf('\nfunction ', i + fnSig.length);
  return { start: i, text: t.slice(i, j < 0 ? t.length : j) };
}
const spawn = bodyOf('function spawnHost(');
/* ⚠️ 必须用「行首的 app.whenReady().then(」定位 —— 文件顶部注释里也出现过 `app.whenReady()`
 *  （第 38 行），用 indexOf 会命中那句注释 ⇒ "调用点在 ready 段之内"这条会假通过
 *  （反向验证时实测踩到：修复前那份本该 FAIL 却报了 ok）。 */
const readyMatch = /^app\.whenReady\(\)\.then\(/m.exec(t);
const readyAt = readyMatch ? readyMatch.index : -1;
// 调用点 = **独占一行**的 `ensureAkdagentDshHome()`（定义体是 `function ensureAkdagentDshHome() {`，不会命中）
const callSites = [];
for (const m of t.matchAll(/^[ \t]*ensureAkdagentDshHome\(\)[ \t]*$/gm)) callSites.push(m.index);
const iPrevHost = t.indexOf('const prevHost = loadHostRecord()');

console.log('\n== ① 同步调用必须脱离 spawnHost，落在 ready 段的复用判定之前 ==');
if (!spawn) fail('找不到 function spawnHost( —— 结构变了，本守卫要跟着改');
else if (/^[ \t]*ensureAkdagentDshHome\(\)[ \t]*$/m.test(spawn.text)) {
  fail('spawnHost() 里**又**出现了 ensureAkdagentDshHome()：复用孤儿 host 时这条路不会走 ⇒ 宿主拿不到后填的 key（本次事故原样复发）');
} else ok('spawnHost() 体内没有同步调用（复用孤儿 host 时不会漏）');

if (callSites.length === 0) fail('全文件找不到 ensureAkdagentDshHome() 的调用 ⇒ 依赖它的启动同步没了');
else if (callSites.length > 1) fail('ensureAkdagentDshHome() 有多处调用（' + callSites.length + ' 处）—— 只该在 ready 段留一处，多点会各写一遍凭据');
else {
  const at = callSites[0];
  if (readyAt < 0 || at < readyAt) fail('调用点不在 app.whenReady() 里（在启动流程之外 ⇒ 不保证每次启动都跑）');
  else if (iPrevHost < 0) fail('找不到 `const prevHost = loadHostRecord()` ⇒ 复用判定结构变了，本守卫要跟着改');
  else if (at > iPrevHost) fail('调用点在**复用判定之后** ⇒ 复用成功时仍会被跳过（必须放在它之前）');
  else ok('调用点在 ready 段、且早于复用判定（复用与新起两条路都覆盖）');
}

console.log('\n== ② 宿主记录必须带版本戳，且复用要比它 ==');
for (const [what, re] of [
  ['记录里写入客户端版本（v: app.getVersion()）', /v:\s*app\.getVersion\(\)/],
  ['取当前客户端版本（const clientVersion = app.getVersion()）', /const clientVersion\s*=\s*app\.getVersion\(\)/],
  ['复用条件里比对版本（prevHost.v === clientVersion）', /prevHost\.v\s*===\s*clientVersion/],
]) {
  if (re.test(t)) ok(what); else fail(what + '（缺它 ⇒ 升级后仍会复用老客户端起的宿主，客户端侧修复永远不生效）');
}

console.log('\n== ③ 版本不一致时必须真的换掉旧宿主（杀掉 + 当没复用） ==');
const mismatch = (() => {
  const i = t.indexOf('} else if (alive.status === 200) {');
  if (i < 0) return null;
  const j = t.indexOf('} else {', i);
  return t.slice(i, j < 0 ? i + 800 : j);
})();
if (!mismatch) fail('没有「复用成功但版本不一致」的分支（旧宿主会被继续用）');
else {
  if (/killTree\(prevHost\.pid\)/.test(mismatch)) ok('版本不一致 ⇒ killTree(prevHost.pid)');
  else fail('分支里没杀旧宿主 ⇒ 旧进程继续占着端口，下次还会被复用');
  if (/hostPort = null/.test(mismatch)) ok('版本不一致 ⇒ 清掉 hostPort（走新起宿主那条路）');
  else fail('分支里没清 hostPort ⇒ 会拿着旧端口继续用');
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格（恢复"复用孤儿宿主"就等于把这次的事故放回去）`); process.exit(1); }
console.log('✓ 宿主复用 × 凭据同步守卫通过');
