/**
 * 技法规则引擎（P20 · `sv_apply_articulations`）离线自测：**不碰宿主、不联网**
 * 运行：cd server && npm run test:articulations
 *
 * 覆盖：技能表解析 · 互斥消解（含对称性）· 风格档回落 · 乐句切分（缺口口径）·
 *      10 条走向规则逐条命中 · 优先级去重 · 段落级批量开关（beats/phrases）· 安全规则
 *      （跳过 fixed / 只写支持的 / 退路 / 族外静默跳过）· Lua 片段（当前组/撤销点/转义）· unwrapResult
 *
 * ⚠️ 本测试**故意从技能 JSON 读数**（单一事实源），但把「已写进技能文档的结论」当断言
 *    （如 Pizz.↔Arco 互斥）—— 若技能表改了，这里会红，提醒同步文档。
 */
import {
  loadArticulationData, conflicts, prune, pruneList, tierOf, splitPhrases, planRules, plan,
  fetchGroupCode, applyCode, applyToGroupCode, unwrapResult, QUARTER as Q,
} from "../dist/articulations/engine.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
/** 造音符：拍为单位 */
const N = (index, onsetBeats, durBeats, pitch, arts = [], fixed = false) =>
  ({ index, onset: Math.round(onsetBeats * Q), dur: Math.round(durBeats * Q), pitch, fixed, arts });
const rulesOf = (entries) => entries.map((e) => e.rule + ":" + e.index + ":" + e.want).sort().join(" | ");
const { matrix, rules } = loadArticulationData();
const DEF = tierOf(rules).tier;

console.log("== ① 技能表解析（单一事实源） ==");
{
  ok("矩阵 16 行（含未指定乐器）", matrix.instruments.length === 16, matrix.instruments.length);
  ok("已知键 ≥ 20", (matrix.knownKeys || []).length >= 20, matrix.knownKeys.length);
  ok("隐式键 4 个（Open/Arco/Senza Sordino/Center）",
    ["Open", "Arco", "Senza Sordino", "Center"].every((k) => matrix.implicitKeys[k]),
    Object.keys(matrix.implicitKeys));
  ok("规则 10 条", rules.rules.length === 10, rules.rules.length);
  ok("优先级覆盖全部 10 条", rules.priority.length === 10 &&
    rules.rules.every((r) => rules.priority.includes(r.id)), rules.priority);
  ok("风格档 5 个官方档 + (default)", ["Adagio", "Allegro", "con Fuoco", "Pop", "Ballade", "(default)"]
    .every((k) => typeof rules.styleTiers[k] === "object"), Object.keys(rules.styleTiers));
  for (const k of ["Adagio", "Allegro", "con Fuoco", "Pop", "Ballade", "(default)"]) {
    const t = rules.styleTiers[k];
    ok(`档 ${k} 四个量齐全`, ["minBeatsScale", "leapSemitones", "runCount", "shortBeats"].every((f) => typeof t[f] === "number"), t);
  }
  ok("乐句按缺口切、阈值 1 拍", rules.phraseSplit.by === "gap" && rules.phraseSplit.minGapBeats === 1, rules.phraseSplit);
}

