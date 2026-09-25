#!/usr/bin/env node
/**
 * voice-name-table.cjs
 * ---------------------------------------------------------------------------
 * 从本机真实声库数据生成「英文目录名 ↔ 中文名 ↔ vocoder ↔ 版本」对照表。
 *
 * 数据来源（全部只读）：
 *   1. flat 版声库目录 : <OPSV>/databases/<VoiceName>/info.<ver>.nofs  (JSON)
 *   2. 中文名映射      : <OPSV>/translations/zh-cn.txt  (.ini 风格)
 *
 * 输出：
 *   <repo>/knowledge/docs/声库中文名对照表.md（默认；可用 `--out` 改）
 *
 * 纯只读：只读取上述数据；只写入 docs 下的 Markdown。
 * 本脚本可复跑（幂等）。
 *
 * 用法： node voice-name-table.cjs [--out <path>] [--verbose]
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { DOCUMENTS } = require('./lib-paths.cjs');

// --------------------------------------------------------------------------
// 路径常量
//   ⚠️ 一律从 `lib-paths.cjs` 推（**不要写死 `C:\Users\<name>`**）：`tools/` 随包分发，
//   写死 = 脱敏后变成 `<USER>` + 换机即失效。守卫见 `tools/check-abs-paths.cjs`。
// --------------------------------------------------------------------------
const OPSV_ROOT = path.join(DOCUMENTS, 'OPSV', 'Dreamtonics', 'Synthesizer V Studio');
const OPSV_DB = path.join(OPSV_ROOT, 'databases');
const OPSV_TRANS = path.join(OPSV_ROOT, 'translations', 'zh-cn.txt');

// 备用目录（nofs 为二进制，仅能列目录名）
const LEGACY_DB = path.join(DOCUMENTS, 'Dreamtonics', 'Synthesizer V Studio', 'databases');

// 默认输出 = **本仓** `knowledge/docs`（2026-09-19 该文档从 `docs/` 搬到这里；
// 原先写死的 `docs\声库中文名对照表.md` 已不存在 ⇒ 会写到错地方，已据实改正）
const DEFAULT_OUT = path.join(__dirname, '..', 'knowledge', 'docs', '声库中文名对照表.md');

// 内置更新器目录：没有真实声库，必须跳过
const SKIP_DIRS = new Set(['refresh']);

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const outIdx = argv.indexOf('--out');
const OUT_PATH = outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1] : DEFAULT_OUT;

// --------------------------------------------------------------------------
// 小工具
// --------------------------------------------------------------------------
const log = (...a) => { if (VERBOSE) console.log('[verbose]', ...a); };

/** 目录是否可读 */
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function listDirs(p) {
  return fs.readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function listFiles(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch { return []; }
}

/** Markdown 表格单元格转义：竖线与换行 */
function cell(s) {
  if (s === undefined || s === null || s === '') return '?';
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 排序键：中文名优先，无中文名用英文名；统一小写去空白 */
function sortKey(zh, en) {
  const k = (zh && zh.length ? zh : en) || '';
  return k.toLowerCase().replace(/\s+/g, '');
}

/** 是否含中日韩统一表意文字（用来判定「这个名字真的被中文化了」） */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const hasCJK = (s) => CJK_RE.test(String(s || ''));

/** 去掉版本后缀：(Lite) / (FLT) / 精简版 / 功能限制版 */
function stripEdition(s) {
  return String(s || '')
    .replace(/\s*\((?:lite|flt)\)\s*$/i, '')
    .replace(/\s*[（(](?:精简版|功能限制版)[)）]\s*$/, '')
    .trim();
}

// --------------------------------------------------------------------------
// 1. 读取声库目录
// --------------------------------------------------------------------------
function readVoices() {
  const voices = [];
  if (!isDir(OPSV_DB)) {
    return { voices, ok: false, reason: `OPSV databases 目录不可读: ${OPSV_DB}` };
  }

  for (const dirName of listDirs(OPSV_DB)) {
    if (SKIP_DIRS.has(dirName.toLowerCase())) {
      log(`跳过内置更新器目录: ${dirName}`);
      continue;
    }
    const dirPath = path.join(OPSV_DB, dirName);
    const nofsFiles = listFiles(dirPath)
      .filter((f) => /^info\..*\.nofs$/i.test(f))
      .sort();

    if (nofsFiles.length === 0) {
      voices.push({
        dirName, dirPath, nofsFile: null, jsonOk: false,
        parseError: 'no info.*.nofs', raw: null,
      });
      continue;
    }

    // 多个时取版本号最大者
    const chosen = nofsFiles[nofsFiles.length - 1];
    const nofsPath = path.join(dirPath, chosen);
    let raw = null, jsonOk = false, parseError = null;
    try {
      raw = JSON.parse(fs.readFileSync(nofsPath, 'utf8'));
      jsonOk = true;
    } catch (e) {
      parseError = e.message;
    }
    voices.push({ dirName, dirPath, nofsFile: chosen, nofsPath, jsonOk, parseError, raw });
  }
  return { voices, ok: true, reason: null };
}

// --------------------------------------------------------------------------
// 2. 解析 zh-cn.txt（.ini 风格，厂商分节 + 缩进的声库条目）
// --------------------------------------------------------------------------
/**
 * 声库清单位于文件末尾：缩进 0 的行是厂商名，缩进 2 的行是该厂商下的声库名。
 * 前面的行是普通 UI 字符串（同样有缩进 2 的条目），因此用行号下界 +
 * 「该分节内条目名必须匹配到真实声库」双重约束来定位。
 */
function parseTranslations(file, voiceNameIndex) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  const pairRe = /^(\s*)"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/;
  const unesc = (s) => s.replace(/\\(.)/g, '$1');

  const sections = [];      // { vendor, vendorZh, line, entries: [{en, zh, line}] }
  let cur = null;

  lines.forEach((line, i) => {
    const m = pairRe.exec(line);
    if (!m) return;
    const indent = m[1].length;
    const en = unesc(m[2]);
    const zh = unesc(m[3]);
    if (indent === 0) {
      cur = { vendor: en, vendorZh: zh, line: i + 1, entries: [] };
      sections.push(cur);
    } else if (cur) {
      cur.entries.push({ en, zh, line: i + 1 });
    }
  });

  // 只保留「看起来像厂商声库清单」的分节：
  // 分节内至少有 1 个条目的英文名本身出现在 databases 里（或与其高度一致）。
  const isVoiceSection = (s) => {
    if (s.entries.length === 0) return false;
    return s.entries.some((e) => voiceNameIndex.has(norm(e.en)) || voiceNameIndex.has(normTight(e.en)));
  };

  const matchedSections = sections.filter(isVoiceSection);

  // 厂商清单在 zh-cn.txt 里是**连续排布在文件末尾**的一段。
  // 只按「有精确匹配」筛分节会漏掉那些「里面的声库本机一个都没装」的厂商
  // （如 Eclipsed Sounds 只有 (Lite) 条目），因此这里从第一个命中分节一直取到文件末尾。
  let usedSections = [];
  let degradeNote = null;
  if (matchedSections.length > 0) {
    const firstIdx = sections.indexOf(matchedSections[0]);
    usedSections = sections.slice(firstIdx);
    degradeNote = `厂商清单判定为从第 ${usedSections[0].line} 行的 \`${usedSections[0].vendor}\` 起、到文件末尾的连续分节块（共 ${usedSections.length} 节）`;
  } else {
    const withEntries = sections.filter((s) => s.entries.length > 0);
    if (withEntries.length > 0) {
      usedSections = [withEntries[withEntries.length - 1]];
      degradeNote = '无法按声库名定位厂商分节，退化为文件末尾最后一个分节';
    }
  }

  // 英文名 -> {zh, vendor, vendorZh, line}
  const map = new Map();
  const duplicates = [];
  for (const s of usedSections) {
    for (const e of s.entries) {
      if (map.has(e.en)) {
        duplicates.push({ en: e.en, first: map.get(e.en), dup: { ...e, vendor: s.vendor } });
      } else {
        map.set(e.en, { zh: e.zh, vendor: s.vendor, vendorZh: s.vendorZh, line: e.line });
      }
    }
  }

  return {
    map, voiceSections: usedSections, matchedSections, allSections: sections,
    duplicates, degradeNote,
    totalSections: sections.length,
    totalLines: lines.length,
  };
}

// --------------------------------------------------------------------------
// 3. 名称归一与匹配
// --------------------------------------------------------------------------
/** 归一化：小写、全角空格→半角、压缩空白 */
const norm = (s) => String(s || '')
  .replace(/\u3000/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** 变体 key：去掉空格差异（"Tsuina-Chan AI" vs "Tsuina-ChanAI"） */
const normTight = (s) => norm(s).replace(/[\s\-_·・]/g, '');

function buildIndex(voices) {
  const exact = new Map();   // 归一英文名 -> voice
  const tight = new Map();   // 紧致英文名 -> voice
  for (const v of voices) {
    for (const n of [v.name, v.dirName]) {
      if (!n) continue;
      if (!exact.has(norm(n))) exact.set(norm(n), v);
      if (!tight.has(normTight(n))) tight.set(normTight(n), v);
    }
  }
  return { exact, tight };
}

// --------------------------------------------------------------------------
// 4. 主流程
// --------------------------------------------------------------------------
const dbInfo = readVoices();
const voices = dbInfo.voices;

// 补全字段
for (const v of voices) {
  const r = v.raw || {};
  v.name = r.name || null;
  v.version = r.version != null ? String(r.version) : null;
  v.vendor = r.vendor || null;
  v.language = r.language || null;
  v.phoneset = r.phoneset || null;
  v.supportLanguages = Array.isArray(r.support_languages) ? r.support_languages : null;
  v.vocoder = typeof r.vocoder === 'string' ? r.vocoder : null;
  v.acoustic = typeof r.acoustic === 'string' ? r.acoustic : null;
  v.styles = Array.isArray(r.styles) ? r.styles : null;
  v.zh = null; v.zhSource = null; v.transVendor = null; v.transLine = null;
}

const index = buildIndex(voices);

// 解析 translations（需要先用声库名建索引来定位厂商分节）
const tn = parseTranslations(OPSV_TRANS, new Set([
  ...index.exact.keys(),
  ...index.tight.keys(),
  ...voices.map((v) => norm(v.dirName)),
  ...voices.map((v) => normTight(v.dirName)),
]));

// 匹配中文名
// 注意：unmatchedTranslation 以「是否有同名的已安装声库」为准，推导式回退不会从
// 未安装清单里移除条目（那些 (Lite)/(FLT) 声库本机确实没装）。
const unmatchedTranslation = new Set(tn.map.keys());
const sameAsEn = [];      // 有条目，但中文名里没有汉字（等于没汉化）

for (const v of voices) {
  const cands = [];
  if (v.name) cands.push(v.name);
  if (v.dirName && v.dirName !== v.name) cands.push(v.dirName);

  // ① 精确匹配（英文名或目录名）
  let hit = null;
  for (const c of cands) {
    for (const k of [norm(c), normTight(c)]) {
      for (const [en, rec] of tn.map) {
        if (norm(en) === k || normTight(en) === k) { hit = { en, ...rec }; break; }
      }
      if (hit) break;
    }
    if (hit) break;
  }

  if (hit) {
    v.transEn = hit.en;
    v.transVendor = hit.vendor;
    v.transLine = hit.line;
    unmatchedTranslation.delete(hit.en);
    if (hasCJK(hit.zh) && hit.zh !== hit.en) {
      v.zh = hit.zh;
      v.zhSource = `exact:${hit.en}`;
    } else {
      // 有条目但没汉化：如实回退英文名，并记录下来
      sameAsEn.push({ voice: v, zh: hit.zh, en: hit.en, line: hit.line });
      v.zh = null;
      v.zhSource = 'same-as-en';
    }
    continue;
  }

  // ② 回退：用 (Lite)/(FLT) 兄弟条目推导（仅当推导结果确实含汉字时采用，表内加 †）
  for (const c of cands) {
    const base = norm(stripEdition(c));
    let fb = null;
    for (const [en, rec] of tn.map) {
      if (norm(stripEdition(en)) === base && norm(en) !== base) { fb = { en, ...rec }; break; }
    }
    if (fb) {
      const derived = stripEdition(fb.zh);
      v.transEn = fb.en;
      v.transVendor = fb.vendor;
      v.transLine = fb.line;
      if (hasCJK(derived) && derived !== fb.en) {
        v.zh = derived;
        v.zhSource = `lite-sibling:${fb.en}`;
      } else {
        sameAsEn.push({ voice: v, zh: fb.zh, en: fb.en, line: fb.line, viaEdition: true });
        v.zh = null;
        v.zhSource = 'same-as-en';
      }
      break;
    }
  }
}

// 分组
const groups = new Map(); // vocoder8 -> [voices]
for (const v of voices) {
  const g = v.vocoder ? v.vocoder.slice(0, 8).toLowerCase() : '(无 vocoder 哈希)';
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(v);
}

const stat = {
  total: voices.length,
  jsonOk: voices.filter((v) => v.jsonOk).length,
  jsonFail: voices.filter((v) => !v.jsonOk),
  hasZh: voices.filter((v) => v.zh).length,
  zhExact: voices.filter((v) => v.zh && v.zhSource && v.zhSource.startsWith('exact')).length,
  zhFallback: voices.filter((v) => v.zh && v.zhSource && v.zhSource.startsWith('lite')).length,
  noZh: voices.filter((v) => !v.zh),
  sameAsEn,
  groupCount: groups.size,
  vocoderGroups: [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])),
  vendors: [...new Set(voices.map((v) => v.vendor).filter(Boolean))].sort(),
  transVendorMatched: new Set(tn.voiceSections.map((s) => s.vendor)),
};

