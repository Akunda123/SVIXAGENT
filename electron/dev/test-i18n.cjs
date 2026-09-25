/**
 * i18n 校验：客户端界面语言（简/繁/英/日）。
 *
 * 三件事：
 *  ① 逻辑单测：首次启动按系统语言（zh-TW→zh-Hant、ja-JP→ja、ko-KR→en…）+ 落盘后以文件为准；
 *  ② 渲染校验：用**真 preload + 真字典**加载三个窗口，逐语种断言
 *     「没有漏翻的 key」「en/ja 下没有残留中文（语言名除外）」「<html lang> 跟着变」；
 *  ③ 热切换校验：不重载窗口，广播 akdagent-i18n-update 后文案必须整体换语种。
 *
 * 跑法（electron 目录下）：npx electron dev/test-i18n.cjs
 * 退出码：0 = 通过，1 = 有失败项。
 */
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const SRC = path.join(__dirname, '..', 'src')
const i18n = require(path.join(SRC, 'i18n'))

const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja']
/** en/ja 界面里允许出现的中文：语言名一律用该语言自身写法 */
const ALLOW = ['简体中文', '繁體中文', '日本語', '中文']
/** 语言名/品牌等允许的非拉丁内容白名单（正则，逐个从残留里剔除后再判定） */
const ALLOW_RE = [new RegExp(ALLOW.join('|'), 'g')]

const failures = []
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) failures.push(name + (detail ? ' → ' + detail : ''))
}

// 测试期间会反复新建/销毁窗口：**不能让最后一个窗口关闭就把 app 带走**
// （否则下一次 loadFile 直接 ERR_FAILED -2，看起来像页面加载失败）
app.on('window-all-closed', () => {})

/* ── ① i18n 逻辑单测（纯 Node，不依赖窗口） ───────────────────────── */
function testLocaleLogic() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-i18n-'))
  const fakeApp = (sys) => ({
    getPath: () => tmp,
    getSystemLocale: () => sys,
    getLocale: () => sys,
  })

  for (const [sys, want] of [
    ['zh-CN', 'zh-Hans'],
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-Hant', 'zh-Hant'],
    ['ja-JP', 'ja'],
    ['en-US', 'en'],
    ['ko-KR', 'en'],
    ['', 'zh-Hans'],
  ]) {
    check(`系统语言 ${sys || '（空）'} → ${want}`, i18n.normalizeLocale(sys) === want, i18n.normalizeLocale(sys))
  }

  // 首次启动：写文件 + 用系统语言
  const first = i18n.init(fakeApp('ja-JP'))
  check('首次启动取系统语言 ja', first.locale === 'ja' && first.firstRun === true, JSON.stringify(first))
  const prefsFile = path.join(tmp, 'ui-prefs.json')
  check('首次启动写了 ui-prefs.json', fs.existsSync(prefsFile))
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(prefsFile, 'utf8')) } catch { /* ignore */ }
  check('ui-prefs.json 内容 = ja（来源 system）', saved.locale === 'ja' && saved.localeSource === 'system', JSON.stringify(saved))

  // 第二次启动：系统语言变了也**不再覆盖**用户已存的值
  const second = i18n.init(fakeApp('en-US'))
  check('重启后以文件为准（不被系统语言覆盖）', second.locale === 'ja' && second.firstRun === false, JSON.stringify(second))

  // 用户改：落盘 + 立即生效
  const r = i18n.setLocale('en')
  check('setLocale(en) 生效', r.ok && i18n.getLocale() === 'en', JSON.stringify(r))
  saved = JSON.parse(fs.readFileSync(prefsFile, 'utf8'))
  check('用户改动落盘（来源 user）', saved.locale === 'en' && saved.localeSource === 'user', JSON.stringify(saved))
  check('非法语种被拒', i18n.setLocale('fr').ok === false)

  // 字典完整性
  const missing = i18n.audit()
  const flat = Object.entries(missing).flatMap(([l, ks]) => ks.map((k) => `${l}:${k}`))
  check('四语字典 key 集合一致（无缺/无多）', flat.length === 0, flat.slice(0, 12).join(', '))

  // 字典层漏翻：简体专用字 / 日文与简体一字不差
  const { simplified, identicalJa, shortOnes } = dictLeflovers()
  check('字典里没有简体专用字残留（zh-Hant / ja）', simplified.length === 0, simplified.slice(0, 12).join(', '))
  // 日文与简体同形属**启发式**（"思考中…"这种日语本身也这么写），只提示不判失败
  if (identicalJa.length) {
    console.log(`（提示）日文与简体同形的条目 ${identicalJa.length} 条，请人工扫一眼是否真的该翻：`)
    for (const s of identicalJa.slice(0, 20)) console.log('  · ' + s)
  }
  if (shortOnes.length) {
    console.log(`（信息）zh-Hant 与简体同形的短词 ${shortOnes.length} 条，属正常同形词，仅记录：`)
    for (const s of shortOnes.slice(0, 20)) console.log('  · ' + s)
  }

  fs.rmSync(tmp, { recursive: true, force: true })
}

