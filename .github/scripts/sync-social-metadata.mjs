import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excludedDirectories = new Set([".git", ".github", ".wrangler", "assets", "node_modules", "seo-status"]);

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "";
}

function isNoindex(html) {
  const robotsTag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0] || "";
  return attribute(robotsTag, "content").toLowerCase().includes("noindex");
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

function metaPattern(attributeName, key) {
  return new RegExp(`<meta\\b[^>]*\\b${attributeName}=["']${key.replaceAll(":", "\\:")}["'][^>]*>`, "i");
}

function upsertMeta(html, anchorKey, attributeName, key, value) {
  const pattern = metaPattern(attributeName, key);
  const tag = `  <meta ${attributeName}="${key}" content="${value}">`;
  if (pattern.test(html)) {
    const linePattern = new RegExp(`^[\\t ]*${pattern.source}`, "im");
    return html.replace(linePattern, tag);
  }

  const anchorPattern = metaPattern(attributeName, anchorKey);
  if (!anchorPattern.test(html)) throw new Error(`Missing ${anchorKey} anchor while adding ${key}`);
  return html.replace(anchorPattern, (anchor) => `${anchor}\n${tag}`);
}

let updatedPages = 0;
for (const file of await htmlFiles()) {
  let html = await readFile(file, "utf8");
  if (isNoindex(html)) continue;

  const heroPicture = html.match(/<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/i)?.[0] || "";
  const heroImage = heroPicture.match(/<img\b[^>]*>/i)?.[0] || "";
  const alt = attribute(heroImage, "alt");
  const width = attribute(heroImage, "width");
  const height = attribute(heroImage, "height");
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");

  if (!alt || !/^\d+$/.test(width) || !/^\d+$/.test(height)) {
    throw new Error(`${relative}: hero image needs alt text and numeric dimensions before social metadata can be synchronized`);
  }

  const before = html;
  html = upsertMeta(html, "og:image", "property", "og:image:alt", alt);
  html = upsertMeta(html, "og:image:alt", "property", "og:image:width", width);
  html = upsertMeta(html, "og:image:width", "property", "og:image:height", height);
  html = upsertMeta(html, "twitter:image", "name", "twitter:image:alt", alt);

  if (html !== before) {
    await writeFile(file, html);
    updatedPages += 1;
  }
}

console.log(`Synchronized accessible social-image metadata on ${updatedPages} canonical pages.`);
