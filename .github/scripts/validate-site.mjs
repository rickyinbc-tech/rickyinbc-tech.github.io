import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  sourceCardFamilies,
} from "./responsive-image-policy.mjs";
import { ASSET_VERSION, SHELL_VERSION } from "./site-shell.mjs";

const ORIGIN = "https://rickykwok.com";
const STYLESHEET_URL = `/assets/site.min.css?v=${ASSET_VERSION}`;
const SCRIPT_URL = `/assets/site.min.js?v=${ASSET_VERSION}`;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excludedDirectories = new Set([".git", ".github", ".wrangler", "_site", "assets", "node_modules", "seo-status"]);
const errors = [];
const artworkManifest = JSON.parse(await readFile(path.join(repoRoot, ".github/data/artwork-manifest.json"), "utf8"));
const edgeRedirectConfig = JSON.parse(await readFile(path.join(repoRoot, "edge/redirect-map.json"), "utf8"));
const translationGovernance = JSON.parse(await readFile(path.join(repoRoot, ".github/data/translation-governance.json"), "utf8"));
const sourceLedger = await readFile(path.join(repoRoot, ".github/data/source-ledger.csv"), "utf8");
const measurementGovernance = JSON.parse(await readFile(path.join(repoRoot, ".github/data/measurement-governance.json"), "utf8"));
const imageInventory = JSON.parse(await readFile(path.join(repoRoot, ".github/data/image-asset-inventory.json"), "utf8"));
const performanceReport = JSON.parse(await readFile(path.join(repoRoot, ".github/data/performance-report.json"), "utf8"));
const placeholderPatterns = [
  /此頁提供與原頁相對應/,
  /此页提供与原页面对应/,
  /不會把中文讀者帶回英文作為後備內容/,
  /不会把中文读者带回英文作为后备内容/,
  /<p\b[^>]*>\s*\.\s*<\/p>/i,
  /<h3\b[^>]*>\s*<\/h3>/i,
];
const implementationCommentaryPatterns = [
  /bilingual title gives the page a clear identity/i,
  /English and Chinese-name searches/i,
  /search[- ]engine (?:visibility|ranking|query)/i,
];
const genericImageAltPatterns = [
  /相關影像|相关影像|資料影像|资料影像|Artwork preview image\.?|作品預覽影像|作品预览影像|— photography by Ricky Kwok/i,
  /^(?:郭文棣)?(?:攝影|摄影)?作品《[^》]+》(?:完整(?:構圖|构图))?$/i,
  /^(?:相關|相关)(?:攝影|摄影)?作品《[^》]+》$/i,
  /^(?=.{1,30}$)[^。！？：:]+代表(?:影像|圖像|图像)$/u,
  /^《[^》]+》[，,][^，,。！？：:]{1,24}[，,]\s*\d{4}$/u,
  /^(?:Light Encroached Homes in Mong Kok|Fishpond Harvest in Hong Kong)\.?$/i,
  /^(?:Portrait|Documentary photograph) from Ricky Kwok(?:'s [^.]+)?\.?$/i,
];

function isGenericImageAlt(value) {
  return genericImageAltPatterns.some((pattern) => pattern.test(value.trim()));
}

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

function propertyContent(html, property) {
  const tag = html.match(new RegExp(`<meta\\b[^>]*\\bproperty=["']${property}["'][^>]*>`, "i"))?.[0] || "";
  return attribute(tag, "content").trim();
}

function isNoindex(html) {
  const robots = metaContent(html, "robots").toLowerCase();
  return robots.includes("noindex");
}

function alternateLinks(html) {
  const links = new Map();
  for (const match of html.matchAll(/<link\b[^>]*\brel=["']alternate["'][^>]*>/gi)) {
    const language = attribute(match[0], "hreflang");
    const href = attribute(match[0], "href");
    if (language && href) links.set(language, href);
  }
  return links;
}

function localRouteForEnglish(route) {
  if (route === "/selected-works/") return "/works/";
  if (route === "/prints/") return "/editions/";
  if (route === "/awards-recognition/") return "/awards/";
  return route;
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
    if (entry.isFile() && (entry.name === "index.html" || entry.name === "404.html")) files.push(fullPath);
  }
  return files;
}

const indexable = [];
const indexableDocuments = new Map();
const titleOwners = new Map();
const descriptionOwners = new Map();
const indexableEnglishRoutes = [];
const englishImageCounts = new Map();
let validatedImageUses = 0;

for (const file of await htmlFiles()) {
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");
  const route = routeFor(relative);
  const expectedCanonical = new URL(route, ORIGIN).href;
  const html = await readFile(file, "utf8");
  const noindex = isNoindex(html);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const description = metaContent(html, "description");
  const ogUpdatedTime = propertyContent(html, "og:updated_time");
  const schemaModifiedTime = html.match(/"dateModified":"([^"]+)"/)?.[1] || "";
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const canonical = canonicalFrom(html);
  const localized = relative.startsWith("zh-hant/") || relative.startsWith("zh-hans/");

  if (adjacentRepeatedSourceCardFamilies(html).length) {
    errors.push(`${relative}: adjacent related cards visibly repeat the same photograph`);
  }
  if (repeatedSourceCardFamilies(html).length) {
    errors.push(`${relative}: related cards reuse the same photograph`);
  }
  if (html.includes("/assets/site.min.css") && !html.includes(STYLESHEET_URL)) {
    errors.push(`${relative}: stylesheet cache key is not the current production version`);
  }
  if (html.includes("/assets/site.min.js") && !html.includes(SCRIPT_URL)) {
    errors.push(`${relative}: script cache key is not the current production version`);
  }
  if (/<a class=["']brand["'][^>]*\baria-label=/i.test(html)) {
    errors.push(`${relative}: visible brand text must remain the accessible link name`);
  }

  if (localized && !noindex) {
    for (const pattern of placeholderPatterns) {
      if (pattern.test(html)) errors.push(`${relative}: contains placeholder localization copy`);
    }
    if (!html.includes('class="language-switcher"') || !html.includes("/zh-hant/") || !html.includes("/zh-hans/")) {
      errors.push(`${relative}: incomplete three-language switcher`);
    }
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*English(?:\s+[^<]*)?<\/a>/gi)) {
      if (/^\/zh-(?:hant|hans)\//i.test(match[1])) {
        errors.push(`${relative}: English-labelled link points to localized route ${match[1]}`);
      }
    }
    if (relative.startsWith("zh-hans/") && html.includes("完整構圖")) {
      errors.push(`${relative}: Simplified Chinese page contains the Traditional Chinese composition label`);
    }
  }

  for (const pattern of implementationCommentaryPatterns) {
    if (pattern.test(html)) errors.push(`${relative}: contains public implementation commentary`);
  }

  if (/<\/source>/i.test(html)) errors.push(`${relative}: contains an invalid closing source tag`);
  for (const tag of featureImageTags(html)) {
    if (attribute(tag, "sizes") !== FEATURE_IMAGE_SIZES) {
      errors.push(`${relative}: feature image sizes does not match the rendered split layout`);
    }
  }
  if (!/<body\b[^>]*class=["'][^"']*\bartwork-page\b/i.test(html)) {
    const heroPicture = html.match(/<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/i)?.[0] || "";
    if (heroPicture) {
      for (const match of heroPicture.matchAll(/<(?:source|img)\b[^>]*>/gi)) {
        if (attribute(match[0], "sizes") !== HERO_IMAGE_SIZES) {
          errors.push(`${relative}: hero image sizes does not match the rendered split layout`);
        }
      }
      const heroReference = heroPicture.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || "";
      const heroPhoto = photoForReference(heroReference);
      if (
        /<img\b[^>]*\bwidth=["']800["']/i.test(heroPicture)
        && !heroPhoto?.displayDerivative
        && !/\bsource-cap-800\b/i.test(heroPicture)
      ) {
        errors.push(`${relative}: 800px hero is missing its honest intrinsic-width cap`);
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
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    validatedImageUses += 1;
    for (const required of ["alt", "width", "height", "sizes"]) {
      if (!attribute(tag, required)) errors.push(`${relative}: image is missing ${required}`);
    }
    if (!noindex && isGenericImageAlt(attribute(tag, "alt"))) {
      errors.push(`${relative}: image uses generic placeholder alt text`);
    }
  }
  const heroPicture = html.match(/<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/i)?.[0] || "";
  const heroTag = heroPicture.match(/<img\b[^>]*>/i)?.[0] || "";
  if (heroTag && (attribute(heroTag, "loading") !== "eager" || attribute(heroTag, "fetchpriority") !== "high")) {
    errors.push(`${relative}: hero image must load eagerly with high fetch priority`);
  }

  if (!title) errors.push(`${relative}: missing title`);
  if (!noindex && h1Count !== 1) errors.push(`${relative}: expected one H1, found ${h1Count}`);
  if (ogUpdatedTime && schemaModifiedTime && ogUpdatedTime !== schemaModifiedTime) {
    errors.push(`${relative}: Open Graph and structured-data modification dates disagree`);
  }
  if (/>Open artwork<\/a>|>查看相關作品<\/a>|>查看相关作品<\/a>/.test(html)) {
    errors.push(`${relative}: related-card link text is generic rather than destination-specific`);
  }

  for (const match of html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      errors.push(`${relative}: invalid JSON-LD (${error.message})`);
    }
  }

  if (!noindex) {
    if (!description) errors.push(`${relative}: missing meta description`);
    const titleLength = Array.from(title.replaceAll("&amp;", "&")).length;
    const descriptionLength = Array.from(description.replaceAll("&amp;", "&")).length;
    if (!localized && titleLength > 60) errors.push(`${relative}: English title is too long for a stable search result (${titleLength} characters)`);
    if (!localized && (descriptionLength < 100 || descriptionLength > 165)) {
      errors.push(`${relative}: English description must be 100–165 characters (${descriptionLength})`);
    }
    if (localized && (descriptionLength < 40 || descriptionLength > 85)) {
      errors.push(`${relative}: Chinese description must be 40–85 characters (${descriptionLength})`);
    }
    if (/(?:part of Ricky Kwok's personal, non-commercial photography archive|個人、非商業攝影檔案的一部分|个人、非商业摄影档案的一部分)/i.test(description)) {
      errors.push(`${relative}: search description still uses the retired boilerplate formula`);
    }
    if (!html.includes('class="site-header nav-enhanced"')) {
      errors.push(`${relative}: site header is not using the enhanced responsive shell`);
    }
    if (!html.includes(`data-shell-version="${SHELL_VERSION}"`)) {
      errors.push(`${relative}: page is not using the current authoritative shell version`);
    }
    if (!/<button\b[^>]*class=["'][^"']*\bnav-toggle\b[^"']*["'][^>]*aria-controls=["'][^"']*primary-navigation[^"']*language-navigation[^"']*["'][^>]*>/i.test(html)) {
      errors.push(`${relative}: missing static accessible mobile navigation control`);
    }
    if (!html.includes('id="primary-navigation"') || !html.includes('id="language-navigation"')) {
      errors.push(`${relative}: navigation regions lack stable IDs`);
    }
    if (canonical.replace(/\/$/, "") !== expectedCanonical.replace(/\/$/, "")) {
      errors.push(`${relative}: canonical ${canonical || "missing"} does not match ${expectedCanonical}`);
    }
    if (/edition[^<]{0,80}proposed/i.test(html)) errors.push(`${relative}: contains a proposed-edition claim`);
    if (/archival pigment print|fine-art photography/i.test(html)) {
      errors.push(`${relative}: contains retired print-production or professional-positioning language`);
    }
    if (titleOwners.has(title)) errors.push(`${relative}: duplicate title with ${titleOwners.get(title)}`);
    else titleOwners.set(title, relative);
    if (descriptionOwners.has(description)) errors.push(`${relative}: duplicate description with ${descriptionOwners.get(description)}`);
    else descriptionOwners.set(description, relative);
    for (const property of ["og:title", "og:description", "og:type", "og:url", "og:image", "og:image:alt", "og:image:width", "og:image:height", "og:site_name", "og:locale"]) {
      if (!propertyContent(html, property)) errors.push(`${relative}: missing ${property}`);
    }
    for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"]) {
      if (!metaContent(html, name)) errors.push(`${relative}: missing ${name}`);
    }
    if (
      isGenericImageAlt(propertyContent(html, "og:image:alt"))
      || isGenericImageAlt(metaContent(html, "twitter:image:alt"))
    ) {
      errors.push(`${relative}: social image uses generic placeholder alt text`);
    }
    if (relative.startsWith("zh-hans/")) {
      const localeAlternates = [...html.matchAll(/<meta\b[^>]*\bproperty=["']og:locale:alternate["'][^>]*>/gi)]
        .map((match) => attribute(match[0], "content"));
      if (propertyContent(html, "og:locale") !== "zh_CN") {
        errors.push(`${relative}: Simplified Chinese Open Graph locale must be zh_CN`);
      }
      if (!localeAlternates.includes("zh_HK") || localeAlternates.includes("zh_CN")) {
        errors.push(`${relative}: Simplified Chinese Open Graph alternates must include zh_HK without duplicating zh_CN`);
      }
    }
    if (propertyContent(html, "og:url").replace(/\/$/, "") !== expectedCanonical.replace(/\/$/, "")) {
      errors.push(`${relative}: og:url does not match the canonical URL`);
    }
    if (!/^\d+$/.test(propertyContent(html, "og:image:width")) || !/^\d+$/.test(propertyContent(html, "og:image:height"))) {
      errors.push(`${relative}: social image dimensions must be positive integers`);
    }
    const alternates = alternateLinks(html);
    for (const language of ["en", "zh-Hant", "zh-Hans", "x-default"]) {
      if (!alternates.has(language)) errors.push(`${relative}: missing ${language} hreflang alternate`);
    }
    if (localized) {
      const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "";
      const visible = body.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
      const chineseCharacters = (visible.match(/[\u3400-\u9fff]/g) || []).length;
      if (chineseCharacters < 80) errors.push(`${relative}: localized body is too thin (${chineseCharacters} Chinese characters)`);
    } else {
      indexableEnglishRoutes.push(route);
      englishImageCounts.set(route, (html.match(/<img\b/gi) || []).length);
    }
    indexableDocuments.set(route, { html, relative });
    indexable.push(expectedCanonical);
  }

  for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (!value) {
      errors.push(`${relative}: empty href or src attribute`);
      continue;
    }
    if (value.startsWith("#") || /^(?:mailto:|tel:|javascript:|data:)/i.test(value)) continue;
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

for (const { relative } of NATURAL_WIDTH_AVIF_FAMILIES) {
  if (!await exists(path.join(repoRoot, relative))) {
    errors.push(`${relative}: required natural-width AVIF variant is missing`);
  }
}

for (const route of indexableEnglishRoutes) {
  const localizedRoute = localRouteForEnglish(route);
  for (const language of ["zh-hant", "zh-hans"]) {
    const file = routeToFile(`/${language}${localizedRoute}`);
    if (!await exists(file)) {
      errors.push(`${route}: missing ${language} counterpart ${localizedRoute}`);
      continue;
    }
    const html = await readFile(file, "utf8");
    if (isNoindex(html)) errors.push(`${route}: ${language} counterpart is noindex`);
    const englishImages = englishImageCounts.get(route) || 0;
    const localizedImages = (html.match(/<img\b/gi) || []).length;
    const minimumImages = Math.max(englishImages - 2, 0);
    if (localizedImages < minimumImages) {
      errors.push(`${route}: ${language} counterpart has ${localizedImages} images; expected at least ${minimumImages}`);
    }
  }
}

function schemaNodes(value) {
  if (Array.isArray(value)) return value.flatMap(schemaNodes);
  if (!value || typeof value !== "object") return [];
  return [value, ...Object.values(value).flatMap(schemaNodes)];
}

function parsedSchemaNodes(html) {
  const values = [];
  for (const match of html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      values.push(...schemaNodes(JSON.parse(match[1])));
    } catch {
      // The earlier generic JSON-LD check reports a useful parsing error.
    }
  }
  return values;
}

for (const [route, page] of indexableDocuments) {
  const pageSchemaTypes = ["WebPage", "ProfilePage", "CollectionPage", "ContactPage", "AboutPage", "Article"];
  const hasPageSchema = parsedSchemaNodes(page.html).some((node) => pageSchemaTypes.some((type) => matchesType(node, type)));
  if (!hasPageSchema) errors.push(`${page.relative}: structured data has no page-level schema type for ${route}`);
}

for (const route of ["/awards-recognition/", "/zh-hant/awards/", "/zh-hans/awards/"]) {
  const page = indexableDocuments.get(route);
  if (!page) {
    errors.push(`${route}: awards evidence register is missing`);
    continue;
  }
  const collection = parsedSchemaNodes(page.html).find((node) => matchesType(node, "CollectionPage"));
  const resultList = collection?.mainEntity;
  const items = Array.isArray(resultList?.itemListElement) ? resultList.itemListElement : [];
  const positions = items.map((item) => Number(item.position));
  if (Number(resultList?.numberOfItems) !== 31 || items.length !== 31) {
    errors.push(`${page.relative}: awards ItemList must contain exactly 31 competition results`);
  }
  if (positions.some((position, index) => position !== index + 1)) {
    errors.push(`${page.relative}: awards ItemList positions must run consecutively from 1 to 31`);
  }
  if (items.some((item) => /Associate of the Royal Photographic Society|ARPS/i.test(item.name || ""))) {
    errors.push(`${page.relative}: ARPS must remain outside the 31 competition-result ItemList`);
  }
  const provisionalHsbc = items.find((item) => Number(item.position) === 21);
  if (!/(?:grade C|C 級|C 级)/.test(provisionalHsbc?.name || "") || provisionalHsbc?.url !== `${ORIGIN}${route}#expanded-record`) {
    errors.push(`${page.relative}: provisional HSBC result must retain its C-grade caveat and internal evidence URL`);
  }
  const coreSection = page.html.match(/<section\b[^>]*\bid=["']core-record["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  const expandedSection = page.html.match(/<section\b[^>]*\bid=["']expanded-record["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  if ((coreSection.match(/<li\b/gi) || []).length !== 17) {
    errors.push(`${page.relative}: visible core record must contain 17 results`);
  }
  if ((expandedSection.match(/<li\b/gi) || []).length !== 14) {
    errors.push(`${page.relative}: visible expanded record must contain 14 results`);
  }
  for (const id of ["record-overview", "evidence-method", "wording-corrections", "not-counted"]) {
    if (!page.html.includes(`id="${id}"`)) errors.push(`${page.relative}: missing awards evidence section #${id}`);
  }
}

function matchesType(node, type) {
  return node?.["@type"] === type || (Array.isArray(node?.["@type"]) && node["@type"].includes(type));
}

function heroImageSource(html) {
  return html.match(/<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || "";
}

function featureImageSource(html) {
  return html.match(/class=["'][^"']*\bfeature-image\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || "";
}

const manifestIds = new Set();
const manifestCanonicalPaths = new Set();
if (artworkManifest.schemaVersion !== 2 || !artworkManifest.recordPolicy) {
  errors.push("artwork manifest must declare the governed v2 record policy");
}
if (!Array.isArray(artworkManifest.artworks) || !artworkManifest.artworks.length) {
  errors.push("artwork manifest has no artwork records");
}

for (const artwork of artworkManifest.artworks || []) {
  const { id, canonicalPath, primaryImage } = artwork;
  if (!id || !canonicalPath || !primaryImage?.url || !primaryImage?.width || !primaryImage?.height || !primaryImage?.mimeType) {
    errors.push(`artwork manifest record is incomplete: ${id || "unknown"}`);
    continue;
  }
  if (manifestIds.has(id)) errors.push(`artwork manifest duplicate id: ${id}`);
  manifestIds.add(id);
  if (manifestCanonicalPaths.has(canonicalPath)) errors.push(`artwork manifest duplicate canonical path: ${canonicalPath}`);
  manifestCanonicalPaths.add(canonicalPath);
  const expectedImageUrl = new URL(primaryImage.url, ORIGIN).href;
  const expectedImageId = `${expectedImageUrl}#image`;
  const expectedEntityId = `${ORIGIN}/#artwork-${id}`;
  let expectedRelatedFamilies = null;

  for (const [language, prefix] of [["en", ""], ["zh-Hant", "/zh-hant"], ["zh-Hans", "/zh-hans"]]) {
    const route = `${prefix}${canonicalPath}`.replace(/\/\//g, "/");
    const page = indexableDocuments.get(route);
    if (!page) {
      errors.push(`${id}: missing indexable ${language} artwork page ${route}`);
      continue;
    }
    const { html, relative } = page;
    const relatedFamilies = sourceCardFamilies(html).filter(Boolean);
    if (expectedRelatedFamilies === null) expectedRelatedFamilies = relatedFamilies;
    else if (JSON.stringify(relatedFamilies) !== JSON.stringify(expectedRelatedFamilies)) {
      errors.push(`${relative}: related-card image sequence differs across languages for ${id}`);
    }
    if (featureImageSource(html) !== primaryImage.url) {
      errors.push(`${relative}: feature primary image does not match artwork manifest for ${id}`);
    }
    const ogImage = html.match(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    if (ogImage !== expectedImageUrl) {
      errors.push(`${relative}: Open Graph image does not match artwork manifest for ${id}`);
    }
    const nodes = parsedSchemaNodes(html);
    const webpage = nodes.find((node) => matchesType(node, "WebPage") && node["@id"] === `${ORIGIN}${route}#webpage`);
    const visual = nodes.find((node) => matchesType(node, "VisualArtwork") && node["@id"] === expectedEntityId);
    const image = nodes.find((node) => matchesType(node, "ImageObject") && node["@id"] === expectedImageId);
    if (!webpage || webpage.mainEntity?.["@id"] !== expectedEntityId || webpage.primaryImageOfPage?.["@id"] !== expectedImageId) {
      errors.push(`${relative}: WebPage image/entity graph does not match artwork manifest for ${id}`);
    }
    if (!visual || visual.image?.["@id"] !== expectedImageId) {
      errors.push(`${relative}: VisualArtwork image graph does not match artwork manifest for ${id}`);
    }
    if (!image || image.contentUrl !== expectedImageUrl || Number(image.width) !== Number(primaryImage.width) || Number(image.height) !== Number(primaryImage.height) || image.encodingFormat !== primaryImage.mimeType) {
      errors.push(`${relative}: ImageObject does not match artwork manifest for ${id}`);
    }
    if (!html.includes('data-artwork-governance="v2"')) {
      errors.push(`${relative}: artwork facts do not use governance contract v2`);
    }
    if (!/<figure\b[^>]*class=["'][^"']*\bartwork-figure\b[^"']*["'][^>]*>[\s\S]*?\bfeature-image\b[\s\S]*?<figcaption\b[^>]*class=["'][^"']*\bartwork-caption\b[^"']*["'][^>]*>[\s\S]*?<\/figcaption>[\s\S]*?<\/figure>/i.test(html)) {
      errors.push(`${relative}: artwork image and caption are not grouped in an artwork figure`);
    }
    if (/<p\b[^>]*class=["'][^"']*\bartwork-caption\b/i.test(html)) {
      errors.push(`${relative}: artwork caption must use figcaption`);
    }
    if (!html.includes("personal-use-notice")) errors.push(`${relative}: missing personal non-commercial archive notice`);
  }
}

for (const [route, marker] of [
  ["/", "Contact sheet"],
  ["/zh-hant/", "接觸印樣"],
  ["/zh-hans/", "接触印样"],
]) {
  const page = indexableDocuments.get(route);
  if (!page || !page.html.includes(marker)) errors.push(`${route}: homepage does not lead into selected work`);
  if (page?.html.includes("archive-guide")) errors.push(`${route}: homepage restored the retired duplicate archive guide`);
}
for (const [route, marker] of [
  ["/biography/", "This site is maintained as a personal hobby archive for viewing and documentation only. It is not operated as a business."],
  ["/zh-hant/biography/", "此網站由個人興趣維護，只供觀賞與記錄，並非商業經營。"],
  ["/zh-hans/biography/", "此网站由个人兴趣维护，只供观赏与记录，并非商业经营。"],
]) {
  const page = indexableDocuments.get(route);
  if (!page?.html.includes(marker)) errors.push(`${route}: biography lacks the complete personal-hobby archive disclosure`);
}

const thematicEditIds = [
  "hong-kong-urban-light-studies",
  "monochrome-documentary",
  "sport-abstraction",
  "studio-collision-studies",
  "village-ritual-photography"
];
for (const [language, prefix] of [["en", ""], ["zh-Hant", "/zh-hant"], ["zh-Hans", "/zh-hans"]]) {
  for (const id of thematicEditIds) {
    const route = `${prefix}/works/${id}/`;
    const page = indexableDocuments.get(route);
    if (!page || !page.html.includes('data-page-type="thematic-edit"')) errors.push(`${route}: missing governed thematic-edit marker`);
    const collection = page && parsedSchemaNodes(page.html).find((node) => matchesType(node, "CollectionPage"));
    if (!collection) errors.push(`${route}: thematic edit lacks CollectionPage schema`);
  }
  const selectedRoute = language === "en" ? "/selected-works/" : `${prefix}/works/`;
  const selected = indexableDocuments.get(selectedRoute);
  for (const id of thematicEditIds) {
    if (!selected?.html.includes(`${prefix}/works/${id}/`)) errors.push(`${selectedRoute}: missing thematic edit ${id}`);
  }
}

if (translationGovernance.schemaVersion !== 1 || translationGovernance.identity?.displayName !== "Ricky Kwok 郭文棣") {
  errors.push("translation governance is missing the approved identity contract");
}
if (translationGovernance.rightsTerms?.acquisition || translationGovernance.rightsTerms?.licensing) {
  errors.push("translation governance retains retired acquisition or licensing fields");
}
if (/(?:Image Licensing|Media Kit|Studio Standards)/i.test(sourceLedger)) {
  errors.push("source ledger retains dormant commercial page classifications");
}
for (const series of ["ritual", "collision", "motion", "city-light"]) {
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    if (!translationGovernance.series?.[series]?.[locale]) errors.push(`translation governance lacks ${series} ${locale}`);
  }
}

const siteJs = await readFile(path.join(repoRoot, "assets/site.js"), "utf8");
const siteCss = await readFile(path.join(repoRoot, "assets/site.css"), "utf8");
const minifiedSiteJs = await readFile(path.join(repoRoot, "assets/site.min.js"), "utf8");
const minifiedSiteCss = await readFile(path.join(repoRoot, "assets/site.min.css"), "utf8");
if (!siteJs.includes("const ANALYTICS_DISABLED = true;") || /googletagmanager|google-analytics|data-analytics-choice|analytics-consent/i.test(siteJs)) {
  errors.push("analytics must remain disabled without a consent banner or Google loader");
}
if (minifiedSiteJs.length >= siteJs.length * 0.9 || minifiedSiteCss.length >= siteCss.length * 0.9) {
  errors.push("production CSS and JavaScript assets must remain minified");
}
if (measurementGovernance.collectionStatus !== "disabled" || measurementGovernance.property !== null) {
  errors.push("measurement governance must declare analytics disabled");
}
for (const marker of ["prefers-reduced-motion", "forced-colors"]) {
  if (!siteCss.includes(marker)) errors.push(`accessibility stylesheet lacks ${marker}`);
}
if (/\.analytics-consent/i.test(siteCss)) errors.push("stylesheet still contains the removed analytics banner");
const visualSystemContract = "/* Gallery-first visual system contract.";
const visualSystemContractIndex = siteCss.lastIndexOf(visualSystemContract);
if (visualSystemContractIndex === -1) {
  errors.push("stylesheet lacks the final gallery-first visual system contract");
} else {
  const visualRules = siteCss.slice(visualSystemContractIndex);
  for (const marker of [
    "@media (min-width: 980px)",
    "@media (max-width: 640px)",
    "body:not(.artwork-page) .hero.has-semantic-media .hero-media img",
    "object-fit: contain",
    "object-position: center",
    "transform: none",
    ".gallery-grid",
    "columns: 3",
    ".work-card-link",
    ".work-caption",
    "position: static",
    ".series img",
    ".artwork-page .hero.page-hero .hero-media",
    "body.menu-open",
  ]) {
    if (!visualRules.includes(marker)) errors.push(`final gallery-first visual system contract lacks ${marker}`);
  }
  if (/object-fit\s*:\s*cover|transform\s*:\s*scale\(/i.test(visualRules)) {
    errors.push("final gallery-first visual system contract must not crop or scale photography");
  }
}
for (const match of siteCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selector = match[1];
  const declarations = match[2];
  if (
    selector.includes(".artwork-page")
    && !selector.includes(":not(.artwork-page)")
    && /object-fit\s*:\s*cover/i.test(declarations)
  ) {
    errors.push(`artwork detail pages must never crop photography (${selector.trim()})`);
  }
}
if (!/\.site-header\s*\{[^}]*position:\s*sticky/i.test(siteCss)) {
  errors.push("site header must be sticky and remain in flow so it cannot cover the archive notice");
}
if (!/\.hero\.has-semantic-media\s*\{[\s\S]*?padding-top:\s*0/i.test(siteCss)) {
  errors.push("responsive artwork hero must not use a fixed header-height offset");
}
for (const marker of ["addMobileNavigation", "markCurrentNavigation", "aria-expanded", "is-menu-open", "aria-pressed", "filterStatusLabel", "MODAL_IMAGE_SIZES", "responsiveSrcset"]) {
  if (!siteJs.includes(marker)) errors.push(`accessible interaction contract lacks ${marker}`);
}
const implementedEvents = new Set(Array.from(siteJs.matchAll(/trackEvent\("([a-z0-9_]+)"/g), (match) => match[1]));
for (const eventName of measurementGovernance.events || []) {
  if (!implementedEvents.has(eventName)) errors.push(`measurement governance event is not implemented: ${eventName}`);
}
for (const eventName of implementedEvents) {
  if (!measurementGovernance.events?.includes(eventName)) errors.push(`implemented event is not governed: ${eventName}`);
}
if (imageInventory.summary?.missingDimensions !== 0 || imageInventory.summary?.missingSizes !== 0 || imageInventory.summary?.imageUses !== validatedImageUses) {
  errors.push("image inventory is stale or violates the complete image-attribute contract");
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
if (imageInventory.summary?.uniquePrimarySources !== 69) {
  errors.push("image inventory must group the 69 displayed photographs by canonical family");
}
if (performanceReport.status !== "pass" || performanceReport.measured?.maxMissingImageDimensions !== 0 || performanceReport.measured?.maxMissingImageSizes !== 0) {
  errors.push("performance governance report does not pass");
}

const workerSource = await readFile(path.join(repoRoot, "edge/cloudflare-worker.mjs"), "utf8");
for (const header of ["content-security-policy", "permissions-policy", "referrer-policy", "strict-transport-security", "x-content-type-options", "x-frame-options"]) {
  if (!workerSource.includes(`"${header}"`)) errors.push(`edge worker lacks ${header}`);
}

for (const [route, page] of indexableDocuments) {
  const hasHero = /<[^>]+class=["'][^"']*\bhero\b[^"']*["'][^>]*>/i.test(page.html);
  const isArtworkPage = /<body\b[^>]*class=["'][^"']*\bartwork-page\b/i.test(page.html);
  if (hasHero && !isArtworkPage && !heroImageSource(page.html)) {
    errors.push(`${page.relative}: visual hero lacks semantic responsive image media`);
  }
  if (isArtworkPage && !featureImageSource(page.html)) {
    errors.push(`${page.relative}: artwork page lacks its visible semantic primary photograph`);
  }
  if (hasHero && /--hero-image/i.test(page.html)) {
    errors.push(`${page.relative}: visual hero still relies on CSS-only image media`);
  }
}

const staticAliasTargets = new Map();
for (const [route, page] of indexableDocuments) {
  // Indexable pages must never be legacy redirect sources.
  if (/<meta\s+http-equiv=["']refresh["']/i.test(page.html)) errors.push(`${page.relative}: indexable page contains a client redirect`);
}
for (const file of await htmlFiles()) {
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");
  const route = routeFor(relative);
  const html = await readFile(file, "utf8");
  const target = html.match(/<meta\s+http-equiv=["']refresh["']\s+content=["'][^"']*url\s*=\s*([^"']+)["']/i)?.[1]?.trim();
  if (target) staticAliasTargets.set(route, target);
}
for (const [route, target] of staticAliasTargets) {
  if (edgeRedirectConfig.redirects?.[route] !== target) {
    errors.push(`${route}: edge redirect map does not match static fallback target ${target}`);
  }
  const destination = new URL(target, ORIGIN);
  const destinationFile = routeToFile(destination.pathname);
  if (!await exists(destinationFile)) errors.push(`${route}: edge redirect target is missing ${destination.pathname}`);
  else if (isNoindex(await readFile(destinationFile, "utf8"))) errors.push(`${route}: edge redirect target is noindex ${destination.pathname}`);
}
for (const route of Object.keys(edgeRedirectConfig.redirects || {})) {
  if (!staticAliasTargets.has(route)) errors.push(`${route}: edge redirect map has no matching static fallback alias`);
}
if (edgeRedirectConfig.canonicalOrigin !== ORIGIN) {
  errors.push(`edge redirect canonical origin must be ${ORIGIN}`);
}
const expectedLegacyHostRedirects = {
  "blog.rickykwok.com": { "/": "/journal/", "/feed": "/journal/" },
  "photo.rickykwok.com": { "/": "/" }
};
for (const [hostname, expectedPaths] of Object.entries(expectedLegacyHostRedirects)) {
  const hostMap = edgeRedirectConfig.hostRedirects?.[hostname];
  if (!hostMap) {
    errors.push(`edge redirect map is missing host redirects for ${hostname}`);
    continue;
  }
  for (const [source, target] of Object.entries(expectedPaths)) {
    if (hostMap[source] !== target) errors.push(`edge redirect ${hostname}${source} must map to ${target}`);
  }
  for (const [source, target] of Object.entries(hostMap)) {
    if (!source.startsWith("/") || source.includes("*")) errors.push(`edge host redirect ${hostname}${source} is not an exact path`);
    const destination = new URL(target, ORIGIN);
    if (!await exists(routeToFile(destination.pathname))) {
      errors.push(`edge host redirect ${hostname}${source} has a missing destination ${destination.pathname}`);
    }
  }
}
const expectedGoneHosts = ["blog.rickykwok.com", "select.rickykwok.com"];
const configuredGoneHosts = new Set(edgeRedirectConfig.goneHosts || []);
for (const hostname of expectedGoneHosts) {
  if (!configuredGoneHosts.has(hostname)) errors.push(`edge redirect map must permanently remove legacy host ${hostname}`);
}
if (edgeRedirectConfig.hostRedirects?.["select.rickykwok.com"]) {
  errors.push("legacy host select.rickykwok.com must not redirect into the photography archive");
}
const requiredGonePrefixes = [
  "/available-prints/", "/contact/", "/editions/", "/licensing/", "/press/", "/prints/", "/privacy/", "/shipping-returns/", "/studio-standards/", "/terms/",
  "/zh-hant/available-prints/", "/zh-hant/contact/", "/zh-hant/editions/", "/zh-hant/licensing/", "/zh-hant/press/", "/zh-hant/prints/", "/zh-hant/privacy/", "/zh-hant/shipping-returns/", "/zh-hant/studio-standards/", "/zh-hant/terms/",
  "/zh-hans/available-prints/", "/zh-hans/contact/", "/zh-hans/editions/", "/zh-hans/licensing/", "/zh-hans/press/", "/zh-hans/prints/", "/zh-hans/privacy/", "/zh-hans/shipping-returns/", "/zh-hans/studio-standards/", "/zh-hans/terms/",
];
const configuredGonePrefixes = new Set(edgeRedirectConfig.gonePathPrefixes || []);
for (const prefix of requiredGonePrefixes) {
  if (!configuredGonePrefixes.has(prefix)) errors.push(`edge redirect map must return Gone for retired path prefix ${prefix}`);
  if (edgeRedirectConfig.redirects?.[prefix]) errors.push(`retired path prefix ${prefix} must not redirect to an indexable page`);
}
const requiredBlockedExactPaths = [
  "/.gitignore",
  "/package-lock.json",
  "/package.json",
  "/assets/site.css",
  "/assets/site.js",
];
const configuredBlockedExactPaths = new Set(edgeRedirectConfig.blockedExactPaths || []);
for (const pathname of requiredBlockedExactPaths) {
  if (!configuredBlockedExactPaths.has(pathname)) errors.push(`edge redirect map must block build-only file ${pathname}`);
}
const requiredBlockedPathPrefixes = [
  "/.git/",
  "/.github/",
  "/.wrangler/",
  "/_site/",
  "/edge/",
  "/node_modules/",
  "/seo-status/",
];
const configuredBlockedPathPrefixes = new Set(edgeRedirectConfig.blockedPathPrefixes || []);
for (const prefix of requiredBlockedPathPrefixes) {
  if (!configuredBlockedPathPrefixes.has(prefix)) errors.push(`edge redirect map must block build-only path prefix ${prefix}`);
}

const sitemap = await readFile(path.join(repoRoot, "sitemap.xml"), "utf8");
const sitemapUrls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
const expected = [...indexable].sort();
const actual = [...sitemapUrls].sort();
if (JSON.stringify(expected) !== JSON.stringify(actual)) {
  errors.push(`sitemap parity failed: ${expected.length} indexable pages vs ${actual.length} sitemap URLs`);
}
const expectedForwardedHosts = [];
const configuredForwardedHosts = new Set(edgeRedirectConfig.forwardedHosts || []);
for (const hostname of expectedForwardedHosts) {
  if (!configuredForwardedHosts.has(hostname)) errors.push(`edge redirect map is missing preserved forwarding host ${hostname}`);
}
for (const hostname of configuredForwardedHosts) {
  if (!/^(?:[a-z0-9-]+\.)+rickykwok\.com$/.test(hostname)) errors.push(`edge forwarded host is invalid: ${hostname}`);
}

const imageSitemap = await readFile(path.join(repoRoot, "image-sitemap.xml"), "utf8");
const imageBlocks = Array.from(imageSitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g));
const imageEntries = new Map(imageBlocks.map((block) => [
  block[1],
  Array.from(block[2].matchAll(/<image:loc>([^<]+)<\/image:loc>/g), (match) => match[1])
]));
const expectedImageOwners = new Map((artworkManifest.artworks || []).map((artwork) => [
  new URL(artwork.canonicalPath, ORIGIN).href,
  new URL(artwork.primaryImage.url, ORIGIN).href
]));
if (imageEntries.size !== expectedImageOwners.size) {
  errors.push(`image sitemap ownership parity failed: ${imageEntries.size} entries vs ${expectedImageOwners.size} artwork records`);
}
for (const [pageUrl, imageUrl] of expectedImageOwners) {
  const actualImages = imageEntries.get(pageUrl) || [];
  if (actualImages.length !== 1 || actualImages[0] !== imageUrl) {
    errors.push(`image sitemap does not assign exactly one declared primary image to ${pageUrl}`);
  }
}
for (const [pageUrl, images] of imageEntries) {
  if (!expectedImageOwners.has(pageUrl)) errors.push(`image sitemap has non-artwork owner ${pageUrl}`);
  if (images.length !== 1) errors.push(`image sitemap owner has ${images.length} images: ${pageUrl}`);
}

const retiredBusinessRoutes = [
  "/available-prints/", "/collect/", "/editions/", "/prints/", "/licensing/", "/contact/", "/contact/thanks/", "/shipping-returns/", "/studio-standards/", "/terms/", "/privacy/", "/press/", "/press/cv/", "/press/media-kit/",
  "/zh-hant/available-prints/", "/zh-hant/collect/", "/zh-hant/prints/", "/zh-hant/editions/", "/zh-hant/licensing/", "/zh-hant/contact/", "/zh-hant/contact/thanks/", "/zh-hant/shipping-returns/", "/zh-hant/studio-standards/", "/zh-hant/terms/", "/zh-hant/privacy/", "/zh-hant/press/", "/zh-hant/press/cv/", "/zh-hant/press/media-kit/",
  "/zh-hans/available-prints/", "/zh-hans/collect/", "/zh-hans/prints/", "/zh-hans/editions/", "/zh-hans/licensing/", "/zh-hans/contact/", "/zh-hans/contact/thanks/", "/zh-hans/shipping-returns/", "/zh-hans/studio-standards/", "/zh-hans/terms/", "/zh-hans/privacy/", "/zh-hans/press/", "/zh-hans/press/cv/", "/zh-hans/press/media-kit/"
];
for (const route of retiredBusinessRoutes) {
  if (indexableDocuments.has(route)) errors.push(`${route}: retired business route must not be indexable`);
}

const forbiddenLocalPath = /^\/(?:available-prints|collect|prints|editions|licensing|contact|shipping-returns|studio-standards|terms|privacy|press)(?:\/|$)|^\/zh-(?:hant|hans)\/(?:available-prints|collect|prints|editions|licensing|contact|shipping-returns|studio-standards|terms|privacy|press)(?:\/|$)/i;
const forbiddenExternalHref = /^mailto:|behance\.net|facebook\.com|instagram\.com|flickr\.com|dcfever\.com/i;
const allowedEvidenceExternalHrefs = new Set([
  "https://www.facebook.com/HuaweimobileHK/photos/%E5%B0%88%E6%A5%AD%E8%A9%95%E5%AF%A9%E7%8D%8E%E9%83%AD%E6%96%87%E6%A3%A3/877264475683513/",
  "https://www.dcfever.com/column/read.php?id=3442",
]);
for (const [route, page] of indexableDocuments) {
  if (!page.html.includes("personal-use-notice")) errors.push(`${page.relative}: missing site-wide personal archive notice`);
  const expectedNotice = route.startsWith("/zh-hant/")
    ? "個人、非商業攝影檔案。"
    : route.startsWith("/zh-hans/")
      ? "个人、非商业摄影档案。"
      : "Personal, non-commercial photography archive.";
  if (!page.html.includes(expectedNotice)) {
    errors.push(`${page.relative}: personal archive notice is not the approved concise wording`);
  }
  if (/Written permission is required for reproduction|書面許可|书面许可/i.test(page.html)) {
    errors.push(`${page.relative}: copyright copy implies a permission or licensing pathway`);
  }
  if (/香港藝術及紀實攝影|香港艺术及纪实摄影/.test(page.html)) {
    errors.push(`${page.relative}: homepage metadata uses the retired art-market framing`);
  }
  if (
    /\/zh-hant\/works\/|\/zh-hans\/works\//.test(route)
    && /<strong>(?:藝術家|艺术家):<\/strong>/.test(page.html)
  ) {
    errors.push(`${page.relative}: artwork facts must identify Ricky as photographer, not artist`);
  }
  if (
    route.startsWith("/zh-hant/works/")
    && page.html.includes('class="artwork-figure"')
    && !/<figcaption class="artwork-caption">[^<]*郭文棣攝影/.test(page.html)
  ) {
    errors.push(`${page.relative}: Traditional Chinese artwork caption is not localized`);
  }
  if (
    route.startsWith("/zh-hans/works/")
    && page.html.includes('class="artwork-figure"')
    && !/<figcaption class="artwork-caption">[^<]*郭文棣摄影/.test(page.html)
  ) {
    errors.push(`${page.relative}: Simplified Chinese artwork caption is not localized`);
  }
  if (page.html.includes('class="artwork-figure"')) {
    const figure = page.html.match(/<figure class="artwork-figure">[\s\S]*?<\/figure>/i)?.[0] || "";
    const figureImage = figure.match(/<img\b[^>]*>/i)?.[0] || "";
    if (attribute(figureImage, "loading") !== "eager" || attribute(figureImage, "fetchpriority") !== "high") {
      errors.push(`${page.relative}: sole artwork presentation must load eagerly with high priority`);
    }
  }
  if (/<form\b|formsubmit\.co|studio@rickykwok\.com|data-inquiry-form/i.test(page.html)) {
    errors.push(`${page.relative}: contains a retired business form or contact mechanism`);
  }
  for (const match of page.html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1];
    let url;
    try {
      url = new URL(href, ORIGIN);
    } catch {
      continue;
    }
    const isSiteHost = url.hostname === "rickykwok.com" || url.hostname === "www.rickykwok.com";
    if ((forbiddenExternalHref.test(href) && !allowedEvidenceExternalHrefs.has(href)) || (isSiteHost && forbiddenLocalPath.test(url.pathname))) {
      errors.push(`${page.relative}: links to retired business pathway ${href}`);
    }
  }
  for (const node of parsedSchemaNodes(page.html)) {
    for (const type of ["Product", "Offer", "Service", "ProfessionalService", "LocalBusiness"]) {
      if (matchesType(node, type)) errors.push(`${page.relative}: structured data contains retired commercial type ${type}`);
    }
    for (const key of ["jobTitle", "sameAs", "license", "acquireLicensePage", "offers", "contactPoint", "potentialAction"]) {
      if (Object.hasOwn(node, key)) errors.push(`${page.relative}: structured data contains retired business field ${key}`);
    }
  }
}

if (errors.length) {
  throw new Error(`Site validation failed:\n${errors.join("\n")}`);
} else {
  console.log(`Validated ${expected.length} canonical pages with no broken local references.`);
}
