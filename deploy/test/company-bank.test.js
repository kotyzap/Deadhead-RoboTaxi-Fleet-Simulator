/* Company bank test — companyplan.md.
 *
 * WHAT THIS PROTECTS
 *
 * Deadhead moved from "each city starts fresh at CFG.startCash, nothing
 * carries" (citiesplan.md's original decision) to "one company, one shared
 * cash balance, across every city you've opened." Three things had to
 * change together for that to be safe, and each has a failure mode that
 * would not be obvious from playing casually:
 *
 *   1. newFleet() must still reset to CFG.startCash for a genuinely new
 *      company (no opts — the "New fleet" button, first boot ever), but
 *      must NOT reset cash when opening a city inside an existing company
 *      (switchCity()'s keepCompanyCash:true). Get this backwards either way
 *      and either the trilemma never resets for a real do-over, or opening
 *      a second city becomes a free reroll of a bad Austin run.
 *   2. A parked city's fleet keeps owing its daily fixed cost in real
 *      calendar time, reconciled in one lump the moment you return
 *      (reconcileParkedBilling). Miscounting the elapsed days, or billing
 *      for time before the feature existed, either shortchanges the
 *      mechanic or punishes a migrating player for a game they weren't
 *      playing yet.
 *   3. Unpaid rent past CFG.parkGraceDays repossesses a rented/financed car
 *      — never an owned one, since there's no lender to take it back.
 *
 * Run: node test/company-bank.test.js  (or: npm test)
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
  console.log('company bank');

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

  check('DH_ACT1 exposes the company-bank surface',
    !!A && typeof A.reconcileParkedBilling === 'function' &&
      typeof A.realDaysElapsed === 'function' &&
      typeof A.PROG === 'function' && typeof A.CFG.parkGraceDays === 'number');
  if (!A) { process.exit(1) }

  // ---- realDaysElapsed: real calendar days, LOCAL time, whole days only --
  // Built with the local Date constructor, not Date.UTC — realDaysElapsed is
  // deliberately local-time ("real-world midnight" is a local concept), so a
  // test built on UTC boundaries would be right only in a UTC-clocked CI box
  // and wrong everywhere else (this repo's own sandbox runs Europe/Prague).
  check('same real day is zero days elapsed',
    A.realDaysElapsed(new Date(2026, 6, 27, 9, 0).getTime(),
                       new Date(2026, 6, 27, 23, 0).getTime()) === 0);
  check('crossing one local midnight is one day',
    A.realDaysElapsed(new Date(2026, 6, 27, 23, 0).getTime(),
                       new Date(2026, 6, 28, 1, 0).getTime()) === 1);
  check('five real days apart is five, not a fencepost off-by-one',
    A.realDaysElapsed(new Date(2026, 6, 20, 12, 0).getTime(),
                       new Date(2026, 6, 25, 12, 0).getTime()) === 5);
  check('time moving backwards never bills a negative day',
    A.realDaysElapsed(new Date(2026, 6, 28, 0, 0).getTime(),
                       new Date(2026, 6, 20, 0, 0).getTime()) === 0);

  // ---- newFleet(): full reset vs. keepCompanyCash ------------------------
  A.newFleet('austin');
  check('a genuinely new company resets to CFG.startCash',
    S.cash === A.CFG.startCash && A.PROG().companyCash === A.CFG.startCash);

  S.cash = 12345; A.PROG().companyCash = 12345;
  A.newFleet('dallas', { keepCompanyCash: true });
  check('opening a city inside an existing company inherits its cash, not CFG.startCash',
    S.cash === 12345 && A.PROG().companyCash === 12345);

  A.newFleet('austin');
  check('newFleet() with no opts still resets even after keepCompanyCash was used',
    S.cash === A.CFG.startCash && A.PROG().companyCash === A.CFG.startCash);

  // ---- reconcileParkedBilling: the catch-up debit ------------------------
  A.newFleet('austin');
  A.acquire('cab', 'rent');
  check('setup: one rented car on the books', S.cars.length === 1);
  const perDay = A.fixedPerCar(S.cars[0]);
  const cashBefore = A.PROG().companyCash;
  const THREE_DAYS_MS = 3 * 86400000;
  A.PROG().results.austin.parkedAt = Date.now() - THREE_DAYS_MS - 3600000; // 3 days + a buffer hour
  A.reconcileParkedBilling();
  const expect = cashBefore - 3 * perDay;
  check('three real days parked bills exactly three days of fixed cost',
    Math.abs(A.PROG().companyCash - expect) < 0.01,
    `expected ${expect}, got ${A.PROG().companyCash}`);
  check('S.cash mirrors companyCash after reconciling', S.cash === A.PROG().companyCash);

  check('reconciling again immediately (same real day) charges nothing more', (() => {
    const before = A.PROG().companyCash;
    A.reconcileParkedBilling();
    return A.PROG().companyCash === before;
  })());

  // ---- first observation: no backdated bill for pre-feature time --------
  A.newFleet('dallas', { keepCompanyCash: true });
  A.acquire('cab', 'rent');
  delete A.PROG().results.dallas.parkedAt;
  const cashPre = A.PROG().companyCash;
  A.reconcileParkedBilling();
  check('a city whose parkedAt has never been observed bills nothing the first time',
    A.PROG().companyCash === cashPre);
  check('...but is stamped so the NEXT reconcile has a baseline',
    typeof A.PROG().results.dallas.parkedAt === 'number');

  // ---- repossession: rented/financed only, after the grace period -------
  A.newFleet('austin');
  A.acquire('cab', 'rent');
  const rentedId = S.cars[0].id;
  A.PROG().companyCash = -1; // already underwater before any billing
  const graceDays = A.CFG.parkGraceDays;
  A.PROG().results.austin.parkedAt = Date.now() - (graceDays + 2) * 86400000;
  A.reconcileParkedBilling();
  check('a rented car unpaid past the grace period is repossessed',
    !S.cars.some((c) => c.id === rentedId));

  A.newFleet('austin');
  S.cash = 100000; A.PROG().companyCash = 100000; // buying outright needs $30k
  A.acquire('cab', 'buy');
  check('setup: bought a car outright', S.cars.length === 1 && S.cars[0].hold === 'own');
  const ownedId = S.cars[0].id;
  A.PROG().companyCash = -1;
  A.PROG().results.austin.parkedAt = Date.now() - (graceDays + 2) * 86400000;
  A.reconcileParkedBilling();
  check('an OWNED car is never repossessed, even deep underwater',
    S.cars.some((c) => c.id === ownedId));

  // ---- Paolo tells the player about the shared-cash / real-billing risk --
  // Uses Miami, not Dallas — Dallas already picked up a results record
  // earlier in this file (the "first observation" block above visits it),
  // and this check needs a city that is GENUINELY unvisited so far.
  // Clear every higher-priority task first, so nextTask() actually reaches
  // the low-priority slot the new advice lives in rather than reporting
  // "buy a car" or "connect a platform" over it.
  A.newFleet('austin');
  A.acquire('cab', 'rent');
  A.PLATFORMS.forEach((p) => { p.on = true });
  A.zones().forEach((z) => { z.on = true });
  S.onClock = true;
  check('setup: nothing else pending — the chain reaches the fallback',
    A.nextTask().key === 'watch');
  check('setup: miami has no results record yet', !A.PROG().results.miami);

  A.PROG().unlocked.miami = true;
  const advice = A.nextTask();
  check('an unlocked-but-never-run city surfaces as advice',
    advice.key === 'newcity:miami' &&
      /shared|bank account/i.test(advice.why) && /rent/i.test(advice.why));

  // Simulate having actually run Miami once, without disturbing the
  // carefully-cleared Austin state above — progTrack() is what really
  // writes this record in play; writing it directly here isolates the
  // retirement check from whether newFleet() itself works.
  A.PROG().results.miami = { bestCash: 0, day: 1, goalMet: false,
    shiftDone: false, parkedAt: Date.now() };
  check('once a city has actually been run, the advice retires for good',
    A.nextTask().key === 'watch');

  console.log(failures === 0
    ? 'All company-bank checks passed.'
    : `${failures} company-bank check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
