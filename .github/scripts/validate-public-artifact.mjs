import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { photographyScopeFindings } from "./photography-scope-policy.mjs";
import {
  ARCHIVE_IMAGE_SIZES,
  adjacentRepeatedSourceCardFamilies,
  FEATURE_IMAGE_SIZES,
  HERO_IMAGE_SIZES,
  MODAL_IMAGE_SIZES,
  NATURAL_WIDTH_AVIF_FAMILIES,
  PHOTO_RESOLUTION_MANIFEST,
  SUPPORT_CARD_IMAGE_SIZES,
  WORK_CARD_IMAGE_SIZES,
  featureImageTags,
  photoForReference,
  repeatedArtworkSourceCards,
  repeatedSourceCardFamilies,
} from "./responsive-image-policy.mjs";
import {
  ASSET_VERSION,
  SHELL_VERSION,
  SITE_ORIGIN,
  SUPPORTED_LANGUAGES,
  extractLanguageLinks,
  normalizeLanguage,
  renderFooter,
  renderHeaderAndNotice,
} from "./site-shell.mjs";
import {
  BUILD_ONLY_FILES,
  EXCLUDED_TOP_LEVEL,
  isRetired,
} from "./public-artifact-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const artifactRoot = path.join(repoRoot, "_site");
const errors = [];
const bitmapMetadata = new Map();

function normalized(relative) {
  return relative.split(path.sep).join("/");
}

async function walkFiles(directory, relative = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryRelative = normalized(path.join(relative, entry.name));
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath, entryRelative));
    if (entry.isFile()) files.push(entryRelative);
  }
  return files;
}

async function expectedSourceFiles(directory = repoRoot, relative = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryRelative = normalized(path.join(relative, entry.name));
    const topLevel = entryRelative.split("/")[0];
    if (EXCLUDED_TOP_LEVEL.has(topLevel) || isRetired(entryRelative)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await expectedSourceFiles(fullPath, entryRelative));
    if (entry.isFile() && entry.name !== ".DS_Store" && !BUILD_ONLY_FILES.has(entryRelative)) {
      files.push(entryRelative);
    }
  }
  return files;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function metaContent(html, name) {
  const tag = html.match(new RegExp(`<meta\\b[^>]*\\bname=["']${name}["'][^>]*>`, "i"))?.[0] || "";
  return attribute(tag, "content").trim();
}

function canonicalFrom(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    if (attribute(match[0], "rel").toLowerCase() === "canonical") return attribute(match[0], "href");
  }
  return "";
}

function alternateLinks(html) {
  const links = new Map();
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    if (attribute(match[0], "rel").toLowerCase() !== "alternate") continue;
    const language = attribute(match[0], "hreflang");
    const href = attribute(match[0], "href");
    if (language && href) links.set(language, href);
  }
  return links;
}

function isNoindex(html) {
  return metaContent(html, "robots").toLowerCase().includes("noindex");
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)));
}

function routeFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === "/"
    ? "index.html"
    : decoded.endsWith("/")
      ? `${decoded.slice(1)}index.html`
      : decoded.slice(1);
  return normalized(relative);
}

async function fileExists(relative) {
  try {
    await access(path.join(artifactRoot, relative));
    return true;
  } catch {
    return false;
  }
}

async function metadataFor(relative) {
  if (!bitmapMetadata.has(relative)) {
    bitmapMetadata.set(relative, await sharp(path.join(artifactRoot, relative)).metadata());
  }
  return bitmapMetadata.get(relative);
}

async function sha256For(relative) {
  return createHash("sha256")
    .update(await readFile(path.join(artifactRoot, relative)))
    .digest("hex");
}

async function resolveArtifactTarget(url) {
  const exact = routeFile(url.pathname);
  if (await fileExists(exact)) return exact;
  if (!url.pathname.endsWith("/") && await fileExists(`${exact}/index.html`)) return `${exact}/index.html`;
  return "";
}

