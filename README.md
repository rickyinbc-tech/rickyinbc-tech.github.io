# Ricky Kwok photography archive

A static HTML, CSS and JavaScript website in English, Traditional Chinese and
Simplified Chinese. Photographs, captions, source records and individual rights
statements remain in the existing pages. There is no application framework or
runtime dependency.

## Local review

Use Node.js 24 or later. From this directory:

```sh
npm ci
npm run check
npm run preview
```

Open http://127.0.0.1:4173/ for the homepage or
http://127.0.0.1:4173/selected-works/ for the gallery. Stop the preview with Ctrl-C.
`PORT=4175 npm run preview` selects another local port.

The preview serves the validated public artifact in `_site/`. After changing
source files, run `npm run check` to rebuild it, then refresh the browser.
The production site is https://rickykwok.com/. Releases use GitHub Pages and
the existing Cloudflare edge worker; local preview does not publish changes.

## Editing

- `assets/site.css` and `assets/site.js`: visual system, gallery browsing, menu,
  optional analytics and the shared native-dialog image viewer.
- `.github/scripts/site-shell.mjs`: common navigation, language links and footer.
- `.github/scripts/sync-archive-navigation.mjs`: multilingual search aliases,
  artwork sequence data and static previous/next links. It derives titles from
  the existing translated artwork pages and order from the curated gallery and
  principal series pages.
- `.github/scripts/responsive-image-policy.mjs`: responsive sizes and existing
  governed image variants. Originals are preserved.
- `index.html`, `selected-works/`, `series/`, `works/`, `biography/` and the two
  `zh-*` directories: original editorial content and translations.

`npm run build:shell` propagates shared chrome and artwork navigation.
`npm run build` builds assets, validates existing image variants, and refreshes
sitemaps and governance inventories. `npm run build:public` produces `_site/`.

## Browsing contract

The homepage photograph has a caption, a link to its artwork record and an
optional enlarged view. The series shortcut jumps to the four principal series.
The opening image preserves its composition and scales with the viewport height.

The gallery is a selection of twelve photographs, rather than the entire
archive. Its four filter hashes (`#ritual`, `#collision`, `#motion`,
`#city-light`) remain compatible. Search uses `?q=...` and intersects the filter.
Documented titles and image descriptions provide cross-language search aliases.
An active search or series filter has a single clear-all control that restores
the full selection and returns focus to the search field.

Artwork links carry a validated local `from` collection URL. Scroll and focus
are saved only in this browser tab's session storage. Both the explicit return
link and browser Back restore the gallery; URL state still works if storage is
blocked. Direct artwork visits return to the gallery. Canonical artwork URLs,
translations and social metadata retain their established addresses.

Previous/next links follow the displayed permanent-artwork order of the source
collection. A direct visit uses its principal series; governed works absent
from that series grid follow in manifest order. A standalone project photograph
has no invented neighbouring artwork. Sequence ends do not wrap.

Gallery, series, project and artwork photographs use one image viewer. Arrow
keys, previous/next buttons and horizontal touch swipes browse a sequence.
Tab stays within the dialog; Escape and Close restore focus to the opener.
Only visible filtered photographs participate. Images are shown in full.

Without enhancement JavaScript, navigation remains visible, gallery and artwork
links work, static previous/next links remain, and series photographs without an
artwork record link directly to their source image.

## Checks

```sh
npm run check
npm run test:browser -- http://127.0.0.1:4173
```

The first command runs the production build, unit/regression tests, route,
metadata, image, rights and scope validation, edge tests, and public-artifact
validation. It does not deploy or submit search-engine notifications. There is
no separate lint command in this repository.

The optional browser suite needs the `agent-browser` CLI with Chromium installed
and a running local preview. It tests explicit return and browser Back
independently, filter/search state, empty/reset behaviour, focus, keyboard/touch
viewer controls, series order, direct visits, language switching and the mobile
menu. Physical iOS/Safari testing remains outside this local Chromium check.

Per-photo rights remain distinct: 整整有條 / Coil Field retains CC BY-SA 4.0;
other works retain their existing rights statements. Exact 2014 Nat Geo wording
continues to identify the Photo Competition—Secondary School Category.
