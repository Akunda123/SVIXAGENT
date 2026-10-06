/**
 * orb 附件（拖拽 / 粘贴路径）——接线 + 消息契约
 *
 * 验三件事：
 *   ① 三处接线齐全：orb.html 的拖拽/粘贴与附件条、preload 的 `pathFor`(webUtils)/`fileStat`、main 的 `akdagent-file-stat`
 *   ② **Electron 32+ 的坑**：路径必须走 `webUtils.getPathForFile`（`File.path` 已移除）—— 断言没有回退到 `file.path`
 *   ③ **消息契约**：拼出去的那块文本长什么样（用真 i18n 字典渲染，四语种键齐）
 *
 * ⚠️ 不验的（如实留白）：真实 OS 拖拽（需要人工拖，自动化不了）、面板里的视觉效果。
 *    真机验收清单见 docs/orb附件-拖拽与粘贴.md。
 *
 * 用法：node tools/test-orb-attach.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const orb = read('electron/src/orb.html');
const preload = read('electron/src/orb-preload.js');
const main = read('electron/src/main.js');
const dict = JSON.parse(read('electron/src/i18n/orb.json'));

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [ok]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 240) : '')); }
};

console.log('== ① orb.html：附件条 + 拖拽 + 粘贴 ==');
ok('有 #chat-files 附件条元素', /id="chat-files"/.test(orb));
ok('dragover 里拦了默认行为（不拦会直接打开文件）', /addEventListener\('dragover'[\s\S]{0,400}?preventDefault\(\)/.test(orb));
ok('dragover 里把窗口设为可交互（穿透模式下收不到 drop）', /addEventListener\('dragover'[\s\S]{0,400}?setIgnore\(false\)/.test(orb));
ok("drop 用 dataTransfer.files 取文件", /addEventListener\('drop'[\s\S]{0,500}?dt\.files/.test(orb));
ok('路径经 preload 的 pathFor 拿（不是 File.path）', /window\.akdagent\.pathFor\(f\)/.test(orb));
ok('粘贴路径：只在查得到时当附件', /addEventListener\('paste'[\s\S]{0,600}?fileStat\([\s\S]{0,200}?addPaths/.test(orb));
ok('去掉了 Explorer「复制为路径」的外层引号', /replace\(\/\^"\(\[\\s\\S\]\*\)"\$\/, '\$1'\)/.test(orb));
ok('有附件条上限（ATTACH_MAX）', /const ATTACH_MAX = \d+/.test(orb));
ok('附件块走 i18n 模板 orb.files.sendBlock', /I\.t\('orb\.files\.sendBlock', lines\)/.test(orb));
ok('附件块随消息一起发（payload = t + 块）', /const payload = attach\.length \? t \+ '\\n\\n' \+ attachBlock\(\) : t/.test(orb));
ok('发送成功才清附件', /if \(r\.ok\) \{[\s\S]{0,120}?clearAttach\(\)/.test(orb));
ok('拖了文件没打字 ⇒ 不静默返回（聚焦 + 闪附件条）', /if \(!t && attach\.length\) \{ chatText\.focus\(\); flashAttach\(\); return \}/.test(orb));
ok('**原守卫没动**（只防重复提交，不因轮次在跑而拒收）', /if\s*\(!t\s*\|\|\s*sending\)\s*return/.test(orb));
ok('切语种时重排附件条（I.onChange 里 renderAttach）', /I\.onChange\(\(\) => \{ renderAttach\(\);/.test(orb));
ok('不读文件内容：没出现 readFile / 剪贴板读文件之类', !/akdagent[\s\S]{0,80}readFile/.test(orb));

console.log('\n== ② preload / main：路径与存在性 ==');
ok('preload 引了 webUtils', /require\('electron'\)/.test(preload) && /\bwebUtils\b/.test(preload));
ok('pathFor 用 webUtils.getPathForFile', /pathFor:\s*\(file\)[\s\S]{0,120}?webUtils\.getPathForFile\(file\)/.test(preload));
ok('没有依赖已移除的 File.path', !/\bfile\.path\b/.test(preload) && !/\bfile\.path\b/.test(orb));
ok('preload 暴露 fileStat → akdagent-file-stat', /fileStat:\s*\(p\)\s*=>\s*ipcRenderer\.invoke\('akdagent-file-stat'/.test(preload));
ok('main 注册了 akdagent-file-stat', /ipcMain\.handle\('akdagent-file-stat'/.test(main));
ok('main 只用 statSync（不读内容）', /akdagent-file-stat'[\s\S]{0,400}?fs\.statSync\(full\)/.test(main) && !/akdagent-file-stat'[\s\S]{0,400}?readFileSync/.test(main));
// 契约随 2026-10-06 音频那条路扩了：多回 `ext` + `audioConvertible`（"要不要转音频"的判据只在主进程，见 check-audio-decode-wiring）
ok('main 回了 path/base/isDir/size/ext/audioConvertible', /return \{[\s\S]{0,200}?ok: true, path: full, base: path\.basename\(full\), isDir: st\.isDirectory\(\), size: st\.size,[\s\S]{0,120}?ext,[\s\S]{0,80}?audioConvertible:/.test(main));
ok('附件入口：非 MP3/WAV 音频走 audioDecode（`st.audioConvertible`）', /st\.audioConvertible && window\.akdagent\.audioDecode/.test(orb));
ok('音频转换失败保留原文件（不静默丢附件）', /row\.note = I\.t\('orb\.files\.audioFailed'/.test(orb) && /if \(r && r\.ok && r\.file\) \{[\s\S]{0,500}?row\.path = r\.file/.test(orb));

console.log('\n== ③ 消息契约（真字典渲染，四语种） ==');
const NEED = ['orb.files.dropHint', 'orb.files.dir', 'orb.files.removeTitle', 'orb.files.sendBlock'];
const LOCALES = Object.keys(dict);
ok('字典有 4 语种', LOCALES.length === 4, LOCALES);
for (const L of LOCALES) {
  const miss = NEED.filter((k) => !(k in dict[L]));
  ok(`${L}：4 个新键齐`, miss.length === 0, miss);
  ok(`${L}：sendBlock 含 {0} 占位`, dict[L]['orb.files.sendBlock'].includes('{0}'), dict[L]['orb.files.sendBlock']);
}
// 用 preload 里同一套 fill（{0} 替换）渲染一遍，看真发出去的文本
const fill = (s, args) => String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : args[i]));
const paths = ['C:\\scores\\a.musicxml', 'D:\\谱\\扫描件.pdf'];
const lines = paths.map((p, i) => i + 1 + '. ' + p).join('\n');
const body = fill(dict['zh-Hans']['orb.files.sendBlock'], [lines]);
ok('渲染出的附件块：前缀 + 编号路径，一行一个', /^附件（绝对路径）：\n1\. C:\\scores\\a\.musicxml\n2\. D:\\谱\\扫描件\.pdf$/.test(body), body);
ok('多文件编号是从 1 开始的连续行', body.split('\n').length === 3, body.split('\n'));
const en = fill(dict.en['orb.files.sendBlock'], [lines]);
ok('英文块同样带编号路径（不本地化路径本身）', en.includes('1. C:\\scores\\a.musicxml') && en.includes('2. D:\\谱\\扫描件.pdf'), en);

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
