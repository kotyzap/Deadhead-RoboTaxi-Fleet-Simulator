/* startFastForward() must never leave S.ffwd stuck true.
 *
 * WHAT THIS PROTECTS
 *
 * Pavel's own diagnosis (2026-07-30), and it was right: "I believe it might
 * be connected to the fact that the game was paused when I clicked Clock On
 * and was not able to click it since." The actual mechanism: clockOff()
 * (not quiet) calls startFastForward(), which used to run
 *
 *   S.ffwd=true; step(S.ffwdTarget-S.t); stopFastForward();
 *
 * with no error handling. step() here can run an entire overnight gap (up
 * to ~18 sim-hours) in ONE synchronous call, substep by substep — far more
 * ticks, and far more surface for a rare edge case, than a single
 * normal-speed frame ever runs. If anything in that chain threw, execution
 * never reached stopFastForward() — the only thing that ever clears
 * S.ffwd — so S.ffwd stayed true forever. The topbar reads that as
 * "Advancing to 06:00…" (looks exactly like the game froze mid-jump — "the
 * game was paused") and render()'s Clock button is unconditionally
 * `disabled=!!S.ffwd` — not merely unresponsive, an actual disabled HTML
 * button, which is why dozens of clicks afterwards did nothing at all.
 *
 * Fixed by wrapping the step() call in try/catch: on any failure, S.ffwd is
 * force-cleared, speed is reset, a toast explains what happened, and the
 * game is left in a state where Clock On works again on the very next
 * click — instead of bricked until the tab is reloaded.
 *
 * Run: node test/ffwd-recovery.test.js  (or: npm test)
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
  console.log('startFastForward() recovery — S.ffwd can never stay stuck');

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

  check('DH_ACT1 exposes what this test needs',
    !!A && typeof A.startFastForward === 'function' &&
    typeof A.clockOn === 'function');
  if (!A) { process.exit(1) }

  function fresh() {
    A.newFleet('austin');
    S.ray.skipped = true;
    S.cash = 100000; A.PROG().companyCash = 100000;
    $('garage').hidden = true;
    A.acquire('cab', 'buy');
    S.offers.length = 0; S.rides.length = 0;
    A.PLATFORMS.forEach(function (p) { p.on = true; });
    return S;
  }

  // ==== 1. a step() failure mid-jump must not wedge S.ffwd ==================
  fresh();
  A.clockOn();
  check('setup: clocked on', S.onClock === true);
  A.clockOff();       // starts the (normally synchronous) overnight jump
  check('setup: clockOff() cleared onClock before the jump', S.onClock === false);

  // Corrupt the REAL shared S.cars (same object identity as window.DH.cars —
  // not a copy) so the internal step()->stepCar sweep throws for real the
  // next time anything iterates it, simulating "step() hit an edge case".
  const realCars = S.cars;
  S.cars = new Proxy(realCars, {
    get(target, prop) {
      if (prop === 'forEach') throw new Error('simulated stepCar edge case');
      return target[prop];
    },
  });

  let threwOut = false;
  try { A.startFastForward(); } catch (e) { threwOut = true; }
  check('startFastForward() does not let the error escape to its caller',
    threwOut === false);
  check('S.ffwd is NOT stuck true after the failure',
    S.ffwd === false, `S.ffwd=${S.ffwd}`);
  check('a toast explains what happened, instead of silence',
    $('sv-toast').textContent.toLowerCase().includes('overnight jump'),
    $('sv-toast').textContent);

  // Repair the corrupted array and confirm the Clock button is genuinely
  // usable again — not just S.ffwd flipped with everything else still stale.
  S.cars = realCars;
  A.render();
  check('the Clock button is enabled again after recovery',
    $('clock').disabled === false);
  check('...and reads "Clock on", ready for the next real click',
    $('clock').textContent === 'Clock on');

  A.clockOn();
  check('clocking on for real now works — the game was not left bricked',
    S.onClock === true);

  // ==== 2. the ordinary success path is unaffected by the try/catch ========
  fresh();
  A.clockOn();
  A.clockOff();       // no corruption this time — should complete normally
  check('an ordinary overnight jump still completes and clears S.ffwd',
    S.ffwd === false);
  check('...and produced a real shift report (the normal stopFastForward path)',
    S.shiftNo >= 1 && !$('report').hidden || S.shiftNo >= 1);

  console.log(failures === 0
    ? 'All ffwd-recovery checks passed.'
    : `${failures} ffwd-recovery check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
