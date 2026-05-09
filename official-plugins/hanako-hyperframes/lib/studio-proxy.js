import { appendTokenParam } from "./auth-url.js";

const STUDIO_RUNTIME_PREFIXES = [
  "/api/events",
  "/api/projects",
  "/api/render",
  "/assets",
  "/icons",
  "/preview",
  "/thumbnail",
];

export function buildStudioProxyBase({ pluginId, projectId }) {
  requireNonEmpty(pluginId, "pluginId");
  requireNonEmpty(projectId, "projectId");
  return `/api/plugins/${encodeURIComponent(pluginId)}/studio-proxy/${encodeURIComponent(projectId)}`;
}

export function buildStudioProxyUrl({ pluginId, projectId, token }) {
  return appendTokenParam(`${buildStudioProxyBase({ pluginId, projectId })}/`, token);
}

export function buildStudioHanaCssUrl({ pluginId, token }) {
  requireNonEmpty(pluginId, "pluginId");
  return appendTokenParam(`/api/plugins/${encodeURIComponent(pluginId)}/assets/studio-hana.css`, token);
}

export function rewriteStudioHtml(html, { proxyBase, token, hanaCssUrl }) {
  requireNonEmpty(proxyBase, "proxyBase");
  requireNonEmpty(hanaCssUrl, "hanaCssUrl");

  const rewrittenAssets = rewriteStudioHtmlUrls(html, { proxyBase, token });

  const bridge = `  <script>${buildStudioBridgeScript({ proxyBase, token })}</script>`;
  const css = `  <link rel="stylesheet" href="${escapeAttr(hanaCssUrl)}">`;
  const withBridge = rewrittenAssets.includes("<head>")
    ? rewrittenAssets.replace("<head>", `<head>\n${bridge}`)
    : `${bridge}\n${rewrittenAssets}`;

  return withBridge.includes("</head>")
    ? withBridge.replace("</head>", `${css}\n</head>`)
    : `${withBridge}\n${css}`;
}

export function rewriteStudioHtmlUrls(html, { proxyBase, token }) {
  requireNonEmpty(proxyBase, "proxyBase");
  return String(html).replace(/\b(src|href)="(\/[^"]+)"/g, (match, attr, urlPath) => {
    if (!shouldProxyHtmlPath(urlPath)) return match;
    const url = appendTokenParam(`${proxyBase}${urlPath}`, token);
    return `${attr}="${escapeAttr(url)}"`;
  });
}

export function buildStudioBridgeScript({ proxyBase, token }) {
  requireNonEmpty(proxyBase, "proxyBase");
  const config = safeJson({
    proxyBase: proxyBase.replace(/\/+$/g, ""),
    prefixes: STUDIO_RUNTIME_PREFIXES,
    token: String(token || ""),
  });

  return `(() => {
  const config = ${config};
  const nativeFetch = window.fetch.bind(window);
  const NativeEventSource = window.EventSource;
  const nativeSetAttribute = Element.prototype.setAttribute;

  function matchesStudioPath(path) {
    return config.prefixes.some((prefix) => (
      path === prefix ||
      path.startsWith(prefix + "/") ||
      path.startsWith(prefix + "?")
    ));
  }

  function appendToken(url) {
    if (!config.token || /[?&]token=/.test(url)) return url;
    const hashIndex = url.indexOf("#");
    const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
    const main = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
    return main + (main.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(config.token) + hash;
  }

  function normalizeStudioUrl(value) {
    if (typeof value !== "string") return value;
    if (!value || value.startsWith("#") || value.startsWith("blob:") || value.startsWith("data:")) return value;
    if (value.startsWith(config.proxyBase)) return appendToken(value);
    if (matchesStudioPath(value)) return appendToken(config.proxyBase + value);
    try {
      const parsed = new URL(value, window.location.href);
      if (parsed.origin === window.location.origin && matchesStudioPath(parsed.pathname)) {
        return appendToken(config.proxyBase + parsed.pathname + parsed.search + parsed.hash);
      }
    } catch {}
    return value;
  }

  window.__HANAKO_HYPERFRAMES_PROXY = {
    base: config.proxyBase,
    normalize: normalizeStudioUrl,
  };

  window.fetch = function hanakoHyperFramesFetch(input, init) {
    if (input instanceof Request) {
      return nativeFetch(new Request(normalizeStudioUrl(input.url), input), init);
    }
    return nativeFetch(normalizeStudioUrl(input), init);
  };

  if (typeof NativeEventSource === "function") {
    window.EventSource = class HanakoHyperFramesEventSource extends NativeEventSource {
      constructor(url, eventSourceInitDict) {
        super(normalizeStudioUrl(url), eventSourceInitDict);
      }
    };
  }

  Element.prototype.setAttribute = function hanakoHyperFramesSetAttribute(name, value) {
    const nextValue = (name === "src" || name === "href") ? normalizeStudioUrl(value) : value;
    return nativeSetAttribute.call(this, name, nextValue);
  };

  function patchUrlProperty(proto, property) {
    if (!proto) return;
    const descriptor = Object.getOwnPropertyDescriptor(proto, property);
    if (!descriptor || typeof descriptor.set !== "function") return;
    Object.defineProperty(proto, property, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        descriptor.set.call(this, normalizeStudioUrl(value));
      },
    });
  }

  patchUrlProperty(window.HTMLAnchorElement && HTMLAnchorElement.prototype, "href");
  patchUrlProperty(window.HTMLAudioElement && HTMLAudioElement.prototype, "src");
  patchUrlProperty(window.HTMLIFrameElement && HTMLIFrameElement.prototype, "src");
  patchUrlProperty(window.HTMLImageElement && HTMLImageElement.prototype, "src");
  patchUrlProperty(window.HTMLLinkElement && HTMLLinkElement.prototype, "href");
  patchUrlProperty(window.HTMLScriptElement && HTMLScriptElement.prototype, "src");
  patchUrlProperty(window.HTMLSourceElement && HTMLSourceElement.prototype, "src");
  patchUrlProperty(window.HTMLVideoElement && HTMLVideoElement.prototype, "src");
})();`;
}

function requireNonEmpty(value, name) {
  if (!String(value || "").trim()) {
    throw new Error(`Studio proxy ${name} is required`);
  }
}

function shouldProxyHtmlPath(urlPath) {
  if (urlPath.startsWith("/api/plugins/")) return false;
  if (urlPath.startsWith("/api/")) return true;
  return STUDIO_RUNTIME_PREFIXES.some((prefix) => (
    urlPath === prefix ||
    urlPath.startsWith(prefix + "/") ||
    urlPath.startsWith(prefix + "?")
  ));
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
