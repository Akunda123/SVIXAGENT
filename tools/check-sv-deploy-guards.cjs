#!/usr/bin/env node
/**
 * 守卫：**SV 集成的交互护栏**（2026-09-27 立 · 用户要求；同日二改：提醒/确认一律 **HTML**）
 *
 * ① **没指定任何 SV scripts 目录 ⇒ 打开 HTML 配置向导**（不再用原生提示框）
 *    没配目录 = 桥脚本没地方部署 = SV/IX 侧的工具全用不了，而界面上**看不出任何异常**
 *    ⇒ 用户只会觉得"工具怎么都不管用"。向导里三步走完：说明 → 检索目录并勾选 → 一键部署。
 *    判据：`notifyMissingSvDirs()` 只负责**判据 + 节流 + 打开向导**（每个版本一次、先落盘再开），
 *    且**不许**再出现 `showMessageBoxSync`（用户明确要求 HTML）。
 *
 * ② **往 SV1 / OPSV（或认不出的宿主）部署面板前必须确认，且确认框是 HTML**
 *    这两类宿主没有侧栏（SidePanelSection），面板在那边不生效，而且 SV1 的脚本菜单会把
 *    `scripts/Agent/*.js` 列出来 ⇒ 多一个"点了就出事"的菜单项（用户 2026-09-25 明确会出问题）。
 *    判据：`confirmPanelDeploy()` 是 async 且走 `askConfirm()`（HTML 窗）；`askConfirm` **非模态**
 *    （不用 parent/modal —— 那会把父窗禁用）、关窗即取消、`AKDAGENT_NO_DIALOG=1` 时不开窗；
 *    调用点在 `fs.copyFileSync` **之前**，且 handler 是 async。
 *
 * 用法：node tools/check-sv-deploy-guards.cjs [--main <main.js 路径>]
 *   （`--main` 用于反向验证：指向修复前那份 main.js，守卫应 FAIL）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const mi = args.indexOf('--main');
const MAIN = mi >= 0 && args[mi + 1] ? path.resolve(args[mi + 1]) : path.join(ROOT, 'electron', 'src', 'main.js');
const SRC = path.join(ROOT, 'electron', 'src');
const SETTINGS = path.join(SRC, 'settings.html');
const I18N = path.join(SRC, 'i18n');

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

const t = fs.existsSync(MAIN) ? fs.readFileSync(MAIN, 'utf8') : '';
const st = fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS, 'utf8') : '';
const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const wizard = readIf(path.join(SRC, 'sv-setup.html'));
const wizardPre = readIf(path.join(SRC, 'sv-setup-preload.js'));
const confirmHtml = readIf(path.join(SRC, 'confirm.html'));
const confirmPre = readIf(path.join(SRC, 'confirm-preload.js'));
if (!t) { console.log('  [FAIL] 读不到 ' + MAIN); process.exit(1); }
console.log('检查 ' + path.relative(ROOT, MAIN));
/** 从签名处往后取一段（不做括号配对 —— 源码里字符串/注释里的括号会骗过它） */
const sliceFrom = (sig, n = 2600) => { const i = t.indexOf(sig); return i < 0 ? '' : t.slice(i, i + n); };

