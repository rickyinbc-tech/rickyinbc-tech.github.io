# Edge redirects for rickykwok.com

GitHub Pages serves static files and cannot return a genuine HTTP 301 or 308 for
the legacy aliases in this repository. `redirect-map.json` is the reviewed
one-hop migration map. `cloudflare-worker.mjs` applies it at the edge and lets
all unmapped paths continue to GitHub Pages, preserving a real 404 for unknown
URLs.

The Worker redirects only explicitly mapped paths and returns `410 Gone` for
retired commercial surfaces:

* `rickykwok.com` legacy aliases to their canonical site pages
* `www.rickykwok.com` to the canonical host, without adding a second hop
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
3. Set SSL/TLS encryption mode to **Full (strict)**. The GitHub Pages origins
   currently have valid certificates.
4. Deploy with `wrangler deploy` from this directory. `wrangler.jsonc` defines
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
