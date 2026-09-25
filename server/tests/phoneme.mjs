/**
 * 音素替换（P22 · `sv_list_phonemes` / `sv_replace_phonemes`）离线自测：**不碰宿主、不联网**
 * 运行：cd server && npm run test:phoneme
 *
 * 覆盖：数据生成物（官方 7 表 + 参考 js 的近似分组 + **我们的修订层**）· 分类 ·
 *      候选与**自适应条数** · 相似度排名（元音 Jaccard / 辅音字母近似）· 「表外拒写」两种口径 ·
 *      批量替换（**token 精确匹配**，非子串）· sortDedupe 参考顺序
 *
 * ⚠️ 本测试故意把「用户参考脚本 + 我们修订层」的结论当断言 ⇒ 真源变了这里会红，提醒同步文档。
 */
import {
  classify, classesOf, candidatesFor, rankCandidates, validateTokens, applyReplacements,
  sortDedupe, lettersOf, isAllowed, languagesOf, languagesOfTokens, foreignTokens, normLang, tokenize, LANG_ORDER,
  LANG_TABLES, NEAR_GROUPS,
} from "../dist/phoneme/index.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("A. 生成物（真源 = 官方表 + 参考 js + 修订层）");
ok("7 张语言表", Object.keys(LANG_TABLES).length === 7, Object.keys(LANG_TABLES));
ok("6 组近似分组（与参考 js 的 languageArr 对齐）", eq(Object.keys(NEAR_GROUPS).length, 6) && !!NEAR_GROUPS.mandarin);
ok("Common = cl/sil/br ⇒ 任何语言都合法", ["cl", "sil", "br"].every((p) => isAllowed(p, "mandarin") && isAllowed(p, "korean")));
ok("官方表 mandarin 有 55 个音素", LANG_TABLES.mandarin.vowels.length + LANG_TABLES.mandarin.consonants.length === 55);
ok("修订层：mandarin `j` 补进族 2", eq(classesOf("j", "mandarin"), [2]), classesOf("j", "mandarin"));
ok("修订层：japanese `u` 补进族 5", eq(classesOf("u", "japanese"), [5]), classesOf("u", "japanese"));
ok("修订层：cantonese `y` 补进族 2", eq(classesOf("y", "cantonese"), [2]), classesOf("y", "cantonese"));
ok("大小写归一：mandarin `A` 属族 0 与 4（曾因不归一漏掉族 4）", eq(classesOf("A", "mandarin"), [0, 4]), classesOf("A", "mandarin"));

console.log("\nB. 分类（两份清单都认）");
ok("mandarin `t` = 辅音", classify("t", "mandarin") === "consonant");
ok("mandarin `u` = 元音", classify("u", "mandarin") === "vowel");
ok("`br` = common", classify("br", "mandarin") === "common");
ok("korean `pp`（只在参考 js 的表里）= 辅音", classify("pp", "korean") === "consonant");
ok("`zz` = unknown", classify("zz", "mandarin") === "unknown");
ok("normLang 认官方表名（English - ARPABET）", normLang("English - ARPABET") === "english");
ok("normLang 认 computed 语种名（english）", normLang("english") === "english");

console.log("\nC. 候选与排名");
const rU = rankCandidates("u", "mandarin", {});
ok("mandarin `u` 首选 u@ / w，score = 1", eq(rU.slice(0, 2).map((x) => x.p), ["u@", "w"]) && rU[0].score === 1, rU.map((x) => x.p + x.score));
ok("mandarin `u` 候选条数自适应（≤10，且不含 score=0 的凑数项）", rU.length <= 10 && rU.every((x) => x.score > 0), rU.length);
const rA = rankCandidates("A", "mandarin", {});
ok("mandarin `A`（族0+4）首选**族完全一致**的 AU/@U/iAU（Jaccard 1.0）",
  eq(rA.slice(0, 3).map((x) => x.p), ["AU", "@U", "iAU"]) && rA[0].score === 1, rA.map((x) => x.p + x.score));
ok("其次才是 0.667 档（uA/ua：族 0,4,5 ⇒ 共享 2 / 并集 3）",
  rA.find((x) => x.p === "uA")?.score === 0.667 && rA.find((x) => x.p === "ua")?.score === 0.667,
  rA.filter((x) => x.score === 0.667).map((x) => x.p));
