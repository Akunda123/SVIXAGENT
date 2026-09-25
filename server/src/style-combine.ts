/**
 * 声库风格移植（flat 版 nofs JSON）。
 *
 * 背景：flat 版（OPSV 数据目录）的 databases 下 info.*.nofs 是 JSON，
 * 每个声库有 styles 数组（{name, data}，data 为 256 字符 hex）。
 * 同 vocoder 的声库风格 data 格式兼容，可直接互相复制。
 *
 * 功能：
 *   1. 按 vocoder 分组列出声库（refresh 自动忽略）
 *   2. 列出某声库的 styles（名称 + data 摘要）
 *   3. 把源声库的指定 styles 对象（可改名）追加到目标声库 styles 数组
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 排除的声库（refresh 是内置更新器，无实际声库） */
const IGNORE_VOICES = new Set(["refresh"]);

// ── flat 数据目录探测：从设置页 scripts 目录推导（上级 = 数据根），
//    以 databases 的 nofs 是否为 JSON 作为判定依据 ─────────────────
let flatDirCache: { dataDir: string; dbDir: string } | null | undefined;

/** 读 ~/.dsh/settings.yaml 的 sv.scriptsDirs（简单解析，不引 yaml 依赖） */
function settingsScriptsDirs(): string[] {
  const p = path.join(os.homedir(), ".dsh", "settings.yaml");
  try {
    const txt = fs.readFileSync(p, "utf8");
    const out: string[] = [];
    let inSv = false;
    for (const line of txt.split(/\r?\n/)) {
      const t = line.trim();
      if (/^sv:\s*$/.test(t)) { inSv = true; continue; }
      if (!inSv) continue;
      if (/^scriptsDirs:\s*$/.test(t)) continue;
      const m = t.match(/^-\s+(.+)$/);
      if (m) out.push(m[1].trim());
      else if (t && !t.startsWith("#") && !t.startsWith("-")) inSv = false; // 离开 sv 段
    }
    return out;
  } catch {
    return [];
  }
}

/** 检查某 databases 目录的 nofs 是否为 JSON（flat 判定依据；JSON 可能带换行缩进） */
function dbNofsIsJson(dbDir: string): boolean {
  try {
    const dir = fs.readdirSync(dbDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dbDir, d.name))
      .find((d) => fs.readdirSync(d).some((f) => f.endsWith(".nofs")));
    if (dir) {
      const file = fs.readdirSync(dir).find((f) => f.endsWith(".nofs"));
      if (file) {
        // 去空白后以 { 开头（兼容美化 JSON 的 {\r\n 与紧凑 {"）
        const head = fs.readFileSync(path.join(dir, file), "utf8").replace(/\s/g, "").slice(0, 1);
        return head === "{";
      }
    }
  } catch {
    /* 不可读 */
  }
  return false;
}

/** 探测 flat 数据目录：scripts 上级 + databases nofs JSON；无配置时回退常见候选 */
export function findFlatDataDir(force = false): { dataDir: string; dbDir: string } | null {
  if (!force && flatDirCache !== undefined) return flatDirCache;
  const user = os.homedir();
  const appdata = process.env.APPDATA || path.join(user, "AppData", "Roaming");
  const docs = path.join(user, "Documents");

  // 1) 设置页 scripts 目录 → 上级
  const fromSettings: string[] = [];
  for (const sd of settingsScriptsDirs()) {
    if (sd) {
      fromSettings.push(path.dirname(sd));        // scripts 的上级 = 数据根
      fromSettings.push(path.dirname(path.dirname(sd))); // 再上级（脚本在 xxx/scripts/AKDAgent 时）
    }
  }
  // 2) 常见候选（设置未配置时兜底）
  const fallback = [
    path.join(docs, "OPSV", "Dreamtonics", "Synthesizer V Studio"),
    path.join(docs, "Dreamtonics", "Synthesizer V Studio Flat"),
    path.join(appdata, "Dreamtonics", "Synthesizer V Studio Flat"),
    path.join(docs, "Synthesizer V Studio Flat"),
  ];
  const candidates = [...new Set([...fromSettings, ...fallback].map((d) => d.replace(/[\\/]+$/, "")))];

  for (const root of candidates) {
    const dbDir = path.join(root, "databases");
    if (fs.existsSync(dbDir) && dbNofsIsJson(dbDir)) {
      flatDirCache = { dataDir: root, dbDir };
      return flatDirCache;
    }
  }
  flatDirCache = null;
  return null;
}

