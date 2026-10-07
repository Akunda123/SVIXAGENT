/**
 * akd-auth-probe —— 临时探针插件（不属于产品，测完即删）
 *
 * 这一版要判四件事：
 *   ① `ctx.authorization` 在不在（已证：挂上 dsh-authorization 就在）；
 *   ② pi-ai 目录里的提供方**到底带不带 auth**（第一版取法错了，误报"没有 auth"）；
 *   ③ 配上 pi-ai 提供方后，dsh-llm-pi-ai 会不会注册流（0 条是不是"没跑"）；
 *   ④ **我们自己能不能注册一条流**（退路：不依赖 dsh-llm-pi-ai 的内部注册）。
 */
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'

export const name = 'akd-auth-probe'
export const inject = []

export function apply(ctx, config) {
  const cfg = config || {}
  const log = (...a) => console.log('[akd-auth-probe]', ...a)
  log('插件已挂载（apply 跑了）')

  /* ② 用正确取法问 pi-ai 目录：builtinProviders 是**函数，返回数组**（元素带 .id） */
  import('@earendil-works/pi-ai/providers/all').then((pi) => {
    try {
      const arr = pi.builtinProviders()
      log('内置提供方对象 ' + arr.length + ' 个；登录制那 7 家的 auth 形态：')
      const want = ['anthropic', 'openai-codex', 'github-copilot', 'kimi-coding', 'xai', 'openrouter', 'radius']
      for (const id of want) {
        const p = arr.find((x) => x.id === id)
        if (!p) { log('   · ' + id.padEnd(16) + ' ❌ 目录里没有这个 provider 对象'); continue }
        const auth = p.auth || {}
        log('   · ' + id.padEnd(16) + ' keys=' + JSON.stringify(Object.keys(p).slice(0, 8)) +
          ' auth=' + JSON.stringify(Object.keys(auth)) +
          (auth.oauth ? '  oauth.label=' + (auth.oauth.loginLabel ?? auth.oauth.name) : '  ⚠️ 无 oauth') +
          (auth.apiKey ? '  apiKey=' + (auth.apiKey.name ?? '?') + (auth.apiKey.login ? '(有 login)' : '(无 login)') : '  ⚠️ 无 apiKey'))
      }
      log('ids()（注册循环用的那个）' + (typeof pi.getBuiltinProviders === 'function' ? pi.getBuiltinProviders().length : '?') + ' 个')
    } catch (e) { log('问目录抛错：' + (e && e.message)) }
  }).catch((e) => log('import providers/all 失败：' + (e && e.message)))

  /* ⑤ pi-ai 插件声明要哪些服务？缺哪个 ⇒ 它的 apply 会被**推迟**（声明式注入），
   *  于是那段 `ctx.inject(['authorization'], …)` 根本没注册 ⇒ 流 0 条。 */
  import('@deepseek-ai/dsh-llm-pi-ai').then((mod) => {
    try {
      const need = mod.inject || []
      log('pi-ai 插件声明的 inject（' + need.length + '）：' + JSON.stringify(need))
      const miss = need.filter((n) => ctx.get(n) === undefined)
      log('其中当前 ctx 里**缺**的：' + (miss.length ? JSON.stringify(miss) + ' ⇒ apply 会被推迟' : '（无，apply 应该已经跑过）'))
    } catch (e) { log('读 pi-ai inject 抛错：' + (e && e.message)) }
  }).catch((e) => log('import dsh-llm-pi-ai 失败：' + (e && e.message)))

  /* ①③④ 服务侧 */
  ctx.inject(['authorization'], (ctx2) => {
    const svc = ctx2.authorization
    const list = () => { try { return svc.list() } catch (e) { log('list() 抛错：' + (e && e.message)); return [] } }
    const dump = (tag) => {
      const l = list()
      log('★ ' + tag + '：服务在 · 流 ' + l.length + ' 条' + (l.length ? ' ⇒ ' + l.map((e) => String(e.key)).join(', ') : ''))
      return l
    }

    /* ★ 关键：**同步**注册（pi-ai 也是在注入回调里同步调的）。我上一版在 setTimeout 里调，
     *   报 `INACTIVE_EFFECT — cannot create effect on inactive context` —— 那是探针自己的 bug。 */
    if (cfg.selfRegister) {
      try {
        const dispose = svc.registerFlow({
          key: cfg.selfKey || 'akd-probe/self-test',
          label: 'AKD 探针（自注册）',
          methods: [{ id: 'noop', label: '什么也不做' }, { id: 'ask', label: '问一句' }],
          async run(session) {
            session.notify({ message: '探针通知（不会出现在任何界面）' })
            try {
              const ans = await session.prompt({ kind: 'text', message: '探针提问：随便写点什么' })
              log('    run(): prompt 返回 ' + JSON.stringify(ans))
            } catch (e) {
              log('    run(): prompt 被拒 ' + (e && e.constructor && e.constructor.name))
              throw e
            }
            /* 故意**不** commit ⇒ 验证"承诺必须落库"（期望 begin 以 NOT_COMMITTED 结束） */
          },
        })
        log('★★ 同步自注册成功 · 现在流 ' + list().length + ' 条 ⇒ ' + list().map((e) => String(e.key)).join(', '))

        /* 立刻 begin 一次：验证"外部客户端能不能驱动 + interaction 契约 + commit 契约"（零网络） */
        const seen = []
        const interaction = {
          notify: (n) => { seen.push('notify'); log('   notify → ' + JSON.stringify(n)) },
          prompt: async (p) => { seen.push('prompt'); log('   prompt → ' + JSON.stringify({ kind: p.kind, message: p.message })); return '探针回答' },
        }
        Promise.resolve()
          .then(() => svc.begin({ key: cfg.selfKey || 'akd-probe/self-test', method: 'noop', interaction }))
          .then((out) => log('★★ begin() 返回：' + JSON.stringify(out) + ' · 交互 ' + seen.length + ' 次'))
          .catch((e) => log('★★ begin() 抛错：' + (e && e.code ? e.code + ' — ' : '') + (e && e.message) + ' · 交互 ' + seen.length + ' 次'))

        setTimeout(() => { dispose(); log('★★ dispose() 后流 ' + list().length + ' 条') }, 3000)
      } catch (e) {
        log('★★ 自注册失败：' + (e && e.code ? e.code + ' — ' : '') + (e && e.message))
      }
    }

    dump('立即')
    setTimeout(() => dump('+1.5s'), 1500)
    setTimeout(() => dump('+4s'), 4000)

    if (!cfg.beginProbe) return
    setTimeout(() => {
      const hit = list().find((e) => String(e.key).includes(String(cfg.key || 'openai-codex')))
      if (!hit) { log('beginProbe：没有 key 含 ' + cfg.key + ' 的流，跳过'); return }
      const seen = []
      const interaction = {
        notify: (n) => { seen.push('notify'); log('   notify → ' + JSON.stringify(n)) },
        prompt: async (p) => { seen.push('prompt'); log('   prompt → ' + JSON.stringify({ kind: p.kind, message: p.message })); throw new AuthorizationDeclinedError('探针主动拒绝') },
      }
      Promise.resolve().then(() => svc.begin({ key: hit.key, method: cfg.method || 'api-key', interaction }))
        .then((out) => log('★★ begin() 返回：' + JSON.stringify(out) + ' · 交互 ' + seen.length + ' 次'))
        .catch((e) => log('★★ begin() 抛错：' + (e && e.code ? e.code + ' — ' : '') + (e && e.message)))
    }, 6000)
  })
}
