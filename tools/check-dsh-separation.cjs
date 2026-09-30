#!/usr/bin/env node
/**
 * 守卫：**AKDAgent 与用户自己的 DSH 彻底分离**（2026-09-28 立 · 用户报「AKDAgent 夺舍了 DSH」· 方案 ABCD）
 *
 * 背景（用户反馈 + 代码审计）：数据根（`~/.dsh-akdagent`）本来就是隔离的，但客户端仍会**读写用户自己那份
 * `~/.dsh`**，四条：
 *   ① 填 key ⇒ 写 `~/.dsh/.credentials.yaml`（并且没有就 `mkdir ~/.dsh`）；
 *   ② 启动时 `healCredentialsFile(源 ~/.dsh, …)` ⇒ **就地规范化改写**用户的凭据文件（带 .bak）；
 *   ③ `~/.dsh/settings.yaml` 整份读-改-写（语言 `locale.preference` 等）；
 *   ④ 拉起内嵌宿主时 `{...process.env}` 原样透传 ⇒ 用户环境里的 `DSH_*` 被宿主吃进去。
 * 方案：**A** 凭据只写自有那份、源只在"缺文件/缺 ref"时只读导入 · **B** 源不写（不自愈/.bak/不建目录）·
 *      **C** 设置写自有那份、源只读 · **D** 拉起宿主前清掉继承来的 `DSH_*`（只留我们设的两个）。
 *
 * 判据：
 *   A 静态：`main.js` 里没有对 `SOURCE_*` / `DSH_SOURCE_HOME` 的写或建目录；写目标是 `OWNED_*`；
 *           已无 `mirrorDshFileToIsolatedHome`；`dsh-home.js` 不再对源做 heal（仍对隔离家目录做）。
 *   D 静态：拉宿主前有"清掉继承来的 DSH_*"的循环；`env.DSH_*` 赋值只允许 `DSH_HOME` / `DSH_BUNDLED_SKILL_DIR`。
 *   B 行为（关键）：造一个假的"用户 ~/.dsh"（**故意放老扁平格式凭据 + 一条非法 ref + settings**），
 *           真跑 `ensureHome()` ⇒ 断言**源目录逐文件逐字节未变**（没有 .bak / 没有隔离件 / 没有新文件）；
 *           同时断言隔离那份被规范化、设置被首次导入；再改源（settings / 同 ref 换值）跑第二次 ⇒
 *           断言**我们这份不跟着变**（各管各的；要换 key 请在 AKDAgent 里也改一次）。
 *
 * 用法：node tools/check-dsh-separation.cjs [--main <main.js>] [--home <dsh-home.js>]
 *   （两个参数用于**反向验证**：指向修复前那份，守卫应 FAIL）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const pick = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : path.join(ROOT, dflt);
};
const MAIN = pick('--main', 'electron/src/main.js');
const DH = pick('--home', 'electron/src/dsh-home.js');
const DSH_ROOT = path.join(ROOT, 'dsh-runtime', 'dsh');

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

const main = fs.existsSync(MAIN) ? fs.readFileSync(MAIN, 'utf8') : '';
const dh = fs.existsSync(DH) ? fs.readFileSync(DH, 'utf8') : '';
if (!main) { console.log('  [FAIL] 读不到 ' + MAIN); process.exit(1); }
if (!dh) { console.log('  [FAIL] 读不到 ' + DH); process.exit(1); }

/* ⚠️ 判据必须跑在**去注释**后的代码上：第一版就被自己的说明骗过 ——
 *   我在 dsh-home.js 的块注释里写了"以前这里会 healCredentialsFile(sourceHome, …)"，
 *   于是"仍在 heal 源"的负向断言直接命中注释 ⇒ 假红。（正向断言用原文，那段纪律就写在注释里。） */
const stripJsComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const mainCode = stripJsComments(main);
const dhCode = stripJsComments(dh);

