import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ignored = new Set([".git", ".github", ".wrangler", "_site", "assets", "node_modules", "seo-status"]);
const assetVersion = "20260726-gallery-first-v4";

const localized = {
  en: {
    footer: "Personal, non-commercial photography archive",
    menu: "Menu",
    notice: "Personal, non-commercial photography archive.",
  },
  "zh-Hant": {
    footer: "個人、非商業攝影檔案",
    menu: "選單",
    notice: "個人、非商業攝影檔案。",
  },
  "zh-Hans": {
    footer: "个人、非商业摄影档案",
    menu: "菜单",
    notice: "个人、非商业摄影档案。",
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
    .replace(/<div class="language-switcher"(?![^>]*\bid=)/g, '<div class="language-switcher" id="language-navigation"')
    .replace(/(<a class="brand"[^>]*?)\s+aria-label="[^"]*"([^>]*>)/g, "$1$2");

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

  html = html
    .replaceAll("<strong>藝術家:</strong>", "<strong>攝影者:</strong>")
    .replaceAll("<strong>艺术家:</strong>", "<strong>摄影者:</strong>")
    .replaceAll("香港藝術及紀實攝影", "香港攝影個人檔案")
    .replaceAll("香港艺术及纪实摄影", "香港摄影个人档案")
    .replaceAll(
      "© Ricky Kwok. Written permission is required for reproduction.",
      "© Ricky Kwok. All rights reserved. No reproduction is authorized through this website.",
    )
    .replaceAll(
      "© 郭文棣 Ricky Kwok。任何複製或使用均須事先取得書面許可。",
      "© 郭文棣 Ricky Kwok。保留所有權利。本網站不授權複製或再使用。",
    )
    .replaceAll(
      "© 郭文棣 Ricky Kwok。任何复制或使用均须事先取得书面许可。",
      "© 郭文棣 Ricky Kwok。保留所有权利。本网站不授权复制或再使用。",
    );

  html = html.replace(/<div class="source-body">[\s\S]*?<\/div>/g, (block) => {
    const title = block.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
    if (!title) return block;
    const linkLabel = language === "zh-Hant"
      ? `瀏覽「${title}」`
      : language === "zh-Hans"
        ? `浏览“${title}”`
        : `Explore ${title}`;
    let updated = block.replace(
      />(?:Open artwork|查看相關作品|查看相关作品)<\/a>/,
      `>${linkLabel}</a>`,
    );
    if (language === "zh-Hant") {
      updated = updated.replace(
        "<p>沿着系列、物料或視覺節奏繼續閱讀。</p>",
        `<p>繼續查看「${title}」的作品記錄與相關系列。</p>`,
      );
    }
    if (language === "zh-Hans") {
      updated = updated.replace(
        "<p>沿着系列、物料或视觉节奏继续阅读。</p>",
        `<p>继续查看“${title}”的作品记录与相关系列。</p>`,
      );
    }
    return updated;
  });

  if (/<body\b[^>]*class=["'][^"']*\bartwork-page\b/i.test(html)) {
    const artworkTitle = html.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
    if (artworkTitle && language === "zh-Hant") {
      html = html.replace(
        /<figcaption class="artwork-caption">[\s\S]*?<\/figcaption>/i,
        `<figcaption class="artwork-caption">《${artworkTitle}》，郭文棣攝影。© Ricky Kwok。</figcaption>`,
      );
    }
    if (artworkTitle && language === "zh-Hans") {
      html = html.replace(
        /<figcaption class="artwork-caption">[\s\S]*?<\/figcaption>/i,
        `<figcaption class="artwork-caption">《${artworkTitle}》，郭文棣摄影。© Ricky Kwok。</figcaption>`,
      );
    }
    const figureStart = html.indexOf('<figure class="artwork-figure">');
    const figureClose = figureStart === -1 ? -1 : html.indexOf("</figure>", figureStart);
    if (figureStart !== -1 && figureClose !== -1) {
      const figureEnd = figureClose + "</figure>".length;
      const beforeFigure = html.slice(0, figureStart);
      const figure = html
        .slice(figureStart, figureEnd)
        .replace(/loading="lazy"/i, 'loading="eager" fetchpriority="high"');
      const afterFigure = html
        .slice(figureEnd)
        .replaceAll('loading="eager" fetchpriority="high"', 'loading="lazy"');
      html = `${beforeFigure}${figure}${afterFigure}`;
    }
  }

  const dateModified = html.match(/"dateModified":"([^"]+)"/)?.[1];
  if (dateModified) {
    html = html.replace(
      /<meta\b[^>]*\bproperty=["']og:updated_time["'][^>]*>/i,
      (tag) => tag.replace(/\bcontent=["'][^"']*["']/i, `content="${dateModified}"`),
    );
  }

  if (html !== source) {
    await writeFile(file, html);
    changed += 1;
  }
}

console.log(`Synchronized ${changed} HTML files; added ${enhancedHeaders} static mobile menu controls.`);
