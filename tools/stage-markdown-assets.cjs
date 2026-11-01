/**
 * stage-markdown-assets.cjs ── 客户端 Markdown / 语法高亮 / LaTeX / Mermaid 前端套件检查与落位
 *
 * 组件清单与开源协议（100% 宽松友好）：
 *   - marked (MIT): GFM Markdown 核心解析引擎
 *   - DOMPurify (MIT / Apache-2.0): 工业级 HTML 安全净化与 XSS 防护库
 *   - Prism.js (MIT): 语法高亮引擎与精选常用编程语言 bundle
 *   - KaTeX (MIT): 轻量超快数学公式排版库及字体
 *   - Mermaid (MIT): 图表/流程图渲染引擎
 *
 * 用法：
 *   node tools/stage-markdown-assets.cjs --check    # 核对资产完整性与存在性
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'electron', 'src', 'vendor');

const MUST_FILES = [
  'marked/marked.min.js',
  'marked/LICENSE',
  'dompurify/purify.min.js',
  'dompurify/LICENSE',
  'prism/prism.bundle.min.js',
  'prism/prism-tomorrow.min.css',
  'prism/LICENSE',
  'katex/katex.min.js',
  'katex/katex.min.css',
  'katex/LICENSE',
  'mermaid/mermaid.min.js',
  'mermaid/LICENSE'
];

let failed = 0;
console.log('【核对客户端 Markdown 离线套件资产】');
for (const f of MUST_FILES) {
  const p = path.join(VENDOR, f);
  if (!fs.existsSync(p)) {
    console.error('  ❌ 缺失资产：' + f);
    failed++;
  } else {
    const st = fs.statSync(p);
    console.log(`  ✅ ${f}  (${(st.size / 1024).toFixed(1)} KB)`);
  }
}

if (failed) {
  console.error(`❌ 检查失败：缺失 ${failed} 项资产`);
  process.exit(1);
} else {
  console.log('✅ 所有 Markdown / LaTeX / Mermaid / Prism 离线资产就绪');
}
