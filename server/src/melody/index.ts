// 旋律模块入口：乐理 + 结构生成算法 + 判据校验 + MIDI 写出。
export { generateMelody, melodyPlan, type MelodyNote, type GenOptions, type MelodyPlan, type Mood } from "./generator.js";
export { checkMelody, type CheckNote, type CheckOptions, type CheckReport, type CheckIssue, type Severity } from "./check.js";
export { toMidiData, toMidiBytes, type WriteMidiOpts } from "./writer.js";
export * from "./theory.js";
