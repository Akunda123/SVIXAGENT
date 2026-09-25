/**
 * `sv_import_musicxml` 的**离线单测**：P5「tech/dynamics/instrument 映射复核 + 导入护栏整组」
 * 运行：cd server && npm run test:musicxml      （不碰宿主、不联网）
 *
 * 覆盖：
 *   ① 映射复核 —— 音高/时值/附点/和弦/歌词 · 技法（含 2026-09-21 改正的 harmon-mute→Stem、harmonic→Harmonics）
 *      · 未映射项如实回报（up-bow/down-bow/open-string/stopped）· tie/slur · 乐器 GM program
 *   ② 力度 —— **小节级 `<dynamics>` running state**（旧实现只读 note 级 ⇒ 从没生效）· `<sound dynamics>` 百分比 ·
 *      note velocity 优先级 · 记号切换
 *   ③ 护栏 —— 路径（URL/相对/.svp/.ixp/扩展名）· XML 安全面（DOCTYPE/ENTITY，双保险：parser 内也拒）·
 *      SHA-256（含"改了文件哈希变"）· 可读性/大小 · 512 音符上限 · 复调/和弦体检
 */
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseMusicXML } from "../dist/audio/musicxml.js";
import { resolveInstrument, IX_LIBRARIES } from "../dist/audio/ix-library-map.js";
import {
  guardMusicXmlPath, guardFileReadable, scanXmlSafety, sha256OfFile, checkNoteCap,
  detectPolyphony, isPolyphonic, NOTE_CAP, RIGHTS_NOTE,
} from "../dist/audio/musicxml-guard.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};

