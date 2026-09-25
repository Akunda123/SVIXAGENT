#!/usr/bin/env node
/**
 * 已知缺陷登记与复检工具（2026-09-14 新增）
 *
 * 背景（用户诉求）：「标注当前版本存在bug，可以随着api文档更新或者用户提出或者ix新版本检测
 *   查看是否修复该bug」+「因为测试时可能会闪退，要在用户知情情况下测试」+「SV1遇到不支持api
 *   弹窗应该不算bug，就是这么设计的」。
 *
 * 结构：
 *   - `tools/known-bugs.json` = 唯一事实源（四类：crash / api-gap / doc-gap / by-design）
 *   - `knowledge/docs/已知Bug与平台约束.md` = 人读版，由本工具 `--doc` 生成（别手改，改 JSON）
 *
 * 复检三触发：
 *   ① 宿主版本向前更新（桥心跳 hostVersionNumber vs state.checkedVersionNumber）
 *   ② 官方文档 generatedAt 变化（skills/sv-scripting/api/_sync.json）
 *   ③ 用户提出（--report，写 state.userReportAt）
 *
 * ⚠️ 分发政策（用户 2026-09-14 定案）：**更新 = 重新分发安装包；客户端不出网、不自动检测**。
 *   ⇒ `--check` 只读本地文件（心跳文件 + _sync.json），**不碰桥、不出网**，可安全挂在客户端启动钩子。
 *   ⇒ `--probe` 是**危险动作**：会真调宿主 API，可能冻桥/闪退 ⇒ 必须 `--confirm`，且跑前用户先 Ctrl+S。
 *      发请求前先写 `pendingProbe` 落盘标记：进程若随宿主一起没了，残留标记本身就是"缺陷仍在"的证据。
 *
 * 用法：
 *   node tools/known-bugs.cjs                      # = --check（安全）
 *   node tools/known-bugs.cjs --check --json       # 机器可读
 *   node tools/known-bugs.cjs --list               # 全部条目 + 规避手法
 *   node tools/known-bugs.cjs --doc [--out <md>]   # 生成人读文档（默认 knowledge/docs/已知Bug与平台约束.md）
 *   node tools/known-bugs.cjs --plan IX-001        # 只打印复检方案（安全，不碰宿主）
 *   node tools/known-bugs.cjs --probe IX-001 --confirm   # ⚠️ 真跑危险探针（需用户在场 + 先保存工程）
 *   node tools/known-bugs.cjs --verified IX-001 --status fixed --note "..." [--version 1.0.1]
 *   node tools/known-bugs.cjs --report SV-002      # 用户提出复检（下次 --check 即到期）
 *   node tools/known-bugs.cjs --reg <path>         # 用别的登记表（自测用）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REG_DEFAULT = path.join(__dirname, 'known-bugs.json');
const SYNC = path.join(ROOT, 'skills', 'sv-scripting', 'api', '_sync.json');
// ⚠️ 2026-09-20 修：原指向 `docs/已知Bug与平台约束.md`（**该文件不存在**），而人读版真身在
//   `knowledge/docs/`（本文件头注释与 known-bugs.json 的 note 两处都写的是 knowledge/docs）
//   ⇒ 不传 `--out` 跑 `--doc` 会在 docs/ 下**新造一份**副本、真文档永远不更新（同 voice-name-table.cjs 那类坑）。
const DOC_DEFAULT = path.join(ROOT, 'knowledge', 'docs', '已知Bug与平台约束.md');

const argv = process.argv.slice(2);
const FLAG = (n) => argv.includes(n);
const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const REG = OPT('--reg') || REG_DEFAULT;
const JSON_OUT = FLAG('--json');

const CLASS_LABEL = { crash: '🔴 崩溃', 'api-gap': '🟡 能力缺口', 'doc-gap': '📄 文档缺席', 'by-design': '⛔ 设计如此' };
const STATUS_LABEL = { open: '存在', fixed: '已修复', partial: '部分修复', 'cant-repro': '未能复现', 'by-design': '设计如此' };

function load() {
  if (!fs.existsSync(REG)) { console.error('❌ 找不到登记表：' + REG); process.exit(2); }
  try { return JSON.parse(fs.readFileSync(REG, 'utf8')); }
  catch (e) { console.error('❌ 登记表不是合法 JSON：' + e.message); process.exit(2); }
}
function save(reg) { fs.writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8'); }
function today() { return new Date().toISOString().slice(0, 10); }

/** 读桥心跳 **文件**（不出网、不碰桥逻辑）。桥没起就是 {}。 */
function readHeartbeats() {
  const out = {};
  try {
    const ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'));
    for (const h of ['sv', 'ix']) {
      const hb = ipc.readHeartbeat(h);
      if (!hb) continue;
      let ageSec = null;
      try { ageSec = Math.round(ipc.heartbeatAgeSec(h)); } catch { /* 老版本无此函数 */ }
      // ⚠️ 2026-09-20 修：心跳文件里的字段名是 **`bridge`**（不是 `bridgeVersion`）⇒ 原写法恒为 undefined，
      //    探针收尾那行一直打印「桥 ?」。顺带把 hostName 也带上，便于判断"是不是同一个宿主实例"。
      out[h] = { version: hb.version, versionNumber: hb.hostVersionNumber, hostName: hb.hostName, bridgeVersion: hb.bridge, ageSec };
    }
  } catch (e) { out._err = e.message; }
  return out;
}

