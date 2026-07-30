/* Red blinking "click here" chevrons — Pavel's asks, 2026-07-30:
 *
 *   1. A city unlocked while the shift-end report was open; the tutorial's
 *      red ring landed on the city tabs strip but the Ray card explaining it
 *      got force-closed by the report, leaving a blinking box with no
 *      message. rayForceClose() now clears the spot along with the card.
 *   2. "visually lead user ... via e.g. red >>> Dallas <<< blinking" —
 *      rayCityUnlocked() now points at the SPECIFIC newly-unlocked tab
 *      button, not the shared #citytabs strip every tab sits in.
 *   3. "Leave the garage ... I need to know that I need to click" — the
 *      first-visit `.call` pulse on #gar-close now also carries the chevrons.
 *   4. "first connection to rider app, accepting the first ride" — the
 *      platforms panel's first disconnected Connect button, and the offers
 *      panel's topmost Accept button, carry the chevrons during the day-1
 *      guided walkthrough until each is done once.
 *
 * Run: node test/ray-arrows.test.js  (or npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const GAME = path.join(__dirname, '..', '..', 'deadhead.html');
const src = fs.readFileSync(GAME, 'utf8');

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
  console.log('ray-arrow chevrons + spotlight-strand fix');

  // ---- CSS: .ray-arrow exists and blinks the same red as .spotlight -------
  check('.ray-arrow uses the same critical-red token as .spotlight',
    /\.ray-arrow::before,\.ray-arrow::after\{[^}]*color:var\(--s-crit\)/.test(src));
  check('.ray-arrow blinks on the same cadence as .spotlight (steps(1,end), .9s)',
    /spot-blink-text\s*\.9s\s*steps\(1,end\)\s*infinite/.test(src));
  check('reduced-motion still shows the chevrons, just static',
    /prefers-reduced-motion:reduce\)\{\s*\.ray-arrow::before,\.ray-arrow::after\{animation:none;opacity:1\}/.test(src));

  // ---- source: rayForceClose clears the spot, not just the card -----------
  const rfc = src.match(/function rayForceClose\(\)\{([\s\S]*?)\n\}/);
  check('rayForceClose() was found', !!rfc);
  if (rfc) {
    check('rayForceClose() now calls raySpotClear() — the actual fix',
      /raySpotClear\(\)/.test(rfc[1]));
  }

  // ---- source: raySpot is a thin wrapper over raySpotEl --------------------
  check('raySpot(id) delegates to raySpotEl', /function raySpot\(id\)\{\s*raySpotEl\(/.test(src));
  check('raySpotEl exists as the element-based core',
    /function raySpotEl\(el\)\{/.test(src));

  // ---- source: raySpotEl adds ray-arrow only for actual buttons ------------
  const spotFn = src.match(/function raySpotEl\(el\)\{([\s\S]*?)\nfunction raySpotClear/);
  check('raySpotEl() found for body inspection', !!spotFn);
  if (spotFn) {
    check('ray-arrow is gated on tagName===\'BUTTON\'',
      /if\(el\.tagName==='BUTTON'\) el\.classList\.add\('ray-arrow'\)/.test(spotFn[1]));
  }
  check('raySpotClear() removes both spotlight and ray-arrow together',
    /classList\.remove\('spotlight','ray-arrow'\)/.test(src));

  // ---- source: rayCityUnlocked targets the specific tab --------------------
  const rcu = src.match(/function rayCityUnlocked\(id\)\{([\s\S]*?)\n\}/);
  check('rayCityUnlocked() was found', !!rcu);
  if (rcu) {
    check('it queries the specific tab button by data-city, not the whole strip',
      /querySelector\('\.citytab\[data-city="'\+id\+'"\]'\)/.test(rcu[1]));
    check('it calls raySpotEl with that button (with a strip fallback)',
      /raySpotEl\(tabBtn\|\|\$\('citytabs'\)\)/.test(rcu[1]));
  }

  // ---- source: gar-close carries ray-arrow on the first-visit pulse -------
  check('#gar-close\'s first-visit class list includes ray-arrow',
    /'go call ray-arrow'/.test(src));

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
      /* jsdom does no real layout, so the real offsetParent getter always
         returns null — which would make raySpotEl()'s visibility guard
         ("!el.offsetParent") bail for every element, always, regardless of
         what this test does. Stub it to the one thing that guard actually
         cares about: is this element (or an ancestor) display:none. Good
         enough to exercise the spotlight/ray-arrow logic under test; no
         other test in this suite has needed real geometry from raySpot(). */
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
  await new Promise((r) => setTimeout(r, 90));

  const w = dom.window;
  const A = w.DH_ACT1;
  const S = w.DH;
  const $ = (id) => w.document.getElementById(id);

  check('DH_ACT1 exposes what this test needs',
    !!A && typeof A.rayCityUnlocked === 'function' && typeof A.raySpotEl === 'function' &&
      typeof A.rayForceClose === 'function' && typeof A.acceptOffer === 'function');
  if (!A) { process.exit(1) }

  // ---- functional: rayCityUnlocked rings the right tab, with arrows --------
  A.newFleet('austin', { keepCompanyCash: true });
  S.ray.skipped = false; S.ray.cur = null;
  A.PROG().unlocked = A.PROG().unlocked || {};
  A.PROG().unlocked.dallas = true;
  A.renderCityTabs();
  const dallasTab = w.document.querySelector('.citytab[data-city="dallas"]');
  check('setup: the Dallas tab exists once unlocked', !!dallasTab);
  A.rayCityUnlocked('dallas');
  check('the Dallas tab itself gets the ring, not the shared strip',
    A.spotEl() === dallasTab, `spotEl was ${A.spotEl() && A.spotEl().className}`);
  check('the Dallas tab also gets the chevrons (it is a real <button>)',
    dallasTab.classList.contains('ray-arrow'));
  check('the strip container itself is NOT the spotlighted element',
    A.spotEl() !== $('citytabs'));

  // ---- functional: rayForceClose (report opening) clears that ring too ----
  A.rayForceClose();
  check('force-closing the card also clears the ring off the Dallas tab',
    !dallasTab.classList.contains('spotlight') && !dallasTab.classList.contains('ray-arrow'));
  check('body.dimmed is cleared too — no half-torn-down dim state left behind',
    !w.document.body.classList.contains('dimmed'));

  // ---- functional: Leave Garage chevrons on first visit only --------------
  S.cash = 100000; A.PROG().companyCash = 100000;
  A.acquire('cab', 'buy');
  check('first-ever garage visit: Leave Garage carries ray-arrow',
    S.shiftNo === 0 && $('gar-close').classList.contains('ray-arrow'),
    `shiftNo=${S.shiftNo} className="${$('gar-close').className}"`);

  // ---- functional: platforms panel arrows the first Connect button --------
  S.ray.guided = true; S.ray.day1Done = false; S.ray.skipped = false;
  A.PLATFORMS.forEach((p) => { p.on = false });
  A.render();
  const connectBtns = Array.from(w.document.querySelectorAll('[data-plat]'));
  const arrowedConnect = connectBtns.filter((b) => b.classList.contains('ray-arrow'));
  check('exactly one Connect button carries ray-arrow while nothing is connected',
    arrowedConnect.length === 1, `found ${arrowedConnect.length}`);

  A.PLATFORMS[0].on = true;
  A.render();
  const arrowedConnectAfter = Array.from(w.document.querySelectorAll('[data-plat].ray-arrow'));
  check('once something is connected, no Connect button is arrowed any more',
    arrowedConnectAfter.length === 0);

  // ---- functional: offers panel arrows the topmost Accept button ----------
  const zs = A.zones();
  function offer(id, plat, fare, from) {
    return { id, from, to: zs[1].n, p: [zs[0].lat, zs[0].lng],
      d: [zs[1].lat, zs[1].lng], km: 5, fare, wait: 0, car: null, plat, left: 45 };
  }
  S.offers.length = 0;
  S.offers.push(offer('older', 'zipp', 50, 'Rainey Street'));
  S.offers.push(offer('newest', 'hitchr', 60, 'UT campus'));
  A.render();
  const accBtns = Array.from(w.document.querySelectorAll('[data-acc]'));
  const arrowedAcc = accBtns.filter((b) => b.classList.contains('ray-arrow'));
  check('exactly one Accept button is arrowed before any ride has ever been accepted',
    arrowedAcc.length === 1, `found ${arrowedAcc.length}`);
  check('it is the TOPMOST (newest) offer\'s Accept button',
    arrowedAcc[0] && arrowedAcc[0].getAttribute('data-acc') === 'newest',
    `arrowed offer id was ${arrowedAcc[0] && arrowedAcc[0].getAttribute('data-acc')}`);

  check('S.ray.firstAcceptDone starts false in a fresh run', S.ray.firstAcceptDone === false);
  A.acceptOffer('newest');
  check('accepting a ride latches firstAcceptDone', S.ray.firstAcceptDone === true);
  S.offers.push(offer('after', 'zipp', 40, 'Rainey St'));
  A.render();
  const arrowedAccAfter = Array.from(w.document.querySelectorAll('[data-acc].ray-arrow'));
  check('after the first accept, no Accept button is arrowed any more',
    arrowedAccAfter.length === 0);

  console.log(failures === 0
    ? 'All ray-arrow checks passed.'
    : `${failures} ray-arrow check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
