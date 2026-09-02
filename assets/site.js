const ANALYTICS_MEASUREMENT_ID = "G-07PQV08YPD";
const ANALYTICS_STORAGE_KEY = "rickykwok.analytics-consent.v1";

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
  window[`ga-disable-${ANALYTICS_MEASUREMENT_ID}`] = false;
  googleTag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted"
  });
  googleTag("js", new Date());
  googleTag("config", ANALYTICS_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false
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
    message: "Allow privacy-conscious Google Analytics page-view measurement to help improve this archive? Advertising signals stay off.",
    allow: "Allow analytics",
    decline: "Decline",
    choices: "Analytics choices"
  },
  "zh-hant": {
    label: "自選瀏覽統計",
    message: "是否允許以注重私隱的 Google Analytics 頁面瀏覽統計協助改善本檔案？廣告訊號會保持關閉。",
    allow: "允許統計",
    decline: "拒絕",
    choices: "瀏覽統計選擇"
  },
  "zh-hans": {
    label: "自选浏览统计",
    message: "是否允许以注重隐私的 Google Analytics 页面浏览统计协助改善本档案？广告信号会保持关闭。",
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
const MODAL_IMAGE_SIZES = "(max-width: 880px) calc(100vw - 56px), (max-width: 1236px) calc(100vw - 394px), 842px";
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

const filterButtons = document.querySelectorAll("[data-filter]");
const filterItems = document.querySelectorAll("[data-series]");
const filterStatusLabels = {
  en: (count) => `${count} ${count === 1 ? "work" : "works"} shown.`,
  "zh-hant": (count) => `顯示 ${count} 件作品。`,
  "zh-hans": (count) => `显示 ${count} 件作品。`
};
const filterStatusLabel = filterStatusLabels[document.documentElement.lang.toLowerCase()] || filterStatusLabels.en;
const filterRow = document.querySelector(".filter-row");
const filterStatus = filterRow && filterButtons.length ? Object.assign(document.createElement("p"), { className: "sr-only" }) : null;

if (filterStatus) {
  filterStatus.setAttribute("role", "status");
  filterStatus.setAttribute("aria-live", "polite");
  filterRow.append(filterStatus);
}

filterButtons.forEach((button) => {
  button.setAttribute("aria-pressed", String(button.classList.contains("is-active")));
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    let visibleCount = 0;
    filterItems.forEach((item) => {
      const visible = filter === "all" || item.dataset.series === filter;
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    if (filterStatus) filterStatus.textContent = filterStatusLabel(visibleCount);
  });
});
