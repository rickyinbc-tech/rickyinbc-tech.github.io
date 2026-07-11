const ANALYTICS_ID = "G-07PQV08YPD";
const ANALYTICS_LOAD_DELAY = 3000;

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function gtag() {
  window.dataLayer.push(arguments);
};

const ANALYTICS_CAMPAIGN_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid"
]);

function sanitizedAnalyticsUrl(value, preserveCampaignParams = false) {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.origin);
    for (const key of [...url.searchParams.keys()]) {
      if (!preserveCampaignParams || !ANALYTICS_CAMPAIGN_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function sanitizedCampaignPath(value) {
  const sanitized = sanitizedAnalyticsUrl(value, true);
  if (!sanitized) return "/";
  const url = new URL(sanitized);
  return `${url.pathname}${url.search}`;
}

window.gtag("js", new Date());
window.gtag("config", ANALYTICS_ID, {
  send_page_view: true,
  site_area: "fine_art",
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  page_location: sanitizedAnalyticsUrl(window.location.href, true),
  page_referrer: sanitizedAnalyticsUrl(document.referrer)
});

let analyticsLoaded = false;

function loadAnalytics() {
  if (analyticsLoaded) return;
  analyticsLoaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
  document.head.appendChild(script);

}

function scheduleAnalytics() {
  const startTimer = () => {
    window.setTimeout(loadAnalytics, ANALYTICS_LOAD_DELAY);
  };

  if (document.readyState === "complete") {
    startTimer();
  } else {
    window.addEventListener("load", startTimer, { once: true });
  }

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, loadAnalytics, {
      once: true,
      passive: true
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      loadAnalytics();
    }
  }, { once: true });

  window.addEventListener("pagehide", loadAnalytics, { once: true });
}

scheduleAnalytics();

const year = document.querySelector("#year");
if (year) {
  year.textContent = new Date().getFullYear();
}

function canonicalLanguagePath(language) {
  const raw = window.location.pathname.replace(/^\/zh-hant|^\/zh-hans/, "") || "/";
  if (language === "en") return raw;
  return `/${language}${raw}`.replace(/\/\/$/, "/");
}

function addLanguageSwitcher() {
  if (document.querySelector(".language-switcher")) return;
  const nav = document.querySelector(".site-header .nav");
  if (!nav) return;
  const language = document.documentElement.lang.toLowerCase();
  const labels = { en: "English", "zh-hant": "繁中", "zh-hans": "简体" };
  const switcher = document.createElement("div");
  switcher.className = "language-switcher";
  switcher.setAttribute("aria-label", "Language");
  [["en", "English"], ["zh-hant", "繁中"], ["zh-hans", "简体"]].forEach(([code, label]) => {
    const link = document.createElement("a");
    link.href = canonicalLanguagePath(code);
    link.textContent = label;
    if (language === code) link.setAttribute("aria-current", "page");
    switcher.append(link);
  });
  nav.append(switcher);
}

addLanguageSwitcher();

function trackEvent(eventName, params = {}, callback) {
  if (typeof window.gtag !== "function") {
    if (callback) callback();
    return;
  }

  const eventParams = {
    site_area: "fine_art",
    ...params
  };

  if (callback) {
    let callbackFired = false;
    const runCallback = () => {
      if (callbackFired) return;
      callbackFired = true;
      callback();
    };
    eventParams.event_callback = runCallback;
    eventParams.event_timeout = 800;
    window.gtag("event", eventName, eventParams);
    window.setTimeout(runCallback, 900);
    return;
  }

  window.gtag("event", eventName, eventParams);
}

function linkLabel(link) {
  return (link.textContent || link.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 90);
}

function destinationPath(href) {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin ? url.pathname : url.hostname;
  } catch {
    return href.slice(0, 90);
  }
}

function trackTemplateView() {
  const path = window.location.pathname;
  const pageName = (document.querySelector("h1")?.textContent || document.title).replace(/\s+/g, " ").trim().slice(0, 120);

  if (/^\/works\/[^/]+\/$/.test(path)) {
    trackEvent("view_artwork", { artwork_title: pageName, page_path: path });
  } else if (/^\/series\/[^/]+\/$/.test(path)) {
    trackEvent("view_series", { series_name: pageName, page_path: path });
  } else if (/^\/projects\/[^/]+\/$/.test(path)) {
    trackEvent("view_project", { project_name: pageName, page_path: path });
  } else if (path === "/prints/") {
    trackEvent("view_edition", { page_path: path });
  } else if (path === "/licensing/") {
    trackEvent("view_licensing", { page_path: path });
  }
}

