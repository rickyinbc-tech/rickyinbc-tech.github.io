# Edge redirects for rickykwok.com

GitHub Pages serves static files and cannot return a genuine HTTP 301 or 308 for
the legacy aliases in this repository. `redirect-map.json` is the reviewed
one-hop migration map. `cloudflare-worker.mjs` applies it at the edge and lets
all unmapped paths continue to GitHub Pages, preserving a real 404 for unknown
URLs.

Before attaching this Worker to `rickykwok.com/*`:

1. Confirm the domain is proxied through the Cloudflare zone.
2. Test every source in `redirect-map.json` in a staging or preview route.
3. Confirm each destination is a direct HTTP 200 self-canonical page.
4. Attach the Worker route, then check `curl -I` for one 308 hop only.
5. Keep the static noindex meta-refresh pages as a temporary fallback until
   production checks pass. Remove them only after the edge redirect has been
   observed in Search Console.

Only campaign click identifiers are forwarded. Form contents, arbitrary query
parameters, and unknown URLs are never converted into redirects.
