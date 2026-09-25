/**
 * SV 集成页「SV Flat 版」两件新功能的验收测试（用户 2026-09-13 提）：
 *  ① 没检测到 OPSV(flat) ⇒ **整块隐藏**「nofs JSON 编辑器」；检测到才显示；
 *  ② 打开编辑器后，JSON 文本框**正下方**有「十六进制 + name + 添加 style」一行，
 *     只收这两个字段，加完只改文本框（不落盘），点保存才写文件。
 *
 * 用真 Chromium 加载 src/settings.html + 桩 preload（可注入 flat 状态与 nofs 内容）。
 * 跑法（electron 目录下）：npx electron dev/test-flat-style-editor.cjs
 * 退出码：0 = 通过，1 = 有失败项。
 */
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const SRC = path.join(__dirname, '..', 'src')
const i18n = require(path.join(SRC, 'i18n'))

const SAMPLE_DATA = 'A83F9ABB3C7A05BC68B7C93C00905EBDB07A8F3C204D07BD50492F3D0095BF3B9A319ABD54986CBD8A7A8B3D506B6E3B402820BC6010653C001139BEED9A753D44F69E3D946951BD801B013C808B553D77678EBC403178BC1F2E953D384BB83DBFC119BD70830CBC0A63803D08A224BE22AB8BBD9010B8BC2048333D20CEECBB'
const NOFS_PATH = 'C:/x/OPSV/Dreamtonics/Synthesizer V Studio/databases/ROSE AI/info.101.nofs'
const NOFS_OBJ = {
  name: 'ROSE AI',
  version: '101',
  vendor: 'Bushiroad Music Inc.',
  styles: [{ name: '(base)', data: SAMPLE_DATA }],
}

const failures = []
const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  if (!ok) failures.push(name + (detail ? ' → ' + detail : ''))
}

app.on('window-all-closed', () => {})

async function openSettings() {
  const win = new BrowserWindow({
    width: 680,
    height: 760,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'test-settings-preload.cjs'), contextIsolation: true },
  })
  // 页面里的报错要看得见：否则 executeJavaScript 只回一句"Script failed to execute"
  // 注意 unhandledrejection 在隔离世界收不到页面世界的异常 ⇒ 只能靠 console-message 的**行号**定位
  win.__errors = []
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (/Security Warning|Content Security/.test(message)) return
    if (level >= 3 || /^Uncaught|^\[i18n\]/.test(message)) {
      const where = `${String(sourceId || '').split(/[\\/]/).pop()}:${line}`
      win.__errors.push(`${message}  @${where}`)
      console.log(`  [页面错误] ${message}  @${where}`)
    }
  })
  win.webContents.on('preload-error', (_e, file, err) => console.log('  [preload 错误] ' + file + ': ' + err.message))
  await win.loadFile(path.join(SRC, 'settings.html'))
  await new Promise((r) => setTimeout(r, 600))
  return win
}

const PROBE = `
  (() => {
    const sec = document.getElementById('sv-flat-section');
    const ed = document.getElementById('sv-flat-editor');
    const ta = document.getElementById('sv-flat-edit-area');
    const addRow = document.getElementById('btn-sv-flat-add-style');
    const dataEl = document.getElementById('sv-flat-style-data');
    const nameEl = document.getElementById('sv-flat-style-name');
    const styleTip = document.getElementById('sv-flat-style-tip');
    return {
      sectionVisible: !!sec && getComputedStyle(sec).display !== 'none',
      editorVisible: !!ed && getComputedStyle(ed).display !== 'none',
      hasAddBtn: !!addRow,
      addBtnText: addRow ? addRow.textContent : null,
      dataPh: dataEl ? dataEl.placeholder : null,
      namePh: nameEl ? nameEl.placeholder : null,
      // 输入行必须在 JSON 文本框之后（“正下方”）
      addRowAfterTextarea: !!(ta && addRow && (ta.compareDocumentPosition(addRow.parentElement) & Node.DOCUMENT_POSITION_FOLLOWING)),
      textareaValue: ta ? ta.value : null,
      styleTip: styleTip ? styleTip.textContent : null,
      tip: (document.getElementById('sv-flat-tip') || {}).textContent || null,
    };
  })()
`