function visibleSegments(html) {
  const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .filter((match) => /^(?:description|og:title|og:description|twitter:title|twitter:description)$/i.test(
      attribute(match[0], "name") || attribute(match[0], "property"),
    ))
    .map((match) => attribute(match[0], "content"));
  const withoutCode = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutCode.replace(/<\/?(?:p|h[1-6]|li|a|button|figcaption|title|div|section|article|footer|header|nav)\b[^>]*>/gi, "\n");
  const visible = decodeEntities(withBreaks.replace(/<[^>]+>/g, " "));
  return [...visible.split(/\n+/), ...metadata]
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const prohibitedTerms = [
  ["collect", /\bcollect(?:s|ed|ing|or|ors)?\b/iu],
  ["acquisition", /\bacquisition(?:s)?\b|\bacquir(?:e|es|ed|ing)\b/iu],
  ["price", /\bprices?\b/iu],
  ["purchase", /\bpurchas(?:e|es|ed|ing)\b/iu],
  ["sale", /\bsales?\b/iu],
  ["edition", /\beditions?\b/iu],
  ["licensing", /\blicen[cs](?:e|es|ed|ing)\b/iu],
  ["commercial use", /\bcommercial\s+(?:image\s+)?use\b/iu],
  ["commission", /\bcommissions?\b/iu],
  ["booking", /\bbookings?\b/iu],
  ["studio offer", /\bstudio\s+(?:offer|contact|inquir)/iu],
  ["inquiry", /\b(?:inquir(?:y|ies)|enquir(?:y|ies))\b/iu],
  ["work with", /\bwork\s+with(?:\s+ricky)?\b/iu],
  ["available for", /\bavailable\s+for\b/iu],
  ["exhibition proposal", /\b(?:propos(?:e|es|ed|ing)\s+an?\s+exhibition|exhibition\s+(?:inquir(?:y|ies)|enquir(?:y|ies)|proposal))\b/iu],
  ["publication inquiry", /\bpublication\s+(?:inquir(?:y|ies)|enquir(?:y|ies)|proposal)\b/iu],
  ["client", /\bclients?\b/iu],
  ["hire", /\bhir(?:e|es|ed|ing)\b/iu],
  ["service", /\bservices?\b/iu],
  ["sponsorship", /\bsponsor(?:s|ed|ing|ship|ships)?\b/iu],
  ["professional advice", /\bprofessional\s+(?:financial\s+)?advice\b/iu],
  ["portfolio", /\bportfolios?\b/iu],
  ["shipping", /\bshipping\b/iu],
  ["Traditional Chinese transactional term", /收藏|收購|購買|價格|售價|授權|商業使用|委託|預約|工作室|客戶|查詢|版畫出售|版本價格|聯絡工作室|展覽查詢/u],
  ["Simplified Chinese transactional term", /收藏|收购|购买|价格|售价|授权|商业使用|委托|预约|工作室|客户|查询|版画出售|版本价格|联络工作室|展览查询/u],
];

const commonsLicensedArtworkPages = new Set([
  "projects/horse-riding/index.html",
  "projects/travel/index.html",
  "works/bank-of-china-light-trails/index.html",
  "works/coil-field/index.html",
  "works/fishpond-harvest/index.html",
  "works/light-encroached-homes/index.html",
  "zh-hant/works/bank-of-china-light-trails/index.html",
  "zh-hant/works/coil-field/index.html",
  "zh-hant/works/fishpond-harvest/index.html",
  "zh-hant/works/light-encroached-homes/index.html",
  "zh-hans/works/bank-of-china-light-trails/index.html",
  "zh-hans/works/coil-field/index.html",
  "zh-hans/works/fishpond-harvest/index.html",
  "zh-hans/works/light-encroached-homes/index.html",
]);

function isAllowedCommercialContext(relative, label, segment) {
  if (commonsLicensedArtworkPages.has(relative)) {
    if (
      label === "licensing"
      && /(?:This photograph is licensed under the|Creative Commons Attribution-ShareAlike 4\.0 International licence \(CC BY-SA 4\.0\)|This licence grant is permanent and applies to the full-resolution photograph identified on this page)/u.test(segment)
    ) {
      return true;
    }
    if (
      /Chinese transactional term/.test(label)
      && /(?:版權及授權：.*本照片以|知識共享署名—相同方式共享 4\.0 國際授權條款（CC BY-SA 4\.0）|永久發布；授權涵蓋本頁所識別的全解像度照片|版权及许可：.*本照片以|知识共享署名—相同方式共享 4\.0 国际许可协议（CC BY-SA 4\.0）|永久发布；许可涵盖本页所识别的全分辨率照片)/u.test(segment)
    ) {
      return true;
    }
  }
  if (
    /Chinese transactional term/.test(label)
    && /本網站不授權複製或再使用|本网站不授权复制或再使用/u.test(segment)
    && !/查詢|查询|價格|价格|購買|购买|收藏|工作室/u.test(segment)
  ) {
    return true;
  }
  return false;
}

function validateStructuredData(relative, html) {
  const prohibitedKeys = new Set([
    "offers",
    "price",
    "pricecurrency",
    "acquirelicensepage",
    "license",
    "contactpoint",
    "servicetype",
  ]);
  const prohibitedTypes = new Set([
    "contactpage",
    "localbusiness",
    "offer",
    "product",
    "professionalservice",
    "service",
  ]);

  function inspect(value, pointer = "$") {
    if (Array.isArray(value)) {
      value.forEach((item, index) => inspect(item, `${pointer}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (prohibitedKeys.has(key.toLowerCase())) {
        errors.push(`${relative}: prohibited commercial JSON-LD property ${pointer}.${key}`);
      }
      if (key === "@type") {
        const values = Array.isArray(item) ? item : [item];
        for (const type of values) {
          if (prohibitedTypes.has(String(type).toLowerCase())) {
            errors.push(`${relative}: prohibited commercial JSON-LD type ${type}`);
          }
        }
      }
      inspect(item, `${pointer}.${key}`);
    }
  }

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      inspect(JSON.parse(match[1]));
    } catch (error) {
      errors.push(`${relative}: invalid JSON-LD in public artifact (${error.message})`);
    }
  }
}

function validateCommercialContent(scope, relative, html) {
  const labelPrefix = `${scope}:${relative}`;
  for (const finding of photographyScopeFindings(html)) {
    errors.push(`${labelPrefix}: outside photography-only scope: ${finding}`);
  }
  if (/<form\b/i.test(html)) errors.push(`${labelPrefix}: contains a form`);
  if (/\bhref=["']mailto:/i.test(html)) errors.push(`${labelPrefix}: contains an email pathway`);
  if (/(?:ask about acquisition|request image licen[cs]ing|propose an exhibition|collector inquiry|studio offer|price and availability|work with ricky|聯絡工作室|联络工作室|收藏查詢|收藏查询)/iu.test(
    html.replace(/<script\b[\s\S]*?<\/script>/gi, " "),
  )) {
    errors.push(`${labelPrefix}: contains a prohibited transactional call to action`);
  }
  for (const segment of visibleSegments(html)) {
    for (const [label, pattern] of prohibitedTerms) {
      if (pattern.test(segment) && !isAllowedCommercialContext(relative, label, segment)) {
        errors.push(`${labelPrefix}: prohibited ${label} context: “${segment.slice(0, 220)}”`);
      }
    }
  }
  validateStructuredData(labelPrefix, html);
}

await access(artifactRoot).catch(() => {
  throw new Error("Public artifact is missing. Run npm run build:public before validating it.");
});

const expectedFiles = (await expectedSourceFiles()).sort();
const actualFiles = (await walkFiles(artifactRoot)).sort();
const expectedSet = new Set(expectedFiles);
const actualSet = new Set(actualFiles);
for (const relative of expectedFiles) {
  if (!actualSet.has(relative)) errors.push(`artifact parity: missing generated file ${relative}`);
}
for (const relative of actualFiles) {
  if (!expectedSet.has(relative)) errors.push(`artifact parity: stale or unproduced file ${relative}`);
}

const sourceHtmlFiles = expectedFiles.filter((relative) => relative.endsWith(".html"));
for (const relative of sourceHtmlFiles) {
  const html = await readFile(path.join(repoRoot, relative), "utf8");
  validateCommercialContent("source", relative, html);
}

const sitemap = await readFile(path.join(artifactRoot, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeEntities(match[1]));
const sitemapSet = new Set(sitemapUrls);
const documents = new Map();
const languageCounts = new Map(SUPPORTED_LANGUAGES.map((language) => [language, 0]));

for (const canonicalUrl of sitemapUrls) {
  const url = new URL(canonicalUrl);
  if (url.origin !== SITE_ORIGIN) {
    errors.push(`sitemap: non-canonical origin ${canonicalUrl}`);
    continue;
  }
  const relative = routeFile(url.pathname);
  if (!actualSet.has(relative)) {
    errors.push(`sitemap: ${canonicalUrl} has no generated file ${relative}`);
    continue;
  }
  const html = await readFile(path.join(artifactRoot, relative), "utf8");
  const language = normalizeLanguage(attribute(html.match(/<html\b[^>]*>/i)?.[0] || "", "lang"));
  languageCounts.set(language, (languageCounts.get(language) || 0) + 1);
  documents.set(canonicalUrl, { canonicalUrl, html, language, relative });
  if (isNoindex(html)) errors.push(`${relative}: sitemap page is noindex`);
  if (canonicalFrom(html) !== canonicalUrl) {
    errors.push(`${relative}: canonical ${canonicalFrom(html) || "missing"} does not exactly match ${canonicalUrl}`);
  }
}

const artifactHtmlFiles = actualFiles.filter((relative) => relative.endsWith(".html"));
for (const relative of artifactHtmlFiles) {
  const html = await readFile(path.join(artifactRoot, relative), "utf8");
  const canonical = canonicalFrom(html);
  const isSitemapDocument = sitemapSet.has(canonical) && documents.get(canonical)?.relative === relative;
  if (!isSitemapDocument && relative !== "404.html") {
    if (!isNoindex(html)) errors.push(`${relative}: generated HTML is neither in the sitemap nor explicitly noindex`);
    if (canonical && !sitemapSet.has(canonical)) {
      errors.push(`${relative}: noindex alias canonical does not resolve to an indexable sitemap page (${canonical})`);
    }
    if (!/<meta\b[^>]*http-equiv=["']refresh["'][^>]*>/i.test(html)) {
      errors.push(`${relative}: noindex alias lacks an explicit static redirect fallback`);
    }
  }

  validateCommercialContent("artifact", relative, html);
}

for (const document of documents.values()) {
  const { canonicalUrl, html, language, relative } = document;
  if (adjacentRepeatedSourceCardFamilies(html).length) {
    errors.push(`${relative}: adjacent related cards visibly repeat the same photograph`);
  }
  if (repeatedSourceCardFamilies(html).length) {
    errors.push(`${relative}: related cards reuse the same photograph`);
  }
  const alternates = alternateLinks(html);
  for (const alternateLanguage of [...SUPPORTED_LANGUAGES, "x-default"]) {
    if (!alternates.has(alternateLanguage)) errors.push(`${relative}: missing ${alternateLanguage} hreflang`);
  }
  if (alternates.get("x-default") !== alternates.get("en")) {
    errors.push(`${relative}: x-default must equal the English alternate`);
  }
  for (const alternateLanguage of SUPPORTED_LANGUAGES) {
    const targetUrl = alternates.get(alternateLanguage);
    const target = targetUrl ? documents.get(targetUrl) : null;
    if (!target) {
      errors.push(`${relative}: ${alternateLanguage} hreflang target is not an indexable artifact page (${targetUrl || "missing"})`);
      continue;
    }
    if (target.language !== alternateLanguage) {
      errors.push(`${relative}: ${alternateLanguage} hreflang target declares ${target.language}`);
    }
    if (alternateLinks(target.html).get(language) !== canonicalUrl) {
      errors.push(`${relative}: ${alternateLanguage} hreflang target is not reciprocal`);
    }
  }

  const languageLinks = extractLanguageLinks(html);
  const expectedShell = renderHeaderAndNotice({ language, languageLinks });
  const actualShell = html.match(/<header\b[^>]*class=["'][^"']*\bsite-header\b[^"']*["'][^>]*>[\s\S]*?<\/header>\s*<div\b[^>]*class=["'][^"']*\bpersonal-use-notice\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0] || "";
  if (actualShell !== expectedShell) errors.push(`${relative}: shared header/notice differs from the authoritative ${language} renderer`);
  const actualFooter = html.match(/<footer\b[^>]*class=["'][^"']*\bsite-footer\b[^"']*["'][^>]*>[\s\S]*?<\/footer>/i)?.[0] || "";
  if (actualFooter !== renderFooter(language)) errors.push(`${relative}: shared footer differs from the authoritative ${language} renderer`);
  if (!html.includes(`data-shell-version="${SHELL_VERSION}"`)) errors.push(`${relative}: current shell version marker is missing`);
  if (!html.includes(`/assets/site.min.css?v=${ASSET_VERSION}`)) errors.push(`${relative}: current stylesheet cache key is missing`);
  if (!html.includes(`/assets/site.min.js?v=${ASSET_VERSION}`)) errors.push(`${relative}: current script cache key is missing`);
  for (const tag of featureImageTags(html)) {
    if (attribute(tag, "sizes") !== FEATURE_IMAGE_SIZES) {
      errors.push(`${relative}: feature image sizes differs from the responsive-image policy`);
    }
  }
  if (!/<body\b[^>]*class=["'][^"']*\bartwork-page\b/i.test(html)) {
    const heroPicture = html.match(/<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/i)?.[0] || "";
    if (heroPicture) {
      for (const match of heroPicture.matchAll(/<(?:source|img)\b[^>]*>/gi)) {
        if (attribute(match[0], "sizes") !== HERO_IMAGE_SIZES) {
          errors.push(`${relative}: hero image sizes differs from the responsive-image policy`);
        }
      }
      const heroReference = heroPicture.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || "";
      const heroPhoto = photoForReference(heroReference);
      if (
        /<img\b[^>]*\bwidth=["']800["']/i.test(heroPicture)
        && !heroPhoto?.displayDerivative
        && !/\bsource-cap-800\b/i.test(heroPicture)
      ) {
        errors.push(`${relative}: 800px hero is missing its intrinsic-width cap`);
      }
      if (heroPhoto?.displayDerivative && /\bsource-cap-800\b/i.test(heroPicture)) {
        errors.push(`${relative}: governed display derivative is incorrectly capped to the smaller canonical width`);
      }
    }
  } else {
    if (repeatedArtworkSourceCards(html).length) {
      errors.push(`${relative}: related cards visibly repeat the primary artwork`);
    }
    if (/<picture\b[^>]*class=["'][^"']*\bhero-media\b/i.test(html)) {
      errors.push(`${relative}: hidden artwork hero media duplicates the visible primary photograph`);
    }
  }
  for (const match of html.matchAll(/<(?:article|a|button)\b[^>]*class=["'][^"']*\bwork-card\b(?!-)[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/gi)) {
    const tag = match[0].match(/<img\b[^>]*>/i)?.[0] || "";
    if (attribute(tag, "sizes") !== WORK_CARD_IMAGE_SIZES) errors.push(`${relative}: work-card image sizes is stale`);
  }
  for (const match of html.matchAll(/<(?:article|a|figure|div)\b[^>]*class=["'][^"']*\b(?:source-card|proof-card|series)\b(?!-)[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/gi)) {
    const tag = match[0].match(/<img\b[^>]*>/i)?.[0] || "";
    if (attribute(tag, "sizes") !== SUPPORT_CARD_IMAGE_SIZES) errors.push(`${relative}: support-card image sizes is stale`);
  }
  for (const match of html.matchAll(/<figure\b[^>]*class=["'][^"']*\barchive-photo\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/gi)) {
    const tag = match[0].match(/<img\b[^>]*>/i)?.[0] || "";
    if (attribute(tag, "sizes") !== ARCHIVE_IMAGE_SIZES) errors.push(`${relative}: archive image sizes is stale`);
  }
  const modalImageTag = html.match(/<img\b[^>]*\bid=["']modalImage["'][^>]*>/i)?.[0] || "";
  if (modalImageTag && attribute(modalImageTag, "sizes") !== MODAL_IMAGE_SIZES) {
    errors.push(`${relative}: modal image sizes is stale`);
  }

  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attribute(match[0], "href");
    if (!href || /^(?:https?:)?\/\//i.test(href) && new URL(href, canonicalUrl).origin !== SITE_ORIGIN) continue;
    if (/^(?:mailto|tel|javascript):/i.test(href)) {
      errors.push(`${relative}: prohibited or unsafe internal link protocol ${href}`);
      continue;
    }
    const targetUrl = new URL(href, canonicalUrl);
    if (targetUrl.origin !== SITE_ORIGIN) continue;
    if (isRetired(targetUrl.pathname.slice(1))) {
      errors.push(`${relative}: links to retired commercial route ${targetUrl.pathname}`);
      continue;
    }
    const targetRelative = await resolveArtifactTarget(targetUrl);
    if (!targetRelative) {
      errors.push(`${relative}: broken indexable internal link ${href}`);
      continue;
    }
    if (targetRelative.endsWith(".html")) {
      const targetHtml = await readFile(path.join(artifactRoot, targetRelative), "utf8");
      if (isNoindex(targetHtml)) errors.push(`${relative}: indexable page links to noindex alias ${href}`);
      if (targetUrl.hash) {
        const id = decodeURIComponent(targetUrl.hash.slice(1));
        if (!new RegExp(`\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(targetHtml)) {
          errors.push(`${relative}: broken internal fragment ${href}`);
        }
      }
    }
  }

  const imageReferences = [];
  const responsiveCandidates = [];
  for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const src = attribute(match[0], "src");
    if (src) imageReferences.push(src);
    for (const candidate of attribute(match[0], "srcset").split(",")) {
      const [value, descriptor = ""] = candidate.trim().split(/\s+/);
      if (value) {
        imageReferences.push(value);
        responsiveCandidates.push({ reference: value, descriptor });
      }
    }
  }
  for (const match of html.matchAll(/\bdata-full=(["'])([^"']+)\1/gi)) {
    imageReferences.push(match[2]);
  }
  for (const reference of imageReferences) {
    if (/^(?:data:|https?:\/\/)/i.test(reference)) {
      const url = new URL(reference, canonicalUrl);
      if (url.origin !== SITE_ORIGIN) continue;
    }
    const url = new URL(reference, canonicalUrl);
    const targetRelative = routeFile(url.pathname);
    if (!await fileExists(targetRelative)) errors.push(`${relative}: internal image is absent from artifact ${reference}`);
  }
  for (const { reference, descriptor } of responsiveCandidates) {
    if (!/^\d+w$/i.test(descriptor)) continue;
    const url = new URL(reference, canonicalUrl);
    if (url.origin !== SITE_ORIGIN) continue;
    const targetRelative = routeFile(url.pathname);
    if (!await fileExists(targetRelative)) continue;
    const metadata = await metadataFor(targetRelative);
    const declaredWidth = Number.parseInt(descriptor, 10);
    if (metadata.width !== declaredWidth) {
      errors.push(`${relative}: ${reference} declares ${descriptor} but encodes ${metadata.width}px`);
    }
    if (targetRelative.startsWith("assets/optimized-v2/")) {
      const originalRelative = targetRelative
        .replace(/^assets\/optimized-v2\//, "assets/")
        .replace(/-\d+\.(?:avif|webp)$/i, ".jpg");
      if (await fileExists(originalRelative)) {
        const originalMetadata = await metadataFor(originalRelative);
        if (metadata.width > originalMetadata.width || metadata.height > originalMetadata.height) {
          errors.push(`${relative}: ${reference} is larger than its genuine source image`);
        }
      }
    }
    if (targetRelative.startsWith("assets/display-derivatives-v1/")) {
      const governed = (PHOTO_RESOLUTION_MANIFEST.displayDerivatives || [])
        .find((record) => record.output.path === targetRelative);
      if (!governed) {
        errors.push(`${relative}: ${reference} is an ungoverned enlarged display derivative`);
      } else if (metadata.width !== governed.output.width || metadata.height !== governed.output.height) {
        errors.push(`${relative}: ${reference} differs from its governed display-resample geometry`);
      }
    }
  }
}

for (const { relative } of NATURAL_WIDTH_AVIF_FAMILIES) {
  if (!await fileExists(relative)) errors.push(`${relative}: required natural-width AVIF is absent from artifact`);
}

if (
  PHOTO_RESOLUTION_MANIFEST.schemaVersion !== 1
  || PHOTO_RESOLUTION_MANIFEST.policy?.generativeEnhancementUsed !== false
  || PHOTO_RESOLUTION_MANIFEST.summary?.canonicalSources !== 70
  || PHOTO_RESOLUTION_MANIFEST.summary?.genuineHigherOriginals !== 10
  || PHOTO_RESOLUTION_MANIFEST.summary?.sourceLimitedDisplayResamples !== 2
) {
  errors.push("photo-resolution manifest does not match the governed 70-source integrity policy");
}

for (const photo of PHOTO_RESOLUTION_MANIFEST.photos || []) {
  if (!await fileExists(photo.source)) {
    errors.push(`${photo.source}: governed canonical photograph is absent from artifact`);
    continue;
  }
  const sourceMetadata = await metadataFor(photo.source);
  if (sourceMetadata.width !== photo.width || sourceMetadata.height !== photo.height) {
    errors.push(`${photo.source}: canonical dimensions differ from the photo-resolution manifest`);
  }
  if (await sha256For(photo.source) !== photo.sha256) {
    errors.push(`${photo.source}: canonical hash differs from the photo-resolution manifest`);
  }
  for (const candidate of photo.responsiveCandidates || []) {
    if (!await fileExists(candidate.path)) {
      errors.push(`${candidate.path}: governed responsive candidate is absent from artifact`);
      continue;
    }
    const metadata = await metadataFor(candidate.path);
    if (metadata.width !== candidate.width || metadata.height !== candidate.height) {
      errors.push(`${candidate.path}: responsive geometry differs from the photo-resolution manifest`);
    }
    if (await sha256For(candidate.path) !== candidate.sha256) {
      errors.push(`${candidate.path}: responsive hash differs from the photo-resolution manifest`);
    }
    if (metadata.width > sourceMetadata.width || metadata.height > sourceMetadata.height) {
      errors.push(`${candidate.path}: optimized candidate exceeds genuine source ${photo.source}`);
    }
  }
}

for (const derivative of PHOTO_RESOLUTION_MANIFEST.displayDerivatives || []) {
  const source = derivative.source;
  const output = derivative.output;
  if (
    derivative.kind !== "display-resampled"
    || derivative.generative !== false
    || derivative.algorithm !== "sharp-cubic-2x"
    || derivative.crop !== false
    || derivative.sharpen !== false
    || derivative.denoise !== false
  ) {
    errors.push(`${output.path}: display derivative has an unsafe or incomplete provenance policy`);
  }
  if (!await fileExists(source.path) || !await fileExists(output.path)) continue;
  if (await sha256For(source.path) !== source.sha256 || await sha256For(output.path) !== output.sha256) {
    errors.push(`${output.path}: display derivative provenance hash mismatch`);
  }
  const sourceMetadata = await metadataFor(source.path);
  const outputMetadata = await metadataFor(output.path);
  if (
    sourceMetadata.width !== source.width
    || sourceMetadata.height !== source.height
    || outputMetadata.width !== output.width
    || outputMetadata.height !== output.height
    || output.width !== source.width * 2
    || output.height !== source.height * 2
  ) {
    errors.push(`${output.path}: display derivative does not preserve governed exact 2x geometry`);
  }
}

const notFoundHtml = await readFile(path.join(artifactRoot, "404.html"), "utf8");
const notFoundLanguageLinks = extractLanguageLinks(notFoundHtml);
const expectedNotFoundShell = renderHeaderAndNotice({
  language: "en",
  languageLinks: notFoundLanguageLinks,
  markCurrentLanguage: false,
});
const actualNotFoundShell = notFoundHtml.match(/<header\b[^>]*class=["'][^"']*\bsite-header\b[^"']*["'][^>]*>[\s\S]*?<\/header>\s*<div\b[^>]*class=["'][^"']*\bpersonal-use-notice\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0] || "";
if (actualNotFoundShell !== expectedNotFoundShell) errors.push("404.html: shared shell differs from the authoritative renderer");
if (notFoundHtml.match(/<footer\b[^>]*class=["'][^"']*\bsite-footer\b[^"']*["'][^>]*>[\s\S]*?<\/footer>/i)?.[0] !== renderFooter("en")) {
  errors.push("404.html: shared footer differs from the authoritative renderer");
}

const productionCss = await readFile(path.join(artifactRoot, "assets/site.min.css"), "utf8");
if (/object-fit\s*:\s*cover/i.test(productionCss)) errors.push("assets/site.min.css: unsafe full-artwork object-fit:cover treatment");
if (/(?<!backdrop-)filter\s*:\s*blur\(/i.test(productionCss)) errors.push("assets/site.min.css: image-affecting blur filter is prohibited");
if (/image-rendering\s*:\s*(?:pixelated|crisp-edges)/i.test(productionCss)) errors.push("assets/site.min.css: artificial pixel rendering is prohibited");
if (/scale\((?!1(?:\.0+)?\))/i.test(productionCss)) errors.push("assets/site.min.css: artificial image enlargement scale is prohibited");

if (errors.length) {
  throw new Error(`Public deployment artifact validation failed (${errors.length} issues):\n${errors.join("\n")}`);
}

console.log(JSON.stringify({
  artifactFiles: actualFiles.length,
  artifactHtmlFiles: artifactHtmlFiles.length,
  sourceHtmlFiles: sourceHtmlFiles.length,
  indexableUrls: sitemapUrls.length,
  languages: Object.fromEntries(languageCounts),
  commercialFindings: 0,
  brokenInternalLinks: 0,
  missingInternalImages: 0,
  canonicalIssues: 0,
  hreflangIssues: 0,
  shellIssues: 0,
  staleArtifactFiles: 0,
}, null, 2));
