# OH-Plugins

This repository is the public index for OpenHanako plugins. It may also host
official plugin source directories when a plugin is ready to be maintained as
part of the official catalog.

## Repository Layout

```text
marketplace.json                 Generated client-facing index.
plugins/*.json                   Reviewed plugin entries.
schemas/                         JSON Schemas for registry and manifest files.
scripts/                         Validation and index-generation scripts.
official-plugins/                Official plugin source directories.
```

## Model

Hana treats the marketplace as a discovery and trust index. The index points to a
plugin source repository or a fixed release package. Installable release packages
must include a SHA-256 checksum so the app can verify what it downloaded.

The first version supports two distribution modes:

- `source`: source is kept in this repository. This is used for official examples
  and plugins that are copied or packaged by maintainers.
- `release`: the entry points at a versioned package URL and a checksum. This is
  the mode Hana should use for one-click installation.

## Official Plugins

Official plugins live in `official-plugins/` when they exist. The first public
version of this repository starts with an empty catalog and keeps the directory
only as a reserved home for future official plugins.

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
because paths resolve on disk. A URL marketplace can list plugins and show
README content; remote release package download and checksum installation are a
future Hana app capability.

## Adding A Plugin

1. Add `plugins/<plugin-id>.json`.
2. Include the plugin source repository, manifest URL, version, trust level,
   compatibility, permissions, contributions, and distribution details.
   Add one README source so Hana can show the plugin detail page:
   `readme` for short inline Markdown, `readmeUrl` for HTTPS Markdown, or
   `readmePath` when testing from a local marketplace file.
3. Run `npm run check`.
4. Open a pull request.

Runtime-installable community plugins should use `distribution.kind = "release"`
with a fixed `packageUrl` and `sha256`.

Official source plugins can live in `official-plugins/<plugin-id>/` with:

```json
{
  "distribution": { "kind": "source", "path": "official-plugins/<plugin-id>" },
  "readme": "# Plugin Name\n\nShort Markdown description."
}
```

Use `readmePath` for local `HANA_PLUGIN_MARKETPLACE_FILE` testing. Use `readme`
or `readmeUrl` for `HANA_PLUGIN_MARKETPLACE_URL`.

## Local Commands

```bash
npm run build:index
npm run validate
npm run check
```

The scripts use only Node.js built-ins. No install step is required.
