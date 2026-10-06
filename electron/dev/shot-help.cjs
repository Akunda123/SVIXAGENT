/**
 * 帮助页（演示页）**分节截图器** —— 给"帮助页改了文案/加了章节"留一份**能看的**证据。
 *
 * 为什么需要：帮助页（`electron/src/help/index.html`）是**从 `README-发布版草案-v2.md` 生成**的
 * （`tools/gen-demo-data.cjs`），改完只跑守卫只能证明"数据进去了"，**版面好不好看、章节跳得对不对**得看图。
 * 而它的左弧是逐帧缓动（`glide`）滚动的 ⇒ 普通截图很容易截到"还在滚"的中途。
 *
 * ⚠️ 两个坑（都踩过）：
 *   ① **窗口必须 `show:true`**：隐藏窗口里 rAF 被节流，`go(i)` 调了也不动 ⇒ 截出来还是默认节（§3.1）；
 *   ② 截前**先读右栏面包屑**（`.crumb`）确认真的到了目标节，别凭感觉。
 *
 * 用法（electron 目录下）：
 *   npx electron dev/shot-help.cjs                 # 默认截「五 ACE Studio」
 *   npx electron dev/shot-help.cjs 3.11            # 章节号或标题关键词都认
 *   npx electron dev/shot-help.cjs 2.6 附件事.png   # 第二参数 = 输出文件名
 * 产物：`electron/dev/shots/<名字>.png`
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const WANT = process.argv[2] || '五';
const OUTNAME = process.argv[3] || ('help-' + WANT.replace(/[^\w.]/g, '') + '.png');
const HELP = path.join(__dirname, '..', 'src', 'help', 'index.html');
const OUT_DIR = path.join(__dirname, 'shots');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200, height: 820, show: true,          // ⚠️ 必须可见，否则 rAF 被节流（见头注释 ①）
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const js = (code) => win.webContents.executeJavaScript(code);
  await win.loadFile(HELP);
  await new Promise((r) => setTimeout(r, 700));

  const info = await js(`
    (() => {
      const NAV = DEMO.nav;
      const i = NAV.findIndex((c) => c.num === ${JSON.stringify(WANT)} || c.label === ${JSON.stringify(WANT)}
        || c.label.startsWith(${JSON.stringify(WANT)}));
      if (i >= 0 && typeof go === 'function') go(i);
      return { i, found: i >= 0, label: i >= 0 ? NAV[i].num + ' ' + NAV[i].label : null, n: NAV.length };
    })()
  `);
  console.log('[shot] ' + JSON.stringify(info));
  if (!info.found) { console.error('[shot] 找不到该章节：' + WANT); app.exit(1); return; }

  await new Promise((r) => setTimeout(r, 1600));   // 等缓动跑完
  const crumb = await js(`(() => { const c = document.querySelector('.crumb'); return c ? c.textContent.trim() : '(无 crumb)'; })()`);
  console.log('[shot] 右栏面包屑：' + crumb.slice(0, 80));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, OUTNAME);
  fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
  console.log('[shot] saved: ' + file);
  app.quit();
});
