/* Clocked on with no service connected — Paolo's 10-real-second nudge.
 *
 * WHAT THIS PROTECTS
 *
 * nextTask() has always returned the 'plat' task for an unconnected fleet, but
 * rayAdvise() only speaks after ADVISE_AFTER *sim*-seconds of the world being
 * quiet. For a player clocked on with no feed, quiet is the permanent state
 * rather than a signal, and at 1x the advice is over a minute away — long
 * enough to read as a broken game.
 *
 * noFeedTick() is therefore its own trigger, and it is timed in REAL seconds
 * (NOFEED_AFTER = 10), the same reasoning the offer countdown and the
 * blocked-car window needed. The checks below pin:
 *
 *   1. It waits the full ten seconds, then fires once.
 *   2. Connecting a platform before then resets the clock — no card at all.
 *   3. Off the clock it never counts.
 *   4. Once per SHIFT, not once per save (S.ray.feedShift).
 *   5. It stays quiet during the guided tutorial, which teaches platforms in
 *      its own order.
 *   6. The copy states the real PLATFORMS numbers (commission and share) and
 *      covers ratings, which is the point of the beat.
 *
 * Run: node test/nofeed-nudge.test.js  (or: npm test)
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
  console.log('No-feed nudge');

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

  check('DH_ACT1 exposes the nudge',
    !!A && typeof A.noFeedTick === 'function' && A.NOFEED_AFTER === 10);
  if (!A) { process.exit(1) }

  // Ticking 1 real second at a time, the way the interval does.
  const tick = (n) => { for (let i = 0; i < n; i++) A.noFeedTick(1) };
  // A gap deliberately SHORTER than NOFEED_REPEAT, derived from it so the
  // "too early" check cannot go stale if the constant is retuned.
  const NOFEED_REPEAT_SHORT = A.NOFEED_REPEAT - 5;
  // Past the tutorial: the guided script owns day 1 and teaches platforms in
  // its own order, so it must NOT be what these checks are measuring.
  function fresh() {
    A.newFleet('austin');
    S.ray.guided = false; S.ray.day1Done = true;
    S.cash = 1e6; A.PROG().companyCash = 1e6;
    A.acquire('cab', 'buy');
    $('garage').hidden = true;
    $('ray').hidden = true; S.ray.cur = null;
    A.PLATFORMS.forEach((p) => { p.on = false });
    S.onClock = true; S.shiftNo = 1; S.ray.feedShift = -1; S.noFeedSec = 0;
  }

  // ---- 1. it waits the full ten real seconds -----------------------------
  fresh();
  tick(9);
  check('nothing at nine seconds', $('ray').hidden === true);
  check('...but the clock is running', S.noFeedSec >= 9);
  tick(1);
  check('Paolo speaks at ten', $('ray').hidden === false);
  check('the card is advice, not a scripted beat', S.ray.cur === 'advice');
  check('the shift is stamped so it cannot repeat',
    S.ray.feedShift === S.shiftNo);

  // ---- 6. the copy is right ----------------------------------------------
  const txt = $('ray-text').textContent;
  const hitchr = A.PLATFORMS.filter((p) => p.id === 'hitchr')[0];
  const zipp = A.PLATFORMS.filter((p) => p.id === 'zipp')[0];
  check('it says nothing is going to call you', /no service connected/i.test(txt));
  check('it names both services', txt.includes(hitchr.n) && txt.includes(zipp.n));
  check('the commissions come from PLATFORMS, not a hardcoded string',
    txt.includes(`${Math.round(hitchr.cut * 100)}%`) &&
    txt.includes(`${Math.round(zipp.cut * 100)}%`));
  check('the demand share is quoted from PLATFORMS too',
    txt.includes(`${Math.round(hitchr.share * 100)}%`));
  check('it covers rider ratings — the point of the beat',
    /rate|rating/i.test(txt));

  // ---- 4. once per shift, not once per save ------------------------------
  // Dismissed by hand rather than via rayDismiss(): dismissing runs rayCheck(),
  // which is entitled to show a DIFFERENT card (beat 3 is ready the moment a
  // car exists and the garage is shut), and that would look like a repeat here.
  $('ray').hidden = true; S.ray.cur = null; $('ray-text').innerHTML = '';
  tick(30);
  check('he does not repeat himself within the same shift',
    $('ray').hidden === true && $('ray-text').textContent === '');
  S.shiftNo = 2;            // a new shift, same mistake
  tick(10);
  check('a NEW shift with a dead board gets the warning again',
    $('ray').hidden === false);

  // ---- 0.47.0: he repeats, up to a cap, and the panel holds the state ----
  fresh();
  tick(10);
  check('setup: first telling', S.ray.feedSaid === 1);
  $('ray').hidden = true; S.ray.cur = null;
  tick(NOFEED_REPEAT_SHORT);
  check('nothing again before the repeat gap has passed',
    $('ray').hidden === true && S.ray.feedSaid === 1);
  tick(A.NOFEED_REPEAT - NOFEED_REPEAT_SHORT);
  check('he says it again once the repeat gap passes', S.ray.feedSaid === 2);
  check('the repeat is the short prod, not the whole speech again',
    /Still nothing connected/.test($('ray-text').textContent) &&
    !/feedback score/.test($('ray-text').textContent));
  check('the repeat quotes the wasted time as m:ss',
    /\d+:\d\d/.test($('ray-text').textContent));
  // The counter the player is watching must not rewind when he speaks.
  check('S.noFeedSec keeps counting across a telling',
    S.noFeedSec >= 10 + A.NOFEED_REPEAT);
  $('ray').hidden = true; S.ray.cur = null;
  tick(A.NOFEED_REPEAT);
  check('third telling lands', S.ray.feedSaid === 3);
  $('ray').hidden = true; S.ray.cur = null;
  tick(A.NOFEED_REPEAT * 3);
  check('then he stops — a modal you cannot get rid of is worse than the mistake',
    S.ray.feedSaid === A.NOFEED_MAX_SAID && $('ray').hidden === true);

  // The panel holds the alarm whether or not the card is up.
  A.render();
  check('the Platforms panel is in the alarm state while the board is dead',
    $('panel-platforms').classList.contains('alarm'));
  check('the tag reads "no service", in red',
    $('ops-tag').textContent === 'no service' &&
    $('ops-tag').classList.contains('bad'));
  check('the note counts the wasted time and names the daily cost',
    /Sitting \d+:\d\d/.test($('plat-note').textContent) &&
    $('plat-note').textContent.includes(A.money(A.floorCost())));
  A.platform('zipp').on = true;
  A.render();
  check('connecting clears the alarm', !$('panel-platforms').classList.contains('alarm'));
  check('...and the tag goes back to counting connections',
    $('ops-tag').textContent === '1 connected' &&
    !$('ops-tag').classList.contains('bad'));
  // Off the clock, being unconnected is not a mistake yet.
  A.platform('zipp').on = false; S.onClock = false;
  A.render();
  check('parked and unconnected is NOT an alarm',
    !$('panel-platforms').classList.contains('alarm') &&
    $('ops-tag').textContent === 'none');

  // ---- 2. connecting in time means no card at all ------------------------
  fresh();
  tick(9);
  A.platform('zipp').on = true;
  tick(1);
  check('connecting at second nine resets the clock', S.noFeedSec === 0);
  check('...and the card never appears', $('ray').hidden === true);
  tick(30);
  check('a connected fleet is never nagged about it', $('ray').hidden === true);

  // ---- 3. off the clock it never counts ----------------------------------
  fresh();
  S.onClock = false;
  tick(30);
  check('off the clock the counter stays at zero', S.noFeedSec === 0);
  check('...and Paolo says nothing — not clocked on is not a mistake yet',
    $('ray').hidden === true);

  // ---- 5. the guided tutorial owns day 1 --------------------------------
  fresh();
  S.ray.guided = true; S.ray.day1Done = false;
  tick(30);
  check('silent during the guided tutorial', $('ray').hidden === true);
  // feedShift is now "which shift the counters belong to" rather than "already
  // told" (0.47.0 made the nudge repeat), so nothing-was-said is feedSaid === 0.
  check('...and NOTHING was said, so it can still fire after day 1',
    S.ray.feedSaid === 0);

  // ---- a skipped tutorial silences advice entirely (existing contract) ---
  fresh();
  S.ray.skipped = true;
  tick(30);
  check('a player who skipped Paolo is not brought back by this',
    $('ray').hidden === true);

  console.log(failures ? `\n${failures} failure(s)` : '\nall good');
  process.exit(failures ? 1 : 0);
})();
