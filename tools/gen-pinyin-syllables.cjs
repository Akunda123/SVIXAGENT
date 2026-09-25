#!/usr/bin/env node
/**
 * 生成「普通话拼音音节表」（给语种判定的"拉丁字母按语义再判"这一级用）。
 *
 * 为什么不用手写：拼音合法音节 ≈ 410 个，手抄必然出错；而 pinyin-pro 自带字典，
 * 把 CJK 区所有常用字的**全部读音**扫一遍取并集，就是权威的音节集合（含多音字）。
 *
 * 用法：node tools/gen-pinyin-syllables.cjs            # 写 server/src/lyric/pinyin-syllables.ts
 *      node tools/gen-pinyin-syllables.cjs --check    # 只校验现有文件是否与字典一致（CI 用）
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'server', 'src', 'lyric', 'pinyin-syllables.ts');

function collect() {
  const { pinyin } = require(path.join(__dirname, '..', 'server', 'node_modules', 'pinyin-pro'));
  const set = new Set();
  for (let cp = 0x4e00; cp <= 0x9fff; cp++) {
    const ch = String.fromCodePoint(cp);
    let arr = [];
    try {
      arr = pinyin(ch, { toneType: 'none', type: 'array', multiple: true }) || [];
    } catch {
      arr = [];
    }
    for (const s of arr) {
      const t = String(s || '').toLowerCase().replace(/[^a-z]/g, '');
      if (t) set.add(t);
    }
  }
  return [...set].sort();
}

const syllables = collect();
const body = `/**
 * 普通话拼音音节表（**自动生成，别手改**）
 *
 * 生成：\`node tools/gen-pinyin-syllables.cjs\`
 * 来源：pinyin-pro 字典 —— 扫 \`U+4E00..U+9FFF\` 每个字的**全部读音**（含多音字）取并集后排序。
 * 用途：语种判定的「拉丁字母按语义再判」那一级（见 skills/akdagent-playbook/SKILL.md §0.6c）——
 *       拉丁字母不一定就是英语，还可能是**汉语拼音**（如 \`wo\`/\`ni3\`/\`zhong\`）。
 * 共 ${syllables.length} 个音节。
 */
export const PINYIN_SYLLABLES: readonly string[] = ${JSON.stringify(syllables, null, 2).replace(/\n/g, '\n')};

export const PINYIN_SYLLABLE_SET: ReadonlySet<string> = new Set(PINYIN_SYLLABLES);
`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const curList = (cur.match(/PINYIN_SYLLABLES[^=]*=\s*(\[[\s\S]*?\]);/) || [])[1];
  const same = curList && JSON.stringify(JSON.parse(curList)) === JSON.stringify(syllables);
  console.log((same ? '✅ 一致' : '❌ 不一致') + '：字典 ' + syllables.length + ' 个音节' + (same ? '' : ' ⇒ 重新生成'));
  process.exit(same ? 0 : 1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body, 'utf8');
console.log('✅ 已生成 ' + path.relative(path.join(__dirname, '..'), OUT) + '（' + syllables.length + ' 个音节）');
