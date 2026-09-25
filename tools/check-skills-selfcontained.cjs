#!/usr/bin/env node
/**
 * **技能自包含守卫**（2026-09-21 立；用户口径：「skill 内不要提 `待办.md`，那个不进库」）
 *
 * 为什么要有它：`skills/` 是**要分发的库**（随包进 `resources/dsh/skills`、也可单独分发），
 * 而本仓的工作台账（`docs/` 下的待办清单、事故留档、核对记录）**不进库** ⇒ 技能里写这些指针，
 * 对拿到技能的人就是**悬空引用**（他既看不到、也点不开）。2026-09-21 一次就清出 **23 处**（7 个文件）。
 *
 * 判据分两档（**2026-09-21 第二轮：软档已升为硬规则** —— 判据来自仓内已裁定的打包口径）：
 *   打包源 = **`knowledge/docs` + `tools`**（契约见 `knowledge/README`：「这里有什么，安装包里就有什么」）；
 *   技能经 `dsh-runtime/dsh` → `resources/dsh/skills` **另行分发**；`docs/` 下的工作文档（台账 · 坑记录 ·
 *   桥移植复盘 · SidePanel 设计 · clone 核对 · 网页资产）**都不随包** ⇒ 技能里指它们就是悬空引用。
 *
 *   🔴 **exit 1（硬规则）**：① **台账文件名**（`待办.md`）或**台账简写**（`待办 §N` 风格）
 *      ② 引用本仓工作目录 `docs/`（`knowledge/docs/` **不算** —— 它随包分发）
 *
 * 豁免：某行含 `skills-selfcontained-allow` 即跳过（与其它守卫同一套风格；理由写在同行注释里）。
 * 用法：`node tools/check-skills-selfcontained.cjs`（`--json` 出机器可读）
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SKILLS = path.join(ROOT, 'skills')
const AS_JSON = process.argv.includes('--json')
const ALLOW = 'skills-selfcontained-allow'

/** 技能目录名（顶层含 SKILL.md 的目录）—— 只报技能正文，不报别的东西 */
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

const HARD = [
  { re: /待办\.md/, why: '台账文件名 `待办.md`（该文件不进技能库）' },
  { re: /待办\s*§/, why: '台账简写 `待办 §N`（同样是台账指针）' },
  { re: /(^|[^a-zA-Z/])docs\//, why: '引用本仓工作目录 `docs/`（不随包；`knowledge/docs/` 随包分发、不算）', skip: /knowledge\/docs\// },
]

const problems = []
const infos = []
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

for (const f of walk(SKILLS)) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.includes(ALLOW)) return
    for (const r of HARD) {
      if (r.skip && r.skip.test(line)) continue
      if (r.re.test(line)) problems.push(`${rel(f)}:${i + 1}  ${r.why}\n      ${line.trim().slice(0, 150)}`)
    }
  })
}

if (AS_JSON) {
  console.log(JSON.stringify({ ok: problems.length === 0, problems }, null, 2))
  process.exit(problems.length ? 1 : 0)
}

console.log('== 技能自包含守卫 ==')
console.log(`扫描：${rel(SKILLS)}/**/*.md`)
console.log(`\n🔴 命中（不进库的指针，必须清）：${problems.length} 处`)
for (const p of problems) console.log('  [FAIL] ' + p)
if (problems.length) {
  console.log('\n  修法：去掉"指向不进库文件"的指针，**保留句子原本要表达的东西**（规则 / 日期 / 事实）。')
  console.log('        例：`按 待办 §0-1 约定：用户提出才用` → `按既定约定：用户提出才用`；')
  console.log('        来历类改成"随仓归档、不随技能分发"；要随包分发的正文就搬进 `knowledge/docs/` 再引用。')
}
console.log(problems.length ? '\n❌ 技能里仍有不进库的指针' : '\n✅ 技能自包含（无台账指针、无 docs/ 悬空引用）')
process.exit(problems.length ? 1 : 0)
