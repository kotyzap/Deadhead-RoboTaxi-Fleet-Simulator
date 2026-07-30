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

  /* admin.html's ACHV_INFO carries the name AND the earning condition, so
     the admin reads like the game does. It is a hand-kept copy, which is
     only safe because it is compared here against the authority character
     for character — a reworded hint in the game that is not mirrored fails
     the suite instead of quietly leaving the admin describing an older
     rule. Parsed rather than imported: admin.html is a static page with no
     module graph to hook into. */
  const admin = fs.readFileSync(ADMIN, 'utf8');
  const am = admin.match(/const ACHV_INFO = \{([\s\S]*?)\n  \};/);
  check('admin.html declares ACHV_INFO', !!am);
  if (am) {
    const info = {};
    const rowRe = /'([^']+)'\s*:\s*\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g;
    let mm;
    while ((mm = rowRe.exec(am[1])) !== null) {
      info[mm[1]] = [mm[2].replace(/\\'/g, "'"), mm[3].replace(/\\'/g, "'")];
    }
    check('ACHV_INFO parsed as many rows as the game has achievements',
      Object.keys(info).length === A.ACHV.length,
      `admin=${Object.keys(info).length} game=${A.ACHV.length}`);

    const missing = ids.filter((id) => !info[id]);
    check('every achievement has an admin entry', missing.length === 0,
      'missing from ACHV_INFO: ' + missing.join(', '));

    const stale = Object.keys(info).filter((id) => !ids.includes(id));
    check('ACHV_INFO lists nothing the game does not have', stale.length === 0,
      'stale in ACHV_INFO: ' + stale.join(', '));

    const wrongName = A.ACHV.filter((a) => info[a.id] && info[a.id][0] !== a.name)
      .map((a) => `${a.id}: admin "${info[a.id][0]}" vs game "${a.name}"`);
    check('every admin name matches the game exactly', wrongName.length === 0,
      wrongName.join('; '));

    const wrongHint = A.ACHV.filter((a) => info[a.id] && info[a.id][1] !== a.hint)
      .map((a) => `${a.id}: admin "${info[a.id][1]}" vs game "${a.hint}"`);
    check('every admin specification matches the game exactly',
      wrongHint.length === 0, wrongHint.join('; '));
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
  /* THE BUG THAT SHIPPED IN 0.33.0. The nav lock pass used a positional
     array of gate names indexed against the buttons. An eighth button ran
     off the end, `gate[i]||'fleet'` locked it behind owning a car, and
     .t-app.locked is opacity:.3 + pointer-events:none — so the icon was
     invisible and dead on a fresh save, which reads as "it never shipped".

     Three assertions, because the fix has three ways to rot: the icon must
     exist, it must be unlocked on a brand-new fleet (nothing has been
     earned yet at this point in the test), and every OTHER icon must name
     a gate that is a real STAGES id — a typo'd data-gate would lock an
     icon forever with nothing to catch it. */
  const trophyBtn = w.document.getElementById('app-trophy');
  check('the trophy nav icon exists', !!trophyBtn);
  check('the trophy icon is not locked on a fresh fleet',
    !!trophyBtn && !trophyBtn.classList.contains('locked'));
  check('the trophy icon declares no data-gate',
    !!trophyBtn && !trophyBtn.dataset.gate);

  const stageIds = (A.STAGES || []).map((s) => s.id);
  const badGates = [...w.document.querySelectorAll('.t-apps .t-app')]
    .map((b) => b.dataset.gate)
    .filter((g) => g && !stageIds.includes(g));
  check('every data-gate names a real STAGES id', badGates.length === 0,
    'unknown gates: ' + badGates.join(', '));

  /* The lock pass must be driven by the attribute, not by position. Proven
     by moving a button and re-running it: a positional array would now
     gate the wrong icons. */
  const nav = w.document.querySelector('.t-apps');
  const moved = nav.firstElementChild;
  nav.appendChild(moved);                 // Fleet moves to the end
  A.render();
  check('gating survives reordering the nav strip',
    moved.classList.contains('locked') === !A.unlocked(moved.dataset.gate)
      && !w.document.getElementById('app-trophy').classList.contains('locked'));
  nav.insertBefore(moved, nav.firstElementChild);   // put it back

  /* Opening must not throw even with the network down — the board half is
     allowed to be absent, the achievements half is not. */
  let openErr = null;
  try { A.openTrophies() } catch (e) { openErr = e }
  check('openTrophies() survives an offline board', openErr === null,
    openErr && openErr.message);
  /* Trophies shows in #dh-console-panel now, not as a full-screen #trophy
     modal (0.36.0) — #trophy itself stays hidden permanently, and
     #trophy-card (the actual grid/board) relocates into #dh-cpbody instead.
     See showInConsole()/openTrophies(). */
  check('#trophy itself stays hidden — it is not the visible container any more',
    !!tm && tm.hidden === true);
  check('the console panel is open after openTrophies()',
    w.document.getElementById('dh-console-panel').hidden === false
      && !!A.consolePanel() && A.consolePanel().panelId === 'trophy');
  check('#trophy-card relocated into #dh-cpbody',
    w.document.getElementById('dh-cpbody').contains(w.document.getElementById('trophy-card')));
  check('the achievement grid rendered',
    w.document.getElementById('tr-list').children.length === A.ACHV.length);

  /* DISCOVERABILITY. The icon shipped invisible once already; these guard
     the four signposts added afterwards, all of which are driven by the
     earned-vs-seen split rather than by three separate ideas of "new". */
  A.awardAchv('fleet-3');                       // something unread
  const badge = w.document.querySelector('#app-trophy .badge');
  check('the nav badge exists and is showing', !!badge && badge.hidden === false);
  check('the badge counts unread, not total',
    !!badge && badge.textContent === String(A.achvUnread().length),
    badge && `badge="${badge.textContent}" unread=${A.achvUnread().length}`);
  check('the topbar readout shows held over total',
    w.document.getElementById('tb-achv').textContent
      === A.achvList().length + '/' + A.ACHV.length);

  /* Opening is what counts as seeing. The badge must clear, and reopening
     must not resurrect it. closeConsolePanel() between opens — not a raw
     #trophy.hidden flip, which no longer means anything (0.36.0) — is the
     real "player switched away" path. */
  A.openTrophies();
  check('opening clears the unread badge',
    A.achvUnread().length === 0 && badge.hidden === true);
  A.closeConsolePanel();
  A.openTrophies();
  check('reopening leaves the badge clear', badge.hidden === true);
  A.closeConsolePanel();

  /* Paolo's pointer is once ever, not once per achievement — the flag lives
     in PROG so it survives a new city too. */
  const paoloLines = () => w.DH.log.filter(
    (l) => l.who === 'Paolo' && /trophy on the app bar/.test(l.what)).length;
  check('Paolo pointed at the icon exactly once', paoloLines() === 1,
    'got ' + paoloLines());
  A.awardAchv('fleet-5');
  check('Paolo does not repeat himself on later achievements',
    paoloLines() === 1, 'got ' + paoloLines());

  /* Let openTrophies()'s loadBoard() chain settle BEFORE tearing the window
     down. Without this the rejected fetch's .then() lands on a document
     that no longer exists and prints a stack after the summary — noise
     today, and a nonzero exit on any Node that decides to treat a late
     unhandled rejection as fatal. Must stay LAST: anything below the
     close() below runs against a dead document. */
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
