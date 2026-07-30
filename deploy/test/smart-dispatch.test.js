/* Smart queue scoring + decline grace window — companyplan/queue mechanic.
 *
 * WHAT THIS PROTECTS
 *
 * Pavel wants "select the ride that mitigates deadhead" to start as a
 * smarter AUTOMATIC dispatch, not a manual picker (2026-07-30 discussion).
 * Two changes landed for that:
 *
 *   1. assign()'s busy-car scoring used to break ties on remainKm — distance
 *      from the car's LIVE position to the end of its CURRENT leg. That is
 *      not where the car will actually be once it works through everything
 *      already queued behind that leg, so a new ride could land on a car
 *      that looks close right now but is genuinely far from the pickup once
 *      it's actually free. queueEndPoint(c) — the last queued ride's dropoff,
 *      or the current route's end if the queue is empty — is what the score
 *      should measure distance from instead. Queue depth must still dominate
 *      (x1000) so a 2-deep car never beats an empty one just for being
 *      well-placed.
 *
 *   2. Declining an offer within CFG.declineGraceSec of it appearing must
 *      not cost the platform's acceptRate — p.offered is bumped the instant
 *      spawnRides() creates the offer, before the player has even read it,
 *      so the only way to undo that cost is to walk p.offered back down in
 *      declineOffer() when the decline is fast enough. A slower decline (or
 *      an unattended timeout, which is always slow) must still cost exactly
 *      as before.
 *
 * Run: node test/smart-dispatch.test.js  (or: npm test)
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
  console.log('smart dispatch + decline grace');

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

  check('DH_ACT1 exposes the new scoring/grace surface',
    !!A && typeof A.queueEndPoint === 'function' &&
    typeof A.assign === 'function' && typeof A.declineOffer === 'function' &&
    typeof A.spawnRides === 'function');
  if (!A) { process.exit(1) }

  check('CFG carries the grace window, well under the fastest decision floor',
    A.CFG.declineGraceSec > 0 &&
    A.CFG.declineGraceSec < Math.min.apply(null, Object.values(A.CFG.offerDecideBySpeed)),
    `grace ${A.CFG.declineGraceSec}`);

  function fresh() {
    A.newFleet('austin');
    S.ray.skipped = true;
    S.cash = 100000; A.PROG().companyCash = 100000;
    S.onClock = true;
    A.PLATFORMS.forEach(function (p) { p.on = true; p.offered = 0; p.accepted = 0; });
    S.offers.length = 0; S.rides.length = 0;
    $('garage').hidden = true;
    return S;
  }
  const zs = A.zones();
  function ride(id, from, to) {
    from = from || zs[0]; to = to || zs[1];
    return { id: id, from: from.n, to: to.n, p: [from.lat, from.lng],
      d: [to.lat, to.lng], km: 5, fare: 40, wait: 0, car: null,
      plat: 'zipp', left: 45 };
  }

  // ==== 1. smart queue scoring ==============================================
  fresh();
  A.acquire('cab', 'buy');
  A.acquire('cab', 'buy');
  const [c1, c2] = S.cars;

  // Both cars busy with one ride already (equal queue depth: 0). c1's active
  // leg ends far from zs[2]; c2's ends right next to it — c2 should win even
  // though c1 sits closer to zs[2] RIGHT NOW (the old remainKm/live-position
  // bug this replaces).
  const far = zs[0], near = zs.length > 2 ? zs[2] : zs[1];
  const r1 = ride('busy1', zs[0], far), r2 = ride('busy2', zs[0], near);
  S.rides.push(r1, r2);
  c1.state = 'onTrip'; c1.ride = r1; c1.route = [[far.lat, far.lng]];
  c1.lat = near.lat; c1.lng = near.lng;      // physically close to the target NOW
  c2.state = 'onTrip'; c2.ride = r2; c2.route = [[near.lat, near.lng]];
  c2.lat = far.lat; c2.lng = far.lng;        // physically far from the target NOW

  check('setup: queueEndPoint tracks each car\'s route end, not live position',
    A.queueEndPoint(c1)[0] === far.lat && A.queueEndPoint(c2)[0] === near.lat);

  const target = ride('target', near, zs[0]);
  // nudge the pickup to be exactly at "near" so distance-from-queue-end is ~0 for c2
  target.p = [near.lat, near.lng];
  S.rides.push(target);
  const ok = A.assign(target);
  check('a new ride is queued (no idle car to take it directly)', ok === true);
  check('it lands on the car that will actually END UP closer once free, not the one merely near it now',
    target.car === c2.id, `got ${target.car}, c1=${c1.id} c2=${c2.id}`);

  // Queue depth must still dominate: give c2 (the "good" one) a full queue
  // slot ahead of a fresh comparison against an emptier but worse-placed car.
  fresh();
  A.acquire('cab', 'buy');
  A.acquire('cab', 'buy');
  const [d1, d2] = S.cars;
  const rA = ride('a', zs[0], far), rB = ride('b', zs[0], near);
  S.rides.push(rA, rB);
  d1.state = 'onTrip'; d1.ride = rA; d1.route = [[far.lat, far.lng]];
  d2.state = 'onTrip'; d2.ride = rB; d2.route = [[near.lat, near.lng]];
  // d2 is well-placed but already has one queued; d1 is badly placed but empty.
  const filler = ride('filler', near, far);
  d2.queue = [filler]; filler.car = d2.id; filler.queued = true;
  S.rides.push(filler);
  const target2 = ride('target2', near, zs[0]);
  target2.p = [near.lat, near.lng];
  S.rides.push(target2);
  A.assign(target2);
  check('queue depth still outweighs proximity — an empty car beats a 1-deep one',
    target2.car === d1.id, `got ${target2.car}`);

  // ==== 2. decline grace window =============================================
  fresh();
  const p = A.platform('zipp');
  const offeredBefore = p.offered;
  // Build a real offer through spawnRides() so it carries leftInit correctly.
  let guard = 0;
  while (S.offers.length === 0 && guard++ < 500) A.spawnRides(5);
  check('setup: spawnRides produced an offer to test against', S.offers.length > 0);
  const o = S.offers[0];
  check('a fresh offer carries leftInit equal to its starting countdown',
    o.leftInit === o.left && o.leftInit > 0);

  const afterSpawnOffered = A.platform(o.plat).offered;
  check('spawning bumped that platform\'s offered count',
    afterSpawnOffered > offeredBefore || afterSpawnOffered >= 1);

  // Snap decline: well inside the grace window.
  o.left = o.leftInit - 1;   // 1 real second has "passed"
  const beforeSnap = A.platform(o.plat).offered;
  A.declineOffer(o.id, false);
  check('a snap decline (1s in) is walked back out of offered — free with the platform',
    A.platform(o.plat).offered === beforeSnap - 1,
    `${beforeSnap} -> ${A.platform(o.plat).offered}`);

  // Considered decline: past the grace window.
  fresh();
  guard = 0;
  while (S.offers.length === 0 && guard++ < 500) A.spawnRides(5);
  const o2 = S.offers[0];
  o2.left = o2.leftInit - (A.CFG.declineGraceSec + 5);
  const beforeSlow = A.platform(o2.plat).offered;
  A.declineOffer(o2.id, false);
  check('a considered decline (past the grace window) still costs offered, as before',
    A.platform(o2.plat).offered === beforeSlow,
    `${beforeSlow} -> ${A.platform(o2.plat).offered}`);

  // An unattended timeout (silent=true) must NOT get the grace exemption
  // logic at all — it goes through the S.d.unserved branch untouched.
  fresh();
  guard = 0;
  while (S.offers.length === 0 && guard++ < 500) A.spawnRides(5);
  const o3 = S.offers[0];
  const unservedBefore = S.d.unserved;
  const offeredBeforeTimeout = A.platform(o3.plat).offered;
  o3.left = -1;   // as if the real-time countdown ran out
  A.declineOffer(o3.id, true);
  check('a silent (timed-out) decline still counts as unserved, untouched by grace',
    S.d.unserved === unservedBefore + 1);
  check('...and does not touch offered at all (grace only applies to a player decline)',
    A.platform(o3.plat).offered === offeredBeforeTimeout);

  console.log(failures === 0
    ? 'All smart-dispatch checks passed.'
    : `${failures} smart-dispatch check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
