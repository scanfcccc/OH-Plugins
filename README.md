# OH-Plugins

This repository is the official OpenHanako community plugin catalog. It follows
the Obsidian-style model: third-party authors submit plugin metadata to one
official catalog, and Hana clients read the generated catalog without asking
users to manage marketplace sources.

## Repository Layout

```text
marketplace.json                 Generated client-facing index.
plugins/*.{yaml,yml,json}        Reviewed plugin entries maintained by humans.
schemas/                         JSON Schemas for registry and manifest files.
scripts/                         Validation and index-generation scripts.
official-plugins/                Official plugin source directories.
dist/                            Local release package output, not committed.
```

## Model

Hana treats this repository as a discovery and trust index. The index points to a
plugin repository and a fixed release package. Installable release packages must
include a SHA-256 checksum so the app can verify what it downloaded.

The first version supports two distribution modes:

- `release`: the entry points at a versioned package URL and checksum. This is
  the normal one-click install mode.
- `source`: local development and maintainer testing only. URL clients cannot
  install source paths because remote repository paths are not local directories.

## Official Plugins

Officially maintained plugin sources live in `official-plugins/`. The first
catalog entry is `hanako-hyperframes`, which is maintained in this repository and
published as a release zip.

## Developing With Hana

Use the Hana app repo docs for plugin code:

- `project-hana/.docs/PLUGIN-DEVELOPMENT.md`: end-to-end workflow.
- `project-hana/PLUGINS.md`: plugin API and contribution reference.
- `project-hana/PLUGIN_SDK.md`: SDK package map.

For local marketplace testing, point Hana at this repository's generated index:

```bash
HANA_PLUGIN_MARKETPLACE_FILE=/path/to/OH-Plugins/marketplace.json npm run dev
```

Local file marketplaces can install `distribution.kind = "source"` entries
because paths resolve on disk. Normal client installs use
`distribution.kind = "release"` from the official URL marketplace.

## Adding A Plugin

1. Add `plugins/<plugin-id>.yaml`.
2. Include the plugin source repository, manifest URL, version, trust level,
   compatibility, permissions, contributions, and distribution details.
   Add one README source so Hana can show the plugin detail page:
   `readme` for short inline Markdown, `readmeUrl` for HTTPS Markdown, or
   `readmePath` for Markdown stored in this repository.
3. Run `npm run check`.
4. Open a pull request.

Runtime-installable community plugins should use `distribution.kind = "release"`
with a fixed `packageUrl` and `sha256`.

Official source plugins can live in `official-plugins/<plugin-id>/` and publish
a release package with:

```yaml
distribution:
  kind: release
  packageUrl: https://github.com/liliMozi/OH-Plugins/releases/download/<tag>/<plugin-id>.zip
  sha256: <64 lowercase hex characters>
```

The generated `marketplace.json` is the only file Hana clients read.

## Local Commands

```bash
npm run build:index
npm run package:hanako-hyperframes
npm run validate
npm run check
```

Run `npm install` once after cloning this repository.
