import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS_DIR = path.join(ROOT, "plugins");
const OUT_FILE = path.join(ROOT, "marketplace.json");

async function readEntry(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  if (filePath.endsWith(".json")) return JSON.parse(text);
  return yaml.load(text);
}

async function main() {
  const files = (await fs.readdir(PLUGINS_DIR))
    .filter((file) => /\.(json|ya?ml)$/.test(file))
    .sort((a, b) => a.localeCompare(b));

  const plugins = [];
  for (const file of files) {
    plugins.push(await readEntry(path.join(PLUGINS_DIR, file)));
  }

  plugins.sort((a, b) => a.id.localeCompare(b.id));

  const index = {
    schemaVersion: 1,
    plugins,
  };

  await fs.writeFile(OUT_FILE, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} with ${plugins.length} plugin entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
