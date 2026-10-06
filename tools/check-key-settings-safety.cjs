#!/usr/bin/env node
/**
 * 守卫：**密钥不外泄 · 设置/凭据的失败不哑**（2026-10-05 立）
 *
 * 起因（这一轮复查「模型 / 密钥 / 设置」时抓到三条真问题，都属"用户被界面骗"这一类）：
 *   ① **H4 后半截**：`writeSettings()` 失败只 `console.error` 就返回 ⇒ 10 个写设置的 IPC 全回 `ok:true`，
 *      而 settings.html 早就准备好显示 `r.error` 了（多处 `if (!r || r.ok === false)`）⇒ 白准备。
 *      场景：settings.yaml 只读 / 被杀软锁 / 磁盘满 ⇒ 用户"改了默认模型"，重启又变回去，界面从不报错。
 *   ② **崩溃取证脱敏太窄**：`redactForCrash()` 只认 `sk-…` ⇒ Google `AIza…` / HF `hf_…` / Groq `gsk_…` /
 *      xAI `xai-…` 会**原样**写进 `userData/host-crash.json`，而那份文件是**用户回传给我们的**。
 *   ③ **首次填 key 的失败必须吵**：`akdagent-key-save` 失败时要**不关窗 + 弹原生框**（§11 的教训），
 *      以及 `set-provider-key` 要校验凭据名（非法名会让宿主 boot 失败 ⇒ 客户端跟着退）。
 *
 * 判据分三层：**源码级**（写法不许退回去）+ **抠函数真跑**（脱敏必须真遮住各形状密钥）+ **静态遍历**
 * （不允许"裸 writeSettings 后直接 ok:true"这种哑写法再长出来）。
 *
 * 用法：node tools/check-key-settings-safety.cjs [--main <main.js 路径>]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const mi = args.indexOf('--main');
const MAIN = mi >= 0 && args[mi + 1] ? path.resolve(args[mi + 1]) : path.join(ROOT, 'electron', 'src', 'main.js');

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

if (!fs.existsSync(MAIN)) { console.log('  [FAIL] 找不到 ' + MAIN); process.exit(1); }
const t = fs.readFileSync(MAIN, 'utf8');
const lines = t.split(/\r?\n/);

console.log('== ① writeSettings 必须如实回报写盘结果（H4：不许哑失败）==');
if (/const wrote = writeFileAtomic\(OWNED_SETTINGS_PATH, out\)/.test(t)) ok('把 writeFileAtomic 的结果接住了（const wrote = …）');
else fail('writeFileAtomic(OWNED_SETTINGS_PATH…) 的结果没被接住 ⇒ 写盘失败会哑掉');
if (/return wrote/.test(t)) ok('函数结尾把结果返回给调用方');
else fail('writeSettings 没有 return 写盘结果（调用方无从判断）');
if (/if \(!wrote\) console\.error\('\[akdagent\] 写 settings\.yaml 失败/.test(t)) ok('失败仍打日志（排障留痕）');
else fail('失败没打日志（排障时看不到）');

console.log('\n== ② 不许出现"裸 writeSettings(s) → return { ok: true }"（哑写的典型形态）==');
{
  let bare = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*writeSettings\(s\)\s*$/.test(lines[i])) continue;
    const nxt = (lines[i + 1] || '') + (lines[i + 2] || '');
    if (/return \{ ok: true/.test(nxt)) { bare++; fail(`L${i + 1}: 裸 writeSettings(s) 后面直接回 ok:true（写失败了界面也不知道）`); }
  }
  if (!bare) ok('所有写设置的收尾都判了返回值（0 处哑写）');
  const callers = lines.filter((l) => /if \(!writeSettings\(s\)\) return \{ ok: false \}|return writeSettings\(s\)/.test(l)).length;
  ok(`已接住返回值的写点：${callers} 处`);
}

console.log('\n== ③ 崩溃取证的密钥脱敏：源码必须覆盖各形状 ==');
for (const [what, re] of [
  ['sk-（DeepSeek/OpenAI/Anthropic/OpenRouter…）', /\(sk-\[A-Za-z0-9_\\-\]\{6,\}\)\/g/],
  ['AIza…（Google）', /AIza\[0-9A-Za-z_\\-\]\{10,\}/],
  ['hf_…（HuggingFace）', /hf_\[A-Za-z0-9\]\{6,\}/],
  ['gsk_…（Groq）', /gsk_\[A-Za-z0-9\]\{6,\}/],
  ['xai-…（xAI）', /xai-\[A-Za-z0-9\]\{6,\}/],
  ['ghp_…（GitHub）', /ghp_\[A-Za-z0-9\]\{6,\}/],
  ['带标签的赋值形态（api_key: / token=）', /api\[\_-\]\?key\|apikey\|access\[\_-\]\?token\|auth\[\_-\]\?token\|token/],
  ['secret: …', /secret\\s\*:\\s\*/],
]) {
  if (re.test(t)) ok('脱敏含 ' + what);
  else fail('脱敏缺 ' + what + ' ⇒ 这类密钥会原样进 host-crash.json（而那份是用户回传的）');
}

