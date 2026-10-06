/**
 * ACE **写前纪律** + **写/读回分离**的回报骨架。
 *
 * 事实源（都不许照 SV 猜）：
 *   · `docs/识谱接入.md` §3.6「ACE 写入铁律」→ 写前先看 `project dirty`；
 *   · 同 §3.6c「**写响应 ≠ 持久**」（2026-10-05 实测）：写回包说 `addedCount:3` / 指纹已变，
 *     可紧接着 `clip note-content` 仍返回旧的 242 音，稍后同一个 clip 的 `noteCount` 又回到 242
 *     ⇒ **「ACE 接受了 N」与「读回看到 M」是两件事，必须分开报**，且**绝不把写响应当成"内容已存在"的证据**；
 *   · `skills/ace-params/SKILL.md` §9 纪律 1「先读后写」、§8「越界一律 INVALID_ARG，从不 clamp」（⇒ 我们也不 clamp，见 `vocal-params.ts`）。
 *
 * 本模块只做两件事（纯逻辑 + 可注入运行器 ⇒ `server/tests/ace-*.mjs` 可离线跑）：
 *   ① `prepareAceWrite` —— 读 `project dirty`，必要时先 `project save`，并把"不写"的理由说清楚；
 *   ② `writeReadBack` —— 把一次写的回包与随后的读回**分两块**装进回报。
 */
import { projectState, type AceRunner, type RunResult } from './index.js';

export interface AceProjectRead {
  ok: boolean;
  projectName?: string;
  projectPath?: string;
  dirty?: boolean;
  isTempProject?: boolean;
  error?: string;
}

export interface PrepareWriteResult {
  /** false ⇒ **一个字节都别写**（`block` 就是给用户的话） */
  ok: boolean;
  project: AceProjectRead;
  /** 我们替用户跑过 `project save` 吗（默认会跑 —— 用户 2026-10-05 口径「有未保存改动先 project save」） */
  savedBeforeWrite: boolean;
  /** 不写的原因（`ok:false` 时一定有） */
  block?: string;
  /** 写之前必须知道、但**不拦**的事（临时工程 / 空路径等，见 §3.6c） */
  notices: string[];
}

/**
 * 写前检查（**默认会替用户 `project save`**，可用 `saveFirst:false` 改成"有脏就不写"）。
 *
 * 为什么要 save：§3.6 铁律第一条 —— ACE 的写落在**内存里的工程状态**上，
 * 而 §3.6c 实测过"写被接受 ≠ 内容还在"（临时工程没落盘 / 撤销栈都会吃掉它）。
 * 先落盘是让"ACE 接受了"这件事有机会变成"文件里真的有"。
 */
export function prepareAceWrite(run: AceRunner, opts: { saveFirst?: boolean; timeoutMs?: number } = {}): PrepareWriteResult {
  const st = projectState(run) as AceProjectRead;
  const notices: string[] = [];
  if (!st.ok) {
    return {
      ok: false, project: st, savedBeforeWrite: false, notices,
      block: '读不到工程状态 ⇒ **不写**（ACE 不在线 / 没开 External Agent Access？）：' + (st.error || ''),
    };
  }
  if (st.isTempProject === true || !st.projectPath) {
    notices.push(
      '当前工程是**临时 / 未落盘**的（`projectPath` 为空、`isTempProject:true`）⇒ 按 §3.6c 实测，' +
        '**"ACE 接受了"不等于"内容还在"**：读回与界面才是判据，请以 ACE 界面里的实际状态为准。',
    );
  }
  if (st.dirty === true) {
    if (opts.saveFirst === false) {
      return {
        ok: false, project: st, savedBeforeWrite: false, notices,
        block:
          '工程有未保存改动（`dirty:true`）⇒ **不写**。先 `ace_cli [\'project\',\'save\']`（或让用户决定丢弃），' +
          '再重调；要本工具替你保存就**显式**传 `saveFirst:true`。',
      };
    }
    const save: RunResult = run(['project', 'save'], opts.timeoutMs ?? 120_000);
    if (save.code !== 0) {
      return {
        ok: false, project: st, savedBeforeWrite: false, notices,
        block: `写前 \`project save\` 失败（exit ${save.code}）⇒ **不写**（不在未落盘的状态上再叠改动）：` + (save.stderr || save.stdout || ''),
      };
    }
    const after = projectState(run) as AceProjectRead;
    return { ok: true, project: after.ok ? after : st, savedBeforeWrite: true, notices };
  }
  return { ok: true, project: st, savedBeforeWrite: false, notices };
}

export interface AcceptedVsReadBack {
  /** ACE **接受了**什么（写回包原样：`addedCount` / `noteUuids` / `updatedCount` / `count` …） */
  accepted: unknown;
  /** 我们**读回**看到什么（独立的一次读；可能滞后或已被撤销） */
  readBack: unknown;
  /** 两边的结论是否可以互相印证（不一致时**照实说**，别圆） */
  consistent: boolean | null;
  note: string;
}

