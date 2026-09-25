/**
 * 和声生成算法：根据主旋律音符 + 调性，生成和声部（三度/六度等，调内校正）。
 *
 * 移植自 AKD 脚本「和声.js」的核心逻辑（Mode 调性检测 + 调内步进），
 * 但改为纯数据函数（输入音符数组，输出和声音符数组），便于 MCP 工具调用。
 */

export interface MelodyNote {
  pitch: number;    // MIDI 音高 C4=60
  onset: number;    // blick
  duration: number; // blick
  lyrics?: string;
}

export interface HarmonyNote extends MelodyNote {
  intervalSteps: number; // 相对主旋律的调内步数（正=上，负=下）
}

export interface HarmonyOptions {
  /** 和声方向: 1 向上 / -1 向下 */
  direction?: 1 | -1;
  /** 和声音程（调内步数）: 2=三度 5=六度 4=五度 3=四度 1=二度 6=七度 0=一度 */
  interval?: number;
  /** 是否避让不协和音（三度/六度时对 2/7/5/9 半音位置的替代） */
  avoidDissonance?: boolean;
  /** 显式调性根音（0-11，C=0）。传了则用它（如来自生成 melody 的和弦/调），否则自 detectKey。 */
  keyRoot?: number;
}

// 调性音阶（C 大调 = 全白键），用于调内步进
// 12 个 key：0=C, 1=C#, ... 用黑键判定（AKD Mode 逻辑）
const INTERVAL_CHOICES = [2, 5, 4, 3, 1, 6, 0] // 三度/六度/五度/四度/二度/七度/一度

/**
 * 调性检测：黑键计数法（AKD Mode）。
 * 对音符 pitch 集合，计算使黑键数最少的 root（0=C ... 11=B）。
 * @returns 0-11 的调性根音（C=0）
 */
export function detectKey(melodyPitches: number[]): number {
  if (melodyPitches.length === 0) return 0
  const k = new Array(12).fill(0)
  for (let i = 0; i < 12; i++) {
    for (const p of melodyPitches) {
      if (isBlackKey(p - i)) k[i]++
    }
  }
  let kmin = 0
  for (let i = 1; i < 12; i++) {
    if (k[i] < k[kmin]) kmin = i
  }
  return kmin
}

/** MIDI 音高相对 root 是否为黑键（音阶外音） */
function isBlackKey(pitch: number): boolean {
  const pc = ((pitch % 12) + 12) % 12
  // 黑键半音位置：1, 3, 6, 8, 10
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
}

/**
 * 从主旋律音符生成和声。
 * @param notes 主旋律音符（pitch MIDI）
 * @param opts 选项
 * @returns 和声音符数组（与原音符等长、同时值，pitch 为和声音高）
 */
export function generateHarmony(notes: MelodyNote[], opts: HarmonyOptions = {}): HarmonyNote[] {
  const direction = opts.direction ?? 1
  const intervalIdx = INTERVAL_CHOICES.indexOf(opts.interval ?? 2)
  const intervalSteps = INTERVAL_CHOICES[intervalIdx >= 0 ? intervalIdx : 0] // 默认三度
  const avoid = opts.avoidDissonance ?? true

  const pitches = notes.map((n) => n.pitch)
  const key = opts.keyRoot !== undefined ? ((opts.keyRoot % 12) + 12) % 12 : detectKey(pitches)

  return notes.map((n) => {
    let l = 0
    // 避让不协和（AKD 逻辑：三度/六度遇到特定半音位置时调整）
    if (avoid) {
      const pc = ((n.pitch % 12) + 12) % 12
      if (intervalSteps === 2) {
        // 三度：向上时 2/7 半音（re/si）需避让；向下时 5/9（sol/ti）
        if (direction === 1 && (pc === 2 || pc === 7)) l = 1
        else if (direction === -1 && (pc === 5 || pc === 9)) l = 1
      } else if (intervalSteps === 5) {
        // 六度：向下时 2/7 需避让；向上时 5/9
        if (direction === -1 && (pc === 2 || pc === 7)) l = -1
        else if (direction === 1 && (pc === 5 || pc === 9)) l = -1
      }
    }

    const targetSteps = intervalSteps + l
    let pitch = n.pitch
    let safety = 0
    for (let j = 0; j < targetSteps && safety < 127; safety++) {
      pitch += direction
      if (!isBlackKey(pitch - key)) j++
    }
    return { ...n, pitch, intervalSteps: targetSteps * direction }
  })
}
