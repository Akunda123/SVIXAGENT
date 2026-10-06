/**
 * **`ace_lyrics` 的离线单测**（不碰 ACE、不碰用户工程、不联网）
 * 运行：cd server && node tests/ace-lyrics.mjs
 *
 * 为什么这些要单测：**歌词写下去是"不可逆地改用户工程"**，而 ACE 的三条坑都不报错 ——
 *   · 字母表外的字符（数字/emoji）在切分阶段**被静默丢掉**（`skills/ace/SKILL.md` §4e 实测：`--text "云123"`
 *     ⇒ 只有 `云` 落位，`discardedText` 却是空串）⇒ 我们必须在干跑阶段自己扫出来；
 *   · `lyric fill` 的默认 intent **会按字形改写音符语种**（`help lyric fill` 的 intent 表）⇒ 默认必须走
 *     机制形态 `--filler tenuto-standby --follow-note-language=false`（语言纪律）；
 *   · 写回包说成功 ≠ 内容还在（`docs/识谱接入.md` §3.6c 实测）⇒ "接受了什么"与"读回看到什么"必须分开报。
 * 真机路径（`lyric fill` 真写、`note set-grapheme`）**不在这里**：那要 ACE 在线且会改工程，属联调。
 */
import { registerTools } from '../dist/tools.js';
import {
  scanLyricText, illegalTextBlock, planGraphemeAssignment, buildFillArgs, buildSetGraphemeArgs,
  summarizeLyricWrite, readBackLyrics, resolveLyricTarget, runLyricCheck,
} from '../dist/ace/lyrics.js';
import { prepareAceWrite, acceptedVsReadBack, classifyCliFailure } from '../dist/ace/prewrite.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 400) : '')); }
};

/* ───────────────── 合成夹具 + 假 CLI 运行器（形状抄自真机读回的字段名） ───────────────── */

const res = (json, code = 0, stderr = '') => ({ code, json, stdout: json ? JSON.stringify(json) : '', stderr, cmd: 'fake-acestudio-cli', args: [] });

const TRACK = { trackIndex: 0, trackName: 'Elirah', trackType: 'Sing', trackUuid: '{t0}', soundSourceName: 'Elirah', clipCount: 1 };
const TPS = 1080.00108000108;                       // 真机 `clipBegin/clipBeginSec` 反算出来的那个 1080 量级
const CLIP = { clipUuid: '{c0}', clipName: 'C', clipType: 'sing', clipBegin: 3360, clipBeginSec: 3360 / TPS, clipEnd: 3360 + 3840, clipEndSec: (3360 + 3840) / TPS, noteCount: 3, nativeUnit: 'tick' };
const NOTES = [
  { pos: 0, dur: 480, endPos: 480, pitch: 60, lyric: 'la', language: 'Chinese', noteUuid: '{n1}' },
  { pos: 480, dur: 480, endPos: 960, pitch: 62, lyric: '-', language: 'Chinese', noteUuid: '{n2}' },
  { pos: 960, dur: 480, endPos: 1440, pitch: 64, lyric: '', language: 'Chinese', noteUuid: '{n3}' },
];
const DIRTY_TEMP = { dirty: true, isNewProject: true, isTempProject: true, projectName: '', projectPath: '' };

/** 假运行器：按 `args[0] args[1]` 分派；`overrides` 可整段替换某条命令。 */
function makeRunner(overrides = {}) {
  const calls = [];
  const base = (args) => {
    const a = args[0], b = args[1];
    if (a === 'track' && b === 'list') return res({ contentTrackCount: 1, tracks: [TRACK] });
    if (a === 'clip' && b === 'list') return res({ clipCount: 1, clips: [CLIP] });
    if (a === 'clip' && b === 'note-content') return res({ fingerprint: '2:clip-note-content:aaaa1111', noteCount: NOTES.length, notes: NOTES });
    if (a === 'project' && b === 'dirty') return res(DIRTY_TEMP);
    if (a === 'project' && b === 'save') return res({ saved: true });
    return res(null, 2, 'unexpected: ' + args.join(' '));
  };
  const run = (args, timeoutMs) => {
    calls.push(args.slice());
    const h = overrides[a_key(args)] || base;
    return h(args, timeoutMs);
  };
  run.calls = calls;
  return run;
}
const a_key = (args) => (args[0] || '') + ' ' + (args[1] || '');
const calledWith = (run, key) => run.calls.some((c) => a_key(c) === key);

