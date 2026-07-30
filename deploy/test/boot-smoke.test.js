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
/* NESTED HTML COMMENTS. 0.52.0 shipped a comment whose body quoted another
   comment's closing marker; the inner `-->` ended the comment early and the
   remaining prose rendered as visible text in the topbar. HTML comments do NOT
   nest — the first `-->` always wins — and the failure is silent in every tool
   that does not actually look at the page. Checked against the source text
   because jsdom will happily parse the broken document too. */
function commentSanity(src) {
  const bad = [];
  const spans = [];
  let i = 0;
  while (true) {
    const s = src.indexOf('<!--', i);
    if (s < 0) break;
    const e = src.indexOf('-->', s + 4);
    if (e < 0) { bad.push('unterminated comment at offset ' + s); break }
    if (src.slice(s + 4, e).includes('<!--')) {
      bad.push('nested <!-- inside a comment at offset ' + s);
    }
    spans.push([s, e + 3]);
    i = e + 3;
  }
  // A `-->` outside every comment span is the tail of a comment that closed early.
  let m;
  const re = /-->/g;
  while ((m = re.exec(src))) {
    const at = m.index;
    if (!spans.some(([a, b]) => at >= a && at < b)) {
      bad.push('stray --> outside any comment at offset ' + at);
    }
  }
  return bad;
}

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
    /* 0.52.1: a comment that quoted another comment's closing marker ended
       early, and its remaining prose rendered as visible text in the topbar.
       See commentSanity() above for why this is checked against the source
       rather than the parsed DOM. */
    ['no nested or early-closed HTML comments', () => {
      const bad = commentSanity(fs.readFileSync(file, 'utf8'));
      if (bad.length) console.error('       ' + bad.slice(0, 3).join('; '));
      return bad.length === 0;
    }],
    /* The same bug's visible symptom, caught from the other side: prose that
       escapes a comment lands as a text node directly inside a layout
       container, which never legitimately holds bare text. */
    ['no stray text nodes in the topbar or the settings popover', () => {
      const sel = '.topbar, .tb-ctrls, .tb-info, #settings-pop';
      return [].every.call(w.document.querySelectorAll(sel), (el) =>
        [].every.call(el.childNodes, (n) =>
          n.nodeType !== 3 || !n.textContent.trim()));
    }],
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
