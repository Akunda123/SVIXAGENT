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
const os = require('os');

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
  if (/function notifyOrb\(/.test(t) && /'akdagent-notice'/.test(t)) ok('notifyOrb() 存在（主进程 → 悬浮球的提示通道）');
  else fail('没有 notifyOrb() ⇒ 原因仍然只躺在日志里');
  /* ⚠️ 2026-10-05（1.0.3 用户报「配置好之后对话还是直接输出 error」）：
   *   旧判据断言的是 `if (hint) { notifyOrb('warn', hint) }` —— **那正是这条 bug 的形状**：
   *   `turnErrorHint()` 翻不出人话时返回空串 ⇒ `if (hint)` 整段不执行 ⇒ 界面只剩「回合结束（error）」，
   *   用户和我们都没有线索。⇒ 判据换成两条**新契约**：① 统一出口（悬浮球 + 两个面板）；
   *   ② 顺序（先把 turn/end 事件送进对话，再推原因 —— 否则「⚠ 原因」排在「回合结束（error）」上面）。 */
  if (/function pushTurnFailNotice\(text\) \{[\s\S]{0,700}?notifyOrb\('warn', text\)[\s\S]{0,500}?b\.pushOutput\(text\)/.test(t))
    ok('统一出口 pushTurnFailNotice()：悬浮球 + 两个侧栏面板都推');
  else fail('没有统一出口（或只推悬浮球）⇒ 面板用户仍然只看到「回合结束（error）」');
  {
    const iFn = t.indexOf('function followBoundSession');
    const iEvent = iFn >= 0 ? t.indexOf("if (v.type === 'event')", iFn) : -1;
    const seg = iEvent >= 0 ? t.slice(iEvent, iEvent + 3000) : '';
    const iDeliver = seg.indexOf("muxDeliver({ type: 'server-request'");
    const iPush = seg.indexOf('if (turnFail) pushTurnFailNotice(turnFail)');
    if (iDeliver >= 0 && iPush > iDeliver) ok('顺序：先把 turn/end 送进对话、再推原因');
    else fail('顺序反了（原因会排在「回合结束（error）」上面）或根本没推');
  }
  if (/has no provider\\?\/model|has no provider\/model/i.test(t) && /main\.turnError\.noModel/.test(t)) ok('映射补上了 `no provider/model`（实测签名；文案 2026-10-05 搬进 i18n）');
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
  /* 🆕 2026-10-05（1.0.3 报障 `but you passed DeepSeek-V4.1-Flash`）：上面两条只判"在不在**用户列表**里"，
   *   显示名当 id 填进去时**确实在列表里** ⇒ 一路绿灯。这里补"拿宿主真目录复核"的那一层。 */
  if (/async function checkAgentModelInCatalog\(provider, model\)/.test(t)) ok('checkAgentModelInCatalog() 存在（拿宿主真目录复核默认模型）');
  else fail('没有目录复核 ⇒ "显示名当 id"这种错只能等到每轮 400 才发现');
  if (/if \(!custom\) checkAgentModelInCatalog\(provider, model\)/.test(t)) ok('只在**没有自定义列表**时复核（不重蹈"空列表误报"）');
  else fail('目录复核没有"自定义列表就不查"的门，可能又造一次误报');
  if (/if \(!ids\.length\) return/.test(t) && /if \(ids\.includes\(model\)\) return/.test(t)) ok('目录里没这个提供方 / id 命中 ⇒ 静默返回（读不到就不猜）');
  else fail('目录复核缺少"读不到就别报"的早退');
  if (/readModelCatalog\(false\)/.test(t) && /catch \{ return \}/.test(t)) ok('目录读失败不抛给用户');
  else fail('目录读失败没被兜住');
  if (/main\.model\.notInCatalog/.test(t)) ok('复核命中有对应文案（main.model.notInCatalog）');
  else fail('复核命中却没文案');
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
  check('common.json', ['main.model.notSet', 'main.model.notInList', 'main.turnError.raw', 'main.model.notInCatalog']);
  check('settings.json', ['settings.model.noModelsLeft']);
  // ⚠️ 2026-09-27 修正：`orb.notice.warn` **属于 orb 命名空间**（orb.html 用 `svi18n` 从 orb 字典取键；
  //   放在 common.json 里等于取不到、用户会看见字面键名）⇒ 改查 `orb.json`。
  //   这条是 `tools/test-orb-compose.cjs` 先抓到的（它校验"orb.html 用到的 orb.* 键都在 orb 字典里"），
  //   本守卫原来把它记在 common.json，两个守卫互相矛盾 —— 以 orb.json 为准。
  check('orb.json', ['orb.notice.warn', 'orb.bridge.frozen']);
}

console.log('\n== ⑦ 子进程输出必须**分级**（2026-10-05，用户裁「6 做」）==');
/* 起因：`child.stderr` 一律走 console.error ⇒ 日志里 `[dsh:err] (node:…) Warning: …`、
 * `[stt] model loaded`、以及**用户自己按停**（`turn/end = aborted/user`）全成了 ERROR
 * ⇒ ① 用户翻日志以为坏了（当年"启动横幅被当 ERROR"同源）；② 真故障被淹。
 * 判据三层：函数在 · 抠出来**真跑样本表** · 两个转发点与中止分支都改用分级。 */
{
  if (/function logChildOutput\(tag, text\)/.test(t)) ok('分级函数 logChildOutput() 存在');
  else fail('没有分级函数 ⇒ 子进程 stderr 又会一律记 ERROR');
  if (/logChildOutput\('\[dsh:err\]', d\)/.test(t)) ok('内嵌 host stderr 走分级');
  else fail('host stderr 没走分级（Node 警告会继续冒充 ERROR）');
  if (/logChildOutput\('\[stt\]', d\)/.test(t)) ok('STT stderr 走分级');
  else fail('STT stderr 没走分级（"model loaded" 会继续冒充 ERROR）');
  // 抠出两个正则真跑样本（源码看着对 ≠ 分级对）
  const warnSrc = (t.match(/const CHILD_LINE_WARN = (\/.*\/)\n/) || [])[1];
  const contSrc = (t.match(/const CHILD_LINE_WARN_CONT = (\/.*\/)\n/) || [])[1];
  const infoSrc = (t.match(/const CHILD_LINE_INFO = (\/.*\/i)\n/) || [])[1];
  if (!warnSrc || !contSrc || !infoSrc) fail('抠不出 CHILD_LINE_WARN / CHILD_LINE_WARN_CONT / CHILD_LINE_INFO 正则');
  else {
    // eslint-disable-next-line no-new-func
    const W = new Function('return ' + warnSrc)();
    // eslint-disable-next-line no-new-func
    const C = new Function('return ' + contSrc)();
    // eslint-disable-next-line no-new-func
    const I = new Function('return ' + infoSrc)();
    const cases = [
      ['(node:29008) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///…', 'warn'],
      ['(node:1) DeprecationWarning: Passing args to a child process with shell option', 'warn'],
      ['[stt-server] model loaded (kind=offline)', 'info'],
      ['[stt-server] listening on http://127.0.0.1:3190', 'info'],
      /* 🆕 2026-10-05 真机补：Node 那条警告是**四行**的，后三行原本仍记 ERROR（本机日志里实测看得见） */
      ['Reparsing as ES module because module syntax was detected. This incurs a performance overhead.', 'warn'],
      ['To eliminate this warning, add "type": "module" to C:\\x\\profiles\\web\\package.json.', 'warn'],
      ['(Use `node --trace-warnings ...` to show where the warning was created)', 'warn'],
      ['credentials-local: unknown top-level key "DEEPSEEK_API_KEY"', 'error'],
      ['Error: listen EADDRINUSE: address already in use 127.0.0.1:3190', 'error'],
      ['认证失败：AUTH 401 Authentication Fails', 'error'],
    ];
    let wrong = 0;
    for (const [line, want] of cases) {
      const got = (W.test(line) || C.test(line)) ? 'warn' : (I.test(line) ? 'info' : 'error');
      if (got !== want) { wrong++; fail(`分级不符：want=${want} got=${got} ← ${line.slice(0, 60)}`); }
    }
    if (!wrong) ok(`分级样本全对（${cases.length} 条：Node 警告含续行→WARN · STT 正常行→INFO · 真故障→ERROR）`);
  }
  // 用户主动中止：不许 ERROR，也不许占着 last-turn-error.json
  const abortBlk = t.match(/const userAbort = [^\n]*\n[\s\S]{0,900}?\n              \}/);
  if (/const userAbort = r\.kind === 'aborted'/.test(t)) ok('把"用户主动中止"单独判出来了');
  else fail('没有区分"用户主动中止" ⇒ 用户按停会被记成故障');
  if (abortBlk && /console\.log\('\[akdagent\] turn\/end = 用户主动中止/.test(abortBlk[0])) ok('中止只记 INFO（不写 ERROR）');
  else fail('中止那条不是 INFO');
  if (abortBlk && !/last-turn-error\.json/.test(abortBlk[0])) ok('中止不覆盖 last-turn-error.json（报障文件留给真故障）');
  else fail('中止仍会覆盖 last-turn-error.json');
}

console.log('\n== ⑧ MCP 自检的**预算与重试**（2026-10-05，用户裁「调大 + 失败重试一次」）==');
/* 起因：本机 2026-10-04T03:30 落过一次 `ok:false / why:'6000ms 内没跑完 initialize+tools/list'`，
 *   而实测（tools/measure-mcp-handshake.cjs）本机只要 ~0.5 s ⇒ 那次是"机器正忙"。
 *   但**干净机器首次冷启动**要过 Defender 扫 86 MB node_modules + 240 MB models，而"自检不过 ⇒ 不写注册"
 *   ⇒ 一次偶发超时 = 用户**一颗 mcp__sv__* 工具都没有**，界面还看不出来。 */
{
  const m = t.match(/const MCP_SELFTEST_TIMEOUT_MS = (\d+)/);
  if (m && Number(m[1]) >= 15000) ok(`自检预算已放宽（${m[1]} ms，实测 ~0.5 s ⇒ 余量 ≥30×）`);
  else fail(`自检预算太小（${m ? m[1] + ' ms' : '找不到常量'}）⇒ 偶发超时会直接让用户没工具`);
  const a = t.match(/const MCP_SELFTEST_ATTEMPTS = (\d+)/);
  if (a && Number(a[1]) >= 2) ok(`失败会重试（最多 ${a[1]} 次）`);
  else fail('没有重试次数常量 ⇒ 一次超时就放弃');
  if (/function mcpSelfTestOnce\(/.test(t) && /async function mcpSelfTest\(/.test(t)) ok('拆成了"单次 + 带重试"两层');
  else fail('没有"单次 + 重试"两层结构');
  if (/for \(let i = 1; i <= n; i\+\+\)/.test(t)) ok('重试是循环实现（不是复制粘贴两份）');
  else fail('没看到重试循环');
  if (/attempts: st\.attempts \|\| 0, tried: st\.tried \|\| \[\]/.test(t)) ok('mcp-selftest.json 留痕"第几次通过 / 每次为什么没过"');
  else fail('mcp-selftest.json 没留 attempts/tried ⇒ 报障时分不清"偶发"与"真起不来"');
  if (/MCP 自检未通过（试了 \$\{st\.attempts\} 次/.test(t)) ok('失败日志写明试了几次（排障一眼看清）');
  else fail('失败日志没写次数');
}

console.log('\n== ⑨ 翻不出来的错也**必须说点什么**（2026-10-05，1.0.3 用户「配置好之后还是只输出 error」）==');
/* 判据不是"代码里有兜底函数"，而是**把那两个函数抠出来真跑样本表**：
 * 源码看着对 ≠ 真能出话（本仓库的老毛病：注释写了、分支没走）。 */
{
  const hintSrc = (t.match(/function turnErrorHint\(e\) \{[\s\S]*?\n\}/) || [])[0];
  const rawSrc = (t.match(/function turnErrorRaw\(e\) \{[\s\S]*?\n\}/) || [])[0];
  if (!hintSrc || !rawSrc) fail('抠不出 turnErrorHint / turnErrorRaw（函数被改名或删了？）');
  else {
    let api = null;
    try {
      /* 🆕 2026-10-05（用户裁「i18n 走」）：§⑨ 现在用**真字典**跑 —— 文案搬进 `main.turnError.*` 之后，
       *   用假 i18n 只会得到键名，断言不出"用户到底看到什么"（顺手也证明"键真的解析得出来"）。 */
      const i18nMod = require(path.join(ROOT, 'electron', 'src', 'i18n'));
      i18nMod.init({
        getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-turnerr-')),
        getSystemLocale: () => 'zh-CN',
        getLocale: () => 'zh-CN',
      });
      // eslint-disable-next-line no-new-func
      api = new Function('i18n', hintSrc + '\n' + rawSrc + '\nreturn { turnErrorHint, turnErrorRaw }')(i18nMod);
    } catch (e) { fail('两个函数抠出来跑不起来：' + e.message); }
    if (api) {
      if (api.turnErrorHint({ code: 'SOMETHING_NEW', message: 'weird failure' }) === '')
        fail('turnErrorHint 仍然会返回空串 ⇒ `if (hint)` 不成立 ⇒ 界面又只剩「回合结束（error）」');
      else ok('turnErrorHint 不再返回空串（映射不中就交给 turnErrorRaw）');
      const samples = [
        ['401/AUTH', { code: 'AUTH', status: 401, message: 'Authentication Fails' }],
        ['402 欠费', { status: 402, message: 'Insufficient Balance' }],
        ['429 限流', { status: 429, message: 'rate limit exceeded' }],
        ['403', { status: 403, message: 'forbidden' }],
        ['TRANSPORT', { code: 'TRANSPORT', message: 'fetch failed' }],
        ['REQUEST_EXTENSION', { code: 'REQUEST_EXTENSION', message: 'plugin boom' }],
        ['no provider/model', { message: 'agent "a" has no provider/model' }],
        /* 🆕 2026-10-05 实证（用户拿回的 last-turn-error.json）：模型名写错 ⇒ 400 */
        ['模型名写错（实证原文）', { code: 'INVALID_REQUEST', status: 400,
          message: 'The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed DeepSeek-V4.1-Flash. (request_id: 6949ded2-4e27-4be0-af86-61c8074e0a27)' }],
        ['5xx', { status: 503, message: 'bad gateway' }],
        ['未知 code', { code: 'WEIRD_CODE', message: 'something odd happened' }],
        ['只有 status', { status: 418 }],
        ['只有 message', { message: 'mystery failure' }],
        ['裸对象（连 message 都没有）', { foo: 'bar' }],
        ['超长 message 要截断', { message: 'x'.repeat(900) }],
      ];
      let blank = 0;
      for (const [name, e] of samples) {
        const h = api.turnErrorHint(e) || api.turnErrorRaw(e);
        if (!h) { blank++; fail(`样本「${name}」一个字的提示都出不来`); }
        else if (h.length > 400) fail(`样本「${name}」提示过长（${h.length} 字）⇒ 会把对话撑满`);
        /* 🆕 2026-10-05（真跑抓到的）：对话那行是 `textContent` 渲染 ⇒ `**` 会**原样显示**给用户。
         *   `no provider/model` 那条映射原来就写着 `**没有可用的模型**`（同源事故：i18n 字典里的 `**`）。 */
        else if (/\*\*/.test(h)) fail(`样本「${name}」的提示里有 ** markdown ⇒ 用户会看到星号：${h.slice(0, 50)}`);
        else if (/[\r\n]/.test(h)) fail(`样本「${name}」的提示含换行 ⇒ 会把对话撑开`);
        else if (/\{\d+\}/.test(h)) fail(`样本「${name}」的提示里有没被替换的占位符：${h.slice(0, 50)}`);
      }
      if (!blank) ok(`${samples.length} 条样本**全部拿到了非空提示**（含未知 code / 只有 status / 裸对象 / 超长 message）`);
      const long = api.turnErrorRaw({ message: 'x'.repeat(900) });
      if (long.includes('…') && long.length < 400) ok('长 message 会截断到 200 字 + 省略号');
      else fail('长 message 没截断 ⇒ 一整屏报错糊在对话里');
      if (/main\.turnError\.raw/.test(rawSrc)) ok('兜底文案走 i18n（main.turnError.raw，四语齐全见 §⑥）');
      else fail('兜底文案是硬编码 ⇒ 非中文用户看不懂');
      /* 🆕 2026-10-05 实证：那条 400「模型名写错」必须走**映射**（不是兜底），而且要把
       * 提供方自己给的"支持哪些"和"你传了什么"**解析出来** —— 这才是"下一步怎么办"。 */
      {
        const h = api.turnErrorHint({ code: 'INVALID_REQUEST', status: 400,
          message: 'The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed DeepSeek-V4.1-Flash. (request_id: x)' });
        const need = ['DeepSeek-V4.1-Flash', 'deepseek-flash', 'deepseek-v4-pro', '模型设置'];
        const lack = need.filter((s) => !h.includes(s));
        if (lack.length) fail('400「模型名写错」没解析全（缺 ' + lack.join(' / ') + '）→ ' + h.slice(0, 120));
        else ok('400「模型名写错」解析出"你传的 + 支持哪些 + 去哪儿改"（实证原文真跑）');
        const h2 = api.turnErrorHint({ code: 'INVALID_REQUEST', status: 400, message: 'you passed Some-Name but nothing parsed' });
        if (!h2) fail('400 变体（没有 supported 列表）出不来话');
        else ok('400 变体（只有 "you passed"）也有话可说');
      }
    }
  }
}

console.log('\n== ⑩ `main.turnError.*` 字典键必须**跟着源码走**（2026-10-05 用户裁「i18n 走」）==');
/* 用户不可见的那一层（映射文案）2026-10-05 全部搬进 i18n。两条都要防：
 *   ① 源码用了 `main.turnError.X` 而字典缺 ⇒ 界面上显示**字面键名**（比中文更难懂）；
 *   ② 字典里有 `main.turnError.Y` 而源码不用 ⇒ 死键（改文案时改了没人看的那份）。 */
{
  const D = path.join(ROOT, 'electron', 'src', 'i18n', 'common.json');
  let dict = null;
  try { dict = JSON.parse(fs.readFileSync(D, 'utf8')); } catch (e) { fail('common.json 读不了：' + e.message); }
  if (dict) {
    const LOC = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
    const used = [...new Set([...t.matchAll(/main\.turnError\.[A-Za-z0-9_]+/g)].map((m) => m[0]))].sort();
    if (used.length >= 10) ok(`源码用到 ${used.length} 个 main.turnError.* 键（含兜底 raw）`);
    else fail(`源码只用到 ${used.length} 个 main.turnError.* 键 ⇒ 映射文案是不是又被硬编码回去了？`);
    let lack = 0;
    for (const k of used) {
      for (const l of LOC) {
        const v = dict[l] && dict[l][k];
        if (!v || !String(v).trim()) { lack++; fail(`字典缺 ${l} / ${k}`); }
      }
    }
    if (!lack) ok(`${used.length} 键 × 4 语全部非空`);
    const inDict = Object.keys(dict['zh-Hans'] || {}).filter((k) => k.startsWith('main.turnError.'));
    const dead = inDict.filter((k) => !used.includes(k));
    if (dead.length) fail('死键（字典有、源码不用）：' + dead.join(', '));
    else ok('没有死键（字典里的 main.turnError.* 全在用）');
    const md = [];
    for (const k of inDict) for (const l of LOC) if (/\*\*/.test(String((dict[l] || {})[k] || ''))) md.push(l + '/' + k);
    if (md.length) fail('文案里有 markdown（textContent 渲染会原样显示）：' + md.join(', '));
    else ok('全部文案不含 markdown');
    /* 四语"同键数"是既有约定的延伸：这组键尤其重要（漏一个就是某语种显示键名） */
    const sizes = LOC.map((l) => Object.keys(dict[l] || {}).filter((k) => k.startsWith('main.turnError.')).length);
    if (new Set(sizes).size === 1) ok(`四语的 main.turnError.* 键数一致（${sizes[0]}）`);
    else fail('四语键数不一致：' + sizes.join(' / '));
  }
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格`); process.exit(1); }
console.log('✓ 故障诊断三件套守卫通过');