trackTemplateView();

const modal = document.querySelector("#artModal");
const modalImage = document.querySelector("#modalImage");
const modalTitle = document.querySelector("#modalTitle");
const modalMeta = document.querySelector("#modalMeta");
const modalNote = document.querySelector("#modalNote");
const modalPrint = document.querySelector("#modalPrint");
const closeButton = document.querySelector(".modal-close");
let previousFocus = null;
let modalInertTargets = [];

function openModal(card) {
  if (!modal || !modalImage || !closeButton) return;
  previousFocus = document.activeElement;
  modalImage.removeAttribute("srcset");
  modalImage.removeAttribute("sizes");
  modalImage.src = card.dataset.full;
  modalImage.alt = card.querySelector("img")?.alt || "";
  modalTitle.textContent = card.dataset.title || "Artwork";
  modalMeta.textContent = card.dataset.meta || "";
  modalNote.textContent = card.dataset.note || "";
  if (modalPrint) {
    modalPrint.textContent = card.dataset.print || "Acquisition, exhibition and licensing status is confirmed by the studio.";
  }
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modalInertTargets = Array.from(document.body.children).filter((element) => element !== modal && element.tagName !== "SCRIPT" && !element.inert);
  modalInertTargets.forEach((element) => {
    element.inert = true;
  });
  document.body.style.overflow = "hidden";
  closeButton.focus();
  trackEvent("image_zoom", {
    artwork_title: card.dataset.title || "Artwork",
    artwork_series: card.dataset.series || card.dataset.meta || "",
    artwork_asset: destinationPath(card.dataset.full || "")
  });
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  modalInertTargets.forEach((element) => {
    element.inert = false;
  });
  modalInertTargets = [];
  document.body.style.overflow = "";
  if (previousFocus) {
    previousFocus.focus();
  }
}

document.querySelectorAll(".work-card").forEach((card) => {
  card.addEventListener("click", () => openModal(card));
});

if (closeButton) {
  closeButton.addEventListener("click", closeModal);
}

if (modal) {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal?.classList.contains("is-open")) {
    closeModal();
    return;
  }

  if (event.key === "Tab" && modal?.classList.contains("is-open")) {
    const focusable = Array.from(modal.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

const filterButtons = document.querySelectorAll("[data-filter]");
const filterItems = document.querySelectorAll("[data-series]");

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    filterItems.forEach((item) => {
      const show = filter === "all" || item.dataset.series === filter;
      item.hidden = !show;
    });
    trackEvent("portfolio_filter", {
      filter_name: filter || "all"
    });
  });
});

document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href]");
  if (!link) return;

  const href = link.getAttribute("href") || "";
  const label = linkLabel(link);
  const lowerSignal = `${href} ${label}`.toLowerCase();

  if (href.startsWith("mailto:")) {
    trackEvent("contact_click", {
      contact_method: "email",
      link_label: label
    });
    return;
  }

  if (lowerSignal.includes("print") || lowerSignal.includes("licens") || lowerSignal.includes("exhibition") || lowerSignal.includes("inquir") || href.includes("/contact/")) {
    trackEvent("inquiry_click", {
      link_label: label,
      destination: destinationPath(href)
    });
    return;
  }

  if (link.closest(".nav-links") || link.classList.contains("brand")) {
    trackEvent("navigation_click", {
      link_label: label,
      destination: destinationPath(href)
    });
    return;
  }

  if (link.classList.contains("button")) {
    trackEvent("cta_click", {
      link_label: label,
      destination: destinationPath(href)
    });
    return;
  }

  if (/^https?:\/\//.test(href)) {
    const url = new URL(href, window.location.href);
    if (url.hostname !== window.location.hostname) {
      const profileHosts = /(^|\.)(?:behance\.net|dcfever\.com|facebook\.com|flickr\.com|instagram\.com)$/i;
      trackEvent(profileHosts.test(url.hostname) ? "outbound_profile_click" : "outbound_link_click", {
        link_label: label,
        link_domain: url.hostname
      });
    }
  }
});

const INQUIRY_STORAGE = {
  landing: "ricky_kwok_landing_page",
  referrer: "ricky_kwok_initial_referrer",
  pending: "ricky_kwok_pending_inquiry"
};

function sessionGet(key) {
  try {
    return window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function sessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The form remains functional when storage is unavailable.
  }
}

function sessionRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to remove when storage is unavailable.
  }
}

