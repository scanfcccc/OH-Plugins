# Marketplace Contract

## Trust Boundary

The marketplace repository does not execute plugin code. It only records plugin
metadata, source location, install package location, compatibility, and declared
permissions. Hana still validates each plugin manifest when installing and again
when loading.

## Entry Requirements

Every `plugins/*.{yaml,yml,json}` entry must declare:

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
2. `readmePath` for Markdown files stored in this repository. Hana resolves it
   relative to the marketplace URL when the official catalog is loaded remotely.
3. `readmeUrl` for external HTTPS Markdown.

## Current Install Behavior

Hana clients read this repository's generated `marketplace.json` by default and
install `distribution.kind = "release"` entries by downloading the zip package,
verifying `sha256`, and unpacking it into the user's plugin directory.

Local file marketplaces remain a developer override. They can install
`distribution.kind = "source"` entries because paths resolve on disk. Users do
not manage marketplace sources in the product UI.
