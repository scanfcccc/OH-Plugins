import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS_DIR = path.join(ROOT, "plugins");
const MARKETPLACE_FILE = path.join(ROOT, "marketplace.json");
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readEntry(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  if (filePath.endsWith(".json")) return JSON.parse(text);
  return yaml.load(text);
}

function isHttpsUrl(value) {
  return typeof value === "string" && value.startsWith("https://");
}

function assertRepoRelativePath(value, label) {
  assert(typeof value === "string" && value.trim(), `${label} is required`);
  const resolved = path.resolve(ROOT, value);
  assert(resolved.startsWith(ROOT + path.sep), `${label} must stay inside repository`);
  return resolved;
}

async function validateToolModule(filePath, pluginId) {
  const mod = await import(`${pathToFileURL(filePath).href}?validate=${Date.now()}`);
  assert(typeof mod.name === "string" && mod.name.trim(), `${pluginId}: ${filePath} is missing export const name`);
  assert(typeof mod.description === "string" && mod.description.trim(), `${pluginId}: ${filePath} is missing export const description`);
  assert(typeof mod.execute === "function", `${pluginId}: ${filePath} is missing export function execute`);
}

async function validateOfficialPlugin(entry, pluginPath) {
  const manifestPath = path.join(pluginPath, "manifest.json");
  assert(await exists(manifestPath), `${entry.id}: official plugin is missing manifest.json`);
  const manifest = await readJson(manifestPath);

  assert(manifest.id === entry.id, `${entry.id}: manifest id must match marketplace id`);
  assert(manifest.version === entry.version, `${entry.id}: manifest version must match marketplace version`);
  assert(manifest.trust === entry.trust, `${entry.id}: manifest trust must match marketplace trust`);
  assert(typeof manifest.name === "string" && manifest.name.trim(), `${entry.id}: manifest name is required`);
  assert(typeof manifest.description === "string" && manifest.description.trim(), `${entry.id}: manifest description is required`);
  assert(!manifest.minAppVersion || SEMVER_RE.test(manifest.minAppVersion), `${entry.id}: manifest minAppVersion must be x.y.z`);

  const toolsDir = path.join(pluginPath, "tools");
  if (await exists(toolsDir)) {
    const toolFiles = (await fs.readdir(toolsDir))
      .filter((file) => file.endsWith(".js"))
      .sort((a, b) => a.localeCompare(b));
    for (const file of toolFiles) {
      await validateToolModule(path.join(toolsDir, file), entry.id);
    }
  }
}

async function validateEntry(entry, fileName, seenIds) {
  assert(entry.schemaVersion === 1, `${fileName}: schemaVersion must be 1`);
  assert(typeof entry.id === "string" && ID_RE.test(entry.id), `${fileName}: id is invalid`);
  assert(!seenIds.has(entry.id), `${fileName}: duplicate plugin id ${entry.id}`);
  seenIds.add(entry.id);

  assert(typeof entry.name === "string" && entry.name.trim(), `${entry.id}: name is required`);
  assert(typeof entry.publisher === "string" && entry.publisher.trim(), `${entry.id}: publisher is required`);
  assert(typeof entry.description === "string" && entry.description.trim(), `${entry.id}: description is required`);
  assert(typeof entry.version === "string" && SEMVER_RE.test(entry.version), `${entry.id}: version must be semver`);
  assert(isHttpsUrl(entry.repository), `${entry.id}: repository must be https`);
  if (entry.readme !== undefined) {
    assert(typeof entry.readme === "string" && entry.readme.trim(), `${entry.id}: readme must be a non-empty string`);
  }
  if (entry.readmeUrl !== undefined) {
    assert(isHttpsUrl(entry.readmeUrl), `${entry.id}: readmeUrl must be https`);
  }
  if (entry.readmePath !== undefined) {
    const readmePath = assertRepoRelativePath(entry.readmePath, `${entry.id}: readmePath`);
    assert(await exists(readmePath), `${entry.id}: readmePath does not exist`);
  }

  assert(entry.compatibility && typeof entry.compatibility === "object", `${entry.id}: compatibility is required`);
  assert(SEMVER_RE.test(entry.compatibility.minAppVersion), `${entry.id}: compatibility.minAppVersion must be x.y.z`);

  assert(entry.trust === "restricted" || entry.trust === "full-access", `${entry.id}: trust must be restricted or full-access`);
  assert(Array.isArray(entry.permissions), `${entry.id}: permissions must be an array`);
  assert(Array.isArray(entry.contributions), `${entry.id}: contributions must be an array`);
  assert(entry.distribution && typeof entry.distribution === "object", `${entry.id}: distribution is required`);

  if (entry.distribution.kind === "source") {
    const pluginPath = assertRepoRelativePath(entry.distribution.path, `${entry.id}: source distribution path`);
    assert(await exists(pluginPath), `${entry.id}: source distribution path does not exist`);
  } else if (entry.distribution.kind === "release") {
    assert(isHttpsUrl(entry.distribution.packageUrl), `${entry.id}: release packageUrl must be https`);
    assert(SHA256_RE.test(entry.distribution.sha256), `${entry.id}: release sha256 must be 64 lowercase hex chars`);
  } else {
    throw new Error(`${entry.id}: distribution.kind must be source or release`);
  }

  if (entry.source?.kind === "official-source") {
    const pluginPath = assertRepoRelativePath(entry.source.path, `${entry.id}: official source path`);
    assert(await exists(pluginPath), `${entry.id}: official source path does not exist`);
    await validateOfficialPlugin(entry, pluginPath);
  }
}

async function main() {
  const files = (await fs.readdir(PLUGINS_DIR))
    .filter((file) => /\.(json|ya?ml)$/.test(file))
    .sort((a, b) => a.localeCompare(b));

  const entries = [];
  const seenIds = new Set();
  for (const file of files) {
    const entry = await readEntry(path.join(PLUGINS_DIR, file));
    await validateEntry(entry, file, seenIds);
    entries.push(entry);
  }

  const marketplace = await readJson(MARKETPLACE_FILE);
  assert(marketplace.schemaVersion === 1, "marketplace.json: schemaVersion must be 1");
  assert(Array.isArray(marketplace.plugins), "marketplace.json: plugins must be an array");
  assert(marketplace.plugins.length === entries.length, "marketplace.json: plugin count does not match plugins/*.{json,yaml,yml}");

  const entryIds = entries.map((entry) => entry.id).sort();
  const marketIds = marketplace.plugins.map((entry) => entry.id).sort();
  assert(JSON.stringify(entryIds) === JSON.stringify(marketIds), "marketplace.json: plugin ids do not match plugins/*.{json,yaml,yml}");

  console.log(`Validated ${entries.length} marketplace entries.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
