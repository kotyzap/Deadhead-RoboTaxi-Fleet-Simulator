/* Beats 12/14 (the shift-report Paolo cards) firing WHILE the report is open.
 *
 * WHAT THIS PROTECTS
 *
 * Pavel saw a Paolo card pop up right after closing the shift report and
 * asked "should this not be tied to the opened Shift report?" — yes: beats
 * 12 and 14 both spotlight #rp-body, a div that only exists inside the
 * #report modal (see RAY[11]/RAY[13]'s spot:'rp-body'). But rayCheck() and
 * guideCheck() both refuse to run while #report is open (a 2026-07-30 fix
 * for a DIFFERENT bug — a card racing onto the screen alongside the report
 * the instant it opens), and $('rp-go')'s click handler hides the report
 * and THEN calls rayCheck() — so the only moment either beat could ever
 * fire was one click too late, after the report (and its target div) was
 * already hidden. raySpotEl() already had defensive comments for exactly
 * this ("If that beat fires while the modal is closed... spotlighting it
 * just dims the whole screen around nothing") — the card still appeared,
 * just with no ring and no visible tie to the report it was commenting on.
 *
 * The fix: shiftReport() now fires beat 12/14 itself, the moment the report
 * opens — mirroring how openGarage() already fires beat 1 directly at
 * #gar-cards. Two things must hold:
 *
 *   1. When ready, the beat shows WHILE #report is visible, and its target
 *      actually gets the 'spotlight' class (proof raySpotEl() took the
 *      "el.offsetParent is non-null" branch, not the "modal closed" one).
 *
 *   2. During the guided Day-1 script, this must NOT jump the fixed
 *      DAY1_ORDER sequence — beat 12 only fires early if the script has
 *      actually reached it (dayIdx points at it already). If some earlier
 *      shift satisfies rayReady(12) before the script gets there, shiftReport
 *      must stay quiet and let the normal guideCheck() catch it later.
 *
 * Run: node test/report-beat-timing.test.js  (or: npm test)
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
  console.log('shift-report beat 12/14 spotlight timing');

  const dom = new JSDOM(loadableScript(fs.readFileSync(GAME, 'utf8')), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function (q) {
        return { matches: false, media: q, addEventListener() {},
          removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      window.fetch = () => Promise.reject(new Error('offline in test'));
      /* jsdom does no real layout, so the real offsetParent getter always
         returns null — which would make raySpotEl()'s visibility guard
         ("!el.offsetParent") bail for every element, always, regardless of
         what this test does. Stub it to the one thing that guard actually
         cares about: is this element (or an ancestor) display:none or
         hidden. Same stub as test/ray-arrows.test.js. */
      try {
        Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
          configurable: true,
          get() {
            let n = this;
            while (n) {
              if (n.style && n.style.display === 'none') return null;
              if (n.hidden) return null;
              n = n.parentElement;
            }
            return window.document.body;
          },
        });
      } catch (e) { /* older jsdom — the offsetParent checks below will just fail loudly */ }
    },
  });
  await new Promise((r) => setTimeout(r, 60));

  const w = dom.window;
  const A = w.DH_ACT1;
  const S = w.DH;
  const $ = (id) => w.document.getElementById(id);

  check('DH_ACT1 exposes what this test needs',
    !!A && typeof A.shiftReport === 'function' &&
    typeof A.rayReady === 'function' && typeof A.raySeen === 'function' &&
    Array.isArray(A.DAY1_ORDER));
  if (!A) { process.exit(1) }

  check('setup: beats 12 and 14 both target #rp-body — the div inside #report',
    A.RAY.filter((b) => b.n === 12)[0].spot === 'rp-body' &&
    A.RAY.filter((b) => b.n === 14)[0].spot === 'rp-body');

  function fresh() {
    A.newFleet('austin');
    S.cash = 100000; A.PROG().companyCash = 100000;
    $('garage').hidden = true;
    S.offers.length = 0; S.rides.length = 0;
    return S;
  }

  // ==== 1. opportunistic (non-guided / day1 already done): fires WHILE open ==
  fresh();
  S.ray.skipped = false;
  S.ray.guided = false;
  S.ray.day1Done = true;
  S.ray.seen = [];
  S.ray.cur = null;
  S.onClock = false;
  S.shiftNo = 1;
  S.d.done = 3;
  check('setup: beat 12 is ready and unseen', A.rayReady(12) === true && !A.raySeen(12));

  A.shiftReport();
  check('the report is visible', $('report').hidden === false);
  check('beat 12 fired WHILE the report is open, not after',
    S.ray.cur === 12, `S.ray.cur=${S.ray.cur}`);
  check('...and it is marked as the current beat correctly (not "advice")',
    typeof S.ray.cur === 'number');
  check('...#rp-body actually got the spotlight ring — proof the target was ' +
    'visible when raySpotEl ran, not hidden inside a closed modal',
    $('rp-body').classList.contains('spotlight'));

  // Dismiss it and confirm it will not fire again.
  A.rayDismiss();
  check('dismissing marks beat 12 seen', A.raySeen(12) === true);
  const curAfterDismiss = S.ray.cur;
  fresh(); // fresh() would reset seen/cur; re-seed the exact same state minus beat 12
  S.ray.skipped = false; S.ray.guided = false; S.ray.day1Done = true;
  S.ray.seen = [12]; S.ray.cur = null;
  S.onClock = false; S.shiftNo = 1; S.d.done = 3;
  A.shiftReport();
  check('a beat already seen does not fire again on the next report',
    S.ray.cur !== 12, `S.ray.cur=${S.ray.cur}`);

  // ==== 2. guided Day-1: must not jump the script ===========================
  fresh(); // guided:true, day1Done:false by default for a fresh austin save
  check('setup: a fresh austin run starts guided, day1 not done',
    S.ray.guided === true && S.ray.day1Done === false);
  S.ray.seen = [];
  S.ray.cur = null;
  S.ray.dayIdx = 3;              // script is only up to DAY1_ORDER[3], not beat 12's slot
  S.onClock = false;
  S.shiftNo = 1;
  S.d.done = 5;
  check('setup: beat 12 predicate is true this early too',
    A.rayReady(12) === true);
  const idx12 = A.DAY1_ORDER.indexOf(12);
  check('setup: beat 12 sits later in DAY1_ORDER than index 3',
    idx12 > 3, `idx12=${idx12}`);

  A.shiftReport();
  check('beat 12 stayed quiet — the guided script has not reached it yet',
    S.ray.cur !== 12, `S.ray.cur=${S.ray.cur}`);

  // Now advance the script to beat 12's own slot and try again.
  $('report').hidden = true;
  S.ray.dayIdx = idx12;
  A.shiftReport();
  check('once the script actually reaches beat 12, it fires immediately ' +
    'here — same report, no extra click needed',
    S.ray.cur === 12, `S.ray.cur=${S.ray.cur}`);
  check('...and #rp-body is spotlit in this guided case too',
    $('rp-body').classList.contains('spotlight'));

  console.log(failures === 0
    ? 'All report-beat-timing checks passed.'
    : `${failures} report-beat-timing check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
