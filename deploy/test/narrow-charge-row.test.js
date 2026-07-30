// Guards against the "Send to charge" / Range overlap found during the
// iPhone 14 Pro playability pass on 2026-07-30. Inside the console's own
// narrow-width layout (`@container (max-width:619px){ .t-chg{...} }`), the
// button's grid column used to be a bare `auto` track. A bare `auto` track
// sizes to its content's MAX-content width during CSS Grid's track-maximizing
// pass, which runs BEFORE `fr`/`minmax(0,1fr)` tracks get any space at all.
// Because the button's own text includes a variable, unbounded charger name
// ("South Congress · 1.8 mi · 6 min" etc.), that auto track could blow out
// to whatever the longest charger label needed, starving the two value
// columns (Charge/Range) down to a fraction of a pixel — Range's text then
// rendered with nowhere to go and visually sat on top of the button.
//
// Fix: the button's column is now `minmax(0,1.4fr)`, so it competes for
// space like every other track and the button's ALREADY-correct
// `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` on `.bsub`
// (previously defeated) is what shrinks now, not the sibling columns.
//
// This test reads the raw CSS source (not a live DOM) because jsdom does not
// implement CSS Grid track-sizing math at all — a computed-style assertion
// would trivially pass whether the bug or the fix were in place, since jsdom
// can't tell the difference between an `auto` track and a `minmax(0,1fr)`
// track. Only a real layout engine (see the Playwright bounding-rect repro
// used to find and confirm this fix) or a source-level check can catch it.

const fs = require('fs');
const path = require('path');
let ok = 0, fail = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('  ok  ', name); }
  else { fail++; console.log('  FAIL', name); }
}

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'deadhead.html'), 'utf8');

// Isolate the narrow-console container query block so this can't be fooled
// by `.t-chg` or `auto` appearing elsewhere in the stylesheet.
const containerMatch = src.match(/@container \(max-width:619px\)\{([\s\S]*?)\n(?=@container|\/\*[^*]|<\/style)/);
check('narrow console @container(max-width:619px) block found', !!containerMatch);

if (containerMatch) {
  const block = containerMatch[1];
  const tchgMatch = block.match(/\.t-chg\{[^}]*grid-template-columns:([^;]+);/);
  check('.t-chg grid-template-columns rule found inside the narrow block', !!tchgMatch);

  if (tchgMatch) {
    const cols = tchgMatch[1].trim();
    // Exactly 4 tracks: ring/label, value, value, button.
    const tracks = cols.split(/\s+/).filter(Boolean);
    check('.t-chg defines 4 grid columns', tracks.length === 4);

    const buttonTrack = tracks[tracks.length - 1];
    check(
      'button column is a bounded minmax(0,*) track, not a bare "auto" (the overlap bug)',
      /^minmax\(0,/.test(buttonTrack)
    );
    check('button column is not literally "auto"', buttonTrack !== 'auto');
  }
}

console.log(ok + ' ok, ' + fail + ' failed');
if (fail > 0) process.exit(1);
console.log('All narrow-charge-row checks passed.');
