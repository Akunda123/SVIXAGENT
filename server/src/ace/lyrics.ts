/**
 * **`ace_lyrics` 的内核** —— 歌词填充 / 逐音对位 / 复核（走 `acestudio-cli`，ACE **不走我们的桥**）。
 *
 * 对标 SV 侧的 `sv_apply_lyrics` / `sv_fill_lyrics_to_track` / `sv_check_lyrics`，但**机制完全不同**，
 * 所以三条能力分别走 ACE 自己的原语（原文出处逐条写在下面，别照 SV 猜）：
 *
 * | 能力 | ACE 原语 | 出处 |
 * |---|---|---|
 * | 句级填充（引擎自己切字/放延音/处理溢出） | `lyric fill --note … --text …`（或 `--clip … --sentence N`） | `acestudio-cli help lyric fill` |
 * | 逐音精确指定（一个音符一个 grapheme） | `note set-grapheme --note-uuid … --lyrics '[…]'`（别名 `set-lyric`） | `acestudio-cli help note set-grapheme` |
 * | 复核（倒字/谐音/韵脚/词格） | **不用 ACE**：复用宿主无关的 `server/src/lyric/check.ts`（纯函数） | `sv_check_lyrics` 的同一内核 |
 *
 * 四条**硬口径**（都有出处，别改成"顺手"的写法）：
 *   ① **语种默认不动**（语言纪律：用户比我们懂声库语种 —— `skills/akdagent-playbook` §0.6b/§0.6c）：
 *      `lyric fill` 的**默认行为会按字形改写音符语种**（`help lyric fill`：`--follow-note-language` 默认 true，
 *      三个 intent 里 `--from-sentence`/`--from-single-note` 都是 yes）⇒ 我们**默认改用机制形态**
 *      `--filler tenuto-standby --follow-note-language=false`（同 `help lyric fill` 的示例「the phrase-box filler,
 *      but without rewriting note language」），并把每行 `languageChanged` **如实报出来**（引擎仍可能因字形匹配而改，
 *      见 `--match-grapheme-language`）。
 *   ② **字母表外的字符会被引擎静默丢掉**（`skills/ace/SKILL.md` §4e 实测：`--text "云123"` ⇒ 只有 `云` 落位、
 *      其余音符被清空，而 `discardedText` **仍是空串**）⇒ 我们在干跑阶段**自己先扫一遍**字符，把数字/符号逐个点名，
 *      **不替用户改词**、只报。
 *   ③ **写后读回要分开报**（`docs/识谱接入.md` §3.6c：写响应 ≠ 持久）⇒ 见 `prewrite.ts`。
 *   ④ **音符组 = 头音符（歌词） + 延音音符（字面 `-`）**，且"不许出现半个音节"（§3.6b）⇒ 逐音模式里
 *      `-` / `_` 的含义就是 ACE 的延音 / 留空，我们原样传、不翻译。
 */
import { type AceRunner, type RunResult } from './index.js';
import { readClipNotes, resolveClip, type AceClip, type AceNoteRaw, type AceTrack } from './import-io.js';
import { checkLyrics, type LyricNote } from '../lyric/check.js';

/* ─────────────────────────── ① 文本扫描（字母表 / 分词） ─────────────────────────── */

/** `help lyric fill` 的机制字母表：grapheme · `-`(tenuto 延音) · `_`(留空) · `?`(占位) · `+`(多音节连字符) · `#N`(第 N 个音节)。 */
export const LYRIC_SPECIALS = ['-', '_', '?'] as const;

