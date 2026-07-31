/* Inter-city road-geometry baker — turns the 5 fixed legs of the city
 * unlock chain (austin->dallas->miami->tampa->orlando->sf) into the
 * INTERCITY_ROADS literal deadhead.html carries inline, so
 * startTransfer()/transferTick() can draw a real driving route for the
 * manufacturer-promo transfer animation instead of a straight dashed line
 * between two city centers.
 *
 * MODELED ON bake-roads.js. Same OSRM call, same iterative Ramer-Douglas-
 * Peucker simplify, same 4-decimal rounding + consecutive-duplicate drop,
 * same "read the game, don't duplicate its data" philosophy (city
 * coordinates are read live off window.DH_ACT1.CITIES via a headless jsdom
 * boot, not retyped here) and the same reasoning for --write existing:
 * pasting a generated block into a multi-thousand-line file by hand is the
 * failure mode this exists to remove. See bake-roads.js's header for the
 * fuller rationale; this one only covers what differs.
 *
 * WHY A MUCH COARSER TOLERANCE. bake-roads.js's intra-city legs are a few
 * km and use SIMPLIFY_M=15 (~11 m, the floor set by 4-decimal-place
 * rounding, and sub-pixel at the zoom the intra-city map draws). These 5
 * legs are 100 to 2,000+ miles — Orlando->SF crosses the entire country —
 * and this is a fixed 15-SECOND animation regardless of real distance
 * (transferplan.md §3), so it does not need highway-ramp fidelity over
 * that distance: nobody can see an 11 m wiggle on a route that crosses
 * three time zones. Keeping SIMPLIFY_M=15 here would leave thousands of
 * points per leg for zero visible gain, the exact bloat bake-roads.js's own
 * header warns about (a real two-city intra-city bake went from 50,295 raw
 * points to 363 KB -> 1.2 MB before that file picked 15 m). SIMPLIFY_M=300
 * is the default here: a few pixels wide at the country-scale zoom
 * fitBounds() lands on for a cross-city hop, and — same two floors
 * bake-roads.js used to justify 15 m — well above the ~11 m quantisation
 * floor from PRECISION rounding, so it is simplifying real shape, not
 * rounding noise. Override with --simplify=N (metres) per run if a specific
 * leg still looks too blocky once it is actually on screen.
 *
 * USAGE
 *   node scripts/bake-intercity-roads.js                 <- dry run, all 5 legs
 *   node scripts/bake-intercity-roads.js --write          <- bake all 5, write
 *   node scripts/bake-intercity-roads.js austin dallas    <- one leg, dry run
 *   node scripts/bake-intercity-roads.js austin dallas --write
 *   node scripts/bake-intercity-roads.js --simplify=250 --write
 *
 * --write splices the result into INTERCITY_ROADS in deadhead.html
 * (merging with whatever legs are already baked there — a per-leg run
 * never clobbers the other 4) and re-copies to deploy/public/index.html so
 * parity holds. Without it, nothing is written and the merged object goes
 * to stdout for inspection.
 *
 * NETWORK
 * Same public OSRM demo server as bake-roads.js, one request at a time with
 * the same polite pause between calls. 5 legs is a few seconds of pauses —
 * this is a small job even fully sequential.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const PAUSE_MS = 350;      // be a good citizen on a donated server
const PRECISION = 4;       // ~11 m — matches bake-roads.js
const M_PER_DEG = 111320;
const SOURCE = path.join(__dirname, '..', '..', 'deadhead.html');
const DEPLOY = path.join(__dirname, '..', 'public', 'index.html');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const simplifyArg = args.find((a) => a.startsWith('--simplify='));
const SIMPLIFY_M = simplifyArg ? Number(simplifyArg.split('=')[1]) : 300;
const legArgs = args.filter((a) => a[0] !== '-');
if (legArgs.length === 1) {
  console.error('usage: node scripts/bake-intercity-roads.js [cityA cityB] [--write] [--simplify=N]');
  console.error('       give BOTH endpoints of a leg, or none to bake all 5.');
  process.exit(1);
}

/* The linear unlock chain. Endpoints are city ids as they appear in CITIES;
   their lat/lon are read live off the running game (readCities(), below),
   never retyped here — see the file header. */
const CHAIN = ['austin', 'dallas', 'miami', 'tampa', 'orlando', 'sf'];
const ALL_LEGS = [];
for (let i = 0; i < CHAIN.length - 1; i++) ALL_LEGS.push([CHAIN[i], CHAIN[i + 1]]);

/* ---- RDP simplify — copied from bake-roads.js; see that file for the
   full derivation of why perpendicular-distance-in-metres, equirectangular
   projection, and an iterative (not recursive) stack. ---- */
