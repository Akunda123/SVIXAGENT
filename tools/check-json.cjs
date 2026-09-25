#!/usr/bin/env node
/**
 * JSON 守门（2026-09-20 新增）
 *
 * ① **全仓 JSON 必须能 `JSON.parse`** —— 含 `tools/*.json`（`known-bugs.json` / `param-units.json`）·
 *    `server/` · `electron/` 的四语 `i18n/*.json` · `skills/sv-scripting/api/_sync.json` 等。
 * ② **中文文本里不许出现半角引号**（`"` 两侧紧贴中日韩字符）—— 那是 JSON 字符串的**终结符**，
 *    会直接把文件写坏。2026-09-20 我**一天之内把 `tools/known-bugs.json` 写坏了三次**
 *    （`symptom` / `impact` / `workaround` 各一处），每次都靠跑一句 `JSON.parse` 才发现。
 *    ⇒ 规则：**往 JSON 里写中文，引号一律用「」/『』**（或用 `\"` 转义）。
 *    ⚠️ 本规则②只是**预测性**的（只抓"两侧都是中文"这种最典型的写法）；英文引号之类仍由①兜住 ——
 *    所以**改完 JSON 必跑本工具**，别只靠肉眼。
 *
 * 用法：
 *   node tools/check-json.cjs          # 扫全仓（有问题 ⇒ exit 1）
 *   node tools/check-json.cjs --all    # 连通过的文件也逐个列出
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FLAG = (n) => process.argv.includes(n);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', 'dsh-runtime', '.git', 'out']);
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

/**
 * 已知**不是 JSON** 的同名文件（扩展名骗人）：列在这里、带原因，而不是放宽检查。
 * · `server/audio-ref/model_data.json` = 126 B 的 HTTP 404 正文（2026-08-20 从
 *   python-audio-separator 抓包残片，内容 "Couldn't find the requested file …"），参考目录里的死文件。
 *   ⇒ 由用户决定删不删；在此之前别让它把守卫的噪声当真信号。
 */
const NOT_JSON = {
  'server/audio-ref/model_data.json': 'HTTP 404 抓包残片（非 JSON），等用户决定是否删除',
};

function walk(dir, acc) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.json$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT, []);
const errors = [];
let ok = 0;

for (const f of files) {
  // ⚠️ Windows 上 path.relative 给的是反斜杠 ⇒ 统一成正斜杠再查白名单（当初用正斜杠当键、差点白名单失效）
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (NOT_JSON[rel]) continue;                    // 已知非 JSON（见顶部 NOT_JSON）
  const text = fs.readFileSync(f, 'utf8');
  try {
    JSON.parse(text);
  } catch (e) {
    // 顺带把出错行附近的内容打出来，便于定位（node 的报错含 position）
    const m = String(e.message).match(/position (\d+)/);
    let where = '';
    if (m) {
      const pos = Number(m[1]);
      const upto = text.slice(0, pos);
      const line = upto.split(/\r?\n/).length;
      const col = pos - upto.lastIndexOf('\n');
      const lines = text.split(/\r?\n/);
      where = '（第 ' + line + ' 行第 ' + col + ' 列附近：' + (lines[line - 1] || '').slice(Math.max(0, col - 30), col + 30).trim() + '）';
    }
    errors.push({ file: rel, kind: 'parse', detail: String(e.message) + where });
    continue;
  }
  // 规则②：半角引号两侧都紧贴中日韩字符
  const lines = text.split(/\r?\n/);
  let flagged = false;
  for (let i = 0; i < lines.length && !flagged; i++) {
    const l = lines[i];
    for (let c = 0; c < l.length; c++) {
      if (l[c] !== '"') continue;
      const prev = l[c - 1] || '';
      const next = l[c + 1] || '';
      if (CJK.test(prev) && CJK.test(next)) {
        errors.push({
          file: rel, kind: 'cjk-quote',
          detail: '第 ' + (i + 1) + ' 行的半角引号两侧都是中文：…' + l.slice(Math.max(0, c - 25), c + 25).trim() + '…'
            + ' ⇒ 中文引号请用「」/『』',
        });
        flagged = true;
        break;
      }
    }
  }
  if (!flagged) ok++;
}

if (errors.length) {
  console.log('❌ JSON 守门未通过（' + errors.length + ' 处 / 共扫 ' + files.length + ' 个文件）：');
  for (const x of errors) console.log('   · [' + x.kind + '] ' + x.file + ' —— ' + x.detail);
  console.log('');
  console.log('   修法：中文里的引号一律用 **「」**（或把 `"` 转义成 `\\"`）；改完重跑本工具。');
  process.exit(1);
}
console.log('✅ JSON 守门通过：' + files.length + ' 个 JSON 全部可解析，且没有"半角引号夹在中文里"。');
if (FLAG('--all')) files.forEach((f) => console.log('   · ' + path.relative(ROOT, f)));