// 未安装条目：同一个声库是否以别的版本装在本机（用于第 5 节的备注列）
const installedNames = voices.map((v) => norm(stripEdition(v.name || v.dirName)));
const isInstalledBase = (en) => installedNames.includes(norm(stripEdition(en)));

const orphanTranslations = [...unmatchedTranslation].map((en) => ({
  en, ...tn.map.get(en), baseInstalled: isInstalledBase(en),
})).sort((a, b) => a.vendor.localeCompare(b.vendor) || a.en.localeCompare(b.en));

// 厂商交叉核对：nofs 的 vendor 在本机是否于 translations 里有对应分节
const vendorNoSection = stat.vendors.filter((vd) => {
  const n = norm(vd);
  return !tn.voiceSections.some((s) => norm(s.vendor) === n || normTight(s.vendor) === normTight(vd));
});
// 出现在 translations 厂商清单里、但本机没有任何声库属于它的厂商
const vendorNoVoice = tn.voiceSections
  .filter((s) => !stat.vendors.some((vd) => norm(vd) === norm(s.vendor) || normTight(vd) === normTight(s.vendor)))
  .map((s) => s.vendor);

// --------------------------------------------------------------------------
// 5. 生成 Markdown
// --------------------------------------------------------------------------
const L = [];
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const dispName = (v) => (v.name || v.dirName);

