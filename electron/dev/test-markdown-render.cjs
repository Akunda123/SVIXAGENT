/**
 * test-markdown-render.cjs ── 悬浮球 Markdown / LaTeX / 图表流式渲染与 XSS 净化回归测试
 *
 * 核心验证：
 *   1. XSS 防御与安全拦截（维护者审阅的 4 类攻击用例全覆盖）：
 *      - <img onerror=...> 属性被剥离
 *      - <script> 标签及脚本被清除
 *      - javascript: / data: 伪协议链接被拦截
 *      - <iframe> 被清除
 *   2. 原生 HTML 保留能力（用户诉求）：
 *      - <font color="red">、<span style="...">、<details><summary> 等安全排版标签正常渲染
 *   3. GFM / 代码高亮 / 数学公式 / Mermaid 语法渲染正例
 *
 * 跑法：npx electron dev/test-markdown-render.cjs
 * 退出码：0 = 全部通过；1 = 有断言失败
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const i18n = require(path.join(__dirname, '..', 'src', 'i18n'));

app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  i18n.init({
    getPath: () => fs.mkdtempSync(path.join(os.tmpdir(), 'akdagent-md-')),
    getSystemLocale: () => 'zh-CN',
    getLocale: () => 'zh-CN'
  });
  i18n.setLocale('zh-Hans');

  ipcMain.on('akdagent-i18n-sync', (e) => {
    e.returnValue = { locale: i18n.getLocale(), dict: i18n.dictFor('orb') };
  });

  const win = new BrowserWindow({
    width: 600,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'src', 'orb-preload.js')
    }
  });

  const orbUrl = path.join(__dirname, '..', 'src', 'orb.html');
  await win.loadFile(orbUrl);

  const testScript = [
    '(() => {',
    '  const suite = [];',
    '  function assert(name, condition, extra = "") {',
    '    suite.push({ name, pass: !!condition, extra });',
    '  }',
    '  // 1. XSS 防护与脚本拦截（维护者 4 大用例）',
    '  const xss1 = renderMarkdown("<img src=x onerror=\\"window.__x=1\\">");',
    '  assert("XSS: onerror 事件处理器被剥离", !xss1.includes("onerror") && !xss1.includes("window.__x"), xss1);',
    '',
    '  const xss2 = renderMarkdown("<script>window.__y=1<" + "/script>");',
    '  assert("XSS: <script> 标签与脚本内容被清除", !xss2.includes("<script>") && !xss2.includes("window.__y"), xss2);',
    '',
    '  const xss3 = renderMarkdown("[click](javascript:window.__z=1)");',
    '  assert("XSS: javascript: 伪协议链接被拦截", !xss3.includes("href=\\"javascript:") && !xss3.includes("window.__z"), xss3);',
    '',
    '  const xss4 = renderMarkdown("<iframe src=\\"file:///C:/Windows/win.ini\\"></iframe>");',
    '  assert("XSS: <iframe> 框架被彻底清除", !xss4.includes("<iframe") && !xss4.includes("win.ini"), xss4);',
    '',
    '  // 1.1 表单钓鱼拦截（建议 3：禁止可提交表单与输入框）',
    '  const form1 = renderMarkdown("<form action=\\"http://evil.com\\"><input type=\\"password\\"><button>登录</button><textarea></textarea></form>");',
    '  assert("Form: <form>/<input>/<button>/<textarea> 表单元素彻底剥离", !form1.includes("<form") && !form1.includes("<input") && !form1.includes("<button") && !form1.includes("<textarea"), form1);',
    '',
    '  // 1.2 CSS 属性白名单与布局劫持拦截（建议 2：仅放行排版类）',
    '  const css1 = renderMarkdown("<span style=\\"position: fixed; top: 0; z-index: 9999; color: red; font-weight: bold;\\">排版文字</span>");',
    '  assert("CSS: 拦截 position/top/z-index 布局劫持，仅保留 color/font-* 排版属性", !css1.includes("position") && !css1.includes("top") && !css1.includes("z-index") && css1.includes("color") && css1.includes("font-weight"), css1);',
    '',
    '  // 1.3 CSS 外部探针与危险模式拦截（建议 2：拦截 url/import/var）',
    '  const css2 = renderMarkdown("<span style=\\"background: url(http://evil.com/probe.png); color: blue;\\">外部探针</span>");',
    '  assert("CSS: 拦截 url(...) 外部数据探针，仅保留安全样式", !css2.includes("url") && !css2.includes("evil.com") && css2.includes("color"), css2);',
    '',
    '  // 1.4 CSS 伪元素文案与透明欺骗拦截（建议 4：拦截 content/opacity）',
    '  const css3 = renderMarkdown("<span style=\\"content: fake; opacity: 0;\\">文字</span><style>::before { content: fake }</style>");',
    '  assert("CSS: 拦截 content 伪造文字与 <style> 标签注入", !css3.includes("content") && !css3.includes("opacity") && !css3.includes("<style"), css3);',
    '',
    '  // 1.5 CSS !important 权重劫持拦截',
    '  const css4 = renderMarkdown("<span style=\\"color: orange !important; font-size: 14px;\\">样式覆盖</span>");',
    '  assert("CSS: 拦截 !important 权重覆盖提升", !css4.includes("!important") && !css4.includes("orange"), css4);',
    '',
    '  // 2. 原生 HTML 保留能力（用户正向用例）',
    '  const html1 = renderMarkdown("<font color=\\"red\\">重要警示</font>");',
    '  assert("HTML: <font color=\\"red\\"> 原生渲染保留", html1.includes("<font") && html1.includes("color=\\"red\\"") && html1.includes("重要警示"), html1);',
    '',
    '  const html2 = renderMarkdown("<span style=\\"font-weight: bold; color: transparent;\\">粗体透明样式</span>");',
    '  assert("HTML: <span style=\\"...\\"> 安全样式与颜色透明保留", html2.includes("<span") && html2.includes("transparent") && html2.includes("粗体透明样式"), html2);',
    '',
    '  const html3 = renderMarkdown("<details><summary>点此展开</summary>详细说明内容</details>");',
    '  assert("HTML: <details><summary> 折叠块原生保留", html3.includes("<details>") && html3.includes("<summary>") && html3.includes("详细说明内容"), html3);',
    '',
    '  // 3. Markdown 正文与扩展能力',
    '  const tableMd = "| 表头1 | 表头2 |\\n| :--- | :--- |\\n| 数据A | 数据B |";',
    '  const tableOut = renderMarkdown(tableMd);',
    '  assert("GFM: 表格正确渲染且包含 .table-wrap 滚动包裹容器", tableOut.includes("class=\\"table-wrap\\"") && tableOut.includes("<table") && tableOut.includes("<th") && tableOut.includes("数据A"), tableOut);',
    '',
    '  const codeMd = "```js\\nconst a = 1;\\n```";',
    '  const codeOut = renderMarkdown(codeMd);',
    '  assert("Code: Prism 代码块语法高亮与容器", codeOut.includes("class=\\"code-wrap\\"") && codeOut.includes("language-js"), codeOut);',
    '',
    '  const mathMd = "行内公式 $E=mc^2$ 与块级 $$\\int_0^1 x dx$$";',
    '  const mathOut = renderMarkdown(mathMd);',
    '  assert("KaTeX: 数学公式渲染", mathOut.includes("class=\\"katex\\"") || mathOut.includes("katex-block"), mathOut);',
    '',
    '  const mermaidMd = "```mermaid\\nflowchart TD\\nA-->B\\n```";',
    '  const mermaidOut = renderMarkdown(mermaidMd);',
    '  assert("Mermaid: 矢量流程图容器生成", mermaidOut.includes("class=\\"mermaid-wrap\\"") && mermaidOut.includes("mermaid-zoom-hint"), mermaidOut);',
    '',
    '  const fnMd = "这是正文[^1]\\n\\n[^1]: 这是脚注详细内容";',
    '  const fnOut = renderMarkdown(fnMd);',
    '  assert("Footnote: 脚注引用与文末列表双向跳转", fnOut.includes("class=\\"md-fn-ref\\"") && fnOut.includes("class=\\"md-footnotes\\""), fnOut);',
    '',
    '  return suite;',
    '})()'
  ].join('\n');

  const results = await win.webContents.executeJavaScript(testScript);

  win.destroy();
  app.quit();

  console.log('【Markdown 渲染与安全净化测试结果】');
  let failed = 0;
  for (const r of results) {
    if (r.pass) {
      console.log(`  ✅ ${r.name}`);
    } else {
      console.error(`  ❌ ${r.name}`);
      if (r.extra) console.error(`     输出: ${r.extra}`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n❌ 测试未通过：共 ${failed} 个断言失败`);
    process.exit(1);
  } else {
    console.log(`\n🎉 全部 ${results.length} 项测试通过（含 4 项脚本 XSS 拦截、5 项表单/CSS 注入拦截、3 项原生 HTML 保留、5 项富文本语法）！`);
    process.exit(0);
  }
});
