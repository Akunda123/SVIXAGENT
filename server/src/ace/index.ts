/**
 * ACE Studio 侧的工具支撑 —— ⛔ **ACE 不走我们的桥**（Lua 文件通道桥只服务 SV/IX）。
 * ACE 只有两条路，本模块把两条都包起来给 MCP 用：
 *   ① **它自己的 `acestudio-cli`**（首选：有撤销栈 / `--if-match` 指纹 / 原子拒写）
 *   ② **`.acep` 文件工具**（`skills/acep/scripts/*.cjs`，零依赖；只在 CLI 没开放的能力上用 —— 当前已知：**人声音高曲线**）
 *
 * 设计要点（都踩过坑）：
 *   · **一律 `spawnSync` + 参数数组**，不经 shell ⇒ 没有 PowerShell 的引号/BOM/编码坑（`--points '[[0,0.5]]'` 这类 JSON 参数在国内 shell 里最容易被吃掉）。
 *   · CLI 一律补 `--json`（human 输出是给人看的，不可解析）。**但不自动补 `-y/--yes`** —— 确认提示必须由调用方显式承担，别替用户点头。
 *   · **写护栏**：`--in-place` 默认拒绝（技能纪律：只写副本、原文件先备份、ACE 里那份要重新打开）；要原地写必须显式 `allowInPlace`。
 *     另：若 ACE 当前打开的**就是**目标文件且 `dirty:true`，拒绝原地写并提示先 `project save`（否则我们的改字节会与它的内存状态打架）。
 *   · 技能目录解析沿用 `articulations/engine.ts` 那套（开发态 / 打包态 / `AKDAGENT_SKILLS_DIR`）。
 *
 * 事实源：`skills/acep/SKILL.md`（容器/CBOR/三种画法/写纪律）· `skills/ace/SKILL.md`（分工与路线）· `skills/ace-params/SKILL.md`（参数层与载荷形状）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export interface RunResult {
  /** 进程退出码（-1 = 起不来 / 超时被杀） */
  code: number;
  /** 解析成功的 JSON（CLI 的 `--json` 或脚本的 `--json`）；解析不了则为 null */
  json: unknown;
  stdout: string;
  stderr: string;
  cmd: string;
  args: string[];
  timedOut?: boolean;
}

/**
 * 跑一条 `acestudio-cli` 子命令的函数签名（默认实现 = `runAceCli`）。
 * 存在的理由：ACE 工具的内核要能**离线单测**（`server/tests/ace-lyrics.mjs` /
 * `ace-vocalparams.mjs` 注入假运行器 ⇒ 不碰 ACE、不碰用户工程）。
 */
export type AceRunner = (args: string[], timeoutMs?: number) => RunResult;

/* ─────────────── acestudio-cli 定位 ─────────────── */

/** CLI 可执行文件候选：环境变量优先，然后 Windows 常见安装位置，最后交给 PATH */
export function aceCliCandidates(): { cmd: string; source: string }[] {
  const out: { cmd: string; source: string }[] = [];
  const env = process.env.ACESTUDIO_CLI;
  if (env) out.push({ cmd: env, source: "ACESTUDIO_CLI" });
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || "";
  for (const p of [
    path.join(pf, "ACE Studio", "acestudio-cli.exe"),
    path.join(pf86, "ACE Studio", "acestudio-cli.exe"),
    local ? path.join(local, "Programs", "ACE Studio", "acestudio-cli.exe") : "",
    "/Applications/ACE Studio.app/Contents/MacOS/acestudio-cli",
  ]) {
    if (p) out.push({ cmd: p, source: "常见安装位置" });
  }
  out.push({ cmd: "acestudio-cli", source: "PATH" });
  return out;
}

/** 返回第一个**存在**的候选；都不存在时返回 PATH 上那个名字（让 spawn 自己报 ENOENT） */
export function aceCliPath(): { cmd: string; source: string; exists: boolean } {
  const c = aceCliCandidates();
  for (const x of c) {
    if (x.source === "PATH") continue;
    if (existsSync(x.cmd)) return { ...x, exists: true };
  }
  const last = c[c.length - 1]!;
  return { ...last, exists: false };
}

function haveJson(args: string[]): boolean {
  return args.includes("--json");
}

const trim = (s: string | null | undefined, max = 4000): string => {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) + `\n…（截断，共 ${t.length} 字符）` : t;
};

