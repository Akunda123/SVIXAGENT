#!/usr/bin/env node
/* 守卫：**ACE Studio 在线状态**这条线路（2026-10-03 立；用户「能检测 ace 是否开启吗」→「做进客户端状态显示」）
 *
 * 背景：ACE Studio 也是"能干活的目标"（4 个官方技能已随包，走它自己的 `acestudio-cli`），
 *   但它**不走我们的桥** —— 唯一前置条件是 **ACE 在跑 且 开了 External Agent Access**。
 *   客户端现在把这件事显示出来（设置页一行 + 悬浮球第二个点），本守卫钉住那条线路不被改坏。
 *
 * 判据（真机实测开/关两态；依据 `acestudio-cli help interaction-model`）：
 *   ① 桥握手文件 `%LOCALAPPDATA%\Timedomain\ACE Studio\mcp-bridge.json`（免费，强条件；崩溃可能残留）
 *   ② CLI 探针 `acestudio-cli project info --json`（exit 0 = 在线；exit 3 = 桥不可达；~61ms）
 *   ③ **故意不用进程名**：只说明 app 开着，不说明开关开着
 *
 * 本守卫检查六件事：
 *   A 探测器：快判/合判两个纯函数在；CLI 候选**不写死绝对路径**且有环境变量口子；探针**只在状态变化/用户点按钮**时跑
 *     （不许挂进 5s 轮询）；**只读**（不许写 ACE 目录下的任何文件）
 *   B **第三套皮肤**（像 IX 那样：标记 + hover 文字图 + 主题色 + 标题）；⚠️ 用户否掉的"球上第二个点"不许回来
 *   C 设置页：`ace-row`/`btn-check-ace` **默认隐藏**、按 installed 显示；preload 三个 API 都在
 *   D i18n：`settings.status.ace*`（7 键）四语齐全；被否掉的 `orb.ace.*` 不许残留
 *   E 行为：把 computeAceQuick/computeAcePill 抠出来真跑 7 种场景（没装/离线/待复核/在线/可疑/无 CLI）
 *   F 行为：require 真模块跑 `pickHostType` 阶梯（**保守档**：ACE 绝不遮住桥活着的 SV/IX）
 *
 * 用法：node tools/check-ace-status.cjs [--main <main.js>] [--orb <orb.html>] [--settings <settings.html>] [--preload <settings-preload.js>]
 *   （参数用于**反向验证**：指向改坏/修复前的副本，守卫应 FAIL）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const pick = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : path.join(ROOT, dflt);
};
const MAIN = pick('--main', 'electron/src/main.js');
const ORB = pick('--orb', 'electron/src/orb.html');
const SETTINGS = pick('--settings', 'electron/src/settings.html');
const PRELOAD = pick('--preload', 'electron/src/settings-preload.js');
const I18N = path.join(ROOT, 'electron', 'src', 'i18n');

let bad = 0;
const ok = (c, m, extra) => {
  console.log((c ? '  [ok]   ' : '  [FAIL] ') + m + (extra && !c ? '  ← ' + extra : ''));
  if (!c) bad += 1;
};
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

const main = read(MAIN);
const orb = read(ORB);
const settings = read(SETTINGS);
const preload = read(PRELOAD);
for (const [p, t, n] of [[MAIN, main, 'main.js'], [ORB, orb, 'orb.html'], [SETTINGS, settings, 'settings.html'], [PRELOAD, preload, 'settings-preload.js']]) {
  if (!t) { console.log('  [FAIL] 读不到 ' + p); bad += 1; }
}
if (!main) process.exit(1);

/* ⚠️ 负向断言要跑在**去注释**后的代码上：我们的注释里就写着"不许写 ACE 文件""探针不许进轮询"之类的字句，
 *   不剥注释会被自己的说明骗过（这个坑在 check-dsh-separation 里踩过一次）。 */
const stripJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const mainCode = stripJs(main);