if (!sessionGet(INQUIRY_STORAGE.landing)) {
  sessionSet(INQUIRY_STORAGE.landing, sanitizedCampaignPath(window.location.href));
}

if (!sessionGet(INQUIRY_STORAGE.referrer)) {
  sessionSet(INQUIRY_STORAGE.referrer, sanitizedAnalyticsUrl(document.referrer) || "Direct / unavailable");
}

const INQUIRY_ALIASES = {
  print: "print",
  prints: "print",
  collector: "print",
  collecting: "print",
  acquisition: "print",
  "artwork acquisition": "print",
  "print acquisition": "print",
  exhibition: "exhibition",
  exhibit: "exhibition",
  curatorial: "curatorial",
  curator: "curatorial",
  licensing: "licensing",
  license: "licensing",
  "image licensing": "licensing",
  "image license": "licensing",
  editorial: "licensing",
  press: "press",
  interview: "press",
  media: "press",
  general: "general",
  contact: "general"
};

const INQUIRY_LABELS = {
  print: "Print acquisition",
  exhibition: "Exhibition proposal",
  curatorial: "Curatorial inquiry",
  licensing: "Image licensing",
  press: "Press or interview",
  general: "General inquiry"
};

const PAGE_LANGUAGE = document.documentElement.lang;
const INQUIRY_LABELS_LOCALIZED = {
  "zh-Hant": {
    print: "作品收藏",
    exhibition: "展覽提案",
    curatorial: "策展查詢",
    licensing: "圖片授權",
    press: "媒體或訪問",
    general: "一般查詢"
  },
  "zh-Hans": {
    print: "作品收藏",
    exhibition: "展览提案",
    curatorial: "策展查询",
    licensing: "图片授权",
    press: "媒体或访问",
    general: "一般查询"
  }
};

function inquiryLabel(type) {
  return INQUIRY_LABELS_LOCALIZED[PAGE_LANGUAGE]?.[type] || INQUIRY_LABELS[type] || INQUIRY_LABELS.general;
}

function localizedPath(path) {
  if (PAGE_LANGUAGE === "zh-Hant") return `/zh-hant${path}`;
  if (PAGE_LANGUAGE === "zh-Hans") return `/zh-hans${path}`;
  return path;
}

const INQUIRY_EVENT_PREFIXES = {
  print: "print_inquiry",
  exhibition: "curatorial_inquiry",
  curatorial: "curatorial_inquiry",
  licensing: "licensing_inquiry",
  press: "press_inquiry",
  general: "general_inquiry"
};

function normalizeInquiryType(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  return INQUIRY_ALIASES[key] || INQUIRY_ALIASES[key.split(" ")[0]] || "";
}

function inquiryEventName(type, stage) {
  const normalized = normalizeInquiryType(type) || "general";
  return `${INQUIRY_EVENT_PREFIXES[normalized] || INQUIRY_EVENT_PREFIXES.general}_${stage}`;
}

function makeLeadId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let randomPart = "";

  if (window.crypto?.getRandomValues) {
    const values = new Uint8Array(4);
    window.crypto.getRandomValues(values);
    randomPart = Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
  } else {
    randomPart = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  }

  return `RK-${date}-${randomPart.toUpperCase()}`;
}

function fieldValue(form, name) {
  const field = form.elements.namedItem(name);
  return field && "value" in field ? String(field.value || "").trim() : "";
}

function currentInquiryType(form) {
  if (form.dataset.formKind === "licensing") return "licensing";
  return normalizeInquiryType(fieldValue(form, "type")) || "general";
}

function hasChosenInquiryType(form) {
  return form.dataset.formKind === "licensing" || Boolean(normalizeInquiryType(fieldValue(form, "type")));
}