/* ── 渲染层校验用的桩：让 invoke/send 频道有回应，动态区块才会渲染 ── */
const uiLocaleCalls = []
const STUBS = {
  'akdagent-get-version': () => '0.1.0-test',
  'akdagent-get-ui-prefs': () => ({
    locale: i18n.getLocale(),
    locales: i18n.LOCALES.map((l) => ({ id: l, label: i18n.LOCALE_LABELS[l] })),
    firstRun: false,
  }),
  'akdagent-set-ui-locale': (_e, l) => {
    uiLocaleCalls.push(String(l))
    return i18n.setLocale(l)
  },
  'akdagent-get-orb-state': () => ({ autostart: true, alwaysOnTop: true }),
  'akdagent-get-providers': () => ({
    providers: [],
    presets: [],
    models: [],
    language: 'zh',
    reasoningEffort: 'high',
  }),
  'akdagent-get-settings': () => ({}),
  // 形状必须与主进程真实返回一致（见 main.js 的 akdagent-get-sv-config / akdagent-sv-flat-status）
  'akdagent-get-sv-config': () => ({
    scriptsDirs: ['C:/Users/you/Documents/Dreamtonics/Synthesizer V Studio/scripts'],
    entries: [
      { dir: 'C:/Users/you/Documents/Dreamtonics/Synthesizer V Studio/scripts', exists: true, deployed: true, agentDir: 'C:/Users/you/Documents/Dreamtonics/Synthesizer V Studio/Agent' },
    ],
    bridgeSource: 'C:/sv/AKDAgentBridge.lua',
  }),
  // 让 flat 区**渲染出来**（否则该区块 display:none，里面的文案不会被四语检查覆盖）
  'akdagent-sv-flat-status': () => ({
    ok: true,
    isFlat: true,
    proc: true,
    dirExists: true,
    nofsJson: true,
    dataDir: 'C:/Users/you/Documents/OPSV/Dreamtonics/Synthesizer V Studio',
    dbDir: 'C:/Users/you/Documents/OPSV/Dreamtonics/Synthesizer V Studio/databases',
    databases: [
      { name: 'ROSE AI', nofs: [{ file: 'info.101.nofs', path: 'C:/x/databases/ROSE AI/info.101.nofs' }] },
    ],
  }),
  'akdagent-scan-sv-scripts': () => ({ found: [] }),
  'akdagent-read-nofs': () => ({ ok: true, data: '{}' }),
  'akdagent-stt-status': () => ({ ready: false, activeId: null, installedModels: [], models: [] }),
  'akdagent-agent-ready-query': () => ({ ready: true, text: 'ok' }),
  'akdagent-agent-session-state': () => ({ stale: false }),
  // 真实形状：events 带 __seg；含 user/assistant 消息 + 工具行，把分隔线与工具行的文案也逼出来
  'akdagent-agent-history': () => ({
    ok: true,
    events: [
      { __seg: { segId: 's1', kind: 'project', projectKey: 'p1', projectName: 'Demo', gen: 1 }, type: 'user/message', data: { message: { content: [{ type: 'text', text: 'hi' }] } } },
      { __seg: { segId: 's1', kind: 'project', projectKey: 'p1', projectName: 'Demo', gen: 1 }, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'hello' }] } } },
      { __seg: { segId: 's1', kind: 'project', projectKey: 'p1', projectName: 'Demo', gen: 1 }, type: 'tool/call', data: { name: 'sv_ping', arguments: {} } },
      { __seg: { segId: 's1', kind: 'project', projectKey: 'p1', projectName: 'Demo', gen: 1 }, type: 'tool/result', data: { message: 'ok' } },
      { __seg: { segId: 's2', kind: 'temp', gen: 2, exportedUpToSeq: 5 }, type: 'user/message', data: { message: { content: [{ type: 'text', text: 'temp' }] } } },
    ],
  }),
}

function installStubs() {
  for (const [ch, fn] of Object.entries(STUBS)) ipcMain.handle(ch, fn)
  // 主进程 → 渲染层的同步字典（真 preload 就靠这个）
  ipcMain.on('akdagent-i18n-sync', (e) => {
    e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor(nsOf(e.sender)) }
  })
}

