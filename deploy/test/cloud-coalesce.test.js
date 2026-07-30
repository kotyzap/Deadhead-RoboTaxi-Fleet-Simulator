/* Cloud write-coalescing test — improvements.md P1-13.
 *
 * WHAT THIS PROTECTS
 *
 * CLOUD_AUTOSAVE_MS exists to bound how often a signed-in tab hits the
 * Worker's /api/save/:slot route: RemoteStore.put() used to coalesce ONLY
 * the 'auto'/'auto:<city>' slots, deferring a second write within the
 * window instead of sending it. progSave()/profileSave()/appendHistoryRow()
 * (deadhead.html) call Store.put('progress'/'profile'/'history', ...) on
 * exactly the same cadence as the autosave — progSave() runs every single
 * autosave, unconditionally — so before this fix a signed-in tab left open
 * all day sent an UNCOALESCED write for each of those three slots every
 * ~30 seconds: four times the traffic the 'auto' slot alone was capped at.
 *
 * This test signs a fake session in (via the same probeSession() path a
 * real page load uses — no submitAuth()/KDF needed) and exercises
 * RemoteStore.put() directly through the one thing cloud.js exposes for it,
 * window.DH_REMOTE, the same object deadhead.html's Store dispatcher calls.
 *
 * Run: node test/cloud-coalesce.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const CLOUD_JS = path.join(__dirname, '..', 'public', 'cloud.js');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

const SHELL = `<!doctype html><html><body>
  <div id="savemgr" hidden><div class="rep"><h4>Saves</h4></div></div>
</body></html>`;

async function boot() {
  const calls = [];
  const dom = new JSDOM(SHELL, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;

  w.fetch = (url, opts) => {
    const u = String(url);
    calls.push({ url: u, method: (opts && opts.method) || 'GET' });
    /* /api/me: pretend a session cookie is already valid, so probeSession()
       (which requires the SEEN_KEY marker below) calls goOnline() and sets
       window.DH_REMOTE — the one thing this test actually needs. Every
       other request (the PUTs under test, /api/save/*) just needs to
       resolve so RemoteStore.put()'s await doesn't hang; its own success
       path only cares that res.ok is true. */
    if (u.includes('/api/me')) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"username":"tester"}') });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') });
  };
  if (!w.TextEncoder) w.TextEncoder = TextEncoder;
  if (!w.crypto) w.crypto = {};

  // hasAccountMarker() must be true for probeSession() to run at boot at all.
  w.localStorage.setItem('dh_seen_account', '1');

  w.eval(fs.readFileSync(CLOUD_JS, 'utf8'));
  // Let mount()'s probeSession() promise chain settle (goOnline() runs here).
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { calls, w };
}

function putCalls(calls, slot) {
  return calls.filter((c) => c.method === 'PUT' && c.url.includes('/api/save/' + encodeURIComponent(slot)));
}

(async () => {
  console.log('cloud.js write coalescing (improvements.md P1-13)');

  const { calls, w } = await boot();
  check('a fake session signs in (window.DH_REMOTE is set)', !!w.DH_REMOTE,
    'probeSession() never resolved — check the /api/me mock above');
  if (!w.DH_REMOTE) { console.error('\ncannot continue without a signed-in session'); process.exit(1) }

  calls.length = 0; // only count what happens from here down

  // Two rapid 'progress' writes: the second must be DEFERRED, not sent.
  await w.DH_REMOTE.put('progress', { v: 5, unlocked: { austin: true } });
  await w.DH_REMOTE.put('progress', { v: 5, unlocked: { austin: true, dallas: true } });
  check("a second rapid 'progress' write is coalesced (only one PUT sent)",
    putCalls(calls, 'progress').length === 1,
    'got: ' + JSON.stringify(calls));

  // Same for 'profile' and 'history' — the other two slots P1-13 covers.
  await w.DH_REMOTE.put('profile', { v: 1, id: 'p1', name: 'A' });
  await w.DH_REMOTE.put('profile', { v: 1, id: 'p1', name: 'B' });
  check("a second rapid 'profile' write is coalesced",
    putCalls(calls, 'profile').length === 1, 'got: ' + JSON.stringify(calls));

  await w.DH_REMOTE.put('history', { v: 1, rows: [1] });
  await w.DH_REMOTE.put('history', { v: 1, rows: [1, 2] });
  check("a second rapid 'history' write is coalesced",
    putCalls(calls, 'history').length === 1, 'got: ' + JSON.stringify(calls));

  /* Independent clocks: a rapid 'auto:austin' write must not be swallowed
     by 'progress' already being mid-coalesce, and vice versa — this is the
     whole reason pendingByKey/lastFlushByKey are Maps keyed per-slot rather
     than the single pendingAuto/lastCloudAuto pair they replaced. */
  await w.DH_REMOTE.put('auto:austin', { v: 5, s: {} });
  check("'auto:austin' still gets its OWN first write through (not coalesced away by 'progress')",
    putCalls(calls, 'auto:austin').length === 1, 'got: ' + JSON.stringify(calls));
  await w.DH_REMOTE.put('auto:austin', { v: 5, s: { day: 2 } });
  check("...and a second rapid 'auto:austin' write is ALSO coalesced, same as before this fix",
    putCalls(calls, 'auto:austin').length === 1, 'got: ' + JSON.stringify(calls));

  // A slot outside the coalesced set (a manual save slot) is never deferred.
  await w.DH_REMOTE.put('slot1', { v: 5, s: {} });
  await w.DH_REMOTE.put('slot1', { v: 5, s: { day: 2 } });
  check("'slot1' (not a coalesced key) sends every write immediately",
    putCalls(calls, 'slot1').length === 2, 'got: ' + JSON.stringify(calls));

  if (failures) {
    console.error(`\n${failures} cloud-coalesce check(s) failed.`);
    process.exit(1);
  }
  console.log('All cloud-coalesce checks passed.');
})();
