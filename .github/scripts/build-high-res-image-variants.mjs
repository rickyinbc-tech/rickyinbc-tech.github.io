import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NATURAL_WIDTH_AVIF_FAMILIES } from "./responsive-image-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

let generated = 0;
for (const { family, width } of NATURAL_WIDTH_AVIF_FAMILIES) {
  const original = path.join(root, "assets/art", `${family}.jpg`);
  const output = path.join(root, "assets/optimized-v2/art", `${family}-${width}.avif`);
  const originalMetadata = await sharp(original).metadata();

  if (originalMetadata.width !== width) {
    throw new Error(`${family}: requested ${width}px AVIF would not match the ${originalMetadata.width}px original`);
  }

  if (!await exists(output)) {
    await sharp(original)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .avif({ quality: 55, effort: 8, chromaSubsampling: "4:2:0" })
      .toFile(output);
    generated += 1;
  }

  const outputMetadata = await sharp(output).metadata();
  if (outputMetadata.width !== originalMetadata.width || outputMetadata.height !== originalMetadata.height) {
    throw new Error(
      `${family}: generated ${outputMetadata.width}x${outputMetadata.height} AVIF does not match `
      + `${originalMetadata.width}x${originalMetadata.height} original`,
    );
  }
}

console.log(`Verified ${NATURAL_WIDTH_AVIF_FAMILIES.length} natural-width AVIF variants; generated ${generated}.`);
