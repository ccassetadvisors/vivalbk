#!/usr/bin/env node
/**
 * Viva La Vie — static site build.
 *
 * Un-bundles the five self-contained "DC" pages in ../src, de-duplicates their
 * shared assets (fonts + framework runtime), rewrites asset/link references to
 * clean paths, and injects a full SEO <head> (title, meta, Open Graph, Twitter,
 * canonical, favicons, JSON-LD) plus accessibility polish into each page.
 *
 * React + ReactDOM are vendored locally (assets/vendor) so the runtime never
 * reaches out to a CDN. Babel is intentionally NOT shipped: every component is
 * plain JS compiled via `new Function` by the runtime, so Babel is never used.
 *
 * Run: node build/build.js
 */
const fs = require("fs");
const zlib = require("zlib");
const crypto = require("crypto");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT = ROOT;

const SITE = "https://vivalavie.net";

// ---- source bundle -> output slug ------------------------------------------
const PAGES = [
  { src: "Viva La Vie.html", out: "index.html", path: "/" },
  { src: "IV Therapy.html", out: "iv-therapy.html", path: "/iv-therapy.html" },
  { src: "Aesthetics.html", out: "aesthetics.html", path: "/aesthetics.html" },
  { src: "Weight Loss.html", out: "weight-loss.html", path: "/weight-loss.html" },
  { src: "Events.html", out: "events.html", path: "/events.html" },
];

// old in-bundle filenames (with spaces) -> clean slugs, applied to every href
const LINK_MAP = {
  "Viva La Vie.html": "index.html",
  "IV Therapy.html": "iv-therapy.html",
  "Aesthetics.html": "aesthetics.html",
  "Weight Loss.html": "weight-loss.html",
  "Events.html": "events.html",
};

// image content-hash -> semantic, SEO-friendly filename
const IMAGE_NAMES = {
  c360e949ee: "assets/images/teeth-whitening.jpg",
  "57aa809133": "assets/images/event-teeth-whitening.jpg",
  eee9c7d83b: "assets/images/friends-iv-drip.jpg",
  ba7968c4c6: "assets/images/viva-la-vie-nurses.jpg",
  "8913962d3f": "assets/images/game-day-iv-drip.jpg",
  bfa3553fd8: "assets/images/mobile-iv-therapy.jpg",
  "899c54a9bd": "assets/images/teeth-whitening-before-after.png",
  dca55e55f7: "assets/images/mobile-drip-bar-event.jpg",
};

// ---- per-page SEO copy ------------------------------------------------------
const SEO = {
  "index.html": {
    title: "Viva La Vie | Mobile IV Therapy & Aesthetics Drip Bar · Lubbock, TX",
    desc: "Lubbock's premier mobile IV therapy, wellness injections & aesthetic care — administered by registered nurses in your home, hotel, or event. No waiting rooms. Book same week.",
    keywords: "mobile IV therapy Lubbock, IV drip bar Lubbock, wellness injections, aesthetics Lubbock, Botox Lubbock, mobile drip bar Texas",
  },
  "iv-therapy.html": {
    title: "IV Therapy & Drip Bar in Lubbock — 12 Signature Drips | Viva La Vie",
    desc: "Mobile IV therapy in Lubbock, TX. Twelve nurse-administered signature drips on a full liter of saline, wellness shots & in-bag boosters — at home, your hotel, an event, or in-clinic.",
    keywords: "IV therapy Lubbock, IV drip bar, vitamin infusion, hangover IV, immunity drip, B12 shots, mobile IV Lubbock",
  },
  "aesthetics.html": {
    title: "Aesthetics & Injectables in Lubbock — Botox, Microneedling | Viva La Vie",
    desc: "Nurse-delivered aesthetics in Lubbock: Botox & Dysport, microneedling, dermaplaning, teeth whitening & BrainTap. Natural, conservative results — in-clinic or brought to you.",
    keywords: "aesthetics Lubbock, Botox Lubbock, Dysport, microneedling, dermaplaning, teeth whitening Lubbock, BrainTap",
  },
  "weight-loss.html": {
    title: "Medical Weight Loss in Lubbock — Semaglutide & Tirzepatide | Viva La Vie",
    desc: "Physician-guided medical weight loss in Lubbock: Semaglutide & Tirzepatide programs with weekly registered-nurse support and metabolic boosters. Real medicine, real accountability.",
    keywords: "medical weight loss Lubbock, Semaglutide Lubbock, Tirzepatide, GLP-1, weight loss injections, skinny shot",
  },
  "events.html": {
    title: "Mobile Drip Bar for Events & Parties in Lubbock | Viva La Vie",
    desc: "Book the Viva La Vie mobile drip bar for bachelorettes, game days, corporate wellness & campus events across Lubbock. We arrive fully equipped, set up quietly, everyone glows.",
    keywords: "mobile drip bar events, bachelorette IV party Lubbock, game day recovery, corporate wellness Lubbock, event IV drip",
  },
};

