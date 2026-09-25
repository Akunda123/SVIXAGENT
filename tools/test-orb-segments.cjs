#!/usr/bin/env node
/**
 * 段表逻辑单测（纯 Node，不需要 Electron / DSH / 桥）
 * 覆盖 docs/聊天记录归属设计.md 里用户裁定的场景：
 *   · 场景1：1.svp 聊 A → 本次未加载工程聊 B → 打开工程聊 C ⇒ 全部归 1.svp（临时段过继）
 *   · 场景2：1.svp 聊 A → 切 2.svp 聊 B ⇒ 显示两段、A 归 1、B 归 2
 *   · 场景3：导出后换 generation（旧段不再喂模型，显示仍连续）
 *   · 场景4：手动新会话 = 同工程内插一段（kind=manual-split）
 *   · 场景5：临时段不建工程归属、切回旧工程复用最后一个 generation
 * 用法：node tools/test-orb-segments.cjs
 */
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name) }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orb-seg-'))
const S = require(path.join(__dirname, '..', 'electron', 'src', 'orb-segments.js'))
S.init(path.join(tmp, 'orb-segments.json'))

const K1 = 'c:/work/1.svp'
const K2 = 'c:/work/2.svp'

console.log('场景1：临时段被工程"过继"')
{
  S.ensureSegment()                       // 未加载工程就聊 → 临时段
  const seg = S.activeSegment()
  ok('临时段 projectKey=null · kind=temp', seg.projectKey === null && seg.kind === 'temp', seg)
  ok('临时会话 id = akdagent-orb-temp-g1（开段即占号并定 id）', seg.sessionId === 'akdagent-orb-temp-g1', seg.sessionId)
  ok('开段尚未在 DSH 创建（sessionReady=false）', seg.sessionReady === false, seg.sessionReady)
  S.registerSession(seg.segId)            // ensureOrbSession 建好之后调它

  // 打开工程 → 原地过继（同一段、同一会话，零复制）
  const r = S.noteProject(K1)
  ok('过继后就地改归属（retagged=true）', r.retagged === true, r)
  ok('段 id 不变（显示连续）', r.seg.segId === seg.segId, r.seg.segId)
  ok('会话 id 不变（模型上下文连续）', r.seg.sessionId === 'akdagent-orb-temp-g1', r.seg.sessionId)
  ok('归属改为 1.svp', r.seg.projectKey === K1, r.seg.projectKey)
  ok('1.svp 的 generation 记为 1', S.lastGen(K1) === 1, S.lastGen(K1))
}

console.log('场景2：切到 2.svp ⇒ 新段，显示两段')
{
  const r = S.noteProject(K2)
  ok('切工程产生新段（switched=true）', r.switched === true, r)
  ok('新段归属 2.svp', r.seg.projectKey === K2, r.seg.projectKey)
  const segs = S.displaySegments()
  ok('共 2 段（1.svp 段仍在）', segs.length === 2, segs.length)
  ok('第一段仍是 1.svp 且会话未变',
    segs[0].projectKey === K1 && segs[0].sessionId === 'akdagent-orb-temp-g1', segs[0])
  ok('2.svp 会话 id 安全（路径被压成 hash / 不含斜杠冒号）',
    r.seg.sessionId.startsWith('akdagent-orb-') && !/[/:\\]/.test(r.seg.sessionId), r.seg.sessionId)
  S.registerSession(r.seg.segId)
}

console.log('场景5：切回 1.svp ⇒ 复用最后一个 generation（不新开）')
{
  const r = S.noteProject(K1)
  ok('切回 1.svp 是新段（显示连续）', r.switched === true && r.seg.projectKey === K1, r)
  ok('1.svp 的 gen 累加到 2（每开一段就占一个号，防撞车）', S.lastGen(K1) === 2, S.lastGen(K1))
  ok('两个工程各自独立计数', S.lastGen(K1) === 2 && S.lastGen(K2) === 1, { k1: S.lastGen(K1), k2: S.lastGen(K2) })
}

console.log('场景3：导出后换 generation（旧段不再喂模型）')
{
  const seg = S.activeSegment()
  S.setSegmentEnd(seg.segId, 40)
  S.markExported(seg.segId, 40, 'c:/work/AKDAgent会话-1-20260913.md')
  const after = S.activeSegment()
  ok('导出点被记录', after.exportedUpToSeq === 40 && !!after.exportedFile, after)
  const newSeg = S.openSegment(K1, 'project')
  S.requestSummary(newSeg.segId, true)
  ok('新段要求注入摘要', S.activeSegment().pendingSummary === true, S.activeSegment())
  ok('新段 gen = 3（换 generation）', S.activeSegment().gen === 3, S.activeSegment().gen)
  ok('旧段仍可显示（displaySegments 包含它）',
    S.displaySegments().some((x) => x.exportedUpToSeq === 40), S.displaySegments().length)
}

console.log('场景4：手动新会话 = 同工程内插一段')
{
  const seg = S.activeSegment()
  S.registerSession(seg.segId)
  const manual = S.openSegment(K1, 'manual-split')
  ok('手动新会话是同工程的新段', manual.projectKey === K1 && manual.kind === 'manual-split', manual)
  ok('段数继续累加（显示不会断）', S.displaySegments().length === 5, S.displaySegments().length)
  ok('手动段的会话 id 不与上一段撞车', manual.sessionId !== seg.sessionId, { prev: seg.sessionId, manual: manual.sessionId })
  S.registerSession(manual.segId)
}

console.log('seq → 段归属')
{
  const segs = S.displaySegments()
  const last = segs[segs.length - 1]
  const seg = S.findSegmentBySeq(last.sessionId, 5)
  ok('能按 (sessionId, seq) 找到段', !!seg && seg.segId === last.segId, seg)
  ok('未知 seq 落到最后一段（新事件兜底）', S.findSegmentBySeq(last.sessionId, 999).segId === last.segId)
}

