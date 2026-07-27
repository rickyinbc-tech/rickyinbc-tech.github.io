import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  AUTHENTIC_ARCHIVE_SOURCES,
  DISPLAY_RESAMPLE_METHOD,
  DISPLAY_RESAMPLES,
  GENUINE_SOURCE_UPGRADES,
  RESOLUTION_MANIFEST_RELATIVE,
} from "./image-resolution-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const canonicalRoots = ["assets/archive", "assets/art", "assets/projects"];
const upgradedCanonicalPaths = new Set(GENUINE_SOURCE_UPGRADES.map(({ canonical }) => canonical));
const authenticArchivePaths = new Set(AUTHENTIC_ARCHIVE_SOURCES.map(({ canonical }) => canonical));

function absolute(relative) {
  return path.join(root, relative);
}

function normalized(relative) {
  return relative.split(path.sep).join("/");
}

async function filesWithin(relativeDirectory, predicate = () => true) {
  const directory = absolute(relativeDirectory);
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = normalized(path.join(relativeDirectory, entry.name));
    if (entry.isDirectory()) files.push(...await filesWithin(relative, predicate));
    if (entry.isFile() && predicate(relative)) files.push(relative);
  }
  return files;
}

async function sha256File(relative) {
  return createHash("sha256").update(await readFile(absolute(relative))).digest("hex");
}

async function writeIfChanged(relative, buffer) {
  const target = absolute(relative);
  const current = await readFile(target).catch(() => null);
  if (current?.equals(buffer)) return false;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return true;
}

async function renderVariant(sourceRelative, outputRelative, width) {
  const extension = path.extname(outputRelative).toLowerCase();
  let pipeline = sharp(absolute(sourceRelative))
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .toColourspace("srgb");

  if (extension === ".webp") {
    pipeline = pipeline.webp({ quality: width >= 1600 ? 80 : 88, smartSubsample: true, effort: 6 });
  } else if (extension === ".avif") {
    pipeline = pipeline.avif({ quality: 60, effort: 6, chromaSubsampling: "4:4:4" });
  } else {
    throw new Error(`Unsupported responsive image format: ${outputRelative}`);
  }

  return writeIfChanged(outputRelative, await pipeline.toBuffer());
}

async function ensureVariant(sourceRelative, outputRelative, width, { refresh = false } = {}) {
  const target = absolute(outputRelative);
  const existing = await sharp(target).metadata().catch(() => null);
  if (existing && !refresh) {
    if (existing.width !== width) {
      throw new Error(`${outputRelative}: expected ${width}px candidate, found ${existing.width}px`);
    }
    return false;
  }
  return renderVariant(sourceRelative, outputRelative, width);
}

async function variantMetadata(relative) {
  const metadata = await sharp(absolute(relative)).metadata();
  return {
    path: relative,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    bytes: (await stat(absolute(relative))).size,
    sha256: await sha256File(relative),
  };
}

let generated = 0;

for (const upgrade of GENUINE_SOURCE_UPGRADES) {
  const sourceMetadata = await sharp(absolute(upgrade.source)).metadata();
  const { left, top, width, height } = upgrade.crop;
  if (sourceMetadata.width < left + width || sourceMetadata.height < top + height) {
    throw new Error(`${upgrade.source}: authentic source cannot satisfy governed crop ${JSON.stringify(upgrade.crop)}`);
  }

  const upgraded = await sharp(absolute(upgrade.source))
    .rotate()
    .extract(upgrade.crop)
    .toColourspace("srgb")
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
  if (await writeIfChanged(upgrade.canonical, upgraded)) generated += 1;

  const canonicalMetadata = await sharp(absolute(upgrade.canonical)).metadata();
  if (canonicalMetadata.width !== width || canonicalMetadata.height !== height) {
    throw new Error(
      `${upgrade.canonical}: authentic upgrade is ${canonicalMetadata.width}x${canonicalMetadata.height}; `
      + `expected ${width}x${height}`,
    );
  }
}

for (const archive of AUTHENTIC_ARCHIVE_SOURCES) {
  const metadata = await sharp(absolute(archive.canonical)).metadata();
  if (metadata.width !== archive.width || metadata.height !== archive.height) {
    throw new Error(
      `${archive.canonical}: expected imported authentic source ${archive.width}x${archive.height}; `
      + `found ${metadata.width}x${metadata.height}`,
    );
  }
}

const canonicalFiles = (
  await Promise.all(canonicalRoots.map((directory) => filesWithin(directory, (file) => /\.jpe?g$/i.test(file))))
).flat().sort();

