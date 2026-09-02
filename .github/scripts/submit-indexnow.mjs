import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const origin = "https://rickykwok.com";
const endpoint = "https://api.indexnow.org/indexnow";
const keyFileName = "1552ab306b5b68d0132850bb49568a38.txt";
const keyLocation = `${origin}/${keyFileName}`;
const dryRun = process.argv.includes("--dry-run");

const key = (await readFile(path.join(root, keyFileName), "utf8")).trim();
if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) throw new Error("Invalid IndexNow key format.");

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const urlList = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]))];
if (!urlList.length || urlList.length > 10_000) throw new Error("IndexNow URL list is empty or too large.");
for (const value of urlList) {
  const url = new URL(value);
  if (url.origin !== origin) throw new Error(`IndexNow URL is outside the canonical host: ${value}`);
}

const payload = {
  host: "rickykwok.com",
  key,
  keyLocation,
  urlList,
};

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, endpoint, keyLocation, submittedUrls: urlList.length }, null, 2));
  process.exit(0);
}

let keyVerified = false;
for (let attempt = 1; attempt <= 10; attempt += 1) {
  const response = await fetch(`${keyLocation}?deployment-check=${Date.now()}`, {
    headers: { "user-agent": "RickyKwok-IndexNow/1.0" },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (response?.ok && (await response.text()).trim() === key) {
    keyVerified = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}
if (!keyVerified) throw new Error(`Live IndexNow key could not be verified at ${keyLocation}.`);

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json; charset=utf-8",
    "user-agent": "RickyKwok-IndexNow/1.0",
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30_000),
});

if (response.status !== 200 && response.status !== 202) {
  const detail = (await response.text()).trim();
  throw new Error(`IndexNow submission failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
}

console.log(JSON.stringify({ endpoint, status: response.status, submittedUrls: urlList.length }, null, 2));
