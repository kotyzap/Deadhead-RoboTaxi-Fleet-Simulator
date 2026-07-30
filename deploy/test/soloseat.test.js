/* SF soloSeat test — companyplan.md's "ONE CAR, ON PURPOSE" follow-up.
 *
 * WHAT THIS PROTECTS
 *
 * San Francisco reframes "Supervised" literally: the player IS the safety
 * driver, not an operator watching a dashboard. Three mechanics fall out of
 * that reading, none of them shared with any other city:
 *
 *   1. fleetCap drops to 1 — you cannot be in two seats at once.
 *   2. Simulated time cannot outrun real time: setSpeed() clamps to 1x for
 *      any soloSeat city, no matter which of its several callers (the two
 *      click handlers, clockOn's CFG.defaultSpeed, closeDodge restoring the
 *      pre-mini-game speed...) asked for something faster, and the controls
 *      themselves go disabled so the lock is visible, not just silently
 *      enforced.
 *   3. Tesla pays CFG.soloStipend for every CALENDAR day you actually
 *      clocked on — credited once, at billMidnight(), and silent on a day
 *      you never worked. S.workedToday is the flag that makes "actually
 *      worked" a calendar-day fact rather than the shift-scoped workedSec.
 *
 * Run: node test/soloseat.test.js  (or: npm test)
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
  console.log('SF soloSeat');

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

  check('DH_ACT1 exposes the soloSeat surface',
    !!A && typeof A.setSpeed === 'function' && typeof A.affordWhy === 'function' &&
      typeof A.billMidnight === 'function' && typeof A.paintSoloSeat === 'function' &&
      typeof A.CFG.soloStipend === 'number');
  if (!A) { process.exit(1) }

  // ---- config: one car, on purpose ---------------------------------------
  check('CITIES.sf caps the fleet at 1', A.CITIES.sf.fleetCap === 1);
  check('CITIES.sf is flagged soloSeat', A.CITIES.sf.soloSeat === true);
  check('Austin shares permit:Supervised but is NOT soloSeat — permit stays reportage',
    A.CITIES.austin.permit === 'Supervised' && !A.CITIES.austin.soloSeat);

  // ---- fleetCap really is 1, and the message is grammatical --------------
  S.cash = 100000; A.PROG().companyCash = 100000;
  A.newFleet('sf', { keepCompanyCash: true });
  A.acquire('cab', 'buy');
  check('setup: one car bought in SF', S.cars.length === 1);
  check('a second car is refused — SF is capped at 1',
    !A.canAfford(A.spec('cab'), 'buy'));
  const why = A.affordWhy(A.spec('cab'), 'buy');
  check('the cap message says "1 car", not "1 cars"',
    /capped at 1 car\b/.test(why) && !/1 cars/.test(why), `got: "${why}"`);

  // ---- 1x lock: enforced in setSpeed() itself, not just the click handler ---
  A.setSpeed(20);
  check('setSpeed(20) is clamped to 1x in a soloSeat city', S.speed === 1);
  A.setSpeed(4);
  check('setSpeed(4) is also clamped to 1x', S.speed === 1);
  A.setSpeed(0);
  check('pausing (0) is still allowed — the lock is a ceiling, not a floor',
    S.speed === 0);
  A.setSpeed(1);
  check('1x itself is obviously allowed', S.speed === 1);

  // ---- the controls visibly reflect the lock, not just enforce it silently --
  A.render();
  const seg4 = w.document.querySelector('.seg button[data-speed="4"]');
  const seg20 = w.document.querySelector('.seg button[data-speed="20"]');
  const seg1 = w.document.querySelector('.seg button[data-speed="1"]');
  const spd = w.document.getElementById('spd');
  check('the 4x button is disabled in SF', !!seg4 && seg4.disabled === true);
  check('the 20x button is disabled in SF', !!seg20 && seg20.disabled === true);
  check('the 1x button stays enabled in SF', !!seg1 && seg1.disabled === false);
  check('the speed slider max is capped at the 1x index', !!spd && spd.max === '1');

  // ---- leaving SF lifts the lock -----------------------------------------
  A.newFleet('austin', { keepCompanyCash: true });
  A.render();
  A.setSpeed(20);
  check('setSpeed(20) is NOT clamped in Austin', S.speed === 20);
  const seg4b = w.document.querySelector('.seg button[data-speed="4"]');
  check('the 4x button is enabled again outside SF', seg4b.disabled === false);

  // ---- the click handler also respects the disabled state (defense in depth) --
  A.newFleet('sf', { keepCompanyCash: true });
  A.render();
  A.setSpeed(1);
  w.document.querySelector('.seg button[data-speed="20"]').click();
  check('clicking a disabled speed button does nothing', S.speed === 1);

  // ---- the Tesla stipend: paid only on a day you actually worked ---------
  A.newFleet('sf', { keepCompanyCash: true });
  const cashBefore1 = S.cash;
  S.workedToday = false;
  A.billMidnight();
  check('no stipend on a day never worked', S.cash === cashBefore1);
  check('S.d.stipend is falsy on an unworked day', !S.d.stipend);

  const cashBefore2 = S.cash;
  S.workedToday = true;
  A.billMidnight();
  check('the stipend is credited on a day actually worked',
    Math.abs(S.cash - (cashBefore2 + A.CFG.soloStipend)) < 0.01,
    `expected +${A.CFG.soloStipend}, cash went ${cashBefore2} -> ${S.cash}`);
  check('S.d.stipend records the amount', S.d.stipend === A.CFG.soloStipend);
  check('workedToday resets after billing', S.workedToday === false);

  // ---- not paid at all outside a soloSeat city ---------------------------
  A.newFleet('austin', { keepCompanyCash: true }); // fresh fleet: no cars, no fixed cost
  const cashBefore3 = S.cash;
  S.workedToday = true;
  A.billMidnight();
  check('Austin never pays the SF stipend, even with workedToday true',
    S.cash === cashBefore3, `expected unchanged ${cashBefore3}, got ${S.cash}`);
  check('Austin: no S.d.stipend field is set from a day of work', !S.d.stipend);

  // ---- persistence: workedToday survives a snapshot/restore round trip ---
  A.newFleet('sf', { keepCompanyCash: true });
  S.workedToday = true;
  const snap = w.DH_SAVE.snapshot();
  S.workedToday = false; // prove restore() is what puts it back, not luck
  w.DH_SAVE.restore(snap);
  check('workedToday round-trips true through snapshot/restore', S.workedToday === true);

  const snap2 = w.DH_SAVE.snapshot();
  delete snap2.s.workedToday; // simulate a save written before this field existed
  w.DH_SAVE.restore(snap2);
  check('a save missing workedToday defaults to false, not undefined',
    S.workedToday === false);

  // ---- the one-time Paolo advisory fires once, ever, not per run ---------
  A.PROG().soloSeatTold = false;
  A.newFleet('sf', { keepCompanyCash: true });
  check('first entry into a soloSeat city logs a Paolo line about it',
    S.log.some((e) => e.who === 'Paolo' && /Tesla pays|physically/i.test(e.what)));
  A.newFleet('austin', { keepCompanyCash: true });
  A.newFleet('sf', { keepCompanyCash: true });
  check('re-entering SF does not repeat the speech (PROG, not S)',
    !S.log.some((e) => e.who === 'Paolo' && /Tesla pays|physically/i.test(e.what)));

  // ---- progTrack() keeps companyCash in lockstep with S.cash --------------
  // The gap this closes: every S.cash change (fares, energy, the stipend
  // itself) only ever touched S.cash, never PROG.companyCash, so switching
  // cities could park a city's LATEST earnings nowhere and hand the next
  // city a stale balance. progTrack() runs every render() frame while a
  // city is active, so it is the natural place to keep them equal.
  A.newFleet('sf', { keepCompanyCash: true });
  S.cash = 54321;
  A.progTrack();
  check('progTrack() mirrors S.cash into PROG.companyCash',
    A.PROG().companyCash === 54321);

  console.log(failures === 0
    ? 'All soloSeat checks passed.'
    : `${failures} soloSeat check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
