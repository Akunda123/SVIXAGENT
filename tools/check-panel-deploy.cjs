#!/usr/bin/env node
/**
 * 面板部署核查（2026-09-15 新增）
 *
 * 一条命令回答：「IX/SV 目录里的面板脚本是不是最新的？桥/面板现在到底在不在跑？」
 * 避免再用 PowerShell 内联 node（引号+中文会被吃坏，已踩过两次）。
 *
 * 用法：
 *   node tools/check-panel-deploy.cjs            # 查全部宿主
 *   node tools/check-panel-deploy.cjs ix         # 只查 IX
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// 面板真源：2026-09-15 起是 **JS 版**（`sv/panel/AKDAgentPanel.js`）。
//   历史：先 Lua 面板（无文件能力 ⇒ 当不了桥）→ 再"桥+UI 拼接"（已废弃）→ 再独立 Lua 面板（我两次写成 JS 注释崩）→ **现役 JS**。
const REPO_PANEL = path.join(ROOT, 'sv', 'panel', 'AKDAgentPanel.js');
const REPO_BRIDGE = path.join(ROOT, 'sv', 'lua', 'AKDAgentBridge.lua');
// 仓库桥的版本号：用来判「**宿主里正在跑的**桥是不是旧版」。
//   2026-09-20 真机踩坑：桥源码改到 0.3.18、**忘了部署 + 忘了重跑**，宿主里跑的还是 0.3.17，
//   于是所有"重跑后验收"全验的是旧代码（白跑一轮）。心跳里的 `bridge` 才是**内存中真正在跑**的版本。
const REPO_BRIDGE_VER = (fs.readFileSync(REPO_BRIDGE, 'utf8').match(/VERSION\s*=\s*"([\d.]+)"/) || [])[1];
const TMP = process.env.TEMP || os.tmpdir();
/** 硬问题（⇒ 退出码 1）：机器可判、必须处理，不能只打印一行警告就算过 */
const problems = [];

const only = (process.argv[2] || '').toLowerCase();

