# CtxMeter — Notices

CtxMeter is an independently maintained context and usage monitor for Codex Desktop.
It uses S as its default compact visual mark and retains the M desktop icon.
The direct modification baseline for product version 1.3.0 (maintenance identifier
1.3.0+ctx.1) is the previous public build 1.2.1+ctx.1. This revision adds a responsive
topbar layout and folds secondary metrics when space is limited, while preserving
letter customization, the CtxMeter identity, existing functionality and settings
compatibility. Historical maintenance identifiers remain unchanged.
Build 1.2.1+ctx.1 inherited the personal S build 1.2.0+ctx.local.1, which inherited
public build 1.2.0+ctx.1. The latter inherited 1.1.0+sean.2,
1.1.0+sean.1, 1.0.0+sean.2, 1.0.0+sean.1,
3.1.7+sean.context.1, 3.1.7+sean.topbar.1 and the following MIT-licensed upstream release:

- JiaYang-BUAA/Codex-Desktop-Usage-Monitor-Windows v3.1.7:
  https://github.com/JiaYang-BUAA/Codex-Desktop-Usage-Monitor-Windows

Copyright (c) 2026 Codex Usage Monitor contributors.
The upstream copyright and MIT license are retained in LICENSE. Product naming
and interface changes do not remove that attribution or imply ownership of
the upstream contributions.

[Nudge](https://github.com/yuxinz77/nudge-ai) inspired the compact context indicator, traffic-light status presentation,
and reminders to save conclusions and start a fresh conversation. These ideas
were implemented within the Codex Usage Monitor codebase, with this project's
top-bar layout, Chinese action prompts, consistent status colors, three selectable
summary styles, stronger numeric/reset-time readability, and independent icon.
No Nudge executable, source code, artwork or logo is bundled. This is an
independent customization and does not claim endorsement from either project.

The compatibility state directory and internal identifiers continue to use
CodexUsageMonitor / codex-usage-monitor to preserve existing settings and
Windows DPAPI credentials. The runtime does not load the upstream updater.

Codex Usage Monitor for Windows is derivative software based on runtime-injection ideas from:

- Fei-Away/Codex-Dream-Skin: https://github.com/Fei-Away/Codex-Dream-Skin
- tree0519/Codex-Dream-Skin-Forge: https://github.com/tree0519/Codex-Dream-Skin-Forge

The distributed package contains no bundled themes, character artwork, Codex binaries, Node.js runtime, credentials, or user configuration.

Reset probability data is retrieved at runtime from the public API of the MIT-licensed open-source project Codex Reset Observatory:

- gussuri/codex-reset-observatory: https://github.com/gussuri/codex-reset-observatory

No Codex Reset Observatory source code or prediction dataset is bundled in this package.

Codex and OpenAI are trademarks of their respective owners. This project is unofficial and is not affiliated with, sponsored by, or endorsed by OpenAI.
