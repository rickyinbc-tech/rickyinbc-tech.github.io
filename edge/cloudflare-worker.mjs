import redirectConfig from "./redirect-map.json" with { type: "json" };

const redirects = redirectConfig.redirects;
const hostRedirects = redirectConfig.hostRedirects || {};
const forwardedHosts = new Set((redirectConfig.forwardedHosts || []).map((hostname) => hostname.toLowerCase()));
const goneHosts = new Set((redirectConfig.goneHosts || []).map((hostname) => hostname.toLowerCase()));
const gonePathPrefixes = (redirectConfig.gonePathPrefixes || []).map((prefix) => {
  const normalized = prefix.startsWith("/") ? prefix.toLowerCase() : `/${prefix.toLowerCase()}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
});
const blockedExactPaths = new Set((redirectConfig.blockedExactPaths || []).map((pathname) => {
  const normalized = pathname.startsWith("/") ? pathname.toLowerCase() : `/${pathname.toLowerCase()}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}));
const blockedPathPrefixes = (redirectConfig.blockedPathPrefixes || []).map((prefix) => {
  const normalized = prefix.startsWith("/") ? prefix.toLowerCase() : `/${prefix.toLowerCase()}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
});
const safeQueryParameters = new Set(redirectConfig.preserveQueryParameters);
const canonicalOrigin = new URL(redirectConfig.canonicalOrigin);
const canonicalHost = canonicalOrigin.hostname.toLowerCase();
const pagesOrigin = new URL("https://rickyinbc-tech.github.io");
const passThroughHosts = new Set([
  canonicalHost,
  `www.${canonicalHost}`
]);

const securityHeaders = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data: https://*.google-analytics.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; font-src 'self'; upgrade-insecure-requests",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function withSecurityHeaders(response, requestUrl = null) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  if (
    response.ok
    && requestUrl
    && (
      /^\/assets\/optimized-v2\/.+\.(?:avif|webp)$/i.test(requestUrl.pathname)
      || (
        /^\/assets\/site\.min\.(?:css|js)$/i.test(requestUrl.pathname)
        && requestUrl.searchParams.has("v")
      )
    )
  ) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function redirectDestination(requestUrl, destination) {
  const target = new URL(destination, canonicalOrigin);
  for (const [key, value] of requestUrl.searchParams) {
    if (safeQueryParameters.has(key.toLowerCase())) target.searchParams.append(key, value);
  }
  return target;
}

function exactOrTrailingSlashRedirect(map, pathname) {
  if (!map) return null;
  if (map[pathname]) return map[pathname];
  if (pathname === "/") return null;
  const alternatePath = pathname.endsWith("/") ? pathname.slice(0, -1) : `${pathname}/`;
  return map[alternatePath] || null;
}

function canonicalIndexRedirect(pathname) {
  const match = pathname.match(/^(.*\/)index\.html$/i);
  return match ? (match[1] || "/") : null;
}

function matchesGonePath(pathname) {
  const normalizedPath = pathname.toLowerCase();
  return gonePathPrefixes.some((prefix) => (
    normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix)
  ));
}

function normalizedPathname(pathname) {
  try {
    return decodeURIComponent(pathname).toLowerCase();
  } catch {
    return pathname.toLowerCase();
  }
}

function matchesBlockedPath(pathname) {
  const normalizedPath = normalizedPathname(pathname);
  const exactPath = normalizedPath.length > 1 ? normalizedPath.replace(/\/+$/, "") : normalizedPath;
  return blockedExactPaths.has(exactPath) || blockedPathPrefixes.some((prefix) => (
    exactPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix)
  ));
}

function isGoneRequest(requestUrl) {
  const hostname = requestUrl.hostname.toLowerCase();
  if (goneHosts.has(hostname)) {
    return !exactOrTrailingSlashRedirect(hostRedirects[hostname], requestUrl.pathname);
  }
  if (hostname !== canonicalHost && hostname !== `www.${canonicalHost}`) return false;
  return matchesGonePath(requestUrl.pathname);
}

function isBlockedRequest(requestUrl) {
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname !== canonicalHost && hostname !== `www.${canonicalHost}`) return false;
  return matchesBlockedPath(requestUrl.pathname);
}

function goneResponse(method) {
  const body = method === "HEAD" ? null : "Gone";
  return withSecurityHeaders(new Response(body, {
    status: 410,
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex, nofollow"
    }
  }));
}

function notFoundResponse(method) {
  const body = method === "HEAD" ? null : "Not found";
  return withSecurityHeaders(new Response(body, {
    status: 404,
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex, nofollow"
    }
  }));
}

function mappedDestination(requestUrl) {
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname === canonicalHost) {
    return exactOrTrailingSlashRedirect(redirects, requestUrl.pathname)
      || canonicalIndexRedirect(requestUrl.pathname);
  }
  if (hostname === `www.${canonicalHost}`) {
    return exactOrTrailingSlashRedirect(redirects, requestUrl.pathname)
      || canonicalIndexRedirect(requestUrl.pathname)
      || requestUrl.pathname;
  }
  if (forwardedHosts.has(hostname)) return "/";
  return exactOrTrailingSlashRedirect(hostRedirects[hostname], requestUrl.pathname);
}

async function websiteResponse(request, env, requestUrl) {
  const originUrl = new URL(pagesOrigin);
  originUrl.pathname = requestUrl.pathname;
  originUrl.search = requestUrl.search;
  const headers = new Headers();
  // This is a public static site: don't forward visitor cookies or credentials.
  for (const name of ["accept", "accept-encoding", "if-none-match", "if-modified-since", "range", "if-range"]) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  let response;
  try {
    response = await fetch(new Request(originUrl, { method: request.method, headers }), {
      redirect: "manual",
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    if (!env?.FALLBACK_ASSETS) throw error;
  }
  const location = response?.headers.get("location");
  const target = location ? new URL(location, originUrl) : null;
  // A cached custom-domain redirect must not loop while Pages updates its config.
  const loopsToPublicSite = target?.hostname === canonicalHost || target?.hostname === `www.${canonicalHost}`;
  if ((!response || response.status >= 500 || loopsToPublicSite) && env?.FALLBACK_ASSETS) {
    response = await env.FALLBACK_ASSETS.fetch(request);
    const fallbackHeaders = new Headers(response.headers);
    fallbackHeaders.set("x-site-source", "cloudflare-backup");
    fallbackHeaders.set("cache-control", "no-store");
    return withSecurityHeaders(new Response(response.body, { status: response.status, headers: fallbackHeaders }), requestUrl);
  }
  const publicHeaders = new Headers(response.headers);
  publicHeaders.set("x-site-source", "github-pages");
  if (target?.hostname === pagesOrigin.hostname) {
    target.protocol = canonicalOrigin.protocol;
    target.host = canonicalOrigin.host;
    publicHeaders.set("location", target.toString());
  }
  return withSecurityHeaders(new Response(response.body, { status: response.status, statusText: response.statusText, headers: publicHeaders }), requestUrl);
}

export default {
  async fetch(request, env, context) {
    const requestUrl = new URL(request.url);
    const hostname = requestUrl.hostname.toLowerCase();
    if (isGoneRequest(requestUrl)) return goneResponse(request.method);
    if (isBlockedRequest(requestUrl)) return notFoundResponse(request.method);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return withSecurityHeaders(new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } }));
    }

    const destination = mappedDestination(requestUrl)
      || (hostname === canonicalHost && requestUrl.protocol === "http:" ? requestUrl.pathname : null);
    if (!destination) {
      if (hostname.endsWith(`.${canonicalHost}`) && !passThroughHosts.has(hostname)) {
        return withSecurityHeaders(new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }), requestUrl);
      }
      return websiteResponse(request, env, requestUrl);
    }

    return withSecurityHeaders(Response.redirect(redirectDestination(requestUrl, destination).toString(), redirectConfig.status), requestUrl);
  }
};
