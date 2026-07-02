#!/usr/bin/env node
/**
 * Generates raster brand assets with the local Chromium:
 *   assets/og-image.jpg    (1200x630 social share card, real brand fonts)
 *   favicon-32.png         (32x32)
 *   apple-touch-icon.png   (180x180)
 * Run: node build/gen-assets.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const EXE = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

const FONTS = {
  jost: "assets/fonts/vlv-3a360a07ac.woff2",
  marcellus: "assets/fonts/vlv-25084e16dc.woff2",
  cormorant: "assets/fonts/vlv-84a072f252.woff2",
};
function b64(p) { return fs.readFileSync(path.join(ROOT, p)).toString("base64"); }
const fontFace = `
  @font-face{font-family:'Jost';font-weight:300 600;font-style:normal;src:url(data:font/woff2;base64,${b64(FONTS.jost)}) format('woff2')}
  @font-face{font-family:'Marcellus';font-weight:400;font-style:normal;src:url(data:font/woff2;base64,${b64(FONTS.marcellus)}) format('woff2')}
  @font-face{font-family:'Cormorant Garamond';font-weight:400 500;font-style:italic;src:url(data:font/woff2;base64,${b64(FONTS.cormorant)}) format('woff2')}
`;

const drop = (sz, up) => `<span style="display:inline-block;width:${sz}px;height:${sz}px;background:radial-gradient(circle at 40% 68%,#6adfe9,#1cadc2 60%,#0b6b7a);border-radius:0 62% 62% 62%;transform:rotate(45deg);box-shadow:0 ${sz*0.3}px ${sz*0.8}px rgba(28,173,194,.5)"></span>`;

const ogHTML = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFace}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;font-family:'Jost',sans-serif}
  .card{position:relative;width:1200px;height:630px;color:#f6f2e8;
    background:radial-gradient(130% 120% at 78% 0%,#0d3038 0%,#051a1f 48%,#030f12 100%);
    display:flex;flex-direction:column;justify-content:center;padding:0 96px}
  .grid{position:absolute;inset:0;background:repeating-linear-gradient(118deg,rgba(210,237,241,.03) 0 1px,rgba(210,237,241,0) 1px 54px)}
  .glow{position:absolute;top:-140px;right:-120px;width:620px;height:620px;border-radius:50%;
    background:radial-gradient(circle,rgba(28,173,194,.20),rgba(28,173,194,0) 65%);filter:blur(20px)}
  .dripline{position:absolute;top:0;left:150px;width:1px;height:150px;background:linear-gradient(#1cadc2,rgba(28,173,194,0))}
  .kicker{display:flex;align-items:center;gap:16px;margin-bottom:30px}
  .kicker .rule{width:52px;height:1px;background:#c6a15b}
  .kicker span{font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:#d2edf1}
  .lockup{display:flex;align-items:center;gap:34px}
  .viva{font-weight:500;letter-spacing:.12em;font-size:150px;line-height:.9;color:#f6f2e8}
  .viva i{font-style:normal;color:#1cadc2}
  .lv{display:flex;flex-direction:column;gap:12px;line-height:1;padding-top:8px}
  .lv .l{display:flex;align-items:flex-start;gap:12px}
  .lv b{font-weight:500;letter-spacing:.16em;font-size:62px;color:#f6f2e8}
  .tag{display:flex;align-items:center;gap:22px;margin-top:30px}
  .tag .rule{width:34px;height:1px;background:#c6a15b}
  .tag span{font-size:23px;letter-spacing:.46em;text-transform:uppercase;color:#e8d8ae}
  .tag .fade{flex:1;height:1px;background:linear-gradient(90deg,rgba(198,161,91,.55),rgba(210,237,241,0))}
  .sub{font-family:'Cormorant Garamond';font-style:italic;font-size:44px;color:#f6f2e8;margin-top:40px}
  .meta{position:absolute;bottom:54px;left:96px;right:96px;display:flex;justify-content:space-between;align-items:center;
    font-size:22px;letter-spacing:.06em;color:rgba(246,242,232,.72)}
  .meta b{color:#6adfe9;font-weight:400}
</style></head><body>
  <div class="card">
    <div class="grid"></div><div class="glow"></div><div class="dripline"></div>
    <div class="kicker"><span class="rule"></span><span>Lubbock, Texas &middot; Mobile Drip Bar</span></div>
    <div class="lockup">
      <div class="viva">V<i>IV</i>A</div>
      <div class="lv"><div class="l"><b>L</b>${drop(30, true)}</div><b>VIE</b></div>
    </div>
    <div class="tag"><span class="rule"></span><span>Aesthetics &amp; Drip Bar</span><span class="fade"></span></div>
    <div class="sub">Wellness &amp; beauty, delivered to you.</div>
    <div class="meta"><span>Mobile IV Therapy &middot; Aesthetics &middot; Weight Loss</span><span><b>806-790-1396</b></span></div>
  </div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--force-color-profile=srgb"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.setContent(ogHTML, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(ROOT, "assets/og-image.jpg"), type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log("og-image.jpg");

  // favicon PNGs from the SVG
  const svg = fs.readFileSync(path.join(ROOT, "favicon.svg"), "utf8");
  for (const [file, size] of [["favicon-32.png", 32], ["apple-touch-icon.png", 180]]) {
    const ip = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 2 });
    await ip.setContent(`<!doctype html><html><head><style>*{margin:0}html,body{width:${size}px;height:${size}px}svg{width:${size}px;height:${size}px;display:block}</style></head><body>${svg}</body></html>`);
    await ip.screenshot({ path: path.join(ROOT, file), type: "png", clip: { x: 0, y: 0, width: size, height: size } });
    await ip.close();
    console.log(file);
  }
  await browser.close();
})();
