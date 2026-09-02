import { access, cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILD_ONLY_FILES,
  EXCLUDED_TOP_LEVEL,
  RETIRED_PREFIXES,
  isRetired,
} from "./public-artifact-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "_site");

async function copyPublicEntry(source, relative) {
  const normalized = relative.split(path.sep).join("/");
  if (path.basename(source) === ".DS_Store" || isRetired(relative) || BUILD_ONLY_FILES.has(normalized)) return;
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
  if (EXCLUDED_TOP_LEVEL.has(entry.name)) continue;
  await copyPublicEntry(path.join(root, entry.name), entry.name);
}

for (const relative of ["index.html", "404.html", "CNAME", "robots.txt", "sitemap.xml", "image-sitemap.xml", "1552ab306b5b68d0132850bb49568a38.txt", "assets/site.min.css", "assets/site.min.js"]) {
  await access(path.join(output, relative));
}
for (const relative of [
  "package.json",
  "edge/redirect-map.json",
  ".github/scripts/validate-site.mjs",
  "assets/site.css",
  "assets/site.js",
  ...RETIRED_PREFIXES.map((prefix) => `${prefix}/index.html`),
]) {
  try {
    await access(path.join(output, relative));
    throw new Error(`Build-only or retired file leaked into the public artifact: ${relative}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log("Built a public-only GitHub Pages artifact in _site/.");
