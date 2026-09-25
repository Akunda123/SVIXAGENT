#!/usr/bin/env node
/*
 * tools.ts 丢字修复「计划生成器」（只读，产出可复核的清单）
 * =====================================================================
 * 背景：`server/src/tools.ts` 有系统性丢字，且 `dist/tools.js` 残缺位置**逐字相同**、
 * 无 .git、镜像文档被 `…` 截断 ⇒ **没有完好副本，只能语义重写**。
 *
 * 本脚本把每一处损伤分成两类，便于分别处理：
 *   A 类｜**确定可修**：目标词由上下文唯一确定，脚本能给出**逐字建议**
 *       （补 `）`、`默`→`默认`、`测音`→`测音频`、`范`→`范围`、`索引  起`→`索引（0 起）`、
 *         `第一 X`→`第一个 X`、`任 X`→`任意 X`）
 *   B 类｜**需人工判断**：缺整句 / 缺连接词 / 括号内容不明（如 `（ 'la'   love'）`、`<文件 _separated/`）
 *
 * 产出：`docs/tools.ts丢字清单.md`（含行号、原文、建议、依据）＋ 控制台分类汇总。
 * 用法：node tools/plan-desc-repair.cjs [srcPath]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ARGS = process.argv.slice(2);
const IS_APPLY = ARGS.includes('--apply');
const FILE_ARG = ARGS.find((a) => !a.startsWith('--'));
const file = FILE_ARG || path.join(root, 'server', 'src', 'tools.ts');
const src = fs.readFileSync(file, 'utf8');

/** 词法扫描：含中文、≥6 字的字面量。
 *  ⚠️ 关键：**跨行拼接**（`"...甲" +\n "...乙"`）必须**合并成一条**再判断 ——
 *  否则词法器会把长描述当成多条碎片，"补括号"会插到句子中间（实测踩到）。 */
function literals(code) {
  const out = [];
  let i = 0, line = 1;
  const n = code.length;

  const skipWs = (j) => {
    let ln = 0;
    while (j < n && /\s/.test(code[j])) { if (code[j] === '\n') ln++; j++; }
    return [j, ln];
  };

  const readQuote = (j, quote) => {
    let buf = '', ln = 0;
    j++;
    while (j < n) {
      const ch = code[j];
      if (ch === '\\') { buf += code[j + 1] || ''; if (code[j + 1] === '\n') ln++; j += 2; continue; }
      if (ch === quote) { j++; break; }
      if (ch === '\n') { ln++; if (quote !== '`') { j++; break; } }
      buf += ch; j++;
    }
    return [buf, j, ln];
  };

  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const startLine = line;
      let [buf, j, ln] = readQuote(i, c);
      line += ln; i = j;
      // 合并 `+ "..."` 续接的片段
      for (;;) {
        const [k, ln2] = skipWs(i);
        if (code[k] !== '+') break;
        const [k2, ln3] = skipWs(k + 1);
        const q = code[k2];
        if (q !== '"' && q !== "'" && q !== '`') break;
        const [buf2, j2, ln4] = readQuote(k2, q);
        buf += buf2; i = j2; line += ln2 + ln3 + ln4;
      }
      out.push({ text: buf, line: startLine });
      continue;
    }
    i++;
  }
  return out;
}

/** A 类规则：每条形如 [检测正则, 替换, 依据] —— 替换目标由上下文唯一确定 */
/** B 类中**有依据、可确定**的补丁（显式 old→new，不用正则）。
 *  依据来源：`knowledge/docs/MCP工具清单.md` 同一描述的镜像 —— 它每格**尾部**被 `…` 截断，
 *  但**靠前的文字是完好的**，可逐字比对恢复（这比"猜"可靠得多）。 */
