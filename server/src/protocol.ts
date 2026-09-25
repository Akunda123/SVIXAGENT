/**
 * 桥客户端（**纯文件通道**，2026-09-12 起）
 *
 * 历史：最初 JS 桥只能借 Windows 剪贴板当通道（JS 沙箱零宿主对象）。
 * 现在 Lua 桥用 `io`/`os` 走文件通道，**剪贴板通道已整体退役**
 * （`AKDAGENT_TRANSPORT`、`AKDAGENT_CLIPBOARD`、剪贴板探测与回落全部删除）。
 *
 * 流程：把请求写进 `akdagent-req-<host>.json` → 轮询等桥写回 `akdagent-res-<host>.json`。
 * 选路只看**桥的心跳**：心跳新鲜 **且** 心跳的 `ops` 里声明了该 op ⇒ 可服务；否则**明确报错**。
 * （不再"回落剪贴板" —— 用户 2026-09-12 裁定：宁可报错，也不碰剪贴板。）
 *
 * 关于 `run_script`：桥是 **Lua** 桥 ⇒ 脚本必须是 **Lua**（冒号调用、索引 1 起），
 * 不再是 JS/ES5.1（那是已退役的 JS 桥的语义）。
 */
import { fileIpcSend, isBridgeAlive, readHeartbeat, collectDiagnostics, type Host } from "./fileipc.js";

export interface ExecuteOptions {
  timeoutMs?: number;
  /** 轮询间隔（保留参数以兼容旧调用点；文件通道用更短的轮询） */
  intervalMs?: number;
  host?: string;
}

/** 把工具里的 host 字符串归一成通道用的 host（'sv' | 'ix'） */
function normalizeHost(host?: string): Host {
  if (!host) return "sv";
  return host.toLowerCase().indexOf("ix") >= 0 || host.toLowerCase().indexOf("instrument") >= 0 ? "ix" : "sv";
}

/**
 * 这个 op 现在能不能被服务？判据 = ① 有心跳 ② 心跳新鲜 ③ 心跳声明了该 op。
 * ⚠️ 与老版本的区别：**没有"回落剪贴板"这一说**了 ⇒ 不能服务时直接给出可操作的错误。
 */
export function serviceability(op: string, host?: string, maxAgeSec = 15): {
  ok: boolean; reason: string; advertisedOps?: string[];
} {
  const h = normalizeHost(host);
  const hb = readHeartbeat(h);
  if (!hb) {
    return {
      ok: false,
      reason: `没有心跳文件（host=${h}）—— 请在 ${h === "ix" ? "Instrument X" : "Synthesizer V"} 里运行 sv/lua/AKDAgentBridge.lua`,
    };
  }
  if (!isBridgeAlive(h, undefined, maxAgeSec)) {
    return { ok: false, reason: `桥心跳已过期（host=${h}）—— 桥可能已停止，请重新运行 AKDAgentBridge.lua` };
  }
  const ops = Array.isArray(hb.ops) ? hb.ops : [];
  if (!ops.includes(op)) {
    return { ok: false, reason: `桥（${hb.hostName || h} ${hb.bridge || ""}）没有声明 op '${op}'`, advertisedOps: ops };
  }
  return { ok: true, reason: `心跳新鲜且已声明 '${op}'`, advertisedOps: ops };
}

/**
 * 向桥发送一个操作并等响应。
 * @throws 桥不在线 / 未声明该 op / 超时 / 写文件失败
 */
export async function executeOp(
  op: string,
  args: Record<string, unknown> = {},
  opts: ExecuteOptions = {}
): Promise<unknown> {
  const { timeoutMs = 10000, intervalMs = 200, host: hostOpt } = opts;
  // 从业务参数 args 提取 host（若有），使工具无需逐个改就能指定宿主。host 不发往桥。
  const hostFromArgs = typeof args.host === "string" ? (args.host as string) : undefined;
  const host = normalizeHost(hostOpt || hostFromArgs);

  // 去 host 键，避免把它作为业务参数发给桥
  const cleanArgs = { ...args };
  delete cleanArgs.host;

  // ① 先判可服务性：不在线/未声明就**立刻报错**（不写任何东西、不碰剪贴板）
  const svc = serviceability(op, host);
  if (!svc.ok) {
    const extra = svc.advertisedOps ? `\n桥声明的 op：${svc.advertisedOps.join(", ")}` : "";
    throw new Error(`${svc.reason}${extra}\n（诊断：${collectDiagnostics(host)}）`);
  }

  // ② 发文件请求
  const r = await fileIpcSend(op, cleanArgs, {
    host,
    timeoutMs,
    pollMs: Math.min(Math.max(intervalMs, 20), 60),
  });
  if (r.ok) return r.result;
  throw new Error(`op '${op}' 失败：${r.error}${r.diagnostics ? `\n（诊断：${r.diagnostics}）` : ""}`);
}

/** 检测桥是否在线（短超时），如在线则返回桥的响应（含 host 信息）。 */
export async function pingBridge(timeoutMs = 3000): Promise<unknown> {
  return executeOp("ping", {}, { timeoutMs, intervalMs: 150 });
}
