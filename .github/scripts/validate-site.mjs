import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://rickykwok.com";
const STYLESHEET_URL = "/assets/site.min.css?v=20260715-header-flow-v3";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const excludedDirectories = new Set([".git", ".github", "assets"]);
const errors = [];
const artworkManifest = JSON.parse(await readFile(path.join(repoRoot, ".github/data/artwork-manifest.json"), "utf8"));
const edgeRedirectConfig = JSON.parse(await readFile(path.join(repoRoot, "edge/redirect-map.json"), "utf8"));
const translationGovernance = JSON.parse(await readFile(path.join(repoRoot, ".github/data/translation-governance.json"), "utf8"));
const measurementGovernance = JSON.parse(await readFile(path.join(repoRoot, ".github/data/measurement-governance.json"), "utf8"));
const imageInventory = JSON.parse(await readFile(path.join(repoRoot, ".github/data/image-asset-inventory.json"), "utf8"));
const performanceReport = JSON.parse(await readFile(path.join(repoRoot, ".github/data/performance-report.json"), "utf8"));
const indexNowKey = (await readFile(path.join(repoRoot, "813e7287fc405b123c1373ff6e9c4567.txt"), "utf8")).trim();
const placeholderPatterns = [
  /此頁提供與原頁相對應/,
  /此页提供与原页面对应/,
  /不會把中文讀者帶回英文作為後備內容/,
  /不会把中文读者带回英文作为后备内容/,
];
const implementationCommentaryPatterns = [
  /bilingual title gives the page a clear identity/i,
  /English and Chinese-name searches/i,
  /search[- ]engine (?:visibility|ranking|query)/i,
];

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
    if (entry.isFile() && entry.name === "index.html") files.push(fullPath);
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
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const canonical = canonicalFrom(html);
  const localized = relative.startsWith("zh-hant/") || relative.startsWith("zh-hans/");

  if (html.includes("/assets/site.min.css") && !html.includes(STYLESHEET_URL)) {
    errors.push(`${relative}: stylesheet cache key does not include the responsive header-flow fix`);
  }

  if (localized) {
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
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    validatedImageUses += 1;
    for (const required of ["alt", "width", "height", "sizes"]) {
      if (!attribute(tag, required)) errors.push(`${relative}: image is missing ${required}`);
    }
  }
  const heroPicture = html.match(/<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/i)?.[0] || "";
  const heroTag = heroPicture.match(/<img\b[^>]*>/i)?.[0] || "";
  if (heroTag && (attribute(heroTag, "loading") !== "eager" || attribute(heroTag, "fetchpriority") !== "high")) {
    errors.push(`${relative}: hero image must load eagerly with high fetch priority`);
  }

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
    const minimumImages = Math.max(englishImages - 1, 0);
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

  for (const [language, prefix] of [["en", ""], ["zh-Hant", "/zh-hant"], ["zh-Hans", "/zh-hans"]]) {
    const route = `${prefix}${canonicalPath}`.replace(/\/\//g, "/");
    const page = indexableDocuments.get(route);
    if (!page) {
      errors.push(`${id}: missing indexable ${language} artwork page ${route}`);
      continue;
    }
    const { html, relative } = page;
    if (heroImageSource(html) !== primaryImage.url) {
      errors.push(`${relative}: hero primary image does not match artwork manifest for ${id}`);
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
    if (!visual || !matchesType(visual.creator, "Person") || visual.creator.name !== "Ricky Kwok") {
      errors.push(`${relative}: VisualArtwork creator must be a named Person for ${id}`);
    }
    if (!image || image.contentUrl !== expectedImageUrl || Number(image.width) !== Number(primaryImage.width) || Number(image.height) !== Number(primaryImage.height) || image.encodingFormat !== primaryImage.mimeType) {
      errors.push(`${relative}: ImageObject does not match artwork manifest for ${id}`);
    }
    if (!image || !matchesType(image.creator, "Person") || image.creator.name !== "Ricky Kwok") {
      errors.push(`${relative}: ImageObject creator must be a named Person for ${id}`);
    }
    if (!html.includes('data-artwork-governance="v2"')) {
      errors.push(`${relative}: artwork facts do not use governance contract v2`);
    }
    if ((html.match(/data-artwork-pathways/g) || []).length !== 1) {
      errors.push(`${relative}: expected one governed artwork pathway row`);
    }
    for (const pathway of ["type=print", "/licensing/", "type=exhibition"]) {
      if (!html.includes(pathway)) errors.push(`${relative}: missing artwork pathway ${pathway}`);
    }
    const standardsPath = language === "en" ? "/studio-standards/" : `${prefix}/studio-standards/`;
    if (!html.includes(`href="${standardsPath}"`)) {
      errors.push(`${relative}: missing localized Studio Standards link`);
    }
  }
}

for (const [route, marker] of [
  ["/", "Archive Guide"],
  ["/zh-hant/", "檔案導覽"],
  ["/zh-hans/", "档案导览"],
  ["/studio-standards/", "Six groups of facts"],
  ["/zh-hant/studio-standards/", "必須確認六組資料"],
  ["/zh-hans/studio-standards/", "必须确认六组资料"],
]) {
  const page = indexableDocuments.get(route);
  if (!page || !page.html.includes(marker)) errors.push(`${route}: missing governed archive or studio-standards content`);
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
for (const series of ["ritual", "collision", "motion", "city-light"]) {
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    if (!translationGovernance.series?.[series]?.[locale]) errors.push(`translation governance lacks ${series} ${locale}`);
  }
}

const siteJs = await readFile(path.join(repoRoot, "assets/site.min.js"), "utf8");
const siteCss = await readFile(path.join(repoRoot, "assets/site.min.css"), "utf8");
if (!siteJs.includes("const ANALYTICS_DISABLED = true;") || /googletagmanager|google-analytics|data-analytics-choice|analytics-consent/i.test(siteJs)) {
  errors.push("analytics must remain disabled without a consent banner or Google loader");
}
if (measurementGovernance.collectionStatus !== "disabled" || measurementGovernance.property !== null) {
  errors.push("measurement governance must declare analytics disabled");
}
for (const marker of ["prefers-reduced-motion", "forced-colors"]) {
  if (!siteCss.includes(marker)) errors.push(`accessibility stylesheet lacks ${marker}`);
}
if (/\.analytics-consent/i.test(siteCss)) errors.push("stylesheet still contains the removed analytics banner");
if (/object-fit\s*:\s*cover/i.test(siteCss)) {
  errors.push("stylesheet must not crop photography with object-fit: cover");
}
for (const marker of [
  "object-fit: contain !important",
  ".hero.has-semantic-media",
  ".hero.has-semantic-media .hero-media img",
]) {
  if (!siteCss.includes(marker)) errors.push(`stylesheet lacks the no-crop artwork contract: ${marker}`);
}
if (!/@media\s*\(max-width:\s*980px\)[\s\S]*?\.site-header\s*\{[\s\S]*?position:\s*relative/i.test(siteCss)) {
  errors.push("responsive header must remain in normal flow so translated navigation cannot cover artwork");
}
if (!/\.hero\.has-semantic-media\s*\{[\s\S]*?padding-top:\s*0/i.test(siteCss)) {
  errors.push("responsive artwork hero must not use a fixed header-height offset");
}
const implementedEvents = new Set(Array.from(siteJs.matchAll(/trackEvent\("([a-z0-9_]+)"/g), (match) => match[1]));
for (const eventName of measurementGovernance.events || []) {
  if (!implementedEvents.has(eventName)) errors.push(`measurement governance event is not implemented: ${eventName}`);
}
for (const eventName of implementedEvents) {
  if (!measurementGovernance.events?.includes(eventName)) errors.push(`implemented event is not governed: ${eventName}`);
}
for (const [route, marker] of [["/privacy/", "wine.rickykwok.com</a> uses Google Analytics 4"], ["/zh-hant/privacy/", "wine.rickykwok.com</a> 服務使用 Google Analytics 4"], ["/zh-hans/privacy/", "wine.rickykwok.com</a> 服务使用 Google Analytics 4"]]) {
  if (!indexableDocuments.get(route)?.html.includes(marker)) errors.push(`${route}: privacy notice does not disclose wine-site analytics`);
}
if (imageInventory.summary?.missingDimensions !== 0 || imageInventory.summary?.missingSizes !== 0 || imageInventory.summary?.imageUses !== validatedImageUses) {
  errors.push("image inventory is stale or violates the complete image-attribute contract");
}
if (performanceReport.status !== "pass" || performanceReport.measured?.maxMissingImageDimensions !== 0 || performanceReport.measured?.maxMissingImageSizes !== 0) {
  errors.push("performance governance report does not pass");
}

const workerSource = await readFile(path.join(repoRoot, "edge/cloudflare-worker.mjs"), "utf8");
for (const header of ["content-security-policy", "permissions-policy", "referrer-policy", "x-content-type-options", "x-frame-options"]) {
  if (!workerSource.includes(`"${header}"`)) errors.push(`edge worker lacks ${header}`);
}

for (const route of ["/licensing/", "/zh-hant/licensing/", "/zh-hans/licensing/"]) {
  const page = indexableDocuments.get(route);
  if (!page) {
    errors.push(`${route}: missing indexable licensing page`);
    continue;
  }
  if (!/<details\b[^>]*class=["'][^"']*\bform-disclosure\b/i.test(page.html)) {
    errors.push(`${page.relative}: licensing form lacks progressive disclosure`);
  }
  for (const optionalField of ["duration", "distribution_audience", "exclusivity", "release_requirements"]) {
    const tag = page.html.match(new RegExp(`<(?:input|select)\\b[^>]*\\bname=["']${optionalField}["'][^>]*>`, "i"))?.[0] || "";
    if (!tag || /\brequired\b/i.test(tag)) {
      errors.push(`${page.relative}: advanced licensing field ${optionalField} must exist and remain optional`);
    }
  }
}

for (const [route, page] of indexableDocuments) {
  const hasHero = /<[^>]+class=["'][^"']*\bhero\b[^"']*["'][^>]*>/i.test(page.html);
  if (hasHero && !heroImageSource(page.html)) {
    errors.push(`${page.relative}: visual hero lacks semantic responsive image media`);
  }
  if (hasHero && /--hero-image/i.test(page.html)) {
    errors.push(`${page.relative}: visual hero still relies on CSS-only image media`);
  }
}

const confirmationPages = [
  "contact/thanks/index.html",
  "zh-hant/contact/thanks/index.html",
  "zh-hans/contact/thanks/index.html"
];
const confirmationContract = [
  "data-confirmation-page",
  "data-confirmation-eyebrow",
  "data-confirmation-heading",
  "data-confirmation-introduction",
  "data-confirmation-unverified",
  "data-confirmation-success",
  "data-confirmation-lead",
  "data-confirmation-type",
  "data-confirmation-artwork",
  "data-deadline-email",
  "noscript-confirmation"
];
for (const relative of confirmationPages) {
  const html = await readFile(path.join(repoRoot, relative), "utf8");
  for (const attributeName of confirmationContract) {
    if (!html.includes(attributeName)) errors.push(`${relative}: missing confirmation contract attribute ${attributeName}`);
  }
  if (!/<body\b[^>]*\bdata-confirmation-page(?:\b|=)/i.test(html)) {
    errors.push(`${relative}: confirmation page body lacks data-confirmation-page`);
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
  "photo.rickykwok.com": { "/": "/" },
  "select.rickykwok.com": { "/": "/" }
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

const sitemap = await readFile(path.join(repoRoot, "sitemap.xml"), "utf8");
const sitemapUrls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
const expected = [...indexable].sort();
const actual = [...sitemapUrls].sort();
if (JSON.stringify(expected) !== JSON.stringify(actual)) {
  errors.push(`sitemap parity failed: ${expected.length} indexable pages vs ${actual.length} sitemap URLs`);
}
if (!/^[a-f0-9]{32}$/.test(indexNowKey)) errors.push("IndexNow key file is invalid");
const expectedForwardedHosts = [
  "balanced.rickykwok.com",
  "calculator.rickykwok.com",
  "early.rickykwok.com",
  "finn.rickykwok.com",
  "grid.rickykwok.com",
  "infrastructure.rickykwok.com",
  "interest.rickykwok.com",
  "lipper.rickykwok.com",
  "mortgage.rickykwok.com",
  "mtg.rickykwok.com",
  "notes.rickykwok.com",
  "photos.rickykwok.com",
  "poker.rickykwok.com",
  "portfolio.rickykwok.com",
  "resource.rickykwok.com",
  "retired.rickykwok.com",
  "spy.rickykwok.com",
  "www.blog.rickykwok.com",
  "whymf.rickykwok.com"
];
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

if (errors.length) {
  throw new Error(`Site validation failed:\n${errors.join("\n")}`);
} else {
  console.log(`Validated ${expected.length} canonical pages with no broken local references.`);
}