/** 空白与标点是**分隔符**（`help lyric fill`：空白会被折叠；实测 `"云, ABC!"` ⇒ 2 个词）。 */
const SEPARATORS = /[\s，。！？；：、,.!?;:…—～~'"“”‘’（）()【】\[\]《》<>「」/\\|@&*^%$=]/;

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
/** 字母（含 CJK/假名/谚文/拉丁/带调号拉丁）—— 用 unicode 属性挑，别用码点区间枚举。 */
const isLetter = (ch: string): boolean => /\p{L}/u.test(ch);

export interface TextScan {
  input: string;
  /** 切出来的落位单位（**逐音模式**用；句级模式下引擎自己切，这里只作预览参考） */
  tokens: string[];
  /** 字母表外的字符（引擎会**静默丢掉**；我们逐个点名，见口径 ②） */
  illegal: { char: string; index: number; kind: 'digit' | 'symbol'; hint: string }[];
  /** 提示性告警（不拦）：多音节连字符 / 占位符等 */
  warnings: string[];
}

/**
 * 扫一遍歌词文本。
 * @param splitPerChar CJK/假名/谚文是否**逐字**成一个 token（逐音对位 = true；句级预览 = false 也行，这里统一 true）
 */
export function scanLyricText(text: string, splitPerChar = true): TextScan {
  const tokens: string[] = [];
  const illegal: TextScan['illegal'] = [];
  const warnings: string[] = [];
  let buf = '';
  const flush = (): void => { if (buf) { tokens.push(buf); buf = ''; } };
  // ⚠️ 按**码点**走（`Array.from`）：emoji 得算**一个**字符，否则报出来的是两个孤立代理对（一个字都认不出）
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    // ⚠️ 特字母**先判**：`?` 同时落在标点类里，若先判分隔符，占位符就会被当成标点吃掉
    if ((LYRIC_SPECIALS as readonly string[]).includes(ch)) { flush(); tokens.push(ch); continue; }
    if (SEPARATORS.test(ch)) { flush(); continue; }
    if (ch === '#') {
      // `#N`：引擎自己生成、也可以手写（`skills/ace/SKILL.md` §4e：手写与只给整词结果逐条一致）
      const m = /^#(\d+)/.exec(chars.slice(i).join(''));
      if (m) { buf += m[0]; i += m[0].length - 1; continue; }
      illegal.push({ char: '#', index: i, kind: 'symbol', hint: '`#` 只用于 `#N`（多音节词的第 N 个音节）' });
      continue;
    }
    if (ch === '+') { buf += ch; continue; }
    if (isDigit(ch)) {
      illegal.push({
        char: ch, index: i, kind: 'digit',
        hint: '数字在 ACE 里解析不出音素（`phoneme g2p` 实测 `resolved:false`，且切分阶段就被静默丢掉）⇒ 要唱数字请写读音字（一/二/三 或 one/two/three）',
      });
      continue;
    }
    if (isLetter(ch)) {
      // CJK/假名/谚文逐字成 token；拉丁连续成词（一个词落在同一个音符上，与 `lyric fill` 口径一致）
      const cjk = /[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(ch);
      if (cjk && splitPerChar) { flush(); tokens.push(ch); }
      else buf += ch;
      continue;
    }
    illegal.push({ char: ch, index: i, kind: 'symbol', hint: '不在 `lyric fill` 的字母表里 ⇒ 引擎会在切分阶段静默丢掉它' });
  }
  flush();

  for (const t of tokens) {
    if (t.includes('+')) warnings.push(`token \`${t}\` 带多音节连字符 \`+\``);
  }
  if (tokens.includes('?')) warnings.push('`?` 是**占位符**（引擎会保留这一格不填字），确认是有意为之');
  return { input: text, tokens, illegal, warnings };
}

/**
 * **写入门**：字母表外字符默认**拒写**（口径 ②）。
 * 引擎的行为是"切分阶段静默丢掉、`discardedText` 都不报" ⇒ 我们宁可挡在门外，
 * 让调用方**显式**用 `allowIllegalText` 承担后果。返回 `null` = 放行。
 */
export function illegalTextBlock(scan: TextScan, allowIllegalText?: boolean): string | null {
  if (!scan.illegal.length || allowIllegalText === true) return null;
  const names = scan.illegal.slice(0, 8).map((x) => `\`${x.char}\`(@${x.index}，${x.kind === 'digit' ? '数字' : '符号'})`).join(' · ');
  return (
    `歌词里有 **ACE 字母表外**的字符 ⇒ **不写**（${names}${scan.illegal.length > 8 ? ` …共 ${scan.illegal.length} 个` : ''}）。` +
    '引擎会在切分阶段**静默丢掉**它们（连 `discardedText` 都不报）⇒ 数字请写读音字（一/二/三 或 one/two/three）。' +
    '确实要写就显式传 `allowIllegalText:true`。'
  );
}

/* ─────────────────────────── ② 目标解析（读轨/clip/音符 + 指纹） ─────────────────────────── */

export interface AceLyricTarget {
  track: AceTrack;
  clip: AceClip;
  clipIndex: number;
  /** `clip note-content` 的指纹 ⇒ 写的时候带回 `--if-match`（`help guardrails`：ETag 语义） */
  fingerprint: string;
  notes: AceNoteRaw[];
  /** 从 `clipBegin`/`clipBeginSec` **反算**（本机 1080 tick/s，绝不硬编码 —— §3.6b） */
  ticksPerSecond: number | null;
}

export function resolveLyricTarget(run: AceRunner, opts: { trackIndex?: number; clipIndex?: number; clipUuid?: string }): AceLyricTarget {
  const c = resolveClip(run, { ...opts, withNotes: true });
  return {
    track: c.track, clip: c.clip, clipIndex: c.clipIndex,
    fingerprint: c.fingerprint ?? '', notes: c.notes ?? [], ticksPerSecond: c.ticksPerSecond,
  };
}

/* ─────────────────────────── ③ 逐音对位（grapheme 模式）的干跑计划 ─────────────────────────── */

export interface GraphemeRow {
  index: number;
  noteUuid: string;
  pos: number;
  dur: number;
  endPos: number;
  pitch: number;
  currentLyric: string;
  currentLanguage?: string;
  /** 要写的字（`-` = 延音，`_` = 留空，'' = 不动） */
  targetLyric: string;
  changed: boolean;
}

export interface GraphemePlan {
  rows: GraphemeRow[];
  /** 要写的 `--lyrics` 数组（**长度必须 == 音符数**，`help note set-grapheme`：长度不等会被 `INVALID_ARG` 拒） */
  lyrics: string[];
  noteUuids: string[];
  counts: { notes: number; tokens: number; extraTokens: number; untargetedNotes: number; melodyNotes: number; tenutoNotes: number; changed: number };
  /** 词比音符多 ⇒ 多出来的（如实报，绝不静默丢」） */
  extraTokens: string[];
  warnings: string[];
}

/**
 * 把 token 按音符顺序一对一铺开（**只算不写**）。
 * 规则（与 ACE 的音符组口径一致，§3.6b）：
 *   · 只对**有歌词能力**的音符落字（Sing 轨）；Instrument/GenericMidi 音符没有 lyric，ACE 直接拒（`help note set-grapheme` Errors）
 *   · token 多于音符 ⇒ 多出来的**列出来**（不静默丢）
 *   · token 少于音符 ⇒ 剩下的音符**保持原样**（不给它 `-`：那会把"本来有字"的音符改成延音，属越权）
 */
export function planGraphemeAssignment(notes: readonly AceNoteRaw[], tokens: readonly string[], opts: { noteUuids?: readonly string[] } = {}): GraphemePlan {
  const wanted = opts.noteUuids && opts.noteUuids.length ? new Set(opts.noteUuids) : null;
  const targets = wanted ? notes.filter((n) => n.noteUuid && wanted.has(n.noteUuid)) : notes.slice();
  const rows: GraphemeRow[] = [];
  let ti = 0;
  for (let i = 0; i < targets.length; i++) {
    const n = targets[i]!;
    const target = ti < tokens.length ? tokens[ti++]! : '';
    rows.push({
      index: i,
      noteUuid: n.noteUuid || '',
      pos: n.pos,
      dur: n.dur,
      endPos: n.endPos ?? n.pos + n.dur,
      pitch: n.pitch,
      currentLyric: n.lyric ?? '',
      currentLanguage: n.language,
      targetLyric: target,
      changed: target !== '' && target !== (n.lyric ?? ''),
    });
  }
  const extraTokens = tokens.slice(ti);
  const lyrics = rows.map((r) => (r.targetLyric === '' ? r.currentLyric : r.targetLyric));
  const warnings: string[] = [];
  if (extraTokens.length) warnings.push(`词比音符多 ${extraTokens.length} 个：多出来的**没有落点**（ACE 不会替你加音符）`);
  if (rows.some((r) => r.targetLyric === '')) warnings.push('有些音符没分到字：它们**保持原样**（不会写成 `-`，那是另一种编辑）');
  if (rows.some((r) => r.currentLyric === '-' && r.targetLyric !== '' && r.targetLyric !== '-')) {
    warnings.push('有音符当前是延音 `-` 而这次要给它落字 ⇒ 相当于把它**提升为头音符**（§3.6b 的音符组语义）');
  }
  return {
    rows, lyrics, noteUuids: rows.map((r) => r.noteUuid),
    counts: {
      notes: rows.length, tokens: tokens.length, extraTokens: extraTokens.length,
      untargetedNotes: rows.filter((r) => r.targetLyric === '').length,
      melodyNotes: rows.filter((r) => r.targetLyric !== '-' && r.targetLyric !== '').length,
      tenutoNotes: rows.filter((r) => r.targetLyric === '-').length,
      changed: rows.filter((r) => r.changed).length,
    },
    extraTokens, warnings,
  };
}

/* ─────────────────────────── ④ 复核（宿主无关内核） ─────────────────────────── */

/**
 * 把 ACE clip 的音符换成 `checkLyrics` 要的形态（**拍**）。
 * ⚠️ 只用到 pitch 序列与相对位置（倒字看走向、韵脚看句尾）⇒ tick→拍 用 `ticksPerSecond × bpm` 反算，
 *    拿不到 tick 率时**退化成"每 tick 算一拍"的相对量**并**如实标注**（结论只对走向负责，不对绝对小节负责）。
 */
export function aceNotesToLyricNotes(notes: readonly AceNoteRaw[], opts: { ticksPerSecond?: number | null; bpm?: number }): { notes: LyricNote[]; timeBase: string } {
  const tps = opts.ticksPerSecond;
  const bpm = opts.bpm;
  let perQ: number | null = null;
  if (tps && tps > 0 && bpm && bpm > 0) perQ = (60 / bpm) * tps;
  const base = perQ ?? 1;
  return {
    notes: notes.map((n) => ({
      pitch: n.pitch,
      startBeat: n.pos / base,
      durBeats: Math.max(1e-6, n.dur / base),
      lyric: n.lyric ?? '',
    })),
    timeBase: perQ ? `绝对拍（tick 率 ${tps} tick/s × ${bpm} bpm 反算）` : '相对量（没读到 tick 率/BPM ⇒ **每 tick 当一拍**，只看走向与相对关系）',
  };
}

/* ─────────────────────────── ⑤ 写（引擎原语） ─────────────────────────── */

export interface FillArgs {
  clipUuid: string;
  /** 按句填（`--sentence N`）时给它；否则给 `--note` 列表 */
  sentence?: number;
  noteUuids?: readonly string[];
  text: string;
  /** 默认 false = **不改语种**（语言纪律）；true 才让引擎按字形跟随（`--follow-note-language`） */
  followNoteLanguage?: boolean;
  /** `--match-grapheme-language`（引擎默认 true）：字形在音符语种下解析不出时是否跟随字形语种 */
  matchGraphemeLanguage?: boolean;
  alignLinesToSentences?: boolean;
  dryRun: boolean;
  ifMatch?: string;
  waitBusy?: string;
}

/**
 * 组 `lyric fill` 的参数数组（**纯函数**，单测直接断言）。
 * ⚠️ 默认走**机制形态**（`--filler tenuto-standby --follow-note-language=false`）而不是 intent
 *    `--from-sentence`，因为后者**会把音符语种按字形改掉**（`help lyric fill` 的 intent 表）。
 *    机制参数必须带 `--filler`（否则 INVALID_ARG）。
 */
export function buildFillArgs(a: FillArgs): string[] {
  const args = ['lyric', 'fill'];
  if (a.sentence !== undefined) args.push('--clip', a.clipUuid, '--sentence', String(a.sentence));
  else if (a.noteUuids && a.noteUuids.length) args.push('--note', ...a.noteUuids);
  else throw new Error('`lyric fill` 必须二选一：`--clip + --sentence N`，或 `--note <UUID>...`（两个都不给/都给都会被拒）');
  args.push('--text', a.text);
  /* ⚠️ **布尔旗标必须用 `=` 贴上去**（2026-10-06 真机踩到）：`help lyric fill` 的签名写的是
   * `--follow-note-language[=<BOOL>]` / `--match-grapheme-language[=<BOOL>]`（方括号 + `=`），
   * 而它是 clap 的"可选值"参数 —— 写成 `--follow-note-language false`（空格分隔）会被当成**多余的位置参数**：
   * `error: unexpected argument 'false' found`。所以只能发 `--follow-note-language=false`。 */
  args.push('--filler', 'tenuto-standby', `--follow-note-language=${a.followNoteLanguage === true ? 'true' : 'false'}`);
  if (a.matchGraphemeLanguage !== undefined) args.push(`--match-grapheme-language=${a.matchGraphemeLanguage ? 'true' : 'false'}`);
  if (a.alignLinesToSentences) {
    if (a.sentence === undefined) throw new Error('`--align-lines-to-sentences` 必须配 `--sentence`（引擎口径）');
    args.push('--align-lines-to-sentences');
  }
  if (a.dryRun) args.push('--dry-run');
  if (a.ifMatch) args.push('--if-match', a.ifMatch);
  if (a.waitBusy) args.push('--wait-busy', a.waitBusy);
  return args;
}

/** 组 `note set-grapheme` 的参数数组（逐音精确写；`_`/`-` 原样传，不翻译）。 */
export function buildSetGraphemeArgs(a: { noteUuids: readonly string[]; lyrics: readonly string[]; language?: string; ifMatch?: string; waitBusy?: string }): string[] {
  if (!a.noteUuids.length) throw new Error('`note set-grapheme` 至少要给一个 `--note-uuid`');
  if (a.noteUuids.length !== a.lyrics.length) {
    throw new Error(`\`--lyrics\` 数组长度（${a.lyrics.length}）必须等于音符数（${a.noteUuids.length}）—— 否则 ACE 直接 INVALID_ARG`);
  }
  const args = ['note', 'set-grapheme', '--note-uuid', ...a.noteUuids, '--lyrics', JSON.stringify(a.lyrics)];
  // ⚠️ 语种默认**不给**（不给 = 每个音符的语种原样不动，`help note set-grapheme`）
  if (a.language) args.push('--language', a.language);
  if (a.ifMatch) args.push('--if-match', a.ifMatch);
  if (a.waitBusy) args.push('--wait-busy', a.waitBusy);
  return args;
}

/** 写回包里我们真正要看的字段（`help lyric fill` / `note set-grapheme` 的 Result 节）。 */
export function summarizeLyricWrite(r: RunResult): Record<string, unknown> {
  const j = (r.json ?? null) as Record<string, unknown> | null;
  if (!j) return { exitCode: r.code, json: null, stderr: r.stderr || undefined, stdout: r.stdout || undefined };
  const rows = Array.isArray(j.notes) ? (j.notes as Record<string, unknown>[]) : [];
  return {
    exitCode: r.code,
    notesFilled: j.notesFilled,
    noteCount: j.noteCount,
    updatedCount: j.updatedCount,
    discardedText: j.discardedText,
    normalizedText: j.normalizedText,
    intent: j.intent,
    mechanism: j.mechanism,
    undoPushed: j.undoPushed,
    dryRun: j.dryRun,
    /** 语种有没有被改写（语言纪律要能看到） */
    languageChanged: rows.filter((x) => x.languageChanged === true).length,
    promoted: rows.filter((x) => x.promoted === true).length,
    clearedOverride: rows.filter((x) => x.clearedOverride === true).length,
    rows: rows.map((x) => ({ noteUuid: x.noteUuid, before: x.lyricBefore, after: x.lyricAfter, languageBefore: x.languageBefore, languageAfter: x.languageAfter, languageChanged: x.languageChanged, filled: x.filled, promoted: x.promoted })),
  };
}

/**
 * 写完**读回**：`clip note-content` 的 `lyric` 逐 uuid 与"我们要写的字"对照。
 * 这是 §3.6c 纪律的落地：读回只作参考，**与写响应分开报**。
 */
export function readBackLyrics(run: AceRunner, opts: { trackIndex: number; clipIndex: number; expect: Record<string, string> }): { noteCount: number; matched: number; mismatched: { noteUuid: string; expect: string; got: string }[]; missing: string[] } {
  const { notes } = readClipNotes(opts.trackIndex, opts.clipIndex, run);
  const byUuid = new Map(notes.map((n) => [n.noteUuid || '', n] as const));
  const mismatched: { noteUuid: string; expect: string; got: string }[] = [];
  const missing: string[] = [];
  let matched = 0;
  for (const [uuid, want] of Object.entries(opts.expect)) {
    const got = byUuid.get(uuid);
    if (!got) { missing.push(uuid); continue; }
    if ((got.lyric ?? '') === want) matched++;
    else mismatched.push({ noteUuid: uuid, expect: want, got: got.lyric ?? '' });
  }
  return { noteCount: notes.length, matched, mismatched, missing };
}

/** 复核入口（把三种输入统一收口，工具层只管传参）。 */
export function runLyricCheck(input: { notes: readonly AceNoteRaw[]; ticksPerSecond?: number | null; bpm?: number; lyrics?: string; timeSig?: number }) {
  const { notes, timeBase } = aceNotesToLyricNotes(input.notes, { ticksPerSecond: input.ticksPerSecond, bpm: input.bpm });
  const report = checkLyrics({ lyrics: input.lyrics, notes, timeSig: input.timeSig });
  return { report, timeBase };
}
