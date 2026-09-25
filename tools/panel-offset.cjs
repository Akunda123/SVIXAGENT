#!/usr/bin/env node
/**
 * 面板入向偏移工具（2026-09-15）—— 配合桥的 `PATH.panelInOffset`
 *
 * 用途：桥会把「已读到 panel-in 的哪个字节」落盘（重启不重放旧事件，防止旧的 ask 让选项"常驻"）。
 *   本工具用来**手动对齐/重置**这个偏移：
 *     --mark-read   把偏移置为当前文件长度（= 认定现有内容都已读过，下次不重放）
 *     --reset       把偏移清零（= 下次从头读一遍，调试用）
 *     --status      打印当前偏移与文件长度
 *
 * 用法：node tools/panel-offset.cjs ix --mark-read
 */
const fs = require('fs');
const path = require('path');

const HOST = (process.argv[2] === 'sv' || process.argv[2] === 'ix') ? process.argv[2] : 'ix';
const flag = process.argv[3] || '--status';
const TMP = process.env.TEMP || require('node:os').tmpdir();
const FILE = path.join(TMP, `akdagent-panel-in-${HOST}.jsonl`);
const OFF = path.join(TMP, `akdagent-panel-in-${HOST}.offset`);

const size = fs.existsSync(FILE) ? fs.statSync(FILE).size : 0;
const cur = fs.existsSync(OFF) ? fs.readFileSync(OFF, 'utf8').trim() : '(无)';

if (flag === '--mark-read') {
  fs.writeFileSync(OFF, String(size), 'utf8');
  console.log(`已把偏移置为 ${size}（= 现有内容视为已读，桥重启不再重放）`);
} else if (flag === '--reset') {
  fs.writeFileSync(OFF, '0', 'utf8');
  console.log('偏移已清零（下次桥会从头读 panel-in，调试用；注意旧 ask 会被重放）');
} else {
  console.log(`文件 ${FILE}\n  长度 ${size} 字节\n  当前偏移 ${cur}`);
  console.log(flag === '--status' ? '（用 --mark-read / --reset 修改）' : '');
}
