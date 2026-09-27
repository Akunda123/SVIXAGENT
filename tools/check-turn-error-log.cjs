#!/usr/bin/env node
/**
 * 守卫：**故障诊断三件套不许被删**（2026-09-26 立；当天排查用户机"一发消息就 回合结束（error）"耗掉一整轮）
 *
 * 背景：用户报「一发消息就报错」时，我们手里只有界面上那句 `回合结束（error）`，
 * 客户端**既不记 reason、也不记 MCP 自检结果** ⇒ 只能靠猜、靠反复求用户配合。
 * 补上这三样之后，同类报障一条命令就能定位：
 *   ① 每轮结束（非 completed）把 `reason` + 人话原因写进 `akdagent.log`，并落 `userData/last-turn-error.json`
 *   ② 启动时对 MCP server 做 **initialize + tools/list 自检**，结果落 `userData/mcp-selftest.json`；
 *      **自检不过就不写注册**（避免"注册了却握不上手"）
 *   ③ `turnErrorHint()` 的码→人话映射（401/402/403/429/TRANSPORT/REQUEST_EXTENSION…）
 *
 * 用法：node tools/check-turn-error-log.cjs [--main <main.js 路径>]
 *   （`--main` 用于反向验证：指向修复前那份，守卫应 FAIL）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const mi = args.indexOf('--main');
const MAIN = mi >= 0 && args[mi + 1] ? path.resolve(args[mi + 1]) : path.join(ROOT, 'electron', 'src', 'main.js');
let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

if (!fs.existsSync(MAIN)) {
  console.log('  [FAIL] 找不到 ' + MAIN);
  process.exit(1);
}
const t = fs.readFileSync(MAIN, 'utf8');

console.log('== ① 每轮失败的 reason 必须落日志 + 落盘 ==');
for (const [what, re] of [
  ['turnErrorHint() 存在', /function turnErrorHint\(/],
  ['reason 写进日志', /\[akdagent\] turn\/end reason = /],
  ['人话原因写进日志', /\[akdagent\] ⇒ 可能的原因：/],
  ['reason 落 last-turn-error.json', /last-turn-error\.json/],
]) {
  if (re.test(t)) ok(what); else fail(what + '（被删了？排查又要回到"只能猜"）');
}

console.log('\n== ② MCP server 自检 ==');
for (const [what, re] of [
  ['mcpSelfTest() 存在', /function mcpSelfTest\(/],
  ['注册前 await 自检', /await mcpSelfTest\(/],
  ['自检不过就不注册', /if \(!st\.ok\)/],
  ['自检结果落 mcp-selftest.json', /mcp-selftest\.json/],
  ['自检走 initialize + tools/list', /'tools\/list'/],
]) {
  if (re.test(t)) ok(what); else fail(what);
}

console.log('\n== ③ 码 → 人话映射要覆盖实测过的签名 ==');
for (const [what, re] of [
  ['401 / AUTH', /code === 'AUTH' \|\| status === 401/],
  ['402', /status === 402/],
  ['403', /status === 403/],
  ['429', /status === 429/],
  ['TRANSPORT', /code === 'TRANSPORT'/],
  ['REQUEST_EXTENSION', /code === 'REQUEST_EXTENSION'/],
]) {
  if (re.test(t)) ok(what); else fail('缺少 ' + what + ' 的归类');
}

console.log('\n== ④ 二层：把"为什么错、去哪儿配"送到**用户看得见的地方**（2026-09-27）==');
/* 用户现场（2026-09-27）：宿主没有可解析的默认模型 ⇒ 每一轮 `no provider/model`，
 * 而界面上只有「回合结束（error）」；日志里有人话、可用户不会去看日志。 */
{
  if (/function notifyOrb\(/.test(t) && /'akdagent-notice'/.test(t)) ok('notifyOrb() 存在（主进程 → 悬浮球/面板的提示通道）');
  else fail('没有 notifyOrb() ⇒ 原因仍然只躺在日志里');
  if (/if \(hint\) \{[\s\S]{0,300}?notifyOrb\('warn', hint\)/.test(t)) ok('turn/end 的人话原因会推给用户界面');
  else fail('turn/end 的原因没有推给界面 ⇒ 用户还是只看到「回合结束（error）」');
  if (/has no provider\\?\/model|has no provider\/model/i.test(t) && /没有可用的模型/.test(t)) ok('映射补上了 `no provider/model`（实测签名）');
  else fail('映射没覆盖 `no provider/model` ⇒ 这次用户遇到的那类报错仍然没有人话');
  const orbPre = path.join(ROOT, 'electron', 'src', 'orb-preload.js');
  const orbHtml = path.join(ROOT, 'electron', 'src', 'orb.html');
  const pre = fs.existsSync(orbPre) ? fs.readFileSync(orbPre, 'utf8') : '';
  const html = fs.existsSync(orbHtml) ? fs.readFileSync(orbHtml, 'utf8') : '';
  if (/onNotice:\s*\(cb\)\s*=>\s*ipcRenderer\.on\('akdagent-notice'/.test(pre)) ok('orb-preload 暴露 onNotice（通道接上）');
  else fail('orb-preload 没暴露 onNotice ⇒ 推了也没人收');
  if (/akdagent\.onNotice\(/.test(html) && /orb\.notice\.warn/.test(html)) ok('orb.html 会把提示渲染成一行（orb.notice.warn）');
  else fail('orb.html 没有处理 onNotice');
}

console.log('\n== ⑤ 默认模型自检 + 删空不再静默（2026-09-27）==');
{
  if (/function checkAgentModelConfigured\(/.test(t)) ok('checkAgentModelConfigured() 存在（开局判"模型能不能解析"）');
  else fail('没有模型自检 ⇒ 用户要等到每轮报错才知道');
  if (/setTimeout\(\(\) => checkAgentModelConfigured\(\), 2000\)/.test(t)) ok('开局调用（推给球，不弹模态）');
  else fail('没有在启动时调用模型自检');
  if (/main\.model\.notSet/.test(t) && /main\.model\.notInList/.test(t)) ok('两种缺失都有对应文案（未选 / 不在列表）');
  else fail('缺"未选模型 / 模型不在列表"的文案');
  if (/noModels: models\.length === 0/.test(t)) ok('remove-model 回报 noModels（删空时界面能提示）');
  else fail('remove-model 仍然静默把 model 写空 ⇒ 下一次又是"回合结束（error）"');
  const st = path.join(ROOT, 'electron', 'src', 'settings.html');
  const s = fs.existsSync(st) ? fs.readFileSync(st, 'utf8') : '';
  if (/r\.noModels[\s\S]{0,120}?settings\.model\.noModelsLeft/.test(s)) ok('设置页删到空列表时会当场提示');
  else fail('设置页没用 noModels ⇒ 用户删完不知道发生了什么');
}

console.log('\n== ⑥ 新增文案四语齐全 ==');
{
  const DIR = path.join(ROOT, 'electron', 'src', 'i18n');
  const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
  const check = (file, keys) => {
    let j = null;
    try { j = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')); } catch (e) { fail(file + ' 读不了：' + e.message); return; }
    for (const l of LOCALES) {
      const lack = keys.filter((k) => !j[l] || !j[l][k] || String(j[l][k]).trim() === '');
      if (lack.length) fail(file + ' / ' + l + ' 缺 ' + lack.join(', '));
    }
    ok(file + '：' + keys.length + ' 键 × ' + LOCALES.length + ' 语齐全');
  };
  check('common.json', ['main.model.notSet', 'main.model.notInList']);
  check('settings.json', ['settings.model.noModelsLeft']);
  // ⚠️ 2026-09-27 修正：`orb.notice.warn` **属于 orb 命名空间**（orb.html 用 `svi18n` 从 orb 字典取键；
  //   放在 common.json 里等于取不到、用户会看见字面键名）⇒ 改查 `orb.json`。
  //   这条是 `tools/test-orb-compose.cjs` 先抓到的（它校验"orb.html 用到的 orb.* 键都在 orb 字典里"），
  //   本守卫原来把它记在 common.json，两个守卫互相矛盾 —— 以 orb.json 为准。
  check('orb.json', ['orb.notice.warn', 'orb.bridge.frozen']);
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格`); process.exit(1); }
console.log('✓ 故障诊断三件套守卫通过');
