import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ignored = new Set([".git", ".github", ".wrangler", "assets", "node_modules", "seo-status"]);

async function walk(directory, predicate, ignoredDirectories = new Set()) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(file, predicate, ignoredDirectories));
    else if (predicate(file)) results.push(file);
  }
  return results;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] || "";
}

const htmlFiles = await walk(root, (file) => file.endsWith(`${path.sep}index.html`) || file.endsWith(`${path.sep}404.html`), ignored);
const images = new Map();
let missingDimensions = 0;
let missingSizes = 0;

for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const page = path.relative(root, file).split(path.sep).join("/");
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const source = attribute(tag, "src").replace(/^https:\/\/rickykwok\.com/, "");
    if (!source) continue;
    const record = images.get(source) || { source, pages: new Set(), uses: 0, alts: new Set(), widths: new Set(), responsiveUses: 0, lazyUses: 0, eagerUses: 0 };
    record.pages.add(page);
    record.uses += 1;
    if (attribute(tag, "alt")) record.alts.add(attribute(tag, "alt"));
    if (attribute(tag, "width")) record.widths.add(Number(attribute(tag, "width")));
    if (attribute(tag, "srcset")) record.responsiveUses += 1;
    if (attribute(tag, "loading") === "lazy") record.lazyUses += 1;
    if (attribute(tag, "loading") === "eager") record.eagerUses += 1;
    if (!attribute(tag, "width") || !attribute(tag, "height")) missingDimensions += 1;
    if (!attribute(tag, "sizes")) missingSizes += 1;
    images.set(source, record);
  }
}

const imageInventory = {
  schemaVersion: 1,
  summary: {
    pages: htmlFiles.length,
    uniquePrimarySources: images.size,
    imageUses: [...images.values()].reduce((total, image) => total + image.uses, 0),
    missingDimensions,
    missingSizes
  },
  images: [...images.values()].sort((a, b) => a.source.localeCompare(b.source)).map((image) => ({
    source: image.source,
    pages: [...image.pages].sort(),
    uses: image.uses,
    altVariants: [...image.alts].sort(),
    declaredWidths: [...image.widths].sort((a, b) => a - b),
    responsiveUses: image.responsiveUses,
    lazyUses: image.lazyUses,
    eagerUses: image.eagerUses
  }))
};

const budgets = JSON.parse(await readFile(path.join(root, ".github/data/performance-budgets.json"), "utf8"));
const htmlSizes = await Promise.all(htmlFiles.map(async (file) => ({ file: path.relative(root, file).split(path.sep).join("/"), bytes: (await stat(file)).size })));
const responsiveImages = await walk(path.join(root, "assets/optimized-v2"), (file) => /\.(?:avif|webp|jpe?g)$/i.test(file));
const responsiveSizes = await Promise.all(responsiveImages.map(async (file) => ({ file: path.relative(root, file).split(path.sep).join("/"), bytes: (await stat(file)).size })));
const measured = {
  maxHtmlBytes: Math.max(...htmlSizes.map((item) => item.bytes)),
  siteCssBytes: (await stat(path.join(root, "assets/site.min.css"))).size,
  siteJsBytes: (await stat(path.join(root, "assets/site.min.js"))).size,
  largestResponsiveImageBytes: Math.max(...responsiveSizes.map((item) => item.bytes)),
  maxMissingImageDimensions: missingDimensions,
  maxMissingImageSizes: missingSizes
};
const failures = Object.entries(budgets.budgets).filter(([key, budget]) => measured[key] > budget).map(([key, budget]) => ({ metric: key, measured: measured[key], budget }));
const performance = {
  schemaVersion: 1,
  status: failures.length ? "fail" : "pass",
  measured,
  budgets: budgets.budgets,
  largestHtml: htmlSizes.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
  largestResponsiveImages: responsiveSizes.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
  failures
};

await writeFile(path.join(root, ".github/data/image-asset-inventory.json"), `${JSON.stringify(imageInventory, null, 2)}\n`);
await writeFile(path.join(root, ".github/data/performance-report.json"), `${JSON.stringify(performance, null, 2)}\n`);

if (failures.length) throw new Error(`Performance governance failed: ${failures.map((failure) => failure.metric).join(", ")}`);
console.log(`Governance report: ${images.size} image sources, ${imageInventory.summary.imageUses} uses, all performance budgets passed.`);
