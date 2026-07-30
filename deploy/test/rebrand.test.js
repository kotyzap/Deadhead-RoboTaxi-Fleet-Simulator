/* Rebrand test — DESIGN.md §9.4, shipped in 0.42.0.
 *
 * WHAT THIS PROTECTS
 *
 * 0.42.0 replaced nine real product names and nine manufacturer press
 * photographs with an invented marque (Axiom) and five drawn bodies. Two
 * things can go wrong with that, and only one of them is cosmetic:
 *
 *   1. THE SAVE. c.model is written into every local save, every cloud slot
 *      and every stats row, so the old ids ('cybercab', 'modelyl', ...) are
 *      out in the world on other people's machines. If they stop resolving,
 *      a returning player's fleet loses its specs — silently, because
 *      spec() has a CFG fallback that looks like a working car. MODEL_ALIAS
 *      plus the v9 migration is the fix; this file is the proof.
 *
 *   2. THE LEAK. A single missed string in a player-visible line undoes the
 *      whole point of the exercise. The brand grep below reads the shipped
 *      documents and fails on any token that a player could see.
 *
 * The economy is deliberately NOT re-asserted here — city.test.js already
 * owns the Act 1 trilemma, and if the rebrand had moved a number that suite
 * would fail first. That separation is the point: this file would still
 * pass if the prices were wrong, and city.test.js would still fail.
 *
 * Run: node test/rebrand.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const GAME = path.join(ROOT, 'deadhead.html');
const DEPLOYED = path.join(__dirname, '..', 'public', 'index.html');

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}

function loadableScript(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '')
    .replace(/<link[^>]+href=["']https:\/\/[^"']*["'][^>]*>/gi, '');
}

/* The nine pre-0.42.0 ids, paired with what they must now resolve to. Written
   out longhand rather than read from MODEL_ALIAS: a test that imports the
   mapping it is checking would pass just as happily if the mapping were
   emptied.

   2026-07-30: Crossover Long, Saloon Sport and Crossover Sport left CATALOG
   (see THE CATALOGUE in deadhead.html, "trimmed from nine trims to six"), so
   the three pre-rebrand ids that used to point at them now fold into
   Crossover Six instead — the closest remaining trim by price. This table
   still lists all nine old ids: they must ALL keep resolving to a real
   CATALOG entry forever, whether or not that entry still matches what the
   name says. */
const OLD_TO_NEW = {
  cybercab: 'cab',
  model3: 'saloon',
  modely: 'cross',
  model3prem: 'saloonlong',
  modelyprem: 'crosssix',
  modelyl: 'crosssix',
  model3perf: 'crosssix',
  modelyperf: 'crosssix',
  cybertruck: 'truck',
};

/* The three post-rebrand ids that were themselves real CATALOG entries until
   2026-07-30 and are now cut — they are just as "out in the world on other
   people's machines" as the pre-rebrand ids above, so MODEL_ALIAS must fold
   them too. Kept separate from OLD_TO_NEW because they were never part of
   the original nine-old-id rebrand table this file protects; conflating the
   two would blur which historical event a failure points back to. */
const CUT_TO_NEW = {
  crosslong: 'crosssix',
  saloonsport: 'crosssix',
  crosssport: 'crosssix',
};

/* Tokens no player may ever see. Matched against CODE AND COPY only — see
   playerFacing() for what gets stripped first and why. */
const BANNED = [
  /\bCybercab\b/i,
  /\bCybertruck\b/i,
  /\bModel\s?[3YSX]\b/,
  /\bSupercharger\b/i,
  /\bAutopilot\b/i,
  /\bFull Self-Driving\b/i,
  /\bcarsimg\b/,            /* the photo directory is gone; a reference to it is a 404 */
];

/* What the brand grep is allowed to ignore, and the reasoning for each. This
   is the judgement call at the centre of the whole rebrand, so it is written
   down in the test rather than left implicit:

   1. COMMENTS. deadhead.html's comments record where the real geofence,
      tariff, permit and charger data came from — including the operator and
      the network by name. Those are factual statements about published
      information, they are the reason the economy is checkable, and DESIGN.md
      §9.4 keeps them deliberately. A comment is also, definitionally, not
      something a player can see.

   2. MODEL_ALIAS. The nine old ids MUST survive in code forever or existing
      saves break (that is what the first half of this file proves). They are
      identifiers in a compatibility table, not names shown to anyone.

   Everything else — copy, labels, dialogue, log lines, goal text, alt text,
   image paths — is in scope and must be clean. */
