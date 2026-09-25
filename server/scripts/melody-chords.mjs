// 和弦感知旋律生成 v4：和弦内音滚动（有意设计起伏），强拍=根，循环滚动制造旋律
// 每小节 4 拍：强拍=根音(中音区)，后续在 三/五/七 与八度间滚动，接近调内
export function chordAwareMelodyV4(
  chords,
  opts = { keyRoot: 5, scale: "major", low: 66, high: 86, seed: 3 }
) {
  const QUARTER = 705600000;
  const keyRoot = opts.keyRoot ?? 5;
  const scaleIv = (opts.scale === "minor") ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
  const low = opts.low ?? 66, high = opts.high ?? 86;
  const beats = opts.beats ?? 4;

  function inScale(pc){ const rel=((pc-keyRoot)%12+12)%12; return scaleIv.indexOf(rel)>=0; }
  // 和弦音清单一：每个 chord 的 pcs（音级）
  function chordToneSet(ch){ const s=[]; for(const p of ch.pitchs){ const pc=(p%12+12)%12; if(s.indexOf(pc)<0)s.push(pc); } return s; }

  // 把一个音级放到 [low,high] 内指定的八度序（octIndex: 0=最低该音级在low上进, 1=+12）
  function place(pc, oct){
    // 找到 ≥low 的该音级，再加 oct*12
    let q=low + ((pc - (low%12) + 12) % 12);
    if(q<low) q+=12;
    q += oct*12;
    return q;
  }

  // 旋律滚动模式：per bar, 每个 beat 用 chord 里的某音级+八度
  // 强拍根音，后面滚动
  const notes = [];
  let prev = null;
  let lead = false; // 全局小方向
  for (let ci=0; ci<chords.length; ci++){
    const ch = chords[ci];
    const tset = chordToneSet(ch);
    if(tset.length===0) continue;
    // 该小节的滚动：beat0=根(低), beat1=五, beat2=三, beat3=七或根+8ve
    const roll = [0, 2, 1, 3]; // index into tset（若t小则 mod）
    const subDur = Math.round(ch.durationBlick / beats);
    for (let b=0;b<beats;b++){
      let pc = tset[roll[b % roll.length] % tset.length];
      // 八度：beat0 低(sep 0)，beat1 中，beat2 高，beat3 中低——形成起伏
      let oct = (b===0?0:(b===1?1:(b===2?1:(b===3?0:0))));
      let p = place(pc, oct);
      // 若超 high 则降八度，超 low 升
      while(p<low) p+=12; while(p>high) p-=12;
      notes.push({ pitch:p, onset: ch.startBlick + b*subDur, duration: subDur });
      prev = p;
    }
  }
  return notes;
}

if (process.argv[1] && process.argv[1].endsWith("melody-chords.mjs")) {
  const fs = await import("node:fs");
  const path = process.argv[2];
  const outPath = process.argv[3] || "scripts/melody-out.json";
  const chords = JSON.parse(fs.readFileSync(path, "utf8"));
  const melody = chordAwareMelodyV4(chords, {});
  const pr = [Math.min(...melody.map(m=>m.pitch)), Math.max(...melody.map(m=>m.pitch))];
  const compact = melody.map(m=>[m.pitch, Math.round(m.onset/705600000), Math.round(m.duration/705600000)]);
  fs.writeFileSync(outPath, JSON.stringify(compact));
  console.log("count="+melody.length+" pitchRange="+pr.join("-")+" -> "+outPath);
}
