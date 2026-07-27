/* Version-numbering guard.
 *
 * WHY THIS EXISTS
 *
 * The build was at 0.31.0 while the newest hand-written release note was
 * COMMIT_0.26.7.txt, because the notes are written by hand and were not
 * always written. Numbering a release by reading the highest COMMIT_*.txt
 * filename and adding one therefore landed FIVE versions in the past, and
 * reused a number that had already shipped. The git log offered no
 * correction either: everything since 0.26.3 is uncommitted, so tags and
 * history both describe a much older build.
 *
 * `const VERSION` in deadhead.html is the authority. This test makes that
 * enforceable instead of merely documented: ship a release note without
 * bumping VERSION, or bump VERSION without a note, and the suite fails and
 * says which way round the mismatch is.
 *
 * Run: node test/version.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const GAME = path.join(ROOT, 'deadhead.html');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('version numbering');

const src = fs.readFileSync(GAME, 'utf8');
const m = src.match(/^const VERSION='([^']+)';/m);
check('deadhead.html declares const VERSION', !!m);
if (!m) { process.exit(1) }
const version = m[1];

/* Semver-ish sort so 0.9.0 does not outrank 0.31.0 — string comparison gets
   this backwards the moment a component reaches double digits, which is
   exactly the range this project is in now. */
function parts(v) { return v.split('.').map(Number) }
function cmp(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0) }
  return 0;
}

const notes = fs.readdirSync(ROOT)
  .map((f) => (f.match(/^COMMIT_(\d+\.\d+\.\d+)\.txt$/) || [])[1])
  .filter(Boolean)
  .sort(cmp);

check('at least one COMMIT_*.txt release note exists', notes.length > 0);
if (!notes.length) { process.exit(1) }

const newest = notes[notes.length - 1];
check(`const VERSION (${version}) matches the newest release note (${newest})`,
  cmp(version, newest) === 0,
  cmp(version, newest) > 0
    ? `VERSION is ahead — write COMMIT_${version}.txt`
    : `VERSION is behind — bump const VERSION to ${newest}, or renumber the note`);

/* A release note must not claim a version the code has never been at. Catches
   the specific failure above: notes numbered below a VERSION that had already
   moved past them. */
const stale = notes.filter((v) => cmp(v, version) > 0);
check('no release note is numbered above const VERSION', stale.length === 0,
  'ahead of the build: ' + stale.join(', '));

/* The note's own first line must agree with its filename — a renamed file
   with an unedited heading is the other half of the same mistake. */
const head = fs.readFileSync(path.join(ROOT, `COMMIT_${newest}.txt`), 'utf8')
  .split('\n')[0];
check(`COMMIT_${newest}.txt's first line names ${newest}`,
  head.indexOf(newest) >= 0, 'first line was: ' + head);

if (failures) {
  console.error(`\n${failures} version check(s) failed.`);
  process.exit(1);
}
console.log('All version checks passed.');
