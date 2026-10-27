# FluxBar Companion for Codex

Connect Codex projects to your existing Windows FluxBar toolbar. Companion 0.8.1 includes eleven MCP tools and guidance for project buttons, status monitoring, icons, up to ten custom right-click actions, scoped app lifecycle reports, activity and intentional handoffs.

This repository distributes the plugin only. It does not include or install the FluxBar desktop application.

## Requirements

- FluxBar running in the same Windows user session. Toolbar 0.9+ supports the complete current feature set; older versions have feature-specific restrictions.
- Codex with plugin support, running natively on Windows or in WSL on that Windows machine.
- Node.js 18+ on the Codex host PATH. WSL also needs Windows Node.js 18+, Bash, wslpath and working Windows interoperability.
- Standalone Linux, remote Linux and macOS cannot connect to this local Windows named pipe.

## Install

In the terminal belonging to the Codex installation you want to use:

```sh
codex plugin marketplace add CodenameCookie/fluxbar-companion --ref main
codex plugin add fluxbar@fluxbar-companion
```

Refresh/reopen your Codex client and start a new conversation. You can then ask:

> Use FluxBar Companion. Check the connection, register this project, and suggest a useful toolbar button for my review.

Install separately for native Windows and WSL Codex profiles. Windows uses Node directly and does not require WSL. On WSL, set FLUXBAR_WINDOWS_NODE to the Windows executable's WSL path if automatic discovery fails. The public marketplace is separate from fluxbar-local; enable one FluxBar plugin copy per conversation to avoid duplicate tools.

## Update

```sh
codex plugin marketplace upgrade fluxbar-companion
codex plugin add fluxbar@fluxbar-companion
```

Refresh the client and use a new conversation to load the updated tools and guidance. The version in [plugin.json](plugins/fluxbar/plugin.json) identifies the installed release.

## Approval and privacy

Button suggestions require your review. AI edits use a concrete preview and your confirmation before apply. App-provided menus require one-time permission for that button. Installing this plugin does not approve button changes or execute menu commands.

This repository contains source, documentation and the marketplace catalog. It contains no toolbar settings, runtime handoffs, activity history or private lifecycle setup keys. Those stay in the local FluxBar app-data directory. At runtime, requested tool results can include local project names, targets, status and intentional handoffs; treat those as local context, not content to publish. Favicon previews intentionally return image bytes to your AI conversation for review.

See the [plugin guide](plugins/fluxbar/README.md), [agent workflow](plugins/fluxbar/skills/fluxbar/SKILL.md), [menu and multi-server examples](plugins/fluxbar/skills/fluxbar/references/app-controls.md), and [lifecycle integration](plugins/fluxbar/skills/fluxbar/references/app-lifecycle.md).

## Repository maintenance

Publish only reviewed plugin files and documentation. Increase the plugin version for future releases so clients can identify updates. Keep machine settings, setup keys, project transcripts and toolbar runtime data out of this repository. Lucide attribution and license are included in [Lucide-LICENSE.txt](plugins/fluxbar/Lucide-LICENSE.txt).

The marketplace layout and GitHub installation commands follow the [official OpenAI plugin documentation](https://developers.openai.com/plugins/build/plugins).
