#!/usr/bin/env node
/*
 * 技能文档「交叉引用」有效性检查器
 * =====================================================================
 * 起因：`skills/` 下的长文档（`07`=1563 行、`08`=2176 行）里满是 `§1.8` / `§2.4b` / `07 §1.7` / `08 §6.2b`
 * 这类引用，改章节、插章节都会让它们**悄悄指空**（夜间已实际发现过两处：`SKILL.md:18` 悬空指针、
 * `clone核对` 里行号 140→148 漂移）。
 *
 * 检查三类：
 *   A. **同文件** `§X` —— 本文件里必须有对应标题
 *   B. **跨文件** `<07|08|…> §X`（或 `references/09-…md §X`）—— 目标文件里必须有
 *   C. **反引号里的文件路径**（如 `references/09-拆轨与拆音.md`、`references/04-notes.md`）—— 文件必须存在
 *
 * 只读。用法：
 *   node tools/check-doc-refs.cjs            # 只查 skills/ 源（默认）
 *   node tools/check-doc-refs.cjs --full     # 不截断，把全部指空逐条列出（默认只印前 30 条）
 *   node tools/check-doc-refs.cjs --json     # 机器可读（problems / soft / movedHits / retiredHits 分类齐全）
 * 退出码：1 = 有指空引用
 *
 * ⚠️ 2026-09-20 更正：本注释此前写着「`--all` 连镜像目录一起查」，但**代码里从没实现过 argv 解析**
 *    （`--all` 是个假开关）。现已改为上面三个真实开关 —— 查镜像目录没有意义（它是 `skills/` 的副本，
 *    只会把同一批指空再报一遍），要对比镜像请用 `check-panel-deploy.cjs` / 逐文件比 SHA256。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');
const argv = process.argv.slice(2);
const FLAG = (n) => argv.includes(n);

function walk(dir, out = [], depth = 0) {
  if (depth > 6) return out;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = walk(SKILLS);
// 额外索引：文档里会引用 `待办 §0-1`、`knowledge/docs/PROTOCOL.md` 这类 skill 之外的目标
const EXTRA = {
  '待办': path.join(ROOT, 'docs', '待办.md'),
  'PROTOCOL': path.join(ROOT, 'knowledge', 'docs', 'PROTOCOL.md'),
};
for (const [k, p] of Object.entries(EXTRA)) {
  if (fs.existsSync(p)) files.push(p);
}

/**
 * **已退役/已删除的文件**（2026-09-19 新加）—— 被删掉的文件在历史文档（工作日志 / 核对记录 / 待办归档行）里
 * 仍会被提及，那是**记录**、不该改写；这里登记"已退役 + 内容去向"，命中时只报 `[i]`，不计入指空。
 * ⚠️ 只登记**确实删掉并有明确继承者**的文件；别拿它掩盖真断链。
 */
