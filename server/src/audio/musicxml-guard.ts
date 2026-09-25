/**
 * `sv_import_musicxml` 的**导入护栏**（2026-09-21 落地，规格 = `skills/sv-scripting/SKILL.md`
 * 「⛔ 规格：`sv_import_musicxml` 的导入护栏」+ `docs/待办.md` P5 / D1.3-C #2）
 *
 * 七条（本模块负责前六条；第七条"tempo 只汇报不套用"在工具层天然成立）：
 *   ① 只接受**显式给出的绝对本地路径**（`.xml`/`.musicxml`）—— **URL 一律拒绝**
 *   ② 拒 XML 里的 `DOCTYPE` / `ENTITY`（外部实体注入面）
 *   ③ **SHA-256 一致性**：预览时算哈希，真写前**再算一次**，变了就拒（TOCTOU）
 *   ④ 音符数上限 **512**，超限拒绝（不硬吞进工程）
 *   ⑤ **先只读预览**（工具层默认 dryRun），确认后才写
 *   ⑥ **合规前提**：写之前必须显式确认"有权使用这份乐谱"
 *   ⑦ 源文件 tempo 只汇报、不自动套进工程（真要用走 `sv_apply_tempo`）
 *
 * ⚠️ 纯函数（除 `sha256OfFile` 读文件外无副作用）⇒ 离线单测 `server/tests/musicxml.mjs`。
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { MxNote } from "./musicxml.js";

/** 上游取的上限（`synthv-agent` 同值）：超过就拒绝，别把整部交响乐硬吞进工程 */
export const NOTE_CAP = 512;

export interface GuardFail { ok: false; error: string; hint?: string }

/** ① 路径护栏：绝对本地路径 + 扩展名白名单；URL / `.svp` / `.ixp` / 相对路径一律拒 */
export function guardMusicXmlPath(input: unknown): { ok: true; path: string; ext: string } | GuardFail {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "必须给 `input`（MusicXML 文件的绝对本地路径）" };
  }
  const p = input.trim();
  // URL / 协议前缀（含 file://）—— 一律拒：我们只读本地磁盘，不联网取谱
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(p);
  if (scheme) {
    return {
      ok: false,
      error: `拒绝 URL：\`${scheme[1]}://\` 不是本地文件路径`,
      hint: "先把乐谱下载到本地，再用绝对路径传入（例：C:\\\\scores\\\\song.musicxml）",
    };
  }
  const ext = path.extname(p).toLowerCase();
  if (ext === ".svp" || ext === ".ixp") {
    return {
      ok: false,
      error: `这是工程文件（\`${ext}\`），不是乐谱`,
      hint: ext === ".svp" ? "读/改工程请用 sv-project-format 技能里的工程路线（先保存→改写→重载），本工具只做乐谱导入" : "IX 工程请用 sv-project-format 技能里的路线",
    };
  }
  if (ext !== ".xml" && ext !== ".musicxml") {
    return { ok: false, error: `只接受 .xml / .musicxml 乐谱（收到 \`${ext || "（无扩展名）"}\`）` };
  }
  // 绝对性：Windows 盘符 / UNC；POSIX 以 / 开头（跨平台留一条，本仓实际跑 Windows）
  const isAbs = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\") || p.startsWith("/");
  if (!isAbs) {
    return {
      ok: false,
      error: "必须是**绝对路径**（相对路径会随宿主的工作目录漂移，不可预期）",
      hint: "例：C:\\\\Users\\\\me\\\\scores\\\\song.musicxml",
    };
  }
  return { ok: true, path: p, ext };
}

/** ② XML 安全面：拒 `DOCTYPE` / `ENTITY`（大小写不敏感） */
export function scanXmlSafety(xmlText: string): { ok: true } | GuardFail {
  if (typeof xmlText !== "string" || xmlText.length === 0) return { ok: false, error: "文件内容为空" };
  // 只看声明区（前 4KB 足够覆盖 prolog 里的 DTD），避免把正文里的字样误判
  const head = xmlText.slice(0, 4096);
  const found: string[] = [];
  if (/<!DOCTYPE/i.test(head)) found.push("`<!DOCTYPE>`");
  if (/<!ENTITY/i.test(head)) found.push("`<!ENTITY>`");
  if (found.length > 0) {
    return {
      ok: false,
      error: `拒绝含 ${found.join(" / ")} 的 MusicXML（外部实体注入 / 实体炸弹面）`,
      hint: "用 MuseScore 导出时选「不压缩的 MusicXML（.musicxml）」，或把 prolog 里的 DTD/实体声明删掉再导",
    };
  }
  return { ok: true };
}

