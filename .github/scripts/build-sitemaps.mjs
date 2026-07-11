import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ORIGIN = "https://rickykwok.com";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excludedDirectories = new Set([".git", ".github", "assets"]);

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match?.[1]?.trim() || "";
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

function imageRecords(html) {
  const records = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attribute(match[0], "src");
    if (!src || src.startsWith("data:")) continue;
    const url = new URL(src, SITE_ORIGIN).href;
    if (!url.startsWith(`${SITE_ORIGIN}/assets/`)) continue;
    const alt = attribute(match[0], "alt");
    records.push({ alt, url });
  }
  return records;
}

function pagePriority(url) {
  if (url.includes("/works/")) return 0;
  if (url.includes("/projects/")) return 1;
  if (url.includes("/series/")) return 2;
  if (url.endsWith("/selected-works/")) return 3;
  if (url === `${SITE_ORIGIN}/`) return 4;
  return 5;
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
    html,
    images: imageRecords(html),
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

const claimedImages = new Set();
const imagePages = [];
for (const page of [...pages].sort((a, b) => pagePriority(a.url) - pagePriority(b.url) || a.url.localeCompare(b.url))) {
  const uniqueImages = [];
  for (const image of page.images) {
    if (claimedImages.has(image.url)) continue;
    claimedImages.add(image.url);
    uniqueImages.push(image);
  }
  if (uniqueImages.length) imagePages.push({ ...page, images: uniqueImages });
}

imagePages.sort((a, b) => a.url.localeCompare(b.url));
const imageSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${imagePages.map((page) => `  <url>\n    <loc>${escapeXml(page.url)}</loc>\n${page.images.map((image) => `    <image:image>\n      <image:loc>${escapeXml(image.url)}</image:loc>${image.alt ? `\n      <image:title>${escapeXml(image.alt)}</image:title>` : ""}\n    </image:image>`).join("\n")}\n  </url>`).join("\n")}
</urlset>
`;

await Promise.all([
  writeFile(path.join(repoRoot, "sitemap.xml"), sitemap),
  writeFile(path.join(repoRoot, "image-sitemap.xml"), imageSitemap),
]);

console.log(`Generated ${pages.length} canonical pages and ${claimedImages.size} unique image records.`);
