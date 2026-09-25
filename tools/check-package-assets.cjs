#!/usr/bin/env node
/**
 * 守卫：**打包不许带退役的 JS 剪贴板桥**（用户 2026-09-12 指出「这个 js 不进 electron 包」）
 *
 * 检查四件事：
 *   ① `electron/electron-builder.yml` 只分发 **`sv/lua/AKDAgentBridge.lua`**（不得再出现 `SVAgentBridge.js` 的 extraResources 条目）；
 *   ② **Electron 主进程/设置页源码**里不再把 JS 桥当作要部署的对象
 *      （只允许**明确标注退役**的提及；归档目录 `legacy/` 已于 2026-09-19 删除）；
 *   ③ **打包产物**（`electron/release/**`）里不存在 `SVAgentBridge.js`；
 *   ④ 打包产物的 `resources/assets` 下**只有** `AKDAgentBridge.lua`（若已打包过）。
 *
 * 用法：node tools/check-package-assets.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const YML = path.join(ROOT, 'electron', 'electron-builder.yml');
const RELEASE = path.join(ROOT, 'electron', 'release');
let bad = 0;
const fail = (m) => { bad++; console.log('  [FAIL] ' + m); };
const ok = (m) => console.log('  [ok]   ' + m);

console.log('== ① 打包配置（extraResources）==');
{
  const yml = fs.readFileSync(YML, 'utf8');
  const lines = yml.split(/\r?\n/);
  const extraIdx = lines.findIndex((l) => /^extraResources:/.test(l));
  const block = extraIdx >= 0 ? lines.slice(extraIdx).join('\n') : '';
  if (/AKDAgentBridge\.lua/.test(block)) ok('分发了 sv/lua/AKDAgentBridge.lua');
  else fail('未分发 AKDAgentBridge.lua');
  if (/^\s*-\s*from:\s*.*SVAgentBridge\.js/m.test(block)) fail('extraResources 里仍有 SVAgentBridge.js 条目');
  else ok('extraResources 里没有 SVAgentBridge.js 条目');
  // 源路径必须真实存在（否则打包会失败）
  const m = block.match(/from:\s*(\S*AKDAgentBridge\.lua)/);
  if (m) {
    const p = path.resolve(path.join(ROOT, 'electron'), m[1]);
    if (fs.existsSync(p)) ok('源文件存在：' + path.relative(ROOT, p).replace(/\\/g, '/'));
    else fail('源文件不存在：' + p);
  }
}

console.log('\n== ② 主进程 / 设置页（不得把 JS 桥当部署对象）==');
for (const rel of ['electron/src/main.js', 'electron/src/settings.html']) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const lines = txt.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/SVAgentBridge\.js/.test(line)) return;   // ⚠️ 搜的是**退役的旧名**，不是现役 AKDAgentBridge.lua
    if (/legacy|已退役|退役/.test(line)) { ok(`${rel}:${i + 1} 仅作为"已退役"说明引用（允许）`); return; }
    fail(`${rel}:${i + 1} 仍把 JS 桥当部署对象 -> ${line.trim().slice(0, 100)}`);
  });
}

console.log('\n== ③ 打包产物（release/）==');
{
  const hits = [];
  (function walk(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'SVAgentBridge.js') hits.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    }
  })(RELEASE);
  if (!fs.existsSync(RELEASE)) console.log('  [--]   还没打过包（release/ 不存在）—— 跳过');
  else if (hits.length) hits.forEach((h) => fail('产物里混入退役的 JS 桥：' + h));
  else ok('产物里没有 SVAgentBridge.js');

  const assetsDir = path.join(RELEASE, 'win-unpacked', 'resources', 'assets');
  if (fs.existsSync(assetsDir)) {
    const bridges = fs.readdirSync(assetsDir).filter((f) => /^AKDAgentBridge\./.test(f));
    if (bridges.length === 0) console.log('  [--]   resources/assets 下还没有桥脚本（下次打包才会有 .lua）');
    else if (bridges.every((f) => f.endsWith('.lua'))) ok('resources/assets 下只有：' + bridges.join(', '));
    else fail('resources/assets 下混入了非 .lua 的桥脚本：' + bridges.join(', '));
  }
}

console.log('\n== ⑤ STT（语音输入）必须落在实盘（asarUnpack）==');
// 用户 2026-09-19 报的问题：打包版 `stt server spawn 失败：… ENOENT` ⇒ 语音静默不可用。
// 根因：STT 故意用系统/内置 node 跑独立进程（sherpa-onnx addon 与 Electron ABI 不匹配），
//       而 asar 内的路径**不能当外部进程的 cwd**，**系统 node 也读不了 asar 里的 js**。
// ⇒ 这条守卫钉住：electron-builder.yml 的 asarUnpack 必须覆盖 STT 服务与它的原生依赖。
{
  const yml = fs.readFileSync(YML, 'utf8');
  const lines = yml.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^asarUnpack:/.test(l));
  const block = idx >= 0 ? lines.slice(idx, idx + 12).join('\n') : '';
  const need = ['src/stt-server.js', 'src/stt-model.js', 'sherpa-onnx-node'];
  if (idx < 0) fail('electron-builder.yml 没有 asarUnpack ⇒ STT 在打包版会因 asar 路径失败（spawn ENOENT）');
  else {
    for (const n of need) {
      if (block.includes(n)) ok('asarUnpack 覆盖 ' + n);
      else fail('asarUnpack 缺少 ' + n + '（STT 打包版会静默不可用）');
    }
  }
  // 主进程必须用"实盘路径 + 实盘 cwd"，不许再直接把 __dirname 拼出来的 asar 路径交给 spawn
  const main = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'main.js'), 'utf8');
  if (/resolveSttServerPath\(\)/.test(main) && /sttServerCwd\(\)/.test(main)) {
    ok('main.js 用 resolveSttServerPath()/sttServerCwd()（实盘路径 + 实盘 cwd）');
  } else fail('main.js 未使用 resolveSttServerPath()/sttServerCwd()');
  if (/cwd:\s*path\.dirname\(serverPath\)/.test(main)) fail('main.js 仍把 asar 路径当 STT 子进程 cwd');
  else ok('main.js 未把 asar 路径当 cwd');
}

console.log('\n== ⑥ P11：MCP 的 node 路径必须去空格（旧运行时会把 command 按空格切开）==');
{
  const main = fs.readFileSync(path.join(ROOT, 'electron', 'src', 'main.js'), 'utf8');
  if (/function ensureSpaceFreeMcpCommand\(/.test(main)) ok('main.js 有 ensureSpaceFreeMcpCommand()');
  else fail('main.js 缺少 ensureSpaceFreeMcpCommand()（包内 mcp__sv__* 会起不来）');
  if (/ensureSpaceFreeMcpCommand\(\)/.test(main)) ok('启动路径里确实调用了它');
  else fail('ensureSpaceFreeMcpCommand() 没有被调用');
  if (/shortPathIfSpaced\(/.test(main)) ok('带空格时有 8.3 短路径兜底');
  else fail('缺少 shortPathIfSpaced() 兜底（装在含空格的目录时仍会中招）');
}

console.log('\n== ⑦ 跨平台 staging 台账（2026-09-24：darwin 运行时也长备好）==');
/*
 * 起因：同一个 `dsh-runtime/node` 与 `dist/server-runtime` 只能放**一个平台**的产物，
 *      而用户现在会同时备 win32 与 darwin 两份（交给 Mac 出包）⇒ 一旦"为 mac 备好之后又打 Windows 包"，
 *      包里会塞进 mac 的 node 二进制 / darwin 裁过的依赖，**能装上但跑不起来**，且不会报错。
 * 判据：两处台账（NODE-STAGING.json / STAGING.json）必须与**本机平台**一致；再核 STT 的平台包在本机装上了。
 */
{
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const activeNode = path.join(ROOT, 'dsh-runtime', 'node');
  const mark = readJson(path.join(activeNode, 'NODE-STAGING.json'));
  if (!fs.existsSync(activeNode)) {
    console.log('  [--]   dsh-runtime/node 不存在（还没备运行时）—— 跳过');
  } else if (!mark) {
    fail(`dsh-runtime/node 没有 NODE-STAGING.json ⇒ 跑：node tools/stage-node-runtime.cjs --platform ${process.platform} --arch ${process.arch} --from-local --activate`);
  } else {
    const samePlat = mark.platform === process.platform;
    if (samePlat) ok(`内嵌 node 台账 = ${mark.platform}/${mark.arch} · node ${mark.version}（与本机一致）`);
    else fail(`内嵌 node 台账 = ${mark.platform}/${mark.arch}，与本机 ${process.platform} **不一致** —— 这份 node 打不出能跑的包`);
    const want = mark.platform === 'win32' ? 'node.exe' : 'node';
    if (fs.existsSync(path.join(activeNode, want))) ok('活动目录里的可执行文件名匹配：' + want);
    else fail('活动目录里没有 ' + want + '（换平台后没重新 activate？）');
  }

  const srDir = path.join(ROOT, 'dist', 'server-runtime');
  if (!fs.existsSync(srDir)) {
    console.log('  [--]   dist/server-runtime 还没组装 —— 跳过');
  } else {
    const srm = readJson(path.join(srDir, 'STAGING.json'));
    if (!srm) fail('dist/server-runtime 没有 STAGING.json ⇒ 跑 node tools/build-server-runtime.cjs 重新组装（老产物不带台账）');
    else if (srm.platform !== process.platform) fail(`server-runtime 台账 = ${srm.platform}/${srm.arch}，与本机 ${process.platform} 不一致 ⇒ 别拿它打本机包`);
    else ok(`server-runtime 台账 = ${srm.platform}/${srm.arch}${srm.withModels ? ' + models' : '（无模型）'}`);
  }

  const pkgName = 'sherpa-onnx-' + (process.platform === 'win32' ? 'win' : process.platform) + '-' + process.arch;
  if (fs.existsSync(path.join(ROOT, 'electron', 'node_modules', pkgName))) ok('本机 STT 平台包已装：' + pkgName);
  else fail(`electron/node_modules 里没有 ${pkgName}（optionalDependencies 被跳过 ⇒ 打包版语音输入不可用）`);

  const ymlTxt = fs.readFileSync(YML, 'utf8');
  for (const [label, re] of [
    ['mac.entitlements 指向 entitlements.mac.plist', /entitlements:\s*build\/entitlements\.mac\.plist/],
    ['mac.binaries 签内嵌 node', /Contents\/Resources\/node\/node/],
    ['mac 的 dmg/zip 只出 arm64', /arch:\s*\[arm64\]/],
  ]) {
    if (re.test(ymlTxt)) ok('mac 配置含 ' + label);
    else fail('mac 配置缺少：' + label);
  }
  /* mac 只出 arm64 的**事实依据**也要一起钉住：onnxruntime-node 里 darwin 目录只有 arm64。
     哪天依赖升级把它补上了，这条会失败 ⇒ 提醒我们"可以把 Intel 加回来了"。 */
  const ortDarwin = path.join(ROOT, 'server', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'darwin');
  if (fs.existsSync(ortDarwin)) {
    const arches = fs.readdirSync(ortDarwin).filter((d) => fs.statSync(path.join(ortDarwin, d)).isDirectory());
    if (arches.includes('x64')) {
      fail(`onnxruntime-node 现在**有** darwin/x64 了（${arches.join(',')}）⇒ 可以把 mac 的 x64 目标加回来（见 electron-builder.yml 的 mac 注释）`);
    } else {
      ok(`onnxruntime-node 的 darwin 只有 ${arches.join(',') || '（空）'} ⇒ mac 只出 arm64 是对的`);
    }
  } else {
    console.log('  [--]   读不到 onnxruntime-node 的 darwin 目录（还没 npm ci）—— 跳过');
  }
  if (fs.existsSync(path.join(ROOT, 'electron', 'build', 'entitlements.mac.plist'))) ok('electron/build/entitlements.mac.plist 存在');
  else fail('electron/build/entitlements.mac.plist 不存在（mac 打包直接失败）');
  for (const f of ['electron/scripts/build-mac.sh', 'electron/scripts/BUILD-MAC.md', 'tools/stage-node-runtime.cjs']) {
    if (fs.existsSync(path.join(ROOT, f))) ok('存在：' + f);
    else fail('缺少：' + f);
  }
  if (fs.existsSync(path.join(ROOT, 'tools', 'pack-mac-payload.ps1'))) ok('存在：tools/pack-mac-payload.ps1（借 Mac 出包的整包脚本）');
  else fail('缺少：tools/pack-mac-payload.ps1（借来的 Mac 上没法 clone 仓库，就靠它搬源码+大件）');
  /* 中文正文放在 md 模板里、脚本保持纯 ASCII（理由见 BUILD-MAC.md §3.1 的"编码坑"）。
     两条一起钉：模板在、且脚本里**没有**非 ASCII 字符（有 ⇒ PS 5.1 会把它解成乱码）。 */
  {
    const tplPath = path.join(ROOT, 'tools', 'mac-payload-steps.md');
    if (!fs.existsSync(tplPath)) fail('缺少：tools/mac-payload-steps.md（整包里的 MAC-STEPS.md 正文）');
    else {
      const tplTxt = fs.readFileSync(tplPath, 'utf8');
      if (!tplTxt.includes('__ARCH__')) fail('tools/mac-payload-steps.md 里没有 __ARCH__ 占位符（脚本会拒绝打包）');
      else ok('存在：tools/mac-payload-steps.md（含 __ARCH__ 占位符）');
    }
    const packPath = path.join(ROOT, 'tools', 'pack-mac-payload.ps1');
    if (fs.existsSync(packPath)) {
      const packTxt = fs.readFileSync(packPath, 'utf8');
      const nonAscii = (packTxt.match(/[^\x00-\x7F]/g) || []).length;
      if (nonAscii) fail(`tools/pack-mac-payload.ps1 里有 ${nonAscii} 个非 ASCII 字符 ⇒ PowerShell 5.1 按 ANSI 解码会乱码（中文请放 tools/mac-payload-steps.md）`);
      else ok('tools/pack-mac-payload.ps1 是纯 ASCII（PS 5.1 下不会被错误解码）');
    }
  }

  /* ── 预装的 darwin 运行时**必须真的完整**（2026-09-25）────────────────────────────
   * 借来的 Mac 走的就是"直接复用 dist/server-runtime-darwin-<arch>"这条路（不重建）。
   * 所以它是**跨机器交付物**：这里必须钉住"里面确实有 darwin 的 onnx dylib 与模型"，
   * 否则 mac 上打出的包能开、但分离/音高提取/音频分析全废（而且不报错）。 */
  for (const arch of ['arm64', 'x64']) {
    const pre = path.join(ROOT, 'dist', `server-runtime-darwin-${arch}`);
    if (!fs.existsSync(pre)) continue;
    const pm = readJson(path.join(pre, 'STAGING.json'));
    if (!pm) fail(`dist/server-runtime-darwin-${arch} 没有 STAGING.json（build-mac.sh 认不出它 ⇒ 会去重建）`);
    else if (pm.platform !== 'darwin' || pm.arch !== arch) fail(`dist/server-runtime-darwin-${arch} 的台账是 ${pm.platform}/${pm.arch}（目录名与台账不符）`);
    else ok(`预装 darwin 运行时台账：${pm.platform}/${pm.arch}${pm.withModels ? ' + models' : '（无模型）'}`);

    const ortDir = path.join(pre, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'darwin', arch);
    const dylibs = fs.existsSync(ortDir) ? fs.readdirSync(ortDir).filter((f) => /^libonnxruntime.*\.dylib$/.test(f)) : [];
    const bigEnough = dylibs.some((f) => fs.statSync(path.join(ortDir, f)).size > 10 * 1048576);
    if (bigEnough) ok(`  含 onnxruntime 的 darwin/${arch} dylib（${dylibs.join(', ')}）`);
    else fail(`dist/server-runtime-darwin-${arch} 里没有可用的 libonnxruntime*.dylib（ONNX 功能会全废）⇒ 跑：node tools/build-server-runtime.cjs --platform darwin --arch ${arch}`);

    const modelsDir = path.join(pre, 'models');
    if (pm && pm.withModels && !fs.existsSync(modelsDir)) fail(`台账说有 models，但 dist/server-runtime-darwin-${arch}/models 不存在`);

    /* 平台残留：这份是要搬去 mac 的，混进 .dll / win32 的原生件说明裁平台时漏了 */
    const leftover = [];
    const scan = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { scan(p); continue; }
        if (/\.(dll|exe|pdb)$/i.test(e.name) || /^sharp-win32|^koffi-win32/i.test(e.name)) leftover.push(path.relative(pre, p));
      }
    };
    try { scan(path.join(pre, 'node_modules')); } catch { /* 读不动就跳过 */ }
    if (leftover.length) fail(`dist/server-runtime-darwin-${arch} 里混进了 Windows 原生件（${leftover.slice(0, 3).join(', ')}${leftover.length > 3 ? ` 等 ${leftover.length} 个` : ''}）`);
    else ok(`  无 Windows 原生件残留（可安全搬去 mac）`);
  }

  /* 内嵌 DSH 树的**平台可选依赖**：这棵树是在 Windows 上组的，mac 上要自己 npm ci 换。
     这里只做提示（本机是 Windows 时它当然是 win32 的），不当失败。 */
  const dshNm = path.join(ROOT, 'dsh-runtime', 'dsh', 'node_modules');
  if (fs.existsSync(dshNm)) {
    const has = (p) => fs.existsSync(path.join(dshNm, p));
    const darwinReady = has('@vscode/ripgrep-darwin-arm64') && has('@img/sharp-darwin-arm64');
    if (darwinReady) ok('dsh 树里已装 darwin 平台可选依赖（可直接用于 mac）');
    else console.log('  [--]   dsh 树只有本机平台的可选依赖 ⇒ **借 Mac 出包前要在 dsh-runtime/dsh 里 npm ci**（见 BUILD-MAC.md §3.1）');
  }

  /* 产品名要落到"路径"上：`electron/package.json` 的 productName 决定 Electron 的 `app.getName()`
     （⇒ userData 目录、窗口标题），必须与 electron-builder.yml 的 productName 一致。
     2026-09-24 实测：缺这个字段时 userData 与窗口标题都是包名 `akdagent-electron`；
     安装目录是另一条路（NSIS 向导版用 sanitizedProductName，一键版才退化成包名）。 */
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron', 'package.json'), 'utf8'));
    const ymlName = (ymlTxt.match(/^productName:\s*(.+)$/m) || [])[1];
    if (!pkg.productName) fail('electron/package.json 缺 productName（userData 与窗口标题会变成包名 akdagent-electron）');
    else if (!ymlName) fail('electron-builder.yml 缺 productName');
    else if (pkg.productName.trim() !== ymlName.trim()) fail(`package.json 的 productName（${pkg.productName}）≠ yml 的（${ymlName.trim()}）`);
    else ok(`productName 一致：${pkg.productName}（userData / 窗口标题 / 安装目录都用它）`);
  }

  /* ── Mac 侧的 Windows 硬编码（2026-09-25 修，这几条防回归）──────────────────────────
   * 共同特征：**在 Windows 上永远看不出问题**，只有真在 mac 上跑才炸（甚至只是静默降级）。
   * 所以用"负向断言"把老写法钉死（改动时若退回老写法，这里会红）。 */
  {
    const mainJs = path.join(ROOT, 'electron', 'src', 'main.js');
    const main = fs.existsSync(mainJs) ? fs.readFileSync(mainJs, 'utf8') : '';
    if (!main) {
      console.log('  [--]   读不到 electron/src/main.js —— 跳过 mac 硬编码检查');
    } else {
      // ① 内嵌 node 的文件名必须按平台算（老写法把 `node.exe` 硬编码进打包路径 ⇒ mac 上 spawn 全失败）
      if (/path\.join\(process\.resourcesPath, 'node', 'node\.exe'\)/.test(main)) {
        fail("main.js 又把内嵌 node 硬编码成 `node.exe` 了 ⇒ mac 包会指向不存在的文件（用 nodeBinName()）");
      } else if (/function nodeBinName\(\)/.test(main) && /nodeBinName\(\)/.test(main)) {
        ok('内嵌 node 文件名按平台取（node.exe / node）');
      } else {
        fail('main.js 缺少 nodeBinName()（内嵌 node 的文件名必须按平台决定）');
      }
      // ② 托盘图标：`nativeImage` 在 macOS 上读不了 .ico（返回空图，菜单栏空白且不报错）
      if (/const icon = assetPath\('icon\.ico'\)/.test(main)) {
        fail("main.js 的托盘图标又无条件用 .ico 了 ⇒ mac 菜单栏会是个空白位（darwin 分支要用 tray.png）");
      } else if (/process\.platform === 'darwin'/.test(main) && /assetPath\('tray\.png'\)/.test(main)) {
        ok('托盘图标分平台（win 用 .ico / mac 用 tray.png）');
      } else {
        fail('main.js 的 createTray() 没有平台分支（mac 上图标会是空白）');
      }
      // ③ tasklist / synthv-flat.exe 是 Windows 专属：要先判平台，别靠 spawnSync 抛异常兜底
      if (/process\.platform === 'win32'[\s\S]{0,240}?tasklist/.test(main)) ok('flat 版探测先判平台（win 才查 tasklist）');
      else fail("main.js 的 detectFlatSv() 没有先判 win32 ⇒ mac 上靠异常兜底（用异常当控制流）");
      // ④ HOME_DIR 不能无条件信 USERPROFILE（mac 上通常没有这个变量）
      if (/const HOME_DIR = process\.env\.USERPROFILE \|\|/.test(main)) {
        fail("main.js 的 HOME_DIR 无条件读 USERPROFILE 了 ⇒ mac 上被注入时会指到不存在的地方");
      } else if (/const HOME_DIR = \(process\.platform === 'win32'/.test(main)) {
        ok('HOME_DIR：USERPROFILE 只在 Windows 上生效，其余用 os.homedir()');
      } else {
        fail('main.js 的 HOME_DIR 写法变了（原来那条"绝不写死用户目录"的约定要重新确认）');
      }
    }
  }

  /* ── 预装 server 运行时**不能是旧代码**（2026-09-25 真踩）────────────────────────────
   * 经过：当天改了 `server/src`（`target`/`allowAppend`/`needConfirm`）→ `npm run build` 了
   *   `server/dist`，但**忘了重跑** `tools/build-server-runtime.cjs` ⇒ 两处预装运行时还是两天前的
   *   旧 JS。后果极隐蔽：源码、测试、守卫、技能全是新的，**只有装到用户机器上的那份 server 是旧的**
   *   ⇒ 新参数在包里等于不存在（agent 传了也白传），而且打包日志一切正常。
   * 判据：预装运行时里的 `dist/index.js` 必须与 `server/dist/index.js` **逐字节相同**。 */
  {
    const srvEntry = path.join(ROOT, 'server', 'dist', 'index.js');
    if (!fs.existsSync(srvEntry)) {
      console.log('  [--]   没有 server/dist/index.js（还没 build server）—— 跳过陈旧检查');
    } else {
      /* ① **build 本身是不是新的**：`server/dist` 必须不比 `server/src` 旧。
       *    2026-09-25 又踩一次：改了 `server/src/index.ts`（版本 1.0.0）却忘了 `npm run build`
       *    ⇒ dist 里还是旧字符串；而"运行时 vs server/dist"那条**查不出来**（两边一样旧）。
       *    所以补这条：源码里最新的 mtime 一旦晚于 dist 里最新的 mtime ⇒ 判定 dist 陈旧。 */
      const newest = (dir, ext) => {
        let t = 0;
        const walk = (d) => {
          let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
          for (const e of ents) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (ext && !p.endsWith(ext)) continue;
            try { t = Math.max(t, fs.statSync(p).mtimeMs); } catch { /* 忽略 */ }
          }
        };
        walk(dir);
        return t;
      };
      const srcTs = newest(path.join(ROOT, 'server', 'src'), '.ts');
      const distJs = newest(path.join(ROOT, 'server', 'dist'), '.js');
      if (srcTs > distJs + 1000) {
        fail('server/dist 比 server/src **旧** ⇒ 忘了 npm run build（包里的 server 会是旧代码）');
      } else {
        ok(`server/dist 不比源码旧（src ${new Date(srcTs).toISOString().slice(11, 16)} ≤ dist ${new Date(distJs).toISOString().slice(11, 16)} UTC）`);
      }

      /* ② 预装运行时必须与 server/dist 逐字节相同 */
      const want = fs.readFileSync(srvEntry);
      for (const d of ['server-runtime', 'server-runtime-darwin-arm64']) {
        const p = path.join(ROOT, 'dist', d, 'dist', 'index.js');
        if (!fs.existsSync(p)) continue;
        if (fs.readFileSync(p).equals(want)) ok(`预装运行时 ${d} 与 server/dist 同源（不是旧代码）`);
        else fail(`dist/${d}/dist/index.js 与 server/dist/index.js **不一致** ⇒ 预装运行时是旧的，重跑：node tools/build-server-runtime.cjs${d.includes('darwin') ? ' --platform darwin --arch arm64 --out dist/server-runtime-darwin-arm64' : ''}`);
      }
    }
  }

  /* ── 应用内帮助页（2026-09-25 用户定：orb 右键 → 帮助）──────────────────────────────
   * 这份页面**只在安装包里**（docs/ 不进包）⇒ 缺了就是"用户点帮助看到空白/缺图"，
   * 而开发态永远看不出来。四处一起钉：资源在、菜单接上、四语文案在、files 规则含 src/**。 */
  {
    const helpDir = path.join(ROOT, 'electron', 'src', 'help');
    const helpHtml = path.join(helpDir, 'index.html');
    const helpBg = path.join(helpDir, 'bg.png');
    if (fs.existsSync(helpHtml) && fs.existsSync(helpBg)) {
      ok(`应用内帮助页资源在位（${(fs.statSync(helpHtml).size / 1024).toFixed(1)} KB + bg.png ${(fs.statSync(helpBg).size / 1024).toFixed(0)} KB）`);
    } else {
      fail('缺 electron/src/help/{index.html,bg.png} ⇒ 打包后「帮助」会打不开或缺背景（跑 node tools/gen-demo-data.cjs 生成）');
    }
    const mainJs = path.join(ROOT, 'electron', 'src', 'main.js');
    const mainTxt = fs.existsSync(mainJs) ? fs.readFileSync(mainJs, 'utf8') : '';
    if (/function openHelp\(\)/.test(mainTxt) && /i18n\.t\('orb\.menu\.help'\)/.test(mainTxt)) {
      ok('orb 右键菜单已接上「帮助」（openHelp + orb.menu.help）');
    } else {
      fail("main.js 里没有 openHelp() 或菜单项 orb.menu.help ⇒ 帮助入口消失（或改了名字没同步这里）");
    }
    const commonPath = path.join(ROOT, 'electron', 'src', 'i18n', 'common.json');
    try {
      const c = JSON.parse(fs.readFileSync(commonPath, 'utf8'));
      const miss = [];
      for (const loc of Object.keys(c)) {
        for (const k of ['orb.menu.help', 'help.windowTitle']) if (c[loc][k] === undefined) miss.push(`${loc}:${k}`);
      }
      if (miss.length) fail(`四语缺帮助文案：${miss.join(', ')}`);
      else ok(`四语都有 orb.menu.help / help.windowTitle（${Object.keys(c).join(', ')}）`);
    } catch (e) { fail('读 electron/src/i18n/common.json 失败：' + e.message); }
    if (/^\s*-\s*src\/\*\*\/\*/m.test(ymlTxt)) ok('electron-builder files 含 src/**/* ⇒ 帮助页会进 asar');
    else fail('electron-builder.yml 的 files 不再含 src/**/* ⇒ 帮助页不会进包');
  }

  /* ── 面板随桥部署的策略（2026-09-25 用户确认：桥到处装 · 面板只装 SV2 / IX）──────────
   *  这条**不能只查字符串**：策略写成函数了（`hostKindOfScriptsDir` / `wantsPanel`），
   *  所以把函数**从 main.js 里抠出来真跑一遍**，逐路径验判据 —— 含"认不出来 ⇒ 默认不装"
   *  （默认拒绝很重要：面板是 JS 侧栏脚本，放进 SV1/OPSV 会变成菜单里点了就出事的一项）。 */
  {
    const mainJs2 = path.join(ROOT, 'electron', 'src', 'main.js');
    const src2 = fs.existsSync(mainJs2) ? fs.readFileSync(mainJs2, 'utf8') : '';
    const grab = (name) => {
      const m = src2.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
      return m ? m[0] : null;
    };
    const fKind = grab('hostKindOfScriptsDir');
    const fWant = grab('wantsPanel');
    if (!fKind || !fWant) {
      fail('main.js 里抠不到 hostKindOfScriptsDir / wantsPanel ⇒ 面板部署策略没法复核（改名了？）');
    } else {
      // eslint-disable-next-line no-new-func
      const api = new Function(fKind + '\n' + fWant + '\nreturn { hostKindOfScriptsDir, wantsPanel };')();
      const cases = [
        ['C:\\Users\\x\\Documents\\Dreamtonics\\Synthesizer V Studio\\scripts', 'sv1', false],
        ['C:\\Users\\x\\Documents\\OPSV\\Dreamtonics\\Synthesizer V Studio\\scripts', 'opsv', false],
        ['C:\\Users\\x\\AppData\\Roaming\\Dreamtonics\\Synthesizer V Studio 2\\scripts', 'sv2', true],
        ['C:\\Users\\x\\AppData\\Roaming\\Dreamtonics\\Instrument X\\scripts', 'ix', true],
        ['D:\\portable\\whatever\\scripts', null, false],          // 认不出来 ⇒ 默认不装
      ];
      const wrong = [];
      for (const [dir, wantKind, wantPanel] of cases) {
        const k = api.hostKindOfScriptsDir(dir);
        const w = api.wantsPanel(dir);
        if (k !== wantKind || w !== wantPanel) wrong.push(`${dir} ⇒ ${k}/${w}（期望 ${wantKind}/${wantPanel}）`);
      }
      if (!wrong.length) ok('面板部署策略：桥到处装 · 面板只 sv2/ix · 认不出一律不装（5 条路径实跑）');
      else fail('面板部署策略不对：' + wrong.join(' ; '));
      if (/function panelSourcePath\(/.test(src2)) ok('面板脚本源 panelSourcePath() 在');
      else fail('main.js 缺 panelSourcePath() ⇒ 面板拿不到源');
      if (/akdagent-deploy-sv-file/.test(src2)) ok('目录列表的手动部署 IPC 在（akdagent-deploy-sv-file）');
      else fail('main.js 缺 akdagent-deploy-sv-file ⇒ 目录列表的「部署面板」按钮没接上');
    }
    if (/from: \.\.\/sv\/panel\/AKDAgentPanel\.js/.test(ymlTxt)) ok('electron-builder 随包分发 AKDAgentPanel.js');
    else fail('electron-builder.yml 没把 sv/panel/AKDAgentPanel.js 打进 assets ⇒ 一键部署没有面板源');
  }
}

console.log('');
if (bad) {
  console.log(`❌ 有 ${bad} 处问题 —— 退役的 JS 桥会随包分发或部署（用户裁定：不允许）；STT 会静默不可用；跨平台 staging 错配会打出跑不起来的包`);
  process.exit(1);
}
console.log('✅ 打包/部署路径只使用 Lua 桥，未携带退役的 JS 桥；STT 已落在实盘（asarUnpack）；MCP 的 node 路径已去空格（P11）；跨平台 staging 台账一致');
