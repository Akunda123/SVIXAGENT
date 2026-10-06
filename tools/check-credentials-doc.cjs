#!/usr/bin/env node
/**
 * 守卫：**写进 DSH 家目录的凭据文档，必须是宿主读得了的**（2026-09-27 立）
 *
 * 事故（用户机，2026-09-27 早上连撞 5 次）：填了 API Key 之后**每次启动都闪退**。
 *   日志真因：`credentials-local: unknown top-level key "DEEPSEEK_API_KEY" in …\.dsh-akdagent\.credentials.yaml`
 *   ⇒ 宿主 boot 阶段抛错 ⇒ 宿主进程退出 ⇒ 客户端 500ms 后跟着退出（用户只看到"过了一会就闪退"）。
 *   那份文件的形态（用户截图）：`version: 1` + `records:`（DSH 写的会话授权）+ **顶层 `DEEPSEEK_API_KEY`**。
 *   而它是**我们客户端自己写坏的**：`setCred()` 以前按"有没有 refs 段"判新旧格式，文件没有 refs 就
 *   **写到顶层** —— 可全新机器上 DSH 先写的正是 `version: 1` + `records`（还没有 refs）⇒ 一填 key 就产出
 *   这种混合文档。宿主自带的扁平迁移（renderFlatLayoutMigration）只认**纯扁平**文档 ⇒ 它自己修不了。
 *
 * 宿主规则（来自打包运行时，本守卫内联复刻一份）：
 *   · 空文档 = 空存储（允许）
 *   · 非空 ⇒ 必须 `version: 1`
 *   · 顶层键**只许** `version` / `refs` / `records`
 *   · `refs`   = 键匹配 /^[A-Za-z_][A-Za-z0-9_]*$/、值非空字符串
 *   · `records` = 键为 `<scope>/<id>`（两半 /^[a-z][a-z0-9-]*$/）
 *
 * 本守卫做四件事：
 *   A. `normalizeCredentialsText()` 行为（8 种脏输入 ⇒ 产出必须宿主能读）
 *   B. 端到端：源里放**事故现场那份混合文档** ⇒ `ensureHome()` ⇒ 隔离家目录那份必须宿主能读
 *   C. 接线：main.js 写侧不许再写顶层键 / 要规范化 / 要校验凭据名；宿主异常退出要留现场
 *   D. dsh-home.js 的同步链路要"规范化后再写"+"起宿主前自检自愈"
 *
 * 用法：node tools/check-credentials-doc.cjs [--module <dsh-home.js 路径>]
 *   （`--module` 用于反向验证：指向修复前那份，守卫应 FAIL）
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
let yaml = null;
try { yaml = require(path.join(ROOT, 'electron', 'node_modules', 'js-yaml')); }
catch { yaml = require('js-yaml'); }

let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);
const info = (m) => console.log('  [i]    ' + m);

/* ── 宿主规则的复刻（只用于守卫判断，运行时不用它） ───────────────────── */
const HOST_TOP_KEYS = ['version', 'refs', 'records'];
const HOST_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HOST_SEG_RE = /^[a-z][a-z0-9-]*$/;
const isMap = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function hostProblems(doc) {
  if (doc === undefined || doc === null) return [];
  if (!isMap(doc)) return ['不是映射'];
  const keys = Object.keys(doc);
  if (keys.length === 0) return [];
  const p = [];
  if (!('version' in doc)) p.push('缺 version');
  else if (doc.version !== 1) p.push('version 不是 1');
  for (const k of keys) if (!HOST_TOP_KEYS.includes(k)) p.push('unknown top-level key "' + k + '"');
  if (doc.refs !== undefined && doc.refs !== null) {
    if (!isMap(doc.refs)) p.push('refs 不是映射');
    else for (const [k, v] of Object.entries(doc.refs)) {
      if (!HOST_REF_RE.test(k)) p.push('refs 名不合法 ' + k);
      else if (typeof v !== 'string' || v.length === 0) p.push('refs 值为空/非字符串 ' + k);
    }
  }
  if (doc.records !== undefined && doc.records !== null) {
    if (!isMap(doc.records)) p.push('records 不是映射');
    else for (const k of Object.keys(doc.records)) {
      const parts = k.split('/');
      if (parts.length !== 2 || !parts.every((s) => HOST_SEG_RE.test(s))) p.push('records 键不合法 ' + k);
    }
  }
  return p;
}
const parseOk = (text) => { const d = yaml.load(text); return { doc: d, problems: hostProblems(d) }; };

