/* 生成「演示视频录制版」演示页：docs/demo/rec.html
   —— 只换左侧显示条数与字号（3 条 / 大一些），内容（nav + chips）与 index.html 完全同源，
      避免两份页面文案漂移。
   用法：node tools/gen-demo-rec.cjs
   真源：docs/demo/index.html（手改只能改它）                                  */
const fs = require('fs'), path = require('path');

const src = path.join(__dirname, '..', 'docs', 'demo', 'index.html');
const dst = path.join(__dirname, '..', 'docs', 'demo', 'rec.html');

const REPL = [
  ['<title>SVAgent 功能演示 · 用对话操作 Synthesizer V Studio / Instrument X</title>',
   '<title>SVAgent 功能演示 · 录制版（左侧 3 条）</title>'],
  ["const SPRED = 30;", "const SPRED = 20;"],
  ["const ARC = 32;", "const ARC = 26;"],
  ["const NODE_R = 14, BAR_H = 30, BAR_RIGHT = 980, FONT = 20, NUM_FONT = 14, TXT_GAP = 38, LABEL_MAX = 27;",
   "const NODE_R = 30, BAR_H = 180, BAR_RIGHT = 1110, FONT = 44, NUM_FONT = 26, TXT_GAP = 64, LABEL_MAX = 13;"],
  ["const VISIBLE = 18;", "const VISIBLE = 3;"],
  ["（18 = 全部显示）", "（3 = 录制版：只露 3 条，滚轮滑）"],
  /* 录制版「左侧字要更大」的两把真钥匙（光调 FONT 没用：弧上标签宽度是 viewBox 单位定的，
     FONT 一涨能显示的字数就掉）：
       ① viewBox 裁到内容（左边 230 刚够包住节点圆、上下各留 ~58）⇒ 同样的单位数放大更多倍
       ② 弧列加宽（index 版 640 → 录制版 900px）⇒ 每单位更多像素（1680 宽的窗里 scale 从 0.854 变 1.0）
     合计：左侧字号从 38×0.854 ≈ 32px 变成 44×1.0 = 44px，而每条仍能显示 13 个字。
     ⚠️ 2026-09-25：index 版的 --arcw 收窄成 min(44vw,640px)，这里的 from 串要同步改。 */
  ['viewBox="180 0 820 1000"', 'viewBox="230 20 900 920"'],
  /* 用户 2026-09-25：录制版要**左右三七分** ⇒ 左列纯 30vw（不加 px 上限，严格 3:7）。
     代价已知：列从 900px 收到 30vw（1256 宽窗口 ≈ 377px）⇒ 左侧字从 ~28px 降到 ~15px。
     （index 版仍是 min(44vw,640px)：浏览版左边要能看清条目。） */
  ['--arcw:min(44vw,640px);', '--arcw:30vw;'],
  /* ⚠️ 2026-09-25（用户「改 rec」）：**不再**把 svgwrap 换回 100% —— 录制版跟 index 一样收窄 12%。
     它靠"大列 + 大字"（44px）出效果，收窄后仍有 ~35px，比 index 的 ~12.6px 大得多。 */
];

/* ══════════════════════════════════════════════════════════════════════════
   片头（**rec 专用**，用户 2026-09-25 要求）
   ① 居中出 SV / IX 的 logo **主体**（整标先裁到主体：SV 12.3% / IX 11.3%，主体居中）
   ② 主体**左移** + 全名**擦出**（clip-path 从"只露主体"到全露，同一个元素 ⇒ 不会对齐跳变）
   ③ 中间出现 **AI Agent**
   ④ 整块淡出，露出演示页
   素材（只这两个，正是用户点名的）：
     assets/syn-logo-anim.svg      [V] Synthesizer V Studio —— **自带 24 条描边+填充动画**（5s，逐条错开）
     assets/instrumentx-logo.svg   [X] Instrument X —— 静态（无内置动画）
   "出现动画和 orb 相同"：orb 的做法是 **动画 SVG + `?v=Date.now()` 重放**（orb.html:408-410）
     ⇒ 这里同样给 src 追 `?v=`；IX 没有内置动画，用 orb 那套 `transform .25s ease / opacity .2s ease` 过渡代替
   跳过：点击 / 任意键；`?intro=0` 不进片头；`?intro=NNNN` 跳到 NNNN 毫秒并**停住**（调参/截图用）
   ⚠️ 主体占比若换素材要重量：在浏览器里对 <object> 取 `path.getBBox()` 聚合最左侧那一簇 */
