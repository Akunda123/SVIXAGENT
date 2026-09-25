/**
 * AKDAgent onboarding client 插件的 tsdown 配置（镜像 DSH packages/client/tsdown.client.ts 的
 * 关键约定：node 半 + browser 半；browser 半用 __ModuleLoader__.load 手递 + 平台模块 external）。
 * 构建前先 `tsc -b` 产出 lib/types，再 `tsdown` 产出 lib/client.js。
 */
import { defineConfig } from 'tsdown'

const ID = '@akdagent/ui-akdagent-onboarding'

/** 平台模块表（loader 提供）：这些保持 external，其余全部内联。 */
const EXTERNALS = [
  'react',
  'react-dom',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-locale/client',
  '@deepseek-ai/dsh-client-ui-settings/client',
]

export default defineConfig([
  {
    // node 半：lib/index.js（tsc 产出 lib/types 后由本步 emit 到 lib）
    name: ID,
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
  },
  {
    // browser 半：lib/client.js，__ModuleLoader__ 手递
    name: `${ID}/client`,
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    sourcemap: true,
    external: EXTERNALS,
    noExternal: (id: string) => (EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
