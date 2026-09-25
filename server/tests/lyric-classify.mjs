/**
 * 歌词语种判定 + 声调查询的离线自测（跑在编译产物上，**不碰宿主**）
 * 运行：cd server && npm run test:lyric
 */
import { classifyLyric, planGroupLanguage } from "../dist/lyric/language.js";
import { toneOfLyric, toneFromLyric, toneToAccent, tonesOfText } from "../dist/lyric/tone.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};

console.log("\n== 字形（第 ① 级）==");
ok("中文 ⇒ mandarin", classifyLyric("我").lang === "mandarin");
ok("中文多字 ⇒ mandarin", classifyLyric("下个夏天").lang === "mandarin");
ok("假名 ⇒ japanese", classifyLyric("さくら").lang === "japanese");
ok("片假名 ⇒ japanese", classifyLyric("サクラ").lang === "japanese");
ok("谚文 ⇒ korean", classifyLyric("사랑").lang === "korean");

console.log("\n== 拉丁字母按语义（第 ② 级）：拼音 / 罗马字**不是英语** ==");
ok("带调号 nǐ hǎo ⇒ mandarin（高置信）", classifyLyric("nǐ hǎo").lang === "mandarin" && classifyLyric("nǐ hǎo").confidence === "high");
ok("ni3 hao3 ⇒ mandarin（高置信）", classifyLyric("ni3 hao3").lang === "mandarin" && classifyLyric("ni3 hao3").confidence === "high");
ok("zhongguo（zh 特征）⇒ mandarin", classifyLyric("zhongguo").lang === "mandarin");
ok("xuexi（x 特征）⇒ mandarin", classifyLyric("xuexi").lang === "mandarin");
ok("wo bu ai ni ⇒ 偏 mandarin（低置信）", classifyLyric("wo bu ai ni").lang === "mandarin" && classifyLyric("wo bu ai ni").confidence === "low", classifyLyric("wo bu ai ni"));
ok("wo bu zhidao（含 zh 特征）⇒ mandarin（高置信）", classifyLyric("wo bu zhidao").lang === "mandarin" && classifyLyric("wo bu zhidao").confidence === "high", classifyLyric("wo bu zhidao"));
ok("arigatou（日语词表）⇒ japanese", classifyLyric("arigatou").lang === "japanese");
ok("sakura ⇒ japanese", classifyLyric("sakura").lang === "japanese");
ok("tsuki ⇒ japanese", classifyLyric("tsuki").lang === "japanese");
ok("hello world ⇒ english", classifyLyric("hello world").lang === "english");
ok("city lights ⇒ english", classifyLyric("city lights").lang === "english");
ok("纯标点 ⇒ 跳过", classifyLyric("---").lang === "");
ok("空 ⇒ 跳过", classifyLyric("").lang === "");

console.log("\n== 保守性：两可的不给高置信结论 ==");
const san = classifyLyric("san");
ok("san 不给高置信（既像拼音又像罗马字/英文）", san.confidence === "low", san);
const ka = classifyLyric("ka");
ok("ka 低置信或英文（不硬判）", ka.lang === "" || ka.confidence === "low" || ka.lang === "english", ka);

console.log("\n== 混合语种方案：只改少数派 ==");
const plan = planGroupLanguage([
  { index: 0, lyrics: "我", languageOverride: "" },
  { index: 1, lyrics: "的", languageOverride: "" },
  { index: 2, lyrics: "心", languageOverride: "" },
  { index: 3, lyrics: "hello", languageOverride: "" },
  { index: 4, lyrics: "city", languageOverride: "" },
]);
ok("多数派 = mandarin", plan.majority === "mandarin", plan.majority);
ok("只把英文那两个加成 toSet", plan.toSet.length === 2 && plan.toSet.every((t) => t.language === "english"), plan.toSet);
ok("中文那三个保持继承（不写）", plan.decisions.filter((d) => d.lang === "mandarin").every((d) => d.action === "keep"));
ok("两可的进 toAsk", (() => {
  const p2 = planGroupLanguage([
    { index: 0, lyrics: "我", languageOverride: "" },
    { index: 1, lyrics: "我", languageOverride: "" },
    { index: 2, lyrics: "san", languageOverride: "" },
  ]);
  return p2.toAsk.some((a) => a.index === 2);
})());

console.log("\n== 声调（1-4 四声 · 5 轻声）==");
ok("我 ⇒ 3（上声）", toneOfLyric("我", 0).accent === "3", toneOfLyric("我", 0));
ok("中 ⇒ 1（阴平）", toneOfLyric("中", 0).accent === "1", toneOfLyric("中", 0));
ok("国 ⇒ 2（阳平）", toneOfLyric("国", 0).accent === "2", toneOfLyric("国", 0));
ok("是 ⇒ 4（去声）", toneOfLyric("是", 0).accent === "4", toneOfLyric("是", 0));
ok("的 ⇒ 5（轻声，pinyin-pro 的 0 映射而来）", toneOfLyric("的", 0).accent === "5", toneOfLyric("的", 0));
ok("多音字按词定音：银行 ⇒ 银 yin2 / 行 hang2", (() => {
  const t = tonesOfText("银行");
  return t.length === 2 && t[0].syllable === "yin2" && t[1].syllable === "hang2";
})(), tonesOfText("银行"));
ok("多音字按词定音：行走 ⇒ 行 xing2 / 走 zou3", (() => {
  const t = tonesOfText("行走");
  return t.length === 2 && t[0].syllable === "xing2" && t[1].syllable === "zou3";
})(), tonesOfText("行走"));
ok("歌词自带调号 ⇒ 直接读（不查词典）", toneFromLyric("nǐ hǎo") === "3", toneFromLyric("nǐ hǎo"));
ok("歌词自带数字声调 ⇒ 直接读", toneFromLyric("ni3 hao3") === "3", toneFromLyric("ni3 hao3"));
ok("非中文歌词 ⇒ skip", toneOfLyric("hello", 0).action === "skip");
ok("toneToAccent：0/5 ⇒ 5（轻声）", toneToAccent(0) === "5" && toneToAccent(5) === "5");
ok("toneToAccent：1-4 原样", toneToAccent(1) === "1" && toneToAccent(4) === "4");

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail === 0 ? 0 : 1);
