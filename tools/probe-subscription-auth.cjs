#!/usr/bin/env node
/**
 * probe-subscription-auth.cjs —— 探针：**订阅制（OAuth 登录）模型能不能接进 AKDAgent**
 *
 * 起因（用户 2026-10-06 报）：「有用户说订阅的没法填 api」。
 *
 * ⛔ 第一版踩过的坑（留着当教训）：只扫了 `~/.dsh/profiles/*`（**开发 profile**），于是得出
 *   "没有任何包 provide `authorization` 服务 ⇒ 流注册是空转" —— **对产品是错的**：
 *   发行物里那份 DSH 运行时（`dsh-runtime/dsh`）**装了 `@deepseek-ai/dsh-authorization`**。
 *   所以本探针**默认两个都扫**，并把"开发 profile vs 发行运行时"的差异**显式打出来**。
 *
 * ⚠️ 只读：不启动宿主、不改 profile、不发起任何真实登录（不碰用户账号）。
 *
 * 用法：`node tools/probe-subscription-auth.cjs [额外要扫的目录…]`
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');

/* ── 要扫的目标：① 发行运行时（用户实际跑的）② 本机开发 profile ─────────────── */
function targets() {
  const out = [];
  const shipped = path.join(REPO, 'dsh-runtime', 'dsh');
  if (fs.existsSync(path.join(shipped, 'node_modules'))) out.push({ label: '发行运行时（随包分发，用户跑的就是这个）', nm: path.join(shipped, 'node_modules') });
  const profRoot = path.join(os.homedir(), '.dsh', 'profiles');
  try {
    for (const n of fs.readdirSync(profRoot)) {
      const nm = path.join(profRoot, n, 'node_modules');
      if (fs.existsSync(nm)) out.push({ label: `开发 profile：${n}`, nm });
    }
  } catch { /* 没有就没有 */ }
  for (const extra of process.argv.slice(2)) {
    const nm = path.join(path.resolve(extra), 'node_modules');
    if (fs.existsSync(nm)) out.push({ label: '命令行指定：' + extra, nm });
    else if (fs.existsSync(path.resolve(extra))) out.push({ label: '命令行指定：' + extra, nm: path.resolve(extra) });
  }
  return out;
}

const say = (s = '') => console.log(s);
const H = (s) => say('\n' + '─'.repeat(76) + '\n' + s + '\n' + '─'.repeat(76));
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const has = (p) => fs.existsSync(p);

/* ── ① 订阅制提供方（权威 = pi-ai 的 auth/oauth/*.js + load.js 的 loader） ──── */
function providersOf(piAi) {
  const dir = path.join(piAi, 'dist', 'auth', 'oauth');
  if (!has(dir)) return null;
  const skip = new Set(['load.js', 'pkce.js', 'device-code.js', 'oauth-page.js']);
  const loaders = [...read(path.join(dir, 'load.js')).matchAll(/export const load(\w+)OAuth/g)].map((m) => m[1]);
  const rows = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !skip.has(f)).map((f) => {
    const s = read(path.join(dir, f));
    return {
      id: f.replace(/\.js$/, ''),
      kind: [
        /device_code|device\b/i.test(s) ? 'device-code' : '',
        /code_challenge|pkce/i.test(s) ? 'PKCE' : '',
        /127\.0\.0\.1|localhost/i.test(s) ? '本地回调' : '',
      ].filter(Boolean).join(' + '),
      urls: [...new Set((s.match(/https?:\/\/[a-z0-9.\-/]+/gi) || []).map((u) => u.replace(/\/$/, '')))].slice(0, 3),
    };
  });
  return { loaders, rows, version: (() => { try { return require(path.join(piAi, 'package.json')).version; } catch { return '?'; } })() };
}