const wins = []
function winOf(sender) {
  return wins.find((w) => !w.isDestroyed() && w.webContents === sender)
}
function nsOf(sender) {
  const w = winOf(sender)
  return w ? w.__ns : 'common'
}

/** 收集 body 里所有含文字节点的可见文本（带元素路径，便于定位漏翻在哪） */
const SCAN = `
  (() => {
    const out = [];
    const pathOf = (el) => {
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 4) {
        let s = cur.tagName.toLowerCase();
        if (cur.id) s += '#' + cur.id;
        else if (cur.className && typeof cur.className === 'string') s += '.' + cur.className.trim().split(/\\s+/)[0];
        parts.unshift(s);
        cur = cur.parentElement;
      }
      return parts.join('>');
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const style = el.getAttribute('style') || '';
      if (style.includes('display:none') || style.includes('display: none')) continue;
      out.push({ text: t, path: pathOf(el) });
    }
    return out;
  })()
`

/** 漏翻的 key：data-i18n 元素文本 === key 本身 */
const KEY_MISS = `
  (() => {
    const miss = [];
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      if ((el.textContent || '').trim() === k) miss.push(k);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      if ((el.placeholder || '') === el.dataset.i18nPh) miss.push(el.dataset.i18nPh + '（placeholder）');
    });
    return miss;
  })()
`

function cjkLeftovers(texts) {
  const out = []
  for (const raw of texts) {
    let t = raw
    for (const re of ALLOW_RE) t = t.replace(re, '')
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(t)) out.push(raw)
  }
  return out
}

/** 是否含汉字（不含假名） */
function hasHan(s) {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(s)
}

/**
 * 简体专用字（繁体/日文里不会出现的字形）。
 * 判据：**繁体或日文文案里出现这些字 = 没翻**——这一条精确、几乎不误报
 * （"未部署/已取消/使用模型"这类繁简同形词是合法的，不能靠"和简体一样"来判）。
 */
const SIMPLIFIED_ONLY =
  '设备桥专页头输删载复单请选择确态连检键启顶关认时间开无说语图录网误务团级类项应让观视频标长变换调试词论谈讲训记计划达过还这从优势华协卫动们样'

const SIMPLIFIED_RE = new RegExp('[' + SIMPLIFIED_ONLY + ']')

/** 繁体/日文里出现简体专用字 ⇒ 漏翻 */
function simplifiedLeftovers(texts) {
  return texts.filter((t) => !isAllowedName(t) && SIMPLIFIED_RE.test(t))
}

/** 整条就是允许的语言名 */
function isAllowedName(s) {
  return ALLOW.includes(s.trim())
}

