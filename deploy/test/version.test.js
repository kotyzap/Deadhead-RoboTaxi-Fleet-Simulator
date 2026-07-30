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
/* Release notes live in releases/ as of improvements.md #27's repo tidy-up
   (they used to sit loose in ROOT, 87 files deep — see COMMIT_0.70.0.txt). */
const RELEASES = path.join(ROOT, 'releases');

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

const notes = fs.readdirSync(RELEASES)
  .map((f) => (f.match(/^COMMIT_(\d+\.\d+\.\d+)\.txt$/) || [])[1])
  .filter(Boolean)
  .sort(cmp);

check('at least one COMMIT_*.txt release note exists', notes.length > 0);
if (!notes.length) { process.exit(1) }

const newest = notes[notes.length - 1];
check(`const VERSION (${version}) matches the newest release note (${newest})`,
  cmp(version, newest) === 0,
  cmp(version, newest) > 0
    ? `VERSION is ahead — write releases/COMMIT_${version}.txt`
    : `VERSION is behind — bump const VERSION to ${newest}, or renumber the note`);

/* A release note must not claim a version the code has never been at. Catches
   the specific failure above: notes numbered below a VERSION that had already
   moved past them. */
const stale = notes.filter((v) => cmp(v, version) > 0);
check('no release note is numbered above const VERSION', stale.length === 0,
  'ahead of the build: ' + stale.join(', '));

/* The note's own first line must agree with its filename — a renamed file
   with an unedited heading is the other half of the same mistake. */
const head = fs.readFileSync(path.join(RELEASES, `COMMIT_${newest}.txt`), 'utf8')
  .split('\n')[0];
check(`COMMIT_${newest}.txt's first line names ${newest}`,
  head.indexOf(newest) >= 0, 'first line was: ' + head);

/* ---- the version has to be READABLE, not merely correct ----
 *
 * 0.65.1: Pavel asked for "version next to the game title" — and there had
 * been one since the topbar shipped, `.ver` in `.brand`, filled from VERSION
 * at boot. It was just `display:none` below 1499px, while the tagline beside
 * it has been hidden since the 2199px tier, so on any normal laptop the brand
 * was the bare wordmark and the only place left to read the build number was
 * the Saves modal. A version nobody can see is not much better than no
 * version, and nothing failed when it was hidden.
 *
 * These four checks are what would have failed. The chip may be restyled
 * freely — smaller, tighter, repositioned — but not hidden.
 */
check('the brand carries a #ver element', /id="ver"/.test(src));
check('#ver is inside .brand', /<div class="brand">[\s\S]{0,200}id="ver"/.test(src));
check('#ver is filled from const VERSION, not from a literal',
  /\$\('ver'\)\.textContent\s*=\s*'v'\+VERSION/.test(src));
/* The specific regression: any rule that takes the chip out of the layout.
   Matches `.brand .ver{...display:none...}` and `.ver{...display:none...}`
   wherever it sits, inside a media query or not. */
const hidden = src.match(/\.ver\s*\{[^}]*display\s*:\s*none[^}]*\}/g) || [];
check('no CSS rule hides the version chip', hidden.length === 0,
  'found: ' + hidden.join(' | '));

if (failures) {
  console.error(`\n${failures} version check(s) failed.`);
  process.exit(1);
}
console.log('All version checks passed.');
