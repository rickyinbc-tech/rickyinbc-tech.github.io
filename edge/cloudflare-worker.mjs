import redirectConfig from "./redirect-map.json" with { type: "json" };

const redirects = redirectConfig.redirects;
const hostRedirects = redirectConfig.hostRedirects || {};
const forwardedHosts = new Set((redirectConfig.forwardedHosts || []).map((hostname) => hostname.toLowerCase()));
const safeQueryParameters = new Set(redirectConfig.preserveQueryParameters);
const canonicalOrigin = new URL(redirectConfig.canonicalOrigin);
const canonicalHost = canonicalOrigin.hostname.toLowerCase();
const wineHost = "wine.rickykwok.com";
const wineRepositoryOrigin = new URL("https://raw.githubusercontent.com/rickyinbc-tech/wine.rickykwok.com/main/");
const wineAssets = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/data/wine-chart.json", "data/wine-chart.json"]
]);
const passThroughHosts = new Set([
  canonicalHost,
  `www.${canonicalHost}`,
  "blog.rickykwok.com",
  "photo.rickykwok.com"
]);

const securityHeaders = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' https://formsubmit.co; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; upgrade-insecure-requests",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

const wineSecurityHeaders = {
  ...securityHeaders,
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self'; font-src 'self'; upgrade-insecure-requests"
};

function withSecurityHeaders(response, hostname = canonicalHost) {
  const headers = new Headers(response.headers);
  const selectedHeaders = hostname.toLowerCase() === wineHost ? wineSecurityHeaders : securityHeaders;
  for (const [name, value] of Object.entries(selectedHeaders)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function serveWineSite(request, requestUrl) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return withSecurityHeaders(new Response("Method not allowed", {
      status: 405,
      headers: { "content-type": "text/plain; charset=utf-8", "allow": "GET, HEAD" }
    }), wineHost);
  }

  const asset = wineAssets.get(requestUrl.pathname);
  if (!asset) {
    return withSecurityHeaders(new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    }), wineHost);
  }

  const upstreamUrl = new URL(asset, wineRepositoryOrigin);
  const upstream = await fetch(new Request(upstreamUrl, {
    method: request.method,
    headers: { "accept": request.headers.get("accept") || "*/*" }
  }));

  if (!upstream.ok) {
    return withSecurityHeaders(new Response("Wine site origin unavailable", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" }
    }), wineHost);
  }

  const headers = new Headers(upstream.headers);
  headers.set("cache-control", asset.endsWith(".json") ? "public, max-age=300" : "public, max-age=60");
  headers.set("content-type", asset.endsWith(".json") ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  return withSecurityHeaders(new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  }), wineHost);
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

function mappedDestination(requestUrl) {
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname === canonicalHost) return exactOrTrailingSlashRedirect(redirects, requestUrl.pathname);
  if (hostname === `www.${canonicalHost}`) {
    return exactOrTrailingSlashRedirect(redirects, requestUrl.pathname) || requestUrl.pathname;
  }
  if (forwardedHosts.has(hostname)) return "/";
  return exactOrTrailingSlashRedirect(hostRedirects[hostname], requestUrl.pathname);
}

export default {
  async fetch(request, env, context) {
    const requestUrl = new URL(request.url);
    const hostname = requestUrl.hostname.toLowerCase();
    if (hostname === wineHost) return serveWineSite(request, requestUrl);
    if (request.method !== "GET" && request.method !== "HEAD") return withSecurityHeaders(await fetch(request), hostname);

    const destination = mappedDestination(requestUrl);
    if (!destination) {
      if (hostname.endsWith(`.${canonicalHost}`) && !passThroughHosts.has(hostname)) {
        return withSecurityHeaders(new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }), hostname);
      }
      return withSecurityHeaders(await fetch(request), hostname);
    }

    return withSecurityHeaders(Response.redirect(redirectDestination(requestUrl, destination).toString(), redirectConfig.status), hostname);
  }
};
