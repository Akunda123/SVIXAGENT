#!/usr/bin/env node
/**
 * ⛔ 本文件已作废（2026-09-13）—— 保留仅为留痕，别再照着它的结论走。
 *
 * 我原先用它"证明"了 `run_script` 的 `args.scope` 在真机上不生效，**那个结论是错的**。
 * 真实语义：**`scope` 的"内容"被逐键注入成独立全局变量**
 * （桥里就是 `for k, v in pairs(args.scope) do env[k] = v end`）——
 * 也就是说 `scope = { x = 42 }` 注入的是全局 `x = 42`，**根本不存在名为 `scope` 的对象**。
 * 我却一直读 `scope.x` ⇒ 永远 nil ⇒ 误判成"注入失效 / 常驻桥是旧循环 / 两个修订抢答"（三次都错）。
 *
 * ✅ 正确用法与最小验证：`node sv/lua/probe-scope-semantics.cjs [sv|ix]`（脚本里直接读 `x` / `strokes`）
 * 更正记录：`skills/sv-pit-art/SKILL.md` §0.4 · `docs/待办.md` A2
 *
 * 实测证据（2026-09-13，SV2）：
 *   发 scope = { x: 42, strokes: [[1,2],[3,4]] }
 *   脚本 return { x = x, strokesN = #strokes, envKeys = 枚举 _ENV }
 *   → {"x":42,"strokesN":2,"envKeys":"SV,SVH,readonly,strokes,x","typeScope":"nil"}
 */
console.log('⛔ probe-scope-raw.cjs 已作废（其结论有误）。');
console.log('   请改用：node sv/lua/probe-scope-semantics.cjs [sv|ix]');
process.exit(0);
