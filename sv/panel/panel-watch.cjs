#!/usr/bin/env node
/**
 * 面板链路观测 / 注入工具（2026-09-15 新增，真机验收用）
 *
 * 链路（见 docs/SidePanel桥设计.md）：
 *   面板(JS) ⇄ project scriptData ⇄ Lua 桥 0.3.7 ⇄ jsonl ⇄ 本工具（扮演"客户端"）
 *
 * 用途：
 *   ① `--follow`  实时跟读**面板 → 客户端**的事件（用户在面板里打字/点按钮时，这里立刻打印）
 *   ② `--status`  一次性状态快照：桥心跳（版本 / panel 能力 / 存活）+ 两侧 jsonl 大小 + 末几行
 *   ③ `--push`    扮演客户端往**面板**推内容（append / ask / clear / hello），验证显示侧
 *
 * 用法：
 *   node sv/panel/panel-watch.cjs ix --status
 *   node sv/panel/panel-watch.cjs ix --follow                 # 常驻跟读（Ctrl+C 退出）
 *   node sv/panel/panel-watch.cjs ix --push append --text "测试：桥→面板"
 *   node sv/panel/panel-watch.cjs ix --push ask --title "选一个" --options "方案A,方案B" --multi --text "请选择"
 *   node sv/panel/panel-watch.cjs ix --push clear
 *   node sv/panel/panel-watch.cjs ix --push hello --text "手动问候"
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const HOST = (argv[0] === 'sv' || argv[0] === 'ix') ? argv[0] : 'ix';
const rest = argv.filter((a) => a !== HOST);
const FLAG = (n) => rest.includes(n);
const OPT = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };

const DIR = process.env.TEMP || process.env.TMP || '.';
const F_OUT = path.join(DIR, `akdagent-panel-${HOST}.jsonl`);      // 面板 → 客户端
const F_IN = path.join(DIR, `akdagent-panel-in-${HOST}.jsonl`);    // 客户端 → 面板
const F_HB = path.join(DIR, `akdagent-hb-${HOST}.json`);
const F_LOG = path.join(DIR, `akdagent-log-${HOST}.txt`);

const ts = () => new Date().toLocaleTimeString('zh-CN', { hour12: false });
function readHb() { try { return JSON.parse(fs.readFileSync(F_HB, 'utf8')); } catch { return null; } }
function sizeOf(f) { try { return fs.statSync(f).size; } catch { return -1; } }
function tail(f, n) {
  try { const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean); return lines.slice(-n); }
  catch { return []; }
}

/* ── ③ 注入：客户端 → 面板 ── */
function push() {
  const kind = OPT('--push');
  const ev = { v: 1, seq: Date.now(), at: new Date().toISOString(), kind };
  if (kind === 'append' || kind === 'hello') ev.text = OPT('--text') || '(空)';
  if (kind === 'ask') {
    const opts = String(OPT('--options') || '').split(',').map((s) => s.trim()).filter(Boolean);
    ev.id = OPT('--id') || ('q' + Date.now());
    ev.title = OPT('--title') || '请选择';
    ev.options = opts.map((label, i) => ({ id: 'o' + (i + 1), label }));
    ev.multi = FLAG('--multi');
    ev.text = OPT('--text') || (ev.title + '\n' + opts.map((l, i) => `${i + 1}. ${l}`).join('\n'));
    if (FLAG('--free')) ev.textInput = { label: '补充说明' };
  }
  fs.appendFileSync(F_IN, JSON.stringify(ev) + '\n', 'utf8');
  console.log(`已注入 → ${F_IN}`);
  console.log('  ' + JSON.stringify(ev));
  console.log('');
  console.log('提示：桥每 ~2 拍读一次该文件并写进 scriptData ⇒ 面板应在 1 秒内刷新。');
}

