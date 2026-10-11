const ANALYTICS_MEASUREMENT_ID = "G-07PQV08YPD";
const ANALYTICS_STORAGE_KEY = "rickykwok.analytics-consent.v2";
const ANALYTICS_PRODUCTION_HOSTS = new Set(["rickykwok.com", "www.rickykwok.com"]);
const ANALYTICS_EVENTS = new Set(["artwork_open", "gallery_filter", "language_switch"]);
let analyticsEnabled = false;
let analyticsInitialized = false;

function cleanAnalyticsUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}` : "";
  } catch {
    return "";
  }
}

function trackEvent(name, parameters = {}) {
  if (!analyticsEnabled || !ANALYTICS_EVENTS.has(name)) return;
  const safeParameters = { send_to: ANALYTICS_MEASUREMENT_ID };
  for (const key of ["artwork_id", "series", "content_language"]) {
    const value = parameters[key];
    if (typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value)) safeParameters[key] = value;
  }
  googleTag("event", name, safeParameters);
}

function analyticsPreference() {
  try {
    return window.localStorage.getItem(ANALYTICS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setAnalyticsPreference(value) {
  try {
    window.localStorage.setItem(ANALYTICS_STORAGE_KEY, value);
  } catch {
    // Continue for the current page when browser storage is unavailable.
  }
}

function googleTag() {
  window.dataLayer ||= [];
  window.dataLayer.push(arguments);
}

function allowAnalytics() {
  // Preview visits must never become production traffic.
  if (!ANALYTICS_PRODUCTION_HOSTS.has(window.location.hostname) || analyticsEnabled) return;
  analyticsEnabled = true;
  window[`ga-disable-${ANALYTICS_MEASUREMENT_ID}`] = false;
  googleTag("consent", analyticsInitialized ? "update" : "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted"
  });
  // Config sends a page view; initialize just once, including after re-consent.
  if (analyticsInitialized) return;
  analyticsInitialized = true;
  googleTag("js", new Date());
  googleTag("config", ANALYTICS_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: cleanAnalyticsUrl(window.location.href),
    page_referrer: cleanAnalyticsUrl(document.referrer)
  });

  if (!document.querySelector('script[data-google-analytics="true"]')) {
    const loader = document.createElement("script");
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ANALYTICS_MEASUREMENT_ID)}`;
    loader.dataset.googleAnalytics = "true";
    document.head.append(loader);
  }
}

function declineAnalytics() {
  analyticsEnabled = false;
  window[`ga-disable-${ANALYTICS_MEASUREMENT_ID}`] = true;
  if (window.dataLayer) {
    googleTag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied"
    });
  }
}

const analyticsCopy = {
  en: {
    label: "Optional analytics",
    message: "Allow privacy-conscious Google Analytics page views and gallery interactions to help improve this archive? Advertising signals stay off.",
    allow: "Allow analytics",
    decline: "Decline",
    choices: "Analytics choices"
  },
  "zh-hant": {
    label: "自選瀏覽統計",
    message: "是否允許以注重私隱的 Google Analytics 頁面瀏覽及作品互動統計協助改善本檔案？廣告訊號會保持關閉。",
    allow: "允許統計",
    decline: "拒絕",
    choices: "瀏覽統計選擇"
  },
  "zh-hans": {
    label: "自选浏览统计",
    message: "是否允许以注重隐私的 Google Analytics 页面浏览及作品互动统计协助改善本档案？广告信号会保持关闭。",
    allow: "允许统计",
    decline: "拒绝",
    choices: "浏览统计选择"
  }
};

const analyticsLanguage = document.documentElement.lang.toLowerCase();
const localizedAnalyticsCopy = analyticsCopy[analyticsLanguage] || analyticsCopy.en;

function closeAnalyticsConsent() {
  document.querySelector(".analytics-consent")?.remove();
}

function showAnalyticsConsent() {
  closeAnalyticsConsent();
  const panel = document.createElement("section");
  panel.className = "analytics-consent";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "analytics-consent-title");
  panel.setAttribute("aria-describedby", "analytics-consent-description");

  const content = document.createElement("div");
  content.className = "analytics-consent-content";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.id = "analytics-consent-title";
  title.textContent = localizedAnalyticsCopy.label;
  const message = document.createElement("p");
  message.id = "analytics-consent-description";
  message.textContent = localizedAnalyticsCopy.message;
  copy.append(title, message);

  const actions = document.createElement("div");
  actions.className = "analytics-consent-actions";
  const allow = document.createElement("button");
  allow.type = "button";
  allow.className = "button analytics-allow";
  allow.textContent = localizedAnalyticsCopy.allow;
  allow.addEventListener("click", () => {
    setAnalyticsPreference("granted");
    allowAnalytics();
    closeAnalyticsConsent();
  });
  const decline = document.createElement("button");
  decline.type = "button";
  decline.className = "button analytics-decline";
  decline.textContent = localizedAnalyticsCopy.decline;
  decline.addEventListener("click", () => {
    setAnalyticsPreference("denied");
    declineAnalytics();
    closeAnalyticsConsent();
  });
  actions.append(allow, decline);
  content.append(copy, actions);
  panel.append(content);
  document.body.append(panel);
}

