import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  ["shipping", /\bshipping\b/iu],
  ["Traditional Chinese transactional term", /收藏|收購|購買|價格|售價|授權|商業使用|委託|預約|工作室|客戶|查詢|版畫出售|版本價格|聯絡工作室|展覽查詢/u],
  ["Simplified Chinese transactional term", /收藏|收购|购买|价格|售价|授权|商业使用|委托|预约|工作室|客户|查询|版画出售|版本价格|联络工作室|展览查询/u],
];

function isAllowedCommercialContext(label, segment) {
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
  if (/<form\b/i.test(html)) errors.push(`${labelPrefix}: contains a form`);
  if (/\bhref=["']mailto:/i.test(html)) errors.push(`${labelPrefix}: contains an email pathway`);
  if (/(?:ask about acquisition|request image licen[cs]ing|propose an exhibition|collector inquiry|studio offer|price and availability|work with ricky|聯絡工作室|联络工作室|收藏查詢|收藏查询)/iu.test(
    html.replace(/<script\b[\s\S]*?<\/script>/gi, " "),
  )) {
    errors.push(`${labelPrefix}: contains a prohibited transactional call to action`);
  }
  for (const segment of visibleSegments(html)) {
    for (const [label, pattern] of prohibitedTerms) {
      if (pattern.test(segment) && !isAllowedCommercialContext(label, segment)) {
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
  for (const match of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const src = attribute(match[0], "src");
    if (src) imageReferences.push(src);
    for (const candidate of attribute(match[0], "srcset").split(",")) {
      const value = candidate.trim().split(/\s+/)[0];
      if (value) imageReferences.push(value);
    }
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
