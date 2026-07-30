/* Car-photo path guard.
 *
 * WHY THIS EXISTS
 *
 * The photo/silhouette hybrid degrades GRACEFULLY: `onerror` adds .noimg and
 * the SVG drawing underneath reappears. That is the right behaviour, and it
 * is also exactly why a mistyped or un-copied image filename is INVISIBLE.
 * A card whose photo 404s looks like a card that was never given a photo —
 * no broken-image icon, no console error a player would report, nothing in
 * rebrand.test.js either, because that suite asserts the MARKUP (an <img>
 * with the right src) and has no filesystem to check the src against.
 *
 * The path is also copied by hand into four places for three different
 * frames (see COMMIT_0.65.0.txt):
 *
 *   deadhead.html PHOTO_FOR      -> cars/<id>.webp                 900x360
 *   deploy/public/index.html     -> (same file, parity-checked)
 *   deploy/public/admin.html     -> cars/<id>-admin.webp           700x438
 *   docs/index.html              -> img/cars/<id>.webp             900x506
 *
 * and the game's copy has to exist TWICE on disk — at the repo root beside
 * deadhead.html AND under deploy/public/ — because deadhead.html resolves
 * its own relative path independently of the deploy mirror. Six trims times
 * four hand-written paths is 24 chances to typo one and never notice.
 *
 * This test reads the real strings out of all three files and stats the real
 * files. It does not care WHICH trims have photos — it only insists that
 * every path someone wrote actually resolves.
 *
 * Run: node test/car-photos.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEPLOY_PUBLIC = path.join(ROOT, 'deploy', 'public');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

console.log('car photo paths');

/* ---- 1. the game: PHOTO_FOR, resolved from BOTH roots ------------------- */
const game = fs.readFileSync(path.join(ROOT, 'deadhead.html'), 'utf8');
const photoFor = game.match(/const PHOTO_FOR=\{([\s\S]*?)\};/);
check('deadhead.html declares PHOTO_FOR', !!photoFor);
if (!photoFor) { process.exit(1) }

const gamePaths = [...photoFor[1].matchAll(/'([^']+\.webp)'/g)].map((m) => m[1]);
check('PHOTO_FOR lists at least one photo', gamePaths.length > 0, `${gamePaths.length} found`);

/* Both roots, because the two copies drift independently: a `cp` into one
   and not the other is the specific failure this half catches. */
[ROOT, DEPLOY_PUBLIC].forEach((base) => {
  gamePaths.forEach((rel) => {
    check(`${path.relative(ROOT, path.join(base, rel))} exists`,
      fs.existsSync(path.join(base, rel)));
  });
});

/* ---- 2. admin.html's own CARS_INFO copy -------------------------------- */
const admin = fs.readFileSync(path.join(DEPLOY_PUBLIC, 'admin.html'), 'utf8');
const carsInfo = admin.match(/var CARS_INFO = \[([\s\S]*?)\];/);
check('admin.html declares CARS_INFO', !!carsInfo);
if (carsInfo) {
  const adminPaths = [...carsInfo[1].matchAll(/photo:'([^']+)'/g)].map((m) => m[1]);
  check('CARS_INFO lists at least one photo', adminPaths.length > 0, `${adminPaths.length} found`);
  adminPaths.forEach((rel) => {
    check(`deploy/public/${rel} exists`, fs.existsSync(path.join(DEPLOY_PUBLIC, rel)));
  });
  /* A retired trim can no longer be bought, so no render was ever made for
     one. If a `photo:` ever appears on a retired row it is a copy-paste
     mistake, not a decision — the row is historical data, not a listing. */
  const retiredWithPhoto = carsInfo[1].split('\n')
    .filter((l) => /retired:\s*true/.test(l) && /photo:/.test(l));
  check('no retired CARS_INFO row carries a photo',
    retiredWithPhoto.length === 0, retiredWithPhoto.join(' | '));
}

/* ---- 3. the marketing page --------------------------------------------- */
const docsFile = path.join(ROOT, 'docs', 'index.html');
const docs = fs.readFileSync(docsFile, 'utf8');
const docsPaths = [...docs.matchAll(/<img class="photo" src="([^"]+)"/g)].map((m) => m[1]);
check('docs/index.html has car-card photos', docsPaths.length > 0, `${docsPaths.length} found`);
docsPaths.forEach((rel) => {
  check(`docs/${rel} exists`, fs.existsSync(path.join(ROOT, 'docs', rel)));
});
/* Every photographed card must keep its onerror handler AND its silhouette,
   or the graceful-degradation story is only true on the cards someone
   remembered to wire. Counted, not spot-checked. */
const shots = [...docs.matchAll(/<div class="shot has-photo">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
check('every .shot.has-photo carries an onerror handler',
  shots.length === docsPaths.length
  && shots.every((s) => s.indexOf("classList.add('noimg')") >= 0),
  `${shots.length} shots vs ${docsPaths.length} imgs`);
check('every .shot.has-photo still contains its <svg class="carart"> fallback',
  shots.every((s) => /<svg class="carart"/.test(s)));

/* ---- 4. the three frames are actually three different frames ------------ */
/* Not a pixel check — just that nobody dropped the same crop into all three
   folders, which is the lazy version of this task and looks wrong on the
   16:10 admin card (a 5:2 image letterboxed or over-cropped). WebP stores
   width/height in the VP8/VP8L/VP8X chunk; read it rather than adding an
   image dependency to the suite. */
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.slice(0, 4).toString() !== 'RIFF' || b.slice(8, 12).toString() !== 'WEBP') return null;
  let off = 12;
  while (off + 8 <= b.length) {
    const tag = b.slice(off, off + 4).toString();
    const size = b.readUInt32LE(off + 4);
    const d = off + 8;
    if (tag === 'VP8X') return {w: (b.readUIntLE(d + 4, 3) & 0xffffff) + 1,
                                h: (b.readUIntLE(d + 7, 3) & 0xffffff) + 1};
    if (tag === 'VP8 ') return {w: b.readUInt16LE(d + 6) & 0x3fff,
                                h: b.readUInt16LE(d + 8) & 0x3fff};
    if (tag === 'VP8L') {
      const bits = b.readUInt32LE(d + 1);
      return {w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1};
    }
    off = d + size + (size % 2);
  }
  return null;
}

const FRAMES = [
  ['game',  (id) => path.join(ROOT, 'cars', `${id}.webp`),                       900, 360],
  ['admin', (id) => path.join(DEPLOY_PUBLIC, 'cars', `${id}-admin.webp`),        700, 438],
  ['docs',  (id) => path.join(ROOT, 'docs', 'img', 'cars', `${id}.webp`),        900, 506],
];
const ids = gamePaths.map((p) => path.basename(p, '.webp'));
FRAMES.forEach(([name, at, w, h]) => {
  ids.forEach((id) => {
    const f = at(id);
    if (!fs.existsSync(f)) { check(`${name} crop for '${id}' exists`, false, f); return }
    const s = webpSize(f);
    check(`${name} crop for '${id}' is ${w}x${h}`,
      !!s && s.w === w && s.h === h, s ? `${s.w}x${s.h}` : 'unreadable');
  });
});

if (failures) {
  console.error(`\n${failures} car-photo check(s) failed.`);
  process.exit(1);
}
console.log('\nAll car-photo checks passed.');