/** 汉字个数 */
function hanCount(s) {
  return (String(s).match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length
}

/** 含≥3 个汉字才判"疑似漏翻" */
const SUSPECT_HAN = 3

/** 英文界面里不该出现汉字（语言名除外） */
function enHanLeftovers(items) {
  return items.filter((o) => !isAllowedName(o.text) && hasHan(o.text))
}

/** 繁体/日文里出现简体专用字 ⇒ 漏翻 */
function simplifiedLeftovers(items) {
  return items.filter((o) => !isAllowedName(o.text) && SIMPLIFIED_RE.test(o.text))
}

function fmt(items) {
  return items.slice(0, 6).map((o) => `${JSON.stringify(o.text)} @ ${o.path}`).join(' / ')
}

/**
 * 日文的额外判据：与 zh-Hans 逐条对比，"一字不差且汉字≥3"基本就是没翻。
 * （片假名/平假名会自然产生差异，所以品牌名/路径这类不含汉字的条目不受影响。）
 * 注意**不用于 zh-Hant**：繁简同形词太多（未部署/已取消/使用模型），会满屏误报。
 */
function identicalToBase(baseItems, otherItems) {
  const out = []
  const n = Math.min(baseItems.length, otherItems.length)
  for (let i = 0; i < n; i++) {
    const b = baseItems[i]
    if (b.text === otherItems[i].text && hanCount(b.text) >= SUSPECT_HAN && !isAllowedName(b.text)) out.push(b)
  }
  return out
}

/**
 * 字典层漏翻检查（比渲染层更全：当前没渲染到的 key 也能查）。
 *  - zh-Hant / ja：值里含**简体专用字** ⇒ 漏翻；
 *  - ja 额外：值与 zh-Hans 一字不差且汉字≥3 ⇒ 漏翻。
 */
function dictLeflovers() {
  const fsx = require('node:fs')
  const simplified = []
  const identicalJa = []
  const shortOnes = []
  for (const ns of i18n.NAMESPACES) {
    let dict
    try { dict = JSON.parse(fsx.readFileSync(path.join(SRC, 'i18n', ns + '.json'), 'utf8')) } catch { continue }
    const base = dict['zh-Hans'] || {}
    for (const loc of ['zh-Hant', 'ja']) {
      const other = dict[loc] || {}
      for (const [k, v] of Object.entries(base)) {
        const val = other[k]
        if (val === undefined) continue
        if (SIMPLIFIED_RE.test(val)) { simplified.push(`${loc} ${ns}:${k} = ${JSON.stringify(val)}`); continue }
        if (loc === 'ja' && val === v && hanCount(v) >= SUSPECT_HAN) identicalJa.push(`ja ${ns}:${k} = ${JSON.stringify(v)}`)
        else if (loc === 'zh-Hant' && val === v && hanCount(v) < SUSPECT_HAN) shortOnes.push(`zh-Hant ${ns}:${k} = ${JSON.stringify(v)}`)
      }
    }
  }
  return { simplified, identicalJa, shortOnes }
}

async function openWindow(spec, locale) {
  i18n.setLocale(locale)
  const win = new BrowserWindow({
    width: spec.width || 680,
    height: spec.height || 720,
    show: false,
    webPreferences: { preload: path.join(SRC, spec.preload), contextIsolation: true, nodeIntegration: false },
  })
  win.__ns = spec.ns
  win.__name = spec.name
  win.__errors = []
  win.webContents.on('console-message', (_e, level, message) => {
    if (/Security Warning|Content Security/.test(message)) return
    // level 3 = error；页面里未捕获的异常也走这里（含 preload 回调里抛出的）
    if (level >= 3 || /^Uncaught|^\[i18n\]/.test(message)) win.__errors.push(message)
  })
  win.webContents.on('preload-error', (_e, file, err) => win.__errors.push('preload-error ' + file + ': ' + err.message))
  wins.push(win)
  await win.loadFile(path.join(SRC, spec.html))
  await new Promise((r) => setTimeout(r, 700))
  return win
}

/** 页面里报错必须暴露出来：上次就是 onChange 里的异常被静默吞掉，才漏了"半页没切语种" */
function assertNoPageErrors(win, tag) {
  const errs = win.__errors || []
  check(`[${tag}] 页面无 JS 报错（含 preload 回调异常）`, errs.length === 0, errs.slice(0, 3).join(' ｜ '))
}

const SPECS = [
  { name: 'settings', html: 'settings.html', preload: 'settings-preload.js', ns: 'settings', width: 680, height: 760 },
  { name: 'orb', html: 'orb.html', preload: 'orb-preload.js', ns: 'orb', width: 380, height: 560 },
  { name: 'key-prompt', html: 'key-prompt.html', preload: 'key-prompt-preload.js', ns: 'keyPrompt', width: 600, height: 320 },
]

async function testRender() {
  for (const spec of SPECS) {
    const scanned = {}
    for (const locale of LOCALES) {
      const win = await openWindow(spec, locale)
      const js = (code) => win.webContents.executeJavaScript(code)
      const tag = `${spec.name}/${locale}`

      const miss = await js(KEY_MISS)
      check(`[${tag}] 没有漏翻的 key`, miss.length === 0, miss.join(', '))

      const lang = await js(`document.documentElement.lang`)
      check(`[${tag}] <html lang> = ${locale}`, lang === locale, String(lang))

      const texts = await js(SCAN)
      scanned[locale] = texts
      check(`[${tag}] 页面有内容（文本节点 ${texts.length} 条）`, texts.length >= 3, String(texts.length))
      assertNoPageErrors(win, tag)
      win.destroy()
    }

    // 英文界面：不该有汉字（语言名除外）
    const enLeft = enHanLeftovers(scanned.en)
    check(`[${spec.name}/en] 无残留汉字`, enLeft.length === 0, fmt(enLeft))

    // 日文 / 繁体：简体专用字残留 = 漏翻；日文另加"与简体一字不差"判据
    for (const loc of ['zh-Hant', 'ja']) {
      const simp = simplifiedLeftovers(scanned[loc])
      check(`[${spec.name}/${loc}] 无简体专用字残留`, simp.length === 0, fmt(simp))
      if (loc === 'ja') {
        const same = identicalToBase(scanned['zh-Hans'], scanned.ja)
        check(`[${spec.name}/ja] 无与简体一字不差的条目（疑似漏翻）`, same.length === 0, fmt(same))
        // 文本够多的窗口才查假名（悬浮球面板收起时可见文本本就很少）
        if (scanned.ja.length >= 20) {
          const kana = scanned.ja.filter((o) => /[\u3040-\u30ff]/.test(o.text)).length
          check(`[${spec.name}/ja] 确实有日文（含假名的条目 ${kana} 条）`, kana >= 2, String(kana))
        }
      }
    }
  }
}

/** ③ 热切换：不重载窗口，广播新字典后文案整体换语种（三个窗口都要跟上） */
async function testLiveSwitch() {
  for (const spec of SPECS) {
    const win = await openWindow(spec, 'zh-Hans')
    const js = (code) => win.webContents.executeJavaScript(code)

    const before = await js(SCAN)
    const hanBefore = before.filter((o) => hasHan(o.text)).length
    check(`[热切换/${spec.name}] 初始为中文（含汉字的条目 ${hanBefore} 条）`, hanBefore >= 1, String(hanBefore))

    i18n.setLocale('en')
    win.webContents.send('akdagent-i18n-update', {
      locale: 'en',
      labels: i18n.LOCALE_LABELS,
      dict: i18n.dictFor(spec.ns),
    })
    await new Promise((r) => setTimeout(r, 400))

    const after = await js(SCAN)
    const left = enHanLeftovers(after)
    check(`[热切换/${spec.name}] 未重载窗口即切成英文（无残留汉字）`, left.length === 0, fmt(left))
    const lang = await js(`document.documentElement.lang`)
    check(`[热切换/${spec.name}] <html lang> 同步为 en`, lang === 'en', String(lang))
    assertNoPageErrors(win, `热切换/${spec.name}`)
    win.destroy()
  }
}

/** ④ 功能接线：设置页真的有「客户端界面语言」这一项，且选了会调主进程 */
async function testLocaleSettingWiring() {
  const win = await openWindow(SPECS[0], 'zh-Hans')
  const js = (code) => win.webContents.executeJavaScript(code)
  await js(`activatePage('conv')`)
  await new Promise((r) => setTimeout(r, 300))

  const info = await js(`
    (() => {
      const sel = document.getElementById('locale-select');
      const dsh = document.getElementById('lang-select');
      return {
        hasClientSelect: !!sel,
        options: sel ? Array.from(sel.options).map((o) => ({ v: o.value, t: o.textContent })) : [],
        value: sel ? sel.value : null,
        hasDshSelect: !!dsh,
        dshLabel: dsh ? (dsh.closest('.row') ? dsh.closest('.row').querySelector('.label').textContent : null) : null,
      };
    })()
  `)
  check('[设置项] 存在「客户端界面语言」下拉 #locale-select', info.hasClientSelect)
  check('[设置项] 四语选项齐全且用各自语言书写',
    info.options.length === 4 &&
    info.options.map((o) => o.v).join(',') === 'zh-Hans,zh-Hant,en,ja' &&
    info.options.map((o) => o.t).join(',') === '简体中文,繁體中文,English,日本語',
    JSON.stringify(info.options))
  check('[设置项] 当前语种与主进程一致（zh-Hans）', info.value === 'zh-Hans', String(info.value))
  check('[设置项] DSH 自己的语言下拉仍在（两套设置并存）', info.hasDshSelect, String(info.dshLabel))

  // 选 ja → 必须调 akdagent-set-ui-locale('ja')
  await js(`
    (() => {
      const sel = document.getElementById('locale-select');
      sel.value = 'ja';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `)
  await new Promise((r) => setTimeout(r, 300))
  check('[设置项] 切换语言会通知主进程（setUiLocale）', uiLocaleCalls.includes('ja'), JSON.stringify(uiLocaleCalls))
  assertNoPageErrors(win, '设置项/热切换')
  win.destroy()
}

app.whenReady().then(async () => {
  // 用临时 userData 初始化，避免污染真实 ui-prefs.json
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-i18n-run-'))
  i18n.init({ getPath: () => tmp, getSystemLocale: () => 'zh-CN', getLocale: () => 'zh-CN' })
  testLocaleLogic()
  installStubs()
  await testRender()
  await testLiveSwitch()
  await testLocaleSettingWiring()

  console.log('=== 断言 ===')
  for (const c of checks) console.log((c.ok ? '  ✅ ' : '  ❌ ') + c.name + (c.ok ? '' : ' → ' + c.detail))
  console.log(`=== ${checks.length - failures.length}/${checks.length} 通过 ===`)
  if (failures.length) {
    console.log('失败项：')
    for (const f of failures) console.log(' - ' + f)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  app.exit(failures.length ? 1 : 0)
})