console.log("== ② 互斥消解（矩阵全局互斥图） ==");
{
  const g = matrix.mutexGraph;
  let asymToImplicit = 0, asymOther = 0;
  for (const a of Object.keys(g)) for (const b of g[a]) if (!(g[b] || []).includes(a)) {
    if (matrix.implicitKeys[b]) asymToImplicit++; else asymOther++;
  }
  // 实测形状：显式键单向声明「与组内默认态互斥」；隐式键（Open/Arco/Senza Sordino/Center）**没有自己的行**
  // ⇒ 反向边必然缺失。这不是数据错，是设计：隐式键永远不出现 in supported，也就永远不会被设上去。
  ok("单向边全部指向隐式默认键（无例外）", asymOther === 0 && asymToImplicit === 8, { asymToImplicit, asymOther });
  ok("conflicts() 按双向判 ⇒ 隐式键那一侧也认", conflicts(matrix, "Open", "Straight") && conflicts(matrix, "Straight", "Open"));
  ok("隐式键不在任何乐器的支持集里（只是默认态）",
    !matrix.instruments.some((i) => (i.supported || []).some((k) => matrix.implicitKeys[k])),
    matrix.instruments.filter((i) => (i.supported || []).some((k) => matrix.implicitKeys[k])).map((i) => i.name));
  ok("文档结论：Pizz. ↔ Arco 互斥", conflicts(matrix, "Pizz.", "Arco") && conflicts(matrix, "Arco", "Pizz."));
  ok("文档结论：Pizz. ↔ C. Legno 互斥", conflicts(matrix, "Pizz.", "C. Legno"));
  ok("文档结论：Tremolo ↔ Slur 互斥", conflicts(matrix, "Tremolo", "Slur"));
  ok("Con Sordino ↔ Senza Sordino 互斥", conflicts(matrix, "Con Sordino", "Senza Sordino"));
  ok("Staccato 与 Pizz. 不互斥", !conflicts(matrix, "Staccato", "Pizz."));
  ok("未知键不产生互斥", !conflicts(matrix, "不存在的技法", "Pizz."));

  const p1 = prune(matrix, ["Pizz."], "Arco");
  ok("prune 把 Pizz. 剔掉再收 Arco", JSON.stringify(p1.next) === JSON.stringify(["Arco"]) && JSON.stringify(p1.removed) === JSON.stringify(["Pizz."]), p1);
  const p2 = prune(matrix, ["Staccato", "Pizz."], "Slur");
  ok("prune 只剔冲突项、保留无冲突项", JSON.stringify(p2.next) === JSON.stringify(["Staccato", "Slur"]) && JSON.stringify(p2.removed) === JSON.stringify(["Pizz."]), p2);
  const p3 = prune(matrix, [], "Tenuto");
  ok("prune 空集合 ⇒ 只加不删", JSON.stringify(p3.next) === JSON.stringify(["Tenuto"]) && p3.removed.length === 0, p3);
  const p4 = prune(matrix, ["Tenuto"], "Tenuto");
  ok("prune 幂等：已有同键不重复加", p4.next.filter((k) => k === "Tenuto").length === 1, p4);
}

console.log("== ③ 风格档与回落 ==");
{
  ok("未知风格 ⇒ (default)", tierOf(rules, "Hiphop").key === "(default)");
  ok("省略风格 ⇒ (default)", tierOf(rules).key === "(default)");
  ok("说明性键 _note 不算档位 ⇒ 回落 (default)", tierOf(rules, "_note").key === "(default)");
  ok("Adagio 阈值更松（minBeatsScale 更大）", tierOf(rules, "Adagio").tier.minBeatsScale > tierOf(rules, "Allegro").tier.minBeatsScale,
    [tierOf(rules, "Adagio").tier.minBeatsScale, tierOf(rules, "Allegro").tier.minBeatsScale]);
  ok("Allegro 短音阈值更短（shortBeats 更小）", tierOf(rules, "Allegro").tier.shortBeats <= DEF.shortBeats,
    [tierOf(rules, "Allegro").tier.shortBeats, DEF.shortBeats]);
}

