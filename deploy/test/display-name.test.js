/* Leaderboard display-name test — improvements.md P2-18.
 *
 * WHAT THIS PROTECTS
 *
 * username is half the login credential (paired with a password to sign
 * in) — the leaderboard used to publish u.username directly, handing a
 * distributed guesser a verified list of real account names to try
 * passwords against. display_name (schema.sql) is a separate, cosmetic
 * column that the board is now supposed to show instead, falling back to
 * username only for a row from before the column existed.
 *
 * Runs the real leaderboard SELECT (extracted from src/index.js, not
 * restated) against real SQLite, same harness leaderboard.test.js already
 * uses for lbPlausible().
 *
 * Run: node test/display-name.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SRC = path.join(__dirname, '..', 'src', 'index.js');
const SCHEMA = path.join(__dirname, '..', 'schema.sql');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('leaderboard display_name (improvements.md P2-18)');

const src = fs.readFileSync(SRC, 'utf8');
// The exact leaderboard SELECT, pulled out of the /api/leaderboard handler.
const m = src.match(/const \{ results \} = await env\.DB\.prepare\(\s*`([\s\S]*?)`\s*\)\.all\(\);/);
if (!m) throw new Error('could not find the /api/leaderboard SELECT in src/index.js');
const LB_QUERY = m[1];

check('the extracted query uses display_name, not a bare username column',
  /COALESCE\(u\.display_name,\s*u\.username\)/.test(LB_QUERY),
  'query was: ' + LB_QUERY);

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(SCHEMA, 'utf8'));

db.exec(`INSERT INTO users (id, username, display_name, pw, created, last_seen)
         VALUES ('u1', 'realsecretlogin', 'Speedy', 'x', 0, 0)`);
db.exec(`INSERT INTO users (id, username, pw, created, last_seen)
         VALUES ('u2', 'anotherrealname', 'x', 0, 0)`); // no display_name set

let seq = 0;
function shift(userId) {
  const pid = 'p' + (++seq);
  db.prepare(
    `INSERT INTO stats (player_id, user_id, ts, city, gross, cost, net, worked_h, rides, miles)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(pid, userId, ++seq, 'austin', 400, 150, 250, 4, 12, 60);
}
shift('u1');
shift('u2');

const results = db.prepare(LB_QUERY.replace(/\$\{lbPlausible\(\)\}/, '1=1')
  .replace(/\$\{LB_TOP_N\}/g, '5')).all();

check('the board shows the DISPLAY name for an account that set one',
  results.some((r) => r.username === 'Speedy'));
check('the board never shows the real login username for that account',
  !results.some((r) => r.username === 'realsecretlogin'));
check('an account with no display_name falls back to its username (not blank)',
  results.some((r) => r.username === 'anotherrealname'));

if (failures) {
  console.error(`\n${failures} display-name check(s) failed.`);
  process.exit(1);
}
console.log('All display-name checks passed.');
