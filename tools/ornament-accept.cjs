// ============================================================================
// ornament-accept.cjs —— 装饰音 / 参数自动化的**真机验收**小工具（走文件通道，不经 MCP）
// ============================================================================
// 为什么要它：新 op 刚进桥时，MCP server 往往还没重启（工具列表里看不到新工具）。
// 这个脚本直接用 server/dist/fileipc.js 发 op，等于把 MCP 那一层换成命令行，
// 从而**当天就能验桥**，不必等重启。
//
// 用法（参数一律 ASCII 输出到 stdout —— 中文会走 GBK 控制台变乱码）：
//   node tools/ornament-accept.cjs ping
//   node tools/ornament-accept.cjs notes
//   node tools/ornament-accept.cjs plan  <kind> [--indices 0,1] [--interval 2] [--dir below]
//                                              [--len 0.125] [--headLen 0.125] [--steps 3] [--df 1]
//   node tools/ornament-accept.cjs write <kind> [同上] [--manual]
//   node tools/ornament-accept.cjs attr  <index>            # 读某音符的 SV1 属性
//   node tools/ornament-accept.cjs auto  <param> <onsetQ> <value> [--write]
//
// 完整回包（含中文）写到 --out 指定的文件（默认 %TEMP%\ornament-accept.json，UTF-8），
// 用 read 工具看那个文件即可，绕开控制台编码问题。
// ============================================================================
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
let ipc;
try {
  ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'));
} catch (e) {
  console.error('[FAIL] load server/dist/fileipc.js: ' + e.message + '  (run: npm --prefix server run build)');
  process.exit(2);
}

const argv = process.argv.slice(2);
const CMD = (argv[0] || '').toLowerCase();

