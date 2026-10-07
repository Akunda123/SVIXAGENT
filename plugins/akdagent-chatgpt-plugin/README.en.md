# AKDAgent Plugin

A community integration for [AKDAgent](https://github.com/Akunda123/SVIXAGENT), supporting Codex, Claude Code, Claude Desktop, Cursor, VS Code Copilot and OpenCode through local MCP. [中文完整版](README.md) · [Client setup](docs/clients.md). The display name is AKDAgent Plugin; the identifier `akdagent-chatgpt-plugin` remains for compatibility.

Plugin maintainer: [littleclock2](https://github.com/littleclock2) · [Plugin repository and downloads](https://github.com/littleclock2/AKDAgent-Plugin). Original AKDAgent author: [Akunda123](https://github.com/Akunda123).

Your chosen client/model → MCP stdio adapter → standalone editing service → Lua file bridge → live Synthesizer V project. No separate AKDAgent model-chat API key is needed; the chosen client's model usage limits and billing apply.

## Features

The feature groups follow the [AKDAgent feature guide](https://github.com/Akunda123/SVIXAGENT#三功能), with deployment requirements specific to this integration.

- **Project inspection and live editing:** identify the bridge, host version and SV generation; read project, track, group and note-selection context; inspect pitches, timing, lyrics, overlaps and gaps. Apply scoped transposition, duration and lyric changes, or condition-based edits through Lua, then read back the result.
- **Lyrics, phonemes and rap:** fill supplied lyrics by character/word or preview LRC alignment; assist with writing and review of syllable counts, rhyme and Mandarin tone conflicts; read actual phonemes and languages, suggest replacements and preview consonant, mixed-language and rap-accent adjustments.
- **Pitch and phrasing:** shape attacks, transitions, slides, sustained-note vibrato and endings, using SV1 attributes or SV2 native curves as supported. Add ornaments, plan breathing notes and improve continuity while retaining automatic singing where appropriate.
- **Expression automation:** adjust tension, breathiness, loudness, voicing, gender, vibrato envelope, pitch offset, tone shift and supported voice-mode parameters. Build phrase-level changes with boundary transitions, preview values and sample the written result.
- **Melody, harmony and project files:** generate melodies and optional arpeggios from key, mood, chords and length; export MIDI and inspect melodic issues; generate harmony parts. Preview/import MusicXML notes, timing, lyrics and supported markings, and use [AKDAgent format references](https://github.com/Akunda123/SVIXAGENT/tree/main/skills/sv-project-format) for project creation, editing and SV1/SV2 migration.
- **Audio analysis and alignment:** analyze WAV tempo, beats, key, energy, spectrum and pitch statistics, estimate chords/emotion, and align accompaniment or tempo markers where supported. Convert WAV/MP3 to 44.1 kHz stereo WAV; additional containers require ffmpeg.

Additional capabilities use specific components: vocal separation uses the MDX-Net models integrated by [AKDAgent](https://github.com/Akunda123/SVIXAGENT#31-音频分析处理含对轨), including `Kim_Vocal_2` and `UVR-MDX-NET-Inst_HQ_3`; note extraction uses [CREPE](https://github.com/marl/crepe); image-to-MusicXML uses [Dolce](https://github.com/lodebar2026/dolce). Install the corresponding model files or engine separately for standalone deployment; inference features have not been tested for this release. [Instrument X textures/articulations](https://github.com/Akunda123/SVIXAGENT#39-ixinstrument-x-专属) need IX and compatible instruments, [Flat voice-style editing](https://github.com/Akunda123/SVIXAGENT#310-flat-声库编辑) needs compatible configuration files, and [ACE Studio operations](https://github.com/Akunda123/SVIXAGENT#五ace-studio第三方宿主) need its CLI or helper scripts.

Five skills cover live editing, vocal tuning, lyrics, composition and project files. Clients without skill loading use `akdagent_read_workflow` to read the same guidance; `akdagent_read_reference` retrieves author references. Availability depends on the service version, host and optional components; see [test boundaries](docs/testing.md). Review LRC, consonant and special-lyric previews before applying them. Save projects, select voicebanks and export SV audio in the host.

## Install on Windows

Recommended: extract the one-click bundle, run `Deploy.cmd` and choose the target applications. No AKDAgent client download or installation is required. The script deploys the standalone MCP service, references and Lua bridge; downloads locked dependencies and checksum-pinned Node when needed; and registers only the selected clients. Existing unrelated configuration and JSONC comments are preserved with backups. You need a script-capable SV host, voicebank and a local MCP client. See [standalone deployment](docs/standalone.md).

**You can also send [this repository's link](https://github.com/littleclock2/AKDAgent-Plugin) directly to your AI agent and ask it to follow the installation guide to set everything up for you.**

### Codex alternative: use an existing AKDAgent installation

If [AKDAgent](https://github.com/Akunda123/SVIXAGENT) is already installed, you may use its runtime and [Lua bridge](https://github.com/Akunda123/SVIXAGENT/tree/main/sv/lua) instead. Extract the plugin ZIP or enter `plugins/akdagent-chatgpt-plugin` in this repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -AKDAgentDir 'C:\Apps\AKDAgent'
```

The installer uses AKDAgent's bundled Node executable, copies this plugin into your user profile, preserves existing marketplace entries and backs up the catalog before updating it. It refuses to overwrite an existing installation directory. Omit the path for a standard per-user AKDAgent installation.

Restart Codex, install/enable the plugin from the personal marketplace, exit the original AKDAgent desktop client, and run **Agent → AKDAgent Bridge** in one SV host. Start a new chat: “Inspect the current SV project without modifying it.” Both SV generations use the same bridge; generation is detected from its heartbeat. SV1 and macOS have not been revalidated for this release; the installer targets Windows.

Use a project copy and one editing client. Read back changes, audition them, then save in SV. A successful API response is not proof of audio quality or disk persistence.

See [security/privacy](SECURITY.md), [test boundaries](docs/testing.md), [development](CONTRIBUTING.md), [MIT license](LICENSE) and [third-party notices](THIRD-PARTY-NOTICES.md). Distribution through a repository/ZIP is not official public-directory approval.
