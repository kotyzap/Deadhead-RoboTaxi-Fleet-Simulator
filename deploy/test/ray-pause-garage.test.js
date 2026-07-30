/* Paolo pauses the sim while he's talking, and stays quiet in the garage
 * (and, as of a same-day follow-up, in the shift report too).
 *
 * WHAT THIS PROTECTS
 *
 * Pavel's ask (2026-07-30), two parts:
 *
 *   1. Every Paolo card already REQUIRES a button click to go away (rayFoot()
 *      always sets #ray-go/#ray-skip; nothing dismisses #ray on its own) — but
 *      nothing stopped the clock while one was up. Now every show-site calls
 *      rayPause() (captures S.speed, zeros it) and every dismissal path calls
 *      rayResume() (restores it) via rayDismiss()/raySkip().
 *   2. Only the garage's OWN line (beat 1, fired directly by openGarage())
 *      may show while the garage modal is open. Every other trigger —
 *      rayCheck()'s scripted beats, rayAdvise(), noFeedTick(), first-decline,
 *      city-unlock, the dodge brief — waits for $('garage').hidden.
 *
 * FOLLOW-UP (same day): Pavel saw a Paolo card pop up ON TOP OF the "Shift
 * complete" report — stopFastForward() calls shiftReport() (opens #report)
 * immediately followed by rayCheck(), in the same call stack, so the report
 * had no suppression the garage already had. Every guarded site above now
 * also waits for $('report').hidden, exactly the same shape as the garage
 * guard — see this file's "shift report suppression" section below.
 *
 * He also asked why the ambient-advice card's "Got it" button carried a
 * stray second word reading "Advice" — rayFoot()'s third argument is a
 * scripted beat's "N of 9" progress counter, and the two unprompted-advice
 * call sites (rayAdvise(), noFeedTick()) were passing the literal string
 * 'Advice' there by mistake instead of '' like every other non-scripted
 * card. See this file's "no stray count text" section.
 *
 * Three things about the pause are easy to break and invisible when broken:
 *
 *   1. CHAINED CARDS MUST NOT LOSE THE ORIGINAL SPEED. Dismissing beat 1 can
 *      synchronously show beat 2 (rayDismiss() -> rayCheck() -> rayShow()) —
 *      the speed remembered for beat 2's eventual resume must be the speed
 *      from BEFORE beat 1 ever paused anything, not 0.
 *   2. THE DODGE MINI-GAME MUST ADOPT THE PAUSE, NOT FIGHT IT. "Take control"
 *      opens straight out of the dodge-brief card (rayDodgeBrief() already
 *      paused it) — openDodge() must capture that ORIGINAL speed as its own
 *      DODGE.prevSpeed, not the 0 that rayPause() already wrote to S.speed.
 *   3. GARAGE SUPPRESSION MUST NOT SILENCE THE GARAGE'S OWN LINE. Beat 1 is
 *      the one Paolo message that is SUPPOSED to show while the garage is
 *      open — a blanket "nothing while garage is open" would break the one
 *      thing this feature is not supposed to touch.
 *
 * Run: node test/ray-pause-garage.test.js  (or: npm test)
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
  console.log('Paolo pause + garage suppression');

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

  check('DH_ACT1 exposes rayPause/rayResume/rayPaused', !!A &&
    typeof A.rayPause === 'function' && typeof A.rayResume === 'function' &&
    typeof A.rayPaused === 'function');
  if (!A) { process.exit(1) }

  // A fleet with a car, garage closed, tutorial out of the way — the base
  // state for the pause-mechanics checks, which are not about the tutorial
  // script or the garage.
  function freshRunning(speed) {
    A.newFleet('austin');
    S.ray.guided = false; S.ray.day1Done = true; S.ray.skipped = false;
    S.ray.seen = A.RAY.map((b) => b.n);
    S.cash = 1e6; A.PROG().companyCash = 1e6;
    Object.keys(A.CITIES).forEach((id) => { A.PROG().unlocked[id] = true });
    A.acquire('cab', 'buy');
    $('garage').hidden = true;
    $('ray').hidden = true; S.ray.cur = null; $('ray-text').innerHTML = '';
    A.setSpeed(speed);
  }

  // ---- a card pauses, remembering the speed it interrupted -----------------
  freshRunning(4);
  A.rayFirstDecline();
  check('showing a card zeros S.speed', S.speed === 0);
  check('...and S.running with it', S.running === false);
  check('...and remembers the speed it interrupted', A.rayPrevSpeed() === 4);
  check('rayPaused() reports true while a card is up', A.rayPaused() === true);

  // ---- "Got it" (rayDismiss) restores it ------------------------------------
  $('ray-go').click();
  check('dismissing restores the interrupted speed', S.speed === 4);
  check('rayPaused() reports false again', A.rayPaused() === false);

  // ---- "Skip" (raySkip) also restores it, even though it silences Paolo ----
  freshRunning(1);
  S.ray.seen = []; // so rayCheck() (called by nothing here) can't matter
  A.rayFirstDecline();
  check('setup: paused at 0, remembers 1', S.speed === 0 && A.rayPrevSpeed() === 1);
  $('ray-skip').click();
  check('Skip also restores the interrupted speed', S.speed === 1);
  check('...and does silence Paolo, same as always', S.ray.skipped === true);

  // ---- chained cards keep the ORIGINAL speed, not 0 -------------------------
  // Beat 1 is already seen (freshRunning marks every beat seen) except one:
  // unsee beats 1 and 2 so dismissing 1 chains straight into 2 via rayCheck().
  freshRunning(20);
  S.ray.seen = A.RAY.map((b) => b.n).filter((n) => n !== 1 && n !== 2);
  A.rayShow(1);
  check('setup: beat 1 up, paused at 0, remembers 20',
    S.ray.cur === 1 && S.speed === 0 && A.rayPrevSpeed() === 20);
  $('ray-go').click();
  check('beat 2 followed immediately (both unseen, both ready at this state)',
    S.ray.cur === 2);
  check('...still paused', S.speed === 0);
  check('...remembering the ORIGINAL speed, not the 0 beat 1 left behind',
    A.rayPrevSpeed() === 20);
  $('ray-go').click();
  check('dismissing the chained card restores the true original speed',
    S.speed === 20);

  // ---- openDodge() adopts the brief's pause, not S.speed (already 0) -------
  freshRunning(4);
  const c = S.cars[0];
  c.state = 'blocked'; c.blocked = 0; c.needs = 5;
  S.ray.dodgeSeen = false;
  A.rayDodgeBrief(c.id);
  check('setup: dodge brief paused at 0, remembers 4',
    S.ray.cur === 'dodge' && S.speed === 0 && A.rayPrevSpeed() === 4);
  $('ray-go').click(); // "Take control" -> openDodge() then rayDismiss()
  check('the mini-game opened', $('dodge-incar').hidden === false);
  check('DODGE.prevSpeed is the ORIGINAL 4, not the 0 rayPause() wrote',
    A.dodgeState() && A.dodgeState().prevSpeed === 4);
  check('rayResume() (called by the rayDismiss() right after) did not clobber it',
    S.speed === 0, 'sim must stay paused for the mini-game itself');
  A.closeDodge();
  check('closing the mini-game restores the true original speed', S.speed === 4);

  // ---- garage suppression: only beat 1 may show while it is open -----------
  // A truly fresh boot: no car yet, so openGarage() shows beat 1 itself.
  A.newFleet('austin');
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  S.ray.guided = false; S.ray.day1Done = true; S.ray.skipped = false;
  S.ray.seen = [];
  A.openGarage();
  check('the garage IS open', $('garage').hidden === false);
  check('beat 1 (the garage\'s own line) fired', S.ray.cur === 1);
  $('ray-go').click();
  check('beat 1 dismissed cleanly', S.ray.cur === null || typeof S.ray.cur !== 'number');

  // With the garage still open, nothing else may claim the card — not the
  // scripted beats, not the ambient advisor, not a first decline.
  // seen=[1]: beat 2's own predicate is raySeen(1), so leaving beat 1's
  // record intact (rather than wiping it) is what makes beat 2 "ready" —
  // otherwise the closed-garage assertion below would find nothing ready
  // for a reason unrelated to this feature.
  S.ray.cur = null; S.ray.seen = [1];
  A.rayCheck();
  check('rayCheck() shows nothing while the garage is open', $('ray').hidden === true);

  S.ray.advKey = null; S.ray.advIdle = 999; S.onClock = true;
  A.PLATFORMS.forEach((p) => { p.on = false });
  A.rayAdvise();
  check('rayAdvise() shows nothing while the garage is open', $('ray').hidden === true);

  // ---- ...and everything works again once the garage closes ----------------
  $('garage').hidden = true;
  A.rayCheck();
  check('rayCheck() fires normally once the garage is closed', $('ray').hidden === false);

  // ---- shift-report suppression: same shape as the garage guard ------------
  // Garage closed this time; #report is the thing covering the screen.
  S.ray.cur = null; $('ray').hidden = true; $('ray-text').innerHTML = '';
  $('garage').hidden = true; $('report').hidden = false;
  S.ray.seen = A.RAY.map((b) => b.n); // nothing scripted left to fire
  A.rayCheck();
  check('rayCheck() shows nothing while the shift report is open',
    $('ray').hidden === true);

  S.ray.advKey = null; S.ray.advIdle = 999; S.onClock = true;
  A.PLATFORMS.forEach((p) => { p.on = false });
  A.rayAdvise();
  check('rayAdvise() shows nothing while the shift report is open',
    $('ray').hidden === true);

  $('report').hidden = true;
  A.rayCheck();
  check('rayCheck() is unaffected once the report closes (garage already '
      + 'closed too)', true); // no assertion on content — just that it didn't throw

  // ---- no stray count text on the unprompted-advice card's button ----------
  // Re-derive the same conditions rayAdvise() itself checks, then read the
  // actual button text rather than trusting rayFoot()'s call site — a typo
  // in the literal argument is exactly the class of bug an internal-state
  // check would miss.
  $('garage').hidden = true; $('report').hidden = true;
  S.ray.cur = null; $('ray').hidden = true;
  S.ray.advKey = null; S.ray.advIdle = 999; S.onClock = true;
  A.PLATFORMS.forEach((p) => { p.on = false });
  A.rayAdvise();
  check('the advice card\'s "Got it" button carries no stray count text '
      + '(regression: it used to read "Got it Advice")',
    $('ray-count').textContent === '', `got "${$('ray-count').textContent}"`);

  // ---- shiftReport() force-closes a leftover card, not just blocks new ones -
  // The guard above stops rayCheck()/rayAdvise() from opening a card once
  // #report is already up — it does nothing about a card that was ALREADY
  // open the instant shiftReport() runs (fast-forward can pop one mid-jump
  // with nobody there to click it). This is the bug Pavel actually saw: two
  // cards side by side, not one blocked by the other.
  freshRunning(4);
  $('ray-text').innerHTML = 'stale advice card';
  A.rayFirstDecline(); // any show-site: just needs #ray open and S.ray.cur set
  check('setup: a card is open before the report ever runs',
    $('ray').hidden === false && S.ray.cur !== null);
  A.shiftReport();
  check('shiftReport() force-closed the leftover card', $('ray').hidden === true);
  check('...and cleared S.ray.cur', S.ray.cur === null);
  check('...without marking it a tutorial dismissal', S.ray.skipped === false);
  $('report').hidden = true; // tidy up for anything run after this in-process

  console.log(failures === 0
    ? 'All Paolo pause + garage-suppression checks passed.'
    : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
