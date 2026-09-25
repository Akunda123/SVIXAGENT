#!/usr/bin/env node
/**
 * 从 pinyin-pro 自带的反查词典（dist/esm/data/dict1.mjs：带调拼音 → 汉字）生成
 * `server/src/lyric/homophones.ts`（"shou3" → [手, 首, …]）。
 *
 * 用途：作词检查里的**谐音**判据 —— 旋律把某个字"唱成了别的调"（或整句连读）时，
 * 拿这张表给出"听起来可能像哪些字"的候选（参考级，最终由人/模型定）。
 *
 * 用法：node tools/gen-homophones.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DICT = path.join(ROOT, "server", "node_modules", "pinyin-pro", "dist", "esm", "data", "dict1.mjs");
const OUT = path.join(ROOT, "server", "src", "lyric", "homophones.ts");
const CAP = 12;          // 每个音（音节+声调）最多留几个候选字（**排序之后**才截断）
const POOL = 400;        // 收集阶段的上限（只防爆内存，不做筛选）
const MIN_CHAR = 0x4e00; // 只留 CJK 基本区

(async () => {
  if (!fs.existsSync(DICT)) {
    console.error("找不到 pinyin-pro 词典：" + DICT);
    process.exit(1);
  }
  const mod = await import("file://" + DICT.replace(/\\/g, "/"));
  const raw = mod.default || mod.DICT1;
  if (!raw || !Array.isArray(raw.NumberDICT)) {
    console.error("词典结构不符预期：raw.NumberDICT 不是数组");
    process.exit(1);
  }
  const buckets = new Map();   // "shou3" -> Set<char>

  // 带调拼音符号 → 音节+数字声调（"shǒu" → "shou3"）。
  // 注意：pinyin() 只吃汉字，喂拼音串会原样返回，所以这里自己转。
  const TONE_MAP = {
    "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
    "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
    "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
    "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
    "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
    "ǖ": ["ü", 1], "ǘ": ["ü", 2], "ǚ": ["ü", 3], "ǜ": ["ü", 4],
    "ń": ["n", 2], "ň": ["n", 3], "ǹ": ["n", 4], "ḿ": ["m", 2],
  };
  function toNumTone(syll) {
    let tone = 0, out = "";
    for (const ch of syll) {
      const hit = TONE_MAP[ch];
      if (hit) { out += hit[0]; tone = hit[1]; }
      else if (/[a-zü]/i.test(ch)) out += ch.toLowerCase();
      else return "";                       // 含非拼音字符（如数字/撇号）就放弃
    }
    if (!tone) return /[1-5]$/.test(out) ? out : "";   // 本来就带数字声调的直接用
    return out + tone;
  }

  let keys = 0;
  // 词频代理：用词典里的**多字词**（StringDICT 的键）统计每个字出现次数 ——
  // 出现在常用词里的字更常用，用它给候选排序，能把「伌/僾/儗」这类生僻字压下去。
  const freq = new Map();
  const addFreq = (obj, weight) => {
    if (!obj) return;
    for (const word of Object.keys(obj)) {
      for (const ch of String(word)) {
        const cp = ch.codePointAt(0);
        if (cp >= MIN_CHAR && cp <= 0x9fff) freq.set(ch, (freq.get(ch) || 0) + weight);
      }
    }
  };
  // dict2/3 = 常用词，dict4 = 成语/长词；权重高的是"常见词里的字"
  const dataDir = path.dirname(DICT);
  for (const [file, w] of [["dict2.mjs", 3], ["dict3.mjs", 3], ["dict4.mjs", 1]]) {
    try {
      const m = await import("file://" + path.join(dataDir, file).replace(/\\/g, "/"));
      addFreq(m.default || m[file.replace(".mjs", "").toUpperCase()], w);
    } catch { /* 词典缺席不影响主流程 */ }
  }
  // 再用多字词键兜一层（dict1 的 StringDICT）
  if (raw.StringDICT instanceof Map) {
    for (const word of raw.StringDICT.keys()) {
      for (const ch of String(word)) {
        const cp = ch.codePointAt(0);
        if (cp >= MIN_CHAR && cp <= 0x9fff) freq.set(ch, (freq.get(ch) || 0) + 1);
      }
    }
  }
  // dict1 = 汉字→拼音（FastDictFactory：单字在 NumberDICT[charCode]，多字词在 StringDICT）。
  // 我们**反着枚举**它，得到"音节+声调 → 字"。
  const nd = raw.NumberDICT || [];
  for (let code = 0; code < nd.length; code++) {
    const py = nd[code];
    if (!py) continue;
    const ch = String.fromCharCode(code);
    const cp = ch.codePointAt(0);
    if (cp < MIN_CHAR || cp > 0x9fff) continue;
    keys++;
    for (const syll of String(py).split(/\s+/)) {
      if (!syll) continue;
      const num = toNumTone(syll);
      if (!num || !/[1-5]$/.test(num)) continue;          // 只收"带数字声调"的音节
      const bucket = buckets.get(num) || new Set();
      if (bucket.size < POOL) bucket.add(ch);
      buckets.set(num, bucket);
    }
  }

  const sorted = [...buckets.entries()]
    .filter(([, s]) => s.size > 1)
    .map(([k, s]) => [k, [...s].sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0)).slice(0, CAP)])
    .sort((a, b) => a[0].localeCompare(b[0]));

  const lines = [];
  lines.push("// 本文件由 tools/gen-homophones.cjs 生成，请勿手改。");
  lines.push("// 数据源：pinyin-pro（MIT）自带反查词典 dist/esm/data/dict1.mjs（带调拼音 → 汉字）。");
  lines.push(`// 共 ${sorted.length} 个音节（键 = 音节+数字声调，如 \"shou3\"），每音节最多 ${CAP} 个候选字。`);
  lines.push("// 用途：作词检查的**谐音**判据 —— 旋律把字唱成别的调时，给\"听起来像哪些字\"的候选（参考级）。");
  lines.push("");
  lines.push("export const HOMOPHONES: Record<string, string[]> = {");
  for (const [k, set] of sorted) {
    lines.push(`  ${JSON.stringify(k)}: [${[...set].map((c) => JSON.stringify(c)).join(", ")}],`);
  }
  lines.push("};");
  lines.push("");
  lines.push("/** 取某音（音节+数字声调）的候选同音字；去掉「字本身」 */");
  lines.push("export function homophoneCandidates(syllableTone: string, exclude?: string): string[] {");
  lines.push("  const list = HOMOPHONES[syllableTone] || [];");
  lines.push("  return exclude ? list.filter((c) => c !== exclude) : list.slice();");
  lines.push("}");
  lines.push("");

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`✅ 生成 ${path.relative(ROOT, OUT)}：${sorted.length} 个音节 · ${keys} 条词典键 · ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
  console.log("   样例：" + sorted.slice(0, 3).map(([k, s]) => `${k}=${[...s].slice(0, 6).join("")}`).join(" · "));
})();
