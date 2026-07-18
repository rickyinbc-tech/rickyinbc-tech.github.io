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
for (const header of ["content-security-policy", "permissions-policy", "referrer-policy", "x-content-type-options", "x-frame-options"]) {
  check(Boolean(canonical.headers.get(header)), `canonical response lacks ${header}`);
}

const legacy = await worker.fetch(new Request("https://rickykwok.com/series/water-studies/?utm_source=a&private=b"));
check(legacy.status === 308, "legacy route must redirect permanently");
check(legacy.headers.get("location") === "https://rickykwok.com/series/collision/?utm_source=a", "redirect must retain only governed campaign parameters");

const select = await worker.fetch(new Request("https://select.rickykwok.com/"));
check(select.status === 308 && select.headers.get("location") === "https://rickykwok.com/", "select host must redirect to the canonical origin when proxied");

const blogAward = await worker.fetch(new Request("https://blog.rickykwok.com/the-salon-era-2013-2015-a-trajectory-of-dominance/?utm_campaign=archive&private=drop"));
check(blogAward.status === 308, "verified legacy blog pages must redirect permanently");
check(blogAward.headers.get("location") === "https://rickykwok.com/awards-recognition/?utm_campaign=archive", "legacy blog redirects must be one hop and retain only governed campaign parameters");

const unknownBlogPath = await worker.fetch(new Request("https://blog.rickykwok.com/unverified-legacy-path/"));
check(unknownBlogPath.status === 200, "unverified blog paths must continue to the origin instead of receiving an unrelated redirect");

const unknown = await worker.fetch(new Request("https://unknown.rickykwok.com/"));
check(unknown.status === 404, "unknown proxied subdomain must fail closed");

if (checks.length) throw new Error(`Edge worker tests failed:\n${checks.join("\n")}`);
console.log("Edge worker redirects and security headers passed.");