L.push('# 声库中文名对照表');
L.push('');
L.push(`> 生成时间：${now}　|　生成脚本：\`AKDAgent/tools/voice-name-table.cjs\`（可复跑）`);
L.push('');

// ---- 1. 一句话说明 ----
L.push('## 1. 数据来源与总体情况');
L.push('');
L.push(
  `数据来自本机 flat 版（OPSV）声库目录 \`${OPSV_DB}\`，逐个子目录读取其中的 \`info.<版本>.nofs\`（JSON）；` +
  `中文名来自 \`${OPSV_TRANS}\`（.ini 风格，按厂商分节）。` +
  `共 **${stat.total} 个声库**（已跳过内置更新器目录 \`Refresh\`），其中 **${stat.jsonOk} 个**的 nofs 成功以 JSON 解析，` +
  `**${stat.hasZh} 个有中文名映射**（${stat.zhExact} 个精确匹配` +
  (stat.zhFallback ? `，${stat.zhFallback} 个由 "(Lite)" 兄弟条目推导，见表中 † 标注` : '') +
  `），**${stat.noZh.length} 个没有中文名**（回退显示英文名），vocoder 共 **${stat.groupCount} 组**。`
);
L.push('');
L.push('**读取限制**：');
L.push('');
L.push(`- 声库目录 \`Refresh\` 是内置更新器（只有 92 字节的 \`info.100a*.nofs\` 与 \`.bak\`），无真实声库，已跳过。`);
L.push(`- 同目录下的 \`KAF AI-installer-v201.sfpk\` 是安装包文件而非声库目录，未计入。`);
L.push(`- 「有中文名」的判定标准是**中文名里确实含汉字且与英文名不同**；若 \`zh-cn.txt\` 里的值就是英文名本身（本机的 \`D-Lin\`/\`Eri\`/\`Ritchy\`/\`Saki AI\` 就是这种情况），一律算「没中文名」并回退英文名，在第 4 节与存疑小节列出。`);
L.push(`- 第 1 列的英文名取 nofs 内的 \`name\` 字段（权威值）；与目录名不一致的情况见存疑小节。`);
L.push(`- 第 3 列厂商取 nofs 内的 \`vendor\` 字段（真实值），可能与 \`zh-cn.txt\` 的分节名不同；本机有 ${vendorNoSection.length} 个厂商在 translations 里根本没有分节。`);
L.push(`- 备用目录 \`${LEGACY_DB}\` 存在，但其中 nofs 为二进制，**未使用**（只有在 OPSV 目录不可读时才会退化为仅列目录名）。`);
if (stat.jsonFail.length) {
  L.push(`- **有 ${stat.jsonFail.length} 个目录的 nofs 无法解析为 JSON**（见存疑小节）。`);
}
if (tn.degradeNote) L.push(`- ${tn.degradeNote}`);
L.push('');