console.log('持久化：写盘后可重新加载（崩溃/重启不丢归属）')
{
  S.save()
  const file = path.join(tmp, 'orb-segments.json')
  ok('状态文件存在', fs.existsSync(file))
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  ok('文件里含 5 段 + active', raw.segments.length === 5 && !!raw.active, raw.segments.length)
  const S2 = require(path.join(__dirname, '..', 'electron', 'src', 'orb-segments.js'))
  S2.init(file)
  ok('重新加载后活动段一致', S2.activeSegment().segId === S.activeSegment().segId)
  ok('重新加载后 gens 保留（K1 已消耗到 4：切回2 → 导出3 → 手动4）', S2.lastGen(K1) === 4, S2.lastGen(K1))
}

console.log('\n场景6：导出范围 = 工程全部段 + 紧邻其在先的未归属临时段（用户 2026-09-19 裁定）')
console.log('（背景：球上时间线是 displaySegments()=全部段，而导出原先只取 activeSegment() ⇒ 屏幕上有、导出没有）')
{
  S.init(path.join(tmp, 'export-scope.json'))
  S.ensureSegment()                        // A：临时段（未命名期）
  const A = S.activeSegment()
  S.openSegment(null, 'manual-split')      // B：又一个临时段
  const B = S.activeSegment()
  S.noteProject(K1, 'C:\\work\\1.svp')     // 保存工程 ⇒ B 被收编（只收活动那一个）
  const B2 = S.activeSegment()
  ok('收编后活动段就是 B（原地过继、会话不变）', B2.segId === B.segId && B2.projectKey === K1, B2.projectKey)
  S.openSegment(K1, 'project')             // C：K1 的新 generation
  const C = S.activeSegment()

  let got = S.exportSegments().map((s) => s.segId)
  ok('★ 导出 = 未归属 A + 工程段 B,C（按时间序）',
    JSON.stringify(got) === JSON.stringify([A.segId, B.segId, C.segId]), got)

  S.openSegment(K2, 'project')             // D：另一个工程
  const D = S.activeSegment()
  got = S.exportSegments().map((s) => s.segId)
  ok('★ 切到 K2 后只导 K2 的段，不含 K1 的', JSON.stringify(got) === JSON.stringify([D.segId]), got)

  S.openSegment(K1, 'project')             // E：切回 K1（新 gen）
  const E = S.activeSegment()
  got = S.exportSegments().map((s) => s.segId)
  ok('★ 切回 K1 ⇒ 它的**全部**段都在（B,C,E），仍带前面的临时段 A，且不含 K2 的 D',
    JSON.stringify(got) === JSON.stringify([A.segId, B.segId, C.segId, E.segId]), got)

  const n = S.adoptSessions(['akdagent-orb-no-project', 'akdagent-orb-summary-zzz', A.sessionId, 'not-an-orb-id'])
  ok('★ 孤儿登记：只收 akdagent-orb-*，排除 summary、排除已在段表里的、排除非 orb（实收 ' + n + '）', n === 1, n)
  got = S.exportSegments().map((s) => s.segId)
  ok('★ 孤儿插在**最前**（它最早）⇒ 导出带上它，顺序仍是时间序（共 ' + got.length + ' 段）', got.length === 5, got)
  ok('孤儿段 kind=orphan 且未归属',
    S.displaySegments()[0].kind === 'orphan' && S.displaySegments()[0].projectKey === null,
    S.displaySegments()[0])

  S.openSegment(null, 'temp')              // F：又变成未归属
  const F = S.activeSegment()
  S.openSegment(null, 'manual-split')      // G
  const G = S.activeSegment()
  got = S.exportSegments().map((s) => s.segId)
  ok('★ 活动段本身就是临时段 ⇒ 取"以它结尾的连续未归属串"（F,G），不牵连前面的工程段',
    JSON.stringify(got) === JSON.stringify([F.segId, G.segId]), got)
}

console.log('\n场景7：导出链路的源码级断言（钉住静默 bug，不连宿主）')
console.log('（`session.history` 的形状是 {event:{…seq…}} ⇒ seq 在**内层**；旧代码取 x.seq ⇒ 恒为 0）')
{
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'src', 'main.js'), 'utf8')
  ok('★ 导出用成组范围 orbSegments.exportSegments()（不再只取 activeSegment）',
    /const segs = orbSegments\.exportSegments\(\)/.test(main))
  ok('★ 多段渲染 renderTranscriptMulti 存在且被调用', /function renderTranscriptMulti\(/.test(main)
    && /renderTranscriptMulti\(parts, cur\)/.test(main))
  ok('★ seq 从**内层 event** 取（`typeof ev.seq === \'number\'`）', /typeof ev\.seq === 'number'/.test(main))
  ok('⚠️ 回归：不再出现 `typeof x.seq === \'number\'`（那是恒为 0 的旧写法）',
    !/typeof x\.seq === 'number'/.test(main))
  ok('★ 被导出的**每一段**都标 markExported（循环，不是只标一段）',
    /for \(const p of parts\) orbSegments\.markExported\(/.test(main))
  ok('★ 启动时登记段表外的孤儿会话 adoptOrphanSessions()',
    /function adoptOrphanSessions\(/.test(main) && /^\s*adoptOrphanSessions\(\)/m.test(main))
  ok('孤儿登记排除 akdagent-orb-summary-*（一次性摘要会话不算段）',
    /akdagent-orb-summary-/.test(fs.readFileSync(path.join(__dirname, '..', 'electron', 'src', 'orb-segments.js'), 'utf8')))
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* 忽略 */ }
process.exit(fail ? 1 : 0)