console.log('== A. 探测器（main.js）==');
{
  ok(/const ACE_BRIDGE_JSON = path\.join\(/.test(main) && /Timedomain/.test(main) && /mcp-bridge\.json/.test(main),
    '桥握手文件路径按 LOCALAPPDATA 拼（%LOCALAPPDATA%\\Timedomain\\ACE Studio\\mcp-bridge.json）');
  ok(/process\.env\.LOCALAPPDATA/.test(mainCode), '用 process.env.LOCALAPPDATA，不写死用户目录');
  ok(/function computeAceQuick\(/.test(mainCode) && /function computeAcePill\(/.test(mainCode),
    '两个纯函数都在（computeAceQuick / computeAcePill —— 便于单测与抠出来真跑）');

  // CLI 候选：三个系统目录 + 环境变量口子；且不许出现写死的 "C:\\...\\acestudio-cli.exe"
  ok(/process\.env\.AKDAGENT_ACE_CLI/.test(mainCode), 'CLI 路径有环境变量口子（AKDAGENT_ACE_CLI，测试/自定义安装）');
  const bases = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']
    .filter((k) => new RegExp('process\\.env(?:\\[|\\.)[\'"]?' + k.replace(/[()]/g, '\\$&')).test(mainCode));
  ok(bases.length >= 3, 'CLI 候选覆盖三个系统目录（实际命中：' + bases.join(', ') + '）');
  ok(!/['"][A-Za-z]:[\\/][^'"]*acestudio-cli\.exe['"]/.test(mainCode), '没有写死某个盘符下的 acestudio-cli.exe');

  // 探针：异步 + 超时 + 只问 project info
  ok(/spawn\(cli, \['project', 'info', '--json'\]/.test(mainCode), '探针只跑 `acestudio-cli project info --json`');
  ok(/ACE_PROBE_TIMEOUT_MS/.test(mainCode) && /setTimeout\(/.test(mainCode), '探针带超时（不吊死主进程）');
  ok(/child\.on\('close'/.test(mainCode) || /on\('close'/.test(mainCode), '用 close 事件取 exit code（异步，不阻塞）');
  ok(!/execFileSync|spawnSync\(cli/.test(mainCode), '探针不是同步调用（不许卡住主进程/UI）');
  ok(/on\('error'/.test(mainCode), 'spawn 失败也收口（-> 判成不可达，不是崩）');

  /* 探针**不许**挂进 5s 轮询：只允许由"快判变化"或 IPC（用户点按钮）触发。
   * ⚠️ 这条断言被反向验证抓过两次：① `setInterval\([^)]*probeAceCliDeep` 被箭头函数的 `)` 骗过；
   * ② 换成 `[\s\S]{0,400}?` 又被 `() => { …() },` 这种"括号里还有括号"骗过。
   * ⇒ 现在对每个 `setInterval(` 做**括号配平**取第一个实参，再看里面有没有探针。 */
  function intervalArgsWith(src, needle) {
    const hits = [];
    const re = /setInterval\(/g;
    let m;
    while ((m = re.exec(src))) {
      let i = m.index + m[0].length;
      const start = i;
      let depth = 1;
      for (; i < src.length && depth > 0; i++) {
        const ch = src[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
      }
      const arg = src.slice(start, i - 1);
      if (arg.includes(needle)) hits.push(arg.replace(/\s+/g, ' ').slice(0, 120));
    }
    return hits;
  }
  const pollProbe = intervalArgsWith(mainCode, 'probeAceCliDeep');
  ok(!pollProbe.length, 'CLI 探针没有被挂进定时轮询（只在状态变化 / 用户点按钮时跑）', pollProbe.join(' | '));
  ok(/if \(quick\.hasBridgeFile && !aceProbeRunning\) probeAceCliDeep\(\)/.test(mainCode),
    '快判"桥文件刚出现"时才触发一次深探');
  ok(/applyAceState\(/.test(mainCode) && /function refreshBridgePill\(/.test(mainCode)
    && /try \{ aceChanged = applyAceState\(/.test(mainCode),
    '5s 那一拍只做免费快判（applyAceState 在 refreshBridgePill 里）');
  ok(/ipcMain\.on\('akdagent-check-ace'/.test(mainCode), '用户点按钮的 IPC（akdagent-check-ace）→ 触发一次真探针');

  /* 只读：写操作的目标里不许出现 ACE 的目录/文件 */
  const writeTargets = [...mainCode.matchAll(/(?:writeFileAtomic|writeFileSync|mkdirSync|rmSync|copyFileSync)\(\s*([^,)\n]+)/g)].map((m) => m[1]);
  const badTargets = writeTargets.filter((a) => /ACE_BRIDGE_JSON|ACE_HOME_DIR|ACE_LOCAL_DIR|Timedomain/.test(a));
  ok(!badTargets.length, '对 ACE 那套**只读**（扫了 ' + writeTargets.length + ' 个写/建/删点，无一指向 ACE）', badTargets.join(' | '));
}

console.log('\n== B. 第三套皮肤（像 IX 那样的宿主皮肤；**不是**第二个点）==');
{
  /* ⚠️ 用户 2026-10-03 明确否掉了"球上第二个点"，改成第三套宿主皮肤（含 hover 文字图）。
   *   所以这里有一条**负向断言**：`ace-dot`/`orbAce` 不许回来。 */
  ok(!/ace-dot|orbAce/.test(orb), '球上没有"第二个点"（用户否掉的方案；不许回来）');

  /* 素材：**用户自绘**（2026-10-03 用户：「我自己画 svg」）⇒ 这里只查**结构契约**，
     ⚠️ 不锁死画法/配色/是否含 keyframes（否则用户换一版图就把守卫弄红，等于逼人改守卫）。 */
  const assets = ['ace-mark-anim.svg', 'aceagent-text.svg'];
  for (const a of assets) {
    const p = path.join(ROOT, 'electron', 'src', a);
    const t = read(p);
    const exists = fs.existsSync(p);
    ok(exists && fs.statSync(p).size > 200, '皮肤素材在仓里：electron/src/' + a);
    if (!t) continue;
    ok((t.match(/<svg\b/g) || []).length === 1 && /<\/svg>/.test(t), a + '：单个 <svg> 根元素');
    ok(/viewBox="0 0 [\d.]+ [\d.]+"/.test(t), a + '：有 viewBox（宽高比决定显示尺寸）');
    ok(/<(path|g|text|circle|rect|polygon)\b/.test(t), a + '：有实际图形元素');
    /* ⚠️ 2026-10-03 自己踩的：XML 注释里写了 `--theme` ⇒ 连续两个连字符 = **XML 非法** ⇒
     * Chromium 整份 SVG 解析失败、图是**空的**（而 node/我们的结构检查都看不出来）。
     * 这里按 XML 规范查：注释内部不许出现 `--`，也不许以 `-` 结尾。 */
    const cmts = [...t.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
    const badCmts = cmts.filter((c) => c.includes('--') || c.trimEnd().endsWith('-'));
    ok(!badCmts.length, a + '：XML 注释里没有非法的连续连字符（否则整份图解析失败、显示空白）',
      badCmts.map((c) => JSON.stringify(c.slice(0, 40))).join(' | '));
    /* 标签配平（只查这几个常见容器，够抓住"手改坏掉"） */
    for (const tag of ['svg', 'g', 'style', 'defs']) {
      const open = (t.match(new RegExp('<' + tag + '\\b', 'g')) || []).length;
      const close = (t.match(new RegExp('</' + tag + '>', 'g')) || []).length;
      const selfClose = tag === 'svg' ? 0 : 0;
      if (open > 1 || close > 0) ok(open === close + selfClose, a + '：<' + tag + '> 开闭配平（' + open + '/' + close + '）');
    }
  }
  const markT = read(path.join(ROOT, 'electron', 'src', 'ace-mark-anim.svg'));
  const labelT = read(path.join(ROOT, 'electron', 'src', 'aceagent-text.svg'));
  /* 紫系/蓝系：**主题色来自 ACE 界面截图采样 = #0044FF**（用户 2026-10-03「适配 ace ui 颜色风格」）；
     而用户自绘的两份素材里用的是 #9087f6（他自己定的，不动）。这里两者都记着，谁改都会红。 */
  ok(/--theme: #0044FF/i.test(orb), 'ACE 主题色 = ACE 界面的强调蓝 #0044FF（从截图采样：和声 chip / 播放头）');
  ok(/--theme-rgb: 0,68,255/.test(orb), '主题 RGB 与主题一致（--theme-rgb 0,68,255）');
  ok(/--theme-btn-fg: #ffffff/.test(orb), '蓝底上用白字（--theme-btn-fg #ffffff）');
  /* ⚠️ 状态点必须是**绿**（用户 2026-10-03：「检测到 ace 在线应该变绿」）——
     绿点语义 = 在线/可用，不能被品牌色顶掉（我第一版写成 --dot: #0044FF，是错的）。 */
  ok(/--dot: #3ddc84/i.test(orb), '状态点用绿 #3ddc84（在线语义，不跟品牌色走）');
  ok(/#9087f6/i.test(markT) || /#9087f6/i.test(labelT),
    '用户自绘素材里保留他定的紫 #9087f6（与主题蓝是两层：主题=ACE 界面色，素材=他画的）');
  /* 球是 56px、mark 按 32px 显示 ⇒ 太扁/太长的 viewBox 会被压得很小，提醒一句 */
  const vb = (markT.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || []);
  if (vb[1] && vb[2]) {
    const ratio = Number(vb[1]) / Number(vb[2]);
    ok(ratio > 0.6 && ratio < 1.7, 'orb 标记的宽高比接近正方形（实际 ' + ratio.toFixed(2) + '；56px 球里按 36px 宽显示）');
  }
  const lb = (labelT.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || []);
  if (lb[1] && lb[2]) {
    ok(Number(lb[2]) === 100 || Number(lb[2]) === 100.69 || Math.abs(Number(lb[2]) / Number(lb[1]) - 0.21) < 0.12,
      'hover 文字图的高度量级与 SV/IX 那份相当（它按 height:14px 显示，宽度自适应）');
  }

  ok(/body\[data-host="ace-studio"\]/.test(orb), 'orb.html 有第三套主题变量（body[data-host="ace-studio"]）');
  ok(/const ACE_LOGO = 'ace-mark-anim\.svg'/.test(orb) && /const ACE_TEXT = 'aceagent-text\.svg'/.test(orb),
    'orb.html 认这两份素材');
  ok(/const isAce = type === 'ace-studio'/.test(orb), 'onHostType 里有第三分支（ace-studio）');
  ok(/'ACE Studio {2}AI Agent'/.test(orb), '面板标题切成「ACE Studio  AI Agent」');
  ok(/logo\.style\.width = isAce \? '44px'/.test(orb), 'ACE 标记 44px（用户 2026-10-03「图标再大点」：36→44；46 会顶到圈边）');
  /* 动画：与 sv-monogram-anim / instrumentx-mark-anim **同款**（用户 2026-10-03：「动画也和 sv 一样」）
     = 逐条「描边描出 → 填充」：每条一个 @keyframes，0% 用 stroke-dasharray/dashoffset 起笔、50% 填色。
     ⚠️ dasharray 必须是**量出来的真实路径长**（不够 ⇒ 画成虚线；太长 ⇒ 前段动画被吃掉）⇒ 这里只查量级。 */
  const dash = [...markT.matchAll(/stroke-dasharray:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  ok(dash.length === 3 && dash.every((n) => n > 100), 'SV 同款动画：三条路径各带 stroke-dasharray（' + dash.join('/') + '）');
  const delays = [...markT.matchAll(/animation:\s*ace\d\s+1s\s+ease-in\s+([\d.]+)s/g)].map((m) => Number(m[1]));
  ok(delays.length === 3, '三条动画逐条错开延迟（' + delays.join('/') + ' s；SV/IX 用的是 6/13/20ms）');
  ok((markT.match(/stroke-dashoffset/g) || []).length >= 3 && (markT.match(/@keyframes/g) || []).length >= 3,
    '描边→填充的关键帧齐（@keyframes ≥3 且都动 dashoffset）');
  ok(/#9087f6/i.test(markT) && /fill:\s*#fff/i.test(markT),
    '颜色按用户口径：a = #9087f6（描边+填充），c/e = 白填充');
  /* ⚠️ 2026-10-03 踩过的坑：**颜色只写在 keyframes 里** ⇒ 动画处在延迟期 / 没跑到终态 / 被降级时，
   *   元素掉回**默认黑**（现象：标签上"字母少了 / 发黑"，排查半天）。SV/IX 那两份都是**类上带基色**。 */
  ok(/\.ace-a \{ fill: #9087f6; stroke: #9087f6;/.test(markT) && /\.ace-rest \{ fill: #fff; stroke: #fff;/.test(markT),
    '标记：a / 其余字母的**基色写在类上**（不能只靠 keyframes）');
  ok(/\.ace-violet \{ fill: #9087f6; stroke: #9087f6; \}/.test(labelT) && /\.ace-white \{ fill: #fff; stroke: #fff; \}/.test(labelT),
    '文字图：紫 / 白两类的基色也写在类上');
  /* 文字图 = "ACE AI Agent" 10 个字，逐字描边动画（与 SV/IX 的"逐字延迟"同款） */
  const lDash = [...labelT.matchAll(/stroke-dasharray:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  ok(lDash.length === 10, '文字图逐字描边动画（10 条 dasharray；实测长度 '
    + (lDash.length ? Math.min(...lDash) + '~' + Math.max(...lDash) : '—') + '）');
  const lDelay = [...labelT.matchAll(/animation:\s*acet\d\s+1s\s+ease-in\s+([\d.]+)s/g)].map((m) => Number(m[1]));
  ok(lDelay.length === 10, '文字图逐字错开延迟（' + lDelay.length + ' 条，' + (lDelay[0] ?? '—') + 's 起每字 +7ms）');

  const hp = read(path.join(ROOT, 'electron', 'src', 'host-pick.js'));
  ok(/const ACE_HOST_TYPE = 'ace-studio'/.test(hp), 'host-pick 里 ACE_HOST_TYPE = ace-studio');
  ok(/function pickHostType \(/.test(hp), '皮肤判据是独立纯函数 pickHostType（可单测）');
  ok(!/HOSTS = \['sv', 'ix', 'ace'\]/.test(hp), 'ACE 不在 HOSTS 里（它不是桥宿主，不该被 pickActiveHost 选中）');
  ok(/if \(s\.aceOnline\) return ACE_HOST_TYPE/.test(hp) && /for \(const h of HOSTS\) if \(fresh\[h\]\) return HOST_TYPE\[h\]/.test(hp),
    '保守阶梯：先看活动 → 再看 SV/IX 桥 → **最后**才 ACE（绝不遮住能干活的目标）');
  ok(/pickHostType, ACE_HOST_TYPE/.test(main) || /pickHostType/.test(main),
    'main.js 用 pickHostType 决定皮肤');
  ok(/aceOnline: acePill\.level === 'ok'/.test(main), 'ACE 皮肤只在**在线**时才可能上（没装/没开 ⇒ 永不出现）');
  ok(/const type = decided === ACE_HOST_TYPE \? decided : await querySvHostType/.test(main),
    '判成 ACE 时**不走 ping**（它没有我们的桥）；其余仍按老路真 ping');
  ok(/refreshOrbHostType\(\)\.catch/.test(mainCode), 'ACE 状态一变就异步刷皮肤（切上/退回去）');
}

console.log('\n== C. 设置页（一行 + 一个按钮）==');
{
  ok(/id="ace-row"[^>]*style="display:none"/.test(settings), 'ACE 行**默认隐藏**（没装的机器不占位）');
  ok(/id="btn-check-ace"[^>]*style="display:none"/.test(settings), '「检查 ACE 连接」按钮同样默认隐藏');
  ok(/\$\('ace-row'\)\.style\.display = installed \? '' : 'none'/.test(settings)
    && /\$\('btn-check-ace'\)\.style\.display = installed \? '' : 'none'/.test(settings),
    '按主进程回的 installed 决定显示/隐藏');
  ok(/function renderAceStatus\(st\)/.test(settings), '有渲染函数 renderAceStatus');
  ok(/svsettings\.getAceStatus\(\)/.test(settings) && /svsettings\.checkAce\(\)/.test(settings)
    && /svsettings\.onAceStatus\(/.test(settings),
    '页面用齐三个 API（拉一次 / 按钮触发 / 听推送）');
  ok(/getAceStatus: \(\) => ipcRenderer\.invoke\('akdagent-ace-status'\)/.test(preload),
    'preload: getAceStatus → invoke akdagent-ace-status');
  ok(/checkAce: \(\) => ipcRenderer\.send\('akdagent-check-ace'\)/.test(preload), 'preload: checkAce → send akdagent-check-ace');
  ok(/onAceStatus: \(cb\) => ipcRenderer\.on\('akdagent-ace-status-push'/.test(preload), 'preload: onAceStatus ← akdagent-ace-status-push');
}

console.log('\n== D. i18n（四语齐全）==');
{
  const locales = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
  const load = (f) => { try { return JSON.parse(fs.readFileSync(path.join(I18N, f), 'utf8')); } catch { return null; } };
  const setJson = load('settings.json');
  const needSet = ['settings.status.ace', 'settings.status.aceHint', 'settings.status.aceOnline',
    'settings.status.aceOffline', 'settings.status.aceUnverified', 'settings.status.aceSuspect',
    'settings.status.checkAce'];
  if (!setJson) ok(false, '读不到 settings.json');
  else {
    const miss = [];
    for (const loc of locales) for (const k of needSet) if (!setJson[loc] || !setJson[loc][k]) miss.push(loc + ':' + k);
    ok(!miss.length, 'settings.json：' + needSet.length + ' 个键 × 4 语齐全', miss.join(', '));
  }
  /* ACE 皮肤激活时球的状态灯走 **ACE 自己的在线判据**（ACE 没有桥/心跳）：
     用户 2026-10-03：「检测到 ace 在线应该变绿」。 */
  ok(/if \(lastOrbHostType === ACE_HOST_TYPE\) \{/.test(mainCode)
    && /acePill\.level === 'ok'\s*\?\s*\{ level: 'ok', code: 'orb\.ace\.online'/.test(mainCode),
    'ACE 皮肤激活时：ACE 在线 ⇒ 绿灯 orb.ace.online（不走桥的三态）');
  /* 悬浮球那一路**需要**这两个键（之前的 orb.ace.* 是给被否掉的"第二个点"用的，已删；这两个是灯文案） */
  const orbJson = JSON.parse(read(path.join(I18N, 'orb.json')) || '{}');
  const aceKeys = Object.keys((orbJson['zh-Hans'] || {})).filter((k) => k.startsWith('orb.ace.')).sort();
  ok(aceKeys.join(',') === 'orb.ace.offline,orb.ace.online',
    'orb.json 里只有这两个 orb.ace.* 键（灯文案）：' + aceKeys.join(', '));
  for (const loc of ['zh-Hans', 'zh-Hant', 'en', 'ja']) {
    ok(orbJson[loc] && orbJson[loc]['orb.ace.online'] && orbJson[loc]['orb.ace.offline'],
      loc + '：orb.ace.online / orb.ace.offline 都在');
  }
}

console.log('\n== E. 行为：ACE 快判/合判（抠出来真跑）==');
{
  const quickSrc = (main.match(/function computeAceQuick\([\s\S]*?\n\}/) || [])[0];
  const pillSrc = (main.match(/function computeAcePill\([\s\S]*?\n\}/) || [])[0];
  if (!quickSrc || !pillSrc) {
    ok(false, '抠不出 computeAceQuick/computeAcePill（改名了？判据要重新确认）');
  } else {
    // eslint-disable-next-line no-new-func
    const api = new Function(quickSrc + '\n' + pillSrc + '\nreturn { computeAceQuick, computeAcePill };')();
    const cases = [
      ['没装 ACE ⇒ 不显示（level=null，用户口径：整行/整个点隐藏）',
        api.computeAceQuick(false, false), null, null],
      ['装了但 ACE 没开（无桥文件）⇒ 离线',
        api.computeAceQuick(true, false), 'down', 'orb.ace.offline'],
      ['桥文件在、还没复核 ⇒ 待确认',
        api.computeAceQuick(true, true), 'warn', 'orb.ace.unverified'],
      ['桥文件在 + 探针 exit 0 ⇒ 在线',
        api.computeAceQuick(true, true), 'ok', 'orb.ace.online'],
      ['桥文件在 + 探针 exit 3 ⇒ 可疑（崩溃残留）',
        api.computeAceQuick(true, true), 'warn', 'orb.ace.suspect'],
    ];
    for (const [label, quick, wantLevel, wantCode] of cases) {
      const deep = label.includes('exit 0') ? { code: 0 } : (label.includes('exit 3') ? { code: 3 } : null);
      const got = api.computeAcePill(quick, deep);
      const pass = got.level === wantLevel && (wantLevel === null ? got.code === null : got.code === wantCode);
      ok(pass, label + '（实际 level=' + JSON.stringify(got.level) + ' code=' + JSON.stringify(got.code) + '）');
    }
    /* 只有桥文件、没有 CLI（自定义安装/只要文件判定）也要算"装了"，并直接判在线（否则永远"检测中"） */
    const onlyFile = api.computeAceQuick(false, true);
    ok(onlyFile.installed === true, '只有桥文件、找不到 CLI 时仍算"装了"（仍显示状态）');
    const noCli = api.computeAcePill(onlyFile, null);
    ok(noCli.level === 'ok' && noCli.code === 'orb.ace.online',
      '找不到 CLI 可探时以桥文件为准判在线（不会永远停在"检测中"）',
      JSON.stringify(noCli));
  }
}

console.log('\n== F. 行为：皮肤阶梯 pickHostType（直接 require 真模块）==');
{
  let hp = null;
  try { hp = require(path.join(ROOT, 'electron', 'src', 'host-pick.js')); } catch (e) { ok(false, 'require host-pick 失败：' + e.message); }
  if (hp) {
    const P = hp.pickHostType;
    ok(typeof P === 'function', 'pickHostType 导出了');
    const cases = [
      ['① 有活动 ⇒ 那台（ace 让位）', { activity: { ix: 5000 }, aceOnline: true }, 'instrument-x'],
      ['② 没活动、ix 桥活着 ⇒ ix（ace 让位）', { fresh: { ix: true }, aceOnline: true }, 'instrument-x'],
      ['② 没活动、sv 桥活着 ⇒ sv（ace 让位）', { fresh: { sv: true }, aceOnline: true }, 'sv'],
      ['③ 都没活动没桥 + ACE 在线 ⇒ **第三套 ACE 皮肤**', { aceOnline: true }, 'ace-studio'],
      ['④ ACE 不在 ⇒ 退回 sv（这套皮肤等于不存在）', { aceOnline: false }, 'sv'],
      ['④ 什么都没传 ⇒ sv（不切皮肤）', {}, 'sv'],
    ];
    for (const [label, input, want] of cases) {
      let got = null;
      try { got = P(input); } catch (e) { got = 'threw: ' + e.message; }
      ok(got === want, label + '（实际 ' + JSON.stringify(got) + '）');
    }
    /* 关键负向判据：ACE **永远不能**盖住一台桥活着的宿主 —— 这是用户选的"保守档"的核心 */
    const shadow = [['sv', true], ['ix', true]].some(([h]) => P({ fresh: { [h]: true }, aceOnline: true }) === 'ace-studio');
    ok(!shadow, '保守档成立：SV/IX 任何一台桥活着时，ACE 皮肤都不会抢（绝不遮住能干活的目标）');
  }
}

console.log('');
if (bad) { console.log(`[FAIL] ${bad} 项不通过 —— ACE 状态那条线路有问题`); process.exit(1); }
console.log('✅ ACE 线路完整：桥文件快判 + CLI 深探（只在变化/点按钮时）+ **第三套皮肤**（用户自绘素材，保守档不抢 SV/IX）'
  + ' + 设置页一行（没装则隐藏）+ 四语文案');
