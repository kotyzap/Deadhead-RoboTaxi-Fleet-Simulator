/* Fresh-run clock seed — Pavel's ask, 2026-07-30: it was too hard to reach a
 * city's evening rush, because every brand-new run started at the fixed
 * CFG.dayStart (06:00) no matter what time it actually was when the game was
 * opened, so a player who logs on in the evening still has to sit through
 * (or fast-forward past) most of a working day before demand climbs.
 *
 * Fix: newFleet() now seeds S.t from the city's real local time (via its IANA
 * tz, see cityLocalSeconds()) whenever that falls inside the demand window
 * CFG.dayStart..dayEnd (06:00-24:00) — so opening the game at 18:40 real time
 * starts the shift around 18:40 in-city, right as the evening rush is
 * building, instead of always 06:00. Real local hours before 06:00 still fall
 * back to dayStart (see freshRunClockSeed()'s own comment for why: that
 * window was never designed or tested as playable).
 *
 * This does NOT touch: a resumed save (restore() sets S.t=s.t as before), or
 * any day after the first one in a run (startFastForward()/nextDayStart()
 * still always land on dayStart — untouched, separate mechanic, and still
 * correct: see the comment on newFleet() itself).
 *
 * Weather already did the "grounded in the real city" thing correctly before
 * this change (fetchWeather() already runs on boot and on every city switch,
 * keyed to the real city's real coordinates) — nothing to fix there, so this
 * file only covers the clock.
 *
 * Run: node test/fresh-run-clock.test.js   (or npm test)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TARGETS = [
  path.join(__dirname, '..', '..', 'deadhead.html'),
  path.join(__dirname, '..', 'public', 'index.html'),
];

let failures = 0;

function strip(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '');
}

async function boot(file) {
  const dom = new JSDOM(strip(fs.readFileSync(file, 'utf8')), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || ((q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
      }));
      window.confirm = () => true;
    },
  });
  await new Promise((r) => setTimeout(r, 90));
  return dom;
}

/* A UTC instant that is a known, unambiguous local time in Austin
 * (America/Chicago). 2026-07-30 is deep summer, so Chicago is on CDT
 * (UTC-5) with no DST-transition ambiguity: 2026-07-30T23:40:00Z is
 * 2026-07-30 18:40:00 in Austin — squarely inside the evening rush and
 * inside dayStart..dayEnd. Also fixed a UTC instant that is 03:15 local in
 * Austin (2026-07-30T08:15:00Z), i.e. before dayStart, to check the
 * fallback clamp.
 */
const EVENING_UTC = new Date('2026-07-30T23:40:00Z');   // 18:40 Austin
const PREDAWN_UTC = new Date('2026-07-30T08:15:00Z');    // 03:15 Austin

async function run(file) {
  const label = path.relative(process.cwd(), file);
  const dom = await boot(file);
  const w = dom.window;
  const A = w.DH_ACT1;
  let ok = true;
  const check = (name, fn) => {
    let pass = false;
    try { pass = !!fn(); } catch (e) {
      pass = false;
      if (process.env.DEBUG) console.error('  threw:', e && e.stack || e);
    }
    if (!pass) { console.error(`FAIL ${label}: ${name}`); ok = false; failures++; }
  };

  // ---- cityLocalSeconds() itself ----------------------------------------
  check('cityLocalSeconds(austin, evening instant) reads 18:40 = 67200s',
    () => A.cityLocalSeconds('austin', EVENING_UTC) === 18 * 3600 + 40 * 60);
  check('cityLocalSeconds(austin, pre-dawn instant) reads 03:15 = 11700s',
    () => A.cityLocalSeconds('austin', PREDAWN_UTC) === 3 * 3600 + 15 * 60);
  check('cityLocalSeconds returns null for an unknown city',
    () => A.cityLocalSeconds('nowhere', EVENING_UTC) === null);
  // sf is on the opposite side of the clock (America/Los_Angeles, UTC-7 in
  // July) from austin (America/Chicago, UTC-5) — same UTC instant, two
  // different local hours, so this also proves the tz actually changes the
  // answer rather than the function silently ignoring cityId.
  check('the same UTC instant reads a different local hour in sf than in austin',
    () => A.cityLocalSeconds('sf', EVENING_UTC) !== A.cityLocalSeconds('austin', EVENING_UTC));

  // ---- freshRunClockSeed() clamping --------------------------------------
  // These can't inject `now` (freshRunClockSeed() always reads the real
  // clock, by design — it's what newFleet() calls), so bound it structurally
  // instead: whatever real instant this test happens to run at, the result
  // must always land inside [dayStart, dayEnd).
  check('freshRunClockSeed(austin) is never earlier than CFG.dayStart',
    () => A.freshRunClockSeed('austin') >= A.CFG.dayStart);
  check('freshRunClockSeed(austin) is always before CFG.dayEnd',
    () => A.freshRunClockSeed('austin') < A.CFG.dayEnd);

  // ---- newFleet() actually uses it, and stays in range -------------------
  check('a fresh newFleet() run seeds S.t inside dayStart..dayEnd', () => {
    A.newFleet('austin');
    const t = w.DH.t;
    return t >= A.CFG.dayStart && t < A.CFG.dayEnd;
  });
  check('a fresh run still starts on day 1', () => {
    A.newFleet('austin');
    return w.DH.day === 1;
  });

  // ---- untouched invariants: later days and resumed saves are unaffected -
  check('CFG.dayStart is still 06:00 — later days must still open there',
    () => A.CFG.dayStart === 6 * 3600);

  if (ok) console.log(`${TARGETS.length > 1 ? label + ': ' : ''}fresh-run clock seed OK`);
  // Without this the boot flow's own setInterval(fetchWeather,...) and the
  // autosave interval keep node's event loop alive forever — every other
  // test file in this suite closes the window for the same reason.
  dom.window.close();
  return ok;
}

(async () => {
  let allOk = true;
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) continue;
    const ok = await run(file);
    allOk = allOk && ok;
  }
  if (!allOk || failures > 0) {
    console.error(`\n${failures} failure(s).`);
    process.exit(1);
  }
  console.log('All fresh-run-clock checks passed.');
})();
