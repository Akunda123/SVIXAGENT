#!/usr/bin/env node
/**
 * 设置页「模型增删」回归（2026-09-20）
 *
 * 背景：用户问「设置里的模型配置能跟 dsh 一样能设置具体模型吗」→ 查出来的是：
 *   · 后端 `addModel` / `removeModel` / `setDefaultModel` **三个 IPC 全都实现了**，
 *     但在 `settings.html` 里**一个都没被调用**（全仓 0 处引用）⇒ 界面上根本改不了模型列表。
 *   · 且旧代码在模型列表为空时会**造一个 `{ id: <提供方 id> }` 的假模型**（界面显示成
 *     「deepseek-official（默认）」）⇒ 选中保存会把 `agent-default-model.model` 写成提供方 id；
 *     而 DSH 对**不在目录里的 id 是透传**的（`dsh-llm-deepseek/lib/index.js:550`）⇒ 请求必然 400。
 * 本测试用**源码级断言**钉住这两条，防止再退回。
 *
 * 用法：`node tools/test-settings-model-ui.cjs [settings.html 路径]`
 *   （可选参数只为**负向自测**：拿改坏的副本跑，确认断言会红）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'electron', 'src');
const HTML = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SRC, 'settings.html');
const PRELOAD = path.join(SRC, 'settings-preload.js');
/* ⚠️ main.js 也支持传一份改坏的副本（反向验证用）——**必须由 node 读写**：
 *   2026-10-03 我用 PowerShell `Get-Content -Raw`（没带 -Encoding UTF8）备份 main.js，
 *   PS 5.1 按 cp936 解 UTF-8 ⇒ 写回去把全文中文变成乱码、`node --check` 直接语法错。
 *   ⇒ 反向验证请走：node -e "…fs.readFileSync(p,'utf8').replace(…)…" 生成副本，再用本参数指它。 */
const MAIN = process.argv[3] ? path.resolve(process.argv[3]) : path.join(SRC, 'main.js');
const I18N = path.join(SRC, 'i18n', 'settings.json');

let fails = 0;
const ok = (c, m, extra) => {
  console.log((c ? '  [ok]   ' : '  [FAIL] ') + m + (extra && !c ? '  ← ' + extra : ''));
  if (!c) fails += 1;
};

