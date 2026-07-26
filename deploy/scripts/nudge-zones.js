/* Zone-centroid nudger — moves demand zones onto drivable streets.
 *
 * THE PROBLEM IT SOLVES
 * Zone coordinates are neighbourhood centroids placed by hand from street
 * geography. OSRM, which bakes the road geometry, can only route between
 * points on the road network, so it snaps each endpoint to the nearest
 * drivable way first. When a centroid landed in a park, a golf course, the
 * middle of a campus or simply mid-block, that snap moved it — worst cases
 * measured 452 m in Austin and 311 m in Dallas — and the drawn route then
 * visibly started a block or two away from its own map pin.
 *
 * This is NOT a road-thinning artefact. Ramer-Douglas-Peucker preserves the
 * first and last point of every route exactly, and there is a test for that.
 * The endpoints are wrong because the centroids are.
 *
 * WHAT IT DOES
 * Asks OSRM's /nearest service where the closest routable road actually is for
 * every zone in a city, reports the distance, and (with --write) replaces the
 * lat/lng in ZONES_BY_CITY with the snapped coordinate. After that the route
 * OSRM bakes starts exactly where the pin is drawn, because both are now the
 * same point.
 *
 * IT READS THE GAME, NOT A COPY OF THE GAME
 * Same rule as bake-roads.js: the zone table is not duplicated here. The game
 * is booted headlessly in jsdom and the tables are read back through the
 * existing window.DH_ACT1 surface, so this cannot drift from what ships.
 *
 * ORDER OF OPERATIONS — THIS MATTERS
 * Nudging a zone changes a route endpoint, so any geometry already baked for
 * that city is now anchored to the OLD coordinate. Always:
 *
 *   1. node scripts/nudge-zones.js <city> --write
 *   2. node scripts/bake-roads.js  <city> --write
 *
 * The script prints this reminder itself after a successful write.
 *
 * USAGE
 *   node scripts/nudge-zones.js austin                 <- dry run, prints a table
 *   node scripts/nudge-zones.js austin --write         <- edits the game
 *   node scripts/nudge-zones.js all                    <- dry run, every city
 *   node scripts/nudge-zones.js austin --min=25        <- tighter threshold
 *
 * --min is the distance in metres below which a zone is left alone; the
 * default is 40 m, roughly one building's depth, because the coordinates are
 * already quantised to 4 decimal places (~11 m) and moving a centroid by less
 * than that is churn rather than a fix.
 *
 * NETWORK
 * The public OSRM demo server is a donated volunteer service, so requests go
 * out one at a time with a pause between them. A city is a dozen zones, so
 * this takes seconds rather than the couple of minutes a road bake takes. A
 * failed lookup leaves that zone untouched and the run continues; if EVERY
 * lookup fails (offline, or blocked by an allowlist) the script refuses to
 * write anything, so running it without a network cannot damage the file.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const OSRM = 'https://router.project-osrm.org/nearest/v1/driving/';
const PAUSE_MS = 250;
const PRECISION = 4;                 // ~11 m, matching the existing tables
const SOURCE = path.join(__dirname, '..', '..', 'deadhead.html');
const DEPLOY = path.join(__dirname, '..', 'public', 'index.html');

/* spliceZone() is exported and the CLI is guarded, so the splice can be tested
   without a network and without writing to the game — the same arrangement
   bake-roads.js uses, and for the same reason: an edit that produced a
   syntactically broken ZONES_BY_CITY would take the whole game down at parse
   time while the script reported success. */
module.exports = { spliceZone: null };   /* set at the bottom */

const args = process.argv.slice(2);
const WRITE = args.indexOf('--write') >= 0;
const minArg = args.filter((a) => a.indexOf('--min=') === 0)[0];
const MIN_M = minArg ? parseFloat(minArg.slice(6)) : 40;
const target = args.filter((a) => a.indexOf('--') !== 0)[0];

if (!target && require.main === module) {
  console.error('usage: node scripts/nudge-zones.js <city|all> [--write] [--min=metres]');
  process.exit(1);
}

function strip(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '');
}

