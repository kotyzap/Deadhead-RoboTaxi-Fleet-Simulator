// Guards against the mobile-Safari freeze reported 2026-07-30: clicking the
// Theme toggle (day<->night) hung the whole page on iPhone, but was fine on
// desktop. Root cause: --blur and --sat used to differ between the two
// themes (34px/1.8 vs 40px/1.4), and ~10 backdrop-filter surfaces (panels,
// console, topbar, sheets) all read those two custom properties — so every
// one of them had to recompute its blur sample in the same frame the instant
// data-theme flipped. Desktop absorbs that; mobile Safari did not.
//
// Fix: --blur/--sat are now declared ONCE in :root and never redeclared in
// the night block, so toggling theme can only ever repaint colours, never
// force a synchronous backdrop-filter recomposite across every glass layer
// on screen. This test reads the raw source (not a live DOM) since jsdom
// does not compute backdrop-filter at all, so a computed-style assertion
// would trivially pass with either the bug or the fix in place.

const fs = require('fs');
const path = require('path');
let ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('  ok  ', name); }
  else { fail++; console.log('  FAIL', name); }
}

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'deadhead.html'), 'utf8');

// Isolate the :root block and the html[data-theme="night"] block so the
// check can't be fooled by --blur/--sat appearing anywhere else (e.g. inside
// a comment, or inside a per-surface rule that happens to also start with
// "--blur").
const rootMatch = src.match(/:root\{([\s\S]*?)\n\}/);
const nightMatch = src.match(/html\[data-theme="night"\]\{([\s\S]*?)\n\}/);
check(':root block found', !!rootMatch);
check('html[data-theme="night"] block found', !!nightMatch);

if (rootMatch && nightMatch) {
  const rootBlock = rootMatch[1];
  const nightBlock = nightMatch[1];

  check(':root declares --blur exactly once', (rootBlock.match(/--blur:/g) || []).length === 1);
  check(':root declares --sat exactly once', (rootBlock.match(/--sat:/g) || []).length === 1);
  check('night block does NOT redeclare --blur (the freeze fix)', !/--blur:/.test(nightBlock));
  check('night block does NOT redeclare --sat (the freeze fix)', !/--sat:/.test(nightBlock));
}

console.log(ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
console.log('All theme-toggle-perf checks passed.');
