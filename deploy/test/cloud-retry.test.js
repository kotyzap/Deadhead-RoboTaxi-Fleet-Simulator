/* Cloud autosave retry-on-failure test — improvements.md P3-25.
 *
 * WHAT THIS PROTECTS
 *
 * flushKey()'s catch block always kept a failed write in pendingByKey "for
 * the next attempt" — but nothing ever scheduled one. put() only calls
 * flushKey() again the next time something actually changes and crosses the
 * coalescing window (CLOUD_AUTOSAVE_MS), so a network blip landing on the
 * LAST write of a session the player then walks away from (tab stays open,
 * nothing more to autosave) left that write stuck in memory for the rest of
 * the tab's life, rescued only by flushOnExit() whenever it finally closed.
 *
 * The fix adds scheduleRetry(): a backoff timer armed the moment a write
 * fails, independent of whether anything new is ever written again.
 *
 * This test forces the FIRST write to a coalesced slot to fail, then proves
 * the retry fires and succeeds on its own — without the test ever calling
 * put() a second time. window.setTimeout is overridden to fire immediately
 * (rather than actually waiting RETRY_MIN_MS of real wall-clock time), same
 * spirit as swapping in a fake timer.
 *
 * Run: node test/cloud-retry.test.js  (or: npm test)
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
  let failNextPut = false;
  const dom = new JSDOM(SHELL, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;

  // Real setTimeout, unpatched, for OUR OWN "let the microtask queue settle"
  // waits below — only cloud.js's internal timer gets the immediate version.
  const realSetTimeout = w.setTimeout.bind(w);

  w.fetch = (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    calls.push({ url: u, method });
    if (u.includes('/api/me')) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"username":"tester"}') });
    }
    if (method === 'PUT' && u.includes('/api/save/progress') && failNextPut) {
      failNextPut = false;   // one-shot failure — the retry itself must succeed
      return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('{"error":"boom"}') });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') });
  };
  if (!w.TextEncoder) w.TextEncoder = TextEncoder;
  if (!w.crypto) w.crypto = {};
  w.localStorage.setItem('dh_seen_account', '1');

  // Fire cloud.js's own retry timer immediately instead of waiting the real
  // RETRY_MIN_MS (15s) — the backoff VALUE is what's under test elsewhere in
  // the source comment, not real wall-clock delay, which would make this
  // test either slow or flaky under load.
  w.setTimeout = (fn, ms) => { fn(); return 0 };

  w.eval(fs.readFileSync(CLOUD_JS, 'utf8'));
  await new Promise((r) => realSetTimeout(r, 0));
  await new Promise((r) => realSetTimeout(r, 0));

  return { calls, w, arm: () => { failNextPut = true }, wait: (ms) => new Promise((r) => realSetTimeout(r, ms)) };
}

function putCalls(calls, slot) {
  return calls.filter((c) => c.method === 'PUT' && c.url.includes('/api/save/' + encodeURIComponent(slot)));
}

(async () => {
  console.log('cloud.js autosave retry (improvements.md P3-25)');

  const { calls, w, arm, wait } = await boot();
  check('a fake session signs in (window.DH_REMOTE is set)', !!w.DH_REMOTE,
    'probeSession() never resolved — check the /api/me mock above');
  if (!w.DH_REMOTE) { console.error('\ncannot continue without a signed-in session'); process.exit(1) }

  calls.length = 0;
  arm();   // the next PUT to 'progress' fails

  await w.DH_REMOTE.put('progress', { v: 5, unlocked: { austin: true } });
  // Let the (immediate) retry timer's callback and its own await settle.
  await wait(0); await wait(0); await wait(0);

  const progressPuts = putCalls(calls, 'progress');
  check('the first PUT failed (proves the failure path actually ran)',
    progressPuts.length >= 1, 'got: ' + JSON.stringify(calls));
  check('a retry PUT went out on its own — nothing called put() a second time',
    progressPuts.length >= 2,
    'expected scheduleRetry() to fire at least one retry PUT; got: ' + JSON.stringify(calls));

  if (failures) {
    console.error(`\n${failures} cloud-retry check(s) failed.`);
    process.exit(1);
  }
  console.log('All cloud-retry checks passed.');
})();