async function bootGame(html) {
  const dom = new JSDOM(strip(html), {
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
  await new Promise((r) => setTimeout(r, 120));
  return dom.window.DH_ACT1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (v) => Number(v.toFixed(PRECISION));

/* OSRM /nearest answers with the snapped point and the distance to it in
   metres, which is exactly the number worth reporting: it IS the visible gap
   between a pin and the start of its own route line. */
async function nearestRoad(lat, lng) {
  const url = OSRM + lng + ',' + lat + '?number=1';
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM ' + res.status);
  const j = await res.json();
  const w = j.waypoints && j.waypoints[0];
  if (!w || !w.location) throw new Error('no waypoint');
  return { lat: w.location[1], lng: w.location[0], dist: w.distance, name: w.name || '' };
}

/* Replaces the lat/lng of one authored zone in place.
 *
 * Deliberately anchored on the zone's own `n:'...'` key rather than on a line
 * number or an index: zone names are unique within a city (there is a test)
 * and an index would silently rewrite the wrong zone the moment a table gains
 * a row. The search is also scoped to the city's own block, because two cities
 * are allowed to reuse a zone name and Austin/Dallas/Miami all have their own
 * geography with overlapping vocabulary. */
function spliceZone(src, city, name, lat, lng) {
  const cityAt = src.indexOf('\n  ' + city + ':[');
  if (cityAt < 0) throw new Error('no ZONES_BY_CITY block for ' + city);
  const end = src.indexOf('\n  ]', cityAt);
  if (end < 0) throw new Error('unterminated zone block for ' + city);
  const block = src.slice(cityAt, end);
  const key = "{n:'" + name.replace(/'/g, "\\'") + "'";
  const at = block.indexOf(key);
  if (at < 0) throw new Error('zone not found in ' + city + ': ' + name);
  const close = block.indexOf('}', at);
  const entry = block.slice(at, close);
  const patched = entry
    .replace(/lat:\s*-?\d+(\.\d+)?/, 'lat:' + lat)
    .replace(/lng:\s*-?\d+(\.\d+)?/, 'lng:' + lng);
  if (patched === entry) throw new Error('no lat/lng to patch in ' + name);
  return src.slice(0, cityAt) + block.slice(0, at) + patched +
         block.slice(close) + src.slice(end);
}

module.exports.spliceZone = spliceZone;

async function main() {
  const html = fs.readFileSync(SOURCE, 'utf8');
  const A = await bootGame(html);
  const cities = target === 'all' ? Object.keys(A.ZONES_BY_CITY) : [target];

  for (const c of cities) {
    if (!A.ZONES_BY_CITY[c]) {
      console.error('unknown city: ' + c);
      process.exit(1);
    }
  }

  let src = html;
  let asked = 0, failed = 0, moved = 0, kept = 0;
  const rows = [];

  for (const city of cities) {
    for (const z of A.ZONES_BY_CITY[city]) {
      asked++;
      let near = null;
      try {
        near = await nearestRoad(z.lat, z.lng);
      } catch (e) {
        failed++;
        console.warn('  skip ' + city + '/' + z.n + ' — ' + e.message);
        await sleep(PAUSE_MS);
        continue;
      }
      const lat = round(near.lat), lng = round(near.lng);
      const act = near.dist >= MIN_M ? 'nudge' : 'keep';
      rows.push([city, z.n, near.dist.toFixed(0) + ' m', act,
        act === 'nudge' ? lat + ',' + lng : '', near.name].join('\t'));
      if (act === 'nudge') {
        moved++;
        if (WRITE) src = spliceZone(src, city, z.n, lat, lng);
      } else {
        kept++;
      }
      await sleep(PAUSE_MS);
    }
  }

  console.log('city\tzone\tgap\taction\tnew coords\tnearest road');
  rows.forEach((r) => console.log(r));
  console.log('\n' + asked + ' zones checked · ' + moved + ' beyond ' + MIN_M +
    ' m · ' + kept + ' already close · ' + failed + ' lookup failures');

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to apply.');
    return;
  }
  /* Same guard as bake-roads.js: a total network failure must not be able to
     rewrite the file with nothing, or running this offline would quietly
     flatten real coordinates. */
  if (failed === asked) {
    console.error('\nEvery lookup failed — refusing to write.');
    process.exit(1);
  }
  if (!moved) {
    console.log('\nNothing beyond the threshold. File unchanged.');
    return;
  }
  fs.writeFileSync(SOURCE, src);
  fs.copyFileSync(SOURCE, DEPLOY);
  console.log('\nWrote ' + moved + ' zone coordinate(s) to deadhead.html and re-copied to deploy.');
  console.log('NOW RE-BAKE THE ROADS for ' + cities.join(', ') +
    ' — the geometry still in the file is anchored to the old centroids:');
  cities.forEach((c) => console.log('  node scripts/bake-roads.js ' + c + ' --write'));
}

if (require.main === module) main();