/* ── ② 状态快照 ── */
function status() {
  const hb = readHb();
  console.log(`== 面板链路状态（host=${HOST}）==`);
  if (hb) {
    const age = Math.round(Date.now() / 1000 - hb.ts);
    console.log(`桥：${hb.bridge} · panel=${hb.panel === undefined ? '（无此字段 ⇒ 旧桥，需重跑 0.3.7）' : hb.panel}` +
      ` · 宿主 ${hb.hostName} ${hb.version}(${hb.hostVersionNumber}) · 心跳 ${age}s 前 ${age <= 15 ? '✅ 存活' : '⚠️ 已过期（桥没在跑）'}` +
      ` · pollTicks=${hb.pollTicks}`);
  } else console.log('桥：没有心跳文件（宿主里还没跑过桥）');
  for (const [label, f] of [['面板→客户端', F_OUT], ['客户端→面板', F_IN]]) {
    const s = sizeOf(f);
    console.log(`${label}：${s < 0 ? '（还没有文件）' : s + ' 字节'}  ${f}`);
  }
  const out = tail(F_OUT, 5);
  if (out.length) { console.log('\n最近 5 条面板事件：'); out.forEach((l) => console.log('  ' + l)); }
  const logLines = (() => { try { return fs.readFileSync(F_LOG, 'utf8').split(/\r?\n/).filter((l) => l.includes('panel')); } catch { return []; } })();
  if (logLines.length) { console.log('\n桥日志里含 panel 的行（末 5 条）：'); logLines.slice(-5).forEach((l) => console.log('  ' + l)); }
}

/* ── ① 跟读：面板 → 客户端 ── */
function follow() {
  console.log(`== 跟读面板事件（host=${HOST}）==`);
  console.log(`监听：${F_OUT}`);
  console.log('（你在 IX 侧栏面板里打字/点按钮，这里会立刻出现；Ctrl+C 退出）\n');
  let offset = 0;
  let lastHbSig = '';
  let lastLogLen = (() => { try { return fs.statSync(F_LOG).size; } catch { return 0; } })();
  // 已有的旧事件先不重复打印，从当前末尾开始
  offset = Math.max(0, sizeOf(F_OUT));

  const tick = () => {
    try {
      const hb = readHb();
      if (hb) {
        const sig = `${hb.bridge}|${hb.panel}|${hb.pollTicks}`;
        if (sig !== lastHbSig) {
          lastHbSig = sig;
          const age = Math.round(Date.now() / 1000 - hb.ts);
          console.log(`[${ts()}] 桥状态：bridge=${hb.bridge} panel=${hb.panel === undefined ? '（无）' : hb.panel} 心跳 ${age}s 前 pollTicks=${hb.pollTicks}`);
        }
      }
      const size = sizeOf(F_OUT);
      if (size > offset) {
        const fd = fs.openSync(F_OUT, 'r');
        const len = size - offset;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, offset);
        fs.closeSync(fd);
        offset = size;
        for (const line of buf.toString('utf8').split(/\r?\n/)) {
          if (!line.trim()) continue;
          let ev = null;
          try { ev = JSON.parse(line); } catch { console.log(`[${ts()}] （坏 JSON）${line}`); continue; }
          const mark = { input: '⌨️ 用户输入', answer: '✅ 确认', skip: '⏭ 跳过', stop: '⏹ 停止' }[ev.kind] || ('❔' + ev.kind);
          const detail = ev.text ? `「${ev.text}」` : (ev.picked ? `picked=${JSON.stringify(ev.picked)}${ev.text ? ' text=' + ev.text : ''}` : '');
          console.log(`[${ts()}] ${mark} ${detail}   ${JSON.stringify(ev)}`);
        }
      }
      // 桥日志里新增的 panel 行（诊断用）
      const logLines = (() => { try { const t = fs.readFileSync(F_LOG, 'utf8'); if (t.length > lastLogLen) { const add = t.slice(lastLogLen); lastLogLen = t.length; return add.split(/\r?\n/).filter((l) => l.includes('panel')); } } catch { /* 忽略 */ } return []; })();
      for (const l of logLines) console.log(`[${ts()}] 桥日志：${l.trim()}`);
    } catch (e) { console.log(`[${ts()}] 跟读异常（已忽略）：${e.message}`); }
    setTimeout(tick, 400);
  };
  tick();
}

if (FLAG('--push')) push();
else if (FLAG('--status')) status();
else { status(); console.log('\n' + '-'.repeat(60) + '\n'); follow(); }