const INTRO_CSS = `
  /* ── 片头（rec 专用；由 gen-demo-rec.cjs 注入，改 index.html 不会影响它）──
     **默认不播**（hidden）：页面一进来就是 stage；按 A（或 Esc 收）手动播/收。 */
  #intro{position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:clamp(8px,1.8vh,22px);background:var(--sv-bg,#232325);
    opacity:1;transition:opacity .6s ease}
  #intro[hidden]{display:none}
  #intro.done{opacity:0;pointer-events:none}
  /* 背景**跟页面同一套**：bg.png（object-fit:cover）+ 同款 scrim 渐变
     ⇒ 片头不是一块纯色，和演示页的底纹一致；用同一个 body.has-img 开关（图没加载出来就退回纯色） */
  #intro .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;display:none}
  body.has-img #intro .bg{display:block}
  #intro .scrim{position:absolute;inset:0;z-index:0;pointer-events:none;
    background:
      radial-gradient(120% 105% at 50% 50%, rgba(35,35,37,.16) 0%, rgba(35,35,37,.58) 72%, rgba(35,35,37,.86) 100%),
      linear-gradient(180deg, rgba(35,35,37,.40) 0%, rgba(35,35,37,.08) 42%, rgba(35,35,37,.50) 100%)}
  #intro .row,#intro .ai{position:relative;z-index:1}
  /* 锁版：两个整标左对齐、上下叠；AI Agent **贴右边、纵向居中于两块之间**
     （用户 2026-09-25：「调整布局…可以在右侧右对齐」；「整体三个部分都放大」）
     尺寸全走这三个变量 ⇒ 想整体放大只改这里。
     ⚠️ 行高上限从**锁版宽度**反推：整标宽 = 行高×9（SV 宽高比），右侧 AI Agent 可见宽 ≈ 行高×2.12
        ⇒ 行高 ≤ 锁版宽 / 11.6（留 ~4% 间隙）。**只按 vw/vh 不行**：锁版宽有 1040px 上限，
        宽窗口（如 1650×955）下 7.2vw 就不再是约束了 —— 实测会压到 AI Agent 上 232px。
     （⚠️ 注释里别写反引号 —— INTRO_CSS 是 JS 模板字符串，反引号会把它截断） */
  #intro{--lock-w:min(1040px,80vw);
    --row-h:clamp(48px,min(12vh,7.2vw,calc(var(--lock-w) / 11.6)),132px);
    --ai-h:calc(var(--row-h) * .5)}
  #intro .lockup{position:relative;z-index:1;width:var(--lock-w);
    display:flex;flex-direction:column;gap:clamp(10px,2.4vh,30px)}
  #intro .row{position:relative;width:100%;height:var(--row-h)}
  /* 整标**始终 left:0**；"主体居中"完全靠 transform 的 px 位移（--ctr 由 JS 量出来）
     ⇒ 阶段②把 transform 归零就自然"左移到位"，不会像用 left:50% 那样停在中间 */
  #intro .logo{position:absolute;left:0;top:0;height:100%;width:auto;display:block;
    opacity:0;transform:translateX(var(--ctr,0px)) scale(.96);
    clip-path:inset(0 calc(100% - var(--mark,12%)) 0 0);
    transition:transform 1s cubic-bezier(.22,.61,.36,1), opacity .45s ease,
               clip-path 1.3s cubic-bezier(.22,.61,.36,1)}
  #intro.p1 .logo{opacity:1;transform:translateX(var(--ctr,0px)) scale(1)}
  #intro.p2 .logo{opacity:1;transform:translateX(0) scale(1);clip-path:inset(0 0 0 0)}
  /* AI Agent：直接用 ixagent-text.svg 的字形（裁掉它前面的「IX」，只留 AI Agent）
     —— 自带逐字 1s 描边动画（重载即重放），所以这里只做"从右滑入 + 淡入" */
  #intro .ai{position:absolute;right:0;top:50%;height:var(--ai-h);width:auto;display:block;
    clip-path:inset(0 0 0 23.4%);
    opacity:0;transform:translateY(-50%) translateX(14px);
    transition:opacity .5s ease, transform .5s cubic-bezier(.22,.61,.36,1)}
  #intro.p3 .ai{opacity:1;transform:translateY(-50%) translateX(0)}
`;
const INTRO_HTML = `
<div id="intro" hidden aria-hidden="true">
  <img class="bg" alt="" src="bg.png">
  <div class="scrim"></div>
  <div class="lockup">
    <div class="row"><img class="logo" id="intro-sv" data-src="syn-logo-anim.svg" alt="Synthesizer V Studio"></div>
    <div class="row"><img class="logo" id="intro-ix" data-src="instrumentx-logo.svg" alt="Instrument X"></div>
    <img class="ai" id="intro-ai" data-src="ixagent-text.svg" alt="AI Agent">
  </div>
</div>
`;
const INTRO_JS = `
/* ── 片头控制（rec 专用）────────────────────────────────────────────────────
   默认**手动**：页面进来是 stage；按 **A** ⇒ 盖住 stage 播一遍（时间轴见 T，整段 ≈ 4s）；
   **播完停在结尾**（主体左移到左、全名 + AI Agent 都在），**再按 A（或 Esc）才切回 stage**。
   ?intro=auto 改成"播完自动收起"；?intro=0 整个功能关掉；?intro=NNNN 跳到该毫秒并停住（调参用）。 */
(function(){
  const intro = document.getElementById('intro');
  if (!intro) return;
  const q = new URLSearchParams(location.search);
  if (q.get('intro') === '0'){ intro.remove(); return; }
  const AUTO = q.get('intro') === 'auto';            // 只有显式 ?intro=auto 才自动收起
  /* 版本标记：改了片头就 +1 —— 用来一眼确认"浏览器里那份是不是旧的"（打开控制台看这行） */
  const INTRO_V = 'v4';
  console.log('[intro] ' + INTRO_V + ' · 按 A 播 / 再按 A 切回' + (AUTO ? '（本次是 auto：播完自动收起）' : '') + '；?intro=0 关闭');
  const T = { mark: 300, wipe: 1400, ai: 2600, out: 4000, fade: 600 };
  const sv = document.getElementById('intro-sv'), ix = document.getElementById('intro-ix');
  const ai = document.getElementById('intro-ai');
  /* 主体占整标宽的比例（用 getBBox 量出来的：SV 12.3% / IX 11.3%，换素材要重量） */
  const MARK = [[sv, 0.123], [ix, 0.113]];
  let playing = false, timers = [];
  function layout(){
    for (const [el, k] of MARK){
      const row = el.parentElement;
      el.style.setProperty('--mark', (k * 100).toFixed(2) + '%');
      const w = el.getBoundingClientRect().width;
      if (w > 0) el.style.setProperty('--ctr', Math.round(row.clientWidth / 2 - w * k / 2) + 'px');
    }
  }
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  /* 装素材：和 orb 一样给 src 追查询串 ⇒ 重放 SVG 自带的开场动画（见 orb.html:408-410）
     ⚠️ 播放与"跳转模式"都要走这里 —— 之前跳转模式忘了设 src，截图里整标全是 alt 文本框 */
  function load(){
    const ts = Date.now();
    sv.src = sv.dataset.src + '?v=' + ts;
    ix.src = ix.dataset.src + '?v=' + ts;
    ai.src = ai.dataset.src + '?v=' + ts;      // AI Agent 也用素材字形（自带逐字描边动画）
    layout(); requestAnimationFrame(layout);
  }

  function play(){
    if (playing) return;
    playing = true;
    clear();
    intro.hidden = false;
    intro.className = '';                       // 清掉 p1/p2/p3/done
    load();
    at(T.mark, () => intro.classList.add('p1'));
    at(T.wipe, () => intro.classList.add('p2'));
    at(T.ai,   () => intro.classList.add('p3'));
    if (AUTO) at(T.out, hide);                  // 默认**不**自动收起：停在结尾，等下一次按 A
  }
  function hide(){
    clear();
    playing = false;
    intro.classList.add('done');                // 淡出
    at(320, () => { intro.hidden = true; intro.className = ''; });   // 让开 stage，下次可重播
  }
  sv.addEventListener('load', layout); ix.addEventListener('load', layout);
  addEventListener('resize', layout);
  addEventListener('keydown', e => {
    if (e.key === 'a' || e.key === 'A' || e.key === 'Escape'){ if (playing) hide(); else play(); }
  });

  /* ?intro=NNNN：显示片头并跳到该毫秒停住（调参/截图用） */
  const jump = Number(q.get('intro'));
  if (Number.isFinite(jump) && jump > 0){
    intro.hidden = false;
    load();                                     // ⚠️ 这里也要 load（否则整标没 src、只显示 alt 文本）
    if (jump >= T.mark) intro.classList.add('p1');
    if (jump >= T.wipe) intro.classList.add('p2');
    if (jump >= T.ai)   intro.classList.add('p3');
    if (jump >= T.out)  intro.classList.add('done');
  }
})();
`;

