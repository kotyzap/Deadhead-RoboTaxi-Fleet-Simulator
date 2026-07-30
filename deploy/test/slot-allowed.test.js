/* slotAllowed() coverage — improvements.md P0-1.
 *
 * WHAT THIS PROTECTS
 *
 * Client writes Store.put('profile',…) and Store.put('history',…) landed
 * on the server's /api/save/:slot route and got a 400 "unknown slot" on
 * every single write for signed-in players, silently — deadhead.html
 * swallows Store.put() rejections (.catch(function(){})), so a player's
 * display name and shift history have never actually synced to the cloud.
 * 'progress' had the exact same bug once, before it was carved out; this
 * test exists so the NEXT new Store.put('whatever', …) literal added to
 * deadhead.html fails a test instead of silently 400ing in production.
 *
 * THE WHITELIST AND THE LITERALS ARE BOTH READ FROM THE REAL SOURCE, not
 * copied here — this is deliberately the same discipline leaderboard.test.js
 * uses for lbPlausible(): the test exercises whatever slotAllowed() actually
 * is today, and the literal-slot list is grepped out of deadhead.html rather
 * than hand-maintained, so it can't quietly drift out of sync with the game.
 *
 * Run: node test/slot-allowed.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'index.js');
const GAME = path.join(__dirname, '..', '..', 'deadhead.html');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

/* Pull SLOTS and slotAllowed() straight out of src/index.js, same pattern
   leaderboard.test.js uses for lbPlausible() — this exercises the live
   whitelist, not a hand-copied stand-in that could drift from it. */
function loadSlotAllowed() {
  const src = fs.readFileSync(SRC, 'utf8');
  const slotsM = src.match(/^const SLOTS\s*=\s*(\[[^\]]*\]);/m);
  if (!slotsM) throw new Error('could not find const SLOTS in src/index.js');
  const fnM = src.match(/^function slotAllowed\(slot\)\s*\{[\s\S]*?^\}/m);
  if (!fnM) throw new Error('could not find function slotAllowed() in src/index.js');
  const src2 = `const SLOTS = ${slotsM[1]};\n${fnM[0]}\nslotAllowed`;
  return vm.runInNewContext(src2);
}

/* Every literal Store.put('...', …) call in deadhead.html. Deliberately
   excludes dynamic call sites (Store.put(b.dataset.svSave, …), the manual
   slot-save button) — those already resolve to 'slot1'/'slot2'/'slot3',
   which are covered separately below via SLOTS itself. */
function literalPutSlots() {
  const game = fs.readFileSync(GAME, 'utf8');
  const out = new Set();
  for (const m of game.matchAll(/Store\.put\(\s*'([^']+)'/g)) out.add(m[1]);
  return [...out];
}

console.log('slotAllowed() coverage (improvements.md P0-1)');

const slotAllowed = loadSlotAllowed();

// The specific bug: profile and history 400'd on every write.
check("slotAllowed('profile') is true", slotAllowed('profile') === true);
check("slotAllowed('history') is true", slotAllowed('history') === true);
// Already fixed before this pass — must not regress.
check("slotAllowed('progress') is true", slotAllowed('progress') === true);
check("slotAllowed('auto') is true", slotAllowed('auto') === true);
check("slotAllowed('slot1') is true", slotAllowed('slot1') === true);
check("slotAllowed('auto:austin') is true", slotAllowed('auto:austin') === true);
// Still rejects garbage — the whitelist should not have been loosened into
// a rubber stamp while fixing the two real slots.
check("slotAllowed('nonsense') is false", slotAllowed('nonsense') === false);
check("slotAllowed('auto:') (empty city) is false", slotAllowed('auto:') === false);
check("slotAllowed('auto:' + 17 chars) (too long) is false",
  slotAllowed('auto:abcdefghijklmnopq') === false);

// Every literal Store.put('...', …) call site in the game must pass.
const literals = literalPutSlots();
check(`found literal Store.put() slots in deadhead.html: ${literals.join(', ')}`,
  literals.length > 0);
for (const slot of literals) {
  check(`Store.put('${slot}', …) passes slotAllowed()`, slotAllowed(slot) === true,
    'this slot will 400 on every write from a signed-in player — add it to slotAllowed() in src/index.js');
}

/* The PUT body-shape guard (the ".s" requirement) had the identical bug —
   'profile'/'history' payloads have no .s either, so even a slot-allowed
   write would still 400 as "not a Deadhead save" without this exemption.
   Checked as a source-text assertion (not by exercising the route directly,
   which would need a full D1/session harness) — good enough to catch this
   specific regression, which is a one-line boolean condition. */
const src = fs.readFileSync(SRC, 'utf8');
const guardM = src.match(/if \(!save \|\| typeof save !== 'object'[\s\S]*?\{\s*\n\s*return bad\('not a Deadhead save'\);/);
check('the ".s" body-shape guard exists', !!guardM);
if (guardM) {
  const g = guardM[0];
  check("the guard exempts 'profile'", /slot !== 'profile'/.test(g));
  check("the guard exempts 'history'", /slot !== 'history'/.test(g));
  check("the guard still exempts 'progress'", /slot !== 'progress'/.test(g));
}

console.log('');
if (failures) {
  console.error(failures + ' slot-allowed check(s) FAILED');
  process.exit(1);
}
console.log('All slot-allowed checks passed.');
