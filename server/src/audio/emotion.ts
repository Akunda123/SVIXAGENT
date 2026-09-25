/**
 * 音频情感分析：基于音频物理特征的四象限（Valence-Arousal）情感映射。
 *
 * 理论（Russell 环形模型）：音乐情感可用两个维度描述——
 *   - Valence（效价）：正向/负向（愉悦度），正=欢快，负=悲伤
 *   - Arousal（唤醒/强度）：平静↔激昂（能量）
 * 四象限：
 *   高Valence + 高Arousal → 喜悦/兴奋（如欢快的流行、副歌）
 *   高Valence + 低Arousal → 宁静/温暖（如舒缓的抒情）
 *   低Valence + 高Arousal → 愤怒/紧张（如暗黑摇滚、重鼓点）
 *   低Valence + 低Arousal → 悲伤/沉郁（如慢速小调）
 *
 * 特征 → 两轴映射（权重可调）：
 *   Valence 由 调性大小调（major/minor，决定性）+ 音高中位数 决定：
 *     大调→+，小调→-；音高偏高略正向。
 *   Arousal 由 BPM（高度正相关）+ RMS 能量 + 音区跨度 决定：
 *     BPM 快、RMS 大 → 高唤醒；BPM 慢、RMS 小 → 低唤醒。
 *
 * 输入：WAV 路径（可选时间窗口）。复用 analyzeAudio 提取特征。
 * 输出：{ valence, arousal, quadrant(中/英), label, emoji, features }
 */

import { analyzeAudio, type AnalyzeResult } from "./analyze.js";

export interface EmotionResult {
  /** 效价，-1（负）~ +1（正） */
  valence: number;
  /** 唤醒，0（平静）~ 1（激昂） */
  arousal: number;
  /** 中文象限名 */
  quadrant: string;
  /** 英文象限名 */
  quadrantEn: string;
  /** 情感标签描述 */
  label: string;
  /** 情绪 emoji */
  emoji: string;
  /** 组成特征（用于解释/调试） */
  features: {
    key?: string;
    mode: "major" | "minor" | "unknown";
    bpm?: number;
    rms: number;
    pitchMedian?: number;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 从分析结果提取调式：'C major' → major；'A minor' → minor */
function extractMode(key?: string): "major" | "minor" | "unknown" {
  if (!key) return "unknown";
  const k = key.toLowerCase();
  if (k.includes("minor")) return "minor";
  if (k.includes("major") || k.includes("dorian") || k.includes("lydian") || k.includes("phrygian") || k.includes("mixolydian") || k.includes("aeolian")) return "major";
  return "unknown";
}

/**
 * 由 AudioAnalyzeResult 计算四象限情感。
 * @param res analyzeAudio 结果
 */
export function mapEmotion(res: AnalyzeResult): EmotionResult {
  const mode = extractMode(res.key);

  // ---------- Valence（-1 ~ +1） ----------
  // 基础：调式。大调 +0.6，小调 -0.6，未知 0。
  let valence = 0;
  if (mode === "major") valence = 0.6;
  else if (mode === "minor") valence = -0.6;
  // 音高微调：中位数 200Hz 以下略负、400Hz 以上略正（取映射到 ±0.4）
  if (res.pitchMedian !== undefined) {
    // 用对数比例把 100~1000Hz 映射到 -0.4 ~ +0.4
    const t = clamp((Math.log2(res.pitchMedian) - Math.log2(100)) / (Math.log2(1000) - Math.log2(100)), 0, 1);
    valence += (t - 0.5) * 0.8;
  }
  valence = clamp(valence, -1, 1);

  // ---------- Arousal（0 ~ 1） ----------
  let arousal = 0.5; // 中性起点
  // BPM：60 ~ 180 映射 0 ~ 1
  if (res.bpm !== undefined) {
    const t = clamp((res.bpm - 60) / (180 - 60), 0, 1);
    arousal = arousal * 0.45 + t * 0.55;
  }
  // RMS 能量：0.02 ~ 0.30 映射 0 ~ 1（多数音乐 RMS 在此范围）
  const tRms = clamp((res.rms - 0.02) / (0.30 - 0.02), 0, 1);
  arousal = arousal * 0.9 + tRms * 0.1;
  arousal = clamp(arousal, 0, 1);

  // ---------- 象限 ----------
  const highValence = valence >= 0;
  const highArousal = arousal >= 0.5;
  let quadrant: string, quadrantEn: string, label: string, emoji: string;
  if (highValence && highArousal) {
    quadrant = "喜悦/兴奋"; quadrantEn = "Happy/Energetic"; label = "欢快激昂，充满活力（如流行副歌、快节奏舞曲）"; emoji = "😄";
  } else if (highValence && !highArousal) {
    quadrant = "宁静/温暖"; quadrantEn = "Calm/Warm"; label = "舒缓温暖，安静平和（如慢板抒情、治愈系）"; emoji = "😌";
  } else if (!highValence && highArousal) {
    quadrant = "愤怒/紧张"; quadrantEn = "Angry/Tense"; label = "激烈紧张，带有压迫感或戏剧性（如重型编曲、强鼓点）"; emoji = "😠";
  } else {
    quadrant = "悲伤/沉郁"; quadrantEn = "Sad/Melancholic"; label = "低沉悲伤，情绪内敛（如慢速小调、叙事曲）"; emoji = "😢";
  }

  return {
    valence: Math.round(valence * 100) / 100,
    arousal: Math.round(arousal * 100) / 100,
    quadrant,
    quadrantEn,
    label,
    emoji,
    features: {
      key: res.key,
      mode,
      bpm: res.bpm,
      rms: Math.round(res.rms * 1000) / 1000,
      pitchMedian: res.pitchMedian,
    },
  };
}

/**
 * 分析 WAV 的情感（四象限）。内部调用 analyzeAudio 提取特征。
 * @param inputPath WAV 路径
 * @param startSec 起始秒（默认 0）
 * @param endSec 结束秒（默认文件末尾）
 */
export async function analyzeEmotion(inputPath: string, startSec = 0, endSec?: number): Promise<EmotionResult> {
  const res = await analyzeAudio(inputPath, startSec, endSec);
  return mapEmotion(res);
}
