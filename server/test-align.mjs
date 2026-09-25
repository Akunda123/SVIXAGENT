import { parseLrc, alignLyricsToNotes } from './dist/audio/lyric-align.js';

// 1) 测 LRC 解析
const lrc = `[00:00.00]当我想起
[00:02.00]你的时候
[00:04.00]世界变得安静`;
const segs = parseLrc(lrc);
console.log('=== LRC 解析 ===');
for (const s of segs) console.log(`  [${s.start.toFixed(2)}-${(s.end ?? 0).toFixed(2)}] ${s.text}`);

// 2) 测对齐：音符 onset 0.2,0.8,1.4,2.2,2.9,4.3,5.0
const notes = [
  { onsetSec: 0.2, durationSec: 0.6 }, { onsetSec: 0.9, durationSec: 0.5 },
  { onsetSec: 1.5, durationSec: 0.7 }, { onsetSec: 2.3, durationSec: 0.6 },
  { onsetSec: 3.0, durationSec: 0.5 }, { onsetSec: 4.4, durationSec: 0.6 },
  { onsetSec: 5.0, durationSec: 0.4 },
];
console.log('\n=== 对齐结果 ===');
const res = alignLyricsToNotes(notes, segs);
res.aligned.forEach((a, i) => {
  console.log(`  音符${i} @${a.onsetSec.toFixed(2)}s → "${a.lyric}" (seg ${a.segmentIndex})`);
});
console.log(`\nnoteCount=${res.noteCount} skipped=${res.skipped}`);
console.log('bySegment:', JSON.stringify(res.bySegment));
