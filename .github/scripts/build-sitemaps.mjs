import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://rickykwok.com";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excludedDirectories = new Set([".git", ".github", ".wrangler", "assets", "node_modules", "seo-status"]);

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pagePath(relativeFile) {
  if (relativeFile === "index.html") return "/";
  return `/${relativeFile.replace(/\/index\.html$/, "/")}`;
}

function canonicalFrom(html) {
  return html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i)?.[1]
    || "";
}

function isIndexable(html, expectedUrl) {
  const robots = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "";
  if (robots.includes("noindex")) return false;
  return canonicalFrom(html).replace(/\/$/, "") === expectedUrl.replace(/\/$/, "");
}

function modificationDate(html, fallback) {
  const value = html.match(/<meta\s+property=["']og:updated_time["']\s+content=["']([^"']+)["']/i)?.[1]
    || html.match(/"dateModified"\s*:\s*"([^"]+)"/i)?.[1]
    || "";
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : fallback;
}

async function htmlFiles(directory = repoRoot) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(fullPath));
    if (entry.isFile() && entry.name === "index.html") files.push(fullPath);
  }
  return files;
}

let existingDates = new Map();
try {
  const existingSitemap = await readFile(path.join(repoRoot, "sitemap.xml"), "utf8");
  existingDates = new Map(Array.from(existingSitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g), (match) => [match[1], match[2]]));
} catch {
  // A first build has no prior date map.
}

const pages = [];
for (const file of await htmlFiles()) {
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");
  const url = new URL(pagePath(relative), SITE_ORIGIN).href;
  const html = await readFile(file, "utf8");
  if (!isIndexable(html, url)) continue;
  const fileDate = (await stat(file)).mtime.toISOString().slice(0, 10);
  pages.push({
    lastmod: modificationDate(html, existingDates.get(url) || fileDate),
    url,
  });
}

pages.sort((a, b) => a.url.localeCompare(b.url));

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((page) => `  <url>\n    <loc>${escapeXml(page.url)}</loc>\n    <lastmod>${page.lastmod}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;

// Image discovery is deliberately artwork-owned, not DOM-order-owned. A work can
// appear as a thumbnail or related image on many pages; none of those appearances
// may take ownership of its canonical image-sitemap entry.
const manifestPath = path.join(repoRoot, ".github/data/artwork-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artworks = manifest.artworks;
if (!Array.isArray(artworks) || !artworks.length) {
  throw new Error("Artwork manifest must contain a non-empty artworks array.");
}

const manifestIds = new Set();
const manifestPages = new Set();
const indexablePageUrls = new Set(pages.map((page) => page.url));
for (const artwork of artworks) {
  const id = artwork?.id;
  const canonicalPath = artwork?.canonicalPath;
  const image = artwork?.primaryImage;
  if (!id || !canonicalPath || !image?.url || !image?.width || !image?.height || !image?.mimeType) {
    throw new Error(`Artwork manifest record is incomplete: ${id || "unknown"}`);
  }
  if (manifestIds.has(id)) throw new Error(`Artwork manifest has duplicate id: ${id}`);
  manifestIds.add(id);

  const pageUrl = new URL(canonicalPath, SITE_ORIGIN).href;
  if (manifestPages.has(pageUrl)) throw new Error(`Artwork manifest has duplicate canonical URL: ${pageUrl}`);
  manifestPages.add(pageUrl);
  if (!indexablePageUrls.has(pageUrl)) {
    throw new Error(`Artwork manifest URL is not an indexable canonical page: ${pageUrl}`);
  }

  const imageUrl = new URL(image.url, SITE_ORIGIN);
  if (imageUrl.origin !== SITE_ORIGIN || !imageUrl.pathname.startsWith("/assets/")) {
    throw new Error(`Artwork manifest image must be a local public asset: ${id}`);
  }
  try {
    await access(path.join(repoRoot, decodeURIComponent(imageUrl.pathname).replace(/^\//, "")));
  } catch {
    throw new Error(`Artwork manifest image is missing from the repository: ${id} (${image.url})`);
  }
}

const imagePages = artworks
  .map((artwork) => ({
    image: {
      title: artwork.title,
      url: new URL(artwork.primaryImage.url, SITE_ORIGIN).href,
    },
    url: new URL(artwork.canonicalPath, SITE_ORIGIN).href,
  }))
  .sort((a, b) => a.url.localeCompare(b.url));
const imageSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${imagePages.map((page) => `  <url>\n    <loc>${escapeXml(page.url)}</loc>\n    <image:image>\n      <image:loc>${escapeXml(page.image.url)}</image:loc>\n      <image:title>${escapeXml(page.image.title)}</image:title>\n    </image:image>\n  </url>`).join("\n")}
</urlset>
`;

await Promise.all([
  writeFile(path.join(repoRoot, "sitemap.xml"), sitemap),
  writeFile(path.join(repoRoot, "image-sitemap.xml"), imageSitemap),
]);

console.log(`Generated ${pages.length} canonical pages and ${imagePages.length} artwork-owned image records.`);
