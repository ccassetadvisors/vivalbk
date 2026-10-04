# Viva La Vie — Aesthetics & Drip Bar

Marketing site for **Viva La Vie**, a mobile, nurse-led IV therapy, aesthetics,
and medical-weight-loss business in **Lubbock, TX**. Five pages, fully static,
self-contained, and SEO-ready.

```
/                    index.html          Home
/iv-therapy.html     IV Therapy & the Drip Bar
/aesthetics.html     Aesthetics & Injectables
/weight-loss.html    Medical Weight Loss
/events.html         Events & Party Packages
```

## Deploying

It's a static site — serve the repository root on any static host (Netlify,
Vercel, Cloudflare Pages, S3 + CloudFront, GitHub Pages, nginx). No build step
is required to deploy; everything under the repo root is the site.

```
assets/
  images/     photography (semantic filenames)
  fonts/      self-hosted woff2 (Jost, Marcellus, Cormorant Garamond)
  vendor/     react + react-dom (UMD, pinned 18.3.1) — vendored, see below
  dc-runtime.js   the "DC" component runtime
favicon.svg, favicon-32.png, apple-touch-icon.png, og-image.jpg
site.webmanifest, robots.txt, sitemap.xml
```

> Update the canonical domain if it isn't `https://vivalavie.net`: it appears in
> each page's `<head>` (canonical + Open Graph + JSON-LD), in `sitemap.xml`, and
> in `robots.txt`. The domain is a single constant (`SITE`) in `build/build.js`.

## How it's built

Each page is a self-contained "DC" component (a small reactive framework that
renders an HTML template with `{{ }}` bindings against a plain-JS component
class). The pages were delivered as single-file bundles; `build/build.js`
un-bundles them into this clean, deployable structure:

- De-duplicates shared assets (fonts + runtime) across all five pages by content
  hash, and gives images descriptive, SEO-friendly filenames.
- Rewrites internal links to clean slugs and injects a complete SEO `<head>`
  (title, meta description, canonical, Open Graph, Twitter, JSON-LD) per page.
- Adds accessibility + performance polish (see below).

Regenerate everything:

```bash
npm install            # dev-only: playwright-core, for asset gen + verify
npm run build          # src/*.html (bundles) -> deployable pages + assets
npm run gen-assets     # renders og-image.jpg + favicons via headless Chromium
npm run verify         # loads every page in a browser, checks it mounts clean
```

`src/` holds the original single-file bundles as the build input, kept for
reproducibility. You can hand-edit the generated pages directly — the build is
only needed if you want to regenerate from the bundles.

### No CDN dependency

The DC runtime originally fetched React, ReactDOM, and Babel from a public CDN
at page load. That's now removed:

- **React + ReactDOM are vendored** in `assets/vendor/` and loaded locally, so
  the site has no third-party runtime dependency and works offline.
- **Babel is not shipped at all** (~3 MB saved). The components are plain JS
  compiled by the runtime directly, so the in-browser Babel transform is never
  used.

## SEO

- Per-page `<title>`, meta description, keywords, canonical, and `robots`.
- Open Graph + Twitter Card with a branded 1200×630 share image.
- JSON-LD structured data: `Organization`, `MedicalBusiness` /
  `HealthAndBeautyBusiness` (NAP, founders, service area, services), `WebSite`,
  per-page `WebPage` + `BreadcrumbList` + `Service`, and `FAQPage` (built from
  each page's real FAQ content — eligible for FAQ rich results).
- `sitemap.xml` (with image entries), `robots.txt`, `site.webmanifest`, favicons.
- A `<noscript>` fallback exposes the business name, pitch, phone, and email.

> **Business details to confirm:** the `openingHoursSpecification` in the
> homepage JSON-LD (`build/build.js`) is a placeholder for "7 days · evenings &
> weekends" — set it to real hours. It's a service-area business (no public
> street address); add a `PostalAddress` + `geo` if an in-clinic address is
> published.

## Mobile

The pages are built with a desktop-first inline-style system, so the mobile
experience lives in a dedicated layer that's scoped to `@media (max-width: 860px)`
and never touches desktop:

- `assets/mobile.css` + `assets/mobile-nav.js` — a full-width drop-down menu
  (hamburger → animated overlay with the active page marked), plus layout fixes:
  the fixed two-column grids collapse to one, the arched photos and small
  floating badges are tamed/hidden, the hero and booking buttons shrink to fit,
  and a mobile-only `box-sizing: border-box` stops the padded fluid containers
  from overflowing.
- Because the runtime re-serializes inline styles (`1.12fr .88fr` →
  `1.12fr 0.88fr`), the mobile CSS can't hook onto `[style*=…]` reliably. Instead
  `build.js` tags the relevant elements with stable `data-m="…"` markers
  (`split`, `arch`, `float`, `cta`, `phonecard`, `announce`) that the CSS targets.

## Accessibility & performance

- `<html lang="en">`, a "Skip to content" link, and visible keyboard focus rings.
- `prefers-reduced-motion` disables the ambient animations.
- Below-the-fold images are lazy-loaded; the hero image loads eagerly.
