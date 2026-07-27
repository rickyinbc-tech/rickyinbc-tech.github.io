import { readFileSync } from "node:fs";

export const FEATURE_IMAGE_SIZES = [
  "(max-width: 640px) calc(100vw - 28px)",
  "(max-width: 880px) calc(100vw - 40px)",
  "(max-width: 1260px) calc(46.24vw - 37.92px)",
  "545px",
].join(", ");

export const HERO_IMAGE_SIZES = [
  "(max-width: 979px) 100vw",
  "(max-width: 1027px) calc(100vw - 360px)",
  "65vw",
].join(", ");

export const WORK_CARD_IMAGE_SIZES = [
  "(max-width: 640px) calc(100vw - 28px)",
  "(max-width: 1099px) calc((100vw - 58px) / 2)",
  "(max-width: 1259px) calc((100vw - 76px) / 3)",
  "394.67px",
].join(", ");

export const SUPPORT_CARD_IMAGE_SIZES = [
  "(max-width: 640px) calc(100vw - 28px)",
  "(max-width: 880px) calc((100vw - 56px) / 2)",
  "(max-width: 1259px) calc((100vw - 88px) / 4)",
  "293px",
].join(", ");

export const ARCHIVE_IMAGE_SIZES = [
  "(max-width: 640px) calc(100vw - 28px)",
  "(max-width: 880px) calc((100vw - 58px) / 2)",
  "(max-width: 1259px) calc((100vw - 76px) / 3)",
  "394.67px",
].join(", ");

export const MODAL_IMAGE_SIZES = [
  "(max-width: 880px) calc(100vw - 56px)",
  "(max-width: 1236px) calc(100vw - 394px)",
  "842px",
].join(", ");

export const PHOTO_RESOLUTION_MANIFEST = JSON.parse(
  readFileSync(new URL("../data/photo-resolution-manifest.json", import.meta.url), "utf8"),
);

const photos = PHOTO_RESOLUTION_MANIFEST.photos || [];
const displayDerivativeByPath = new Map(
  (PHOTO_RESOLUTION_MANIFEST.displayDerivatives || []).map((record) => [record.output.path, record]),
);

