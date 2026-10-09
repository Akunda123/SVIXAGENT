'use strict'
/**
 * 清洗"模型列表"（`llm-pi-ai.providers.<route>.models` 与 `llm-deepseek.models`）——
 * 让**宿主读得懂**，并顺手补掉它会直接拒掉的字段。
 *
 * 起因（2026-10-08 用户报 `INVALID_MODEL_INFO`：provider "bailian" model "qwen3.8-max"）：
 *   宿主在**发请求之前**校验适配器返回的模型元数据（`dsh-llm/lib/index.js:2053`，`types/index.js:604` 同判据）：
 *     · `id` / `provider` 必须与所请求的一致
 *     · **`name` 必须是非空字符串**         ← 报的就是这一条
 *     · `description` 若给必须是字符串
 *   另外 `contextWindow` / `defaultMaxTokens` 若给必须是**正整数**（否则分别报
 *   `INVALID_MODEL_CONTEXT` / `INVALID_MODEL_MAX_TOKENS`）。
 *
 *   ⛔ 两个适配器的兜底**都不兜空字符串**（`??` 只兜 null/undefined）：
 *     · `dsh-llm-pi-ai/lib/index.js:678`  `name: entry.name ?? base?.name ?? entry.id`
 *     · `dsh-llm-deepseek/lib/index.js:1502` `name: model.name ?? model.id`
 *   ⇒ 只要我们把 **`name: ""`**（或只有空格的名字）写进 settings.yaml，宿主就硬拒 ——
 *   而**两条写模型的路径**（pi-ai 覆写列表 / DeepSeek 自定义列表）都可能写出这种东西，
 *   所以清洗必须**服务两家**（模块名因此叫 model-list，不叫 pi-models）。
 *
 * 口径：
 *   · `id` 是**唯一必填**；没有合法 id 的条目直接丢掉（宁可不显示，也不写一条宿主读不了的）
 *   · `name` 空（含只有空格）⇒ **用 id**（这就是那个报错的修法）
 *   · `description` 空/非字符串 ⇒ **删键**（不让空串一路带到宿主）
 *   · `contextWindow` / `maxTokens` 非正整数 ⇒ **删键**（让宿主走它的默认，而不是去抛那两个错）
 *   · `supportsImage` 非布尔 ⇒ 删键；**布尔则翻译成宿主读的那个键**（见下）
 *   · **其它未知键一律保留**（用户/未来版本塞的东西不归我们丢）
 *   · 同一个 id 出现多次 ⇒ **整体**以后一条为准（并记账）
 *
 * 图片能力（2026-10-08 同一类坑的第二处）：
 *   **两家适配器读的键名不一样，而且是各读各的**：
 *     · DeepSeek ⇒ `inputModalities`（`dsh-llm-deepseek/lib/index.js:1504` 建元数据、`:1620` 发图前硬拦；
 *       schema `:1879` 只声明这一个）
 *     · pi-ai    ⇒ `input`（`dsh-llm-pi-ai/lib/index.js:682` 解析、`:973` schema、`:1845` 发图前硬拦）
 *   而界面的勾选框给的是我们自己的 `supportsImage` —— **整个宿主树里没有任何地方读它**
 *   （2026-10-08 全树检索确认）⇒ 以前两条路写下去的都是"死键"：勾了等于没勾（不报错，静默无效）。
 *   所以 `sanitizeModelList()` 收一个 `opts.imageKey`（= 该路由真正读的键名），把
 *   `supportsImage` **翻译**过去，并把另一家那个键**迁移/清掉**（老版本写下的 `input` 就是这么修好的）。
 *   不传 `imageKey` 时保持旧行为（只校验 `supportsImage` 是布尔）—— 让"不知道路由"的调用方不用瞎猜。
 *
 * 调用点（三处，全部必须在**落盘之前**）：
 *   `akdagent-update-pi-models`（imageKey: `input`）·
 *   `akdagent-set-pi-provider-fields`（models 分支，imageKey: `input`）·
 *   `akdagent-add-model`（DeepSeek，imageKey: `inputModalities`）
 */

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const nonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const positiveInt = (v) => Number.isSafeInteger(v) && v > 0
/** 合法的模态数组（空数组**不算**声明 —— pi-ai 的 `declaredInput()` 就把 `[]` 当"没声明"，见 `:292`） */
const modalities = (v) => {
  if (!Array.isArray(v) || v.length === 0) return null
  return v.every((x) => x === 'text' || x === 'image') ? v.slice() : null
}
const IMAGE_KEYS = { input: 'inputModalities', inputModalities: 'input' }   // 本家 → 另一家

