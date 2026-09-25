/**
 * 歌词时序对齐：把带时间戳的歌词（LRC 或 [{start,end,text}]）按时间
 * 映射到音符（{onsetSec}），使歌词字词与音符 onset 对应。
 *
 * 核心策略（顺序填充，稳）：
 *  - 把每个段的歌词切成字/词序列。
 *  - 对每个音符，找其 onset 落在的段；把该段已分配的字按到达顺序依次给该段内音符。
 *  - 音符落在无歌词段 → 填 "-"。
 * 输出 aligned[]<{onsetSec, lyric}> 便于回填到 SV。
 */

export interface NoteTime {
  onsetSec: number;
  durationSec?: number;
  midi?: number;
}

export interface LyricSegment {
  start: number;   // 秒
  end?: number;    // 秒（省略用下一段 start）
  text: string;    // 该段时间的歌词文本
}

export interface AlignedUnit {
  onsetSec: number;
  lyric: string;
  segmentIndex: number;
}

export interface AlignResult {
  aligned: AlignedUnit[];
  bySegment: { [segmentIndex: number]: string[] };
  noteCount: number;
  skipped: number;
}

/** 解析 LRC：`[mm:ss.xx]text` 每行 → LyricSegment[]。 */
export function parseLrc(lrc: string): LyricSegment[] {
  const out: LyricSegment[] = [];
  for (const line of String(lrc || '').split(/\r?\n/)) {
    const m = line.match(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)/);
    if (!m) continue;
    const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0);
    const text = (m[4] || '').trim();
    if (text) out.push({ start, text });
  }
  out.sort((a, b) => a.start - b.start);
  // 补齐每段 end
  for (let i = 0; i < out.length; i++) out[i].end = out[i + 1] ? out[i + 1].start : (out[i].start + 5);
  return out;
}

/** 歌词文本 → 字/词序列（中文/无空格逐字；西文/有空格按词）。 */
function splitLyric(text: string): string[] {
  if (/[A-Za-z]/.test(text) || /\s/.test(text)) {
    return text.split(/[\s,，。.、!！?？;；:/\\|·-]+/).filter((s) => s.length > 0);
  }
  const out: string[] = [];
  for (const ch of text) if (!/\s/.test(ch)) out.push(ch);
  return out;
}

/** 判断音符 onset 落在哪个段（[start,end)）；无命中返回 -1。 */
function findSegment(notes_on: number, segments: LyricSegment[]): number {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (notes_on >= s.start && notes_on < (s.end !== undefined ? s.end : Infinity)) return i;
  }
  return -1;
}

/**
 * 状态机顺序填充：音符按 onset 排序，歌词字词按段顺序分配。
 */
export function alignLyricsToNotes(
  notes: NoteTime[],
  segments: LyricSegment[]
): AlignResult {
  // 音符按 onset 排序（保持索引映射）
  const idx = notes.map((_, i) => i).sort((a, b) => notes[a].onsetSec - notes[b].onsetSec);
  // 每段的字词序列 + 当前消费位置
  const segWords: string[][] = segments.map((s) => splitLyric(s.text));
  const segCursor: number[] = segments.map(() => 0);

  const aligned: AlignedUnit[] = new Array(notes.length);
  let skipped = 0;

  for (const i of idx) {
    const note = notes[i];
    const si = findSegment(note.onsetSec, segments);
    if (si < 0) {
      aligned[i] = { onsetSec: note.onsetSec, lyric: "-", segmentIndex: -1 };
      skipped++;
      continue;
    }
    const words = segWords[si];
    if (words.length === 0) {
      aligned[i] = { onsetSec: note.onsetSec, lyric: "-", segmentIndex: si };
      skipped++;
      continue;
    }
    const c = Math.min(segCursor[si], words.length - 1);
    aligned[i] = { onsetSec: note.onsetSec, lyric: words[c], segmentIndex: si };
    segCursor[si] = c + 1;
  }

  const bySegment: { [segmentIndex: number]: string[] } = {};
  for (let i = 0; i < segments.length; i++) if (segWords[i].length) bySegment[i] = segWords[i];

  return { aligned, bySegment, noteCount: notes.length, skipped };
}
