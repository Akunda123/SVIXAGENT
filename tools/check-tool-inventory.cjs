#!/usr/bin/env node
/*
 * MCP 工具库存核对器
 * =====================================================================
 * 起因：README / MCP工具清单 / dist 三方对"到底几个工具"说法不一（19 / 30 / 13 op…），
 * 而**数字全靠手写记忆**必然漂。
 *
 * 本脚本以 `server/src/tools.ts` 为**唯一真源**：
 *   ① 抽出全部 `server.tool("name", ...)` 的名字
 *   ② 与 `knowledge/docs/MCP工具清单.md` 的表格行对照 → 报「文档缺哪些 / 文档多哪些」
 *   ③ 与 `server/dist/tools.js` 对照 → 报「dist 是否已重新构建」
 *   ④ 统计 JS 桥 dispatch 的 op 数、Lua 桥的 op 数（供 README 用）
 *
 * 只读。用法：node tools/check-tool-inventory.cjs     退出码 1 = 有漂移。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const P = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(P(p), 'utf8');

let drift = false;
let jsOps = 0;          // JS 桥的 op 数（供 README 比对；必须提升到外层作用域）
let luaOps = 0;         // Lua 桥的 op 数（README 里 Lua 那句要单独比）
let luaOpNames = [];
const say = (s) => console.log(s);

// —— ① 真源：src/tools.ts
const src = read('server/src/tools.ts');
const names = [];
const re = /server\.tool\(\s*"([A-Za-z0-9_]+)"/g;
let m;
while ((m = re.exec(src)) !== null) names.push(m[1]);
say(`【真源】server/src/tools.ts 定义工具 **${names.length}** 个`);

// —— ② dist 是否同步
let distNames = [];
try {
  const dist = read('server/dist/tools.js');
  const rd = /\.tool\(\s*"([A-Za-z0-9_]+)"/g;
  let d;
  while ((d = rd.exec(dist)) !== null) distNames.push(d[1]);
  const missing = names.filter((n) => !distNames.includes(n));
  const extra = distNames.filter((n) => !names.includes(n));
  if (missing.length || extra.length) {
    drift = true;
    say(`⚠️ dist 与 src **不一致** —— 需要 \`npm run build\``);
    if (missing.length) say(`   dist 缺：${missing.join(', ')}`);
    if (extra.length) say(`   dist 多：${extra.join(', ')}`);
  } else {
    say(`✅ server/dist/tools.js 与 src 一致（${distNames.length} 个）—— 无需重新构建`);
  }
} catch (e) {
  say(`（读不到 dist：${e.message}）`);
}

// —— ③ 与 knowledge/docs/MCP工具清单.md 对照
try {
  const doc = read('knowledge/docs/MCP工具清单.md');
  const listed = [];
  const rl = /^\|\s*`(sv_[a-z_]+)`/gm;
  let l;
  while ((l = rl.exec(doc)) !== null) listed.push(l[1]);
  const missInDoc = names.filter((n) => !listed.includes(n));
  const extraInDoc = listed.filter((n) => !names.includes(n));
  say(`\n【文档】knowledge/docs/MCP工具清单.md 列出 **${listed.length}** 行`);
  if (missInDoc.length || extraInDoc.length) {
    drift = true;
    if (missInDoc.length) say(`⚠️ 文档缺：${missInDoc.join(', ')}`);
    if (extraInDoc.length) say(`⚠️ 文档多（工具已改名/删除？）：${extraInDoc.join(', ')}`);
  } else {
    say('✅ 文档与真源一致');
  }
} catch (e) {
  say(`（读不到 MCP工具清单：${e.message}）`);
}

// —— ④ 桥的 op 数（README 要用）
// 2026-09-12：JS 剪贴板桥已退役（其归档目录 legacy/ 亦于 2026-09-19 删除）⇒ 不再统计；
//             现在唯一的桥是 Lua 桥。
try {
  const lua = read('sv/lua/AKDAgentBridge.lua');
  const lops = [];
  const rp = /^function OPS\.([a-z_]+)\(/gm;
  let p;
  while ((p = rp.exec(lua)) !== null) lops.push(p[1]);
  luaOps = lops.length;
  luaOpNames = lops;
  say(`【桥】Lua 文件通道桥 op **${lops.length}** 个：${lops.join(' / ')}`);
} catch (e) {
  say(`（读不到 Lua 桥：${e.message}）`);
}

// —— ④b MCP 客户端与 Electron 客户端**必须同为纯文件通道**
// 2026-09-12：剪贴板通道退役 ⇒ 两侧都不该再出现剪贴板/白名单残留。
//   比对方式从"核对两份白名单"改为"核对**两侧都不再有白名单/剪贴板痕迹**"
//   （白名单本身已删除：能力改由桥心跳自报 ops）。
try {
  const suspects = [
    ['server/src/fileipc.ts', read('server/src/fileipc.ts')],
    ['electron/src/file-ipc.js', read('electron/src/file-ipc.js')],
  ]
  say('\n【纯文件通道检查】两侧都不得再有白名单/剪贴板残留')
  let bad = false
  for (const [name, src] of suspects) {
    if (!src) { say(`  ⚠️ 读不到 ${name}`); bad = true; continue }
    const hasWhitelist = /FILE_SAFE_OPS\s*(?::[^=]*)?=/.test(src)   // 只看**定义**，不看注释里的提及
    const hasClipboard = /Set-Clipboard|Get-Clipboard|SVCMD:|clipboard\.ts/.test(src)
    if (hasWhitelist || hasClipboard) bad = true
    say(`  ${hasWhitelist || hasClipboard ? '⚠️' : '✅'} ${name}：白名单=${hasWhitelist} 剪贴板痕迹=${hasClipboard}`)
  }
  if (bad) drift = true
} catch (e) {
  say(`\n【纯文件通道检查】（核对失败：${e.message}）`)
  drift = true
}

// —— ⑤ README 里的数字（各自与**对应真源**比较，不能拿工具数比 op 数）
// ⚠️ 曾经的盲区（2026-09-12 修）：① 只匹配「N 个 op」，不匹配「op N 个」——
//    而 README 里 Lua 桥那句写的正是"op 5 个"，于是**漂移了一整天没被发现**；
//    ② 所有 op 数字都拿 JS 桥当基准，可 README 里同时有 JS 与 Lua 两处声明。
//    现在：两种语序都认；按该行是否提到 Lua 决定与哪个真源比。
// ⚠️ **约定（写 README 时必须遵守）**：**同一行只能出现一个可机检的数量声明**。
//    本检查器每行最多取 1 条（先试「N 个工具 / N 个 op」，再试「op N 个」），
//    一行里塞两个数字会让归属无法判定 —— 实测 2026-09-12：我在 Lua 那句里又写了
//    "JS 桥 18 个 op"，检查器把 18 拿去比 Lua 真源(20) ⇒ 假漂移。
//    要提别的数字请换语序（如「JS 桥的 18 项」）。
try {
  const rd = read('README.md');
  const hits = [];
  rd.split('\n').forEach((line, i) => {
    // 语序 A：「30 个工具」「18 个 op」；语序 B：「op 5 个」
    const ma = line.match(/(\d+)\s*(个工具|个 ?op)/);
    const mb = ma ? null : line.match(/个?\s*op\s*(\d+)\s*个/i);
    if (!ma && !mb) return;
    const claimed = Number(ma ? ma[1] : mb[1]);
    const isOp = true && (ma ? /op/.test(ma[2]) : true);
    const isTool = !!(ma && /工具/.test(ma[2]));
    // 归属：该行提到 Lua 就比 Lua 桥，否则比 JS 桥 / 工具数
    const mentionsLua = /Lua/.test(line);
    let label, truth;
    if (isTool) { label = '工具数'; truth = names.length; }
    else if (mentionsLua) { label = 'Lua 桥 op 数'; truth = luaOps; }
    else { label = 'JS 桥 op 数'; truth = jsOps; }
    const ok = claimed === truth;
    if (!ok) drift = true;
    hits.push(`  ${ok ? '✅' : '⚠️'} README.md:${i + 1}  「${(ma ? ma[0] : mb[0]).trim()}」  → ${label}真源 = ${truth}`);
  });
  if (hits.length) {
    say('\n【README 中的数量声明】（逐条与对应真源比较）');
    hits.forEach((h) => say(h));
  }
} catch (e) { /* README 可选 */ }