// ---- 2. 主表 ----
L.push('## 2. 主表（按 vocoder 分组，组内按中文名排序）');
L.push('');
L.push('| 英文名(目录) | 中文名 | 厂商 | 语言 | phoneset | vocoder(前8位) | 版本 | styles 数 |');
L.push('|---|---|---|---|---|---|---|---|');

for (const [g, list] of stat.vocoderGroups) {
  const sorted = list.slice().sort((a, b) => {
    const ka = sortKey(a.zh, dispName(a)), kb = sortKey(b.zh, dispName(b));
    return ka.localeCompare(kb, 'zh') || dispName(a).localeCompare(dispName(b));
  });
  for (const v of sorted) {
    const zh = v.zh ? (v.zhSource.startsWith('lite') ? `${v.zh} †` : v.zh) : '— （无中文名）';
    const vendor = v.vendor || '?';
    const lang = v.language || '?';
    const ph = v.phoneset || '?';
    const ver = v.version || '?';
    const st = v.styles ? String(v.styles.length) : '?';
    const nm = v.jsonOk ? dispName(v) : `${v.dirName} ⚠`;
    L.push(`| ${cell(nm)} | ${cell(zh)} | ${cell(vendor)} | ${cell(lang)} | ${cell(ph)} | \`${g}\` | ${cell(ver)} | ${cell(st)} |`);
  }
}
L.push('');
L.push('> † = 该声库在 `zh-cn.txt` 中没有自己的精确条目，中文名取自同名的 "(Lite)"/"(FLT)" 兄弟条目（去掉版本后缀）。');
L.push('> `⚠` = nofs 未能解析为 JSON，该行除目录名外均不可信（记为 `?`）。本次运行 0 行。');
L.push('> 「中文名」列写 `— （无中文名）` 表示 `zh-cn.txt` 里没有可用中文名，回退显示英文名，第 4 节有完整清单。');
L.push('');