function addAnalyticsChoicesControl() {
  const footerRow = document.querySelector(".footer-row");
  if (!footerRow || footerRow.querySelector(".analytics-choices")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "analytics-choices";
  button.textContent = localizedAnalyticsCopy.choices;
  button.addEventListener("click", showAnalyticsConsent);
  footerRow.append(button);
}

addAnalyticsChoicesControl();
const storedAnalyticsPreference = analyticsPreference();
if (storedAnalyticsPreference === "granted") allowAnalytics();
else if (storedAnalyticsPreference === "denied") declineAnalytics();
else showAnalyticsConsent();

// Honor withdrawal in another tab without loading a tag in an unconsented tab.
window.addEventListener("storage", (event) => {
  if (event.key !== ANALYTICS_STORAGE_KEY && event.key !== null) return;
  if (analyticsPreference() !== "granted") {
    declineAnalytics();
    closeAnalyticsConsent();
  }
});

document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href]");
  if (!link) return;
  const destination = new URL(link.href, window.location.origin);
  if (destination.origin !== window.location.origin) return;
  if (link.closest(".language-switcher")) {
    if (link.getAttribute("aria-current") !== "page") {
      trackEvent("language_switch", { content_language: (link.lang || "").toLowerCase() });
    }
    return;
  }
  const artwork = destination.pathname.match(/^\/(?:zh-hant\/|zh-hans\/)?works\/([a-z0-9-]+)\/$/);
  if (artwork && link.closest(".work-card")) {
    trackEvent("artwork_open", {
      artwork_id: artwork[1],
      content_language: document.documentElement.lang.toLowerCase()
    });
  }
});

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

function canonicalLanguagePath(language) {
  const raw = window.location.pathname.replace(/^\/(?:zh-hant|zh-hans)(?=\/|$)/, "") || "/";
  if (language === "en") return raw;
  return `/${language}${raw}`.replace(/\/\/$/, "/");
}

function addLanguageSwitcher() {
  if (document.querySelector(".language-switcher")) return;
  const nav = document.querySelector(".site-header .nav");
  if (!nav) return;

  const currentLanguage = document.documentElement.lang.toLowerCase();
  const switcher = document.createElement("div");
  switcher.className = "language-switcher";
  switcher.setAttribute("aria-label", "Language");

  [["en", "English"], ["zh-hant", "繁中"], ["zh-hans", "简体"]].forEach(([code, label]) => {
    const link = document.createElement("a");
    link.href = canonicalLanguagePath(code);
    link.textContent = label;
    if (currentLanguage === code) link.setAttribute("aria-current", "page");
    switcher.append(link);
  });

  nav.append(switcher);
}

function addMobileNavigation() {
  const header = document.querySelector(".site-header");
  const nav = header?.querySelector(".nav");
  const navLinks = nav?.querySelector(".nav-links");
  const languageSwitcher = nav?.querySelector(".language-switcher");
  if (!header || !nav || !navLinks || !languageSwitcher) return;

  const labels = {
    en: { open: "Menu", close: "Close menu" },
    "zh-hant": { open: "選單", close: "關閉選單" },
    "zh-hans": { open: "菜单", close: "关闭菜单" }
  };
  const localizedLabels = labels[document.documentElement.lang.toLowerCase()] || labels.en;

  navLinks.id ||= "primary-navigation";
  languageSwitcher.id ||= "language-navigation";

  const toggle = nav.querySelector(".nav-toggle") || document.createElement("button");
  if (!toggle.classList.contains("nav-toggle")) toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.textContent = localizedLabels.open;
  toggle.setAttribute("aria-controls", `${navLinks.id} ${languageSwitcher.id}`);
  toggle.setAttribute("aria-expanded", "false");
  if (!toggle.isConnected) nav.querySelector(".brand")?.after(toggle);
  header.classList.add("nav-enhanced");

  function setMenuOpen(open) {
    header.classList.toggle("is-menu-open", open);
    document.body.classList.toggle("menu-open", open && window.matchMedia("(max-width: 900px)").matches);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? localizedLabels.close : localizedLabels.open;
  }

  toggle.addEventListener("click", () => setMenuOpen(toggle.getAttribute("aria-expanded") !== "true"));
  navLinks.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (toggle.getAttribute("aria-expanded") === "true" && !header.contains(event.target)) {
      setMenuOpen(false);
    }
  });
  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 900px)").matches && toggle.getAttribute("aria-expanded") === "true") {
      setMenuOpen(false);
    }
  });
}

