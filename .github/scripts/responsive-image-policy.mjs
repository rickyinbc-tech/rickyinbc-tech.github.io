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

export const NATURAL_WIDTH_AVIF_FAMILIES = [
  "bank-of-china-light-trails",
  "cigarette-impact",
  "flower-impact",
  "green-orb-water-study",
  "swimming-motion",
  "swimming-start-sequence",
].map((family) => ({ family, width: 1280 }));

const FEATURE_IMAGE_BLOCK = /<div\b[^>]*class=["'][^"']*\bfeature-image\b[^"']*["'][^>]*>\s*<img\b[^>]*>/gi;
const HERO_PICTURE_BLOCK = /<picture\b[^>]*class=["'][^"']*\bhero-media\b[^"']*["'][^>]*>[\s\S]*?<\/picture>/gi;

export function featureImageTags(html) {
  return [...html.matchAll(FEATURE_IMAGE_BLOCK)]
    .map((match) => match[0].match(/<img\b[^>]*>/i)?.[0])
    .filter(Boolean);
}

export function normalizeResponsiveImages(html) {
  let normalized = html.replace(FEATURE_IMAGE_BLOCK, (block) => block.replace(
    /\bsizes=(["'])[^"']*\1/i,
    `sizes="${FEATURE_IMAGE_SIZES}"`,
  ));

  for (const { family, width } of NATURAL_WIDTH_AVIF_FAMILIES) {
    normalized = normalized.replace(/<(?:link|source)\b[^>]*\btype=["']image\/avif["'][^>]*>/gi, (tag) => {
      if (!tag.includes(`/assets/optimized-v2/art/${family}-`)) return tag;
      const attributeName = tag.startsWith("<link") ? "imagesrcset" : "srcset";
      const attributePattern = new RegExp(`\\b${attributeName}=(["'])([^"']*)\\1`, "i");
      const match = tag.match(attributePattern);
      if (!match || new RegExp(`${family}-${width}\\.avif\\s+${width}w`).test(match[2])) return tag;
      const candidate = `/assets/optimized-v2/art/${family}-${width}.avif ${width}w`;
      return tag.replace(attributePattern, `${attributeName}="${match[2]}, ${candidate}"`);
    });
  }

  if (!/<body\b[^>]*class=["'][^"']*\bartwork-page\b/i.test(normalized)) {
    normalized = normalized.replace(HERO_PICTURE_BLOCK, (block) => {
      let picture = block.replace(/\bsizes=(["'])[^"']*\1/gi, `sizes="${HERO_IMAGE_SIZES}"`);
      if (/<img\b[^>]*\bwidth=["']800["']/i.test(picture) && !/\bsource-cap-800\b/i.test(picture)) {
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

  return normalized;
}