/**
 * 把 stdout 里第一个**能解析**的完整 JSON 值取出来（CLI 会先打一两行人话；脚本多为纯 JSON）。
 * 导出是为了能离线单测（`server/tests/ace.mjs`）—— 这段逻辑踩过两个坑：
 *   ① 括号配平要**跳过字符串里的括号**（`{"c":"}"}` 不能提前收尾）；
 *   ② 起点要**逐个 `{`/`[` 试**，不能只试第一个 —— 人话里先出现 `{见文档}` 时，只找首个起点会直接放弃。
 */
export function parseJsonFromOutput(s: string): unknown {
  const t = s.trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { /* 前面/后面缀着人话，往下扫 */ }
  for (let i = 0; i < t.length; i++) {
    const open = t[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let k = i; k < t.length; k++) {
      const ch = t[k]!;
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          // 配平到一段文本；解析不成功就**换下一个起点**继续找（`{见文档}` 这种必须先跳过）
          try { return JSON.parse(t.slice(i, k + 1)); } catch { break; }
        }
      }
    }
  }
  return null;
}

/**
 * 跑 `acestudio-cli`。
 * @param args 子命令 + 参数（**不含可执行文件本身**）；会自动补 `--json`（除非已给）
 *
 * ⚠️ `maxBuffer` **必须放大**（2026-10-06 真机实测）：默认 1 MiB 会让**大回包直接 ENOBUFS**
 * —— `spawnSync` 于是 `status=null`、`stdout` 被截断，我们只能报"读不到曲线"，
 * 看起来像 ACE 的问题，其实是我们的管道太细。实测 `vocalparam read --param tension`（整条 4 分钟 clip 的
 * dense 层，每 tick 一值）的 stdout 是 **39.4 MB**。⇒ 给 64 MiB。
 */
export function runAceCli(args: string[], timeoutMs = 180_000): RunResult {
  const cli = aceCliPath();
  const full = haveJson(args) ? args : [...args, "--json"];
  const r = spawnSync(cli.cmd, full, { encoding: "utf8", timeout: timeoutMs, windowsHide: true, maxBuffer: MAX_BUFFER });
  const timedOut = r.error !== undefined && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
  return {
    code: typeof r.status === "number" ? r.status : -1,
    json: parseJsonFromOutput(String(r.stdout || "")),
    stdout: trim(r.stdout),
    stderr: trim(r.stderr) + (r.error && !timedOut ? `\n[spawn 失败] ${r.error.message}` : ""),
    cmd: cli.cmd,
    args: full,
    timedOut,
  };
}

/** 子进程管道上限（见 `runAceCli` 的注释：实测有 39 MB 级的合法回包）。 */
const MAX_BUFFER = 64 * 1024 * 1024;

/* ─────────────── .acep 文件工具（skills/acep/scripts） ─────────────── */

/** 可用的脚本白名单（`--script` 取值）⇒ 防止拿这个工具跑任意脚本 */
export const ACEP_SCRIPTS: Record<string, string> = {
  acep: "acep.cjs",                  // 主工具：info/unpack/get/dump/set-*/rap-curve/vibrato/anchor/verify/selftest
  "lane-report": "lane-report.cjs",  // 每条 lane 的 entry/样本/值域 + 三种画法 + kind:0 静音告警
  "tree-diff": "tree-diff.cjs",      // 两份 .acep 逐字段 diff（钉「哪个字段被改动了」）
  "lyric-tones": "lyric-tones.cjs",  // 歌词 → 声调串
  "lane-poke": "lane-poke.cjs",      // 造值 JSON（配 set-value 做实验）
  "f0-contour": "f0-contour.cjs",    // 渲染音频核对（F0/颤音量纲）
};

function acepScriptDirs(): string[] {
  const env = process.env.AKDAGENT_SKILLS_DIR;
  return [
    env ? path.join(env, "acep", "scripts") : "",
    path.resolve(HERE, "../../../skills/acep/scripts"),        // 开发态：repo/server/dist/ace → repo/skills
    path.resolve(HERE, "../../../dsh/skills/acep/scripts"),    // 打包态：resources/server + resources/dsh/skills
    path.resolve(HERE, "../../../../skills/acep/scripts"),     // 万一多嵌一层
    path.resolve(process.cwd(), "skills/acep/scripts"),
  ].filter((x) => x !== "");
}

export function acepScriptPath(name: string): string {
  const file = ACEP_SCRIPTS[name] ?? (name.endsWith(".cjs") ? name : undefined);
  if (!file) throw new Error(`未知脚本 "${name}"（可选：${Object.keys(ACEP_SCRIPTS).join(" / ")}）`);
  const tried: string[] = [];
  for (const d of acepScriptDirs()) {
    const p = path.join(d, file);
    tried.push(p);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `找不到 skills/acep/scripts/${file}（技能脚本是单一事实源，必须随包分发）。` +
      `已试：${tried.join(" · ")}；可用环境变量 AKDAGENT_SKILLS_DIR 指定技能根目录。`,
  );
}