/* ───────────────── ① 注册（工具面在 tools.ts） ───────────────── */

console.log('== ① 两个新 ACE 工具注册进 tools.ts ==');
const registered = new Map();
{
  registerTools({ tool: (name, desc, schema, fn) => registered.set(name, { desc, schema, fn }) });
  ok("注册了 ace_lyrics", registered.has('ace_lyrics'), [...registered.keys()].filter((k) => k.startsWith('ace')));
  ok("注册了 ace_vocal_params", registered.has('ace_vocal_params'), [...registered.keys()].filter((k) => k.startsWith('ace')));
  ok("ace_lyrics 有 schema（mode/text/dryRun/saveFirst）", ['mode', 'text', 'dryRun', 'saveFirst', 'allowIllegalText'].every((k) => k in (registered.get('ace_lyrics')?.schema || {})));
  const d = registered.get('ace_lyrics')?.desc || '';
  ok("描述里写明了「默认不改语种」+「dry-run 默认」+「写后读回分开报」",
    /默认不改语种|默认\*\*不改语种/.test(d) && /dryRun/.test(d) && /读回/.test(d), d.slice(0, 160));
}

/* ───────────────── ② 文本扫描：字母表 / 分词 / 数字与符号点名 ───────────────── */

console.log('\n== ② 歌词文本扫描（ACE 的字母表，`help lyric fill`） ==');
{
  const s1 = scanLyricText('云123');
  ok("`云123` ⇒ 只有 `云` 是落位单位，3 个数字被逐个点名（引擎会静默丢）",
    s1.tokens.join(',') === '云' && s1.illegal.length === 3 && s1.illegal.every((x) => x.kind === 'digit'), s1);
  ok("数字的 hint 给出可照做的替代（写读音字）", /读音字/.test(s1.illegal[0].hint), s1.illegal[0].hint);
  ok("`云123` 会被**拒写**（默认）", illegalTextBlock(s1) !== null, illegalTextBlock(s1));
  ok("显式 allowIllegalText ⇒ 放行（唯一的越权口子）", illegalTextBlock(s1, true) === null);

  const s2 = scanLyricText('wo ai ni');
  ok("英文按空格成词：`wo ai ni` ⇒ 3 个 token", s2.tokens.join('|') === 'wo|ai|ni', s2.tokens);
  const s3 = scanLyricText('云, ABC!');
  ok("标点是分隔符（实测 `云, ABC!` ⇒ 2 个词：`云` / `ABC`）", s3.tokens.join('|') === '云|ABC', s3.tokens);
  const s4 = scanLyricText('banana#2');
  ok("`#N`（多音节词的第 N 个音节）保留在 token 里", s4.tokens.join('|') === 'banana#2', s4.tokens);
  const s5 = scanLyricText('la-me_?');
  ok("`-`（延音）/ `_`（留空）/ `?`（占位）各自成一个 token", s5.tokens.join('|') === 'la|-|me|_|?', s5.tokens);
  const s6 = scanLyricText('😀😀');
  ok("emoji 是字母表外符号 ⇒ 逐个点名（不是分隔符）", s6.tokens.length === 0 && s6.illegal.length === 2 && s6.illegal.every((x) => x.kind === 'symbol'), s6);
  const s7 = scanLyricText('，。！？；：、');
  ok("纯标点 ⇒ 一个 token 都不产生（分隔符）", s7.tokens.length === 0 && s7.illegal.length === 0, s7);
  const s8 = scanLyricText('multiple-');
  ok("`+` 连字符留在 token 里", scanLyricText('ba+na').tokens.join('|') === 'ba+na', scanLyricText('ba+na').tokens);
}

/* ───────────────── ③ 逐音对位（grapheme 模式）的干跑计划形状 ───────────────── */

