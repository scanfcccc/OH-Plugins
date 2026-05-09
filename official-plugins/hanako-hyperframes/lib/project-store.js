import fs from "node:fs/promises";
import path from "node:path";

export class ProjectStore {
  constructor({ dataDir, now = () => Date.now() }) {
    if (!dataDir) throw new Error("ProjectStore requires dataDir");
    this.dataDir = path.resolve(dataDir);
    this.projectsDir = path.join(this.dataDir, "projects");
    this.indexPath = path.join(this.dataDir, "projects.json");
    this.now = now;
    this.projects = new Map();
  }

  async init() {
    await fs.mkdir(this.projectsDir, { recursive: true });
    await this.#load();
  }

  listProjects() {
    return Array.from(this.projects.values())
      .map(cloneProject)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
  }

  getProject(projectId) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Unknown HyperFrames project: ${projectId}`);
    }
    return cloneProject(project);
  }

  async createProject({ title, slug } = {}) {
    const cleanTitle = normalizeTitle(title);
    const id = this.#uniqueId(slug || cleanTitle);
    const now = this.now();
    const root = path.join(this.projectsDir, id);
    const project = {
      id,
      title: cleanTitle,
      root,
      createdAt: now,
      updatedAt: now,
      outputs: [],
    };

    await fs.mkdir(path.join(root, "assets"), { recursive: true });
    await fs.mkdir(path.join(root, "compositions"), { recursive: true });
    await fs.mkdir(path.join(root, "renders"), { recursive: true });
    await writeFileIfMissing(path.join(root, "index.html"), demoIndexHtml(cleanTitle));
    await writeFileIfMissing(path.join(root, "hyperframes.json"), `${JSON.stringify(defaultHyperframesConfig(), null, 2)}\n`);

    this.projects.set(id, project);
    await this.#save();
    return cloneProject(project);
  }

  resolveProjectPath(projectId, requestedPath = ".") {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Unknown HyperFrames project: ${projectId}`);
    }
    if (typeof requestedPath !== "string" || requestedPath.length === 0) {
      throw new Error("Project path must be a non-empty string");
    }
    const resolved = path.resolve(project.root, requestedPath);
    const relative = path.relative(project.root, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path escapes project root: ${requestedPath}`);
    }
    return resolved;
  }

  async addOutput(projectId, output) {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Unknown HyperFrames project: ${projectId}`);
    }
    const filePath = output?.filePath;
    if (typeof filePath !== "string" || !filePath) {
      throw new Error("Render output requires filePath");
    }
    const relative = path.relative(project.root, path.resolve(filePath));
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Output escapes project root: ${filePath}`);
    }

    const now = this.now();
    const record = {
      id: nextOutputId(project.outputs, now),
      filePath: path.resolve(filePath),
      label: output.label || path.basename(filePath),
      format: output.format || path.extname(filePath).slice(1) || "mp4",
      bytes: Number.isFinite(output.bytes) ? output.bytes : null,
      createdAt: now,
    };
    project.outputs.unshift(record);
    project.updatedAt = now;
    await this.#save();
    return { ...record };
  }

  async #load() {
    try {
      const data = JSON.parse(await fs.readFile(this.indexPath, "utf8"));
      const projects = Array.isArray(data.projects) ? data.projects : [];
      this.projects = new Map(projects.map((project) => [project.id, normalizeProject(project, this.projectsDir)]));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.projects = new Map();
      await this.#save();
    }
  }

  async #save() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const payload = { schemaVersion: 1, projects: this.listProjects() };
    await fs.writeFile(this.indexPath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  #uniqueId(seed) {
    const base = slugify(seed);
    if (!this.projects.has(base)) return base;
    for (let i = 2; i < 10000; i += 1) {
      const candidate = `${base}-${i}`;
      if (!this.projects.has(candidate)) return candidate;
    }
    throw new Error(`Unable to create unique project id for ${seed}`);
  }
}

function normalizeTitle(title) {
  const value = typeof title === "string" ? title.trim() : "";
  return value || "Untitled Video";
}

function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled-video";
}

function normalizeProject(project, projectsDir) {
  if (!project?.id) throw new Error("Project metadata entry is missing id");
  const id = slugify(project.id);
  return {
    id,
    title: normalizeTitle(project.title),
    root: path.join(projectsDir, id),
    createdAt: Number(project.createdAt) || Date.now(),
    updatedAt: Number(project.updatedAt) || Number(project.createdAt) || Date.now(),
    outputs: Array.isArray(project.outputs) ? project.outputs.map((item) => ({ ...item })) : [],
  };
}

function cloneProject(project) {
  return {
    ...project,
    outputs: project.outputs.map((item) => ({ ...item })),
  };
}

function nextOutputId(outputs, now) {
  const base = `out-${now}`;
  if (!outputs.some((item) => item.id === base)) return base;
  let index = 2;
  while (outputs.some((item) => item.id === `${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

async function writeFileIfMissing(filePath, content) {
  try {
    await fs.writeFile(filePath, content, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

function defaultHyperframesConfig() {
  return {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    paths: {
      blocks: "compositions",
      components: "compositions/components",
      assets: "assets",
    },
  };
}

function demoIndexHtml(title) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1920, height=1080">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #f7f1e8; }
    body { color: #2f2a24; font-family: "Songti SC", Georgia, serif; }
    #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #f7f1e8; }
    #root::before {
      content: "";
      position: absolute;
      inset: 0;
      opacity: 0.42;
      background:
        linear-gradient(rgba(47, 42, 36, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(47, 42, 36, 0.045) 1px, transparent 1px);
      background-size: 48px 48px;
    }
    .scene { position: absolute; inset: 0; display: grid; place-items: center; padding: 120px; box-sizing: border-box; }
    .scene > div { position: relative; z-index: 1; }
    .title { max-width: 1200px; font-size: 96px; line-height: 1.05; font-weight: 600; text-align: center; }
    .caption { margin-top: 28px; font-size: 32px; color: rgba(47, 42, 36, 0.66); text-align: center; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="8" data-width="1920" data-height="1080">
    <section id="intro" class="clip scene" data-start="0" data-duration="4" data-track-index="0">
      <div>
        <div class="title">${escapeHtml(title)}</div>
        <div class="caption">A Hanako HyperFrames project</div>
      </div>
    </section>
    <section id="outro" class="clip scene" data-start="4" data-duration="4" data-track-index="0">
      <div>
        <div class="title">Preview, refine, render.</div>
        <div class="caption">HTML stays the source of truth.</div>
      </div>
    </section>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.from("#intro .title", { opacity: 0.12, y: 18, duration: 0.8, ease: "power2.out" }, 0);
    tl.from("#intro .caption", { opacity: 0, y: 18, duration: 0.7, ease: "power2.out" }, 0.55);
    tl.to("#intro", { opacity: 0, duration: 0.55, ease: "power1.inOut" }, 3.45);
    tl.set("#intro", { opacity: 0 }, 4.0);
    tl.from("#outro .title", { opacity: 0, y: 24, duration: 0.8, ease: "power2.out" }, 4.2);
    tl.from("#outro .caption", { opacity: 0, y: 18, duration: 0.7, ease: "power2.out" }, 4.55);
    tl.to("#outro", { opacity: 0, duration: 0.6, ease: "power1.inOut" }, 7.35);
    tl.set("#outro", { opacity: 0 }, 8.0);
    window.__timelines["main"] = tl;
  </script>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
