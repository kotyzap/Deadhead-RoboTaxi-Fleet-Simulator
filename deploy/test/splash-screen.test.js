/* Splash screen — Pavel's ask, 2026-07-30: show a title-card image before
 * anything else (before the resume-save dialog, before an account prompt,
 * before showIntro()'s video), with a "Loading" pill and a few animated
 * dots, for a couple of seconds.
 *
 * #splash is deliberately visible by DEFAULT in markup (no [hidden]) and is
 * only ever hidden by a fixed-timer script — see the comment on it in
 * deadhead.html. That means the checks below can't wait for it to disappear
 * the normal way inside this test's short boot window; instead they assert
 * the STRUCTURE (it exists, starts visible, sits first in the body, both
 * images exist on disk and are wired into the stylesheet) and that the boot
 * script schedules exactly the two timers it's supposed to.
 *
 * Run: node test/splash-screen.test.js   (or npm test)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TARGETS = [
  path.join(__dirname, '..', '..', 'deadhead.html'),
  path.join(__dirname, '..', 'public', 'index.html'),
];

let failures = 0;

function strip(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '');
}

async function boot(file) {
  const dom = new JSDOM(strip(fs.readFileSync(file, 'utf8')), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || ((q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
      }));
      window.confirm = () => true;
    },
  });
  await new Promise((r) => setTimeout(r, 90));
  return dom;
}

async function run(file) {
  const label = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, 'utf8');
  const dom = await boot(file);
  const w = dom.window;
  const doc = w.document;
  const A = w.DH_ACT1;
  let ok = true;
  const check = (name, fn) => {
    let pass = false;
    try { pass = !!fn(); } catch (e) {
      pass = false;
      if (process.env.DEBUG) console.error('  threw:', e && e.stack || e);
    }
    if (!pass) { console.error(`FAIL ${label}: ${name}`); ok = false; failures++; }
  };

  // ---- markup: visible by default, no JS gate on first paint -------------
  const el = doc.getElementById('splash');
  check('#splash exists', () => !!el);
  check('#splash carries no [hidden] in markup — visible on first paint',
    () => el && !el.hasAttribute('hidden'));
  check('#splash has a background layer and a loading pill',
    () => el && el.querySelector('.splash-bg') && el.querySelector('.splash-load'));
  check('the loading pill has exactly 4 animated dots',
    () => el.querySelectorAll('.splash-dots i').length === 4);

  // ---- DOM order: first real visual content in <body> --------------------
  check('#splash comes before #bgmap in the DOM', () => {
    const bgmap = doc.getElementById('bgmap');
    return !!bgmap && !!(el.compareDocumentPosition(bgmap) & w.Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check('#splash comes before .app in the DOM', () => {
    const app = doc.querySelector('.app');
    return !!app && !!(el.compareDocumentPosition(app) & w.Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check('#splash comes before #intro in the DOM (never needs to win a z-index fight)', () => {
    const intro = doc.getElementById('intro');
    return !!intro && !!(el.compareDocumentPosition(intro) & w.Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // ---- images exist on disk and are wired into the stylesheet ------------
  const dir = path.dirname(file);
  check('deadhead-splash-wide.jpg exists next to this HTML file',
    () => fs.existsSync(path.join(dir, 'deadhead-splash-wide.jpg')));
  check('deadhead-splash-portrait.jpg exists next to this HTML file',
    () => fs.existsSync(path.join(dir, 'deadhead-splash-portrait.jpg')));
  check('.splash-bg references the wide image by default',
    () => /\.splash-bg\{[^}]*deadhead-splash-wide\.jpg/.test(src));
  check('an orientation:portrait rule swaps in the portrait image',
    () => /@media \(orientation:portrait\)\{[^}]*deadhead-splash-portrait\.jpg/.test(src));

  // ---- ULTRAWIDE FRAMING (v0.58.0) ---------------------------------------
  // The bug Pavel hit: a single cover-sized layer crops the top and bottom
  // on a 21:9 display, and the DEADHEAD title lives at the top. contain
  // guarantees the whole composition survives any aspect ratio; the blurred
  // .splash-fill behind it is what stops the letterbox bars reading as void.
  check('#splash has a separate blurred fill layer behind the artwork',
    () => !!el.querySelector('.splash-fill'));
  check('.splash-bg uses contain, never cover — the title must not be cropped',
    () => /\.splash-bg\{[^}]*center\/contain/.test(src) &&
          !/\.splash-bg\{[^}]*center\/cover/.test(src));
  check('.splash-fill uses cover + blur, so it fills any aspect ratio',
    () => /\.splash-fill\{[^}]*center\/cover/.test(src) &&
          /\.splash-fill\{[^}]*filter:blur\(/.test(src));
  check('the portrait swap covers BOTH layers, not just the sharp one',
    () => /@media \(orientation:portrait\)\{\s*\.splash-bg,\.splash-fill\{/.test(src));

  // ---- the loading pill is centred, not bottom-anchored (v0.58.0) --------
  check('#splash centres its pill (align-items:center, not flex-end)',
    () => /#splash\{[^}]*align-items:center/.test(src) &&
          !/#splash\{[^}]*align-items:flex-end/.test(src));
  check('.splash-load no longer pins itself to the bottom with a vh margin',
    () => !/\.splash-load\{[^}]*margin-bottom:9vh/.test(src));

  // ---- reduced motion is handled --------------------------------------
  check('prefers-reduced-motion rule exists for the splash',
    () => /@media \(prefers-reduced-motion:reduce\)\{[^}]*splash-dots/.test(src));

  // ---- PHASE 2: splash becomes the intro's backdrop (v0.58.0) ------------
  // Pavel: "That black screen is ugly. Let's merge loading and video and
  // account together." So on a fresh run the splash does not fade out — it
  // drops below #intro and keeps its artwork, and #intro goes translucent.
  check('SPLASH_MS/SPLASH_FADE_MS are declared once, before the rest of boot',
    () => (src.match(/var SPLASH_MS=/g) || []).length === 1);
  check('splashBackdrop/splashHide/splashDone are all exposed',
    () => typeof A.splashBackdrop === 'function' &&
          typeof A.splashHide === 'function' &&
          typeof A.splashDone === 'function');
  check('a .splash-back rule drops the splash BELOW #intro (80 < 90)',
    () => /#splash\.splash-back\{[^}]*z-index:80/.test(src));
  check('.splash-back hides the loading pill but keeps the artwork',
    () => /#splash\.splash-back \.splash-load\{display:none\}/.test(src));
  check('#intro gets a translucent over-artwork variant',
    () => /#intro\.intro-onsplash\{/.test(src));
  /* #intro.intro-onsplash itself dropped its backdrop-filter on 2026-07-30
     (Pavel: "Do not blur the center of the photo... it looks super" — that
     blur covered #intro's whole full-viewport box, including the gap above
     .intro-frame where the splash art's own baked-in title sits, softening
     it along with everything else). The THE TRAP invariant that motivated
     this test in the first place still holds and is still worth asserting:
     never plain filter: on #intro itself, at any point in this rule family,
     because that creates a containing block that breaks the position:fixed
     descendants (#ray, #dimscrim) that assume the viewport is their
     containing block. backdrop-filter itself is still very much in use —
     just pushed down onto .intro-wing (the sides) and .intro-frame (the
     card), which is what "blur sides beyond the form" now means. */
  check('#intro.intro-onsplash itself carries no blur any more — the center reads sharp',
    () => {
      const m = src.match(/#intro\.intro-onsplash\{([^}]*)\}/);
      return !!m && !/backdrop-filter:/.test(m[1]) && !/[^-]filter:/.test(m[1]);
    });
  check('never plain filter: anywhere in the onsplash rule family (THE TRAP)',
    () => {
      const rules = src.match(/#intro\.intro-onsplash[^{]*\{[^}]*\}/g) || [];
      return rules.length > 0 && rules.every((r) => !/[^-]filter:(?!.*backdrop)/.test(r) || /backdrop-filter:/.test(r));
    });
  check('the side wings still carry their own backdrop-filter blur',
    () => /#intro\.intro-onsplash \.intro-wing\{[^}]*backdrop-filter:/.test(src));
  check('the card plate still carries its own backdrop-filter blur',
    () => /#intro\.intro-onsplash \.intro-frame\{[^}]*backdrop-filter:/.test(src));
  // WIDENED 2026-07-30 (Pavel: "black text on dark background" on the
  // signed-in panel): #intro's own background is the same near-opaque dark
  // gradient whether or not .intro-onsplash is on — that class only adds a
  // lighter scrim on top of it — so scoping the dark-glass token override to
  // .intro-onsplash left the card unreadable in Day theme the moment the
  // splash art phase ended (or never started, e.g. a second city's intro).
  // The override now applies to #intro .intro-acct unconditionally.
  check('the injected cloud.js account card gets dark tokens whenever #intro is up, not only over the splash artwork',
    () => /#intro \.intro-acct\{/.test(src) &&
          !/#intro\.intro-onsplash \.intro-acct\{/.test(src));

  // splashBackdrop() puts both halves of the handover in place at once.
  A.splashBackdrop();
  check('splashBackdrop() un-hides the splash', () => el.hidden === false);
  check('splashBackdrop() marks it as the backdrop',
    () => el.classList.contains('splash-back'));
  check('splashBackdrop() drops any in-flight fade-out',
    () => !el.classList.contains('splash-out'));
  check('splashBackdrop() also marks #intro as sitting on the artwork',
    () => doc.getElementById('intro').classList.contains('intro-onsplash'));

  // ...and splashHide() takes both back down, so a second city never
  // inherits a stale backdrop over the live console.
  A.splashHide();
  check('splashHide() hides the splash', () => el.hidden === true);
  check('splashHide() clears the backdrop class',
    () => !el.classList.contains('splash-back'));
  check('splashHide() un-marks #intro',
    () => !doc.getElementById('intro').classList.contains('intro-onsplash'));

  // splashDone() is the timer's decision point: back the intro if it is up,
  // otherwise get out of the way entirely (the returning-player path, where
  // #resume shows instead and there is nothing to be a backdrop for).
  doc.getElementById('intro').hidden = false;
  A.splashDone();
  check('splashDone() becomes a backdrop when the intro is open',
    () => el.hidden === false && el.classList.contains('splash-back'));
  doc.getElementById('intro').hidden = true;
  A.splashDone();
  check('splashDone() hides fully when there is no intro to back',
    () => el.hidden === true);

  check('closeIntro() releases the splash on every intro exit',
    () => /function closeIntro\(\)\{[\s\S]*?splashHide\(\);[\s\S]*?\}/.test(src));

  if (ok) console.log(`${TARGETS.length > 1 ? label + ': ' : ''}splash screen OK`);
  dom.window.close();
  return ok;
}

(async () => {
  let allOk = true;
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) continue;
    const ok = await run(file);
    allOk = allOk && ok;
  }
  if (!allOk || failures > 0) {
    console.error(`\n${failures} failure(s).`);
    process.exit(1);
  }
  console.log('All splash-screen checks passed.');
})();