console.log("== ④ 乐句切分（按缺口，阈值 1 拍） ==");
{
  const a = [N(1, 0, 1, 60), N(2, 1, 1, 62), N(3, 2, 2, 64)];       // 首尾相接
  const ra = splitPhrases(a, 1);
  ok("无缺口 ⇒ 1 个乐句", ra.phraseCount === 1 && ra.hasGap === false, ra);
  const b = [N(1, 0, 1, 60), N(2, 1, 1, 62), N(3, 4, 1, 64)];       // 空档 2 拍
  const rb = splitPhrases(b, 1);
  ok("空档 2 拍 ⇒ 2 个乐句、hasGap", rb.phraseCount === 2 && rb.hasGap === true, rb);
  ok("乐句号挂在音符上（1 起）", b.map((n) => n.phrase).join(",") === "1,1,2", b.map((n) => n.phrase));
  const c = [N(1, 0, 1, 60), N(2, 2, 1, 62)];                        // 空档正好 1 拍
  ok("空档 = 阈值 1 拍 ⇒ 也算换句", splitPhrases(c, 1).phraseCount === 2);
  const d0 = [N(1, 0, 1, 60), N(2, 1.5, 1, 62)];                     // 空档 0.5 拍
  ok("空档 0.5 拍 < 阈值 ⇒ 不换句", splitPhrases(d0, 1).phraseCount === 1);
  ok("乱序输入也能正确切（内部按 onset 排）",
    splitPhrases([N(2, 4, 1, 64), N(1, 0, 1, 60)], 1).phraseCount === 2);
}