console.log('\n== ④ 抠出 redactForCrash 真跑（源码看着对 ≠ 真遮得住）==');
{
  const fn = (t.match(/function redactForCrash\(s\) \{[\s\S]*?\n\}/) || [])[0];
  if (!fn) fail('抠不出 redactForCrash()（改名了？判据要重新确认）');
  else {
    // eslint-disable-next-line no-new-func
    const f = new Function('return ' + fn)();
    const samples = [
      ['deepseek', 'auth failed with key sk-abcdef1234567890 tail'],
      ['google', 'error: AIzaSyD-1234567890abcdefghijklmnop not valid'],
      ['hf', 'token hf_AbCdEf123456 rejected'],
      ['groq', 'using gsk_ABC123def456ghi789'],
      ['xai', 'xai-1234567890abcdef unexpected'],
      ['github', 'ghp_ABCDEFGH1234567890 leaked'],
      ['labeled', 'DEEPSEEK_API_KEY=sk-proj-xyz9876543210'],
      ['secret', 'secret: hunter2hunter2'],
    ];
    const LEAK = /(sk-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{10,}|hf_[A-Za-z0-9]{6,}|gsk_[A-Za-z0-9]{6,}|xai-[A-Za-z0-9]{6,}|ghp_[A-Za-z0-9]{6,})/;
    for (const [name, line] of samples) {
      const out = f(line);
      if (LEAK.test(out)) fail(`${name} 没遮住：${out.slice(0, 90)}`);
      else ok(`${name} 已遮：${out.slice(0, 70)}`);
    }
    const keep = f('normal line: model=deepseek-flash, 47 tools, path C:\\x\\y.js');
    if (/model=deepseek-flash/.test(keep) && /47 tools/.test(keep)) ok('不误伤普通诊断行（模型名/工具数/路径都保留）');
    else fail('把普通诊断行也改掉了（会毁掉排障信息）：' + keep);
  }
}

