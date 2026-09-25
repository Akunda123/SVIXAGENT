/**
 * 织体（texture）模块 barrel —— P7「IX 织体生成」
 *
 * 四块职责：
 *   `chords-from-notes` 工程内音符 → 和弦序列（"MIDI 分析"；音频路线沿用 `audio/chord-track`）
 *   `template`          首小节 → 「和弦序位 + 八度」抽象，再按目标和弦实例化（照搬 IX 侧边栏 JS）
 *   `instruments`       管乐/弦乐的织体推荐 + 硬约束（气口 / 换弓 / 音域）
 *   `render`            各织体型的渲染（纯函数，可离线测）
 */

export * from "./chords-from-notes.js";
export * from "./template.js";
export * from "./instruments.js";
export * from "./render.js";
