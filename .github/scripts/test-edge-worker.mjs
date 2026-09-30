import worker from "../../edge/cloudflare-worker.mjs";

const originRequests = [];
globalThis.fetch = async (request, options) => {
  originRequests.push({ request, options });
  return new Response(`origin:${new URL(request.url).pathname}`, {
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" }
});
};

const checks = [];

function check(condition, message) {
  if (!condition) checks.push(message);
}

const canonical = await worker.fetch(new Request("https://rickykwok.com/"));
check(canonical.status === 200, "canonical origin must pass through");
check(originRequests.at(-1).request.url === "https://rickyinbc-tech.github.io/", "origin must use GitHub's managed HTTPS hostname");
check(originRequests.at(-1).options.redirect === "manual", "origin redirects must never be followed into a loop");
const httpHomepage = await worker.fetch(new Request("http://rickykwok.com/"));
check(httpHomepage.status === 308 && httpHomepage.headers.get("location") === "https://rickykwok.com/", "public HTTP must upgrade directly to HTTPS");
await worker.fetch(new Request("https://rickykwok.com/biography/?page=2", { headers: { cookie: "private=test", authorization: "Bearer private", range: "bytes=0-99" } }));
const publicOriginRequest = originRequests.at(-1).request;
check(publicOriginRequest.url === "https://rickyinbc-tech.github.io/biography/?page=2", "origin must preserve the requested public path and query");
check(!publicOriginRequest.headers.has("cookie") && !publicOriginRequest.headers.has("authorization"), "visitor credentials must not reach the public GitHub origin");
check(publicOriginRequest.headers.get("range") === "bytes=0-99", "origin must preserve range requests");
await worker.fetch(new Request("https://rickykwok.com//untrusted.example/path"));
check(originRequests.at(-1).request.url === "https://rickyinbc-tech.github.io//untrusted.example/path", "a double-slash path must never change the fixed origin hostname");
for (const header of ["content-security-policy", "permissions-policy", "referrer-policy", "strict-transport-security", "x-content-type-options", "x-frame-options"]) {
  check(Boolean(canonical.headers.get(header)), `canonical response lacks ${header}`);
}
const contentSecurityPolicy = canonical.headers.get("content-security-policy") || "";
for (const analyticsOrigin of [
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
]) {
  check(contentSecurityPolicy.includes(analyticsOrigin), `content security policy blocks consented analytics origin ${analyticsOrigin}`);
}
for (const advertisingOrigin of ["doubleclick.net", "googlesyndication.com", "googleadservices.com"]) {
  check(!contentSecurityPolicy.includes(advertisingOrigin), `content security policy must not enable advertising origin ${advertisingOrigin}`);
}
const versionedCss = await worker.fetch(new Request("https://rickykwok.com/assets/site.min.css?v=20260726-editorial-refresh-v1"));
check(versionedCss.headers.get("cache-control") === "public, max-age=31536000, immutable", "versioned production CSS must use immutable browser caching");
const optimizedImage = await worker.fetch(new Request("https://rickykwok.com/assets/optimized-v2/art/light-encroached-homes-800.webp"));
check(optimizedImage.headers.get("cache-control") === "public, max-age=31536000, immutable", "optimized images must use immutable browser caching");
check(canonical.headers.get("cache-control") !== "public, max-age=31536000, immutable", "HTML must not use immutable browser caching");

const legacy = await worker.fetch(new Request("https://rickykwok.com/series/water-studies/?utm_source=a&private=b"));
check(legacy.status === 308, "legacy route must redirect permanently");
check(legacy.headers.get("location") === "https://rickykwok.com/series/collision/", "redirect must discard query parameters");

for (const [source, destination] of [
  ["https://rickykwok.com/index.html", "https://rickykwok.com/"],
  ["https://rickykwok.com/biography/index.html", "https://rickykwok.com/biography/"],
  ["https://www.rickykwok.com/index.html", "https://rickykwok.com/"],
  ["https://www.rickykwok.com/zh-hant/works/index.html", "https://rickykwok.com/zh-hant/works/"]
]) {
  const response = await worker.fetch(new Request(source));
  check(response.status === 308, `${source} must redirect permanently to its canonical clean URL`);
  check(response.headers.get("location") === destination, `${source} must redirect directly to ${destination}`);
}

