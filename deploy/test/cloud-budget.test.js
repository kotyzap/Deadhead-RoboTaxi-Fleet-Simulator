/* Cloud request-budget test.
 *
 * WHAT THIS PROTECTS
 *
 * Static assets on Workers are free and unlimited, so the game itself can
 * absorb any amount of traffic. The Worker's 100,000 requests/day free
 * allowance is spent only on /api/*, and the way to blow it is not a lot
 * of players — it is a lot of people who load the page and leave.
 *
 * cloud.js used to fire /api/me AND /api/params from mount(), on every
 * page load, for everyone. A Reddit visitor who bounced in ten seconds
 * still cost two requests, so 50,000 bouncers exhausted the day's budget
 * before a single player who stayed had filed a shift.
 *
 * The fix is the SEEN_KEY marker: boot talks to the network only if this
 * browser has ever had an account on it. That is easy to regress — a
 * future "just fetch it at boot, it's only one request" is exactly the
 * kind of change that looks harmless in review and quietly restores a
 * per-visitor tax. So the budget is asserted here rather than trusted.
 *
 * Run: node test/cloud-budget.test.js  (or: npm test)
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

/* cloud.js injects itself into the save manager's markup and bails out
   early if it is not there (`if (!modal) return`), so the harness needs
   the minimum DOM it looks for. This is deliberately hand-written rather
   than loading the real 650 KB index.html: this test is about which
   requests leave the page, and booting the whole game would drag in
   Leaflet, the map, the weather fetch and the tutorial for no benefit. */
const SHELL = `<!doctype html><html><body>
  <div id="savemgr" hidden><div class="rep"><h4>Saves</h4></div></div>
</body></html>`;

async function boot({ marker }) {
  const calls = [];
  const dom = new JSDOM(SHELL, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;

  /* Record every request instead of making one. Resolving with a 401-ish
     body keeps the not-signed-in path realistic; nothing here should get
     far enough to care. */
  w.fetch = (url, opts) => {
    calls.push(String(url));
    return Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"not signed in"}'),
    });
  };
  /* jsdom does not expose TextEncoder or crypto.subtle on its window.
     cloud.js builds both at script top level (`new TextEncoder()` for the
     KDF salt), so without these shims the whole IIFE aborts before mount()
     and the test would pass for the wrong reason — zero requests because
     nothing ran. Neither is actually exercised: they are only used by
     submitAuth(), which this test never reaches. */
  if (!w.TextEncoder) w.TextEncoder = TextEncoder;
  if (!w.crypto) w.crypto = {};

  if (marker) w.localStorage.setItem('dh_seen_account', '1');

  w.eval(fs.readFileSync(CLOUD_JS, 'utf8'));
  // Let mount()'s promise chain settle before counting.
  await new Promise((r) => setTimeout(r, 0));
  return { calls, w, dom };
}

(async () => {
  console.log('cloud.js request budget');

  /* THE CASE THAT MATTERS: someone arrives from a link, has never signed
     in, and leaves. This must cost the Worker nothing at all. */
  {
    const { calls } = await boot({ marker: false });
    check('anonymous boot makes zero /api calls', calls.length === 0,
      'got: ' + JSON.stringify(calls));
  }

  /* A browser that HAS had an account still restores its session, and
     spends exactly one request doing it — not one per modal open. */
  {
    const { calls, w } = await boot({ marker: true });
    const me = calls.filter((u) => u.includes('/api/me'));
    check('marked browser probes /api/me exactly once', me.length === 1,
      'got: ' + JSON.stringify(calls));
    check('marked browser does not fetch /api/params at boot',
      !calls.some((u) => u.includes('/api/params')),
      'got: ' + JSON.stringify(calls));

    /* Opening and closing the Saves modal repeatedly is the stale-marker
       fallback path; it must collapse into the one probe already spent. */
    const modal = w.document.getElementById('savemgr');
    for (let i = 0; i < 5; i++) {
      modal.hidden = false;
      modal.hidden = true;
    }
    await new Promise((r) => setTimeout(r, 0));
    check('reopening the Saves modal spends no extra requests',
      calls.filter((u) => u.includes('/api/me')).length === 1,
      'got: ' + JSON.stringify(calls));
  }

  /* The stale-marker fallback itself: no marker, but the player opens the
     Saves modal. One probe is correct here — an HttpOnly dh_session cookie
     can outlive a cleared localStorage, and this is the only chance to
     notice. A bouncer never opens this modal, so it costs them nothing. */
  {
    const { calls, w } = await boot({ marker: false });
    const modal = w.document.getElementById('savemgr');
    modal.hidden = false;
    await new Promise((r) => setTimeout(r, 0));
    check('unmarked browser probes once when Saves is opened',
      calls.filter((u) => u.includes('/api/me')).length === 1,
      'got: ' + JSON.stringify(calls));
  }

  if (failures) {
    console.error(`\n${failures} cloud budget check(s) failed.`);
    process.exit(1);
  }
  console.log('All cloud budget checks passed.');
})();
