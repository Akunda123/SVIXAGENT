import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const { version } = JSON.parse(fs.readFileSync(new URL('../.codex-plugin/plugin.json', import.meta.url), 'utf8'));
const configured = process.env.AKDAGENT_INSTALL_DIR;
const candidates = configured ? [configured] : [
  path.join(process.env.USERPROFILE || os.homedir(), '.akdagent', version, 'service'),
  path.join(process.env.USERPROFILE || os.homedir(), '.codex', 'akdagent', version, 'service'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'AKDAgent'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'AKDAgent'),
].filter(Boolean);
export const installDir = candidates.find(dir => fs.existsSync(path.join(dir, 'resources', 'server', 'dist', 'tools.js')));
if (!installDir) throw new Error('Standalone MCP service not found. Run Deploy.cmd, or set AKDAGENT_INSTALL_DIR to the standalone service directory (an existing AKDAgent installation is also supported).');
export const runtimeDir = path.join(installDir, 'resources', 'server');
if (!fs.existsSync(path.join(runtimeDir, 'dist', 'tools.js'))) {
  throw new Error(`找不到 AKDAgent 本地运行时：${runtimeDir}。请修复安装或设置 AKDAGENT_INSTALL_DIR。`);
}
const runtimeRequire = createRequire(pathToFileURL(path.join(runtimeDir, 'package.json')));
export const upstreamVersion = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8')).version;
const standaloneSkills = path.resolve(installDir, '..', 'references', 'skills');
export const skillsDir = process.env.AKDAGENT_SKILLS_DIR ||
  (fs.existsSync(standaloneSkills) ? standaloneSkills : path.join(installDir, 'resources', 'dsh', 'skills'));
process.env.AKDAGENT_SKILLS_DIR ||= skillsDir;
export const loadDependency = name => runtimeRequire(name);
export async function loadSdk(relativePath) {
  const sdkEntry = runtimeRequire.resolve('@modelcontextprotocol/sdk/server/mcp.js');
  const packageDir = path.resolve(path.dirname(sdkEntry), '../../..');
  return import(pathToFileURL(path.join(packageDir, 'dist', 'esm', relativePath)).href);
}
export async function loadUpstream(relativePath) {
  return import(pathToFileURL(path.join(runtimeDir, 'dist', relativePath)).href);
}
