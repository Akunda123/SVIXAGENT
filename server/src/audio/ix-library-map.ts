/**
 * GM / 声部名 → **IX 实际安装库名**的映射（2026-09-21，P5 收尾；用户裁定「可以直接映射库名，
 * 没装的库会提示更改，不会实质影响（如打不开）」⇒ 不再用"每族一个近似名"糊弄）。
 *
 * 库名来源 = **不猜**：从用户 IX 工程 `mainRef.database.name` 读出的**实际已装 15 个库**
 * （`tools/project-digest.cjs` / 直接解析 `.ixp`；17 轨里去重 + 去掉那条空乐器对照轨）：
 *   Orchestral Piccolo 1 · Flute 1 · Oboe 1 · Clarinet 1 (A) · Bassoon 1 ·
 *   Jazz Alto Saxophone 1 · Jazz Tenor Saxophone 1 ·
 *   Orchestral Trumpet 1 (Bb) · French Horn 1 · Trombone 1 · Tuba 1 ·
 *   Orchestral Violin 1 · Viola 1 · Cello 1 · Contrabass 1     （backendType 全 "W"，version "100"）
 *
 * ⚠️ **2026-09-21 复核发现的两处旧错（本次改正）**：
 *   · 旧表按"每族一个近似名"归类：`65~71 → Sax` ⇒ **Oboe(68)/English Horn(69)/Bassoon(70)/Clarinet(71)
 *     全被误判成萨克斯**（巴松管导进来变 Jazz Alto Saxophone 1）。
 *   · 旧表 `56~59 Brass` **漏了 French Horn(60)** ⇒ 圆号 part 完全映射不到乐器。
 * ⚠️ **1-based/0-based**：MusicXML `<midi-program>` 规范是 **1~128（1-based）**，而 GM 表按 0-based 编号
 *   ⇒ 本模块先 `gm0 = program - 1` 再查表（MuseScore 导出的 Violin 是 41 ⇒ gm0=40 ⇒ Violin ✓）。
 *   越界（≤0 或 >128）按"给什么就是什么"处理并如实回报，不硬猜。
 */
import type { MxPart } from "./musicxml.js";

export interface IxLibrary { name: string; backendType: string; version: string }
export interface InstrumentResolution {
  library?: IxLibrary;
  /** 依据：part-name 关键字 > midi-program 精确 > 同族兜底 > 无 */
  source: "part-name" | "midi-program" | "family-fallback" | "none";
  /** 命中的关键字 / GM 号（便于排障） */
  matched?: string;
  gm0?: number;
  /** 如实回报的话（落进预览报告） */
  note: string;
}

const LIB = (name: string): IxLibrary => ({ name, backendType: "W", version: "100" });

/** **已装 15 个库**（读自实际工程；未装的库名不要出现在这里当"已装"，见下方 NOTE 兜底话术） */
export const IX_LIBRARIES = {
  piccolo: LIB("Orchestral Piccolo 1"),
  flute: LIB("Orchestral Flute 1"),
  oboe: LIB("Orchestral Oboe 1"),
  clarinet: LIB("Orchestral Clarinet 1 (A)"),
  bassoon: LIB("Orchestral Bassoon 1"),
  altoSax: LIB("Jazz Alto Saxophone 1"),
  tenorSax: LIB("Jazz Tenor Saxophone 1"),
  trumpet: LIB("Orchestral Trumpet 1 (Bb)"),
  horn: LIB("Orchestral French Horn 1"),
  trombone: LIB("Orchestral Trombone 1"),
  tuba: LIB("Orchestral Tuba 1"),
  violin: LIB("Orchestral Violin 1"),
  viola: LIB("Orchestral Viola 1"),
  cello: LIB("Orchestral Cello 1"),
  contrabass: LIB("Orchestral Contrabass 1"),
} as const;

/**
 * `part-name` 关键字 → 库。**顺序有意义**（先长后短：`alto sax` 先于 `sax`、`bassoon` 先于 `bass`、
 * `double bass`/`contrabass` 先于 `bass`）。中英都收（MuseScore 中文界面导出的是中文名）。
 */
