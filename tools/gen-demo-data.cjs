/* 从 README-发布版草案-v2.md 生成演示页的数据，注入 docs/demo/index.html 的 DEMO-DATA 标记之间。
   用法：node tools/gen-demo-data.cjs
   —— md 是唯一真源：页面里那份数据别手改，改完 md 重跑这个脚本。
   解析：## / ### 标题 → 左弧条目；每节内容 → 导语 / 顶层条目（右栏按钮 + hover 详情）/
        表格 / 有序步骤 / 备注（引用）；md 的内部说明一节按约定不生成（发布前要删）。 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'README-发布版草案-v2.md');
const DST = path.join(ROOT, 'docs', 'demo', 'index.html');
const BEGIN = '/* DEMO-DATA:BEGIN';
const END = '/* DEMO-DATA:END */';

/* ── markdown 行内标记 → 安全 HTML（先转义再放行 <b>/<code>） ── */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  /* 🆕 2026-09-25：**绝对**链接转成真链（http/https/mailto）。
   *   为什么只认绝对：页面是**独立文件**（演示页 / 应用内帮助页），
   *   draft 里的相对链接（`[LICENSE](LICENSE)` 这类）在那个环境里没有意义 ⇒ 保持文本，别造成死链。
   *   在此之前 `[x](y)` 一律按原样显示（页面上能看到方括号和圆括号），这次一并修掉。 */
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

/* ── 顶层 `- ` 行：是「条目」还是「文案」？ ──
   条目 ⇒ 进 chip（带 hover 详情）；文案 ⇒ 进 ul 块（就是一段列表文字）。
   判据（用户 2026-09-25 定）：**有显式标签才算条目**
     ① 以 `**粗体**` 开头（作者用粗体标条目）
     ② 或「短标签（≤16 字）+ ：/：（」——如「三档本地模型：」「参数（响度…）」 */
