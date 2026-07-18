import redirectConfig from "./redirect-map.json" with { type: "json" };

const redirects = redirectConfig.redirects;
const hostRedirects = redirectConfig.hostRedirects || {};
const forwardedHosts = new Set((redirectConfig.forwardedHosts || []).map((hostname) => hostname.toLowerCase()));
const safeQueryParameters = new Set(redirectConfig.preserveQueryParameters);
const canonicalOrigin = new URL(redirectConfig.canonicalOrigin);
const canonicalHost = canonicalOrigin.hostname.toLowerCase();
const wineHost = "wine.rickykwok.com";
const wineRepositoryName = "rickyinbc-tech/wine.rickykwok.com";
const wineRepositoryOrigin = new URL(`https://raw.githubusercontent.com/${wineRepositoryName}/`);
const wineMainCommitApi = new URL(`https://api.github.com/repos/${wineRepositoryName}/commits/main`);
const wineAssets = new Map([
  ["/", { source: "index.html", contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=60" }],
  ["/zh-hant/", { source: "zh-hant/index.html", contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=60" }],
  ["/zh-hans/", { source: "zh-hans/index.html", contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=60" }],
  ["/data/wine-chart.json", { source: "data/wine-chart.json", contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=300", noIndex: true }],
  ["/robots.txt", { source: "robots.txt", contentType: "text/plain; charset=utf-8", cacheControl: "public, max-age=3600" }],
  ["/sitemap.xml", { source: "sitemap.xml", contentType: "application/xml; charset=utf-8", cacheControl: "public, max-age=3600" }],
  ["/favicon.svg", { source: "assets/favicon.svg", contentType: "image/svg+xml", cacheControl: "public, max-age=86400" }],
  ["/favicon-48.png", { source: "assets/favicon-48.png", contentType: "image/png", cacheControl: "public, max-age=86400" }],
  ["/apple-touch-icon.png", { source: "assets/apple-touch-icon.png", contentType: "image/png", cacheControl: "public, max-age=86400" }],
  ["/assets/site.css", { source: "assets/site.css", contentType: "text/css; charset=utf-8", cacheControl: "public, max-age=300" }],
  ["/assets/analytics.js", { source: "assets/analytics.js", contentType: "text/javascript; charset=utf-8", cacheControl: "public, max-age=300" }],
  ["/assets/site.js", { source: "assets/site.js", contentType: "text/javascript; charset=utf-8", cacheControl: "public, max-age=300" }],
  ["/assets/bc-wine-rank-social.jpg", { source: "assets/bc-wine-rank-social.jpg", contentType: "image/jpeg", cacheControl: "public, max-age=86400" }]
]);
const wineCanonicalRedirects = new Map([
  ["/index.html", "/"],
  ["/zh-hant", "/zh-hant/"],
  ["/zh-hant/index.html", "/zh-hant/"],
  ["/zh-hans", "/zh-hans/"],
  ["/zh-hans/index.html", "/zh-hans/"]
]);
const wineBottleImagePattern = /^\/assets\/wine-bottles\/[0-9A-Za-z_-]+\.(jpg|png|webp)$/;
const topWineHost = "top.rickykwok.com";
const topWineRawOrigin = "https://raw.githubusercontent.com/rickyinbc-tech/top.rickykwok.com/main";
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
  "content-security-policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https://www.google-analytics.com; style-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com; font-src 'self'; upgrade-insecure-requests"
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

function wineAssetForPath(pathname) {
  const fixedAsset = wineAssets.get(pathname);
  if (fixedAsset) return fixedAsset;

  const bottleMatch = pathname.match(wineBottleImagePattern);
  if (!bottleMatch) return null;
  const contentTypes = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };
  return {
    source: pathname.slice(1),
    contentType: contentTypes[bottleMatch[1]],
    cacheControl: "public, max-age=86400"
  };
}

async function resolveWineCommitSha() {
  const response = await fetch(wineMainCommitApi, {
    headers: {
      "accept": "application/vnd.github+json",
      "user-agent": "rickykwok-edge-redirects",
      "x-github-api-version": "2022-11-28"
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 300
    }
  });

  if (!response.ok) throw new Error(`GitHub commit lookup failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (!/^[0-9a-f]{40}$/.test(payload.sha || "")) throw new Error("GitHub commit lookup returned an invalid SHA");
  return payload.sha;
}

async function serveWineSite(request, requestUrl) {
  if (requestUrl.protocol !== "https:") {
    const secureUrl = new URL(requestUrl);
    secureUrl.protocol = "https:";
    return withSecurityHeaders(new Response(null, {
      status: 308,
      headers: { "location": secureUrl.toString() }
    }), wineHost);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return withSecurityHeaders(new Response("Method not allowed", {
      status: 405,
      headers: { "content-type": "text/plain; charset=utf-8", "allow": "GET, HEAD" }
    }), wineHost);
  }

  const canonicalPath = wineCanonicalRedirects.get(requestUrl.pathname);
  if (canonicalPath) {
    return withSecurityHeaders(new Response(null, {
      status: 301,
      headers: { "location": new URL(canonicalPath, requestUrl).toString() }
    }), wineHost);
  }

  const asset = wineAssetForPath(requestUrl.pathname);
  if (!asset) {
    return withSecurityHeaders(new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    }), wineHost);
  }

  let commitSha;
  let upstream;
  try {
    commitSha = await resolveWineCommitSha();
    const upstreamUrl = new URL(`${commitSha}/${asset.source}`, wineRepositoryOrigin);
    upstream = await fetch(new Request(upstreamUrl, {
      method: request.method,
      headers: { "accept": request.headers.get("accept") || "*/*" }
    }), {
      cf: {
        cacheEverything: true,
        cacheTtl: 31_536_000
      }
    });
  } catch {
    return withSecurityHeaders(new Response("Wine site origin unavailable", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" }
    }), wineHost);
  }

  if (!upstream.ok) {
    return withSecurityHeaders(new Response("Wine site origin unavailable", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" }
    }), wineHost);
  }

  const headers = new Headers(upstream.headers);
  headers.set("cache-control", asset.cacheControl);
  headers.set("content-type", asset.contentType);
  if (asset.noIndex) headers.set("x-robots-tag", "noindex");
  headers.set("x-wine-source-commit", commitSha);
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

async function fetchTopWineSite(request) {
  const requestUrl = new URL(request.url);
  const sourcePath = requestUrl.pathname.endsWith('/') ? `${requestUrl.pathname}index.html` : requestUrl.pathname;
  const upstreamUrl = new URL(`${topWineRawOrigin}${sourcePath}`);
  upstreamUrl.search = requestUrl.search;
  upstreamUrl.searchParams.set('_top_version', 'main');
  const upstream = await fetch(new Request(upstreamUrl, request));
  const headers = new Headers(upstream.headers);
  const contentTypes = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    svg: 'image/svg+xml'
  };
  const extension = sourcePath.split('.').pop().toLowerCase();
  if (contentTypes[extension]) headers.set('content-type', contentTypes[extension]);
  headers.set('cache-control', extension === 'html' ? 'no-store' : 'public, max-age=3600');
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export default {
  async fetch(request, env, context) {
    const requestUrl = new URL(request.url);
    const hostname = requestUrl.hostname.toLowerCase();
    if (hostname === wineHost) return serveWineSite(request, requestUrl);
    if (request.method !== "GET" && request.method !== "HEAD") return withSecurityHeaders(await fetch(request), hostname);
    if (hostname === topWineHost) return withSecurityHeaders(await fetchTopWineSite(request), hostname);

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
