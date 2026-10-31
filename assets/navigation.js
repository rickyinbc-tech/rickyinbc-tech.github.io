// Initialize the mobile menu before the page content is parsed.
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


addMobileNavigation();
