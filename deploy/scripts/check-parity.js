/* Fork detector (improvementplan.md item #2).
 *
 * deadhead.html and deploy/public/index.html are meant to be the exact same
 * file — a `cp` in either direction, not two hand-maintained copies. They
 * had drifted significantly (weather overlay + effects, sell/return-car,
 * sound, phone layout, map-gesture-lock each existed in only one of the
 * two) before this was noticed, because nothing checked. This script hashes
 * both files and fails loudly the moment they differ again, so a fork is
 * caught at commit/deploy time instead of being discovered by diffing two
 * 6,000-line files by hand.
 *
 * Run: node scripts/check-parity.js
 * (wired into `npm run predeploy`, so `npm run deploy` refuses to ship a
 * fork.)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE = path.join(__dirname, '..', '..', 'deadhead.html');
const DEPLOY = path.join(__dirname, '..', 'public', 'index.html');

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const a = hash(SOURCE);
const b = hash(DEPLOY);

if (a !== b) {
  console.error('PARITY CHECK FAILED');
  console.error('  ' + SOURCE + '  (' + a.slice(0, 12) + '...)');
  console.error('  ' + DEPLOY + '  (' + b.slice(0, 12) + '...)');
  console.error('These two files must be identical. If you meant to change the');
  console.error('game, edit deadhead.html and then run:');
  console.error('  cp deadhead.html deploy/public/index.html');
  console.error('If you edited deploy/public/index.html directly, copy your');
  console.error('change back into deadhead.html instead — it is the source of');
  console.error('truth (see DEVELOPING.md).');
  process.exit(1);
}

console.log('Parity OK — deadhead.html and deploy/public/index.html are identical.');
