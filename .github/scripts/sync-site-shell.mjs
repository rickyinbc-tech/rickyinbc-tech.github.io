import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ignored = new Set([".git", ".github", ".wrangler", "_site", "assets", "node_modules", "seo-status"]);
const assetVersion = "20260726-editorial-refresh-v1";

const localized = {
  en: {
    footer: "Personal, non-commercial photography archive",
    menu: "Menu",
    notice: "A personal, non-commercial photography archive, shared for viewing and documentation only.",
  },
  "zh-Hant": {
    footer: "個人、非商業攝影檔案",
    menu: "選單",
    notice: "個人、非商業攝影檔案，只供觀賞及記錄。",
  },
  "zh-Hans": {
    footer: "个人、非商业摄影档案",
    menu: "菜单",
    notice: "个人、非商业摄影档案，只供观赏及记录。",
  },
};

async function htmlFiles(directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(file));
    if (entry.isFile() && entry.name.endsWith(".html")) files.push(file);
  }
  return files;
}

let changed = 0;
let enhancedHeaders = 0;

for (const file of await htmlFiles()) {
  const source = await readFile(file, "utf8");
  const language = source.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] || "en";
  const copy = localized[language] || localized.en;
  let html = source.replaceAll(/202607\d{2}-[a-z0-9-]+-v\d+/gi, assetVersion);

  html = html.replace(
    /<div class="personal-use-notice" role="note">[\s\S]*?<\/div>/g,
    `<div class="personal-use-notice" role="note">${copy.notice}</div>`,
  );

  html = html
    .replace(/<header class="site-header"(?![^>]*\bnav-enhanced\b)/g, '<header class="site-header nav-enhanced"')
    .replace(/<div class="nav-links"(?![^>]*\bid=)/g, '<div class="nav-links" id="primary-navigation"')
    .replace(/<div class="language-switcher"(?![^>]*\bid=)/g, '<div class="language-switcher" id="language-navigation"');

  if (html.includes('class="site-header nav-enhanced"') && !html.includes('class="nav-toggle"')) {
    const brandPattern = /(<a class="brand"[\s\S]*?<\/a>)/;
    if (!brandPattern.test(html)) throw new Error(`Could not locate the brand link in ${path.relative(root, file)}`);
    html = html.replace(
      brandPattern,
      `$1<button class="nav-toggle" type="button" aria-controls="primary-navigation language-navigation" aria-expanded="false">${copy.menu}</button>`,
    );
    enhancedHeaders += 1;
  }

  html = html
    .replace(/<span>Personal Photography Archive<\/span>/g, `<span>${copy.footer}</span>`)
    .replace(/<span>個人攝影檔案<\/span>/g, `<span>${copy.footer}</span>`)
    .replace(/<span>个人摄影档案<\/span>/g, `<span>${copy.footer}</span>`);

  if (html !== source) {
    await writeFile(file, html);
    changed += 1;
  }
}

console.log(`Synchronized ${changed} HTML files; added ${enhancedHeaders} static mobile menu controls.`);