// —— ⑥ 协议文档里的 op 清单（2026-09-19 新加）
// 起因：剪贴板退役后 `skills/akdagent-protocol/SKILL.md` 与 `knowledge/docs/PROTOCOL.md` 长期停在
//      "20 个 op / 18 个 op"，而桥已经 29 个 —— 文档里**手写的 op 清单必须被机检**，否则必漂。
// 判据：技能里的「操作清单」表格行（`| \`op\` |`）**双向**对照；PROTOCOL.md 只查"缺"方向
//      （那节里出现的小写反引号词还有 `ops`/`req`/`res` 这类协议术语，双向查会误报）。
try {
  const targets = [
    ['skills/akdagent-protocol/SKILL.md', '操作清单表格', (t) => {
      const sec = t.split(/^## /m).find((s) => s.startsWith('操作清单')) || ''
      // 表格首列的反引号 op 名（允许连字符/数字，好让"打成错名"也能被报成「多」）
      return [...sec.matchAll(/^\|\s*`([a-z0-9_-]+)`/gmi)].map((x) => x[1])
    }, true],
    ['knowledge/docs/PROTOCOL.md', '分组速览', (t) => {
      const sec = t.split(/^## /m).find((s) => s.startsWith('操作清单')) || '';
      return [...sec.matchAll(/`([a-z_]+)`/g)].map((x) => x[1]);
    }, false],
  ]
  say('\n【协议文档的 op 清单】（与 Lua 桥真源逐名对照）')
  for (const [file, label, extract, checkExtra] of targets) {
    let text = ''
    try { text = read(file) } catch { say(`  ⚠️ 读不到 ${file}`); drift = true; continue }
    const got = [...new Set(extract(text))]
    const missing = luaOpNames.filter((n) => !got.includes(n))
    const extra = checkExtra ? got.filter((n) => !luaOpNames.includes(n)) : []
    if (missing.length || extra.length) {
      drift = true
      say(`  ⚠️ ${file}（${label}）：列了 ${got.length} 个`)
      if (missing.length) say(`     缺：${missing.join(', ')}`)
      if (extra.length) say(`     多（桥里没有）：${extra.join(', ')}`)
    } else {
      say(`  ✅ ${file}（${label}）：含全部 ${luaOpNames.length} 个 op${checkExtra ? '' : '（该节另有协议术语如 `ops`/`req`，未计入）'}`)
    }
    const cm = text.match(/共\s*\*{0,2}(\d+)\*{0,2}\s*个\s*op/)
    if (cm && Number(cm[1]) !== luaOps) { drift = true; say(`     ⚠️ 文中声明「${cm[0].trim()}」≠ 真源 ${luaOps}`) }
  }
} catch (e) { say(`\n【协议文档的 op 清单】（核对失败：${e.message}）`); drift = true }

// —— ⑦ 退役物不得**当现役**引用（2026-09-19 新加）
// 起因：剪贴板桥 2026-09-12 退役后，README 与活技能里仍有 6 处把它当现役（架构图 / 安装说明 / 实现对照 / 选路描述），
//      而"文档手写事实"必漂 ⇒ 机检。扫描面：README.md + skills/**（跳过 `sv-bridge/`（退役技能自身）与 `sv-scripting/api/`（官方镜像））。
// 判据：命中退役物标记的行 —— 带"退役/历史/时代/旧/归档/已删/legacy/Phase 0"字样的**算合规提及**，否则报错。
try {
  const docFiles = [];
  const pushDoc = (p) => { if (fs.existsSync(P(p))) docFiles.push(p); };
  pushDoc('README.md');
  (function walk(rel) {
    for (const e of fs.readdirSync(P(rel), { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) {
        if (e.name === 'sv-bridge' || e.name === 'api' || e.name === 'node_modules' || e.name.startsWith('_bak')) continue;
        walk(r);
      } else if (e.name.endsWith('.md')) docFiles.push(r);
    }
  })('skills');
  // ⚠️ 这些是**退役的旧名/旧开关**（改名后仍要用旧名去搜历史残留，别跟着改成新名）
  const RE = /SVAgentBridge\.js|svh[A-Z][A-Za-z]*|SVCMD:|SVRES:|server-clipboard|clipboard\.ts|FILE_SAFE_OPS|SVAGENT_TRANSPORT/;
  const OKMARK = /退役|已删|归档|历史|时代|Phase 0|legacy|旧/;
  const badDocs = [];
  let okDocs = 0;
  for (const f of docFiles) {
    fs.readFileSync(P(f), 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (!RE.test(line)) return;
      if (OKMARK.test(line)) { okDocs++; return; }
      badDocs.push(`  ⚠️ ${f}:${i + 1} 把已退役物当现役 -> ${line.trim().slice(0, 110)}`);
    });
  }
  say('\n【退役物不得当现役引用】（README + skills/**，带"退役/历史/时代"字样的行已豁免）');
  if (badDocs.length) {
    drift = true;
    badDocs.slice(0, 12).forEach((h) => say(h));
    if (badDocs.length > 12) say(`  …还有 ${badDocs.length - 12} 处`);
  } else {
    say(`  ✅ 无（另有 ${okDocs} 处带"退役/历史"标注的合规提及）`);
  }
} catch (e) { say(`\n【退役物检查】（核对失败：${e.message}）`); drift = true }

// —— ⑧ 正文里的**裸数量声明**（2026-09-24 新加）
// 起因：`skills/akdagent-protocol/SKILL.md` 的 description 与正文长期写着
//      「29 个 op / 39 个 MCP 工具」，而真源早已是 32 / 44 ——
//      ⑥ 只逐名核对"清单表格"，**查不到这些裸数字** ⇒ 它们漂了至少两个月没人发现。
// 判据：三份公开文档里任何「N 个 op / N 个工具 / MCP 工具面（N 个）」都必须等于真源；
//      ⚠️ **豁免只在"命中位置前 40 字内"有旧版标记时生效**（退役/历史/旧/归档/时代/legacy）——
//      一开始写成"整行含标记就豁免"，结果**假绿**：协议技能的 description 是一整行巨长文本，
//      里面另有"剪贴板已整体退役"字样 ⇒ 整行被豁免，而**漂的数字恰好就在那一行**。
try {
  const files = ['skills/akdagent-protocol/SKILL.md', 'knowledge/docs/PROTOCOL.md', 'README.md'];
  const RE = /MCP 工具面（(\d+)\s*个）|(\d+)\s*个\s*(op|MCP 工具|工具)/g;
  const OKMARK = /退役|已删|归档|历史|时代|legacy|旧/;
  say('\n【正文裸数量声明】（与真源比较；命中处前 40 字内有"旧/历史"字样才豁免）');
  let seen = 0, bad = 0;
  for (const f of files) {
    let text = '';
    try { text = read(f) } catch { continue }
    text.split(/\r?\n/).forEach((line, i) => {
      RE.lastIndex = 0;
      let g;
      while ((g = RE.exec(line)) !== null) {
        if (OKMARK.test(line.slice(Math.max(0, g.index - 40), g.index))) continue;
        const claimed = Number(g[1] !== undefined ? g[1] : g[2]);
        const isOp = g[1] === undefined && g[3] === 'op';
        const truth = isOp ? luaOps : names.length;
        seen++;
        if (claimed !== truth) {
          bad++; drift = true;
          say(`  ⚠️ ${f}:${i + 1}  「${g[0].trim()}」 ≠ 真源 ${isOp ? 'op' : '工具'} = ${truth}`);
        }
      }
    });
  }
  if (!bad) say(`  ✅ ${seen} 处声明全部匹配（op = ${luaOps} · 工具 = ${names.length}）`);
} catch (e) { say(`\n【正文裸数量声明】（核对失败：${e.message}）`); drift = true }

say(drift ? '\n❌ 存在漂移' : '\n✅ 无漂移');
process.exit(drift ? 1 : 0);
