import fs from "node:fs/promises";
import path from "node:path";
import { buildStudioProxyUrl } from "../lib/studio-proxy.js";

let studioProxyRouteImportCounter = 0;

export default function registerApiRoutes(app, ctx) {
  registerStudioProxyRoutesFromApi(app, ctx);

  app.get("/api/diagnostics", async (c) => {
    const runtime = requireRuntime(ctx);
    const runner = await runtime.getRunner();
    const diagnostics = await runner.diagnostics({ cwd: ctx.dataDir });
    return c.json({
      ...diagnostics,
      dataDir: ctx.dataDir,
      projects: runtime.projects.listProjects().length,
      previews: (await runtime.getPreviewManager()).list().map((preview) => withStudioUrls(preview, c, ctx)),
    });
  });

  app.get("/api/projects", (c) => {
    const runtime = requireRuntime(ctx);
    return c.json({ projects: runtime.projects.listProjects() });
  });

  app.post("/api/projects", async (c) => {
    const runtime = requireRuntime(ctx);
    const body = await readJson(c);
    const project = await runtime.projects.createProject({ title: body.title });
    return c.json({ project });
  });

  app.get("/api/projects/:projectId", (c) => {
    const runtime = requireRuntime(ctx);
    return c.json({ project: runtime.projects.getProject(c.req.param("projectId")) });
  });

  app.post("/api/projects/:projectId/preview", async (c) => {
    const runtime = requireRuntime(ctx);
    const project = runtime.projects.getProject(c.req.param("projectId"));
    const preview = await (await runtime.getPreviewManager()).start(project);
    return c.json({ preview: withStudioUrls(preview, c, ctx) });
  });

  app.delete("/api/projects/:projectId/preview", async (c) => {
    const runtime = requireRuntime(ctx);
    const stopped = (await runtime.getPreviewManager()).stop(c.req.param("projectId"));
    return c.json({ ok: true, stopped });
  });

  app.post("/api/projects/:projectId/lint", async (c) => {
    const runtime = requireRuntime(ctx);
    const project = runtime.projects.getProject(c.req.param("projectId"));
    const task = await runtime.tasks.create({ type: "lint", projectId: project.id, command: ["hyperframes", "lint", "--json"] });
    const runner = await runtime.getRunner();
    const result = await runner.run(["lint", "--json"], { cwd: project.root });
    if (result.ok) {
      await runtime.tasks.complete(task.id, { stdout: result.stdout, stderr: result.stderr });
    } else {
      await runtime.tasks.fail(task.id, result.error);
    }
    return c.json({ task: runtime.tasks.get(task.id), result }, result.ok ? 200 : 422);
  });

  app.post("/api/projects/:projectId/render", async (c) => {
    const runtime = requireRuntime(ctx);
    const project = runtime.projects.getProject(c.req.param("projectId"));
    const body = await readJson(c);
    const options = normalizeRenderOptions(body);
    const outputPath = runtime.projects.resolveProjectPath(
      project.id,
      path.join("renders", `${safeName(project.title)}-${Date.now()}.${options.format}`),
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const args = [
      "render",
      "--output",
      outputPath,
      "--format",
      options.format,
      "--fps",
      String(options.fps),
      "--quality",
      options.quality,
    ];
    const task = await runtime.tasks.create({ type: "render", projectId: project.id, command: ["hyperframes", ...args] });
    const runner = await runtime.getRunner();
    const result = await runner.run(args, { cwd: project.root });
    if (result.ok) {
      const stat = await fs.stat(outputPath).catch(() => null);
      const output = await runtime.projects.addOutput(project.id, {
        filePath: outputPath,
        label: path.basename(outputPath),
        format: options.format,
        bytes: stat?.size ?? null,
      });
      await runtime.tasks.complete(task.id, { output, stdout: result.stdout, stderr: result.stderr });
    } else {
      await runtime.tasks.fail(task.id, result.error);
    }
    return c.json({ task: runtime.tasks.get(task.id), result }, result.ok ? 200 : 422);
  });

  app.get("/api/tasks", (c) => {
    const runtime = requireRuntime(ctx);
    return c.json({ tasks: runtime.tasks.list() });
  });
}

function registerStudioProxyRoutesFromApi(app, ctx) {
  const handler = async (c) => {
    const { proxyStudioRequest } = await loadStudioProxyRouteModule();
    return proxyStudioRequest(c, ctx);
  };
  registerMethod(app, "get", "/studio-proxy/:projectId", handler);
  for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
    registerMethod(app, method, "/studio-proxy/:projectId/*", handler);
  }
  registerMethod(app, "all", "/studio-proxy/:projectId/*", handler);
}

function registerMethod(app, method, route, handler) {
  if (typeof app[method] === "function") {
    app[method](route, handler);
  }
}

let studioProxyRouteModulePromise = null;
function loadStudioProxyRouteModule() {
  if (!studioProxyRouteModulePromise) {
    const cacheKey = `${Date.now()}-${studioProxyRouteImportCounter++}`;
    studioProxyRouteModulePromise = import(`./studio-proxy.js?api=${cacheKey}`);
  }
  return studioProxyRouteModulePromise;
}

function requireRuntime(ctx) {
  if (!ctx._hyperframes) {
    throw new Error("HyperFrames plugin runtime is not initialized");
  }
  return ctx._hyperframes;
}

async function readJson(c) {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

function normalizeRenderOptions(input) {
  const format = input.format === "webm" ? "webm" : "mp4";
  const fps = [24, 30, 60].includes(Number(input.fps)) ? Number(input.fps) : 30;
  const quality = ["draft", "standard", "high"].includes(input.quality) ? input.quality : "standard";
  return { format, fps, quality };
}

function safeName(value) {
  return String(value || "video")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "video";
}

function withStudioUrls(preview, c, ctx) {
  return decorateStudioPreviewUrls(preview, {
    pluginId: ctx.pluginId,
    token: c.req.query("token") || "",
  });
}

export function decorateStudioPreviewUrls(preview, { pluginId, token }) {
  return {
    ...preview,
    rawUrl: preview.url,
    proxyUrl: buildStudioProxyUrl({
      pluginId,
      projectId: preview.projectId,
      token,
    }),
  };
}