function publicPath(relative) {
  return `/${relative.replace(/^\/+/, "")}`;
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathnameFromReference(reference) {
  try {
    return new URL(reference, "https://rickykwok.com").pathname.replace(/^\/+/, "");
  } catch {
    return reference.replace(/^\/+/, "").split("?")[0];
  }
}

export function photoForReference(reference) {
  const pathname = pathnameFromReference(reference);
  const displayRecord = displayDerivativeByPath.get(pathname);
  if (displayRecord) return photos.find(({ source }) => source === displayRecord.source.path);
  return photos.find((photo) => {
    if (pathname === photo.source) return true;
    const optimizedPrefix = photo.source
      .replace(/^assets\//, "assets/optimized-v2/")
      .replace(/\.jpe?g$/i, "-");
    return pathname.startsWith(optimizedPrefix);
  });
}

function candidateRecords(photo, format) {
  const candidates = (photo?.responsiveCandidates || [])
    .filter((candidate) => candidate.format === format);
  if (format === "webp" && photo?.displayDerivative) {
    const derivative = displayDerivativeByPath.get(photo.displayDerivative);
    if (derivative) candidates.push(derivative.output);
  }
  return candidates.sort((a, b) => a.width - b.width);
}

function srcsetFor(photo, format) {
  return candidateRecords(photo, format)
    .map((candidate) => `${publicPath(candidate.path)} ${candidate.width}w`)
    .join(", ");
}

function normalizedSrcset(current, photo) {
  const existing = current
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const existingFormat = pathnameFromReference(existing[0]?.split(/\s+/)[0] || "").split(".").pop()?.toLowerCase();
  if (!["avif", "webp"].includes(existingFormat)) return current;
  const governed = candidateRecords(photo, existingFormat);
  if (!governed.length) return current;

  const byWidth = new Map();
  for (const candidate of existing) {
    const [reference, descriptor = ""] = candidate.split(/\s+/);
    const width = Number.parseInt(descriptor, 10);
    if (reference && Number.isFinite(width)) byWidth.set(width, `${reference} ${width}w`);
  }
  for (const candidate of governed) {
    byWidth.set(candidate.width, `${publicPath(candidate.path)} ${candidate.width}w`);
  }
  return [...byWidth]
    .sort(([left], [right]) => left - right)
    .map(([, candidate]) => candidate)
    .join(", ");
}

function setAttribute(tag, name, value) {
  const pattern = new RegExp(`\\b${name}=(["'])[^"']*\\1`, "i");
  if (pattern.test(tag)) return tag.replace(pattern, `${name}="${value}"`);
  return tag.replace(/\s*\/?>$/, (ending) => ` ${name}="${value}"${ending}`);
}

function normalizeImageDimensions(tag) {
  const reference = tag.match(/\b(?:src|srcset)=(["'])([^"']+)\1/i)?.[2]?.split(",")[0]?.trim()?.split(/\s+/)[0] || "";
  const photo = photoForReference(reference);
  if (!photo) return tag;
  return setAttribute(setAttribute(tag, "width", photo.width), "height", photo.height);
}

function normalizeTagSrcset(tag) {
  const attributeName = tag.startsWith("<link") ? "imagesrcset" : "srcset";
  const match = tag.match(new RegExp(`\\b${attributeName}=(["'])([^"']*)\\1`, "i"));
  if (!match) return tag;
  const photo = photoForReference(match[2].split(",")[0]?.trim()?.split(/\s+/)[0] || "");
  if (!photo) return tag;
  return tag.replace(
    new RegExp(`\\b${attributeName}=(["'])[^"']*\\1`, "i"),
    `${attributeName}="${normalizedSrcset(match[2], photo)}"`,
  );
}

function normalizeContextSizes(html, blockPattern, sizes) {
  return html.replace(blockPattern, (block) => block.replace(
    /<img\b[^>]*>/i,
    (tag) => setAttribute(tag, "sizes", sizes),
  ));
}

function archivePicture(photo, imageTag) {
  return `<picture class="archive-responsive">`
    + `<source type="image/webp" srcset="${srcsetFor(photo, "webp")}" sizes="${ARCHIVE_IMAGE_SIZES}">`
    + `${setAttribute(normalizeImageDimensions(imageTag), "sizes", ARCHIVE_IMAGE_SIZES)}`
    + "</picture>";
}

function normalizeArchivePictures(html) {
  let normalized = html.replace(
    /<picture\b[^>]*class=["'][^"']*\barchive-responsive\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/gi,
    (block) => {
      const imageTag = block.match(/<img\b[^>]*>/i)?.[0] || "";
      const photo = photoForReference(imageTag.match(/\bsrc=(["'])([^"']+)\1/i)?.[2] || "");
      return photo ? archivePicture(photo, imageTag) : block;
    },
  );

  normalized = normalized.replace(
    /<img\b[^>]*\bsrc=(["'])[^"']*\/assets\/archive\/[^"']+\1[^>]*>/gi,
    (tag, _quote, offset, source) => {
      const preceding = source.slice(0, offset);
      if (preceding.lastIndexOf("<picture") > preceding.lastIndexOf("</picture>")) return tag;
      const photo = photoForReference(tag.match(/\bsrc=(["'])([^"']+)\1/i)?.[2] || "");
      return photo ? archivePicture(photo, tag) : tag;
    },
  );
  return normalized;
}

function normalizeOpenGraphDimensions(html) {
  const ogReference = html.match(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=(["'])([^"']+)\1/i)?.[2];
  const photo = photoForReference(ogReference || "");
  if (!photo) return html;
  return html
    .replace(
      /<meta\b[^>]*\bproperty=["']og:image:width["'][^>]*>/i,
      (tag) => tag.replace(/\bcontent=(["'])[^"']*\1/i, `content="${photo.width}"`),
    )
    .replace(
      /<meta\b[^>]*\bproperty=["']og:image:height["'][^>]*>/i,
      (tag) => tag.replace(/\bcontent=(["'])[^"']*\1/i, `content="${photo.height}"`),
    );
}

function normalizeStructuredImageDimensions(html) {
  let normalized = html;
  for (const photo of photos) {
    const contentUrl = `https://rickykwok.com/${photo.source}`;
    normalized = normalized.replace(
      new RegExp(`("contentUrl":"${escaped(contentUrl)}"[\\s\\S]{0,260}?"width":)\\d+(,"height":)\\d+`, "g"),
      `$1${photo.width}$2${photo.height}`,
    );
  }
  return normalized;
}

export const NATURAL_WIDTH_AVIF_FAMILIES = photos.flatMap((photo) => {
  const natural = candidateRecords(photo, "avif").find((candidate) => candidate.width === photo.width);
  return natural ? [{
    family: photo.family,
    width: photo.width,
    relative: natural.path,
  }] : [];
});

const FEATURE_IMAGE_BLOCK = /<div\b[^>]*class=["'][^"']*\bfeature-image\b[^"']*["'][^>]*>\s*<img\b[^>]*>/gi;
const HERO_PICTURE_BLOCK = /<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/gi;
const WORK_CARD_IMAGE_BLOCK = /<(?:article|a|button)\b[^>]*class=["'][^"']*\bwork-card\b(?!-)[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/gi;
const SUPPORT_CARD_IMAGE_BLOCK = /<(?:article|a|figure|div)\b[^>]*class=["'][^"']*\b(?:source-card|proof-card|series)\b(?!-)[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/gi;
const ARCHIVE_CARD_IMAGE_BLOCK = /<figure\b[^>]*class=["'][^"']*\barchive-photo\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/gi;

export function featureImageTags(html) {
  return [...html.matchAll(FEATURE_IMAGE_BLOCK)]
    .map((match) => match[0].match(/<img\b[^>]*>/i)?.[0])
    .filter(Boolean);
}

export function imageFamilyFromTag(tag) {
  const source = tag.match(/\bsrcset=(["'])([^"']+)\1/i)?.[2]?.split(",")[0]?.trim()?.split(/\s+/)[0]
    || tag.match(/\bsrc=(["'])([^"']+)\1/i)?.[2]
    || "";
  return photoForReference(source)?.family || "";
}

export function repeatedArtworkSourceCards(html) {
  const featureTag = featureImageTags(html)[0] || "";
  const primaryFamily = imageFamilyFromTag(featureTag);
  if (!primaryFamily) return [];
  return [...html.matchAll(/<article\b[^>]*class=["'][^"']*\bsource-card\b[^"']*["'][^>]*>[\s\S]*?<\/article>/gi)]
    .map((match) => match[0])
    .filter((block) => imageFamilyFromTag(block.match(/<img\b[^>]*>/i)?.[0] || "") === primaryFamily);
}

export function removeRepeatedArtworkSourceCards(html) {
  const repeated = new Set(repeatedArtworkSourceCards(html));
  if (!repeated.size) return html;
  return html.replace(
    /<article\b[^>]*class=["'][^"']*\bsource-card\b[^"']*["'][^>]*>[\s\S]*?<\/article>/gi,
    (block) => repeated.has(block) ? "" : block,
  );
}

export function removeHiddenArtworkHeroMedia(html) {
  if (!/<body\b[^>]*class=["'][^"']*\bartwork-page\b/i.test(html)) return html;
  return html
    .replace(
      /(<section\b[^>]*class=["'][^"']*\bhero\b[^"']*["'][^>]*>)\s*<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>\s*(?:<span\b[^>]*class=["'][^"']*\bhero-overlay\b[^"']*["'][^>]*><\/span>)?/i,
      "$1",
    )
    .replace(
      /(<section\b[^>]*class=["'][^"']*)\s+has-semantic-media([^"']*["'][^>]*>)/i,
      "$1$2",
    );
}

export function normalizeResponsiveImages(html) {
  let normalized = html.replace(/<(?:img|source|link)\b[^>]*>/gi, (tag) => {
    const withSrcset = normalizeTagSrcset(tag);
    return withSrcset.startsWith("<img") ? normalizeImageDimensions(withSrcset) : withSrcset;
  });

  normalized = normalized.replace(/\bdata-full=(["'])([^"']+)\1/gi, (attribute, quote, reference) => {
    const photo = photoForReference(reference);
    return photo?.displayDerivative ? `data-full=${quote}${publicPath(photo.displayDerivative)}${quote}` : attribute;
  });

  normalized = normalizeContextSizes(normalized, FEATURE_IMAGE_BLOCK, FEATURE_IMAGE_SIZES);
  normalized = normalizeContextSizes(normalized, WORK_CARD_IMAGE_BLOCK, WORK_CARD_IMAGE_SIZES);
  normalized = normalizeContextSizes(normalized, SUPPORT_CARD_IMAGE_BLOCK, SUPPORT_CARD_IMAGE_SIZES);
  normalized = normalizeContextSizes(normalized, ARCHIVE_CARD_IMAGE_BLOCK, ARCHIVE_IMAGE_SIZES);
  normalized = normalized.replace(/<img\b[^>]*\bid=["']modalImage["'][^>]*>/gi, (tag) => (
    setAttribute(tag, "sizes", MODAL_IMAGE_SIZES)
  ));
  normalized = normalizeArchivePictures(normalized);

  if (!/<body\b[^>]*class=["'][^"']*\bartwork-page\b/i.test(normalized)) {
    normalized = normalized.replace(HERO_PICTURE_BLOCK, (block) => {
      let picture = block.replace(/\bsizes=(["'])[^"']*\1/gi, `sizes="${HERO_IMAGE_SIZES}"`);
      const sourcePhoto = photoForReference(
        picture.match(/<img\b[^>]*\bsrc=(["'])([^"']+)\1/i)?.[2] || "",
      );
      if (sourcePhoto?.displayDerivative) {
        picture = picture.replace(/\s+source-cap-800\b/i, "");
      } else if (/<img\b[^>]*\bwidth=["']800["']/i.test(picture) && !/\bsource-cap-800\b/i.test(picture)) {
        picture = picture.replace(
          /(<picture\b[^>]*class=["'][^"']*\bhero-media)\b/i,
          "$1 source-cap-800",
        );
      }
      return picture;
    });
    normalized = normalized.replace(/<link\b[^>]*\brel=["']preload["'][^>]*\bas=["']image["'][^>]*>/gi, (tag) => (
      tag.replace(/\bimagesizes=(["'])[^"']*\1/i, `imagesizes="${HERO_IMAGE_SIZES}"`)
    ));
  }

  normalized = normalizeOpenGraphDimensions(normalized);
  normalized = normalizeStructuredImageDimensions(normalized);
  return normalized;
}
