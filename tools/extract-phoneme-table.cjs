#!/usr/bin/env node
/**
 * 从 `docs/音素.html`（官方 Synthesizer V Studio Phoneme Reference 页面存档）抽出**机器可读的音素表**。
 *
 * 为什么需要：本仓一直缺"音素表本体"（clone 审计里记为"部分缺"）——
 *   `references/03-phonemes.md` 只有代码集合（ALL_VOWELS / FUYIN 27 项）与十类速查；
 *   而官方这张表是**按语言（phoneset）分表**、每条带 **Category**（Vowel/Diphthong/Semivowel/Consonant…）与 **Example/Description**。
 *   ⇒ 有了它才能"按语言"准确判辅音（`activity` 判定之外的回退依据），也才对得上 A（辅音抢时间）要动的对象。
 *
 * 用法：node tools/extract-phoneme-table.cjs            # 写 knowledge/docs/音素表.json + 打印统计
 *      node tools/extract-phoneme-table.cjs --md        # 另外写 knowledge/docs/音素表.md（人读）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', '音素.html');
const OUT_JSON = path.join(ROOT, 'docs', '音素表.json');
const OUT_MD = path.join(ROOT, 'docs', '音素表.md');

const html = fs.readFileSync(SRC, 'utf8');

/** 官方页面里每张语言表是一个 <div id="appPhoneme">；语言名在 select2 的 title 里 */
function languageOf(section) {
  const m = section.match(/select2-selection__rendered[^>]*title="\s*([^"]+?)"/);
  return m ? m[1].trim() : 'Unknown';
}

const sections = html.split(/<div id="appPhoneme"/).slice(1);
const tables = [];
for (const section of sections) {
  const language = languageOf(section);
  const groups = [];
  // 每张子表以 <h4>标题</h4> 开始
  const parts = section.split(/<h4>/).slice(1);
  for (const part of parts) {
    const title = (part.match(/^([\s\S]*?)<\/h4>/) || [, ''])[1].replace(/<[^>]+>/g, '').trim();
    const rows = [];
    // 逐条：phoneme 之后紧跟（可能有）category、example 或 description
    const itemRe = /<div class="phoneme"><p>([\s\S]*?)<\/p><\/div>([\s\S]*?)(?=<div class="phoneme"><p>|$)/g;
    let m;
    while ((m = itemRe.exec(part)) !== null) {
      const phoneme = m[1].replace(/<[^>]+>/g, '').trim();
      const rest = m[2];
      const category = (rest.match(/<div class="category"><p>([\s\S]*?)<\/p><\/div>/) || [, ''])[1].replace(/<[^>]+>/g, '').trim();
      const example = (rest.match(/<div class="example"><p>([\s\S]*?)<\/p><\/div>/) || [, ''])[1].replace(/<u>/g, '').replace(/<\/u>/g, '').replace(/<[^>]+>/g, '').trim();
      const desc = (rest.match(/<div class="wtf">([\s\S]*?)<\/div>/) || [, ''])[1].replace(/<[^>]+>/g, '').trim();
      if (!phoneme || phoneme === 'Phoneme') continue;
      rows.push({ phoneme, category: category || null, example: example || null, description: desc || null });
    }
    if (rows.length) groups.push({ title, rows });
  }
  tables.push({ language, groups });
}

fs.writeFileSync(OUT_JSON, JSON.stringify({ source: 'Synthesizer V Studio Phoneme Reference (2.0.0 update) · docs/音素.html', extractedAt: new Date().toISOString().slice(0, 10), tables }, null, 2) + '\n', 'utf8');

console.log('✅ 已写出 ' + path.relative(ROOT, OUT_JSON));
for (const t of tables) {
  const all = t.groups.flatMap((g) => g.rows);
  const byCat = {};
  for (const r of all) byCat[r.category || '(无)'] = (byCat[r.category || '(无)'] || 0) + 1;
  console.log('- ' + t.language + '：' + all.length + ' 条 · ' + t.groups.length + ' 张子表 · ' + JSON.stringify(byCat));
}

if (process.argv.includes('--md')) {
  const L = ['# SV 官方音素表（机器抽取）', '', '> 来源：官方 *Synthesizer V Studio Phoneme Reference (2.0.0 update)* 页面存档 `docs/音素.html`',
    '> 生成：`node tools/extract-phoneme-table.cjs --md`（**别手改**，改 HTML 后重跑）', ''];
  for (const t of tables) {
    L.push('## ' + t.language, '');
    for (const g of t.groups) {
      L.push('### ' + (g.title || '(未命名)'), '', '| Phoneme | Category | Example | 说明 |', '|---|---|---|---|');
      for (const r of g.rows) L.push('| `' + r.phoneme + '` | ' + (r.category || '') + ' | ' + (r.example || '') + ' | ' + (r.description || '') + ' |');
      L.push('');
    }
  }
  fs.writeFileSync(OUT_MD, L.join('\n'), 'utf8');
  console.log('✅ 已写出 ' + path.relative(ROOT, OUT_MD));
}