function fieldLabel(field) {
  return field.dataset.errorLabel || field.name.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function renderFormErrors(form) {
  const summary = form.querySelector("[data-form-error-summary]");
  const list = form.querySelector("[data-form-error-list]");
  if (!summary || !list) return;

  const invalidFields = Array.from(form.querySelectorAll("input, select, textarea"))
    .filter((field) => field.type !== "hidden" && !field.validity.valid);

  list.replaceChildren();
  invalidFields.forEach((field) => {
    field.setAttribute("aria-invalid", "true");
    const item = document.createElement("li");
    item.textContent = `${fieldLabel(field)}: ${field.validationMessage}`;
    list.appendChild(item);
  });

  summary.hidden = invalidFields.length === 0;
}

function routeLicensingQuery() {
  const params = new URLSearchParams(window.location.search);
  const requestedType = normalizeInquiryType(params.get("type"));
  const contactForm = document.querySelector('[data-inquiry-form][data-form-kind="contact"]');
  if (!contactForm || requestedType !== "licensing") return false;

  const licensingUrl = new URL("/licensing/", window.location.origin);
  licensingUrl.search = params.toString();
  licensingUrl.searchParams.set("type", "licensing");
  licensingUrl.hash = "licensing-form";
  window.location.replace(licensingUrl.href);
  return true;
}

function prepareInquiryForm(form) {
  const params = new URLSearchParams(window.location.search);
  const requestedType = normalizeInquiryType(params.get("type"));
  const typeSelect = form.querySelector("[data-type-select]");
  const artworkField = form.querySelector("[data-artwork-field]");
  const leadField = form.querySelector("[data-lead-id]");
  const leadId = leadField?.value || makeLeadId();

  if (leadField) leadField.value = leadId;

  if (typeSelect && requestedType && Array.from(typeSelect.options).some((option) => option.value === requestedType)) {
    typeSelect.value = requestedType;
  }

  const artworkParam = params.get("artwork") || params.get("image") || params.get("title") || params.get("series") || params.get("project") || "";
  if (artworkField && artworkParam && !artworkField.value) {
    artworkField.value = artworkParam.slice(0, 300);
  }

  const landingField = form.querySelector("[data-landing-page]");
  const referrerField = form.querySelector("[data-referrer]");
  const sourcePageField = form.querySelector("[data-source-page]");
  const sourceUrlField = form.querySelector("[data-source-url]");

  if (landingField) landingField.value = sessionGet(INQUIRY_STORAGE.landing) || sanitizedCampaignPath(window.location.href);
  if (referrerField) referrerField.value = sessionGet(INQUIRY_STORAGE.referrer) || "Direct / unavailable";
  if (sourcePageField) sourcePageField.value = window.location.pathname;
  if (sourceUrlField) sourceUrlField.value = sanitizedAnalyticsUrl(window.location.href);

  function updateRoutingFields() {
    const type = currentInquiryType(form);
    const label = inquiryLabel(type);
    const subjectField = form.querySelector("[data-form-subject]");
    const nextField = form.querySelector("[data-form-next]");
    if (subjectField) subjectField.value = `${label} — Ricky Kwok Photography website`;

    if (nextField) {
      const nextUrl = new URL(localizedPath("/contact/thanks/"), window.location.origin);
      nextUrl.searchParams.set("type", type);
      nextUrl.searchParams.set("lead", leadId);
      nextField.value = nextUrl.href;
    }
  }

  updateRoutingFields();
  typeSelect?.addEventListener("change", updateRoutingFields);

  const startedTypes = new Set();
  const maybeTrackStart = () => {
    if (!hasChosenInquiryType(form)) return;
    const type = currentInquiryType(form);
    if (startedTypes.has(type)) return;
    startedTypes.add(type);
    trackEvent(inquiryEventName(type, "start"), {
      inquiry_type: type,
      source_page: window.location.pathname,
      has_artwork_context: fieldValue(form, "artwork") ? "yes" : "no"
    });
  };

  ["focusin", "input", "change"].forEach((eventName) => {
    form.addEventListener(eventName, maybeTrackStart);
  });

  form.addEventListener("invalid", (event) => {
    event.target.setAttribute("aria-invalid", "true");
    window.setTimeout(() => renderFormErrors(form), 0);
  }, true);

  form.addEventListener("input", (event) => {
    const field = event.target;
    if (!field.matches("input, select, textarea")) return;
    if (field.validity.valid) field.removeAttribute("aria-invalid");
    if (!form.querySelector("[data-form-error-summary]")?.hidden) {
      renderFormErrors(form);
    }
  });

  form.addEventListener("submit", (event) => {
    if (!form.checkValidity()) {
      event.preventDefault();
      renderFormErrors(form);
      form.querySelector("[aria-invalid='true']")?.focus();
      return;
    }

    updateRoutingFields();
    const type = currentInquiryType(form);
    const artwork = fieldValue(form, "artwork");
    const pendingInquiry = {
      lead_id: leadId,
      type,
      label: inquiryLabel(type),
      artwork,
      source_page: window.location.pathname,
      submitted_at: new Date().toISOString()
    };

    sessionSet(INQUIRY_STORAGE.pending, JSON.stringify(pendingInquiry));
    trackEvent("inquiry_form_attempt", {
      inquiry_type: type,
      source_page: window.location.pathname,
      has_artwork_context: artwork ? "yes" : "no"
    });

    const status = form.querySelector("[data-form-status]");
    const submitButton = form.querySelector("button[type='submit']");
    if (status) {
      status.textContent = PAGE_LANGUAGE === "zh-Hant"
        ? "正在安全傳送……你可能需要完成防垃圾驗證。"
        : PAGE_LANGUAGE === "zh-Hans"
          ? "正在安全传送……你可能需要完成防垃圾验证。"
          : "Sending securely… You may be asked to complete a spam check.";
    }
    if (submitButton) submitButton.disabled = true;
    form.setAttribute("aria-busy", "true");
  });
}

if (!routeLicensingQuery()) {
  document.querySelectorAll("[data-inquiry-form]").forEach(prepareInquiryForm);
}

window.addEventListener("pageshow", () => {
  document.querySelectorAll("[data-inquiry-form]").forEach((form) => {
    form.removeAttribute("aria-busy");
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = false;
  });
});

const confirmationPage = document.querySelector("[data-confirmation-page]");
if (confirmationPage) {
  const params = new URLSearchParams(window.location.search);
  const leadId = String(params.get("lead") || "").slice(0, 40);
  const type = normalizeInquiryType(params.get("type")) || "general";
  let pendingInquiry = null;

  try {
    pendingInquiry = JSON.parse(sessionGet(INQUIRY_STORAGE.pending) || "null");
  } catch {
    pendingInquiry = null;
  }

  const leadOutput = confirmationPage.querySelector("[data-confirmation-lead]");
  const typeOutput = confirmationPage.querySelector("[data-confirmation-type]");
  const artworkOutput = confirmationPage.querySelector("[data-confirmation-artwork]");
  const deadlineEmail = confirmationPage.querySelector("[data-deadline-email]");
  const successContent = confirmationPage.querySelector("[data-confirmation-success]");
  const unverifiedContent = confirmationPage.querySelector("[data-confirmation-unverified]");
  const eyebrow = confirmationPage.querySelector("[data-confirmation-eyebrow]");
  const heading = confirmationPage.querySelector("[data-confirmation-heading]");
  const introduction = confirmationPage.querySelector("[data-confirmation-introduction]");

  if (leadOutput && leadId) leadOutput.textContent = leadId;
  if (typeOutput) typeOutput.textContent = pendingInquiry?.label || inquiryLabel(type);
  if (artworkOutput) artworkOutput.textContent = pendingInquiry?.artwork || (PAGE_LANGUAGE === "zh-Hant" ? "未有指定" : PAGE_LANGUAGE === "zh-Hans" ? "未有指定" : "Not specified");
  if (deadlineEmail && leadId) {
    deadlineEmail.href = `mailto:studio@rickykwok.com?subject=${encodeURIComponent(`Time-sensitive inquiry ${leadId}`)}`;
  }

  if (pendingInquiry?.lead_id && pendingInquiry.lead_id === leadId) {
    if (successContent) successContent.hidden = false;
    if (unverifiedContent) unverifiedContent.hidden = true;
    if (PAGE_LANGUAGE === "zh-Hant") {
      if (eyebrow) eyebrow.textContent = "查詢已收到";
      if (heading) heading.textContent = "多謝，你的要求已經送出。";
      if (introduction) introduction.textContent = "結構化表格已轉交工作室；表格服務亦應向你發出自動確認。";
    } else if (PAGE_LANGUAGE === "zh-Hans") {
      if (eyebrow) eyebrow.textContent = "查询已收到";
      if (heading) heading.textContent = "谢谢，你的要求已经送出。";
      if (introduction) introduction.textContent = "结构化表格已转交工作室；表格服务也应向你发出自动确认。";
    } else {
      if (eyebrow) eyebrow.textContent = "Inquiry received";
      if (heading) heading.textContent = "Thank you. Your request has been sent.";
      if (introduction) introduction.textContent = "Your structured form submission has been forwarded to the studio. You should also receive an automatic confirmation from the form service.";
    }
    loadAnalytics();
    trackEvent(inquiryEventName(pendingInquiry.type || type, "submit"), {
      inquiry_type: pendingInquiry.type || type,
      source_page: pendingInquiry.source_page || "",
      has_artwork_context: pendingInquiry.artwork ? "yes" : "no",
      confirmation_page_reached: "yes"
    });
    sessionRemove(INQUIRY_STORAGE.pending);
  }
}