console.log('\n== ① 没配 SV 目录 ⇒ 打开 HTML 向导（每版一次、先落盘再开、不再用原生框）==');
{
  const body = sliceFrom('function notifyMissingSvDirs(');
  if (!body) fail('找不到 notifyMissingSvDirs()');
  else {
    if (/noDirNoticeShownFor === app\.getVersion\(\)/.test(body)) ok('按"每个客户端版本"节流（不做唠叨）');
    else fail('没有节流 ⇒ 每次启动都开，会被当成骚扰');
    const iWrite = body.search(/noDirNoticeShownFor: app\.getVersion\(\)/);
    const iOpen = body.indexOf('openSvSetup()');
    if (iWrite < 0) fail('没写节流标记');
    else if (iOpen < 0) fail('没有打开向导（提醒没落地）');
    else if (iWrite > iOpen) fail('先开窗后落盘 ⇒ 用户不理会/进程被杀会反复弹（必须反序）');
    else ok('先落盘、再打开向导');
    if (/AKDAGENT_NO_DIALOG/.test(body)) ok('受 AKDAGENT_NO_DIALOG 约束（无人值守测试不被挡住）');
    else fail('没尊重 AKDAGENT_NO_DIALOG');
    if (/showMessageBoxSync/.test(body)) fail('还在用原生 MessageBox ⇒ 用户明确要求提醒走 HTML');
    else ok('不再使用原生 MessageBox（提醒走 HTML 向导窗口）');
  }
  if (/setTimeout\(\(\) => notifyMissingSvDirs\(\), 1500\)/.test(t)) ok('开机调用（延后 1.5s，避开密钥窗）');
  else fail('开机没有调用提醒');
  if (/function openSvSetup\(/.test(t) && /sv-setup\.html/.test(t) && /sv-setup-preload\.js/.test(t)) ok('openSvSetup() 会加载 sv-setup.html（带自己的 preload）');
  else fail('向导窗口的创建/加载没接线');
}

console.log('\n== ② 部署面板到 SV1 / OPSV（或认不出）前确认；确认框是 HTML ==');
{
  if (/function askConfirm\(/.test(t)) ok('askConfirm() 存在（通用 HTML 确认窗）');
  else fail('没有 askConfirm()');
  const ac = sliceFrom('function askConfirm(', 2200);
  if (/confirm\.html/.test(ac) && /confirm-preload\.js/.test(ac)) ok('确认窗加载 confirm.html + 自己的 preload');
  else fail('确认窗没接上 confirm.html / preload');
  if (/modal:\s*true|parent:\s*settingsWin/.test(ac)) fail('确认窗用了 modal/parent ⇒ 会把父窗整个禁用（见 createKeyPromptWindow 的教训）');
  else ok('确认窗非模态（不会禁用父窗）');
  if (/AKDAGENT_NO_DIALOG[\s\S]{0,200}?resolve\(false\)/.test(ac)) ok('AKDAGENT_NO_DIALOG=1 ⇒ 不开窗、直接按取消');
  else fail('无人值守时确认窗会挂住流程');
  if (/on\('closed'[\s\S]{0,200}?resolve\(false\)/.test(ac)) ok('关窗即取消（安全默认）');
  else fail('关窗没有兜底成"取消"');
  if (/ipcMain\.on\('akdagent-confirm-answer'/.test(t)) ok('确认结果经 IPC 回主进程');
  else fail('没有回收确认结果的通道');
  if (/answer:\s*\(ok\)/.test(confirmPre) && /svconfirm/.test(confirmHtml)) ok('confirm.html 与 preload 的桥接对得上');
  else fail('confirm.html / preload 桥接对不上');

  const body = sliceFrom('async function confirmPanelDeploy(', 1600);
  if (!body) fail('confirmPanelDeploy() 不是 async（HTML 窗要 await）');
  else {
    if (/await askConfirm\(/.test(body)) ok('面板确认走 askConfirm()（HTML）');
    else fail('面板确认没走 HTML 确认窗');
    if (/showMessageBoxSync/.test(body)) fail('面板确认还在用原生 MessageBox');
    if (/return ok\b/.test(body)) ok('把用户的选择原样返回');
    else fail('没有返回用户选择');
  }
  const iHandler = t.indexOf("ipcMain.handle('akdagent-deploy-sv-file'");
  const seg = iHandler < 0 ? '' : t.slice(iHandler, iHandler + 2600);
  if (iHandler < 0) fail('找不到单目录部署的 handler');
  else {
    if (!/async \(_e, dir, what\)/.test(seg)) fail('handler 不是 async ⇒ 没法 await 确认窗');
    else ok('handler 是 async（能等确认结果）');
    const iConfirm = seg.indexOf('await confirmPanelDeploy(scriptsDir, kind)');
    const iCopy = seg.indexOf('fs.copyFileSync(src, target)');
    if (iConfirm < 0) fail('面板分支没有等确认就往下走');
    else if (iCopy < 0) fail('找不到面板复制那行');
    else if (iConfirm > iCopy) fail('确认排在复制**之后** ⇒ 已经装进去了才问');
    else ok('确认排在复制之前');
    if (/cancelled: true/.test(seg)) ok('取消时回报 cancelled:true（界面据此不报"失败"）');
    else fail('取消没有专门的回报字段');
  }
}

console.log('\n== ③ 一键部署遇到"零目录"要说清楚 ==');
{
  const iH = t.indexOf("ipcMain.handle('akdagent-deploy-sv-bridge'");
  const seg = iH < 0 ? '' : t.slice(iH, iH + 1200);
  if (iH < 0) fail('找不到一键部署 handler');
  else if (!/reason: 'no-dirs'/.test(seg)) fail('零目录时还在一遍空操作（界面看着像按钮坏了）');
  else if (!/scanSvScriptsDirs\(\)/.test(seg)) fail('零目录时没给自动检测结果');
  else ok('零目录 ⇒ 回报 no-dirs + 自动检测结果');
  if (/function svScriptsDirCandidates\(/.test(t) && /function scanSvScriptsDirs\(/.test(t)) ok('候选/扫描抽成函数（IPC、提醒、向导共用一份）');
  else fail('候选目录逻辑没有抽成函数（多处会漂移）');
}

console.log('\n== ④ 向导本体：三步 + 只复用既有 IPC ==');
{
  if (!wizard) fail('缺 electron/src/sv-setup.html');
  else {
    const steps = ['svSetup.step1', 'svSetup.step2', 'svSetup.step3'].every((k) => wizard.includes(k));
    if (steps) ok('三步都在（说明 / 挑目录 / 部署）');
    else fail('向导没有三步结构');
    for (const [what, re] of [
      ['自动检索目录', /svsetup\.scan\(/],
      ['列出目录并勾选', /type = 'checkbox'|type="checkbox"/],
      ['手动浏览加目录', /svsetup\.pick\(/],
      ['一键部署', /svsetup\.deployAll\(/],
      ['收尾提示（回宿主跑桥）', /svSetup\.doneHint/],
    ]) {
      if (re.test(wizard)) ok('向导包含：' + what);
      else fail('向导缺少：' + what);
    }
  }
  if (/scan:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('akdagent-sv-setup-scan'\)/.test(wizardPre)) ok('preload 的 scan 走新 IPC');
  else fail('preload 没接扫描 IPC');
  /* ⚠️ i18n 的 apply 必须**无参**调用（2026-09-27 真机翻车）：参数要跨 contextBridge，
   * DOM 节点序列化不过去 ⇒ preload 里 `scope.querySelectorAll is not a function` ⇒ 整页空白。 */
  if (/I\.apply\(\)/.test(wizard) && !/I\.apply\(\s*[A-Za-z]/.test(wizard)) ok('向导调 I.apply() 无参（DOM 节点跨不过 contextBridge）');
  else fail('向导给 I.apply 传了参数 ⇒ 文案会整页空白');
  if (/typeof root\.querySelectorAll === 'function' \? root : document/.test(wizardPre)) ok('preload 的 apply 有兜底（拿到非节点就退回 document）');
  else fail('preload 的 apply 没兜底 ⇒ 再有人传参数又是一片空白');
  for (const [what, re] of [
    ['addDir → 复用 akdagent-add-sv-scripts-dir', /ipcRenderer\.invoke\('akdagent-add-sv-scripts-dir'/],
    ['deployAll → 复用 akdagent-deploy-sv-bridge', /ipcRenderer\.invoke\('akdagent-deploy-sv-bridge'/],
    ['close → akdagent-sv-setup-close', /ipcRenderer\.send\('akdagent-sv-setup-close'\)/],
  ]) {
    if (re.test(wizardPre)) ok('preload ' + what);
    else fail('preload 缺：' + what);
  }
  if (/ipcMain\.handle\('akdagent-sv-setup-scan'/.test(t)) ok('主进程有扫描 IPC（带 kind/已装状态）');
  else fail('缺 akdagent-sv-setup-scan');
  if (/\[svSetupWin, 'svSetup'\]/.test(t)) ok('向导窗口在 i18nNamespaceOf 里登记（字典按窗口给）');
  else fail('向导窗口没登记 ⇒ i18n 会退化成 common，文案全成键名');
  const i18nIdx = readIf(path.join(I18N, 'index.js'));
  if (/'svSetup'/.test(i18nIdx) && /NAMESPACES = \[[\s\S]*?svSetup/.test(i18nIdx)) ok('i18n NAMESPACES 含 svSetup');
  else fail('i18n NAMESPACES 没有 svSetup ⇒ svSetup.json 不会被加载');
  const yml = readIf(path.join(ROOT, 'electron', 'electron-builder.yml'));
  if (/-\s*src\/\*\*\/\*/.test(yml)) ok('打包收录 src/**/*（新窗口会进安装包）');
  else fail('打包不收录 src/**/* ⇒ 装完打不开向导');
  if (/openSvSetup: \(\) => ipcRenderer\.send\('akdagent-open-sv-setup'\)/.test(readIf(path.join(SRC, 'settings-preload.js')))
    && /btn-sv-wizard/.test(st)) ok('设置页有「配置向导…」入口（不止启动那一次）');
  else fail('设置页没有重开向导的入口');
}

console.log('\n== ⑤ 设置页把结果讲清楚 ==');
{
  if (/r\.cancelled/.test(st) && /settings\.sv\.deployCancelled/.test(st)) ok('用户取消 ⇒ 显示"已取消"（不是红字失败）');
  else fail('取消会被显示成部署失败');
  if (/reason === 'no-dirs'/.test(st) && /settings\.sv\.noDirsDeployTip/.test(st)) ok('零目录 ⇒ 明确提示 + 列出自动检测的候选');
  else fail('零目录时界面没有专门提示');
  if (/settings\.sv\.noDirsCta/.test(st)) ok('目录列表为空时给出"下一步点哪"');
  else fail('空列表没告诉用户点哪里');
}

console.log('\n== ⑥ 文案四语齐全（缺一个就回退成中文/键名）==');
{
  const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
  const check = (file, keys) => {
    let j = null;
    try { j = JSON.parse(readIf(path.join(I18N, file))); } catch (e) { fail(file + ' JSON 非法/缺失：' + e.message); return; }
    if (keys === '*') {
      const n0 = Object.keys(j[LOCALES[0]] || {}).length;
      const bads = LOCALES.filter((l) => Object.keys(j[l] || {}).length !== n0 || n0 === 0);
      if (bads.length) fail(file + ' 各语种键数不一致/为空：' + LOCALES.map((l) => l + '=' + Object.keys(j[l] || {}).length).join(' '));
      else ok(file + '：' + n0 + ' 键 × ' + LOCALES.length + ' 语齐全');
      return;
    }
    for (const l of LOCALES) {
      const lack = keys.filter((k) => !j[l] || !j[l][k] || String(j[l][k]).trim() === '');
      if (lack.length) fail(file + ' / ' + l + ' 缺 ' + lack.join(', '));
    }
    ok(file + '：' + keys.length + ' 个键 × ' + LOCALES.length + ' 语齐全');
  };
  check('svSetup.json', '*');
  check('settings.json', ['settings.sv.deployCancelled', 'settings.sv.noDirsCta', 'settings.sv.noDirsDeployTip', 'settings.sv.noDirsFound', 'settings.sv.wizard']);
  check('common.json', ['main.deploy.panelConfirmTitle', 'main.deploy.panelConfirmMessage', 'main.deploy.panelConfirmDetail', 'main.deploy.panelConfirmOk', 'main.deploy.panelCancelled', 'main.deploy.kindUnknown']);
  // 已被向导取代的原生提示框文案：不许再留（死文案会让人以为还有那条路径）
  const cj = JSON.parse(readIf(path.join(I18N, 'common.json')));
  const leftover = LOCALES.flatMap((l) => Object.keys(cj[l] || {}).filter((k) => k.startsWith('main.sv.noDirNotice')));
  if (leftover.length) fail('还留着已废弃的原生提示框文案：' + leftover.join(', '));
  else ok('原生提示框文案已清干净（提醒只走向导）');
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格（SV 部署的护栏没立住）`); process.exit(1); }
console.log('✓ SV 部署护栏守卫通过');
