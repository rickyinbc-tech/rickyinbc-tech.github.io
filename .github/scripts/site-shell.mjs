export const SITE_ORIGIN = "https://rickykwok.com";
export const ASSET_VERSION = "20260812-artwork-record-v2";
export const SHELL_VERSION = "20260810-artist-notebook-v1";

export const SUPPORTED_LANGUAGES = ["en", "zh-Hant", "zh-Hans"];

export const SHELL_COPY = {
  en: {
    brandHref: "/",
    brandSubtitle: "Personal Visual Notebook",
    headerLabel: "Primary",
    navLabel: "Sections",
    languageLabel: "Language",
    menu: "Menu",
    notice: "Personal, non-commercial photography archive.",
    footer: "Personal archive · no commercial or paid activity",
    navigation: [
      ["/selected-works/", "Gallery"],
      ["/series/", "Series"],
      ["/projects/", "Studies"],
      ["/journal/", "Notebook"],
      ["/awards-recognition/", "Record"],
      ["/biography/", "About"],
    ],
  },
  "zh-Hant": {
    brandHref: "/zh-hant/",
    brandSubtitle: "個人影像札記",
    headerLabel: "主要導覽",
    navLabel: "網站部分",
    languageLabel: "語言選擇",
    menu: "選單",
    notice: "個人、非商業攝影檔案。",
    footer: "個人攝影檔案 · 不涉及商業或有償活動",
    navigation: [
      ["/zh-hant/works/", "作品"],
      ["/zh-hant/series/", "系列"],
      ["/zh-hant/projects/", "專題"],
      ["/zh-hant/journal/", "札記"],
      ["/zh-hant/awards/", "紀錄"],
      ["/zh-hant/biography/", "關於"],
    ],
  },
  "zh-Hans": {
    brandHref: "/zh-hans/",
    brandSubtitle: "个人影像札记",
    headerLabel: "主要导览",
    navLabel: "网站部分",
    languageLabel: "语言选择",
    menu: "菜单",
    notice: "个人、非商业摄影档案。",
    footer: "个人摄影档案 · 不涉及商业或有偿活动",
    navigation: [
      ["/zh-hans/works/", "作品"],
      ["/zh-hans/series/", "系列"],
      ["/zh-hans/projects/", "专题"],
      ["/zh-hans/journal/", "札记"],
      ["/zh-hans/awards/", "记录"],
      ["/zh-hans/biography/", "关于"],
    ],
  },
};

const LANGUAGE_LABELS = {
  en: "English",
  "zh-Hant": "繁中",
  "zh-Hans": "简体",
};

const LANGUAGE_ROOTS = {
  en: "/",
  "zh-Hant": "/zh-hant/",
  "zh-Hans": "/zh-hans/",
};

export function normalizeLanguage(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "zh-hant") return "zh-Hant";
  if (normalized === "zh-hans") return "zh-Hans";
  return "en";
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function localHref(value) {
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.origin === SITE_ORIGIN) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // The validator will reject malformed links. Preserve the original here.
  }
  return value;
}

export function extractLanguageLinks(html) {
  const links = new Map();
  const switcher = html.match(/<div\b[^>]*class=["'][^"']*\blanguage-switcher\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0] || "";
  for (const match of switcher.matchAll(/<a\b[^>]*>/gi)) {
    const language = normalizeLanguage(attribute(match[0], "lang"));
    const href = attribute(match[0], "href");
    if (href) links.set(language, localHref(href));
  }

  if (links.size < SUPPORTED_LANGUAGES.length) {
    for (const match of html.matchAll(/<link\b[^>]*\brel=["']alternate["'][^>]*>/gi)) {
      const rawLanguage = attribute(match[0], "hreflang");
      if (!SUPPORTED_LANGUAGES.includes(rawLanguage)) continue;
      const href = attribute(match[0], "href");
      if (href) links.set(rawLanguage, localHref(href));
    }
  }

  for (const language of SUPPORTED_LANGUAGES) {
    if (!links.has(language)) links.set(language, LANGUAGE_ROOTS[language]);
  }
  return links;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderHeaderAndNotice({ language, languageLinks, markCurrentLanguage = true }) {
  const normalizedLanguage = normalizeLanguage(language);
  const copy = SHELL_COPY[normalizedLanguage];
  const navigation = copy.navigation
    .map(([href, label]) => `<a href="${href}">${label}</a>`)
    .join("");
  const switcher = SUPPORTED_LANGUAGES
    .map((itemLanguage) => {
      const href = escapeAttribute(languageLinks.get(itemLanguage) || LANGUAGE_ROOTS[itemLanguage]);
      const current = markCurrentLanguage && itemLanguage === normalizedLanguage ? ' aria-current="page"' : "";
      return `<a href="${href}" lang="${itemLanguage}"${current}>${LANGUAGE_LABELS[itemLanguage]}</a>`;
    })
    .join("");

  return `<header class="site-header nav-enhanced" data-shell-version="${SHELL_VERSION}" data-shell-language="${normalizedLanguage}" aria-label="${copy.headerLabel}">
  <nav class="nav wrap">
    <a class="brand" href="${copy.brandHref}"><span>Ricky Kwok 郭文棣</span><small>${copy.brandSubtitle}</small></a>
    <button class="nav-toggle" type="button" aria-controls="primary-navigation language-navigation" aria-expanded="false">${copy.menu}</button>
    <div class="nav-links" id="primary-navigation" aria-label="${copy.navLabel}">${navigation}</div>
    <div class="language-switcher" id="language-navigation" aria-label="${copy.languageLabel}">${switcher}</div>
  </nav>
</header>
<div class="personal-use-notice" role="note">${copy.notice}</div>`;
}

export function renderFooter(language) {
  const copy = SHELL_COPY[normalizeLanguage(language)];
  return `<footer class="site-footer" data-shell-version="${SHELL_VERSION}">
  <div class="wrap footer-row"><span>© <span id="year">2026</span> Ricky Kwok 郭文棣, ARPS.</span><span>${copy.footer}</span></div>
</footer>`;
}
