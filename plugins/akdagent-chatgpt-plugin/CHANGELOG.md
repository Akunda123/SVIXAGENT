# Changelog

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