function flatRoot(): string { return findFlatDataDir()?.dataDir || ""; }

// ── 中文翻译（translations/zh-cn.txt：声库名 → 中文名，SV2 除外） ───
let zhCache: Map<string, string> | null = null;

/** 解析 translations/zh-cn.txt：`"英文名" = "中文名"`（.ini 风格） */
function loadZhTranslations(): Map<string, string> {
  if (zhCache) return zhCache;
  const map = new Map<string, string>();
  const p = path.join(flatRoot(), "translations", "zh-cn.txt");
  try {
    const txt = fs.readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*"(.+?)"\s*=\s*"(.+?)"\s*$/);
      if (m) map.set(m[1], m[2]);
    }
  } catch {
    /* 无翻译文件则空映射 */
  }
  zhCache = map;
  return map;
}

/** 声库中文名（无翻译则返回原名） */
function zhName(english: string): string {
  return loadZhTranslations().get(english) || english;
}

/** 按英文名或中文名解析声库目录（用户输入可能是中文） */
function resolveVoice(input: string): { voice: string; file: string; full: string } | undefined {
  const key = String(input || "").trim().toLowerCase();
  if (!key) return undefined;
  const zh = loadZhTranslations();
  // 先按目录名精确匹配
  let hit = listNofs().find((n) => n.voice.toLowerCase() === key);
  if (hit) return hit;
  // 再按中文名匹配（反向查找翻译表；english 键即声库名）
  for (const [english, chinese] of zh) {
    if (chinese.toLowerCase() === key) {
      hit = listNofs().find((n) => n.voice.toLowerCase() === english.toLowerCase());
      if (hit) return hit;
    }
  }
  return undefined;
}

interface Style {
  name: string;
  data: string;
}

interface VoiceInfo {
  voice: string;          // 声库目录名
  file: string;           // nofs 文件名
  name?: string;          // nofs 内 name 字段
  version?: string;
  vocoder?: string;       // vocoder 哈希
  duration?: string;
  styles: Style[];
}

function listNofs(): { voice: string; file: string; full: string }[] {
  const out: { voice: string; file: string; full: string }[] = [];
  const dbDir = findFlatDataDir()?.dbDir || "";
  if (!dbDir || !fs.existsSync(dbDir)) return out;
  for (const dir of fs.readdirSync(dbDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    if (IGNORE_VOICES.has(dir.name.toLowerCase())) continue;
    const d = path.join(dbDir, dir.name);
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith(".nofs")) out.push({ voice: dir.name, file: f, full: path.join(d, f) });
    }
  }
  return out;
}

function readVoice(n: { voice: string; file: string; full: string }): VoiceInfo | null {
  try {
    const j = JSON.parse(fs.readFileSync(n.full, "utf8"));
    return {
      voice: n.voice,
      file: n.file,
      name: j.name,
      version: j.version,
      vocoder: j.vocoder,
      duration: j.duration,
      styles: Array.isArray(j.styles) ? j.styles : [],
    };
  } catch {
    return null;
  }
}

