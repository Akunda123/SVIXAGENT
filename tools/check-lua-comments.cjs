#!/usr/bin/env node
/**
 * Lua 文件健康检查（2026-09-15 新增）—— 防"同一坑踩第二次"
 *
 * 背景：我在 Lua 文件里**两次**写了 JS 风格的 `/** ... *\/` 注释（Lua 只认 `--`），
 *   结果 `lua-vm` 报 `unexpected symbol near '/'`，而**面板脚本的报错会弹宿主对话框并中断脚本**
 *   ⇒ 部署出去就是"用户点开面板就报错"。所以必须进 CI/提交前检查。
 *
 * 检查两项：
 *   ① 扫「JS 式注释」：`/*` 出现在**行首或空白之后**（避免误报 `tests/*.lua` 这种路径通配）
 *   ② 逐个文件做 Lua **加载**（编译）检查：优先用 luac；没有就用仓里的 tools/lua-vm.py
 *
 * 用法：node tools/check-lua-comments.cjs [--fix-hint]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = [path.join(ROOT, 'sv', 'lua'), path.join(ROOT, 'sv', 'panel')];

function listLua(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listLua(full));
    else if (e.isFile() && e.name.endsWith('.lua')) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap(listLua);
console.log('== Lua 文件检查（' + files.length + ' 个）==');

let bad = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const hits = [];
  lines.forEach((l, i) => {
    // `/*` 必须出现在行首或空白之后才算 JS 注释（`tests/*.lua` 前一个字符是字母 ⇒ 不算）；
    // 另外**引号内的 `/*` 不算**（测试里会写 `"没有 JS 式 /* */ 注释"` 这种字符串，曾误报）。
    const m = /(^|\s)\/\*/.exec(l);
    if (!m) return;
    const before = l.slice(0, m.index + m[1].length);
    const quotes = (before.match(/"/g) || []).length;
    if (quotes % 2 === 1) return;         // 落在字符串里
    hits.push((i + 1) + ': ' + l.trim().slice(0, 70));
  });
  if (hits.length) {
    bad += hits.length;
    console.log('  ❌ ' + rel + ' —— ' + hits.length + ' 处 JS 式注释（Lua 只认 --）');
    hits.forEach((h) => console.log('      ' + h));
  }
}
if (!bad) console.log('  ✅ 没有 JS 式注释');

// Lua 编译检查：用仓里的离线 VM（luac 不一定有）
const vm = path.join(ROOT, 'tools', 'lua-vm.py');
if (fs.existsSync(vm)) {
  console.log('');
  console.log('== Lua 编译检查（tools/lua-vm.py 加载即编译）==');
  for (const f of files) {
    try {
      const out = execFileSync('python', [vm, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (/load error/i.test(out)) { console.log('  ❌ ' + path.relative(ROOT, f) + ' → ' + out.trim().split('\n').pop()); bad++; }
    } catch (e) {
      const s = String(e.stdout || '') + String(e.stderr || '');
      if (/load error/i.test(s)) { console.log('  ❌ ' + path.relative(ROOT, f) + ' → ' + (s.match(/load error.*/) || [''])[0]); bad++; }
      // 其它异常（比如脚本内部要求 SV 环境）不算语法问题
    }
  }
  if (!bad) console.log('  ✅ 全部可编译');
}

console.log('');
console.log(bad ? '结论：❌ 有 ' + bad + ' 处问题（Lua 里别写 /* */；面板脚本报错会弹框中断）' : '结论：✅ 通过');
process.exit(bad ? 1 : 0);