console.log('\n== ③ 逐音对位干跑：字数 vs 音符数不匹配要如实报 ==');
{
  const p1 = planGraphemeAssignment(NOTES, ['ni', '-', 'hao']);
  ok("一对一：3 词 3 音 ⇒ rows/lyrics/noteUuids 都是 3",
    p1.rows.length === 3 && p1.lyrics.length === 3 && p1.noteUuids.join(',') === '{n1},{n2},{n3}', p1.counts);
  ok("token 原样落位（`-` 是延音，不翻译）", p1.lyrics.join('|') === 'ni|-|hao', p1.lyrics);
  ok("计数报出「旋律音 / 延音音 / 改动数」（延音 `-` 落到本来就是 `-` 的音上不算改动）",
    p1.counts.melodyNotes === 2 && p1.counts.tenutoNotes === 1 && p1.counts.changed === 2, p1.counts);

  const p2 = planGraphemeAssignment(NOTES, ['a', 'b', 'c', 'd']);
  ok("词比音符多 ⇒ 多出来的**列出来**（不静默丢）", p2.extraTokens.join(',') === 'd' && p2.counts.extraTokens === 1, p2.extraTokens);
  ok("词比音符多时 lyrics 仍与音符数等长（否则 ACE 直接 INVALID_ARG）", p2.lyrics.length === p2.noteUuids.length, { l: p2.lyrics.length, n: p2.noteUuids.length });

  const p3 = planGraphemeAssignment(NOTES, ['solo']);
  ok("词比音符少 ⇒ 剩下的音符**保持原样**（不被写成 `-`）", p3.lyrics[0] === 'solo' && p3.lyrics[1] === '-' && p3.lyrics[2] === '', p3.lyrics);
  ok("并把「有些音符没分到字」写进 warnings", p3.warnings.some((w) => /保持原样/.test(w)), p3.warnings);
  ok("未落字的音符有单独计数（untargetedNotes）", p3.counts.untargetedNotes === 2, p3.counts);

  const p4 = planGraphemeAssignment(NOTES, ['x'], { noteUuids: ['{n2}'] });
  ok("noteUuids 收窄范围 ⇒ 只对那一个音符出 row", p4.rows.length === 1 && p4.rows[0].noteUuid === '{n2}', p4.rows);
}

/* ───────────────── ④ 语种不改（语言纪律）+ 参数组装的硬口径 ───────────────── */

