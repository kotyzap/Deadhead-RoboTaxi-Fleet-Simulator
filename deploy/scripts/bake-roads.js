/* Road-geometry baker — turns a city's zone + charger tables into the
 * ROADS_BY_CITY[city] literal that deadhead.html carries inline.
 *
 * WHY THIS EXISTS
 * Austin's 68 routes were pasted in by hand. That was survivable exactly once.
 * A second city is another ~110 origin/destination pairs, and every city after
 * it is another ~110, so the choice was "write a script" or "spend an afternoon
 * transcribing coordinates and introduce a typo nobody would ever find".
 *
 * IT READS THE GAME, NOT A COPY OF THE GAME
 * The zone and charger lists are not duplicated here. This script boots
 * deadhead.html headlessly in jsdom and reads them back out through the
 * existing window.DH_ACT1 test surface (zonesFor / CHARGERS_BY_CITY), so the
 * geometry is always baked against the coordinates the game actually ships. If
 * you move a zone, re-run this; you cannot get a stale mismatch.
 *
 * WHAT IT PRODUCES
 * A single JavaScript object literal on stdout, in the exact format and key
 * convention the file already uses:
 *
 *   'From|To':[lat,lng,lat,lng,...]
 *
 * with endpoints sorted alphabetically (roadKey() looks routes up in one
 * direction and reverses the array for the other), charger names prefixed
 * 'CH:' so a zone and a Supercharger sharing a name cannot collide, and
 * coordinates rounded to 4 decimal places — about 11 m, which is well under
 * the width of the road being drawn and roughly halves the byte count.
 *
 * CHARGER-TO-CHARGER PAIRS ARE SKIPPED ON PURPOSE. A car drives zone->zone,
 * zone->charger and charger->zone. It never drives charger->charger, so baking
 * those 10-ish routes would add bytes nothing can ever draw. Austin's 68 is
 * exactly (zone x zone) + (zone x charger).
 *
 * THE GEOMETRY IS COSMETIC. This must stay true. ROADS feeds roadPath() which
 * feeds map drawing only; distances, fares, energy and time all come from
 * dist() on straight lines. Baking a longer, more realistic road must never
 * become a source of truth for the economy, or every route added here quietly
 * re-tunes the game. See citiesplan.md.
 *
 * USAGE
 *   node scripts/bake-roads.js dallas --write     <- normal case: edits the game
 *   node scripts/bake-roads.js dallas             <- dry run, prints to stdout
 *
 * --write splices the block straight into ROADS_BY_CITY in deadhead.html
 * (replacing that city's existing block if there is one) and re-copies to
 * deploy/public/index.html so parity holds. Without it, nothing is written and
 * the literal goes to stdout for inspection.
 *
 * The first version of this script only ever printed, on the assumption that
 * pasting a generated block into a 6,000-line file is a small job. It is not:
 * it is 14 KB of coordinates going into one specific nested object, and the
 * obvious failure mode is running the bake, seeing it succeed, and never
 * getting the output into the game at all. Hence --write.
 *
 * NETWORK
 * Uses the public OSRM demo server, which is a free volunteer service: this
 * script therefore requests ONE route at a time with a deliberate pause
 * between calls rather than firing 110 requests in parallel. A full city takes
 * a couple of minutes. That is the polite cost of not running your own OSRM.
 * If a request fails the pair is skipped with a warning and the rest continue —
 * a missing pair is a supported state in the game (roadPath() returns null and
 * the caller falls back to a straight line), so a partial bake is still usable.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const PAUSE_MS = 350;   // be a good citizen on a donated server
const PRECISION = 4;    // ~11 m
const SOURCE = path.join(__dirname, '..', '..', 'deadhead.html');

/* Simplification tolerance in metres. Ramer-Douglas-Peucker, applied to every
 * route before it is written.
 *
 * WHY THIS IS NOT OPTIONAL. OSRM's overview=full returns every geometry vertex
 * it has, including the curvature of a highway ramp. The first full bake of two
 * cities produced 50,295 points across 224 routes — an average of 225 points
 * per route — and took deadhead.html from 363 KB to 1.2 MB, at which point 71%
 * of the entire game was road geometry it could not visibly use.
 *
 * WHY 15 m. Two independent floors happen to agree. Coordinates are already
 * rounded to PRECISION=4 decimal places, i.e. quantised to about 11 m, so any
 * tolerance below that is simplifying rounding noise rather than real shape.
 * And at the zoom this map draws (12-13) one screen pixel covers roughly
 * 20-40 m at these latitudes, so 15 m of deviation cannot be seen. Measured on
 * the real two-city bake, 15 m removes 90% of the points.
 *
 * SAFE BECAUSE THE GEOMETRY IS COSMETIC. RDP always keeps the first and last
 * point, so endpoints stay exact, and nothing in the economy reads these lines
 * (see the header). If ROADS ever became a distance source this constant would
 * silently start changing fares — which is one more reason it must not.
 */
