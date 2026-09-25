#!/usr/bin/env node
/*
 * 宿主版本基线：解析 / 合并 / 提示判定 自测（2026-09-21）
 * =====================================================================
 * 来历：这条链路上刚修掉**两个误报 + 一个静默失效**，都是"只有真机跑才看得见"的那种，
 * 所以固化成可复跑的测试。被测：
 *   A. `tools/lib-host-version.cjs` 的纯函数（解析 / 变体判定 / 版本比较 / 合并）
 *   B. **端到端**：`tools/host-version-notice.cjs` 用 `AKDAGENT_SYNC` 指向**临时基线**跑真进程
 *      （心跳读的是真桥心跳文件，但**基线是我的临时文件** ⇒ 不写仓库任何文件、不影响现役基线）
 *      · 旧基线 `ix=1.0.0` + 现役 IX 1.0.1 ⇒ **必须报**（这正是当时的用户侧误报：包内基线落后）
 *      · 新基线 `ix=<现役>`         ⇒ **必须不报**
 *      · 基线里只写 `unknown`       ⇒ **必须不报**（= 提示机制被静默关掉，正是要防的那种坏数据）
 *   C. `api-docs-sync.cjs --startup` 不许拿 sv1 的旧版本去比在线的 SV2（旧实现的长期误报）——
 *      断言它输出里**不出现** `版本向前更新=true`，且每个变体各自成对（现在 / 基线）。
 *
 * 用法：node tools/test-host-version.cjs
 * 前置：`server/dist/fileipc.js` 已构建（缺了就跳过 B 的"在线"断言，其余照测）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HV = require('./lib-host-version.cjs');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-hv-'));
const writeSync = (obj) => { const p = path.join(TMP, '_sync.json'); fs.writeFileSync(p, JSON.stringify(obj, null, 1) + '\n', 'utf8'); return p; };
const runNotice = (syncPath) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'host-version-notice.cjs'), '--json'], {
  encoding: 'utf8', cwd: ROOT, env: Object.assign({}, process.env, { AKDAGENT_SYNC: syncPath }),
});
const runStartup = () => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'api-docs-sync.cjs'), '--startup'], { encoding: 'utf8', cwd: ROOT });

// ── A. 纯函数 ────────────────────────────────────────────────────────────
console.log('A. lib-host-version（纯函数）');
ok('parseRecord 抠出三个变体', JSON.stringify(HV.parseRecord('sv1=1.11.2 (Synthesizer V Studio Pro) / sv2=2.2.1 (SV2) / ix=1.0.1 (IX)')) === '{"sv1":"1.11.2","sv2":"2.2.1","ix":"1.0.1"}');
ok('parseRecord 对 unknown 返回空（读侧据此"不动作"）', Object.keys(HV.parseRecord('unknown')).length === 0);
ok('parseRecord 忽略不认识的键', Object.keys(HV.parseRecord('foo=9.9.9 / ix=1.0.1')).join() === 'ix');
ok('variantOf：ix 通道恒为 ix', HV.variantOf('ix', { hostName: 'Synthesizer V Studio 2 Pro' }) === 'ix');
ok('variantOf：sv 通道按 hostName 分 SV2', HV.variantOf('sv', { hostName: 'Synthesizer V Studio 2 Pro' }) === 'sv2');
ok('variantOf：SV1 名字不算 SV2', HV.variantOf('sv', { hostName: 'Synthesizer V Studio Pro' }) === 'sv1');
ok('cmpSemver 1.0.1 > 1.0.0', HV.cmpSemver('1.0.1', '1.0.0') === 1);
ok('cmpSemver 相等为 0', HV.cmpSemver('2.2.1', '2.2.1') === 0);
ok('cmpSemver 认不出数字返回 null', HV.cmpSemver('unknown', '1.0.0') === null);
ok('formatRecord 按 sv1/sv2/ix 定序', HV.formatRecord({ ix: '1.0.1', sv1: '1.11.2' }) === 'sv1=1.11.2 / ix=1.0.1');

// 合并：这是修掉"静默失效"的那条
const prev = 'sv1=1.11.2 (Synthesizer V Studio Pro) / sv2=2.2.1 (Synthesizer V Studio 2 Pro) / ix=1.0.0 (Instrument X)';
const m = HV.mergeRecord(prev, { ix: '1.0.1' }, { ix: 'Instrument X' });
ok('mergeRecord：读到 ix 就地刷新', m.merged.ix === '1.0.1');
ok('mergeRecord：读不到的 sv1/sv2 保留旧值（**不写 unknown**）', m.merged.sv1 === '1.11.2' && m.merged.sv2 === '2.2.1');
ok('mergeRecord：kept 报出沿用的变体', m.kept.join() === 'sv1,sv2');
ok('mergeRecord：输出的记录仍可被读侧解析', JSON.stringify(HV.parseRecord(m.record)) === '{"sv1":"1.11.2","sv2":"2.2.1","ix":"1.0.1"}');
ok('mergeRecord：一条都没读到 ⇒ 版本号原样保留（括号里的宿主名是装饰，可能被丢掉）',
  JSON.stringify(HV.mergeRecord(prev, {}, {}).merged) === JSON.stringify(HV.parseRecord(prev)));
ok('mergeRecord：无历史 + 读到 ⇒ 只写读到的', HV.mergeRecord('', { ix: '1.0.1' }, {}).record === 'ix=1.0.1');

// ── B. 端到端（现役心跳 × 临时基线）────────────────────────────────────────
console.log('\nB. host-version-notice（端到端，基线走临时文件）');
let liveIx = null;
try {
  const ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'));
  const hb = ipc.readHeartbeat('ix');
  if (hb) liveIx = hb.version;
} catch { /* 没构建 / 没桥 */ }