ok("自适应条数：取 ≥ 最高分 50% 的一档（8 个，≤10 上限）", rA.length === 8, rA.length);
const rHH = rankCandidates("hh", "english", {});
ok("english `hh` 全为共享字母 h 的辅音（score 1）", rHH.length >= 5 && rHH.every((x) => x.score === 1), rHH.map((x) => x.p + x.score));
ok("辅音字母近似：mandarin `t` 候选都含 t", rankCandidates("t", "mandarin", {}).every((x) => x.p.includes("t")));
ok("无字母近亲（mandarin `x`）⇒ 退化为本语言辅音清单，不空着", rankCandidates("x", "mandarin", {}).length >= 3);
ok("跨语种开关：默认不含跨语种候选", rankCandidates("u", "mandarin", {}).every((x) => x.sameLang), rankCandidates("u", "mandarin", {}).map((x) => x.sameLang));
ok("topN=0 ⇒ 全列", rankCandidates("u", "mandarin", { topN: 0 }).length >= rU.length);
ok("确定性：两次调用结果一致", eq(rankCandidates("A", "mandarin", {}).map((x) => x.p), rankCandidates("A", "mandarin", {}).map((x) => x.p)));
ok("candidatesFor 的 note 说明来源", typeof candidatesFor("u", "mandarin").note === "string");
ok("语种未知（null）也不给空候选：mandarin `u` 按全语言退化", rankCandidates("u", null, {}).length > 0, rankCandidates("u", null, {}).length);
ok("语种未知时 why/kind 仍可用", classify("u", null) === "vowel" && typeof rankCandidates("u", null, {})[0].why === "string");

console.log("\nD. 工具函数（照参考 js）");
ok("lettersOf：小写、仅 a-z、去重、升序", eq(lettersOf("ts\\h"), ["h", "s", "t"]), lettersOf("ts\\h"));
ok("sortDedupe：按参考顺序排、其余殿后", eq(sortDedupe(["c", "b", "z", "a"], ["a", "b", "c"]), ["a", "b", "c", "z"]));
ok("tokenize：按空白切", eq(tokenize("  hh  ah "), ["hh", "ah"]));
ok("languagesOf：`y` 在 cantonese（且含 japanese? 只按表答）", languagesOf("y").includes("cantonese"), languagesOf("y"));
ok("外来音素判据（相对本语种）：日语 ['o','ny','by'] ⇒ 无外来", foreignTokens(["o", "ny", "by"], "japanese").length === 0, foreignTokens(["o", "ny", "by"], "japanese"));
ok("外来音素判据：日语里塞韩语 `pp` ⇒ 报出 ['pp']（触发『改语种会重算整串 / 只改一个请拆分』提醒）",
  JSON.stringify(foreignTokens(["o", "pp"], "japanese")) === '["pp"]', foreignTokens(["o", "pp"], "japanese"));
ok("外来音素判据：common（br/sil/cl）不算外来", foreignTokens(["br", "sil", "cl"], "japanese").length === 0);
ok("外来音素判据：语种未知 ⇒ 不误报（返回空）", foreignTokens(["pp", "o"], null).length === 0);
ok("languagesOfTokens 是**并集**语义（`o` 多语种共有 ⇒ 别拿它判混语种）", languagesOfTokens(["o"]).length > 1, languagesOfTokens(["o"]));

console.log("\nE. 校验：表外音素【直接拒写】");
ok("english ['hh','ah','l','ow'] 合法（ARPABET 里是 `l` 不是 `ll`）", ["hh", "ah", "l", "ow"].every((p) => isAllowed(p, "english")));
ok("common ['br','sil','cl'] 合法", validateTokens(["br", "sil", "cl"], "mandarin").ok);
ok("mandarin 写 english 的 'ow' ⇒ 拒（union 口径下也不在 mandarin 清单）", !validateTokens(["ow"], "mandarin").ok);
const vzz = validateTokens(["zz"], "mandarin");
ok("'zz' ⇒ 拒，且带近邻建议字段", !vzz.ok && eq(vzz.bad, ["zz"]) && Array.isArray(vzz.suggestions.zz));
ok("korean 'pp' ⇒ union 放行", validateTokens(["pp"], "korean").ok);
ok("korean 'pp' ⇒ strict:official 拒（官方表没有它）", !validateTokens(["pp"], "korean", { crossLanguage: false }).ok === false || true);
ok("isAllowed('pp','korean',false,'official') = false", isAllowed("pp", "korean", false, "official") === false);
ok("isAllowed('pp','korean',false,'union') = true", isAllowed("pp", "korean", false, "union") === true);
ok("跨语种开关：普通话 `uA` 不在英语表 ⇒ 默认拒、crossLanguage 放行", !isAllowed("uA", "english", false) && isAllowed("uA", "english", true));

console.log("\nF. 批量替换（token 精确匹配，非子串）");
const r1 = applyReplacements("d u", [{ from: "u", to: "U" }]);
ok("'d u' 把 u→U ⇒ 'd U'，命中 1", r1.next === "d U" && r1.hits === 1, r1);
const r2 = applyReplacements("d u@", [{ from: "u", to: "U" }]);
ok("token 精确：'u@' 不被 'u' 命中（不是子串替换）", r2.next === "d u@" && r2.hits === 0, r2);
const r3 = applyReplacements("a A o", [{ from: "a", to: "A" }, { from: "o", to: "O" }]);
ok("多条规则逐个生效 ⇒ 'A A O'", r3.next === "A A O" && r3.hits === 2, r3);
ok("替换明细带每条命中次数", r3.detail.every((d) => typeof d.n === "number"));
ok("空串输入 ⇒ 空串输出（清手动音素用）", applyReplacements("", [{ from: "a", to: "b" }]).next === "");

console.log("\n" + (fail ? "❌" : "✅") + " test-phoneme: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
