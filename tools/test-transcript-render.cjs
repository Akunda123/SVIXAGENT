#!/usr/bin/env node
/**
 * 导出记录渲染自测：把 main.js 里的 renderTranscript / ruleSummary 抽出来跑（纯函数，不需要 Electron/DSH）。
 *
 * 现在这两段都走 i18n（表头/角色名/中断/待办/文件名前缀），所以测试**逐语种**跑：
 *  ① 简/繁/英/日 四语下产物都对（工具行、参数、结果、失败、中断、待办、工程名、generation）；
 *  ② 英文产物里**不许出现汉字**（表头漏翻会立刻暴露）；
 *  ③ `ruleSummary()` 的挑行正则必须跟着表头语言走 —— 四语下都能挑到 `## 用户/助手` 那几行。
 *
 * 用法：node tools/test-transcript-render.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const ROOT = path.join(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'main.js'), 'utf8')

// ⚠️ 防"测到影子副本"：这份测试是**按区块切源码**出来跑的，若 main.js 里存在重复定义
// （同名函数声明两次时后者生效），切出来的可能是被遮蔽的那一份 ⇒ 测试假绿。
// 2026-09-13 真踩过：旧的非本地化 ruleSummary 留在文件里遮蔽了新版本，测试仍全绿，靠残留扫描才发现。
for (const fn of ['renderTranscript', 'ruleSummary', 'eventText', 'toolResultText']) {
  const n = (src.match(new RegExp(`function ${fn}\\s*\\(`, 'g')) || []).length
  if (n !== 1) {
    console.log(`❌ main.js 里 ${fn} 有 ${n} 处定义（应为 1）——测试会取到不确定的那一份`)
    process.exit(2)
  }
}

const start = src.indexOf('function eventText')
const end = src.indexOf('/** 取某段的历史文本')
if (start < 0 || end < 0) {
  console.log('❌ 没找到 renderTranscript 区块（main.js 结构变了？）')
  process.exit(2)
}
// 区块里现在还有 escapeRe / ruleSummary，一并带出来测
const code = src.slice(start, end).replace(/\bconst clip =/, 'var clip =').replace(/\bconst head =/, 'var head =')
const i18n = require(path.join(ROOT, 'electron', 'src', 'i18n'))
i18n.init({
  getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-transcript-')),
  getSystemLocale: () => 'zh-CN',
  getLocale: () => 'zh-CN',
})
const mod = new Function('i18n', code + '; return { renderTranscript, ruleSummary };')(i18n)

const evs = [
  { type: 'user/message', data: { message: { content: [{ type: 'text', text: '帮我把这段音高修一下' }] } } },
  { type: 'tool/call', data: { name: 'mcp__sv__sv_run_script', arguments: '{"code":"local p = SV:getProject()"}' } },
  { type: 'tool/result', data: { message: { content: [{ type: 'text', text: '{"ok":true,"curves":7}' }] } } },
  { type: 'tool/call', data: { name: 'mcp__sv__sv_playback', arguments: '{"action":"play"}' } },
  { type: 'tool/result', data: { message: { content: [{ type: 'text', text: 'no bridge' }] }, error: { name: 'ToolError', code: 'NO_BRIDGE' } } },
  { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '改好了：新增 7 条曲线（播放那步桥不在，跳过）' }] } } },
  { type: 'turn/end', data: { reason: { kind: 'interrupted' } } },
  { type: 'todo/write', data: { todos: [{ status: 'completed', text: '修音高' }, { status: 'pending', text: '听感验收' }] } },
]
const seg = { segId: 's001', projectKey: 'abc123', projectName: 'C:/x/1.svp', gen: 2 }

let pass = 0
let fail = 0
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('  [ok]   ' + n) }
  else { fail++; console.log('  [FAIL] ' + n + (extra ? ' → ' + extra : '')) }
}

const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja']
for (const locale of LOCALES) {
  i18n.setLocale(locale)
  const t = (k, ...a) => i18n.t(k, ...a)
  const md = mod.renderTranscript(evs, seg)
  if (locale === 'zh-Hans') {
    console.log('--- 导出样例（zh-Hans）---')
    console.log(md)
  }

  ok(`[${locale}] 表头用当前语种`, md.includes(t('main.export.title')) && md.includes(t('main.export.roleUser')), t('main.export.title'))
  ok(`[${locale}] 含工具名与参数摘要`, md.includes('mcp__sv__sv_run_script') && md.includes('SV:getProject()'))
  ok(`[${locale}] 含工具结果与失败标记`, md.includes('↳') && md.includes('curves') && md.includes('❌') && md.includes('NO_BRIDGE'))
  ok(`[${locale}] 含用户/助手正文`, md.includes('帮我把这段音高修一下') && md.includes('改好了'))
  ok(`[${locale}] 含中断标记（本地化）`, md.includes(t('main.export.interrupted')), t('main.export.interrupted'))
  ok(`[${locale}] 含待办清单（本地化）`, md.includes(t('main.export.todos')) && md.includes('[pending]'), t('main.export.todos'))
  ok(`[${locale}] 表头含工程名与 generation`, md.includes('1.svp') && md.includes('g2'))
  ok(`[${locale}] 长参数被截断`, !md.includes('x'.repeat(400)))

  // 英文产物里出现汉字 = 表头/标签漏翻
  if (locale === 'en') {
    const han = (md.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || [])
    // 正文里的中文是**对话内容**（数据），只检查"表头/标签"部分：取 `---` 之前 + 角色行 + 中断/待办行
    const header = md.slice(0, md.indexOf('---'))
    const labels = [t('main.export.roleUser'), t('main.export.roleAssistant'), t('main.export.interrupted'), t('main.export.todos')].join('\n')
    ok('[en] 表头与标签无汉字（正文是数据，允许）',
      !/[\u3400-\u4dbf\u4e00-\u9fff]/.test(header + labels),
      (header + labels).slice(0, 120) + ` (全文汉字 ${han.length} 个，均为对话正文)`)
  }

  // ruleSummary 的挑行正则必须与表头语言一致（改表头不改正则 = 挑不到行）
  const rs = mod.ruleSummary(md)
  const pickedUser = rs.includes(t('main.export.roleUser'))
  const pickedAsst = rs.includes(t('main.export.roleAssistant'))
  ok(`[${locale}] ruleSummary 能挑到用户/助手行（正则跟随语言）`, pickedUser && pickedAsst,
    pickedUser ? '只挑到一半' : '一行都没挑到')
  ok(`[${locale}] ruleSummary 带本地化表头`, rs.startsWith(t('main.summary.ruleHeader')), rs.slice(0, 60))
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
