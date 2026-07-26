import redirectConfig from "./redirect-map.json" with { type: "json" };

const redirects = redirectConfig.redirects;
const hostRedirects = redirectConfig.hostRedirects || {};
const forwardedHosts = new Set((redirectConfig.forwardedHosts || []).map((hostname) => hostname.toLowerCase()));
const goneHosts = new Set((redirectConfig.goneHosts || []).map((hostname) => hostname.toLowerCase()));
const gonePathPrefixes = (redirectConfig.gonePathPrefixes || []).map((prefix) => {
  const normalized = prefix.startsWith("/") ? prefix.toLowerCase() : `/${prefix.toLowerCase()}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
});
const safeQueryParameters = new Set(redirectConfig.preserveQueryParameters);
const canonicalOrigin = new URL(redirectConfig.canonicalOrigin);
const canonicalHost = canonicalOrigin.hostname.toLowerCase();
const passThroughHosts = new Set([
  canonicalHost,
  `www.${canonicalHost}`,
  "photo.rickykwok.com"
]);

const securityHeaders = {
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; upgrade-insecure-requests",
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

function matchesGonePath(pathname) {
  const normalizedPath = pathname.toLowerCase();
  return gonePathPrefixes.some((prefix) => (
    normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix)
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
    if (isGoneRequest(requestUrl)) return goneResponse(request.method);
    if (request.method !== "GET" && request.method !== "HEAD") return withSecurityHeaders(await fetch(request), requestUrl);

    const destination = mappedDestination(requestUrl);
    if (!destination) {
      if (hostname.endsWith(`.${canonicalHost}`) && !passThroughHosts.has(hostname)) {
        return withSecurityHeaders(new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }), requestUrl);
      }
      return withSecurityHeaders(await fetch(request), requestUrl);
    }

    return withSecurityHeaders(Response.redirect(redirectDestination(requestUrl, destination).toString(), redirectConfig.status), requestUrl);
  }
};