console.log('\n== ④ 语种默认不动：`lyric fill` 走机制形态，`set-grapheme` 不发 --language ==');
{
  const a1 = buildFillArgs({ clipUuid: '{c0}', noteUuids: ['{n1}', '{n2}'], text: 'ni hao', dryRun: true });
  ok("默认带 `--filler tenuto-standby`（机制形态必须有 --filler，否则 INVALID_ARG）", a1.includes('--filler') && a1[a1.indexOf('--filler') + 1] === 'tenuto-standby', a1);
  /* ⚠️ 真机踩过（2026-10-06）：`help lyric fill` 的签名是 `--follow-note-language[=<BOOL>]`（**方括号 + `=`**），
   * 所以只能发 `--follow-note-language=false` 这种**贴在一起的单参数**；
   * 写成 `--follow-note-language false`（空格分隔）会被 clap 当多余位置参数：
   * `error: unexpected argument 'false' found`（我们第一版就是这么写的，真机干跑直接 exit 2）。 */
  ok("默认 `--follow-note-language=false`（**`=` 贴上的单参数** ⇒ 不改语种）",
    a1.includes('--follow-note-language=false') && !a1.includes('--follow-note-language'), a1);
  ok("默认不带 `--match-grapheme-language`（引擎默认 true ⇒ 不发多余的旗标）", !a1.some((x) => x.startsWith('--match-grapheme-language')), a1);
  ok("默认**不**用三个 intent 旗标（它们会按字形改写语种）",
    !a1.includes('--from-sentence') && !a1.some((x) => x.startsWith('--from-single-note')) && !a1.includes('--as-batch-editor'), a1);
  ok("dryRun ⇒ 带 `--dry-run` 且**不带** `--if-match`（干跑不动撤销栈）", a1.includes('--dry-run') && !a1.includes('--if-match'), a1);
  ok("`--note` 按 UUID 列表给（在片段内按 clip 顺序填）", a1.includes('--note') && a1.slice(a1.indexOf('--note') + 1).includes('{n1}'), a1);

  const a2 = buildFillArgs({ clipUuid: '{c0}', sentence: 0, text: 'ni hao', dryRun: false, ifMatch: 'FP', waitBusy: '5s' });
  ok("按句填 ⇒ `--clip + --sentence N`", a2.includes('--clip') && a2.includes('--sentence') && a2[a2.indexOf('--sentence') + 1] === '0', a2);
  ok("真写 ⇒ 带 `--if-match`（陈旧写守卫）与 `--wait-busy`", a2.includes('--if-match') && a2[a2.indexOf('--if-match') + 1] === 'FP' && a2.includes('--wait-busy'), a2);

  const a3 = buildFillArgs({ clipUuid: '{c0}', noteUuids: ['{n1}'], text: 'x', followNoteLanguage: true, matchGraphemeLanguage: false, dryRun: true });
  ok("显式 followNoteLanguage:true 才让引擎跟随字形（同样是 `=` 形态）", a3.includes('--follow-note-language=true'), a3);
  ok("matchGraphemeLanguage 给了才发（`=` 形态）", a3.includes('--match-grapheme-language=false'), a3);
  ok("**没有**任何孤立的布尔值参数（`false`/`true` 不许单独出现在 argv 里）",
    !a3.some((x) => x === 'false' || x === 'true'), a3);

  let threw1 = null;
  try { buildFillArgs({ clipUuid: '{c0}', text: 'x', dryRun: true }); } catch (e) { threw1 = e.message; }
  ok("既不给 --note 也不给 --sentence ⇒ 我们本地就抛（引擎两个都会拒）", !!threw1 && /二选一/.test(threw1), threw1);
  let threw2 = null;
  try { buildFillArgs({ clipUuid: '{c0}', noteUuids: ['{n1}'], text: 'x', alignLinesToSentences: true, dryRun: true }); } catch (e) { threw2 = e.message; }
  ok("`--align-lines-to-sentences` 缺 `--sentence` ⇒ 本地先抛", !!threw2 && /--sentence/.test(threw2), threw2);

  const g1 = buildSetGraphemeArgs({ noteUuids: ['{n1}', '{n2}'], lyrics: ['ni', '-'] });
  ok("逐音写：默认**不带** `--language`（不给 = 每个音符语种原样不动）", !g1.includes('--language'), g1);
  ok("逐音写：`--lyrics` 是 JSON 数组", JSON.parse(g1[g1.indexOf('--lyrics') + 1]).join('|') === 'ni|-', g1);
  const g2 = buildSetGraphemeArgs({ noteUuids: ['{n1}'], lyrics: ['ni'], language: 'CHN' });
  ok("显式 language 才发 `--language CHN`", g2.includes('--language') && g2[g2.indexOf('--language') + 1] === 'CHN', g2);
  let threw3 = null;
  try { buildSetGraphemeArgs({ noteUuids: ['{n1}', '{n2}'], lyrics: ['ni'] }); } catch (e) { threw3 = e.message; }
  ok("lyrics 长度 ≠ 音符数 ⇒ 本地先拒（引擎必 INVALID_ARG）", !!threw3 && /长度/.test(threw3), threw3);
}

/* ───────────────── ⑤ 干跑：引擎自己的计划（形状 + 语种改写点数 + 丢弃文本） ───────────────── */

