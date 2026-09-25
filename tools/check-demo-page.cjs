/* 演示页自检（两个版本 + 数据必须与 md 一致）
     · docs/demo/index.html = 给用户看的（左侧一屏 18 条，滚轮滑；共 32 条）
     · docs/demo/rec.html   = 演示视频录制版（左侧只显示 3 条，由 tools/gen-demo-rec.cjs 生成）
   数据来路：README-发布版草案-v2.md → tools/gen-demo-data.cjs 注入页面；这里再独立解析一遍比对
   查：脚本语法 · 弧几何（弯曲/不粘连/文字不出条）· 数据与 md 逐字节一致 · 表格/步骤/备注都进来了 ·
       滚动动画与点击命中 · 没 tip 的节收起 · 两版同源 · SV2 配色 · 背景图
   用法：node tools/check-demo-page.cjs                                        */
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'docs', 'demo');
const { parseMd, SRC } = require('./gen-demo-data.cjs');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  BAD  ') + m); if (!c) bad++; };

/* 全角/宽字符按 1 em 估宽，拉丁按 .56 em（比一律按 1 em 准，避免误判「文字出条」）*/
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;
const textW = (s, font) => [...s].reduce((w, ch) => w + font * (WIDE.test(ch) ? 1 : 0.56), 0);
const plain = s => String(s).replace(/<[^>]+>/g, '');        // 数据里带 <b>/<code>，量宽度前先剥掉

const TARGETS = [
  { file: 'index.html', visible: null, ratio: [0.05, 0.16], note: '给用户看的：一屏 18 条（共 32 条，滚轮滑）' },
  { file: 'rec.html',   visible: 3,    ratio: [0.02, 0.16], note: '演示视频录制版：左侧只显示 3 条' },
];

/* ── 真源：md 自己解析一遍 ── */
const want = parseMd(fs.readFileSync(SRC, 'utf8'));
const wantJSON = JSON.stringify(want);
const nItems = want.reduce((n, s) => n + (s.items || []).length, 0);
const tables = [].concat(...want.map(s => (s.blocks || []).filter(b => b.t === 'table')));
const nRows = tables.reduce((n, t) => n + t.rows.length, 0);
console.log(`\n── 真源 ${path.basename(SRC)}：${want.length} 节 · ${nItems} 个按钮条目 · ` +
            `${tables.length} 张表（${nRows} 行）· ` +
            `步骤 ${want.filter(s => (s.blocks || []).some(b => b.t === 'ol')).length} 节 · ` +
            `备注 ${want.filter(s => (s.blocks || []).some(b => b.t === 'quote')).length} 节`);

