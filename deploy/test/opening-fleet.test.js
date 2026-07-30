/* Two-car opening — the garage stops slamming shut on the first purchase.
 *
 * WHAT THIS PROTECTS
 *
 * Before 0.45.0 the opening fleet was exactly one car, and nothing said so:
 * acquire() hid #garage the moment the first car landed. The rule was real but
 * invisible, and it read as "the modal closed" rather than "one is the limit".
 *
 * Now:
 *   1. effCap() narrows the city's own fleetCap to OPENING_CAP (2) until the
 *      first shift is clocked on (S.shiftNo === 0) — and only ever DOWNWARDS,
 *      so SF's soloSeat fleetCap of 1 still wins.
 *   2. The garage stays open after car #1 and closes at the ceiling, so the
 *      second slot is discoverable instead of being taken away.
 *   3. The slots strip (#gar-slots) says the second one is optional, and the
 *      refusal message on a third names the opening rule rather than the city.
 *   4. The header button says "Leave Garage" — "Close" read as dismissing a
 *      dialog, not as walking out with a car.
 *
 * Run: node test/opening-fleet.test.js  (or: npm test)
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
  console.log('Two-car opening');

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

  check('DH_ACT1 exposes the opening-cap surface',
    !!A && A.OPENING_CAP === 2 && typeof A.effCap === 'function' &&
      typeof A.openingCapped === 'function');
  if (!A) { process.exit(1) }

  // ---- the ceiling itself -------------------------------------------------
  A.newFleet('austin'); S.ray.skipped = true;
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  check('before the first shift, Austin\'s cap of 17 is narrowed to 2',
    A.cityCap() === 17 && A.effCap() === 2 && A.openingCapped() === true);
  S.shiftNo = 1;
  check('once a shift is clocked on, the city\'s own cap is back in charge',
    A.effCap() === 17 && A.openingCapped() === false);
  S.shiftNo = 0;

  // ---- car #1 no longer closes the garage --------------------------------
  A.newFleet('austin'); S.ray.skipped = true;
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  A.openGarage();
  check('setup: the garage is open on a fleet with no car', $('garage').hidden === false);
  A.acquire('cab', 'buy');
  check('one car bought', S.cars.length === 1);
  check('the garage STAYS OPEN after the first car — the second slot is on show',
    $('garage').hidden === false);
  check('a second car is affordable before the first shift',
    A.canAfford(A.catalog('saloon'), 'buy') === true);

  // ---- the slots strip explains it ---------------------------------------
  A.renderGarage();
  check('#gar-slots is visible during the opening', $('gar-slots').hidden === false);
  check('the empty slot is marked as optional',
    /optional/i.test($('gar-slots').textContent));
  check('the filled slot names the car the player actually bought',
    $('gar-slots').textContent.includes(S.cars[0].id));
  check('the header button says "Leave Garage", not "Close"',
    $('gar-close').textContent === 'Leave Garage');
  check('leaving is offered as the primary action once a car is in service',
    $('gar-close').classList.contains('go'));
  // 0.46.2: the pulse. A full-screen modal with nothing left that MUST be done
  // and one small corner button styled to be ignored is a dead end for a
  // first-time player.
  check('the way out pulses on the first visit, once a car is in service',
    $('gar-close').classList.contains('call'));
  check('the title switches from choosing to adding',
    $('garage-title').textContent === 'Add a vehicle');

  // ---- car #2 is the ceiling ---------------------------------------------
  A.acquire('saloon', 'buy');
  check('two cars bought', S.cars.length === 2);
  check('the garage closes at the two-car ceiling — nothing left to decide',
    $('garage').hidden === true);
  check('a third is refused even with a million in the bank',
    A.canAfford(A.catalog('cab'), 'buy') === false);
  const why = A.affordWhy(A.catalog('cab'), 'buy');
  check('the refusal blames the opening rule, not the city',
    /start with/i.test(why) && !/capped at/.test(why), `got: "${why}"`);
  A.openGarage(); A.renderGarage();
  check('the strip says both slots are filled',
    /both starting slots/i.test($('gar-slots').textContent));

  // ---- past the opening, the city's cap takes over ------------------------
  S.shiftNo = 1;
  check('a third car is allowed once the first shift is on the books',
    A.canAfford(A.catalog('cab'), 'buy') === true);
  A.renderGarage();
  check('#gar-slots hides itself after the opening — 17 chips would say nothing',
    $('gar-slots').hidden === true);

  // ---- SF still gets exactly one -----------------------------------------
  A.newFleet('sf', { keepCompanyCash: true });
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  check('the opening rule never RAISES a city cap: SF stays at 1',
    A.cityCap() === 1 && A.effCap() === 1 && A.openingCapped() === false);
  A.openGarage();
  A.acquire('cab', 'buy');
  check('SF\'s one car still closes the garage', $('garage').hidden === true);
  check('SF still refuses a second', A.canAfford(A.catalog('cab'), 'buy') === false);
  check('...and still says so in SF\'s own words',
    /capped at 1 car\b/.test(A.affordWhy(A.catalog('cab'), 'buy')));
  check('SF shows no slots strip — there is only ever one slot',
    (A.renderGarage(), $('gar-slots').hidden === true));

  // ---- the pulse is first-visit only (0.46.2) -----------------------------
  A.newFleet('austin'); S.ray.skipped = true;
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  A.openGarage(); A.renderGarage();
  check('an EMPTY fleet gets no pulse — the modal is a forced decision then',
    $('gar-close').className === '');
  A.acquire('cab', 'buy');
  A.renderGarage();
  check('setup: one car, first visit, pulsing',
    $('gar-close').classList.contains('call'));
  S.shiftNo = 1;                 // the player has now worked a shift
  A.renderGarage();
  check('after the first shift the pulse is gone for good',
    !$('gar-close').classList.contains('call'));
  check('...but leaving is still the primary action',
    $('gar-close').classList.contains('go'));

  // ---- affordable options are visibly available (0.45.1) ------------------
  // The opening's real cash: buying and financing are out of reach, renting is
  // the only door. It used to be the ONLY row with no colour at all — a plain
  // outline under two dimmed gradient buttons.
  A.newFleet('austin'); S.ray.skipped = true;
  S.cash = 800; A.PROG().companyCash = 800;
  A.openGarage(); A.renderGarage();
  const rentBtn = w.document.querySelector('#gar-cards button[data-get="cab"][data-how="rent"]');
  const buyBtn = w.document.querySelector('#gar-cards button[data-get="cab"][data-how="buy"]');
  check('setup: at $800 renting a Cab is possible and buying is not',
    !!rentBtn && rentBtn.disabled === false && !!buyBtn && buyBtn.disabled === true);
  check('the affordable Rent button is marked .avail',
    rentBtn.classList.contains('avail'));
  check('an unaffordable button is NOT marked .avail',
    !buyBtn.classList.contains('avail'));
  check('Rent never borrows .pri — available, not recommended',
    !rentBtn.classList.contains('pri'));
  check('the sole way into the car says so',
    /nothing down/i.test(rentBtn.parentNode.textContent));
  check('an unaffordable row still explains itself instead',
    /Needs /.test(buyBtn.parentNode.textContent));
  // With money, every row is affordable — and then a caption on each would be
  // three lines per card, nine cards deep.
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  A.renderGarage();
  const buyRich = w.document.querySelector('#gar-cards button[data-get="cab"][data-how="buy"]');
  check('every affordable row is .avail when everything is affordable',
    buyRich.classList.contains('avail') &&
    w.document.querySelector('#gar-cards button[data-get="cab"][data-how="rent"]')
      .classList.contains('avail'));
  check('...and no row claims to be the only way in',
    !/Available now/.test(w.document.getElementById('gar-cards').textContent));

  // ---- the tutorial does not talk over the open garage --------------------
  A.newFleet('austin');
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  A.openGarage();
  A.acquire('cab', 'buy');
  check('setup: garage open with one car', $('garage').hidden === false);
  check('Ray\'s beat 3 waits for the garage to close',
    A.rayReady(3) === false);
  $('garage').hidden = true;
  check('...and is ready the moment it does', A.rayReady(3) === true);

  console.log(failures ? `\n${failures} failure(s)` : '\nall good');
  process.exit(failures ? 1 : 0);
})();
