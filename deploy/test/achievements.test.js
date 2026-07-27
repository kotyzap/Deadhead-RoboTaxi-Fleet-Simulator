/* Achievements engine test.
 *
 * WHAT THIS PROTECTS
 *
 * Achievements are the one number in this game that is true by
 * construction — computed locally, from the player's own save, with no
 * server in the path. That is the whole reason they sit next to a
 * self-reported leaderboard without embarrassment, and it only holds if
 * the predicates actually say what they mean.
 *
 * Three specific things go wrong with a table like ACHV, and all three are
 * asserted below:
 *   1. A predicate that reads a field which does not exist. `live()` runs
 *      on the sim tick inside a try/catch, so a typo'd field name does not
 *      throw — it silently evaluates falsey and the achievement becomes
 *      permanently unwinnable, with nothing in the logs.
 *   2. An id in the game that the server does not whitelist, which means
 *      the achievement works locally and vanishes from telemetry.
 *   3. Award-once slipping, so a tick loop re-fires the fanfare forever.
 *
 * Run: node test/achievements.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const GAME = path.join(__dirname, '..', '..', 'deadhead.html');
const WORKER = path.join(__dirname, '..', 'src', 'index.js');
const ADMIN = path.join(__dirname, '..', 'public', 'admin.html');

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
  console.log('achievements');

  const dom = new JSDOM(loadableScript(fs.readFileSync(GAME, 'utf8')), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function (q) {
        return { matches: false, media: q, addEventListener() {},
          removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      // The board is a network call; nothing here should make one, and a
      // real fetch attempt in jsdom is a slow failure rather than a fast one.
      window.fetch = () => Promise.reject(new Error('offline in test'));
    },
  });
  await new Promise((r) => setTimeout(r, 60));

  const w = dom.window;
  const A = w.DH_ACT1;
  const S = w.DH;

  check('DH_ACT1 exposes the achievement surface',
    !!A && Array.isArray(A.ACHV) && typeof A.awardAchv === 'function'
      && typeof A.checkAchievements === 'function');
  if (!A || !A.ACHV) { process.exit(1) }

  check('the catalogue is non-empty', A.ACHV.length > 0);

  // Ids must be unique — a duplicate silently shadows one entry in achvById().
  const ids = A.ACHV.map((a) => a.id);
  check('every id is unique', new Set(ids).size === ids.length,
    JSON.stringify(ids.filter((x, i) => ids.indexOf(x) !== i)));

  // Every entry needs a name and a hint; the panel renders both.
  check('every entry has a name and a hint',
    A.ACHV.every((a) => a.name && a.hint),
    JSON.stringify(A.ACHV.filter((a) => !a.name || !a.hint).map((a) => a.id)));

  /* THE SILENT-TYPO GUARD. checkAchievements() swallows predicate errors on
     purpose — a shift end must never be broken by an achievement — which
     means a predicate that throws is indistinguishable from one that is
     merely not met yet. Here, outside that catch, a throw is a failure. */
  const threw = [];
  A.ACHV.forEach((a) => {
    if (!a.live) return;
    try { a.live() } catch (e) { threw.push(a.id + ': ' + e.message) }
  });
  check('no live() predicate throws against a fresh state', threw.length === 0,
    threw.join('; '));

  /* Same for shift(), against a representative finished-shift row. Shape
     copied from appendHistoryRow()'s row literal. */
  const row = { ts: Date.now(), city: 'austin', day: 1, shiftNo: 1,
    permit: 'Supervised', workedH: 4, billedH: 4, gross: 400, commission: 40,
    cost: 150, net: 250, energy: 20, dep: 30, maint: 10, ins: 5, soft: 5,
    fixed: 80, miles: 60, rides: 12, cancels: 0, safety: 96, cash: 5000,
    cars: 1, models: {} };
  const threwShift = [];
  A.ACHV.forEach((a) => {
    if (!a.shift) return;
    try { a.shift(row) } catch (e) { threwShift.push(a.id + ': ' + e.message) }
  });
  check('no shift() predicate throws against a real row', threwShift.length === 0,
    threwShift.join('; '));

  /* AWARD ONCE. awardAchv() is called from a tick loop, so the second call
     must return false — otherwise every tick replays the log line and the
     fanfare for an achievement the player already has. */
  const first = A.awardAchv('first-car');
  const second = A.awardAchv('first-car');
  check('awardAchv returns true once and false after', first === true && second === false,
    `first=${first} second=${second}`);
  check('an awarded achievement is held', A.achvHeld('first-car') === true);
  check('achvList includes it', A.achvList().indexOf('first-car') >= 0);
  check('an unknown id is refused, not thrown',
    A.awardAchv('no-such-achievement') === false);

  /* The row above is a clean, profitable, 12-ride shift, so these three
     must fire. This is the end-to-end check that shift() entries are wired
     to the row's actual field names — `rides`, not `done`; `net`, not
     `profit` — which is precisely the class of typo item 1 hides. */
  A.checkAchievements(row);
  ['first-shift', 'black', 'clean-sheet'].forEach((id) => {
    check(`a clean profitable shift awards ${id}`, A.achvHeld(id) === true);
  });
  check('a $250 shift does not award net-1500', A.achvHeld('net-1500') === false);

  /* CROSS-FILE CONSISTENCY. Three files carry the catalogue: the game (the
     authority), the Worker's whitelist, and the admin's label map. Drift in
     the whitelist is the one that actually loses data — an id the server
     does not know is stripped from every telemetry payload, so the
     achievement works in the game and is invisible in the admin forever. */
  const worker = fs.readFileSync(WORKER, 'utf8');
  const wl = worker.match(/const ACHV_IDS = \[([\s\S]*?)\];/);
  check('src/index.js declares ACHV_IDS', !!wl);
  if (wl) {
    const listed = (wl[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
    const missing = ids.filter((id) => !listed.includes(id));
    const extra = listed.filter((id) => !ids.includes(id));
    check('every game achievement is whitelisted by the Worker',
      missing.length === 0, 'missing from ACHV_IDS: ' + missing.join(', '));
    check('the Worker whitelists nothing the game does not have',
      extra.length === 0, 'stale in ACHV_IDS: ' + extra.join(', '));
  }

  const admin = fs.readFileSync(ADMIN, 'utf8');
  const am = admin.match(/const ACHV_NAMES = \{([\s\S]*?)\};/);
  check('admin.html declares ACHV_NAMES', !!am);
  if (am) {
    const labelled = (am[1].match(/'([^']+)'\s*:/g) || [])
      .map((s) => s.replace(/'\s*:$/, '').slice(1));
    const unlabelled = ids.filter((id) => !labelled.includes(id));
    check('every achievement has an admin label', unlabelled.length === 0,
      'missing from ACHV_NAMES: ' + unlabelled.join(', '));
  }

  /* The trophy modal must exist and must be closed at boot. `hidden` alone
     is not proof of anything in this codebase — an author `display` beats
     it, which is the documented "Take control does nothing" bug — so the
     .modal[hidden]{display:none} guard has to cover #trophy too. */
  const tm = w.document.getElementById('trophy');
  check('#trophy exists', !!tm);
  check('#trophy is closed at boot', !!tm && tm.hidden === true);
  check('#trophy uses the .modal class that carries the [hidden] guard',
    !!tm && tm.classList.contains('modal'));
  check('the trophy nav icon exists', !!w.document.getElementById('app-trophy'));

  /* Opening must not throw even with the network down — the board half is
     allowed to be absent, the achievements half is not. */
  let openErr = null;
  try { A.openTrophies() } catch (e) { openErr = e }
  check('openTrophies() survives an offline board', openErr === null,
    openErr && openErr.message);
  check('the modal is open after openTrophies()', !!tm && tm.hidden === false);
  check('the achievement grid rendered',
    w.document.getElementById('tr-list').children.length === A.ACHV.length);

  /* Let openTrophies()'s loadBoard() chain settle BEFORE tearing the window
     down. Without this the rejected fetch's .then() lands on a document
     that no longer exists and prints a stack after the summary — noise
     today, and a nonzero exit on any Node that decides to treat a late
     unhandled rejection as fatal. */
  await new Promise((r) => setTimeout(r, 30));

  /* The game installs a setInterval sim tick at boot, so the jsdom window
     keeps the Node event loop alive forever if it is left open — the same
     reason boot-smoke.test.js closes its window. */
  dom.window.close();

  if (failures) {
    console.error(`\n${failures} achievement check(s) failed.`);
    process.exit(1);
  }
  console.log('All achievement checks passed.');
})();
