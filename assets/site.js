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
  if (raw === "/works/" || raw === "/selected-works/") return language === "en" ? "/selected-works/" : `/${language}/works/`;
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
    link.lang = code;
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
  for (const region of [navLinks, languageSwitcher]) region.addEventListener("click", (event) => {
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

// URL state is shareable; scroll and focus are private to this browser tab.
const GALLERY_FILTERS = new Set(['all', 'ritual', 'collision', 'motion', 'city-light']);
const normalizeSearch = value => String(value).normalize('NFKC').toLocaleLowerCase().trim();
const galleryPath = language => language === 'en' ? '/selected-works/' : `/${language}/works/`;
function readGalleryState(value) {
  const url = new URL(value, window.location.origin);
  const filter = url.hash.slice(1);
  return { filter: GALLERY_FILTERS.has(filter) ? filter : 'all', query: url.searchParams.get('q') || '' };
}
function matchesGallery(item, state) {
  const terms = normalizeSearch(state.query).split(/\s+/).filter(Boolean);
  return (state.filter === 'all' || normalizeSearch(item.series) === state.filter)
    && terms.every(term => normalizeSearch(item.search).includes(term));
}
function safeCollection(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (!/^\/(?:zh-hant\/|zh-hans\/)?(?:selected-works\/|works\/|series\/(?:ritual|collision|motion|city-light)\/)$/.test(url.pathname)) return null;
    const state = readGalleryState(url);
    url.search = '';
    if (state.query) url.searchParams.set('q', state.query);
    url.hash = state.filter === 'all' ? '' : state.filter;
    return url;
  } catch { return null; }
}
function localizeCollection(value, language) {
  const url = safeCollection(value);
  if (!url) return null;
  const section = url.pathname.replace(/^\/(?:zh-hant|zh-hans)(?=\/)/, '');
  url.pathname = section === '/selected-works/' || section === '/works/'
    ? galleryPath(language)
    : `${language === 'en' ? '' : `/${language}`}${section}`;
  return `${url.pathname}${url.search}${url.hash}`;
}
const contextKey = url => `rickykwok.browse.v1:${url.pathname}${url.search}${url.hash}`;
function savedContext(url) {
  try { return JSON.parse(window.sessionStorage.getItem(contextKey(url)) || 'null'); }
  catch { return null; }
}
function saveContext(url, value) {
  try { window.sessionStorage.setItem(contextKey(url), JSON.stringify(value)); }
  catch { /* Navigation still works when browser storage is blocked. */ }
}
const browseCopy = {
  en: { search: 'Find a photograph', placeholder: 'Search titles, subjects or series', empty: 'No photographs match these filters.', reset: 'Clear search and filters', count: n => `${n} of 12 photographs`, back: 'Back to gallery', seriesBack: 'Back to series', previous: 'Previous photograph', next: 'Next photograph', sequence: 'Browse photographs', selected: 'Selected photographs', open: 'View larger', close: 'Close', viewer: 'Enlarged photograph', detail: 'View artwork record', position: (n, total) => `${n} of ${total}` },
  'zh-hant': { search: '尋找作品', placeholder: '搜尋作品名稱、主題或系列', empty: '沒有符合篩選條件的作品。', reset: '清除搜尋與篩選', count: n => `12 件作品中顯示 ${n} 件`, back: '返回作品選輯', seriesBack: '返回系列', previous: '上一張作品', next: '下一張作品', sequence: '瀏覽作品', selected: '精選作品', open: '放大觀看', close: '關閉', viewer: '放大作品', detail: '查看作品記錄', position: (n, total) => `第 ${n} 張，共 ${total} 張` },
  'zh-hans': { search: '查找作品', placeholder: '搜索作品名称、主题或系列', empty: '没有符合筛选条件的作品。', reset: '清除搜索与筛选', count: n => `12 件作品中显示 ${n} 件`, back: '返回作品选辑', seriesBack: '返回系列', previous: '上一张作品', next: '下一张作品', sequence: '浏览作品', selected: '精选作品', open: '放大查看', close: '关闭', viewer: '放大作品', detail: '查看作品记录', position: (n, total) => `第 ${n} 张，共 ${total} 张` }
};
const uiCopy = browseCopy[analyticsLanguage] || browseCopy.en;

function enhanceGallery() {
  const grid = document.querySelector('.gallery-page .gallery-grid');
  const filterRow = document.querySelector('.filter-row');
  if (!grid || !filterRow) return;
  document.body.classList.add('gallery-enhanced');
  const filterButtons = [...filterRow.querySelectorAll('[data-filter]')];
  const filterItems = [...grid.children];
  const search = document.createElement('div');
  search.className = 'gallery-search';
  const label = document.createElement('label');
  label.htmlFor = 'gallery-search';
  label.textContent = uiCopy.search;
  const input = document.createElement('input');
  Object.assign(input, { id: 'gallery-search', type: 'search', placeholder: uiCopy.placeholder, autocomplete: 'off' });
  input.setAttribute('aria-controls', 'gallery-results');
  grid.id = 'gallery-results';
  search.append(label, input);
  filterRow.before(search);
  const status = document.createElement('p');
  status.className = 'gallery-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  filterRow.after(status);
  const empty = document.createElement('div');
  empty.className = 'gallery-empty';
  const message = document.createElement('p');
  message.textContent = uiCopy.empty;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = uiCopy.reset;
  empty.append(message, reset);
  grid.after(empty);
  let state = readGalleryState(window.location.href);
  input.value = state.query;
  const searchable = filterItems.map(item => ({ series: item.dataset.series, search: item.dataset.search || `${item.querySelector('.work-caption')?.textContent || ''} ${item.querySelector('img')?.alt || ''} ${item.dataset.series}` }));
  const filterStatusLabel = uiCopy.count;
  function applyFilter() {
    let count = 0;
    filterItems.forEach((item, index) => {
      item.hidden = !matchesGallery(searchable[index], state);
      if (!item.hidden) count++;
    });
    filterButtons.forEach(button => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    status.textContent = filterStatusLabel(count);
    empty.hidden = count !== 0;
    refreshCollectionLinks();
    refreshLanguageLinks();
  }
  function updateUrl(push) {
    const url = new URL(window.location.href);
    if (state.query) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
    url.hash = state.filter === 'all' ? '' : state.filter;
    if (url.href !== window.location.href) window.history[push ? 'pushState' : 'replaceState'](null, '', url);
    applyFilter();
  }
  filterButtons.forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    updateUrl(true);
    trackEvent('gallery_filter', { series: state.filter, content_language: analyticsLanguage });
  }));
  input.addEventListener('input', () => { state.query = input.value; updateUrl(false); });
  reset.addEventListener('click', () => {
    state = { filter: 'all', query: '' }; input.value = ''; updateUrl(true); input.focus();
  });
  const fromUrl = () => { state = readGalleryState(window.location.href); input.value = state.query; applyFilter(); };
  window.addEventListener('popstate', fromUrl);
  window.addEventListener('hashchange', fromUrl);
  window.addEventListener('pageshow', fromUrl);
  applyFilter();
}

