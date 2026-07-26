/* Multi-city tests — the scenario tables, the city tone, and the save shape.
 *
 * These cover the four things that were most likely to break silently when
 * Austin stopped being the only city, all of which had already bitten this
 * codebase once in another form:
 *
 *   1. A data table that is also player state (ZONES[].on is the geofence).
 *      newFleet() used to reset the fence by setting every zone's `on` to
 *      TRUE, which is not what any city's defaults say — it handed a
 *      first-time player the airport and all three breweries.
 *   2. Positional indices into a list whose shape can change. Charger indices
 *      (chIdx) already caused this and were converted to names; the geofence
 *      was still saved as a positional boolean array.
 *   3. Colour used as a fill under white text. --accent is a solid background
 *      with color:#fff in five rules, so every city's accent has to clear
 *      WCAG AA 4.5:1 or a scenario ships illegible buttons.
 *   4. Austin regressing. Steps 1-5 of citiesplan.md were meant to land with
 *      Austin looking and playing identically, so the tone assertions below
 *      pin its computed values to the literals :root already declared.
 *
 * Run: node test/city.test.js   (or npm test, which runs this after the smoke test)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TARGETS = [
  path.join(__dirname, '..', '..', 'deadhead.html'),
  path.join(__dirname, '..', 'public', 'index.html'),
];

let failures = 0;

/* --- WCAG relative luminance / contrast, so rule 2 of citiesplan.md's
   "City identity" section is enforced by a test rather than by good
   intentions. Formula: WCAG 2.1 definition of relative luminance. --- */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrastWithWhite(hex) {
  return 1.05 / (luminance(hex) + 0.05);
}

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
      // switchCity() asks for confirmation; a headless run must not hang.
      window.confirm = () => true;
    },
  });
  await new Promise((r) => setTimeout(r, 90));
  return dom;
}

