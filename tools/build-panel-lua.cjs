#!/usr/bin/env node
/**
 * 面板脚本部署（2026-09-15 定稿）
 *
 * 现役面板真源 = **JS 版**：`sv/panel/AKDAgentPanel.js`
 *
 * 为什么是 JS（一路踩出来的结论，别再回头）：
 *   ① 面板沙箱**没有文件能力**（Lua 面板里 `io` 表在但 `io.open` 返回 nil）⇒ Lua 唯一优势为零；
 *   ② 官方只文档化 JS 的 SidePanelSection；用户机器上所有侧栏脚本都是 JS；
 *   ③ 我两次在 Lua 里写成 JS 式 `/** *\/` 注释 ⇒ 面板一打开就弹框崩。
 *   ⇒ **面板 = JS（界面 + scriptData + 定时器）；桥 = Lua（io + 文件 + 中继）。**
 *
 * ⚠️ 血泪：本工具曾把 **JS 源码写成 `AKDAgentPanel.lua`**（文件名与内容不符 ⇒ 宿主当 Lua 解析 ⇒ 打开就报错）。
 *   ⇒ 部署必须用 `DEST_NAME`（.js），并**主动清掉**同目录下退役的 `AKDAgentPanel.lua`。
 *
 * 用法：
 *   node tools/build-panel-lua.cjs --check        # 校验面板真源与特征
 *   node tools/build-panel-lua.cjs --deploy ix    # 部署到 IX（旧文件自动备份；顺手清退役 Lua 面板）
 *   node tools/build-panel-lua.cjs --deploy sv2|sv1|opsv
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PANEL = path.join(ROOT, 'sv', 'panel', 'AKDAgentPanel.js');
const DEST_NAME = 'AKDAgentPanel.js';

const argv = process.argv.slice(2);
const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const FLAG = (n) => argv.includes(n);

const FEATURES = [
  { key: 'akdagent.panel.log', label: '读信息框（scriptData）' },
  { key: 'akdagent.panel.out', label: '写事件（scriptData）' },
  { key: 'akdagent.panel.ready', label: '挂载自报' },
  { key: 'PANELUI.sid', label: '会话 id（去重用）' },
  { key: 'akdagent.panel.bridgeAt', label: '读桥状态' },
  { key: 'akdagent.panel.clientAt', label: '读悬浮球状态' },
  { key: "type: 'SidePanelSection'", label: '面板声明' },
  { key: 'SV.setTimeout(500, PANELUI.step)', label: '轮询循环' },
  { key: 'inputBusy', label: '打字时不重绘' },
];

function deployPaths(host) {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const map = {
    ix: path.join(appdata, 'Dreamtonics', 'Instrument X', 'scripts', 'Agent'),
    sv2: path.join(appdata, 'Dreamtonics', 'Synthesizer V Studio 2', 'scripts', 'Agent'),
    sv1: path.join(os.homedir(), 'Documents', 'Dreamtonics', 'Synthesizer V Studio', 'scripts', 'Agent'),
    opsv: path.join(os.homedir(), 'Documents', 'OPSV', 'Dreamtonics', 'Synthesizer V Studio', 'scripts', 'Agent'),
  };
  return map[String(host || '').toLowerCase()] || null;
}

if (!fs.existsSync(PANEL)) { console.error('❌ 找不到面板真源：' + PANEL); process.exit(2); }
const src = fs.readFileSync(PANEL, 'utf8');
const missing = FEATURES.filter((f) => !src.includes(f.key));

if (!FLAG('--deploy')) {
  console.log('面板真源：' + PANEL + '（' + (src.length / 1024).toFixed(1) + ' KB · 目标文件名 ' + DEST_NAME + '）');
  console.log(missing.length ? '⚠️ 缺特征：' + missing.map((f) => f.label).join('、') : '✅ 特征齐全（' + FEATURES.length + ' 项）');
  if (missing.length && FLAG('--check')) process.exit(1);
}

const host = OPT('--deploy');
if (host) {
  const dir = deployPaths(host);
  if (!dir) { console.error('❌ 未知宿主：' + host + '（可选 ix / sv2 / sv1 / opsv）'); process.exit(2); }
  if (!fs.existsSync(dir)) { console.error('❌ 目录不存在：' + dir); process.exit(2); }

  // 1) 先清掉退役的 Lua 面板（同名不同扩展名；留着会出现第二个面板，或内容不符导致报错）
  for (const name of ['AKDAgentPanel.lua']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      fs.renameSync(p, p + '.retired-' + Date.now().toString().slice(-4));
      console.log('   已退役旧文件 → ' + name + '.retired-*');
    }
  }

  // 2) 部署 JS 面板（备份同名文件）
  const dest = path.join(dir, DEST_NAME);
  if (fs.existsSync(dest)) {
    const bak = dest + '.bak-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Date.now().toString().slice(-4);
    fs.copyFileSync(dest, bak);
    console.log('   旧文件已备份 → ' + path.basename(bak));
  }
  fs.copyFileSync(PANEL, dest);
  console.log('✅ 已部署（JS 面板）→ ' + dest);
  console.log('   ⚠️ 面板改动要**宿主重新加载脚本**才生效（重开侧栏 / 重启宿主）');
  console.log('   ⚠️ 桥（AKDAgentBridge.lua）**仍需手动运行一次** —— 面板没有文件能力，起不了桥');
}