const RETIRED = {
  // ⓪ **目录改名（2026-09-22）**：产品改名 `SVAgent` → `AKDAgent`，两个技能目录 `skills/svagent-*` ⇒ `skills/akdagent-*`。
  //    历史台账（`docs/` 下的工作日志）**按惯例不改写** ⇒ 登记"改名 + 去向"，不追改台账正文。
  //    ⚠️ 又一次踩同一个坑：**同一条引用的每种写法都要单独登记**（本次是 `svagent-playbook/SKILL.md` 这种"技能名 + 文件名"式）。
  'svagent-playbook/SKILL.md': '技能目录改名（2026-09-22）→ skills/akdagent-playbook/SKILL.md',
  'svagent-protocol/SKILL.md': '技能目录改名（2026-09-22）→ skills/akdagent-protocol/SKILL.md',
  'svagent-protocol/references/svp-format.md': '技能目录改名（2026-09-22）且该文件已删除 → skills/akdagent-protocol/SKILL.md（svp-format 内容已并入 sv-project-format 与 10-声库与声线 §5）',
  'svp-format.md': '已删除（2026-09-19）：.svp 结构/版本策略/音频轨注入/196 模板 → skills/sv-project-format/SKILL.md；声库 nofs/vocoder/中文名 → skills/sv-scripting/references/10-声库与声线.md §5',
  // 同一文件的**全路径写法**也要登记 —— 反引号里写 `skills/…/svp-format.md`（正斜杠）同样会被规则 C 抓到，
  // 只登记 basename 会漏（2026-09-19 实测：漏了这一条，指空数从 159 涨到 160）。
  'skills/akdagent-protocol/references/svp-format.md': '同上（该文件已删除，内容已并入 sv-project-format 与 10-声库与声线 §5）',
  // ③ 相对本文的写法（在 `skills/akdagent-protocol/SKILL.md` 里写 `references/svp-format.md`）
  'references/svp-format.md': '同上（该文件已删除，内容已并入 sv-project-format 与 10-声库与声线 §5）',
  // ④ **目录改名（2026-09-21）**：`sv-scripting/functions/01–06` + `workflows/07–11` ⇒ 合并为 `references/01–11`
  //    （用户裁「先备份，再B」）。历史台账（docs/ 下的工作日志与归档行）**按惯例不改写** ⇒ 登记"改名 + 去向"。
  //    ⚠️ 同一文件的三种写法都要登记：裸 basename、`functions/0X-…` 前缀式、全路径式（与 svp-format 那次同一个教训）。
  'functions/01-official.md': '改名（2026-09-21）→ skills/sv-scripting/references/01-official.md',
  'functions/02-lyrics.md': '改名（2026-09-21）→ skills/sv-scripting/references/02-lyrics.md',
  'functions/03-phonemes.md': '改名（2026-09-21）→ skills/sv-scripting/references/03-phonemes.md',
  'functions/04-notes.md': '改名（2026-09-21）→ skills/sv-scripting/references/04-notes.md',
  'functions/05-params.md': '改名（2026-09-21）→ skills/sv-scripting/references/05-params.md',
  'functions/06-track-misc.md': '改名（2026-09-21）→ skills/sv-scripting/references/06-track-misc.md',
  'workflows/07-melody-accent-pitch-params.md': '改名（2026-09-21）→ skills/sv-scripting/references/07-melody-accent-pitch-params.md',
  'workflows/08-pit-drawing.md': '改名（2026-09-21）→ skills/sv-scripting/references/08-pit-drawing.md',
  'workflows/09-拆轨与拆音.md': '改名（2026-09-21）→ skills/sv-scripting/references/09-拆轨与拆音.md',
  'workflows/10-声库与声线.md': '改名（2026-09-21）→ skills/sv-scripting/references/10-声库与声线.md',
  'workflows/11-风格配方.md': '改名（2026-09-21）→ skills/sv-scripting/references/11-风格配方.md',
  'functions/README.md': '改名（2026-09-21）→ 索引并入 skills/sv-scripting/references/README.md（含 01–11 总索引 + 通用骨架 + ES5.1 约束）',
  'workflows/.gitkeep': '已删除（2026-09-21，随目录合并）：其内容（「流程部分待导入：脚本类型/安装位置/调试技巧/常见 Bug/最佳实践」）已引在 skills/sv-scripting/SKILL.md 的「结构」节当史证',
  // ⚠️ 再补**带 `sv-scripting/` 前缀**的写法（历史台账里就是这么写的）——
  //    2026-09-21 实测：只登记 `functions/04-notes.md` 时，`docs/待办.md` 里的 `sv-scripting/functions/04-notes.md` 仍报指空。
  //    与 svp-format 那次同一个坑：**同一文件的每种路径写法都要单独登记**。
  'sv-scripting/functions/04-notes.md': '改名（2026-09-21）→ skills/sv-scripting/references/04-notes.md',
  'skills/sv-scripting/functions/04-notes.md': '改名（2026-09-21）→ skills/sv-scripting/references/04-notes.md',
  'sv-scripting/workflows/07-melody-accent-pitch-params.md': '改名（2026-09-21）→ skills/sv-scripting/references/07-melody-accent-pitch-params.md',
  'sv-scripting/workflows/08-pit-drawing.md': '改名（2026-09-21）→ skills/sv-scripting/references/08-pit-drawing.md',
  'sv-scripting/workflows/09-拆轨与拆音.md': '改名（2026-09-21）→ skills/sv-scripting/references/09-拆轨与拆音.md',
  'sv-scripting/workflows/10-声库与声线.md': '改名（2026-09-21）→ skills/sv-scripting/references/10-声库与声线.md',
  'sv-scripting/workflows/11-风格配方.md': '改名（2026-09-21）→ skills/sv-scripting/references/11-风格配方.md',
  'sv-scripting/functions/03-phonemes.md': '改名（2026-09-21）→ skills/sv-scripting/references/03-phonemes.md',
  'sv-scripting/functions/05-params.md': '改名（2026-09-21）→ skills/sv-scripting/references/05-params.md',
};
const retiredHits = [];

