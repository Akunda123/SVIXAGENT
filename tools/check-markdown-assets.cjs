#!/usr/bin/env node
/**
 * check-markdown-assets.cjs ── 检查 Markdown / LaTeX / 图表离线前端套件完整性
 * 守卫：确保 vendor 离线资产（marked / dompurify / prism / katex / mermaid + LICENSE）在打包和运行时均完整存在。
 */
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const STAGE_SCRIPT = path.join(__dirname, 'stage-markdown-assets.cjs');
const r = spawnSync(process.execPath, [STAGE_SCRIPT], { encoding: 'utf8' });

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

process.exit(r.status === null ? 1 : r.status);
