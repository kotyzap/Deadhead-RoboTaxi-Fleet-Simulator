/* Admin page + admin API test (adminplan.md §7).
 *
 * WHAT THIS PROTECTS
 *
 * The admin is the one surface nobody plays, so nothing else notices when it
 * breaks. Five specific failures are asserted below, all of which either had
 * happened or were one edit away:
 *
 *   1. A COLUMN THE WORKER INSERTS BUT THE SCHEMA DOES NOT CREATE. This is
 *      not hypothetical: `models TEXT` was missing its trailing comma, and
 *      because SQLite lets a column type be several words, CREATE TABLE
 *      silently produced ONE column called `models` of type "TEXT ...
 *      achv TEXT" and no `achv` column at all. Any database created fresh
 *      from schema.sql could not accept a single telemetry row. The live one
 *      escaped only because achv had been added to it by ALTER TABLE.
 *      So: execute schema.sql for real, then check every column named in
 *      every INSERT the Worker performs actually exists.
 *   2. AN INSERT WHOSE COLUMN / PLACEHOLDER / ARGUMENT COUNTS DISAGREE. The
 *      stats INSERT names 32 columns; adding three geo columns to it is
 *      exactly the edit that leaves a `?` behind.
 *   3. A CITY ID THE LABEL RULE GETS WRONG. cityLabel() title-cases the id,
 *      which was right for five cities and gave "Sf" for San Francisco for
 *      several releases. Every id in the game's CITIES must resolve to that
 *      city's own display name.
 *   4. SORTING THAT SORTS AS STRINGS. '$1,200' above '$900', and NULLs
 *      winning an ascending sort so every legacy row floats to the top.
 *   5. THE CARS VIEW QUIETLY LOSING ITS RADAR. Pavel asked for that section
 *      to be kept as-is; a later refactor of this page should fail here
 *      rather than silently flatten it.
 *
 * Plus the free-tier invariant: NO INDEX on stats(country). An index counts
 * as a written row on every insert that touches the column, and the admin's
 * country aggregate full-scans regardless — see the idx_stats_ts post-mortem
 * in schema.sql. That is a design decision, so it gets a test, not just a
 * comment.
 *
 * Run: node test/admin.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const GAME = path.join(__dirname, '..', '..', 'deadhead.html');
const WORKER = path.join(__dirname, '..', 'src', 'index.js');
const ADMIN = path.join(__dirname, '..', 'public', 'admin.html');
const SCHEMA = path.join(__dirname, '..', 'schema.sql');

const game = fs.readFileSync(GAME, 'utf8');
const worker = fs.readFileSync(WORKER, 'utf8');
const admin = fs.readFileSync(ADMIN, 'utf8');
const schema = fs.readFileSync(SCHEMA, 'utf8');

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
}
function eq(actual, expected, label) {
  const good = actual === expected;
  console.log((good ? '  ok   ' : '  FAIL ') + label);
  if (!good) {
    console.log('         expected: ' + JSON.stringify(expected));
    console.log('         actual:   ' + JSON.stringify(actual));
    fails++;
  }
}

/* ============================================================
   1. schema.sql really creates the columns the Worker writes
   ============================================================ */
console.log('\nschema vs the Worker\'s INSERTs');

const db = new DatabaseSync(':memory:');
db.exec(schema);
function columnsOf(table) {
  return db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((r) => r.name);
}
const statsCols = columnsOf('stats');
const usersCols = columnsOf('users');

ok(statsCols.length > 0, 'schema.sql executes and creates `stats`');

/* Pull every "INSERT INTO <table> ( ... ) VALUES ( ... )" out of the Worker
   and check it against the table the schema actually built. */
const inserts = [...worker.matchAll(/INSERT INTO (\w+)\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/g)];
ok(inserts.length >= 2, 'found the stats and users INSERTs in the Worker');

