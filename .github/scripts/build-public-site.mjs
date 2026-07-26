import { access, cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "_site");
const excludedTopLevel = new Set([
  ".git",
  ".github",
  ".gitignore",
  ".wrangler",
  "_site",
  "edge",
  "node_modules",
  "package-lock.json",
  "package.json",
  "seo-status",
]);
const retiredPrefixes = [
  "available-prints",
  "contact",
  "editions",
  "licensing",
  "press",
  "prints",
  "privacy",
  "shipping-returns",
  "studio-standards",
  "terms",
  "zh-hant/available-prints",
  "zh-hant/contact",
  "zh-hant/editions",
  "zh-hant/licensing",
  "zh-hant/press",
  "zh-hant/prints",
  "zh-hant/privacy",
  "zh-hant/shipping-returns",
  "zh-hant/studio-standards",
  "zh-hant/terms",
  "zh-hans/available-prints",
  "zh-hans/contact",
  "zh-hans/editions",
  "zh-hans/licensing",
  "zh-hans/press",
  "zh-hans/prints",
  "zh-hans/privacy",
  "zh-hans/shipping-returns",
  "zh-hans/studio-standards",
  "zh-hans/terms",
];
const buildOnlyFiles = new Set([
  "assets/site.css",
  "assets/site.js",
]);

function isRetired(relative) {
  const normalized = relative.split(path.sep).join("/");
  return retiredPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

async function copyPublicEntry(source, relative) {
  const normalized = relative.split(path.sep).join("/");
  if (path.basename(source) === ".DS_Store" || isRetired(relative) || buildOnlyFiles.has(normalized)) return;
  const destination = path.join(output, relative);
  const entries = await readdir(source, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
    return;
  }
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    await copyPublicEntry(path.join(source, entry.name), path.join(relative, entry.name));
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (excludedTopLevel.has(entry.name)) continue;
  await copyPublicEntry(path.join(root, entry.name), entry.name);
}

for (const relative of ["index.html", "404.html", "CNAME", "robots.txt", "sitemap.xml", "image-sitemap.xml", "assets/site.min.css", "assets/site.min.js"]) {
  await access(path.join(output, relative));
}
for (const relative of [
  "package.json",
  "edge/redirect-map.json",
  ".github/scripts/validate-site.mjs",
  "assets/site.css",
  "assets/site.js",
  ...retiredPrefixes.map((prefix) => `${prefix}/index.html`),
]) {
  try {
    await access(path.join(output, relative));
    throw new Error(`Build-only or retired file leaked into the public artifact: ${relative}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log("Built a public-only GitHub Pages artifact in _site/.");
