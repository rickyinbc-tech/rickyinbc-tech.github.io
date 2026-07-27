import worker from "../../edge/cloudflare-worker.mjs";

globalThis.fetch = async (request) => new Response(`origin:${new URL(request.url).pathname}`, {
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" }
});

const checks = [];

function check(condition, message) {
  if (!condition) checks.push(message);
}

const canonical = await worker.fetch(new Request("https://rickykwok.com/"));
check(canonical.status === 200, "canonical origin must pass through");
for (const header of ["content-security-policy", "permissions-policy", "referrer-policy", "strict-transport-security", "x-content-type-options", "x-frame-options"]) {
  check(Boolean(canonical.headers.get(header)), `canonical response lacks ${header}`);
}
const versionedCss = await worker.fetch(new Request("https://rickykwok.com/assets/site.min.css?v=20260726-editorial-refresh-v1"));
check(versionedCss.headers.get("cache-control") === "public, max-age=31536000, immutable", "versioned production CSS must use immutable browser caching");
const optimizedImage = await worker.fetch(new Request("https://rickykwok.com/assets/optimized-v2/art/light-encroached-homes-800.webp"));
check(optimizedImage.headers.get("cache-control") === "public, max-age=31536000, immutable", "optimized images must use immutable browser caching");
check(canonical.headers.get("cache-control") !== "public, max-age=31536000, immutable", "HTML must not use immutable browser caching");

const legacy = await worker.fetch(new Request("https://rickykwok.com/series/water-studies/?utm_source=a&private=b"));
check(legacy.status === 308, "legacy route must redirect permanently");
check(legacy.headers.get("location") === "https://rickykwok.com/series/collision/", "redirect must discard query parameters");

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

for (const path of ["/", "/feed", "/unverified-legacy-path/"]) {
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

if (checks.length) throw new Error(`Edge worker tests failed:\n${checks.join("\n")}`);
console.log("Edge worker redirects, permanent-gone routes, and security headers passed.");
