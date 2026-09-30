# Edge redirects for rickykwok.com

GitHub Pages serves static files and cannot return a genuine HTTP 301 or 308 for
the legacy aliases in this repository. `redirect-map.json` is the reviewed
one-hop migration map. `cloudflare-worker.mjs` applies it at the edge and forwards
all unmapped paths to the managed HTTPS origin `rickyinbc-tech.github.io`, preserving a real 404 for unknown
URLs.

The Worker redirects only explicitly mapped paths and returns `410 Gone` for
retired commercial surfaces:

* `rickykwok.com` legacy aliases to their canonical site pages
* `www.rickykwok.com` to the canonical host, without adding a second hop
* canonical `/index.html` URL variants to their clean trailing-slash URLs
* `photo.rickykwok.com/` to the canonical homepage; every other path on that
  retired host returns `410 Gone` with `X-Robots-Tag: noindex, nofollow`
* retired main-domain contact, print, edition, licensing, press, policy, and
  studio paths (including Traditional and Simplified Chinese variants) return
  `410 Gone` with an HTTP `X-Robots-Tag: noindex, nofollow`
* the established `blog.rickykwok.com/` and `/feed` entry points redirect to
  `/journal/`; unmatched blog paths return `410 Gone`
* `select.rickykwok.com/` redirects to the canonical homepage so the retired
  homepage's search and link signals consolidate there; every other path on the
  retired host returns `410 Gone`
* build tooling, repository metadata, unminified site assets, and edge
  configuration fail closed with `404 Not Found` even if an upstream cache
  still has an older branch-based Pages deployment

It does not wildcard redirect unknown `photo` paths into unrelated canonical
content. Those paths fail closed with a permanent removal response, so a stale
or accidentally re-enabled origin cannot serve the former commercial site.
The Worker returns a genuine 404 for unrelated or unknown subdomains instead of
forwarding or serving them.

Before attaching this Worker:

1. Import every active Namecheap record into Cloudflare. Preserve all GitHub
   Pages A/CNAME records, email-forwarding MX records, SPF, and Google site
   verification TXT records. Keep mail records DNS-only.
2. Confirm `@`, `www`, `blog`, `photo`, and retired `select` are proxied through
   the Cloudflare zone. Remove or leave DNS-only any unrelated historical
   subdomains.
3. Keep SSL/TLS encryption mode at **Full (strict)**. Verify the GitHub Pages
   managed `github.io` origin certificate and its remaining lifetime before deploying.
   GitHub Pages must have **no custom domain** and Enforce HTTPS enabled; the
   public domain lives at Cloudflare, while the origin uses GitHub-managed TLS.
4. From the repository root, run `npm ci && npm run check` to build and validate
   the public-only `_site/` backup. Deploy from this directory with
   `npx wrangler deploy`. `wrangler.jsonc` defines
   the apex and wildcard-subdomain worker routes; only proxied host records
   receive the Worker.
5. Test every source in `redirect-map.json` in a staging or preview route.
6. Confirm each destination is a direct HTTP 200 self-canonical page.
7. Check `curl -I` for a single 308 hop only; verify retired commercial and
   disabled-host paths return 410 without a `Location` header, while other
   unknown legacy-host paths still return 404.
8. Keep the static noindex meta-refresh pages as a temporary fallback until
   production checks pass. Remove them only after the edge redirect has been
   observed in Search Console.

Query parameters and unknown URLs are never converted into redirects.

## Availability and outage prevention

Cloudflare fetches `https://rickyinbc-tech.github.io` with normal certificate
validation and maps directory redirects back to `https://rickykwok.com`.
The website no longer relies on a separately renewed GitHub certificate for
`rickykwok.com` or `www.rickykwok.com`. Do not restore the GitHub custom-domain
setting or a `CNAME` file: doing so creates origin redirects back to Cloudflare.
Keep Cloudflare Full (strict) enabled. Public HTTP redirects directly to HTTPS.
Visitor cookies, credentials, and form bodies are never forwarded to GitHub.

The Worker includes a validated public-only `_site/` backup through the
`FALLBACK_ASSETS` binding. Origin network errors, server errors, and cached
custom-domain redirect loops serve that backup with security headers intact.
Existing redirects, retired 410 routes, protected source paths, and real origin
404s retain their behavior. The backup is refreshed by each edge deployment;
after website content changes, run the build/validation and deploy the edge
Worker to update it. Normal content continues to follow GitHub Pages releases.
The response header `X-Site-Source` identifies `github-pages` or
`cloudflare-backup`; monitoring fails if backup serving is detected so an
outage is not silently hidden.

The `Website availability and SSL monitoring` workflow runs every 30 minutes
and after Pages deployments. It checks live English and Chinese content,
canonical redirects, HTTPS enforcement, failover status, the managed origin's
certificate on all four GitHub IPs, and the Pages origin configuration. It
fails when fewer than 14 days remain. GitHub Actions failure notifications
provide alerts according to the owner's GitHub notification settings.
Scheduled runs may be delayed by GitHub; this is not an uptime SLA.

If the monitor fails, inspect its job summary and `X-Site-Source`, confirm the
GitHub Pages setting still has no custom domain and Enforce HTTPS enabled,
and verify `https://rickyinbc-tech.github.io/` returns the photography homepage
without a redirect. Repair the GitHub deployment or managed TLS issue while
the backup keeps public content available. Do not disable certificate
validation. Keep the backup current and re-run the monitoring workflow before
closing an incident.
