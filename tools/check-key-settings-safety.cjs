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
/* ⚠️ 2026-10-07：这里**允许可选第三参** —— settings 现在也显式写 `{ mode: 0o600 }`
 *   （mac 那个 P0 的连带加固；判据不变：结果必须被 `const wrote = …` 接住）。 */
if (/const wrote = writeFileAtomic\(OWNED_SETTINGS_PATH, out(?:,[^)]*)?\)/.test(t)) ok('把 writeFileAtomic 的结果接住了（const wrote = …）');
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

console.log('\n== ③b 日志落盘也要脱敏（2026-10-07 补的洞：logTail 与"把 akdagent.log 发来"都会把日志交出去）==');
{
  /* 这一轮把日志尾部写进了用户回传的 `host-crash.json`（`logTail`），排障说明也让用户直接把
   * `akdagent.log` 发来 ⇒ 日志里若有明文密钥，等于我们主动收集它。宿主 stdout 里那行
   * `dsh web: http://…/?token=…` 本身就带一个会话 token ⇒ 必须在**唯一写盘点**遮掉。 */
  if (/appendFileSync\(safeLogPath, `\$\{new Date\(\)\.toISOString\(\)\} \$\{level\} \$\{redactForCrash\(line\)\}\\n`/.test(t)) ok('写 akdagent.log 前先过 redactForCrash（唯一写盘点）');
  else fail('日志落盘没脱敏 ⇒ 用户把 akdagent.log / host-crash.json 发来时会带着明文密钥');
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
if (/if \(!env \|\| !CRED_REF_RE\.test\(env\)\)/.test(t)) ok('set-provider-key 校验凭据名（空名字/非法名都会拦，宿主 boot 不会因此失败）');
else fail('set-provider-key 不校验凭据名（或没拦空名字）');
if (/return \{ ok: false, error: '写入凭据失败：'/.test(t)) ok('写凭据异常时如实回报 ok:false（不再冒到渲染层）');
else fail('写凭据异常没被接住 ⇒ 用户以为存好了');
if (/if \(!writeFileAtomic\(OWNED_CREDENTIALS_PATH/.test(t)) ok('凭据落盘失败会抛（交给 IPC 回报）');
else fail('凭据落盘失败没被检查');

console.log('\n== ⑥b 凭据名怎么定（2026-10-07 用户报「自定义提供方保存 apikey 也显示未配置」）==');
/* 起因（两个症状，同一处代码）：
 *  ① 界面上 keyEnv 留空 ⇒ 密钥按**派生名**写进凭据库，但 profile 里**没写 apiKeyEnv**
 *     ⇒ 列表判据 `!!keyEnv && docHasApiKey(...)` 永远为假 ⇒ 卡片一直「未配置 API 密钥」；
 *  ② 卡片那条「保存」把**空** keyEnv 递给后端，而后端老代码 `keyEnv || 'DEEPSEEK_API_KEY'`
 *     ⇒ 自定义提供方的密钥被写进 **DEEPSEEK_API_KEY**（顺手覆盖用户真的 DeepSeek 密钥）。 */
{
  const htmlPath = path.join(ROOT, 'electron', 'src', 'settings.html');
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  if (/const env = keyEnv \|\| 'DEEPSEEK_API_KEY'/.test(t)) fail("后端又把空 keyEnv 默认成 DEEPSEEK_API_KEY 了 ⇒ 会写错名字并覆盖用户的 DeepSeek 密钥")
  else ok('后端不再把空 keyEnv 默认成 DeepSeek（那会覆盖用户密钥）');
  if (/function deriveKeyEnvName\(providerId\)/.test(t) && /replace\(\/\[\^A-Z0-9\]\+\/g, '_'\)/.test(t)) ok('有 deriveKeyEnvName()：把 route 清洗成合法凭据名')
  else fail('没有 deriveKeyEnvName()（route 里带 `-`/`.` 会写出宿主读不了的名字）');
  if (/function resolveKeyEnvName\(settings, providerId, keyEnv\)/.test(t)) ok('有 resolveKeyEnvName()：显式 → profile → 派生，三段兜底')
  else fail('没有 resolveKeyEnvName() ⇒ 空名字只能靠猜');
  if (/function migratePiProviderKeyEnvs\(\)/.test(t) && /migratePiProviderKeyEnvs\(\)/.test(t.replace(/function migratePiProviderKeyEnvs\(\)[\s\S]{0,2000}?\n\}/, ''))) {
    ok('有启动迁移 migratePiProviderKeyEnvs()，且**在起宿主之前**被调用（老用户不必重新保存）')
  } else fail('没有启动迁移（老用户会一直显示未配置）');
  if (/if \(repaired\) \{[\s\S]{0,220}?writeSettings\(s\)/.test(t)) ok('保存密钥时会顺手把 profile 的 apiKeyEnv 补上（self-repair）')
  else fail('profile 缺 apiKeyEnv 时不会补 ⇒ 密钥写对了宿主也读不到');
  /* 界面：派生一次、两处共用（这正是那个 bug 的修法） */
  if (/const keyEnv = rawEnv \|\| deriveKeyEnv\(route\)/.test(html) && /apiKeyEnv: keyEnv \|\| undefined/.test(html) && /setProviderKey\(route, keyEnv, key\)/.test(html)) {
    ok('自定义提供方表单：派生一次、addPiProvider 与 setProviderKey **共用同一个名字**')
  } else fail('表单里两个名字又各算各的 ⇒ 保存了也显示未配置（用户报过）');
}

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
  if (/return \{ ok: true, apiKeyEnv: env,[\s\S]{0,90}?warn \}/.test(t)) ok('写密钥时把 warn 回给界面');
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

console.log('\n== ⑧ 模型列表必须清洗后才落盘（2026-10-08：INVALID_MODEL_INFO）==');
{
  /* 现场：用户报 `INVALID_MODEL_INFO — adapter returned invalid exact model metadata for provider
   * "bailian" model "qwen3.8-max"`。根因 = 设置页「显示名称」留空 ⇒ settings.yaml 里那条模型是 `name: ""`；
   * 宿主判据是「name 必须是非空字符串」（`dsh-llm/lib/index.js:2053`），而两个适配器的兜底
   * `name: entry.name ?? … ?? entry.id` / `model.name ?? model.id` **都不兜空字符串**（`??` 只兜 null/undefined）
   * ⇒ 直接硬拒。**2026-10-08 复核补的第三条**：`llm-deepseek` 那条自定义列表（`akdagent-add-model`）
   * 是同一类坑（只输空格的名字会被写成空串）⇒ 所以清洗必须服务**三条**路径。
   * **2026-10-08 同一天的第四处（另一个键）**：界面勾的「支持图片」以前落成我们自己的 `supportsImage`
   * （DeepSeek 那条路还转手写成 `input`），而**两家适配器读的键名不同**：
   * DeepSeek ⇒ `inputModalities`（`dsh-llm-deepseek/lib/index.js:1504/1620`、schema `:1879`）、
   * pi-ai ⇒ `input`（`dsh-llm-pi-ai/lib/index.js:682/973/1845`）；`supportsImage` 整个宿主树没人读
   * ⇒ 勾选框静默无效。现在清洗函数按路由把键翻译过去（见 `model-list.js` 顶部）。 */
  const PM = path.join(ROOT, 'electron', 'src', 'model-list.js')
  if (!fs.existsSync(PM)) fail('缺少 electron/src/model-list.js（模型列表清洗）')
  else {
    const pm = fs.readFileSync(PM, 'utf8')
    if (/function sanitizeModelList\(input, opts\)/.test(pm) && /next\.name\s*=\s*id/.test(pm)) ok('sanitizeModelList()：空/缺省 name ⇒ 用模型 ID');
    else fail('sanitizeModelList 没有"空 name ⇒ 用 id"这条（那正是宿主硬拒的那一条）')
    if (/delete next\[k\]/.test(pm) && /positiveInt/.test(pm)) ok('非正整数的 contextWindow / maxTokens ⇒ 删键（防 INVALID_MODEL_CONTEXT / _MAX_TOKENS）');
    else fail('没有删非法数值键 ⇒ 宿主会抛另外两个错')
    if (/丢掉一个没有 id 的模型条目/.test(pm)) ok('没有合法 id 的条目直接丢掉（不写宿主读不了的）');
    else fail('没有丢掉无 id 条目')
    /* 图片键：必须按路由翻译，且两个键名都在（写反了就是静默无效） */
    if (/IMAGE_KEYS\s*=\s*\{\s*input:\s*'inputModalities',\s*inputModalities:\s*'input'\s*\}/.test(pm)) ok('图片键对照表在（DeepSeek = inputModalities / pi-ai = input）');
    else fail('缺少图片键对照表 ⇒ 无法按路由翻译（勾选框会静默无效）')
    if (/next\[imageKey\] = next\.supportsImage \? \['text', 'image'\] : \['text'\]/.test(pm) && /delete next\.supportsImage/.test(pm)) ok('supportsImage（我们界面的键）⇒ 翻译成宿主读的键，且自己绝不落盘');
    else fail('supportsImage 没有被翻译/清理 ⇒ 死键会写进 settings.yaml')
    if (/已改写成 \$\{imageKey\}/.test(pm)) ok('老版本写下的另一家的键 ⇒ 迁移并记账');

    const mj = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'main.js'), 'utf8')
    if (/const \{ sanitizeModelList \} = require\('\.\/model-list\.js'\)/.test(mj)) ok('main.js 引入了清洗函数');
    else fail('main.js 没引入清洗函数')
    /* 只数**真调用**（`= sanitizeModelList(`），注释里的示例写法不算 —— 否则删掉一条路也看不出来 */
    const uses = (mj.match(/= sanitizeModelList\(/g) || []).length
    if (uses === 3) ok(`三条写模型的路各调用一次清洗（${uses} 处）`);
    else fail(`sanitizeModelList 真调用 ${uses} 次（应为 3：pi-ai 覆写 / pi-ai 专用 / llm-deepseek）⇒ 有路径没被清洗`)
    if (/sanitizeModelList\(models, \{ imageKey: 'input' \}\)/.test(mj)
      && /sanitizeModelList\(v, \{ imageKey: 'input' \}\)/.test(mj)
      && /sanitizeModelList\(\[entry\], \{ imageKey: 'inputModalities' \}\)/.test(mj)) ok('三条路径都清洗，并各自带上**该路由真正读的**图片键名');
    else fail('三条路径没清洗齐，或图片键名带错（DeepSeek 是 inputModalities、pi-ai 是 input）')
    if (!/entry\.input\s*=/.test(mj)) ok('DeepSeek 那条路不再写 `input`（老代码把它当图片键，宿主读的是 inputModalities）');
    else fail('main.js 还在往 DeepSeek 条目里写 `input` ⇒ 勾选框无效')

    const html = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'settings.html'), 'utf8')
    if (/name: nameIn\.value\.trim\(\) \|\| id/.test(html)) ok('界面：显示名留空 ⇒ 用模型 ID（不再写 name: ""）');
    else fail('界面还是原样写 name（留空 = 空串 = 宿主硬拒）')
    const i18n = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'i18n', 'settings.json'), 'utf8')
    const ph = (i18n.match(/留空 = 用模型 ID|blank = model ID|空欄 = モデル ID/g) || []).length
    if (ph === 4) ok('四语种的「显示名称」占位符都写清了"留空 = 用模型 ID"');
    else fail(`占位符只有 ${ph}/4 处说明"留空 = 用模型 ID" ⇒ 用户看不出留空会怎样`)

    const TEST = path.join(ROOT, 'tools', 'test-model-list.cjs')
    if (fs.existsSync(TEST) && /qwen3\.8-max/.test(fs.readFileSync(TEST, 'utf8'))) ok('有单测 tools/test-model-list.cjs（含用户那个原始现场）');
    else fail('缺少模型清洗的单测')
  }
}