console.log("== ⑤ 10 条走向规则逐条命中 ==");
{
  /** 乐句级规则要读 phrase ⇒ 先按缺口切句（与 plan() 内部同一口径） */
  const phrased = (ns) => { splitPhrases(ns, rules.phraseSplit.minGapBeats); return ns; };
  // 1 sameNoteRepeat
  {
    const ns = [N(1, 0, 0.25, 60), N(2, 0.25, 0.25, 60), N(3, 0.5, 0.25, 60)];
    const p = planRules(ns, rules, DEF, false);
    ok("同音×3 短音 ⇒ Tremolo ×3", rulesOf(p) === "sameNoteRepeat:1:Tremolo | sameNoteRepeat:2:Tremolo | sameNoteRepeat:3:Tremolo", rulesOf(p));
  }
  ok("同音×2 不够 runCount ⇒ 不触发", planRules([N(1, 0, 0.25, 60), N(2, 0.25, 0.25, 60)], rules, DEF, false).length === 0);
  ok("同音×3 但音够长 ⇒ 不触发", planRules([N(1, 0, 1, 60), N(2, 1, 1, 60), N(3, 2, 1, 60)], rules, DEF, false).length === 0);
  // 2 twoNoteAlternation
  {
    const ns = [N(1, 0, 0.5, 60), N(2, 0.5, 0.5, 62), N(3, 1, 0.5, 60), N(4, 1.5, 0.5, 62)];
    const p = planRules(ns, rules, DEF, false);
    ok("两音交替（音程 2）⇒ Trill Major ×4", p.length === 4 && p.every((x) => x.want === "Trill Major"), rulesOf(p));
  }
  {
    const ns = [N(1, 0, 0.5, 60), N(2, 0.5, 0.5, 61), N(3, 1, 0.5, 60), N(4, 1.5, 0.5, 61)];
    ok("两音交替（音程 1）⇒ Trill Minor", planRules(ns, rules, DEF, false).every((x) => x.want === "Trill Minor"));
  }
  // 3 leapIn
  {
    const p = planRules([N(1, 0, 1, 60), N(2, 1, 1, 79)], rules, DEF, false);
    ok("大跳 19 半音 ⇒ 后音 Portamento", rulesOf(p) === "leapIn:2:Portamento", rulesOf(p));
  }
  ok("音程 6 < 阈值 7 ⇒ 不出 leapIn（saxScoop 由族过滤，不在这里管）",
    !planRules([N(1, 0, 1, 60), N(2, 1, 1, 66)], rules, DEF, false).some((x) => x.rule === "leapIn"),
    rulesOf(planRules([N(1, 0, 1, 60), N(2, 1, 1, 66)], rules, DEF, false)));
  // 4 highPointApproach（乐句级）
  {
    const ns = phrased([N(1, 0, 1, 60), N(2, 1, 1, 65), N(3, 8, 1, 60)]);
    ok("乐句最高点上行进入 ⇒ Accent",
      planRules(ns, rules, DEF, true).some((x) => x.rule === "highPointApproach" && x.index === 2), rulesOf(planRules(ns, rules, DEF, true)));
    ok("无缺口 ⇒ 乐句级规则一律不触发",
      !planRules(ns, rules, DEF, false).some((x) => ["highPointApproach", "fallResolution", "phraseEndLong"].includes(x.rule)),
      rulesOf(planRules(ns, rules, DEF, false)));
    ok("hasGap=true 但没切过句 ⇒ 安全降级（不瞎猜句法）",
      !planRules(ns.map((x) => ({ ...x, phrase: undefined })), rules, DEF, true)
        .some((x) => ["highPointApproach", "fallResolution", "phraseEndLong"].includes(x.rule)));
  }
  // 5 fallResolution
  {
    const ns = phrased([N(1, 0, 1, 72), N(2, 1, 1, 66), N(3, 8, 1, 60)]);
    ok("句末自高点回落 ≥3 半音 ⇒ Fall（落在句末音）",
      planRules(ns, rules, DEF, true).some((x) => x.rule === "fallResolution" && x.index === 2), rulesOf(planRules(ns, rules, DEF, true)));
  }
  {
    const ns = phrased([N(1, 0, 1, 72), N(2, 1, 1, 71), N(3, 8, 1, 60)]);
    ok("回落仅 1 半音 ⇒ 不触发 Fall", !planRules(ns, rules, DEF, true).some((x) => x.rule === "fallResolution"));
  }
  // 6 staccatoRun
  {
    const ns = [N(1, 0, 0.25, 60), N(2, 0.25, 0.25, 64), N(3, 0.5, 0.25, 67)];
    ok("短音×3 非同音 ⇒ Staccato ×3", rulesOf(planRules(ns, rules, DEF, false)) === "staccatoRun:1:Staccato | staccatoRun:2:Staccato | staccatoRun:3:Staccato", rulesOf(planRules(ns, rules, DEF, false)));
  }
  // 7 stepwiseRun
  {
    const ns = [N(1, 0, 1, 60), N(2, 1, 1, 62), N(3, 2, 1, 64), N(4, 3, 1, 65)];
    const p = planRules(ns, rules, DEF, false);
    ok("同向级进×4 ⇒ Slur ×4", p.length === 4 && p.every((x) => x.want === "Slur"), rulesOf(p));
  }
  ok("级进只有 2 音 ⇒ 不触发", planRules([N(1, 0, 1, 60), N(2, 1, 1, 62)], rules, DEF, false).length === 0);
  {
    // 60-62-60-62 每步音程都是 2 ⇒ 按定义就是**两音交替**（Trill Major），不算级进 Slur
    const ns = [N(1, 0, 1, 60), N(2, 1, 1, 62), N(3, 2, 1, 60), N(4, 3, 1, 62)];
    const p = planRules(ns, rules, DEF, false);
    ok("方向来回（A-B-A-B）⇒ 归两音交替 Trill Major，不是 Slur",
      p.length === 4 && p.every((x) => x.rule === "twoNoteAlternation" && x.want === "Trill Major"), rulesOf(p));
  }
  // 8 phraseEndLong
  {
    const ns = phrased([N(1, 0, 1, 60), N(2, 1, 1, 60), N(3, 6, 3, 62)]);
    ok("句末长音 3 拍 ⇒ Tenuto",
      planRules(ns, rules, DEF, true).some((x) => x.rule === "phraseEndLong" && x.index === 3 && x.want === "Tenuto"),
      rulesOf(planRules(ns, rules, DEF, true)));
  }
  ok("句末长音但 < 阈值 2 拍 ⇒ 不触发",
    !planRules(phrased([N(1, 0, 1, 60), N(2, 6, 1, 62)]), rules, DEF, true).some((x) => x.rule === "phraseEndLong"));
  // 9/10 saxScoop / doitExit
  {
    const p = planRules([N(1, 0, 1, 60), N(2, 1, 2, 65), N(3, 4, 2, 60)], rules, DEF, false);
    ok("上行 5 半音进入长音 ⇒ Scoop（先于 Doit）", p.some((x) => x.rule === "saxScoop" && x.index === 2), rulesOf(p));
  }
  {
    const p = planRules([N(1, 0, 2, 65), N(2, 2, 2, 60)], rules, DEF, false);
    ok("下行 5 半音离开长音 ⇒ Doit", rulesOf(p) === "doitExit:1:Doit", rulesOf(p));
  }
  // 每音符至多 1 个技法 + 优先级排序
  {
    const ns = [N(1, 0, 0.25, 60), N(2, 0.25, 0.25, 60), N(3, 0.5, 0.25, 60), N(4, 0.75, 0.25, 79)];
    const p = planRules(ns, rules, DEF, false);
    const idx = p.map((x) => x.index);
    ok("每音符至多 1 条（无重复 index）", new Set(idx).size === idx.length, idx);
    ok("输出按 priority 排序（同音重复先于大跳）", p[0].rule === "sameNoteRepeat" && p.some((x) => x.rule === "leapIn"), rulesOf(p));
  }
  ok("空输入 ⇒ 空计划", planRules([], rules, DEF, false).length === 0);
}

