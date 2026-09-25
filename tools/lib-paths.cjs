'use strict';
/**
 * 开发机路径解析（2026-09-19 新增）
 *
 * 为什么要有它：`tools/` 里的开发工具**成片写死了开发机绝对路径**
 *   （`C:/Users/<name>/Documents/...`、`C:/Users/<name>/AppData/Roaming/...`）。
 * 两个后果：① `tools/` 是**随包分发**的（走 `tools/check-redaction.cjs` 脱敏），脱敏后
 *   变成 `C:/Users/<USER>/...` —— 在别人机器上**必然不存在**，脚本静默失效；
 *   ② 开发机一旦换人/改名，脚本就悄悄指错地方（本仓已发生过：`voice-name-table.cjs` 的
 *   默认输出还指着搬家前的 `docs/`，而文件早在 2026-09-19 移到了 `knowledge/docs/`）。
 *
 * 规矩：**一律从环境变量推**，不要写字面量。本机取值与历史字面量完全一致
 *   （`USERPROFILE` / `APPDATA` 在 Windows 上正常都有），所以行为不变、可移植性变好。
 * 守卫：`tools/check-abs-paths.cjs`（未脱敏就进包的目录里出现项目外绝对路径即判死）。
 */
const os = require('node:os');
const path = require('node:path');

/** 用户主目录 */
const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir();
/** `%APPDATA%` = `C:\Users\<name>\AppData\Roaming` */
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
/** `%USERPROFILE%\Documents` */
const DOCUMENTS = path.join(HOME, 'Documents');

module.exports = { HOME, APPDATA, DOCUMENTS };
