/* Tests for bake-roads.js --write.
 *
 * WHY THIS FILE EXISTS
 * bake-roads.js --write edits deadhead.html in place. A splice that produces a
 * syntactically broken ROADS_BY_CITY would take the whole game down at parse
 * time — the script would report success and the file would no longer boot.
 * So the splice is not allowed to be "probably fine": both of its paths get
 * exercised against the REAL file here, and the result is booted in jsdom to
 * prove the object literal still parses and the geometry is readable.
 *
 * Nothing is written to deadhead.html by this test. splice() is pure — it takes
 * source text and returns source text — which is the reason it can be tested
 * this way at all, and a reason not to refactor it into something that writes.
 *
 * OSRM is never contacted. The blocks below are synthetic, because what is
 * under test is the splice, not the routing.
 *
 * Run: node test/bake-splice.test.js   (or npm test)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { splice, simplify } = require('../scripts/bake-roads.js');

const SOURCE = path.join(__dirname, '..', '..', 'deadhead.html');
let failures = 0;

function check(name, fn) {
  let pass = false;
  try { pass = !!fn(); } catch (e) { pass = false; }
  if (!pass) { console.error(`FAIL ${name}`); failures++; }
  return pass;
}

/* Boot a string of HTML and hand back the window, so a spliced result can be
   proven to parse rather than merely inspected. */
async function bootString(html) {
  const dom = new JSDOM(html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, ''), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || ((q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
      }));
    },
  });
  await new Promise((r) => setTimeout(r, 90));
  return dom;
}

/* The insert path is tested with a city id that is NOT in CITIES, on purpose.
   The first version of this test used 'dallas' and asserted absolute pair
   counts — which passed only while Dallas had no baked geometry, and started
   failing the moment a real bake landed, because splice() correctly took its
   replace branch instead. A fixture city can never be overtaken by real data.
   roadsFor() reads ROADS_BY_CITY directly and does not validate against
   CITIES, so a fixture key is readable back out. */
const FIXTURE = 'zzfixture';
const insertBlock =
  "  " + FIXTURE + ":{\n" +
  "    'Alpha|Beta':[32.78,-96.797,32.796,-96.802],\n" +
  "    'CH:Gamma|Alpha':[32.871,-96.7678,32.78,-96.797]\n" +
  "  }\n";
const austinBlock =
  "  austin:{\n" +
  "    'Downtown core|Rainey St':[30.2685,-97.742,30.2585,-97.737]\n" +
  "  }\n";