console.log("== ⑥ plan()：段落级批量开关 ==");
{
  const notes = [N(1, 0, 1, 60), N(2, 1, 1, 64), N(3, 2, 1, 67), N(4, 3, 1, 72)];
  const sup = ["Staccato", "Tenuto", "Pizz.", "Arco", "Slur"];
  const r = plan({ notes, matrix, rules, supported: sup, segments: ["beats=1-3,Pizz."], force: false });
  ok("beats=1-3 只选中 onset 1/2 拍的两个音", r.targets.length === 2 && r.targets.every((t) => t.onset >= Q && t.onset < 3 * Q),
    r.targets.map((t) => t.onset / Q));
  ok("写入集合 = [Pizz.]", r.targets.every((t) => JSON.stringify(t.set) === JSON.stringify(["Pizz."])), r.targets.map((t) => t.set));
  ok("无 errors", r.errors.length === 0, r.errors);
  const r2 = plan({
    notes: [N(1, 0, 1, 60, ["Pizz."]), N(2, 1, 1, 64, ["Pizz."])],
    matrix, rules, supported: sup, segments: ["beats=0-4,Arco"],
  });
  ok("已有 Pizz. 的音符改 Arco ⇒ 剔除 Pizz.",
    r2.targets.length === 2 && r2.targets.every((e) => JSON.stringify(e.set) === JSON.stringify(["Arco"]) &&
      JSON.stringify(e.remove) === JSON.stringify(["Pizz."]) && JSON.stringify(e.before) === JSON.stringify(["Pizz."])),
    r2.targets.map((e) => ({ before: e.before, set: e.set, remove: e.remove })));
  const r3 = plan({ notes, matrix, rules, supported: ["Tenuto", "Pizz."], segments: ["beats=0-4,Slur"] });
  ok("不支持技法 ⇒ 记 errors、不产生目标", r3.errors.length === 1 && r3.targets.length === 0, r3.errors);
  const r4 = plan({ notes, matrix, rules, supported: sup, segments: ["bars=1-2,Pizz."] });
  ok("v1 不认 bars= ⇒ 记 errors", r4.errors.length === 1 && /beats|phrases/.test(r4.errors[0]), r4.errors);
  const r5 = plan({ notes, matrix, rules, supported: sup, segments: ["beats=0-4"] });
  ok("段落规格缺技法 ⇒ 记 errors", r5.errors.length === 1, r5.errors);
  const r6 = plan({ notes, matrix, rules, supported: sup, segments: ["phrases=2,Pizz."], wantRules: false });
  splitPhrases(notes, 1);
  ok("phrases=2 句式可解析（单乐句时无目标）", r6.errors.length === 0, r6.errors);
  const r7 = plan({ notes: [N(1, 0, 1, 60), N(2, 4, 1, 62)], matrix, rules, supported: sup, segments: ["phrases=2,Tenuto"] });
  ok("phrases=2 命中第 2 乐句", r7.targets.length === 1 && r7.targets[0].index === 2, r7.targets.map((t) => t.index));
}

