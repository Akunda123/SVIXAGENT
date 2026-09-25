/** AKDAgent 首次引导文案（zh / en）。 */

export const zh = {
  title: '欢迎使用 AKDAgent',
  body: 'SV AI Agent 让你用自然语言操控 Synthesizer V Studio。\n\n首次使用请先配置 API Key（模型服务凭据），之后即可直接对话控制。',
  setupKey: '配置 API Key',
  skip: '稍后再说',
}

export const en = {
  title: 'Welcome to AKDAgent',
  body: 'SV AI Agent lets you control Synthesizer V Studio with natural language.\n\nPlease configure your API key first to get started.',
  setupKey: 'Set up API Key',
  skip: 'Later',
}

export type AkdagentKey = keyof typeof zh