function perpDist(p, a, b, cosLat) {
  const ax = a[1] * cosLat * M_PER_DEG, ay = a[0] * M_PER_DEG;
  const bx = b[1] * cosLat * M_PER_DEG, by = b[0] * M_PER_DEG;
  const px = p[1] * cosLat * M_PER_DEG, py = p[0] * M_PER_DEG;
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function simplify(pts, tolM) {
  if (pts.length < 3) return pts.slice();
  const cosLat = Math.cos(pts[0][0] * Math.PI / 180);
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    let worst = -1, wi = -1;
    for (let k = a + 1; k < b; k++) {
      const d = perpDist(pts[k], pts[a], pts[b], cosLat);
      if (d > worst) { worst = d; wi = k; }
    }
    if (worst > tolM) { keep[wi] = true; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* Boot the game headlessly and read CITIES back out of it — same jsdom
   shim as bake-roads.js's readCityTables() and test/boot-smoke.test.js. */
async function readCities() {
  const raw = fs.readFileSync(SOURCE, 'utf8')
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '');
  const dom = new JSDOM(raw, {
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
  await sleep(80);
  const w = dom.window;
  if (!w.DH_ACT1) throw new Error('DH_ACT1 missing — deadhead.html did not boot');
  const CITIES = w.DH_ACT1.CITIES;
  dom.window.close();
  return CITIES;
}

async function route(a, b) {
  // OSRM wants lon,lat — the opposite order to everything in the game.
  const url = `${OSRM}${a.lon},${a.lat};${b.lon},${b.lat}` +
              '?overview=full&geometries=geojson';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.code !== 'Ok' || !j.routes || !j.routes[0]) {
    throw new Error(`OSRM said ${j.code || 'nothing usable'}`);
  }
  const coords = j.routes[0].geometry.coordinates;   // [lon,lat] pairs
  if (!Array.isArray(coords) || coords.length < 2) throw new Error('empty geometry');
  const out = [];
  let prev = null;
  for (const [lon, lat] of coords) {
    const la = +lat.toFixed(PRECISION), ln = +lon.toFixed(PRECISION);
    if (prev && prev[0] === la && prev[1] === ln) continue;
    out.push([la, ln]);
    prev = [la, ln];
  }
  const raw = out.length;
  const simplified = SIMPLIFY_M > 0 ? simplify(out, SIMPLIFY_M) : out;
  return { raw, simplified };
}

/* Find the `{...}` span of `const INTERCITY_ROADS=` by brace-depth, not by
   assuming a particular formatting — works whether the object is the
   committed empty `{}` or a fully expanded multi-line literal. Safe to
   ignore square brackets entirely: every value is a flat number array, so
   only curly braces ever nest. */
const MARKER = 'let INTERCITY_ROADS=';
function objSpan(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(marker + ' not found in deadhead.html');
  const openBrace = src.indexOf('{', start);
  let depth = 0, i = openBrace;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) throw new Error('unbalanced braces reading ' + marker);
  return { start, openBrace, end: i };
}

function parseExisting(src) {
  const span = objSpan(src, MARKER);
  const text = src.slice(span.openBrace, span.end);
  try {
    // eslint-disable-next-line no-new-func
    return (new Function('return (' + text + ')'))();
  } catch (e) {
    throw new Error('could not parse the existing INTERCITY_ROADS: ' + e.message);
  }
}

function splice(src, block) {
  const span = objSpan(src, MARKER);
  return src.slice(0, span.openBrace) + block + src.slice(span.end);
}

function formatBlock(obj) {
  const keys = Object.keys(obj).sort();
  if (!keys.length) return '{}';
  const body = keys.map((k) => `  '${k}':[${obj[k].join(',')}]`).join(',\n');
  return '{\n' + body + '\n}';
}

async function main() {
  const CITIES = await readCities();

  let legs = ALL_LEGS;
  if (legArgs.length === 2) {
    const [x, y] = legArgs;
    if (!CITIES[x] || !CITIES[y]) {
      throw new Error(`unknown city in "${x} ${y}" — CITIES has: ` +
        Object.keys(CITIES).join(', '));
    }
    legs = [[x, y]];
  }

  const src = fs.readFileSync(SOURCE, 'utf8');
  const existing = parseExisting(src);
  const baked = Object.assign({}, existing);

  console.error(`${legs.length} leg(s) to route, ${SIMPLIFY_M} m simplify tolerance\n`);

  let done = 0, failed = 0, rawTotal = 0, outTotal = 0;
  for (const [x, y] of legs) {
    const [a, b] = x < y ? [x, y] : [y, x];
    const ca = CITIES[a], cb = CITIES[b];
    if (!ca || !cb) { console.error(`  skip ${a}|${b} — unknown city`); failed++; continue; }
    try {
      const { raw, simplified } = await route(
        { n: a, lat: ca.lat, lon: ca.lon }, { n: b, lat: cb.lat, lon: cb.lon });
      baked[`${a}|${b}`] = [];
      for (const [la, ln] of simplified) baked[`${a}|${b}`].push(la, ln);
      rawTotal += raw; outTotal += simplified.length;
      done++;
      console.error(`  ${a}|${b}: ${raw} -> ${simplified.length} points`);
    } catch (e) {
      failed++;
      console.error(`  skip ${a}|${b} — ${e.message}`);
    }
    await sleep(PAUSE_MS);
  }

  console.error(`\nbaked ${done}, skipped ${failed}` +
    (outTotal ? `, ${rawTotal} -> ${outTotal} points ` +
      `(${(rawTotal / (outTotal || 1)).toFixed(1)}x smaller)` : ''));

  const block = formatBlock(baked);

  if (!WRITE) {
    console.error('\nDRY RUN — nothing written. Add --write to apply.\n');
    process.stdout.write(block + '\n');
    return;
  }

  if (!done && !Object.keys(existing).length) {
    // Same refusal bake-roads.js makes: writing nothing over nothing is not
    // useful, and if every request failed the likeliest cause is "no
    // network", which is exactly the case where clobbering the file is worst.
    console.error('refusing to write: nothing baked and nothing existing to keep.');
    process.exit(1);
  }

  const after = splice(src, block);
  fs.writeFileSync(SOURCE, after, 'utf8');
  fs.copyFileSync(SOURCE, DEPLOY);
  console.error(`wrote ${path.basename(SOURCE)} (${src.length} -> ${after.length} bytes)`);
  console.error('copied to deploy/public/index.html');
  console.error('\nnow run: npm test');
}

module.exports = { simplify, objSpan, splice, formatBlock };

if (require.main === module) {
  main().catch((e) => {
    console.error('bake failed:', e.message);
    process.exit(1);
  });
}
