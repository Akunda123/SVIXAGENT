#!/usr/bin/env node
/**
 * 设置页「模型增删」回归（2026-09-20）
 *
 * 背景：用户问「设置里的模型配置能跟 dsh 一样能设置具体模型吗」→ 查出来的是：
 *   · 后端 `addModel` / `removeModel` / `setDefaultModel` **三个 IPC 全都实现了**，
 *     但在 `settings.html` 里**一个都没被调用**（全仓 0 处引用）⇒ 界面上根本改不了模型列表。
 *   · 且旧代码在模型列表为空时会**造一个 `{ id: <提供方 id> }` 的假模型**（界面显示成
 *     「deepseek-official（默认）」）⇒ 选中保存会把 `agent-default-model.model` 写成提供方 id；
 *     而 DSH 对**不在目录里的 id 是透传**的（`dsh-llm-deepseek/lib/index.js:550`）⇒ 请求必然 400。
 * 本测试用**源码级断言**钉住这两条，防止再退回。
 *
 * 用法：`node tools/test-settings-model-ui.cjs [settings.html 路径]`
 *   （可选参数只为**负向自测**：拿改坏的副本跑，确认断言会红）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'electron', 'src');
const HTML = process.argv[2] ? path.resolve(process.argv[2]) : path.join(SRC, 'settings.html');
const PRELOAD = path.join(SRC, 'settings-preload.js');
const MAIN = path.join(SRC, 'main.js');
const I18N = path.join(SRC, 'i18n', 'settings.json');

let fails = 0;
const ok = (c, m, extra) => {
  console.log((c ? '  [ok]   ' : '  [FAIL] ') + m + (extra && !c ? '  ← ' + extra : ''));
  if (!c) fails += 1;
};

for (const f of [HTML, PRELOAD, MAIN, I18N]) {
  if (!fs.existsSync(f)) { console.error('❌ 缺文件：' + f); process.exit(2); }
}
const html = fs.readFileSync(HTML, 'utf8');
const preload = fs.readFileSync(PRELOAD, 'utf8');
const main = fs.readFileSync(MAIN, 'utf8');
const i18n = JSON.parse(fs.readFileSync(I18N, 'utf8'));
const locales = Object.keys(i18n);

console.log('A. 接线（设置页真的能增删模型）');
ok(/window\.svsettings\.addModel\(/.test(html), 'settings.html 调用了 addModel');
ok(/window\.svsettings\.removeModel\(/.test(html), 'settings.html 调用了 removeModel');
ok(/addModel:\s*\(m\)\s*=>\s*ipcRenderer\.invoke\('akdagent-add-model'/.test(preload),
  'preload 暴露 addModel → akdagent-add-model');
ok(/removeModel:\s*\(id\)\s*=>\s*ipcRenderer\.invoke\('akdagent-remove-model'/.test(preload),
  'preload 暴露 removeModel → akdagent-remove-model');
ok(/ipcMain\.handle\('akdagent-add-model'/.test(main) && /ipcMain\.handle\('akdagent-remove-model'/.test(main),
  '主进程两个 handler 都在');
// 增删只对 DeepSeek 专用插件路由开放（addModel 写的是 llm-deepseek.models）
ok(/const canEdit = p\.kind === 'deepseek'/.test(html), '增删只对 kind==="deepseek" 的提供方开放');

console.log('\nB. 空列表不再造假模型（真 bug）');
ok(!/\{ id: p\.id, name: p\.id \+ I\.t\('settings\.model\.defaultSuffix'\) \}/.test(html),
  '⚠️ 回归：不再造 `{ id: <提供方 id> }` 的假模型（会把 model 写成提供方 id ⇒ API 400）');
ok(/selectedModel \|\| undefined/.test(html),
  '★ 保存时 `selectedModel || undefined`（列表为空 ⇒ 只切提供方、不碰 model 字段）');
ok(/settings\.model\.emptyHintBuiltin/.test(html),
  '空列表时给"用内置目录"的提示（而不是空着/假条目）');

console.log('\nC. 后端语义（supportsImage / 删默认后的兜底）');
ok(/supportsImage\) entry\.input = \['text', 'image'\]/.test(main),
  "addModel 的 supportsImage ⇒ input: ['text','image']（图片输入必须靠它）");
ok(/if \(adm\.model === id\) \{[\s\S]{0,120}adm\.model = models\.length > 0 \? models\[0\]\.id : ''/.test(main),
  'removeModel 删掉的若是当前默认 ⇒ 自动切到列表第一条（或置空）');

console.log('\nD. i18n（四语种齐全）');
const NEED = ['settings.model.addModel', 'settings.model.modelIdPh', 'settings.model.modelNamePh',
  'settings.model.modelDescPh', 'settings.model.modelImage', 'settings.model.removeModel',
  'settings.model.removeConfirm', 'settings.model.emptyHintBuiltin', 'settings.model.emptyHint'];
ok(locales.length === 4, '四种语种都在（' + locales.join(' / ') + '）');
for (const k of NEED) {
  const lack = locales.filter((l) => !i18n[l] || i18n[l][k] === undefined);
  ok(lack.length === 0, '键 ' + k + ' 四语种齐全', lack.join(','));
}
const sizes = locales.map((l) => Object.keys(i18n[l]).length);
ok(new Set(sizes).size === 1, '四语种键数一致（' + sizes.join(' / ') + '）');
// settings.html 里用到的 settings.* 键都得存在（防拼错）
const used = [...html.matchAll(/['"](settings\.[A-Za-z0-9_.]+)['"]/g)].map((m) => m[1]);
const unknown = [...new Set(used)].filter((k) => i18n[locales[0]][k] === undefined);
ok(unknown.length === 0, 'settings.html 用到的 settings.* 键都在字典里', unknown.join(','));

console.log('');
if (fails) { console.log('===== 结果：' + fails + ' 项失败 ====='); process.exit(1); }
console.log('===== 结果：全部通过 =====');