console.log("== ⑦ plan()：安全规则（fixed / 退路 / 族外） ==");
{
  const sup = ["Staccato", "Tenuto", "Slur", "Accent", "Pizz.", "Arco", "Scoop", "Doit", "Tremolo"];
  // fixed 默认跳过
  {
    const notes = [N(1, 0, 1, 60, ["Pizz."], true), N(2, 1, 1, 64, [], false)];
    const r = plan({ notes, matrix, rules, supported: sup, segments: ["beats=0-4,Arco"] });
    ok("fixed 音符默认跳过（skip 说明含 fixed）",
      r.entries.some((e) => e.index === 1 && /fixed/.test(e.skip || "")) && r.targets.length === 1 && r.targets[0].index === 2,
      r.entries);
    ok("skip 项不带 set", r.entries.every((e) => !(e.skip && e.set)), r.entries);
    const rf = plan({ notes, matrix, rules, supported: sup, segments: ["beats=0-4,Arco"], force: true });
    ok("force=true ⇒ 连 fixed 也改（并剔除冲突 Pizz.）", rf.targets.length === 2 &&
      rf.targets.filter((t) => t.index === 1).every((t) => JSON.stringify(t.set) === JSON.stringify(["Arco"]) &&
        JSON.stringify(t.remove) === JSON.stringify(["Pizz."])), rf.targets);
  }
  // fixed 的两种措辞（有技法 / 空技法）——setArticulations 写一次就永久置 fixed，空 fixed 很常见
  {
    const r1 = plan({ notes: [N(1, 0, 1, 60, [], true)], matrix, rules, supported: sup, segments: ["beats=0-4,Arco"] });
    ok("fixed 且技法为空 ⇒ 措辞点明「锁定为无技法」", /锁定为「无技法」/.test(r1.entries[0].skip || ""), r1.entries[0].skip);
    const r2 = plan({ notes: [N(1, 0, 1, 60, ["Slur"], true)], matrix, rules, supported: sup, segments: ["beats=0-4,Arco"] });
    ok("fixed 且有技法 ⇒ 措辞列出技法名", /已有显式技法 Slur/.test(r2.entries[0].skip || ""), r2.entries[0].skip);
  }
  // 已是该技法 ⇒ 短路跳过
  {
    const notes = [N(1, 0, 1, 60, ["Tenuto"], false)];
    const r = plan({ notes, matrix, rules, supported: sup, segments: ["beats=0-4,Tenuto"] });
    ok("已是目标技法 ⇒ 跳过且不写", r.targets.length === 0 && r.entries[0].skip === "已是 Tenuto", r.entries);
  }
  // 不支持 ⇒ 退 fallback
  {
    const notes = [N(1, 0, 1, 60), N(2, 1, 1, 79)];                        // leapIn ⇒ Portamento
    const r = plan({ notes, matrix, rules, supported: ["Accent", "Tenuto"], wantRules: true });
    const t = r.targets.find((x) => x.index === 2);
    ok("Portamento 不支持 ⇒ 退 Accent（leapIn.fallback）", t && t.want === "Accent" && /退 Accent/.test(t.why || ""), r.entries);
  }
  // 不支持且无退路 ⇒ 跳过并报告
  {
    const notes = [N(1, 0, 1, 60), N(2, 1, 1, 60), N(3, 2, 1, 60)];
    const r = plan({ notes, matrix, rules, supported: ["Accent"], wantRules: true });
    ok("同音重复要 Tremolo 但该轨没有 ⇒ 如实跳过",
      r.targets.length === 0 && r.entries.every((e) => /不支持 Tremolo/.test(e.skip || "")), r.entries);
  }
  // 族外静默跳过（萨克斯规则 vs 弦乐支持集）
  {
    const notes = [N(1, 0, 2, 65), N(2, 2, 2, 60)];                       // 只有 doitExit 命中
    const sax = plan({ notes, matrix, rules, supported: ["Doit", "Scoop"], wantRules: true });
    ok("萨克斯支持集 ⇒ Doit 写入", sax.targets.some((t) => t.index === 1 && t.want === "Doit"), sax.entries);
    const vln = plan({ notes, matrix, rules, supported: ["Tenuto", "Slur", "Accent"], wantRules: true });
    ok("弦乐支持集 ⇒ 萨克斯规则静默跳过（不留 skip 噪声）", vln.entries.length === 0 && vln.targets.length === 0, vln.entries);
  }
  // rules=false 且无 segments 由 index.ts 拦；引擎层面给空计划
  {
    const r = plan({ notes: [N(1, 0, 1, 60)], matrix, rules, supported: ["Tenuto"] });
    ok("两条入口都不给 ⇒ 空计划（拦截在工具层）", r.entries.length === 0 && r.errors.length === 0, r);
  }
}