function refreshLanguageLinks() {
  document.querySelectorAll('.language-switcher a').forEach(link => {
    const url = new URL(link.href, window.location.origin);
    const language = (link.lang || 'en').toLowerCase();
    if (document.querySelector('.gallery-page')) {
      const state = readGalleryState(window.location.href);
      if (state.query) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
      url.hash = state.filter === 'all' ? '' : state.filter;
    }
    const from = localizeCollection(new URL(window.location.href).searchParams.get('from'), language);
    if (from) url.searchParams.set('from', from);
    link.href = `${url.pathname}${url.search}${url.hash}`;
  });
}
function collectionItems() {
  return [...document.querySelectorAll('main .gallery-grid a[href]')]
    .filter(link => !link.closest('[hidden]') && /\/works\/[a-z0-9-]+\/$/.test(link.pathname))
    .map(link => ({ href: link.pathname, title: link.querySelector('strong')?.textContent || link.textContent.trim() }));
}
function refreshCollectionLinks() {
  const from = safeCollection(window.location.href);
  if (!from) return;
  document.querySelectorAll('main .gallery-grid a[href]').forEach(link => {
    if (!/\/works\/[a-z0-9-]+\/$/.test(link.pathname)) return;
    const url = new URL(link.href);
    url.searchParams.set('from', `${from.pathname}${from.search}${from.hash}`);
    link.href = `${url.pathname}${url.search}${url.hash}`;
  });
}
function enhanceCollectionReturn() {
  const collection = safeCollection(window.location.href);
  if (collection) {
    const remember = focus => saveContext(new URL(window.location.href), { y: window.scrollY, focus, items: collectionItems() });
    document.querySelectorAll('main .gallery-grid a[href]').forEach(link => {
      link.addEventListener('click', () => remember(link.pathname));
    });
    window.addEventListener('pagehide', () => {
      const previous = savedContext(new URL(window.location.href));
      remember(previous?.focus || '');
    });
    const restore = event => {
      let returning = event?.persisted || window.performance?.getEntriesByType('navigation')[0]?.type === 'back_forward';
      try { returning ||= /\/works\/[a-z0-9-]+\/$/.test(new URL(document.referrer).pathname); } catch { /* Direct visit. */ }
      const saved = savedContext(new URL(window.location.href));
      if (!returning || !saved || !Number.isFinite(saved.y)) return;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const link = [...document.querySelectorAll('main .gallery-grid a[href]')].find(item => item.pathname === saved.focus && !item.closest('[hidden]'));
        link?.focus({ preventScroll: true });
        window.scrollTo({ top: saved.y, behavior: 'instant' });
      }));
    };
    window.addEventListener('pageshow', restore);
    refreshCollectionLinks();
  }
  const data = document.querySelector('#archive-navigation');
  const pagination = document.querySelector('.artwork-pagination');
  if (!data || !pagination) return;
  const model = JSON.parse(data.textContent);
  const from = safeCollection(new URL(window.location.href).searchParams.get('from'));
  const back = document.querySelector('[data-archive-return]');
  if (from && back) {
    back.href = `${from.pathname}${from.search}${from.hash}`;
    back.textContent = from.pathname.includes('/series/') ? uiCopy.seriesBack : uiCopy.back;
  }
  let items = model.series;
  let label = model.seriesName;
  if (from) {
    if (from.pathname === galleryPath(analyticsLanguage)) {
      items = model.gallery.filter(item => matchesGallery(item, readGalleryState(from)));
      label = uiCopy.selected;
    } else if (from.pathname === model.seriesPath) {
      items = model.series;
    } else {
      const saved = savedContext(from);
      if (Array.isArray(saved?.items)) items = saved.items;
    }
  }
  const index = items.findIndex(item => item.href === window.location.pathname);
  if (index < 0) return;
  pagination.replaceChildren();
  const description = document.createElement('p');
  description.className = 'sequence-label';
  description.textContent = `${label} · ${uiCopy.position(index + 1, items.length)}`;
  pagination.append(description);
  for (const [offset, text] of [[-1, uiCopy.previous], [1, uiCopy.next]]) {
    const item = items[index + offset];
    if (!item) continue;
    const url = new URL(item.href, window.location.origin);
    if (from) url.searchParams.set('from', `${from.pathname}${from.search}${from.hash}`);
    const link = document.createElement('a');
    link.href = `${url.pathname}${url.search}`;
    link.className = offset < 0 ? 'sequence-previous' : 'sequence-next';
    link.rel = offset < 0 ? 'prev' : 'next';
    const small = document.createElement('small'); small.textContent = text;
    const title = document.createElement('span'); title.textContent = item.title;
    link.append(small, title); pagination.append(link);
  }
}

