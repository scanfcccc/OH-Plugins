const REGISTERED_APPS = new WeakSet();
let studioProxyLibImportCounter = 0;
let studioProxyLibPromise = null;

export default function registerStudioProxyRoutes(app, ctx) {
  if (REGISTERED_APPS.has(app)) return;
  REGISTERED_APPS.add(app);

  const handler = (c) => proxyStudioRequest(c, ctx);
  registerMethod(app, "get", "/studio-proxy/:projectId", handler);
  for (const method of ["get", "post", "put", "patch", "delete", "options", "head"]) {
    registerMethod(app, method, "/studio-proxy/:projectId/*", handler);
  }
  if (typeof app.all === "function") {
    app.all("/studio-proxy/:projectId/*", handler);
  }
}

export async function proxyStudioRequest(c, ctx) {
  const {
    buildStudioHanaCssUrl,
    buildStudioProxyBase,
    rewriteStudioHtml,
    rewriteStudioHtmlUrls,
  } = await loadStudioProxyLib();
  const runtime = requireRuntime(ctx);
  const projectId = c.req.param("projectId");
  const manager = await runtime.getPreviewManager();
  const session = manager.list().find((item) => item.projectId === projectId) || null;
  if (!session || session.exited || session.status === "failed" || session.status === "stopped") {
    return c.text("HyperFrames Studio preview is not running", 409);
  }

  const requestUrl = new URL(c.req.raw.url, "http://hanako.local");
  const token = requestUrl.searchParams.get("token") || "";
  requestUrl.searchParams.delete("token");
  const targetPath = getTargetPath(c, projectId);
  const upstreamUrl = `http://127.0.0.1:${session.port}${targetPath}${requestUrl.search}`;
  const requestInit = {
    method: c.req.raw.method,
    headers: forwardRequestHeaders(c.req.raw.headers),
    body: await forwardRequestBody(c.req.raw),
    redirect: "manual",
  };
  const upstream = await fetchUpstream(upstreamUrl, requestInit).catch((error) => {
    return nullResponse(`HyperFrames Studio preview is not reachable: ${error.message}`, 502);
  });
  if (upstream instanceof Response && upstream.headers.get("x-hanako-proxy-error") === "1") {
    return upstream;
  }

  const headers = forwardResponseHeaders(upstream.headers);
  const contentType = upstream.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const proxyBase = buildStudioProxyBase({ pluginId: ctx.pluginId, projectId });
    const html = await upstream.text();
    const body = isStudioShellResponse(contentType, targetPath)
      ? rewriteStudioHtml(html, {
          proxyBase,
          token,
          hanaCssUrl: buildStudioHanaCssUrl({ pluginId: ctx.pluginId, token }),
        })
      : rewriteStudioHtmlUrls(html, { proxyBase, token });
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function loadStudioProxyLib() {
  if (!studioProxyLibPromise) {
    const cacheKey = `${Date.now()}-${studioProxyLibImportCounter++}`;
    studioProxyLibPromise = import(`../lib/studio-proxy.js?route=${cacheKey}`);
  }
  return studioProxyLibPromise;
}

function registerMethod(app, method, route, handler) {
  if (typeof app[method] === "function") {
    app[method](route, handler);
  }
}

function requireRuntime(ctx) {
  if (!ctx._hyperframes) {
    throw new Error("HyperFrames plugin runtime is not initialized");
  }
  return ctx._hyperframes;
}

function getTargetPath(c, projectId) {
  return resolveStudioProxyTargetPath({
    wildcard: c.req.param("*") || "",
    pathname: new URL(c.req.raw.url, "http://hanako.local").pathname,
    projectId,
  });
}

export function resolveStudioProxyTargetPath({ wildcard = "", pathname = "", projectId }) {
  const wildcardPath = normalizePath(wildcard);
  const fromWildcard = resolveTargetPathCandidate(wildcardPath, projectId, { allowBare: true });
  if (fromWildcard) return fromWildcard;

  const fromPathname = resolveTargetPathCandidate(normalizePath(pathname), projectId, { allowBare: false });
  if (fromPathname) return fromPathname;

  return "/";
}

function resolveTargetPathCandidate(candidate, projectId, { allowBare }) {
  if (!candidate || candidate === "/") return "";
  for (const marker of [`/studio-proxy/${encodeURIComponent(projectId)}`, `/studio-proxy/${projectId}`]) {
    const markerIndex = candidate.indexOf(marker);
    if (markerIndex < 0) continue;
    const suffix = candidate.slice(markerIndex + marker.length);
    if (!suffix || suffix === "/") return "/";
    return suffix.startsWith("/") ? suffix : `/${suffix}`;
  }
  if (!allowBare || candidate.startsWith("/api/plugins/")) return "";
  return candidate;
}

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return `/${raw.replace(/^\/+/, "")}`;
}

function forwardRequestHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of source.entries()) {
    const key = name.toLowerCase();
    if (["accept-encoding", "connection", "content-length", "host"].includes(key)) continue;
    headers.set(name, value);
  }
  return headers;
}

async function forwardRequestBody(request) {
  if (["GET", "HEAD"].includes(request.method.toUpperCase())) return undefined;
  return await request.arrayBuffer();
}

function forwardResponseHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of source.entries()) {
    const key = name.toLowerCase();
    if (["content-encoding", "content-length", "connection", "transfer-encoding"].includes(key)) continue;
    headers.set(name, value);
  }
  return headers;
}

export function isStudioShellResponse(contentType, targetPath) {
  return contentType.includes("text/html") && (targetPath === "/" || targetPath === "/index.html");
}

async function fetchUpstream(url, init) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await delay(120 + attempt * 80);
    }
  }
  throw lastError || new Error("unknown upstream error");
}

function nullResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-hanako-proxy-error": "1",
    },
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
