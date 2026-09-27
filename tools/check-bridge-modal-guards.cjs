#!/usr/bin/env node
/**
 * 守卫：**宿主模态脚本错误框**这一类事故的三道防线（2026-09-27 立 · 用户真机反馈后）
 *
 * 事故（用户电脑）：SV 弹出**模态**框
 *   `脚本 'AKDAgent Bridge (Lua)' 出现错误：setAttributes: 无效的输入类型。`
 * 该框由宿主 C 侧在**实参转换阶段**弹出 ⇒ `pcall` 拦不住（同 SV-001 的机制）；框一弹
 * 宿主主线程停 ⇒ 桥的轮询链停（心跳不再更新、之后**每笔请求都超时**），而 Lua 侧
 * **一行日志都写不出来**（`respond` 从未落盘）⇒ 事后完全不知道是哪一笔请求干的。
 *
 * 所以这里守三件事（缺一件就等于"下次还得靠猜"）：
 * ① **预防**：`run_script` 进宿主之前预检「点调用（JS 写法）」与「属性 API 的字面量实参」；
 *    属性类 op 按**宿主**加闸（`phonemes` 只有 SV2 有、`dur` 只有 SV1 有）+ 值清洗（非数不递）。
 *    ⚠️ 预检必须发生在 **`load()` 之前**（否则脚本已经在宿主里跑了）。
 * ② **取证**：每笔请求执行前落盘 `akdagent-lastop-<host>.json`（`stage="running"`）、跑完改 stage。
 *    被冻住时该文件停在 `running` ⇒ 直接指名肇事 op + 参数摘要。
 * ③ **恢复指引**：服务端诊断/报错里带上「关掉错误框 → Ctrl+S 保存工程 → 重跑桥」，
 *    以及 `run_script` 的工具描述里对 AI 的两条硬纪律（不许点调用、属性 API 按宿主分流）。
 *
 * 用法：node tools/check-bridge-modal-guards.cjs
 *   `--lua/--tests/--fileipc/--protocol/--tools <路径>` 指向修复前的文件做**反向验证**（应 FAIL）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const pick = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : path.join(ROOT, dflt);
};
const LUA = pick('--lua', 'sv/lua/AKDAgentBridge.lua');
const TESTS = pick('--tests', 'sv/lua/tests/test-ops.lua');
const FILEIPC = pick('--fileipc', 'server/src/fileipc.ts');
const PROTOCOL = pick('--protocol', 'server/src/protocol.ts');
const TOOLS = pick('--tools', 'server/src/tools.ts');

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);
const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const has = (t, s) => t.indexOf(s) >= 0;

const lua = readIf(LUA);
const tests = readIf(TESTS);
const fileipc = readIf(FILEIPC);
const protocol = readIf(PROTOCOL);
const tools = readIf(TOOLS);

for (const [name, p, t] of [['桥', LUA, lua], ['离线自测', TESTS, tests], ['fileipc', FILEIPC, fileipc],
  ['protocol', PROTOCOL, protocol], ['tools.ts', TOOLS, tools]]) {
  if (!t) { console.log('  [FAIL] 读不到 ' + name + '：' + p); process.exit(1); }
}
console.log('检查 ' + path.relative(ROOT, LUA) + ' 等 ' + 5 + ' 个文件');

// ============================================================================
console.log('\n== ① 预防·A：run_script 预检（点调用 / 属性 API 的字面量实参）==');
{
  for (const [name, sig] of [
    ['GATE.checkCallForm()', 'function GATE.checkCallForm(code)'],
    ['GATE.checkAttrArgs()', 'function GATE.checkAttrArgs(code)'],
  ]) {
    if (has(lua, sig)) ok('有 ' + name);
    else fail('缺少 ' + name + ' ⇒ 点调用/坏实参仍会直达宿主、弹模态框');
  }
  // 点调用的判据必须是「前缀 + 查表」：**Lua 模式没有 `|` 交替**（第一版就是照 JS 正则写成
  // `(create|add|…)`，于是永远匹配不上 ⇒ 这个坑必须有守卫盯着，见 ⑥）。
  if (has(lua, 'GATE.DOT_VERBS = { create = true')) ok('点调用动词用查表（不是 Lua 模式里的 `|` 交替）');
  else fail('缺少 GATE.DOT_VERBS ⇒ 点调用判据可能又写成 Lua 不支持的 `|` 交替');
  if (/GATE\.DOT_OK = \{[\s\S]{0,400}?math = true/.test(lua)) ok('有 DOT_OK 白名单（math/string/table/os/io/SVH 不误伤）');
  else fail('缺少 DOT_OK 白名单 ⇒ 标准库点调用会被误拦');

  const iForm = lua.indexOf('local formErr = GATE.checkCallForm(code)');
  const iArg = lua.indexOf('local argErr = GATE.checkAttrArgs(code)');
  const iErrF = lua.indexOf('⛔ 调用形式预检未通过');
  const iLoad = lua.indexOf('fn, cerr = load(code, "akdagent_script", "t", env)');
  if (iForm < 0 || iArg < 0) fail('run_script 里没有调用预检');
  else if (iErrF < 0) fail('预检结果没有 error() 出去（等于没拒）');
  else if (iLoad > 0 && (iForm > iLoad || iArg > iLoad)) fail('预检发生在 load() 之后 ⇒ 脚本已经在宿主里跑过了，来不及');
  else ok('预检在 load() 之前（脚本不会进宿主）');
}

console.log('\n== ① 预防·B：属性 op 的宿主闸门 + 值清洗（别把宿主没有的字段递过去）==');
{
  if (has(lua, 'refused = "sv1-no-phonemes"') && /if not ST\.isSV2 then[\s\S]{0,400}?sv1-no-phonemes/.test(lua)) {
    ok('SV1 上写 phonemes ⇒ 明确拒绝（sv1-no-phonemes）');
  } else fail('set_note_phoneme_attrs 没有 SV1 闸门 ⇒ phonemes 会直达 SV1 → 模态框');
  if (/sv1-no-phonemes[\s\S]{0,300}?set_note_dur/.test(lua)) ok('拒绝时给出替代品（set_note_dur）');
  else fail('拒绝时没给替代路线（调用方只会看到"失败"）');

  if (has(lua, 'refused = "sv2-no-dur"') && /if ST\.isSV2 then[\s\S]{0,400}?sv2-no-dur/.test(lua)) {
    ok('SV2/IX 上写 dur ⇒ 明确拒绝（sv2-no-dur）');
  } else fail('set_note_dur 没有 SV2/IX 闸门 ⇒ dur 会直达 SV2 → 模态框');
  if (/sv2-no-dur[\s\S]{0,300}?set_note_phoneme_attrs/.test(lua)) ok('拒绝时给出替代品（set_note_phoneme_attrs）');
  else fail('拒绝时没给替代路线');

  if (has(lua, 'function GATE.cleanPhonemes(ph)') && has(lua, 'local phClean, dropped = GATE.cleanPhonemes(ph)')) {
    ok('phonemes 值清洗（非数剔掉）并用于 setAttributes');
  } else fail('phonemes 没有值清洗 ⇒ 字符串值会直达宿主 → 模态框');
  if (/durClean[\s\S]{0,600}?nt:setAttributes\(\{ dur = durClean \}\)/.test(lua)) ok('dur 值清洗（非数折成 nil）并用于 setAttributes');
  else fail('dur 没有值清洗');
  if (has(lua, 'droppedFields') && has(lua, '数组长度不变')) ok('清洗结果如实回报（droppedFields；数组长度不变）');
  else fail('剔掉的值没有回报 ⇒ 调用方以为写全了');

  if (has(lua, 'local payloadDropped, payloadApplied = {}, {}') && has(lua, 'attrPayloadDropped =')) {
    ok('write_chords 逐音载荷：被剔掉的属性如实回报');
  } else fail('write_chords 的 dynamic/articulations 没有清洗+回报');
  if (has(lua, 'type(src.articulations) == "string"') && has(lua, 'arts = { src.articulations }')) {
    ok('articulations 传单个字符串 ⇒ 包成数组（AI 常这么给）');
  } else fail('articulations 传字符串会被静默忽略（少了技法却没人知道）');
  if (/local dynN = tonumber\(src\.dynamic\)[\s\S]{0,400}?elseif dynN ~= nil then/.test(lua)) {
    ok('dynamic 非数**不递**宿主（原先 tonumber 得 nil 照样递 ⇒ 模态框）');
  } else fail('dynamic 没有"非数不递"的保护');
}

// ============================================================================
console.log('\n== ① 预防·C：setAttributes **内容**按官方文档检测（用户 2026-09-27 指定 · IX 豁免）==');
{
  // 事实源 = 官方镜像 skills/sv-scripting/api/Note.md 的 Note#getAttributes（setAttributes 的字段定义）
  for (const [label, sig] of [
    ['字段表 GATE.ATTR_TYPE', 'GATE.ATTR_TYPE = {'],
    ['宿主归属（version 1 组）', 'GATE.ATTR_SV1_ONLY = {'],
    ['宿主归属（since 2.1.1 组）', 'GATE.ATTR_SV2_ONLY = {'],
    ['扩展键表（articulations/dynamic 等自用键）', 'GATE.ATTR_EXTRA = {'],
    ['内容检查入口 checkAttrTables', 'function GATE.checkAttrTables(code, sv2, isIx)'],
    ['注释剥离（字符串里的 -- 不算注释）', 'function GATE.stripLuaComments(code)'],
    ['表体顶层切分', 'function GATE.splitTopLevel(s)'],
  ]) {
    if (has(lua, sig)) ok('有 ' + label);
    else fail('缺少 ' + label);
  }
  if (/function GATE\.checkAttrTables\(code, sv2, isIx\)\s*\n\s*if isIx then return nil, nil end/.test(lua)) {
    ok('**IX 整体豁免**（用户口径：IX 无官方文档、另有文档外键 ⇒ 拿 SV 文档卡它只会误伤）');
  } else fail('IX 没有豁免 ⇒ 会误伤 IX 的 toneShift/pitchDelta/articulations 等文档外键');
  if (has(lua, 'skills/sv-scripting/api/Note.md')) ok('事实源写明是官方文档（Note#getAttributes）');
  else fail('没写事实源 ⇒ 以后没人知道这张表该跟谁对齐');
  if (has(lua, 'akdagent:allow-extra-attrs')) ok('留了逃逸口（未知键降级为警告；类型错仍拦）');
  else fail('没有逃逸口 ⇒ 未文档化但可用的键会被一律拒死');
  if (has(lua, '值类型不对') && has(lua, '不在官方') && has(lua, '不属于本宿主') && has(lua, '不是数')) {
    ok('四类判据齐全（未知键 / 宿主不对 / 类型不对 / 数组元素不是数）');
  } else fail('判据不全（未知键 / 宿主不对 / 类型 / 元素至少四类）');
  if (has(lua, 'GATE.attrEntriesIn(') && /attrEntriesIn\((G|GATE)\.stripLuaComments\(src\)\)/.test(tests)) {
    ok('有 attrEntriesIn()，且离线自测用它做**自洽性**检查（桥自己的写入字面量必须是文档里的键）');
  } else fail('缺少 attrEntriesIn() 或自洽性检查 ⇒ 桥自己写错键没人管');
  // 自动音高提醒（2026-09-27 真机核对：写音高参数不报错、但写属性**不会**切手动 ⇒ 可能静默不生效）
  if (has(lua, 'function GATE.autoModeWarning(code, sv2, isIx)') && has(lua, 'GATE.PITCH_12 = {')) {
    ok('有 autoModeWarning（SV1 上写音高参数却没写 setPitchAutoMode ⇒ 警告，不拦）');
  } else fail('缺少 autoModeWarning ⇒ "写了不生效"的坑没人提');
  if (has(lua, 'GATE.autoModeWarning(code, ST.isSV2, ST.host == "ix")')) ok('run_script 已接线自动音高提醒');
  else fail('run_script 没接 autoModeWarning');
  if (/SV1 1\.11\.2：写入 ok、读得回、写完仍 auto/.test(lua)) ok('注释里记了真机核对结论（不报错但也不切手动）');
  else fail('注释没记真机结论 ⇒ 后人会以为"不报错=生效了"');
  // 接线位置：仍必须在 load() 之前
  const iTbl = lua.indexOf('GATE.checkAttrTables(code, ST.isSV2, ST.host == "ix")');
  const iLoad2 = lua.indexOf('fn, cerr = load(code, "akdagent_script", "t", env)');
  if (iTbl < 0) fail('run_script 里没有调用内容检测');
  else if (iLoad2 > 0 && iTbl > iLoad2) fail('内容检测在 load() 之后 ⇒ 脚本已经在宿主里跑过了');
  else ok('内容检测在 load() 之前');
}

console.log('\n== ② 取证：肇事 op 面包屑（akdagent-lastop-<host>.json）==');
{
  if (/PATH\.lastop = ST\.dir \.\. "\\\\akdagent-lastop-"/.test(lua)) ok('PATH.lastop 指向 akdagent-lastop-<host>.json');
  else fail('没有 lastop 文件路径 ⇒ 被冻住后无从指名肇事 op');
  if (has(lua, 'function GATE.markLastOp(op, meta, args, stage, extra)')) ok('有 GATE.markLastOp()');
  else fail('缺少 markLastOp()');
  if (has(lua, 'stage = stage or "running"') && /pcall\(function\(\) writeFileAtomic\(PATH\.lastop, jenc\(payload\)\) end\)/.test(lua)) {
    ok('落盘是原子的、且被 pcall 包住（取证不能反过来搞挂正常请求）');
  } else fail('面包屑落盘没做原子写/没 pcall 保护');
  if (has(lua, 'function GATE.digest(v, depth, seen)') && has(lua, '<+%d chars>')) {
    ok('参数摘要会截断（write_chords 几百个音符不会撑爆文件）');
  } else fail('参数摘要没有截断');
  if (has(lua, 'local function dispatchTraced(op, args, meta)') && has(lua, 'GATE.markLastOp(op, meta, args, "running")')) {
    ok('分发前先落盘 stage="running"');
  } else fail('没有"执行前落盘"⇒ 被冻住时文件不会停在 running');
  if (/local ok, res = pcall\(dispatch, op, args, meta\)[\s\S]{0,300}?ok and "done" or "failed"/.test(lua)) {
    ok('跑完改 stage = done/failed');
  } else fail('跑完没有更新 stage ⇒ 分不清"卡住了"和"干净地停了"');
  if (has(lua, 'pcall(dispatchTraced, req.op, req.args, { id = req.id, seq = seq })')) {
    ok('轮询带 id/seq 落盘（能对回是哪一笔请求）');
  } else fail('轮询没有把 id/seq 传给面包屑');
  if (has(lua, 'GATE = GATE, dispatchTraced = dispatchTraced,')) ok('导出 GATE / dispatchTraced（离线自测能驱动）');
  else fail('没有导出 ⇒ 离线自测覆盖不到这两个机制');
  // 与心跳互校（防"冤枉上一次运行"）
  if (/session = ST\.session, reqSeen = ST\.reqSeen, opsRun = ST\.opsRun,/.test(lua)) {
    ok('面包屑带 session / reqSeen / opsRun（可与心跳互校）');
  } else fail('面包屑没有 session/reqSeen/opsRun ⇒ 桥重启后旧面包屑会被当成新事故的肇事者');
  if (/session = ST\.session,\s*\n\s*ts = os\.time\(\)/.test(lua) && /ST\.session = os\.time\(\)/.test(lua)) {
    ok('心跳带 session，且 main() 里给它赋值');
  } else fail('心跳没有 session ⇒ 客户端无法判断面包屑是不是当前这次运行的');
}

// ============================================================================
console.log('\n== ③ 恢复指引：诊断/报错/工具描述里给出可操作的三步 ==');
{
  if (has(fileipc, 'export function readLastOp(') && has(fileipc, 'export function describeLastOp(')) {
    ok('fileipc 导出 readLastOp / describeLastOp');
  } else fail('fileipc 没有读面包屑的接口');
  if (has(fileipc, "const crumb = describeLastOp(host, d);")) ok('collectDiagnostics 带上面包屑（所有失败都会看到）');
  else fail('诊断里没带面包屑');
  if (has(fileipc, 'Ctrl+S 保存工程') && has(fileipc, '关掉那个错误框') && has(fileipc, '重跑 AKDAgentBridge')) {
    ok('describeLastOp 给出恢复三步（关框 → 保存 → 重跑）');
  } else fail('恢复指引不完整（缺"关框/保存/重跑"任一步）');
  if (/stage === 'running'/.test(fileipc) && /stage === "running"/.test(protocol)) {
    ok('只在 stage=running 时才说"是这一笔干的"（done 是干净停机，不许误导）');
  } else fail('没有按 stage 区分 ⇒ 会把"宿主被关掉"误报成"某笔请求弄死的"');

  if (/import \{[^}]*readLastOp[^}]*\} from "\.\/fileipc\.js"/.test(protocol)) ok('protocol 引入 readLastOp');
  else fail('protocol 没引入 readLastOp');
  if (has(protocol, '关掉那个错误框') && has(protocol, 'Ctrl+S 保存工程')) {
    ok('"桥心跳已过期"的报错里直接带恢复三步');
  } else fail('心跳过期的报错还是干巴巴一句"请重新运行"（用户会干瞪眼）');

  const runScriptDesc = (/server\.tool\(\s*"sv_run_script",\s*"([\s\S]*?)",/.exec(tools) || [])[1] || '';
  if (!runScriptDesc) fail('在 tools.ts 里找不到 sv_run_script 的描述');
  else {
    if (has(runScriptDesc, '点调用')) ok('工具描述写明"绝不写点调用"（AI 读得到）');
    else fail('sv_run_script 描述没提点调用禁令');
    if (has(runScriptDesc, 'getScriptData')) ok('工具描述写明音符属性按宿主分流（SV1 getAttributes / SV2 getScriptData）');
    else fail('sv_run_script 描述没写音符属性按宿主选 API ⇒ AI 还会用错（用户反馈的原话）');
    if (has(runScriptDesc, 'akdagent-lastop')) ok('工具描述指了面包屑路径（AI 可自查是哪一笔）');
    else fail('工具描述没提面包屑');
    // IX 没有官方 API 文档（IX-004）⇒ 这条纪律必须写在 AI 读得到的地方（它是"写着写着就试错"的唯一拦截）
    if (has(runScriptDesc, 'SVH.has') && has(runScriptDesc, 'IX-004')) {
      ok('工具描述写明 IX 无文档 ⇒ 先 SVH.has/SVH.members 查再调（别试错）');
    } else fail('工具描述没写 IX 的存在性检查纪律（IX 无官方文档 ⇒ 试错=模态框）');
  }
}

// ============================================================================
console.log('\n== ④ 离线自测必须真的覆盖这些机制（防"改了代码删了测试"）==');
{
  for (const [name, sig] of [
    ['点调用预检', 'G.checkCallForm'],
    ['实参预检', 'G.checkAttrArgs'],
    ['SV1 拒绝 phonemes', 'refused == "sv1-no-phonemes"'],
    ['SV2 拒绝 dur', 'refused == "sv2-no-dur"'],
    ['面包屑', 'B.dispatchTraced'],
    ['值清洗回报', 'droppedFields'],
    ['内容检测·SV1 键归属', 'SV1：phonemes（2.1.1 起）⇒ 拒绝'],
    ['内容检测·SV2 键归属', 'SV2：音高参数（version 1 专属）⇒ 拒绝'],
    ['内容检测·未知键', '拼错的键（tF0left）⇒ 拒绝'],
    ['内容检测·类型', '值类型不对'],
    ['内容检测·数组元素', 'dur 元素不是数 ⇒ 拒绝'],
    ['内容检测·NaN 合法', 'NaN 被视为合法值'],
    ['内容检测·逃逸口', 'allow-extra-attrs'],
    ['IX 豁免（内容检测）', 'IX：整体豁免'],
    ['dur 任意正数（不 clamp）', '任意正数原样写入'],
    ['自动音高提醒', '自动音高：SV1 写音高参数但没写 setPitchAutoMode ⇒ 给警告'],
  ]) {
    if (has(tests, sig)) ok('离线自测含：' + name);
    else fail('离线自测缺少：' + name);
  }
}

// ============================================================================
console.log('\n== ⑤ 反向护栏：Lua 模式里的 `|`（我自己踩过的坑）==');
{
  // Lua 模式**没有交替**：`(create|add)` 是"捕获字面量 create|add"，永远匹配不上。
  // 第一版 checkCallForm / checkAttrArgs 就是这么写的（表现为"功能在、但不生效"，
  // 离线自测才发现）。⇒ 凡 string.match/gmatch/gsub/find 的字符串字面量里出现
  // 「括号内带 `|`」，一律报出来人工确认。
  const lines = lua.split(/\r?\n/);
  const suspects = [];
  lines.forEach((ln, i) => {
    if (!/string\.(match|gmatch|gsub|find|gsub)\s*\(/.test(ln)) return;
    const lits = ln.match(/"([^"]*)"/g) || [];
    for (const raw of lits) {
      const body = raw.slice(1, -1);
      if (!body.includes('|')) continue;
      if (/\([^()]*\|/.test(body)) suspects.push(`第 ${i + 1} 行：${ln.trim().slice(0, 120)}`);
    }
  });
  if (suspects.length === 0) ok('没有"用 `|` 当交替"的 Lua 模式');
  else fail('疑似把 `|` 当交替用（Lua 模式不支持 ⇒ 判据会永远不命中）：\n      ' + suspects.join('\n      '));
}

// ============================================================================
console.log('\n== ⑥ 行为自测：describeLastOp 不许**冤枉**（真跑 server/dist 的实现）==');
{
  // 面包屑落盘后**不会自己消失**（宿主冻住时正是靠它取证）⇒ 桥重启后旧面包屑还在盘上。
  // 这里用临时目录真跑一遍客户端实现，三种情形都要判对：
  //   ① 同一 session 且 opsRun < reqSeen（那一笔没跑完）⇒ 认作肇事者 + 恢复三步
  //   ② session 不同（上一次运行留下的）⇒ **不许**认作本次肇事者
  //   ③ 同一 session 但 opsRun ≥ reqSeen（那一笔跑完了）⇒ 也不许认作肇事者
  const dist = path.join(ROOT, 'server', 'dist', 'fileipc.js');
  if (!fs.existsSync(dist)) {
    fail('读不到 ' + path.relative(ROOT, dist) + '（先 `cd server && npm run build`）');
  } else {
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-lastop-'));
    process.env.AKDAGENT_IPC_DIR = tmp;
    const ipc = require(dist);
    const now = Math.floor(Date.now() / 1000);
    const put = (kind, obj) => fs.writeFileSync(path.join(tmp, `akdagent-${kind}-sv.json`), JSON.stringify(obj));
    const get = () => ipc.describeLastOp('sv', tmp) || '';

    // ① 同一 session，那一笔没跑完
    put('hb', { host: 'sv', ts: now, session: 100, opsRun: 3, reqSeen: 4 });
    put('lastop', { op: 'write_pit', stage: 'running', ts: now, session: 100, reqSeen: 4, opsRun: 3,
      args: { indices: [1, 2] } });
    const s1 = get();
    if (/lastOp=write_pit/.test(s1) && /没有跑完/.test(s1) && /Ctrl\+S 保存工程/.test(s1)) {
      ok('① 同一 session 未跑完 ⇒ 指名肇事 op + 恢复三步');
    } else fail('① 判据没生效：' + s1.replace(/\n/g, ' ').slice(0, 160));
    if (/参数摘要/.test(s1)) ok('① 附上参数摘要（知道递了什么过去）');
    else fail('① 没带参数摘要');

    // ② session 不同 ⇒ 上一次运行留下的
    put('hb', { host: 'sv', ts: now, session: 200, opsRun: 1, reqSeen: 1 });
    const s2 = get();
    if (/上一次桥运行/.test(s2) && !/没有跑完/.test(s2)) ok('② session 不同 ⇒ 明说"上一次运行留下的"，不冤枉本次');
    else fail('② 把上一次运行的面包屑当成本次肇事者了：' + s2.replace(/\n/g, ' ').slice(0, 160));

    // ③ 同一 session 但那一笔跑完了（opsRun 在 op 跑完之后才自增）
    put('hb', { host: 'sv', ts: now, session: 300, opsRun: 7, reqSeen: 7 });
    put('lastop', { op: 'get_melody_notes', stage: 'running', ts: now, session: 300, reqSeen: 7, opsRun: 6 });
    const s3 = get();
    if (!/没有跑完/.test(s3)) ok('③ 那一笔已跑完 ⇒ 不认作肇事者（stage 可能停在上一次的 running 上）');
    else fail('③ 把"跑完了的 op"当成了肇事者：' + s3.replace(/\n/g, ' ').slice(0, 160));

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响判据 */ }
  }
}

