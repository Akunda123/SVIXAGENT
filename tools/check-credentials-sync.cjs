#!/usr/bin/env node
/**
 * 守卫：**干净用户机上，用户后填的 API Key 必须能进到内嵌 host 真正读的那个 DSH 家目录**
 * （2026-09-26 立 —— 当天一个用户机「一发消息就 回合结束（error）」的真因就是这个）
 *
 * 事故序列（干净机器上必然踩）：
 *   ① 首次启动：隔离家目录 `~/.dsh-akdagent` 不存在 ⇒ 老代码抄一次 `~/.dsh` 的凭据 —— 可这时用户**还没填 key** ⇒ 抄了个空；
 *   ② 用户在客户端里填 key ⇒ 客户端只写 `~/.dsh/.credentials.yaml`（`main.js` 的 CREDENTIALS_PATH），**不是**隔离家目录；
 *   ③ 之后每次启动：隔离家目录已存在 ⇒ 老代码**再也不抄** ⇒ 宿主永远没有 key
 *      ⇒ 每个请求在 HTTP 层被拒（实测签名 `{code:'AUTH',status:401}`，**1.4 秒**）
 *      ⇒ 用户侧正是「一发消息就 回合结束（error）」，新建对话也一样，而他在界面上"明明配好了 key"。
 *
 * 本守卫做两件事：
 *   A. **行为验证**（真跑一遍那个序列）：临时 home 无凭据 → ensureHome → 往"源"写凭据 → 再 ensureHome
 *      ⇒ 断言隔离家目录里出现了凭据（且 BOM 被剥掉）。
 *   B. **接线验证**：`main.js` 里 `writeSettings` / `writeCredentials` 都必须调 `mirrorDshFileToIsolatedHome`
 *      （写入时即时镜像；A 是每次启动的兜底，两道保险缺一不可）。
 *
 * 用法：node tools/check-credentials-sync.cjs [--module <dsh-home.js 路径>]
 *   （`--module` 主要用于反向验证：指向修复前那份，守卫应 FAIL）
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
  }
}

console.log('\n== B. 接线验证：main.js 写入时要即时镜像 ==');
{
  const t = fs.existsSync(MAIN) ? fs.readFileSync(MAIN, 'utf8') : '';
  if (!t) fail('读不到 electron/src/main.js');
  else {
    if (/function mirrorDshFileToIsolatedHome\(/.test(t)) ok('mirrorDshFileToIsolatedHome() 存在');
    else fail('缺少 mirrorDshFileToIsolatedHome() —— 写入时不再镜像');
    const inSettings = /mirrorDshFileToIsolatedHome\('settings\.yaml'/.test(t);
    const inCreds = /mirrorDshFileToIsolatedHome\('\.credentials\.yaml'/.test(t);
    if (inSettings) ok("writeSettings 镜像 settings.yaml"); else fail('writeSettings 没有镜像 settings.yaml');
    if (inCreds) ok("writeCredentials 镜像 .credentials.yaml"); else fail('writeCredentials 没有镜像 .credentials.yaml');
    if (/const CREDENTIALS_PATH = path\.join\(HOME_DIR, '\.dsh', '\.credentials\.yaml'\)/.test(t)) {
      info('客户端凭据路径仍是 ~/.dsh/.credentials.yaml（隔离家目录靠镜像 + ensureHome 兜底）');
    }
  }
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格`); process.exit(1); }
console.log('✓ 凭据同步守卫通过');