/** 按 vocoder 分组列出声库（每组列出声库 + 其 styles 名称） */
export function listByVocoder(): unknown {
  const voices = listNofs().map(readVoice).filter((v): v is VoiceInfo => v !== null);
  const groups = new Map<string, { vocoder: string; voices: { voice: string; zhName: string; name?: string; version?: string; duration?: string; styles: string[] }[] }>();
  for (const v of voices) {
    const key = v.vocoder || "(无 vocoder)";
    if (!groups.has(key)) groups.set(key, { vocoder: key, voices: [] });
    groups.get(key)!.voices.push({
      voice: v.voice,
      zhName: zhName(v.voice),
      name: v.name,
      version: v.version,
      duration: v.duration,
      styles: v.styles.map((s) => s.name),
    });
  }
  return {
    dbDir: findFlatDataDir()?.dbDir || "",
    dataDir: findFlatDataDir()?.dataDir || "",
    groups: [...groups.values()].sort((a, b) => b.voices.length - a.voices.length),
  };
}

/** 列出某声库（或同 vocoder 全部声库）的 styles */
export function listStyles(voice: string): unknown {
  const n = resolveVoice(voice);
  if (!n) return { ok: false, error: `声库 "${voice}" 不存在（可用 sv_list_voice_styles 查看全部声库）` };
  const v = readVoice(n);
  if (!v) return { ok: false, error: `声库 "${voice}" 的 nofs 解析失败` };
  return {
    ok: true,
    voice: v.voice,
    zhName: zhName(v.voice),
    name: v.name,
    version: v.version,
    vocoder: v.vocoder,
    duration: v.duration,
    styles: v.styles.map((s) => ({ name: s.name, data: s.data.slice(0, 16) + "…", dataLen: s.data.length })),
  };
}

/**
 * 把源声库的指定 styles 复制到目标声库。
 * 前置校验：两库 vocoder 必须一致（或目标为空）。styles 可改名（如 popy-powerful）。
 * 返回 {ok, targetVoice, added:[{name, source}], skipped:[...], backup}
 */
export function combineStyles(targetVoice: string, sourceVoice: string, styleNames: string[], renameAs?: Record<string, string>): unknown {
  const target = resolveVoice(targetVoice);
  const source = resolveVoice(sourceVoice);
  if (!target) return { ok: false, error: `目标声库 "${targetVoice}" 不存在` };
  if (!source) return { ok: false, error: `源声库 "${sourceVoice}" 不存在` };

  const t = readVoice(target);
  const s = readVoice(source);
  if (!t || !s) return { ok: false, error: "nofs 解析失败" };
  if (t.vocoder !== s.vocoder) {
    return {
      ok: false,
      error: `vocoder 不匹配：${targetVoice} 用 ${(t.vocoder || "?")}，${sourceVoice} 用 ${(s.vocoder || "?")}。只有同 vocoder 声库的风格才能移植。`,
    };
  }

  const want = (Array.isArray(styleNames) ? styleNames : []).map((x) => String(x));
  if (want.length === 0) return { ok: false, error: "未指定要复制的 styles" };

  // 从源 styles 中找匹配（名称精确匹配）
  const existingTarget = new Set(t.styles.map((x) => x.name.toLowerCase()));
  const added: { name: string; source: string }[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const w of want) {
    const src = s.styles.find((st) => st.name.toLowerCase() === w.toLowerCase());
    if (!src) {
      skipped.push({ name: w, reason: `源声库 ${sourceVoice} 无此 style` });
      continue;
    }
    let newName = w;
    if (renameAs && renameAs[w]) newName = String(renameAs[w]);
    if (existingTarget.has(newName.toLowerCase())) {
      skipped.push({ name: w, reason: `目标声库已有同名 style "${newName}"` });
      continue;
    }
    t.styles.push({ name: newName, data: src.data });
    existingTarget.add(newName.toLowerCase());
    added.push({ name: newName, source: sourceVoice });
  }

  if (added.length === 0) {
    return { ok: true, added: [], skipped, message: "没有可添加的 styles（全部跳过）" };
  }

  // 备份 + 写回（保持 JSON 其他字段不变）
  const bak = target.full + ".bak";
  if (!fs.existsSync(bak)) fs.copyFileSync(target.full, bak);
  const doc = JSON.parse(fs.readFileSync(target.full, "utf8"));
  doc.styles = t.styles;
  fs.writeFileSync(target.full, JSON.stringify(doc, null, 2), "utf8");

  return { ok: true, targetVoice: t.voice, targetZh: zhName(t.voice), sourceVoice: s.voice, sourceZh: zhName(s.voice), vocoder: t.vocoder, added, skipped, backup: bak, totalStyles: t.styles.length };
}