const isItemLine = (t) => /^\*\*/.test(t) || /^[^：:（(]{1,16}[：:（(]/.test(t);

/* ── 一条子弹 → 右栏按钮的短标签(n) + hover 详情(d) ──
   标签太长就砍到括号/顿号处，砍下来的部分还给详情（详情里是全文，按钮只是抓手）*/
const MAXLABEL = 14;
function splitItem(raw){
  let label = '', rest = raw;
  const bold = raw.match(/^\*\*(.+?)\*\*\s*([\s\S]*)$/);
  if (bold){ label = bold[1]; rest = bold[2]; }
  else {
    const k = raw.search(/[（(：:，,。]/);
    if (k > 0){ label = raw.slice(0, k); rest = raw.slice(k); }
    /* ⚠️ 没有标点 ⇒ **只当标签，别把整句再复制一份当详情**（原来 rest=raw ⇒ tip 里出现
       「柔一点」「这段音高线按抒情处理画柔一点」这种重复+断句错误，实测 §这是什么 三条例句） */
    else label = raw;
  }
  const p = label.search(/[（(]/);                       // 标签里的括号说明挪回详情
  if (p >= 2){ rest = label.slice(p) + rest; label = label.slice(0, p); }
  if (label.length > MAXLABEL){                          // 还是太长 ⇒ 砍到最后一个停顿处
    const head = label.slice(0, MAXLABEL);
    const cut = Math.max(head.lastIndexOf('，'), head.lastIndexOf('、'), head.lastIndexOf(' '));
    if (cut >= 2){ rest = label.slice(cut + 1) + rest; label = label.slice(0, cut); }
    else { rest = label.slice(MAXLABEL - 2) + rest; label = label.slice(0, MAXLABEL - 2); }
  }
  label = label.replace(/[：:]\s*$/, '').trim();
  /* 详情开头要剥掉切分处的标点：标签是在第一个「（(：:，,。」处切开的，
     只剥冒号会留下以「，」开头的详情（实测 3 条，tip 里显示成 "，在 设置 →…"） */
  rest = rest.replace(/^[：:，,、]\s*/, '').trim();
  const todo = /^⏳/.test(raw);
  const it = { n: inline(label.replace(/^⏳\s*/, '')), d: inline(rest) };
  if (todo) it.todo = 1;
  return it;
}

function newSec(title, level){
  let num = '◆', label = title;
  const cn = title.match(/^([一二三四五六七八九十]+)、(.*)$/);
  const ar = title.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
  if (cn){ num = cn[1]; label = cn[2]; }
  else if (ar){ num = ar[1]; label = ar[2]; }
  else if (/^English/.test(title)) num = 'EN';
  return { num, label, sub: level, lead: '', items: [], blocks: [] };
}

function parseMd(md){
  const cut = md.indexOf('\n## 内部说明');
  if (cut >= 0) md = md.slice(0, cut);                   // 内部说明：不进页面
  const lines = md.split(/\r?\n/);
  const secs = [];
  let cur = null, mode = null, buf = [];
  const flushP = () => {
    if (!buf.length) return;
    const txt = inline(buf.join(' '));
    if (cur && !cur.lead && !cur.items.length && !cur.blocks.length) cur.lead = txt;
    else if (cur) cur.blocks.push({ t: 'p', v: txt });
    buf = [];
  };
  const lastItem = () => cur.items[cur.items.length - 1];

  for (const raw of lines){
    const line = raw.trim();
    const h2 = raw.match(/^##\s+(.*)$/), h3 = raw.match(/^###\s+(.*)$/);
    if (h2 || h3){ flushP(); cur = newSec((h2 || h3)[1], h3 ? 1 : 0); secs.push(cur); mode = null; continue; }
    if (/^#\s/.test(raw) || !cur) { flushP(); continue; }
    /* 代码块（``` 围栏）：原样收、只转义不解析 —— 用来放"关系图"这类靠等宽对齐的内容。
       ⚠️ 必须放在"空行 / ---"判断**之前**，否则块内空行会把 mode 清掉。 */
    if (mode === 'pre') {
      if (/^```/.test(line)) mode = null;
      else cur.blocks[cur.blocks.length - 1].v.push(esc(raw));
      continue;
    }
    if (/^```/.test(line)) { flushP(); cur.blocks.push({ t: 'pre', v: [] }); mode = 'pre'; continue; }
    if (!line || /^-{3,}$/.test(line)){ flushP(); mode = null; continue; }

    if (line.startsWith('|')){                                  // 表格
      flushP();
      const cells = line.replace(/^\||\|$/g, '').split('|').map(s => s.trim());
      if (!/^[\s:|-]+$/.test(line.replace(/^\||\|$/g, ''))){     // 跳过分隔行 |---|---|
        if (mode !== 'table'){ cur.blocks.push({ t: 'table', head: cells.map(inline), rows: [] }); mode = 'table'; }
        else cur.blocks[cur.blocks.length - 1].rows.push(cells.map(inline));
      }
      continue;
    }
    if (line.startsWith('>')){                                  // 备注（引用）
      flushP();
      const v = inline(line.replace(/^>\s?/, ''));
      if (mode !== 'quote'){ cur.blocks.push({ t: 'quote', v: [v] }); mode = 'quote'; }
      else cur.blocks[cur.blocks.length - 1].v.push(v);
      continue;
    }
    const ul = raw.match(/^(\s*)[-*]\s+(.*)$/), ol = raw.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ul){
      flushP();
      if (!ul[1].length){
        /* ── 条目（chip）还是文案（列表）？用户 2026-09-25 定：
           「分清 md 里是条目还是文本注释，不要所有行都放 chip 里」
           ⇒ **有显式标签才算条目**：以 `**粗体**` 开头，或「短标签（≤16 字）+ ：/：（」。
              其余（纯句子、⚠️ 告警、`·` 串起来的名词列表…）一律当**文案** ⇒ 渲染成列表，不做 chip、不弹 tip。 */
        if (isItemLine(ul[2])){ cur.items.push(splitItem(ul[2])); mode = 'ul'; }
        else {
          if (mode !== 'text'){ cur.blocks.push({ t: 'ul', items: [] }); mode = 'text'; }
          cur.blocks[cur.blocks.length - 1].items.push(inline(ul[2]));
        }
      }
      else if (cur.items.length) lastItem().subs = (lastItem().subs || []).concat(inline(ul[2]));
      else if (mode === 'text' && cur.blocks.length) cur.blocks[cur.blocks.length - 1].items.push('· ' + inline(ul[2]));
      continue;
    }
    if (ol){
      if (mode === 'ul' && ol[1].length && cur.items.length){    // 子弹里的编号步骤
        const it = lastItem();
        it.subs = (it.subs || []).concat(inline(ol[2])); it.subOl = 1;
        continue;
      }
      flushP();
      if (mode !== 'ol'){ cur.blocks.push({ t: 'ol', items: [] }); mode = 'ol'; }
      cur.blocks[cur.blocks.length - 1].items.push(inline(ol[2]));
      continue;
    }
    if (mode === 'table' || mode === 'quote' || mode === 'ul' || mode === 'ol'){ flushP(); mode = 'p'; }
    buf.push(line);
  }
  flushP();
  return secs;
}

/* ── 生成 ── */
module.exports = { parseMd, splitItem, inline, esc, SRC, DST, BEGIN, END };

function main(){
const md = fs.readFileSync(SRC, 'utf8');
const secs = parseMd(md);

/* 自检：该进页面的标题一条不能少；内部说明一个字都不能进 */
const heads = [...md.matchAll(/^(#{2,3})\s+(.*)$/gm)]
  .filter(m => !/^内部说明/.test(m[2])).length;
if (secs.length !== heads){
  console.error(`✗ 解析出的节数 ${secs.length} ≠ md 里的标题数 ${heads}`); process.exit(1);
}
const body = secs.map(s => JSON.stringify(s)).join(',\n');
/* ⚠️ 2026-09-25：§五/§六 已从草案删除 ⇒ 原来用 `<你的联系方式>` 当"尖括号样本"的断言换成了 `<版本>`
   （§1.2 的安装包名 `AKDAgent-<版本>-x64.exe`，一样是正文里的尖括号占位符）。 */
const ANGLE = '<版本>';
for (const bad of ['内部说明', '发布前整节删除', ANGLE]){
  if (body.includes(bad)){ console.error(`✗ 生成数据里混进了不该有的东西：${bad}`); process.exit(1); }
}
if (!body.includes('&lt;版本&gt;')){
  console.error('✗ 尖括号没转义（页面会当成标签解析）'); process.exit(1);
}
const data = `${BEGIN} —— 由 tools/gen-demo-data.cjs 从 README-发布版草案-v2.md 生成，别手改 */\n` +
             `const DEMO = { nav: [\n${body}\n] };\n${END}`;

/* 注入：优先替换标记块；没有标记就把手写的那份 const DEMO = {...}; 换掉（首次自举） */
let html = fs.readFileSync(DST, 'utf8');
const b = html.indexOf(BEGIN), e = html.indexOf(END);
if (b >= 0 && e > b){
  html = html.slice(0, b) + data + html.slice(e + END.length);
} else {
  const m = html.match(/const DEMO = \{[\s\S]*?\n\};/);
  if (!m){ console.error('✗ 页面里既没有 DEMO-DATA 标记、也找不到 const DEMO = {...};'); process.exit(1); }
  html = html.replace(m[0], data);
}
fs.writeFileSync(DST, html, 'utf8');

/* ── 同一份页面同时作为**应用内帮助页**（2026-09-25 用户定：orb 右键 → 帮助）──
 *   为什么复制而不是引用 docs/demo：`docs/` 是 .gitignore 挡住的开发参考、**不进安装包**，
 *   而帮助页必须随包分发 ⇒ 落到 `electron/src/help/`（`files: src/**` ⇒ 进 asar）。
 *   顺带只带 `bg.png`（index.html 唯一的相对依赖；rec 页要的 SVG/片头不在这里）。 */
const HELP_DIR = path.join(ROOT, 'electron', 'src', 'help');
fs.mkdirSync(HELP_DIR, { recursive: true });
/* 帮助副本只改**两处门面文案**（品牌名 + 页头那半句），正文一个字不动：
 *   `SVAgent` → `AKDAgent`（产品名，仓库名 SVIXAGENT 见 README 头部说明）
 *   `功能演示` → `使用说明`（这是应用内的帮助/说明书，不是演示页） */
const helpHtml = html
  .replace(/<title>SVAgent 功能演示/, '<title>AKDAgent 使用说明')
  .replace(/<div class="brand"><b>SVAgent<\/b><span>功能演示<\/span><\/div>/,
           '<div class="brand"><b>AKDAgent</b><span>使用说明</span></div>');
if (helpHtml === html) { console.error('✗ 帮助页门面文案没替换成功（模板变了？）'); process.exit(1); }
fs.writeFileSync(path.join(HELP_DIR, 'index.html'), helpHtml, 'utf8');
const bgSrc = path.join(path.dirname(DST), 'bg.png');
if (!fs.existsSync(bgSrc)) { console.error('✗ 缺 bg.png（index.html 的背景图）'); process.exit(1); }
fs.copyFileSync(bgSrc, path.join(HELP_DIR, 'bg.png'));

/* ── 汇报 ── */
const kinds = {};
let nItems = 0, nTables = 0, nRows = 0;
for (const s of secs){
  for (const bl of s.blocks) kinds[bl.t] = (kinds[bl.t] || 0) + 1;
  nItems += s.items.length;
  for (const bl of s.blocks) if (bl.t === 'table'){ nTables++; nRows += bl.rows.length; }
}
console.log(`✓ 已注入 ${secs.length} 节 · ${nItems} 个按钮条目 · ${nTables} 张表（${nRows} 行）· ` +
            `正文块 ${JSON.stringify(kinds)}`);
console.log(`  页面数据块 ${(Buffer.byteLength(data, 'utf8') / 1024).toFixed(1)} KB ⇒ ${path.relative(ROOT, DST)} ` +
            `(${(fs.statSync(DST).size / 1024).toFixed(1)} KB)`);
for (const s of secs){
  const k = s.blocks.map(x => x.t).join('+') || '-';
  console.log(`  ${s.num.padEnd(4)} ${s.label.padEnd(18)} 条目 ${String(s.items.length).padStart(2)}  正文 ${k}` +
              (s.lead ? '  导语' : ''));
}
}

if (require.main === module) main();
