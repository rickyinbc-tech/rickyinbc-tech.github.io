import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const origin = "https://rickykwok.com";
const excluded = new Set([".git", ".github", "assets", "zh-hant", "zh-hans"]);

async function pages(directory = root) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await pages(full));
    if (entry.isFile() && entry.name === "index.html") found.push(full);
  }
  return found;
}

function pagePath(file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  return relative === "index.html" ? "/" : `/${relative.replace(/\/index\.html$/, "/")}`;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function sourceInfo(html, route) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].replace(/&amp;/g, "&").trim() || "Ricky Kwok";
  const image = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || "https://rickykwok.com/assets/art/light-encroached-homes.jpg";
  if (route.includes("/works/")) return { image, kind: "work", title };
  if (route.includes("/series/")) return { image, kind: "series", title };
  if (route.includes("/projects/")) return { image, kind: "project", title };
  if (route.includes("award")) return { image, kind: "award", title };
  if (route.includes("press")) return { image, kind: "press", title };
  if (route.includes("print") || route.includes("edition") || route.includes("shipping")) return { image, kind: "collect", title };
  if (route.includes("licensing")) return { image, kind: "license", title };
  if (route.includes("contact")) return { image, kind: "contact", title };
  if (route.includes("terms") || route.includes("privacy")) return { image, kind: "legal", title };
  return { image, kind: "about", title };
}

const copy = {
  "zh-Hant": {
    name: "繁體中文", locale: "zh_HK", heading: "中文資料頁", lead: "此頁提供與原頁相對應的繁體中文資料，不會把中文讀者帶回英文作為後備內容。",
    labels: { work: "作品檔案", series: "攝影系列", project: "攝影項目", award: "獎項及認可", press: "媒體及策展資料", collect: "收藏及版畫資料", license: "圖片授權", contact: "聯絡工作室", legal: "使用及私隱資料", about: "藝術家資料" },
    detail: "內容包括作品或項目的背景、適用資料與查詢方向。若涉及展覽、收藏、出版或授權，工作室會以書面確認可用性及條款。",
    cta: "聯絡工作室", home: "中文首頁", works: "瀏覽作品", series: "攝影系列", projects: "攝影項目", press: "媒體資料", collect: "收藏", license: "授權", about: "關於", contact: "聯絡"
  },
  "zh-Hans": {
    name: "简体中文", locale: "zh_CN", heading: "中文资料页", lead: "此页提供与原页面对应的简体中文资料，不会把中文读者带回英文作为后备内容。",
    labels: { work: "作品档案", series: "摄影系列", project: "摄影项目", award: "奖项及认可", press: "媒体及策展资料", collect: "收藏及版画资料", license: "图片授权", contact: "联系工作室", legal: "使用及隐私资料", about: "艺术家资料" },
    detail: "内容包括作品或项目的背景、适用资料与查询方向。涉及展览、收藏、出版或授权时，工作室会以书面确认可用性及条款。",
    cta: "联系工作室", home: "中文首页", works: "浏览作品", series: "摄影系列", projects: "摄影项目", press: "媒体资料", collect: "收藏", license: "授权", about: "关于", contact: "联系"
  }
};

function pageHtml(language, route, source) {
  const text = copy[language];
  const prefix = language === "zh-Hant" ? "/zh-hant" : "/zh-hans";
  const localized = `${prefix}${route}`.replace(/\/\/$/, "/");
  const languageLinks = `<div class="language-switcher" aria-label="Language"><a href="${route}">English</a><a href="/zh-hant${route}">繁中</a><a href="/zh-hans${route}">简体</a></div>`;
  const title = `${text.labels[source.kind]}｜${source.title}`;
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(text.labels[source.kind])}：郭文棣 Ricky Kwok 的${text.name}資料。"><meta name="author" content="Ricky Kwok"><link rel="canonical" href="${origin}${localized}"><link rel="alternate" hreflang="en" href="${origin}${route}"><link rel="alternate" hreflang="zh-Hant" href="${origin}/zh-hant${route}"><link rel="alternate" hreflang="zh-Hans" href="${origin}/zh-hans${route}"><link rel="alternate" hreflang="x-default" href="${origin}${route}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(text.lead)}"><meta property="og:type" content="website"><meta property="og:url" content="${origin}${localized}"><meta property="og:image" content="${escapeHtml(source.image)}"><meta property="og:site_name" content="Ricky Kwok Photography"><meta property="og:locale" content="${text.locale}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.min.css"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","url":"${origin}${localized}","name":"${escapeHtml(title)}","inLanguage":"${language}","about":{"@id":"https://rickykwok.com/#person"}}</script></head><body><a class="skip-link" href="#main">${text.labels[source.kind]}</a><header class="site-header" aria-label="Primary"><nav class="nav wrap"><a class="brand" href="${prefix}/"><span>Ricky Kwok 郭文棣</span><small>Fine Art Photography</small></a><div class="nav-links"><a href="${prefix}/works/">${text.works}</a><a href="${prefix}/series/">${text.series}</a><a href="${prefix}/projects/">${text.projects}</a><a href="${prefix}/press/">${text.press}</a><a href="${prefix}/editions/">${text.collect}</a><a href="${prefix}/licensing/">${text.license}</a><a href="${prefix}/biography/">${text.about}</a><a href="${prefix}/contact/">${text.contact}</a></div>${languageLinks}</nav></header><main id="main"><section class="hero page-hero" style="--hero-image:url('${escapeHtml(source.image.replace(origin, ""))}')"><div class="hero-inner"><p class="eyebrow">${text.labels[source.kind]}</p><h1>${text.labels[source.kind]}</h1><p class="hero-copy">${text.lead}</p></div></section><section class="section section-warm"><div class="wrap split start"><div><p class="section-label">郭文棣 Ricky Kwok</p><p class="statement">${escapeHtml(source.title)}</p></div><div><p class="prose">${text.detail}</p><div class="button-row"><a class="button dark" href="${prefix}/contact/">${text.cta}</a><a class="button ghost-dark" href="${prefix}/">${text.home}</a></div></div></div></section></main><footer class="site-footer"><div class="wrap footer-row"><span>© 2026 Ricky Kwok 郭文棣, ARPS.</span>${languageLinks}</div></footer><script defer src="/assets/site.min.js"></script></body></html>`;
}

for (const file of await pages()) {
  const route = pagePath(file);
  const source = sourceInfo(await readFile(file, "utf8"), route);
  for (const language of ["zh-Hant", "zh-Hans"]) {
    const target = path.join(root, language === "zh-Hant" ? "zh-hant" : "zh-hans", route, "index.html");
    try {
      await readFile(target, "utf8");
    } catch {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, pageHtml(language, route, source));
    }
  }
}

console.log("Generated missing Traditional and Simplified Chinese route pages.");