// One native dialog serves gallery, series, project and artwork photographs.
function enhanceImageViewer() {
  if (!document.querySelector('.work-card, .artwork-figure, .archive-photo')) return;
  const dialog = document.createElement('dialog');
  if (typeof dialog.showModal !== 'function') return;
  document.body.classList.add('viewer-ready');
  dialog.className = 'image-viewer';
  dialog.setAttribute('aria-label', uiCopy.viewer);
  const toolbar = document.createElement('div'); toolbar.className = 'viewer-toolbar';
  const title = document.createElement('p'); title.id = 'viewer-title';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'viewer-close'; close.textContent = uiCopy.close;
  toolbar.append(title, close);
  const stage = document.createElement('div'); stage.className = 'viewer-stage';
  const enlarged = document.createElement('img'); enlarged.decoding = 'async'; stage.append(enlarged);
  const controls = document.createElement('div'); controls.className = 'viewer-controls';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = uiCopy.previous;
  const position = document.createElement('p'); position.setAttribute('role', 'status'); position.setAttribute('aria-live', 'polite');
  const next = document.createElement('button'); next.type = 'button'; next.textContent = uiCopy.next;
  const detail = document.createElement('a'); detail.textContent = uiCopy.detail;
  controls.append(previous, position, next, detail);
  dialog.append(toolbar, stage, controls); document.body.append(dialog);
  let opener, sequence = [], index = 0;
  const records = [];
  function show() {
    const record = sequence[index];
    title.textContent = record.title;
    enlarged.alt = record.photo.alt;
    enlarged.width = Number(record.photo.getAttribute('width'));
    enlarged.height = Number(record.photo.getAttribute('height'));
    const responsiveSrcset = record.photo.closest('picture')?.querySelector('source[type="image/webp"]')?.srcset || record.photo.getAttribute('srcset');
    const MODAL_IMAGE_SIZES = 'calc(100vw - 48px)';
    if (responsiveSrcset) { enlarged.srcset = responsiveSrcset; enlarged.sizes = MODAL_IMAGE_SIZES; }
    else { enlarged.removeAttribute('srcset'); enlarged.removeAttribute('sizes'); }
    enlarged.src = record.full || record.photo.src;
    position.textContent = uiCopy.position(index + 1, sequence.length);
    previous.hidden = next.hidden = position.hidden = sequence.length < 2;
    previous.disabled = index === 0; next.disabled = index === sequence.length - 1;
    detail.hidden = !record.link;
    if (record.link) detail.href = record.link.href;
  }
  function step(offset) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= sequence.length) return;
    index = nextIndex; show();
  }
  function register(trigger, photo, container, name, full, link) {
    const group = container.closest('.gallery-grid, .archive-photo-grid') || container;
    const record = { trigger, photo, container, group, title: name || photo.alt, full, link };
    records.push(record);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-label', `${uiCopy.open}: ${record.title}`);
    trigger.addEventListener('click', event => {
      event.preventDefault();
      opener = trigger;
      sequence = records.filter(item => item.group === group && !item.container.closest('[hidden]'));
      index = sequence.indexOf(record); show();
      dialog.showModal(); document.body.classList.add('viewer-open'); close.focus();
    });
  }
  document.querySelectorAll('a.work-card:not([data-full])').forEach(link => {
    const wrapper = document.createElement('article'); wrapper.className = 'work-card';
    if (link.dataset.series) wrapper.dataset.series = link.dataset.series;
    if (link.dataset.search) wrapper.dataset.search = link.dataset.search;
    link.before(wrapper); wrapper.append(link);
    link.classList.remove('work-card'); link.classList.add('work-card-link');
    link.removeAttribute('data-series');
  });
  document.querySelectorAll('.work-card').forEach(card => {
    const photo = card.querySelector('img'); if (!photo) return;
    const link = card.querySelector('a.work-card-link');
    let trigger = card.matches('button, a[data-full]') ? card : card.querySelector('.work-zoom');
    if (!trigger) { trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'work-zoom'; card.append(trigger); }
    if (trigger !== card) trigger.textContent = uiCopy.open;
    register(trigger, photo, card, card.querySelector('strong')?.textContent || card.dataset.title, trigger.dataset.full || card.dataset.full, link);
  });
  document.querySelectorAll('.artwork-figure, .archive-photo').forEach(figure => {
    const photo = figure.querySelector('img'); if (!photo) return;
    const target = photo.closest('picture') || photo;
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'artwork-enlarge';
    target.before(trigger); trigger.append(target);
    const hint = document.createElement('span'); hint.className = 'artwork-enlarge-label'; hint.textContent = uiCopy.open; trigger.append(hint);
    register(trigger, photo, figure, figure.querySelector('figcaption strong')?.textContent || document.querySelector('h1')?.textContent, figure.dataset.full, null);
  });
  close.addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const targets = [...dialog.querySelectorAll('button:not([disabled]), a[href]')].filter(node => !node.hidden && node.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); step(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  let touch;
  stage.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') touch = { x: event.clientX, y: event.clientY }; });
  stage.addEventListener('pointercancel', () => { touch = null; });
  stage.addEventListener('pointerup', event => {
    if (!touch) return;
    const dx = event.clientX - touch.x, dy = event.clientY - touch.y; touch = null;
    if (Math.abs(dx) > 55 && Math.abs(dy) < 80) step(dx < 0 ? 1 : -1);
  });
  dialog.addEventListener('close', () => { document.body.classList.remove('viewer-open'); opener?.focus({ preventScroll: true }); });
}

enhanceImageViewer();
enhanceGallery();
enhanceCollectionReturn();
refreshLanguageLinks();