for (const sourceRelative of canonicalFiles) {
  const metadata = await sharp(absolute(sourceRelative)).metadata();
  const relativeBelowAssets = sourceRelative.replace(/^assets\//, "");
  const familyRelative = relativeBelowAssets.replace(/\.jpe?g$/i, "");
  const kind = relativeBelowAssets.split("/")[0];
  const sourceWidth = metadata.width;
  const maximumResponsiveWidth = kind === "archive" ? Math.min(sourceWidth, 1920) : sourceWidth;
  const naturalOutput = `assets/optimized-v2/${familyRelative}-${maximumResponsiveWidth}.webp`;
  if (await ensureVariant(sourceRelative, naturalOutput, maximumResponsiveWidth, {
    refresh: upgradedCanonicalPaths.has(sourceRelative) || kind === "archive",
  })) generated += 1;

  if (kind === "archive") {
    const archiveWidths = [...new Set([480, 800, 1200, 1800, maximumResponsiveWidth])]
      .filter((width) => width <= maximumResponsiveWidth)
      .sort((a, b) => a - b);
    for (const width of archiveWidths) {
      const output = `assets/optimized-v2/${familyRelative}-${width}.webp`;
      if (await ensureVariant(sourceRelative, output, width, { refresh: true })) generated += 1;
    }
  }

  if (upgradedCanonicalPaths.has(sourceRelative)) {
    const outputDirectory = absolute(path.dirname(`assets/optimized-v2/${familyRelative}`));
    const basename = path.basename(familyRelative);
    const existingVariants = (await readdir(outputDirectory))
      .filter((name) => new RegExp(`^${basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)\\.(?:avif|webp)$`, "i").test(name))
      .map((name) => normalized(path.join(path.dirname(`assets/optimized-v2/${familyRelative}`), name)));

    const webpWidths = new Set([480, 800, 1200, maximumResponsiveWidth]);
    const upgrade = GENUINE_SOURCE_UPGRADES.find(({ canonical }) => canonical === sourceRelative);
    if (upgrade?.crop.height === 1168) webpWidths.add(1000);
    for (const output of existingVariants) {
      const match = output.match(/-(\d+)\.(avif|webp)$/i);
      if (match?.[2].toLowerCase() === "webp") webpWidths.add(Number(match[1]));
    }
    for (const width of [...webpWidths].filter((value) => value <= sourceWidth).sort((a, b) => a - b)) {
      const output = `assets/optimized-v2/${familyRelative}-${width}.webp`;
      if (await ensureVariant(sourceRelative, output, width, { refresh: true })) generated += 1;
    }

    const hasAvif = existingVariants.some((output) => output.endsWith(".avif"));
    if (hasAvif) {
      const avifWidths = new Set([480, 720, 1000, 1200, sourceWidth]);
      for (const output of existingVariants.filter((value) => value.endsWith(".avif"))) {
        avifWidths.add(Number(output.match(/-(\d+)\.avif$/i)?.[1]));
      }
      for (const width of [...avifWidths].filter((value) => value <= sourceWidth).sort((a, b) => a - b)) {
        const output = `assets/optimized-v2/${familyRelative}-${width}.avif`;
        if (await ensureVariant(sourceRelative, output, width, { refresh: true })) generated += 1;
      }
    }
  }
}

const displayDerivativeRecords = [];
for (const derivative of DISPLAY_RESAMPLES) {
  const sourceMetadata = await sharp(absolute(derivative.source)).metadata();
  const sourceHash = await sha256File(derivative.source);
  if (
    sourceMetadata.width !== derivative.sourceWidth
    || sourceMetadata.height !== derivative.sourceHeight
    || sourceHash !== derivative.sourceSha256
  ) {
    throw new Error(`${derivative.source}: display-resample source does not match its governed dimensions and hash`);
  }

  const output = await sharp(absolute(derivative.source))
    .rotate()
    .resize({ width: derivative.outputWidth, kernel: sharp.kernel.cubic })
    .toColourspace("srgb")
    .webp({
      quality: DISPLAY_RESAMPLE_METHOD.webpQuality,
      smartSubsample: true,
      effort: 6,
    })
    .toBuffer();
  if (await writeIfChanged(derivative.output, output)) generated += 1;

  const outputMetadata = await sharp(absolute(derivative.output)).metadata();
  if (
    outputMetadata.width !== derivative.outputWidth
    || outputMetadata.height !== derivative.outputHeight
    || derivative.outputWidth * derivative.sourceHeight !== derivative.outputHeight * derivative.sourceWidth
  ) {
    throw new Error(`${derivative.output}: display derivative does not preserve exact 2x geometry`);
  }

  displayDerivativeRecords.push({
    ...DISPLAY_RESAMPLE_METHOD,
    source: {
      path: derivative.source,
      sha256: sourceHash,
      width: derivative.sourceWidth,
      height: derivative.sourceHeight,
    },
    output: await variantMetadata(derivative.output),
  });
}

const canonicalRecords = [];
for (const sourceRelative of canonicalFiles) {
  const metadata = await sharp(absolute(sourceRelative)).metadata();
  const relativeBelowAssets = sourceRelative.replace(/^assets\//, "");
  const familyRelative = relativeBelowAssets.replace(/\.jpe?g$/i, "");
  const kind = relativeBelowAssets.split("/")[0];
  const candidateDirectory = path.dirname(`assets/optimized-v2/${familyRelative}`);
  const family = path.basename(familyRelative);
  const responsiveCandidates = (await readdir(absolute(candidateDirectory)).catch(() => []))
    .filter((name) => new RegExp(`^${family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)\\.(?:avif|webp)$`, "i").test(name))
    .map((name) => normalized(path.join(candidateDirectory, name)))
    .sort();
  const candidateRecords = [];
  for (const candidate of responsiveCandidates) {
    const record = await variantMetadata(candidate);
    if (record.width > metadata.width || record.height > metadata.height) {
      throw new Error(`${candidate}: optimized candidate exceeds genuine source ${sourceRelative}`);
    }
    candidateRecords.push(record);
  }

  const displayDerivative = displayDerivativeRecords.find((record) => record.source.path === sourceRelative);
  const status = upgradedCanonicalPaths.has(sourceRelative) || authenticArchivePaths.has(sourceRelative)
    ? "genuine-higher-original"
    : displayDerivative
      ? "source-limited-with-display-resample"
      : "genuine-source-adequate";

  canonicalRecords.push({
    source: sourceRelative,
    family,
    kind,
    width: metadata.width,
    height: metadata.height,
    bytes: (await stat(absolute(sourceRelative))).size,
    sha256: await sha256File(sourceRelative),
    status,
    responsiveCandidates: candidateRecords,
    ...(displayDerivative ? { displayDerivative: displayDerivative.output.path } : {}),
  });
}

const manifest = {
  schemaVersion: 1,
  generatedBy: "npm run build:images",
  policy: {
    canonicalSources: canonicalRecords.length,
    originalsRetained: true,
    generativeEnhancementUsed: false,
    displayResampleMethod: DISPLAY_RESAMPLE_METHOD,
  },
  runtime: {
    sharp: sharp.versions.sharp,
    vips: sharp.versions.vips,
    webp: sharp.versions.webp,
  },
  summary: {
    canonicalSources: canonicalRecords.length,
    genuineHigherOriginals: canonicalRecords.filter(({ status }) => status === "genuine-higher-original").length,
    sourceLimitedDisplayResamples: displayDerivativeRecords.length,
    responsiveCandidates: canonicalRecords.reduce((sum, record) => sum + record.responsiveCandidates.length, 0),
  },
  photos: canonicalRecords,
  displayDerivatives: displayDerivativeRecords,
};

await writeFile(
  absolute(RESOLUTION_MANIFEST_RELATIVE),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const artworkManifestRelative = ".github/data/artwork-manifest.json";
const artworkManifest = JSON.parse(await readFile(absolute(artworkManifestRelative), "utf8"));
let artworkManifestChanged = false;
for (const artwork of artworkManifest.artworks || []) {
  const imageUrl = artwork.primaryImage?.url;
  if (!imageUrl) continue;
  const pathname = new URL(imageUrl, "https://rickykwok.com").pathname.replace(/^\//, "");
  const photo = canonicalRecords.find(({ source }) => source === pathname);
  if (!photo) continue;
  if (artwork.primaryImage.width !== photo.width || artwork.primaryImage.height !== photo.height) {
    artwork.primaryImage.width = photo.width;
    artwork.primaryImage.height = photo.height;
    artworkManifestChanged = true;
  }
}
if (artworkManifestChanged) {
  await writeFile(absolute(artworkManifestRelative), `${JSON.stringify(artworkManifest, null, 2)}\n`);
}

console.log(JSON.stringify({
  canonicalSources: canonicalRecords.length,
  genuineHigherOriginals: manifest.summary.genuineHigherOriginals,
  displayResamples: displayDerivativeRecords.length,
  responsiveCandidates: manifest.summary.responsiveCandidates,
  filesGeneratedOrUpdated: generated,
}, null, 2));
