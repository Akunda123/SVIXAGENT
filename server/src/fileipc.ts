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
  session?: number;        // 本次桥运行的标识（与 lastop 面包屑互校用，2026-09-27 加）
  opsRun?: number;
  reqSeen?: number;
  pollTicks?: number;
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

export interface LastOpCrumb {
  op?: string;
  stage?: string;          // running（= 卡在这一笔）/ done / failed / unknown-op
  ts?: number;
  tick?: number;
  host?: string;
  bridge?: string;
  id?: string | number;
  seq?: number;
  session?: number;        // 本次桥运行的标识（与心跳 session 比 ⇒ 是不是当前这次运行留下的）
  reqSeen?: number;        // 落这一笔时桥已见到的请求数
  opsRun?: number;         // 落这一笔时桥已跑完的 op 数
  extra?: string;
  args?: unknown;
  [k: string]: unknown;
}

/** 读桥落的"肇事 op 面包屑"（akdagent-lastop-<host>.json；桥每笔请求执行前写、执行完改 stage） */
export function readLastOp(host: Host = 'sv', dir?: string): LastOpCrumb | null {
  return readJson<LastOpCrumb>(p(resolveIpcDir(dir), 'lastop', host));
}

/**
 * 把面包屑变成一句**人话**（诊断/报错里用）。
 *
 * 为什么需要它（2026-09-27 用户真机事故）：宿主弹的脚本错误框是**模态**的 ⇒ 一弹出来
 * 宿主主线程就停、桥的轮询链跟着停、Lua 侧一行日志都写不出来 ⇒ 事后只知道"桥不在了"，
 * 完全不知道是哪一笔请求造成的。桥现在会在执行前落盘 `stage="running"`：
 *   · 停在 running ⇒ 大概率**就是这一笔**（多半是它让宿主弹了脚本错误框）
 *   · 停在 done/failed ⇒ 桥是"干净地"停的（被关掉 / 宿主退出），不是被某笔请求弄死的
 *
 * ⚠️ 还要防"冤枉"：面包屑落盘后**不会自己消失**（宿主冻住时正是靠它取证）⇒ 桥重启后
 *   旧面包屑还在盘上。所以用桥的 **session + reqSeen/opsRun** 与心跳互校：
 *   · session 不同 ⇒ 那是**上一次桥运行**留下的，只能说"上次卡在 X"，不认作本次肇事者；
 *   · session 相同且 `opsRun < reqSeen` ⇒ 这一笔**确实没跑完**（opsRun 在 op **跑完之后**才自增）。
 */
export function describeLastOp(host: Host = 'sv', dir?: string): string | null {
  const d = resolveIpcDir(dir);
  const c = readLastOp(host, d);
  if (!c || !c.op) return null;
  const age = typeof c.ts === 'number' ? Math.max(0, Math.floor(Date.now() / 1000) - c.ts) : null;
  const head = `lastOp=${c.op} stage=${c.stage ?? '?'}` +
    (age === null ? '' : ` +${age}s`) +
    (c.extra ? ` ${c.extra}` : '');
  const hb = readHeartbeat(host, d);
  const hbSession = hb && typeof hb.session === 'number' ? hb.session : null;
  const hbOpsRun = hb && typeof hb.opsRun === 'number' ? hb.opsRun : null;

  // 互校：这条面包屑属于"当前这次桥运行"吗？那一笔真的没跑完吗？
  const crumbSession = typeof c.session === 'number' ? c.session : null;
  const sameSession = hbSession !== null && crumbSession !== null && hbSession === crumbSession;
  const sessionDiffers = hbSession !== null && crumbSession !== null && hbSession !== crumbSession;
  const finished = sameSession && hbOpsRun !== null && typeof c.reqSeen === 'number' && hbOpsRun >= c.reqSeen;

  const argsLine = c.args ? `\n   该请求参数摘要：${JSON.stringify(c.args).slice(0, 600)}` : '';
  const steps = '\n   恢复三步：① 到 Synthesizer V / Instrument X 里**关掉那个错误框**' +
    '（框不下，宿主主线程一直停着，重跑脚本也不会生效）' +
    ' ② **Ctrl+S 保存工程**（内存里的改动还没落盘，这一步最要紧）' +
    ' ③ 脚本菜单 → Agent → 重跑 AKDAgentBridge';

  if (sessionDiffers) {
    return head + `\n   （这是**上一次桥运行**留下的面包屑，不是本次的肇事者；` +
      `本次心跳 session=${hbSession ?? '?'}）` + argsLine;
  }
  if (c.stage === 'running' && !finished) {
    return head + '\n⚠️ 这一笔**没有跑完** —— 最可能是宿主弹了**模态脚本错误框**（框一弹宿主主线程就停）。' +
      steps + argsLine;
  }
  return head;
}

/** 失败时把能拿到的东西都带上，便于排障（Lua 桥只写文件，这些是最直接的线索） */
export function collectDiagnostics(host: Host = 'sv', dir?: string): string {
  const d = resolveIpcDir(dir);
  const out: string[] = [`dir=${d}`, `host=${host}`];
  const age = heartbeatAgeSec(host, d);
  out.push(`heartbeatAge=${age === null ? '无心跳文件' : age + 's'}`);
  const boot = readJson<Record<string, unknown>>(p(d, 'boot', host));
  if (boot) out.push(`boot=${JSON.stringify(boot).slice(0, 300)}`);
  const crumb = describeLastOp(host, d);
  if (crumb) out.push(crumb);
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