console.log('\n== ⑤ 干跑计划形状（引擎 `--dry-run` 回包 → 我们的报告） ==');
{
  const engineDry = res({
    clipUuid: '{c0}', timeBase: 'clip-local', intent: 'from-sentence',
    mechanism: { filler: 'tenuto-standby', scope: 'addressed-notes', followNoteLanguage: false },
    normalizedText: 'ni hao', sentences: [{ index: 0, sentenceBegin: 3360, sentenceEnd: 4320 }],
    notes: [
      { noteUuid: '{n1}', lyricBefore: 'la', lyricAfter: 'ni', languageBefore: 'Chinese', languageAfter: 'Chinese', languageChanged: false, filled: true, promoted: false, clearedOverride: false },
      { noteUuid: '{n2}', lyricBefore: '-', lyricAfter: 'hao', languageBefore: 'Chinese', languageAfter: 'English', languageChanged: true, filled: true, promoted: true, clearedOverride: true },
    ],
    notesFilled: 2, noteCount: 2, discardedText: 'yeah', undoPushed: false, dryRun: true,
  });
  const sum = summarizeLyricWrite(engineDry);
  ok("报出 notesFilled/noteCount/discardedText/undoPushed/dryRun",
    sum.notesFilled === 2 && sum.noteCount === 2 && sum.discardedText === 'yeah' && sum.undoPushed === false && sum.dryRun === true, sum);
  ok("语种被改写能被点数（languageChanged = 1）—— 语言纪律要看得见", sum.languageChanged === 1, sum.languageChanged);
  ok("promoted（延音被提升成头音符）也被点数", sum.promoted === 1, sum.promoted);
  ok("逐行 before/after 保留（供人核对）", sum.rows[0].before === 'la' && sum.rows[0].after === 'ni', sum.rows[0]);

  const engineNoJson = res(null, 2, 'error: the following required arguments were not provided:\n  --text <TEXT>');
  const sum2 = summarizeLyricWrite(engineNoJson);
  ok("引擎回非 JSON（用法错）⇒ 如实带出 exitCode/stderr，不假装成功", sum2.exitCode === 2 && /required arguments/.test(String(sum2.stderr)), sum2);
}

/* ───────────────── ⑥ 写后读回：不一致要分开报（§3.6c） ───────────────── */

console.log('\n== ⑥ 「ACE 接受了」vs「读回看到」（§3.6c：写响应 ≠ 持久） ==');
{
  // 读回**陈旧**：引擎说写进去了，note-content 还是旧字
  const staleRunner = makeRunner({ 'clip note-content': () => res({ fingerprint: '2:clip-note-content:bbbb2222', noteCount: 3, notes: NOTES }) });
  const rb = readBackLyrics(staleRunner, { trackIndex: 0, clipIndex: 0, expect: { '{n1}': 'ni', '{n2}': 'hao' } });
  ok("读回逐 uuid 对照 ⇒ mismatched 列出（expect/got 都在）",
    rb.mismatched.length === 2 && rb.mismatched[0].expect === 'ni' && rb.mismatched[0].got === 'la', rb);
  ok("matched/missing 分开计数", rb.matched === 0 && rb.missing.length === 0 && rb.noteCount === 3, rb);

  const accepted = summarizeLyricWrite(res({ notes: [{ noteUuid: '{n1}', lyric: 'ni' }, { noteUuid: '{n2}', lyric: 'hao' }], updatedCount: 2 }));
  const av = acceptedVsReadBack(accepted, rb, false, '写前替你 `project save` 过。');
  ok("报告分两块：accepted 说 ACE 接受了 2，readBack 列出 2 处不一致", av.accepted.updatedCount === 2 && av.readBack.mismatched.length === 2 && av.consistent === false, av);
  ok("note 明确「写响应不是内容已存在的证据」+ 以界面为准",
    /不是\*\*"内容已存在"的证据|不是.*内容已存在.*证据/.test(av.note) && /界面/.test(av.note), av.note);

  const rbOk = readBackLyrics(makeRunner({ 'clip note-content': () => res({ fingerprint: 'f', noteCount: 3, notes: NOTES.map((n, i) => ({ ...n, lyric: ['ni', 'hao', ''][i] })) }) }),
    { trackIndex: 0, clipIndex: 0, expect: { '{n1}': 'ni', '{n2}': 'hao' } });
  ok("一致时 matched = 2、mismatched 空", rbOk.matched === 2 && rbOk.mismatched.length === 0, rbOk);
  const avOk = acceptedVsReadBack(accepted, rbOk, true);
  ok("一致时 consistent = true（但 note 仍提醒以界面为准）", avOk.consistent === true && /界面/.test(avOk.note), avOk.note);
}