function playerFacing(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')                  /* HTML comments */
    .replace(/\/\*[\s\S]*?\*\//g, '')                 /* JS and CSS block comments */
    .replace(/const MODEL_ALIAS=\{[\s\S]*?\};/, '');   /* the compatibility table */
}

(async () => {
  console.log('rebrand (DESIGN.md §9.4)');

  const dom = new JSDOM(loadableScript(fs.readFileSync(GAME, 'utf8')), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function (q) {
        return { matches: false, media: q, addEventListener() {},
          removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      window.fetch = () => Promise.reject(new Error('offline in test'));
    },
  });
  await new Promise((r) => setTimeout(r, 60));

  const w = dom.window;
  const A = w.DH_ACT1;
  const S = w.DH;
  /* migrate() and the save version live on DH_SAVE, not DH_ACT1 — the save
     layer is deliberately a separate surface from the engine. */
  const SV = w.DH_SAVE;

  check('DH_ACT1 and DH_SAVE expose the rebrand surface',
    !!A && typeof A.catalog === 'function' && typeof A.spec === 'function' &&
      Array.isArray(A.CATALOG) && !!A.CARART &&
      !!SV && typeof SV.migrate === 'function');
  if (!A) { process.exit(1) }

  // ---- the catalogue is the new one, and it is six cars (nine until ------
  // ---- the 2026-07-30 trim) -----------------------------------------------
  check('CATALOG is six cars', A.CATALOG.length === 6,
    `got ${A.CATALOG.length}`);
  check('every CATALOG id is a post-rebrand id',
    A.CATALOG.every((v) => Object.values(OLD_TO_NEW).includes(v.id)),
    A.CATALOG.map((v) => v.id).join(','));
  check('no CATALOG name contains a real product name',
    A.CATALOG.every((v) => !BANNED.some((re) => re.test(v.name))),
    A.CATALOG.map((v) => v.name).join(' · '));
  check('badges are unique — they prefix every fleet id, so a collision would '
      + 'make two models share a registration',
    new Set(A.CATALOG.map((v) => v.badge)).size === 6);
  check('the three cut trims (Crossover Long, Saloon Sport, Crossover Sport) '
      + 'are really gone from CATALOG',
    Object.keys(CUT_TO_NEW).every((id) => !A.CATALOG.some((v) => v.id === id)),
    A.CATALOG.map((v) => v.id).join(','));

  // ---- 1. THE SAVE: old ids still resolve --------------------------------
  Object.keys(OLD_TO_NEW).forEach((old) => {
    const v = A.catalog(old);
    check(`catalog('${old}') resolves to '${OLD_TO_NEW[old]}'`,
      !!v && v.id === OLD_TO_NEW[old], v ? v.id : 'undefined');
  });
  // ---- the three cut ids fold into Crossover Six too ----------------------
  Object.keys(CUT_TO_NEW).forEach((cut) => {
    const v = A.catalog(cut);
    check(`catalog('${cut}') (a real id until 2026-07-30) resolves to '${CUT_TO_NEW[cut]}'`,
      !!v && v.id === CUT_TO_NEW[cut], v ? v.id : 'undefined');
  });

  /* The dangerous failure mode, spelled out: spec() falls back to flat CFG
     values for a car that predates the catalogue. A broken alias would take
     that path and LOOK fine — a car with a battery, a name and a badge —
     while quietly running on the wrong pack size and the wrong cost per mile.
     So this asserts the real spec came back, not merely that something did. */
  const oldCar = { model: 'modelyl', hold: 'own' };
  const sp = A.spec(oldCar);
  const six = A.catalog('crosssix');
  check('spec() on a pre-rebrand car returns the REAL spec, not the CFG fallback',
    sp.kwh === six.kwh && sp.price === six.price && sp.name === six.name,
    `kwh ${sp.kwh} vs ${six.kwh}, name "${sp.name}" vs "${six.name}"`);

  check('every pre-rebrand id draws a body — no car renders as an empty box',
    Object.keys(OLD_TO_NEW).every((old) => A.silhouette(old).indexOf('<svg') === 0));
  check('every cut id (real until 2026-07-30) also still draws a body',
    Object.keys(CUT_TO_NEW).every((cut) => A.silhouette(cut).indexOf('<svg') === 0));
  check('five bodies cover six cars',
    Object.keys(A.CARART).length === 5, Object.keys(A.CARART).join(','));

  // ---- 2026-07-30: all six trims got a real photo, not a real car's ------
  // PHOTO_FOR points at original Axiom-badged renders, not a manufacturer's
  // press photo — so this is a NEW feature this same suite must keep safe,
  // not something the rebrand needs protecting FROM. silhouette() itself
  // must stay untouched (checked above, unconditionally, for exactly this
  // reason): artHtml() is where the photo is layered ON TOP of the drawing,
  // never instead of it, so a broken image still degrades to the SVG.
  // ---- 2026-07-30: the Cab's seat count matches its own photo -----------
  check('the Cab seats 4, not 2 — the render this card now shows (see '
      + 'PHOTO_FOR) is a two-row pod, not a two-seater',
    A.catalog('cab').seats === 4, `got ${A.catalog('cab').seats}`);

  /* Every SELLABLE trim now has a photo — asserted against CATALOG itself
     rather than a hardcoded list of six ids, because a hardcoded city/model
     list is exactly what rotted last time (see the funnel bug in 0.33.0).
     If a seventh trim ever ships without art, this line fails and says so. */
  check('PHOTO_FOR covers every trim in CATALOG',
    A.CATALOG.every((v) => !!A.PHOTO_FOR[v.id]),
    A.CATALOG.filter((v) => !A.PHOTO_FOR[v.id]).map((v) => v.id).join(',') || 'all covered');
  check('PHOTO_FOR has no entries for trims that are not in CATALOG',
    Object.keys(A.PHOTO_FOR).every((id) => A.CATALOG.some((v) => v.id === id)));
  check('none of PHOTO_FOR\'s paths reference the banned /carsimg/ folder name',
    Object.values(A.PHOTO_FOR).every((p) => !/\bcarsimg\b/.test(p)));
  A.CATALOG.forEach((v) => {
    const id = v.id;
    const html = A.artHtml(v, 0);
    check(`artHtml('${id}') includes an <img> for its photo`,
      html.indexOf('<img') >= 0 && html.indexOf(A.PHOTO_FOR[id]) >= 0);
    check(`artHtml('${id}') keeps the SVG drawing in the DOM (onerror fallback)`,
      html.indexOf('<svg') >= 0);
    check(`artHtml('${id}') carries the has-photo class`,
      /class="card-art has-photo"/.test(html));
    check(`artHtml('${id}') wires the onerror handler that reveals the SVG again`,
      /onerror="this\.parentElement\.classList\.add\('noimg'\)"/.test(html));
  });
  /* The no-photo branch is unreachable from CATALOG now that all six are
     covered, but it is still LIVE CODE — a synthetic id keeps it tested so
     the fallback does not quietly rot into a broken box. */
  const noPhoto = A.artHtml({id: 'nosuchtrim', name: 'Nothing', badge: 'XX', tag: 'n/a'}, 0);
  check('a model with no PHOTO_FOR entry gets no <img> at all',
    noPhoto.indexOf('<img') === -1);
  check('...and no has-photo class either',
    !/has-photo/.test(noPhoto));

  // ---- achievements survive the rename ----------------------------------
  /* Cash AFTER newFleet, not before: newFleet() resets the bank to the
     scenario's starting cash, so funding it first buys nothing. */
  A.newFleet('austin'); S.ray.skipped = true; S.cash = 1e6;
  A.acquire('cab', 'buy');
  check('setup: a car is in the fleet', S.cars.length === 1);
  check('hasModel() matches a new id against a new fleet', A.hasModel('cab'));
  /* A returning player's save holds 'cybercab'. Purpose Built must not
     un-earn itself because the string changed under them. */
  S.cars[0].model = 'cybercab';
  check('hasModel(\'cab\') still matches a car saved as \'cybercab\'',
    A.hasModel('cab'));
  check('hasModel(\'cybercab\') also still answers — either spelling works',
    A.hasModel('cybercab'));

  // ---- the v9 migration rewrites ids on load ----------------------------
  check('SAVE_V is 9', SV.V === 9, `got ${SV.V}`);
  const migrated = SV.migrate({
    v: 8,
    s: { cars: Object.keys(OLD_TO_NEW).map((m, i) => ({
      id: 'X-0' + i, model: m, hold: 'own', soc: 0.8, owed: 0 })) },
  });
  const got = migrated.s.cars.map((c) => c.model);
  check('migrate() rewrites every old id to its new one',
    got.every((m, i) => m === OLD_TO_NEW[Object.keys(OLD_TO_NEW)[i]]),
    got.join(','));
  check('migrate() lands on SAVE_V', migrated.v === 9, `got ${migrated.v}`);

  /* Order matters: the v8 loan migration calls catalog() with whatever id the
     save holds. If aliasing lived in the v9 step instead of inside catalog(),
     principal would compute as 0 here and a financed car would arrive owned
     outright — the financing exploit reopened by a rename. */
  const v7 = SV.migrate({
    v: 7,
    s: { day: 1, cars: [{ id: 'CC-01', model: 'cybercab', hold: 'finance' }] },
  });
  const cab = A.catalog('cab');
  check('a v7 financed car saved under an old id still opens a real loan balance',
    v7.s.cars[0].owed > 0 &&
      Math.abs(v7.s.cars[0].owed - (cab.price - cab.down)) < 1,
    `owed ${v7.s.cars[0].owed}, expected ~${cab.price - cab.down}`);

  // ---- 2. THE LEAK: no banned token in either shipped document ----------
  [['deadhead.html', GAME], ['deploy/public/index.html', DEPLOYED]].forEach(
    ([label, file]) => {
      const text = playerFacing(fs.readFileSync(file, 'utf8'));
      BANNED.forEach((re) => {
        const m = text.match(re);
        check(`${label}: no ${re.source} in code or copy`, !m,
          m ? `found "${m[0]}" near line ${text.slice(0, m.index).split('\n').length} ` +
              '(of the comment-stripped text)' : '');
      });
    });

  /* The marque should be said in exactly one place in the source, so the next
     rename is one edit. */
  const src = fs.readFileSync(GAME, 'utf8');
  check('MAKE is declared once', (src.match(/const MAKE=/g) || []).length === 1);

  console.log(failures ? `\n${failures} rebrand check(s) failed.`
                       : '\nAll rebrand checks passed.');
  process.exit(failures ? 1 : 0);
})();
