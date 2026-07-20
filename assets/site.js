const ANALYTICS_DISABLED = true;

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
  if (!header || !nav || !navLinks || !languageSwitcher || nav.querySelector(".nav-toggle")) return;

  const labels = {
    en: { open: "Menu", close: "Close menu" },
    "zh-hant": { open: "選單", close: "關閉選單" },
    "zh-hans": { open: "菜单", close: "关闭菜单" }
  };
  const localizedLabels = labels[document.documentElement.lang.toLowerCase()] || labels.en;

  navLinks.id ||= "primary-navigation";
  languageSwitcher.id ||= "language-navigation";

  const toggle = document.createElement("button");
  toggle.className = "nav-toggle";
  toggle.type = "button";
  toggle.textContent = localizedLabels.open;
  toggle.setAttribute("aria-controls", `${navLinks.id} ${languageSwitcher.id}`);
  toggle.setAttribute("aria-expanded", "false");
  nav.querySelector(".brand")?.after(toggle);
  header.classList.add("nav-enhanced");

  function setMenuOpen(open) {
    header.classList.toggle("is-menu-open", open);
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
}

addLanguageSwitcher();
addMobileNavigation();

const modal = document.querySelector("#artModal");
const modalImage = document.querySelector("#modalImage");
const modalTitle = document.querySelector("#modalTitle");
const modalMeta = document.querySelector("#modalMeta");
const modalNote = document.querySelector("#modalNote");
const closeButton = document.querySelector(".modal-close");
let previousFocus = null;
let modalInertTargets = [];

function openModal(card) {
  if (!modal || !modalImage || !closeButton) return;
  previousFocus = document.activeElement;
  modalImage.removeAttribute("srcset");
  modalImage.removeAttribute("sizes");
  modalImage.src = card.dataset.full;
  modalImage.alt = card.closest(".work-card")?.querySelector("img")?.alt || "";
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