function markCurrentNavigation() {
  const sectionFor = (pathname) => {
    const normalized = pathname.replace(/^\/(?:zh-hant|zh-hans)(?=\/|$)/, "");
    const section = normalized.split("/").filter(Boolean)[0] || "";
    return section === "selected-works" || section === "works" ? "works" : section;
  };
  const currentSection = sectionFor(window.location.pathname);
  if (!currentSection) return;

  document.querySelectorAll(".nav-links a").forEach((link) => {
    if (sectionFor(new URL(link.href, window.location.origin).pathname) === currentSection) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

addLanguageSwitcher();
markCurrentNavigation();
addMobileNavigation();

const modal = document.querySelector("#artModal");
const modalImage = document.querySelector("#modalImage");
const modalTitle = document.querySelector("#modalTitle");
const modalMeta = document.querySelector("#modalMeta");
const modalNote = document.querySelector("#modalNote");
const closeButton = document.querySelector(".modal-close");
const MODAL_IMAGE_SIZES = "(max-width: 900px) calc(100vw - 56px), (max-width: 1236px) calc(100vw - 360px), 876px";
let previousFocus = null;
let modalInertTargets = [];

function openModal(card) {
  if (!modal || !modalImage || !closeButton) return;
  previousFocus = document.activeElement;
  const preview = card.matches(".work-card")
    ? card.querySelector("img")
    : card.closest(".work-card")?.querySelector("img");
  const responsiveSrcset = preview?.getAttribute("srcset");
  if (responsiveSrcset) {
    modalImage.setAttribute("srcset", responsiveSrcset);
    modalImage.setAttribute("sizes", MODAL_IMAGE_SIZES);
  } else {
    modalImage.removeAttribute("srcset");
    modalImage.removeAttribute("sizes");
  }
  modalImage.src = card.dataset.full || preview?.currentSrc || preview?.src || "";
  modalImage.alt = preview?.alt || "";
  if (preview?.width && preview?.height) {
    modalImage.width = preview.width;
    modalImage.height = preview.height;
  }
  if (modalTitle) modalTitle.textContent = card.dataset.title || "Artwork";
  if (modalMeta) modalMeta.textContent = card.dataset.meta || "";
  if (modalNote) modalNote.textContent = card.dataset.note || "";
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modalInertTargets = Array.from(document.body.children).filter((element) => element !== modal && element.tagName !== "SCRIPT" && !element.inert);
  modalInertTargets.forEach((element) => { element.inert = true; });
  document.body.style.overflow = "hidden";
  closeButton.focus();
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modalInertTargets.forEach((element) => { element.inert = false; });
  modalInertTargets = [];
  document.body.style.overflow = "";
  previousFocus?.focus();
}

document.querySelectorAll(".work-zoom, button.work-card[data-full]").forEach((card) => {
  card.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openModal(card);
  });
});
closeButton?.addEventListener("click", closeModal);
modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && modal?.classList.contains("is-open")) {
    event.preventDefault();
    closeButton?.focus();
    return;
  }
  if (event.key === "Escape" && modal?.classList.contains("is-open")) closeModal();
});