for (const f of [HTML, PRELOAD, MAIN, I18N]) {
  if (!fs.existsSync(f)) { console.error('❌ 缺文件：' + f); process.exit(2); }
}
const html = fs.readFileSync(HTML, 'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const main = fs.readFileSync(MAIN, 'utf8');
const i18n = JSON.parse(fs.readFileSync(I18N, 'utf8'));
const locales = Object.keys(i18n);

console.log('A. 接线（设置页真的能增删模型）');
ok(/window\.svsettings\.addModel\(/.test(html), 'settings.html 调用了 addModel');
ok(/window\.svsettings\.removeModel\(/.test(html), 'settings.html 调用了 removeModel');
ok(/addModel:\s*\(m\)\s*=>\s*ipcRenderer\.invoke\('akdagent-add-model'/.test(preload),
  'preload 暴露 addModel → akdagent-add-model');
ok(/removeModel:\s*\(id\)\s*=>\s*ipcRenderer\.invoke\('akdagent-remove-model'/.test(preload),
  'preload 暴露 removeModel → akdagent-remove-model');
ok(/ipcMain\.handle\('akdagent-add-model'/.test(main) && /ipcMain\.handle\('akdagent-remove-model'/.test(main),
  '主进程两个 handler 都在');
/* 增删对**两种 kind 都开放**（2026-09-25 用户选 B），但**去向不同**：
 *   deepseek ⇒ addModel/removeModel（写 `llm-deepseek.models`）
 *   pi-ai    ⇒ setPiProviderFields(p.id, { models })（覆写提供方内建目录；空数组 = 删键回内建）
 * ⚠️ 2026-09-30 更正：本行原断言 `const canEdit = p.kind === 'deepseek'` —— 那是 09-20 的旧口径，
 *   09-25 改成"两种都能编辑"后**这里忘了同步** ⇒ 这条守卫一直红（改代码时守卫也要跟着改）。
 *   现按现行实现重写：不只钉"都开放"，还钉"各走各的去向"（比原来更严）。 */
ok(!/canEdit = p\.kind === 'deepseek'/.test(html) && /const isPiAi = p\.kind === 'pi-ai'/.test(html),
  '增删不再只对 deepseek 开放（canEdit 无条件 · isPiAi 分流）');
/* 计数断言（≥2）：**增**与**删**两条路都必须落在 setPiProviderFields 上 ——
   只钉一处会被"另一处写回 llm-deepseek"漏掉（反向验证时正是这么发现的）。 */
{
  const n = (html.match(/if \(isPiAi\) \{[\s\S]{0,200}?setPiProviderFields\(p\.id, \{ models/g) || []).length;
  ok(n >= 2, `pi-ai 的「增」与「删」都走 setPiProviderFields（命中 ${n} 处，要求 ≥2）`);
}

console.log('\nB. 空列表不再造假模型（真 bug）');
ok(!/\{ id: p\.id, name: p\.id \+ I\.t\('settings\.model\.defaultSuffix'\) \}/.test(html),
  '⚠️ 回归：不再造 `{ id: <提供方 id> }` 的假模型（会把 model 写成提供方 id ⇒ API 400）');
ok(/selectedModel \|\| undefined/.test(html),
  '★ 保存时 `selectedModel || undefined`（列表为空 ⇒ 只切提供方、不碰 model 字段）');
ok(/settings\.model\.emptyHintBuiltin/.test(html),
  '空列表时给"用内置目录"的提示（而不是空着/假条目）');

console.log('\nB2. 开机"默认模型可用吗"的判据（2026-10-03 修残留）');
/* 真事故：客户端日志里每次启动都有一条
 *   ⚠ 默认模型不可用：默认模型「deepseek-flash」不在模型列表里（可能已被删掉）
 * 而 `llm-deepseek.models` 为空正是**正常状态**（空 ⇒ 宿主用运行时内置目录，产品文案自己就这么写）。
 * 旧判据 `Array.isArray(dsModels) && dsModels.some(...)` 把空列表判成"模型不在列表里"⇒ 误报 + 弹悬浮球。
 * 判据分两层：① 源码级（旧写法不许回来）② **把函数抠出来真跑**（4 种场景，避免又一次"看错语义"）。 */
ok(!/ok = Array\.isArray\(dsModels\) && dsModels\.some/.test(main),
  '旧判据（空列表 ⇒ 判失败）已不存在');
{
  const fnSrc = (main.match(/function checkAgentModelConfigured\(\)[\s\S]*?\n\}/) || [])[0];
  if (!fnSrc) {
    ok(false, '抠不出 checkAgentModelConfigured()（改名了？判据要重新确认）');
  } else {
    // eslint-disable-next-line no-new-func
    const build = new Function('readSettings', 'i18n', 'notifyOrb',
      fnSrc.replace('function checkAgentModelConfigured()', 'return function checkAgentModelConfigured()'));
    const i18nStub = { t: (k, ...a) => k + (a.length ? ':' + a.join(',') : '') };
    const quiet = { log: () => {} };
    const cases = [
      [{ 'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash' }, 'llm-deepseek': {} },
        true, '空的自定义列表 + 内置模型 id ⇒ 通过（本次修的残留：以前这里误报）'],
      [{ 'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash' }, 'llm-deepseek': { models: [{ id: 'custom-1' }] } },
        false, '配了自定义列表且列表里没有它 ⇒ 报警'],
      [{ 'agent-default-model': { provider: 'deepseek-official', model: 'custom-1' }, 'llm-deepseek': { models: [{ id: 'custom-1' }] } },
        true, '配了自定义列表且列表里有它 ⇒ 通过'],
      [{ 'agent-default-model': {} }, false, '没选默认模型 ⇒ 报警'],
      [{ 'agent-default-model': { provider: 'my-route', model: 'm1' }, 'llm-pi-ai': { providers: { 'my-route': { models: [{ id: 'm1' }] } } } },
        true, 'pi-ai 路由：模型在提供方列表里 ⇒ 通过'],
      /* 🆕 2026-10-05：**pi-ai 同一个坑**（上次只修了 deepseek）——
       *   `providers.<route>.models` 空 = 删键回**提供方内建目录**（settings.html 自己的注释与提示都这么写），
       *   旧判据却要求必须命中 p.models ⇒ 用户把列表删光后每次启动都误报。
       *   规则已对齐 deepseek：提供方在 + 没配自定义列表 ⇒ 不判。 */
      [{ 'agent-default-model': { provider: 'my-route', model: 'gpt-4o' }, 'llm-pi-ai': { providers: { 'my-route': { displayName: 'OpenAI' } } } },
        true, 'pi-ai 路由：**没配自定义模型列表**（用提供方内建目录）⇒ 通过（本次修的残留）'],
      [{ 'agent-default-model': { provider: 'my-route', model: 'gpt-4o' }, 'llm-pi-ai': { providers: { 'my-route': { models: [] } } } },
        true, 'pi-ai 路由：列表被删空（= 回内建）⇒ 通过'],
      [{ 'agent-default-model': { provider: 'not-configured', model: 'm1' }, 'llm-pi-ai': { providers: {} } },
        false, 'pi-ai 路由**整个没配** ⇒ 仍然报（这才是真的没配）'],
    ];
    for (const [settings, want, label] of cases) {
      let got = null;
      try {
        const f = build(() => settings, i18nStub, () => {}, quiet);
        got = f();
      } catch (e) { got = 'threw: ' + e.message; }
      ok(got === want, label + `（实际 ${JSON.stringify(got)}）`);
    }
  }
}

console.log('\nC. 后端语义（supportsImage / 删默认后的兜底）');
ok(/supportsImage\) entry\.input = \['text', 'image'\]/.test(main),
  "addModel 的 supportsImage ⇒ input: ['text','image']（图片输入必须靠它）");
ok(/if \(adm\.model === id\) \{[\s\S]{0,120}adm\.model = models\.length > 0 \? models\[0\]\.id : ''/.test(main),
  'removeModel 删掉的若是当前默认 ⇒ 自动切到列表第一条（或置空）');

console.log('\nD. i18n（四语种齐全）');
const NEED = ['settings.model.addModel', 'settings.model.modelIdPh', 'settings.model.modelNamePh',
  'settings.model.modelDescPh', 'settings.model.modelImage', 'settings.model.removeModel',
  'settings.model.removeConfirm', 'settings.model.emptyHintBuiltin', 'settings.model.emptyHint'];
ok(locales.length === 4, '四种语种都在（' + locales.join(' / ') + '）');
for (const k of NEED) {
  const lack = locales.filter((l) => !i18n[l] || i18n[l][k] === undefined);
  ok(lack.length === 0, '键 ' + k + ' 四语种齐全', lack.join(','));
}
const sizes = locales.map((l) => Object.keys(i18n[l]).length);
ok(new Set(sizes).size === 1, '四语种键数一致（' + sizes.join(' / ') + '）');
// settings.html 里用到的 settings.* 键都得存在（防拼错）
const used = [...html.matchAll(/['"](settings\.[A-Za-z0-9_.]+)['"]/g)].map((m) => m[1]);
const unknown = [...new Set(used)].filter((k) => i18n[locales[0]][k] === undefined);
ok(unknown.length === 0, 'settings.html 用到的 settings.* 键都在字典里', unknown.join(','));

console.log('\nE. 【2026-10-05】模型目录 + **本会话模型**（用户裁「4 做」「5 做」）');
/* 起因：设置里的「默认模型」**只对没有会话级选择的 Agent 生效**（宿主原话见 main.js 注释），
 * 而客户端此前既看不到"这次会话实际用哪个模型"、也不能切（`session/selectModel` 一次都没调过）。
 * 本轮接上宿主的三个真端点：`session/modelCatalog`（目录）· `session/list` 的 `modelSelection`（读）·
 * `session/selectModel`（切）。判据：后端在 · 两个 preload 都暴露 · 两个界面都接 · 文案四语齐 · 有防御。 */
{
  const PRE = fs.readFileSync(path.join(SRC, 'settings-preload.js'), 'utf8');
  const ORB_PRE = fs.readFileSync(path.join(SRC, 'orb-preload.js'), 'utf8');
  const ORB = fs.readFileSync(path.join(SRC, 'orb.html'), 'utf8');
  const i18nDir = path.join(SRC, 'i18n');
  const readDict = (f) => { try { return JSON.parse(fs.readFileSync(path.join(i18nDir, f), 'utf8')); } catch { return {}; } };
  const common = readDict('common.json');
  const orbDict = readDict('orb.json');
  const LOC = ['zh-Hans', 'zh-Hant', 'en', 'ja'];

  // ① 后端：三个 IPC + 真端点名（端点名写错 = 静默失败）
  ok(/ipcMain\.handle\('akdagent-model-catalog'/.test(main) && /dshCall\('session\/modelCatalog'/.test(main),
    'model-catalog IPC 调的是宿主的 session/modelCatalog');
  ok(/ipcMain\.handle\('akdagent-session-model'/.test(main) && /dshCall\('session\/list'/.test(main) && /modelSelection/.test(main),
    'session-model IPC 从 session/list 的 projections…modelSelection 读');
  ok(/ipcMain\.handle\('akdagent-select-session-model'/.test(main) && /dshCall\('session\/selectModel'/.test(main) && /\{ request \}/.test(main),
    'select-session-model IPC 调 session/selectModel（args 形状 = {request}）');
  ok(/modelSelection/.test(main) && /ms && ms\.next/.test(main), '读的是 modelSelection.next（会话当前选择）');
  ok(/lastUsed/.test(main), '连 lastUsed 一起带上（"上一轮实际用了哪个"正是"默认没生效"的证据）');

  // ② 两个 preload 都暴露（少一边就有一边永远看不到模型）
  for (const [who, src] of [['settings-preload', PRE], ['orb-preload', ORB_PRE]]) {
    const miss = ['getModelCatalog', 'getSessionModel', 'selectSessionModel', 'onSessionModel']
      .filter((k) => !new RegExp(k + ':').test(src));
    ok(miss.length === 0, who + ' 暴露 4 个会话模型 API', miss.join(','));
  }

  // ③ 两个界面都接上；且**必须有防御**（宿主没起 / 别的宿主拉起时不许冒未捕获 rejection）
  ok(/id="session-model-select"/.test(html) && /getModelCatalog/.test(html) && /selectSessionModel/.test(html),
    '设置页有会话模型选择器并接了新 IPC');
  ok(/catch \{\s*\/\* ⚠️ 务必吞掉/.test(html) || /modelCatalog = null\s*\}\s*return modelCatalog/.test(html),
    '设置页目录读取有 catch（缺 IPC 的宿主下不冒 rejection）');
  ok(/#model-select/.test(ORB) && /refreshSessionModel/.test(ORB) && /getSessionModel/.test(ORB),
    '球里有会话模型选择器');
  ok(/refreshSessionModel\(\)\.catch\(/.test(ORB) && /refreshSessionModelInner/.test(ORB),
    '球的刷新是"外层 catch + 内层实现"（未捕获 rejection 挡住）');
  ok(/onSessionModel/.test(ORB) && /onSessionModel/.test(html), '两个界面都订阅了"模型已变"推送');

  // ④ settings.html 里用到的 **main.*** 键（③ 凭据来源）也得在字典里
  const usedMain = [...new Set([...html.matchAll(/['"](main\.[A-Za-z0-9_.]+)['"]/g)].map((m) => m[1]))];
  const lackMain = usedMain.filter((k) => !common[LOC[0]] || common[LOC[0]][k] === undefined);
  ok(lackMain.length === 0, `settings.html 用到的 main.* 键都在 common.json 里（${usedMain.length} 个）`, lackMain.join(','));

  // ⑤ 本轮新增文案：settings.json 5 键 + common.json(凭据来源/目录失败/密钥形状) + orb.json 6 键，四语齐
  const addSettings = ['settings.model.sessionModel', 'settings.model.sessionUnknown', 'settings.model.sessionLastUsed',
    'settings.model.sessionSwitched', 'settings.model.catalogHint', 'settings.model.recentModel'];
  const addCommon = ['main.credSource.isolated', 'main.credSource.source', 'main.credSource.unreadable',
    'main.model.catalogFailed', 'main.key.warnTooShort'];
  const addOrb = ['orb.model.label', 'orb.model.title', 'orb.model.lastUsed', 'orb.model.switching',
    'orb.model.switched', 'orb.model.switchFailed', 'orb.model.recent'];
  for (const [name, dict, keys] of [['settings.json', i18n, addSettings], ['common.json', common, addCommon], ['orb.json', orbDict, addOrb]]) {
    for (const k of keys) {
      const lack = LOC.filter((l) => !dict[l] || !String(dict[l][k] || '').trim());
      // ⚠️ ok(条件, 说明) —— 别把参数顺序写反（写反了条件成了字符串、恒真 ⇒ 假绿）
      ok(lack.length === 0, `${name} ${k} 四语齐全`, lack.join(','));
    }
  }

  /* ⑥ 【2026-10-05 截图抓到的】界面用 `textContent` 渲染 ⇒ **字典里不许出现 markdown 记号**（`**` 会字面显示）。
   *    唯一例外：`common.json` 的 `main.summary.prompt`（那是**给模型的提示词**，不是界面文案）。
   *    第一次截图就是靠"人眼看到星号"发现的 —— 这条守卫把它变成机检。 */
  {
    const UI_DICTS = [['settings.json', i18n], ['orb.json', orbDict], ['common.json', common]];
    const bad = [];
    for (const [name, dict] of UI_DICTS) {
      for (const l of LOC) {
        for (const [k, v] of Object.entries(dict[l] || {})) {
          if (typeof v !== 'string' || !v.includes('**')) continue;
          if (k === 'main.summary.prompt') continue;      // 提示词：故意带 markdown
          bad.push(`${name}/${l}/${k}`);
        }
      }
    }
    ok(bad.length === 0, 'UI 字典里没有 markdown 记号（`**` 会字面显示）', bad.slice(0, 5).join(', '));
  }

  /* ⑦ 【2026-10-05 验收补】两处"显示错值"类的修补：
   *    ① `session/list` 会把**所有 workspace** 的会话一起返回（本机三套）⇒ 必须先按 cwd 过滤，
   *       否则 `items[0]` 可能是别的 workspace 的会话；
   *    ② 没绑到本会话时要给 `fallback` 标记，界面照"最近会话"措辞显示、别冒充"本会话"；
   *    ③ 已**存在**的怪密钥（如本机 6 字符的 ANTHROPIC_API_KEY）也要在卡片上提示 —— 不能只在保存时提示。 */
  ok(/resolveDshRoot\(\)/.test(main) && /x\.cwd/.test(main) && /sameWs/.test(main),
    '会话读取按 workspace(cwd) 过滤（session/list 会跨 workspace 返回）');
  ok(/fallback: !\(exact && exact\.sessionId === want\)/.test(main), '没绑到本会话时给 fallback 标记');
  ok(/settings\.model\.recentModel/.test(html), '设置页在 fallback 时改用"最近会话"措辞');
  ok(/orb\.model\.recent/.test(ORB), '球在 fallback 时标一句"最近会话"');
  ok(/keyWarn: keyShapeWarning\(/.test(main), 'getProviders 对**已存在**的密钥也给形状提示');
  ok(/keyWarn: keyEnv \? keyShapeWarning/.test(main), 'pi-ai 提供方同样给 keyWarn');
  ok(/p\.keyWarn/.test(html), '设置页把 keyWarn 显示在卡片上（以前只在保存那一刻提示）');
  ok(!/keyWarn:[^,}]*getCred\([^)]*\)\s*[,}]/.test(main.replace(/keyShapeWarning\(/g, 'SHAPE(')),
    'keyWarn 只回**提示文本**，不回密钥值');
}

console.log('\nF. 【2026-10-05 报障】模型 ID 的"显示名"护栏（实证：`but you passed DeepSeek-V4.1-Flash`）');
/* 起因（用户回传的 `last-turn-error.json`）：`{code:'INVALID_REQUEST',status:400,message:'The supported
 * API model names are deepseek-flash, deepseek-v4-pro, but you passed DeepSeek-V4.1-Flash.'}` ——
 * 宿主目录里 `id:"deepseek-flash"` 的 **name** 是 `DeepSeek-V41-Flash`（跟 id 毫不相似），
 * 而 1.0.3 的设置页看不到目录、只能手打 ⇒ 用户照着显示名填就**每轮 400**。
 * 判据：比较函数在（忽略大小写/标点）· 命中后只改**输入框**（不静默写工程）· 文案四语非空。 */
{
  const html2 = fs.readFileSync(path.join(SRC, 'settings.html'), 'utf8');
  const i18nDir = path.join(SRC, 'i18n');
  const settingsDict = JSON.parse(fs.readFileSync(path.join(i18nDir, 'settings.json'), 'utf8'));
  const LOC = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
  ok(/function normalizeModelKey\(s\)/.test(html2), 'normalizeModelKey() 在（忽略大小写与标点）');
  ok(/function suggestModelIdFix\(providerId, typed\)/.test(html2), 'suggestModelIdFix() 在（拿宿主目录比显示名）');
  ok(/normalizeModelKey\(m\.name\) === k/.test(html2), '比对的是目录模型的 **name**（显示名 → 真 id）');
  ok(/if \(g\.models\.some\(\(m\) => m && m\.id === typed\)\) return null/.test(html2), '填的本来就是真 id ⇒ 不打扰');
  ok(/const fix = await suggestModelIdFix\(p\.id, id\)[\s\S]{0,400}?idIn\.value = fix[\s\S]{0,200}?return\s*\/\//.test(html2),
    '命中 ⇒ 只改输入框并**先不添加**（让用户看清改成什么了再点一次）');
  {
    const fixBlk = (html2.match(/if \(fix\) \{[\s\S]*?\n {10}\}/) || [])[0];
    ok(!!fixBlk, '抠得出 `if (fix) { … }` 命中分支');
    ok(fixBlk && !/svsettings\./.test(fixBlk), '命中分支里**没有**写工程的调用（绝不静默改数据）');
  }
  {
    const lack = LOC.filter((l) => !settingsDict[l] || !String(settingsDict[l]['settings.model.idLooksLikeName'] || '').trim());
    ok(lack.length === 0, 'settings.model.idLooksLikeName 四语非空', lack.join(','));
    const md = LOC.filter((l) => /\*\*/.test(String((settingsDict[l] || {})['settings.model.idLooksLikeName'] || '')));
    ok(md.length === 0, '该文案不含 markdown（UI 是 textContent 渲染）', md.join(','));
    const ph = LOC.filter((l) => !/\{0\}/.test(String((settingsDict[l] || {})['settings.model.idLooksLikeName'] || ''))
      || !/\{1\}/.test(String((settingsDict[l] || {})['settings.model.idLooksLikeName'] || '')));
    ok(ph.length === 0, '两个占位符 {0}/{1} 都在（否则用户看不出"改成了什么"）', ph.join(','));
  }
  /* 组合键的真值表：把两个函数抠出来跑（源码看着对 ≠ 真能命中） */
  {
    const nk = (html2.match(/function normalizeModelKey\(s\) \{[\s\S]*?\n  \}/) || [])[0];
    if (!nk) ok(false, '抠不出 normalizeModelKey');
    else {
      // eslint-disable-next-line no-new-func
      const f = new Function(nk + '\nreturn normalizeModelKey')();
      const cat = [{ id: 'deepseek-flash', name: 'DeepSeek-V41-Flash' }, { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' }];
      const k = f('DeepSeek-V4.1-Flash');
      ok(k === f(cat[0].name), '实证那两个串**同键**（DeepSeek-V4.1-Flash ≡ DeepSeek-V41-Flash）');
      ok(cat.some((m) => f(m.name) === k) && cat.find((m) => f(m.name) === k).id === 'deepseek-flash',
        '⇒ 能定位到真 id `deepseek-flash`');
      ok(f('deepseek-v4-pro') === f('DeepSeek-V4-Pro'), '大小写/连字符变体也同键');
    }
  }
}

console.log('');
if (fails) { console.log('===== 结果：' + fails + ' 项失败 ====='); process.exit(1); }
console.log('===== 结果：全部通过 =====');
