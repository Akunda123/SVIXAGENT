/**
 * AKDAgent 文件通道客户端（Lua 桥的对侧）
 * =====================================================================
 * 对应 `sv/lua/AKDAgentBridge.lua`。**本文件目前不被任何地方引用** ——
 * 它是"接入前"的一步：先把协议两端都在本地跑通（配 `tools/mock-lua-bridge.cjs` 自测），
 * 再决定何时把 MCP 主链路从剪贴板切过来（切换需在 SV 在线时验证，故留待有人的时候做）。
 *
 * 协议（与 Lua 桥逐字一致）：
 *   请求  <dir>/akdagent-req-<host>.json   { v, seq, id, op, args }
 *   响应  <dir>/akdagent-res-<host>.json   { v, id, seq, ok, ts, host, result | error }
 *   心跳  <dir>/akdagent-hb-<host>.json    { host, hostName, version, isSV2, indexBase, ops[], dir, ts, ... }
 *   启动  <dir>/akdagent-boot-<host>.json  { ok, reason?, ... }
 *
 * 目录解析顺序（与 Lua 桥同序）：① %USERPROFILE%\AKDAgent\ipc（存在才用，Lua 不能 mkdir）② os.tmpdir()
 *
 * 选路：**只有文件通道**（2026-09-12 起剪贴板通道退役）。`canServe(op)` 判断
 *   当前桥上这个 op 能不能被服务（心跳新鲜 + 心跳声明了该 op）。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type Host = 'sv' | 'ix';

export interface Heartbeat {
  host: string;
  hostName?: string;
  version?: string;
  hostVersionNumber?: number;
  isSV2?: boolean;
  indexBase?: number;
  ops?: string[];
  dir?: string;
  ts?: number;
  [k: string]: unknown;
}

export interface FileIpcOptions {
  dir?: string;
  host?: Host;
  timeoutMs?: number;
  pollMs?: number;
}

export interface IpcOk<T = unknown> { ok: true; result: T; elapsedMs: number; seq: number }
export interface IpcErr { ok: false; error: string; elapsedMs: number; seq: number; diagnostics?: string }
export type IpcResponse<T = unknown> = IpcOk<T> | IpcErr;

/** 请求序号：毫秒时间戳 × 1000 + 计数器 ⇒ **严格单调递增**（Lua 桥靠 seq > lastSeq 去重）。 */
let seqCounter = 0;
function nextSeq(): number {
  seqCounter = (seqCounter + 1) % 1000;
  return Date.now() * 1000 + seqCounter;
}

/** 与 Lua 桥同序的目录解析 */
export function resolveIpcDir(explicit?: string): string {
  if (explicit) return explicit;
  // 客户端侧覆盖（联调/自测用）：**Lua 桥不读这个变量**，设了它就要自己保证
  // 桥也写在同一目录（桥的 CFG.IPC_DIR / %USERPROFILE%\AKDAgent\ipc / %TEMP%）。
  const envDir = process.env.AKDAGENT_IPC_DIR;
  if (envDir) return envDir;
  const cands: string[] = [];
  const up = process.env.USERPROFILE;
  if (up) cands.push(path.join(up, 'AKDAgent', 'ipc'));
  cands.push(os.tmpdir());
  for (const d of cands) {
    try {
      fs.accessSync(d, fs.constants.W_OK);
      return d;
    } catch { /* 下一个 */ }
  }
  return os.tmpdir();
}

const p = (dir: string, kind: string, host: Host) => path.join(dir, `akdagent-${kind}-${host}.json`);

function readJson<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return null; }
}

/** 原子替换（Node 的 rename 在 Windows 上是 MoveFileEx(REPLACE_EXISTING)，可覆盖） */
function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

export function readHeartbeat(host: Host = 'sv', dir?: string): Heartbeat | null {
  return readJson<Heartbeat>(p(resolveIpcDir(dir), 'hb', host));
}

/** 心跳年龄（秒）；无心跳返回 null */
export function heartbeatAgeSec(host: Host = 'sv', dir?: string): number | null {
  const hb = readHeartbeat(host, dir);
  if (!hb || typeof hb.ts !== 'number') return null;
  return Math.floor(Date.now() / 1000) - hb.ts;
}

export function isBridgeAlive(host: Host = 'sv', dir?: string, maxAgeSec = 15): boolean {
  const age = heartbeatAgeSec(host, dir);
  return age !== null && age <= maxAgeSec;
}