function readDocStamp() {
  try { const s = JSON.parse(fs.readFileSync(SYNC, 'utf8')); return { generatedAt: s.generatedAt || null, recordedAt: s.recordedAt || null, hostVersions: s.hostVersions || {} }; }
  catch { return { generatedAt: null, recordedAt: null, hostVersions: {} }; }
}

function cmpSemver(a, b) {
  const pa = String(a || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  const pb = String(b || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const x = Number(pa[i] || 0), y = Number(pb[i] || 0);
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * 判定一条缺陷是否"该复检了"。**只做本地比对**，任何一步缺数据都偏向"不动作"（同 api-docs 纪律）。
 * by-design 一律不判（recheck=false）。
 */
function evaluate(bug, hb, doc) {
  const st = bug.state || {};
  const reasons = [];
  const baseHost = st.checkedHost || (bug.host === 'any' ? 'ix' : bug.host);
  if (bug.recheck === false) {
    return { due: false, skip: true, reasons: ['设计如此 / 不作复检'], nowVersion: null, host: baseHost, status: st.status || 'by-design' };
  }

  const host = baseHost;
  const now = hb[host];
  let verMoved = false;
  // 本条认哪些触发（缺省 host/doc/user 全认）。`recheckOn: ["doc"]` ⇒ **只跟官方 API 文档更新**走：
  // 宿主版本向前更新**不再**判到期（用在"用户侧测不了 / 只有上游补了 API 才算修好"的 api-gap 条目，见 IX-002）。
  const ON = Array.isArray(bug.recheckOn) && bug.recheckOn.length ? bug.recheckOn : ['host', 'doc', 'user'];
  // ⚠️ SV1 与 SV2 共用同一条 `-sv` 通道：心跳里跑的是哪个变体取决于用户开了哪个宿主。
  //    所以先比 hostName（"Synthesizer V Studio Pro" vs "…Studio 2 Pro"），变体不同就**不比较版本**（否则会出现"版本倒退"的假象）。
  const nameMismatch = !!(now && st.checkedHostName && now.hostName && st.checkedHostName !== now.hostName);
  if (nameMismatch) {
    reasons.push('宿主变体不同（记录 ' + st.checkedHostName + ' / 当前 ' + now.hostName + '）⇒ 版本不可比，不动作');
  } else if (!now) reasons.push(host + ' 桥离线（版本不可比 ⇒ 不动作）');
  else {
    const a = st.checkedVersionNumber, b = now.versionNumber;
    const c = (typeof a === 'number' && typeof b === 'number') ? (b - a) : cmpSemver(now.version, st.checkedVersion);
    if (c === null) reasons.push('版本号格式无法比较 ⇒ 不动作');
    else if (c > 0) {
      const moved = host + ' 版本向前更新：' + st.checkedVersion + ' → ' + now.version;
      if (ON.includes('host')) { verMoved = true; reasons.push(moved); }
      else reasons.push(moved + '（但本条只跟官方 API 文档更新，recheckOn=' + ON.join('/') + ' ⇒ 不判到期）');
    }
  }

  let docMoved = false;
  if (ON.includes('doc') && doc.generatedAt && st.checkedDocStamp && doc.generatedAt !== st.checkedDocStamp) {
    docMoved = true; reasons.push('官方文档 generatedAt 变化：' + st.checkedDocStamp + ' → ' + doc.generatedAt);
  }

  let userAsked = false;
  if (ON.includes('user') && st.userReportAt && (!st.checkedAt || st.userReportAt > st.checkedAt)) {
    userAsked = true; reasons.push('用户提出复检（' + st.userReportAt + '）');
  }

  const due = verMoved || docMoved || userAsked;
  if (!due && reasons.length === 0) reasons.push('宿主版本与文档时间戳都没变');
  return {
    due, skip: false, reasons, nameMismatch,
    host, nowVersion: now ? now.version : null, nowVersionNumber: now ? now.versionNumber : null,
    nowHostName: now ? now.hostName : null,
    checkedVersion: st.checkedVersion, status: st.status || 'open',
    bridgeAgeSec: now ? now.ageSec : null,
  };
}

/** 上次危险探针发出去就没回来 ⇒ 判"仍在"，并把残留标记清掉（写盘）。 */
function settleStaleProbe(reg) {
  const pending = reg.pendingProbe;
  if (!pending) return null;
  const bug = (reg.bugs || []).find((b) => b.id === pending.id);
  if (bug) {
    bug.state = bug.state || {};
    bug.state.status = bug.state.status === 'fixed' ? 'partial' : (bug.state.status || 'open');
    bug.state.history = bug.state.history || [];
    bug.state.history.push({
      at: today(), event: 'probe-no-response',
      note: '危险探针发出后没有回来（' + pending.at + ' · ' + pending.host + ' ' + (pending.hostVersion || '?') + '）⇒ 判为缺陷仍在；宿主/桥可能被冻过或重启过'
    });
    bug.state.checkedAt = today();
  }
  delete reg.pendingProbe;
  save(reg);
  return pending;
}

function fmtVer(v, n) { return v ? (v + (typeof n === 'number' ? '(' + n + ')' : '')) : '离线'; }

function doCheck(reg) {
  const stale = settleStaleProbe(reg);
  const hb = readHeartbeats();
  const doc = readDocStamp();

  const rows = (reg.bugs || []).map((bug) => ({ bug, ev: evaluate(bug, hb, doc) }));
  const due = rows.filter((r) => r.ev.due);
  const hostLine = ['sv', 'ix'].map((h) => hb[h] ? (h.toUpperCase() + ' ' + fmtVer(hb[h].version, hb[h].versionNumber)) : (h.toUpperCase() + ' 桥离线')).join(' · ');

  if (JSON_OUT) {
    console.log(JSON.stringify({
      at: new Date().toISOString(), hosts: hb, doc, staleProbe: stale || null,
      due: due.map((r) => r.bug.id), rows: rows.map((r) => ({ id: r.bug.id, class: r.bug.class, ...r.ev })),
    }, null, 2));
    return due.length;
  }

  console.log('== 已知缺陷复检报告（安全模式：只读本地文件，不碰桥、不出网）==');
  console.log('宿主：' + hostLine + (hb._err ? ' · 心跳读取异常：' + hb._err : ''));
  console.log('文档：generatedAt=' + (doc.generatedAt || '未知') + ' · 记录于 _sync.json');
  if (stale) {
    console.log('');
    console.log('⚠️ 发现残留的危险探针标记：' + stale.id + '（' + stale.at + '）⇒ 判为**缺陷仍在**，已写入历史。');
    console.log('   若宿主当时确实重启过：以后跑探针前先让用户保存工程，并接受"宿主会重启"这一代价。');
  }
  console.log('');
  const pad = (s, n) => { let w = 0; for (const ch of String(s)) w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1; return String(s) + ' '.repeat(Math.max(0, n - w)); };
  console.log(pad('ID', 10) + pad('类别', 12) + pad('状态', 10) + pad('记录版本', 14) + pad('当前版本', 14) + '复检');
  console.log('-'.repeat(78));
  for (const { bug, ev } of rows) {
    const mark = ev.skip ? '—（设计如此）' : (ev.due ? '⚠️ 到期' : '⏳ 未到期');
    console.log(pad(bug.id, 10) + pad(CLASS_LABEL[bug.class] || bug.class, 12) + pad(STATUS_LABEL[ev.status] || ev.status, 10) +
      pad(fmtVer(ev.checkedVersion, (bug.state || {}).checkedVersionNumber), 14) + pad(fmtVer(ev.nowVersion, ev.nowVersionNumber), 14) + mark);
  }
  console.log('');
  for (const { bug, ev } of rows) {
    if (ev.due) console.log('   ⚠️ ' + bug.id + '：' + ev.reasons.filter((r) => !r.includes('不动作')).join(' / '));
  }
  for (const { bug, ev } of rows) {
    if (!ev.due && ev.nameMismatch) console.log('   ℹ️ ' + bug.id + '：' + (ev.reasons.find((r) => r.includes('宿主变体不同')) || '') + '（本条按"不动作"处理）');
  }
  console.log('');
  if (!due.length) {
    console.log('✅ 无到期项：宿主版本与文档时间戳都没变 ⇒ 按"版本未变不折腾"纪律，**不跑任何探针**。');
    console.log('   （要强制看某条的复检方案：node tools/known-bugs.cjs --plan <ID>）');
  } else {
    console.log('⚠️ 到期 ' + due.length + ' 条。**探针可能闪退宿主，必须用户在场并同意**：');
    console.log('   1) 先让用户 Ctrl+S 保存工程');
    console.log('   2) node tools/known-bugs.cjs --plan <ID>            # 看要跑什么（安全）');
    console.log('   3) node tools/known-bugs.cjs --probe <ID> --confirm  # 真跑（一次只跑一条）');
    console.log('   4) 跑完按结果记账：--verified <ID> --status fixed|open|partial --note "..."');
  }
  return due.length;
}

function doList(reg) {
  for (const bug of reg.bugs || []) {
    console.log('');
    console.log('【' + bug.id + '】' + (CLASS_LABEL[bug.class] || bug.class) + ' · 宿主=' + bug.host + ' · 复检=' + (bug.recheck === false ? '否（设计如此）' : '是') + ' · 状态=' + (STATUS_LABEL[(bug.state || {}).status] || (bug.state || {}).status));
    console.log('  ' + bug.title);
    if ((bug.apis || []).length) console.log('  API：' + bug.apis.join(' · '));
    console.log('  现象：' + bug.symptom);
    if ((bug.seenOn || []).length) console.log('  实测版本：' + bug.seenOn.map((s) => s.date + ' ' + (s.hostVersion || '?') + (s.hostVersionNumber ? '(' + s.hostVersionNumber + ')' : '')).join(' / '));
    (bug.workaround || []).forEach((w, i) => console.log((i === 0 ? '  规避：' : '        ') + w));
  }
  console.log('');
  console.log('共 ' + (reg.bugs || []).length + ' 条（' + (reg.bugs || []).filter((b) => b.class === 'crash').length + ' 崩溃 / ' +
    (reg.bugs || []).filter((b) => b.class === 'api-gap').length + ' 缺口 / ' +
    (reg.bugs || []).filter((b) => b.class === 'doc-gap').length + ' 文档 / ' +
    (reg.bugs || []).filter((b) => b.class === 'by-design').length + ' 设计如此）');
}

function findBug(reg, id) {
  const bug = (reg.bugs || []).find((b) => String(b.id).toLowerCase() === String(id || '').toLowerCase());
  if (!bug) { console.error('❌ 没有这条：' + id + '（可选：' + (reg.bugs || []).map((b) => b.id).join(', ') + '）'); process.exit(2); }
  return bug;
}

function doPlan(reg, id) {
  const bug = findBug(reg, id);
  console.log('== 复检方案：' + bug.id + ' · ' + bug.title + ' ==');
  console.log('类别：' + (CLASS_LABEL[bug.class] || bug.class) + ' · 宿主：' + bug.host + ' · 记录版本：' + fmtVer((bug.state || {}).checkedVersion, (bug.state || {}).checkedVersionNumber));
  if (!bug.probe) { console.log('\n本条 **没有探针**（设计如此 ⇒ 永不复检，只作纪律）。'); return; }
  const p = bug.probe;
  console.log('探针类型：' + p.kind + (p.gate === 'user-consent' ? '（**必须用户知情同意**）' : p.kind === 'safe' ? '（安全，随时可跑）' : ''));
  console.log('要做什么：' + p.what);
  if (p.kind === 'manual-only') {
    // 代价按条目自述（`probe.risk`）；缺省沿用 SV-002 那句"宿主闪退"（它是崩溃类）
    console.log('\n⚠️ 本条**不提供一键探针**：' +
      (p.risk || '代价 = 宿主闪退 / 工程可能损坏，必须由用户在临时工程里手动安排。'));
  }
  if ((p.prepare || []).length) { console.log('\n跑前准备：'); p.prepare.forEach((s) => console.log('  · ' + s)); }
  console.log('\n预期：' + p.expect);
  if (p.kind === 'docs') { console.log('\n命令：node tools/api-docs-sync.cjs --check（变了再 --update）'); return; }
  if ((p.lua || []).length) {
    console.log('\n脚本（' + (p.readonly ? '只读' : '写操作') + '，超时 ' + (p.timeoutMs || 8000) + 'ms）：');
    console.log('----- 8< -----');
    console.log(p.lua.join('\n'));
    console.log('----- >8 -----');
  }
  if (p.kind === 'dangerous' && (p.lua || []).length) {
    console.log('\n真跑：node tools/known-bugs.cjs --probe ' + bug.id + ' --confirm');
  }
}

/** 真跑探针：这是唯一会碰宿主的路径，代价可能是宿主重启。 */
async function doProbe(reg, id, confirmed) {
  const bug = findBug(reg, id);
  const p = bug.probe;
  if (!p || !(p.lua || []).length) { console.error('❌ 本条没有可执行探针（设计如此 / 只能手动安排）。'); process.exit(2); }
  if (!confirmed) {
    console.error('⚠️ 拒绝执行：本条探针可能冻桥 / 闪退宿主。');
    console.error('   先看方案：node tools/known-bugs.cjs --plan ' + bug.id);
    console.error('   确认用户在场并已 Ctrl+S 保存工程后，加 --confirm 重跑。');
    process.exit(3);
  }
  const host = p.host || (bug.state || {}).checkedHost || (bug.host === 'any' ? 'ix' : bug.host);
  const hb = readHeartbeats()[host];
  if (!hb) { console.error('❌ ' + host + ' 桥离线（心跳文件没有或过期）⇒ 先让用户在宿主里跑一次桥。'); process.exit(2); }

  console.log('⚠️ 即将对 ' + host.toUpperCase() + ' 执行危险探针：' + p.what);
  console.log('   宿主版本 ' + hb.version + (hb.versionNumber ? '(' + hb.versionNumber + ')' : '') + ' · 超时 ' + (p.timeoutMs || 8000) + 'ms');
  console.log('   若桥无响应：宿主可能已重启，工程未保存的改动会丢。');

  reg.pendingProbe = { id: bug.id, at: new Date().toISOString(), host, hostVersion: hb.version, hostVersionNumber: hb.versionNumber, api: (bug.apis || [])[0] || null };
  save(reg);   // ← 先落盘：进程若跟宿主一起没了，这条标记就是"仍在"的证据
  console.log('   已写 pendingProbe 标记到登记表（用于判定"探针没回来"）。');

  const ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'));
  const t0 = Date.now();
  let res = null, err = null;
  try {
    res = await ipc.fileIpcSend('run_script', { code: p.lua.join('\n'), readonly: !!p.readonly }, { host, timeoutMs: p.timeoutMs || 8000 });
  } catch (e) { err = e; }
  const ms = Date.now() - t0;

  bug.state = bug.state || {};
  bug.state.history = bug.state.history || [];
  bug.state.checkedAt = today();

  if (err) {
    bug.state.status = 'open';
    bug.state.history.push({ at: today(), event: 'probe-timeout', note: '探针未返回（' + ms + 'ms / ' + err.message + '）⇒ 缺陷仍在，桥可能已被冻或宿主已重启' });
    bug.state.checkedVersion = hb.version; bug.state.checkedVersionNumber = hb.versionNumber; bug.state.checkedHost = host;
    bug.state.checkedHostName = hb.hostName;
    delete reg.pendingProbe; save(reg);
    console.log('');
    console.log('❌ 探针没有回来（' + ms + 'ms）：**缺陷仍在**，已记账。');
    console.log('   请检查 ' + host.toUpperCase() + ' 宿主窗口是否还活着；若已重启，提醒用户重新保存与恢复。');
    return;
  }

  const hb2 = readHeartbeats()[host];
  bug.state.status = 'partial';
  bug.state.history.push({
    at: today(), event: 'probe-responded',
    note: '探针**有回应**（' + ms + 'ms）⇒ 不再复现"调用即冻桥"；结论=不再冻桥，仍需人工确认宿主未重启。返回=' + JSON.stringify(res).slice(0, 300)
  });
  bug.state.checkedVersion = hb.version; bug.state.checkedVersionNumber = hb.versionNumber; bug.state.checkedHost = host;
  bug.state.checkedHostName = hb.hostName;
  delete reg.pendingProbe; save(reg);
  console.log('');
  console.log('✅ 探针有回应（' + ms + 'ms）⇒ 不再复现"调用即冻桥"。');
  console.log('   返回：' + JSON.stringify(res).slice(0, 400));
  console.log('   桥心跳：' + (hb2 ? (hb2.version + ' · ' + (hb2.ageSec === null ? '?' : hb2.ageSec + 's 前') + ' · 桥 ' + (hb2.bridgeVersion || '?')) : '**读不到（可能已随宿主重启）**'));
  console.log('   请人工确认宿主窗口是否仍在（重启过 ⇒ 结论要往回收），然后：');
  console.log('   node tools/known-bugs.cjs --verified ' + bug.id + ' --status fixed|partial --note "..."');
}

function doVerified(reg, id, status, note, version) {
  const bug = findBug(reg, id);
  if (!status) { console.error('❌ 需要 --status（open|fixed|partial|cant-repro|by-design）'); process.exit(2); }
  bug.state = bug.state || {};
  bug.state.status = status;
  bug.state.checkedAt = today();
  bug.state.history = bug.state.history || [];
  const hb = readHeartbeats();
  const host = bug.state.checkedHost || (bug.host === 'any' ? 'ix' : bug.host);
  const now = hb[host];
  if (version) { bug.state.checkedVersion = version; bug.state.checkedVersionNumber = null; }
  else if (now) { bug.state.checkedVersion = now.version; bug.state.checkedVersionNumber = now.versionNumber; }
  if (now && now.hostName) bug.state.checkedHostName = now.hostName;
  const doc = readDocStamp();
  if (doc.generatedAt) bug.state.checkedDocStamp = doc.generatedAt;
  delete bug.state.userReportAt;
  bug.state.history.push({ at: today(), event: 'verified', note: (note || '人工记账') + '（' + STATUS_LABEL[status] + (bug.state.checkedVersion ? ' @ ' + bug.state.checkedVersion : '') + '）' });
  save(reg);
  console.log('✅ 已记账：' + bug.id + ' → ' + (STATUS_LABEL[status] || status) + ' @ ' + (bug.state.checkedVersion || '?') + (note ? ' · ' + note : ''));
  console.log('   （' + bug.id + ' 的复检基线已刷新 ⇒ 下次宿主版本/文档再有变化才会再到期）');
}

function doReport(reg, id) {
  const bug = findBug(reg, id);
  bug.state = bug.state || {};
  bug.state.userReportAt = new Date().toISOString();
  bug.state.history = bug.state.history || [];
  bug.state.history.push({ at: today(), event: 'user-report', note: '用户提出复检' });
  save(reg);
  console.log('✅ 已标记用户提出：' + bug.id + ' ⇒ 下次 --check 会列为到期（复检前记得先让用户保存工程）');
}

/** 生成人读文档（从 JSON 出，单向覆盖 —— 别手改 md） */
function docMarkdown(reg) {
  const L = [];
  L.push('# 已知缺陷与平台约束（人读版）');
  L.push('');
  L.push('> **本文件由 `node tools/known-bugs.cjs --doc` 从 `tools/known-bugs.json` 生成 —— 不要手改，改 JSON。**');
  L.push('> 生成时间：' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' · 共 ' + (reg.bugs || []).length + ' 条');
  L.push('');
  L.push('## 0. 怎么用（三条纪律）');
  L.push('');
  L.push('1. **`crash` 类绝不允许出现在生成脚本里** —— 调用即冻桥 / 宿主闪退。写脚本前先按本表自检。');
  L.push('2. **`--check` 是安全的**（只读心跳文件 + `_sync.json`，不碰桥、不出网）；**探针是危险的**：');
  L.push('   必须 `--confirm`，**跑前用户先 Ctrl+S 保存工程**，一次只跑一条。');
  L.push('3. **`by-design` 不是缺陷**（用户裁定：SV1 不支持成员弹窗"就是这么设计的"）⇒ 只作纪律，**永不列入复检**。');
  L.push('');
  L.push('## 1. 复检触发（三选一）');
  L.push('');
  L.push('| 触发 | 判据 | 谁发现 |');
  L.push('|---|---|---|');
  L.push('| 宿主版本向前更新 | 桥心跳 `hostVersionNumber` > 记录值（IX 1.0.0 = 65536 · SV1 1.11.2 = 68354） | `--check` 自动 |');
  L.push('| 官方文档更新 | `skills/sv-scripting/api/_sync.json` 的 `generatedAt` 变化 | `--check` 自动 |');
  L.push('| 用户提出 | `--report <ID>` 写 `state.userReportAt` | 人工 |');
  L.push('');
  L.push('> 分发政策（2026-09-14 定案）：**更新 = 重新分发安装包；客户端不出网、不自动检测**。');
  L.push('> 所以客户端只做**离线**比对并在宿主升级时提示"请下载最新安装包"，查文档站 / 跑探针都是**开发侧手动**动作。');
  L.push('');
  L.push('> **按条目挑触发（2026-09-21 新增）**：条目可加 `recheckOn: ["doc"]` ⇒ **只跟官方 API 文档更新**走，');
  L.push('> 宿主版本向前更新**不判到期**。用在「用户侧测不了 / 只有上游补了 API 才算修好」的 `api-gap` 条目（现例 `IX-002`）——');
  L.push('> 这类条目的探针同时换成 `kind: "docs"`（只提示查文档、**永不碰宿主**）。');
  L.push('');
  L.push('## 2. 汇总表');
  L.push('');
  L.push('| ID | 类别 | 宿主 | 状态 | 记录版本 | 一句话 |');
  L.push('|---|---|---|---|---|---|');
  for (const b of reg.bugs || []) {
    const st = b.state || {};
    L.push('| `' + b.id + '` | ' + (CLASS_LABEL[b.class] || b.class) + ' | ' + b.host + ' | ' + (STATUS_LABEL[st.status] || st.status) + ' | ' + (st.checkedVersion || '?') + (typeof st.checkedVersionNumber === 'number' ? '(' + st.checkedVersionNumber + ')' : '') + ' | ' + b.title + ' |');
  }
  L.push('');
  const byClass = ['crash', 'api-gap', 'doc-gap', 'by-design'];
  for (const c of byClass) {
    const items = (reg.bugs || []).filter((b) => b.class === c);
    if (!items.length) continue;
    L.push('## ' + (CLASS_LABEL[c] || c) + '（' + items.length + ' 条）');
    L.push('');
    for (const b of items) {
      const st = b.state || {};
      L.push('### ' + b.id + ' · ' + b.title);
      L.push('');
      const ON_LABEL = { host: '宿主版本向前更新', doc: '官方 API 文档更新', user: '用户提出' };
      const onTxt = (Array.isArray(b.recheckOn) && b.recheckOn.length)
        ? ' · **复检触发**：仅 ' + b.recheckOn.map((x) => ON_LABEL[x] || x).join(' / ')
        : '';
      L.push('- **宿主**：' + b.host + ' · **状态**：' + (STATUS_LABEL[st.status] || st.status) + ' · **复检**：' + (b.recheck === false ? '否（设计如此）' : '是') + onTxt);
      if ((b.apis || []).length) L.push('- **涉及 API**：' + b.apis.map((a) => '`' + a + '`').join(' · '));
      L.push('- **现象**：' + b.symptom);
      L.push('- **影响**：' + b.impact);
      if ((b.seenOn || []).length) L.push('- **实测版本**：' + b.seenOn.map((s) => s.date + ' @ ' + (s.hostVersion || '?') + (s.hostVersionNumber ? ' (`' + s.hostVersionNumber + '`)' : '')).join(' · '));
      if ((b.workaround || []).length) {
        L.push('- **规避 / 正确做法**：');
        b.workaround.forEach((w) => L.push('  - ' + w));
      }
      if (b.probe) {
        L.push('- **复检探针**：`' + b.probe.kind + '`' + (b.probe.gate === 'user-consent' ? '（须用户知情同意）' : '') + ' —— ' + b.probe.what);
        L.push('  - 预期：' + b.probe.expect);
        if (b.probe.kind === 'manual-only') L.push('  - ⚠️ 不提供一键探针：' + (b.probe.risk || '必须由用户在**临时工程**里手动安排'));
        else if (b.probe.kind === 'docs') L.push('  - 命令：`node tools/api-docs-sync.cjs --check`');
        else L.push('  - 命令：`node tools/known-bugs.cjs --probe ' + b.id + ' --confirm`');
      } else {
        L.push('- **复检探针**：无（设计如此 ⇒ 不复检）');
      }
      L.push('- **记账命令**：`node tools/known-bugs.cjs --verified ' + b.id + ' --status fixed|partial|open --note "..."`');
      L.push('');
    }
  }
  L.push('## 3. 变更历史');
  L.push('');
  for (const b of reg.bugs || []) {
    const hist = (b.state || {}).history || [];
    if (!hist.length) continue;
    L.push('**' + b.id + '**');
    for (const h of hist) L.push('- `' + h.at + '` ' + h.event + '：' + h.note);
    L.push('');
  }
  return L.join('\n');
}

function doDoc(reg, out) {
  const md = docMarkdown(reg);
  const target = out || DOC_DEFAULT;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, md, 'utf8');
  console.log('✅ 已生成人读文档：' + target + '（' + md.split('\n').length + ' 行）');
  console.log('   ⚠️ 不要手改它 —— 改 tools/known-bugs.json 后重跑 --doc');
}

function help() {
  const h = fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//);
  console.log(h ? h[1].replace(/^ \* ?/gm, '').trim() : '见源码注释');
}

(async () => {
  const reg = load();
  if (FLAG('--help') || FLAG('-h')) return help();
  if (FLAG('--list')) return doList(reg);
  if (FLAG('--doc')) return doDoc(reg, OPT('--out'));
  if (FLAG('--plan')) return doPlan(reg, OPT('--plan'));
  if (FLAG('--probe')) return doProbe(reg, OPT('--probe'), FLAG('--confirm'));
  if (FLAG('--verified')) return doVerified(reg, OPT('--verified'), OPT('--status'), OPT('--note'), OPT('--version'));
  if (FLAG('--report')) return doReport(reg, OPT('--report'));
  const due = doCheck(reg);
  // 退出码：0 = 无需动作；3 = 有到期项（方便脚本判断，不报错）
  process.exitCode = due ? 3 : 0;
})();
