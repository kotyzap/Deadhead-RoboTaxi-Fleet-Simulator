/* Docs-vs-code money/trim consistency — improvements.md P3-28.
 *
 * WHAT THIS PROTECTS
 *
 * README.md and DESIGN.md quote CFG.startCash and the trim count in prose —
 * numbers that live nowhere else in either file, so a future balance change
 * (CFG.startCash moving again, a trim added/retired) can silently leave the
 * docs describing a game that no longer exists. This happened for real:
 * README/DESIGN quoted the $7,500 design-era figure and "four financeable"
 * long after the shipped game moved to $800 starting cash and zero
 * financeable trims on day one (see the CATALOG comment in deadhead.html).
 *
 * Not a full prose audit — just the two numbers most likely to drift again,
 * checked against the actual CFG/CATALOG values, the same spirit as
 * rebrand.test.js's brand-leak grep.
 *
 * Run: node test/docs-money.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const GAME = path.join(ROOT, 'deadhead.html');
const README = path.join(ROOT, 'README.md');
const DESIGN = path.join(ROOT, 'DESIGN.md');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('docs vs code: starting cash and trim count (improvements.md P3-28)');

const game = fs.readFileSync(GAME, 'utf8');
const readme = fs.readFileSync(README, 'utf8');
const design = fs.readFileSync(DESIGN, 'utf8');

const startCashM = game.match(/startCash:\s*(\d+)/);
if (!startCashM) throw new Error('could not find CFG.startCash in deadhead.html');
const startCash = Number(startCashM[1]);
const startCashFmt = '$' + startCash.toLocaleString('en-US');

const catalogBlock = game.slice(game.indexOf('const CATALOG=['), game.indexOf('const MODEL_ALIAS='));
const trimIds = [...catalogBlock.matchAll(/^\s{4}id:'(\w+)'/gm)].map((m) => m[1]);
const trimCount = trimIds.length;

check(`sanity: found a real CFG.startCash (got ${startCash})`, startCash > 0 && startCash < 100000);
check(`sanity: found a real trim count (got ${trimCount})`, trimCount >= 3 && trimCount <= 20);

// README quotes the figure in bold as "**$N**" in the opening pitch.
check(`README quotes the real starting cash (${startCashFmt})`,
  readme.includes('**' + startCashFmt + '**'),
  `expected to find "**${startCashFmt}**" in README.md`);
check('README does NOT still quote the old $7,500 design-era figure',
  !/\$7,500/.test(readme));
check('DESIGN.md does NOT still quote the old $7,500 design-era figure',
  !/\$7,500/.test(design) || /design-era figure/.test(design),
  'a bare $7,500 with no "design-era" qualifier nearby reads as a current claim');

// The old "N of six financeable" framing is exactly the wrong-direction claim
// once startCash can't clear a single down payment + lender reserve — check
// that directly rather than hardcoding "zero", so a future startCash raise
// that legitimately re-enables financing does not force an update here for
// no reason.
const CHARGERS_UNUSED = null; // (not used — placeholder to keep diff minimal if extended later)
const prices = [...catalogBlock.matchAll(/down:(\d+)/g)].map((m) => Number(m[1]));
const LENDER_RESERVE = 500; // matches the $500 lender reserve named in deadhead.html's CATALOG comment
const financeableToday = prices.filter((down) => startCash >= down + LENDER_RESERVE).length;
check(`sanity: computed ${financeableToday} financeable trim(s) at today's startCash`,
  typeof financeableToday === 'number');

if (financeableToday === 0) {
  check('README does not claim any trims are financeable on day one',
    !/\b(one|two|three|four|five|six|\d+) of the (six|\d+) (is|are) financeable/i.test(readme));
} else {
  check(`README's financeable-count claim matches the real number (${financeableToday})`,
    new RegExp(financeableToday + ' of').test(readme) || new RegExp('all ' + financeableToday).test(readme),
    'README should name the actual financeable count, not a stale one');
}

if (failures) {
  console.error(`\n${failures} docs-money check(s) failed.`);
  process.exit(1);
}
console.log('All docs-money checks passed.');
