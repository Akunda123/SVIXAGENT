/**
 * AKDAgent 首次引导步骤组件。
 * 注册到 `settings.onboarding`：onboarding 协调器一次挂一个步骤；
 * 本步骤渲染自己的模态框，提供「配置 API Key」（跳到 Models 设置页）与「稍后再说」（完成跳过）。
 */

import type { ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AkdagentKey } from './locales.ts'

/** 注册侧依赖（本步骤注入面）。 */
export interface AkdagentOnboardingInjected {
  /** Onboarding 文案。 */
  t: (key: AkdagentKey) => string
}

/** 协调器 owner props + 注入面。 */
export type AkdagentOnboardingProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<AkdagentOnboardingInjected>

/**
 * 渲染欢迎模态框；文案载入前渲染 null（协调器在决定前不阻塞）。
 * @param props - owner 状态（stepId/complete/openSection）+ 注入的文案。
 * @returns 模态框或 null。
 */
export function AkdagentOnboarding(props: AkdagentOnboardingProps): ReactNode {
  const { complete, openSection, t } = props

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(16,18,28,.85)',
        zIndex: 9999,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: '#2e2e2e',
          color: 'rgb(179,179,179)',
          borderRadius: 14,
          padding: '26px 30px',
          maxWidth: 420,
          boxShadow: '0 8px 30px rgba(0,0,0,.55)',
        }}
      >
        <h2 style={{ margin: '0 0 12px', color: '#fff', fontSize: 18, fontWeight: 600 }}>
          {t('title')}
        </h2>
        <p style={{ lineHeight: 1.6, margin: '0 0 24px', fontSize: 13 }}>
          {t('body').split('\n\n').map((para) => <span key={para}>{para}<br /><br /></span>)}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            onClick={complete}
          >
            {t('skip')}
          </Button>
          <Button
            variant="primary"
            onClick={() => openSection('models')}
          >
            {t('setupKey')}
          </Button>
        </div>
      </div>
    </div>
  )
}