const B_CONFIDENT = [
  ['歌词统一设置为指定文本（ \'la\'   love\'）', '歌词统一设置为指定文本（如 \'la\'、\'啊\'、\'love\'）'],   // 镜像 MCP工具清单:33
  ['输入可为任意 mpg123 可解码格式， 44.1kHz', '输入可为任意 mpg123 可解码格式，非 44.1kHz'],           // 镜像 :38
  ['（人声优先模型， vocal）', '（人声优先模型，取 vocal）'],                                          // 镜像 :39
  ['（音 起止时间）', '（音高+起止时间）'],                                                            // 镜像 :43
  ['key( C/Am/F)', 'key(如 C/Am/F)'],                                                                  // 镜像 :44
  ['（ JS Krumhansl）', '（纯 JS Krumhansl）'],                                                        // 镜像 :45
  ['——来 sv_generate_melody  keyRoot', '——来自 sv_generate_melody 的 keyRoot'],                        // 镜像 :45
  [' Synthesizer V 内执行一段脚本（ES5.1）， AKDAgent Bridge  run_script op  eval 执行',
   '在 Synthesizer V 内执行一段脚本（ES5.1），由 AKDAgent Bridge 的 run_script op 用 eval 执行'],        // 镜像 :46
  ['（ 150 实际 120）', '（如 150 实际 120）'],                                                        // 镜像 :47
  ['（ vocoder 才能移植', '（同 vocoder 才能移植'],                                                    // 镜像 :51
  ['直接从波形 chroma 2 音级能量曲线）', '直接从波形算 chroma（12 音级能量曲线）'],                      // 镜像 :54
  ['得调 BPM', '得调性/BPM'],                                                                          // 镜像 :55
  ['载荷过大 {payloadLen}', '载荷过大（{payloadLen}'],                                                  // 缺开头括号
  ['musicxml  .xml', 'musicxml/.xml'],                                                                 // 同 wav/mp3 类
  ['返 [{midi', '返回 [{midi'],                                                                        // 「返回」缺「回」
  ['SV  pitch 曲线', 'SV 的 pitch 曲线'],                                                              // 缺「的」
  ['（默认  note=对齐', '（默认）；note=对齐'],                                                         // 缺「）；」
  ['BPM  Synthesizer V 工程', 'BPM 在 Synthesizer V 工程'],                                             // 缺「在」
];

const A_RULES = [
  [/（默[ \t]+([a-zA-Z0-9])/g, '（默认 $1', '「默认」丢了「认」（上下文唯一）'],
  [/默[ \t]+([a-zA-Z0-9])/g, '默认 $1', '「默认」丢了「认」'],
  [/测音[ \t]+([A-Z])/g, '测音频 $1', '「测音频」丢了「频」'],
  [/范[ \t]*(-?\d)/g, '范围 $1', '「范围」丢了「围」'],
  [/索引[ \t]{2,}起/g, '索引（0 起', '索引基准被吃掉；轨道/音频轨索引均为 0 起'],
  [/part[ \t]{2,}起/g, 'part（1 起', 'part 参数 1 起（tools.ts 里 `part - 1` 即证）'],
  [/第一[ \t]+([a-z])/g, '第一个 $1', '「第一个」丢了「个」'],
  [/任[ \t]+([a-z])/g, '任意 $1', '「任意」丢了「意」'],
  [/wav[ \t]{2,}mp3/g, 'wav/mp3', '「wav/mp3」丢了「/」'],
  [/伴[ \t]+(WAV|wav)/g, '伴奏 $1', '「伴奏」丢了「奏」'],
  [/生成旋[ \t]+MIDI/g, '生成旋律 MIDI', '「生成旋律」丢了「律」'],
];