/**
 * 这个 op 现在能不能被服务？（**取代了原来的"传输选路"**）
 *
 * 历史：这里原本有个 `FILE_SAFE_OPS` 白名单 + `routeTransport()`，用于在
 * "文件通道 / 剪贴板通道"之间选路；白名单的作用是**避免把 JS 语义的 op 发给 Lua 桥**
 * （最典型 `run_script`：JS 桥跑 JS、Lua 桥跑 Lua）。
 * 2026-09-12 用户裁定**剪贴板通道整体退役** ⇒ 现在只有文件通道，白名单随之删除；
 * 判据只剩一条：**桥的心跳里声明了这个 op 吗**（桥自报能力，最可靠）。
 */
export interface Serviceability {
  ok: boolean;
  reason: string;
  advertisedOps?: string[];
}

export function canServe(op: string, host: Host = 'sv', dir?: string, maxAgeSec = 15): Serviceability {
  const hb = readHeartbeat(host, dir);
  if (!hb) return { ok: false, reason: '无心跳文件（桥未运行）' };
  const age = heartbeatAgeSec(host, dir);
  if (age === null) return { ok: false, reason: '心跳文件缺少 ts 字段' };
  if (age > maxAgeSec) return { ok: false, reason: `心跳过期（${age}s > ${maxAgeSec}s）` };
  const ops = Array.isArray(hb.ops) ? hb.ops : [];
  if (!ops.includes(op)) return { ok: false, reason: `桥未声明 op '${op}'`, advertisedOps: ops };
  return { ok: true, reason: `心跳新鲜（${age}s）且已声明 '${op}'`, advertisedOps: ops };
}

/** 失败时把能拿到的东西都带上，便于排障（Lua 桥只写文件，这些是最直接的线索） */
export function collectDiagnostics(host: Host = 'sv', dir?: string): string {
  const d = resolveIpcDir(dir);
  const out: string[] = [`dir=${d}`, `host=${host}`];
  const age = heartbeatAgeSec(host, d);
  out.push(`heartbeatAge=${age === null ? '无心跳文件' : age + 's'}`);
  const boot = readJson<Record<string, unknown>>(p(d, 'boot', host));
  if (boot) out.push(`boot=${JSON.stringify(boot).slice(0, 300)}`);
  try {
    const log = fs.readFileSync(path.join(d, `akdagent-log-${host}.txt`), 'utf8');
    out.push('log尾部=' + log.split('\n').slice(-6).join(' / '));
  } catch { /* 无日志 */ }
  return out.join('\n');
}

/**
 * 发一条请求并等响应。
 * 超时/解析失败都返回 `{ok:false, ...}`（**不抛异常**，方便调用方回落剪贴板）。
 */
export async function fileIpcSend<T = unknown>(
  op: string,
  args: Record<string, unknown> = {},
  opts: FileIpcOptions = {},
): Promise<IpcResponse<T>> {
  const host = opts.host ?? 'sv';
  const dir = resolveIpcDir(opts.dir);
  const timeoutMs = opts.timeoutMs ?? 10000;
  const pollMs = opts.pollMs ?? 40;
  const seq = nextSeq();
  const id = `fileipc-${seq}`;
  const t0 = Date.now();

  const reqFile = p(dir, 'req', host);
  const resFile = p(dir, 'res', host);

  try { fs.unlinkSync(resFile); } catch { /* 旧响应，忽略 */ }
  try {
    writeAtomic(reqFile, JSON.stringify({ v: 1, seq, id, op, args }));
  } catch (e) {
    return { ok: false, error: `写请求失败：${(e as Error).message}`, elapsedMs: Date.now() - t0, seq, diagnostics: collectDiagnostics(host, dir) };
  }

  while (Date.now() - t0 < timeoutMs) {
    const res = readJson<{ seq?: number; id?: string; ok?: boolean; result?: T; error?: string }>(resFile);
    // ⚠️ 匹配**以 id（字符串）为准**，不要求 seq 数值相等。
    //    原因（2026-09-12 实测）：Lua 桥曾把 16 位 seq 编码成科学计数法丢精度
    //    （1789175384220009 → 1.78917538422e+15），而 id 是 `fileipc-<seq>` 字符串、
    //    无损 ⇒ 只要按 id 判等就能匹配上。数字比较作为冗余条件只会把这类
    //    "对端数字序列化不精确"的问题放大成"桥不响应"。
    if (res && res.id === id) {
      return res.ok
        ? { ok: true, result: res.result as T, elapsedMs: Date.now() - t0, seq }
        : { ok: false, error: String(res.error ?? 'unknown'), elapsedMs: Date.now() - t0, seq };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return {
    ok: false,
    error: `${timeoutMs}ms 内无匹配响应（seq=${seq}）——桥未运行？`,
    elapsedMs: Date.now() - t0,
    seq,
    diagnostics: collectDiagnostics(host, dir),
  };
}