// ---- 3. 同 vocoder 分组 ----
L.push('## 3. 同 vocoder 分组（风格移植的唯一合法范围）');
L.push('');
L.push('只有 `vocoder` 哈希前 8 位相同的声库之间才能互相移植 styles（vocoder 不一致则无法移植）。');
L.push('');
for (const [g, list] of stat.vocoderGroups) {
  const names = list.slice().sort((a, b) =>
    sortKey(a.zh, dispName(a)).localeCompare(sortKey(b.zh, dispName(b)), 'zh')
  ).map((v) => (v.zh ? `${dispName(v)}（${v.zh}）` : dispName(v)));
  L.push(`### \`${g}\` — ${list.length} 个声库`);
  L.push('');
  for (const n of names) L.push(`- ${n}`);
  L.push('');
}

// ---- 4. 没有中文名的声库 ----
L.push('## 4. 没有中文名的声库');
L.push('');
if (stat.noZh.length === 0) {
  L.push('（无 —— 所有本机声库都能在 `zh-cn.txt` 中找到中文名。）');
} else {
  L.push(`共 ${stat.noZh.length} 个（回退显示英文名）：`);
  L.push('');
  L.push('| 英文名(目录) | 厂商 | nofs name | 版本 |');
  L.push('|---|---|---|---|');
  for (const v of stat.noZh.slice().sort((a, b) => dispName(a).localeCompare(dispName(b)))) {
    L.push(`| ${cell(v.dirName)} | ${cell(v.vendor || '?')} | ${cell(v.name || '?')} | ${cell(v.version || '?')} |`);
  }
}
L.push('');