console.log('\n== ⑨ 写进 settings.yaml 的**值**也必须过宿主的判据（2026-10-08：闭集值不许自由填）==');
{
  /* 两处同源事故：界面能写出的值，落在宿主**闭集 schema** 之外 ⇒ 轻则每次调用报错、重则整插件失效。
   *   ① `agent-default-model.reasoningEffort`：宿主要按**模型自报的** `reasoning.efforts` 校验
   *      （`dsh-llm/lib/index.js:2119-2124`），不在表里抛 UNSUPPORTED_REASONING_EFFORT；
   *      DeepSeek 全部模型 = `off/low/high/max`（`dsh-llm-deepseek/lib/index.js:1417-1437`）
   *      ⇒ 旧界面写死的「中」必然失败、而「关/最高」给不出来。
   *   ② `llm-pi-ai.providers.<route>.api`：schema 是 `z.union([...])`
   *      （`dsh-llm-pi-ai/lib/index.js:986`，`supportedProtocols()` 实测三个）
   *      ⇒ 自由文本框打错一个字，**整个 llm-pi-ai 配置**校验失败（订阅登录的路由一起挂）。 */
  const html = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'settings.html'), 'utf8')
  const mj = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'main.js'), 'utf8')

  const effSel = (html.match(/<select id="effort-select">[\s\S]*?<\/select>/) || [''])[0]
  if (effSel !== '' && !/<option/.test(effSel))
    ok('推理等级下拉**不写死**选项（按模型自报的档位铺）');
  else fail('推理等级下拉仍写死了选项（DeepSeek 不支持 medium ⇒ 选「中」必报 UNSUPPORTED_REASONING_EFFORT）')
  if (/entry\.reasoning\.efforts/.test(html)) ok('档位取自宿主目录的 `reasoning.efforts`（不是我们猜的表）');
  else fail('没读宿主自报的档位表')
  if (/add\('', I\.t\('settings\.conv\.effortFollowProvider'\)\)/.test(html) && /delete adm\.reasoningEffort/.test(mj))
    ok('「跟随提供方默认」这条闭环（界面给空值 ⇒ 主进程删键）');
  else fail('「跟随提供方默认」不闭环（写空串会被宿主办成"显式空档位"）')
  if (/if \(value && ids\.indexOf\(value\) < 0\) add\(value, effortLabel\(value\)/.test(html))
    ok('已存的值不在支持表里 ⇒ 照样列出来（不静默改写用户的选择）');
  else fail('已存的不受支持的值被静默丢掉了')
  if ((mj.match(/reasoningEffort: adm\.reasoningEffort \|\| 'high'/g) || []).length === 0)
    ok('不再把"没选"伪造成 high（那会让界面分不清"跟随默认"与"选了高"）');
  else fail('仍在伪造 high')

  if (/const PI_API_PROTOCOLS = \['openai-completions', 'openai-responses', 'anthropic-messages'\]/.test(html))
    ok('API 协议真值表在（三值，与宿主 supportedProtocols() 一致）');
  else fail('缺少 API 协议真值表 ⇒ 又会退回自由文本')
  const protoLiterals = (html.match(/'openai-completions'|'openai-responses'|'anthropic-messages'/g) || []).length
  if (protoLiterals <= 3) ok(`三个协议名只在真值表里出现（共 ${protoLiterals} 处，不再是散落的 placeholder 文本）`);
  else fail(`协议名散落在 ${protoLiterals} 处 ⇒ 真值表不止一处，改一处漏一处`)
  if (/<select id="custom-api"><\/select>/.test(html) && /fillSelect\(\$?\('?custom-api'?\)?, PI_API_PROTOCOLS/.test(html))
    ok('自定义提供方的 api 是闭集下拉');
  else fail('自定义提供方的 api 还是自由文本框（打错一个字 = 整个 llm-pi-ai 配置失效）')
  if (!/apiIn = mk\('settings\.model\.overrideApi'/.test(html) && /fillSelect\(sel, PI_API_PROTOCOLS, p\.api \|\| ''/.test(html))
    ok('覆写那一行的 api 也是闭集下拉（空值 = 不覆写）');
  else fail('覆写那一行的 api 还是自由文本框')
  if (/if \(selected && values\.indexOf\(selected\) < 0\) add\(selected, I\.t\('settings\.model\.overrideApiKeep'/.test(html))
    ok('提供方当前的协议若不在已知三值里 ⇒ 保留为选项（不偷偷改写）');
  else fail('当前协议会被静默丢掉 ⇒ 保存一次就把别人的协议改了')
}

console.log(bad ? `\n❌ ${bad} 项不通过` : '\n✅ 密钥与设置写入安全（不哑失败 · 不外泄）');
process.exit(bad ? 1 : 0);
