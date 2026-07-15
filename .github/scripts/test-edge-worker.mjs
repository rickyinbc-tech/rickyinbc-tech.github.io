import worker from "../../edge/cloudflare-worker.mjs";

const wineCommitSha = "a".repeat(40);
const fetchedUrls = [];

globalThis.fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  fetchedUrls.push(url.href);

  if (url.hostname === "api.github.com") {
    return new Response(JSON.stringify({ sha: wineCommitSha }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  return new Response(`origin:${url.pathname}`, {
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
for (const header of ["content-security-policy", "permissions-policy", "referrer-policy", "x-content-type-options", "x-frame-options"]) {
  check(Boolean(canonical.headers.get(header)), `canonical response lacks ${header}`);
}

const legacy = await worker.fetch(new Request("https://rickykwok.com/series/water-studies/?utm_source=a&private=b"));
check(legacy.status === 308, "legacy route must redirect permanently");
check(legacy.headers.get("location") === "https://rickykwok.com/series/collision/?utm_source=a", "redirect must retain only governed campaign parameters");

const select = await worker.fetch(new Request("https://select.rickykwok.com/"));
check(select.status === 308 && select.headers.get("location") === "https://rickykwok.com/", "select host must redirect to the canonical origin when proxied");

const wine = await worker.fetch(new Request("https://wine.rickykwok.com/"));
check(wine.status === 200 && await wine.text() === `origin:/rickyinbc-tech/wine.rickykwok.com/${wineCommitSha}/index.html`, "wine host must serve its GitHub repository homepage from an immutable commit");
check(wine.headers.get("content-security-policy")?.includes("https://cdn.jsdelivr.net"), "wine host must allow its Chart.js dependency");
check(wine.headers.get("x-wine-source-commit") === wineCommitSha, "wine homepage must disclose its source commit");

const wineData = await worker.fetch(new Request("https://wine.rickykwok.com/data/wine-chart.json"));
check(wineData.status === 200 && wineData.headers.get("content-type")?.startsWith("application/json"), "wine chart data must be served as JSON");
check(wineData.headers.get("x-wine-source-commit") === wineCommitSha, "wine data must use the same immutable source commit");
check(!fetchedUrls.some((url) => url.includes("raw.githubusercontent.com/rickyinbc-tech/wine.rickykwok.com/main/")), "wine assets must never use a moving branch URL");

const unknownWineAsset = await worker.fetch(new Request("https://wine.rickykwok.com/private"));
check(unknownWineAsset.status === 404, "unknown wine-site assets must fail closed");

const unknown = await worker.fetch(new Request("https://unknown.rickykwok.com/"));
check(unknown.status === 404, "unknown proxied subdomain must fail closed");

if (checks.length) throw new Error(`Edge worker tests failed:\n${checks.join("\n")}`);
console.log("Edge worker redirects and security headers passed.");
