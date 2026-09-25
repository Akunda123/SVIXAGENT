#!/usr/bin/env node
/**
 * 对照实验：嵌套对象参数（write_pit 的 params）到底有没有生效？
 *   · params 生效  ⇒ jdec 正常，问题只出在 run_script 的 scope 注入
 *   · params 不生效 ⇒ jdec 在丢**嵌套对象**键（那 scope 丢就是同一根因）
 * 用法：node sv/lua/probe-nested-args.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';

const call = (op, args) => ipc.fileIpcSend(op, args, { host: HOST, timeoutMs: 30000 });
const brief = (o) => {
  if (!o || typeof o !== 'object') return String(o);
  const c = (o.curves || o.plan || [])[0];
  return JSON.stringify({
    keys: Object.keys(o).slice(0, 8),
    mode: o.mode,
    curve0: c && {
      index: c.index,
      points: c.points,
      spanBlick: c.spanBlick,
      yMin: c.yMin, yMax: c.yMax,
      yAtOnset: c.yAtOnset,
    },
  });
};

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥 ' + hb.bridge + ' · ' + hb.hostName + ' ' + hb.version + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');

  const base = { dryRun: true, plan: 'explicit', indices: [1], clear: 'none' };
  const a = await call('write_pit', { ...base });
  const b = await call('write_pit', { ...base, params: { dF0Left: 12, tF0Left: 0.2, dF0Right: 12 } });

  console.log('A 无 params        → ' + (a.ok ? brief(a.result && a.result.result) : 'ERR ' + a.error));
  console.log('B params dF0Left=12→ ' + (b.ok ? brief(b.result && b.result.result) : 'ERR ' + b.error));
  if (a.ok && b.ok) {
    const ra = JSON.stringify(a.result), rb = JSON.stringify(b.result);
    console.log(ra === rb
      ? '❌ A/B 完全相同 ⇒ 嵌套对象 params 被忽略（jdec 丢嵌套键，与 scope 同根因）'
      : '✅ A/B 不同 ⇒ 嵌套对象参数**生效** ⇒ jdec 正常，scope 的问题只在 run_script 注入路径');
  }

  // 交叉验证：scope 换成**顶层另一个键名**（scope2），看是否同样丢
  const c = await call('run_script', { code: 'return { s1 = type(scope), s2 = type(scope2) }', readonly: true, scope: { x: 1 }, scope2: { y: 2 } });
  console.log('顶层键测试 → ' + (c.ok ? JSON.stringify(c.result && c.result.result) : 'ERR ' + c.error));
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
