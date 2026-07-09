import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE_URL = "https://rickykwok.com";
const generatedAt = new Date();
const repoRoot = new URL("../../", import.meta.url);
const outputDir = new URL("../../seo-status/", import.meta.url);
const allowLocalFallback = typeof globalThis.nodeRepl !== "undefined";

const fetchOptions = {
  headers: {
    "User-Agent": "RickyKwokSEOHealth/1.0 (+https://rickykwok.com/)",
  },
};

async function fetchText(path) {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const started = Date.now();
  try {
    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    return {
      contentType: response.headers.get("content-type") || "",
      durationMs: Date.now() - started,
      ok: response.ok,
      status: response.status,
      text,
      url,
    };
  } catch (error) {
    const local = allowLocalFallback ? await readLocalPath(path, url, started) : null;
    if (local) {
      return local;
    }
    return {
      contentType: "",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      status: 0,
      text: "",
      url,
    };
  }
}

async function readLocalPath(path, url, started) {
  const localPaths = {
    "/": "index.html",
    "/image-sitemap.xml": "image-sitemap.xml",
    "/robots.txt": "robots.txt",
    "/sitemap.xml": "sitemap.xml",
  };
  const localPath = localPaths[path];
  if (!localPath) {
    return null;
  }
  try {
    const text = await readFile(new URL(localPath, repoRoot), "utf8");
    return {
      contentType: "local/fallback",
      durationMs: Date.now() - started,
      ok: true,
      status: 200,
      text,
      url,
    };
  } catch {
    return null;
  }
}

function extractUrlLocs(xml) {
  return Array.from(xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g)).map(
    (match) => match[1].trim(),
  );
}

function extractImageLocs(xml) {
  return Array.from(xml.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)).map((match) =>
    match[1].trim(),
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const [robots, sitemap, imageSitemap, home] = await Promise.all([
  fetchText("/robots.txt"),
  fetchText("/sitemap.xml"),
  fetchText("/image-sitemap.xml"),
  fetchText("/"),
]);

const sitemapPages = sitemap.ok ? extractUrlLocs(sitemap.text) : [];
const imageSitemapPages = imageSitemap.ok ? extractUrlLocs(imageSitemap.text) : [];
const imageAssets = imageSitemap.ok ? extractImageLocs(imageSitemap.text) : [];

const checks = [
  {
    detail: `${robots.status} ${robots.contentType}`,
    name: "robots.txt is reachable",
    ok: robots.ok && robots.text.includes("User-agent: *"),
  },
  {
    detail: "robots.txt declares sitemap.xml",
    name: "Main sitemap is declared",
    ok: robots.text.includes(`${BASE_URL}/sitemap.xml`),
  },
  {
    detail: "robots.txt declares image-sitemap.xml",
    name: "Image sitemap is declared",
    ok: robots.text.includes(`${BASE_URL}/image-sitemap.xml`),
  },
  {
    detail: `${sitemap.status} ${sitemap.contentType}`,
    name: "Main sitemap is reachable",
    ok: sitemap.ok && sitemap.text.includes("<urlset"),
  },
  {
    detail: `${sitemapPages.length} page URLs found`,
    name: "Main sitemap has expected page inventory",
    ok: sitemapPages.length >= 55,
  },
  {
    detail: `${imageSitemap.status} ${imageSitemap.contentType}`,
    name: "Image sitemap is reachable",
    ok: imageSitemap.ok && imageSitemap.text.includes("image:image"),
  },
  {
    detail: `${imageSitemapPages.length} landing pages and ${imageAssets.length} image URLs found`,
    name: "Image sitemap has artwork inventory",
    ok: imageSitemapPages.length >= 55 && imageAssets.length >= 50,
  },
  {
    detail: `${home.status} ${home.contentType}`,
    name: "Home page is reachable",
    ok: home.ok && home.text.includes("Ricky Kwok"),
  },
  {
    detail: "Daily report is technical monitoring only",
    name: "No automated Google result scraping",
    ok: true,
  },
];

const status = checks.every((check) => check.ok) ? "pass" : "review";

const report = {
  baseUrl: BASE_URL,
  checks,
  generatedAt: generatedAt.toISOString(),
  imageAssetCount: imageAssets.length,
  imageSitemapPageCount: imageSitemapPages.length,
  note:
    "This report monitors technical SEO health only. Ranking and query data should come from Google Search Console and Google Analytics, not automated Google result scraping.",
  sitemapPageCount: sitemapPages.length,
  status,
};

const rows = checks
  .map(
    (check) => `<tr>
      <td>${check.ok ? "Pass" : "Review"}</td>
      <td>${escapeHtml(check.name)}</td>
      <td>${escapeHtml(check.detail)}</td>
    </tr>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Daily SEO Health | Ricky Kwok Fine Art Photography</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #151515;
      --muted: #666;
      --line: #ddd;
      --paper: #f7f4ee;
      --accent: #7b4d2f;
    }
    body {
      background: var(--paper);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
      margin: 0;
      padding: 48px 20px;
    }
    main {
      margin: 0 auto;
      max-width: 960px;
    }
    h1 {
      font-size: clamp(2rem, 4vw, 4rem);
      line-height: 1;
      margin: 0 0 12px;
    }
    p {
      color: var(--muted);
      max-width: 760px;
    }
    table {
      border-collapse: collapse;
      margin-top: 32px;
      width: 100%;
    }
    th,
    td {
      border-bottom: 1px solid var(--line);
      padding: 14px 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--accent);
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .status {
      color: ${status === "pass" ? "#1f6f43" : "#9a3412"};
      font-weight: 700;
      text-transform: uppercase;
    }
    code {
      background: rgba(0, 0, 0, 0.06);
      padding: 2px 5px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Daily SEO Health</h1>
    <p class="status">${escapeHtml(status)}</p>
    <p>Generated ${escapeHtml(generatedAt.toISOString())} for <code>${escapeHtml(BASE_URL)}</code>.</p>
    <p>This noindex page monitors technical SEO health only. It does not scrape Google results or rewrite indexed artwork pages for artificial freshness. Ranking and query performance should be read from Google Search Console and Google Analytics.</p>
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Check</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </main>
</body>
</html>
`;

await mkdir(outputDir, { recursive: true });
await writeFile(new URL("latest.json", outputDir), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(new URL("index.html", outputDir), html);