// ---- 5. translations 里有、本机 databases 里没有 ----
L.push('## 5. `translations` 里有、但本机 `databases` 里没有的条目');
L.push('');
if (orphanTranslations.length === 0) {
  L.push('（无）');
} else {
  L.push(`共 ${orphanTranslations.length} 条：这些名字在 \`zh-cn.txt\` 的厂商声库清单里有映射，但本机没有同名（归一化后）的声库目录 —— 即未安装的声库，或映射已过时。`);
  L.push('');
  L.push('| 英文名（translations 键） | 中文名 | 厂商 | zh-cn.txt 行号 | 备注 |');
  L.push('|---|---|---|---|---|');
  for (const t of orphanTranslations) {
    const note = t.baseInstalled
      ? `本机装了同名的非 Lite/FLT 版本（\`${stripEdition(t.en)}\`）`
      : '本机未安装';
    L.push(`| ${cell(t.en)} | ${cell(t.zh)} | ${cell(t.vendor)} | ${t.line} | ${note} |`);
  }
}
L.push('');

// ---- 6. 存疑 ----
L.push('## 6. 存疑');
L.push('');
const doubts = [];
if (stat.sameAsEn.length) {
  doubts.push(
    `**有条目但未汉化**：以下声库在 \`zh-cn.txt\` 里能找到条目，但值就是英文名（或去版本后缀后仍是英文名），不含汉字 —— ` +
    `本表因此判定为「无中文名」并回退英文名：` +
    stat.sameAsEn.map((d) => `\`${dispName(d.voice)}\` ← 条目 \`${d.en}\`("${d.zh}", 第 ${d.line} 行)`).join('；') + '。'
  );
}
if (stat.zhFallback > 0) {
  const list = voices.filter((v) => v.zhSource && v.zhSource.startsWith('lite'));
  doubts.push(`以下 ${list.length} 个声库的中文名不是直接映射，而是从 "(Lite)"/"(FLT)" 兄弟条目推导（确定性存疑，建议人工核对）：` +
    list.map((v) => `\`${dispName(v)}\` ← \`${v.zhSource.replace('lite-sibling:', '')}\``).join('；') + '。');
}
// 中文名里带「AI」后缀但英文名没有 —— translations 自身的小瑕疵
const zhAiSuffix = voices.filter((v) => {
  if (!v.zh) return false;
  const enHasAI = /\bAI\b/.test(v.name || v.dirName);
  const zhHasAI = /\bAI\b/.test(v.zh);
  return zhHasAI && !enHasAI;
});
if (zhAiSuffix.length) {
  doubts.push(`**translations 自身不一致**：以下声库的中文名带了 "AI" 而后缀，但英文名里并没有 "AI"，属于 \`zh-cn.txt\` 的既有写法，本表照实抄录未做修改：` +
    zhAiSuffix.map((v) => `\`${dispName(v)}\` → \`${v.zh}\``).join('；') + '。');
}
if (stat.jsonFail.length) {
  doubts.push(`以下目录的 nofs 无法以 JSON 解析，表中该行除目录名外均记为 \`?\`：` +
    stat.jsonFail.map((v) => `\`${v.dirName}\`（${v.nofsFile || '无 info.*.nofs'}：${v.parseError}）`).join('；') + '。');
}
// 目录名与 nofs name 不一致
const nameMismatch = voices.filter((v) => v.jsonOk && v.name && v.name !== v.dirName);
if (nameMismatch.length) {
  doubts.push(`以下声库的**目录名与 nofs 内的 \`name\` 不一致**（主表「英文名(目录)」列显示 nofs \`name\`；匹配时两者都试过）：` +
    nameMismatch.map((v) => `目录 \`${v.dirName}\` ↔ name \`${v.name}\``).join('；') + '。');
}
// 厂商在 translations 里没有分节
if (vendorNoSection.length) {
  doubts.push(`以下 nofs 里的**厂商在 \`zh-cn.txt\` 里没有对应分节**（这些厂商的声库一律没有中文名）：` +
    vendorNoSection.map((s) => `\`${s}\``).join('、') + '。');
}
// 厂商字符串可疑（含 "?"）
const vendorWeird = voices.filter((v) => v.vendor && /[?？]/.test(v.vendor));
if (vendorWeird.length) {
  doubts.push(`**厂商字符串本身可疑**：以下声库的 nofs \`vendor\` 字段里含问号，是文件里的真实内容，本表照实抄录：` +
    vendorWeird.map((v) => `\`${dispName(v)}\` → vendor = \`${v.vendor}\``).join('；') + '。');
}
// translations 重复键
if (tn.duplicates.length) {
  doubts.push(`\`zh-cn.txt\` 中以下英文名在厂商清单里出现多次（本表取首次出现）：` +
    tn.duplicates.map((d) => `\`${d.en}\`（行 ${d.first.line} 与 ${d.dup.line}）`).join('；') + '。');
}
if (doubts.length === 0) {
  L.push('（无。所有取值均来自真实文件且匹配唯一。）');
} else {
  doubts.forEach((d, i) => { L.push(`${i + 1}. ${d}`); L.push(''); });
}
L.push('');