app.whenReady().then(async () => {
  i18n.init({ getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-flatui-')), getSystemLocale: () => 'zh-CN', getLocale: () => 'zh-CN' })
  i18n.setLocale('zh-Hans')
  ipcMain.on('akdagent-i18n-sync', (e) => { e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor('settings') } })

  /* ① 未检测到 flat：整块隐藏 */
  const win = await openSettings()
  const js = (code) => win.webContents.executeJavaScript(code)
  await js(`activatePage('sv')`)
  await js(`window.svsettings.__setState({ flat: { ok: true, isFlat: false, proc: false, dirExists: false, nofsJson: false, dataDir: '', dbDir: '', databases: [] }, nofs: { ok: true, path: ${JSON.stringify(NOFS_PATH)}, data: ${JSON.stringify(NOFS_OBJ)} } })`)
  await js(`loadFlatStatus()`)
  await new Promise((r) => setTimeout(r, 300))

  let p = await js(PROBE)
  check('未检测到 flat ⇒ 整块（含标题）隐藏', p.sectionVisible === false, JSON.stringify({ sectionVisible: p.sectionVisible }))
  check('未检测到 flat ⇒ 编辑器也隐藏', p.editorVisible === false)

  /* ② 检测到 flat：显示区块；编辑器默认收起，点「编辑」才展开 */
  await js(`window.svsettings.__setState({ flat: { ok: true, isFlat: true, proc: false, dirExists: true, nofsJson: true, dataDir: 'C:/x/OPSV', dbDir: 'C:/x/OPSV/databases', databases: [{ name: 'ROSE AI', nofs: [{ file: 'info.101.nofs', path: ${JSON.stringify(NOFS_PATH)} }] }] } })`)
  await js(`loadFlatStatus()`)
  await new Promise((r) => setTimeout(r, 300))
  p = await js(PROBE)
  check('检测到 flat ⇒ 区块显示', p.sectionVisible === true)
  check('未点编辑前编辑器收起', p.editorVisible === false)

  // 列表里应有「编辑」按钮 → 点它（走真实路径）
  const listInfo = await js(`
    (() => {
      const rows = Array.from(document.querySelectorAll('#sv-flat-list .row'));
      const btn = rows[0] ? rows[0].querySelector('button') : null;
      if (btn) btn.click();
      return { rows: rows.length, label: rows[0] ? rows[0].querySelector('.label').textContent : null, btn: btn ? btn.textContent : null };
    })()
  `)
  await new Promise((r) => setTimeout(r, 300))
  check('声库列表有「编辑」按钮', listInfo.rows === 1 && !!listInfo.btn, JSON.stringify(listInfo))
  p = await js(PROBE)
  check('点编辑 ⇒ 编辑器展开且文本框有 JSON', p.editorVisible === true && /ROSE AI/.test(p.textareaValue || ''))
  check('存在「添加 style」按钮', p.hasAddBtn === true, String(p.addBtnText))
  check('输入行在 JSON 文本框正下方', p.addRowAfterTextarea === true)
  check('添加行只有 2 个输入框（data + name）', await js(`Array.from(document.querySelectorAll('#sv-flat-editor .add-provider-row')).find((r) => r.querySelector('#sv-flat-style-data')).querySelectorAll('input').length`) === 2)
  check('占位符说明了 data 规格', /256/.test(p.dataPh || ''), String(p.dataPh))

  /* ②b 编辑器必须**贴在点的那一行正下方**（用户 2026-09-14 澄清：第一行点编辑，第二行出现输入框） */
  const placement = await js(`
    (() => {
      const list = document.getElementById('sv-flat-list');
      const rows = Array.from(list.querySelectorAll(':scope > .row'));
      const ed = document.getElementById('sv-flat-editor');
      return {
        editorParentIsList: ed.parentElement === list,
        editorIsNextSiblingOfFirstRow: !!(rows[0] && rows[0].nextElementSibling === ed),
        firstRowHighlighted: rows[0] ? rows[0].classList.contains('active-row') : false,
      };
    })()
  `)
  check('编辑器挂在列表里、紧跟被点的那一行', placement.editorParentIsList && placement.editorIsNextSiblingOfFirstRow, JSON.stringify(placement))
  check('被编辑的行高亮', placement.firstRowHighlighted === true)

  /* ②c 两行时点第二行 ⇒ 编辑器跟着移过去，高亮切换 */
  await js(`window.svsettings.__setState({ flat: { ok: true, isFlat: true, proc: true, dirExists: true, nofsJson: true, dataDir: 'C:/x/OPSV', dbDir: 'C:/x/OPSV/databases', databases: [{ name: 'ROSE AI', nofs: [{ file: 'info.101.nofs', path: ${JSON.stringify(NOFS_PATH)} }, { file: 'info.100a0.nofs', path: 'C:/x/databases/ROSE AI/info.100a0.nofs' }] }] } })`)
  await js(`loadFlatStatus()`)
  await new Promise((r) => setTimeout(r, 250))
  await js(`document.querySelectorAll('#sv-flat-list > .row')[1].querySelector('button').click()`)
  await new Promise((r) => setTimeout(r, 300))
  const placement2 = await js(`
    (() => {
      const rows = Array.from(document.querySelectorAll('#sv-flat-list > .row'));
      const ed = document.getElementById('sv-flat-editor');
      return {
        rows: rows.length,
        afterSecond: !!(rows[1] && rows[1].nextElementSibling === ed),
        secondHighlighted: rows[1] ? rows[1].classList.contains('active-row') : false,
        firstHighlighted: rows[0] ? rows[0].classList.contains('active-row') : false,
      };
    })()
  `)
  check('点第二行 ⇒ 编辑器移到第二行正下方', placement2.afterSecond === true, JSON.stringify(placement2))
  check('高亮跟着换行（旧行取消）', placement2.secondHighlighted === true && placement2.firstHighlighted === false)

  /* ②d 切语种会重排列表：编辑器位置与内容都不能丢（"编辑点不了"那类 bug 的高发区） */
  const areaBeforeLang = await js(`document.getElementById('sv-flat-edit-area').value`)
  i18n.setLocale('en')   // 主进程侧也要跟着切，否则 dictFor 仍返回中文字典
  win.webContents.send('akdagent-i18n-update', { locale: 'en', labels: i18n.LOCALE_LABELS, dict: i18n.dictFor('settings') })
  await new Promise((r) => setTimeout(r, 400))
  const afterLang = await js(`
    (() => {
      const rows = Array.from(document.querySelectorAll('#sv-flat-list > .row'));
      const ed = document.getElementById('sv-flat-editor');
      return {
        stillAfterSecond: !!(rows[1] && rows[1].nextElementSibling === ed),
        editorVisible: getComputedStyle(ed).display !== 'none',
        editBtnText: rows[0] ? rows[0].querySelector('button').textContent : null,
        pathText: document.getElementById('sv-flat-edit-path').textContent,
      };
    })()
  `)
  check('切语种重排列表后，编辑器仍贴在那一行正下方且可见', afterLang.stillAfterSecond === true && afterLang.editorVisible === true, JSON.stringify(afterLang))
  // 诊断：文案没跟着切时，先看"字典有没有换"和"列表有没有重建"
  const langDiag = await js(`({ locale: window.svi18n.getLocale(), dictSay: window.svi18n.t('settings.common.edit'), rows: document.querySelectorAll('#sv-flat-list > .row').length })`)
  check('「编辑」按钮文案跟着语种变', /Edit/.test(afterLang.editBtnText || ''), `按钮=${afterLang.editBtnText} · 诊断=${JSON.stringify(langDiag)}`)
  check('编辑中的文件名没被重排清掉', /info\.100a0\.nofs/.test(afterLang.pathText || ''), String(afterLang.pathText))
  // 切回中文，后面的中文断言才成立
  i18n.setLocale('zh-Hans')
  win.webContents.send('akdagent-i18n-update', { locale: 'zh-Hans', labels: i18n.LOCALE_LABELS, dict: i18n.dictFor('settings') })
  await new Promise((r) => setTimeout(r, 300))
  await js(`document.getElementById('sv-flat-edit-area').value = ${JSON.stringify(JSON.stringify(NOFS_OBJ, null, 2))}`)

  /* ②e 目录输入框留空 ⇒ 走系统目录选择器（用户 2026-09-14 要求），不再逼人手打路径 */
  const dirPick = await js(`
    (async () => {
      const before = document.querySelectorAll('[data-call]').length;
      window.svsettings.__setState({ pickedDir: 'C:/picked/SV/scripts' });
      document.getElementById('sv-dir-input').value = '';
      document.getElementById('btn-sv-add').click();
      await new Promise((r) => setTimeout(r, 250));
      const calls = Array.from(document.querySelectorAll('[data-call]')).slice(before).map((e) => e.dataset.call);
      return { calls, tip: document.getElementById('sv-dir-tip').textContent, input: document.getElementById('sv-dir-input').value };
    })()
  `)
  check('输入框留空 + 点添加 ⇒ 调起目录选择器', dirPick.calls.includes('pickDirectory'), JSON.stringify(dirPick.calls))
  check('选中的目录被加入配置', dirPick.calls.includes('addSvScriptsDir') && /C:\/picked\/SV\/scripts/.test(dirPick.input), dirPick.input)
  const dirCancel = await js(`
    (async () => {
      window.svsettings.__setState({ pickedDir: null });
      document.getElementById('sv-dir-input').value = '';
      document.getElementById('btn-sv-add').click();
      await new Promise((r) => setTimeout(r, 200));
      return document.getElementById('sv-dir-tip').textContent;
    })()
  `)
  check('选择器里点取消 ⇒ 有中性提示、不报错', /已取消/.test(dirCancel || ''), String(dirCancel))
  const dirBrowse = await js(`
    (async () => {
      const before = document.querySelectorAll('[data-call]').length;
      window.svsettings.__setState({ pickedDir: 'C:/picked/again/scripts' });
      document.getElementById('btn-sv-browse').click();
      await new Promise((r) => setTimeout(r, 250));
      return Array.from(document.querySelectorAll('[data-call]')).slice(before).map((e) => e.dataset.call);
    })()
  `)
  check('「浏览…」按钮同样调起选择器', dirBrowse.includes('pickDirectory') && dirBrowse.includes('addSvScriptsDir'), JSON.stringify(dirBrowse))

  /* ③ 校验：name 空 / 非十六进制 / 长度不对 / JSON 坏 */
  const tryAdd = async (dataV, nameV) => {
    await js(`
      (() => {
        document.getElementById('sv-flat-style-data').value = ${JSON.stringify(dataV)};
        document.getElementById('sv-flat-style-name').value = ${JSON.stringify(nameV)};
        document.getElementById('btn-sv-flat-add-style').click();
      })()
    `)
    await new Promise((r) => setTimeout(r, 120))
    return js(PROBE)
  }

  const before = (await js(PROBE)).textareaValue
  let r1 = await tryAdd(SAMPLE_DATA, '')
  check('name 空 ⇒ 报错且不加', /名称/.test(r1.styleTip || '') && r1.textareaValue === before, String(r1.styleTip))
  let r2 = await tryAdd('ZZZZ', 'X')
  check('非十六进制 ⇒ 报错且不加', /十六进制字符/.test(r2.styleTip || '') && r2.textareaValue === before, String(r2.styleTip))
  let r3 = await tryAdd('ABCD', 'X')
  check('长度不对 ⇒ 报错并指出应有/当前长度', /256/.test(r3.styleTip || '') && /4/.test(r3.styleTip || '') && r3.textareaValue === before, String(r3.styleTip))

  /* ④ 正常添加：小写 hex 应被规范成大写；只改文本框不落盘 */
  const r4 = await tryAdd(SAMPLE_DATA.toLowerCase(), 'Powerful')
  const parsed = JSON.parse(r4.textareaValue)
  const added = parsed.styles.find((s) => s.name === 'Powerful')
  check('正常添加 ⇒ styles 多一条', parsed.styles.length === 2, JSON.stringify(parsed.styles.map((s) => s.name)))
  check('data 规范成大写', added && added.data === SAMPLE_DATA, added && added.data.slice(0, 12))
  check('新条目只有 name/data 两个字段', added && Object.keys(added).sort().join(',') === 'data,name', added && Object.keys(added).join(','))
  check('原有条目未被动过', parsed.styles[0].name === '(base)' && parsed.styles[0].data === SAMPLE_DATA)
  check('添加后清空输入框', await js(`document.getElementById('sv-flat-style-data').value === '' && document.getElementById('sv-flat-style-name').value === ''`))
  check('提示要求点保存', /保存/.test(r4.styleTip || ''), String(r4.styleTip))
  check('未落盘（写文件只在点保存时发生）', (await js(`window.svsettings.__getWritten()`)) === null)

  /* ⑤ 重名拒绝 */
  const r5 = await tryAdd(SAMPLE_DATA, 'Powerful')
  check('重名 ⇒ 拒绝并提示改名', /已存在同名/.test(r5.styleTip || '') && JSON.parse(r5.textareaValue).styles.length === 2, String(r5.styleTip))

  /* ⑥ 顶层是数组时拒绝（不是对象） */
  await js(`document.getElementById('sv-flat-edit-area').value = '[1,2,3]'`)
  const r6 = await tryAdd(SAMPLE_DATA, 'Foo')
  check('顶层非对象 ⇒ 拒绝', /顶层必须/.test(r6.styleTip || ''), String(r6.styleTip))

  /* ⑦ 从现有 style 复制 —— **只允许同 vocoder**（用户 2026-09-14 强调） */
  const VOC_A = '92e5ef5b10e68bef3c1fb03c880e6be2'
  const VOC_B = '35222088c37134c7629d6873c0386d8d'
  const OTHER_PATH = 'C:/x/databases/POPY AI/info.101.nofs'
  const CROSS_PATH = 'C:/x/databases/Saki PLUS/info.100.nofs'
  const SRC_STYLE = { name: 'Powerful', data: SAMPLE_DATA, extra: 'AC6D42BE' }
  await js(`window.svsettings.__setState({
    nofsByPath: {
      [${JSON.stringify(OTHER_PATH)}]: { name: 'POPY AI', vocoder: ${JSON.stringify(VOC_A)}, styles: [${JSON.stringify(SRC_STYLE)}] },
      [${JSON.stringify(NOFS_PATH)}]: { name: 'ROSE AI', vocoder: ${JSON.stringify(VOC_A)}, styles: [{ name: '(base)', data: ${JSON.stringify(SAMPLE_DATA)} }] }
    },
    flatStyles: { ok: true, items: [
      { db: 'POPY AI', file: 'info.101.nofs', path: ${JSON.stringify(OTHER_PATH)}, vocoder: ${JSON.stringify(VOC_A)}, styles: ['Powerful', 'Mellow'] },
      { db: 'ROSE AI', file: 'info.101.nofs', path: ${JSON.stringify(NOFS_PATH)}, vocoder: ${JSON.stringify(VOC_A)}, styles: ['(base)'] },
      { db: 'Saki PLUS', file: 'info.100.nofs', path: ${JSON.stringify(CROSS_PATH)}, vocoder: ${JSON.stringify(VOC_B)}, styles: ['Bright', 'Dark'] }
    ] }
  })`)
  // 当前编辑的是 ROSE AI（vocoder = VOC_A）—— nofsByPath 上面已含两个文件的真实内容
  await js(`openFlatEditor(${JSON.stringify(NOFS_PATH)})`)
  await new Promise((r) => setTimeout(r, 350))

  const copyUi = await js(`
    (() => {
      const sel = document.getElementById('sv-flat-copy-src');
      const opts = Array.from(sel.querySelectorAll('option')).map((o) => o.textContent);
      const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => g.label);
      return { opts, groups, hint: document.getElementById('sv-flat-copy-hint').textContent, hasBtn: !!document.getElementById('btn-sv-flat-copy-style') };
    })()
  `)
  check('复制来源下拉存在且带按钮', copyUi.hasBtn === true)
  check('列表只含同 vocoder 的 style（跨 vocoder 的 Bright/Dark 不出现）',
    copyUi.opts.includes('Powerful') && copyUi.opts.includes('Mellow') && !copyUi.opts.includes('Bright') && !copyUi.opts.includes('Dark'),
    JSON.stringify(copyUi.opts))
  check('下拉按声库分组（optgroup = 声库名）', copyUi.groups.includes('POPY AI') && !copyUi.groups.includes('Saki PLUS'), JSON.stringify(copyUi.groups))
  check('提示写明"仅同 vocoder"及条数', /92e5ef5b/.test(copyUi.hint || '') && /2/.test(copyUi.hint || ''), String(copyUi.hint))

  // 选来源 → 自动预填新名字
  const prefill = await js(`
    (() => {
      const sel = document.getElementById('sv-flat-copy-src');
      sel.selectedIndex = 0;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { name: document.getElementById('sv-flat-copy-name').value, first: sel.value.split('\\u0000')[1] };
    })()
  `)
  check('选好来源 ⇒ 新名字预填为「源名 copy」', /copy$/.test(prefill.name) && prefill.first === 'Powerful', JSON.stringify(prefill))

  // 改名 + 复制 ⇒ data/extra 忠实带过来
  await js(`document.getElementById('sv-flat-copy-name').value = 'Powerful-custom'`)
  await js(`document.getElementById('btn-sv-flat-copy-style').click()`)
  await new Promise((r) => setTimeout(r, 350))
  const copied = await js(`({
    textarea: document.getElementById('sv-flat-edit-area').value,
    tip: document.getElementById('sv-flat-style-tip').textContent,
  })`)
  const afterCopy = JSON.parse(copied.textarea)
  const newEntry = afterCopy.styles.find((s) => s.name === 'Powerful-custom')
  check('复制成功 ⇒ 新条目进 styles', !!newEntry, JSON.stringify(afterCopy.styles.map((s) => s.name)))
  check('复制来的 data 与原 style 一致', newEntry && newEntry.data === SAMPLE_DATA)
  check('extra 也一起复制了', newEntry && newEntry.extra === 'AC6D42BE', newEntry && newEntry.extra)
  check('复制提示说明来源与总数', /Powerful/.test(copied.tip || '') && /保存/.test(copied.tip || ''), String(copied.tip))

  // 跨 vocoder 拦截：把当前 JSON 的 vocoder 改掉后再点复制 ⇒ 必须拒绝
  const crossTry = await js(`
    (async () => {
      const ta = document.getElementById('sv-flat-edit-area');
      const o = JSON.parse(ta.value);
      o.vocoder = ${JSON.stringify(VOC_B)};   // 手工改成另一个 vocoder
      ta.value = JSON.stringify(o, null, 2);
      const sel = document.getElementById('sv-flat-copy-src');
      sel.selectedIndex = 0;                  // 仍是旧来源（VOC_A 的 Powerful）
      document.getElementById('sv-flat-copy-name').value = 'CrossTry';
      document.getElementById('btn-sv-flat-copy-style').click();
      await new Promise((r) => setTimeout(r, 250));
      const after = JSON.parse(ta.value);
      return { tip: document.getElementById('sv-flat-style-tip').textContent, has: after.styles.some((s) => s.name === 'CrossTry') };
    })()
  `)
  check('vocoder 被改掉后复制被拒（点击时再校验）', crossTry.has === false && /vocoder 不同/.test(crossTry.tip || ''), String(crossTry.tip))

  // 没有 vocoder 字段 ⇒ 停用复制并给提示
  const noVoc = await js(`
    (async () => {
      const ta = document.getElementById('sv-flat-edit-area');
      const o = JSON.parse(ta.value);
      delete o.vocoder;
      ta.value = JSON.stringify(o, null, 2);
      renderCopySources();
      return { hint: document.getElementById('sv-flat-copy-hint').textContent, opts: document.querySelectorAll('#sv-flat-copy-src option').length };
    })()
  `)
  check('无 vocoder 字段 ⇒ 下拉清空 + 明确提示', noVoc.opts === 0 && /vocoder 字段/.test(noVoc.hint || ''), JSON.stringify(noVoc))

  /* ⑧ 保存：把文本框内容写到文件（桩记录 payload） */
  await js(`document.getElementById('sv-flat-edit-area').value = JSON.stringify(${JSON.stringify(NOFS_OBJ)}, null, 2)`)
  await js(`document.getElementById('btn-sv-flat-save').click()`)
  await new Promise((r) => setTimeout(r, 300))
  const written = await js(`window.svsettings.__getWritten()`)
  check('点保存 ⇒ 写出解析后的对象', written && written.name === 'ROSE AI' && Array.isArray(written.styles), JSON.stringify(written && Object.keys(written)))
  const tipAfterSave = (await js(PROBE)).tip
  check('保存后有成功提示（含备份路径）', /已保存/.test(tipAfterSave || ''), String(tipAfterSave))

  console.log('=== 断言 ===')
  for (const c of checks) console.log((c.ok ? '  ✅ ' : '  ❌ ') + c.name + (c.ok ? '' : ' → ' + c.detail))
  const rejs = await js(`Array.from(document.querySelectorAll('[data-rej]')).map((e) => e.dataset.rej + ': ' + e.dataset.stack.slice(0, 300))`)
  if (rejs.length) {
    console.log('=== 页面未捕获异常（调用栈） ===')
    for (const r of rejs) console.log('  ' + r.split('\n').slice(0, 4).join('\n    '))
  }
  console.log(`=== ${checks.length - failures.length}/${checks.length} 通过 ===`)
  if (failures.length) {
    console.log('失败项：')
    for (const f of failures) console.log(' - ' + f)
  }
  app.exit(failures.length ? 1 : 0)
})
