#!/usr/bin/env node
/**
 * 问题/反馈记账工具（2026-09-14 新增）—— **纯本地，不联网、不投递、不依赖 gh**
 *
 * 用户裁定（2026-09-14）：
 *   「报告侧手动发的话就算了，我主动留我联系方式就行了，不用 gh」+「诊断包也算了」
 *   ⇒ 反馈渠道只有一条：**作者联系方式**（README + 客户端关于页）。本工具只负责**内部记账**，
 *     把"用户报的坑"保存下来、走完定位/解决、最后回写 skill 坑表与缺陷表。
 *
 * 闭环（见 feedback/issues.json 的 policy）：
 *   用户一说 ⇒ `--new` 落档  →  `--update --status located`  →  `--update --status resolved`
 *   →  回写 skills/akdagent-playbook 坑表  →  若属宿主缺陷再登记 tools/known-bugs.json
 *   →  `--digest` 刷新 knowledge/docs/问题与反馈.md
 *
 * 隐私：**默认写入前脱敏**（用户名 / 绝对路径 → 占位符），确需原文用 `--no-redact`。
 *
 * 用法：
 *   node tools/issue.cjs --new --title "一句话现象" [--host ix|sv|sv1|sv2|electron|other]
 *        [--symptom "细节"] [--repro "步骤1;步骤2"] [--contact "用户留的联系方式"]
 *        [--source user|agent] [--no-redact]
 *   node tools/issue.cjs --list [--open]            # 默认全部；--open 只看未结
 *   node tools/issue.cjs --show ISSUE-0001
 *   node tools/issue.cjs --update ISSUE-0001 --status located --note "根因…"
 *   node tools/issue.cjs --update ISSUE-0001 --status resolved --resolution "改了什么" [--skill <路径>] [--bug <ID>]
 *   node tools/issue.cjs --digest [--out knowledge/docs/问题与反馈.md]
 *   node tools/issue.cjs --reg <path>               # 用别的登记表（自测用）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const REG_DEFAULT = path.join(ROOT, 'feedback', 'issues.json');
const DOC_DEFAULT = path.join(ROOT, 'docs', '问题与反馈.md');

const argv = process.argv.slice(2);
const FLAG = (n) => argv.includes(n);
const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const REG = OPT('--reg') || REG_DEFAULT;

const STATUS_LABEL = {
  open: '🟡 未处理', repro: '🔁 已复现', located: '🔍 已定位', resolved: '✅ 已解决',
  'cant-repro': '❔ 无法复现', 'by-design': '⛔ 设计如此', upstream: '📮 属宿主缺陷',
};
const HOST_LABEL = { ix: 'Instrument X', sv: 'Synthesizer V Studio', sv1: 'SV1', sv2: 'SV2', electron: 'Electron 客户端', other: '其他' };

function load() {
  if (!fs.existsSync(REG)) { console.error('❌ 找不到登记表：' + REG); process.exit(2); }
  try { return JSON.parse(fs.readFileSync(REG, 'utf8')); }
  catch (e) { console.error('❌ 登记表不是合法 JSON：' + e.message); process.exit(2); }
}
function save(reg) { fs.mkdirSync(path.dirname(REG), { recursive: true }); fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8'); }
function today() { return new Date().toISOString().slice(0, 10); }

/** 脱敏：用户名与绝对路径 → 占位符（公开库硬要求） */
function redact(s) {
  if (typeof s !== 'string') return s;
  let u = null;
  try { u = os.userInfo().username; } catch { /* 取不到就算了 */ }
  let out = s;
  if (u) {
    out = out.split('\\Users\\' + u).join('\\Users\\<USER>');
    out = out.split('/Users/' + u).join('/Users/<USER>');
    out = out.split('\\users\\' + u).join('\\Users\\<USER>');
    out = new RegExp(u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi').test(out) ? out.split(u).join('<USER>') : out;
  }
  out = out.replace(/\b[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\<USER>');
  out = out.replace(/(?<![<\w])\/(?:home|Users)\/[^/\s]+/g, '/home/<USER>');
  return out;
}
const R = (s, noRedact) => (noRedact ? s : redact(s));

function snapshot(noRedact) {
  const env = {
    at: new Date().toISOString(),
    os: os.type() + ' ' + os.release() + ' (' + os.arch() + ')',
    node: process.version,
    electron: null,
    hosts: {},
  };
  try { env.electron = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron', 'package.json'), 'utf8')).version || null; } catch { /* 无所谓 */ }
  try {
    const ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'));
    for (const h of ['sv', 'ix']) {
      const hb = ipc.readHeartbeat(h);
      if (!hb) continue;
      let ageSec = null;
      try { ageSec = Math.round(ipc.heartbeatAgeSec(h)); } catch { /* 老版本 */ }
      env.hosts[h] = { hostName: hb.hostName, version: hb.version, versionNumber: hb.hostVersionNumber, bridgeVersion: hb.bridgeVersion, ageSec };
    }
  } catch (e) { env.hosts._err = e.message; }
  return noRedact ? env : JSON.parse(redact(JSON.stringify(env)));
}

function nextId(reg) {
  const n = (reg.issues || []).reduce((mx, it) => Math.max(mx, Number(String(it.id).replace(/\D/g, '')) || 0), 0) + 1;
  return 'ISSUE-' + String(n).padStart(4, '0');
}

function doNew(reg, noRedact) {
  const title = OPT('--title');
  if (!title) { console.error('❌ --new 需要 --title "一句话现象"'); process.exit(2); }
  const host = OPT('--host') || 'other';
  const it = {
    id: nextId(reg),
    date: today(),
    source: OPT('--source') || 'user',
    host,
    hostVersion: (() => { const hb = snapshot(true).hosts; const h = host === 'sv1' || host === 'sv2' ? 'sv' : host; return hb[h] ? hb[h].version : null; })(),
    title: R(title, noRedact),
    symptom: R(OPT('--symptom') || '', noRedact),
    repro: (OPT('--repro') || '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => R(s, noRedact)),
    status: 'open',
    resolution: '',
    refs: { skill: OPT('--skill') || null, bug: OPT('--bug') || null },
    env: snapshot(noRedact),
    history: [{ at: today(), status: 'open', note: '落档（' + (OPT('--source') || 'user') + '）' + (OPT('--contact') ? ' · 联系人：' + R(OPT('--contact'), noRedact) : '') }],
  };
  reg.issues = reg.issues || [];
  reg.issues.push(it);
  save(reg);
  console.log('✅ 已落档：' + it.id + ' · ' + it.title);
  console.log('   宿主=' + (HOST_LABEL[host] || host) + (it.hostVersion ? ' ' + it.hostVersion : '') + ' · 状态=' + STATUS_LABEL.open);
  console.log('   环境快照：' + JSON.stringify(it.env.hosts));
  console.log('   下一步：定位后 `--update ' + it.id + ' --status located --note "根因..."`');
}

function fmtIssue(it, verbose) {
  console.log('');
  console.log('【' + it.id + '】' + (STATUS_LABEL[it.status] || it.status) + ' · ' + (HOST_LABEL[it.host] || it.host) + (it.hostVersion ? ' ' + it.hostVersion : '') + ' · ' + it.date + (it.source ? ' · ' + it.source : ''));
  console.log('  ' + it.title);
  if (it.symptom) console.log('  现象：' + it.symptom);
  if ((it.repro || []).length) { console.log('  复现：'); it.repro.forEach((s, i) => console.log('    ' + (i + 1) + ') ' + s)); }
  if (it.resolution) console.log('  结论：' + it.resolution);
  if (it.refs && (it.refs.skill || it.refs.bug)) console.log('  关联：' + [it.refs.skill ? 'skill=' + it.refs.skill : null, it.refs.bug ? 'bug=' + it.refs.bug : null].filter(Boolean).join(' · '));
  if (verbose && (it.history || []).length) {
    console.log('  历史：');
    it.history.forEach((h) => console.log('    · ' + h.at + ' ' + (STATUS_LABEL[h.status] || h.status) + '：' + h.note));
  }
  if (verbose && it.env) console.log('  环境：' + JSON.stringify(it.env));
}

function doList(reg, onlyOpen) {
  const list = (reg.issues || []).filter((it) => !onlyOpen || !['resolved', 'by-design', 'cant-repro'].includes(it.status));
  if (!list.length) { console.log('（没有' + (onlyOpen ? '未结' : '') + '条目）'); return; }
  list.forEach((it) => fmtIssue(it, false));
  const all = reg.issues || [];
  const open = all.filter((it) => !['resolved', 'by-design', 'cant-repro'].includes(it.status)).length;
  console.log('');
  console.log('共 ' + all.length + ' 条 · 未结 ' + open + ' 条 · 已结 ' + (all.length - open) + ' 条');
}

function findIssue(reg, id) {
  const it = (reg.issues || []).find((x) => String(x.id).toLowerCase() === String(id || '').toLowerCase());
  if (!it) { console.error('❌ 没有这条：' + id); process.exit(2); }
  return it;
}

function doUpdate(reg, id, noRedact) {
  const it = findIssue(reg, id);
  const status = OPT('--status');
  const note = OPT('--note');
  const resolution = OPT('--resolution');
  if (!status && !note && !resolution && !OPT('--skill') && !OPT('--bug')) { console.error('❌ 什么都没改：给 --status / --note / --resolution / --skill / --bug 之一'); process.exit(2); }
  if (status) {
    if (!STATUS_LABEL[status]) { console.error('❌ 未知状态：' + status + '（可选：' + Object.keys(STATUS_LABEL).join(' / ') + '）'); process.exit(2); }
    it.status = status;
  }
  if (resolution) it.resolution = R(resolution, noRedact);
  it.refs = it.refs || {};
  if (OPT('--skill')) it.refs.skill = OPT('--skill');
  if (OPT('--bug')) it.refs.bug = OPT('--bug');
  it.history = it.history || [];
  it.history.push({ at: today(), status: it.status, note: R(note || (resolution ? '结论已写' : '—'), noRedact) });
  save(reg);
  console.log('✅ 已更新：' + it.id + ' → ' + (STATUS_LABEL[it.status] || it.status));
  if (it.status === 'resolved') {
    console.log('   结案动作清单（别漏）：');
    console.log('   ① 回写坑表：skills/akdagent-playbook 加一条（含现象/根因/正确做法）');
    console.log('   ② 若是宿主缺陷 ⇒ 登记 tools/known-bugs.json，再 `node tools/known-bugs.cjs --doc`');
    console.log('   ③ 刷新人读版：node tools/issue.cjs --digest');
  }
}

function digestMarkdown(reg) {
  const L = [];
  const all = reg.issues || [];
  const open = all.filter((it) => !['resolved', 'by-design', 'cant-repro'].includes(it.status));
  L.push('# 问题与反馈（人读版）');
  L.push('');
  L.push('> **本文件由 `node tools/issue.cjs --digest` 从 `feedback/issues.json` 生成 —— 不要手改，改 JSON。**');
  L.push('> 生成时间：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · 共 ' + all.length + ' 条（未结 ' + open.length + '）');
  L.push('');
  L.push('## 怎么反馈');
  L.push('');
  L.push('反馈只有一条路：**直接联系作者**（联系方式见 `README.md` 与客户端「关于」页）。');
  L.push('不需要开 issue、不需要导日志包、不需要 GitHub 账号 —— 说明现象与复现步骤即可，需要什么信息会当面问你。');
  L.push('');
  L.push('> 作者的职责边界（2026-09-14 定案）：**只负责分发包**。新版本 = 重新分发安装包，不做自动更新、不做在线检测。');
  L.push('');
  L.push('## 未结（' + open.length + '）');
  L.push('');
  if (!open.length) L.push('（暂无）');
  for (const it of open) {
    L.push('### ' + it.id + ' · ' + it.title);
    L.push('');
    L.push('- **状态**：' + (STATUS_LABEL[it.status] || it.status) + ' · **宿主**：' + (HOST_LABEL[it.host] || it.host) + (it.hostVersion ? ' ' + it.hostVersion : '') + ' · **日期**：' + it.date);
    if (it.symptom) L.push('- **现象**：' + it.symptom);
    if ((it.repro || []).length) { L.push('- **复现**：'); it.repro.forEach((s, i) => L.push('  ' + (i + 1) + '. ' + s)); }
    L.push('');
  }
  L.push('## 已结（' + (all.length - open.length) + '）');
  L.push('');
  L.push('| ID | 日期 | 宿主 | 标题 | 结论 |');
  L.push('|---|---|---|---|---|');
  for (const it of all.filter((x) => !open.includes(x))) {
    L.push('| `' + it.id + '` | ' + it.date + ' | ' + (HOST_LABEL[it.host] || it.host) + ' | ' + it.title + ' | ' + (STATUS_LABEL[it.status] || it.status) + (it.resolution ? '：' + it.resolution.replace(/\|/g, '\\|') : '') + ' |');
  }
  L.push('');
  L.push('## 记账纪律（内部）');
  L.push('');
  L.push('用户一说 ⇒ `--new` 落档（=保存）→ 定位 `--status located` → 修完 `--status resolved --resolution "..."`');
  L.push('→ **回写 `skills/akdagent-playbook` 坑表**（=下次自动避开）→ 若属宿主缺陷再登记 `tools/known-bugs.json`（=带版本与复检触发）。');
  L.push('');
  L.push('> 写入前默认脱敏（用户名 / 绝对路径 → 占位符）。');
  return L.join('\n');
}

function doDigest(reg, out) {
  const md = digestMarkdown(reg);
  const target = out || DOC_DEFAULT;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, md, 'utf8');
  console.log('✅ 已生成：' + target + '（' + md.split('\n').length + ' 行）');
}

function help() {
  const h = fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//);
  console.log(h ? h[1].replace(/^ \* ?/gm, '').trim() : '见源码注释');
}

(function main() {
  const reg = load();
  if (FLAG('--help') || FLAG('-h')) return help();
  if (FLAG('--new')) return doNew(reg, FLAG('--no-redact'));
  if (FLAG('--list')) return doList(reg, FLAG('--open'));
  if (FLAG('--show')) { fmtIssue(findIssue(reg, OPT('--show')), true); return; }
  if (FLAG('--update')) return doUpdate(reg, OPT('--update'), FLAG('--no-redact'));
  if (FLAG('--digest')) return doDigest(reg, OPT('--out'));
  return doList(reg, FLAG('--open'));
})();