/**
 * ACE 当前打开的工程状态；ACE 没在线时 `ok:false`。
 * ⚠️ **必须用 `project dirty`，不能用 `project info`**（2026-10-05 实测）：`project info --json` 只给
 * `duration/isNewProject/isTempProject/projectName` —— **既没有 `projectPath` 也没有 `dirty`**（护栏要靠这两个字段，
 * 拿 `info` 会让护栏永远不触发）。`project dirty --json` 给的键最全：`dirty` / `projectPath` / `projectName` / `isTempProject`。
 */
export function projectState(run: AceRunner = runAceCli): {
  ok: boolean; projectName?: string; projectPath?: string; dirty?: boolean; isTempProject?: boolean; error?: string;
} {
  const r = run(["project", "dirty"], 30_000);
  const j = r.json as Record<string, unknown> | null;
  if (r.code !== 0 || !j || typeof j !== "object") {
    return { ok: false, error: `ace 不在线或读不到工程状态（exit ${r.code}）：${(r.stderr || r.stdout || "").slice(0, 300)}` };
  }
  return {
    ok: true,
    projectName: typeof j.projectName === "string" ? j.projectName : undefined,
    projectPath: typeof j.projectPath === "string" ? j.projectPath : undefined,
    dirty: typeof j.dirty === "boolean" ? j.dirty : undefined,
    isTempProject: typeof j.isTempProject === "boolean" ? j.isTempProject : undefined,
  };
}

const samePath = (a: string, b: string): boolean =>
  path.resolve(a).toLowerCase().replace(/\\/g, "/") === path.resolve(b).toLowerCase().replace(/\\/g, "/");

/**
 * 跑技能脚本（`skills/acep/scripts/*.cjs`）。
 * 写护栏（技能 §8 纪律的可执行版）：
 *   · `--in-place` 默认**拒绝**；
 *   · 允许时，若 ACE 当前打开的**正是**目标文件且 `dirty:true` ⇒ 也拒绝（先 `project save`，别跟它的内存状态打架）。
 */
export function runAcep(
  name: string,
  args: string[],
  opts: { allowInPlace?: boolean; timeoutMs?: number; skipGuards?: boolean } = {},
): RunResult {
  const file = acepScriptPath(name);
  const inPlace = args.includes("--in-place");
  const guard = (msg: string): RunResult => ({
    code: 2, json: null, stdout: "", stderr: "⛔ " + msg, cmd: file, args,
  });
  if (!opts.skipGuards && inPlace && !opts.allowInPlace) {
    return guard(
      "该命令带 `--in-place`（原地改文件），已被护栏拒绝。技能纪律是**只写副本**：去掉 `--in-place` 并用 `--out <目录>` 产出副本；" +
        "确实要原地改，调用方必须显式传 `allowInPlace:true`，且**先确认这是副本工程、不是用户正在编辑的那份**（§8 纪律 ②⑥）。",
    );
  }
  if (!opts.skipGuards && inPlace) {
    // `--in-place` 场景下目标就是参数里那个 `.acep`（`vibrato <file> … --in-place`）
    const target = args.find((a) => !a.startsWith("--") && /\.acep$/i.test(a));
    if (target) {
      const st = projectState();
      if (st.ok && st.projectPath && samePath(st.projectPath, target) && st.dirty === true) {
        return guard(
          `ACE 当前打开的正是 ${target}，且 **dirty:true**（有未保存改动）。` +
            "先 `ace_cli ['project','save']`（或让用户决定丢弃），再原地改 —— 否则我们的字节改动会与它的内存状态打架（§8 纪律 ①）。",
        );
      }
    }
  }
  const r = spawnSync(process.execPath, [file, ...args], { encoding: "utf8", timeout: opts.timeoutMs ?? 180_000, windowsHide: true, maxBuffer: MAX_BUFFER });
  const timedOut = r.error !== undefined && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT";
  return {
    code: typeof r.status === "number" ? r.status : -1,
    json: parseJsonFromOutput(String(r.stdout || "")),
    stdout: trim(r.stdout),
    stderr: trim(r.stderr) + (r.error && !timedOut ? `\n[spawn 失败] ${r.error.message}` : ""),
    cmd: file,
    args,
    timedOut,
  };
}
