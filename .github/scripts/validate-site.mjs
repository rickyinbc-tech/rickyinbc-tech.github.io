import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://rickykwok.com";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excludedDirectories = new Set([".git", ".github", "assets"]);
const errors = [];

function routeFor(relativeFile) {
  return relativeFile === "index.html" ? "/" : `/${relativeFile.replace(/\/index\.html$/, "/")}`;
}

function canonicalFrom(html) {
  return html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i)?.[1]
    || "";
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1]
    || tag.match(new RegExp(`\\b${name}='([^']*)'`, "i"))?.[1]
    || "";
}

function metaContent(html, name) {
  const tag = html.match(new RegExp(`<meta\\b[^>]*\\bname=["']${name}["'][^>]*>`, "i"))?.[0] || "";
  return attribute(tag, "content").trim();
}

function isNoindex(html) {
  const robots = metaContent(html, "robots").toLowerCase();
  return robots.includes("noindex");
}

function routeToFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.endsWith("/")) return path.join(repoRoot, decoded.slice(1), "index.html");
  return path.join(repoRoot, decoded.slice(1));
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
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

const indexable = [];
const titleOwners = new Map();
const descriptionOwners = new Map();

for (const file of await htmlFiles()) {
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");
  const route = routeFor(relative);
  const expectedCanonical = new URL(route, ORIGIN).href;
  const html = await readFile(file, "utf8");
  const noindex = isNoindex(html);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const description = metaContent(html, "description");
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const canonical = canonicalFrom(html);

  if (!title) errors.push(`${relative}: missing title`);
  if (h1Count !== 1) errors.push(`${relative}: expected one H1, found ${h1Count}`);

  for (const match of html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      errors.push(`${relative}: invalid JSON-LD (${error.message})`);
    }
  }

  if (!noindex) {
    if (!description) errors.push(`${relative}: missing meta description`);
    if (canonical.replace(/\/$/, "") !== expectedCanonical.replace(/\/$/, "")) {
      errors.push(`${relative}: canonical ${canonical || "missing"} does not match ${expectedCanonical}`);
    }
    if (/edition[^<]{0,80}proposed/i.test(html)) errors.push(`${relative}: contains a proposed-edition claim`);
    if (titleOwners.has(title)) errors.push(`${relative}: duplicate title with ${titleOwners.get(title)}`);
    else titleOwners.set(title, relative);
    if (descriptionOwners.has(description)) errors.push(`${relative}: duplicate description with ${descriptionOwners.get(description)}`);
    else descriptionOwners.set(description, relative);
    indexable.push(expectedCanonical);
  }

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (!value || value.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(value)) continue;
    let url;
    try {
      url = new URL(value, expectedCanonical);
    } catch {
      errors.push(`${relative}: invalid local reference ${value}`);
      continue;
    }
    if (url.origin !== ORIGIN) continue;
    if (!await exists(routeToFile(url.pathname))) errors.push(`${relative}: missing local target ${url.pathname}`);
  }
}

const sitemap = await readFile(path.join(repoRoot, "sitemap.xml"), "utf8");
const sitemapUrls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
const expected = [...indexable].sort();
const actual = [...sitemapUrls].sort();
if (JSON.stringify(expected) !== JSON.stringify(actual)) {
  errors.push(`sitemap parity failed: ${expected.length} indexable pages vs ${actual.length} sitemap URLs`);
}

if (errors.length) {
  throw new Error(`Site validation failed:\n${errors.join("\n")}`);
} else {
  console.log(`Validated ${expected.length} canonical pages with no broken local references.`);
}
