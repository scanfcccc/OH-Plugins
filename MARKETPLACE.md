# Marketplace Contract

## Trust Boundary

The marketplace repository does not execute plugin code. It only records plugin
metadata, source location, install package location, compatibility, and declared
permissions. Hana still validates each plugin manifest when installing and again
when loading.

## Entry Requirements

Every `plugins/*.json` entry must declare:

- `id`, `name`, `publisher`, `version`, `description`
- `repository`
- `compatibility.minAppVersion`
- `trust`
- `permissions`
- `contributions`
- `distribution`
- one README source: `readmePath`, `readmeUrl`, or `readme`

Release entries must also declare:

- `distribution.packageUrl`
- `distribution.sha256`

## Permission Display

The installer should display these fields before enabling a plugin:

- plugin name, publisher, version, and repository
- trust level
- declared permissions
- contribution types
- release checksum when present

Permission upgrades require fresh user confirmation.

## README Display

Hana's marketplace detail page reads README content in this order:

1. `readme` for short inline Markdown.
2. `readmePath` for Markdown files stored in this repository.
3. `readmeUrl` for external HTTPS Markdown.

Use `readmePath` only when Hana reads the marketplace from a local file. For a
GitHub raw URL marketplace, use inline `readme` or an HTTPS `readmeUrl`.

## Current Install Behavior

Hana can browse marketplace indexes from either a local file or an HTTPS URL.
Install behavior differs by source:

- Local file marketplace + `distribution.kind = "source"`: installable, because
  the source path can resolve to a local directory.
- URL marketplace + `distribution.kind = "source"`: browsable only, because a
  path inside a remote repository is not a local installable path.
- `distribution.kind = "release"`: catalog contract is defined here, but Hana
  still needs remote package download, sha256 verification, and permission
  confirmation before one-click install is enabled.

## Custom Registries

Hana can later allow users to add additional registry URLs. A custom registry
must serve the same `marketplace.json` shape and should be treated as a separate
trust source.