const parse = (r) => { try { return JSON.parse((r.stdout || '').trim().split('\n').pop() || 'null'); } catch { return null; } };
const bogus = parse(runNotice(writeSync({ hostVersions: { '2026-01-01': 'unknown' } })));
ok('基线为 unknown ⇒ 不报（且不崩）', bogus && bogus.notice === null);

if (!liveIx) {
  console.log('  [i] 桥心跳不可读（IX 未运行 / server/dist 未构建）⇒ 跳过依赖现役版本的断言');
} else {
  const older = parse(runNotice(writeSync({ hostVersions: { '2026-01-01': 'ix=1.0.0 (Instrument X)' } })));
  ok('**旧基线 ix=1.0.0 + 现役 ' + liveIx + ' ⇒ 必须报**（当时那个用户侧误报的形态）',
    !!(older && older.notice && older.notice.host === 'ix'), JSON.stringify(older && older.notice));

  const same = parse(runNotice(writeSync({ hostVersions: { '2026-01-01': 'ix=' + liveIx + ' (Instrument X)' } })));
  ok('新基线 ix=' + liveIx + ' ⇒ 不报（修复后的口径）', same && same.notice === null, JSON.stringify(same && same.notice));
}

// ── C. --startup 不许跨变体乱比 ────────────────────────────────────────────
console.log('\nC. api-docs-sync --startup（按变体比对）');
const st = runStartup();
const out = (st.stdout || '') + (st.stderr || '');
ok('不再打印旧的 "版本向前更新=true/false" 单值判据', !/版本向前更新=/.test(out));
ok('输出里现在 / 基线成对出现（形如 "ix 现在 1.0.1 / 基线 1.0.1"）',
  !/\b(sv1|sv2|ix)\b/.test(out) || /\b(sv1|sv2|ix)\b[^\n]*现在[^\n]*\/ 基线/.test(out), out.trim().slice(0, 200));

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* 临时目录，删不掉也无所谓 */ }
console.log('\n' + (fail ? '❌ ' : '✅ ') + 'test-host-version: ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