let html = fs.readFileSync(src, 'utf8');
const before = html;

for (const [from, to] of REPL) {
  const n = html.split(from).length - 1;
  if (n !== 1) {
    console.error(`✗ 替换串出现 ${n} 次（应为 1 次），拒绝生成：${JSON.stringify(from.slice(0, 60))}`);
    process.exit(1);
  }
  html = html.replace(from, to);
}

/* 注入片头（三处锚点各必须只出现一次） */
for (const [anchor, payload, where] of [
  ['</style>', INTRO_CSS, '前'],
  ['<body class="no-media">', INTRO_HTML, '后'],
  ['</script>', INTRO_JS, '前'],
]) {
  const n = html.split(anchor).length - 1;
  if (n !== 1) { console.error(`✗ 片头注入锚点 ${anchor} 出现 ${n} 次（应为 1 次）`); process.exit(1); }
  html = where === '后' ? html.replace(anchor, anchor + payload)
                        : html.replace(anchor, payload + anchor);
}
if (!html.includes('id="intro"')) { console.error('✗ 片头没注进去'); process.exit(1); }

/* 防假绿：替换后必须真的变了，且 index.html 的标题/常量不该再出现 */
if (html === before) { console.error('✗ 生成结果与源文件完全相同'); process.exit(1); }
for (const [from] of REPL) {
  if (html.includes(from)) { console.error(`✗ 替换没生效：${JSON.stringify(from.slice(0, 60))}`); process.exit(1); }
}

