/* Tests for nudge-zones.js --write.
 *
 * WHY THIS FILE EXISTS
 * Same reason as bake-splice.test.js: this script rewrites deadhead.html in
 * place, and a bad edit to ZONES_BY_CITY does not fail loudly — it takes the
 * whole game down at parse time while the script reports success. So the splice
 * is exercised against the REAL file and the result is booted in jsdom to prove
 * the table still parses and reads back with the coordinates it was given.
 *
 * Nothing is written to deadhead.html here, and OSRM is never contacted.
 * spliceZone() is pure (source text in, source text out), which is what makes
 * this testable at all and a reason not to refactor it into something that
 * writes.
 *
 * The properties worth pinning are the ones a hand-rolled regex gets wrong:
 *   - it edits the zone it was ASKED for and no other,
 *   - it stays inside the named city's block, even when two cities share a
 *     zone name (they are allowed to),
 *   - it does not touch `base`, `p` or `on` while reaching for lat/lng,
 *   - it throws on a name that is not there instead of silently doing nothing.
 *
 * Run: node test/nudge-splice.test.js   (or npm test)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { spliceZone } = require('../scripts/nudge-zones.js');

const SOURCE = path.join(__dirname, '..', '..', 'deadhead.html');
let failures = 0;

function check(name, fn) {
  let pass = false;
  try { pass = !!fn(); } catch (e) { pass = false; }
  if (!pass) { console.error(`FAIL ${name}`); failures++; }
  return pass;
}

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
      window.confirm = () => true;
    },
  });
  await new Promise((r) => setTimeout(r, 90));
  return dom;
}

(async () => {
  const original = fs.readFileSync(SOURCE, 'utf8');
  const base = await bootString(original);
  const A0 = base.window.DH_ACT1;

  // Read the authored tables rather than hardcoding coordinates: a later nudge
  // is meant to change these numbers, and a test that pinned them would have to
  // be edited every time the thing it protects is used.
  const cities = Object.keys(A0.ZONES_BY_CITY);
  const before = {};
  cities.forEach((c) => {
    before[c] = A0.ZONES_BY_CITY[c].map((z) => ({ n: z.n, lat: z.lat, lng: z.lng, base: z.base, p: z.p, on: z.on }));
  });
  base.window.close();

  check('the real file has zones to protect', () => cities.length >= 2);

  // A name that exists in more than one city, if there is one — this is the
  // case a regex over the whole file gets wrong. Austin and Dallas both author
  // a 'Downtown core'.
  const shared = before[cities[0]].map((z) => z.n)
    .filter((n) => cities.slice(1).some((c) => before[c].some((z) => z.n === n)))[0];

  const CITY = cities[0];
  const ZONE = shared || before[CITY][0].n;
  const NEW_LAT = 12.3456, NEW_LNG = -65.4321;

  const patched = spliceZone(original, CITY, ZONE, NEW_LAT, NEW_LNG);
  check('the splice changes something', () => patched !== original);
  check('the splice is a surgical edit, not a rewrite',
    () => Math.abs(patched.length - original.length) < 40);

  const dom = await bootString(patched);
  const ok = check('the spliced file still boots', () => !!dom.window.DH_ACT1);
  if (ok) {
    const A = dom.window.DH_ACT1;
    const get = (c, n) => A.ZONES_BY_CITY[c].filter((z) => z.n === n)[0];
    const z = get(CITY, ZONE);

    check('the named zone moved to the given coordinates',
      () => z.lat === NEW_LAT && z.lng === NEW_LNG);
    check('nothing else about that zone changed', () => {
      const was = before[CITY].filter((x) => x.n === ZONE)[0];
      return z.base === was.base && z.p === was.p && z.on === was.on && z.n === was.n;
    });
    check('every other zone in that city is untouched',
      () => before[CITY].every((was) => {
        if (was.n === ZONE) return true;
        const now = get(CITY, was.n);
        return now.lat === was.lat && now.lng === was.lng;
      }));
    // The isolation that matters: a shared zone name must not drag the other
    // city's zone along with it.
    check('the other cities are untouched, shared names included',
      () => cities.slice(1).every((c) => before[c].every((was) => {
        const now = get(c, was.n);
        return now.lat === was.lat && now.lng === was.lng;
      })));
    if (shared) {
      check('a shared zone name resolved to the right city',
        () => get(cities[1], shared).lat === before[cities[1]].filter((x) => x.n === shared)[0].lat);
    }
    // zonesFor() clones, so the live table must reflect the new coordinate too
    // — that is the path the map and the road baker both read.
    check('the live table reports the new coordinate', () => {
      dom.window.DH.city = CITY;
      A.loadCityTables();
      return A.zones().filter((x) => x.n === ZONE)[0].lat === NEW_LAT;
    });
    dom.window.close();
  }

  // A miss must be loud. Silently returning the source unchanged would mean a
  // typo'd zone name reported "nudged" and moved nothing.
  check('an unknown zone name throws rather than no-ops', () => {
    try { spliceZone(original, CITY, 'No Such Zone', 1, 2); return false; }
    catch (e) { return /not found/.test(e.message); }
  });
  check('an unknown city throws', () => {
    try { spliceZone(original, 'zznowhere', ZONE, 1, 2); return false; }
    catch (e) { return /no ZONES_BY_CITY block/.test(e.message); }
  });

  if (failures) {
    console.error('\n' + failures + ' check(s) failed.');
    process.exit(1);
  }
  console.log('PASS nudge-zones splice (surgical, city-scoped, boots)');
})();
