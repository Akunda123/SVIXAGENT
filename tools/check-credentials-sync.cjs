#!/usr/bin/env node
/**
 * 守卫：**干净用户机上，用户后填的 API Key 必须能进到内嵌 host 真正读的那个 DSH 家目录**
 * （2026-09-26 立 —— 当天一个用户机「一发消息就 回合结束（error）」的真因就是这个）
 *
 * 事故序列（干净机器上必然踩，当时的老实现）：
 *   ① 首次启动：隔离家目录 `~/.dsh-akdagent` 不存在 ⇒ 老代码抄一次 `~/.dsh` 的凭据 —— 可这时用户**还没填 key** ⇒ 抄了个空；
 *   ② 用户在客户端里填 key ⇒ 当时只写 `~/.dsh/.credentials.yaml`（用户那份），**不是**隔离家目录；
 *   ③ 之后每次启动：隔离家目录已存在 ⇒ 老代码**再也不抄** ⇒ 宿主永远没有 key
 *      ⇒ 每个请求在 HTTP 层被拒（实测签名 `{code:'AUTH',status:401}`，**1.4 秒**）
 *      ⇒ 用户侧正是「一发消息就 回合结束（error）」，新建对话也一样，而他在界面上"明明配好了 key"。
 *
 * ⚠️ 2026-09-28 实现方式变了（用户报「AKDAgent 夺舍了 DSH」⇒ 方案 ABCD）：**用户那份 `~/.dsh` 只读**，
 *   填 key 直接写**隔离家目录**那份（宿主读的就是它）—— 不再有"写用户那份 + 镜像"的回路。
 *   本守卫守的**不变式没变**：填了 key ⇒ 宿主读的那份里必须有它。
 *
 * 本守卫做两件事：
 *   A. **行为验证**（真跑一遍那个序列）：临时 home 无凭据 → ensureHome → 往"源"写凭据 → 再 ensureHome
 *      ⇒ 断言隔离家目录里出现了凭据（且 BOM 被剥掉）。
 *   B. **接线验证**：写入目标必须是 `OWNED_CREDENTIALS_PATH` / `OWNED_SETTINGS_PATH`（隔离家目录），
 *      且**没有**任何写 `~/.dsh`（SOURCE_*）的代码路径（详见 B 段）。
 *      （"绝不写用户那份"另有一条更全的守卫：`tools/check-dsh-separation.cjs`。）
 *
 * 用法：node tools/check-credentials-sync.cjs [--module <dsh-home.js 路径>] [--main <main.js 路径>]
 *   （`--module` / `--main` 主要用于反向验证：指向修复前那份，守卫应 FAIL）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const mi = args.indexOf('--module');
const DH = mi >= 0 && args[mi + 1] ? path.resolve(args[mi + 1]) : path.join(ROOT, 'electron', 'src', 'dsh-home.js');
const MAIN = path.join(ROOT, 'electron', 'src', 'main.js');
const DSH_ROOT = path.join(ROOT, 'dsh-runtime', 'dsh');

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);
const info = (m) => console.log('  [i]    ' + m);

console.log('== A. 行为验证：干净机器序列（module=' + path.relative(ROOT, DH).replace(/\\/g, '/') + '）==');
{
  let H = null;
  try { H = require(DH); } catch (e) { fail('require 失败：' + e.message); }
  if (H && typeof H.ensureHome === 'function') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-guard-sync-'));
    const src = path.join(tmp, 'dsh');
    fs.mkdirSync(src, { recursive: true });
    const home = path.join(tmp, 'dsh-akdagent');
    const quiet = () => {};
    H.ensureHome({ home, sourceHome: src, dshRoot: DSH_ROOT, log: quiet });
    if (!fs.existsSync(path.join(home, '.credentials.yaml'))) ok('① 干净机器首启：隔离家目录内确实还没有凭据（前置条件成立）');
    else info('① 首启就有凭据（源里本来就有？）—— 不影响后面的断言');

    // 用户后填 key（客户端只写 ~/.dsh；带 BOM 以验证剥离）
    fs.writeFileSync(path.join(src, '.credentials.yaml'), '\uFEFFversion: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-guard-test-123456\n', 'utf8');
    H.ensureHome({ home, sourceHome: src, dshRoot: DSH_ROOT, log: quiet });
    const dst = path.join(home, '.credentials.yaml');
    if (!fs.existsSync(dst)) {
      fail('② 下次启动**没有**把后填的凭据同步进隔离家目录 ⇒ 宿主会拿不到 key（AUTH/401，每轮失败）');
    } else {
      const t = fs.readFileSync(dst, 'utf8');
      ok('② 后填的凭据被同步进隔离家目录');
      if (t.includes('DEEPSEEK_API_KEY')) ok('③ 同步内容含 key 名'); else fail('③ 同步内容不含 key 名');
      if (!t.startsWith('\uFEFF')) ok('④ BOM 已剥掉（BOM 会让凭据层拒绝启动）'); else fail('④ 同步后的文件带 BOM');
    }
    // settings.yaml 同理（后填的模型配置也会漏）
    fs.writeFileSync(path.join(src, 'settings.yaml'), 'llm:\n  model: guard-model\n', 'utf8');
    H.ensureHome({ home, sourceHome: src, dshRoot: DSH_ROOT, log: quiet });
    if (fs.existsSync(path.join(home, 'settings.yaml'))) ok('⑤ settings.yaml 也被补齐'); else fail('⑤ settings.yaml 没被补齐');

    // ⑥ 存量用户真实状态：隔离家目录**已存在**且里面是一份空/旧的凭据 ⇒ 也必须被覆盖成源里那份
    //    （这是本次事故的存量形态：老用户升级前就已经踩过，升级后要能自愈）
    fs.writeFileSync(path.join(home, '.credentials.yaml'), 'version: 1\nrefs: {}\n', 'utf8');   // 空凭据（历史遗留）
    const before = fs.readFileSync(path.join(home, '.credentials.yaml'), 'utf8');
    H.ensureHome({ home, sourceHome: src, dshRoot: DSH_ROOT, log: quiet });
    const after = fs.readFileSync(path.join(home, '.credentials.yaml'), 'utf8');
    if (after.includes('sk-guard-test-123456')) ok('⑥ 存量遗留（空凭据）被源里那份覆盖 ⇒ 升级后自愈');
    else fail('⑥ 隔离家目录里已有的空凭据没有被覆盖（存量用户升级后仍会没 key）: before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after));

    // ⑦ 反向边界：源里**没有**凭据时，不能把隔离家目录里已有的那份擦掉
    fs.unlinkSync(path.join(src, '.credentials.yaml'));
    H.ensureHome({ home, sourceHome: src, dshRoot: DSH_ROOT, log: quiet });
    if (fs.existsSync(path.join(home, '.credentials.yaml'))) ok('⑦ 源里没凭据时不擦隔离家目录那份（不会误伤）');
    else fail('⑦ 源里没凭据却把隔离家目录那份删了/清空了');
  }
}

console.log('\n== B. 接线验证：写入目标必须是**我们自己的**那份（2026-09-28 起与用户 ~/.dsh 分离）==');
/*
 * 不变式（本守卫真正守的东西）：**用户填了 key ⇒ 宿主读的那份里必须有它。**
 * 实现方式在 2026-09-28 变了（用户报「AKDAgent 夺舍了 DSH」⇒ 方案 ABCD）：
 *   · 以前：写 `~/.dsh/.credentials.yaml`（用户那份）＋ `mirrorDshFileToIsolatedHome()` 镜像进隔离家目录；
 *   · 现在：**直接写隔离家目录** `<DSH_HOME>/.credentials.yaml`（宿主读的就是它），
 *           用户那份 `~/.dsh` 只读（只在缺文件时导入）。
 * ⇒ 这里改为断言"写入目标是 OWNED 前缀的常量、且没有对 SOURCE 前缀常量（= 用户那份）的写"。
 */
{
  const t = fs.existsSync(MAIN) ? fs.readFileSync(MAIN, 'utf8') : '';
  if (!t) fail('读不到 electron/src/main.js');
  else {
    if (/const OWNED_CREDENTIALS_PATH = path\.join\(AKDAGENT_DSH_HOME, '\.credentials\.yaml'\)/.test(t)) {
      ok('写入目标 = 隔离家目录的 .credentials.yaml（OWNED_CREDENTIALS_PATH）');
    } else fail('没有 OWNED_CREDENTIALS_PATH ⇒ 不知道 key 写到哪去了');
    if (/if \(!writeFileAtomic\(OWNED_CREDENTIALS_PATH/.test(t)) ok('writeCredentials 写的是 OWNED 那份');
    else fail('writeCredentials 没写 OWNED 那份');
    if (/writeFileAtomic\(OWNED_SETTINGS_PATH/.test(t)) ok('writeSettings 写的是 OWNED 那份');
    else fail('writeSettings 没写 OWNED 那份');
    if (!/mirrorDshFileToIsolatedHome\(/.test(t)) ok('已删除 mirrorDshFileToIsolatedHome（不再有"写用户那份再镜像"的回路）');
    else fail('mirrorDshFileToIsolatedHome 还在 ⇒ 说明仍在写用户那份');
    if (/const CREDENTIALS_PATH = path\.join\(HOME_DIR, '\.dsh'/.test(t)) {
      fail('`CREDENTIALS_PATH` 仍指向 ~/.dsh（写侧旧名残留，容易又被写进去）');
    } else ok('没有指向 ~/.dsh 的写侧常量（源只走 SOURCE_* 只读名）');
    if (/SOURCE_CREDENTIALS_PATH/.test(t) && !/writeFileAtomic\(SOURCE_CREDENTIALS_PATH/.test(t)) {
      ok('SOURCE_CREDENTIALS_PATH 只用于读（没有对它 writeFileAtomic）');
    } else fail('源凭据路径仍有写操作 ⇒ 又动用户的文件了');
  }
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格`); process.exit(1); }
console.log('✓ 凭据同步守卫通过');
