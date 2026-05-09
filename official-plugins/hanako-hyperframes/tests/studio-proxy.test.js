import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudioBridgeScript,
  buildStudioProxyUrl,
  rewriteStudioHtml,
  rewriteStudioHtmlUrls,
} from "../lib/studio-proxy.js";
import registerApiRoutes, { decorateStudioPreviewUrls } from "../routes/api.js";
import { isStudioShellResponse, resolveStudioProxyTargetPath } from "../routes/studio-proxy.js";

test("builds tokenized Studio proxy URLs under the plugin route", () => {
  const url = buildStudioProxyUrl({
    pluginId: "hanako-hyperframes",
    projectId: "starlight wander",
    token: "abc 123",
  });

  assert.equal(
    url,
    "/api/plugins/hanako-hyperframes/studio-proxy/starlight%20wander/?token=abc+123",
  );
});

test("keeps the original Studio URL as the primary iframe target", () => {
  const preview = decorateStudioPreviewUrls(
    {
      projectId: "starlight-wander",
      url: "http://127.0.0.1:45678/#project/starlight-wander",
      status: "running",
      error: null,
    },
    {
      pluginId: "hanako-hyperframes",
      token: "abc123",
    },
  );

  assert.equal(preview.url, "http://127.0.0.1:45678/#project/starlight-wander");
  assert.equal(preview.rawUrl, "http://127.0.0.1:45678/#project/starlight-wander");
  assert.equal(
    preview.proxyUrl,
    "/api/plugins/hanako-hyperframes/studio-proxy/starlight-wander/?token=abc123",
  );
});

test("registers Studio proxy routes from the API route entrypoint", () => {
  const routes = new Set();
  const app = fakeRouteApp(routes);

  registerApiRoutes(app, {
    pluginId: "hanako-hyperframes",
    _hyperframes: {},
  });

  assert.ok(routes.has("get /studio-proxy/:projectId"));
  assert.ok(routes.has("get /studio-proxy/:projectId/*"));
});

test("rewrites original Studio asset URLs and injects Hana theme assets", () => {
  const html = `<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/assets/index.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

  const rewritten = rewriteStudioHtml(html, {
    proxyBase: "/api/plugins/hanako-hyperframes/studio-proxy/demo",
    token: "abc123",
    hanaCssUrl: "/api/plugins/hanako-hyperframes/assets/studio-hana.css?token=abc123",
  });

  assert.match(
    rewritten,
    /src="\/api\/plugins\/hanako-hyperframes\/studio-proxy\/demo\/assets\/index\.js\?token=abc123"/,
  );
  assert.match(
    rewritten,
    /href="\/api\/plugins\/hanako-hyperframes\/studio-proxy\/demo\/assets\/index\.css\?token=abc123"/,
  );
  assert.match(
    rewritten,
    /href="\/api\/plugins\/hanako-hyperframes\/assets\/studio-hana\.css\?token=abc123"/,
  );
  assert.ok(rewritten.indexOf("window.__HANAKO_HYPERFRAMES_PROXY") < rewritten.indexOf("src="));
});

test("bridge script proxies original Studio absolute runtime paths", () => {
  const script = buildStudioBridgeScript({
    proxyBase: "/api/plugins/hanako-hyperframes/studio-proxy/demo",
    token: "abc123",
  });

  assert.match(script, /\/api\/projects/);
  assert.match(script, /\/preview/);
  assert.match(script, /\/thumbnail/);
  assert.match(script, /EventSource/);
  assert.match(script, /setAttribute/);
  assert.match(script, /token/);
});

test("rewrites composition runtime URLs without injecting Studio UI chrome", () => {
  const html = `<!doctype html>
<html>
  <head>
    <base href="/api/projects/demo/preview/">
    <script data-hyperframes-preview-runtime="1" src="/api/runtime.js"></script>
    <link rel="stylesheet" href="/api/plugins/hanako-hyperframes/assets/studio-hana.css?token=abc123">
  </head>
</html>`;

  const rewritten = rewriteStudioHtmlUrls(html, {
    proxyBase: "/api/plugins/hanako-hyperframes/studio-proxy/demo",
    token: "abc123",
  });

  assert.match(
    rewritten,
    /href="\/api\/plugins\/hanako-hyperframes\/studio-proxy\/demo\/api\/projects\/demo\/preview\/\?token=abc123"/,
  );
  assert.match(
    rewritten,
    /src="\/api\/plugins\/hanako-hyperframes\/studio-proxy\/demo\/api\/runtime\.js\?token=abc123"/,
  );
  assert.match(
    rewritten,
    /href="\/api\/plugins\/hanako-hyperframes\/assets\/studio-hana\.css\?token=abc123"/,
  );
  assert.doesNotMatch(rewritten, /__HANAKO_HYPERFRAMES_PROXY/);
});

test("resolves proxied Studio asset paths when Hono wildcard params are empty", () => {
  assert.equal(
    resolveStudioProxyTargetPath({
      wildcard: "",
      pathname: "/studio-proxy/starlight-wander/assets/index.js",
      projectId: "starlight-wander",
    }),
    "/assets/index.js",
  );
  assert.equal(
    resolveStudioProxyTargetPath({
      wildcard: "api/projects",
      pathname: "/studio-proxy/starlight-wander/api/projects",
      projectId: "starlight-wander",
    }),
    "/api/projects",
  );
  assert.equal(
    resolveStudioProxyTargetPath({
      wildcard: "/api/plugins/hanako-hyperframes/studio-proxy/starlight-wander/api/runtime.js",
      pathname: "/studio-proxy/starlight-wander/api/runtime.js",
      projectId: "starlight-wander",
    }),
    "/api/runtime.js",
  );
  assert.equal(
    resolveStudioProxyTargetPath({
      wildcard: "/api/plugins/hanako-hyperframes/studio-proxy/starlight-wander/",
      pathname: "/studio-proxy/starlight-wander/",
      projectId: "starlight-wander",
    }),
    "/",
  );
});

test("injects Hana styles only into the Studio shell HTML", () => {
  assert.equal(isStudioShellResponse("text/html; charset=utf-8", "/"), true);
  assert.equal(isStudioShellResponse("text/html; charset=utf-8", "/index.html"), true);
  assert.equal(
    isStudioShellResponse("text/html; charset=utf-8", "/api/projects/demo/preview/comp/index.html"),
    false,
  );
  assert.equal(isStudioShellResponse("text/css", "/assets/index.css"), false);
});

function fakeRouteApp(routes) {
  const app = {};
  for (const method of ["get", "post", "put", "patch", "delete", "options", "head", "all"]) {
    app[method] = (route) => {
      routes.add(`${method} ${route}`);
    };
  }
  return app;
}
