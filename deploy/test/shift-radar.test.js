/* The shift report's hexagraph — admin/Cars' radar, ported into the game.
 *
 * WHAT THIS PROTECTS
 *
 * The chart is six normalised axes drawn from ONE history row, with an
 * optional dashed "ghost" of the best previous shift. Four things about it
 * are easy to break and invisible when broken:
 *
 *   1. NORMALISATION MUST CLAMP. Every axis feeds a polygon coordinate, so a
 *      value above 1 draws outside the outer ring and a NaN produces
 *      "NaN,NaN" in a points attribute — which renders as nothing at all
 *      rather than as an error. A zero-gross shift (Margin) and a zero-billed
 *      shift (Utilisation) are both real and both divide by zero.
 *
 *   2. BOTH SHAPES MUST SHARE THEIR DENOMINATORS. Miles and Rides normalise
 *      against the player's own peak. If the live shape and the ghost were
 *      each scaled against themselves, every comparison would read as a tie —
 *      the ghost would trace the live shape exactly.
 *
 *   3. THE GHOST IS THE BEST *PREVIOUS* SHIFT, NOT INCLUDING THIS ONE.
 *      appendHistoryRow() runs immediately before shiftReport(), so the row
 *      being reported is already HISTORY's last entry. Forgetting to drop it
 *      means a new personal best ghosts itself and the outline sits exactly
 *      on the live shape forever.
 *
 *   4. SHIFT 1 HAS NO GHOST AND NO GHOST KEY. There is nothing to compare
 *      against, and a legend entry for an absent shape is a lie.
 *
 * Run: node test/shift-radar.test.js  (or: npm test)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const GAME = path.join(__dirname, '..', '..', 'deadhead.html');

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

const src = fs.readFileSync(GAME, 'utf8');

(async () => {
  console.log('shift hexagraph');

  // ---- CSS: the axis colours must NOT be tokenised -------------------------
  /* A fixed identity per axis is the whole reason one shared legend works.
     var(--accent) re-themes per city tone, so an axis drawn with it would
     change colour between Austin and Miami and the legend would stop
     matching the chart. Assert the legend keys carry literal hex. */
  check('.rp-axes / .rp-axkey / .rp-radar are styled',
    /\.rp-axes\{/.test(src) && /\.rp-axkey\{/.test(src) && /\.rp-radar\{/.test(src));
  check('the ghost key collapses when empty — no legend for an absent shape',
    /\.rp-ghost:empty\{display:none\}/.test(src));

  const dom = new JSDOM(loadableScript(src), {
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
  const $ = (id) => w.document.getElementById(id);

  check('DH_ACT1 exposes the radar surface',
    !!A && typeof A.rpRadarVals === 'function' && typeof A.rpHexRadar === 'function' &&
      typeof A.rpRadarBlock === 'function' && typeof A.setHistory === 'function');
  if (!A) { process.exit(1) }

  check('there are exactly six axes', A.RP_AXES.length === 6);
  check('every axis has a literal hex colour, not a CSS variable',
    A.RP_AXES.every((a) => /^#[0-9A-Fa-f]{6}$/.test(a.col)),
    A.RP_AXES.map((a) => a.col).join(','));
  check('the axis colours are all distinct — a shared legend needs six keys',
    new Set(A.RP_AXES.map((a) => a.col)).size === 6);

  // ---- 1. normalisation clamps, and divides by zero safely ----------------
  A.newFleet('austin');
  const peak = { miles: 100, rides: 20 };
  const finite = (v) => v.every((x) => Number.isFinite(x) && x >= 0 && x <= 1);

  const zero = A.rpRadarVals(
    { workedH: 0, billedH: 0, net: 0, gross: 0, miles: 0, rides: 0, safety: 0 }, peak);
  check('an all-zero shift yields six finite values in 0..1', finite(zero), zero.join(','));
  check('zero billed hours does not produce NaN on Utilisation', zero[0] === 0);
  check('zero gross does not produce NaN on Margin', zero[5] === 0);

  const huge = A.rpRadarVals(
    { workedH: 99, billedH: 1, net: 1e9, gross: 1e9, miles: 1e6, rides: 1e6, safety: 1e6 },
    peak);
  check('absurdly good numbers clamp to 1, never past the outer ring',
    finite(huge) && huge.every((x) => x === 1), huge.join(','));

  const loss = A.rpRadarVals(
    { workedH: 4, billedH: 24, net: -500, gross: 20, miles: 10, rides: 2, safety: 70 }, peak);
  check('a loss-making shift floors Net at 0 rather than going negative',
    loss[1] === 0, String(loss[1]));
  check('...and Margin too', loss[5] === 0, String(loss[5]));
  check('Safety is a plain /100 scale', loss[4] === 0.7, String(loss[4]));
  check('Utilisation is worked/billed', Math.abs(loss[0] - 4 / 24) < 1e-9, String(loss[0]));

  const zeroPeak = A.rpRadarVals(
    { workedH: 1, billedH: 2, net: 5, gross: 10, miles: 5, rides: 1, safety: 50 },
    { miles: 0, rides: 0 });
  check('a zero peak (nothing driven ever) does not produce NaN',
    finite(zeroPeak), zeroPeak.join(','));

  // ---- SVG output is well-formed -----------------------------------------
  const svg = A.rpHexRadar(loss, null);
  check('the SVG carries no NaN coordinates', !/NaN/.test(svg));
  check('the SVG has an accessible role and label',
    /role="img"/.test(svg) && /aria-label=/.test(svg));

  /* THE LABEL GUTTER. The left-hand axis labels are drawn with
     text-anchor="end", so their text extends LEFTWARD from their anchor x.
     In a square viewBox starting at 0 that text runs off the edge and is
     clipped — nothing inside an SVG can paint outside its viewBox — which is
     what turned "Margin" into "argin" on screen. Assert the viewBox actually
     starts left of zero and is wider than tall, so the gutter cannot be
     quietly removed by someone "tidying" the viewBox back to 0 0 n n. */
  const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1] || '';
  const vbN = vb.split(/\s+/).map(Number);
  check('the viewBox reserves a gutter left of x=0 for end-anchored labels',
    vbN.length === 4 && vbN[0] < 0, vb);
  check('...and is wider than it is tall, because only x needs the gutter',
    vbN[2] > vbN[3], vb);
  /* Every anchor x must sit far enough inside that a ~34px label still lands
     within the box. Checked against the real emitted text elements rather
     than recomputed geometry, so it fails if the label radius is retuned. */
  const ends = [];
  svg.replace(/<text x="(-?[\d.]+)"[^>]*text-anchor="end"/g,
    (m, x) => { ends.push(Number(x)); return m });
  check('at least one label really is end-anchored (the case that clipped)',
    ends.length > 0);
  check('every end-anchored label has room for its text inside the viewBox',
    ends.every((x) => x - 34 >= vbN[0]),
    `anchors ${ends.join(',')} against left edge ${vbN[0]}`);
  const ghosted = A.rpHexRadar(loss, zero);
  check('a ghost adds a dashed polygon', /stroke-dasharray/.test(ghosted));
  check('...and no ghost means no dashed polygon', !/stroke-dasharray/.test(svg));

  // ---- 3 & 4. the ghost is the best PREVIOUS shift ------------------------
  function histRow(over) {
    return Object.assign({
      ts: Date.now(), city: 'austin', day: 1, shiftNo: 1,
      workedH: 8, billedH: 24, gross: 400, commission: 100, cost: 300, net: 100,
      miles: 200, rides: 25, safety: 80, cash: 1000, cars: 1,
    }, over);
  }

  // Shift 1: the only row is the one being reported.
  A.setHistory([histRow({ shiftNo: 1 })]);
  let block = A.rpRadarBlock();
  check('shift 1 renders a chart', /<svg/.test(block));
  check('...with no ghost outline', !/stroke-dasharray/.test(block));
  check('...and an empty ghost key, so the CSS collapses it',
    /<div class="rp-ghost"><\/div>/.test(block), block.slice(-120));

  // Two earlier shifts, the better of which must be the ghost.
  A.setHistory([
    histRow({ shiftNo: 1, net: 50 }),
    histRow({ shiftNo: 2, net: 250 }),
    histRow({ shiftNo: 3, net: 10 }),   // the one being reported
  ]);
  block = A.rpRadarBlock();
  check('with history, a ghost outline is drawn', /stroke-dasharray/.test(block));
  check('the ghost key names the best PREVIOUS net, not this shift\'s',
    block.includes(A.money2(250)) && !block.includes(A.money2(10)), block.slice(-160));

  // A new personal best must not ghost itself.
  A.setHistory([
    histRow({ shiftNo: 1, net: 50 }),
    histRow({ shiftNo: 2, net: 900 }),  // reported, and the best ever
  ]);
  block = A.rpRadarBlock();
  check('a new personal best ghosts the PREVIOUS best, not itself',
    block.includes(A.money2(50)) && !block.includes(A.money2(900)), block.slice(-160));

  // Other cities' shifts are not this city's benchmark.
  A.setHistory([
    histRow({ shiftNo: 1, city: 'dallas', net: 5000 }),
    histRow({ shiftNo: 2, city: 'austin', net: 100 }),
  ]);
  block = A.rpRadarBlock();
  check('a different city\'s shift is not used as this city\'s ghost',
    !/stroke-dasharray/.test(block) && !block.includes(A.money2(5000)));

  // ---- 2. shared denominators: the ghost must not trace the live shape ----
  /* Same city, ghost drove/served strictly more. If each shape were scaled
     against itself both would hit 1.0 on Miles and Rides and the outlines
     would coincide. Compare the computed fractions directly. */
  const cur = histRow({ shiftNo: 2, miles: 100, rides: 10, net: 100 });
  const old = histRow({ shiftNo: 1, miles: 200, rides: 20, net: 400 });
  const shared = { miles: 200, rides: 20 };
  const vCur = A.rpRadarVals(cur, shared);
  const vOld = A.rpRadarVals(old, shared);
  check('the weaker shift scores strictly lower on Miles against a shared peak',
    vCur[2] < vOld[2] && vOld[2] === 1, `${vCur[2]} vs ${vOld[2]}`);
  check('...and on Rides', vCur[3] < vOld[3] && vOld[3] === 1, `${vCur[3]} vs ${vOld[3]}`);

  // ---- it actually reaches the report ------------------------------------
  A.newFleet('austin');
  S.cash = 1e6; A.PROG().companyCash = 1e6;
  A.acquire('cab', 'buy');
  A.setHistory([histRow({ shiftNo: 1 })]);
  A.shiftReport();
  check('the report body contains the chart and the legend',
    /<svg/.test($('rp-body').innerHTML) &&
    /rp-axkey/.test($('rp-body').innerHTML));
  check('the chart is ABOVE the first stat row, as on admin\'s Cars cards',
    $('rp-body').innerHTML.indexOf('<svg') <
    $('rp-body').innerHTML.indexOf('Rides completed'));
  check('no NaN reaches the player', !/NaN/.test($('rp-body').innerHTML));

  /* ---- 0.50.1: it all has to FIT, without the sheet scrolling ------------
     Three per-distance readouts moved out of the ledger into the column
     beside the chart, and 'Shift length' was deleted outright as a duplicate.
     jsdom does no layout, so height cannot be measured here — what IS
     assertable is the structure that bought the height back, and the
     duplication that must not come back. */
  const body = $('rp-body').innerHTML;
  check('the chart and the side column are siblings in a .rp-top row',
    /class="rp-top"/.test(body) && /class="rp-side"/.test(body));
  check('the three per-distance readouts are in the side column, not the ledger',
    /rp-mini/.test(body) && /Distance driven/.test(body) &&
    /Operating cost/.test(body) && /Platform take rate/.test(body));
  check('...and none of them is also a full-width .rp-row any more',
    !/<div class="rp-row"><span>Distance driven/.test(body));
  /* The duplicate that cost a row: 'Shift length' and 'Hours worked' were
     both S.workedSec/3600 under two different names. */
  check('"Shift length" is gone — it was "Hours worked" printed twice',
    !/Shift length/.test(body));
  check('...and "Hours worked" is the one that stayed',
    /Hours worked/.test(body));
  check('the hours-billed line no longer carries the sentence that wrapped',
    /Hours billed/.test(body) && !/whether you work or not/.test(body));

  // With no history at all the block is empty and the report still renders.
  A.setHistory([]);
  A.shiftReport();
  /* The chart needs a history row; the ledger does not. A report with no
     chart must still be a complete report — this is the bankruptcy-adjacent
     path where a row was never filed. */
  check('no history means no chart, and the rows still render',
    !/<svg/.test($('rp-body').innerHTML) &&
    /Rides completed/.test($('rp-body').innerHTML) &&
    /Hours billed/.test($('rp-body').innerHTML));
  check('...and no orphaned side column without a chart to annotate',
    !/rp-top/.test($('rp-body').innerHTML));
  /* The readouts live inside the chart block now, so "no chart" must not
     silently take three real numbers about this shift down with it. */
  check('...but the per-distance readouts survive, as their own row',
    /rp-nochart/.test($('rp-body').innerHTML) &&
    /Distance driven/.test($('rp-body').innerHTML) &&
    /Platform take rate/.test($('rp-body').innerHTML));

  console.log(failures === 0
    ? 'All shift-hexagraph checks passed.'
    : `${failures} shift-hexagraph check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1) });
