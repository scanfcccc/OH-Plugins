import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProjectStore } from "../lib/project-store.js";

async function makeStore() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hana-hyperframes-projects-"));
  const store = new ProjectStore({ dataDir, now: () => 1715200000000 });
  await store.init();
  return { dataDir, store };
}

test("creates a project under plugin data with explicit project identity", async () => {
  const { dataDir, store } = await makeStore();

  const project = await store.createProject({ title: "Launch Notes" });

  assert.equal(project.id, "launch-notes");
  assert.equal(project.title, "Launch Notes");
  assert.equal(project.root, path.join(dataDir, "projects", "launch-notes"));
  assert.equal(project.createdAt, 1715200000000);
  assert.equal(project.updatedAt, 1715200000000);
  assert.equal(project.outputs.length, 0);
  assert.equal(await exists(path.join(project.root, "index.html")), true);
  assert.equal(await exists(path.join(project.root, "hyperframes.json")), true);
  assert.deepEqual((await store.listProjects()).map((item) => item.id), ["launch-notes"]);
});

test("creates a HyperFrames-valid starter composition", async () => {
  const { store } = await makeStore();

  const project = await store.createProject({ title: "Playable" });
  const html = await fs.readFile(path.join(project.root, "index.html"), "utf8");

  assert.match(html, /data-composition-id="main"/);
  assert.match(html, /window\.__timelines\["main"\]/);
  assert.match(html, /gsap\.timeline\(\{ paused: true \}\)/);
  assert.doesNotMatch(html, /\[data-composition-id="main"\]/);
});

test("creates unique ids without relying on global current project state", async () => {
  const { store } = await makeStore();

  const first = await store.createProject({ title: "Launch Notes" });
  const second = await store.createProject({ title: "Launch Notes" });

  assert.equal(first.id, "launch-notes");
  assert.equal(second.id, "launch-notes-2");
  assert.equal(store.getProject("launch-notes").title, "Launch Notes");
  assert.equal(store.getProject("launch-notes-2").title, "Launch Notes");
});

test("resolves only paths inside the requested project root", async () => {
  const { store } = await makeStore();
  const project = await store.createProject({ title: "Safety" });

  assert.equal(
    store.resolveProjectPath(project.id, "assets/frame.png"),
    path.join(project.root, "assets", "frame.png"),
  );
  assert.throws(
    () => store.resolveProjectPath(project.id, "../outside.txt"),
    /Path escapes project root/,
  );
  assert.throws(
    () => store.resolveProjectPath("missing", "index.html"),
    /Unknown HyperFrames project/,
  );
});

test("records render outputs by project id", async () => {
  const { store } = await makeStore();
  const project = await store.createProject({ title: "Render Me" });
  const outputPath = store.resolveProjectPath(project.id, "renders/final.mp4");

  const output = await store.addOutput(project.id, {
    filePath: outputPath,
    label: "final.mp4",
    format: "mp4",
    bytes: 1024,
  });

  assert.equal(output.id, "out-1715200000000");
  assert.equal(output.filePath, outputPath);
  assert.equal(store.getProject(project.id).outputs[0].label, "final.mp4");
});

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
