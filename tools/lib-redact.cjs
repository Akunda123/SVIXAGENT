'use strict';
/**
 * 脱敏共用库（2026-09-14 新增）
 *
 * 为什么需要它：随包集合里存着**开发机绝对路径**（含用户名）⇒ 公开分发前必须脱敏。
 *   历史：用户 2026-09-14 裁定「tools/ + docs/ + skills/ 全打进安装包」；
 *   **2026-09-19 改判**为「只打随包集合」= `knowledge/docs`（13 份对外文档）+ `tools`（整体）；
 *   `docs/` 降级为开发参考**不进包**，`skills/` 走自己的分发链（`dsh-runtime`）。
 *   另外 `tools/issue.cjs` 记账时也默认脱敏（用户名 / 绝对路径 → 占位符）。
 *
 * 规矩：**只替换，不判死**；规则集中在这里，两处工具共用同一套（避免口径不一致）。
 */
const os = require('os');

/** 本机用户名（用于把散落的裸用户名也一起替换掉） */
function currentUser() {
  try { return os.userInfo().username || null; } catch { return null; }
}

const PLACEHOLDER = '<USER>';

/**
 * 文本脱敏：
 *   C:\Users\<name>\...    → C:\Users\<USER>\...
 *   /home/<name>/...       → /home/<USER>/...
 *   裸用户名                → <USER>
 * ⚠️ 已知「本身就是占位符」的写法（`<USER>`）不会被二次替换。
 */
function redactText(s, user) {
  if (typeof s !== 'string' || !s) return s;
  const u = user === undefined ? currentUser() : user;
  let out = s;
  if (u) {
    const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 路径形态（大小写与斜杠都覆盖）
    out = out.replace(new RegExp('([A-Za-z]:[\\\\/]Users[\\\\/])' + esc, 'gi'), '$1' + PLACEHOLDER);
    out = out.replace(new RegExp('([\\\\/]Users[\\\\/])' + esc, 'g'), '$1' + PLACEHOLDER);
    out = out.replace(new RegExp('([\\\\/]home[\\\\/])' + esc, 'g'), '$1' + PLACEHOLDER);
    // 裸用户名（词边界；跳过已经是占位符的位置）
    out = out.replace(new RegExp('(?<![<\\w])' + esc + '(?![\\w>])', 'g'), PLACEHOLDER);
  }
  // 兜底：任何用户名形态的路径（万一不是当前用户名）
  out = out.replace(/\b[A-Za-z]:\\Users\\[^\\\s"'`]+/g, 'C:\\Users\\' + PLACEHOLDER);
  out = out.replace(/(?<![<\w])\/(?:home|Users)\/[^/\s"'`]+/g, (m) => m.replace(/\/(home|Users)\/.*$/, '/$1/' + PLACEHOLDER));
  return out;
}

/**
 * 只替换**本机用户名**，不做"任何用户名形态"的兜底。
 *
 * 什么时候用它（2026-09-25 新增，为公开仓库）：`tools/redact-repo.cjs` 扫的是**整个仓库**，
 * 而仓库里本来就存在大量**故意的占位符**（UI 提示里的 `C:/Users/you/…`、
 * 文档里的 `C:\Users\<name>` / `C:\Users\<u>`）。`redactText` 的兜底规则会把它们也
 * 一律改写成 `<USER>` ⇒ 纯churn，还会把面向用户的提示语改丑。
 * 仓库场景下我们**确切知道**要抹掉的是谁（= 本机用户名），所以用这个窄口径。
 */
function redactOnlyUser(s, user) {
  if (typeof s !== 'string' || !s) return s;
  const u = user === undefined ? currentUser() : user;
  if (!u) return s;
  const esc = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s
    .replace(new RegExp('([A-Za-z]:[\\\\/]Users[\\\\/])' + esc, 'gi'), '$1' + PLACEHOLDER)
    .replace(new RegExp('([\\\\/]Users[\\\\/])' + esc, 'g'), '$1' + PLACEHOLDER)
    .replace(new RegExp('([\\\\/]home[\\\\/])' + esc, 'g'), '$1' + PLACEHOLDER)
    .replace(new RegExp('(?<![<\\w])' + esc + '(?![\\w>])', 'g'), PLACEHOLDER);
}

/** 需要打包/公开的文件类型 */
const TEXT_EXT = new Set(['.md', '.json', '.cjs', '.js', '.mjs', '.ts', '.tsx', '.ps1', '.bat', '.cmd', '.txt', '.lua', '.yml', '.yaml', '.html', '.css', '.csv', '.toml']);

/** 扫描一段文本里的敏感模式，返回 [{kind, snippet}] */
function findSensitive(s, user) {
  const u = user === undefined ? currentUser() : user;
  const hits = [];
  const push = (kind, snippet) => hits.push({ kind, snippet: String(snippet).slice(0, 160) });
  const esc = u ? u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;

  for (const m of s.matchAll(/\b[A-Za-z]:\\Users\\([^\\\s"'`]+)/g)) {
    if (m[1] !== '<USER>' && (!u || m[1].toLowerCase() !== u.toLowerCase())) push('win-path-user', m[0]);
  }
  for (const m of s.matchAll(/\/(?:home|Users)\/([^/\s"'`]+)/g)) {
    if (m[1] !== '<USER>' && (!u || m[1].toLowerCase() !== u.toLowerCase())) push('posix-path-user', m[0]);
  }
  if (esc) {
    const re = new RegExp('(?<![<\\w])' + esc + '(?![\\w>])', 'gi');
    for (const m of s.matchAll(re)) push('username', m[0]);
  }
  for (const m of s.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
    if (!/^127\.|^0\.|^255\./.test(m[0])) push('ipv4', m[0]);
  }
  for (const m of s.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)) push('email', m[0]);
  return hits;
}

module.exports = { redactText, redactOnlyUser, findSensitive, currentUser, TEXT_EXT, PLACEHOLDER };