/**
 * **已搬家的文件**（2026-09-19 新加）—— 用户改判「随包集合单独放 `knowledge/`」后，13 份对外文档从
 * `docs/` 搬到 `knowledge/docs/`。**历史文档（工作日志 / 核对记录 / 台账）里的旧路径是记录、不改写**，
 * 这里登记「旧路径 → 新家」，命中时只报 `[i]`，不计入指空。
 * ⚠️ 与 RETIRED 的区别：**文件还在，只是换了位置**；活文档应当直接写新路径。
 */
const MOVED = {
  'docs/PROTOCOL.md': 'knowledge/docs/PROTOCOL.md',
  'docs/MCP工具清单.md': 'knowledge/docs/MCP工具清单.md',
  'docs/变更记录-音频分析升级.md': 'knowledge/docs/变更记录-音频分析升级.md',
  'docs/工程文件结构-实测对比-SV1-SV2-IX.md': 'knowledge/docs/工程文件结构-实测对比-SV1-SV2-IX.md',
  'docs/音频轨schema实测.md': 'knowledge/docs/音频轨schema实测.md',
  'docs/InstrumentX-API枚举.md': 'knowledge/docs/InstrumentX-API枚举.md',
  'docs/MIDI转IXP映射表.md': 'knowledge/docs/MIDI转IXP映射表.md',
  'docs/MusicXML转IX映射表.md': 'knowledge/docs/MusicXML转IX映射表.md',
  'docs/声库中文名对照表.md': 'knowledge/docs/声库中文名对照表.md',
  'docs/音素表.md': 'knowledge/docs/音素表.md',
  'docs/音素表.json': 'knowledge/docs/音素表.json',
  'docs/已知Bug与平台约束.md': 'knowledge/docs/已知Bug与平台约束.md',
  'docs/问题与反馈.md': 'knowledge/docs/问题与反馈.md',
};
const movedHits = [];
const rel = (p) => (p.startsWith(SKILLS) ? path.relative(SKILLS, p) : path.relative(ROOT, p)).replace(/\\/g, '/');

/** 每个文件：{ keys:Set(小节号), headings:[], lines:[] } */
const index = new Map();
/** 2 位数字前缀 → 文件（07 → sv-scripting/references/07-…md） */
const byPrefix = new Map();

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const keys = new Set();
  const headings = [];
  for (const line of text.split('\n')) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!m) continue;
    const h = m[2].trim();
    headings.push(h);
    // 小节号：`## 2. …` / `### 3.2k …` / `### 1.2b`；也接受 `§1.7`
    const num = /^(?:§)?\s*([0-9]+(?:[.\-][0-9]+)*[a-z]?)/.exec(h.replace(/^\*\*|\*\*$/g, ''));
    if (num) keys.add(num[1]);
    const cn = /§\s*([一二三四五六七八九十]+)/.exec(h);
    if (cn) keys.add('§' + cn[1]);
    // 中文数字标题：`## 五、…` / `## 八 …` ⇒ 登记为 `§五`
    const cnHead = /^([一二三四五六七八九十]+)\s*[、.．]/.exec(h);
    if (cnHead) keys.add('§' + cnHead[1]);
  }
  index.set(f, { keys, headings, lines: text.split('\n') });
  const base = path.basename(f);
  const pfx = /^(\d{2})/.exec(base);
  if (pfx) byPrefix.set(pfx[1], f);
}

