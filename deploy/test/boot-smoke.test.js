/* Boot smoke test — the whole test suite, restored.
 *
 * What broke last time (see improvementplan.md item #3): `owns` was listed
 * in the window.DH_ACT1 export literal without ever being defined, so the
 * `window.DH_ACT1={...}` assignment threw a ReferenceError before it
 * completed. The game still ran (the setInterval tick was already
 * installed above that line), so it LOOKED fine in a browser — but
 * window.DH_ACT1 and window.DH_SAVE, the entire test-harness surface,
 * were never created. Nothing caught it because nothing ran this file.
 *
 * This test boots deadhead.html headlessly in jsdom and asserts that
 * surface actually exists, so that exact failure mode can never ship
 * silently again.
 *
 * Run: node test/boot-smoke.test.js
 * (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TARGETS = [
  path.join(__dirname, '..', '..', 'deadhead.html'),
  path.join(__dirname, '..', 'public', 'index.html'),
];

let failures = 0;

function loadableScript(html) {
  // Leaflet (cdnjs) and cloud.js are both optional at runtime — initMap()
  // no-ops into a "Map unavailable" placeholder when `L` is undefined, and
  // cloud.js is an unrelated analytics stub. Strip both <script src> tags
  // so jsdom never attempts a real network fetch.
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '');
}

async function bootAndCheck(file) {
  const label = path.relative(process.cwd(), file);
  if (!fs.existsSync(file)) {
    console.error(`FAIL ${label}: file not found`);
    failures++;
    return;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const html = loadableScript(raw);

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    // jsdom has never implemented matchMedia (it has no real layout/CSS
    // engine to evaluate a media query against) — this is a jsdom gap, not
    // an app bug, so it's shimmed here rather than in the game itself. A
    // real browser always has a real matchMedia; only the headless
    // harness needs the stub. Without it, `const MOBILE=window.matchMedia(...)`
    // (the phone map-gesture-lock feature) throws at script top level and
    // the whole boot IIFE aborts before window.DH ever gets assigned.
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function (query) {
        return {
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
        };
      };
    },
  });

  // Let the boot IIFE's async Store.get(...).then(...)/.catch(...) chain
  // (autosave lookup -> newFleet()) settle before asserting anything.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const w = dom.window;
  const checks = [
    ['window.DH exists', () => !!w.DH],
    ['window.DH_ACT1 exists', () => !!w.DH_ACT1],
    ['window.DH_SAVE exists', () => !!w.DH_SAVE],
    ['DH_ACT1.step is a function', () => typeof w.DH_ACT1.step === 'function'],
    ['DH_ACT1.newFleet is a function', () => typeof w.DH_ACT1.newFleet === 'function'],
    ['DH_SAVE.snapshot is a function', () => typeof w.DH_SAVE.snapshot === 'function'],
    ['DH_SAVE.restore is a function', () => typeof w.DH_SAVE.restore === 'function'],
    ['DH_SAVE.migrate is a function', () => typeof w.DH_SAVE.migrate === 'function'],
    ['DH_SAVE.VERSION is a string', () => typeof w.DH_SAVE.VERSION === 'string'],
    // Regression guard for the exact bug this test exists to catch: `owns`
    // must never reappear as a dangling reference in the export literal.
    ['DH_ACT1 has no stray "owns" reference', () => !('owns' in w.DH_ACT1)],
  ];

  let ok = true;
  for (const [name, fn] of checks) {
    let pass = false;
    try { pass = !!fn(); } catch (e) { pass = false; }
    if (!pass) {
      console.error(`FAIL ${label}: ${name}`);
      ok = false;
      failures++;
    }
  }

  // snapshot() must write s.city (improvementplan.md item #4 — it previously
  // never did, so restore() reading s.city was reading a field nobody wrote
  // and every save silently reverted to Austin on reload). Only 'austin'
  // is a real key in CITIES today (city #2 hasn't shipped), so this checks
  // that snapshot's output actually carries whatever S.city currently is,
  // rather than round-tripping through restore()'s CITIES-validity guard.
  try {
    const snap = w.DH_SAVE.snapshot();
    if (snap.s.city !== w.DH.city) {
      console.error(`FAIL ${label}: snapshot() did not persist S.city (got ${JSON.stringify(snap.s.city)})`);
      ok = false; failures++;
    }
    // restore() must not throw on a snapshot that now legitimately carries
    // a city field it previously never expected to see.
    w.DH_SAVE.restore(snap);
  } catch (e) {
    console.error(`FAIL ${label}: snapshot/restore round trip threw: ${e.message}`);
    ok = false; failures++;
  }

  if (ok) console.log(`PASS ${label}`);
  dom.window.close();
}

(async () => {
  for (const file of TARGETS) {
    await bootAndCheck(file);
  }
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll boot smoke checks passed.');
})();
