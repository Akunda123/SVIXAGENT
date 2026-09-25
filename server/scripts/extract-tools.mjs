import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// ⚠️ 路径一律**从脚本自身位置推导**，不写死开发机绝对路径：
//    2026-09-22 产品改名时，本文件里那句写死的 `…\Documents\SVAgent\…` 被一起改成了 AKDAgent，
//    而仓库目录并没有改名 ⇒ 直接 ENOENT 写不出来（生成器哑了好一会儿才发现）。
const HERE = path.dirname(fileURLToPath(import.meta.url));      // <repo>/server/scripts
const SRC = path.join(HERE, "..", "src", "tools.ts");           // <repo>/server/src/tools.ts
const OUT = path.join(HERE, "..", "..", "docs", "MCP工具清单.md"); // <repo>/docs/MCP工具清单.md
const src = fs.readFileSync(SRC, "utf8");
const re = /server\.tool\(\s*"([a-z_0-9]+)",\s*"((?:[^"\\]|\\.)*)"/g;
let m;
const tools = [];
while ((m = re.exec(src)) !== null) {
  const name = m[1];
  const desc = m[2].replace(/\\"/g, '"').trim();
  tools.push({ name, desc });
}

// 分类映射
const CAT = [
  { key: "ping", label: "宿主/工程", re: /^sv_ping$|^sv_get_project_info$/ },
  { key: "sel", label: "选中/当前组", re: /^sv_get_selected_notes$|^sv_get_current_group$/ },
  { key: "edit", label: "音符编辑", re: /^sv_transpose_selected_notes$|^sv_set_selected_lyrics$/ },
  { key: "lyric", label: "歌词对位", re: /^sv_apply_lyrics$|^sv_align_lyrics$|^sv_fill_lyrics_to_track$/ },
  { key: "play", label: "播放", re: /^sv_playback$/ },
  { key: "audio", label: "音频处理", re: /^sv_separate_vocals$|^sv_separate_vocals_dual$|^sv_convert_audio$|^sv_analyze_audio$|^sv_analyze_emotion$|^sv_extract_notes$/ },
  { key: "melody", label: "旋律/和声", re: /^sv_generate_melody$|^sv_generate_harmony$|^sv_run_script$/ },
  { key: "align", label: "音频对轨", re: /^sv_align_audio$|^sv_apply_tempo$/ },
  { key: "style", label: "声库/风格", re: /^sv_list_voice_styles$|^sv_list_voice_styles_detail$|^sv_combine_voice_styles$|^sv_style_create$|^sv_style_adjust$/ },
  { key: "chord", label: "和弦/乐谱", re: /^sv_analyze_chord$|^sv_write_chords$|^sv_import_musicxml$/ },
];

// 每个工具的参数（手动整理——从名称语义推断为主，标注在括号）
const PARAMS = {
  sv_ping: "host?",
  sv_get_selected_notes: "host?",
  sv_get_current_group: "host?",
  sv_get_project_info: "host?",
  sv_transpose_selected_notes: "semitones, host?",
  sv_set_selected_lyrics: "lyrics, host?",
  sv_apply_lyrics: "lyrics, host?",
  sv_align_lyrics: "lrc, apply?, host?",
  sv_fill_lyrics_to_track: "lyrics, track?, host?",
  sv_playback: "action, position?, host?",
  sv_separate_vocals: "input, model?, outDir?",
  sv_separate_vocals_dual: "input, vocal?, accompaniment?, outDir?",
  sv_convert_audio: "input, outPath?, maxSeconds?",
  sv_analyze_audio: "input, startSec?, endSec?, bpm?",
  sv_analyze_emotion: "input, startSec?, endSec?",
  sv_extract_notes: "input",
  sv_generate_melody: "key, mood?, bpm?, barCount?, chordProgression?, useArpeggio?, seed?, outPath?",
  sv_generate_harmony: "accompaniment?, direction?, interval?, avoidDissonance?, keyRoot?, groupName?, host?",
  sv_run_script: "code, readonly?, scope?, host?",
  sv_align_audio: "input, bpm?, anchor?, measure?, introBeats?, introSec?, audioTrackIndex?, shiftBeats?, setBpm?, host?",
  sv_apply_tempo: "input, bpm?, segmentBeats?, beatOffsetSec?, measureStart?, clearExisting?, host?",
  sv_list_voice_styles: "—",
  sv_list_voice_styles_detail: "voice",
  sv_combine_voice_styles: "sourceVoice, targetVoice, styleNames[], renameAs?",
  sv_style_create: "targetVoice, name, baseOnVoiceStyle?|random, adjust?",
  sv_style_adjust: "targetVoice, styleName, index?, count?, amplitude?",
  sv_analyze_chord: "input, startSec?, endSec?, maxCandidates?",
  sv_write_chords: "input, bpm?, keyRoot?, keyMode?, segBeats?, pattern?, groupName?, trackIndex?, startMeasure?, host?",
  sv_import_musicxml: "input, part?, groupName?, trackIndex?, lyrics?, host?",
};

// 生成 md
let md = "# AKDAgent MCP 工具清单\n\n";
md += "> 共 **" + tools.length + "** 个工具。所有工具都可在 `sv`（Synthesizer V Studio）或 `ix`（Instrument X）宿主下运行（`host` 参数可选，默认自动探测；宿主在线是前提，先 `sv_ping`）。\n\n";
md += "> 概括：`sv_ping` 探宿主 → `sv_*_notes/lyrics` 读写选中 → 音频/乐谱类在本地做分析/生成 → 通过桥 `executeOp` 写入宿主。\n\n";

md += "## 分类索引\n\n";
const groups = {};
for (const t of tools) {
  let cat = "其它";
  for (const c of CAT) if (c.re.test(t.name)) { cat = c.label; break; }
  (groups[cat] = groups[cat] || []).push(t);
}
let idx = 1;
md += "| # | 分类 | 工具 |\n|---|---|---|\n";
for (const [cat, list] of Object.entries(groups)) {
  const names = list.map((t) => "`" + t.name + "`").join("<br>");
  md += `| ${idx++} | ${cat} | ${names} |\n`;
}
md += "\n---\n\n";

md += "## 详细列表\n\n";
md += "| 工具 | 参数 | 作用 |\n|---|---|---|\n";
for (const t of tools) {
  const p = PARAMS[t.name] || "（见 schema）";
  const d = t.desc.length > 90 ? t.desc.slice(0, 90) + "…" : t.desc;
  md += `| \`${t.name}\` | ${p} | ${d} |\n`;
}

const out = OUT;
fs.writeFileSync(out, md, "utf8");
console.log("wrote " + out + " (" + tools.length + " tools)");
