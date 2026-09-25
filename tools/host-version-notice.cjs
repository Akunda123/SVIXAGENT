#!/usr/bin/env node
/**
 * 宿主升级提示判定（2026-09-14 新增）—— **纯离线**，只读本地文件，不出网、不碰桥逻辑
 *
 * 依据用户 2026-09-14 定案的分发政策：
 *   「更新就重新分发安装包，不走 github，**不自动检测**，api 更新随最新版本记录走，
 *     **用户装了新版 sv/ix 检测一次**，自行更新」
 *  ⇒ 客户端**不联网查更新**；但用户升级宿主后，要做**一次离线比对**，告诉他：
 *     「本安装包的 API 基线是 X，你现在的宿主是 Y ⇒ 包内知识可能过期，建议下载最新安装包」。
 *
 * 基线来源：`skills/sv-scripting/api/_sync.json` 的 `hostVersions`（由开发侧 `--record-host` 维护，发包时记录）。
 * 当前版本：桥心跳文件（`%TEMP%\akdagent-hb-<host>.json`，只读文件，不发送任何请求）。
 *
 * 用法：
 *   node tools/host-version-notice.cjs          # 人读
 *   node tools/host-version-notice.cjs --json   # 机器可读（Electron 主进程解析）
 *   node tools/host-version-notice.cjs --state <path>   # 附带"已提示过"的记录文件（主进程用它去重）
 */
const path = require('path');
const HV = require('./lib-host-version.cjs');

const ROOT = path.join(__dirname, '..');
// 允许自测时指到别的基线文件（只读；正式运行不设此变量）
const SYNC = process.env.AKDAGENT_SYNC || path.join(ROOT, 'skills', 'sv-scripting', 'api', '_sync.json');
const JSON_OUT = process.argv.includes('--json');

// 解析 / 变体判定统一走 `tools/lib-host-version.cjs`
// （写侧 `api-docs-sync.cjs --record-host` 用的是同一份规则 —— 别在这里再抄一份，两份必漂）
const latestHostVersions = () => HV.latestHostVersions(SYNC);

function readHeartbeats() {
  const out = {};
  try {
    const ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'));
    for (const h of ['sv', 'ix']) {
      const hb = ipc.readHeartbeat(h);
      if (!hb) continue;
      let ageSec = null;
      try { ageSec = Math.round(ipc.heartbeatAgeSec(h)); } catch { /* 老版本无此函数 */ }
      out[h] = { hostName: hb.hostName, version: hb.version, versionNumber: hb.hostVersionNumber, bridgeVersion: hb.bridgeVersion, ageSec };
    }
  } catch (e) { out._err = e.message; }
  return out;
}

const cmpSemver = HV.cmpSemver;
const variantOf = HV.variantOf;

function evaluate() {
  const base = latestHostVersions();
  const hb = readHeartbeats();
  const notices = [];
  const checked = {};
  for (const ch of ['sv', 'ix']) {
    const h = hb[ch];
    if (!h) { checked[ch] = { online: false }; continue; }
    const variant = variantOf(ch, h);
    const recorded = base.parsed[variant] || null;
    const c = recorded ? cmpSemver(h.version, recorded) : null;
    checked[ch] = { online: true, variant, hostName: h.hostName, version: h.version, versionNumber: h.versionNumber, ageSec: h.ageSec, bridgeVersion: h.bridgeVersion, recorded };
    if (c !== null && c > 0) {
      notices.push({
        host: variant,
        hostLabel: h.hostName || variant,
        from: recorded,
        to: h.version,
        kind: 'api-baseline',
        message: '本安装包的 API 基线是 ' + recorded + '，当前宿主已是 ' + h.version,
      });
    }
  }
  return { at: new Date().toISOString(), baseline: base, checked, notice: notices[0] || null, notices };
}

function human(r) {
  console.log('== 宿主升级提示判定（离线：只读 _sync.json 与桥心跳文件）==');
  console.log('包内基线：' + (r.baseline.at || '未知') + ' → ' + (r.baseline.raw || '（无记录）'));
  for (const [ch, c] of Object.entries(r.checked)) {
    if (!c.online) { console.log(ch.toUpperCase() + '：桥离线（不动作）'); continue; }
    console.log(ch.toUpperCase() + '：' + c.hostName + ' ' + c.version + (c.versionNumber ? '(' + c.versionNumber + ')' : '') +
      ' · 变体=' + c.variant + ' · 基线=' + (c.recorded || '无') +
      ' · 心跳 ' + (c.ageSec === null ? '?' : c.ageSec + 's 前'));
  }
  console.log('');
  if (!r.notices.length) {
    console.log('✅ 无需提示：宿主版本未超过包内基线（或基线缺失/桥离线 ⇒ 按纪律不动作）。');
  } else {
    for (const n of r.notices) {
      console.log('⚠️ 需要提示用户：' + n.hostLabel + ' ' + n.from + ' → ' + n.to);
      console.log('   文案（客户端会弹系统通知，仅一次）：包内知识可能过期，建议下载最新 AKDAgent 安装包。');
    }
  }
}

const result = evaluate();
if (JSON_OUT) {
  process.stdout.write(JSON.stringify(result) + '\n');
} else {
  human(result);
}
