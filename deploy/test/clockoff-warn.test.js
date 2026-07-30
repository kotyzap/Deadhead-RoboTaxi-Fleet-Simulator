/* Paolo warns before Clock off while still signed into rider apps.
 *
 * WHAT THIS PROTECTS
 *
 * clockOff() wipes S.offers, every car's queue, and S.rides outright — any
 * accepted-but-unfinished ride, and the fare with it, is just gone.
 * Disconnecting a platform only stops NEW offers from arriving; it does
 * nothing to rides already on the board. So the way to clock off without
 * losing money is: sign off the apps first, let whatever's already rolling
 * finish, THEN clock off with nothing left to lose. Pavel asked for Paolo to
 * say exactly that (2026-07-30) rather than a bare confirm().
 *
 * Four things about it are easy to break and invisible when broken:
 *
 *   1. THE CLICK HANDLER MUST INTERCEPT, NOT clockOff() ITSELF. The other
 *      call site — bankruptcy's clockOff(true) — is not a voluntary click
 *      and must never show this card.
 *   2. THE TRIGGER IS livePlatforms().length, NOT S.rides.length. A player
 *      connected with an empty board still has something to lose the instant
 *      an offer lands; a player already disconnected has nothing left to
 *      protect no matter how big S.rides is.
 *   3. "Clock off anyway" MUST NOT REACH raySkip(). raySkip() sets
 *      S.ray.skipped, permanently silencing Paolo — a real action being
 *      taken here must not carry that side effect.
 *   4. IT MUST NOT INTERRUPT A SCRIPTED BEAT OR AN ALREADY-SKIPPED PLAYER.
 *      Clock off proceeds straight through in both cases.
 *
 * Run: node test/clockoff-warn.test.js  (or: npm test)
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
  console.log('Clock-off Paolo warning');

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
    },
  });
  await new Promise((r) => setTimeout(r, 60));

  const w = dom.window;
  const A = w.DH_ACT1;
  const S = w.DH;
  const $ = (id) => w.document.getElementById(id);

  check('DH_ACT1 exposes rayClockOffWarn',
    !!A && typeof A.rayClockOffWarn === 'function');
  if (!A) { process.exit(1) }

  function fresh() {
    A.newFleet('austin');
    S.ray.guided = false; S.ray.day1Done = true; S.ray.skipped = false;
    // Mark every scripted beat seen so rayCheck() (which rayDismiss() always
    // calls on its way out) has nothing of its own left to surface — this
    // test is about the clock-off card specifically, not the tutorial script.
    S.ray.seen = A.RAY.map((b) => b.n);
    S.cash = 1e6; A.PROG().companyCash = 1e6;
    // Every city already unlocked so ending a shift here can't also fire
    // rayCityUnlocked() — unrelated to this feature, but progGates() runs on
    // every clockOff() and would otherwise steal the card we're testing for.
    Object.keys(A.CITIES).forEach((id) => { A.PROG().unlocked[id] = true });
    A.acquire('cab', 'buy');
    $('garage').hidden = true;
    // clockOff() below can run startFastForward() clear to the next shift,
    // which opens #report (shiftReport()) on its way — the real UI would
    // force the player to close it before another clock click is even
    // reachable, but this synthetic harness does not simulate that close,
    // so reset it here or a report left open by one case would silence
    // rayClockOffWarn() (see its own $('report').hidden guard) in every
    // case after it.
    $('report').hidden = true;
    $('ray').hidden = true; S.ray.cur = null; $('ray-text').innerHTML = '';
    A.PLATFORMS.forEach((p) => { p.on = false });
    S.onClock = true; S.shiftNo = 1; S.offers.length = 0; S.rides.length = 0;
  }
  const zs = A.zones();
  function offer(id, plat, fare) {
    return { id: id, from: zs[0].n, to: zs[1].n, p: [zs[0].lat, zs[0].lng],
      d: [zs[1].lat, zs[1].lng], km: 5, fare: fare, wait: 0, car: null,
      plat: plat, left: 45 };
  }

  // ---- not connected: Clock off proceeds immediately, no card -------------
  // Note: clockOff() runs startFastForward() synchronously to next 06:00,
  // which can legitimately surface an UNRELATED advice card (e.g. "connect a
  // platform" for the next day) — that is rayAdvise()'s own territory, not
  // this feature's. What this feature owns is specifically S.ray.cur==='clockoff'.
  fresh();
  $('clock').click();
  check('unconnected, Clock off just happens', S.onClock === false);
  check('...and the clock-off card specifically was never shown',
    S.ray.cur !== 'clockoff');

  // ---- connected, board empty: still warns (something could land any second)
  fresh();
  A.platform('zipp').on = true;
  $('clock').click();
  check('connected with an empty board still warns',
    $('ray').hidden === false && S.ray.cur === 'clockoff');
  check('Clock off did NOT happen yet', S.onClock === true);

  // ---- connected with rides on the board: names the platform + real $ -----
  fresh();
  A.platform('zipp').on = true;
  S.offers.push(offer('a', 'zipp', 100));
  A.acceptOffer('a');
  S.offers.push(offer('b', 'zipp', 60));
  A.acceptOffer('b');
  const atRisk = S.rides.reduce((s, r) => s + A.offerNet(r), 0);
  $('clock').click();
  const txt = $('ray-text').innerHTML;
  check('the card shows and Clock off is held', $('ray').hidden === false && S.onClock === true);
  check('it names the connected platform', txt.includes(A.platform('zipp').n));
  check('it quotes the real at-risk total via offerNet/money, not a hardcoded number',
    txt.includes(A.money(atRisk)), `expected ${A.money(atRisk)} in: ${txt}`);
  check('it tells the player to sign off the apps first',
    /sign off|disconnect/i.test(txt));

  // ---- "Got it" just dismisses, does not clock off -------------------------
  $('ray-go').click();
  check('"Got it" dismisses the card', $('ray').hidden === true);
  check('...without clocking off', S.onClock === true);
  check('...and without silencing Paolo', S.ray.skipped === false);

  // ---- "Clock off anyway" actually clocks off, and does not raySkip() -----
  A.platform('zipp').on = true;
  $('clock').click();
  check('setup: card is back up', $('ray').hidden === false && S.ray.cur === 'clockoff');
  $('ray-skip').click();
  check('"Clock off anyway" really clocks off', S.onClock === false);
  check('...and does NOT set S.ray.skipped (not a tutorial dismissal)',
    S.ray.skipped === false);
  check('...and the board really is wiped, same as any other clock-off',
    S.rides.length === 0 && S.offers.length === 0);

  // ---- an already-skipped player is not interrupted ------------------------
  fresh();
  S.ray.skipped = true;
  A.platform('zipp').on = true;
  $('clock').click();
  check('S.ray.skipped bypasses the card entirely', S.onClock === false && $('ray').hidden === true);

  // ---- an active scripted beat is not stomped on ---------------------------
  fresh();
  A.platform('zipp').on = true;
  S.ray.cur = 2; // a scripted beat number, not a string tag
  $('clock').click();
  check('a live scripted beat is left alone; Clock off proceeds straight through',
    S.onClock === false);
  check('the scripted beat number was not overwritten by this feature',
    S.ray.cur === 2 || S.ray.cur === null /* rayCheck() may have advanced/cleared it */);

  // ---- bankruptcy's quiet clockOff(true) must never show this card --------
  fresh();
  A.platform('zipp').on = true;
  S.offers.push(offer('c', 'zipp', 40));
  A.acceptOffer('c');
  A.clockOff(true);
  check('quiet clockOff (bankruptcy path) never shows the card',
    $('ray').hidden === true && S.onClock === false);

  console.log(failures === 0
    ? 'All clock-off warning checks passed.'
    : `${failures} clock-off warning check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
