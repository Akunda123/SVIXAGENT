#!/usr/bin/env node
/*
 * 中文描述「丢字」检测器 v2（真词法解析版）
 * =====================================================================
 * 背景：本仓 `server/src/tools.ts` 曾发生**系统性丢字**（同一批字符被吃掉）：
 *   `索引（0 起）` → `索引  起）` · `测音频` → `测音` · `（默认` → `（默`
 *   `范围 -0.2~0.2` → `范 -0.2~0.2` · `第一个` → `第一 `
 * 而且 `server/dist/tools.js`（构建产物）**同样残缺**，仓里**没有完好副本**（无 .git），
 * 所以这类损伤只能靠**语义重写**恢复 —— 因此更需要一个能在改完后立刻发现复发的探针。
 *
 * v1 的教训：用「逐行正则取 `"..."`」会把**跨行拼接**与**引号奇偶错位**的代码片段当成字符串，
 * 于是「111 处可疑」里混着大量垃圾（还出现过 src/dist 各报 759 个汉字的巧合）。
 *
 * v2 改为**手写状态机**，按 TS 词法走：
 *   - 正确跳过 `//` 行注释与块注释（含注释里的引号与中文）
 *   - 正确识别 `"..."`、`'...'`、`"..."`（模板串）三种字面量，处理 `\` 转义
 *   - 跨行字符串拼接为一条，记起始行号
 *   - 只对**含中文且长度 ≥ 6** 的字面量做形态检测
 *
 * ⚠️ 命中只是**线索**，最终判据仍是**语义**（如「默 Tom」应为「默认 Tom」）。R8 括号不配对
 *    在 v2 中已消除跨行误报，但「作者本就想写半截括号」仍可能误报，需人眼确认。
 *
 * 用法：node check-desc-corruption.cjs [file]   默认 server/src/tools.ts
 * 退出码：1 = 有可疑项
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'src', 'tools.ts');
const src = fs.readFileSync(file, 'utf8');

/** 词法扫描：返回 [{ text, line, kind }] */
function literals(code) {
  const out = [];
  let i = 0, line = 1;
  const n = code.length;
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
      const quote = c, startLine = line;
      let buf = '';
      i++;
      while (i < n) {
        const ch = code[i];
        if (ch === '\\') { buf += code[i + 1] || ''; if (code[i + 1] === '\n') line++; i += 2; continue; }
        if (ch === quote) { i++; break; }
        if (ch === '\n') {
          line++;
          if (quote !== '`') { i++; break; }   // 普通引号不跨行（异常，截断即可）
        }
        buf += ch; i++;
      }
      out.push({ text: buf, line: startLine, kind: quote === '`' ? 'template' : 'string' });
      continue;
    }
    i++;
  }
  return out;
}

const RULES = [
  [/[\u4e00-\u9fff][ \t]{2,}[\u4e00-\u9fff]/, 'R1 中文之间连续空格（很可能丢字）'],
  [/[（(][ \t]/, 'R2 左括号后紧跟空格'],
  [/[\u4e00-\u9fff][ \t]+起[；）)]/, 'R3 「起」前悬空（基准数字被吃掉，应为「（0 起」）'],
  [/默[ \t]+[a-zA-Z0-9（]/, 'R4 「默」后缺「认」'],
  [/范[ \t]*-?\d/, 'R5 「范」后缺「围」'],
  [/测音[ \t]+/, 'R6 「测音」后缺「频」'],
  // ⚠️ R7 曾用 `中文 + 空格 + 术语` 当判据 —— 但**本文件本来就在拉丁术语两侧留空格**
  //    （如「输入 WAV 文件绝对路径」「测音频 BPM」），于是大量误报。
  //    收紧为**两个以上空格**才是丢字留下的空位。
  [/[\u4e00-\u9fff][ \t]{2,}(WAV|BPM|MIDI|ONNX|WASM|JSON|float32)/, 'R7 中文与术语之间有 2+ 空格（可能丢字）'],
];

const lits = literals(src);
const zh = lits.filter((s) => /[\u4e00-\u9fff]/.test(s.text) && s.text.length >= 6);
const hits = [];
for (const s of zh) {
  for (const [re, why] of RULES) {
    const m = re.exec(s.text);
    if (m) {
      const at = Math.max(0, m.index - 10);
      hits.push({ line: s.line, why, snippet: s.text.slice(at, m.index + 18) });
    }
  }
  const open = (s.text.match(/（/g) || []).length;
  const close = (s.text.match(/）/g) || []).length;
  if (open !== close) {
    hits.push({
      line: s.line,
      why: `R8 全角括号不配对（（${open} / ）${close}）`,
      snippet: s.text.slice(0, 46) + (s.text.length > 46 ? '…' : ''),
    });
  }
}

console.log(`文件：${file}`);
console.log(`字面量总数：${lits.length}（含中文且 ≥6 字的：${zh.length}）`);
console.log(`可疑命中：${hits.length}\n`);
for (const h of hits) {
  console.log(`  ${String(h.line).padStart(4)}  [${h.why}]`);
  console.log(`        …${h.snippet}…`);
}
process.exit(hits.length ? 1 : 0);
