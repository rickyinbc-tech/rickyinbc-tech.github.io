import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const key = (await readFile(path.join(root, "813e7287fc405b123c1373ff6e9c4567.txt"), "utf8")).trim();
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const urlList = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);

if (!urlList.length) throw new Error("IndexNow submission has no sitemap URLs.");

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: "rickykwok.com",
    key,
    keyLocation: `https://rickykwok.com/${key}.txt`,
    urlList
  })
});

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}
console.log(`Submitted ${urlList.length} canonical URLs to IndexNow (HTTP ${response.status}).`);