// ============================================================================
console.log('\n== ⑦ 用户可见：冻结时把「关框 → Ctrl+S → 重跑桥」摆到悬浮球（2026-09-27 · 用户选 ②）==');
{
  const ipcJs = readIf(path.join(ROOT, 'electron', 'src', 'file-ipc.js'));
  const mainJs = readIf(path.join(ROOT, 'electron', 'src', 'main.js'));
  const orbJson = readIf(path.join(ROOT, 'electron', 'src', 'i18n', 'orb.json'));
  if (!ipcJs || !mainJs || !orbJson) fail('读不到 electron 侧文件（file-ipc.js / main.js / i18n/orb.json）');
  else {
    if (has(ipcJs, 'function readLastOp(') && has(ipcJs, 'function frozenCrumb(') && /readLastOp,\s*\n\s*frozenCrumb,/.test(ipcJs)) {
      ok('file-ipc.js 导出 readLastOp / frozenCrumb');
    } else fail('file-ipc.js 没有读面包屑的接口（悬浮球看不到"哪一笔把它弄死的"）');
    if (/hb\.session !== c\.session/.test(ipcJs)) ok('互校①：session 不同 ⇒ 上一次运行留下的旧面包屑，不算');
    else fail('没比 session ⇒ 桥重启后旧面包屑会让球误报');
    if (/hb\.opsRun >= c\.reqSeen/.test(ipcJs)) ok('互校②：那一笔已跑完（opsRun ≥ reqSeen）⇒ 不算冻住');
    else fail('没比 opsRun/reqSeen ⇒ 会把"跑完了"误报成冻住');
    if (has(mainJs, "require('./file-ipc.js')")) ok('main.js 引入 file-ipc');
    else fail('main.js 没引入 file-ipc');
    if (has(mainJs, 'function notifyFrozenBridges(') && /notifyFrozenBridges\(\[sv, ix\]\)/.test(mainJs)) {
      ok('采样桥状态时顺带判"冻住"（refreshBridgePill 里调用）');
    } else fail('桥状态轮询里没有冻结提示 ⇒ 用户还是只看到"球变黄"');
    if (has(mainJs, "i18n.t('orb.bridge.frozen'")) ok('提示文案走 i18n（四语，不是主进程写死中文）');
    else fail('提示没走 i18n');
    if (has(mainJs, 'frozenNotified') && /frozenNotified\.has\(key\)/.test(mainJs)) ok('同一 (host, session, op) 只提示一次（不刷屏）');
    else fail('没有去重 ⇒ 每 5s 刷一条');
    if (/p\.fresh \|\| typeof p\.ageSec !== 'number'/.test(mainJs)) ok('只在桥**不新鲜**时才提示（还在动就不打扰）');
    else fail('没排除"桥还在动 / 从没跑过"的情况');
    // i18n：四语齐全 + 占位符 {0}{1}
    try {
      const j = JSON.parse(orbJson);
      const missing = Object.keys(j).filter((l) => typeof j[l]['orb.bridge.frozen'] !== 'string');
      if (missing.length) fail('orb.bridge.frozen 缺语种：' + missing.join(', '));
      else ok('orb.bridge.frozen 四语齐全（' + Object.keys(j).length + ' 个语种）');
      const badPh = Object.keys(j).filter((l) => {
        const v = j[l]['orb.bridge.frozen'] || '';
        return !v.includes('{0}') || !v.includes('{1}') || !v.includes('Ctrl+S');
      });
      if (badPh.length) fail('文案缺占位符 / 缺 Ctrl+S：' + badPh.join(', '));
      else ok('每语都带 {0}{1} 且写明 Ctrl+S（三步里最关键的一步）');
    } catch (e) { fail('orb.json 解析失败：' + e.message); }
  }
}

// ============================================================================
console.log('');
if (bad > 0) { console.log(`[FAIL] ${bad} 项不通过`); process.exit(1); }
console.log('✅ 宿主模态框事故的三道防线齐全（预防 / 取证 / 恢复指引）');
