import tls from "node:tls";
import { appendFileSync } from "node:fs";

const domain = "rickykwok.com";
const originHostname = "rickyinbc-tech.github.io";
const minimumDays = 14;
const originAddresses = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
const failures = [];
const results = [];

async function check(name, task) {
  try {
    const detail = await task();
    results.push(`PASS: ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    results.push(`FAIL: ${name} — ${error.message}`);
  }
}

async function get(url, options = {}) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(15000), redirect: "manual" });
    } catch (caught) { error = caught; }
  }
  throw error;
}

function certificateConnection(ip, servername) {
  return new Promise((resolve, reject) => {
    // GitHub-hosted runners do not consistently have a usable IPv6 route.
    // HTTPS fetch checks still verify actual browser-facing availability.
    const socket = tls.connect({ host: ip, port: 443, servername, family: 4, rejectUnauthorized: true });
    socket.setTimeout(15000, () => socket.destroy(new Error("TLS connection timed out")));
    socket.once("error", reject);
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const remaining = (Date.parse(certificate.valid_to) - Date.now()) / 86400000;
      socket.end();
      if (!Number.isFinite(remaining) || remaining < minimumDays) {
        reject(new Error(`TLS certificate has ${remaining.toFixed(1)} days remaining; renew before ${minimumDays} days`));
      } else resolve(`valid until ${certificate.valid_to} (${remaining.toFixed(1)} days)`);
    });
  });
}

async function originCertificate(ip, servername = originHostname) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await certificateConnection(ip, servername); }
    catch (caught) { error = caught; }
  }
  if (error instanceof AggregateError) {
    throw new Error(error.errors.map(cause => `${cause.code || "TLS"}: ${cause.message}`).join("; "));
  }
  throw error;
}

await Promise.all([
  ...["/", "/selected-works/", "/zh-hant/", "/zh-hans/", "/sitemap.xml", "/assets/site.min.css"].map(path => check(`HTTPS ${path}`, async () => {
    const response = await get(`https://${domain}${path}`);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (!body.length) throw new Error("empty response");
    if (path === "/" && !body.includes("Ricky Kwok")) throw new Error("photography homepage missing");
    if (!response.headers.get("strict-transport-security")) throw new Error("HSTS header missing");
    if (response.headers.get("x-site-source") !== "github-pages") throw new Error("site is using its backup; investigate the origin before the next release");
    return "HTTP 200";
  })),
  check("www canonical redirect", async () => {
    const response = await get(`https://www.${domain}/`);
    if (response.status !== 308 || response.headers.get("location") !== `https://${domain}/`) throw new Error("expected one-hop 308 to the canonical homepage");
    return "HTTP 308";
  }),
  check("Public HTTP upgrades to HTTPS", async () => {
    const response = await get(`http://${domain}/`);
    if (response.status !== 308 || response.headers.get("location") !== `https://${domain}/`) throw new Error("expected direct HTTPS upgrade");
    return "HTTP 308";
  }),
  check("GitHub standard HTTPS origin", async () => {
    const response = await get(`https://${originHostname}/`);
    if (response.status !== 200) throw new Error(`origin HTTP ${response.status}; do not reattach the custom domain in GitHub Pages`);
    if (!(await response.text()).includes("Ricky Kwok")) throw new Error("photography homepage missing at origin");
    return "HTTP 200";
  }),
  ...originAddresses.map(ip => check(`GitHub origin TLS ${ip}`, () => originCertificate(ip))),
  ...[domain, `www.${domain}`].map(hostname => check(`Public edge TLS ${hostname}`, () => originCertificate(hostname, hostname))),
  check("GitHub Pages origin configuration", async () => {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const response = await get("https://api.github.com/repos/rickyinbc-tech/rickyinbc-tech.github.io/pages", { headers });
    if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
    const pages = await response.json();
    if (pages.cname !== null || !pages.https_enforced || pages.html_url !== `https://${originHostname}/`) throw new Error("Pages must use its managed github.io HTTPS origin with no custom domain");
    return "managed github.io HTTPS; no separate custom-domain origin certificate";
  })
]);

results.sort();
console.log(results.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `# Website availability and certificate checks\n\nChecked ${new Date().toISOString()}. Certificate warning threshold: ${minimumDays} days.\n\n${results.map(result => `- ${result}`).join("\n")}\n`);
}
if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exitCode = 1;
}