// ---- helpers ----------------------------------------------------------------
function block(raw, type) {
  const m = raw.match(new RegExp('<script type="__bundler/' + type + '">([\\s\\S]*?)</script>'));
  return m ? m[1].trim() : null;
}
function hash(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
}

// Extract a page component's `get faqData()` array by bracket-matching + eval.
function extractFaq(template) {
  const at = template.indexOf("get faqData()");
  if (at === -1) return null;
  const open = template.indexOf("[", at);
  if (open === -1) return null;
  let depth = 0, end = -1;
  for (let i = open; i < template.length; i++) {
    const c = template[i];
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  try {
    // eslint-disable-next-line no-new-func
    const arr = new Function("return " + template.slice(open, end + 1))();
    if (Array.isArray(arr) && arr.length && arr[0].q) return arr;
  } catch (e) { /* ignore malformed */ }
  return null;
}

// ---- pass 1: gather assets, dedupe by content hash --------------------------
const assets = {}; // hash -> { finalPath, mime, buf }
const perPage = {}; // out -> { template, uuidToPath }

for (const pg of PAGES) {
  const raw = fs.readFileSync(path.join(SRC, pg.src), "utf8");
  const manifest = JSON.parse(block(raw, "manifest"));
  const template = JSON.parse(block(raw, "template"));
  const uuidToPath = {};

  for (const [uuid, e] of Object.entries(manifest)) {
    let buf = Buffer.from(e.data, "base64");
    if (e.compressed) buf = zlib.gunzipSync(buf);
    const h = hash(buf);

    let finalPath;
    if (e.mime === "text/javascript") finalPath = "assets/dc-runtime.js";
    else if (e.mime === "font/woff2") finalPath = "assets/fonts/vlv-" + h + ".woff2";
    else if (e.mime.startsWith("image/")) finalPath = IMAGE_NAMES[h] || ("assets/images/img-" + h + (e.mime === "image/png" ? ".png" : ".jpg"));
    else finalPath = "assets/misc/" + h;

    if (!assets[h]) assets[h] = { finalPath, mime: e.mime, buf };
    uuidToPath[uuid] = assets[h].finalPath;
  }
  perPage[pg.out] = { template, uuidToPath, faq: extractFaq(template) };
}

// write assets
for (const a of Object.values(assets)) {
  const dest = path.join(OUT, a.finalPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, a.buf);
}
console.log("Wrote " + Object.keys(assets).length + " unique assets");

// ---- JSON-LD builders -------------------------------------------------------
function businessNode() {
  return {
    "@type": ["MedicalBusiness", "HealthAndBeautyBusiness"],
    "@id": SITE + "/#business",
    name: "Viva La Vie — Aesthetics & Drip Bar",
    description: "Lubbock's mobile, nurse-led IV therapy, wellness injections, medical weight loss, and aesthetics. Registered nurses under physician oversight, delivered to your home, hotel, or event.",
    url: SITE + "/",
    telephone: "+1-806-790-1396",
    email: "contact@vivalavie.net",
    image: SITE + "/assets/og-image.jpg",
    logo: SITE + "/favicon.svg",
    priceRange: "$$",
    currenciesAccepted: "USD",
    medicalSpecialty: ["Wellness", "PlasticSurgery"],
    address: { "@type": "PostalAddress", addressLocality: "Lubbock", addressRegion: "TX", addressCountry: "US" },
    areaServed: { "@type": "City", name: "Lubbock", containedInPlace: { "@type": "State", name: "Texas" } },
    founder: [
      { "@type": "Person", name: "Lisa Velasquez", jobTitle: "Registered Nurse (RN-BSN)", telephone: "+1-806-790-1396" },
      { "@type": "Person", name: "Christy Villalobos", jobTitle: "Registered Nurse (RN-BSN)", telephone: "+1-806-777-5371" },
    ],
    // NOTE: hours below represent "7 days · evenings & weekends"; adjust to real hours.
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "09:00", closes: "21:00",
    }],
    availableService: [
      { "@type": "MedicalTherapy", name: "IV Therapy & Drip Bar" },
      { "@type": "Service", name: "Aesthetics & Injectables" },
      { "@type": "MedicalTherapy", name: "Medical Weight Loss" },
      { "@type": "Service", name: "Mobile Drip Bar for Events" },
    ],
  };
}
function faqNode(faq) {
  return {
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
function breadcrumb(pg, label) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: label, item: SITE + pg.path },
    ],
  };
}

