# HyperFrames Adapter for Hanako

OpenHanako-maintained adapter for HyperFrames. It adds a full-screen Hanako plugin page for video projects, preview, timeline review, linting, and rendering.

This plugin integrates with HyperFrames; it is not published by HeyGen.

## Requirements

- Node.js 22 or newer
- FFmpeg and FFprobe on `PATH`
- HyperFrames CLI available through `npx --yes hyperframes`
- Hanako full-access plugins enabled

## What It Adds

- A full-screen page named `HyperFrames`
- Page UI i18n for Chinese and English, resolved from iframe locale query parameters or browser language
- Project storage under the plugin data directory
- Agent tools for creating, linting, and rendering projects
- Upstream HyperFrames skills bundled under `skills/`, including CLI, composition, media, registry, and animation workflows
- Render outputs that can be attached to Hanako sessions through SessionFile

## License

The adapter source is maintained by OpenHanako. HyperFrames is third-party software published under Apache-2.0; see `THIRD_PARTY_NOTICES.md`.
