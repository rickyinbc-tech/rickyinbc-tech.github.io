import path from "node:path";

export const EXCLUDED_TOP_LEVEL = new Set([
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

export const RETIRED_PREFIXES = [
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

export const BUILD_ONLY_FILES = new Set([
  "assets/site.css",
  "assets/site.js",
]);

export function normalizedRelative(relative) {
  return relative.split(path.sep).join("/");
}

export function isRetired(relative) {
  const normalized = normalizedRelative(relative);
  return RETIRED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

export function shouldPublish(relative, basename = path.basename(relative)) {
  const normalized = normalizedRelative(relative);
  const topLevel = normalized.split("/")[0];
  return !EXCLUDED_TOP_LEVEL.has(topLevel)
    && basename !== ".DS_Store"
    && !isRetired(normalized)
    && !BUILD_ONLY_FILES.has(normalized);
}
