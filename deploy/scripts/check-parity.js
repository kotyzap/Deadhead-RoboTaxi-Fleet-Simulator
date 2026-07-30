/* Fork detector (improvementplan.md item #2; extended per improvements.md
 * P3-26).
 *
 * deadhead.html/deploy/public/index.html and cloud.js/deploy/public/cloud.js
 * are each meant to be the exact same file on both sides — a `cp` in either
 * direction, not two hand-maintained copies. The HTML pair had drifted
 * significantly (weather overlay + effects, sell/return-car, sound, phone
 * layout, map-gesture-lock each existed in only one of the two) before this
 * was noticed, because nothing checked. cloud.js/deploy/public/cloud.js was
 * flagged in improvements.md P1-13 as "currently byte-identical by luck" —
 * true at the time, and exactly the kind of true that stops being true the
 * first time someone edits one copy under time pressure. This script hashes
 * every pair and fails loudly the moment any of them differ, so a fork is
 * caught at commit/deploy time instead of being discovered by diffing two
 * multi-thousand-line files by hand.
 *
 * admin.html has NO root duplicate to diff this way — it only ever lived in
 * deploy/public/. Its risk is different (a hand-kept copy of catalogue data
 * — ACHV_INFO, city ids — rather than a forked whole file) and is already
 * covered where that data is actually asserted: achievements.test.js diffs
 * admin.html's ACHV_INFO against the game's real ACHV table character for
 * character. Not duplicated here on purpose.
 *
 * Run: node scripts/check-parity.js
 * (wired into `npm run predeploy`, so `npm run deploy` refuses to ship a
 * fork.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(__dirname, '..', 'public');

const PAIRS = [
  { a: path.join(ROOT, 'deadhead.html'), b: path.join(PUBLIC, 'index.html') },
  { a: path.join(ROOT, 'cloud.js'), b: path.join(PUBLIC, 'cloud.js') },
];

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

let failed = false;
for (const { a, b } of PAIRS) {
  const ha = hash(a);
  const hb = hash(b);
  if (ha !== hb) {
    failed = true;
    console.error('PARITY CHECK FAILED');
    console.error('  ' + a + '  (' + ha.slice(0, 12) + '...)');
    console.error('  ' + b + '  (' + hb.slice(0, 12) + '...)');
    console.error('These two files must be identical. If you meant to change the');
    console.error('game, edit ' + path.basename(a) + ' and then run:');
    console.error('  cp ' + path.relative(ROOT, a) + ' ' + path.relative(ROOT, b));
    console.error('If you edited ' + path.relative(ROOT, b) + ' directly, copy your');
    console.error('change back into ' + path.basename(a) + ' instead — it is the source');
    console.error('of truth (see DEVELOPING.md).');
    console.error('');
  }
}

if (failed) process.exit(1);

console.log('Parity OK — ' + PAIRS.map(({ a, b }) => path.basename(a) + '/' + path.relative(ROOT, b)).join(', ') + ' are identical.');
