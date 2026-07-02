# Viva La Vie — website

Static site for Viva La Vie (Aesthetics & Drip Bar, Lubbock TX). Five pages,
fully self-contained — no build step, no dependencies.

## Deploy (Vercel)
Just connect this repo. `vercel.json` tells Vercel it's a static site and to
serve the repo root, so it deploys as-is. No configuration needed.

Works the same on Netlify, Cloudflare Pages, GitHub Pages, or any static host —
serve the folder root.

## Files
- `index.html`, `iv-therapy.html`, `aesthetics.html`, `weight-loss.html`, `events.html`
- `assets/` — fonts, images, vendored React runtime, mobile CSS/JS
- favicons, `robots.txt`, `sitemap.xml`, `site.webmanifest`, `vercel.json`

> Update the domain if it isn't `vivalavie.net`: it appears in each page's
> `<head>` (canonical, Open Graph, structured data), plus `sitemap.xml` and
> `robots.txt`.