const demos = {};
for (const t of TARGETS) {
  const file = path.join(dir, t.file);
  console.log(`\n── ${t.file} —— ${t.note}`);
  if (!fs.existsSync(file)) { ok(false, `${t.file} 存在`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  const num = re => { const m = html.match(re); return m ? parseFloat(m[1]) : NaN; };

  /* 1) 脚本语法（数据块和代码在同一个 <script> 里） */
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  ok(scripts.length === 1, `<script> 块数量 = ${scripts.length}（应为 1）`);
  try { new vm.Script(scripts[0][1]); ok(true, '脚本语法通过'); }
  catch (e) { ok(false, '脚本语法错误: ' + e.message); }

  /* 2) 数据：必须和 md 解析出来的逐字节一致 */
  const m = html.match(/const DEMO = \{ nav: (\[[\s\S]*?\])\s*\};/);
  ok(!!m, '能取出页面里的 DEMO 数据块');
  let nav = [];
  if (m) {
    try { nav = JSON.parse(m[1]); ok(Array.isArray(nav) && nav.length > 0, `数据可解析（${nav.length} 节）`); }
    catch (e) { ok(false, '数据 JSON 解析失败: ' + e.message); }
  }
  demos[t.file] = m ? m[1] : null;
  ok(m && JSON.stringify(nav) === wantJSON,
     `页面数据与 md 逐字节一致（${nav.length} 节；改 md 后要重跑 tools/gen-demo-data.cjs）`);
  const dTables = [].concat(...nav.map(s => (s.blocks || []).filter(b => b.t === 'table')));
  ok(dTables.length === tables.length && dTables.reduce((n, x) => n + x.rows.length, 0) === nRows,
     `表格都进来了（${dTables.length} 张 / ${dTables.reduce((n, x) => n + x.rows.length, 0)} 行）`);
  ok(nav.some(s => (s.blocks || []).some(b => b.t === 'ol')), '有序步骤（安装 / 启动）进来了');
  ok(nav.some(s => (s.blocks || []).some(b => b.t === 'quote')), '备注（引用块）进来了');
  /* 🆕 2026-09-25 条目 vs 文案（用户：「分清 md 里是条目还是文本注释，不要所有行都放 chip 里」）：
     条目（chip）必须有显式标签**且详情非空**；没标签的纯句子 / 告警走 ul 文案块。 */
  ok(/if \(b\.t === 'ul'\)/.test(html) && /\.body ul\{/.test(html), '文案列表（ul 块）能渲染');
  const noDetail = [].concat(...nav.map(s => (s.items || []).filter((it) => !it.d).map((it) => `${s.num} ${it.n}`)));
  ok(noDetail.length === 0, noDetail.length ? `有 chip 没详情（空 tip）：${noDetail.slice(0, 3).join(' / ')}` : '所有 chip 都有详情（无空 tip）');
  ok(nav.some(s => (s.blocks || []).some(b => b.t === 'ul')), '文案块（ul）确实存在（不是所有 `- ` 行都成了 chip）');
  const intro = nav.find(s => s.label === '这是什么');
  ok(intro && (intro.items || []).length === 0 && (intro.blocks || []).some(b => b.t === 'ul'),
     '§这是什么 的例句是"文案"（0 chip + ul 块），不再弹空 tip');
  /* 代码块：§2.1 的关系图（md 里是 ASCII，页面里渲染成图解） */
  const pres = [].concat(...nav.map(s => (s.blocks || []).filter(b => b.t === 'pre')));
  ok(pres.length >= 1 && pres.some((b) => b.v.join('\n').includes('AKDAgentBridge.lua')),
     `关系图（代码块）进来了（${pres.length} 块）`);
  ok(/if \(b\.t === 'pre'\)/.test(html) && /\.body pre\{/.test(html) && /function renderFlow\(/.test(html),
     '页面能渲染代码块 + 有图解构建器 renderFlow()');

  /* 🆕 2026-09-25：ASCII 图（给 GitHub 看的）与页面图解**必须逐步对得上**，否则两边会悄悄漂。
     ⚠️ ③ 在 ASCII 里是缩进在箭头列里的（`│ ③ 文件通道…`）⇒ 正则要允许前导空白/竖线。 */
  const ascii = pres.length ? pres[0].v.join('\n') : '';
  const asciiSteps = [...ascii.matchAll(/^[\s│|]*([①②③④⑤])\s*(\S[^\n]*)$/gm)].map((m) => [m[1], m[2]]);
  const pageSteps = [...html.matchAll(/\{ no:\s*'([①②③④⑤])',\s*t:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
  ok(asciiSteps.length === 5, `md 的 ASCII 图有 5 步（${asciiSteps.length}）`);
  ok(pageSteps.length === 5, `页面图解有 5 步（${pageSteps.length}）`);
  const wrong = pageSteps.filter(([no, t], i) =>
    !asciiSteps[i] || asciiSteps[i][0] !== no || !asciiSteps[i][1].includes(t));
  ok(wrong.length === 0,
     wrong.length ? `ASCII 图与页面图解不一致：${wrong.map(([n, t]) => `${n} ${t}`).join(' / ')}`
                  : 'ASCII 图（GitHub）与页面图解逐步一致');
  ok(/if \(b\.t === 'pre'\)[\s\S]{0,140}renderFlow\(\)/.test(html), 'pre 分支走图解 renderFlow()（不再直接铺 ASCII）');
  ok(!/内部说明|发布前整节删除/.test(html), 'md 的「内部说明」一节没进页面');
  /* 尖括号样本：用 §1.2 的安装包名 `AKDAgent-<版本>-x64.exe`（§五 删掉后原来的 `<你的联系方式>` 没了） */
  ok(html.includes('&lt;版本&gt;') && !html.includes('<版本>'),
     'md 里的尖括号已转义（不会当标签解析）');
  ok(/renderSection\(cur\)/.test(html), '右栏按节渲染（renderSection）');
  ok(/const CHAPTER_CHIPS = false;/.test(html) && /CHAPTER_CHIPS && !c\.sub/.test(html),
     '章条目只留标题、不再把各小节列成 chip（要放回来把常量改 true）');
  ok(/\.crumb h2\{[^}]*font-size:clamp\(32px,4\.6vh,54px\)/s.test(html),
     '节标题 clamp(32px,4.6vh,54px)（再放大过）');

  /* 4e) 左弧字号：小节行必须在 JS 里按 FONT 算（CSS 用 em 会把 13.76px 焊死 —— 实测踩过） */
  ok(/const SUB_FONT = 0\.\d+;/.test(html) && /FONT \* SUB_FONT/.test(html),
     '小节行字号 = FONT × SUB_FONT（在 JS 里算）');
  ok(!/\.stick\.sub \.btxt\{[^}]*font-size/.test(html),
     '不许用 CSS 给小节行定字号（.86em 会盖掉属性、把字号焊死）');
  ok(/<table><thead>/.test(html) && /'table'/.test(html), '表格有渲染（renderBlock）');
  /* 2026-09-25：正文区**不许再写死 max-height**（原来 430px 上限把 §1.1 的备注与 §4.2 的长表格裁掉一截，
     观感就是"md 里的东西没同步进页面"）⇒ 改成"正文全铺开 + 右栏整体可滚 + safe center 居中" */
  /* ⚠️ 负向检查要在**剥掉 CSS 注释**的文本上做：注释里为记录"试过但作废"的写法会带上这些片段 */
  const cssClean = html.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/\.pane\{[^}]*overflow-y:auto/s.test(cssClean), '右栏整体可滚（内容超长时不被裁）');
  ok(!/\.body\{[^}]*max-height/s.test(cssClean), '正文区不再写死 max-height（备注 / 长表格不会被裁）');
  ok(!/\.body\{[^}]*overflow-y/s.test(cssClean), '正文区不自己滚（滚动交给右栏，避免双层滚动条）');
  ok(/\.pane\{[^}]*justify-content:safe center/s.test(cssClean), '右栏 safe center（放得下居中、放不下不裁顶）');
  ok(!/\.inner\{[^}]*margin-block:auto/s.test(cssClean), '不要用 margin-block:auto 居中（滚动容器里不生效）');
  /* 🆕 2026-09-25 用户：「给 rec 的节内容切换加个过渡」 */
  ok(/@keyframes contentIn/.test(html) && /\.inner\.enter\{animation:contentIn/s.test(cssClean),
     '换节过渡：.inner.enter 播放 contentIn（淡入 + 轻微上移）');
  ok(/classList\.add\('enter'\)/.test(html) && /classList\.remove\('enter'\)/.test(html) && /void core\.offsetWidth/.test(html),
     '换节时重新触发动画（remove → 强制重排 → add）');

  /* 3) 左弧几何：槽位分布在 ±SPRED°（条目比窗口多时靠滑动看其余） */
  const cats = nav;
  const VISIBLE = num(/const VISIBLE = (\d+)/);
  ok(Number.isFinite(VISIBLE), `VISIBLE 可解析（= ${VISIBLE}）`);
  if (t.visible === null) ok(VISIBLE <= cats.length, `VISIBLE ${VISIBLE} ≤ 条目数 ${cats.length}（一屏放得下就全放）`);
  else ok(VISIBLE === t.visible, `VISIBLE ${VISIBLE} = ${t.visible}（录制版只露几条）`);

  /* 3b) 左弧列宽（用户 2026-09-25：「svgwrap 小一点，突出正文」）。
     `.svgwrap` 宽 = 左列宽（width:auto）⇒ 想同时"图变小 + 正文变宽"只能收 --arcw。
     ⚠️ 改这个数值要同步改：本条 / tools/gen-demo-rec.cjs 的替换串（它按精确字符串替换）/ rec 那条。 */
  const ARC_W = (/--arcw:\s*([^;]+);/.exec(html) || [])[1];
  if (t.file === 'index.html') ok(ARC_W && ARC_W.trim() === 'min(44vw,640px)', `index 左弧列 = ${ARC_W || '(缺)'}（应收窄为 min(44vw,640px)，让位正文）`);
  else ok(ARC_W && ARC_W.trim() === '30vw', `rec 左弧列 = ${ARC_W || '(缺)'}（录制版要左右三七分 ⇒ 纯 30vw）`);
  /* 3c) svgwrap 本体宽度（用户 2026-09-25：「把 class="svgwrap" 收窄」→「改 rec」）：
     两版都收 12%（图同比例缩小、四周留白）；列宽 --arcw 各自不同（index 640 / rec 900）。
     ⚠️ 与 index.html 里那条 width:88%;margin-inline:auto 绑定（gen-demo-rec 不再覆盖它）。 */
  ok(/\.svgwrap\{[^}]*width:88%;margin-inline:auto/s.test(cssClean), `${t.file} 的 .svgwrap 收窄为 88% 并居中`);

  /* 3d) 片头（**rec 专用**；用户 2026-09-25：① 居中出 SV/IX 主体 → ② 主体左移露全名 → ③ 中间出 AI Agent）
     素材 2 个（assets/ 拷进 docs/demo/*.svg）、按 orb 的做法用 `?v=` 重放 SVG 自带动画、
     主体占比常量（SV 12.3% / IX 11.3%）、时间轴常量、`?intro=0` 跳过。 */
  if (t.file === 'index.html') {
    ok(!/id="intro"/.test(html), 'index 不带片头（片头是 rec 专用）');
  } else {
    ok(/id="intro"/.test(html) && /intro-sv/.test(html) && /intro-ix/.test(html) && /intro-ai/.test(html),
       'rec 带片头（SV / AI Agent / IX 三段）');
    ok(/data-src="syn-logo-anim\.svg"/.test(html) && /data-src="instrumentx-logo\.svg"/.test(html),
       '片头用指定素材（syn-logo-anim.svg / instrumentx-logo.svg）');
    ok(/id="intro-ai" data-src="ixagent-text\.svg"/.test(html) && /clip-path:inset\(0 0 0 23\.4%\)/.test(cssClean),
       'AI Agent 用 ixagent-text.svg 的字形（裁掉前面 IX，只留 AI Agent）');
    ok(/#intro \.ai\{[^}]*position:absolute;right:0;top:50%/s.test(cssClean) && /#intro \.lockup\{/.test(cssClean),
       'AI Agent 在右侧右对齐、纵向居中于两块整标之间');
    ok(/--lock-w:min\(1040px,80vw\)/.test(cssClean)
       && /--row-h:clamp\(48px,min\(12vh,7\.2vw,calc\(var\(--lock-w\)\s*\/\s*11\.6\)\),132px\)/.test(cssClean)
       && /--ai-h:calc\(var\(--row-h\)\s*\*\s*\.5\)/.test(cssClean),
       '三个部分的尺寸走 --lock-w/--row-h/--ai-h（放大只改这里；行高上限从锁版宽反推，防压到 AI Agent）');
    ok(/dataset\.src/.test(html) && /\?v=' \+ ts/.test(html), '片头按 orb 的做法重放动画（src 追 ?v=，见 orb.html:408）');
    ok(/MARK = \[\[sv, 0\.123\], \[ix, 0\.113\]\]/.test(html), '主体占比常量在（SV 12.3% / IX 11.3%）');
    ok(/const T = \{ mark: \d+, wipe: \d+, ai: \d+, out: \d+/.test(html), '片头时间轴常量在（改 T 调节奏）');
    ok(/get\('intro'\) === '0'/.test(html), '片头可跳过：?intro=0');
    ok(/e\.key === 'a' \|\| e\.key === 'A'/.test(html) && /if \(playing\) hide\(\); else play\(\)/.test(html),
       '片头默认不播：按 A 隐藏 stage 播一遍 / 再按 A 切回（Esc 同效）');
    ok(/if \(AUTO\) at\(T\.out, hide\)/.test(html) && /const AUTO = /.test(html),
       '默认**手动切回**（播完停在结尾；只有 ?intro=auto 才自动收起）');
    ok(/<div id="intro" hidden/.test(html), '片头初始 hidden（页面一进来就是 stage）');
    ok(/id="intro"[\s\S]{0,120}?<img class="bg" alt="" src="bg\.png">/.test(html) && /#intro \.scrim\{/.test(cssClean),
       '片头背景跟页面同一套（bg.png + 同款 scrim，用 body.has-img 开关）');
    ok(fs.existsSync(path.join(dir, 'syn-logo-anim.svg')) && fs.existsSync(path.join(dir, 'instrumentx-logo.svg')),
       '片头素材已拷到 demo 目录');
  }

  const CX = num(/const CX = (-?[\d.]+)/), CY = num(/CY = (-?[\d.]+)/), R = num(/, R = ([\d.]+)/);
  const SPRED = num(/const SPRED = ([\d.]+)/), ARC = num(/const ARC = ([\d.]+)/);
  const geo = html.match(/const NODE_R = ([\d.]+), BAR_H = ([\d.]+), BAR_RIGHT = ([\d.]+), FONT = ([\d.]+), NUM_FONT = ([\d.]+), TXT_GAP = ([\d.]+), LABEL_MAX = (\d+)/);
  const [, NODE_R, BAR_H, BAR_RIGHT, FONT, NUM_FONT, TXT_GAP, LABEL_MAX] = geo ? geo.map(Number) : [];
  ok([CX, CY, R, SPRED, ARC, NODE_R, BAR_H, BAR_RIGHT, FONT, NUM_FONT, TXT_GAP, LABEL_MAX].every(Number.isFinite),
     '几何常量可解析');
  ok(LABEL_MAX >= 8 && LABEL_MAX <= 40, `弧上标签上限 ${LABEL_MAX} 字`);

  /* viewBox：几何判据都按它算（录制版把 viewBox 裁到内容过 ⇒ 不能再硬写 0/1000） */
  const vb = html.match(/viewBox="(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
  const [vbX, vbY, vbW, vbH] = vb ? vb.slice(1).map(Number) : [];
  ok([vbX, vbY, vbW, vbH].every(Number.isFinite) && vbW > 0 && vbH > 0,
     `viewBox 可解析（x=${vbX} y=${vbY} w=${vbW} h=${vbH}）`);

  const V = Math.min(VISIBLE, cats.length);
  const pt = d => { const a = d * Math.PI / 180; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
  const xs = [], ys = [];
  for (let r = 0; r < V; r++) { const [x, y] = pt(-SPRED + 2 * SPRED * (r / (V - 1 || 1))); xs.push(x); ys.push(y); }
  const bulge = Math.max(...xs) - Math.min(...xs), span = Math.max(...ys) - Math.min(...ys);
  console.log(`        可见 ${V}/${cats.length} 条 · 弧最右 x=${Math.max(...xs).toFixed(0)} 起 x=${Math.min(...xs).toFixed(0)} ` +
              `y ${Math.min(...ys).toFixed(0)}~${Math.max(...ys).toFixed(0)}  弯/跨=${(bulge / span).toFixed(3)}`);
  ok(bulge > 0 && bulge / span > t.ratio[0] && bulge / span < t.ratio[1],
     `弯曲比 ${(bulge / span).toFixed(3)} 在 ${t.ratio[0]}~${t.ratio[1]}（像 PPT 那段弧）`);
  ok(Math.min(...ys) - BAR_H / 2 > vbY && Math.max(...ys) + BAR_H / 2 < vbY + vbH,
     `条子纵向不出 viewBox（${(Math.min(...ys) - BAR_H / 2).toFixed(0)} ~ ${(Math.max(...ys) + BAR_H / 2).toFixed(0)}，viewBox y ${vbY}~${vbY + vbH}）`);
  ok(BAR_RIGHT <= vbX + vbW - 10, `条子右端 ${BAR_RIGHT} ≤ viewBox 右缘 ${vbX + vbW} - 10（右端对齐且不裁切）`);
  ok(Math.min(...xs) - NODE_R > vbX, `节点圆整颗在 viewBox 内（最左 ${(Math.min(...xs) - NODE_R).toFixed(0)} > ${vbX}，别把圆裁掉）`);
  const gap = (span / (V - 1 || 1)) - BAR_H;
  ok(gap > 8, `相邻条子净间距 ${gap.toFixed(0)} > 8（不粘连）`);
  /* 弧上标签按 LABEL_MAX 截断（和页面里那套一致），再量宽度 */
  const arcLabel = s => { const cp = [...plain(s)]; return cp.length > LABEL_MAX ? cp.slice(0, LABEL_MAX - 1).join('') + '…' : cp.join(''); };
  const widest = cats.reduce((a, c) => textW(arcLabel(c.label), FONT) > textW(arcLabel(a.label), FONT) ? c : a, cats[0]);
  /* 最长文字按**最坏情况**量：小节条目会往右缩一格（INDENT = NODE_R），所以加上它 */
  const txtEnd = Math.max(...xs) + NODE_R + TXT_GAP + NUM_FONT * 2.1 + textW(arcLabel(widest.label), FONT);
  ok(txtEnd < BAR_RIGHT - 10, `最长文字「${arcLabel(widest.label)}」末端 ${txtEnd.toFixed(0)} < 条右端 ${BAR_RIGHT}-10（文字不出条）`);
  ok(Math.max(...xs) + NODE_R < BAR_RIGHT, '节点圆整颗落在条子范围内');
  ok(ARC > SPRED, `弧画到 ±${ARC}°，比节点分布 ±${SPRED}° 略长（两端露头，像 PPT）`);

  /* 4) 右侧：只渲染「当前节」的按钮 + 正文 */
  ok(/\.crumb\{[^}]*align-self:stretch/s.test(html), 'crumb 占满右栏宽度（align-self:stretch）');
  ok(/\.tip\{[^}]*font-size:17px/s.test(html), '细节框字号 17px（做大过）');
  ok(/\.tip\[hidden\]\{[^}]*display:none/s.test(html), '细节框有 [hidden] 收起规则');
  ok(/tipBox\.hidden = true/.test(html) && /tipBox\.hidden = false/.test(html),
     '没条目的节收起细节框、有条目的节再显示');

  /* 4b) 滚动动画 + 点击命中（这两条都踩过坑，别退化回去） */
  ok(/function step\(\)/.test(html) && /requestAnimationFrame\(step\)/.test(html),
     '滚动是 rAF 逐帧缓动（step），不是瞬移');
  ok(/function draw\(\)/.test(html) && /edgeFade/.test(html) && /topOf\(p\)/.test(html),
     '逐帧画（draw）+ 连续位置（p/topOf）+ 滑出淡出（edgeFade）都在');
  ok(!/\.prog\{[^}]*transition/s.test(html) && !/\.knobg\{[^}]*transition/s.test(html),
     '进度弧 / 指示点不带 CSS 过渡（逐帧驱动，挂着会两边打架）');
  ok(/body\.gliding/.test(html), '滚动期间关掉颜色过渡（否则换内容那一刻会闪）');
  ok(/document\.elementFromPoint/.test(html),
     '点击用坐标命中判定（pointer capture 会把 click 转到 .arc 上，<g> 的 click 收不到）');

  /* 5) 配色 = SV2 主题值 */
  ['#232325', '#2d2b2e', '#3c3a3d', '#ebe1ec', '#7eb12e'].forEach(h =>
    ok(html.toLowerCase().includes(h), `含 SV2 色 ${h}`));

  /* 6) 布局：右主体 = 标题 + 按钮 + 细节 + 正文
     ⚠️ 2026-09-25 改了"居中"的实现：原来是 .pane/.inner 的 justify-content:center，
        但 flex 居中 + 滚动容器会在内容超长时**裁掉顶部** ⇒ 改成
        `.pane{justify-content:flex-start;overflow-y:auto}` + `.inner{margin-block:auto}`
        （auto 外边距在放得下时居中、放不下时收缩成 0，两头都不裁）。 */
  ok(/\.pane\{[^}]*display:flex[^}]*align-items:center[^}]*justify-content:safe center/s.test(html),
     '.pane 纵向 safe center + 可滚（短内容居中、超长不裁顶）');
  ok(/\.inner\{[^}]*display:flex[^}]*align-items:center/s.test(html), '.inner 仍是 flex + 横向居中');
  ok(/\.chips\{[^}]*flex-wrap:wrap[^}]*justify-content:center/s.test(html), '.chips 换行且居中');
  ok(/\.pane::before\{[^}]*dashed/s.test(html), '有竖向虚线分栏（PPT 那条）');
  ok(/\.chip\{[^}]*font-size:18\.5px/s.test(html), '按钮字号 18.5px（做大过）');

  /* 6b) 可读性：字放大之外，灰字要提亮、文字别直接压在花背景上 */
  ok(/--sv-muted:rgba\(255,255,255,\.(7[5-9]|8|9)/.test(html), '灰字提亮（--sv-muted 不透明度 ≥ .75）');
  ok(/--sv-body:rgba\(255,255,255,\.(8[5-9]|9)/.test(html) && /color:var\(--sv-body\)/.test(html),
     '正文字色 --sv-body ≥ .85 且在用');
  ok(/\.body\{[^}]*background:/s.test(html), '正文区有暗底衬（表格 / 段落不直接压背景）');
  ok(/text-shadow:0 1px 4px/.test(html), '右栏文字有投影（压背景纹理上也读得清）');
  ok(/\.body table\{[^}]*font-size:16\.5px/s.test(html), '表格字号 16.5px（做大过）');
  ok(/\.crumb \.desc\{[^}]*font-size:16\.5px/s.test(html), '导语字号 16.5px');

  /* 4d) ⏳ 待补：只在渲染时隐藏（数据必须原样留着，否则和 md 的逐字节比对会红） */
  ok(/const HIDE_TODO = true;/.test(html), '⏳ 待补默认隐藏（一个常量可翻回来）');
  ok(/items = items\.filter\(it => !it\.todo\)/.test(html) && /r\.some\(isTodo\)/.test(html) &&
     /isTodo\(b\.v\[0\]\)/.test(html) && /isTodo\(b\.v\)/.test(html),
     '待补条目 / 表行 / 备注 / 段落都在渲染时滤掉');
  ok(/⏳/.test(html), '数据里仍保留 ⏳（只隐藏、不删数据）');

  /* 7) 背景图 */
  const bg = path.join(dir, 'bg.png');
  ok(fs.existsSync(bg), `bg.png 存在（${fs.existsSync(bg) ? (fs.statSync(bg).size / 1024).toFixed(0) + ' KB' : '缺失'}）`);

  /* 8) 两版同源的标记 */
  if (t.file === 'index.html') {
    ok(!/本文件由 tools\/gen-demo-rec\.cjs/.test(html), 'index.html 是手改的真源（不是生成出来的）');
  } else {
    ok(/本文件由 tools\/gen-demo-rec\.cjs/.test(html), 'rec.html 带「生成文件、别手改」标记');
  }
}

/* 9) 两版内容必须完全同源（只许差左侧条数与字号）*/
console.log('\n── 两版同源');
ok(!!(demos['index.html'] && demos['rec.html']) && demos['index.html'] === demos['rec.html'],
   'index.html 与 rec.html 的数据块完全一致');

/* 10) **应用内帮助页**（2026-09-25 用户定：orb 右键 → 帮助）
 *   它由 gen-demo-data.cjs 从同一份 html 复制到 electron/src/help/（进 asar，随包分发），
 *   只改两处门面文案。这里钉三件事：① 只差那两处 ② bg.png 逐字节一致 ③ 相对依赖只有 bg.png 且都在。
 *   为什么值得钉：`docs/` 被 .gitignore 挡住**不进包**，帮助页是唯一一份会装到用户机器上的副本；
 *   它一旦漂移（md 改了没重跑生成器、或以后加了图片忘了复制），用户看到的帮助就是旧的/破的。 */
console.log('\n── 应用内帮助页（electron/src/help/）');
{
  const helpDir = path.join(__dirname, '..', 'electron', 'src', 'help');
  const helpHtmlPath = path.join(helpDir, 'index.html');
  const demoHtmlPath = path.join(dir, 'index.html');
  if (!fs.existsSync(helpHtmlPath)) {
    ok(false, 'electron/src/help/index.html 存在（跑 node tools/gen-demo-data.cjs 生成）');
  } else {
    const H = fs.readFileSync(helpHtmlPath, 'utf8');
    const D = fs.readFileSync(demoHtmlPath, 'utf8');
    // ① 只许差两处门面（把帮助版改回演示版，应逐字节相同）
    const unhelp = H
      .replace('<title>AKDAgent 使用说明', '<title>SVAgent 功能演示')
      .replace('<div class="brand"><b>AKDAgent</b><span>使用说明</span></div>',
               '<div class="brand"><b>SVAgent</b><span>功能演示</span></div>');
    ok(unhelp === D, '帮助页与演示页只差「品牌名 + 页头」两处（其余逐字节相同）');
    ok(/class="brand"><b>AKDAgent<\/b><span>使用说明<\/span>/.test(H), '帮助页门面已换成 AKDAgent / 使用说明');
    // ② 背景图
    const bgHelp = path.join(helpDir, 'bg.png');
    const bgDemo = path.join(dir, 'bg.png');
    ok(fs.existsSync(bgHelp) && fs.existsSync(bgDemo) &&
       fs.readFileSync(bgHelp).equals(fs.readFileSync(bgDemo)), 'bg.png 与演示页逐字节一致');
    // ③ 相对依赖只有 bg.png，且都得在
    const deps = [...H.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)]
      .map(m => m[1]).filter(u => !/^(https?:|data:|#|mailto:)/.test(u));
    ok(deps.length > 0 && deps.every(d => d === 'bg.png'), `相对依赖只有 bg.png（实测：${[...new Set(deps)].join(', ') || '无'}）`);
  }
}

console.log(bad ? `\n${bad} 项不通过` : '\n全部通过');
process.exit(bad ? 1 : 0);