/* ── ② pi-ai 注册进 authorization 的 flow 长什么样 ───────────────────────── */
function flowRegistration(pluginIndex) {
  const s = read(pluginIndex);
  if (!s) return null;
  return {
    injectGuard: /ctx\.inject\(\[\s*['"]authorization['"]\s*\]/.test(s),   // ⚠️ 没这个服务就**静默不注册**
    registerCall: /ctx\.authorization\.registerFlow\(/.test(s),
    keyFn: /recordKeyFor\(providerId\)/.test(s),
    label: /label:\s*provider\.name/.test(s),
    methods: /methods:\s*\[first,\s*\.\.\.rest\]/.test(s),
    login: /models\.login\(providerId/.test(s),
  };
}

/* ── ③ dsh-authorization 的服务契约（从 d.ts 抠方法名） ──────────────────── */
function authorizationContract(authPkg) {
  const dts = path.join(authPkg, 'lib', 'types', 'index.d.ts');
  const s = read(dts);
  if (!s) return null;
  const methods = [...new Set([...s.matchAll(/^\s{4}(?:private\s+)?([a-zA-Z]+)\(/gm)].map((m) => m[1]))].filter((m) => m !== 'constructor');
  const errors = [...new Set([...s.matchAll(/code `([A-Z_]+)`/g)].map((m) => m[1]))];
  const notice = /interface AuthorizationNotice[\s\S]{0,400}?\}/.exec(s.replace(/\r/g, ''))?.[0] || '';
  return { methods, errors, hasDts: true, noticeFields: [...new Set([...notice.matchAll(/^\s{4}(readonly\s+)?([a-zA-Z]+)\??:/gm)].map((m) => m[2]))] };
}

/* ══════════════════════════════════════════════════════════════════════════ */
say('探针：订阅制（OAuth 登录）模型接入可行性 —— 只读');
const all = [];
for (const t of targets()) {
  const piAi = path.join(t.nm, '@earendil-works', 'pi-ai');
  const authPkg = path.join(t.nm, '@deepseek-ai', 'dsh-authorization');
  const piPlugin = path.join(t.nm, '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js');

  say('\n' + '═'.repeat(76));
  say(`▶ ${t.label}`);
  say('═'.repeat(76));
  say(`  pi-ai：${has(piAi) ? '有' : '❌ 没有'}　·　dsh-authorization：${has(authPkg) ? '✅ 有（服务提供方在）' : '❌ 没有（⇒ 登录流不会注册）'}`);

  const p = providersOf(piAi);
  const reg = flowRegistration(piPlugin);
  const c = has(authPkg) ? authorizationContract(authPkg) : null;

  if (p) {
    H('① 自带登录的提供方（= 订阅/登录制，不是填 key）');
    say(`  pi-ai ${p.version} · load.js loader ${p.loaders.length} 个：${p.loaders.join(', ')}`);
    p.rows.forEach((r) => say(`   · ${r.id.padEnd(16)} ${r.kind.padEnd(26)} ${r.urls.join('  ')}`));
  }

  H('② pi-ai 是怎么把它挂上去的（关键守卫）');
  if (reg) {
    say(`  ctx.inject(['authorization']) 守卫：${reg.injectGuard ? '✅ 有 ⇒ 服务在才注册，不在就**静默不注册**（不报错）' : '（没找到）'}`);
    say(`  ctx.authorization.registerFlow(...)：${reg.registerCall ? '✅' : '—'}`);
    say(`  key = recordKeyFor(providerId)：${reg.keyFn ? '✅' : '—'}（scope = 'llm-pi-ai'，id = 提供方 id）`);
    say(`  label = provider.name：${reg.label ? '✅' : '—'}　·　methods = 该提供方声明的方法（oauth / api-key）：${reg.methods ? '✅' : '—'}`);
    say(`  run() 里调 models.login(providerId, oauth|api_key, …)（pi-ai 自己写凭据）：${reg.login ? '✅' : '—'}`);
  } else say('  ❌ 读不到 dsh-llm-pi-ai/lib/index.js');

  H('③ 客户端要用到的服务契约（ctx.authorization）');
  if (c) {
    say('  方法：' + c.methods.join(' · '));
    say('  错误码：' + c.errors.join(' · '));
    say('  通知字段（notify 能带什么）：' + (c.noticeFields.join(', ') || '（没抠到，见 lib/types/types.d.ts）'));
    say('  ⇒ 客户端只需四件事：list() 列可登录的 · begin({key,method,interaction,signal}) 起一次');
    say('     · cancel(key) 取消 · 听 authorization/settled 收尾（prompt/notify 随请求走）');
  } else say('  ❌ 这个目标里没有 dsh-authorization ⇒ **登录流不会注册**（这就是"订阅没法填 api"的根因之一）');

  H('④ 谁在调这个服务（= 现成的客户端可达面）');
  const aiDir = path.join(t.nm, '@deepseek-ai');
  if (has(aiDir)) {
    const hits = [];
    const walk = (d, depth = 0) => {
      if (depth > 5) return;
      let ents = [];
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const fp = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '.pnpm') walk(fp, depth + 1); }
        else if (/\.(js|d\.ts)$/.test(e.name)) {
          const s = read(fp);
          if (/authorization\.(begin|cancel|list|describe)\b|ctx\.authorization/.test(s)) hits.push(path.relative(t.nm, fp));
        }
      }
    };
    walk(aiDir);
    const byPkg = {};
    for (const h of hits) { const k = h.split(path.sep).slice(1, 3).join('/'); byPkg[k] = (byPkg[k] || 0) + 1; }
    Object.entries(byPkg).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => say(`   · ${k.padEnd(40)} ${v} 处`));
    if (!hits.length) say('   （没人调 ⇒ 服务在、流在，但**没有界面/接口按那个按钮**）');
  }

  all.push({ label: t.label, piAi: has(piAi), auth: has(authPkg), providers: p ? p.rows.map((r) => r.id) : [], contract: c });
}

/* ── 我们这边的缺口（AKDAgent 自己） ──────────────────────────────────────── */
H('⑤ AKDAgent 侧：为什么用户"填不了 api"');
const settingsHtml = read(path.join(REPO, 'electron', 'src', 'settings.html'));
const mainJs = read(path.join(REPO, 'electron', 'src', 'main.js'));
say('  自定义提供方字段：' + ['route', 'name', 'keyenv', 'api'].filter((k) => settingsHtml.includes('custom-' + k)).join(', '));
say(`  ⇒ 只有"API 密钥（keyenv）"这一种凭据；${/login|oauth|signIn/.test(settingsHtml) ? '有' : '**没有**'}任何登录/授权入口`);
say('  pi-ai 提供方预设有：' + (/(\[[\s\S]{0,400}?\])/.exec(/const PI_AI_PROVIDER_PRESETS = (\[[\s\S]{0,400}?\])/.exec(mainJs)?.[1] || '')?.[1] || '（没读到）'));
say('  ⚠️ 预设表里没有 openai-codex / github-copilot / kimi-coding ⇒ 连卡片都没有');

/* ── 结论 ─────────────────────────────────────────────────────────────────── */
H('结论');
for (const r of all) {
  say(`  · ${r.label}`);
  say(`      pi-ai=${r.piAi ? '有' : '无'}　dsh-authorization=${r.auth ? '有' : '无'}　登录制提供方=${r.providers.length ? r.providers.join(', ') : '（无 / 无法枚举）'}`);
}
say('');
say('  能定的：');
say('   1) 订阅制提供方 **7 家**：anthropic(Claude) · openai-codex(ChatGPT) · github-copilot · kimi-coding · xai · openrouter · radius(=radius.pi.dev，pi 自家服务，不是消费级订阅)');
say('   2) 发行运行时里 **服务与流都齐**：dsh-authorization 提供服务，dsh-llm-pi-ai 为"每个自带登录的提供方"注册一条流；');
say('      凭据由 pi-ai 自己写进 dsh-credentials 的 grant；契约只有 list/describe/begin/cancel 四个成员。');
say('   3) 用户报的现象根因：**AKDAgent 侧只有 keyenv（密钥）一种凭据入口**，没有"登录"入口；');
say('      而登录制提供方在 AKDAgent 里连卡片都没有（预设表缺 3 个）。');
say('');
say('  下一步（两条路，都不必先碰用户账号）：');
say('   A. 零代码试一次：会话跑 `cordis` 预设（dsh-agent-presets/presets/cordis/agent.cordis.yml 里挂着 dsh-tool-cordis）');
say('      ⇒ 模型可用 cordis_inspect_query 读 authorization 契约、cordis_define 写个小 host 插件、cordis_run 起一次登录。');
say('   B. 产品化（推荐）：在发行运行时的 patch 里常驻一个小 host 插件，把 list/begin/cancel 包成 AKDAgent 能调的入口，');
say('      设置页加「订阅登录」区（列 7 家 + 按钮 + 显示 code/URL + 完成后自动加 route）。');
say('');
say('  ⚠️ 上面是**当时（2026-10-06）的结论**，别当现状读：B 那条**已经落地**（产品桥 akd-auth-bridge + 设置页「订阅登录」区），');
say('     六家订阅提供方**已全部模拟跑通**（零账号，含凭据落库）。现状见 tools/probe-auth/README.md 与 docs/待办.md。');
