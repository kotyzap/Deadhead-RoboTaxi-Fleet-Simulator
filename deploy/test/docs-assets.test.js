/* GitHub Pages asset guard for docs/index.html.
 *
 * WHY THIS EXISTS
 *
 * Same failure mode as car-photos.test.js, one level up: the marketing page
 * degrades politely when an image is missing, so a missing image is invisible.
 *
 *   - The hero's key art is a CSS background-image. If the file is gone the
 *     band falls back to --splash-deep and still looks deliberate: a flat
 *     near-black hero. Nothing errors, nothing is misaligned, and the single
 *     most expensive asset on the page has silently stopped appearing.
 *   - The closing CTA band works the same way.
 *   - <img> tags on this page mostly carry onerror handlers or sit inside a
 *     gradient frame, for the same good reasons — and with the same cost.
 *
 * Neither GitHub Pages nor a browser will tell anyone. So the paths get
 * checked against the filesystem here, in the suite that already runs before
 * every deploy.
 *
 * This also catches the specific way it WOULD break: docs/img/ is a separate
 * copy of every asset (the page is served from docs/, so it cannot reach
 * ../cars/), and adding an image to the repo root without copying it into
 * docs/img/ is a one-keystroke mistake.
 *
 * Run: node test/docs-assets.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DOCS = path.join(ROOT, 'docs');
const PAGE = path.join(DOCS, 'index.html');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('docs/ page assets');

const html = fs.readFileSync(PAGE, 'utf8');

/* ---- 1. every <img src="img/..."> resolves ----------------------------- */
const imgSrcs = [...html.matchAll(/<img[^>]+src="(img\/[^"]+)"/g)].map((m) => m[1]);
check('the page has <img> tags pointing into img/', imgSrcs.length > 0, `${imgSrcs.length} found`);
[...new Set(imgSrcs)].forEach((rel) => {
  check(`docs/${rel} exists`, fs.existsSync(path.join(DOCS, rel)));
});

/* ---- 2. every CSS url(img/...) resolves -------------------------------- */
/* The hero and the closing CTA are background-images, which is exactly why
   they need this: a 404 here renders as a plain dark band, not as a fault. */
const cssUrls = [...html.matchAll(/url\((img\/[^)'"]+)\)/g)].map((m) => m[1]);
check('the page has CSS background art', cssUrls.length > 0, `${cssUrls.length} found`);
[...new Set(cssUrls)].forEach((rel) => {
  check(`docs/${rel} exists (CSS background)`, fs.existsSync(path.join(DOCS, rel)));
});

/* ---- 3. the social card is the size the meta tags promise -------------- */
/* A link preview that does not match its declared og:image:width/height gets
   re-cropped by the scraper, usually through the middle of the wordmark. */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return {h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7)};
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
const ogW = (html.match(/og:image:width" content="(\d+)"/) || [])[1];
const ogH = (html.match(/og:image:height" content="(\d+)"/) || [])[1];
const ogRel = (html.match(/og:image" content="[^"]*\/(img\/[^"]+)"/) || [])[1];
check('og:image, og:image:width and og:image:height are all declared',
  !!(ogW && ogH && ogRel), `${ogRel} ${ogW}x${ogH}`);
if (ogW && ogH && ogRel) {
  const f = path.join(DOCS, ogRel);
  check(`docs/${ogRel} exists`, fs.existsSync(f));
  if (fs.existsSync(f)) {
    const s = jpegSize(f);
    check(`docs/${ogRel} is really ${ogW}x${ogH}`,
      !!s && String(s.w) === ogW && String(s.h) === ogH, s ? `${s.w}x${s.h}` : 'unreadable');
  }
}

/* ---- 4. the key art must not carry the publisher furniture ------------- */
/* The source render has a hard-coded game URL, an ESRB badge and two studio
   logos burned into its bottom strip. hero-splash.jpg is cropped above that
   strip on purpose (see the .hero-band comment in index.html). If someone
   re-exports the art without the crop, the hero silently starts advertising
   a rating nobody ever issued. Checked by ASPECT RATIO, which is the crop's
   fingerprint: the uncropped render is 1920x1072 (1.79), the hero cut is
   1920x737 (2.61). */
const heroFile = path.join(DOCS, 'img', 'hero-splash.jpg');
if (fs.existsSync(heroFile)) {
  const s = jpegSize(heroFile);
  check('hero-splash.jpg is the CROPPED cut, not the full splash render '
      + '(the full frame carries a burned-in URL and an ESRB badge)',
    !!s && s.w / s.h > 2.3, s ? `${s.w}x${s.h} = ${(s.w / s.h).toFixed(2)}:1` : 'unreadable');
}

/* ---- 5. no in-page anchor points at a section that is not there -------- */
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hrefs = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))];
const dead = hrefs.filter((h) => !ids.has(h));
check('every in-page #anchor has a target', dead.length === 0, dead.join(', '));

if (failures) {
  console.error(`\n${failures} docs-asset check(s) failed.`);
  process.exit(1);
}
console.log('\nAll docs-asset checks passed.');
