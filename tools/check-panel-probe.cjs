#!/usr/bin/env node
/**
 * 面板探针证据读取（2026-09-15）—— 配合 sv/lua/panel-probe.lua 使用
 *
 * 读出三件事的答案（**不靠肉眼看面板**）：
 *   ① 面板脚本里的定时循环能不能持续（tick 行的时间跨度与间隔）
 *   ② 面板沙箱能不能写文件（io 是否可用 / 文件是否存在）
 *   ③ 面板能不能写 scriptData（文件里的 sd= 标记；另可让桥读回 akdagent.probe.tick 交叉验证）
 *
 * 用法：node tools/check-panel-probe.cjs [ix|sv]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const host = (process.argv[2] === 'sv' ? 'sv' : 'ix');
const TMP = process.env.TEMP || os.tmpdir();
const file = path.join(TMP, `akdagent-panel-probe-${host}.txt`);

console.log('== 面板能力探针证据（host=' + host + '）==');
console.log('文件：' + file);
if (!fs.existsSync(file)) {
  console.log('');
  console.log('❌ 文件不存在 ⇒ 探针脚本**没有被宿主加载**（面板没打开 / 脚本没放对目录 / 宿主没重启）。');
  console.log('   ⚠️ 注意：这**不能**推论"面板不能写文件"—— 只有脚本被加载后才有证据。');
  process.exit(1);
}
const st = fs.statSync(file);
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
console.log('大小：' + st.size + ' B · 行数：' + lines.length + ' · 最后写入：' + st.mtime.toLocaleTimeString('zh-CN', { hour12: false }));
console.log('');
console.log('— 前 3 行 —');
lines.slice(0, 3).forEach((l) => console.log('  ' + l));
console.log('— 后 5 行 —');
lines.slice(-5).forEach((l) => console.log('  ' + l));

const load = lines.find((l) => l.includes('== load =='));
const ticks = lines.filter((l) => l.includes('tick#'));
const tickNums = ticks.map((l) => Number((l.match(/tick#(\d+)/) || [])[1])).filter((n) => !Number.isNaN(n));
const times = ticks.map((l) => l.slice(0, 8));

console.log('');
console.log('== 判读 ==');
console.log('① 面板能写文件？    ' + (load ? '✅ 能（载入时就写出了本文件）' : '⚠️ 有文件但没有 load 行，可疑'));
console.log('② 面板能跑循环？    ' + (ticks.length
  ? '✅ 能（共 ' + ticks.length + ' 拍' + (times.length ? '，' + times[0] + ' → ' + times[times.length - 1] : '') + '）'
  : '❌ 没有 tick 行 ⇒ 定时回调**没有触发**（假设 A 成立：面板内循环不可用）'));
if (tickNums.length) {
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const [h1, m1, s1] = times[i - 1].split(':').map(Number);
    const [h2, m2, s2] = times[i].split(':').map(Number);
    gaps.push((h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1));
  }
  const avg = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1) : '?';
  console.log('   拍间隔平均 ' + avg + 's（设计 0.5s ⇒ 明显更大说明被宿主降频/阻塞）');
  const stale = (Date.now() - st.mtime.getTime()) / 1000;
  console.log('   最后一次写入距今 ' + Math.round(stale) + 's ⇒ ' + (stale < 5 ? '循环仍在跑' : '⚠️ 循环已停（宿主停了脚本 / 侧栏关了）'));
}
console.log('③ 面板能写 scriptData？ ' + (load && /sd=/.test(load) ? '看后续 tick 行的 sd= 标记：' + (ticks.slice(-1)[0] || '') : '未见标记'));
console.log('');
console.log('结论口径：①✅②✅ ⇒ 面板可以做"自带桥"；②❌ ⇒ 必须改成"面板只读 scriptData，由 Lua 桥（循环 + refreshSidePanel）驱动刷新"。');