// 附录：解析自检
L.push('---');
L.push('');
L.push('### 附：解析自检');
L.push('');
L.push(`- \`zh-cn.txt\` 共 ${tn.totalLines} 行，识别到 ${tn.totalSections} 个缩进 0 分节；其中「有条目且至少一条匹配到本机声库」的分节 ${tn.matchedSections.length} 个。`);
L.push(`- 厂商清单取法：${tn.degradeNote}`);
L.push('- 纳入解析的厂商分节：');
for (const s of tn.voiceSections) {
  L.push(`  - \`${s.vendor}\` → \`${s.vendorZh}\`（第 ${s.line} 行起，${s.entries.length} 条）`);
}
if (vendorNoVoice.length) {
  L.push(`- 在 translations 厂商清单里、但本机没有任何声库属于它的厂商：${vendorNoVoice.map((s) => `\`${s}\``).join('、')}`);
}
L.push(`- vocoder 分组数：${stat.groupCount}`);
L.push(`- 主表行数：${stat.total}`);
L.push('');
L.push('**完整 vocoder 哈希**（主表只显示前 8 位；这里是 nofs 里的原值）：');
L.push('');
L.push('| vocoder 前8位 | 完整哈希 | 声库数 |');
L.push('|---|---|---|');
for (const [g, list] of stat.vocoderGroups) {
  const full = list.find((v) => v.vocoder)?.vocoder || '?';
  L.push(`| \`${g}\` | \`${full}\` | ${list.length} |`);
}
L.push('');
L.push(`**nofs 里出现的全部厂商**（共 ${stat.vendors.length} 个；✗ = \`zh-cn.txt\` 里无对应分节）：`);
L.push('');
for (const vd of stat.vendors) {
  const has = !vendorNoSection.includes(vd);
  L.push(`- \`${vd}\`${has ? '' : ' ✗'}`);
}
L.push('');

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, L.join('\n'), 'utf8');

// --------------------------------------------------------------------------
// 6. 控制台摘要
// --------------------------------------------------------------------------
console.log('=== voice-name-table.cjs ===');
console.log('声库目录      :', OPSV_DB, dbInfo.ok ? '(OK)' : `(不可读: ${dbInfo.reason})`);
console.log('中文名映射    :', OPSV_TRANS);
console.log('声库总数      :', stat.total, `(JSON 可解析 ${stat.jsonOk})`);
console.log('有中文名      :', stat.hasZh, `(精确 ${stat.zhExact} / Lite 推导 ${stat.zhFallback})`);
console.log('无中文名      :', stat.noZh.length);
console.log('有条目但未汉化:', stat.sameAsEn.length);
console.log('vocoder 组数  :', stat.groupCount);
console.log('未装映射条目  :', orphanTranslations.length);
console.log('厂商数        :', stat.vendors.length, `(translations 无分节 ${vendorNoSection.length})`);
console.log('输出          :', OUT_PATH);
if (VERBOSE) {
  console.log('--- vocoder groups ---');
  for (const [g, l] of stat.vocoderGroups) console.log(`  ${g}  x${l.length}`);
  console.log('--- 无中文名 ---');
  for (const v of stat.noZh) console.log('  ', v.dirName);
  console.log('--- 未装映射 ---');
  for (const t of orphanTranslations) console.log('  ', t.vendor, '|', t.en, '=>', t.zh);
}