const gonePaths = [
  "/contact/",
  "/contact/thanks/",
  "/prints/",
  "/available-prints/",
  "/editions/",
  "/licensing/",
  "/shipping-returns/",
  "/studio-standards/",
  "/terms/",
  "/privacy/",
  "/press/",
  "/press/media-kit/",
  "/zh-hant/contact/",
  "/zh-hant/prints/archive/",
  "/zh-hant/editions/",
  "/zh-hant/licensing/",
  "/zh-hant/shipping-returns/",
  "/zh-hant/studio-standards/",
  "/zh-hant/terms/",
  "/zh-hant/privacy/",
  "/zh-hant/press/cv/",
  "/zh-hans/contact/",
  "/zh-hans/prints/archive/",
  "/zh-hans/editions/",
  "/zh-hans/licensing/",
  "/zh-hans/shipping-returns/",
  "/zh-hans/studio-standards/",
  "/zh-hans/terms/",
  "/zh-hans/privacy/",
  "/zh-hans/press/cv/"
];

for (const path of gonePaths) {
  for (const hostname of ["rickykwok.com", "www.rickykwok.com"]) {
    const response = await worker.fetch(new Request(`https://${hostname}${path}?utm_source=stale-index`));
    check(response.status === 410, `${hostname}${path} must return 410 Gone`);
    check(response.headers.get("location") === null, `${hostname}${path} must not redirect`);
    check(response.headers.get("x-robots-tag") === "noindex, nofollow", `${hostname}${path} must carry a noindex header`);
  }
}

const blockedSourcePaths = [
  "/package.json",
  "/package-lock.json",
  "/assets/site.css",
  "/assets/site.js",
  "/edge/redirect-map.json",
  "/.github/scripts/validate-site.mjs",
  "/.git/config",
  "/node_modules/example/index.js",
  "/_site/index.html",
  "/seo-status/index.html"
];

for (const path of blockedSourcePaths) {
  for (const hostname of ["rickykwok.com", "www.rickykwok.com"]) {
    const response = await worker.fetch(new Request(`https://${hostname}${path}`));
    check(response.status === 404, `${hostname}${path} must fail closed`);
    check(response.headers.get("location") === null, `${hostname}${path} must not redirect`);
    check(response.headers.get("x-robots-tag") === "noindex, nofollow", `${hostname}${path} must carry a noindex header`);
  }
}

for (const path of ["/", "/feed", "/feed/"]) {
  const response = await worker.fetch(new Request(`https://blog.rickykwok.com${path}`));
  check(response.status === 308, `blog.rickykwok.com${path} must preserve the established journal redirect`);
  check(response.headers.get("location") === "https://rickykwok.com/journal/", `blog.rickykwok.com${path} must redirect directly to the journal`);
}

for (const path of ["/unverified-legacy-path/", "/old-post/"]) {
  const response = await worker.fetch(new Request(`https://blog.rickykwok.com${path}`));
  check(response.status === 410, `blog.rickykwok.com${path} must remain permanently gone`);
  check(response.headers.get("location") === null, `blog.rickykwok.com${path} must not redirect into the photography site`);
}

const selectRoot = await worker.fetch(new Request("https://select.rickykwok.com/"));
check(selectRoot.status === 308, "select.rickykwok.com/ must redirect to the canonical homepage");
check(selectRoot.headers.get("location") === "https://rickykwok.com/", "select.rickykwok.com/ must consolidate into the canonical homepage");

for (const path of ["/feed", "/unverified-legacy-path/"]) {
  const response = await worker.fetch(new Request(`https://select.rickykwok.com${path}`));
  check(response.status === 410, `select.rickykwok.com${path} must remain permanently gone`);
  check(response.headers.get("location") === null, `select.rickykwok.com${path} must not redirect into the photography site`);
}

const headGone = await worker.fetch(new Request("https://rickykwok.com/contact", { method: "HEAD" }));
check(headGone.status === 410, "retired routes without trailing slashes must return 410");
check((await headGone.text()) === "", "HEAD responses for retired routes must not include a body");

const unknown = await worker.fetch(new Request("https://unknown.rickykwok.com/"));
check(unknown.status === 404, "unknown proxied subdomain must fail closed");

