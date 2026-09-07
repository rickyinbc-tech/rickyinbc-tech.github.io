import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://rickykwok.com";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excludedDirectories = new Set([".git", ".github", ".wrangler", "_site", "assets", "node_modules", "seo-status"]);

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
const indexablePageHtml = new Map();
for (const file of await htmlFiles()) {
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");
  const url = new URL(pagePath(relative), SITE_ORIGIN).href;
  const html = await readFile(file, "utf8");
  if (!isIndexable(html, url)) continue;
  indexablePageHtml.set(url, html);
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

// Image discovery is deliberately manifest-owned, not DOM-order-owned. An image
// can appear on many pages or in many responsive forms; only a governed canonical
// owner page may contribute its original image URL to the image sitemap.
const manifestPath = path.join(repoRoot, ".github/data/artwork-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const artworks = manifest.artworks;
if (!Array.isArray(artworks) || !artworks.length) {
  throw new Error("Artwork manifest must contain a non-empty artworks array.");
}

const manifestImageIds = new Set();
const manifestImageUrls = new Set();
const manifestPages = new Set();
const indexablePageUrls = new Set(pages.map((page) => page.url));

async function validateImageRecord(id, image, requiredPathPrefix = "/assets/") {
  if (!id || !image?.url || !image?.width || !image?.height || !image?.mimeType || !image?.title) {
    throw new Error(`Image-sitemap manifest record is incomplete: ${id || "unknown"}`);
  }
  if (manifestImageIds.has(id)) throw new Error(`Image-sitemap manifest has duplicate image id: ${id}`);
  manifestImageIds.add(id);

  const imageUrl = new URL(image.url, SITE_ORIGIN);
  if (imageUrl.origin !== SITE_ORIGIN || !imageUrl.pathname.startsWith(requiredPathPrefix)) {
    throw new Error(`Image-sitemap manifest image must be a local ${requiredPathPrefix} asset: ${id}`);
  }
  if (manifestImageUrls.has(imageUrl.href)) {
    throw new Error(`Image-sitemap manifest assigns the same image URL more than once: ${imageUrl.href}`);
  }
  manifestImageUrls.add(imageUrl.href);
  try {
    await access(path.join(repoRoot, decodeURIComponent(imageUrl.pathname).replace(/^\//, "")));
  } catch {
    throw new Error(`Image-sitemap manifest image is missing from the repository: ${id} (${image.url})`);
  }
  return imageUrl.href;
}

const imagePages = new Map();
function claimImageOwner(pageUrl, image) {
  const images = imagePages.get(pageUrl) || [];
  images.push(image);
  imagePages.set(pageUrl, images);
}

for (const artwork of artworks) {
  const id = artwork?.id;
  const canonicalPath = artwork?.canonicalPath;
  const image = artwork?.primaryImage;
  if (!id || !canonicalPath) {
    throw new Error(`Artwork manifest record is incomplete: ${id || "unknown"}`);
  }

  const pageUrl = new URL(canonicalPath, SITE_ORIGIN).href;
  if (manifestPages.has(pageUrl)) throw new Error(`Artwork manifest has duplicate canonical URL: ${pageUrl}`);
  manifestPages.add(pageUrl);
  if (!indexablePageUrls.has(pageUrl)) {
    throw new Error(`Artwork manifest URL is not an indexable canonical page: ${pageUrl}`);
  }

  const imageUrl = await validateImageRecord(id, { ...image, title: artwork.title });
  claimImageOwner(pageUrl, { title: artwork.title, url: imageUrl });
}

if (!manifest.imageSitemapPolicy || !Array.isArray(manifest.imageSitemapCollections)) {
  throw new Error("Artwork manifest must declare its image-sitemap policy and collections.");
}
const collectionIds = new Set();
for (const collection of manifest.imageSitemapCollections) {
  const id = collection?.id;
  const canonicalPath = collection?.canonicalPath;
  const images = collection?.images;
  if (!id || !canonicalPath || !Array.isArray(images) || !images.length) {
    throw new Error(`Image-sitemap collection is incomplete: ${id || "unknown"}`);
  }
  if (collectionIds.has(id)) throw new Error(`Image-sitemap collection has duplicate id: ${id}`);
  collectionIds.add(id);
  if (!canonicalPath.startsWith("/projects/")) {
    throw new Error(`Image-sitemap collection must use a canonical project page: ${id}`);
  }

  const pageUrl = new URL(canonicalPath, SITE_ORIGIN).href;
  if (manifestPages.has(pageUrl)) throw new Error(`Image-sitemap manifest has duplicate canonical URL: ${pageUrl}`);
  manifestPages.add(pageUrl);
  if (!indexablePageUrls.has(pageUrl)) {
    throw new Error(`Image-sitemap collection URL is not an indexable canonical page: ${pageUrl}`);
  }
  const ownerHtml = indexablePageHtml.get(pageUrl) || "";
  for (const image of images) {
    const imageUrl = await validateImageRecord(image?.id, image, "/assets/projects/");
    if (!ownerHtml.includes(image.url)) {
      throw new Error(`Image-sitemap collection page does not visibly reference ${image.id}: ${canonicalPath}`);
    }
    claimImageOwner(pageUrl, { title: image.title, url: imageUrl });
  }
}

const imageOwners = Array.from(imagePages, ([url, images]) => ({ images, url }))
  .sort((a, b) => a.url.localeCompare(b.url));
const imageSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${imageOwners.map((page) => `  <url>\n    <loc>${escapeXml(page.url)}</loc>\n${page.images.map((image) => `    <image:image>\n      <image:loc>${escapeXml(image.url)}</image:loc>\n    </image:image>`).join("\n")}\n  </url>`).join("\n")}
</urlset>
`;

await Promise.all([
  writeFile(path.join(repoRoot, "sitemap.xml"), sitemap),
  writeFile(path.join(repoRoot, "image-sitemap.xml"), imageSitemap),
]);

console.log(`Generated ${pages.length} canonical pages and ${manifestImageUrls.size} governed images across ${imageOwners.length} owner pages.`);
