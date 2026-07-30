/* City pins on the map + map-header weather — Pavel's ask, 2026-07-30:
 *
 *   1. "Cities modal is ugly. Remove it." — the separate stylised
 *      "Cities" overview popup (a hand-drawn non-Leaflet US blob with
 *      per-city dots, CITOV_POS/CITOV_OUTLINE/renderCitiesOverview()) is
 *      gone. Its replacement: one real L.marker per OTHER unlocked city,
 *      at that city's actual lat/lon, directly on the live Leaflet map —
 *      so zooming/panning the real map out far enough reveals them, same
 *      switchCity() the topbar tab strip already uses.
 *   2. "MAIN FLEET VIEW strip... useless icons (fullscreen), arrow. Let's
 *      use it exclusively for Weather" — the decorative #i-nav ("arrow")
 *      and #i-expand ("fullscreen") icons in the map's own header bar,
 *      neither of which was ever wired to a click handler, are replaced
 *      with a live condition+temperature readout fed by the same WX/
 *      uTemp() the top status bar's #wx-grp already uses.
 *
 * Leaflet itself is never loaded in this jsdom harness (the cdnjs <script>
 * tag is stripped so tests don't need network access — same as every other
 * test file in this suite), so `map` stays null and buildCityPinLayer()'s
 * own `if(!map) return` guard makes it a no-op here. That's consistent with
 * how the rest of the suite treats Leaflet: nothing here tries to assert
 * real marker objects exist (city.test.js, stranded.test.js etc. don't
 * either) — this checks the FILTERING LOGIC and WIRING at the source level
 * instead, the same technique theme-toggle-perf.test.js and
 * narrow-charge-row.test.js already use for CSS that jsdom can't compute.
 * The actual on-map rendering was confirmed visually via a headless
 * Playwright screenshot (see COMMIT_0.57.0.txt), not by this file.
 *
 * Run: node test/city-pins-and-weather.test.js   (or npm test)
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

  // ---- the old modal is fully gone, not just hidden ----------------------
  check('no #cities-overview element remains', () => !doc.getElementById('cities-overview'));
  check('no #citov-btn trigger remains', () => !doc.getElementById('citov-btn'));
  check('no citov-* identifiers survive anywhere in source', () => !/citov/i.test(src));
  check('MODAL_IDS no longer lists cities-overview',
    () => !/MODAL_IDS=\[[^\]]*cities-overview/.test(src));
  check('the Escape-key handler no longer branches on cities-overview',
    () => !/cities-overview.*closeCitiesOverview/.test(src));

  // ---- buildCityPinLayer() exists, and is a safe no-op without a map -----
  check('buildCityPinLayer is exposed', () => typeof A.buildCityPinLayer === 'function');
  check('cityPinLayer accessor is exposed', () => typeof A.cityPinLayer === 'function');
  check('calling buildCityPinLayer() with no Leaflet map does not throw', () => {
    A.buildCityPinLayer();
    return true;
  });
  check('cityPinLayer() starts as an empty object (no map to have populated it)',
    () => typeof A.cityPinLayer() === 'object' && Object.keys(A.cityPinLayer()).length === 0);

  // ---- filtering logic, at the source level (map is unavailable to test
  //      live in jsdom — see file header) --------------------------------
  const fnMatch = src.match(/function buildCityPinLayer\(\)\{([\s\S]*?)\n\}/);
  check('buildCityPinLayer() function body found', () => !!fnMatch);
  if (fnMatch) {
    const body = fnMatch[1];
    check('skips the CURRENT city', () => /id===S\.city/.test(body));
    check('skips any LOCKED city', () => /!cityUnlocked\(id\)/.test(body));
    check('reads the real CITIES lat/lon, not a hand-tuned position table',
      () => /c\.lat/.test(body) && /c\.lon/.test(body));
    check('clicking a pin calls switchCity(id) — same entry point as the topbar tabs',
      () => /switchCity\(id\)/.test(body));
    check('rebuilds wholesale (removes every existing layer first)',
      () => /map\.removeLayer\(cityPinLayer\[id\]\)/.test(body));
  }

  // ---- every unlockable city really does carry lat/lon (feeds the pin) ---
  check('every city in CITIES has real lat/lon coordinates', () => {
    return Object.keys(A.CITIES).every((id) => {
      const c = A.CITIES[id];
      return typeof c.lat === 'number' && typeof c.lon === 'number';
    });
  });

  // ---- initMap()/switchCity()/progGates() all call the rebuild -----------
  check('initMap() calls buildCityPinLayer()',
    () => /function initMap\(\)\{[\s\S]{0,700}?buildCityPinLayer\(\)/.test(src));
  check('switchCity()\'s success path calls buildCityPinLayer()',
    () => /renderCityTabs\(\); render\(\); drawMap\(\); paintUnits\(\); buildCityPinLayer\(\);/.test(src));
  check('progGates() calls buildCityPinLayer() right after a city unlocks',
    () => /renderCityTabs\(\);\s*\n\s*buildCityPinLayer\(\);/.test(src));

  // ---- map header weather -------------------------------------------------
  check('#mv-wx exists in the map header, not the removed icons',
    () => !!doc.getElementById('mv-wx') && !!doc.getElementById('mv-cond') && !!doc.getElementById('mv-temp'));
  check('the decorative arrow/fullscreen icons are gone from the cardbar', () => {
    const bar = doc.querySelector('.t-cardbar');
    if (!bar) return false;
    const uses = Array.from(bar.querySelectorAll('use')).map((u) => u.getAttribute('href'));
    return !uses.includes('#i-nav') && !uses.includes('#i-expand');
  });
  check('the (i) help button is still present (only the two dead icons were removed)',
    () => !!doc.querySelector('.t-cardbar .ihelp'));
  check('the menu icon at the start of the bar is untouched (only arrow + fullscreen were dead)',
    () => {
      const bar = doc.querySelector('.t-cardbar');
      const uses = Array.from(bar.querySelectorAll('use')).map((u) => u.getAttribute('href'));
      return uses.includes('#i-menu');
    });

  // ---- weather wiring, at the source level (WX is a closure-scoped `let`,
  //      not reachable from outside — same reasoning as the render() note
  //      in fresh-run-clock.test.js for values the harness can't inject) --
  check('#mv-cond is driven from WX.cond, same source as #wx-grp\'s #c-cond',
    () => /\$\('mv-cond'\)\.textContent=wxOff\?'—':WX\.cond;/.test(src));
  check('#mv-temp is driven through uTemp(WX.temp), same helper #wx-grp uses',
    () => /\$\('mv-temp'\)\.textContent=uTemp\(wxOff\?null:WX\.temp\);/.test(src));
  check('the map-header weather group has an offline state, same convention as #wx-grp',
    () => /mvwx\.classList\.toggle\('wx-off',wxOff\);/.test(src));

  if (ok) console.log(`${TARGETS.length > 1 ? label + ': ' : ''}city pins + map weather OK`);
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
  console.log('All city-pins-and-weather checks passed.');
})();
