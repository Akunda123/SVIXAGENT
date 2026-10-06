/**
 * ACE 工具组（`ace_state` / `ace_cli` / `acep`）的**离线单测**
 * 运行：cd server && npm run test:ace        （不碰 ACE、不联网、不碰用户工程）
 *
 * 为什么这些要单测：**护栏是给"我会写错"兜底的**，它自己不能被写错 ——
 *   · `--in-place` 默认必须**拒**（技能 §8 纪律：只写副本），且被拒时**文件字节不能动**；
 *   · JSON 解析要能在"人话 + JSON"混排的输出里取对（CLI 的 human 输出就是这种），字符串里带 `}` 也不能骗过它；
 *   · `--json` 只补一次；技能脚本路径按开发态/打包态解析；未知脚本名必须报可选清单。
 * 真机路径（`project info` / `vocalparam`）**不在这里**：那些要 ACE 在线，属于联调，不进离线回归。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  aceCliPath, aceCliCandidates, acepScriptPath, runAcep, runAceCli,
  parseJsonFromOutput, projectState, ACEP_SCRIPTS,
} from "../dist/ace/index.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  [ok]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra).slice(0, 300) : "")); }
};
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);

console.log("== ① 脚本路径解析（开发态 repo/skills/acep/scripts）==");
{
  for (const k of Object.keys(ACEP_SCRIPTS)) {
    let p = null, err = null;
    try { p = acepScriptPath(k); } catch (e) { err = e.message; }
    ok(`acepScriptPath('${k}') 找得到并存在（${ACEP_SCRIPTS[k]}）`, p !== null && existsSync(p), err);
  }
  let threw = null;
  try { acepScriptPath("vibrato"); } catch (e) { threw = e.message; }
  ok("未知脚本名 ⇒ 抛错并列出可选清单", !!threw && /未知脚本/.test(threw) && /acep/.test(threw), threw);
}

console.log("\n== ② JSON 解析：人话 + JSON 混排 / 字符串里带括号 ==");
{
  const cases = [
    ["裸 JSON 对象", '{"a":1}', { a: 1 }],
    ["裸 JSON 数组", "[1,2,3]", [1, 2, 3]],
    ["前面有人话", '正在保存…\n{"savedPath":"C:/x.acep"}\n', { savedPath: "C:/x.acep" }],
    ["后面有人话", '{"count":2}\n完成。', { count: 2 }],
    ["字符串里带右括号（不能骗过配平）", 'noise {"c":"} not the end","d":{"e":[1,2]}} tail', { c: "} not the end", d: { e: [1, 2] } }],
    ["人话里先出现一个 `{`（要跳过它）", '用法 {见文档}\n{"ok":true}', { ok: true }],
    ["人话里先出现一个 `[`（同上，起点要逐个试）", '参数 [可选]\n{"ok":1}', { ok: 1 }],
    ["数组里嵌对象", 'x [{"i":0},{"i":1}] y', [{ i: 0 }, { i: 1 }]],
    ["没有 JSON", "全是人话，没有结构化输出", null],
    ["空输出", "   ", null],
  ];
  for (const [name, input, want] of cases) {
    const got = parseJsonFromOutput(input);
    ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
  }
}

console.log("\n== ③ `--json` 只补一次（CLI 输出必须可解析）==");
{
  const cand = aceCliCandidates();
  ok("CLI 候选含环境变量/安装位置/PATH 三类", cand.some((c) => c.source === "ACESTUDIO_CLI") || cand.length >= 2, cand);
  const auto = runAceCli(["project", "info"]);
  ok("未给 --json ⇒ 自动补在末尾", auto.args[auto.args.length - 1] === "--json", auto.args);
  const explicit = runAceCli(["project", "info", "--json"]);
  ok("已给 --json ⇒ 不重复补", explicit.args.filter((a) => a === "--json").length === 1, explicit.args);
  ok("返回结构稳定（code/cmd/args/stdout/stderr 都在）",
    typeof auto.code === "number" && typeof auto.cmd === "string" && Array.isArray(auto.args) && typeof auto.stdout === "string" && typeof auto.stderr === "string",
    Object.keys(auto));
  const cli = aceCliPath();
  console.log(`         （本机 CLI：${cli.cmd} · 来源=${cli.source} · 存在=${cli.exists}）`);
  if (cli.exists) {
    const help = runAceCli(["help"], 60_000);
    ok("CLI 存在 ⇒ `help` 能跑起来（exit 0 且有输出）", help.code === 0 && help.stdout.length > 10, { code: help.code, err: help.stderr.slice(0, 200) });
  } else {
    console.log("  [skip] 本机没有 acestudio-cli ⇒ 跳过真机 `help` 往返（离线测试仍然有效）");
  }
}

console.log("\n== ④ 写护栏：`--in-place` 默认拒，且被拒时**文件一个字节都不动** ==");
{
  const dir = mkdtempSync(path.join(tmpdir(), "ace-guard-"));
  const f = path.join(dir, "fake.acep");
  writeFileSync(f, Buffer.from("ACEP2 not a real project", "utf8"));
  const before = sha(f);

  const refused = runAcep("acep", ["vibrato", f, "--track", "0", "--clip", "0", "--in-place"]);
  ok("带 --in-place 且未显式允许 ⇒ 拒（code 2，不是脚本自己的错）", refused.code === 2, { code: refused.code, err: refused.stderr.slice(0, 160) });
  ok("拒的理由点名 --in-place + 只写副本 + allowInPlace", /--in-place/.test(refused.stderr) && /副本/.test(refused.stderr) && /allowInPlace/.test(refused.stderr), refused.stderr.slice(0, 240));
  ok("**文件字节没动**（护栏在起进程之前就返回了）", sha(f) === before, { before, after: sha(f) });

  const allowed = runAcep("acep", ["vibrato", f, "--track", "0", "--clip", "0", "--in-place"], { allowInPlace: true });
  ok("显式 allowInPlace ⇒ 放行到脚本（这里文件是假的 ⇒ 脚本自己报错，但**不再是护栏的 code 2**）",
    allowed.code !== 2 && !/护栏拒绝/.test(allowed.stderr), { code: allowed.code, err: (allowed.stderr || allowed.stdout).slice(0, 160) });

  const noFlag = runAcep("acep", ["vibrato", f, "--track", "0", "--clip", "0"]);
  ok("不带 --in-place（默认 dry-run）⇒ 不触发护栏", !/护栏/.test(noFlag.stderr), noFlag.stderr.slice(0, 120));

  rmSync(dir, { recursive: true, force: true });
}

console.log("\n== ⑤ 脚本真跑一次（纯离线：`acep selftest`）==");
{
  const r = runAcep("acep", ["selftest"], { timeoutMs: 120_000 });
  ok("acep selftest exit 0", r.code === 0, { code: r.code, err: r.stderr.slice(0, 200) });
  ok("自检报 0 失败（含 CBOR round-trip / 升序两类断言）", /0 失败/.test(r.stdout), r.stdout.slice(-200));
  const bad = runAcep("acep", ["definitely-not-a-subcommand"]);
  ok("未知子命令 ⇒ 脚本非 0 退出（错误如实透传，不吞）", bad.code !== 0, { code: bad.code, out: (bad.stdout + bad.stderr).slice(0, 160) });
}

console.log("\n== ⑥ `projectState`：ACE 不在线时要**如实报 ok:false**，不能假装读到 ==");
{
  const st = projectState();
  ok("有 ok 字段", typeof st.ok === "boolean", st);
  if (st.ok) {
    console.log(`         （ACE 在线：${st.projectName} · dirty=${st.dirty} · isTempProject=${st.isTempProject}）`);
    ok("在线时字段类型对（name/path 字符串、dirty 布尔）",
      typeof st.projectName === "string" && typeof st.projectPath === "string" && typeof st.dirty === "boolean", st);
    /* 原断言是 `/\.acep$/i.test(st.projectPath)` —— 它假设"只要 ACE 在线，`projectPath` 一定是个 .acep 路径"。
     * ⚠️ **这个假设不成立**（2026-10-06 实测踩到）：ACE 打开的是**临时/未落盘**工程时，`project dirty` 回的
     * `projectPath` 就是 **空串**（`isTempProject:true`）—— 那次 ace.mjs 于是红了一条，而实现并没错。
     * 这条断言真正要证明的是「**用的是 `project dirty`，不是 `project info`**」⇒
     * 判据改成"`projectPath`/`dirty` 两个键都在"（`project info` 这两个键**都没有**，见 `ace/index.ts` 的注释），
     * 再按是否临时工程分别要求路径形状。 */
    ok("用的是 `project dirty`（**path/dirty 两个键都在** —— `project info` 都没有）；临时工程 path 允许为空串",
      typeof st.projectPath === "string" && typeof st.dirty === "boolean" &&
      (st.projectPath === "" ? st.isTempProject === true : /\.acep$/i.test(st.projectPath)),
      { path: st.projectPath, dirty: st.dirty, isTempProject: st.isTempProject });
  } else {
    ok("离线时带 error 文案（含 exit / 不在线）", typeof st.error === "string" && /不在线|exit/.test(st.error), st.error);
  }
}

console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