function jsonLd(pg, faq) {
  const graph = [];
  if (pg.out === "index.html") {
    graph.push({
      "@type": "Organization",
      "@id": SITE + "/#org",
      name: "Viva La Vie",
      url: SITE + "/",
      logo: SITE + "/favicon.svg",
      email: "contact@vivalavie.net",
      telephone: "+1-806-790-1396",
    });
    graph.push(businessNode());
    graph.push({
      "@type": "WebSite",
      "@id": SITE + "/#website",
      url: SITE + "/",
      name: "Viva La Vie — Aesthetics & Drip Bar",
      publisher: { "@id": SITE + "/#org" },
      inLanguage: "en-US",
    });
  } else {
    const label = SEO[pg.out].title.split("—")[0].split("|")[0].trim();
    graph.push({
      "@type": "WebPage",
      "@id": SITE + pg.path + "#webpage",
      url: SITE + pg.path,
      name: SEO[pg.out].title,
      description: SEO[pg.out].desc,
      isPartOf: { "@id": SITE + "/#website" },
      about: { "@id": SITE + "/#business" },
      inLanguage: "en-US",
    });
    graph.push(breadcrumb(pg, label));
    graph.push({
      "@type": "Service",
      name: label,
      description: SEO[pg.out].desc,
      provider: { "@id": SITE + "/#business" },
      areaServed: { "@type": "City", name: "Lubbock" },
    });
  }
  if (faq) graph.push(faqNode(faq));
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

// ---- <head> SEO block -------------------------------------------------------
function esc(s) { return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function headBlock(pg) {
  const s = SEO[pg.out];
  const url = SITE + pg.path;
  const og = SITE + "/assets/og-image.jpg";
  const faq = perPage[pg.out].faq;
  return `
  <title>${esc(s.title)}</title>
  <meta name="description" content="${esc(s.desc)}">
  <meta name="keywords" content="${esc(s.keywords)}">
  <meta name="author" content="Viva La Vie">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${url}">
  <meta name="theme-color" content="#051a1f">
  <meta name="color-scheme" content="dark light">

  <!-- Local business / geo -->
  <meta name="geo.region" content="US-TX">
  <meta name="geo.placename" content="Lubbock">
  <meta name="format-detection" content="telephone=yes">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Viva La Vie">
  <meta property="og:title" content="${esc(s.title)}">
  <meta property="og:description" content="${esc(s.desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:locale" content="en_US">
  <meta property="og:image" content="${og}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Viva La Vie — Aesthetics & Drip Bar, Lubbock TX">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(s.title)}">
  <meta name="twitter:description" content="${esc(s.desc)}">
  <meta name="twitter:image" content="${og}">

  <!-- Icons / PWA -->
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">

  <!-- Structured data -->
  <script type="application/ld+json">${jsonLd(pg, faq)}</script>

  <!-- Mobile layer -->
  <link rel="stylesheet" href="assets/mobile.css">
  <script defer src="assets/mobile-nav.js"></script>

  <style>
    /* accessibility + polish (static, no JS required) */
    .vlv-skip{position:fixed;left:12px;top:-60px;z-index:9999;background:#1cadc2;color:#051a1f;
      font:600 13px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.06em;
      padding:12px 18px;border-radius:4px;text-decoration:none;transition:top .2s ease}
    .vlv-skip:focus{top:12px}
    a:focus-visible,button:focus-visible{outline:2px solid #1cadc2;outline-offset:3px;border-radius:2px}
    .vlv-noscript{max-width:640px;margin:16vh auto;padding:0 24px;color:#f6f2e8;
      font:400 16px/1.7 -apple-system,BlinkMacSystemFont,sans-serif;text-align:center}
    .vlv-noscript h1{font-size:30px;margin:0 0 12px;letter-spacing:.02em}
    .vlv-noscript a{color:#6adfe9}
    @media (prefers-reduced-motion: reduce){
      *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;
        transition-duration:.001ms!important;scroll-behavior:auto!important}
    }
  </style>`;
}

function mobileNav(pg) {
  const links = [
    { label: "Home", href: "index.html" },
    { label: "IV Therapy", href: "iv-therapy.html" },
    { label: "Aesthetics", href: "aesthetics.html" },
    { label: "Weight Loss", href: "weight-loss.html" },
    { label: "Events", href: "events.html" },
  ];
  const items = links.map((l) => {
    const cur = l.href === pg.out ? ' aria-current="page"' : "";
    return `    <a href="${l.href}"${cur}>${l.label}</a>`;
  }).join("\n");
  return `<button class="vlv-mnav-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="vlv-mnav"><span></span><span></span><span></span></button>
  <nav id="vlv-mnav" class="vlv-mnav" aria-label="Mobile menu" aria-hidden="true">
${items}
    <a class="vlv-mnav-book" href="tel:+18067901396">Call to Book</a>
    <p class="vlv-mnav-meta">Lisa <a href="tel:+18067901396">806-790-1396</a> &middot; Christy <a href="tel:+18067775371">806-777-5371</a><br><a href="mailto:contact@vivalavie.net">contact@vivalavie.net</a></p>
  </nav>`;
}

function noscriptBlock(pg) {
  const s = SEO[pg.out];
  return `<noscript>
    <div class="vlv-noscript">
      <h1>Viva La Vie — Aesthetics &amp; Drip Bar</h1>
      <p>${esc(s.desc)}</p>
      <p>Lubbock, TX &amp; surrounding areas · Mobile &amp; in-clinic · 7 days a week</p>
      <p><strong>Call or text:</strong> <a href="tel:+18067901396">806-790-1396</a> (Lisa) ·
         <a href="tel:+18067775371">806-777-5371</a> (Christy)<br>
         <strong>Email:</strong> <a href="mailto:contact@vivalavie.net">contact@vivalavie.net</a></p>
      <p style="opacity:.7;font-size:14px">This site is interactive and works best with JavaScript enabled.</p>
    </div>
  </noscript>`;
}

// ---- pass 2: transform + emit each page ------------------------------------
function lazyImages(html) {
  // add loading/decoding to <img>; keep the first image on the page eager (LCP)
  let first = true;
  return html.replace(/<img\s/g, () => {
    if (first) { first = false; return '<img loading="eager" decoding="async" '; }
    return '<img loading="lazy" decoding="async" ';
  });
}

// Tag elements (by their original inline-style signature) with a stable
// data-m marker so the mobile CSS can target them. data-* attributes pass
// through the runtime untouched, unlike inline styles which React
// re-serializes ("1.12fr .88fr" -> "1.12fr 0.88fr"), breaking [style*=] hooks.
function mark(t, signatures, name) {
  for (const sig of signatures) {
    const esc = sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp('(<[a-zA-Z]+)([^>]*?style="[^"]*' + esc + '[^"]*")', "g");
    t = t.replace(re, (m, p1, p2) => (/\bdata-m=/.test(p2) ? m : p1 + ' data-m="' + name + '"' + p2));
  }
  return t;
}
function applyMarkers(t) {
  t = mark(t, ["grid-template-columns:1.12fr .88fr", "grid-template-columns:1.1fr .9fr", "grid-template-columns:1.05fr .95fr", "grid-template-columns:1fr 1fr"], "split");
  t = mark(t, ["left:-20px", "right:-14px"], "float");
  t = mark(t, ["border-radius:300px 300px 10px 10px", "border-radius:260px 260px 10px 10px"], "arch");
  t = mark(t, ["animation:vlvPulse", "padding:19px 32px"], "cta");
  t = mark(t, ["min-width:230px"], "phonecard");
  t = mark(t, ["padding:10px 16px"], "announce");
  return t;
}

for (const pg of PAGES) {
  let t = perPage[pg.out].template;
  const map = perPage[pg.out].uuidToPath;

  // 1. asset UUIDs -> final paths
  for (const [uuid, p] of Object.entries(map)) t = t.split(uuid).join(p);

  // 2. lang
  t = t.replace("<html>", '<html lang="en">');

  // 3. vendor React/ReactDOM before the runtime (so it never hits a CDN)
  t = t.replace(
    '<script src="assets/dc-runtime.js"></script>',
    '<script src="assets/vendor/react.production.min.js"></script>\n' +
    '<script src="assets/vendor/react-dom.production.min.js"></script>\n' +
    '<script defer src="assets/dc-runtime.js"></script>'
  );

  // 4. SEO head, injected after the viewport meta
  t = t.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">' + headBlock(pg)
  );

  // 5. skip link + noscript right after <body>
  t = t.replace(
    "<body>",
    '<body>\n  <a class="vlv-skip" href="#content">Skip to content</a>\n  ' + mobileNav(pg) + "\n  " + noscriptBlock(pg)
  );

  // 6. focusable main-content anchor on the hero section
  t = t.replace("<section ", '<section id="content" tabindex="-1" ');

  // 7. internal links -> clean slugs
  for (const [oldName, slug] of Object.entries(LINK_MAP)) t = t.split(oldName).join(slug);

  // 8. lazy-load below-the-fold images
  t = lazyImages(t);

  // 9. tag elements for the mobile layer
  t = applyMarkers(t);

  fs.writeFileSync(path.join(OUT, pg.out), t);
  const faq = perPage[pg.out].faq;
  console.log("Built " + pg.out.padEnd(18) + " (" + (t.length / 1024).toFixed(0) + "KB, FAQ:" + (faq ? faq.length : 0) + ")");
}
console.log("Done.");
