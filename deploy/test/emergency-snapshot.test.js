/* Emergency localStorage snapshot — improvements.md P3-25.
 *
 * WHAT THIS PROTECTS
 *
 * autosave() writes through Store.put(), which is IndexedDB — an ASYNC
 * write. beforeunload used to call autosave('beforeunload') directly, but a
 * browser tearing the page down for beforeunload makes no promise that an
 * async write started inside that handler ever finishes; in practice the
 * "belt to pagehide's suspenders" was itself unreliable exactly when it
 * mattered (a real window/tab close, as opposed to the mobile tab-kill
 * pagehide already covers).
 *
 * The fix: beforeunload now writes a compact snapshot() to localStorage
 * SYNCHRONOUSLY (see EMERGENCY_KEY in deadhead.html), and bootResume() reads
 * it back at most once on the very next boot — using it only if it is for
 * the city about to load and newer than whatever IndexedDB already has, and
 * always clearing it either way so it can never become a second permanent
 * save location that drifts out of sync with the real one.
 *
 * jsdom has no real IndexedDB, so Store.get('auto') always rejects here —
 * which is actually the ideal environment to prove the rescue path works,
 * since it exercises exactly the "primary store isn't working" case the
 * mechanism exists for. This also caught a real bug while writing the fix:
 * the emergency-snapshot check originally lived only inside Store.get('auto')'s
 * .then(), so a REJECTED Store.get() (IndexedDB blocked/unavailable) skipped
 * it entirely and fell straight to newFleet() — precisely the moment the
 * rescue was supposed to matter. Fixed by catching the rejection into `null`
 * before the emergency-snapshot check, rather than after it.
 *
 * Run: node test/emergency-snapshot.test.js  (or: npm test)
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

async function boot(seedLocalStorage) {
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
      // Seeded BEFORE any of the game's own scripts run, so bootResume()'s
      // read of EMERGENCY_KEY sees it on this very first boot — standing in
      // for "the tab was closed last session, and this is the next launch".
      if (seedLocalStorage) seedLocalStorage(window);
    },
  });
  await new Promise((r) => setTimeout(r, 90));
  return dom;
}

(async () => {
  console.log('emergency localStorage snapshot (improvements.md P3-25)');

  // ---- part 1: beforeunload writes synchronously, and it is readable ------
  {
    const dom = await boot();
    const w = dom.window;
    check('boots to a fresh fleet with nothing in EMERGENCY_KEY yet',
      w.localStorage.getItem('dh_emergency_snapshot') === null);

    w.dispatchEvent(new w.Event('beforeunload'));
    const raw = w.localStorage.getItem('dh_emergency_snapshot');
    check('beforeunload wrote something to localStorage, synchronously',
      typeof raw === 'string' && raw.length > 0);
    let parsed = null;
    try { parsed = JSON.parse(raw) } catch (e) { /* checked below */ }
    check('...and it parses as JSON with the real snapshot shape',
      !!parsed && !!parsed.s && !!parsed.meta && typeof parsed.ts === 'number');
    check('...for the city the fresh fleet actually opened on',
      parsed && parsed.s.city === w.DH.city);

    dom.window.close();
  }

  // ---- part 2: a NEWER emergency snapshot for the SAME city rescues state -
  {
    const FUTURE_CASH = 123456; // an unmistakable, non-default value
    const dom = await boot((w) => {
      w.localStorage.setItem('dh_emergency_snapshot', JSON.stringify({
        v: 1, ts: Date.now() + 10000, app: '0.0.0-test',
        meta: { day: 3, cash: FUTURE_CASH, cars: 1, clock: '14:00' },
        s: { city: 'austin', t: 50000, day: 3, cash: FUTURE_CASH, cars: [] },
      }));
    });
    const w = dom.window;
    // Store.get('auto') always rejects in jsdom (no real IndexedDB) — this
    // proves the rescue fires from the REJECTION path, not just the
    // resolved-with-nothing path (see the bug this test caught, in the file
    // banner above).
    check('the resume prompt is offered instead of silently starting fresh',
      w.document.getElementById('resume').hidden === false,
      'expected the emergency snapshot to surface a resumable save');
    check('EMERGENCY_KEY is cleared after being read — one-shot, not a second save slot',
      w.localStorage.getItem('dh_emergency_snapshot') === null);
    check('the resume summary shows the rescued save\'s numbers, not a fresh fleet\'s',
      w.document.getElementById('rs-body').innerHTML.indexOf(String(FUTURE_CASH)) !== -1
        || w.document.getElementById('rs-body').innerHTML.indexOf('123,456') !== -1,
      w.document.getElementById('rs-body').innerHTML);

    dom.window.close();
  }

  // ---- part 3: a snapshot for a DIFFERENT city must not resurrect --------
  {
    const dom = await boot((w) => {
      w.localStorage.setItem('dh_emergency_snapshot', JSON.stringify({
        v: 1, ts: Date.now() + 10000, app: '0.0.0-test',
        meta: { day: 9, cash: 999999, cars: 4, clock: '09:00' },
        s: { city: 'dallas', t: 50000, day: 9, cash: 999999, cars: [] },
      }));
    });
    const w = dom.window;
    check('a same-city-mismatch snapshot is ignored — no resumable save offered',
      w.document.getElementById('resume').hidden === true);
    check('it is still cleared from localStorage (one-shot, regardless of use)',
      w.localStorage.getItem('dh_emergency_snapshot') === null);

    dom.window.close();
  }

  if (failures) {
    console.error(`\n${failures} emergency-snapshot check(s) failed.`);
    process.exit(1);
  }
  console.log('All emergency-snapshot checks passed.');
})();
