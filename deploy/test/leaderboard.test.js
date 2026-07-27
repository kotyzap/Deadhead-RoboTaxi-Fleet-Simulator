/* Leaderboard spoof-resistance test.
 *
 * WHAT THIS PROTECTS
 *
 * /api/stat is unauthenticated and every number in it is client-supplied.
 * For as long as the telemetry was private that was documented and fine.
 * Publishing a board built on it changes the stakes: the numbers are now
 * something people want to beat, and the cheapest way to beat them is one
 * curl. lbPlausible() in src/index.js is the whole defence, and a defence
 * nobody tests is a defence that quietly stops working the next time
 * somebody "simplifies" a WHERE clause.
 *
 * THE PREDICATE IS NOT COPIED HERE. It is extracted from src/index.js at
 * run time and evaluated, so this test exercises whatever is actually
 * deployed. The SELECT around it is restated, because the fragile,
 * security-relevant part is the filter and that is the part being shared.
 *
 * Runs against real SQLite (node:sqlite) rather than a mock, so window
 * functions, NULL handling and float comparison behave the way D1 will.
 *
 * Run: node test/leaderboard.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

const SRC = path.join(__dirname, '..', 'src', 'index.js');
const SCHEMA = path.join(__dirname, '..', 'schema.sql');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

/* Pull the live constants and the live predicate out of the Worker source.
   Deliberately brittle in a loud way: if these regexes stop matching, the
   test throws rather than silently falling back to a stale copy. */
function loadPredicate() {
  const src = fs.readFileSync(SRC, 'utf8');
  const pieces = [];
  for (const name of ['LB_MAX_NET', 'LB_MAX_NET_PER_H', 'LB_TOP_N']) {
    const m = src.match(new RegExp('^const ' + name + '\\s*=\\s*([^;]+);', 'm'));
    if (!m) throw new Error('could not find const ' + name + ' in src/index.js');
    pieces.push(`const ${name} = ${m[1]};`);
  }
  const fn = src.match(/^function lbPlausible\(\)\s*\{[\s\S]*?^\}/m);
  if (!fn) throw new Error('could not find function lbPlausible() in src/index.js');
  pieces.push(fn[0]);
  pieces.push('({ lbPlausible, LB_MAX_NET, LB_MAX_NET_PER_H, LB_TOP_N })');
  return vm.runInNewContext(pieces.join('\n'));
}

const { lbPlausible, LB_MAX_NET, LB_TOP_N } = loadPredicate();

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(SCHEMA, 'utf8'));

db.exec(`INSERT INTO users (id, username, pw, created, last_seen)
         VALUES ('u1','honest','x',0,0), ('u2','cheat','x',0,0)`);

/* One helper so each case reads as the story it is testing rather than as
   28 positional columns. Defaults describe a perfectly ordinary shift; each
   case overrides only the field under test. */
let seq = 0;
function shift(o) {
  const r = Object.assign({
    user_id: 'u1', player_id: 'p' + (++seq), city: 'austin',
    gross: 400, cost: 150, net: 250,
    worked_h: 4, rides: 12, miles: 60,
  }, o);
  db.prepare(
    `INSERT INTO stats (player_id, user_id, ts, city, gross, cost, net,
                        worked_h, rides, miles)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(r.player_id, r.user_id, ++seq, r.city, r.gross, r.cost, r.net,
        r.worked_h, r.rides, r.miles);
}

function board() {
  return db.prepare(
    `SELECT city, username, net FROM (
       SELECT s.city AS city, u.username AS username, s.net AS net,
              ROW_NUMBER() OVER (
                PARTITION BY s.city ORDER BY s.net DESC, s.ts ASC
              ) AS rn
         FROM stats s JOIN users u ON u.id = s.user_id
        WHERE ${lbPlausible()}
     ) WHERE rn <= ${LB_TOP_N} ORDER BY city, net DESC`
  ).all();
}

console.log('leaderboard plausibility');

// The baseline: an ordinary signed-in shift belongs on the board.
shift({ net: 250 });
check('an ordinary signed-in shift qualifies', board().length === 1);

/* THE DRIVE-BY. The cheapest possible forgery: POST a huge net and nothing
   else coherent. Fails on net != gross - cost without any judgement call
   about game balance. */
shift({ user_id: 'u2', net: 9999999, gross: 0, cost: 0 });
check('a bare huge net is rejected',
  !board().some((r) => r.username === 'cheat'),
  JSON.stringify(board()));

/* THE CAREFUL FORGERY. Internally consistent — net really does equal
   gross - cost — but above the impossibility ceiling. This is the case the
   bounds exist for. */
shift({ user_id: 'u2', gross: LB_MAX_NET + 5000, cost: 1000,
        net: LB_MAX_NET + 4000 });
check('a consistent but impossible net is rejected',
  !board().some((r) => r.username === 'cheat'),
  JSON.stringify(board()));

/* Consistent, under the absolute cap, but earned in six minutes — caught by
   the per-hour bound rather than the absolute one. */
shift({ user_id: 'u2', gross: 20000, cost: 0, net: 20000, worked_h: 0.1 });
check('an implausible hourly rate is rejected',
  !board().some((r) => r.username === 'cheat'),
  JSON.stringify(board()));

// A shift with no rides or no distance did not happen.
shift({ user_id: 'u2', rides: 0 });
shift({ user_id: 'u2', miles: 0 });
check('zero rides and zero miles are rejected',
  !board().some((r) => r.username === 'cheat'),
  JSON.stringify(board()));

/* ANONYMOUS PLAYERS ARE NOT ON THE BOARD. user_id is stamped server-side
   from the session cookie and is NULL for everyone else, so this is the
   line that makes an entry cost a registered account. */
shift({ user_id: null, net: 40000, gross: 40000, cost: 0 });
check('an anonymous row never reaches the board', board().length === 1,
  JSON.stringify(board()));

// A loss is a real shift, but it is not a leaderboard entry.
shift({ gross: 100, cost: 400, net: -300 });
check('a losing shift is not listed', board().length === 1);

/* The board is per city and capped. Six qualifying Miami shifts must yield
   exactly LB_TOP_N rows, ranked, without touching Austin's. */
for (let i = 0; i < 6; i++) {
  shift({ city: 'miami', gross: 1000 + i * 100, cost: 500, net: 500 + i * 100 });
}
const b = board();
const miami = b.filter((r) => r.city === 'miami');
check('miami is capped at LB_TOP_N', miami.length === LB_TOP_N,
  'got ' + miami.length);
check('miami is ranked high to low',
  miami[0].net === 1000 && miami[miami.length - 1].net === 600,
  JSON.stringify(miami));
check('austin is unaffected by miami rows',
  b.filter((r) => r.city === 'austin').length === 1);

if (failures) {
  console.error(`\n${failures} leaderboard check(s) failed.`);
  process.exit(1);
}
console.log('All leaderboard checks passed.');