console.log("== ⑦.5 pruneList（「统一给一批音符设同一组技法」的自洽化） ==");
{
  const r1 = pruneList(matrix, ["Pizz."]);
  ok("单项原样", JSON.stringify(r1.used) === JSON.stringify(["Pizz."]) && r1.dropped.length === 0, r1);
  const r2 = pruneList(matrix, ["Pizz.", "Slur"]);
  ok("Pizz.+Slur 互斥 ⇒ 保前丢后", JSON.stringify(r2.used) === JSON.stringify(["Pizz."]) &&
    r2.dropped.length === 1 && r2.dropped[0].key === "Slur" && r2.dropped[0].conflictsWith.includes("Pizz."), r2);
  const r3 = pruneList(matrix, ["Con Sordino", "Tenuto", "Pizz."]);
  ok("保留无冲突的多项（弱音器与技法可叠加）",
    JSON.stringify(r3.used) === JSON.stringify(["Con Sordino", "Tenuto", "Pizz."]) && r3.dropped.length === 0, r3);
  const r4 = pruneList(matrix, ["Tremolo", "Slur", "Accent"]);
  ok("Tremolo 与 Slur 互斥 ⇒ 保 Tremolo、丢 Slur、留 Accent",
    JSON.stringify(r4.used) === JSON.stringify(["Tremolo", "Accent"]) && r4.dropped.length === 1 && r4.dropped[0].key === "Slur", r4);
  const r5 = pruneList(matrix, ["Tenuto", "Tenuto"]);
  ok("重复项去重并如实记 dropped", JSON.stringify(r5.used) === JSON.stringify(["Tenuto"]) && r5.dropped[0].conflictsWith[0].includes("重复"), r5);
  const r6 = pruneList(matrix, []);
  ok("空输入 ⇒ 空结果（工具层据此跳过补写）", r6.used.length === 0 && r6.dropped.length === 0, r6);
  const r7 = pruneList(matrix, ["不存在的技法", "Tenuto"]);
  ok("未知键不产生互斥、原样保留（支不支持只有宿主知道）",
    JSON.stringify(r7.used) === JSON.stringify(["不存在的技法", "Tenuto"]) && r7.dropped.length === 0, r7);
}