/* ───────────────── ⑦ 引擎拒写路径：NOTE_OVERLAP / STALE_WRITE —— 我们绝不替用户裁 ───────────────── */

console.log('\n== ⑦ 引擎拒写（含 NOTE_OVERLAP）⇒ 如实透传 + 给出处置，不裁剪任何东西 ==');
{
  const overlap = res(null, 1, 'error[NOTE_OVERLAP]: the write would overlap note {n1} — tick ranges [480, 960) and [720, 1200)');
  const f = classifyCliFailure(overlap);
  ok("NOTE_OVERLAP 被认出来", f && f.code === 'NOTE_OVERLAP' && f.exit === 1, f);
  ok("处置里点明「Sing 轨整笔拒」+「我们没有替你裁任何音」", /整笔拒/.test(f.hint) && /没有替你裁/.test(f.hint), f.hint);
  ok("并指出 Instrument / GenericMidi 是复调轨（允许重叠）", /Instrument/.test(f.hint) && /GenericMidi/.test(f.hint), f.hint);
  ok("原始 stderr 带出来（取证）", /NOTE_OVERLAP/.test(String(f.raw)), f.raw);

  const stale = classifyCliFailure(res(null, 1, 'error[STALE_WRITE]: fingerprint mismatch'));
  ok("STALE_WRITE ⇒ 重新读指纹再写（别无守护覆盖）", stale.code === 'STALE_WRITE' && /重新读/.test(stale.hint), stale);
  const busy = classifyCliFailure(res(null, 1, 'error[USER_BUSY]: an undo bracket is open'));
  ok("USER_BUSY ⇒ 加 --wait-busy / 稍后（不连着重试）", busy.code === 'USER_BUSY' && /--wait-busy/.test(busy.hint), busy);
  const inv = classifyCliFailure(res(null, 1, 'error[INVALID_ARG]: value 1.4 out of range'));
  ok("INVALID_ARG ⇒ 照 hint 改，**我们不会替你夹值**", inv.code === 'INVALID_ARG' && /不会替你夹值/.test(inv.hint), inv);
  ok("退出码 3 = 桥不可达（用户侧的事）", classifyCliFailure({ code: 3, json: null, stderr: '', stdout: '', cmd: 'x', args: [] }).code === 'BRIDGE_UNREACHABLE');
  ok("退出码 2 = 用法错（命令根本没跑）", classifyCliFailure({ code: 2, json: null, stderr: '', stdout: '', cmd: 'x', args: [] }).code === 'USAGE');
  ok("退出码 4 = job wait 超时（**不是失败**）", /不是失败/.test(classifyCliFailure({ code: 4, json: null, stderr: '', stdout: '', cmd: 'x', args: [] }).hint));
  ok("成功（exit 0）⇒ 没有 failure 段", classifyCliFailure(res({ ok: true })) === null);

  const sumOverlap = summarizeLyricWrite(overlap);
  ok("被拒时 accepted 里**没有**任何「写进去了」的字段（notesFilled/updatedCount 都缺）",
    sumOverlap.notesFilled === undefined && sumOverlap.updatedCount === undefined && sumOverlap.exitCode === 1, sumOverlap);
}

/* ───────────────── ⑧ 目标解析：tick 率从 clip 反算（绝不硬编码 1080） ───────────────── */

console.log('\n== ⑧ 目标解析（读轨/clip/音符 + 指纹 + tick 率反算） ==');
{
  const run = makeRunner();
  const t = resolveLyricTarget(run, { trackIndex: 0, clipIndex: 0 });
  ok("读到 clip 与 3 个音符", t.clip.clipUuid === '{c0}' && t.notes.length === 3, { clip: t.clip.clipUuid, n: t.notes.length });
  ok("指纹原样带出（写的时候要回传 --if-match）", t.fingerprint === '2:clip-note-content:aaaa1111', t.fingerprint);
  ok("tick 率从 clipBegin/clipBeginSec **反算**（≈1080，不是常量）",
    t.ticksPerSecond !== null && Math.abs(t.ticksPerSecond - 1080) < 0.5, t.ticksPerSecond);

  const noSec = makeRunner({ 'clip list': () => res({ clipCount: 1, clips: [{ ...CLIP, clipBeginSec: undefined, clipEndSec: undefined }] }) });
  const t2 = resolveLyricTarget(noSec, { trackIndex: 0 });
  ok("clip 没给 tick/sec 对 ⇒ ticksPerSecond = null（**不硬编码 1080**）", t2.ticksPerSecond === null, t2.ticksPerSecond);

  const badUuid = makeRunner();
  let threw = null;
  try { resolveLyricTarget(badUuid, { clipUuid: '{nope}' }); } catch (e) { threw = e.message; }
  ok("clipUuid 找不到 ⇒ 抛（错误文本能照做）", !!threw && /clipUuid/.test(threw), threw);
}

