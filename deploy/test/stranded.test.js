/* Running a car flat — the 0% state, and the paid way out.
 *
 * WHAT THIS PROTECTS
 *
 * Pavel asked what happens at 0% (2026-07-30) and the answer was "nothing":
 * drive() floors soc with clamp(...,0,100) and NO code path tested for empty,
 * so a dead car kept driving at full speed forever — and because energy is
 * only ever billed while plugged in, it did so for free. CFG.reserveSoc only
 * gates ride ASSIGNMENT, so an incident re-route or CFG.heatPenalty could
 * still walk a car to zero mid-fare.
 *
 * Five things about the fix are easy to break and expensive when broken:
 *
 *   1. A FLAT CAR MUST NOT MOVE, BY ANY ROUTE. stepCar returns early, and
 *      sendToCharge() must refuse — that last one matters because the
 *      Rapid-charge panel's per-site buttons call sendToCharge directly, and
 *      the function's fall-through would set state='toCharge' and silently
 *      un-strand the car for free.
 *
 *   2. IT MUST NOT SELF-CLEAR. That is the whole difference from 'blocked',
 *      which resolves itself after c.needs seconds. Stranded waits for money.
 *
 *   3. THE RIDER AND THE QUEUE MUST BE RELEASED. An abandoned fare has to
 *      leave S.rides (cancellation + safety hit), and anything queued behind
 *      a dead car has to go back to the open pool or those riders are
 *      unservable forever.
 *
 *   4. THE FEE IS CHARGED, ONCE, ON THE CALL. And it lands in S.d.cost, so
 *      the shift report tells the truth about why the night went wrong.
 *
 *   5. recovTo MUST SURVIVE A SAVE BY NAME, NOT BY REFERENCE. It holds a live
 *      CHARGERS object; JSON round-trips that into a disjoint copy that no
 *      longer === anything in CHARGERS — the identical trap chIdx/chName was
 *      fixed for.
 *
 * Also covered: CFG.socAlertAmber must stay ABOVE CFG.chargeAt, or the Charge
 * pill's amber band is the empty range (28 <= x < 25) it was until 0.51.0.
 *
 * Run: node test/stranded.test.js  (or: npm test)
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
  console.log('running flat');

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
      window.confirm = () => true;      // the flatbed prompt
    },
  });
  await new Promise((r) => setTimeout(r, 60));

  const w = dom.window;
  const A = w.DH_ACT1;
  const SAVE = w.DH_SAVE;
  const S = w.DH;
  const $ = (id) => w.document.getElementById(id);

  check('DH_ACT1 exposes the strand surface',
    !!A && typeof A.strandCar === 'function' && typeof A.recoverCar === 'function');
  if (!A) { process.exit(1) }

  // ---- the config the whole mechanic is tuned by ---------------------------
  check('CFG carries a recovery fee, a tow duration and a safety hit',
    A.CFG.recoveryFee > 0 && A.CFG.recoverySec > 0 && A.CFG.strandSafety > 0);
  /* THE BUG THIS REPLACES. amber band is soc >= chargeAt && soc < amber, so an
     amber BELOW chargeAt is an empty range and the pill can only ever be green
     or red. Asserted as a relationship so retuning either number cannot
     silently reintroduce it. */
  check('socAlertAmber sits ABOVE chargeAt, so the amber band is reachable',
    A.CFG.socAlertAmber > A.CFG.chargeAt,
    `amber ${A.CFG.socAlertAmber} vs chargeAt ${A.CFG.chargeAt}`);

  check('stranded and recovery have a label, a colour class and are crit-red',
    A.LABEL.stranded && A.LABEL.recovery &&
    A.CLS.stranded === 'crit' && A.CLS.recovery === 'crit');

  function fresh() {
    A.newFleet('austin');
    S.ray.skipped = true;               // no tutorial cards in the way
    S.cash = 100000; A.PROG().companyCash = 100000;
    A.acquire('cab', 'buy');
    $('garage').hidden = true;
    S.onClock = true;
    S.offers.length = 0; S.rides.length = 0;
    return S.cars[0];
  }
  const zs = A.zones();
  function ride(id) {
    return { id: id, from: zs[0].n, to: zs[1].n, p: [zs[0].lat, zs[0].lng],
      d: [zs[1].lat, zs[1].lng], km: 5, fare: 40, wait: 0, car: null,
      plat: 'zipp', left: 45 };
  }

  // ---- 0% while driving strands the car -----------------------------------
  let c = fresh();
  const r1 = ride('a');
  S.rides.push(r1);
  c.ride = r1; r1.car = c.id; c.state = 'onTrip'; c.reached = true;
  c.route = [[zs[1].lat, zs[1].lng]];
  c.soc = 0.05;                          // one step from empty
  const safetyBefore = S.safety;
  A.stepCar(c, 60, 1);
  check('a car that runs out mid-leg is stranded, not still driving',
    c.state === 'stranded', c.state);
  check('...its route is cleared so nothing can resume it', c.route.length === 0);
  check('...the abandoned ride leaves S.rides',
    S.rides.indexOf(r1) === -1 && c.ride === null);
  check('...it counts as a cancellation', S.d.cancels >= 1);
  check('...and safety takes the hit', S.safety < safetyBefore,
    `${safetyBefore} -> ${S.safety}`);
  check('soc never goes negative', c.soc >= 0, String(c.soc));

  // ---- 2. it does NOT self-clear ------------------------------------------
  const stateAfter = c.state;
  for (let i = 0; i < 200; i++) A.stepCar(c, 60, 1);
  check('two hundred steps later it is still flat — this never self-clears',
    c.state === stateAfter && c.state === 'stranded');
  check('...and it did not creep across the map',
    c.route.length === 0);

  // ---- 1. nothing can make it drive --------------------------------------
  const posLat = c.lat, posLng = c.lng;
  const sent = A.sendToCharge(c.id, null);
  check('sendToCharge REFUSES a flat car — the Rapid panel calls it directly',
    sent === null && c.state === 'stranded',
    `returned ${sent}, state ${c.state}`);
  check('...and by name too, not just "nearest"',
    A.sendToCharge(c.id, A.nearestCharger(c).n) === null && c.state === 'stranded');
  check('...it has not moved', c.lat === posLat && c.lng === posLng);
  /* assign() gates on state==='idle' / dispatched|onTrip, so a stranded car is
     excluded already — assert it rather than trusting it stays that way. */
  const r2 = ride('b');
  S.rides.push(r2);
  A.assign(r2);
  check('a flat car is never assigned a new fare',
    r2.car !== c.id && c.ride === null, String(r2.car));

  // ---- 4. the fee ---------------------------------------------------------
  const cashBefore = S.cash, costBefore = S.d.cost;
  const fee = A.recoverCar(c);
  check('calling the flatbed returns the fee it charged', fee === A.CFG.recoveryFee);
  check('...the cash comes off immediately, on the call not on arrival',
    Math.abs((cashBefore - S.cash) - A.CFG.recoveryFee) < 1e-9,
    `${cashBefore} -> ${S.cash}`);
  check('...and it lands in the shift cost, so the report explains the night',
    Math.abs((S.d.cost - costBefore) - A.CFG.recoveryFee) < 1e-9);
  check('the car is on a flatbed now', c.state === 'recovery');
  check('recovering an already-recovering car is refused, so the fee is once',
    A.recoverCar(c) === null);

  // ---- the tow completes, plugged in at a charger -------------------------
  /* Real seconds, like the blocked window: a 20x player must not get a tow
     20x faster. Feed realDt only. */
  let guard = 0;
  while (c.state === 'recovery' && guard++ < 10000) A.stepCar(c, 1, 1);
  check('the tow finishes', c.state !== 'recovery', c.state);
  check('...and drops the car AT a charger, plugged in',
    c.state === 'charging' && !!c.ch, `${c.state} ch=${!!c.ch}`);
  check('...at the charger it was towed to',
    c.lat === c.ch.lat && c.lng === c.ch.lng);
  check('...charging to 100, since nobody pays for a tow to reach 85%',
    c.chTo === 100 && c.chManual === true);
  check('the tow took the real-seconds duration, not the sim-seconds one',
    guard >= A.CFG.recoverySec, `${guard} steps for ${A.CFG.recoverySec}s`);

  // ---- 3. a queue behind a dead car is released --------------------------
  c = fresh();
  const q1 = ride('q1'), q2 = ride('q2');
  S.rides.push(q1, q2);
  c.queue = [q1, q2];
  q1.car = c.id; q1.queued = true; q2.car = c.id; q2.queued = true;
  c.soc = 0;
  A.strandCar(c);
  check('queued riders are handed back to the open pool, not stuck behind it',
    c.queue.length === 0 && q1.car === null && q2.car === null &&
    !q1.queued && !q2.queued);
  check('...and they stay in S.rides so another car can take them',
    S.rides.indexOf(q1) >= 0 && S.rides.indexOf(q2) >= 0);

  // A pending charge order cannot survive either — it can't drive there.
  c = fresh();
  c.chQueue = A.nearestCharger(c).n;
  c.soc = 0;
  A.strandCar(c);
  check('a pending charge order is voided — it cannot drive there now',
    !c.chQueue && !c.ch);

  // ---- nextTask() puts it above everything -------------------------------
  c = fresh();
  A.strandCar(c);
  const t = A.nextTask();
  check('nextTask() makes the flat car the top priority', t.key === 'flat', t.key);
  check('...and quotes the real fee from CFG, not a hardcoded number',
    t.now.includes(A.money2(A.CFG.recoveryFee)), t.now);

  // ---- the console button becomes the flatbed ----------------------------
  S.sel = c.id;
  A.render();
  check('the charge button turns into Call flatbed and is enabled',
    $('sel-charge').querySelector('.lb').textContent === 'Call flatbed' &&
    $('sel-charge').disabled === false);
  check('...and names the price, because the price is the lesson',
    $('sel-charge-note').textContent.includes(A.money2(A.CFG.recoveryFee)),
    $('sel-charge-note').textContent);
  $('sel-charge').click();               // window.confirm stubbed true
  check('clicking it calls the tow', c.state === 'recovery');
  A.render();
  check('while towing the button is disabled and says so',
    $('sel-charge').disabled === true &&
    $('sel-charge').querySelector('.lb').textContent === 'On a flatbed');

  // ---- 5. recovTo survives a save BY NAME --------------------------------
  c = fresh();
  A.strandCar(c);
  A.recoverCar(c);
  const towTo = c.recovTo;
  check('setup: the tow has a destination object', !!towTo && !!towTo.n);
  const snap = JSON.parse(JSON.stringify(SAVE.snapshot()));
  const savedCar = snap.s.cars[0];
  check('the raw save holds the destination by NAME',
    savedCar.recovToName === towTo.n, String(savedCar.recovToName));
  check('...and NOT as a nested object copy that would break identity',
    savedCar.recovTo === undefined);
  SAVE.restore(snap);
  const rc = S.cars[0];
  check('the restored car is still on a flatbed',
    rc.state === 'recovery', rc.state);
  /* Identity against chargerByName()'s result IS the real assertion: that
     function resolves out of the live CHARGERS list, so === proves the
     restored field points at the fleet's own object rather than a JSON twin. */
  check('...and its destination is the SAME charger object, not a copy',
    rc.recovTo === A.chargerByName(towTo.n) && !!rc.recovTo);
  /* The point of by-name: a reference-identity restore would leave a detached
     twin, and the tow would arrive at a charger the fleet cannot see. */
  let g2 = 0;
  while (rc.state === 'recovery' && g2++ < 10000) A.stepCar(rc, 1, 1);
  check('a restored tow still completes and plugs in',
    rc.state === 'charging' && !!rc.ch &&
    rc.ch === A.chargerByName(rc.ch.n), rc.state);

  // A stranded car reloads AS stranded — it waits on a decision, not a frame.
  c = fresh();
  A.strandCar(c);
  const snap2 = JSON.parse(JSON.stringify(SAVE.snapshot()));
  SAVE.restore(snap2);
  check('a stranded car reloads still stranded, not quietly repaired',
    S.cars[0].state === 'stranded', S.cars[0].state);

  console.log(failures === 0
    ? 'All running-flat checks passed.'
    : `${failures} running-flat check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