function md5(p) { try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').toUpperCase(); } catch { return null; } }

const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const HOSTS = [
  { id: 'ix', label: 'Instrument X', dir: path.join(appdata, 'Dreamtonics', 'Instrument X', 'scripts', 'Agent'), ipc: 'ix' },
  { id: 'sv2', label: 'SV Studio 2', dir: path.join(appdata, 'Dreamtonics', 'Synthesizer V Studio 2', 'scripts', 'Agent'), ipc: 'sv' },
  { id: 'sv1', label: 'SV Studio 1', dir: path.join(os.homedir(), 'Documents', 'Dreamtonics', 'Synthesizer V Studio', 'scripts', 'Agent'), ipc: 'sv' },
  { id: 'opsv', label: 'OPSV (Flat)', dir: path.join(os.homedir(), 'Documents', 'OPSV', 'Dreamtonics', 'Synthesizer V Studio', 'scripts', 'Agent'), ipc: 'sv' },
];

/** 面板脚本里必须存在的"最新特征"（JS 版） */
const FEATURES = [
  { key: 'akdagent.panel.bridgeAt', label: '桥状态显示' },
  { key: 'akdagent.panel.clientAt', label: '悬浮球状态显示' },
  { key: 'akdagent.panel.log', label: '读信息框（scriptData）' },
  { key: 'akdagent.panel.out', label: '写事件（scriptData）' },
  { key: 'SV.setTimeout(500, PANELUI.step)', label: '轮询循环' },
  { key: 'inputBusy', label: '打字时不重绘' },
  { key: "type: 'SidePanelSection'", label: '面板声明' },
];

function runningHosts() {
  let out = '';
  try {
    // ⚠️ 进程名不是 "Instrument X" 而是 **instx**、SV 是 **synthv-studio**（2026-09-15 实测踩坑：
    //    早先按 Instrument|Synthesizer 过滤 ⇒ 误报"宿主没运行"）。这里把已知名都列上。
    out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', windowsHide: true });
  } catch (e) {
    return ['（tasklist 执行失败：' + e.message + '）'];   // 不许静默吞掉：曾因此误判宿主未运行
  }
  const known = /^(instx|synthv-studio|synthesizer|instrument)/i;
  const hits = [];
  for (const line of out.split(/\r?\n/)) {
    const name = (line.split(',')[0] || '').replace(/"/g, '').replace(/\.exe$/i, '');
    if (known.test(name)) hits.push(name + (line.split(',')[1] ? '(' + line.split(',')[1].replace(/"/g, '') + ')' : ''));
  }
  return [...new Set(hits)];
}

const procs = runningHosts();
console.log('== 面板部署核查（' + new Date().toLocaleString('zh-CN', { hour12: false }) + '）==');
console.log('宿主进程：' + (procs.length ? procs.join(' · ') : '（没有 IX / SV 在运行）'));
console.log('');

for (const h of HOSTS) {
  if (only && only !== h.id) continue;
  console.log('── ' + h.label + '（' + h.dir.replace(appdata, '%APPDATA%').replace(os.homedir(), '~') + '）');
  if (!fs.existsSync(h.dir)) { console.log('   目录不存在 ⇒ 未部署\n'); continue; }
  const files = fs.readdirSync(h.dir).filter((f) => !f.includes('.bak'));
  console.log('   文件：' + (files.join(' · ') || '（空）'));

  // 面板脚本：比对 + 特征自检
  // 现役面板文件名是 .js（Lua 版已退役）；顺手提示是否残留退役文件
  const panel = path.join(h.dir, 'AKDAgentPanel.js');
  if (fs.existsSync(panel)) {
    const a = md5(REPO_PANEL), b = md5(panel);
    console.log('   面板 AKDAgentPanel.js ' + (b || '').slice(0, 8) + '（' + fs.statSync(panel).size + 'B）' +
      ' vs 仓库 ' + (a || '').slice(0, 8) + ' ⇒ ' + (a === b ? '✅ 最新' : '⚠️ 不一致，需重新部署（`node tools/build-panel-lua.cjs --deploy ' + h.id + '`）'));
    const s = fs.readFileSync(panel, 'utf8');
    const missing = FEATURES.filter((f) => !s.includes(f.key));
    console.log(missing.length ? '   ⚠️ 缺特征：' + missing.map((f) => f.label).join('、') : '   ✅ 最新特征齐全（' + FEATURES.length + ' 项）');
  } else if (h.id === 'sv2' || h.id === 'ix') {
    // SV2 / IX 才有侧栏面板 ⇒ 这两个宿主缺 JS 面板才算问题
    console.log('   面板 AKDAgentPanel.js：✗ 没有（这个宿主要侧栏面板，建议部署：`node tools/build-panel-lua.cjs --deploy ' + h.id + '`）');
  } else {
    /* ⛔ SV1 / OPSV 本来就不该有面板（2026-09-25 用户确认：面板误放到 SV1 **会**出问题）：
     *   它们没有侧栏、没有 project scriptData，而且 SV1 的脚本菜单会把 `scripts\Agent\` 里的 .js 也列出来
     *   ⇒ 多一个"点了就出事"的菜单项。所以这里**不是**"还没部署"，而是"按设计不部署"。 */
    console.log('   面板：— （按设计不部署：SV1 / OPSV 没有侧栏面板）');
  }
  if (fs.existsSync(path.join(h.dir, 'AKDAgentPanel.lua')) || fs.existsSync(path.join(h.dir, 'AKDAgentPanel.lua.retired'))) {
    console.log('   ⚠️ 目录里还有退役的 AKDAgentPanel.lua（会让侧栏出现第二个面板；跑 build-panel-lua.cjs --deploy 可自动挪走）')
  }
  // 纯桥（手动版）
  const bridge = path.join(h.dir, 'AKDAgentBridge.lua');
  if (fs.existsSync(bridge)) {
    const a = md5(REPO_BRIDGE), b = md5(bridge);
    const ver = (fs.readFileSync(bridge, 'utf8').match(/VERSION\s*=\s*"([\d.]+)"/) || [])[1];
    console.log('   桥 AKDAgentBridge.lua v' + ver + ' ⇒ ' + (a === b ? '✅ 与仓库一致' : '⚠️ 与仓库不同（可能故意留旧版）'));
  }
  // JS 面板残留（会造成"两个面板"）
  if (fs.existsSync(path.join(h.dir, 'AKDAgentSidePanel.js'))) console.log('   ⚠️ 还留着 JS 版面板 AKDAgentSidePanel.js（会出现两个「AKDAgent」面板）');

  // 运行时状态
  const hbFile = path.join(TMP, 'akdagent-hb-' + h.ipc + '.json');
  if (fs.existsSync(hbFile)) {
    const hb = JSON.parse(fs.readFileSync(hbFile, 'utf8'));
    const age = Math.floor(Date.now() / 1000) - hb.ts;
    const live = age <= 15;
    // ⛔ **正在跑的桥 ≠ 仓库版本** ⇒ 桥改了没部署 / 没重跑。
    //   心跳里的 `bridge` 来自内存中真正在跑的那份脚本，所以它才是"验的是什么代码"的唯一凭据。
    const staleLive = live && !!hb.bridge && !!REPO_BRIDGE_VER && hb.bridge !== REPO_BRIDGE_VER;
    console.log('   心跳：bridge=' + hb.bridge + ' panel=' + hb.panel + ' pollTicks=' + hb.pollTicks +
      ' · ' + age + 's 前 ' + (live ? '✅ 桥在跑' : '⚠️ 桥没在跑（宿主关了 / 脚本没加载）') +
      (staleLive ? ' ⛔ 跑的仍是 v' + hb.bridge + '（仓库已 v' + REPO_BRIDGE_VER + '）' : ''));
    if (staleLive) {
      problems.push(h.label + '：宿主里**正在跑**的桥是 v' + hb.bridge + '，仓库已是 v' + REPO_BRIDGE_VER +
        ' ⇒ 先部署（`sv\\install.ps1` 或设置页「一键部署」），**再在宿主里重跑桥**');
    }
  } else console.log('   心跳：无');
  const logFile = path.join(TMP, 'akdagent-panel-log-' + h.ipc + '.txt');
  console.log('   Lua 面板落盘：' + (fs.existsSync(logFile) ? '✅ 有（' + fs.statSync(logFile).size + 'B，改于 ' + fs.statSync(logFile).mtime.toLocaleTimeString('zh-CN', { hour12: false }) + '）' : '✗ 无（Lua 面板从未被加载）'));
  const outFile = path.join(TMP, 'akdagent-panel-' + h.ipc + '.jsonl');
  if (fs.existsSync(outFile)) {
    const lines = fs.readFileSync(outFile, 'utf8').split(/\r?\n/).filter(Boolean);
    console.log('   面板→客户端事件：' + lines.length + ' 条 · 改于 ' + fs.statSync(outFile).mtime.toLocaleTimeString('zh-CN', { hour12: false }));
  } else console.log('   面板→客户端事件：无');
  console.log('');
}

if (problems.length) {
  console.log('⛔ 硬问题 ' + problems.length + ' 项（退出码 1）—— 这些会让"验收"验到旧代码：');
  for (const p of problems) console.log('   · ' + p);
  console.log('');
  process.exitCode = 1;
} else {
  console.log('✅ 没有宿主在跑旧版桥（仓库 v' + REPO_BRIDGE_VER + '）');
  console.log('');
}
console.log('提示：面板脚本改动后**必须让宿主重新加载脚本**（重开侧栏 / 重启宿主）才生效；');
console.log('      桥（Lua）改动后**先部署到各宿主 scripts\\Agent\\，再在宿主里重跑桥** —— 常驻脚本不会热更。');
