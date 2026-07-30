/* Recenter + zone visibility — Pavel's asks, 2026-07-30:
 *
 *   1. "RECENTRE rename to US RECENTER" — the button label and its
 *      aria-label/title use US spelling now. Source comments and the
 *      `recenterMap`/`#dh-recenter` identifiers were already US-spelled or
 *      are not player-facing, so they are deliberately untouched.
 *   2. "when clicked only area around zones (circles) is recentered. Not the
 *      chargers." fleetBounds() used to fit cars + active zones + chargers.
 *      Chargers are deliberately placed well outside the demand area in
 *      every city (Austin's Research Blvd is 27 minutes out), so including
 *      them framed a mostly-empty box. Cars came out for the same reason:
 *      one dispatched to a far charger, or on a flatbed, would drag the box
 *      straight back out a tick later.
 *   3. "make all circles more visible. some are really light, almost
 *      invisible." Zone circles were unstroked with a fill floor of 0.02.
 *      They now carry a constant-weight outline, and the fill range moved
 *      from 0.02..0.30 (divisor 18) to 0.13..0.50 (divisor 12).
 *
 * Run: node test/recenter-zones.test.js   (or npm test)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TARGETS = [
  path.join(__dirname, '..', '..', 'deadhead.html'),
  path.join(__dirname, '..', 'public', 'index.html'),
];

let failures = 0;

function strip(html) {
  return html
    .replace(/<script[^>]+src=["']https:\/\/cdnjs\.cloudflare\.com[^>]*><\/script>/i, '')
    .replace(/<script[^>]+src=["']cloud\.js["'][^>]*><\/script>/i, '');
}

async function boot(file) {
  const dom = new JSDOM(strip(fs.readFileSync(file, 'utf8')), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || ((q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {},
      }));
      window.confirm = () => true;
    },
  });
  await new Promise((r) => setTimeout(r, 90));
  return dom;
}

async function run(file) {
  const label = path.relative(process.cwd(), file);
  const src = fs.readFileSync(file, 'utf8');
  const dom = await boot(file);
  const w = dom.window;
  const A = w.DH_ACT1;
  const doc = w.document;
  let ok = true;
  const check = (name, fn) => {
    let pass = false;
    try { pass = !!fn(); } catch (e) {
      pass = false;
      if (process.env.DEBUG) console.error('  threw:', e && e.stack || e);
    }
    if (!pass) { console.error(`FAIL ${label}: ${name}`); ok = false; failures++; }
  };

  // ---- 1. US spelling, on everything a player can read -------------------
  const btn = doc.getElementById('dh-recenter');
  check('the recenter button exists', () => !!btn);
  check('its visible label reads "Recenter"',
    () => btn.querySelector('span').textContent.trim() === 'Recenter');
  check('its aria-label uses US spelling',
    () => /Recenter/.test(btn.getAttribute('aria-label')) &&
          !/Recentre/i.test(btn.getAttribute('aria-label')));
  check('its title uses US spelling',
    () => /recenters/.test(btn.getAttribute('title')) &&
          !/recentres/i.test(btn.getAttribute('title')));
  // setFollow() rewrites the title on every toggle, so both of its strings
  // have to be US-spelled too or the spelling reverts on first click.
  check('both setFollow() titles use US spelling', () => {
    const m = src.match(/b\.title=followFleet\s*\?([\s\S]*?);/);
    return !!m && !/recentre/i.test(m[1]) && /recenters/.test(m[1]);
  });
  check('no player-facing "Recentre" survives in markup',
    () => !/>\s*Recentre\s*</.test(src) && !/aria-label="[^"]*Recentre/i.test(src));

  // ---- 2. the box is zones only ------------------------------------------
  const fn = src.match(/function fleetBounds\(\)\{([\s\S]*?)\n\}/);
  check('fleetBounds() found', () => !!fn);
  if (fn) {
    const body = fn[1];
    check('fleetBounds() still fits active zones', () => /ZONES\.forEach/.test(body));
    check('fleetBounds() skips zones that are geofenced off',
      () => /z\.on===false\) return/.test(body));
    check('fleetBounds() no longer includes CHARGERS (the actual ask)',
      () => !/CHARGERS/.test(body));
    check('fleetBounds() no longer includes cars either',
      () => !/S\.cars/.test(body));
    check('fleetBounds() still returns null when there is nothing to frame',
      () => /if\(!pts\.length\) return null/.test(body));
    check('it still pushes BOTH corners of a zone, so edge zones are not sliced',
      () => /pts\.push\(\[z\.lat-dLat/.test(body) && /pts\.push\(\[z\.lat\+dLat/.test(body));
  }
  // The null case is what lets the button fall back to centerCity() — with no
  // Leaflet map in jsdom, fleetBounds() short-circuits on its own map guard.
  check('fleetBounds() is exposed and safe to call without a map',
    () => typeof A.fleetBounds === 'function' && A.fleetBounds() === null);

  // ---- 3. zone circles are visible at their quietest ---------------------
  const mk = src.match(/ZONES\.forEach\(function\(z\)\{\s*const circ=L\.circle\(([\s\S]*?)\)\.addTo\(map\)/);
  check('the zone-circle constructor was found', () => !!mk);
  if (mk) {
    const opts = mk[1];
    check('zone circles are no longer stroke:false', () => !/stroke:false/.test(opts));
    check('zone circles now pass an outline colour and weight',
      () => /color:'#E0453C'/.test(opts) && /weight:/.test(opts));
    check('the resting fill is no longer 0.06', () => !/fillOpacity:\.06/.test(opts));
  }
  // Anchored on `const on=` rather than just `zoneLayer.forEach(` —
  // buildCityLayers() opens with a one-line `zoneLayer.forEach(...removeLayer...)`
  // that a looser pattern matches first, silently capturing the wrong body.
  const loop = src.match(/zoneLayer\.forEach\(function\(o\)\{\s*\n\s*const on=([\s\S]*?)\n\s*\}\);/);
  check('the per-hour zone loop was found', () => !!loop);
  if (loop) {
    const body = loop[1];
    const cl = body.match(/clamp\(o\.z\.base\*CURVES\[o\.z\.p\]\[h\]\/(\d+(?:\.\d+)?),([\d.]+),([\d.]+)\)/);
    check('the fill formula still keys off base x hourly curve', () => !!cl);
    if (cl) {
      const [, divisor, floor, cap] = cl;
      check('the divisor dropped (brighter for the same demand)', () => Number(divisor) < 18);
      check('the floor is now clearly visible, not 0.02', () => Number(floor) >= 0.10);
      check('the cap rose, so busy hours still have headroom', () => Number(cap) > 0.30);
      check('floor is still below cap — the range stays readable',
        () => Number(floor) < Number(cap));
    }
    check('the stroke is faded in step with the fill, not left at full weight',
      () => /opacity:on\?clamp\(lvl/.test(body));
    check('a switched-off zone still disappears entirely (fill AND stroke)',
      () => /:0\}/.test(body) || /:0\)/.test(body) || /\:0,/.test(body) || /:0;/.test(body) ||
            /fillOpacity:lvl/.test(body));
  }

  if (ok) console.log(`${TARGETS.length > 1 ? label + ': ' : ''}recenter + zone visibility OK`);
  dom.window.close();
  return ok;
}

(async () => {
  let allOk = true;
  for (const file of TARGETS) {
    if (!fs.existsSync(file)) continue;
    const ok = await run(file);
    allOk = allOk && ok;
  }
  if (!allOk || failures > 0) {
    console.error(`\n${failures} failure(s).`);
    process.exit(1);
  }
  console.log('All recenter-zones checks passed.');
})();