/** ③ SHA-256（流式不必，乐谱都是小文件）：返回哈希 + 字节数 */
export function sha256OfFile(p: string): { hash: string; bytes: number } {
  const buf = readFileSync(p);
  return { hash: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
}

/** ③ 读数前的基本体检（存在 / 是文件 / 别是天文数字大小） */
export function guardFileReadable(p: string, maxMB = 32): { ok: true; bytes: number } | GuardFail {
  let st;
  try {
    st = statSync(p);
  } catch {
    return { ok: false, error: `文件不存在或读不到：${p}` };
  }
  if (!st.isFile()) return { ok: false, error: `不是文件：${p}` };
  if (st.size === 0) return { ok: false, error: "文件是空的（0 字节）" };
  if (st.size > maxMB * 1024 * 1024) {
    return { ok: false, error: `文件过大（${(st.size / 1048576).toFixed(1)} MB > ${maxMB} MB 上限）` };
  }
  return { ok: true, bytes: st.size };
}

/** ④ 音符数上限 */
export function checkNoteCap(count: number, cap = NOTE_CAP): { ok: true } | GuardFail {
  if (count > cap) {
    return {
      ok: false,
      error: `${count} 个音符超过上限 ${cap} ⇒ 拒绝导入（不硬吞进工程）`,
      hint: "按声部/乐章拆成多个文件分别导入；或多给 `part` 只取一个声部",
    };
  }
  return { ok: true };
}

export interface PolyphonyReport {
  /** 不同 onset 上"同时响"的最大音数（>1 即存在和弦/复调） */
  maxStack: number;
  /** 带和弦（同 onset 多音）的 onset 个数 */
  chordOnsets: number;
  /** 出现的声部号（去重、升序；不含休止） */
  voices: number[];
  /** 同 onset 多音的实际样例（前 3 个，便于用户核对） */
  samples: { onset: number; pitches: number[] }[];
}

/**
 * 复调/和弦体检。**为什么重要**：本仓解析器按"顺序累加 onset"处理，多 `<voice>` 混在一条时间线上
 * 会把两个声部的时值互相叠加 ⇒ 音位整体漂移（这正是上游"拒绝复调 lane"要防的事）。
 */
export function detectPolyphony(notes: MxNote[]): PolyphonyReport {
  const byOnset = new Map<number, number[]>();
  const voices = new Set<number>();
  for (const n of notes) {
    if (n.rest || n.pitch < 0) continue;
    if (n.voice !== undefined) voices.add(n.voice);
    const k = Math.round(n.onset * 1000) / 1000;
    const arr = byOnset.get(k) ?? [];
    arr.push(n.pitch);
    byOnset.set(k, arr);
  }
  let maxStack = 0;
  let chordOnsets = 0;
  const samples: { onset: number; pitches: number[] }[] = [];
  for (const [onset, pitches] of [...byOnset.entries()].sort((a, b) => a[0] - b[0])) {
    const uniq = [...new Set(pitches)];
    if (uniq.length > 1) {
      chordOnsets++;
      if (samples.length < 3) samples.push({ onset, pitches: uniq });
    }
    if (uniq.length > maxStack) maxStack = uniq.length;
  }
  return { maxStack, chordOnsets, voices: [...voices].sort((a, b) => a - b), samples };
}

/** 复调判定：多声部、或存在同 onset 多音（和弦）都算"不是单声部 lane" */
export function isPolyphonic(rep: PolyphonyReport): boolean {
  return rep.voices.length > 1 || rep.chordOnsets > 0;
}

/** ⑥ 权利确认文案（写操作必须显式确认） */
export const RIGHTS_NOTE =
  "合规前提：你须确认**有权使用**这份乐谱（「网上搜得到」不等于授权；商业谱请购买/取得授权）。" +
  "确认后传 `confirmRights:true` 才会写入工程。";