/** §3.6c 的回报口径，集中在一处，免得每个工具各写一套说法。 */
export function acceptedVsReadBack(accepted: unknown, readBack: unknown, consistent: boolean | null, extra?: string): AcceptedVsReadBack {
  return {
    accepted,
    readBack,
    consistent,
    note:
      '「**ACE 接受了**」与「**读回看到**」是两件事（§3.6c 实测：写回包说成功、读回可能仍是旧内容）。' +
      '写响应**不是**"内容已存在"的证据 ⇒ 以 ACE 界面里的实际状态为准（临时工程 / Ctrl+Z 都会影响结果）。' +
      (extra ? ' ' + extra : ''),
  };
}

/* ─────────────────────────── 失败分类（`error.code` → 该做什么） ─────────────────────────── */

/**
 * 把一次失败翻译成"下一步做什么"。
 *
 * 出处：`acestudio-cli help error-codes` / `help exit-codes` / `help guardrails`（原文），
 * 以及 `skills/ace/SKILL.md` §4c 的那张表。⚠️ **`error.code` 在 stderr**（`--json` 模式下错误信封不走 stdout）。
 *
 * 其中最要紧的一条是 **`NOTE_OVERLAP`**（§3.6b）：Sing 轨结果里有重叠 ⇒ **整笔被拒、什么都不写**。
 * 引擎自己的口径是 "The write path **refuses rather than resolves** on purpose" ⇒
 * 我们**绝不替用户裁任何音符**（那正是引擎拒绝做的事）。
 */
export function classifyCliFailure(r: RunResult): { code: string; exit: number; hint: string; raw?: string } | null {
  if (r.code === 0) return null;
  const m = /error\[([A-Z_]+)\]/.exec(r.stderr || '') || /error\[([A-Z_]+)\]/.exec(r.stdout || '');
  const code = m ? m[1]! : r.code === 3 ? 'BRIDGE_UNREACHABLE' : r.code === 2 ? 'USAGE' : r.code === 4 ? 'JOB_WAIT_TIMEOUT' : 'UNKNOWN';
  const hints: Record<string, string> = {
    NOTE_OVERLAP:
      '**Sing 轨单音**：结果里有重叠 ⇒ 引擎**整笔拒写**（`NOTE_OVERLAP`，错误里带冲突的两个 tick 区间）。' +
      '引擎的立场是"宁可拒、不做解析"（trimming existing notes 是它不肯替调用方做的破坏性编辑）⇒ **我们也没有替你裁任何音**：' +
      '先自己挪/删挡路的音（那是独立可撤销的一步），或换 clip / 换空闲区间。Instrument / GenericMidi 是复调轨，允许重叠。',
    STALE_WRITE: '内容在我们读之后变了（ETag 语义）⇒ **重新读一次拿新指纹**再写；不要无守护地重试覆盖别人的改动。',
    FINGERPRINT_SCOPE_MISMATCH: '指纹的适用范围对不上（读的实体与写的实体不是同一个）⇒ 用同一路读到的指纹。',
    USER_BUSY: '宿主"忙"（有未闭合的撤销段 / 正在导出渲染）⇒ 加 `--wait-busy 5s` 或稍后再试；别连着重试。',
    INVALID_ARG: '参数或值被拒（**越界走的也是这个码**）⇒ 读 `hint`/`message` 照改；**我们不会替你夹值**（ACE 从不 clamp）。',
    NOT_FOUND: 'uuid / 名字不存在 ⇒ 先 `list` 拿合法 ID；⚠️ 用户换过工程后旧 uuid 会失效。',
    NO_PROJECT_OPEN: '没有工程 ⇒ 请用户先在 ACE 里开一个/建一个。',
    CONFIRMATION_REQUIRED: '破坏性命令没人确认 ⇒ **命令根本没跑**（要 `-y` 才继续）。',
    CREDIT_INSUFFICIENT: '额度不够 ⇒ **如实告诉用户**，别当失败重试。',
    MEMBERSHIP_REQUIRED: '要会员 ⇒ **如实告诉用户**，别当失败重试。',
    TIMEOUT: '宿主侧超时 ⇒ 缩小范围（少写几个 tick / 少几个音符）再试。',
    BRIDGE_UNREACHABLE: '退出码 3 = **桥不可达**（ACE 没开，或没开 External Agent Access）⇒ 这是用户侧的事，别重试。',
    USAGE: '退出码 2 = **用法错**（CLI 解析层）⇒ **命令根本没跑**，照 usage 改参数。',
    JOB_WAIT_TIMEOUT: '退出码 4 = `job wait --timeout` 超时，**不是失败**：作业没取消、还在跑。',
  };
  return { code, exit: r.code, hint: hints[code] || `未收录的错误码（exit ${r.code}）⇒ 照 stderr 原文改，别猜。`, raw: (r.stderr || r.stdout || '').slice(0, 600) || undefined };
}