console.log('\n== ⑤ 首次填 key 的失败必须吵（§11 的教训）==');
if (/console\.error\('\[akdagent\] 保存 API key 失败/.test(t)) ok('失败打日志');
else fail('akdagent-key-save 的失败没打日志');
if (/dialog\.showErrorBox\('AKDAgent 保存 API Key 失败'/.test(t)) ok('失败弹原生错误框（用户当场知道）');
else fail('失败不弹框 ⇒ 用户以为存好了（§11 那类"界面上明明配好了"）');
{
  // 失败分支里**不许** close 窗口：截取 catch 块，看它有没有 close
  const m = t.match(/ipcMain\.on\('akdagent-key-save'[\s\S]*?\n\}\)/);
  const catchBlk = m ? (m[0].match(/catch \(e\) \{[\s\S]*?\n  \}/) || [''])[0] : '';
  if (!catchBlk) fail('抠不出 akdagent-key-save 的 catch 块');
  else if (/keyPromptWin\.close\(\)/.test(catchBlk)) fail('失败分支里把窗口关了 ⇒ 用户以为保存成功');
  else ok('失败分支不关窗（用户能重试）');
}

console.log('\n== ⑥ 凭据名/写入必须校验并如实回报 ==');
if (/if \(!CRED_REF_RE\.test\(env\)\)/.test(t)) ok('set-provider-key 校验凭据名（非法名会让宿主 boot 失败）');
else fail('set-provider-key 不校验凭据名');
if (/return \{ ok: false, error: '写入凭据失败：'/.test(t)) ok('写凭据异常时如实回报 ok:false（不再冒到渲染层）');
else fail('写凭据异常没被接住 ⇒ 用户以为存好了');
if (/if \(!writeFileAtomic\(OWNED_CREDENTIALS_PATH/.test(t)) ok('凭据落盘失败会抛（交给 IPC 回报）');
else fail('凭据落盘失败没被检查');

console.log('\n== ⑦ 密钥"像不像密钥"要给**非阻塞**提示（2026-10-05，用户裁「7 做」）==');
/* 起因：判"已配置"的只有 `docHasApiKey`（非空串就算）⇒ 本机 `ANTHROPIC_API_KEY` 的值只有 6 个字符，
 *   界面照样显示"已配置"，用户要到 401 才发现。但**绝不能硬拒**（自定义提供方的 key 形状无法穷举）。 */
{
  if (/function keyShapeWarning\(name, value\)/.test(t)) ok('keyShapeWarning() 存在');
  else fail('没有密钥形状判据 ⇒ 6 个字符的占位串也会显示"已配置"');
  if (/const KEY_PREFIX_HINTS = \{/.test(t)) ok('有常见前缀表（用于"格式不符"提示）');
  else fail('没有前缀表');
  for (const [what, re] of [
    ['sk-ant-（Anthropic）', /ANTHROPIC_API_KEY: \/\^sk-ant-\//],
    ['AIza（Google）', /GOOGLE_API_KEY: \/\^AIza\//],
    ['gsk_（Groq）', /GROQ_API_KEY: \/\^gsk_\//],
    ['xai-（xAI）', /XAI_API_KEY: \/\^xai-\//],
  ]) {
    if (re.test(t)) ok('前缀表含 ' + what);
    else fail('前缀表缺 ' + what);
  }
  // Locked DSH writes return the submitted value's presence after success;
  // both storage implementations must retain the existing shape warning.
  if (/return \{ ok: true, apiKeyEnv: env, configured: !!(?:getCred\(creds, env\)|v), warn \}/.test(t)) ok('写密钥时把 warn 回给界面');
  else fail('set-provider-key 没有回传 warn ⇒ 界面无从提示');
  // 抠出来真跑（i18n 用桩：把 key 名原样回显，便于断言命中哪一条）
  const hintsSrc = (t.match(/const KEY_PREFIX_HINTS = \{[\s\S]*?\n\}/) || [])[0];
  const fnSrc = (t.match(/function keyShapeWarning\(name, value\) \{[\s\S]*?\n\}/) || [])[0];
  if (!hintsSrc || !fnSrc) fail('抠不出 KEY_PREFIX_HINTS / keyShapeWarning');
  else {
    const stub = { t: (k, ...a) => k + (a.length ? ':' + a.join(',') : '') };
    /* ⚠️ 前缀表要**单独求值**再当参数传进去 —— 若把 `const KEY_PREFIX_HINTS = …` 连同函数一起塞进
     *   函数体，就会和同名形参撞车（"Identifier … has already been declared"）。 */
    // eslint-disable-next-line no-new-func
    const hints = new Function('return ' + hintsSrc.slice(hintsSrc.indexOf('{')))();
    // eslint-disable-next-line no-new-func
    const f = new Function('i18n', 'KEY_PREFIX_HINTS', fnSrc + '\nreturn keyShapeWarning')(stub, hints);
    const cases = [
      ['sk-' + 'a'.repeat(40), '', '正常 DeepSeek key ⇒ 不提示'],
      ['sk-ant-' + 'b'.repeat(50), '', '正常 Anthropic key ⇒ 不提示'],
      ['abc123', 'main.key.warnTooShort:6', '6 个字符（本机实况）⇒ 提示太短'],
      ['sk-' + 'a'.repeat(30) + ' b', 'main.key.warnWhitespace', '含空格 ⇒ 提示'],
      ['"sk-' + 'a'.repeat(30) + '"', 'main.key.warnQuotes', '带引号 ⇒ 提示'],
      ['AIza' + 'c'.repeat(30), 'main.key.warnPrefix:ANTHROPIC_API_KEY', 'Google 的 key 填进 Anthropic ⇒ 提示格式不符'],
    ];
    let wrong = 0;
    for (const [val, wantPrefix, label] of cases) {
      const name = label.includes('Anthropic') ? 'ANTHROPIC_API_KEY' : 'DEEPSEEK_API_KEY';
      const got = String(f(name, val) || '');
      const hit = wantPrefix === '' ? got === '' : got.startsWith(wantPrefix);
      if (!hit) { wrong++; fail(`形状提示不符：${label} ⇒ got=${JSON.stringify(got)} want=${JSON.stringify(wantPrefix)}`); }
    }
    if (!wrong) ok(`形状判据样本全对（${cases.length} 条：正常 key 不打扰 · 太短/空格/引号/前缀不符各有提示）`);
  }
  const st = path.join(ROOT, 'electron', 'src', 'settings.html');
  const s = fs.existsSync(st) ? fs.readFileSync(st, 'utf8') : '';
  if (/keyWarnEl\.textContent = \(r && r\.warn\)/.test(s)) ok('设置页把 warn 显示成一行（**不弹窗打断**）');
  else fail('设置页没用 r.warn ⇒ 后端提示了但用户看不见');
}

console.log(bad ? `\n❌ ${bad} 项不通过` : '\n✅ 密钥与设置写入安全（不哑失败 · 不外泄）');
process.exit(bad ? 1 : 0);