// ============================================================================
console.log('== A+B 静态：源 `~/.dsh` 只读，写入目标是我们自己那份 ==');
{
  if (/const OWNED_CREDENTIALS_PATH = path\.join\(AKDAGENT_DSH_HOME, '\.credentials\.yaml'\)/.test(main)) {
    ok('凭据写目标 = OWNED_CREDENTIALS_PATH（隔离家目录）');
  } else fail('没有 OWNED_CREDENTIALS_PATH ⇒ 看不清 key 写哪儿');
  if (/const OWNED_SETTINGS_PATH = path\.join\(AKDAGENT_DSH_HOME, 'settings\.yaml'\)/.test(main)) {
    ok('设置写目标 = OWNED_SETTINGS_PATH（隔离家目录）');
  } else fail('没有 OWNED_SETTINGS_PATH');
  if (/const SOURCE_SETTINGS_PATH = path\.join\(HOME_DIR, '\.dsh', 'settings\.yaml'\)/.test(main) &&
      /const SOURCE_CREDENTIALS_PATH = path\.join\(DSH_SOURCE_HOME, '\.credentials\.yaml'\)/.test(main)) {
    ok('用户那份仍是显式的 SOURCE_*（只读语义，一眼可辨）');
  } else fail('用户那份没有显式 SOURCE_* 常量（容易被误当写目标）');

  // 对源**任何**写入 / 建目录都不许有
  const srcWrites = [
    [/writeFileAtomic\(\s*SOURCE_/, 'writeFileAtomic(SOURCE_*)'],
    [/writeFileAtomic\(SOURCE_SETTINGS_PATH/, 'writeFileAtomic(SOURCE_SETTINGS_PATH)'],
    [/writeFileAtomic\(SOURCE_CREDENTIALS_PATH/, 'writeFileAtomic(SOURCE_CREDENTIALS_PATH)'],
    [/mkdirSync\([^)]*DSH_SOURCE_HOME/, 'mkdirSync(…DSH_SOURCE_HOME)'],
    [/mkdirSync\(path\.dirname\(SOURCE_/, 'mkdirSync(path.dirname(SOURCE_*))'],
    [/writeFileSync\(\s*SOURCE_/, 'writeFileSync(SOURCE_*)'],
  ];
  const hitSrc = srcWrites.filter(([re]) => re.test(mainCode)).map(([, n]) => n);
  if (!hitSrc.length) ok('main.js 里对 `~/.dsh`（SOURCE_*）**没有任何写/建目录**');
  else fail('main.js 仍在写用户那份：' + hitSrc.join(', '));

  /* ② 更狠的一条：**扫所有写操作的目标表达式** —— 只要目标里出现 `.dsh` 系的路径
   *    （旧名 `CREDENTIALS_PATH` / `SETTINGS_PATH`、或 `SOURCE_` 前缀的常量、或 `DSH_SOURCE_HOME`），
   *    就是在写用户那份。第一版只查 `SOURCE_` 字样 ⇒ 修复前那份（用旧名 `CREDENTIALS_PATH`）躲过了这条。 */
  const writeTargets = [...mainCode.matchAll(/(?:writeFileAtomic|writeFileSync)\(\s*([^,)\n]+)/g)].map((m) => m[1].trim());
  // ⚠️ 用 lookbehind：`OWNED_CREDENTIALS_PATH` 里含 `CREDENTIALS_PATH` 子串，不加边界会把**我们自己的**写点误判成用户那份
  const badTargets = writeTargets.filter((a) => /SOURCE_|(?<![A-Z_])CREDENTIALS_PATH|(?<![A-Z_])SETTINGS_PATH|DSH_SOURCE_HOME|'\.dsh'|"\.dsh"/.test(a));
  if (!badTargets.length) ok('所有写操作的目标都不是用户那份（扫了 ' + writeTargets.length + ' 个写点）');
  else fail('有写操作指向用户那份：' + badTargets.join(' | '));

  if (!/function mirrorDshFileToIsolatedHome\(/.test(mainCode) && !/mirrorDshFileToIsolatedHome\(/.test(mainCode)) {
    ok('已删除 mirrorDshFileToIsolatedHome（不再有"写用户那份 + 镜像"的回路）');
  } else fail('mirrorDshFileToIsolatedHome 还在 ⇒ 说明仍在写用户那份');
  if (!/const CREDENTIALS_PATH = path\.join\(HOME_DIR, '\.dsh'/.test(mainCode)) {
    ok('没有指向 ~/.dsh 的旧写侧常量 `CREDENTIALS_PATH`');
  } else fail('`CREDENTIALS_PATH` 仍指向 ~/.dsh（旧名残留，容易又被写进去）');
  if (!/const SETTINGS_PATH = path\.join\(HOME_DIR, '\.dsh'/.test(mainCode)) {
    ok('没有指向 ~/.dsh 的旧写侧常量 `SETTINGS_PATH`');
  } else fail('`SETTINGS_PATH` 仍指向 ~/.dsh');

  // dsh-home：源不 heal、隔离家目录照旧 heal
  if (!/healCredentialsFile\(\s*sourceHome/.test(dhCode)) ok('dsh-home.js 不再对**源**做 heal（不再就地改写用户文件）');
  else fail('dsh-home.js 仍在 heal 源 ~/.dsh ⇒ 会改写用户文件（B 未做）');
  if (/healCredentialsFile\(\s*home/.test(dhCode)) ok('仍对**隔离家目录**那份做 heal（我们自己的文件，可以治）');
  else fail('隔离家目录那份不再自愈 ⇒ 宿主可能起不来');
  if (/只读导入|一律只读|绝不写源/.test(dh)) ok('dsh-home.js 里写明"源只读"的纪律（注释，用原文查）');
  else fail('dsh-home.js 没有写明"源只读"⇒ 后来人容易再写回去');
}

console.log('\n== D 静态：拉起宿主前清掉继承来的 DSH_* ==');
{
  if (/for \(const k of Object\.keys\(env\)\)\s*\{?\s*if \(\/\^DSH_\/i\.test\(k\)\)/.test(main)) {
    ok('有"清掉继承来的 DSH_*"的循环');
  } else fail('没有清理继承来的 DSH_*（用户环境里的 DSH_* 会被内嵌宿主吃进去）');
  const sets = [...main.matchAll(/env\.(DSH_[A-Z_]+)\s*=/g)].map((m) => m[1]);
  const allowed = new Set(['DSH_HOME', 'DSH_BUNDLED_SKILL_DIR']);
  const extra = sets.filter((k) => !allowed.has(k));
  if (!extra.length) ok('`env.DSH_*` 只设了 ' + [...new Set(sets)].join(' / ') + '（其余一律不透传）');
  else fail('还设了额外 DSH_*：' + extra.join(', '));
}

// ============================================================================
console.log('\n== B 行为：真跑一遍 —— 源目录必须**逐字节未变** ==');
{
  let H = null;
  try { H = require(DH); } catch (e) { fail('require ' + path.basename(DH) + ' 失败：' + e.message); }
  if (H && typeof H.ensureHome === 'function') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-guard-sep-'));
    const srcHome = path.join(tmp, '.dsh');            // 伪"用户自己的 DSH"
    const home = path.join(tmp, '.dsh-akdagent');      // 伪"我们自己的"（隔离家目录）
    fs.mkdirSync(srcHome, { recursive: true });
    // 故意放"以前会被我们治"的东西：老扁平格式 + 一条非法 ref 名 + settings
    fs.writeFileSync(path.join(srcHome, '.credentials.yaml'),
      'DEEPSEEK_API_KEY: sk-flat-legacy-123456\nBAD-NAME: x\n', 'utf8');
    fs.writeFileSync(path.join(srcHome, 'settings.yaml'), 'locale:\n  preference: ja\n', 'utf8');
    const stamp = (dir) => {
      const out = {};
      for (const f of fs.readdirSync(dir).sort()) {
        const b = fs.readFileSync(path.join(dir, f));
        out[f] = crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
      }
      return out;
    };
    const before = stamp(srcHome);
    const quiet = () => {};
    H.ensureHome({ home, sourceHome: srcHome, dshRoot: DSH_ROOT, log: quiet });
    const after = stamp(srcHome);
    if (JSON.stringify(before) === JSON.stringify(after)) {
      ok('① 源 ~/.dsh **逐文件逐字节未变**（没有 .bak / 没有 rejected-* / 没有多出文件）');
    } else {
      fail('① 源 ~/.dsh 被动了！before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after));
    }
    const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
    const dstC = read(path.join(home, '.credentials.yaml'));
    if (dstC && /version:\s*1/.test(dstC) && /DEEPSEEK_API_KEY/.test(dstC)) ok('② 隔离那份已规范化成宿主可读的格式（导入生效）');
    else fail('② 隔离那份没有正确导入/规范化：' + JSON.stringify(dstC));
    if (dstC && !/BAD-NAME/.test(dstC)) ok('③ 非法 ref 名没有进隔离那份（老扁平键被规范进 refs / 非法的丢掉）');
    else fail('③ 非法 ref 名进了隔离那份');
    if (/preference:\s*ja/.test(read(path.join(home, 'settings.yaml')) || '')) ok('④ 设置首次从源只读导入');
    else fail('④ 设置没有导入 ⇒ 用户原有的语言偏好丢了');

    // 改源 ⇒ 我们这份**不跟着变**（各管各的）
    fs.writeFileSync(path.join(srcHome, 'settings.yaml'), 'locale:\n  preference: en\n', 'utf8');
    fs.writeFileSync(path.join(srcHome, '.credentials.yaml'),
      'DEEPSEEK_API_KEY: sk-flat-legacy-CHANGED\nBAD-NAME: x\n', 'utf8');
    H.ensureHome({ home, sourceHome: srcHome, dshRoot: DSH_ROOT, log: quiet });
    if (/preference:\s*ja/.test(read(path.join(home, 'settings.yaml')) || '')) ok('⑤ 源改了设置 ⇒ 我们这份**不被覆盖**（各管各的）');
    else fail('⑤ 源的设置把我们这份覆盖了（分离没做到位）');
    const dstC2 = read(path.join(home, '.credentials.yaml')) || '';
    if (/sk-flat-legacy-123456/.test(dstC2) && !/CHANGED/.test(dstC2)) {
      ok('⑥ 源里同 ref 改了值 ⇒ 我们这份**不覆盖**（"只增不改"；要换 key 需在 AKDAgent 里也改一次）');
    } else fail('⑥ 源把我们的 key 覆盖了（或没有保留）：' + JSON.stringify(dstC2.slice(0, 80)));
    if (JSON.stringify(stamp(srcHome)) !== JSON.stringify(before)) {
      // 第二步我们主动改了源（这是测试自己改的），这里只确认"没有额外文件"
      const extra = Object.keys(stamp(srcHome)).filter((f) => !(f in before));
      if (!extra.length) ok('⑦ 第二次运行同样没有往源目录里加任何文件');
      else fail('⑦ 源目录多出文件：' + extra.join(', '));
    }

    /* ⑧ 2026-09-28 修的真 bug：**refs 必须取并集，不能"整份取源"**。
     * 形态：客户端往**我们这份**写了自己的 key（J），源里另有一个我们没有的 key（K）。
     * 旧实现（mergeCredentialDocs：refs 整份取源）会把 J 弄丢 —— 用户自己填的 key 静默消失。
     * 这里造出这个状态真跑一遍：J 与 K 必须**都在**。 */
    const dstPath = path.join(home, '.credentials.yaml');
    fs.writeFileSync(dstPath, 'version: 1\nrefs:\n  CLIENT_OWN_KEY: sk-own-abcdef\n', 'utf8');
    fs.writeFileSync(path.join(srcHome, '.credentials.yaml'),
      'DEEPSEEK_API_KEY: sk-flat-legacy-123456\nSOURCE_NEW_KEY: sk-src-new-999\nBAD-NAME: x\n', 'utf8');
    const before3 = stamp(srcHome);
    H.ensureHome({ home, sourceHome: srcHome, dshRoot: DSH_ROOT, log: quiet });
    const dstC3 = read(dstPath) || '';
    if (/CLIENT_OWN_KEY/.test(dstC3) && /SOURCE_NEW_KEY/.test(dstC3) && /DEEPSEEK_API_KEY/.test(dstC3)) {
      ok('⑧ 导入是**并集**：我们自己的 ref 与源里新 ref 都在（不会"整份取源"把我们那份顶掉）');
    } else {
      fail('⑧ refs 合并丢了东西（我们自己的 key 被源的整份 refs 顶掉了）：' + JSON.stringify(dstC3.slice(0, 160)));
    }
    if (JSON.stringify(stamp(srcHome)) === JSON.stringify(before3)) ok('⑨ 第三次运行源目录仍逐字节未变');
    else fail('⑨ 第三次运行把源动了：' + JSON.stringify(stamp(srcHome)));

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响判据 */ }
  }
}

// ============================================================================
console.log('\n== E 跨组件：MCP server 读 settings 也必须先读我们那份 ==');
{
  const sc = fs.existsSync(path.join(ROOT, 'server', 'src', 'style-combine.ts'))
    ? fs.readFileSync(path.join(ROOT, 'server', 'src', 'style-combine.ts'), 'utf8') : '';
  if (!sc) fail('读不到 server/src/style-combine.ts');
  else {
    if (/process\.env\.DSH_HOME/.test(sc)) ok('style-combine 先读 `$DSH_HOME/settings.yaml`（= 我们那份）');
    else fail('style-combine 没读 DSH_HOME ⇒ 用户在 AKDAgent 里配的 sv.scriptsDirs 会读不到（设置写到我们那份去了）');
    const iOwned = sc.indexOf('.dsh-akdagent');
    const iSource = sc.search(/["']\.dsh["']/);          // 单/双引号都认（我第一版只查单引号 ⇒ 假红）
    if (iOwned >= 0 && (iSource < 0 || iOwned < iSource)) ok('回退顺序：我们那份在前、用户那份在后（只读）');
    else fail('回退顺序不对（用户那份排在我们那份前面）');
  }
}

console.log('');
if (bad) { console.log(`[FAIL] ${bad} 项不通过 —— AKDAgent 仍在动用户自己的 DSH`); process.exit(1); }
console.log('✅ 与用户自己的 DSH 已分离：源只读（逐字节未变）· 写入只落隔离家目录 · DSH_* 不再透传');