/* ───────────────── ⑨ 复核：复用宿主无关内核，且**只读** ───────────────── */

console.log('\n== ⑨ 复核（check 模式）：复用 sv_check_lyrics 内核 + 只读 ==');
{
  const run = makeRunner();
  const t = resolveLyricTarget(run, { trackIndex: 0 });
  const { report, timeBase } = runLyricCheck({ notes: t.notes, ticksPerSecond: t.ticksPerSecond, bpm: 120 });
  ok("出报告：issues 数组 + metrics + 逐句清单", Array.isArray(report.issues) && !!report.metrics && Array.isArray(report.sentences), Object.keys(report));
  ok("词格判据生效（音符数被数出来）", report.noteCount === 3, report.noteCount);
  ok("timeBase 说明换算依据（有 tick 率+BPM 就是绝对拍）", /绝对拍/.test(timeBase), timeBase);
  const t2 = runLyricCheck({ notes: t.notes });
  ok("没有 tick 率/BPM ⇒ 如实标注退化成相对量（只看走向）", /相对量/.test(t2.timeBase), t2.timeBase);
  ok("复核全程**没有发任何写命令**（只有读：track list / clip list / note-content）",
    run.calls.every((c) => a_key(c) === 'track list' || a_key(c) === 'clip list' || a_key(c) === 'clip note-content'),
    run.calls.map(a_key));
}

/* ───────────────── ⑩ 写前纪律：dirty 先 save / saveFirst:false 就不写 / 离线不写 ───────────────── */

console.log('\n== ⑩ 写前纪律（`docs/识谱接入.md` §3.6 铁律 1 + §3.6c） ==');
{
  const r1 = makeRunner();
  const p1 = prepareAceWrite(r1, {});
  ok("dirty:true ⇒ 默认替你 `project save` 并自述（savedBeforeWrite:true）", p1.ok && p1.savedBeforeWrite === true, p1);
  ok("确实发了 `project save`", calledWith(r1, 'project save'), r1.calls.map(a_key));
  ok("临时/未落盘工程 ⇒ 提醒「写被接受 ≠ 内容还在」（§3.6c）", p1.notices.some((n) => /临时|不落盘|3\.6c/.test(n) && /界面/.test(n)), p1.notices);

  const r2 = makeRunner();
  const p2 = prepareAceWrite(r2, { saveFirst: false });
  ok("saveFirst:false + dirty ⇒ **不写**，并说清怎么办", !p2.ok && /dirty/.test(p2.block) && /project.*save/.test(p2.block), p2.block);
  ok("被拦时**没有**发 `project save`（不越权）", !calledWith(r2, 'project save'), r2.calls.map(a_key));

  const offline = makeRunner({ 'project dirty': () => res(null, 3, 'bridge unreachable') });
  const p3 = prepareAceWrite(offline, {});
  ok("ACE 离线 ⇒ **不写**并如实报（exit 3 = 桥不可达）", !p3.ok && /不写/.test(p3.block) && /桥|不在线/.test(p3.block), p3.block);

  const saveFail = makeRunner({ 'project save': () => res(null, 1, 'error[HANDLER_FAILED]: disk full') });
  const p4 = prepareAceWrite(saveFail, {});
  ok("save 失败 ⇒ **不写**（不在未落盘状态上再叠改动）", !p4.ok && /save/.test(p4.block) && /HANDLER_FAILED/.test(p4.block), p4.block);
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
