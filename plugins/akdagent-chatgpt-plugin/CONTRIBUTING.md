# Contributing

Keep changes inside this integration where practical. Do not change upstream editing algorithms or register copied tool schemas: import `registerTools` from the installed AKDAgent server. Add migrations only when supported by actual host/version evidence.

Run with Node 22.13+:

```text
node --test plugins/akdagent-chatgpt-plugin/tests/*.test.mjs
node plugins/akdagent-chatgpt-plugin/scripts/validate.mjs
```

With AKDAgent installed, set `AKDAGENT_INSTALL_DIR` and run `node plugins/akdagent-chatgpt-plugin/scripts/check-connection.mjs offline`. `live` mode performs reads against an open host and should be invoked intentionally, with only one client/bridge. Do not use a real song for automated mutation tests.

Build the AKDAgent server first (`cd server; npm ci --ignore-scripts; npm run build`). Then run `powershell -NoProfile -File scripts/package.ps1` from the plugin folder. In the standalone plugin repository, pass `-SourceRoot` pointing to the separately checked-out AKDAgent source commit recorded in the repository's `UPSTREAM.json`; see the root README for exact commands. The recorded reference source commit comes from that checkout, not the plugin repository. This creates separate plugin, compiled MCP service (including Lua bridge), attributed reference, and one-click bundle archives. Dependencies install from the lockfile at deployment time; no models, logs, user configuration or songs are included. Publish SHA-256 checksums alongside the archives. Review archive contents and each component's license before distribution.

Test installer changes in a temporary user root using `-UserRoot`, never overwrite a real catalog during tests. Bump the manifest and changelog together. Preserve unrelated marketplace entries and backups. New runtime versions require tool-parity and documented host tests; version strings alone are not compatibility evidence.

Keep the portable, Claude and Codex manifest versions aligned. Client profiles share one adapter; validate both JSON and JSONC merge behavior. Validate native manifests with the client's CLI where available, and distinguish configuration/protocol checks from actual app UI and model-driven SV editing. Only selected clients should be registered. OpenCode v1/v2 use different layouts; never silently convert the rest of a user's configuration.