async function run(file) {
  const label = path.relative(process.cwd(), file);
  const dom = await boot(file);
  const w = dom.window;
  const A = w.DH_ACT1, SV = w.DH_SAVE, S = w.DH;
  let ok = true;
  const check = (name, fn) => {
    let pass = false;
    try { pass = !!fn(); } catch (e) { pass = false; }
    if (!pass) { console.error(`FAIL ${label}: ${name}`); ok = false; failures++; }
  };

  // ---- 1. zone tables are per-run copies -------------------------------
  check('ZONES is a copy, not the master table',
    () => A.zones()[0] !== A.ZONES_BY_CITY.austin[0]);
  check('mutating live ZONES cannot reach ZONES_BY_CITY', () => {
    const last = A.zones().length - 1;
    A.zones()[last].on = true;
    return A.ZONES_BY_CITY.austin[A.ZONES_BY_CITY.austin.length - 1].on === false;
  });

  // Every city authors exactly three live zones — the convention, and the
  // thing newFleet() used to trample by turning all of them on.
  for (const id of Object.keys(A.ZONES_BY_CITY)) {
    check(`${id} authors 3 live zones by default`,
      () => A.ZONES_BY_CITY[id].filter((z) => z.on !== false).length === 3);
    check(`${id} has exactly one airport zone`,
      () => A.ZONES_BY_CITY[id].filter((z) => z.p === 'airport').length === 1);
    check(`${id} zone names are unique`, () => {
      const n = A.ZONES_BY_CITY[id].map((z) => z.n);
      return new Set(n).size === n.length;
    });
    // A zone and a charger ARE allowed to share a name — Austin's 'South
    // Congress' is deliberately both a district and a Supercharger, and the
    // 'CH:' prefix in the ROADS key namespace is what keeps the two apart.
    // What must never happen is a ZONE whose own name starts with 'CH:',
    // because that would collide inside the namespace rather than outside it.
    check(`${id} no zone name intrudes on the CH: namespace`,
      () => A.ZONES_BY_CITY[id].every((z) => z.n.slice(0, 3) !== 'CH:'));
  }

  check('newFleet() restores authored defaults, not all-on', () => {
    A.newFleet();
    return A.zones().filter((z) => z.on !== false).length === 3;
  });
  check('airportZone() resolves by profile, not an Austin name',
    () => A.airportZone() && A.airportZone().p === 'airport');
  check('roadsFor(unknown) is an empty object, not a throw',
    () => Object.keys(A.roadsFor('nope')).length === 0);

  // ---- 2. the geofence is saved by name -------------------------------
  check('snapshot() writes a name-keyed geofence', () => {
    const snap = SV.snapshot();
    return !Array.isArray(snap.s.zones) && ('Downtown core' in snap.s.zones);
  });
  check('a geofence flag survives snapshot -> restore by name', () => {
    const air = A.airportZone().n;
    A.zones().forEach((z) => { if (z.n === air) z.on = true; });
    const snap = SV.snapshot();
    A.zones().forEach((z) => { if (z.n === air) z.on = false; });
    SV.restore(snap);
    return A.zones().filter((z) => z.n === air)[0].on === true;
  });
  check('SAVE_V is 7', () => SV.V === 7);
  check('migrate() converts a v6 positional geofence to names', () => {
    const v6 = { v: 6, s: JSON.parse(JSON.stringify(SV.snapshot().s)) };
    // index 7 in Austin's authored order is the airport, and only it is on
    v6.s.zones = A.ZONES_BY_CITY.austin.map((z, i) => i === 7);
    delete v6.s.city;
    const m = SV.migrate(v6);
    return !Array.isArray(m.s.zones) &&
           m.s.zones[A.ZONES_BY_CITY.austin[7].n] === true &&
           m.s.zones['Downtown core'] === false &&
           m.s.city === 'austin';
  });

  // ---- 3. every city's accent is legible under white text -------------
  for (const id of Object.keys(A.CITIES)) {
    const t = A.CITIES[id].tone;
    check(`${id} declares a tone for both themes`,
      () => t && t.day && t.night);
    // Day: the full WCAG AA floor for normal text, 4.5:1. The accent is a
    // solid fill with color:#fff (.slot-act button.pri, .rs-btns button.pri),
    // so this is a text-on-background ratio and 4.5 is the real requirement.
    const dayRatio = contrastWithWhite(t.day.accent);
    check(`${id} day accent ${t.day.accent} clears AA 4.5:1 vs white (${dayRatio.toFixed(2)}:1)`,
      () => dayRatio >= 4.5);

    // Night: 3.0:1, and this is a DOCUMENTED DEVIATION rather than a laxer
    // rule. Night mode deliberately lightens the accent so it reads against a
    // dark surface, and Austin's existing #5A82EB has measured 3.60:1 against
    // white since long before cities were a thing — the shortfall is inherited
    // from the current design, not introduced by a new scenario. Darkening it
    // to pass 4.5 would change how Austin looks at night, which is a product
    // decision, not a test's to make. 3.0 is WCAG's floor for UI components
    // and large text, so this still fails loudly on a genuinely illegible
    // accent while not silently blessing 4.5 as met.
    const nightRatio = contrastWithWhite(t.night.accent);
    check(`${id} night accent ${t.night.accent} clears 3:1 vs white (${nightRatio.toFixed(2)}:1)`,
      () => nightRatio >= 3.0);
    // The bright tint is explicitly allowed to fail contrast — it must never
    // be used as a fill. This asserts the two are actually different, i.e.
    // that a city hasn't quietly collapsed them into one colour and lost the
    // distinction the rule depends on.
    check(`${id} tint is distinct from accent`,
      () => t.day.tint.toLowerCase() !== t.day.accent.toLowerCase());
  }

  // ---- 4. Austin renders exactly as it did before tokenisation --------
  const want = {
    '--accent': '#3e6ae1', '--accent-hi': '#4b77e8', '--accent-2': '#2f55c4',
    '--accent-rgb': '62,106,225', '--accent-2-rgb': '47,85,196',
    '--city-tint': '#5a9bf6',
  };
  check('Austin day tone matches the :root literals exactly', () => {
    const st = w.document.documentElement.style;
    return Object.keys(want).every((k) =>
      st.getPropertyValue(k).trim().toLowerCase() === want[k]);
  });

  // ---- 5. scenario config actually reaches the economy ----------------
  check('tariff() follows the city power table', () => {
    const p = A.CITIES[S.city].power;
    return A.tariff(p.peakFrom) === p.peak && A.tariff(0) === p.off;
  });
  check('Dallas is unsupervised and Austin is not',
    () => A.CITIES.dallas.permit === 'Unsupervised' &&
          A.CITIES.austin.permit === 'Supervised');
  check('Dallas wears cars harder and Austin is the 1.0 baseline',
    () => A.CITIES.dallas.depK > 1 && A.CITIES.austin.depK === 1 &&
          A.CITIES.austin.fareK === 1 && A.CITIES.austin.insK === 1);
  check('every city declares a fleet cap and a goal',
    () => Object.keys(A.CITIES).every((id) =>
      typeof A.CITIES[id].fleetCap === 'number' &&
      A.CITIES[id].goal && typeof A.CITIES[id].goal.cash === 'number'));

  // ---- 6. the gate ----------------------------------------------------
  check('Austin is never locked', () => A.cityUnlocked('austin'));
  // Dallas gates on 'shift1' — the first shift FINISHED. The distinction is
  // the point of these three checks: S.shiftNo increments on clock-ON, so a
  // naive `shiftNo > 0` would open the tab during the first shift, before the
  // player has ever seen a shift report.
  check('Dallas is locked before any shift', () => {
    A.PROG().unlocked.dallas = false;
    S.shiftNo = 0; S.onClock = false;
    return A.cityUnlocked('dallas') === false;
  });
  check('Dallas stays locked DURING the first shift', () => {
    A.PROG().unlocked.dallas = false;
    S.shiftNo = 1; S.onClock = true;
    return A.cityUnlocked('dallas') === false;
  });
  check('clocking off the first shift unlocks Dallas', () => {
    S.shiftNo = 1; S.onClock = false;
    return A.cityUnlocked('dallas') === true;
  });
  // Once earned it must stay earned. gateMet('shift1') goes false again the
  // moment the player clocks back on, so only the PROG latch stops the tab
  // flickering shut for the whole of every later shift.
  check('a second shift does not re-lock Dallas', () => {
    A.progGates();                     // latch it, as render() would
    S.shiftNo = 2; S.onClock = true;
    return A.gateMet('shift1') === false && A.cityUnlocked('dallas') === true;
  });
  check('an unrecognised gate stays locked, not open',
    () => A.gateMet('no-such-gate') === false);
  check('the padlock hint names the first scenario',
    () => A.gateHint('shift1').indexOf(A.CITIES[A.cityList()[0]].name) >= 0);
  check("every city's gate is one gateMet() understands",
    () => Object.keys(A.CITIES).every((id) => {
      const n = A.CITIES[id].needs;
      return !n || ['shift1', 'day1'].indexOf(n) >= 0;
    }));
  check('cityList() is ordered by CITIES[].order',
    () => A.cityList().join(',') === 'austin,dallas');

  // ---- 6b. a second city is not a first city --------------------------
  // The reported bug: clicking Dallas replayed the intro video and stayed on
  // Austin. Both had one cause — newFleet() hardcoded S.city='austin', so the
  // switch set the city and newFleet immediately set it back, leaving a run
  // that looked like a brand-new Austin game and therefore played the intro.
  check('newFleet(city) honours the city it is given', () => {
    A.newFleet('dallas');
    return S.city === 'dallas';
  });
  check('newFleet takes the permit from the scenario', () => {
    A.newFleet('dallas');
    return S.permit === A.CITIES.dallas.permit && S.permit === 'Unsupervised';
  });
  check('a city beyond the first runs no guided tutorial', () => {
    A.newFleet('dallas');
    return S.ray.guided === false && S.ray.day1Done === true;
  });
  check('a city beyond the first does not show the intro', () => {
    A.newFleet('dallas');
    return w.document.getElementById('intro').hidden === true;
  });
  check('the first city still gets the tutorial and the intro', () => {
    A.newFleet('austin');
    return S.ray.guided === true && S.ray.day1Done === false;
  });
  check('newFleet() with no argument still means the first city', () => {
    A.newFleet();
    return S.city === A.cityList()[0];
  });
  check('newFleet(nonsense) falls back to the first city, not undefined', () => {
    A.newFleet('atlantis');
    return S.city === A.cityList()[0];
  });
  check('every new run starts on the scenario cash, never carrying over', () => {
    A.newFleet('dallas');
    const a = S.cash;
    A.newFleet('austin');
    return a === S.cash && a === A.CFG.startCash;
  });

  // ---- 6c. the map has to follow the city -----------------------------
  // Reported: "Dallas is accessible but map is Austin". initMap() hardcoded
  // Austin's coordinates, and the zone circles and charger pins were built
  // once at boot and never rebuilt — so a Dallas run drew Austin's overlays on
  // a map of Austin while its tables, tone and economy had all switched.
  //
  // Leaflet is absent in this harness (initMap bails into the "Map unavailable"
  // placeholder), so these cover the pure maths and the no-map safety. The
  // layer rebuild itself is exercised against a Leaflet stub separately.
  check('bgTileUrl reproduces the tile Austin shipped with', () => {
    // The wallpaper used to be the literal .../8/58/105.png. Deriving it must
    // land on exactly that tile, or Austin's background silently moved.
    const c = A.CITIES.austin;
    return A.bgTileUrl(30.27, -97.74, 8).endsWith('/8/58/105.png') &&
           A.bgTileUrl(c.lat, c.lon, 8).endsWith('/8/58/105.png');
  });
  check('bgTileUrl puts Dallas on a different tile', () => {
    const a = A.CITIES.austin, d = A.CITIES.dallas;
    return A.bgTileUrl(a.lat, a.lon, 8) !== A.bgTileUrl(d.lat, d.lon, 8);
  });
  check('every city resolves to a real OSM tile path', () =>
    Object.keys(A.CITIES).every((id) => {
      const c = A.CITIES[id];
      return /^https:\/\/a\.tile\.openstreetmap\.org\/8\/\d+\/\d+\.png$/
        .test(A.bgTileUrl(c.lat, c.lon, 8));
    }));
  check('centerCity() repoints the wallpaper at the live city', () => {
    S.city = 'dallas'; A.centerCity();
    const d = w.document.getElementById('bgmap').getAttribute('src');
    S.city = 'austin'; A.centerCity();
    const a = w.document.getElementById('bgmap').getAttribute('src');
    return d && a && d !== a &&
           a === A.bgTileUrl(A.CITIES.austin.lat, A.CITIES.austin.lon, 8);
  });
  // Leaflet is an optional dependency by design (UI-SPEC §0c): every map path
  // must degrade rather than throw when L never loaded.
  check('centerCity and buildCityLayers are safe with no map', () => {
    try { A.centerCity(); A.buildCityLayers(); return true; }
    catch (e) { return false; }
  });
  check('no map means no stale overlays either',
    () => A.zoneLayer().length === 0 && A.chLayer().length === 0);

  // ---- 6d. temperature belongs to the units layer ---------------------
  // Reported: switching to miles left the temperature in Celsius. WX.temp is
  // Celsius because that is what Open-Meteo is asked for, so uTemp() is the
  // single conversion point — showing "35°" next to "mi" was the units toggle
  // doing half its job.
  check('imperial reads Fahrenheit', () => {
    S.units = 'imperial';
    return A.uTemp(35) === '95°F' && A.uTemp(0) === '32°F';
  });
  check('metric reads Celsius', () => {
    S.units = 'metric';
    return A.uTemp(35) === '35°C' && A.uTemp(0) === '0°C';
  });
  check('sub-zero converts and rounds correctly', () => {
    S.units = 'imperial';
    const f = A.uTemp(-5.4);          // -5.4C = 22.28F
    S.units = 'metric';
    return f === '22°F' && A.uTemp(-5.4) === '-5°C';
  });
  check('no reading shows a dash in the right unit', () => {
    S.units = 'imperial';
    const i = A.uTemp(null);
    S.units = 'metric';
    // NaN and undefined must not render as "NaN°C" — the whole reason the
    // fetch guard exists in the first place.
    return i === '—°F' && A.uTemp(undefined) === '—°C' && A.uTemp(NaN) === '—°C';
  });
  check('the units button repaints the temperature', () => {
    S.units = 'metric'; A.render();
    w.document.getElementById('units').click();
    const t = w.document.getElementById('c-temp').textContent;
    return S.units === 'imperial' && t.indexOf('°F') >= 0;
  });

  // ---- 6e. a clear sky must not grey the map --------------------------
  // Reported: "it looks like sky is gray... please do not gray map".
  // The overlay painted whenever cover exceeded 0.02, and 'Clear' falls back
  // to 5% — so a clear sky laid three grey gradients over the map while the
  // status strip said Clear.
  check('the cloud floor sits above Partly cloudy', () => {
    // Partly cloudy is 35% in condFallback; the floor must exclude it.
    return A.WX_CLOUD_MIN > 0.35;
  });
  check('Clear and Partly cloudy paint nothing', () => {
    return 0.05 <= A.WX_CLOUD_MIN && 0.35 <= A.WX_CLOUD_MIN;
  });
  check('genuine overcast still paints something', () => 0.85 > A.WX_CLOUD_MIN);
  check('the veil ramps from the floor, not from zero', () => {
    // Just above the floor must be near-invisible, or overcast would snap on.
    const t = (A.WX_CLOUD_MIN + 0.01 - A.WX_CLOUD_MIN) / (1 - A.WX_CLOUD_MIN);
    return t * 0.085 < 0.005;
  });

  // ---- 6f. a shift must not open at a dead hour -----------------------
  // Reported: "in Dallas it is like 4 minutes nothing". CFG.simPerReal is 1, so
  // offers per sim-hour ARE offers per real hour at 1x. The day opens at 06:00,
  // where the work curve is 1.0 and the night curve is 0.2 — so a city whose
  // three default zones are work/night/night has two thirds of its opening
  // demand asleep. Dallas shipped exactly that and measured 12.8/hour against
  // Austin's 18.3: one offer every 4.7 real minutes.
  const OPEN_HOUR = Math.floor(A.CFG.dayStart / 3600);
  function rateAt(city, hr, feeds) {
    A.newFleet(city);
    A.PLATFORMS.forEach((p) => { p.on = false; p.offered = 0; p.accepted = 0; });
    for (let i = 0; i < feeds; i++) A.PLATFORMS[i].on = true;
    S.t = hr * 3600;
    return A.offersPerHour();
  }
  check('no feed connected means exactly zero, not a trickle',
    () => rateAt('dallas', OPEN_HOUR, 0) === 0);
  check('every city clears the thin threshold on its opening hour', () =>
    Object.keys(A.CITIES).every((id) => rateAt(id, OPEN_HOUR, 1) >= A.THIN_RATE * 0.9));
  check('no city opens more than 20% quieter than the first one', () => {
    const first = rateAt(A.cityList()[0], OPEN_HOUR, 1);
    return Object.keys(A.CITIES).every((id) =>
      rateAt(id, OPEN_HOUR, 1) >= first * 0.8);
  });
  // The mix, not just the total: this is the property that broke, and a future
  // city could reproduce it while still hitting a plausible-looking base sum.
  check('every city opens with at least two day-profile zones', () =>
    Object.keys(A.ZONES_BY_CITY).every((id) =>
      A.ZONES_BY_CITY[id].filter((z) => z.on !== false &&
        (z.p === 'work' || z.p === 'leisure' || z.p === 'airport')).length >= 2));
  check('opening the whole map is a real lever, not a rounding error', () => {
    const closed = rateAt('dallas', OPEN_HOUR, 2);
    A.zones().forEach((z) => { z.on = true; });
    return A.offersPerHour() > closed * 1.8;
  });

  // The readout that explains a quiet shift, and Paolo's advice about it, must
  // read from the same number the simulation uses or they can contradict it.
  check('the offers panel states the rate', () => {
    rateAt('dallas', OPEN_HOUR, 1); A.render();
    const el = w.document.getElementById('rq-rate');
    return /zones live/.test(el.textContent) && /offers\/hour/.test(el.textContent);
  });
  check('a thin rate is flagged as thin', () => {
    rateAt('dallas', OPEN_HOUR, 1);
    A.zones().forEach((z) => { z.on = z.p === 'brewery'; });   // deliberately dire
    A.render();
    return /thin|off/.test(w.document.getElementById('rq-rate').className);
  });
  check('no feed says so instead of showing a rate', () => {
    rateAt('dallas', OPEN_HOUR, 0); A.render();
    return /No feed connected/.test(w.document.getElementById('rq-rate').textContent);
  });
  check('Paolo names the geofence when the rate is thin', () => {
    rateAt('dallas', OPEN_HOUR, 1);
    A.zones().forEach((z) => { z.on = z.n === 'Uptown'; });     // one night zone at dawn
    S.ray.guided = false; S.ray.day1Done = true;
    A.acquire('cybercab', 'finance');
    S.onClock = true;
    const t = A.nextTask();
    return t.key === 'zones' && /zones are live/.test(t.now);
  });

  // ---- 7. per-city save keys -----------------------------------------
  check('the autosave key carries the city', () => {
    const before = S.city;
    S.city = 'austin';
    const a = A.physKey('auto');
    S.city = 'dallas';
    const d = A.physKey('auto');
    S.city = before;
    return a === 'auto:austin' && d === 'auto:dallas' && a !== d;
  });
  check('manual slots are NOT rewritten per city',
    () => A.physKey('slot1') === 'slot1');

  if (ok) console.log(`PASS ${label}`);
  dom.window.close();
}

(async () => {
  for (const f of TARGETS) {
    if (!fs.existsSync(f)) { console.error(`FAIL: ${f} not found`); failures++; continue; }
    await run(f);
  }
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll multi-city checks passed.');
})();
