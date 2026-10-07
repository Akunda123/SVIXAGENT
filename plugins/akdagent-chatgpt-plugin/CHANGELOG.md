# Changelog

## 1.0.0 — 2026-10-07

- Publish the first stable plugin release under littleclock2; retain the existing plugin identifier and legacy status alias.
- Resolve all 14 production-dependency audit findings: update MCP SDK, ONNX Runtime and affected transitive dependencies; override cwise's static-module with 3.0.4 without downgrading ndarray-fft.
- Add FFT/baseline and cwise execution regression checks, and document per-dependency results and audit boundaries.
- Include both runtime audio .mjs assets required by dist/audio.js in service bundles; verify packaged audio conversion without models or live host writes.
- Keep the 0.3.0 preview release available; 1.0.0 installs in its own versioned directory.

## 0.3.0 — 2026-10-07

- Rename the display name to AKDAgent Plugin while preserving existing plugin identifiers and the legacy status tool.
- Add Agent Plugins 1.0 and Claude Code manifests alongside Codex compatibility configuration.
- Generate/install selected Claude Code, Claude Desktop, Cursor, VS Code and OpenCode v1/v2 MCP profiles; preserve unrelated configuration and JSONC comments with backups.
- Share five workflow guides through MCP for clients without filesystem skill loading.
- Use a client-independent `.akdagent/<version>` deployment directory and an interactive application selector.
- Publish plugin attribution as littleclock2, with a dedicated repository and an optional pinned-source packaging path for standalone source builds.

## 0.2.0 — 2026-10-07

- Prepare a redistributable community plugin and personal-scope Windows installer.
- Remove machine-specific paths; discover a standard AKDAgent installation or accept an explicit path.
- Prefer the plugin's standalone service/reference deployment automatically, with an existing AKDAgent installation as an optional alternative; align optional model paths with the service working directory.
- Offer separate plugin, MCP service and attributed reference archives plus a one-click Windows deployment bundle; install the upstream Lua bridge without overwriting user changes.
- Read author references on demand with a bounded documentation tool, using either a separately downloaded reference pack or an existing AKDAgent installation.
- Report runtime package version dynamically; preserve upstream tool implementations.
- Add Chinese/English onboarding, privacy/security, test boundaries and packaging checks.

## 0.1.1 — local prototype

- Local Codex compatibility manifest, five music skill entrypoints and original-tool stdio integration.
- Live SV2 testing; not a portable public release.