const SIMPLIFY_M = 15;
const M_PER_DEG = 111320;

/* Perpendicular distance from p to segment a-b, in metres. Equirectangular
   projection around the local latitude: over a few km of city street this is
   indistinguishable from a proper geodesic and far cheaper. */
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

/* Iterative RDP — a recursive one would be fine at these sizes, but a loop
   cannot blow the stack on a pathological route. */
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

/* Requirable as a module so test/bake-splice.test.js can exercise splice()
   against the real deadhead.html without needing OSRM. Nothing below the
   require.main guard runs on require. */
module.exports = { splice: null, simplify: null };   /* set at the bottom */

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
/* --thin re-simplifies the geometry ALREADY in deadhead.html and exits. No
   network, no re-bake. This exists because the first two-city bake landed
   before SIMPLIFY_M did, so there is one real file out there carrying 50,295
   unsimplified points; running the bake again would work but would spend four
   minutes of a donated OSRM server's time to produce the same coordinates. */
const THIN = args.includes('--thin');
const city = (args.filter((a) => a[0] !== '-')[0] || '').trim();
if (!city && !args.includes('--thin') && require.main === module) {
  console.error('usage: node scripts/bake-roads.js <city-id> [--write]');
  console.error('       (the key as it appears in CITIES, e.g. austin, dallas)');
  console.error('       --write splices the result into deadhead.html and deploy/public/index.html');
  process.exit(1);
}
const DEPLOY = path.join(__dirname, '..', 'public', 'index.html');

/* Splice a generated `  <city>:{ ... }` block into ROADS_BY_CITY.
 *
 * Line-based rather than a brace-matching parse, because the thing being
 * matched is machine-generated with a known shape: the city key sits at two
 * spaces of indent and its block ends at the first later line that is exactly
 * '  }' or '  },'. A regex spanning nested braces would be the fragile choice
 * here, not the robust one. */
function splice(src, cityId, block) {
  const open = src.indexOf('const ROADS_BY_CITY={');
  if (open < 0) throw new Error('ROADS_BY_CITY not found in deadhead.html');
  const close = src.indexOf('\n};', open);
  if (close < 0) throw new Error('could not find the end of ROADS_BY_CITY');

  const head = src.slice(0, open);
  const table = src.slice(open, close);
  const tail = src.slice(close);

  const lines = table.split('\n');
  const start = lines.findIndex((l) => l === `  ${cityId}:{`);

  if (start >= 0) {
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i] === '  }' || lines[i] === '  },') { end = i; break; }
    }
    if (end < 0) throw new Error(`found ${cityId}: but not the end of its block`);
    // Preserve whatever separator the old block ended with, so the object
    // stays syntactically valid whether or not this was the last city.
    const trailingComma = lines[end].endsWith(',');
    const fresh = block.replace(/\n$/, '').split('\n');
    if (trailingComma) fresh[fresh.length - 1] += ',';
    lines.splice(start, end - start + 1, ...fresh);
    console.error(`replaced the existing ${cityId} block`);
  } else {
    // New city: append after the last block, which needs a comma adding to it.
    let last = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i] === '  }') { last = i; break; }
    }
    if (last < 0) throw new Error('could not find a block to append after');
    lines[last] = '  },';
    lines.splice(last + 1, 0, ...block.replace(/\n$/, '').split('\n'));
    console.error(`inserted a new ${cityId} block`);
  }
  return head + lines.join('\n') + tail;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* Re-simplify every route already present in the file. Operates on the text,
   pair by pair, so it cannot disturb anything outside a coordinate array. */
function thinInPlace() {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const open = src.indexOf('const ROADS_BY_CITY={');
  const close = src.indexOf('\nfunction roadsFor', open);
  if (open < 0 || close < 0) throw new Error('ROADS_BY_CITY not found');
  let before = 0, after = 0, routes = 0;
  const table = src.slice(open, close).replace(
    /('[^']+\|[^']+':)\[([^\]]*)\]/g,
    (whole, key, nums) => {
      const f = nums.split(',').map(Number);
      if (f.length < 4 || f.some(Number.isNaN)) return whole;
      const pts = [];
      for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1]]);
      const thin = simplify(pts, SIMPLIFY_M);
      before += pts.length; after += thin.length; routes++;
      const flat = [];
      for (const [la, ln] of thin) flat.push(la, ln);
      return key + '[' + flat.join(',') + ']';
    });
  const out = src.slice(0, open) + table + src.slice(close);
  console.error(`${routes} routes: ${before} -> ${after} points ` +
                `(${(before / (after || 1)).toFixed(1)}x)`);
  if (!WRITE) {
    console.error('DRY RUN — nothing written. Add --write to apply.');
    return;
  }
  fs.writeFileSync(SOURCE, out, 'utf8');
  fs.copyFileSync(SOURCE, DEPLOY);
  console.error(`wrote deadhead.html (${src.length} -> ${out.length} bytes)`);
  console.error('copied to deploy/public/index.html');
  console.error('\nnow run: npm test');
}