// ── style data 编码（256 hex = 128 bytes = 32 个 float32 LE） ────────

/** hex data -> float32 数组（LE） */
export function dataToFloats(data: string): number[] {
  const buf = Buffer.from(data, "hex");
  const out: number[] = [];
  for (let i = 0; i + 4 <= buf.length; i += 4) out.push(buf.readFloatLE(i));
  return out;
}

/** float32 数组 -> 大写 hex data（往返无损） */
export function floatsToData(floats: number[]): string {
  const buf = Buffer.alloc(floats.length * 4);
  floats.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf.toString("hex").toUpperCase();
}

/** 随机生成一个风格向量（范围对齐现有特征：-0.2 ~ 0.2） */
function randomFloats(n = 32, range = 0.2): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((Math.random() * 2 - 1) * range);
  return out;
}

/**
 * 新建 style：name 必填；data 来源二选一——
 *  - baseOnVoiceStyle: "声库名/style名" 复制其 data（如 "POPY AI/Powerful"）
 *  - random: 随机生成
 * 可选 adjust: 微调浮点数 {index?: number, amplitude?: number, count?: number}
 *   省略 index = 全量微调；amplitude 默认 0.01；count 随机挑 N 个。
 */
export function createStyle(
  targetVoice: string,
  name: string,
  opts: { baseOnVoiceStyle?: string; random?: boolean; adjust?: { index?: number; amplitude?: number; count?: number } }
): unknown {
  const target = resolveVoice(targetVoice);
  if (!target) return { ok: false, error: `声库 "${targetVoice}" 不存在` };
  const t = readVoice(target);
  if (!t) return { ok: false, error: "nofs 解析失败" };
  const styleName = String(name || "").trim();
  if (!styleName) return { ok: false, error: "name 不能为空" };
  if (t.styles.some((s) => s.name.toLowerCase() === styleName.toLowerCase())) {
    return { ok: false, error: `声库 ${t.voice} 已有同名 style "${styleName}"` };
  }

  // data 来源
  let floats: number[];
  let sourceDesc: string;
  const base = opts?.baseOnVoiceStyle;
  if (base) {
    const m = String(base).match(/^(.+?)\/(.+)$/);
    if (!m) return { ok: false, error: 'baseOnVoiceStyle 格式应为 "声库名/style名"，如 "POPY AI/Powerful"' };
    const srcVoice = m[1].trim();
    const srcStyle = m[2].trim();
    const src = resolveVoice(srcVoice);
    if (!src) return { ok: false, error: `源声库 "${srcVoice}" 不存在` };
    const sv = readVoice(src);
    if (!sv) return { ok: false, error: "源 nofs 解析失败" };
    if (sv.vocoder !== t.vocoder) {
      return { ok: false, error: `vocoder 不匹配：${targetVoice}(${(t.vocoder || "?").slice(0, 8)}) vs ${srcVoice}(${(sv.vocoder || "?").slice(0, 8)})` };
    }
    const st = sv.styles.find((s) => s.name.toLowerCase() === srcStyle.toLowerCase());
    if (!st) return { ok: false, error: `源声库 ${srcVoice} 无 style "${srcStyle}"` };
    floats = dataToFloats(st.data);
    sourceDesc = `${srcVoice}/${srcStyle}`;
  } else if (opts?.random) {
    floats = randomFloats();
    sourceDesc = "random";
  } else {
    return { ok: false, error: "必须提供 baseOnVoiceStyle 或 random:true 之一作为 data 来源" };
  }

  // 微调
  const adj = opts?.adjust;
  if (adj && floats.length) {
    const amplitude = adj.amplitude ?? 0.01;
    if (adj.index !== undefined) {
      const idx = Math.floor(adj.index);
      if (idx >= 0 && idx < floats.length) floats[idx] += (Math.random() * 2 - 1) * amplitude;
    } else {
      const count = adj.count === undefined ? floats.length : Math.min(Math.max(1, Math.floor(adj.count)), floats.length);
      const idxs = new Set<number>();
      while (idxs.size < count) idxs.add(Math.floor(Math.random() * floats.length));
      for (const i of idxs) floats[i] += (Math.random() * 2 - 1) * amplitude;
    }
  }

  const newStyle: Style = { name: styleName, data: floatsToData(floats) };
  t.styles.push(newStyle);
  const bak = target.full + ".bak";
  if (!fs.existsSync(bak)) fs.copyFileSync(target.full, bak);
  const doc = JSON.parse(fs.readFileSync(target.full, "utf8"));
  doc.styles = t.styles;
  fs.writeFileSync(target.full, JSON.stringify(doc, null, 2), "utf8");
  return { ok: true, voice: t.voice, added: { name: styleName, source: sourceDesc }, floats: floats.slice(0, 8).map((v) => +v.toFixed(6)), totalStyles: t.styles.length, backup: bak };
}