console.log("== ⑧ Lua 片段（真机验证过的形状） ==");
{
  const read = fetchGroupCode();
  ok("读片段含 getNumNotes/getAttributes", /getNumNotes\(\)/.test(read) && /getAttributes\(\)/.test(read));
  ok("读片段按组名找人（默认走当前组）", /ed:getCurrentGroup\(\):getTarget\(\)/.test(read) && !/true then/.test(read));
  ok("指定组名时走全轨搜索", /if true then/.test(fetchGroupCode("我的组")) && /nm == '我的组'/.test(fetchGroupCode("我的组")));
  ok("读片段切当前轨 + 切当前组（缺一不可）", /setCurrentTrack\(tr\)/.test(read) && /setCurrentGroup\(ref\)/.test(read));
  ok("读片段读支持集 getSupportedArticulations", /getSupportedArticulations/.test(read));
  const write = applyCode([{ index: 3, set: ["Pizz.", "Tenuto"] }]);
  ok("写片段先建撤销点", /newUndoRecord\(\)/.test(write));
  ok("写片段带目标音符与技法", /\{ index = 3, arts = \{ 'Pizz\.', 'Tenuto' \} \}/.test(write), write.match(/\{ index[^}]*\}/)?.[0]);
  ok("写片段写完回读", /readback/.test(write) && /getAttributes/.test(write));
  const inj = applyCode([{ index: 1, set: ["a'b"] }]);
  ok("技法名里的单引号被转义（防 Lua 注入）", /'a\\'b'/.test(inj), inj.match(/arts = \{[^}]*\}/)?.[0]);
  ok("组名带引号也转义（组名走同一处拼接）", /nm == 'x'/.test(fetchGroupCode("x")));
  const grp = applyToGroupCode("我的组", ["Pizz."]);
  ok("整组补写片段：先建撤销点", /newUndoRecord\(\)/.test(grp));
  ok("整组补写片段：按组名找组", /nm == '我的组'/.test(grp));
  ok("整组补写片段：逐音 setArticulations + 回读统计", /setArticulations/.test(grp) && /written = wrote/.test(grp) && /empty = empty/.test(grp));
  ok("整组补写片段：找不到组如实返回 err",
    /group not found/.test(grp) && /g == nil then return \{ ok = false, err/.test(grp));
  const grpInj = applyToGroupCode("x'y", ["a'b"]);
  ok("整组补写片段：组名与技法名都转义（防 Lua 注入）", /nm == 'x\\'y'/.test(grpInj) && /'a\\'b'/.test(grpInj),
    grpInj.match(/nm == '[^']*'|arts = \{[^}]*\}/g));
}

console.log("== ⑨ unwrapResult（桥回包剥壳） ==");
{
  ok("{resultType,result} ⇒ 取 result", JSON.stringify(unwrapResult({ resultType: "table", result: { ok: true } })) === '{"ok":true}');
  ok("fileIpc 响应壳 {ok,result:{resultType,result}} ⇒ 一路剥到 Lua 返回值",
    JSON.stringify(unwrapResult({ ok: true, result: { resultType: "table", result: { notes: [1] } } })) === '{"notes":[1]}');
  ok("裸对象原样返回", JSON.stringify(unwrapResult({ ok: true })) === '{"ok":true}');
  ok("Lua 自返 {ok,group,log}（无 result 键）不被误剥",
    JSON.stringify(unwrapResult({ ok: true, group: "g", log: [] })) === '{"ok":true,"group":"g","log":[]}');
  ok("失败响应 {ok:false,error} 原样返回（留给调用方判）",
    JSON.stringify(unwrapResult({ ok: false, error: "桥超时" })) === '{"ok":false,"error":"桥超时"}');
  ok("null/undefined ⇒ null", unwrapResult(null) === null && unwrapResult(undefined) === null);
  ok("resultType 但 result 缺失 ⇒ null", unwrapResult({ resultType: "nil" }) === null);
}

console.log("\n" + (fail === 0 ? "✅ 全部通过" : "❌ 有失败") + `：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