/* 生成文件顶部盖一行「别手改」的提示（幂等：先去掉旧的再加） */
html = html.replace(/^<!-- ⚠️ 本文件由[\s\S]*?-->\n/, '');
html = html.replace('<!DOCTYPE html>\n',
  '<!DOCTYPE html>\n<!-- ⚠️ 本文件由 tools/gen-demo-rec.cjs 从 docs/demo/index.html 生成（只换左侧条数与字号）。\n' +
  '     要改内容请改 index.html 后重跑：node tools/gen-demo-rec.cjs —— 别手改这份 -->\n');

fs.writeFileSync(dst, html, 'utf8');

/* 片头素材拷到 docs/demo/（rec.html 用相对路径引用；docs/ 不进版本库 ⇒ 每次生成都补一份）
   ⚠️ 整标自带的"描边 + 填充"动画是 **5s**（24 条 path、每条错开 ~34ms）—— 对片头太慢：
      实测 orb 用的标记动画只要 **1s**（electron/src/sv-monogram-anim.svg）
      ⇒ 这里把整标那份的时长/延迟整体 ×0.44（5s → 2.2s），**只改 animation 简写里的两个秒数**，
        不动 stroke-dasharray / 颜色 / 路径。原文件不动，改的是拷过去的那份。 */
const SPEED = 2.2 / 5;
let svgTweaked = 0;
for (const f of ['syn-logo-anim.svg', 'instrumentx-logo.svg']) {
  const from = path.join(__dirname, '..', 'assets', f);
  const to = path.join(path.dirname(dst), f);
  if (!fs.existsSync(from)) { console.error('✗ 片头素材找不到：' + from); process.exit(1); }
  let svg = fs.readFileSync(from, 'utf8');
  const nAnim = (svg.match(/animation:/g) || []).length;
  if (f === 'syn-logo-anim.svg' && nAnim > 0) {
    svg = svg.replace(/animation:(\s*[\w-]+\s+)([\d.]+)s(\s+[\w-]+)(\s+[\d.]+)s/g,
      (m, pre, dur, ease, delay) => 'animation:' + pre + (+dur * SPEED).toFixed(3) + 's' + ease + ' ' + (+delay * SPEED).toFixed(3) + 's');
    const nDur = (svg.match(/animation:\s*[\w-]+\s+2\.2\d\ds/g) || []).length;
    if (nDur !== nAnim) { console.error(`✗ 动画加速没全部生效：${nDur}/${nAnim}`); process.exit(1); }
    svgTweaked = nAnim;
  }
  fs.writeFileSync(to, svg, 'utf8');
}
/* AI Agent 的字形（ixagent-text.svg「IX AI Agent」⇒ 片头里裁掉前面 IX，只留 AI Agent） */
{
  const from = path.join(__dirname, '..', 'electron', 'src', 'ixagent-text.svg');
  const to = path.join(path.dirname(dst), 'ixagent-text.svg');
  if (!fs.existsSync(from)) { console.error('✗ 片头 AI Agent 素材找不到：' + from); process.exit(1); }
  fs.copyFileSync(from, to);
}

const kb = s => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1) + ' KB';
console.log(`✓ 已生成 ${path.relative(path.join(__dirname, '..'), dst)}  ${kb(html)}  ` +
            `（源 ${kb(before)}，${REPL.length} 处替换）`);