/**
 * 调整已有 style 的浮点数（微调）。index 指定单个，省略则全量/随机 N 个。
 * amplitude 为增量幅度（默认 0.01）。
 */
export function adjustStyle(
  targetVoice: string,
  styleName: string,
  opts: { index?: number; amplitude?: number; count?: number }
): unknown {
  const target = resolveVoice(targetVoice);
  if (!target) return { ok: false, error: `声库 "${targetVoice}" 不存在` };
  const t = readVoice(target);
  if (!t) return { ok: false, error: "nofs 解析失败" };
  const st = t.styles.find((s) => s.name.toLowerCase() === String(styleName || "").toLowerCase());
  if (!st) return { ok: false, error: `声库 ${t.voice} 无 style "${styleName}"` };

  const floats = dataToFloats(st.data);
  const amplitude = opts?.amplitude ?? 0.01;
  let changed: number[] = [];
  if (opts?.index !== undefined) {
    const idx = Math.floor(opts.index);
    if (idx < 0 || idx >= floats.length) return { ok: false, error: `index ${idx} 越界（0~${floats.length - 1}）` };
    floats[idx] += (Math.random() * 2 - 1) * amplitude;
    changed = [idx];
  } else {
    const count = opts?.count === undefined ? floats.length : Math.min(Math.max(1, Math.floor(opts.count)), floats.length);
    const idxs = new Set<number>();
    while (idxs.size < count) idxs.add(Math.floor(Math.random() * floats.length));
    for (const i of idxs) floats[i] += (Math.random() * 2 - 1) * amplitude;
    changed = [...idxs];
  }

  st.data = floatsToData(floats);
  const bak = target.full + ".bak";
  if (!fs.existsSync(bak)) fs.copyFileSync(target.full, bak);
  const doc = JSON.parse(fs.readFileSync(target.full, "utf8"));
  const idx = doc.styles.findIndex((s: Style) => s.name.toLowerCase() === st.name.toLowerCase());
  if (idx >= 0) doc.styles[idx] = st;
  fs.writeFileSync(target.full, JSON.stringify(doc, null, 2), "utf8");
  return { ok: true, voice: t.voice, style: st.name, changedIndexes: changed, amplitude, floats: floats.slice(0, 8).map((v) => +v.toFixed(6)), backup: bak };
}
