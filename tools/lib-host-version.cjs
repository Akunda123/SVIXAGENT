#!/usr/bin/env node
/**
 * 宿主版本基线的共享解析（2026-09-21 新增）
 *
 * **为什么要单独一份**：同一套解析原先只在 `host-version-notice.cjs`（读）里写了一遍，
 * 而 `api-docs-sync.cjs --record-host auto`（写）又要碰同一批字段 —— 两份逻辑必漂。
 * 现在读与写都从这里取，字段名 `sv1 / sv2 / ix` 与"sv 通道靠 hostName 分变体"这条规则**只有一处定义**。
 *
 * 数据形态：`skills/sv-scripting/api/_sync.json` 的 `hostVersions`
 *   `{ "2026-09-13": "sv1=1.11.2 (Synthesizer V Studio Pro) / sv2=2.2.1 (…) / ix=1.0.0 (…)" }`
 *   —— 值是**给人看的字符串**（带括号里的宿主名），解析只认 `key=数字`；括号内容纯装饰、可省。
 */
const fs = require('fs');

/** 固定顺序：`--startup` 那种"取第一个数字"的粗解析依赖它（sv1 必须在前） */
const KEYS = ['sv1', 'sv2', 'ix'];

/**
 * 桥的 `sv` 通道被 SV1 / SV2 共用 ⇒ 只能靠心跳里的 hostName 判变体。
 * ⚠️ 这是**唯一权威**：别在别处再写一份正则。
 */
function variantOf(channel, hb) {
  if (channel === 'ix') return 'ix';
  const name = String((hb && hb.hostName) || '');
  if (/Studio\s*2|2\s*Pro/.test(name)) return 'sv2';
  return 'sv1';
}

/** 从一条记录文本里抠出 `{sv1?,sv2?,ix?}`；认不出的键一律忽略（不猜） */
function parseRecord(raw) {
  const out = {};
  for (const m of String(raw == null ? '' : raw).matchAll(/\b(sv1|sv2|ix)=([\d.]+)/g)) out[m[1]] = m[2];
  return out;
}

/** 取 `hostVersions` 里**日期最大**的一条（键是 `YYYY-MM-DD`，字典序即时间序） */
function latestHostVersions(syncPath) {
  try {
    const st = JSON.parse(fs.readFileSync(syncPath, 'utf8'));
    const hv = st.hostVersions || {};
    const keys = Object.keys(hv).sort();
    if (!keys.length) return { raw: null, at: null, parsed: {} };
    const at = keys[keys.length - 1];
    const raw = hv[at];
    return { raw, at, parsed: parseRecord(raw), generatedAt: st.generatedAt || null };
  } catch (e) { return { raw: null, at: null, parsed: {}, err: e.message }; }
}

/** 语义化比较；认不出数字就返回 null（= 无法比较，调用方按"不动作"处理） */
function cmpSemver(a, b) {
  const pa = String(a || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  const pb = String(b || '').match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!pa || !pb) return null;
  for (let i = 1; i <= 3; i++) {
    const x = Number(pa[i] || 0), y = Number(pb[i] || 0);
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** 把 `{sv1,sv2,ix}` 拼回契约字符串（按 KEYS 定序；`names` 里有的才附宿主名） */
function formatRecord(map, names) {
  const n = names || {};
  return KEYS.filter((k) => map[k]).map((k) => k + '=' + map[k] + (n[k] ? ' (' + n[k] + ')' : '')).join(' / ');
}

/**
 * 合并式记录（2026-09-21）：以 `prevRaw` 为底，`now`（本次读到的 变体→版本）**就地刷新**，
 * 读不到的**保留旧值** ⇒ **绝不会把已知版本写成 unknown**。
 * （旧行为是整条覆盖：只有 IX 在线时跑一次就抹掉 sv1/sv2；一个都没连着时写 `unknown`，
 *   而读侧判据是"抠不出数字就不动作" ⇒ 提示机制被静默关掉。）
 * ⚠️ 括号里的宿主名只对**本次刷新到的**变体附着（沿用的旧值只剩版本号 —— 那是装饰，读侧只认数字）；
 *    因此"一条都没读到"时调用方**不该**走这里改写记录，而应原样沿用（`recordHost` 就是这么做的）。
 * @returns {{merged:Object, record:string, refreshed:string[], kept:string[]}}
 */
function mergeRecord(prevRaw, now, names) {
  const prev = parseRecord(prevRaw);
  const n = now || {};
  const merged = Object.assign({}, prev, n);
  return {
    merged,
    record: formatRecord(merged, names || {}),
    refreshed: Object.keys(n),
    kept: Object.keys(prev).filter((k) => !n[k]),
  };
}

module.exports = { KEYS, variantOf, parseRecord, latestHostVersions, cmpSemver, formatRecord, mergeRecord };
