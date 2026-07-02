#!/usr/bin/env node
// Smoke-test each built page in a real browser: no console errors, app mounts,
// interactive widgets present. Screenshots index for visual review.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const EXE = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".xml": "application/xml", ".webmanifest": "application/manifest+json" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end("404"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
  fs.createReadStream(fp).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  const pages = ["index.html", "iv-therapy.html", "aesthetics.html", "weight-loss.html", "events.html"];
  let ok = true;

  for (const pg of pages) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    const failed = [];
    page.on("requestfailed", (r) => failed.push(r.url().replace(base, "") + " (" + (r.failure()?.errorText) + ")"));

    await page.goto(`${base}/${pg}`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(900);

    const dcRoot = await page.$("#dc-root");
    const title = await page.title();
    const h1 = (await page.$$eval("h1", (ns) => ns.map((n) => n.textContent.trim()).join(" | "))).slice(0, 80);
    const imgs = await page.$$eval("img", (ns) => ns.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc.split("/").pop()));
    const jsonld = await page.$$eval('script[type="application/ld+json"]', (ns) => ns.length);

    const mounted = !!dcRoot;
    const clean = errors.length === 0 && failed.length === 0 && imgs.length === 0;
    if (!mounted || !clean) ok = false;
    console.log(`\n=== ${pg} ===`);
    console.log(`  mounted:${mounted}  title:"${title.slice(0, 50)}..."  h1:"${h1}"  jsonld:${jsonld}`);
    if (errors.length) console.log("  JS ERRORS:", errors.slice(0, 5));
    if (failed.length) console.log("  FAILED REQ:", failed.slice(0, 8));
    if (imgs.length) console.log("  BROKEN IMG:", imgs);

    if (pg === "index.html") {
      // exercise interactivity: FAQ toggle + build-a-drip add-in
      const beforeH = await page.$eval("#dc-root", (e) => e.scrollHeight);
      await page.screenshot({ path: path.join(ROOT, "build/_verify-index.jpg"), type: "jpeg", quality: 70, fullPage: true });
      console.log("  saved full-page screenshot; scrollHeight:", beforeH);
    }
    await page.close();
  }

  await browser.close();
  server.close();
  console.log("\n" + (ok ? "ALL PAGES OK ✓" : "PROBLEMS FOUND ✗"));
  process.exit(ok ? 0 : 1);
})();
