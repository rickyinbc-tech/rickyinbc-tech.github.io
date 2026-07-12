import redirectConfig from "./redirect-map.json" with { type: "json" };

const redirects = redirectConfig.redirects;
const hostRedirects = redirectConfig.hostRedirects || {};
const forwardedHosts = new Set((redirectConfig.forwardedHosts || []).map((hostname) => hostname.toLowerCase()));
const safeQueryParameters = new Set(redirectConfig.preserveQueryParameters);
const canonicalOrigin = new URL(redirectConfig.canonicalOrigin);
const canonicalHost = canonicalOrigin.hostname.toLowerCase();
const passThroughHosts = new Set([
  canonicalHost,
  `www.${canonicalHost}`,
  "blog.rickykwok.com",
  "photo.rickykwok.com"
]);

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
    if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);

    const destination = mappedDestination(requestUrl);
    if (!destination) {
      if (requestUrl.hostname.toLowerCase().endsWith(`.${canonicalHost}`) && !passThroughHosts.has(requestUrl.hostname.toLowerCase())) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
      return fetch(request);
    }

    return Response.redirect(redirectDestination(requestUrl, destination).toString(), redirectConfig.status);
  }
};