const NAME_RULES: { keys: string[]; lib: IxLibrary; label: string }[] = [
  { keys: ["piccolo", "短笛"], lib: IX_LIBRARIES.piccolo, label: "piccolo/短笛" },
  { keys: ["alto sax", "alto saxophone", "中音萨克斯", "中音萨克斯风"], lib: IX_LIBRARIES.altoSax, label: "alto sax/中音萨克斯" },
  { keys: ["tenor sax", "tenor saxophone", "次中音萨克斯", "次中音萨克斯风"], lib: IX_LIBRARIES.tenorSax, label: "tenor sax/次中音萨克斯" },
  { keys: ["bassoon", "巴松", "大管"], lib: IX_LIBRARIES.bassoon, label: "bassoon/巴松" },
  { keys: ["english horn", "eng horn", "英国管"], lib: IX_LIBRARIES.oboe, label: "english horn/英国管→Oboe" },
  { keys: ["oboe", "双簧管", "oboe"], lib: IX_LIBRARIES.oboe, label: "oboe/双簧管" },
  { keys: ["clarinet", "单簧管", "黑管", "竖笛"], lib: IX_LIBRARIES.clarinet, label: "clarinet/单簧管" },
  { keys: ["flute", "长笛"], lib: IX_LIBRARIES.flute, label: "flute/长笛" },
  { keys: ["contrabass", "double bass", "contra bass", "低音提琴", "倍低音提琴"], lib: IX_LIBRARIES.contrabass, label: "contrabass/低音提琴" },
  { keys: ["violoncello", "cello", "大提琴"], lib: IX_LIBRARIES.cello, label: "cello/大提琴" },
  { keys: ["viola", "中提琴"], lib: IX_LIBRARIES.viola, label: "viola/中提琴" },
  { keys: ["violin", "fiddle", "小提琴"], lib: IX_LIBRARIES.violin, label: "violin/小提琴" },
  { keys: ["trumpet", "小号"], lib: IX_LIBRARIES.trumpet, label: "trumpet/小号" },
  { keys: ["french horn", "horn", "圆号", "法国号"], lib: IX_LIBRARIES.horn, label: "horn/圆号" },
  { keys: ["trombone", "长号", "伸缩号"], lib: IX_LIBRARIES.trombone, label: "trombone/长号" },
  { keys: ["tuba", "大号"], lib: IX_LIBRARIES.tuba, label: "tuba/大号" },
];

/** GM program（**1-based，即 MusicXML 原值**）→ 库。表按 0-based 编号写，查表前先 -1。 */
const GM_RULES: { gm0: number; lib: IxLibrary; label: string }[] = [
  { gm0: 40, lib: IX_LIBRARIES.violin, label: "GM40 Violin" },
  { gm0: 41, lib: IX_LIBRARIES.viola, label: "GM41 Viola" },
  { gm0: 42, lib: IX_LIBRARIES.cello, label: "GM42 Cello" },
  { gm0: 43, lib: IX_LIBRARIES.contrabass, label: "GM43 Contrabass" },
  { gm0: 56, lib: IX_LIBRARIES.trumpet, label: "GM56 Trumpet" },
  { gm0: 57, lib: IX_LIBRARIES.trombone, label: "GM57 Trombone" },
  { gm0: 58, lib: IX_LIBRARIES.tuba, label: "GM58 Tuba" },
  { gm0: 59, lib: IX_LIBRARIES.trumpet, label: "GM59 Muted Trumpet→Trumpet" },
  { gm0: 60, lib: IX_LIBRARIES.horn, label: "GM60 French Horn" },
  { gm0: 65, lib: IX_LIBRARIES.altoSax, label: "GM65 Alto Sax" },
  { gm0: 66, lib: IX_LIBRARIES.tenorSax, label: "GM66 Tenor Sax" },
  { gm0: 67, lib: IX_LIBRARIES.tenorSax, label: "GM67 Baritone Sax→Tenor Sax" },
  { gm0: 68, lib: IX_LIBRARIES.oboe, label: "GM68 Oboe" },
  { gm0: 69, lib: IX_LIBRARIES.oboe, label: "GM69 English Horn→Oboe" },
  { gm0: 70, lib: IX_LIBRARIES.bassoon, label: "GM70 Bassoon" },
  { gm0: 71, lib: IX_LIBRARIES.clarinet, label: "GM71 Clarinet" },
  { gm0: 72, lib: IX_LIBRARIES.piccolo, label: "GM72 Piccolo" },
  { gm0: 73, lib: IX_LIBRARIES.flute, label: "GM73 Flute" },
];

