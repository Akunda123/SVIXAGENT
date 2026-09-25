#!/usr/bin/env node
/**
 * 判别测试：run_script 的 args 里**标量额外键**能不能进脚本作用域？
 *   · 标量键（zz=7）也看不见 ⇒ 常驻桥在**丢弃 args 里的非白名单键**（或 jdec/请求层有问题）
 *   · 标量键看得见、只有 scope（表）看不见 ⇒ 常驻桥的 run_script **没有 scope 注入这一段**
 *     ⇒ 证明「常驻代码 = 同版本号但较早的修订」⇒ 在 SV2 里重跑桥即可修好
 * 用法：node sv/lua/probe-args-keys.cjs [sv|ix]
 */
const path = require('path');
const ipc = require(path.join(__dirname, '..', '..', 'server', 'dist', 'fileipc.js'));
const HOST = process.argv[2] === 'ix' ? 'ix' : 'sv';

const CODE = [
  'return {',
  '  tScope = type(scope),',
  '  zz = tostring(zz),',
  '  aa = tostring(aa),',
  '  tArr = type(arr),',
  '  arrN = (type(arr) == "table") and #arr or -1,',
  '  tBlob = type(blob),',
  '  readonly = tostring(readonly),',
  '  tSV = type(SV),',
  '}',
].join('\n');

(async () => {
  const hb = ipc.readHeartbeat(HOST);
  console.log('桥 ' + hb.bridge + ' · ' + hb.hostName + ' ' + hb.version + ' · age ' + Math.round(ipc.heartbeatAgeSec(HOST)) + 's');

  const cases = [
    ['只有标量额外键', { code: CODE, readonly: true, zz: 7, aa: 'hello' }],
    ['标量 + 数组', { code: CODE, readonly: true, zz: 7, aa: 'hello', arr: [1, 2, 3] }],
    ['标量 + 表', { code: CODE, readonly: true, zz: 7, aa: 'hello', arr: [1, 2, 3], blob: { k: 'v' } }],
    ['scope 放在最前', { scope: { x: 42 }, code: CODE, readonly: true, zz: 7, aa: 'hello' }],
  ];

  for (const [label, args] of cases) {
    const r = await ipc.fileIpcSend('run_script', args, { host: HOST, timeoutMs: 12000 });
    const raw = r.ok ? r.result : null;
    const o = raw && raw.resultType !== undefined ? raw.result : raw;
    console.log('  ' + label + ' → ' + (r.ok ? JSON.stringify(o) : 'ERR ' + r.error));
  }
})().catch((e) => { console.error('异常：' + e.message); process.exit(2); });
