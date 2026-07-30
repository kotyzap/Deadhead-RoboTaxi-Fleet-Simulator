/* Tablet sidebar: one collapsible right column, Offers always open.
 *
 * WHAT THIS PROTECTS
 *
 * Pavel's ask (2026-07-30): below 1499px the layout used to fully stack —
 * console on top, then all seven side panels (Fleet, Platforms, Rapid,
 * Books, Incidents, Messages, Offers) one after another, full width, in one
 * long scroll. He wanted the desktop "console beside a column of panels"
 * shape kept at tablet widths instead, just narrower — with Offers always
 * visible (never collapsed) and the other six collapsed to just their
 * header by default, expanding on tap or automatically when something
 * relevant happens in them (an incident, a message, a charge dispatch).
 *
 * jsdom cannot compute a CSS @media query or layout a real grid, so this
 * file checks two different things two different ways:
 *
 *   1. The CSS SOURCE (string checks) — that the <=1499px block actually
 *      places both .wing elements in the same grid column/different rows,
 *      collapses everything but #panel-offers by default, and never
 *      collapses #panel-offers itself.
 *   2. The LIVE DOM (via jsdom) — that the delegated click listener really
 *      toggles a real panel's .p-open class, never Offers's, that clicking
 *      the (i) help button does NOT also toggle the panel underneath it,
 *      and that flashSection()/raySpot() (the existing "something happened"
 *      hooks) really add .p-open to the panel they pulse/ring.
 *
 * Run: node test/tablet-sidebar-collapse.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const GAME = path.join(__dirname, '..', '..', 'deadhead.html');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

function loadableScript(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '')
    .replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi, '');
}

(async () => {
  console.log('Tablet sidebar collapse (<=1499px)');

  const src = fs.readFileSync(GAME, 'utf8');

  // ---- 1. CSS source checks ------------------------------------------------
  const t4Match = src.match(/@media \(max-width:1499px\)\{([\s\S]*?)\n\}\n\n\/\* ---- T4b/);
  check('the <=1499px tablet block is found', !!t4Match);
  const t4 = t4Match ? t4Match[1] : '';

  check('both .wing elements are placed in grid-column 2 (one merged right column)',
    /\.wing:first-of-type\{[^}]*grid-column:2/.test(t4) &&
    /\.wing:last-of-type\{[^}]*grid-column:2/.test(t4));
  check('the two wings sit in DIFFERENT rows (stacked, not overlapping)',
    /\.wing:first-of-type\{[^}]*grid-row:1/.test(t4) &&
    /\.wing:last-of-type\{[^}]*grid-row:2/.test(t4));
  check('.console spans both rows in column 1 (full height beside the merged column)',
    /\.console\{grid-column:1;grid-row:1\/3\}/.test(t4));
  check('every panel except Offers collapses its body by default',
    /\.wing \.panel:not\(#panel-offers\) \.p-body\{display:none\}/.test(t4));
  check('#panel-offers is never targeted by the collapse rule',
    !/\.wing \.panel:not\(#panel-offers\)\.p-open[^{]*#panel-offers/.test(t4));
  check('#panel-offers grows to fill the remaining column height',
    /#panel-offers\{flex:1 1 auto/.test(t4));

  // ---- 2. Live DOM checks ---------------------------------------------------
  const dom = new JSDOM(loadableScript(src), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function (q) {
        return { matches: false, media: q, addEventListener() {},
          removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      window.fetch = () => Promise.reject(new Error('offline in test'));
    },
  });
  await new Promise((r) => setTimeout(r, 60));

  const w = dom.window;
  const A = w.DH_ACT1;
  const $ = (id) => w.document.getElementById(id);

  check('DH_ACT1 exposes flashSection', !!A && typeof A.flashSection === 'function');
  if (!A) { process.exit(1) }

  // ---- clicking a header toggles .p-open --------------------------------
  const platHead = $('panel-platforms').querySelector('.p-head');
  check('setup: Platforms starts without .p-open',
    !$('panel-platforms').classList.contains('p-open'));
  platHead.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('clicking the header opens the panel (.p-open added)',
    $('panel-platforms').classList.contains('p-open'));
  platHead.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('clicking it again closes it (.p-open removed)',
    !$('panel-platforms').classList.contains('p-open'));

  // ---- clicking the (i) help button must NOT also toggle the panel ------
  const ihelp = $('panel-platforms').querySelector('.ihelp');
  ihelp.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('clicking the (i) help icon does not open the panel underneath it',
    !$('panel-platforms').classList.contains('p-open'));

  // ---- Offers can never be collapsed-toggled -----------------------------
  const offersHead = $('panel-offers').querySelector('.p-head');
  offersHead.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('clicking Offers\'s own header does nothing (.p-open never applies to it)',
    !$('panel-offers').classList.contains('p-open'));

  // ---- flashSection() auto-expands the panel it pulses -------------------
  $('panel-incidents').classList.remove('p-open');
  A.flashSection('panel-incidents');
  check('flashSection() adds .p-open to the panel it flashes',
    $('panel-incidents').classList.contains('p-open'));

  $('panel-offers').classList.remove('p-open');
  A.flashSection('panel-offers');
  check('flashSection() never adds .p-open to Offers (nothing to expand)',
    !$('panel-offers').classList.contains('p-open'));

  // ---- raySpot(), reached via a scripted beat, does the same thing -------
  // Beat 3's spot is 'panel-platforms' (see RAY[] in deadhead.html) — drive it
  // through the real tutorial path rather than calling raySpot() directly,
  // since it is not itself exported.
  const A2 = w.DH_ACT1, S = w.DH;
  A2.newFleet('austin');
  S.ray.guided = false; S.ray.day1Done = true; S.ray.skipped = false;
  S.cash = 1e6; A2.PROG().companyCash = 1e6;
  Object.keys(A2.CITIES).forEach((id) => { A2.PROG().unlocked[id] = true });
  A2.acquire('cab', 'buy');
  $('garage').hidden = true; $('report').hidden = true;
  $('panel-platforms').classList.remove('p-open');
  A2.rayShow(3); // beat 3: spot is 'panel-platforms'
  check('a scripted beat spotlighting Platforms also opens it (raySpot() hook)',
    $('panel-platforms').classList.contains('p-open'));

  console.log(failures === 0
    ? 'All tablet sidebar collapse checks passed.'
    : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
