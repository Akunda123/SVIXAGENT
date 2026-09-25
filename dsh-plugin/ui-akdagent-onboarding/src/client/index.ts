/**
 * AKDAgent 首次引导 —— client 插件（browser 半）。
 * 注册一个 `settings.onboarding` 步骤：引导用户去 Models 设置页配置 API Key。
 * 结构镜像 @deepseek-ai/dsh-client-ui-settings-models 的 onboarding 注册方式。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only：拉入 settings slot 声明（'settings.onboarding' 条目）与 ctx.locale 合并。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AkdagentOnboarding } from './AkdagentOnboarding.tsx'
import type { AkdagentOnboardingInjected } from './AkdagentOnboarding.tsx'
import { en, zh, type AkdagentKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** AKDAgent onboarding copy. */
    'settings.akdagent': AkdagentKey
  }
}

/** 本插件拥有的字典命名空间。 */
const NS = 'settings.akdagent'

/** 必需服务（cordis fiber inject）。槽位通过 `slots.inject()` 依赖，顺序不约束。 */
export const inject = ['slots', 'locale']

/**
 * 注册 onboarding 步骤：装好字典，把步骤注入 `settings.onboarding` 槽位。
 * @param ctx - client 根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-akdagent-onboarding: copy dictionaries')

  const t = ctx.locale.bind(NS) as AkdagentOnboardingInjected['t']
  const injected = (): AkdagentOnboardingInjected => ({ t })

  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'akdagent-welcome',
    // 排在官方 DeepSeek 引导（order 0）之前
    order: -50,
    inject: injected,
  }, AkdagentOnboarding))
}
