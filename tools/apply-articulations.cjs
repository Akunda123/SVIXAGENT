#!/usr/bin/env node
/**
 * **段落级技法批量开关 + 走向规则**（2026-09-21 立项；用户要求"段落级批量开关做"）
 *
 * ⚠️ 本文件**只做命令行外壳**：参数解析 + 打印 + （可选）落盘。
 *    **规则引擎与 Lua 片段全部来自 `server/dist/articulations/engine.js`** ——
 *    与 MCP 工具 `sv_apply_articulations`（`server/src/articulations/`）**共用同一份实现**，
 *    不许在这里再抄第二遍规则（抄一份就会漂移一份）。改规则请改
 *    `skills/sv-ix/references/articulation-{matrix,rules}.json`（单一事实源）。
 *
 * 依据（都在技能里，本工具只执行、不发明）：
 *   · `skills/sv-ix/references/articulation-matrix.json` —— 支持集 + **全局互斥图**（写入前消解冲突）
 *   · `skills/sv-ix/references/articulation-rules.json` —— 安全规则（默认不写 / 跳过 fixed / 只写支持的 / 互斥消解 / 每音符 1 个）
 *   · 路线 A：**只覆盖少数**，其余音符保持 `articulationsFixed=false`（宿主 Smart Articulation 继续管）
 *
 * 用法：
 *   # 段落级（v1 主力）：把某段的弦乐/铜管开关统一设成一个值
 *   node tools/apply-articulations.cjs --segment "beats=16-40,Pizz."            # dry-run（默认）
 *   node tools/apply-articulations.cjs --segment "phrases=2,Con Sordino" --apply
 *   # 走向规则（10 条，见 rules.md）：先出计划，你点头再写
 *   node tools/apply-articulations.cjs --rules --style Adagio                   # dry-run
 *   node tools/apply-articulations.cjs --rules --style Adagio --apply
 *   公共参数：--host ix · --group <组名>（省略=当前组）· --force（连 articulationsFixed=true 的也改）· --json · --out <file>
 *
 * ⚠️ 纪律：只动**技法**（`setArticulations`），不碰音符位置/音高/力度；写前 `newUndoRecord()`；
 *    默认 dry-run；`--apply` 才落盘，且写完**回读校验**并打印逐音符变化。
 * ⚠️ v1 边界：段落指认只支持 **beats=A-B**（四分音符拍，组内局部时间）与 **phrases=1,3**（按《缺口》切）；
 *    **bars= 暂不支持**（需要小节表，留 v2）。
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const argv = process.argv.slice(2)
const FLAG = (n) => argv.includes(n)
const OPT = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const ALL = (n) => argv.reduce((a, v, i) => (v === n ? a.concat([argv[i + 1]]) : a), [])
const HOST = OPT('--host') || 'ix'
const APPLY = FLAG('--apply')
const FORCE = FLAG('--force')
const AS_JSON = FLAG('--json')
const GROUP = OPT('--group')
const OUT = OPT('--out')

let ipc, engine
try {
  ipc = require(path.join(ROOT, 'server', 'dist', 'fileipc.js'))
  // Node ≥ 22 支持 require() 直接吃 ESM（引擎无顶层 await）⇒ 与 MCP 工具共用同一份规则实现
  engine = require(path.join(ROOT, 'server', 'dist', 'articulations', 'engine.js'))
} catch (e) {
  console.error('[FAIL] 载入 server/dist 失败：' + e.message + '\n  先构建：npm --prefix server run build')
  process.exit(2)
}

const QUARTER = engine.QUARTER
const run = (code, readonly) => ipc.fileIpcSend('run_script', { code, readonly: !!readonly }, { host: HOST, timeoutMs: 20000 })

;(async () => {
  try {
    const segments = ALL('--segment')
    const wantRules = FLAG('--rules')
    if (!segments.length && !wantRules) {
      console.error('用法：--segment "beats=A-B,技法" / --segment "phrases=1,3,技法" / --rules [--style Adagio]')
      process.exit(2)
    }

    // ① 读组（readonly：只切当前轨/当前组）
    const r0 = await run(engine.fetchGroupCode(GROUP), true)
    const data = engine.unwrapResult(r0)
    if (!data || !data.notes) throw new Error('读组失败：' + JSON.stringify(r0).slice(0, 200))
    const notes = data.notes
    const supported = data.supported || []

    // ② 算（引擎里；与 MCP 工具同一份）
    const { matrix, rules } = engine.loadArticulationData()
    const style = OPT('--style') || '(default)'
    const planned = engine.plan({ notes, matrix, rules, supported, style, segments, wantRules, force: FORCE })

    if (planned.errors.length) {
      for (const e of planned.errors) console.error('[FAIL] ' + e)
      process.exit(planned.errors.some((e) => /只支持|缺技法/.test(e)) ? 2 : 1)
    }

    const targets = planned.targets
    if (!AS_JSON) {
      const stats = { toWrite: targets.length, skipped: planned.entries.length - targets.length }
      console.log('== 计划（' + (APPLY ? '即将写入' : 'dry-run，未写入') + '）==')
      console.log('组=' + data.group + '  音符=' + notes.length + '  乐句=' + planned.phraseCount +
        (planned.hasGap ? '' : '（无缺口 ⇒ 不做乐句级规则）') + '  支持集 ' + supported.length + ' 项' +
        '  风格档=' + planned.tierKey)
      for (const p of planned.entries) {
        if (p.skip) console.log('  note#' + p.index + (p.rule ? ' [' + p.rule + ']' : '') + ' 跳过：' + p.skip)
        else console.log('  note#' + p.index + ' pitch=' + p.pitch + ' phrase=' + p.phrase +
          (p.rule ? ' [' + p.rule + ']' : '') + '  ' +
          JSON.stringify(p.before) + ' -> ' + JSON.stringify(p.set) +
          (((p.remove || []).length) ? '（剔除冲突 ' + p.remove.join(',') + '）' : '') + (p.why ? '  ← ' + p.why : ''))
      }
      console.log('将写 ' + stats.toWrite + ' 个音符；跳过 ' + stats.skipped + ' 个')
    }

    if (!APPLY) {
      const payload = {
        group: data.group, dryRun: true, style: planned.style, tierKey: planned.tierKey, tier: planned.tier,
        hasGap: planned.hasGap, phraseCount: planned.phraseCount, supported,
        notes: [...notes].sort((a, b) => a.onset - b.onset).map((n) => ({
          index: n.index, onsetBeats: n.onset / QUARTER, durBeats: n.dur / QUARTER,
          pitch: n.pitch, phrase: n.phrase, fixed: n.fixed, arts: n.arts,
        })),
        plan: planned.entries, targets: targets.length,
      }
      if (OUT) fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
      if (AS_JSON) console.log(JSON.stringify(payload, null, 2))
      else console.log('\n（dry-run：加 --apply 才真写；写前自动 newUndoRecord()' + (OUT ? '；计划已写 ' + OUT : '') + '）')
      process.exit(0)
    }

    // ③ 写 + 回读
    const r1 = await run(engine.applyCode(targets.map((t) => ({ index: t.index, set: t.set })), GROUP), false)
    const res = engine.unwrapResult(r1)
    if (!res || !res.ok) throw new Error('写入失败：' + JSON.stringify(r1).slice(0, 300))
    if (AS_JSON) console.log(JSON.stringify({ group: res.group, applied: targets.length, log: res.log }))
    else {
      console.log('\n== 写入结果（已回读）==')
      for (const l of res.log) console.log('  note#' + l.index + ' writeOk=' + l.writeOk + ' 回读=[' + l.readback + '] fixed=' + l.fixed)
      const bad = (res.log || []).filter((l) => !l.writeOk || !l.readback)
      if (bad.length) console.error('[WARN] ' + bad.length + ' 个音符回读为空（note#' + bad.map((b) => b.index).join(',') + '）—— 多半该轨不支持或互斥被宿主回滚')
      console.log('共写 ' + res.log.length + ' 个音符（可 Ctrl+Z 撤销）')
    }
    process.exit(0)
  } catch (e) {
    console.error('[FAIL] ' + e.message)
    process.exit(1)
  }
})()
