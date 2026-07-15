# Edge redirects for rickykwok.com

GitHub Pages serves static files and cannot return a genuine HTTP 301 or 308 for
the legacy aliases in this repository. `redirect-map.json` is the reviewed
one-hop migration map. `cloudflare-worker.mjs` applies it at the edge and lets
all unmapped paths continue to GitHub Pages, preserving a real 404 for unknown
URLs.

The Worker redirects only explicitly mapped paths:

* `rickykwok.com` legacy aliases to their canonical site pages
* `www.rickykwok.com` to the canonical host, without adding a second hop
* `blog.rickykwok.com/` and its retired feed to `/journal/`
* `photo.rickykwok.com/` to the canonical homepage
* `wine.rickykwok.com` from its dedicated GitHub repository, including the daily chart data
* the 18 historical Namecheap forwarding hosts to the canonical homepage,
  preserving their existing host-wide forwarding behavior over both HTTP and
  HTTPS

It does not wildcard redirect unknown `blog` or `photo` paths. Those requests
continue to the origin and preserve a genuine 404 until an exact historical
mapping has been verified. A proxied wildcard DNS record is used only as an
edge entry point for the historical forwarding hosts; the Worker returns a
genuine 404 for other unknown subdomains rather than forwarding them.

Before attaching this Worker:

1. Import every active Namecheap record into Cloudflare. Preserve all GitHub
   Pages A/CNAME records, email-forwarding MX records, SPF, and Google site
   verification TXT records. Keep mail records DNS-only.
2. Confirm `@`, `www`, `blog`, and `photo` are proxied through the Cloudflare
   zone. Create the 18 explicit legacy forwarding host records listed in
   `redirect-map.json`, proxy them, and leave `select` and `metal` DNS-only
   until their separate services have been checked.
3. Set SSL/TLS encryption mode to **Full (strict)**. The GitHub Pages origins
   currently have valid certificates.
4. Deploy with `wrangler deploy` from this directory. `wrangler.jsonc` defines
   the apex and wildcard-subdomain worker routes; only proxied host records
   receive the Worker.
5. Test every source in `redirect-map.json` in a staging or preview route.
6. Confirm each destination is a direct HTTP 200 self-canonical page.
7. Check `curl -I` for a single 308 hop only; verify unknown legacy-host paths
   still return 404.
8. Keep the static noindex meta-refresh pages as a temporary fallback until
   production checks pass. Remove them only after the edge redirect has been
   observed in Search Console.

Only campaign click identifiers are forwarded. Form contents, arbitrary query
parameters, and unknown URLs are never converted into redirects.