for (const path of ["/financial-advice/", "/investments/", "/mortgages/"]) {
  const response = await worker.fetch(new Request(`https://rickykwok.com${path}`));
  check(response.status < 300 || response.status >= 400, `${path} must never redirect into the photography site`);
  check(response.headers.get("location") === null, `${path} must not receive a photography-site destination`);
}

for (const hostname of ["portfolio.rickykwok.com", "mortgage.rickykwok.com", "wine.rickykwok.com", "top.rickykwok.com"]) {
  const response = await worker.fetch(new Request(`https://${hostname}/`));
  check(response.status === 404, `${hostname} must remain disabled`);
  check(response.headers.get("location") === null, `${hostname} must not redirect into the photography site`);
}

const photoRoot = await worker.fetch(new Request("https://photo.rickykwok.com/"));
check(photoRoot.status === 308, "the verified photo hostname root redirect must remain intact");
check(photoRoot.headers.get("location") === "https://rickykwok.com/", "the photo hostname root must retain its canonical destination");

const unknownPhotoPath = await worker.fetch(new Request("https://photo.rickykwok.com/unverified-legacy-path/"));
check(unknownPhotoPath.status === 410, "unverified photo paths must be permanently gone");
check(unknownPhotoPath.headers.get("location") === null, "unverified photo paths must not be wildcard redirected");
check(unknownPhotoPath.headers.get("x-robots-tag") === "noindex, nofollow", "unverified photo paths must carry a noindex header");

const normalFetch = globalThis.fetch;
let fallbackCalls = 0;
const fallbackEnv = { FALLBACK_ASSETS: { async fetch(request) {
  fallbackCalls++;
  return new Response(request.method === "HEAD" ? null : "validated-public-backup", { status: 200 });
} } };
globalThis.fetch = async () => new Response("expired origin certificate", { status: 526 });
const recovered = await worker.fetch(new Request("https://rickykwok.com/"), fallbackEnv);
check(recovered.status === 200 && await recovered.text() === "validated-public-backup", "origin SSL failures must serve the validated backup");
check(recovered.headers.get("x-site-source") === "cloudflare-backup", "failover must remain detectable by monitoring");
check(Boolean(recovered.headers.get("strict-transport-security")), "failover must retain HTTPS protections");
const headRecovery = await worker.fetch(new Request("https://rickykwok.com/", { method: "HEAD" }), fallbackEnv);
check(await headRecovery.text() === "", "backup HEAD responses must not contain a body");
const fallbackBeforeRetired = fallbackCalls;
const stillGone = await worker.fetch(new Request("https://rickykwok.com/contact/"), fallbackEnv);
check(stillGone.status === 410 && fallbackCalls === fallbackBeforeRetired, "failover must never revive retired content");
globalThis.fetch = async () => { throw new Error("origin network outage"); };
check((await worker.fetch(new Request("https://rickykwok.com/"), fallbackEnv)).status === 200, "network outages must trigger the backup");
globalThis.fetch = async () => Response.redirect("https://rickykwok.com/", 301);
check((await worker.fetch(new Request("https://rickykwok.com/"), fallbackEnv)).status === 200, "cached custom-domain redirects must trigger the backup instead of looping");
globalThis.fetch = async () => new Response("Not found", { status: 404 });
const fallbackBefore404 = fallbackCalls;
check((await worker.fetch(new Request("https://rickykwok.com/missing/"), fallbackEnv)).status === 404 && fallbackCalls === fallbackBefore404, "real origin 404s must stay 404");
globalThis.fetch = async () => Response.redirect("https://rickyinbc-tech.github.io/biography/", 301);
const directoryRedirect = await worker.fetch(new Request("https://rickykwok.com/biography"), fallbackEnv);
check(directoryRedirect.headers.get("location") === "https://rickykwok.com/biography/", "GitHub directory redirects must preserve the public hostname");
const postResponse = await worker.fetch(new Request("https://rickykwok.com/", { method: "POST", body: "private" }), fallbackEnv);
check(postResponse.status === 405, "a static site must not forward form bodies to the origin");
globalThis.fetch = normalFetch;

if (checks.length) throw new Error(`Edge worker tests failed:\n${checks.join("\n")}`);
console.log("Edge worker redirects, permanent-gone routes, and security headers passed.");
