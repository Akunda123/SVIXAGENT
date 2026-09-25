/**
 * 作词检查器的离线自测（跑在编译产物上，**不碰宿主**）
 * 运行：cd server && npm run test:lyric-check
 */
import { checkLyrics, sungToneOf, alignSyllables } from "../dist/lyric/check.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
const ids = (r) => r.issues.map((i) => i.id);
const n = (pitch, startBeat, lyric, durBeats = 1) => ({ pitch, startBeat, durBeats, lyric });

console.log("\n== ① 旋律走向 → 声调（用户给定规律）==");
ok("无音高变化 ⇒ 一声", sungToneOf([60]).tone === 1 && sungToneOf([60, 60]).tone === 1);
ok("向上 ⇒ 二声", sungToneOf([60, 62]).tone === 2);
ok("先向下后向上 ⇒ 三声", sungToneOf([60, 58, 64]).tone === 3);
ok("大幅向上（≥3 半音）⇒ 三声", sungToneOf([60, 64]).tone === 3);
ok("大幅向下（≥3 半音）⇒ 四声", sungToneOf([64, 60]).tone === 4);
ok("小幅向下 ⇒ 四声（向下即四声）", sungToneOf([62, 60]).tone === 4);

console.log("\n== ② 倒字 + 谐音 ==");
// 一声字「妈」配"大幅向上" ⇒ 被唱成三声（mǎ）⇒ 倒字 + 谐音候选（马/吗/码…）
const mama = checkLyrics({ notes: [n(60, 0, "妈")], lyrics: "妈" });
ok("一声字不被倒（无变化）", !ids(mama).includes("tone-mismatch"), ids(mama));
const maUp = checkLyrics({
  notes: [n(60, 0, "妈"), n(64, 1, "-"), n(64, 2, "-")],
  lyrics: "妈",
});
ok("一声字唱成三声 ⇒ tone-mismatch", ids(maUp).includes("tone-mismatch"), ids(maUp));
ok("倒字带出谐音候选 ⇒ homophone", ids(maUp).includes("homophone"), maUp.issues.filter((i) => i.id === "homophone")[0] || {});
const homEv = maUp.issues.find((i) => i.id === "homophone");
ok("谐音候选非空且给的是同音字（参考级）", homEv && Array.isArray(homEv.evidence.candidates) && homEv.evidence.candidates.length > 0, homEv && homEv.evidence);
// 三声字「手」配"向上" ⇒ 被唱成二声 ⇒ 倒字
const shou = checkLyrics({ notes: [n(60, 0, "手"), n(62, 1, "-")], lyrics: "手" });
ok("三声字唱成二声 ⇒ tone-mismatch", ids(shou).includes("tone-mismatch"), ids(shou));
// 四声字「上」配"大幅向上" ⇒ 三声 ⇒ 倒字
const shang = checkLyrics({ notes: [n(60, 0, "上"), n(64, 1, "-")], lyrics: "上" });
ok("四声字唱成三声 ⇒ tone-mismatch", ids(shang).includes("tone-mismatch"), ids(shang));
// 二声字「来」配"大幅向下" ⇒ 四声 ⇒ 倒字
const lai = checkLyrics({ notes: [n(64, 0, "来"), n(60, 1, "-")], lyrics: "来" });
ok("二声字唱成四声 ⇒ tone-mismatch", ids(lai).includes("tone-mismatch"), ids(lai));

console.log("\n== ③ 韵脚 ==");
const rhymeFirst = checkLyrics({ lyrics: "[Verse]\n夜色轻轻落下\n我想起你的话\n月亮挂在天上\n都是你的模样" });
ok("首句韵脚与段内多数不同 ⇒ rhyme-first", ids(rhymeFirst).includes("rhyme-first") || ids(rhymeFirst).includes("rhyme-shift"), ids(rhymeFirst));
const rhymeShift = checkLyrics({ lyrics: "月亮挂在天上\n我在想着远方\n夜色落进窗前\n心事无人看见" });
ok("段内两组韵（各 ≥2）⇒ rhyme-shift", ids(rhymeShift).includes("rhyme-shift"), ids(rhymeShift));
const filler = checkLyrics({ lyrics: "夜色落在窗台\n心事无人知晓\n这一切都是你的" });
ok("虚字当韵脚 ⇒ rhyme-filler", ids(filler).includes("rhyme-filler"), ids(filler));

console.log("\n== ④ 词格 + 延音替换思路 ==");
const tight = checkLyrics({
  notes: [n(60, 0, "你"), n(60, 1, "-"), n(62, 2, "好"), n(62, 3, "-"), n(64, 4, "-"), n(65, 5, "-")],
  lyrics: "你好",
});
ok("音符比字多 ≥3 ⇒ word-count", ids(tight).includes("word-count"), ids(tight));
ok("单字占 ≥4 音符 ⇒ pad-room 且给替换思路", ids(tight).includes("pad-room") && /换思路/.test(JSON.stringify(tight.issues)), tight.issues.filter((i) => i.id === "pad-room"));

console.log("\n== ⑤ 上下文 ==");
const ctx = checkLyrics({ lyrics: "[Verse]\n我走在无人街上\n他要去看雪\n你翻开一本书\n[Chorus]\n灯还亮着\n梦还在烧" });
ok("一定有 context-review（逐句清单 + 交人/模型判）", ids(ctx).includes("context-review"), ids(ctx));
ok("人称 ≥3 类 ⇒ person-shift", ids(ctx).includes("person-shift"), ids(ctx));
ok("相邻句无共同实词 ⇒ logic-jump（参考级）", ids(ctx).includes("logic-jump"), ids(ctx));

console.log("\n== ⑥ 参考级声明与只列不改 ==");
const any = checkLyrics({ lyrics: "夜色轻轻落下\n我想起你的话" });
ok("verdict.caveat 写明多音字/轻声不一定准（参考级）", /参考级/.test(any.verdict.caveat) && /多音字/.test(any.verdict.caveat), any.verdict.caveat.slice(0, 60));
ok("advice 写明只列不改", /只列不改/.test(any.verdict.advice), any.verdict.advice.slice(0, 60));
ok("纯文本模式不做倒字判定（无音符）", !ids(any).includes("tone-mismatch"), ids(any));

console.log("\n== ⑦ 对齐：`-` 归到前一个字 ==");
const syl = alignSyllables([n(60, 0, "你"), n(60, 1, "-"), n(62, 2, "好")]);
ok("两个音节，第一个吃掉延音", syl.length === 2 && syl[0].noteCount === 2 && syl[0].hyphens === 1, syl);

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail === 0 ? 0 : 1);