const problems = [];   // 高置信：明确指空
const soft = [];       // 低置信：可能是"索引里指向被链接的配套文档"，需人看
/**
 * 🆕 2026-09-20 **取键**：中文数字标题登记时存的是 `§五`（见建索引那段），而引用里写的是 `五`
 *   ⇒ 直接 `keys.has('五')` 恒假 ⇒ **`咬字与倒字.md` 明明有 `## 二、断句` / `## 三、倒字` 却报指空**。
 *   这里两种写法都认。
 */
const hasKey = (tf, k) => {
  const e = index.get(tf);
  if (!e) return false;
  return e.keys.has(k) || e.keys.has('§' + k);
};
/** 带**区间**的写法（`§2.4-2.6`）：起点在就算命中（`-` 也可能是节号本身的一部分，故先整体试、再取起点） */
const matchKey = (tf, k) => hasKey(tf, k) || (/-/.test(k) && hasKey(tf, k.split('-')[0]));
/** 🆕 2026-09-20 **台账类文件**：它们的写作风格就是"裸 §N 指别处的小节"（例：`已录：pitchDelta（§3.2b）`，
 *  目标文件在同一行的前文里点名过）⇒ 单列一类，**只报不计 exit code**。理由：`docs/待办.md` 一家就占 137 处
 *  指空，常年把守卫压成"恒红"⇒ 等于没信号；而它们**不是**断链（是台账简写）。
 *  ⚠️ 别把一个文件塞进来"消灾"—— 只放**确实是台账/纪要**性质的。 */
const LEDGER_FILES = ['docs/待办.md'];
const ledgerHits = [];
/** 技能目录名 → 它的 SKILL.md（`akdagent-playbook §0.6b` 这种"点名技能但不带 .md"的写法要能解析） */
const SKILL_BY_DIR = new Map();
for (const f of files) {
  const m = rel(f).match(/^([^/]+)\/SKILL\.md$/);
  if (m) SKILL_BY_DIR.set(m[1], f);
}
let totalRefs = 0, okRefs = 0;