/** 同族兜底（精确号没命中时用；`46 Harp`/`47 Timpani` 故意不给 —— 拿小提琴当竖琴/定音鼓是错的） */
function familyFallback(gm0: number): { lib: IxLibrary; label: string } | undefined {
  if (gm0 >= 40 && gm0 <= 45) return { lib: IX_LIBRARIES.violin, label: "GM 40~45 弦乐族（震音/拨弦弦乐组）⇒ 退 Violin" };
  if (gm0 >= 56 && gm0 <= 63) return { lib: IX_LIBRARIES.trumpet, label: "GM 56~63 铜管族（铜管组/合成铜管）⇒ 退 Trumpet" };
  if (gm0 >= 64 && gm0 <= 67) return { lib: IX_LIBRARIES.altoSax, label: "GM 64~67 萨克斯族 ⇒ 退 Alto Sax" };
  if (gm0 >= 74 && gm0 <= 79) return { lib: IX_LIBRARIES.flute, label: "GM 74~79 管乐族（竖笛/排箫/陶笛…）⇒ 退 Flute" };
  return undefined;
}

export const LIBRARY_HINT =
  "库名直给实际已装库（读自工程 `mainRef.database`）；若目标机上没装该库，**宿主会提示更换**，不影响工程打开/其它轨。";

/** part-name 关键字命中 */
export function mapByPartName(partName?: string): InstrumentResolution {
  if (!partName) return { source: "none", note: "无 part-name" };
  const n = String(partName).toLowerCase();
  for (const r of NAME_RULES) {
    for (const k of r.keys) {
      if (n.indexOf(k.toLowerCase()) >= 0) {
        return { library: r.lib, source: "part-name", matched: r.label, note: "按 part-name 关键字「" + r.label + "」映射。" + LIBRARY_HINT };
      }
    }
  }
  return { source: "none", note: "part-name「" + partName + "」没命中任何乐器关键字" };
}

/** MusicXML `<midi-program>`（1~128）命中 */
export function mapByMidiProgram(program?: number): InstrumentResolution {
  if (program === undefined || isNaN(program)) return { source: "none", note: "无 midi-program" };
  const raw = Number(program);
  if (raw < 1 || raw > 128) {
    return { source: "none", gm0: raw, matched: "越界", note: "midi-program=" + raw + " 不是 MusicXML 规范的 1~128 ⇒ 不猜、不改乐器" };
  }
  const gm0 = raw - 1;
  const hit = GM_RULES.find((r) => r.gm0 === gm0);
  if (hit) {
    return { library: hit.lib, source: "midi-program", matched: hit.label, gm0, note: "按 " + hit.label + " 映射（midi-program " + raw + " ⇒ 0-based " + gm0 + "）。" + LIBRARY_HINT };
  }
  const fam = familyFallback(gm0);
  if (fam) {
    return { library: fam.lib, source: "family-fallback", matched: fam.label, gm0, note: fam.label + "。" + LIBRARY_HINT };
  }
  return { source: "none", gm0, matched: "无对应", note: "GM " + gm0 + "（midi-program " + raw + "）在已装 15 个库里没有对应 ⇒ 不改乐器（交给宿主默认）" };
}

/**
 * 解析顺序 = **`part-name` 关键字 > `midi-program`**（映射表 §6 的策略；`part-name` 是导出软件按乐器写的，
 * 比 GM program 更可信 —— 实测 MuseScore 给巴松写的是 70、给圆号写的是 60，都会踩旧表的族区间）。
 */
export function resolveInstrument(part: Pick<MxPart, "name" | "midiInstruments">): InstrumentResolution {
  const byName = mapByPartName(part.name);
  if (byName.library) return byName;
  const prog = part.midiInstruments?.[0]?.program;
  const byGm = mapByMidiProgram(prog);
  if (byGm.library) return byGm;
  return { source: "none", gm0: byGm.gm0, note: byName.note + "；" + byGm.note };
}