function opt(name, dflt) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
function num(name) {
  const v = opt(name);
  if (v === undefined || v === true) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function indices() {
  const v = opt('indices');
  if (typeof v !== 'string' || !v.length) return undefined;
  return v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

const OUT = typeof opt('out') === 'string' ? opt('out') : path.join(os.tmpdir(), 'ornament-accept.json');

async function send(op, args, timeoutMs) {
  return ipc.fileIpcSend(op, args, { host: 'sv', timeoutMs: timeoutMs || 30000 });
}

// 剥壳：直连 fileIpc 常见两层（{result:{result:...}}），与 server 侧 unwrapResult 同口径
function unwrap(r) {
  let v = r;
  for (let i = 0; i < 3; i++) {
    if (v && typeof v === 'object' && 'result' in v) v = v.result;
    else break;
  }
  return v;
}

function report(label, payload) {
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log('[ok] ' + label + ' -> ' + OUT);
}

(async () => {
  try {
    if (CMD === 'ping') {
      const r = await send('ping', {}, 8000);
      report('ping', r);
      console.log('  bridge=' + r.bridge + ' isSV2=' + r.isSV2 +
        ' hasApplyOrnaments=' + (Array.isArray(r.ops) && r.ops.indexOf('apply_ornaments') >= 0) +
        ' hasSetAutomation=' + (Array.isArray(r.ops) && r.ops.indexOf('set_automation') >= 0));
      return;
    }

    if (CMD === 'notes') {
      const r = await send('run_script', {
        readonly: true,
        code: [
          'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
          'local out = {}',
          'for i = 1, g:getNumNotes() do',
          '  local n = g:getNote(i)',
          '  out[#out+1] = { i = i, index0 = i - 1, onsetQ = n:getOnset()/705600000,',
          '                  durQ = n:getDuration()/705600000, pitch = n:getPitch(),',
          '                  lyrics = n:getLyrics(), autoPitch = n:getPitchAutoMode() }',
          'end',
          'return { count = g:getNumNotes(), notes = out }',
        ].join('\n'),
      }, 15000);
      report('notes', r);
      const d = unwrap(r);
      if (d && d.notes) {
        console.log('  count=' + d.count);
        for (const n of d.notes) {
          console.log('   #' + n.index0 + ' onsetQ=' + n.onsetQ + ' durQ=' + n.durQ +
            ' pitch=' + n.pitch + ' auto=' + n.autoPitch + ' lyric=' + JSON.stringify(n.lyrics));
        }
      }
      return;
    }

    if (CMD === 'attr') {
      const idx = Number(argv[1]);
      const r = await send('run_script', {
        readonly: true,
        code: [
          'local g = SV:getMainEditor():getCurrentGroup():getTarget()',
          'local n = g:getNote(' + (idx + 1) + ')',
          'local a = n:getAttributes()',
          'local s = {}',
          'for k, v in pairs(a) do s[#s+1] = tostring(k) .. "=" .. tostring(v) end',
          'table.sort(s)',
          'return { index0 = ' + idx + ', pitch = n:getPitch(), attrs = s }',
        ].join('\n'),
      }, 15000);
      report('attr', r);
      const d = unwrap(r);
      if (d && d.attrs) console.log('  #' + idx + ' pitch=' + d.pitch + ' attrs=' + d.attrs.join(' '));
      return;
    }

    if (CMD === 'plan' || CMD === 'write') {
      const kind = argv[1];
      if (!kind) { console.error('usage: ' + CMD + ' <kind> [opts]'); process.exit(2); }
      const args = {
        ornament: kind,
        indices: indices(),
        interval: num('interval'),
        dir: typeof opt('dir') === 'string' ? opt('dir') : undefined,
        len: num('len'),
        headLen: num('headLen'),
        steps: num('steps'),
        df: num('df'),
        style: typeof opt('style') === 'string' ? opt('style') : undefined,
        manual: opt('manual') === true ? true : undefined,
        dyn: opt('dyn') === true ? true : undefined,
        dynDepth: num('dynDepth'),
        dynStep: num('dynStep'),
        dryRun: CMD === 'plan',
      };
      const r = await send('apply_ornaments', args, 30000);
      report(CMD + ' ' + kind, { request: args, response: r });
      const d = unwrap(r);
      if (d && d.plans) {
        console.log('  changed=' + d.changed + ' failed=' + (d.failed ? d.failed.length : 0) +
          ' scope=' + d.scope + ' isSv1=' + d.isSv1 + ' dyn=' + d.dyn);
        for (const p of d.plans) {
          console.log('   kind=' + p.kind + ' dir=' + p.dir + ' interval=' + p.interval +
            ' segs=' + (p.segs ? p.segs.length : 0));
          if (p.segs) for (const s of p.segs) {
            console.log('     ' + s.role + ' onsetQ=' + s.onsetQuarter + ' durQ=' + s.durQuarter +
              ' pitch=' + s.pitch + ' lyric=' + JSON.stringify(s.lyric) +
              (s.dF0Left !== undefined && s.dF0Left !== null ? ' dF0Left=' + s.dF0Left : ''));
          }
        }
        // 配套动态：打印基线与每个点（**形状应当闭合**）
        for (const a of (d.applied || [])) {
          const dy = a.dyn;
          if (!dy) continue;
          if (dy.skipped) { console.log('   [dyn skipped] ' + dy.reason); continue; }
          const pl = dy.plan || dy;
          if (pl.param) {
            console.log('   [dyn] param=' + pl.param + ' base=' + (dy.base !== undefined ? dy.base : '?'));
            for (const q of (pl.points || [])) {
              console.log('     dynQ=' + q.onsetQuarter + ' value=' + q.value +
                (q.clamped ? ' [clamped]' : '') + (q.readBack !== undefined ? ' readBack=' + q.readBack : ''));
            }
          }
        }
        if (d.failed) for (const f of d.failed) console.log('   [failed] #' + f.index);
      }
      return;
    }

    if (CMD === 'probe') {
      const param = argv[1];
      const v = opt('at');
      if (typeof v !== 'string') { console.error('usage: probe <param> --at 0,0.125,3.5'); process.exit(2); }
      const pts = v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      const r = await send('set_automation', { parameter: param, probe: pts }, 20000);
      report('probe ' + param, r);
      const d = unwrap(r);
      if (d && d.samples) for (const s of d.samples) {
        console.log('  q=' + s.onsetQuarter + ' value=' + s.value);
      }
      return;
    }

    if (CMD === 'auto') {
      const param = argv[1];
      const onsetQ = Number(argv[2]);
      const value = Number(argv[3]);
      const write = argv.indexOf('--write') >= 0;
      const args = { parameter: param, points: [{ onsetQuarter: onsetQ, value }], dryRun: !write };
      const r = await send('set_automation', args, 20000);
      report('auto ' + param, { request: args, response: r });
      const d = unwrap(r);
      if (d && d.applied) for (const a of d.applied) {
        console.log('  onsetQ=' + a.onsetQuarter + ' value=' + a.value +
          ' clamped=' + a.clamped + ' readBack=' + a.readBack + ' ok=' + a.ok);
      }
      return;
    }

    console.error('usage: ping | notes | attr <i> | plan <kind> | write <kind> | probe <param> --at a,b,c | auto <param> <onsetQ> <value> [--write]');
    process.exit(2);
  } catch (e) {
    console.error('[FAIL] ' + (e && e.message ? e.message : String(e)));
    process.exit(1);
  }
})();
