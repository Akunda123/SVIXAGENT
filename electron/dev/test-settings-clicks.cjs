/**
 * 渲染层点击测试：在真实 Chromium 里加载 src/settings.html（配桩 preload），
 * ① 记录页面脚本的 JS 错误；② 逐个 .click() 关键按钮，回读 svsettings 调用记录；
 * ③ 模拟主进程回推，断言「悬浮球」区按钮文案真的会跟着变（这才是用户看到的反馈）。
 *
 * 跑法（electron 目录下）：npx electron dev/test-settings-clicks.cjs
 * 退出码：0 = 全部通过，1 = 有失败项。
 */
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const SETTINGS_HTML = path.join(__dirname, '..', 'src', 'settings.html')
const STUB_PRELOAD = path.join(__dirname, 'test-settings-preload.cjs')
const i18n = require(path.join(__dirname, '..', 'src', 'i18n'))

// 测试里会反复建/销毁窗口：别让最后一个窗口关闭把 app 带走（否则下一次 loadFile 报 ERR_FAILED）
app.on('window-all-closed', () => {})

const pageErrors = []
const consoleErrors = []
const failures = []
const checks = []

/** 依次点击的按钮选择器（悬浮球区 + 对照用的桥检查按钮） */
const TARGETS = ['#btn-check-bridge', '#btn-autostart', '#btn-always-top', '#btn-orb-reset', '#btn-open-chat']

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) failures.push(name + (detail ? ' — ' + detail : ''))
  /* 逐条即时打印：卡住时能看出**走到哪一步**（原先只在结尾汇总，一挂就什么都看不到） */
  console.log((ok ? '  ✅ ' : '  ❌ ') + name + (ok || detail === undefined ? '' : ' → ' + detail))
}

/* ⛔ 看门狗：任何一步把流程挂住（executeJavaScript 不返回 / 未捕获的 rejection）都别让 CI 干等 10 分钟 */
const WATCHDOG_MS = 45000
setTimeout(() => {
  console.log(`\n❌ 看门狗：${WATCHDOG_MS / 1000} 秒没跑完 —— 最后到达的断言在上面。`)
  console.log(`   已完成 ${checks.length} 条，失败 ${failures.length} 条`)
  if (failures.length) console.log('失败项：\n' + failures.map((f) => ' - ' + f).join('\n'))
  app.exit(3)
}, WATCHDOG_MS).unref?.()