(async () => {
  const original = fs.readFileSync(SOURCE, 'utf8');

  // Whatever the real cities currently hold — read, never hardcoded, so a
  // re-bake can change every count without touching this file.
  let base = await bootString(original);
  const before = {};
  for (const id of Object.keys(base.window.DH_ACT1.ROADS_BY_CITY)) {
    before[id] = Object.keys(base.window.DH_ACT1.roadsFor(id)).length;
  }
  base.window.close();
  check('the real file has geometry to protect',
    () => Object.keys(before).length >= 1);

  // ---- path 1: a city that isn't in the table yet ----------------------
  const inserted = splice(original, FIXTURE, insertBlock);
  check('insert leaves the source longer', () => inserted.length > original.length);
  check('insert adds the comma the previous block needed',
    () => new RegExp('\\n  },\\n  ' + FIXTURE + ':\\{').test(inserted));

  let dom = await bootString(inserted);
  const ok1 = check('spliced file still boots', () => !!dom.window.DH_ACT1);
  if (ok1) {
    const A = dom.window.DH_ACT1;
    check('the inserted block is readable',
      () => Object.keys(A.roadsFor(FIXTURE)).length === 2);
    check('every real city is untouched by the insert',
      () => Object.keys(before).every((id) =>
        Object.keys(A.roadsFor(id)).length === before[id]));
    // roadPath() reads the LIVE ROADS binding, which is Austin's at boot, so a
    // pair from another city correctly resolves to null until the city is
    // switched. That is the isolation working, not a miss.
    check('a foreign pair does not resolve while Austin is live',
      () => A.roadPath('Alpha', 'Beta') === null);
    dom.window.DH.city = FIXTURE;
    A.loadCityTables();
    check('roadPath resolves a spliced pair once that city is live',
      () => Array.isArray(A.roadPath('Alpha', 'Beta')));
    // roadKey() stores one direction and reverses for the other — a spliced
    // block has to honour that or half of all lookups draw backwards.
    check('a spliced pair reverses correctly', () => {
      const f = A.roadPath('Alpha', 'Beta');
      const r = A.roadPath('Beta', 'Alpha');
      return f[0][0] === r[r.length - 1][0] && f[0][1] === r[r.length - 1][1];
    });
  }
  dom.window.close();

  // ---- path 2: replacing a city that is already there ------------------
  // Run against the INSERTED source so austin sits mid-object, which is the
  // branch that has to re-attach a trailing comma.
  const replaced = splice(inserted, 'austin', austinBlock);
  check('replace keeps the object valid mid-way through',
    () => /\n  },\n/.test(replaced));
  check('replace shrank the austin block',
    () => replaced.length < inserted.length);

  dom = await bootString(replaced);
  const ok2 = check('re-spliced file still boots', () => !!dom.window.DH_ACT1);
  if (ok2) {
    const A = dom.window.DH_ACT1;
    check('austin geometry was replaced, not merged',
      () => Object.keys(A.roadsFor('austin')).length === 1);
    check('the fixture city survived a replace of its neighbour',
      () => Object.keys(A.roadsFor(FIXTURE)).length === 2);
    check('other real cities survived the replace',
      () => Object.keys(before).filter((id) => id !== 'austin').every((id) =>
        Object.keys(A.roadsFor(id)).length === before[id]));
  }
  dom.window.close();

  // ---- simplify(): the geometry thinner -------------------------------
  // The endpoint guarantee is the load-bearing one. roadFix() pins a car's
  // drawn position to the ends of its leg, so an RDP that moved either end
  // would slide every car off its zone marker.
  check('simplify keeps both endpoints exactly', () => {
    const pts = [];
    for (let i = 0; i < 200; i++) {
      pts.push([30.25 + i * 0.0004, -97.75 + Math.sin(i / 7) * 0.0006]);
    }
    const out = simplify(pts, 15);
    return out[0][0] === pts[0][0] && out[0][1] === pts[0][1] &&
           out[out.length - 1][0] === pts[pts.length - 1][0] &&
           out[out.length - 1][1] === pts[pts.length - 1][1];
  });
  check('simplify never lengthens a route', () => {
    const pts = [];
    for (let i = 0; i < 120; i++) pts.push([32.78 + i * 0.0003, -96.8 + i * 0.0002]);
    return simplify(pts, 15).length <= pts.length;
  });
  check('a straight line collapses to its two ends', () => {
    const pts = [];
    for (let i = 0; i < 50; i++) pts.push([32.78 + i * 0.001, -96.8]);
    return simplify(pts, 15).length === 2;
  });
  check('a real corner is preserved', () => {
    // 1 km east then 1 km north: the turn is far outside 15 m and must survive
    const pts = [[32.78, -96.80], [32.78, -96.789], [32.789, -96.789]];
    return simplify(pts, 15).length === 3;
  });
  check('simplify passes through short routes untouched',
    () => simplify([[1, 2], [3, 4]], 15).length === 2);
  check('a tighter tolerance never keeps fewer points', () => {
    const pts = [];
    for (let i = 0; i < 150; i++) {
      pts.push([30.25 + i * 0.0004, -97.75 + Math.sin(i / 5) * 0.0008]);
    }
    return simplify(pts, 5).length >= simplify(pts, 30).length;
  });

  // ---- guard rails -----------------------------------------------------
  check('splice throws on source with no ROADS_BY_CITY', () => {
    try { splice('<html></html>', FIXTURE, insertBlock); return false; }
    catch (e) { return /ROADS_BY_CITY not found/.test(e.message); }
  });
  check('the real deadhead.html on disk was not modified',
    () => fs.readFileSync(SOURCE, 'utf8') === original);

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('PASS bake-roads splice (insert + replace, both boot)');
})().catch((e) => {
  console.error('bake-splice test crashed:', e.message);
  process.exit(1);
});