/** 造一份最小 score-partwise。notesXml 里可放任意 <note>；divisions 默认 4 */
const score = (notesXml, { divisions = 4, partName = "Violin", midiProgram = null, directions = "", timeSig = "4/4" } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>${partName}</part-name>
  ${midiProgram === null ? "" : `<midi-instrument id="P1-I1"><midi-program>${midiProgram}</midi-program></midi-instrument>`}
  </score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>${divisions}</divisions><key><fifths>0</fifths></key><time><beats>${timeSig.split("/")[0]}</beats><beat-type>${timeSig.split("/")[1]}</beat-type></time></attributes>
    ${directions}
    ${notesXml}
  </measure></part>
</score-partwise>`;
/** 单音：step/octave/时值(拍)/可选内嵌 XML */
const note = (step, octave, beats, extra = "", { voice = 1, type = "quarter" } = {}) =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${Math.round(beats * 4)}</duration><voice>${voice}</voice><type>${type}</type>${extra}</note>`;
const rest = (beats) => `<note><rest/><duration>${Math.round(beats * 4)}</duration><voice>1</voice></note>`;
const dyn = (mark) => `<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type></direction>`;
const soundDyn = (pct) => `<direction><sound dynamics="${pct}"/></direction>`;

console.log("== ① 基础映射（音高 / 时值 / 和弦 / 歌词 / 休止） ==");
{
  const x = score(note("C", 4, 1) + note("D", 4, 1) + note("E", 4, 1));
  const s = parseMusicXML(x);
  const p = s.parts[0];
  ok("C4/D4/E4 ⇒ 60/62/64", p.notes.map((n) => n.pitch).join(",") === "60,62,64", p.notes.map((n) => n.pitch));
  ok("onset 递进 0/1/2 拍", p.notes.map((n) => n.onset).join(",") === "0,1,2", p.notes.map((n) => n.onset));
  ok("时值 1 拍", p.notes.every((n) => n.duration === 1), p.notes.map((n) => n.duration));
  ok("part 名读到", p.name === "Violin", p.name);

  const chord = parseMusicXML(score(note("C", 4, 1) + note("E", 4, 1, "<chord/>") + note("G", 4, 1, "<chord/>")));
  ok("和弦内音同 onset", chord.parts[0].notes.every((n) => n.onset === 0), chord.parts[0].notes.map((n) => n.onset));

  const ly = parseMusicXML(score(note("C", 4, 1, '<lyric number="1"><syllabic>single</syllabic><text>啊</text></lyric>')));
  ok("歌词读到", ly.parts[0].notes[0].lyrics === "啊", ly.parts[0].notes[0].lyrics);

  const r = parseMusicXML(score(note("C", 4, 1) + rest(1) + note("D", 4, 1)));
  ok("休止：进数组但标 rest（写入前会被过滤）", r.parts[0].notes.length === 3 && r.parts[0].notes[1].rest === true && r.parts[0].notes[1].pitch === -1,
    r.parts[0].notes.map((n) => [n.pitch, n.rest]));
  ok("休止仍推进 onset（第 3 音在 2 拍）", r.parts[0].notes[2].onset === 2, r.parts[0].notes.map((n) => n.onset));
}

console.log("== ② 技法映射（含 2026-09-21 复核改正的两处） ==");
{
  const map = (inner) => (parseMusicXML(score(note("C", 4, 1, `<notations>${inner}</notations>`))).parts[0].notes[0].articulations || []);
  ok("staccato ⇒ Staccato", map("<articulations><staccato/></articulations>").includes("Staccato"));
  ok("tenuto ⇒ Tenuto", map("<articulations><tenuto/></articulations>").includes("Tenuto"));
  ok("accent ⇒ Accent", map("<articulations><accent/></articulations>").includes("Accent"));
  ok("strong-accent ⇒ Accent", map("<articulations><strong-accent/></articulations>").includes("Accent"));
  ok("spiccato ⇒ Staccato", map("<articulations><spiccato/></articulations>").includes("Staccato"));
  ok("staccatissimo ⇒ Staccato", map("<articulations><staccatissimo/></articulations>").includes("Staccato"));
  ok("detached-legato ⇒ Slur", map("<articulations><detached-legato/></articulations>").includes("Slur"));
  ok("trill-mark ⇒ Trill Minor（默认口径）", map("<ornaments><trill-mark/></ornaments>").includes("Trill Minor"));
  ok("pizzicato ⇒ Pizz.", map("<articulations><pizzicato/></articulations>").includes("Pizz."));
  ok("snap-pizzicato ⇒ Pizz.", map("<articulations><snap-pizzicato/></articulations>").includes("Pizz."));
  ok("doit ⇒ Doit", map("<articulations><doit/></articulations>").includes("Doit"));
  ok("falloff ⇒ Fall", map("<articulations><falloff/></articulations>").includes("Fall"));
  ok("bend ⇒ Portamento", map("<articulations><bend/></articulations>").includes("Portamento"));
  ok("breath-mark ⇒ Breath", map("<articulations><breath-mark/></articulations>").includes("Breath"));
  ok("tremolo ⇒ Tremolo", map("<articulations><tremolo/></articulations>").includes("Tremolo"));

  // ⭐ 复核改正
  ok("🆕 <technical><harmonic/> ⇒ Harmonics（弦乐泛音 = Harmonics 的正主）",
    map("<technical><harmonic/></technical>").includes("Harmonics"), map("<technical><harmonic/></technical>"));
  const hm = map("<technical><harmon-mute/></technical>");
  ok("🆕 <technical><harmon-mute/> ⇒ **Stem**（铜管 harmon 弱音器；旧版错成 Harmonics）",
    hm.includes("Stem") && !hm.includes("Harmonics"), hm);

  // 未映射项如实回报（不猜、不静默）
  const u = parseMusicXML(score(note("C", 4, 1, "<notations><technical><up-bow/><down-bow/><open-string/><stopped/></technical></notations>"))).parts[0];
  ok("弓向/空弦/stopped 不产出技法", (u.notes[0].articulations || []).length === 0, u.notes[0].articulations);
  ok("未映射项进 warnings（4 条）", (u.warnings || []).length === 4, u.warnings);
  ok("warnings 说明 why（含 Stopped 未复验口径）", (u.warnings || []).some((w) => /Stopped/.test(w)) && (u.warnings || []).some((w) => /弓向/.test(w)), u.warnings);

  // tie / slur
  const tie = parseMusicXML(score(
    `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><notations><tied type="start"/></notations></note>` +
    `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice></note>`)).parts[0].notes;
  ok("tie type=start ⇒ tieStart + Slur", tie[0].tieStart === true && (tie[0].articulations || []).includes("Slur"), tie[0]);
  ok("tie type=stop ⇒ tieStop", tie[1].tieStop === true, tie[1]);
}

console.log("== ③ 力度：小节级记号 running state（旧实现从没生效）+ 优先级 ==");
{
  const s1 = parseMusicXML(score(dyn("mf") + note("C", 4, 1) + note("D", 4, 1)));
  ok("小节级 <dynamics><mf/> ⇒ 该小节音符 dynamic = 0.60",
    s1.parts[0].notes.every((n) => n.dynamic === 0.60), s1.parts[0].notes.map((n) => n.dynamic));

  // ⚠️ 已知局限（本次复核确认，已写进映射表 §3）：力度按**小节粒度**生效 ——
  //    同一小节里多个记号取**最后一个**。原因：MusicXML 记号本应按文档顺序在音与音之间生效，
  //    而 fast-xml-parser 默认**不保序**（要保序得全量改 preserveOrder，收益不抵风险）⇒ 不做逐位置推进。
  const s2 = parseMusicXML(score(dyn("p") + note("C", 4, 1) + dyn("f") + note("D", 4, 1)));
  ok("同小节多个记号 ⇒ 取最后一个（小节粒度，已在文档写明）",
    s2.parts[0].notes.every((n) => n.dynamic === 0.75), s2.parts[0].notes.map((n) => n.dynamic));

  // 跨小节：running state 必须延续
  const two = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>V</part-name></score-part></part-list><part id="P1">
    <measure number="1"><attributes><divisions>4</divisions></attributes>${dyn("pp")}${note("C", 4, 1)}</measure>
    <measure number="2"><attributes><divisions>4</divisions></attributes>${note("D", 4, 1)}</measure>
    <measure number="3"><attributes><divisions>4</divisions></attributes>${dyn("ff")}${note("E", 4, 1)}</measure>
  </part></score-partwise>`;
  const s2b = parseMusicXML(two).parts[0].notes;
  ok("力度 running state 跨小节延续（pp 0.15 → 第 2 小节仍是 0.15 → 第 3 小节换 ff 0.90）",
    s2b[0].dynamic === 0.15 && s2b[1].dynamic === 0.15 && s2b[2].dynamic === 0.90,
    s2b.map((n) => [n.pitch, n.dynamic]));

  const s3 = parseMusicXML(score(soundDyn(80) + note("C", 4, 1)));
  ok("<sound dynamics=\"80\">（百分比）⇒ 0.8", s3.parts[0].notes[0].dynamic === 0.8, s3.parts[0].notes[0].dynamic);

  const s4 = parseMusicXML(score(dyn("pp") + note("C", 4, 1) + `<note velocity="127"><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>`));
  ok("note velocity 优先于记号（127 ⇒ 1.00，后音仍沿用 0.15）",
    s4.parts[0].notes[0].dynamic === 0.15 && s4.parts[0].notes[1].dynamic === 1,
    s4.parts[0].notes.map((n) => n.dynamic));

  const s5 = parseMusicXML(score(note("C", 4, 1)));
  ok("无任何力度信息 ⇒ dynamic 不下发（undefined，不瞎填）", s5.parts[0].notes[0].dynamic === undefined, s5.parts[0].notes[0].dynamic);
}

console.log("== ④ 乐器（GM program / part-name → 实际已装库名） ==");
{
  const s = parseMusicXML(score(note("C", 4, 1), { midiProgram: 41 }));
  ok("part-list midi-program ⇒ midiInstruments[0].program = 41", s.parts[0].midiInstruments?.[0]?.program === 41, s.parts[0].midiInstruments);
  const s2 = parseMusicXML(score(note("C", 4, 1)));
  ok("无声明的 part ⇒ midiInstruments 为空（不猜）", (s2.parts[0].midiInstruments || []).length === 0, s2.parts[0].midiInstruments);

  // ---- 逐乐器映射（表 = 用户实际已装 15 个库；2026-09-21 用户裁定「可以直接映射库名」）----
  const lib = (partName, midiProgram) => {
    const p = parseMusicXML(score(note("C", 4, 1), { partName, midiProgram })).parts[0];
    return resolveInstrument(p);
  };
  // ① 1-based → 0-based 换算（MusicXML 规范 midi-program = 1~128）
  ok("Violin = MusicXML 41（1-based）⇒ Orchestral Violin 1", lib("V", 41).library?.name === "Orchestral Violin 1", lib("V", 41));
  ok("Cello = 43 ⇒ Orchestral Cello 1", lib("V", 43).library?.name === "Orchestral Cello 1", lib("V", 43));
  ok("Contrabass = 44 ⇒ Orchestral Contrabass 1", lib("V", 44).library?.name === "Orchestral Contrabass 1", lib("V", 44));
  ok("Flute = 74 ⇒ Orchestral Flute 1", lib("V", 74).library?.name === "Orchestral Flute 1", lib("V", 74));
  ok("Piccolo = 73 ⇒ Orchestral Piccolo 1", lib("V", 73).library?.name === "Orchestral Piccolo 1", lib("V", 73));
  ok("Chromatic Percussion 越界值 ⇒ 不改乐器（不猜）", lib("V", 0).library === undefined && /1~128|没有对应/.test(lib("V", 0).note), lib("V", 0));

  // ② ⭐ 旧表两处真错（2026-09-21 改）
  ok("🆕 Oboe = 69 ⇒ Orchestral Oboe 1（旧表 65~71 全当萨克斯，错）", lib("V", 69).library?.name === "Orchestral Oboe 1", lib("V", 69));
  ok("🆕 Bassoon = 71 ⇒ Orchestral Bassoon 1（旧表同样错成萨克斯）", lib("V", 71).library?.name === "Orchestral Bassoon 1", lib("V", 71));
  ok("🆕 Clarinet = 72 ⇒ Orchestral Clarinet 1 (A)", lib("V", 72).library?.name === "Orchestral Clarinet 1 (A)", lib("V", 72));
  ok("🆕 French Horn = 61 ⇒ Orchestral French Horn 1（旧表 56~59 漏了圆号 ⇒ 映射不到）", lib("V", 61).library?.name === "Orchestral French Horn 1", lib("V", 61));
  ok("Alto/Tenor Sax 分别映射 = 66/67", lib("V", 66).library?.name === "Jazz Alto Saxophone 1" && lib("V", 67).library?.name === "Jazz Tenor Saxophone 1",
    [lib("V", 66).library?.name, lib("V", 67).library?.name]);
  ok("Trumpet/Trombone/Tuba = 57/58/59", lib("V", 57).library?.name === "Orchestral Trumpet 1 (Bb)" &&
    lib("V", 58).library?.name === "Orchestral Trombone 1" && lib("V", 59).library?.name === "Orchestral Tuba 1",
    [lib("V", 57).library?.name, lib("V", 58).library?.name, lib("V", 59).library?.name]);
  ok("同族兜底：GM 45（拨弦弦乐组）⇒ 退 Violin 并如实标注来源",
    lib("V", 46).source === "family-fallback" && lib("V", 46).library?.name === "Orchestral Violin 1", lib("V", 46));
  ok("Harp/Timpani（GM 47/48）**故意不映射**（拿小提琴当竖琴是错的）",
    lib("V", 47).library === undefined && lib("V", 48).library === undefined, [lib("V", 47), lib("V", 48)]);

  // ③ part-name 优先（映射表 §6 的策略；MuseScore 中文界面导中文名）
  ok("part-name「Violin」⇒ Violin（哪怕 GM 给的是别的）", lib("Violin", 74).library?.name === "Orchestral Violin 1" && lib("Violin", 74).source === "part-name", lib("Violin", 74));
  ok("part-name 中文「巴松」⇒ Bassoon", lib("巴松", 100).library?.name === "Orchestral Bassoon 1", lib("巴松", 100));
  ok("part-name「Double Bass」⇒ Contrabass（不是 Bassoon）", lib("Double Bass").library?.name === "Orchestral Contrabass 1", lib("Double Bass"));
  ok("part-name「Alto Saxophone」⇒ Alto Sax（不是 Tenor）", lib("Alto Saxophone").library?.name === "Jazz Alto Saxophone 1", lib("Alto Saxophone"));
  ok("part-name「English Horn」⇒ Oboe（IX 无英国管库）", lib("English Horn").library?.name === "Orchestral Oboe 1", lib("English Horn"));
  ok("拿不准的 part 名 ⇒ 不映射（交给宿主默认）", lib("Piano", 1).library === undefined, lib("Piano", 1));
  ok("库名话术含「宿主会提示更换、不影响工程」", /提示更换/.test(lib("Violin", 41).note) && /不影响/.test(lib("Violin", 41).note), lib("Violin", 41).note);
}

console.log("== ⑤ 护栏：路径 ==");
{
  const bad = (p) => guardMusicXmlPath(p);
  ok("拒 http://", bad("http://x.com/a.musicxml").ok === false && /拒绝 URL/.test(bad("http://x.com/a.musicxml").error));
  ok("拒 https://", bad("https://x.com/a.xml").ok === false);
  ok("拒 file://", bad("file:///C:/a.musicxml").ok === false);
  ok("拒相对路径", bad("scores\\a.musicxml").ok === false && /绝对路径/.test(bad("scores\\a.musicxml").error));
  ok("拒 .svp（并指向工程路线）", bad("C:\\x\\a.svp").ok === false && /工程文件/.test(bad("C:\\x\\a.svp").error));
  ok("拒 .ixp", bad("C:\\x\\a.ixp").ok === false);
  ok("拒 .txt/.mid", bad("C:\\x\\a.mid").ok === false);
  ok("拒空/非字符串", bad("").ok === false && bad(undefined).ok === false);
  ok("收 Windows 绝对路径", bad("C:\\x\\a.musicxml").ok === true && bad("C:/x/a.xml").ok === true);
  ok("收 UNC", bad("\\\\nas\\share\\a.musicxml").ok === true);
  ok("大小写不敏感扩展名", bad("C:\\x\\A.MusicXML").ok === true);
}

console.log("== ⑥ 护栏：XML 安全面（DOCTYPE / ENTITY） ==");
{
  const dtd = '<?xml version="1.0"?><!DOCTYPE score-partwise SYSTEM "http://evil/x.dtd"><score-partwise></score-partwise>';
  ok("scanXmlSafety 拒 DOCTYPE", scanXmlSafety(dtd).ok === false && /DOCTYPE/.test(scanXmlSafety(dtd).error));
  ok("scanXmlSafety 拒小写 doctype", scanXmlSafety('<?xml version="1.0"?><!doctype x><score-partwise/>').ok === false);
  const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><score-partwise>&lol;</score-partwise>';
  ok("scanXmlSafety 拒 ENTITY（实体炸弹）", scanXmlSafety(bomb).ok === false && /ENTITY/.test(scanXmlSafety(bomb).error));
  ok("正常谱子通过", scanXmlSafety(score(note("C", 4, 1))).ok === true);
  ok("空内容拒", scanXmlSafety("").ok === false);
  // 双保险：parser 内部也拒（任何调用方都逃不掉）
  let threw = "";
  try { parseMusicXML(dtd); } catch (e) { threw = e.message; }
  ok("parseMusicXML 内部也拒 DTD（双保险）", /DOCTYPE/.test(threw), threw);
  ok("warnings 字段默认存在（不映射就回报）", Array.isArray(parseMusicXML(score(note("C", 4, 1))).parts[0].warnings));
}

console.log("== ⑦ 护栏：文件指纹 / 可读性 / 上限 / 复调 ==");
{
  const dir = mkdtempSync(path.join(tmpdir(), "akdagent-mx-"));
  try {
    const f1 = path.join(dir, "a.musicxml");
    const f2 = path.join(dir, "b.musicxml");
    const empty = path.join(dir, "empty.xml");
    writeFileSync(f1, score(note("C", 4, 1)), "utf8");
    writeFileSync(f2, score(note("D", 4, 1)), "utf8");
    writeFileSync(empty, "", "utf8");

    const h1 = sha256OfFile(f1), h1b = sha256OfFile(f1), h2 = sha256OfFile(f2);
    ok("同文件同哈希", h1.hash === h1b.hash && h1.hash.length === 64, h1.hash.slice(0, 12));
    ok("改一个音 ⇒ 哈希变（TOCTOU 判据）", h1.hash !== h2.hash);
    ok("bytes 报出来", h1.bytes > 0, h1.bytes);

    ok("可读性：正常文件通过", guardFileReadable(f1).ok === true);
    ok("可读性：不存在 ⇒ 拒", guardFileReadable(path.join(dir, "nope.xml")).ok === false);
    ok("可读性：目录 ⇒ 拒", guardFileReadable(dir).ok === false);
    ok("可读性：空文件 ⇒ 拒", guardFileReadable(empty).ok === false);
    ok("可读性：超大小上限 ⇒ 拒", guardFileReadable(f1, 0.000001).ok === false);

    ok("上限：512 通过", checkNoteCap(NOTE_CAP).ok === true);
    ok("上限：513 拒（并给拆分建议）", checkNoteCap(NOTE_CAP + 1).ok === false && /拆分|part/.test(checkNoteCap(NOTE_CAP + 1).hint));

    const mono = parseMusicXML(score(note("C", 4, 1) + note("D", 4, 1))).parts[0].notes;
    const rMono = detectPolyphony(mono);
    ok("单声部：maxStack 1 / 无和弦 / voices [1]", rMono.maxStack === 1 && rMono.chordOnsets === 0 && rMono.voices.join(",") === "1", rMono);
    ok("单声部 ⇒ isPolyphonic false", isPolyphonic(rMono) === false);

    const chordNotes = parseMusicXML(score(note("C", 4, 1) + note("E", 4, 1, "<chord/>"))).parts[0].notes;
    const rChord = detectPolyphony(chordNotes);
    ok("和弦：chordOnsets 1 / maxStack 2 / 给样例", rChord.chordOnsets === 1 && rChord.maxStack === 2 && rChord.samples.length === 1, rChord);
    ok("和弦 ⇒ isPolyphonic true", isPolyphonic(rChord) === true);

    const twoVoice = parseMusicXML(score(note("C", 4, 1, "", { voice: 1 }) + note("E", 4, 1, "", { voice: 2 }))).parts[0].notes;
    const rV = detectPolyphony(twoVoice);
    ok("两 voice ⇒ voices [1,2]（即使音高不同 onset 也不同）", rV.voices.join(",") === "1,2" && isPolyphonic(rV) === true, rV);
    ok("休止不参与复调统计", detectPolyphony(parseMusicXML(score(rest(1) + note("C", 4, 1))).parts[0].notes).maxStack === 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  ok("权利确认文案在（写操作必须显式确认）", /有权使用/.test(RIGHTS_NOTE) && /confirmRights/.test(RIGHTS_NOTE));
}

console.log("\n" + (fail === 0 ? "✅ 全部通过" : "❌ 有失败") + `：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
