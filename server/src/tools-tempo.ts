/**
 * MCP 工具：**`measure_tempo`** —— 音频的 **BPM 包络**（可变速度）测量，**完全不依赖宿主**。
 *
 * 用户 2026-10-06 的原话：「完全不依赖 SV2 的可变 bpm 测量，上次那个不好用」「比如有段音频是 118-122
 * 浮动的 bpm，要产生 bpm 包络」。老路子的问题与这条的对策：
 *   · 老路子测量埋在 `sv_analyze_audio`、应用放 `sv_apply_tempo`（走桥写 SV2）⇒ **不独立**；
 *     这里**全程本地**：不需要 SV / IX / ACE 在线，产物直接落盘。
 *   · 老路子只报一个 BPM（`detect` 的均匀网格）⇒ 118–122 会被硬拉直；
 *     这里用 **`beatTrack`（Ellis DP，rubato 自适应）** + 先验 + 中值平滑 ⇒ 出**包络**。
 *   · 老路子**没法自证**（只能写进 SV2 再听）⇒ 这里落 **点击轨 WAV**：拿耳朵一听就知道准不准。
 *
 * 产物（默认与输入音频同目录；`outDir` 可改）：`.tempo-envelope.csv` · `.tempo-map.mid` · `.click.wav` · `.tempo-envelope.json`
 * —— MIDI 那份可以**直接拖进任何 DAW** 当速度参考（这就是"不依赖 SV2"的落点）。
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { measureTempoEnvelope } from "./audio/tempo-map.js";

export function registerMeasureTempo(server: McpServer): void {
  const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

  server.tool(
    "measure_tempo",
    "**BPM 包络测量**（可变速度；**完全不需要宿主在线** —— 不用 SV/IX/ACE）：给一段音频，产出「时间 → BPM」的**包络**，" +
      "适合像 **118–122 这种小幅浮动**的伴奏 / 现场录音（老路子只给一个 BPM，会把浮动拉直）。" +
      "做法：`detect` 取初值并做**倍频纠正** → 用 **Ellis 动态规划拍点跟踪（rubato 自适应，可给 `bpmHint` 与 `tightness`）** 定拍 → " +
      "逐拍间隔取中值平滑成包络，并每 `segmentBeats` 拍合成一个 tempo mark。" +
      "**产物默认落盘**（与音频同目录）：`.tempo-envelope.csv`（Excel 看曲线）· **`.tempo-map.mid`（拖进任何 DAW 当速度轨）** · " +
      "**`.click.wav`（点击轨：听一遍就知道准不准）** · `.tempo-envelope.json`。" +
      "⚠️ 只收 **WAV**（其它格式先用 `sv_convert_audio` 转）；⚠️ 报告里 `stats`（min/max/median/range/drift/jitter）与 `warnings` 都要看 —— " +
      "倍频歧义、拍点太少、段间跳变、抖动都会**如实写出来**，绝不静默猜。" +
      "⛔ **动手前先问用户「大概多少 BPM」（要一个范围）**，再用 `bpmMin`/`bpmMax` 锁住 —— 节拍有**度量层次歧义**" +
      "（同一段音频可落在 78/117/156 = 1×/×1.5/×2，×1.5 是附点感）；实测教训：一首真实 78 BPM 的歌被锁到 117，工程整个错层。",
    {
      input: z.string().describe("音频文件**绝对路径**（只收 .wav；其它格式先 `sv_convert_audio`）"),
      bpmHint: z.number().optional().describe("速度先验（**强烈建议给**，例如 120）—— 能显著压掉倍频错误（60/120/240 选错）"),
      bpmMin: z.number().optional().describe("速度**硬下限**（默认 40）。想强制按某个速度层测（例：明明该 78 却被锁到 117 = 78×1.5 的附点/6-8 拍感）⇒ 给 `bpmMin:60, bpmMax:90`；区间里找不到候选会**明确报错**"),
      bpmMax: z.number().optional().describe("速度**硬上限**（默认 220）"),
      tightness: z.number().optional().describe("拍点跟踪的「钉死程度」（默认 680；**越小越能跟浮动**，越大越像节拍器）"),
      segmentBeats: z.number().optional().describe("每几拍合成一个 tempo mark（默认 4 = 一小节）"),
      beatsPerBar: z.number().optional().describe("每小节几拍（默认 4；只影响 bar/beatInBar 标注与点击轨重音）"),
      startSec: z.number().optional().describe("只分析这一段（起点，秒）"),
      endSec: z.number().optional().describe("只分析这一段（终点，秒）"),
      smoothBeats: z.number().optional().describe("包络平滑窗（拍，**默认 8** = 回归窗 ±4 拍 ≈ ±2 秒；给 4 跟得更紧但会把演奏呼吸放大成假波动，给 16 更稳）"),
      snapToOnsets: z.boolean().optional().describe("是否把拍点吸附到 onset 峰值（**默认 true**；关掉会明显变抖 —— 这是包络准不准的关键一步）"),
      outDir: z.string().optional().describe("产物目录（默认与输入音频同目录）"),
      writeArtifacts: z.boolean().optional().describe("是否落产物（默认 true；给 false 只出报告）"),
    },
    async (args) => {
      try {
        const res = await measureTempoEnvelope(args.input, {
          bpmHint: args.bpmHint,
          bpmMin: args.bpmMin,
          bpmMax: args.bpmMax,
          tightness: args.tightness,
          segmentBeats: args.segmentBeats,
          beatsPerBar: args.beatsPerBar,
          startSec: args.startSec,
          endSec: args.endSec,
          smoothBeats: args.smoothBeats,
          snapToOnsets: args.snapToOnsets,
          outDir: args.outDir,
          writeArtifacts: args.writeArtifacts,
        });
        return json(res);
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