for (const m of inserts) {
  const table = m[1];
  const cols = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  /* Count VALUE EXPRESSIONS, not '?' — login_attempts legitimately writes a
     literal (`VALUES (?, 1, ?)`), and a test that banned that would be
     policing style rather than catching the bug it is here for. */
  const values = m[3].split(',').map((s) => s.trim()).filter(Boolean);
  const have = table === 'stats' ? statsCols : table === 'users' ? usersCols : columnsOf(table);
  const missing = cols.filter((c) => !have.includes(c));
  eq(missing.join(','), '', `INSERT INTO ${table}: every column exists in schema.sql`);
  eq(values.length, cols.length,
    `INSERT INTO ${table}: ${cols.length} columns, ${values.length} values`);
}

/* The bound-argument count has to match too, and that is the one the regex
   above cannot see. Counted structurally: from the end of the INSERT's
   .prepare(...) to the matching .run(), commas at depth 0 inside .bind(). */
function bindArgCount(src, fromIndex) {
  const bindAt = src.indexOf('.bind(', fromIndex);
  if (bindAt === -1) return null;
  let i = bindAt + '.bind('.length, depth = 0, args = 1, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) args++;
  }
  return args;
}
const statsInsertAt = worker.indexOf('INSERT INTO stats');
const statsCols2 = inserts.find((m) => m[1] === 'stats')[2]
  .split(',').map((s) => s.trim()).filter(Boolean);
eq(bindArgCount(worker, statsInsertAt), statsCols2.length,
  `stats INSERT binds ${statsCols2.length} arguments, one per column`);