/** 事故现场那份（key/secret 用假值，别把真凭据写进仓库） */
const INCIDENT_DOC = 'version: 1\n'
  + 'records:\n'
  + '  client-connection/browser-session:\n'
  + '    kind: grant\n'
  + '    payload:\n'
  + '      version: 1\n'
  + '      secret: FAKE-SESSION-SECRET\n'
  + 'DEEPSEEK_API_KEY: sk-FAKE-KEY-FOR-GUARD\n';

let H = null;
try { H = require(DH); } catch (e) { fail('require ' + DH + ' 失败：' + e.message); }
if (!H) { console.log('\n✗ 连模块都载不进来'); process.exit(1); }

console.log('== A. 规范化行为（module=' + path.relative(ROOT, DH).replace(/\\/g, '/') + '）==');
{
  if (typeof H.normalizeCredentialsText !== 'function') fail('缺少 normalizeCredentialsText()（写进家目录前必须规范化）');
  else {
    const cases = [
      ['纯扁平（老格式）', 'DEEPSEEK_API_KEY: sk-aaa\n', (r) => r.ok && /refs:/.test(r.text) && !/^DEEPSEEK_API_KEY:/m.test(r.text)],
      ['事故现场：version+records+顶层键', INCIDENT_DOC, (r) => r.ok && /refs:/.test(r.text) && !/^DEEPSEEK_API_KEY:/m.test(r.text) && /browser-session/.test(r.text)],
      ['已合规 ⇒ 不该改', 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-ccc\n', (r) => r.ok && r.report && r.report.changed === false],
      ['非法 ref 名（带横线）', 'version: 1\nmy-key: sk-ddd\n', (r) => r.ok && !/my-key/.test(r.text)],
      ['version: 2 ⇒ 拒绝同步', 'version: 2\nrefs:\n  A: x\n', (r) => r.ok === false],
      ['空文件 ⇒ 原样不动', '', (r) => r.ok && r.report && r.report.changed === false],
      ['refs 是数组 ⇒ 修成映射', 'version: 1\nrefs:\n  - a\n', (r) => r.ok],
      ['records 坏条目 ⇒ 丢掉坏的、留好的', 'version: 1\nrefs:\n  A: x\nrecords:\n  Bad/KEY:\n    kind: grant\n  good-scope/good-id:\n    kind: grant\n', (r) => r.ok && !/Bad\/KEY/.test(r.text) && /good-scope\/good-id/.test(r.text)],
    ];
    for (const [label, text, expect] of cases) {
      let r = null;
      try { r = H.normalizeCredentialsText(text, () => {}); } catch (e) { fail(label + ' 抛异常：' + e.message); continue; }
      const pass = (() => { try { return !!expect(r); } catch { return false; } })();
      if (!pass) { fail(label + ' ⇒ 不符合预期：' + JSON.stringify(r).slice(0, 200)); continue; }
      if (r.ok === false) { ok(label + ' ⇒ 拒绝同步（' + r.reason + '）'); continue; }
      const { problems } = parseOk(r.text);
      if (problems.length) fail(label + ' ⇒ 产出**宿主仍读不了**：' + problems.join('；') + '　文本=' + JSON.stringify(r.text).slice(0, 200));
      else ok(label + ' ⇒ 产出宿主能读' + (r.report && r.report.moved.length ? '（搬进 refs：' + r.report.moved.join(',') + '）' : ''));
    }
  }
}

console.log('\n== B. 端到端：源里放事故现场那份 ⇒ ensureHome 后隔离家目录必须宿主能读 ==');
if (typeof H.ensureHome !== 'function') fail('缺少 ensureHome()');
else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-guard-doc-'));
  const src = path.join(tmp, 'dsh');
  const home = path.join(tmp, 'dsh-akdagent');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, '.credentials.yaml'), INCIDENT_DOC, 'utf8');
  H.ensureHome({ home, sourceHome: src, dshRoot: DSH_ROOT, log: () => {} });
  const dst = path.join(home, '.credentials.yaml');
  if (!fs.existsSync(dst)) fail('隔离家目录里没有凭据文件（同步没发生）');
  else {
    const { doc, problems } = parseOk(fs.readFileSync(dst, 'utf8'));
    if (problems.length) fail('隔离家目录那份宿主**读不了**（这就是"闪退"的真因）：' + problems.join('；'));
    else ok('隔离家目录那份宿主能读');
    const key = doc && doc.refs && doc.refs.DEEPSEEK_API_KEY;
    if (key) ok('key 落在 refs.DEEPSEEK_API_KEY 里（宿主能取到）');
    else fail('key 没进 refs ⇒ 宿主取不到 key（会退化成 AUTH/401）');
  }
  /* ⛔ 2026-09-28（方案 ABCD）**断言反过来了**：以前要求"源那份也该被规范化（我们顺手治它）"，
   *   现在要求**源那份一个字都不许动**（用户报「夺舍 DSH」）—— 规范化只作用在我们自己那份拷贝上。
   *   判据：跑完 ensureHome 后，源文件仍**逐字节**等于放进去的那份（事故现场文档）。 */
  const srcText = fs.readFileSync(path.join(src, '.credentials.yaml'), 'utf8');
  if (srcText === INCIDENT_DOC) ok('源 ~/.dsh 那份**逐字节未变**（只读；不再被我们规范化/挪走）');
  else fail('源 ~/.dsh 那份被改动了（分离没做到位）：' + JSON.stringify(srcText).slice(0, 160));
  const srcDirFiles = fs.readdirSync(src).sort();
  if (srcDirFiles.length === 1 && srcDirFiles[0] === '.credentials.yaml') {
    ok('源目录里没有多出 .bak / rejected-* 之类的文件');
  } else fail('源目录多出文件：' + srcDirFiles.join(', '));
  /* 场景 2：源里**没有**凭据文件 ⇒ 同步整段跳过 ⇒ 隔离家目录里那份坏的（历史遗留）必须被挪走，
   * 否则宿主每次启动都还是会炸 —— 这才是"用户手改过 / 旧版写坏过"的真实形态。 */
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-guard-doc2-'));
  const home2 = path.join(tmp2, 'dsh-akdagent');
  const src2 = path.join(tmp2, 'dsh');
  fs.mkdirSync(home2, { recursive: true });
  fs.mkdirSync(src2, { recursive: true });
  fs.writeFileSync(path.join(home2, '.credentials.yaml'), 'version: 9\nrefs:\n  A: x\n', 'utf8');
  H.ensureHome({ home: home2, sourceHome: src2, dshRoot: DSH_ROOT, log: () => {} });
  const left = fs.readdirSync(home2).filter((f) => f.startsWith('.credentials.yaml') && !f.includes('.rejected-') && !f.endsWith('.bak'));
  if (left.length === 0) ok('隔离家目录里的坏凭据被挪走（源里没凭据、同步跳过时也不会留给宿主去炸）');
  else fail('隔离家目录里还留着宿主读不了的文件 ⇒ 下次启动照样闪退：' + JSON.stringify(fs.readdirSync(home2)));
}