// Browse the gallery without losing the chosen series when following a work
// and returning. Search text stays in this page and is never sent to Analytics.
function enhanceGallery() {
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  const filterItems = [...document.querySelectorAll("[data-series]")];
  const filterRow = document.querySelector(".filter-row");
  const grid = document.querySelector(".gallery-grid");
  if (!filterRow || !grid || !filterButtons.length) return;
  const copy = {
    en: { search: "Find a photograph", placeholder: "Search titles, subjects or series", empty: "No photographs match this search.", reset: "Show all photographs", count: n => `${n} ${n === 1 ? "photograph" : "photographs"} shown` },
    "zh-hant": { search: "尋找作品", placeholder: "搜尋作品名稱、主題或系列", empty: "沒有符合搜尋條件的作品。", reset: "顯示所有作品", count: n => `顯示 ${n} 件作品` },
    "zh-hans": { search: "查找作品", placeholder: "搜索作品名称、主题或系列", empty: "没有符合搜索条件的作品。", reset: "显示所有作品", count: n => `显示 ${n} 件作品` }
  }[analyticsLanguage] || { search: "Find a photograph", placeholder: "Search photographs", empty: "No photographs match.", reset: "Show all photographs", count: n => `${n} photographs shown` };
  const search = document.createElement("div");
  search.className = "gallery-search";
  const label = document.createElement("label");
  label.htmlFor = "gallery-search";
  label.textContent = copy.search;
  const input = document.createElement("input");
  input.id = "gallery-search";
  input.type = "search";
  input.placeholder = copy.placeholder;
  input.autocomplete = "off";
  input.setAttribute("aria-controls", "gallery-results");
  grid.id = "gallery-results";
  search.append(label, input);
  filterRow.before(search);
  const status = document.createElement("p");
  status.className = "gallery-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  filterRow.append(status);
  const empty = document.createElement("div");
  empty.className = "gallery-empty";
  empty.hidden = true;
  const message = document.createElement("p");
  message.textContent = copy.empty;
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = copy.reset;
  empty.append(message, reset);
  grid.after(empty);
  const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();
  const searchable = filterItems.map(item => normalize(`${item.textContent} ${item.querySelector("img")?.alt || ""} ${item.dataset.series}`));
  const validFilters = new Set(filterButtons.map(button => button.dataset.filter));
  const fromHash = () => validFilters.has(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "all";
  let selected = fromHash();
  const filterStatusLabel = copy.count;
  function applyFilter() {
    const terms = normalize(input.value).split(/\s+/).filter(Boolean);
    let count = 0;
    filterItems.forEach((item, index) => {
      const visible = (selected === "all" || item.dataset.series === selected) && terms.every(term => searchable[index].includes(term));
      item.hidden = !visible;
      if (visible) count++;
    });
    filterButtons.forEach(button => {
      const active = button.dataset.filter === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    status.textContent = filterStatusLabel(count);
    empty.hidden = count !== 0;
  }
  function updateHash() {
    const url = new URL(window.location.href);
    url.hash = selected === "all" ? "" : selected;
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
  }
  filterButtons.forEach(button => button.addEventListener("click", () => {
    selected = button.dataset.filter;
    updateHash();
    applyFilter();
    trackEvent("gallery_filter", { series: selected, content_language: analyticsLanguage });
  }));
  input.addEventListener("input", applyFilter);
  reset.addEventListener("click", () => {
    selected = "all";
    input.value = "";
    updateHash();
    applyFilter();
    input.focus();
  });
  window.addEventListener("popstate", () => { selected = fromHash(); applyFilter(); });
  window.addEventListener("hashchange", () => { selected = fromHash(); applyFilter(); });
  window.addEventListener("pageshow", applyFilter);
  applyFilter();
}

// Native dialog provides focus containment, Escape dismissal and background
// inertness. The original static image remains available without JavaScript.
function enhanceArtworkViewer() {
  const figure = document.querySelector(".artwork-figure");
  const photo = figure?.querySelector(".feature-image img");
  if (!photo) return;
  const dialog = document.createElement("dialog");
  if (typeof dialog.showModal !== "function") return;
  const copy = {
    en: { open: "View larger", close: "Close", label: "Enlarged photograph" },
    "zh-hant": { open: "放大觀看", close: "關閉", label: "放大作品" },
    "zh-hans": { open: "放大查看", close: "关闭", label: "放大作品" }
  }[analyticsLanguage] || { open: "View larger", close: "Close", label: "Enlarged photograph" };
  dialog.className = "image-viewer";
  dialog.setAttribute("aria-label", copy.label);
  const toolbar = document.createElement("div");
  toolbar.className = "viewer-toolbar";
  const title = document.createElement("p");
  title.textContent = document.querySelector("h1")?.textContent || copy.label;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "viewer-close";
  close.textContent = copy.close;
  toolbar.append(title, close);
  const enlarged = document.createElement("img");
  enlarged.alt = photo.alt;
  enlarged.decoding = "async";
  enlarged.width = Number(photo.getAttribute("width"));
  enlarged.height = Number(photo.getAttribute("height"));
  dialog.append(toolbar, enlarged);
  document.body.append(dialog);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "artwork-enlarge";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-label", `${copy.open}: ${title.textContent}`);
  photo.before(trigger);
  const hint = document.createElement("span");
  hint.className = "artwork-enlarge-label";
  hint.textContent = copy.open;
  trigger.append(photo, hint);
  trigger.addEventListener("click", () => {
    enlarged.sizes = "calc(100vw - 68px)";
    enlarged.srcset = photo.getAttribute("srcset") || "";
    enlarged.src = photo.src;
    dialog.showModal();
    document.body.classList.add("viewer-open");
    close.focus();
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", event => {
    if (event.key === "Tab") { event.preventDefault(); close.focus(); }
  });
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("viewer-open");
    trigger.focus({ preventScroll: true });
  });
}

enhanceGallery();
enhanceArtworkViewer();
