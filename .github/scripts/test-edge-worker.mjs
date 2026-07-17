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
check(!wine.headers.get("content-security-policy")?.includes("https://cdn.jsdelivr.net"), "wine host must not allow the removed Chart.js dependency");
check(wine.headers.get("content-security-policy")?.includes("https://www.googletagmanager.com"), "wine host must allow the consent-gated Google tag script");
check(wine.headers.get("content-security-policy")?.includes("https://*.google-analytics.com"), "wine host must allow Google Analytics collection after consent");
check(wine.headers.get("x-wine-source-commit") === wineCommitSha, "wine homepage must disclose its source commit");

const insecureWine = await worker.fetch(new Request("http://wine.rickykwok.com/zh-hant/?utm_source=seo"));
check(insecureWine.status === 308, "HTTP wine URLs must redirect permanently to HTTPS");
check(insecureWine.headers.get("location") === "https://wine.rickykwok.com/zh-hant/?utm_source=seo", "wine HTTPS redirects must preserve the path and query string");

const wineIndex = await worker.fetch(new Request("https://wine.rickykwok.com/index.html"));
check(wineIndex.status === 301 && wineIndex.headers.get("location") === "https://wine.rickykwok.com/", "wine index.html must redirect to the canonical root URL");

const wineTraditional = await worker.fetch(new Request("https://wine.rickykwok.com/zh-hant/"));
check(wineTraditional.status === 200 && await wineTraditional.text() === "origin:/rickyinbc-tech/wine.rickykwok.com/" + wineCommitSha + "/zh-hant/index.html", "traditional Chinese wine page must be served from the immutable wine commit");

const wineSimplified = await worker.fetch(new Request("https://wine.rickykwok.com/zh-hans/"));
check(wineSimplified.status === 200 && await wineSimplified.text() === "origin:/rickyinbc-tech/wine.rickykwok.com/" + wineCommitSha + "/zh-hans/index.html", "simplified Chinese wine page must be served from the immutable wine commit");

const wineTraditionalCanonical = await worker.fetch(new Request("https://wine.rickykwok.com/zh-hant"));
check(wineTraditionalCanonical.status === 301 && wineTraditionalCanonical.headers.get("location") === "https://wine.rickykwok.com/zh-hant/", "traditional Chinese path must redirect to its trailing-slash canonical URL");

const wineSimplifiedIndex = await worker.fetch(new Request("https://wine.rickykwok.com/zh-hans/index.html"));
check(wineSimplifiedIndex.status === 301 && wineSimplifiedIndex.headers.get("location") === "https://wine.rickykwok.com/zh-hans/", "simplified Chinese index path must redirect to its canonical URL");

const wineStyles = await worker.fetch(new Request("https://wine.rickykwok.com/assets/site.css"));
check(wineStyles.status === 200 && wineStyles.headers.get("content-type")?.startsWith("text/css"), "wine stylesheet must be served with its CSS MIME type");

const wineScript = await worker.fetch(new Request("https://wine.rickykwok.com/assets/site.js"));
check(wineScript.status === 200 && wineScript.headers.get("content-type")?.startsWith("text/javascript"), "wine script must be served with its JavaScript MIME type");

const wineAnalytics = await worker.fetch(new Request("https://wine.rickykwok.com/assets/analytics.js"));
check(wineAnalytics.status === 200 && wineAnalytics.headers.get("content-type")?.startsWith("text/javascript"), "wine analytics script must be served with its JavaScript MIME type");

const wineBottleJpeg = await worker.fetch(new Request("https://wine.rickykwok.com/assets/wine-bottles/138432.jpg"));
check(wineBottleJpeg.status === 200 && wineBottleJpeg.headers.get("content-type") === "image/jpeg", "wine JPEG bottle images must be served with the correct MIME type");
check(await wineBottleJpeg.text() === `origin:/rickyinbc-tech/wine.rickykwok.com/${wineCommitSha}/assets/wine-bottles/138432.jpg`, "wine bottle images must use the immutable source commit");

const wineBottleWebp = await worker.fetch(new Request("https://wine.rickykwok.com/assets/wine-bottles/618780.webp"));
check(wineBottleWebp.status === 200 && wineBottleWebp.headers.get("content-type") === "image/webp", "wine WebP bottle images must be served with the correct MIME type");

const invalidWineBottle = await worker.fetch(new Request("https://wine.rickykwok.com/assets/wine-bottles/../../private.jpg"));
check(invalidWineBottle.status === 404, "invalid wine bottle paths must fail closed");

const wineData = await worker.fetch(new Request("https://wine.rickykwok.com/data/wine-chart.json"));
check(wineData.status === 200 && wineData.headers.get("content-type")?.startsWith("application/json"), "wine chart data must be served as JSON");
check(wineData.headers.get("x-robots-tag") === "noindex", "wine chart data must be excluded from search results");
check(wineData.headers.get("x-wine-source-commit") === wineCommitSha, "wine data must use the same immutable source commit");
check(!fetchedUrls.some((url) => url.includes("raw.githubusercontent.com/rickyinbc-tech/wine.rickykwok.com/main/")), "wine assets must never use a moving branch URL");

const unknownWineAsset = await worker.fetch(new Request("https://wine.rickykwok.com/private"));
check(unknownWineAsset.status === 404, "unknown wine-site assets must fail closed");

const unknown = await worker.fetch(new Request("https://unknown.rickykwok.com/"));
check(unknown.status === 404, "unknown proxied subdomain must fail closed");

if (checks.length) throw new Error(`Edge worker tests failed:\n${checks.join("\n")}`);
console.log("Edge worker redirects and security headers passed.");