/* Boot the game headlessly and read the real tables out of it. Mirrors the
 * stripping and matchMedia shim in test/boot-smoke.test.js — same reasons,
 * documented there. */
async function readCityTables(cityId) {
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
  if (!w.DH_ACT1.CITIES[cityId]) {
    throw new Error(`unknown city "${cityId}" — CITIES has: ` +
      Object.keys(w.DH_ACT1.CITIES).join(', '));
  }
  const zones = w.DH_ACT1.zonesFor(cityId).map((z) => ({ n: z.n, lat: z.lat, lng: z.lng }));
  const chargers = (w.DH_ACT1.CHARGERS_BY_CITY[cityId] || [])
    .map((c) => ({ n: 'CH:' + c.n, lat: c.lat, lng: c.lng }));
  dom.window.close();
  return { zones, chargers };
}

async function route(a, b) {
  // OSRM wants lon,lat — the opposite order to everything in the game.
  const url = `${OSRM}${a.lng},${a.lat};${b.lng},${b.lat}` +
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
    // Rounding can make neighbouring vertices identical; a duplicate point is
    // pure weight and pathAt() would compute a zero-length segment for it.
    if (prev && prev[0] === la && prev[1] === ln) continue;
    out.push([la, ln]);
    prev = [la, ln];
  }
  // Rounding first, then simplifying: RDP on already-quantised points cannot
  // be fooled into keeping a vertex that only differs by rounding noise.
  rawPoints += out.length;
  return SIMPLIFY_M > 0 ? simplify(out, SIMPLIFY_M) : out;
}
let rawPoints = 0;

async function main() {
  const { zones, chargers } = await readCityTables(city);
  if (!zones.length) {
    console.error(`city "${city}" has no zones — nothing to bake`);
    process.exit(1);
  }
  console.error(`${city}: ${zones.length} zones, ${chargers.length} chargers`);

  // zone x zone, plus zone x charger. Never charger x charger — see the header.
  const pairs = [];
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) pairs.push([zones[i], zones[j]]);
    for (const c of chargers) pairs.push([zones[i], c]);
  }
  console.error(`${pairs.length} pairs to route (~${Math.ceil(pairs.length * PAUSE_MS / 1000)}s)\n`);

  const baked = {};
  let done = 0, failed = 0;
  for (const [x, y] of pairs) {
    // Key endpoints alphabetically: roadKey() stores one direction and
    // reverses the array for the other.
    const [a, b] = x.n < y.n ? [x, y] : [y, x];
    try {
      baked[`${a.n}|${b.n}`] = await route(a, b);
      done++;
    } catch (e) {
      failed++;
      console.error(`  skip ${a.n} | ${b.n} — ${e.message}`);
    }
    if ((done + failed) % 10 === 0) {
      console.error(`  ${done + failed}/${pairs.length}`);
    }
    await sleep(PAUSE_MS);
  }

  const keys = Object.keys(baked).sort();
  let points = 0;
  const body = keys.map((k) => {
    const flat = [];
    for (const [la, ln] of baked[k]) { flat.push(la, ln); }
    points += baked[k].length;
    return `    '${k}':[${flat.join(',')}]`;
  }).join(',\n');

  const saved = rawPoints ? (rawPoints / points) : 1;
  console.error(`\nbaked ${done} pairs, ${failed} skipped, ${points} points`);
  if (SIMPLIFY_M > 0 && rawPoints > points) {
    console.error(`simplified at ${SIMPLIFY_M} m: ${rawPoints} -> ${points} points ` +
                  `(${saved.toFixed(1)}x smaller, endpoints exact)`);
  }

  const block = `  ${city}:{\n${body}\n  }\n`;

  if (!WRITE) {
    console.error('DRY RUN — nothing written. Re-run with --write to splice this in,');
    console.error('or redirect stdout if you want to inspect it first.\n');
    process.stdout.write(block);
    return;
  }

  if (!done) {
    // Writing an empty block would replace real geometry with nothing, and the
    // most likely reason `done` is 0 is that the network was unavailable —
    // i.e. exactly the case where clobbering the file is worst.
    console.error('refusing to write: every route failed, so there is nothing to save.');
    process.exit(1);
  }

  const before = fs.readFileSync(SOURCE, 'utf8');
  const after = splice(before, city, block);
  fs.writeFileSync(SOURCE, after, 'utf8');
  fs.copyFileSync(SOURCE, DEPLOY);
  console.error(`wrote ${path.basename(SOURCE)} (${before.length} -> ${after.length} bytes)`);
  console.error('copied to deploy/public/index.html');
  console.error('\nnow run: npm test');
}

module.exports.splice = splice;
module.exports.simplify = simplify;

if (require.main === module && THIN) {
  try { thinInPlace(); } catch (e) {
    console.error('thin failed:', e.message); process.exit(1);
  }
} else if (require.main === module) {
  main().catch((e) => {
    console.error('bake failed:', e.message);
    process.exit(1);
  });
}