console.log('\n== C. 接线：写侧不许再产出顶层键 / 要规范化 / 要校验凭据名 ==');
{
  const t = fs.existsSync(MAIN) ? fs.readFileSync(MAIN, 'utf8') : '';
  if (!t) fail('读不到 electron/src/main.js');
  else {
    const worker = fs.readFileSync(path.join(ROOT, 'electron/src/codex-auth-worker.mjs'), 'utf8');
    if (/codexService\.setKey\('DEEPSEEK_API_KEY'/.test(t) && /codexService\.setKey\(env, v\)/.test(t)) ok('两条密钥写入路径都交给 DSH 凭据服务');
    else fail('有密钥写入路径未使用 DSH 凭据服务');
    if (/runtime\.credentialRef\(ref\)/.test(worker) && /await store\.set\(name, value\)/.test(worker) && /await store\.unset\(name\)/.test(worker)) ok('worker 校验引用名，并用原生 set/unset 保持凭据格式');
    else fail('worker 没有通过原生凭据接口写入');
    if (!/(?:writeFileAtomic|writeFileSync)\(OWNED_CREDENTIALS_PATH/.test(t)) ok('主进程不再整份重写凭据文件（避免覆盖 OAuth 刷新）');
    else fail('主进程仍然直接覆写凭据文件');
    if (/CRED_REF_RE\.test\(env\)/.test(t) && /ok: false, error: `凭据名/.test(t)) ok('set-provider-key 会拒绝不合法的凭据名（并把原因交给界面）');
    else fail('set-provider-key 没校验凭据名 ⇒ 用户填 `my-key` 之类就能把宿主写崩');
    if (/host-crash\.json/.test(t) && /noteHostStderr\(/.test(t)) ok('宿主异常退出会落 host-crash.json（含 stderr 现场）');
    else fail('宿主异常退出没有现场落盘 ⇒ 用户报"闪退"时我们还是只有"code=1"');
    const reasons = (t.match(/quitApp\('(托盘菜单|界面按钮|启动失败|窗口全关[^']*|内嵌宿主运行中退出)'\)/g) || []).length;
    if (reasons >= 4) ok('quitApp() 带来源的调用点 ' + reasons + ' 处（以前日志分不出"用户退的"和"宿主死的"）');
    else fail('quitApp() 带来源的调用点只有 ' + reasons + ' 处（至少要覆盖 托盘/界面/启动失败/窗口全关/宿主退出）');
  }
}

console.log('\n== D. 同步链路：规范化后再写 + 起宿主前自检自愈 ==');
{
  const t = fs.readFileSync(DH, 'utf8');
  if (/f === '\.credentials\.yaml'/.test(t) && /normalizeCredentialsText\(text, say\)/.test(t)) ok('ensureHome 同步凭据前先规范化');
  else fail('ensureHome 同步时还是逐字抄（源里有顶层键就会把宿主毒死）');
  if (typeof H.healCredentialsFile === 'function') ok('healCredentialsFile() 存在（启动自检 + 自愈）');
  else fail('缺少 healCredentialsFile()');
  const calls = (t.match(/healCredentialsFile\(/g) || []).length;
  if (calls >= 3) ok('heal 调用点 ' + calls + ' 处（含函数定义）');
  else fail('heal 调用点不足（源 + 隔离家目录各要一次）');

  /* D2（2026-09-27 二）：同步要**合并**而不是整份覆盖 —— refs 取源、records 取隔离家目录
   *（records 是宿主自己写的、且与"哪个家目录"绑定：搬源那份进来等于把别的家目录的会话授权塞给宿主） */
  if (/mergeCredentialDocs\(out\.text/.test(t)) ok('同步凭据走 mergeCredentialDocs()（refs 取源 / records 取隔离家目录）');
  else fail('同步还是整份覆盖 ⇒ 会把宿主自己写的 records 盖掉');
  /* ⚠️ 2026-09-28（方案 ABCD）：**已有我们那份**时不能再"refs 整份取源" ——
   *   客户端现在写的正是**我们那份**（不再是源），整份取源会把用户自己填的 key 弄丢。
   *   判据：补齐分支必须显式取并集（我们的优先）。 */
  if (/refs: \{ \.\.\.dRefs, \.\.\.addRefs \}/.test(t)) ok('补齐 ref 时取**并集**（我们那份优先，不会把我们自己的 key 顶掉）');
  else fail('补齐 ref 时 refs 整份取源 ⇒ 用户自己填的 key 会静默消失（见 tools/check-dsh-separation.cjs ⑧）');
  // 行为验证：源与隔离家目录各有一条 ref + 各有一条 record ⇒ 源的新 ref 补齐、我们那条不丢、records 用隔离那份
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'akd-guard-merge-'));
    const src = path.join(tmp, 'dsh');
    const home = path.join(tmp, 'dsh-akdagent');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(src, '.credentials.yaml'),
      'version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-from-source\nrecords:\n  client-connection/browser-session:\n    kind: grant\n    payload:\n      version: 1\n      secret: FROM-SOURCE\n', 'utf8');
    fs.writeFileSync(path.join(home, '.credentials.yaml'),
      'version: 1\nrefs:\n  OLD_API_KEY: sk-old\nrecords:\n  client-connection/browser-session:\n    kind: grant\n    payload:\n      version: 1\n      secret: FROM-ISOLATED\n', 'utf8');
    H.ensureHome({ home, sourceHome: src, dshRoot: DSH_ROOT, log: () => {} });
    const t2 = fs.readFileSync(path.join(home, '.credentials.yaml'), 'utf8');
    const refsOk = /DEEPSEEK_API_KEY: sk-from-source/.test(t2) && /OLD_API_KEY: sk-old/.test(t2);
    const recOk = /FROM-ISOLATED/.test(t2) && !/FROM-SOURCE/.test(t2);
    if (refsOk && recOk) ok('合并正确：源的新 ref 补齐、我们自己那条 ref 不丢、records 保留隔离家目录那份');
    else fail('合并语义不对（源的新 ref 补齐=' + refsOk + ' records保留隔离=' + recOk + '）：' + JSON.stringify(t2).slice(0, 240));
  }
}

console.log('\n== E. 第二轮（2026-09-27 二）：自愈重试 / 判据 / 原子写 / 可见化 ==');
{
  const t = fs.readFileSync(MAIN, 'utf8');
  const dh = fs.readFileSync(DH, 'utf8');
  const st = fs.existsSync(path.join(ROOT, 'electron', 'src', 'settings.html'))
    ? fs.readFileSync(path.join(ROOT, 'electron', 'src', 'settings.html'), 'utf8') : '';

  // 1. 宿主启动失败 ⇒ 自愈重试一次（而不是退出客户端）
  if (/async function bringUpHost\(/.test(t)) ok('bringUpHost() 存在（起宿主抽成函数才能重试）');
  else fail('没有 bringUpHost() ⇒ 宿主一退就只能退出客户端');
  if (/const HOST_MAX_ATTEMPTS = 2/.test(t) && /await bringUpHost\(attempt\)/.test(t)) ok('启动失败会自愈后重试一次（最多 2 次）');
  else fail('没有"启动失败 ⇒ 自愈重试"的循环');
  if (/if \(hostExited\)/.test(t) && /宿主进程在就绪前退出/.test(t)) ok('waitForWeb 在宿主退出时立刻失败（不再傻等 90 秒）');
  else fail('waitForWeb 没接 hostExited ⇒ 启动重试要等满 90 秒');
  const bootExit = /if \(!hostReady\) \{([\s\S]*?)\n      \}/.exec(t);
  if (!bootExit) fail('找不到"就绪前退出"的分支（重试逻辑的入口）');
  else if (/quitApp\(/.test(bootExit[1])) fail('"就绪前退出"分支里还有 quitApp ⇒ 用户看到的还是"闪退"');
  else if (!/return/.test(bootExit[1])) fail('"就绪前退出"分支没有 return ⇒ 会继续往下走（弹框/退出）');
  else ok('"就绪前退出"只留现场、不弹框不退客户端（交给重试）');
  if (/quitApp\('内嵌宿主运行中退出'\)/.test(t)) ok('"就绪后死亡"仍然可见地退出（弹框 + 留痕）');
  else fail('运行期宿主死亡的处理丢了');

  // 2. 界面判据 = 宿主真正读的那份
  if (/function effectiveCredentials\(/.test(t) && /function docHasApiKey\(/.test(t)) ok('effectiveCredentials()/docHasApiKey() 存在（按宿主实际那份判）');
  else fail('界面判据还没有"宿主实际读的那份"');
  if (/return docHasApiKey\(effectiveCredentials\(\)\.doc/.test(t)) ok('hasDeepSeekKey() 走宿主那份（不再只看源 ~/.dsh）');
  else fail('hasDeepSeekKey() 还在只看源那份（会出现"界面说已配置、宿主其实没 key"）');
  if (/const eff = effectiveCredentials\(\)/.test(t) && /credentialSource: eff\.from/.test(t)) ok('设置页的提供方列表也按宿主那份判（并回报来源）');
  else fail('设置页仍在读源那份');

  // 3. 启动自检判据换成规则层
  if (!/sk-\[A-Za-z0-9_\\-\]\{8,\}/.test(dh)) ok('自检不再用 `sk-` 正则（非 sk- 开头的提供方会漏报）');
  else fail('自检还在用 `sk-` 正则');
  if (/credentialDocProblems\(dstDoc\)/.test(dh) && /refNames\(docAt/.test(dh)) ok('自检改成规则层判据（宿主能读吗 + refs 键集合比对）');
  else fail('自检判据没换');

  // 4. 原子写（宿主 chokidar 守着那几个文件）
  if (/writeFileAtomic/.test(t) && /function writeFileAtomic\(/.test(dh)) ok('writeFileAtomic() 存在并被 main.js 使用');
  else fail('没有原子写（宿主可能在 truncate 后读到空文档）');
  const atomicUse = (t.match(/writeFileAtomic\(/g) || []).length;
  if (atomicUse >= 2) ok('原子写覆盖 ' + atomicUse + ' 处（凭据 / 设置）');
  else fail('原子写只用了 ' + atomicUse + ' 处（凭据、设置都要）');
  // Both IPC paths must check the native store result, not a removed local writer.
  if ((t.match(/if \(!result\.ok\) throw new Error\('Credential store write failed'\)/g) || []).length === 2) ok('两条原生凭据写入失败都会抛错（交给界面，而不是哑失败）');
  else fail('写凭据失败仍可能被吞');

  // 5. 可见化：key 保存失败 / 环境变量遮蔽
  if (/akdagent-key-save[\s\S]{0,700}showErrorBox\('AKDAgent 保存 API Key 失败'/.test(t)) ok('密钥窗保存失败会弹框（以前是哑的）');
  else fail('密钥窗保存失败仍是哑的');
  if (/function warnCredentialEnvShadowing\(/.test(t) && /warnCredentialEnvShadowing\(\)/.test(t)) ok('环境里有同名 key 时会警示（宿主继承进程环境）');
  else fail('环境变量遮蔽没有提示');
  if (/setProviderKey\(p\.id, p\.apiKeyEnv, v\)[\s\S]{0,240}?r\.ok === false/.test(st)) ok('设置页会检查写凭据的结果并弹错');
  else fail('设置页仍不检查写凭据的结果（用户会以为存好了）');
}

console.log('');
if (bad) { console.log(`✗ 有 ${bad} 项不合格（宿主读不了凭据 = 用户"一填 key 就闪退"）`); process.exit(1); }
console.log('✓ 凭据文档格式守卫通过');