for (const f of files) {
  const { lines } = index.get(f);
  lines.forEach((line, i) => {
    const at = `${rel(f)}:${i + 1}`;
    // —— A/B: §引用
    // ⚠️ 目标候选里，`[a-z][a-z0-9\-]{2,}` = **技能目录名**（如 `akdagent-playbook`）—— 2026-09-20 补：
    //    此前只认 `NN` / `xxx.md` / 中文名 ⇒ 「见 `akdagent-playbook` §0.6b」按"本文"解析 ⇒ 假报指空。
    //    `[\s*]*(?:的|里|中|节)?[\s*]*` = 允许「08 **的** §6」「`X` **§0.6c**」这类连接词/粗体标记
    //    （都是 2026-09-20 补的假报来源）。
    const re = /(?:`?([0-9]{2}|[a-z0-9\-/]+\.md|[a-z][a-z0-9\-]{2,}|[\u4e00-\u9fff]{2,4})`?[\s*]*(?:的|里|中|节)?[\s*]*)?§\s*([0-9]+(?:[.\-][0-9]+)*[a-z]?|[一二三四五六七八九十]+)/g;
    let m;
    let lastTarget = null, lastEnd = -99;   // 同一行里"共享目标"：`07 §1.7 / §1.8` 的第二个 § 继承前者
    while ((m = re.exec(line)) !== null) {
      totalRefs++;
      // ⚠️ **外部路径之后的小节号不算仓内引用**（2026-09-20 修）：出处标注常写成
      //    `来源：`Documents\SynthVCopilot-SKILLS\…\音高与Pit.md` §九「特殊音头」`，正则会把路径**尾巴**
      //    当目标（实测假报成「引用 `it.md §九` 但该文件不存在」）。判据：§ 之前 40 字里出现**反斜杠或 `://`**
      //    ⇒ 视作外部路径的出处标注，只记 info。
      const pre = line.slice(Math.max(0, m.index - 40), m.index);
      if (/\\|:\/\//.test(pre)) {
        soft.push(`${at}  「§${m[2]}」紧跟在**外部路径**之后（出处标注，非仓内引用）`);
        continue;
      }
      let target = m[1];
      // 共享目标：本 § 没带目标，但同行**前一个带目标的 §** 就在 12 字内（`X §a / §b`、`X §a`/`§b` 都算）
      if (!target && lastTarget && (m.index - lastEnd) <= 12) target = lastTarget;
      const key = m[2];
      if (target) { lastTarget = target; lastEnd = m.index + m[0].length; }
      if (target && /^\d{2}$/.test(target)) {
        const tf = byPrefix.get(target);
        if (!tf) { problems.push(`${at}  引用「${target} §${key}」但找不到 ${target} 开头的文档`); continue; }
        if (matchKey(tf, key)) okRefs++;
        else problems.push(`${at}  「${target} §${key}」→ ${rel(tf)} 里没有这个小节`);
      } else if (target && target.endsWith('.md')) {
        const tf = files.find((x) => rel(x).endsWith(target));
        if (!tf) { problems.push(`${at}  引用「${target} §${key}」但该文件不存在`); continue; }
        if (matchKey(tf, key)) okRefs++;
        else problems.push(`${at}  「${target} §${key}」→ 该文件里没有这个小节`);
      } else if (target && SKILL_BY_DIR.has(target)) {
        // 「<技能目录名> §X」（如 `akdagent-playbook §0.6b`）⇒ 解析到该技能的 SKILL.md
        const tf = SKILL_BY_DIR.get(target);
        if (matchKey(tf, key)) okRefs++;
        else problems.push(`${at}  「${target} §${key}」→ ${rel(tf)} 里没有这个小节`);
      } else if (target && EXTRA[target]) {        // `待办 §0-1`：待办的 §0 是**表格**（条目 1..5），不是标题 ⇒ 特判为合法
        const tf = EXTRA[target];
        const k = key.replace(/^0-/, '');
        if (/^0-/.test(key) && /^[1-9]$/.test(k)) okRefs++;
        else if (index.get(tf) && matchKey(tf, key)) okRefs++;
        else soft.push(`${at}  「${target} §${key}」→ ${rel(tf)} 里没有这个小节（待办 §0 的条目是表格行，仅 1~5 特判合法）`);
      } else {
        if (hasKey(f, key)) okRefs++;
        else if (/-/.test(key) && hasKey(f, key.split('-')[0])) okRefs++;   // 区间写法 `§2.4-2.6`：起点在就算命中
        else if (LEDGER_FILES.some((p) => rel(f) === p)) {
          // 台账简写：`docs/待办.md` 的写作风格就是裸 §N 指别处（目标文件在同行前文点名过）⇒ 单列，不算指空
          ledgerHits.push(`${at}  「§${key}」→ 台账简写（指别处的小节；本文没有）`);
        } else {
          // 低置信判据：本行/**前后 2 行**若含 `.md` 链接，多半是"在索引里指向被链接的配套文档"（§1.7 属 07 而非本文）
          //   ⚠️ 2026-09-20 把窗口从 ±1 放宽到 ±2：`sv-scripting/SKILL.md` 那种"链接在一行、§ 在下一行"的索引写法会漏判。
          const near = [lines[i - 2] || '', lines[i - 1] || '', line, lines[i + 1] || '', lines[i + 2] || ''].join(' ');
          if (/\.md/.test(near)) soft.push(`${at}  「§${key}」→ 本文没有；但邻行有 .md 链接，疑指配套文档（人看）`);
          else problems.push(`${at}  「§${key}」→ 本文件里没有这个小节`);
        }
      }
    }
    // —— C: 反引号里的 .md 路径
    const re2 = /`([a-z0-9\-_/]+\.md)`/gi;
    let m2;
    while ((m2 = re2.exec(line)) !== null) {
      const p = m2[1];
      if (/^(https?:|akdagent-)/i.test(p)) continue;
      totalRefs++;
      const candidates = [
        path.join(SKILLS, p),
        path.join(path.dirname(f), p),
        path.join(ROOT, p),                                  // 仓根相对（如 `skills/sv-scripting/…`、`docs/…`）
        ...files.filter((x) => rel(x).endsWith('/' + p)),
      ];
      if (candidates.some((c) => fs.existsSync(c))) okRefs++;
      else if (MOVED[p]) movedHits.push(`${at}  引用已搬家的 \`${p}\` → 新家 \`${MOVED[p]}\``);
      else if (RETIRED[p]) retiredHits.push(`${at}  引用已退役的 \`${p}\` —— ${RETIRED[p]}`);
      else if (/^(docs|skills)\//.test(p)) soft.push(`${at}  引用 \`${p}\`（仓根相对写法，仓内文件存在与否见 --check 详情）`);
      else problems.push(`${at}  引用的文件不存在：\`${p}\``);
    }
  });
}

if (FLAG('--json')) {
  console.log(JSON.stringify({
    files: files.length, totalRefs, okRefs,
    problems, soft, ledgerHits, movedHits, retiredHits,
    counts: {
      problems: problems.length, soft: soft.length,
      ledgerShorthand: ledgerHits.length, moved: movedHits.length, retired: retiredHits.length,
    },
  }, null, 2));
  process.exit(problems.length ? 1 : 0);
}
console.log(`检查 ${files.length} 个文档，共 ${totalRefs} 处引用`);
console.log(`  ✅ 解析成功 ${okRefs} 处`);
console.log(`  ❌ 高置信指空 ${problems.length} 处`);
console.log(`  📒 台账简写（单列，不计指空）${ledgerHits.length} 处`);
console.log(`  ⚠️ 低置信（需人看）${soft.length} 处\n`);
if (problems.length) {
  console.log('— 高置信 ——');
  const cap = FLAG('--full') ? problems.length : 30;
  problems.slice(0, cap).forEach((p) => console.log('  ' + p));
  if (problems.length > cap) console.log(`  …还有 ${problems.length - cap} 处（加 --full 看全）`);
}
if (ledgerHits.length) {
  console.log(`\n— 📒 台账简写（不计入 exit code，共 ${ledgerHits.length} 处；${LEDGER_FILES.join(' / ')} 的裸 § 风格）——`);
  ledgerHits.slice(0, 5).forEach((p) => console.log('  [i] ' + p));
  if (ledgerHits.length > 5) console.log(`  …还有 ${ledgerHits.length - 5} 处`);
}
if (soft.length) {
  console.log('\n— 低置信（前 20）——');
  soft.slice(0, 20).forEach((p) => console.log('  ' + p));
  if (soft.length > 20) console.log(`  …还有 ${soft.length - 20} 处`);
}
if (movedHits.length) {
  console.log(`\n— 已搬家的文件（不计入指空，共 ${movedHits.length} 处；活文档请改新路径）——`);
  movedHits.slice(0, 6).forEach((p) => console.log('  [i] ' + p));
  if (movedHits.length > 6) console.log(`  …还有 ${movedHits.length - 6} 处`);
}
if (retiredHits.length) {
  console.log(`\n— 已退役文件（不计入指空，共 ${retiredHits.length} 处）——`);
  retiredHits.slice(0, 6).forEach((p) => console.log('  [i] ' + p));
  if (retiredHits.length > 6) console.log(`  …还有 ${retiredHits.length - 6} 处`);
}
process.exit(problems.length ? 1 : 0);