/**
 * @param {any} input 界面/调用方给的 models 数组（任何形状都收）
 * @param {{imageKey?: 'input'|'inputModalities'}} [opts] imageKey = **该路由真正读的图片键名**；
 *   给了才会把 `supportsImage` 翻译过去（并迁移另一家的键），不给则只做校验
 * @returns {{models: object[], repaired: string[]}} repaired = 人话，供界面/日志如实回报
 */
function sanitizeModelList(input, opts) {
  const repaired = []
  const imageKey = opts && (opts.imageKey === 'input' || opts.imageKey === 'inputModalities') ? opts.imageKey : null
  const otherKey = imageKey ? IMAGE_KEYS[imageKey] : null
  if (!Array.isArray(input)) {
    if (input !== undefined && input !== null) repaired.push('models 不是数组 ⇒ 已按空列表处理')
    return { models: [], repaired }
  }
  const out = []
  const at = new Map()          // id → out 里的下标（用于"后一条覆盖前一条"）
  for (const raw of input) {
    if (!isPlainObject(raw)) { repaired.push('丢掉一个不是对象的条目'); continue }
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!id) { repaired.push('丢掉一个没有 id 的模型条目'); continue }

    const next = { ...raw, id }

    if (!nonEmptyString(next.name)) {
      // ⛔ 这就是 INVALID_MODEL_INFO 的根因：空字符串不会被适配器的 `??` 兜住
      if (next.name !== undefined) repaired.push(`"${id}" 的显示名为空 ⇒ 已用模型 ID 当显示名`)
      next.name = id
    } else {
      next.name = next.name.trim()
    }

    if (next.description !== undefined && !nonEmptyString(next.description)) {
      delete next.description
      repaired.push(`"${id}" 的描述是空的 ⇒ 已删掉这个键`)
    } else if (typeof next.description === 'string') {
      next.description = next.description.trim()
    }

    for (const k of ['contextWindow', 'maxTokens']) {
      if (next[k] !== undefined && !positiveInt(next[k])) {
        delete next[k]
        repaired.push(`"${id}" 的 ${k} 不是正整数 ⇒ 已删掉（让宿主用它自己的默认值）`)
      }
    }
    if (imageKey) {
      /* ① 界面勾选（布尔）优先：翻译成该路由真正读的键 */
      if (typeof next.supportsImage === 'boolean') {
        next[imageKey] = next.supportsImage ? ['text', 'image'] : ['text']
        delete next.supportsImage
        if (next[otherKey] !== undefined) {
          delete next[otherKey]
          repaired.push(`"${id}" 同时带了 ${otherKey} ⇒ 已删掉（${imageKey} 才是这条路由读的键）`)
        }
      } else {
        if (next.supportsImage !== undefined) {
          delete next.supportsImage
          repaired.push(`"${id}" 的 supportsImage 不是布尔 ⇒ 已删掉`)
        }
        /* ② 没勾选信息，但带着**另一家的**键（老版本/手写）⇒ 迁移过来 */
        if (next[imageKey] === undefined && next[otherKey] !== undefined) {
          const m = modalities(next[otherKey])
          if (m) {
            next[imageKey] = m
            repaired.push(`"${id}" 的 ${otherKey} 已改写成 ${imageKey}（宿主读的是后者）`)
          } else {
            repaired.push(`"${id}" 的 ${otherKey} 不是合法的模态数组 ⇒ 已删掉`)
          }
          delete next[otherKey]
        }
      }
      /* ③ 本家键必须是合法模态数组，否则删掉让宿主走默认 */
      if (next[imageKey] !== undefined) {
        const m = modalities(next[imageKey])
        if (m) next[imageKey] = m
        else {
          delete next[imageKey]
          repaired.push(`"${id}" 的 ${imageKey} 不是合法的模态数组 ⇒ 已删掉`)
        }
      }
    } else if (next.supportsImage !== undefined && typeof next.supportsImage !== 'boolean') {
      delete next.supportsImage
      repaired.push(`"${id}" 的 supportsImage 不是布尔 ⇒ 已删掉`)
    }

    if (at.has(id)) {
      repaired.push(`"${id}" 重复出现 ⇒ 以最后一条为准`)
      out[at.get(id)] = next
    } else {
      at.set(id, out.length)
      out.push(next)
    }
  }
  return { models: out, repaired }
}

module.exports = { sanitizeModelList, positiveInt, nonEmptyString, modalities }
