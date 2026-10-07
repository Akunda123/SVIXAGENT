# Verification scope

Prior local prototype testing: Windows, SV2 2.2.1, Lua bridge 1.0.2, AKDAgent distribution reported as 1.1.0. The installed server package reports 1.1.1; these are distinct version identifiers.

Confirmed in the earlier live session: connection/project reads, note pitch edit and restoration, native SV2 pitch curve writing/readback, and eight automation parameters (`pitchDelta`, `tension`, `breathiness`, `loudness`, `voicing`, `gender`, `toneShift`, `vibratoEnv`). The prior 61 records include previews and negative tests, NOT 61 fully passing features. User music, lyrics and snapshots are excluded from this release.

Known limitations from those tests: consonant automation previews may exceed requested scope; LRC alignment and language/lyric checks may mishandle `br` and `-`. Verify previews manually before applying. SV1 attributes must not be assumed to work as SV2 curves.

Release checks are separate: manifest/link/privacy validation, reference-reader traversal/pagination tests, isolated installer tests, and offline MCP initialization/tool parity/status/reference checks against an installed runtime. Offline checks never invoke a project-editing operation. They do not prove installed-plugin UI discovery, saved audio, musical quality, SV1 or macOS compatibility. No local-inference-model features are tested or downloaded.

## 1.0.0 release verification

- All 14 production-audit entries were addressed. Both the build checkout and a fresh production-only installation from the packaged lockfile reported zero vulnerabilities with `npm audit --omit=dev` on 2026-10-07; no lifecycle scripts or inference models were used. See [per-dependency results](dependency-audit.md).
- The service build and 11 existing offline suites passed 541 assertions. Ten new FFT/cwise compatibility checks passed, including comparison with the old dependency tree at 8, 12, 64 and 6144 points. Clipboard mutation and live-host/model tests were not run.
- All eight integration tests passed; official plugin/MCP schema validation passed against the fresh runtime. Seven generated profiles each listed 57 tools and read status/workflow/references, with zero project writes and no missing original tools.
- Audio conversion tests ran against the extracted service, not just the source checkout: 16 assertions passed. Both required audio .mjs runtime modules are now included in the service archive.
- Version 1.0.0 is published as a stable release, not a claim that every client UI, SV1/macOS host, model-driven edit or audio-inference feature has completed end-to-end acceptance. Earlier prototype and 0.3.0 results below remain historical records with their original boundaries.

## 0.3.0 cross-client verification

- Portable `plugin.json` and `mcp.json` pass the official Agent Plugins 1.0 JSON schemas. Codex/Claude manifest identity and version remain aligned; the display name is AKDAgent Plugin.
- Claude Code 2.1.292 `plugin validate --strict` passes on the packaged directory. The restricted execution environment initially produced a symlink warning; independent filesystem checks showed regular directories and a normal-permission strict run passed without warnings.
- An isolated one-click deployment registered selected Codex, Claude Code, Claude Desktop, Cursor, VS Code and OpenCode configurations under test user/AppData directories, with no manual merges needed. Actual client configuration files and SV directories were unchanged.
- Seven profiles (generic, Claude Code, Claude Desktop, Cursor, VS Code, OpenCode v1/v2) each started the same MCP adapter, listed 57 tools and read status, workflow and author-reference pages successfully. There are 53 unchanged editing tools plus four integration tools, including the legacy status alias. No project writes or model requests were sent.
- OpenCode 1.18.34 was tested with isolated configuration/data directories: `opencode --pure mcp list` reported `akdagent connected`. This confirms client-to-server connection, not a model-generated musical edit.
- JSONC merge tests preserve unrelated settings, comments and Unicode; original configuration backups are verified and malformed files stay untouched. Workflow path/range and standalone-installer tests pass.
- Claude Desktop and Cursor are not installed here; their UI behavior remains unverified. VS Code and Codex 0.3.0 UI/model-driven editing and OpenCode v2 application behavior also remain acceptance checks. Native plugin validation and MCP launch tests are not substitutes for those checks.

## 0.2.0 local release-candidate results

- Fresh upstream checkout built successfully (`npm ci --ignore-scripts`, TypeScript build).
- Reference reader pagination, path traversal/type/range rejection passed; personal installer preserved existing catalog name, Unicode text and unrelated entries, created a backup and refused an overwrite.
- ZIP extracted into an isolated user/AppData tree; standalone dependencies installed from the lockfile without lifecycle scripts; MCP initialized successfully with 53 upstream tools + 2 integration tools and no missing upstream tools. Reference read succeeded.
- One-click flow registered the plugin source and installed the byte-identical upstream Lua bridge in simulated SV1/SV2 script directories. Real SV script directories and the currently installed plugin were not changed.
- Current host heartbeat was stale; no live host operations were attempted for this release. Desktop plugin discovery after restart and live behavior of this new package remain user acceptance checks.
- A second isolated deployment with Node removed from PATH downloaded the checksum-pinned Node 22.22.0, installed locked dependencies and passed the same 55-tool MCP check. Existing identical bridges were skipped; a deliberately modified test bridge was preserved with a warning.
- Standalone discovery was verified with `AKDAGENT_INSTALL_DIR`, `AKDAGENT_SKILLS_DIR` and `AKDAGENT_IPC_DIR` unset, and all full-client search locations redirected to nonexistent test directories. The plugin found its own service/reference deployment, initialized 55 tools and read references using an isolated temporary IPC directory. No full AKDAgent client path was used. The installer also passed a separate test discovering that layout without an explicit service path.