/** B 类线索（只报不改） */
const B_HINTS = [
  [/\S[ \t]{2,}\S/, '出现连续空格 —— 可能是被吃掉的单个字符留下的空位'],
  [/（[^）]*$/, '括号未闭合且内容不像能直接补「）」'],
  [/[（(][ \t]/, '左括号后紧跟空格'],
];

const lits = literals(src).filter((s) => /[\u4e00-\u9fff]/.test(s.text) && s.text.length >= 6);
const planA = [], planB = [];

for (const s of lits) {
  let fixed = s.text;
  const reasons = [];
  for (const [re, rep, why] of A_RULES) {
    if (re.test(fixed)) { fixed = fixed.replace(re, rep); reasons.push(why); }
    re.lastIndex = 0;
  }
  // 未闭合的全角括号：差值恰为 1 且结尾不是 ） ⇒ 补一个
  const open = (fixed.match(/（/g) || []).length;
  const close = (fixed.match(/）/g) || []).length;
  if (open - close === 1 && !/）\s*$/.test(fixed)) {
    fixed = fixed.replace(/\s*$/, '') + '）';
    reasons.push('全角括号未闭合，在结尾补「）」');
  }
  if (reasons.length && fixed !== s.text) {
    planA.push({ line: s.line, before: s.text, after: fixed, why: reasons.join(' · ') });
  } else {
    const hints = B_HINTS.filter(([re]) => { re.lastIndex = 0; return re.test(s.text); }).map(([, w]) => w);
    if (hints.length) planB.push({ line: s.line, text: s.text, why: hints.join(' · ') });
  }
}

const L = [];
L.push('# `server/src/tools.ts` 丢字修复清单（自动生成 · 只读分析）', '');
L.push(`> 生成器：\`tools/plan-desc-repair.cjs\`（词法解析，非逐行正则）`);
L.push(`> 扫描：**${lits.length}** 条含中文字面量 ⇒ **A 类可修 ${planA.length} 条** · **B 类需人工 ${planB.length} 条**`, '');
L.push('> ⚠️ 前置事实：`server/dist/tools.js` 的残缺位置与 src **逐字相同**；无 `.git`；');
L.push('> `knowledge/docs/MCP工具清单.md` 每格以 `…` 截断 ⇒ **没有完好副本，只能语义重写**（详见 `docs/待办.md §11.1`）。', '');
L.push('## A 类：确定可修（建议直接照改）', '');
L.push('| 行 | 原文 | 建议改为 | 依据 |', '|---|---|---|---|');
for (const p of planA) {
  L.push(`| ${p.line} | \`${p.before.replace(/\|/g, '\\|')}\` | \`${p.after.replace(/\|/g, '\\|')}\` | ${p.why} |`);
}
L.push('', '## B 类：需人工判断（缺整句 / 连接词 / 括号内容不明）', '');
L.push('| 行 | 原文（截断） | 线索 |', '|---|---|---|');
for (const p of planB) {
  L.push(`| ${p.line} | \`${p.text.slice(0, 70).replace(/\|/g, '\\|')}${p.text.length > 70 ? '…' : ''}\` | ${p.why} |`);
}
L.push('', '## 处理建议', '');
L.push('- **A 类先修**（恢复的是**事实**：默认值、数值范围、单位、索引基准、括号闭合），改完跑 `server/scripts/check-desc-corruption.cjs` 复核');
L.push('- **B 类逐条过**：其中「缺整句」的最费工（要重新组织语言），但**不影响模型可用性**程度最低；「缺连接词」如 `返 vocal.wav  accompaniment.wav` 建议补成 `返回 … 与 …`');
L.push('- 改完必须 `npm run build` 重编 `dist`（MCP 进程**常驻**，需**重启 DSH 会话**才生效）');

const out = path.join(root, 'docs', 'tools.ts丢字清单.md');
fs.writeFileSync(out, L.join('\n'), 'utf8');
console.log(`含中文字面量：${lits.length}`);
console.log(`A 类可修：${planA.length} 条`);
console.log(`B 类需人工：${planB.length} 条`);
console.log(`清单：${out}`);

// —— 应用模式：node tools/plan-desc-repair.cjs --apply
// 只应用 **A 类**（目标词由上下文唯一确定）。做法：直接在**字面量文本**层面做整串替换
// （同一文本出现多次就全部替换，因为修法相同）。写前自动备份 .bak，写后用检测器复核。
if (IS_APPLY) {
  const bak = file + '.bak';
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  let body = src, applied = 0, missed = [], skipped = [], bApplied = 0, bMissed = [];
  // ⚠️ 必须**按 before 文本去重**：同一段描述可能在文件里出现多次（如
  //    「输入音频文件绝对路径（wav  mp3」在 201/229 各一次），逐条 split/join 会让
  //    第二遍再次命中（因为 after 以 before 为前缀）⇒ 补出 `））`（已实测踩到）。
  //    再加一道幂等闸：若目标文本已经存在，直接跳过。
  const seen = new Set();
  for (const p of planA) {
    if (p.before === p.after) continue;
    if (seen.has(p.before)) { skipped.push(p.line); continue; }
    seen.add(p.before);
    if (body.includes(p.after)) { skipped.push(p.line); continue; }
    if (body.includes(p.before)) {
      body = body.split(p.before).join(p.after);
      applied++;
    } else {
      missed.push(p.line);
    }
  }
  // 再应用 B 类中有依据的确定补丁（显式 old→new）
  for (const [oldS, newS] of B_CONFIDENT) {
    if (!body.includes(oldS)) { bMissed.push(oldS.slice(0, 24)); continue; }
    body = body.split(oldS).join(newS);
    bApplied++;
  }
  fs.writeFileSync(file, body, 'utf8');
  console.log(`\n【已应用】A 类替换 ${applied} 处${missed.length ? `，未命中 ${missed.length} 处（行 ${missed.join(',')}）` : ''}${skipped.length ? `，去重/幂等跳过 ${skipped.length} 处（行 ${skipped.join(',')}）` : ''}`);
  console.log(`【已应用】B 类（有依据的确定补丁）${bApplied} 处${bMissed.length ? `，未命中 ${bMissed.length} 处：${bMissed.join(' | ')}` : ''}`);
  console.log(`备份：${bak}`);
} else {
  console.log('\nA 类前 12 条：');
  planA.slice(0, 12).forEach((p) => {
    console.log(`  行 ${p.line}`);
    console.log(`    原: ${p.before.slice(0, 78)}`);
    console.log(`    改: ${p.after.slice(0, 78)}`);
  });
  console.log('\n（加 --apply 即应用 A 类全部改动）');
}
