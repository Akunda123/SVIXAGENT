#!/usr/bin/env node
/**
 * 守卫：**mac 出包 workflow 不许引用"不在版本库里"的路径**
 * （2026-09-26 立 —— 当天首次在 GitHub Actions 出 mac 包，第一跑就栽在这）
 *
 * 起因（真事故）：
 *   `.github/workflows/mac-build.yml` 第 5 步"用仓库里最新的脚本覆盖整包内的同名件"里，
 *   原本对所有源码目录都做 `rsync`，其中包含 **`dist/knowledge/`** —— 那是**脱敏生成的产物、
 *   不进版本库**（`.gitignore` 挡着，见 electron-builder.yml 里"打包前必跑脱敏"那段）。
 *   ⇒ runner 上 `rsync: link_stat ".../dist/knowledge/." failed: No such file or directory`、
 *      `rsync error: ... (code 23)`，整个 job 失败、出包步骤被跳过。
 *
 * 所以本守卫盯三件事：
 *   ① workflow 里 `rsync` / `cp` 的**仓库侧源路径**必须真实存在**且被 git 跟踪**；
 *   ② `for x in a b c` 这种循环列表里的路径同样要满足 ①（现在正是这种写法）；
 *   ③ 显式禁止从生成物根目录同步（`dist/…`、`electron/release/…`）—— 它们是打包/脱敏的产物。
 *   另加一条纪律检查：**不许再用已退役的 macOS runner**（`macos-13` = Intel，2025 年底退役；
 *   现在 GitHub 的 macOS 镜像只有 arm64 ⇒ 用了会白跑一场或根本排不上）。
 *
 * 用法：node tools/check-ci-workflow.cjs
 * 退出码：0 = 全过；1 = 有 FAIL（打印每条原因）
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);
const info = (m) => console.log('  [i]    ' + m);

// 生成物根目录：不进版本库，绝不能被同步/拷贝
const GENERATED_ROOTS = ['dist/', 'electron/release/'];

// git 是否可用（不是仓库/没装 git 时不做跟踪校验，只做存在性校验）
let gitOk = true;
try { execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, stdio: 'ignore' }); }
catch (_) { gitOk = false; }

function tracked(rel) {
  try { execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: ROOT, stdio: 'ignore' }); return true; }
  catch (_) { return false; }
}

// 从一行命令里抠出"仓库侧"的路径 token（跳过选项与含 $ 的变量）
function pathTokens(line) {
  const out = [];
  for (let tok of line.trim().split(/\s+/)) {
    tok = tok.replace(/^["']|["']$/g, '');
    if (!tok) continue;
    if (tok.startsWith('-')) continue;          // 选项
    if (tok.includes('$')) continue;            // 变量（含 $T / $d 之类）
    if (/^(rsync|cp|sudo|echo|ls|test|if|then|fi|do|done)$/.test(tok)) continue;
    if (/[;|&<>]/.test(tok)) continue;
    out.push(tok.replace(/\/+$/, ''));
  }
  return out;
}

function checkPath(where, rel) {
  if (!rel) return;
  const norm = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const g of GENERATED_ROOTS) {
    if (norm === g.slice(0, -1) || norm.startsWith(g)) {
      return fail(`${where} 引用了生成物目录 \`${norm}\` —— 它不在版本库里（\`${g}\` 是打包/脱敏产物）`);
    }
  }
  const abs = path.join(ROOT, norm);
  if (!fs.existsSync(abs)) {
    info(`${where} 路径 \`${norm}\` 在当前工作副本里不存在（CI 上若也没有就是同一个坑）`);
  }
  if (gitOk && !tracked(norm)) {
    fail(`${where} 路径 \`${norm}\` **没有被 git 跟踪** —— runner 上 checkout 不到它（这就是 2026-09-26 那次 rsync exit 23 的原因）`);
  } else {
    ok(`${where} 路径 \`${norm}\` 已跟踪`);
  }
}

console.log('== ①/② workflow 里 rsync / cp / for-in 的仓库侧路径 ==');
if (!fs.existsSync(WF_DIR)) {
  fail(`找不到 ${path.relative(ROOT, WF_DIR)} —— CI 出包 workflow 不在？`);
} else {
  const files = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
  if (!files.length) fail(`${path.relative(ROOT, WF_DIR)} 里没有 workflow 文件`);
  for (const f of files) {
    const text = fs.readFileSync(path.join(WF_DIR, f), 'utf8');
    console.log(`  — ${f} —`);
    text.split(/\r?\n/).forEach((line, i) => {
      const where = `${f}:${i + 1}`;
      if (/^\s*(rsync|cp)\b/.test(line)) {
        for (const t of pathTokens(line)) checkPath(where, t);
      }
      const m = line.match(/^\s*for\s+\w+\s+in\s+([^;]+?)(?:;|\s*$|;?\s*do)/);
      if (m) {
        for (const t of pathTokens(m[1])) checkPath(where + ' (for-in)', t);
      }
    });
  }
}

console.log('\n== ③ 不许用已退役的 macOS runner ==');
{
  const retired = /runs-on:\s*(macos-1[012]|macos-13)\b/;
  let hit = 0;
  if (fs.existsSync(WF_DIR)) {
    for (const f of fs.readdirSync(WF_DIR).filter((x) => /\.ya?ml$/.test(x))) {
      const text = fs.readFileSync(path.join(WF_DIR, f), 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        if (retired.test(line)) {
          hit++;
          fail(`${f}:${i + 1} 用了退役的 macOS runner（${line.trim()}）—— macos-13 是 Intel，2025 年底已退役；现存 macOS 镜像都是 arm64`);
        }
      });
    }
  }
  if (!hit) ok('没有使用退役的 macOS runner（macos-14 / macos-15 = arm64）');
}

console.log('\n== ④ mac 出包 workflow 的输入契约（仅提示，不判失败）==');
{
  const mac = path.join(WF_DIR, 'mac-build.yml');
  if (fs.existsSync(mac)) {
    const t = fs.readFileSync(mac, 'utf8');
    if (/releases\/download\/[^/\s]+\/[^/\s]+\.zip/.test(t)) {
      const u = t.match(/releases\/download\/([^/\s]+\/[^/\s]+\.zip)/)[1];
      info(`整包输入取自 release 资产：${u}`);
    } else info('没看到 release 资产直链（整包输入可能改成了别的方式）');
    if (/mac-build-all\.sh/.test(t)) ok('会从 checkout 覆盖 mac-build.sh（脚本以仓库为准）');
    else info('没看到覆盖 mac-build.sh 的那一步 —— 若改了流程，记得同步 electron/scripts/BUILD-MAC.md §3.5');
  } else {
    info('没有 mac-build.yml（本条跳过）');
  }
}

console.log('');
if (bad) {
  console.log(`✗ 有 ${bad} 项不合格`);
  process.exit(1);
}
console.log('✓ CI workflow 守卫通过');