/* The geo columns specifically — the point of the whole change. */
['country', 'region', 'tz'].forEach((c) => {
  ok(statsCols.includes(c), `stats.${c} exists`);
  ok(statsCols2.includes(c), `the stats INSERT writes ${c}`);
});
ok(usersCols.includes('country'), 'users.country exists');
ok(/edgeGeo\s*\(/.test(worker), 'edgeGeo() exists');
ok(/request\.cf/.test(worker), 'geo is read from request.cf, not from the request body');
/* The client must not be able to claim its own country: the value bound into
   the INSERT has to come from edgeGeo(request), never from `body`. */
const geoBind = worker.match(/geo\.country,\s*geo\.region,\s*geo\.tz/);
ok(!!geoBind, 'the INSERT binds geo.* (edge-derived), not body.country');
ok(!/clampStr\(body\.(country|region|tz)/.test(worker),
  'no code path takes country/region/tz from the client payload');

/* ============================================================
   2. the free-tier invariant: no index on the geo columns
   ============================================================ */
console.log('\nfree-tier write budget');
const indexes = db.prepare(
  `SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`
).all();
const geoIndexed = indexes.filter((i) => /stats/i.test(i.sql) && /\b(country|region|tz)\b/i.test(i.sql));
eq(geoIndexed.length, 0,
  'NO index on stats(country/region/tz) — an index is a written row per insert');
ok(!/CREATE\s+INDEX[^;]*idx_stats_ts/i.test(schema),
  'idx_stats_ts is still gone (dropped for the same reason)');
ok(indexes.some((i) => /idx_stats_player/.test(i.name)),
  'idx_stats_player is still there — a real point lookup, worth its write');

/* ============================================================
   3. city labels: every game city resolves to its own name
   ============================================================ */
console.log('\ncity labels');

/* CITIES in the game is the authority. Read the id -> name pairs straight
   out of it rather than writing them down here, which would just be a fourth
   copy with the same drift problem. */
const citiesBlock = game.slice(game.indexOf('const CITIES={'));
const cityPairs = [...citiesBlock.matchAll(/^\s{2}(\w+):\{name:'([^']+)'/gm)].map((m) => [m[1], m[2]]);
ok(cityPairs.length >= 6, `found ${cityPairs.length} cities in deadhead.html's CITIES`);

/* Lift cityLabel() + its CITY_LABEL table out of admin.html and run them. */
function lift(name, src) {
  const at = src.indexOf('function ' + name + '(');
  if (at === -1) throw new Error('could not find function ' + name + ' in admin.html');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(at, i + 1);
}
const cityLabelTable = admin.match(/var CITY_LABEL = \{[^}]*\};/)[0];
// eslint-disable-next-line no-new-func
const cityLabel = new Function(cityLabelTable + lift('cityLabel', admin) + 'return cityLabel;')();

for (const [id, name] of cityPairs) {
  eq(cityLabel(id), name, `cityLabel('${id}') is "${name}"`);
}
eq(cityLabel('newcity'), 'Newcity',
  'an unknown id still title-cases, so city #7 needs no edit here');
eq(cityLabel('san-diego'), 'San Diego', 'hyphenated ids title-case both words');

/* ============================================================
   4. sorting
   ============================================================ */
console.log('\nsorting');
const cmpVals = new Function(lift('cmpVals', admin) + 'return cmpVals;')();

ok(cmpVals(1200, 900, 'num') > 0, '1200 sorts above 900 as numbers');
ok(cmpVals('1200', '900', 'num') > 0, 'numeric strings compare as numbers, not as text');
eq(cmpVals(5, 5, 'num'), 0, 'equal numbers tie');
ok(cmpVals(1e12, 9e11, 'ts') > 0, 'timestamps compare chronologically');

// NULLs last in BOTH directions — the whole point.
ok(cmpVals(null, 5, 'num') > 0, 'null sorts after a number ascending');
ok(cmpVals(5, null, 'num') < 0, 'a number sorts before null ascending');
ok(cmpVals(null, -9e9, 'num') > 0, 'null is not treated as a small number');
eq(cmpVals(null, null, 'num'), 0, 'two nulls tie');
ok(cmpVals('', 5, 'num') > 0, 'empty string is treated as missing, like null');

/* A DESCENDING sort must not flip nulls to the top. This is asserted against
   the page's REAL sorter, not a re-implementation of it here: the first
   version of this test rebuilt the comparison as `dir * cmpVals(...)` and
   passed while the page did the same wrong thing. Lift visibleRows() and run
   it. */
const visibleRows = new Function(
  lift('cmpVals', admin) + lift('sortValue', admin) + lift('visibleRows', admin) +
  'return visibleRows;'
)();
const numCol = { key: 'v', label: 'V', type: 'num' };
const rows = [{ v: 3 }, { v: null }, { v: 10 }, { v: 1 }];
function sortedBy(dir) {
  return visibleRows({ rows: rows, cols: [numCol], sortKey: 'v', sortDir: dir, filter: '' })
    .map((r) => r.v);
}
eq(JSON.stringify(sortedBy('desc')), JSON.stringify([10, 3, 1, null]),
  'descending: 10,3,1,null — null stays last');
eq(JSON.stringify(sortedBy('asc')), JSON.stringify([1, 3, 10, null]),
  'ascending: 1,3,10,null — null STILL last, not first');

/* Filtering matches DISPLAYED text, so a row holding `sf` is found by typing
   "San Francisco". */
const cityCol = { key: 'city', label: 'City', type: 'text', fmt: (v) => cityLabel(v) };
const cityRows = [{ city: 'sf' }, { city: 'austin' }];
eq(visibleRows({ rows: cityRows, cols: [cityCol], sortKey: null, filter: 'san fran' }).length, 1,
  'filtering by "san fran" finds the row that only holds `sf`');
eq(visibleRows({ rows: cityRows, cols: [cityCol], sortKey: null, filter: 'zzz' }).length, 0,
  'a filter that matches nothing returns nothing');

ok(cmpVals('austin', 'Dallas', 'text') < 0, 'text sorts case-insensitively');

/* Every column in the page declares a type the comparator understands —
   a typo'd type silently falls back to string sorting, which is the bug. */
/* Anchored on `label:` so this only sees COLUMN declarations — a bare
   /type:'(\w+)'/ also matched Intl.DisplayNames({type:'region'}). */
const declaredTypes = [...admin.matchAll(/label:'[^']*',\s*type:'(\w+)'/g)].map((m) => m[1]);
const badTypes = [...new Set(declaredTypes)].filter((t) => !['text', 'num', 'ts'].includes(t));
eq(badTypes.join(','), '', 'every column type is text|num|ts');
ok(declaredTypes.length > 40, `${declaredTypes.length} typed columns across the page`);

/* ============================================================
   5. money formatting
   ============================================================ */
console.log('\nformatting');
const money = new Function(lift('money', admin) + 'return money;')();
eq(money(1200), '$1200', 'positive money');
eq(money(-300), '-$300', 'a loss reads as -$300, not $-300');
eq(money(null), '—', 'null money is an em dash, not $0');
eq(money(0), '$0', 'zero is a real zero');

/* ============================================================
   6. the views the page asks for are the views the Worker serves
   ============================================================ */
console.log('\nviews');
const navViews = [...admin.matchAll(/data-view="(\w+)"/g)].map((m) => m[1]);
const renderers = admin.match(/const RENDERERS = \{([\s\S]*?)\};/)[1];
for (const v of navViews) {
  ok(new RegExp('\\b' + v + ':').test(renderers), `nav view "${v}" has a renderer`);
  ok(new RegExp("view === '" + v + "'").test(worker) || v === 'dashboard',
    `nav view "${v}" is handled by the Worker`);
}
ok(/view === 'dashboard'/.test(worker), 'the Worker serves view=dashboard');
ok(/view === 'geo'/.test(worker), 'the Worker serves view=geo');
eq(navViews[0], 'dashboard', 'the dashboard is the first (landing) view');

/* THE GATE MUST PROBE THE OLDEST VIEW, NOT THE NEWEST.
   It probed `dashboard` for a few hours, which made the ability to log in
   depend on the newest server code being deployed: against a Worker that
   predates that view, a correct password gets "unknown view" at the gate and
   there is no way past it. Authentication must not be coupled to a feature. */
ok(/await api\('players'\)/.test(admin),
  'the gate probes `players` — the view that has always existed');
ok(!/await api\('dashboard'\)/.test(admin),
  'the gate does NOT probe the newest view');

/* A 404 means either "bad credentials" or "no Worker here", and the server
   will not say which. The page has to narrow it down or the operator is stuck
   guessing — which is exactly what happened. */
ok(/function diagnose404/.test(admin), 'a 404 is diagnosed, not just reported');
ok(/'\/api\/params'/.test(admin),
  'the diagnosis probes the public /api/params endpoint');
ok(/admin-config\.js/.test(admin),
  'the credentials message names the file the pair lives in');
ok(/wrangler deploy/.test(admin),
  'and says the pair is bundled at deploy time — the actual trap');
ok(/location\.origin/.test(admin),
  'the message names the origin, so a wrong host is visible');

/* The dashboard must be ONE round trip. Ten sequential awaits would work and
   be slow for no reason; batch() is the whole design. */
const dashBlock = worker.slice(worker.indexOf("view === 'dashboard'"));
const dashEnd = dashBlock.indexOf('return bad(\'unknown view\')');
const dash = dashBlock.slice(0, dashEnd > 0 ? dashEnd : 12000);
ok(/env\.DB\.batch\(/.test(dash), 'the dashboard uses env.DB.batch() — one round trip');
eq((dash.match(/await /g) || []).length, 1, 'the dashboard awaits exactly once');

/* Every TOP 5 the page reads must be a key the Worker actually returns. */
const served = new Set([...dash.matchAll(/^\s{10}(\w+): rows\(\d+\)/gm)].map((m) => m[1]));
const consumed = [...admin.matchAll(/t\.(\w+)\s*\|\|\s*\[\]/g)].map((m) => m[1]);
for (const k of [...new Set(consumed)]) {
  ok(served.has(k), `dashboard card "${k}" is served by the Worker`);
}
eq([...new Set(consumed)].length, served.size,
  `all ${served.size} served TOP 5 lists are rendered — none is dead payload`);

/* ============================================================
   7. the Cars view is intact (Pavel: "keep those cars stats")
   ============================================================ */
console.log('\ncars view is intact');
ok(/function hexRadar\(/.test(admin), 'hexRadar() is still there');
ok(/var AXIS_COLORS = \[/.test(admin), 'AXIS_COLORS is still there');
eq((admin.match(/var AXIS_COLORS = \[([^\]]*)\]/)[1].match(/#/g) || []).length, 6,
  'six axis colours, one per axis');
ok(/axisLegendHTML\(\['Popularity','Net','Miles','Rides','Safety','Reach'\]\)/.test(admin),
  'the shared six-axis legend is still rendered above the grid');
ok(/class="cargrid"/.test(admin), 'the card grid is still rendered');
ok(/has-photo/.test(admin) && /noimg/.test(admin),
  'the photo-over-shape fallback is still in place');

/* CARS_INFO IS THE SIX SELLABLE TRIMS, AND MUST MATCH THE GAME'S CATALOG.
   It held nine until 2026-07-30 — the three trims retired that day kept a
   card each so their historical data stayed visible, but in practice they
   were three permanently empty cards and Pavel asked for them to go. The
   invariant is now the stronger one: this array is exactly the game's
   catalogue, so a trim added or removed there fails here. */
const carsInfo = admin.match(/var CARS_INFO = \[([\s\S]*?)\];/)[1];
const adminCarIds = [...carsInfo.matchAll(/\{id:'(\w+)'/g)].map((m) => m[1]);
const catalogBlock = game.slice(game.indexOf('const CATALOG=['),
  game.indexOf('const MODEL_ALIAS='));
const gameCarIds = [...catalogBlock.matchAll(/^\s{4}id:'(\w+)'/gm)].map((m) => m[1]);
eq(gameCarIds.length, 6, `deadhead.html's CATALOG has 6 trims`);
eq(adminCarIds.join(','), gameCarIds.join(','),
  'CARS_INFO is exactly the game CATALOG, same ids in the same order');

/* The retired / pre-rebrand ids must still RESOLVE TO A NAME even though they
   no longer have a card, because the Worker still accepts them (MODEL_IDS)
   and old rows still hold them. An unnamed id would render as raw `crosssport`
   in the ranked table and the dashboard's Most-run cars card. */
const retiredMap = admin.match(/var RETIRED_MODELS = \{([\s\S]*?)\};/)[1];
const retiredIds = [...retiredMap.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
['crosslong', 'saloonsport', 'crosssport'].forEach((id) => {
  ok(retiredIds.includes(id), `${id} has no card but still has a name`);
  ok(!adminCarIds.includes(id), `${id} has no card`);
});
/* Every id the Worker whitelists must be nameable by this page: either a
   sellable trim or a RETIRED_MODELS entry. This is the assertion that catches
   the next trim retirement. */
const modelIdsBlock = worker.match(/const MODEL_IDS = \[([\s\S]*?)\];/)[1];
const workerModelIds = [...modelIdsBlock.matchAll(/'([\w]+)'/g)].map((m) => m[1]);
ok(workerModelIds.length >= 18, `the Worker whitelists ${workerModelIds.length} model ids`);
const unnameable = workerModelIds.filter(
  (id) => !adminCarIds.includes(id) && !retiredIds.includes(id));
eq(unnameable.join(','), '',
  'every model id the Worker accepts resolves to a name in the admin');
/* Avg rides was the one queried number the cards never printed. */
ok(/Avg rides/.test(admin), 'the cards print Avg rides');
['shifts', 'players', 'avg_net', 'avg_miles', 'avg_rides', 'avg_safety'].forEach((k) => {
  ok(new RegExp('r\\.' + k).test(admin), `the cards still read r.${k}`);
});

/* ============================================================
   8. renderers survive an empty database
   ============================================================ */
console.log('\nempty-database rendering');
/* The most common state of this page on a fresh deploy, and the state in
   which a "cannot read property of undefined" would be least noticed. Each
   renderer is exercised with the shape the Worker returns when the table is
   empty. Rendered in jsdom so the delegated listeners and document lookups
   in the module scope resolve. */
const { JSDOM } = require('jsdom');
const dom = new JSDOM(admin, { runScripts: 'dangerously', url: 'https://example.com/admin.html' });
const win = dom.window;
ok(!!win.document.getElementById('view'), 'the page booted in jsdom without throwing');
eq(win.document.getElementById('app').style.display, '', 'the app starts hidden behind the gate');
ok(!!win.document.querySelector('meta[name="viewport"]'), 'the viewport meta tag is present');
ok(!!win.document.getElementById('refresh'), 'there is a Refresh control');
ok(!!win.document.getElementById('lock'), 'there is a Lock control');
ok(!!win.document.getElementById('asof'), 'there is an as-of stamp');

/* The renderers live inside an IIFE, so they cannot be called from out here.
   Re-evaluate the script body in a scope that hands them back instead. */
const rawScript = admin.match(/<script>([\s\S]*)<\/script>/)[1];
const iifeOpen = rawScript.indexOf('(function(){');
const iifeClose = rawScript.lastIndexOf('})();');
ok(iifeOpen !== -1 && iifeClose > iifeOpen, 'the page script is one IIFE');
const scriptBody = rawScript.slice(iifeOpen + '(function(){'.length, iifeClose);
const harness = new win.Function(
  scriptBody + '\nreturn RENDERERS;'
);
const R = harness.call(win);
const EMPTY = {
  dashboard: { tops: {}, pulse: {}, health: {}, funnel: {} },
  players: { rows: [], total: 0 },
  geo: { rows: [], regions: [] },
  funnel: { row: {}, cities: [] },
  economics: { rows: [] },
  cars: { rows: [], totalShifts: 0 },
  achievements: { rows: [], totalPlayers: 0, allPlayers: 0 },
  recent: { rows: [], total: 0 },
};
for (const view of Object.keys(EMPTY)) {
  let html = null, err = null;
  try { html = R[view](EMPTY[view]); } catch (e) { err = e; }
  ok(err === null, `render ${view} on an empty database` + (err ? ' — ' + err.message : ''));
  ok(typeof html === 'string' && html.length > 0, `render ${view} returns markup`);
  ok(!/undefined|NaN/.test(String(html)), `render ${view} prints no "undefined" or "NaN"`);
}
/* And with data, so the row paths run too — including a NULL-country row,
   which is every row written before geo shipped. */
const withData = {
  players: { rows: [
    { player_id: 'abcdef1234', name: 'Pavel', country: 'CZ', region: 'Prague',
      created: 1, first_seen: 1, last_seen: Date.now(), shifts: 9, cities: 2,
      days_active: 3, best_day: 4, best_cash: 12000, best_cars: 3 },
    { player_id: 'zzz', name: null, country: null, region: null, created: null,
      first_seen: 1, last_seen: 2, shifts: 1, cities: 1, days_active: 1,
      best_day: 1, best_cash: -300, best_cars: 1 },
  ], total: 900 },
  recent: { rows: [
    { ts: Date.now(), player_id: 'abc', name: 'Pavel', country: 'US', region: 'Texas',
      city: 'sf', day: 2, shift_no: 3, permit: 'tnc', worked_h: 4.5, gross: 400,
      net: -120, cash: 900, cars: 2, rides: 8, miles: 60, safety: 92 },
  ], total: 5 },
  economics: { rows: [
    { city: 'sf', shift_no: 11, n: 1, median_net: -50, p25: -50, p75: -50,
      min_net: -50, max_net: -50 },
  ], lateBucket: 11 },
  /* A sellable trim, a RETIRED trim that really was driven, and a pre-0.42.0
     id from a cached client — the three shapes the Cars view has to survive
     now that only six models have cards. */
  cars: { rows: [
    { model: 'cab', shifts: 40, players: 12, avg_net: 90, avg_miles: 70,
      avg_rides: 7, avg_safety: 88 },
    { model: 'crosssport', shifts: 6, players: 2, avg_net: 61, avg_miles: 72,
      avg_rides: 7.5, avg_safety: 78 },
    { model: 'cybertruck', shifts: 2, players: 1, avg_net: 40, avg_miles: 50,
      avg_rides: 4, avg_safety: 80 },
  ], totalShifts: 48 },
};
for (const view of Object.keys(withData)) {
  let html = null, err = null;
  try { html = R[view](withData[view]); } catch (e) { err = e; }
  ok(err === null, `render ${view} with rows` + (err ? ' — ' + err.message : ''));
  ok(!/undefined|NaN/.test(String(html)), `render ${view} with rows prints no undefined/NaN`);
}
/* The capped-query warning has to actually appear, or the table lies about
   how much it is showing. */
ok(/of 900/.test(R.players(withData.players)),
  'a capped Players table says "of 900"');
/* San Francisco, not "Sf" — end to end through the real renderer. */
ok(/San Francisco/.test(R.recent(withData.recent)),
  'Recent renders San Francisco, not "Sf"');
ok(/San Francisco/.test(R.economics(withData.economics)),
  'Economics renders San Francisco, not "Sf"');
ok(/11\+/.test(R.economics(withData.economics)),
  'the late-shift bucket renders as "11+"');
/* REMOVING THE THREE EMPTY RETIRED CARDS MUST NOT REMOVE REAL DATA.
   A shift filed under a retired or pre-rebrand id has no card any more, so the
   ranked table is the only place it can appear — if it does not, deleting
   those cards quietly deleted history from this page. */
const carsHtml = R.cars(withData.cars);
ok(/Crossover Sport · retired/.test(carsHtml),
  'a retired trim WITH shifts appears in the ranked table, labelled');
ok(/Truck \(old id\) · retired/.test(carsHtml),
  'a pre-0.42.0 model id with shifts appears too, named not raw');
ok(!/crosssport|cybertruck/.test(carsHtml),
  'neither appears as a raw id anywhere on the page');
eq((carsHtml.match(/class="carcard"/g) || []).length, 6,
  'exactly six cards are drawn — the sellable trims, no empty retired ones');
/* And with nothing retired in the data, no retired ROW is added. (The prose
   above the table still explains the rule, so this looks for the row label,
   not for the word.) */
const carsClean = R.cars({ rows: [{ model: 'cab', shifts: 3, players: 1, avg_net: 10,
  avg_miles: 5, avg_rides: 1, avg_safety: 90 }], totalShifts: 3 });
ok(!/· retired/.test(carsClean),
  'with no retired data, no retired row is added to the table');
eq((carsClean.match(/class="carcard"/g) || []).length, 6,
  'still exactly six cards when only one trim has data');

/* A NULL country must read as Unknown, not as a blank cell or "null". */
const playersHtml = R.players(withData.players);
ok(/Unknown/.test(playersHtml), 'a pre-geo row renders its country as Unknown');
ok(/Czechia|CZ/.test(playersHtml), 'a CZ row renders a readable country');
ok(/-\$300/.test(playersHtml), 'a negative best_cash renders as -$300');

dom.window.close();
db.close();

console.log('');
if (fails) {
  console.error(fails + ' admin check(s) FAILED');
  process.exit(1);
}
console.log('All admin checks passed.');