app.whenReady().then(async () => {
  // 桩 preload 现在也要 i18n 字典（页面文案全走 window.svi18n）
  i18n.init({ getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-clicks-')), getSystemLocale: () => 'zh-CN', getLocale: () => 'zh-CN' })
  i18n.setLocale('zh-Hans')
  ipcMain.on('akdagent-i18n-sync', (e) => { e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor('settings') } })

  const win = new BrowserWindow({
    width: 900,
    height: 800,
    show: false,
    webPreferences: {
      preload: STUB_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !/Security Warning|Content Security/.test(message)) consoleErrors.push(message)
  })
  win.webContents.on('render-process-gone', (_e, d) => {
    console.log('renderer gone: ' + JSON.stringify(d))
  })

  const js = (code) => win.webContents.executeJavaScript(code)

  await win.loadFile(SETTINGS_HTML)
  await new Promise((r) => setTimeout(r, 500))
  await js(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)))`)

  // 切到「状态」页（悬浮球区在那里）
  await js(`activatePage('status')`)
  await new Promise((r) => setTimeout(r, 300))

  /* ① 初始状态应由 getOrbState 回读驱动（桩里 autostart/alwaysOnTop 都是 true） */
  const initial = await js(`({
    autostart: document.getElementById('btn-autostart').textContent,
    alwaysTop: document.getElementById('btn-always-top').textContent,
    hasReset: !!document.getElementById('btn-orb-reset'),
    hasTip: !!document.getElementById('orb-tip'),
  })`)
  check('初始：开机自启按钮 = 已启用', initial.autostart === '已启用', initial.autostart)
  check('初始：置顶按钮 = 置顶中', initial.alwaysTop === '置顶中', initial.alwaysTop)
  check('存在「贴回右下角」按钮', initial.hasReset)
  check('存在悬浮球反馈行 #orb-tip', initial.hasTip)

  /* ② 点击是否到达 IPC */
  const results = []
  for (const sel of TARGETS) {
    const r = await js(`
      (() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { sel: ${JSON.stringify(sel)}, found: false };
        const n = () => document.querySelectorAll('[data-call]').length;
        const before = n();
        el.click();
        return { sel: ${JSON.stringify(sel)}, found: true, text: el.textContent,
                 disabled: el.disabled, reached: n() > before };
      })()
    `)
    results.push(r)
    check('点击到达 IPC：' + sel, r.found && r.reached, JSON.stringify(r))
    await new Promise((res) => setTimeout(res, 80))
  }

  /* ③ 主进程回推 → 按钮文案与反馈行必须变（旧实现的病根就在这里） */
  const emitted = await js(`window.svsettings.__emit('autostart', false)`)
  check('页面订阅了 autostart 变更', emitted === true)
  let labels = await js(`({ a: document.getElementById('btn-autostart').textContent, tip: document.getElementById('orb-tip').textContent })`)
  check('回推 autostart=false → 按钮变「启用」', labels.a === '启用', labels.a)
  check('回推 autostart=false → 有反馈文案', /已关闭开机自启/.test(labels.tip), labels.tip)

  await js(`window.svsettings.__emit('alwaysTop', false)`)
  labels = await js(`({ t: document.getElementById('btn-always-top').textContent, tip: document.getElementById('orb-tip').textContent })`)
  check('回推 alwaysTop=false → 按钮变「已取消」', labels.t === '已取消', labels.t)
  check('回推 alwaysTop=false → 有反馈文案', /已取消置顶/.test(labels.tip), labels.tip)

  await js(`window.svsettings.__emit('orbReset', true)`)
  labels = await js(`({ tip: document.getElementById('orb-tip').textContent })`)
  check('回推位置复位 → 有反馈文案', /贴回当前屏幕右下角/.test(labels.tip), labels.tip)

  /* ⑤ 🆕 2026-10-07 订阅登录：**轮询重画不许把正在输入的提问框顶掉**（用户报的 bug）
   *   病根：`running` 时每 800 ms 重读一次，而每次都快照都整段重建 DOM ⇒ 用户正在粘贴授权码，
   *   输入框每 800 ms 被换成新元素（焦点 + 已输入内容一起丢）。修法：① 指纹没变不重建
   *   ② 同一个提问的输入框复用同一元素并把焦点/光标还回去。这里用真 Chromium 钉住这两条。 */
  const authSnapshot = (o) => `window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: { ok: true, at: o.at, count: 1, flows: [{ key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', inFlight: true, methods: [{ id: 'oauth', label: '登录' }] }] },
    attempt: {
      ok: true, id: 1, key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', method: 'oauth', state: o.state || 'running',
      notices: o.notices || [], prompts: [], error: '',
      awaiting: o.awaiting === undefined
        ? { id: 'p1', kind: 'text', message: '把授权码粘回来', placeholder: 'http://localhost:1455/auth/callback', options: [] }
        : o.awaiting,
    },
  })})`
  const t0 = new Date().toISOString()
  await js(authSnapshot({ at: t0 }))
  await js(`activatePage('model')`)
  await new Promise((r) => setTimeout(r, 400))
  const first = await js(`(() => {
    const el = document.querySelector('#auth-attempt input');
    if (!el) return { found: false, html: document.getElementById('auth-attempt').textContent };
    el.__mark = 'same-node';
    el.focus();
    el.value = 'SIM-CODE-123';
    try { el.setSelectionRange(3, 7) } catch { /* 忽略 */ }
    return { found: true, ph: el.placeholder, focused: document.activeElement === el, value: el.value,
             flows: document.querySelectorAll('#auth-flows .row').length }
  })()`)
  check('提问输入框渲染出来了', first.found === true, JSON.stringify(first).slice(0, 200))
  check('输入框带上了宿主给的 placeholder（本机回调地址）', first.ph === 'http://localhost:1455/auth/callback', first.ph)
  check('清单那一行也渲染了', first.flows === 1, first.flows)
  check('输入框能拿到焦点', first.focused === true)
  check('已输入的内容在', first.value === 'SIM-CODE-123', first.value)

  /* ⑤a 快照没变（只有"更新时间"变）⇒ **同一轮**：必须还是同一个元素、还带着焦点与内容 */
  await js(authSnapshot({ at: new Date().toISOString() }))
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const same = await js(`(() => { const el = document.querySelector('#auth-attempt input');
    return { same: !!el && el.__mark === 'same-node', focused: document.activeElement === el, value: el && el.value,
             selA: el && el.selectionStart, selB: el && el.selectionEnd } })()`)
  check('快照没变 ⇒ 不重建（还是同一个元素）', same.same === true, JSON.stringify(same))
  check('快照没变 ⇒ 焦点没被顶掉', same.focused === true)
  check('快照没变 ⇒ 内容还在', same.value === 'SIM-CODE-123', same.value)

  /* ⑤b 快照真的变了（来了一条 notice）⇒ 允许重建，但**提问框仍要复用**并保住焦点/内容 */
  await js(authSnapshot({ at: new Date().toISOString(), notices: [{ message: 'Enter this code…', url: 'https://auth.openai.com/codex/device', code: 'CODEX-1' }] }))
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const after = await js(`(() => { const el = document.querySelector('#auth-attempt input');
    return { same: !!el && el.__mark === 'same-node', focused: document.activeElement === el, value: el && el.value,
             notice: /CODEX-1/.test(document.getElementById('auth-attempt').textContent) } })()`)
  check('快照变了会重建（notice 出来了）', after.notice === true, JSON.stringify(after))
  check('重建时提问框复用同一元素', after.same === true, JSON.stringify(after))
  check('重建后焦点仍在提问框上', after.focused === true)
  check('重建后已输入内容不丢', after.value === 'SIM-CODE-123', after.value)

  /* ⑤c select 型提问要渲染成下拉（而不是文本框） */
  await js(authSnapshot({ at: new Date().toISOString(), awaiting: { id: 'p2', kind: 'select', message: '选登录方式', options: [{ id: 'browser', label: '浏览器' }, { id: 'device_code', label: '设备码' }] } }))
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const sel = await js(`(() => { const s = document.querySelector('#auth-attempt select');
    return { isSelect: !!s, opts: s ? [...s.options].map((o) => o.value) : [], noInput: !document.querySelector('#auth-attempt input') } })()`)
  check('select 型提问渲染成下拉', sel.isSelect === true && sel.noInput === true, JSON.stringify(sel))
  check('下拉里有两个选项', JSON.stringify(sel.opts) === JSON.stringify(['browser', 'device_code']), JSON.stringify(sel.opts))

  /* ⑤d 有尝试在跑 ⇒ **所有**登录按钮禁用 + 正在跑那行标「进行中」
   *   （实测日志：用户在跑着的时候连点了 3 次别的提供方，宿主全静默忽略 ⇒ 界面看着像坏了） */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: {
      ok: true, at: new Date().toISOString(), count: 2,
      flows: [
        { key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', inFlight: false, methods: [{ id: 'oauth', label: '登录' }] },
        { key: 'llm-pi-ai/xai', label: 'xAI', inFlight: false, methods: [{ id: 'oauth', label: '登录' }] },
      ],
    },
    attempt: {
      ok: true, id: 2, key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', method: 'oauth', state: 'running',
      notices: [], prompts: [], error: '', awaiting: { id: 'p3', kind: 'text', message: '把授权码粘回来', placeholder: '', options: [] },
    },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const lock = await js(`(() => { const rows = [...document.querySelectorAll('#auth-flows .row')];
    return { rows: rows.length, btns: rows.map((r) => { const b = r.querySelector('button'); return b ? b.disabled : null }),
             hint: rows[0] ? rows[0].textContent : '',
             switchTip: /换一家/.test(document.getElementById('auth-attempt').textContent) } })()`)
  check('有尝试在跑 ⇒ 其它登录按钮**不禁用**（否则整区点不动 —— 用户报过）', lock.rows === 2 && lock.btns.length === 2 && lock.btns.every((d) => d === false), JSON.stringify(lock.btns))
  check('正在跑的那一行标了「进行中」', /进行中/.test(lock.hint || ''), lock.hint)
  check('跑着时面板里明说"换一家直接点它即可"', lock.switchTip === true, JSON.stringify(lock))

  /* ⑤d-2 实测：跑着的时候点**另一家** ⇒ 必须**先取消**当前这次、再 begin（宿主一次只跑一个，
   *   直接 begin 会被静默忽略 ⇒ 用户以为按钮坏了）。桩把调用记进 `[data-call]`，按顺序核对。 */
  const beforeCalls = await js(`document.querySelectorAll('[data-call]').length`)
  await js(`(() => { const rows = [...document.querySelectorAll('#auth-flows .row')];
    const b = rows[1] && rows[1].querySelector('button'); if (b) b.click(); return !!b })()`)
  await new Promise((r) => setTimeout(r, 600))
  const seq = await js(`[...document.querySelectorAll('[data-call]')].slice(${beforeCalls}).map((e) => e.dataset.call)`)
  const iCancel = seq.indexOf('authCancel')
  const iBegin = seq.indexOf('authBegin')
  check('点另一家 ⇒ 先 authCancel 再 authBegin', iCancel >= 0 && iBegin > iCancel, JSON.stringify(seq))

  /* ⑤e 失败面板：**原因必须被截短**（pi-ai 会把厂商原文 + stack + 每个栈帧全塞进 error，实测 ≈1.5 KB）
   *  + 完整原文进悬停提示 + 明确告诉用户"再点一次登录就能重试"（用户会以为失败=坏了） */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: { ok: true, at: new Date().toISOString(), count: 1, flows: [{ key: 'llm-pi-ai/anthropic', label: 'Anthropic', inFlight: false, methods: [{ id: 'oauth', label: '登录' }] }] },
    attempt: {
      ok: true, id: 3, key: 'llm-pi-ai/anthropic', label: 'Anthropic', method: 'oauth', state: 'failed', notices: [], prompts: [], awaiting: null,
      error: 'Token exchange request failed. url=https://platform.claude.com/v1/oauth/token; details=Error: HTTP request failed. status=400; body={"error":"invalid_grant"}; stack=Error: HTTP request failed.\n    at postJson (anthropic.js:155:15)\n    at async exchangeAuthorizationCode (anthropic.js:162:24)',
    },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const failed = await js(`(() => { const p = document.getElementById('auth-attempt');
    const hints = [...p.querySelectorAll('.hint')];
    const done = hints.find((e) => e.textContent.indexOf('失败') === 0);
    return { text: p.textContent, title: done ? done.title : '', newline: p.textContent.indexOf('\\n') >= 0,
             retry: hints.some((e) => e.textContent.indexOf('再点一次') >= 0), stack: p.textContent.indexOf('stack=') >= 0 } })()`)
  check('失败原因被截短（面板里不出现 stack=）', failed.stack === false, failed.text.slice(0, 160))
  check('失败面板不含换行（不会被撑爆）', failed.newline === false)
  check('完整原文留在悬停提示里', /stack=/.test(failed.title || ''), (failed.title || '').slice(0, 90))
  check('失败时明确给出「再点一次登录」的提示', failed.retry === true, failed.text.slice(0, 160))

  /* ⑤f **只列订阅登录**（用户指出：「apikey 不应该在上面提供方写吗？和订阅登录重复了」）
   *   宿主清单里有 39 家，其中 35 家只有 api-key 方法 ⇒ 那一区必须只留 oauth 那几家，否则与上面的卡片重复。 */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: {
      ok: true, at: new Date().toISOString(), count: 3,
      flows: [
        { key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', inFlight: false, methods: [{ id: 'oauth', label: 'OpenAI (ChatGPT Plus/Pro)' }] },
        { key: 'llm-pi-ai/amazon-bedrock', label: 'Amazon Bedrock', inFlight: false, methods: [{ id: 'api-key', label: 'AWS credentials or bearer token' }] },
        { key: 'llm-pi-ai/ant-ling', label: 'Ant Ling', inFlight: false, methods: [{ id: 'api-key', label: 'Ant Ling API key' }] },
      ],
    },
    attempt: { ok: true, state: 'idle' },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const subOnly = await js(`(() => { const rows = [...document.querySelectorAll('#auth-flows .row')];
    return { rows: rows.length, text: rows.map((r) => r.textContent), btns: rows.map((r) => { const b = r.querySelector('button'); return b ? b.textContent : null }) } })()`)
  check('只渲染订阅登录那一家（api-key 的两家不进来）', subOnly.rows === 1, JSON.stringify(subOnly.text))
  check('留下的是 oauth 那家、按钮也是它的标签', subOnly.btns.length === 1 && /ChatGPT Plus\/Pro/.test(subOnly.btns[0] || ''), JSON.stringify(subOnly.btns))

  /* ⑤g 宿主里**一家订阅登录都没有** ⇒ 提示要指向"上面的卡片填密钥" */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: { ok: true, at: new Date().toISOString(), count: 1, flows: [{ key: 'llm-pi-ai/ant-ling', label: 'Ant Ling', inFlight: false, methods: [{ id: 'api-key', label: 'Ant Ling API key' }] }] },
    attempt: { ok: true, state: 'idle' },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const noneSub = await js(`document.getElementById('auth-flows').textContent`)
  check('没有订阅登录时提示"去上面的提供方卡片填密钥"', /提供方卡片/.test(noneSub || ''), (noneSub || '').slice(0, 120))

  /* ⑤h 试一次**插值**：`t()` 是变参，两元素数组会被 String() 成 "a,b" 并把 {1} 原样留在界面上
   *   （用户截图里那句「登录中：Anthropic,running ({1})」就是这个 bug） */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: { ok: true, at: new Date().toISOString(), count: 1, flows: [{ key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', inFlight: false, methods: [{ id: 'oauth', label: 'OpenAI (ChatGPT Plus/Pro)' }] }] },
    attempt: { ok: true, id: 9, key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', method: 'oauth', state: 'running', notices: [], prompts: [], error: '', awaiting: null },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 60))
  const titleText = await js(`(document.querySelector('#auth-attempt .label') || {}).textContent || ''`)
  check('尝试标题把 {0}/{1} 都填上、且状态是本地语种的词（没有残留 {1}、也不是 running）', /OpenAI Codex/.test(titleText) && /进行中/.test(titleText) && titleText.indexOf('{1}') < 0 && !/running/.test(titleText), titleText)

  /* ⑤i **宽限期**（用户报：「清单自动刷新顶掉了我未完成的操作，它会自己失败」）：
   *   宿主一时读空（`attempt` 变成 no-file/idle）**不许**立刻拆面板 —— 否则用户没答完的提问没了、
   *   宿主还在等 ⇒ 自己超时失败。这里喂一次"读空"，断言输入框**原样还在**（同一元素 + 内容 + 焦点）。 */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: { ok: true, at: new Date().toISOString(), count: 1, flows: [{ key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', inFlight: false, methods: [{ id: 'oauth', label: '登录' }] }] },
    attempt: { ok: true, id: 11, key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', method: 'oauth', state: 'running', notices: [], prompts: [], error: '', awaiting: { id: 'p9', kind: 'text', message: '把授权码粘回来', placeholder: '', options: [] } },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 80))
  const beforeGrace = await js(`(() => { const el = document.querySelector('#auth-attempt input');
    if (el) { el.__mark2 = 'keep-me'; el.focus(); el.value = 'TYPING-NOW' }
    return { found: !!el } })()`)
  check('宽限期前：提问输入框在', beforeGrace.found === true)
  /* 喂一次"读空"（模拟 attempt.json 一时读不到） */
  await js(`window.svsettings.__setAuth({ ok: false, why: 'no-file' })`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 80))
  const during = await js(`(() => { const el = document.querySelector('#auth-attempt input');
    return { same: !!el && el.__mark2 === 'keep-me', value: el && el.value, focused: document.activeElement === el,
             hint: (document.getElementById('auth-recheck') || {}).textContent || '' } })()`)
  check('瞬时读空 ⇒ 提问输入框**没被拆掉**（同一元素）', during.same === true, JSON.stringify(during))
  check('瞬时读空 ⇒ 已输入内容还在', during.value === 'TYPING-NOW', during.value)
  check('瞬时读空 ⇒ 焦点还在', during.focused === true)
  check('瞬时读空 ⇒ 面板里说明"正在向宿主确认"', /正在向宿主确认/.test(during.hint), during.hint)
  /* 再喂 6 次读空（连续读空 = 宿主那边真没有了）⇒ 这才允许收掉 */
  for (let i = 0; i < 7; i++) { await js(`loadAuthFlows()`); await new Promise((r) => setTimeout(r, 20)) }
  const afterGrace = await js(`!!document.querySelector('#auth-attempt input')`)
  check('连续读空之后才收掉面板', afterGrace === false)

  /* ⑤j 厂商**地区封锁**要把错误码翻成人话（真实样本：OpenAI 对 CN 返回 403
   *   `unsupported_country_region_territory` —— 用户当时只看到一坨 JSON，不知道该换一家） */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: { ok: true, at: new Date().toISOString(), count: 1, flows: [{ key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', inFlight: false, methods: [{ id: 'oauth', label: '登录' }] }] },
    attempt: {
      ok: true, id: 12, key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', method: 'oauth', state: 'failed', notices: [], prompts: [], awaiting: null,
      error: 'OpenAI Codex device code request failed with status 403: {"error":{"code":"unsupported_country_region_territory","message":"Country, region, or territory not supported","type":"request_forbidden"}}',
    },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 80))
  const region = await js(`document.getElementById('auth-attempt').textContent`)
  check('地区封锁 ⇒ 面板里有"厂商拒绝了这次登录（原因码：…）"', /厂商拒绝了这次登录/.test(region) && /unsupported_country_region_territory/.test(region), (region || '').slice(0, 160))
  check('地区封锁 ⇒ 面板文案不至于长到撑爆（第一行 + 一句人话）', (region || '').length < 600, String((region || '').length))

  /* ⑤k **空答案不许提交**（实测：用户在 Anthropic 那格留空点提交 ⇒ 本机回调那一侧被掐掉 ⇒
   *   `Missing authorization code`。这一条钉住"空着点提交不会发出 authAnswer"。 */
  await js(`window.svsettings.__setAuth(${JSON.stringify({
    ok: true,
    flows: { ok: true, at: new Date().toISOString(), count: 1, flows: [{ key: 'llm-pi-ai/anthropic', label: 'Anthropic', inFlight: false, methods: [{ id: 'oauth', label: '登录' }] }] },
    attempt: { ok: true, id: 13, key: 'llm-pi-ai/anthropic', label: 'Anthropic', method: 'oauth', state: 'running', notices: [], prompts: [], error: '', awaiting: { id: 'p11', kind: 'text', message: '把授权码粘回来', placeholder: 'http://localhost:53692/callback', options: [] } },
  })})`)
  await js(`loadAuthFlows()`)
  await new Promise((r) => setTimeout(r, 80))
  const beforeEmpty = await js(`document.querySelectorAll('[data-call]').length`)
  await js(`(() => { const p = document.getElementById('auth-attempt');
    const btn = [...p.querySelectorAll('button')].find((b) => /提交/.test(b.textContent));
    if (btn) btn.click(); return !!btn })()`)
  await new Promise((r) => setTimeout(r, 150))
  const emptySeq = await js(`[...document.querySelectorAll('[data-call]')].slice(${beforeEmpty}).map((e) => e.dataset.call)`)
  check('空着点提交 ⇒ **不发送** authAnswer', emptySeq.indexOf('authAnswer') < 0, JSON.stringify(emptySeq))
  check('空着点提交 ⇒ 面板给出"这一格不能留空"的提示', await js(`/不能留空/.test(document.getElementById('auth-recheck').textContent)`), '')

  /* ④ 静态接线检查：主进程发的事件，preload 与页面都接上了 */
  const calls = await js(`Array.from(document.querySelectorAll('[data-call]')).map((e) => e.dataset.call)`)
  const errs = await js(`window.__errs`)

  console.log('=== 页面脚本错误 ===')
  console.log(errs && errs.length ? errs.join('\n') : '（无）')
  console.log('=== console error（安全告警已过滤） ===')
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '（无）')
  console.log('=== 点击结果 ===')
  for (const r of results) console.log(JSON.stringify(r))
  console.log('=== svsettings 调用序列 ===')
  console.log(JSON.stringify(calls))
  console.log('=== 断言 ===')
  for (const c of checks) console.log((c.ok ? '  ✅ ' : '  ❌ ') + c.name + (c.ok ? '' : ' → ' + c.detail))
  console.log(`=== ${checks.length - failures.length}/${checks.length} 通过 ===`)
  if (failures.length) console.log('失败项：\n' + failures.map((f) => ' - ' + f).join('\n'))

  app.exit(failures.length ? 1 : 0)
})
