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
  // DEBUG=1 prints the exception behind a failure. A swallowed throw and a
  // returned false look identical in the output otherwise, which cost real time
  // when a check started failing only in sequence with its neighbours.
  const check = (name, fn) => {
    let pass = false;
    try { pass = !!fn(); } catch (e) {
      pass = false;
      if (process.env.DEBUG) console.error('  threw:', e && e.stack || e);
    }
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
    // AT MOST one, not exactly one. This was `=== 1` until Miami, whose real
    // geofence excludes MIA entirely — the first scenario with no airport run
    // at all. Two zones with p:'airport' would still be a bug, because
    // airportZone() returns the first and the policy toggle would silently
    // control one of them.
    check(`${id} has no more than one airport zone`,
      () => A.ZONES_BY_CITY[id].filter((z) => z.p === 'airport').length <= 1);
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
  check('migrate() converts a v6 positional geofence to names', () => {
    // v6 -> v8 in one pass: migrate() cascades, so this also runs the v7 and
    // v8 blocks. That is the point of the ascending order.
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

    // Night: the SAME 4.5:1 floor as day, as of v0.24.0. This used to be a
    // documented 3.0 deviation, because night mode lightened the accent to
    // read against a dark surface and Austin's #5A82EB had measured 3.60:1
    // since long before cities existed. The deviation was wrong in a way the
    // comment defended rather than fixed: the token is a solid FILL under
    // white text, so the surface behind it is irrelevant and 4.5 was always
    // the real requirement. Every city's night accent was darkened to the
    // lightest value of its own hue that clears it, which changes how night
    // mode looks — deliberately, and with Pavel's sign-off.
    const nightRatio = contrastWithWhite(t.night.accent);
    check(`${id} night accent ${t.night.accent} clears AA 4.5:1 vs white (${nightRatio.toFixed(2)}:1)`,
      () => nightRatio >= 4.5);
    // The gradient's lighter top stop is the lightest pixel any white label
    // actually sits on, so it gets a floor too — 4.0, not 4.5, and that gap is
    // a real deviation rather than a hidden one. Austin's DAY hi has measured
    // 4.12:1 since the gradient existed; holding `hi` to 4.5 would mean
    // hi === accent and no gradient at all in any city or theme.
    for (const th of ['day', 'night']) {
      const hiRatio = contrastWithWhite(t[th].hi);
      check(`${id} ${th} gradient top ${t[th].hi} clears 4:1 vs white (${hiRatio.toFixed(2)}:1)`,
        () => hiRatio >= 4.0);
      check(`${id} ${th} gradient runs light-to-dark`,
        () => contrastWithWhite(t[th].hi) < contrastWithWhite(t[th].accent));
    }
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
  // ---- 5m. Miami: the scenario that is defined by what it lacks ---------
  check('Miami has no airport zone at all',
    () => A.ZONES_BY_CITY.miami.filter((z) => z.p === 'airport').length === 0);
  check('airportZone() returns null in Miami rather than throwing', () => {
    S.city = 'miami'; A.loadCityTables();
    return A.airportZone() === null;
  });
  check('the airport toggle disables itself where there is no airport', () => {
    S.city = 'miami'; A.loadCityTables(); A.render();
    const b = w.document.getElementById('dp-air');
    return b.disabled === true && /No airport/.test(b.title);
  });
  check('the airport toggle is live again in a city that has one', () => {
    S.city = 'austin'; A.loadCityTables(); A.render();
    const b = w.document.getElementById('dp-air');
    return b.disabled === false;
  });
  // FPL's summer on-peak window is noon to 21:00 — nine hours where Austin has
  // five. This is the harshest single number in the game and it is a published
  // tariff, so it is worth a test that would notice it being "balanced" away.
  check('Miami power is expensive across the whole afternoon', () => {
    S.city = 'miami'; A.loadCityTables();
    const p = A.CITIES.miami.power;
    return p.peakTo - p.peakFrom === 9 && A.tariff(13) === p.peak &&
           A.tariff(13) > A.tariff(11);
  });
  check('Austin still has its five-hour evening peak', () => {
    S.city = 'austin'; A.loadCityTables();
    const p = A.CITIES.austin.power;
    return p.peakTo - p.peakFrom === 5 && A.tariff(13) === p.mid;
  });
  check('Miami charges slowly — its best site is beaten by Dallas', () => {
    const bestM = Math.max.apply(null, A.CHARGERS_BY_CITY.miami.map((c) => c.kw));
    const bestD = Math.max.apply(null, A.CHARGERS_BY_CITY.dallas.map((c) => c.kw));
    return bestM < bestD;
  });
  check('Miami earns less per fare and insures for more',
    () => A.CITIES.miami.fareK < 1 && A.CITIES.miami.insK > A.CITIES.dallas.insK);

  // ---- 5n. incident risk is a function, not a constant ------------------
  // It was the literal 0.00018 inline in step(), which could express neither
  // "this city is rougher" nor "it is raining" — and the second was glaring,
  // because rain already slowed the cars and surged the demand.
  const setWx = (cond) => { A.setWx({ temp: 25, cond: cond, ok: true, byHour: null }); };
  check('dry Austin is the baseline risk', () => {
    S.city = 'austin'; A.loadCityTables(); setWx('Clear');
    return Math.abs(A.incidentRisk() - A.INC_BASE) < 1e-12;
  });
  check('rain raises risk', () => {
    S.city = 'austin'; A.loadCityTables(); setWx('Rain');
    return A.incidentRisk() > A.INC_BASE;
  });
  check('a storm is worse than rain', () => {
    setWx('Rain'); const r = A.incidentRisk();
    setWx('Storm'); return A.incidentRisk() > r;
  });
  check('weather hits safety harder than it hits the schedule', () => {
    setWx('Storm');
    // +120% risk against -35% speed: rain is a safety problem first.
    return (A.weatherIncidentMult() - 1) > (1 - A.weatherSpeedMult());
  });
  check('Miami is rougher than Austin in the same weather', () => {
    setWx('Clear');
    S.city = 'austin'; A.loadCityTables(); const a = A.incidentRisk();
    S.city = 'miami'; A.loadCityTables(); const m = A.incidentRisk();
    return m > a;
  });
  check('elevated risk is stated, not merely applied', () => {
    S.city = 'miami'; A.loadCityTables(); setWx('Storm');
    const n = A.incidentRiskNote();
    return /Miami/.test(n) && /storm/i.test(n) && /above baseline/.test(n);
  });
  check('a calm baseline says nothing at all', () => {
    S.city = 'austin'; A.loadCityTables(); setWx('Clear');
    return A.incidentRiskNote() === '';
  });
  // THE ONE THAT MATTERS: that the simulation actually consumes the function.
  // Everything above would pass with incidentRisk() perfect and step() still
  // running the old inline 0.00018 — mutation-tested, and it did. So drive a
  // car through stepCar() with Math.random pinned BETWEEN the baseline and the
  // elevated risk: dry Austin must survive the roll that wet Miami fails.
  const rollAt = (city, cond, r) => {
    S.city = city; A.loadCityTables(); setWx(cond);
    const car = {
      id: 'T-TEST', state: 'onTrip', soc: 80, odo: 0, earn: 0,
      lat: A.zones()[0].lat, lng: A.zones()[0].lng,
      route: [[A.zones()[1].lat, A.zones()[1].lng]],
      ride: { from: A.zones()[0].n, to: A.zones()[1].n, km: 5, fare: 12, plat: 'hitchr' },
      at: A.zones()[0].n, blocked: 0, idleFor: 0, fatigue: 0,
    };
    const real = w.Math.random;
    w.Math.random = () => r;
    try { A.stepCar(car, 1); } finally { w.Math.random = real; }
    return car.state === 'blocked';
  };
  check('step() reads incidentRisk() rather than a constant of its own', () => {
    const mid = A.INC_BASE * 1.5;          // above baseline, below Miami+storm
    const dryAustin = rollAt('austin', 'Clear', mid);
    const wetMiami = rollAt('miami', 'Storm', mid);
    return dryAustin === false && wetMiami === true;
  });
  check('a missing incK reads as 1.0, not NaN', () => {
    S.city = 'dallas'; A.loadCityTables(); setWx('Clear');
    return A.incidentRisk() === A.INC_BASE * A.cityK('incK') &&
           isFinite(A.incidentRisk());
  });

  // ---- 5t. Tampa and Orlando ------------------------------------------
  // Tampa's whole argument is the evening, and it is measured rather than
  // asserted by eye: the rate at 21:00 against the rate at the 06:00 open, on
  // the authored defaults. Miami must fail this test and Tampa must pass it —
  // that inversion IS the pair of cities.
  const rateAtHour = (city, hour) => {
    S.city = city; A.loadCityTables();
    A.PLATFORMS.forEach((p) => { p.on = false; });
    const p = A.PLATFORMS[0];
    p.on = true; p.accepted = p.offered = 10;   // model a player who accepts
    S.t = hour * 3600;
    return A.offersPerHour();
  };
  check('Tampa pays after dark and Miami pays in the morning', () => {
    const t = rateAtHour('tampa', 21) / rateAtHour('tampa', 6);
    const m = rateAtHour('miami', 21) / rateAtHour('miami', 6);
    return t > 1.2 && m < 0.8;
  });
  check('the Ybor taprooms are the biggest evening lever in the game', () => {
    const before = rateAtHour('tampa', 21);
    A.zones().forEach((z) => { if (z.p === 'brewery') z.on = true; });
    const after = A.offersPerHour();
    A.loadCityTables();
    return after > before * 1.6;
  });
  check('Tampa charges slowly inside the box and fast outside it', () => {
    // Both in-geofence sites are 150 kW; both 250 kW sites are out of town.
    // Asserted through distance from the default anchor zone rather than a
    // hardcoded name, so re-baking or renaming a site cannot fake a pass.
    S.city = 'tampa'; A.loadCityTables();
    const z = A.activeZones()[0];
    const near = A.chargers().filter((c) => A.dist(z.lat, z.lng, c.lat, c.lng) < 3);
    return near.length > 0 && near.every((c) => c.kw <= 150);
  });
  check('Orlando has no airport and no brewery', () => {
    const zs = A.ZONES_BY_CITY.orlando;
    return zs.filter((z) => z.p === 'airport').length === 0 &&
           zs.filter((z) => z.p === 'brewery').length === 0;
  });
  check('Orlando is the thinnest city in the game', () => {
    const ceil = (city) => {
      rateAtHour(city, 21);
      A.zones().forEach((z) => { z.on = true; });
      const r = A.offersPerHour();
      A.loadCityTables();
      return r;
    };
    const o = ceil('orlando');
    return A.cityList().filter((c) => c !== 'orlando').every((c) => ceil(c) > o * 1.4);
  });
  check('Orlando has the cheapest power and Austin the dearest', () => {
    const peak = (c) => A.CITIES[c].power.peak;
    return A.cityList().every((c) => c === 'orlando' || peak(c) > peak('orlando')) &&
           A.cityList().every((c) => c === 'austin' || peak(c) < peak('austin'));
  });
  // A city with no brewery zone must not break anything that assumes one, and
  // the Geofence panel has to render an empty category rather than throwing.
  check('a city with no taproom still renders its geofence', () => {
    S.city = 'orlando'; A.loadCityTables(); A.render();
    const el = w.document.getElementById('rq-rate');
    return !!el && el.textContent.length > 0;
  });

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
  // Each of these now names the city it is running in. They used to rely on
  // boot state leaving S.city==='austin', which held right up until a later
  // section switched city — and 'shift1@austin' cares which city you are in.
  check('Dallas is locked before any shift', () => {
    A.PROG().unlocked.dallas = false;
    A.PROG().results.austin = {};
    S.city = 'austin'; A.loadCityTables();
    S.shiftNo = 0; S.onClock = false;
    return A.cityUnlocked('dallas') === false;
  });
  check('Dallas stays locked DURING the first shift', () => {
    A.PROG().unlocked.dallas = false;
    A.PROG().results.austin = {};
    S.city = 'austin';
    S.shiftNo = 1; S.onClock = true;
    return A.cityUnlocked('dallas') === false;
  });
  check('clocking off the first shift unlocks Dallas', () => {
    S.city = 'austin';
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
      if (!n) return true;
      if (['shift1', 'day1'].indexOf(n) >= 0) return true;
      // 'shift1@<city>' is only understood if that city actually exists —
      // gateMet() returns false for a typo, which would hide the scenario
      // forever rather than opening it. Catch it here instead.
      return n.indexOf('shift1@') === 0 && !!A.CITIES[n.slice(7)];
    }));
  check('cityList() is ordered by CITIES[].order',
    () => A.cityList().join(',') === 'austin,dallas,miami,tampa,orlando');
  // The chain has to be a CHAIN: every scenario after the first gates on the
  // one immediately before it in tab order. A city gating on something earlier
  // would let a player skip a scenario; two gating on the same city would fork
  // it. One assertion covers both, and it holds for any future city.
  check('each city gates on the one before it in tab order', () => {
    const ids = A.cityList();
    return ids.every((id, i) => {
      const n = A.CITIES[id].needs;
      if (i === 0) return !n;
      return n === 'shift1@' + ids[i - 1];
    });
  });

  // ---- 5x. the city cards ---------------------------------------------
  // Two clipping regressions came out of this strip (v0.25.0 squeezed it to a
  // stub, v0.25.1 scrolled it and still sliced Dallas in half), so the
  // invariant is now asserted rather than eyeballed: EVERY city renders a whole
  // card, locked or not, and no scroller is involved.
  const cards = () => [].slice.call(
    w.document.getElementById('citytabs').querySelectorAll('.citytab'));
  check('every city gets a card, locked ones included', () => {
    A.PROG().unlocked.tampa = false; A.PROG().unlocked.orlando = false;
    A.PROG().results.miami = {}; A.PROG().results.tampa = {};
    S.city = 'austin'; S.shiftNo = 0; S.onClock = false;
    A.renderCityTabs();
    return cards().length === A.cityList().length;
  });
  // aria-disabled, never `disabled`: a locked card has to stay clickable and
  // focusable so it can explain itself when asked (see the Paolo checks below).
  // A `disabled` button swallows the click and cannot be tabbed to.
  check('a locked card is aria-disabled and padlocked, not missing', () => {
    const locked = cards().filter((b) => b.getAttribute('aria-disabled') === 'true');
    return locked.length > 0 && locked.every((b) => !!b.querySelector('.lk')) &&
           cards().every((b) => b.disabled === false);
  });
  check('exactly one card is pressed, and it is S.city', () => {
    const on = cards().filter((b) => b.getAttribute('aria-pressed') === 'true');
    return on.length === 1 && on[0].getAttribute('data-city') === S.city;
  });
  // The tone line: the thing Pavel actually asked for. Every card carries its
  // own city tint, including the locked ones — that is the point, so it is
  // checked on all of them and against the CITIES table rather than a literal.
  check('every card carries a tone line in its own city colour', () => cards().every((b) => {
    const id = b.getAttribute('data-city');
    const want = A.CITIES[id].tone.day.tint.toLowerCase();
    return !!b.querySelector('.tone') &&
           b.style.getPropertyValue('--ct').trim().toLowerCase() === want;
  }));
  check('the tone lines are all different colours', () => {
    const tints = cards().map((b) => b.style.getPropertyValue('--ct').trim().toLowerCase());
    return new Set(tints).size === tints.length;
  });
  // jsdom applies no stylesheet, so the element and its inline --ct prove
  // nothing about whether the bar is drawn. The rule that draws it is asserted
  // against the source — and so is the absence of the scroller, because
  // reintroducing overflow-x on this strip is how it clipped twice.
  check('the CSS draws the tone line and does not scroll the strip', () => {
    const css = fs.readFileSync(file, 'utf8');
    return /\.citytab \.tone\{position:absolute[^}]*background:var\(--ct/.test(css) &&
           /\.citytabs\{display:flex[^}]*flex:0 0 auto\}/.test(css) &&
           !/\.citytabs\{[^}]*overflow-x:auto/.test(css);
  });
  // The strip cannot shrink, so the ROW has to be able to wrap — otherwise the
  // right-hand end of the topbar goes off screen with no scrollbar and no way to
  // reach Garage/Saves/Night/Sound/Coffee. That was the ~1700px report. Every
  // .topbar rule must therefore avoid a fixed flex basis or a fixed height.
  check('the topbar wraps and is never a fixed-height row', () => {
    const css = fs.readFileSync(file, 'utf8');
    const base = /\.topbar\{\s*flex:0 0 auto;min-height:48px;[^}]*flex-wrap:wrap/.test(css);
    const rules = css.match(/\.topbar\{[^}]*\}/g) || [];
    const noFixedBasis = rules.every((r) =>
      !/flex:0 0 \d/.test(r) && !/[^-]height:\d+px/.test(r));
    return base && rules.length >= 3 && noFixedBasis;
  });
  // The row has exactly three children, so the wrap can only happen in one
  // place. A flat list is what put the Coffee button alone on its own line at
  // 2115px, and the fix is structural — hence a structural assertion.
  check('the topbar breaks in exactly one place, with Coffee pinned', () => {
    const kids = [].slice.call(w.document.querySelector('.topbar').children);
    return kids.length === 3 &&
           /tb-info/.test(kids[0].className) &&
           /tb-ctrls/.test(kids[1].className) &&
           kids[2].id === 'coffee';
  });
  check('Coffee sits on the first line whether or not the row wraps', () => {
    const css = fs.readFileSync(file, 'utf8');
    // Narrow: info(1) Coffee(2) then the controls forced onto their own line.
    // Wide (>=2250px): the same three items with the last two swapped.
    return /#coffee\{order:2;margin-left:auto;align-self:flex-end\}/.test(css) &&
           /\.tb-ctrls\{order:3;flex:1 0 100%/.test(css) &&
           /@media \(min-width:2250px\)\{\s*\.tb-ctrls\{order:2;flex:0 0 auto\}\s*#coffee\{order:3;margin-left:0\}/.test(css);
  });
  // Coffee must never be the only thing on a line. The readout block is capped
  // so it cannot claim the full width, which is what bumped Coffee to a line of
  // its own at ~885px; the reservation has to shrink when the button is
  // icon-only, or it leaves a hole instead.
  // Two lines, and which half each thing belongs to: everything you READ on the
  // first, everything you PRESS on the second, with the shift status opening the
  // control line because it introduces the Clock button it belongs to.
  check('Shift leads the control line, not the readouts', () => {
    const info = w.document.querySelector('.tb-info');
    const ctrls = w.document.querySelector('.tb-ctrls');
    const shift = w.document.getElementById('tb-shift').closest('.tb-item');
    return ctrls.contains(shift) && !info.contains(shift) &&
           ctrls.firstElementChild === shift;
  });
  check('the shift readout is pushed left, the controls stay right', () => {
    const css = fs.readFileSync(file, 'utf8');
    return /\.tb-shiftitem\{margin-right:auto\}/.test(css) &&
           /\.tb-ctrls\{[^}]*justify-content:flex-end/.test(css);
  });
  // The brand taking a whole line is what made this tier four lines deep.
  check('the brand does not claim a line of its own above the phone tier', () => {
    const css = fs.readFileSync(file, 'utf8');
    const tier = css.match(/@media \(max-width:1199px\)\{[\s\S]*?\n\}/);
    return !!tier && !/\.brand\{flex:1 0 100%/.test(tier[0]) &&
           /@media \(max-width:760px\)\{[\s\S]*?\.brand\{flex:1 0 100%/.test(css);
  });
  check('the readout block reserves room for Coffee at every tier', () => {
    const css = fs.readFileSync(file, 'utf8');
    return /\.tb-info\{order:1;[^}]*max-width:calc\(100% - var\(--coffee-w\)\)/.test(css) &&
           /\.topbar\{--coffee-w:116px\}/.test(css) &&
           /@media \(max-width:1499px\)\{\s*\.topbar\{--coffee-w:56px\}/.test(css) &&
           /@media \(max-width:1199px\)\{\s*\.topbar\{--coffee-w:112px\}/.test(css) &&
           /@media \(min-width:2250px\)\{[^@]*\.tb-info\{max-width:none\}/.test(css);
  });
  check('the empty spacer div is gone, not just hidden', () => {
    const css = fs.readFileSync(file, 'utf8');
    return w.document.querySelector('.spacer') === null &&
           !/\.spacer\{flex:1\}/.test(css);
  });
  check('night mode repaints the cards in the night tints', () => {
    w.document.documentElement.setAttribute('data-theme', 'night');
    A.renderCityTabs();
    const ok = cards().every((b) => {
      const id = b.getAttribute('data-city');
      return b.style.getPropertyValue('--ct').trim().toLowerCase() ===
             A.CITIES[id].tone.night.tint.toLowerCase();
    });
    w.document.documentElement.removeAttribute('data-theme');
    A.renderCityTabs();
    return ok;
  });
  // The city name used to be printed twice — on the pressed card and again in a
  // topbar readout three items to the right. The readout is gone and its slot
  // now carries the one thing the cards cannot say.
  check('the topbar no longer duplicates the city name', () => {
    S.city = 'miami'; A.loadCityTables(); A.render();
    return w.document.getElementById('tb-city') === null &&
           !!w.document.getElementById('tb-city-time');
  });

  // ---- 5s. autosave keeps its promise ---------------------------------
  // The report: the Saves dialog said "saved 22 min ago" under a label that
  // promised every 30 seconds. Both halves were wrong — the interval only fired
  // while the clock was running, and the label described a cadence rather than
  // the rule. IndexedDB does not exist in jsdom, so what is testable here is the
  // decision (has anything changed?) and the wiring, not the write itself.
  check('the signature moves when the clock moves', () => {
    const a = SV.saveSig();
    S.t += 60;
    return SV.saveSig() !== a;
  });
  check('the signature moves for things done while PAUSED', () => {
    S.speed = 0; S.running = false;
    const a = SV.saveSig();
    S.cash -= 100;                      // a purchase, in effect
    const b = SV.saveSig();
    A.zones()[3].on = true;             // a geofence edit
    const c = SV.saveSig();
    S.autoCharge = !S.autoCharge;       // a policy switch
    const d = SV.saveSig();
    return a !== b && b !== c && c !== d;
  });
  check('an idle paused game produces no new signature', () => {
    const a = SV.saveSig();
    return SV.saveSig() === a;
  });
  // The old guard is the thing that must not come back: `if(S.running)` meant a
  // paused game never wrote at all.
  check('the interval does not depend on the clock running', () => {
    const src = fs.readFileSync(file, 'utf8');
    return !/if\(S\.running&&!S\.over\) autosave/.test(src) &&
           /if\(saveSig\(\)===lastSavedSig\) return;\s*autosave\('interval'\)/.test(src);
  });
  check('the moments a player would hate to lose are flushed', () => {
    const src = fs.readFileSync(file, 'utf8');
    return ["autosaveSoon('acquire')", "autosaveSoon('sell')",
      "autosaveSoon('clock-on')", "autosaveSoon('clock-off')"]
      .every((h) => src.indexOf(h) >= 0);
  });
  check('the dialog says "on every change", not a cadence it cannot keep', () => {
    const src = fs.readFileSync(file, 'utf8');
    return /slotRow\('auto',all\.auto,'Auto','on every change'\)/.test(src) &&
           /const fresh=key==='auto'&&save&&save\.sig&&save\.sig===saveSig\(\)/.test(src);
  });

  // ---- 5p. Paolo answers a locked card --------------------------------
  // Clicking a padlock used to do nothing at all, because the button was
  // `disabled` and the only explanation was a title attribute nobody hovers on
  // a trackpad. The reply has to be anchored to the card, name the city that
  // unlocks it, and never actually open the city.
  const lockedCard = (id) => {
    A.PROG().unlocked = { austin: true };
    A.PROG().results = {};
    S.city = 'austin'; S.shiftNo = 0; S.onClock = false;
    A.loadCityTables(); A.renderCityTabs();
    return cards().filter((b) => b.getAttribute('data-city') === id)[0];
  };
  check('clicking a locked card asks Paolo instead of switching', () => {
    // `before` is read AFTER the fixture is built, because lockedCard() sets
    // S.city itself — reading it first made this check fail on its own setup.
    const card = lockedCard('tampa');
    const before = S.city;
    card.click();
    const el = w.document.getElementById('lockmsg');
    return S.city === before && !!el && el.hidden === false;
  });
  check("Paolo names the city that unlocks it, not the one you clicked", () => {
    lockedCard('tampa').click();
    const txt = w.document.getElementById('lockmsg').textContent;
    // Tampa's gate is a Miami shift — the previous city has to be in the reply,
    // because "one shift in Miami" is a thing the player can go and do.
    return /Miami/.test(txt) && /Paolo Cortez/.test(txt);
  });
  check('the reply also states the requirement plainly', () => {
    lockedCard('orlando').click();
    const txt = w.document.getElementById('lockmsg').textContent;
    return txt.indexOf(A.gateHint(A.CITIES.orlando.needs)) >= 0;
  });
  // The bubble must be a BLOCK. A multi-line inline box paints its background
  // and padding per line fragment, which is why the first version spilled its
  // text past the grey and dropped the avatar to the floor. And the requirement
  // is a second bubble rather than caption text, so it is not the palest,
  // smallest thing on screen.
  check('the reply is built from blocks, in two bubbles', () => {
    lockedCard('tampa').click();
    const el = w.document.getElementById('lockmsg');
    const bubbles = el.querySelectorAll('.bubble');
    return bubbles.length === 2 &&
           [].every.call(bubbles, (b) => b.tagName === 'DIV') &&
           el.querySelector('.avatar').tagName === 'DIV' &&
           el.querySelector('.col').tagName === 'DIV';
  });
  // One message style for Paolo everywhere: the bubble rules are shared between
  // the card and the locked-city reply rather than copied, so he cannot drift
  // between surfaces. Asserted on the source because jsdom applies no CSS.
  check('Paolo looks the same on every surface', () => {
    const css = fs.readFileSync(file, 'utf8');
    return /#ray \.bubble,#lockmsg \.bubble\{display:block;/.test(css) &&
           /#ray \.avatar,#lockmsg \.avatar\{/.test(css) &&
           /#ray \.who,#lockmsg \.who\{/.test(css) &&
           /html\[data-theme="night"\] #ray \.bubble,\s*html\[data-theme="night"\] #lockmsg \.bubble\{/.test(css);
  });
  check('every locked city has something to say', () => A.cityList().every((id) => {
    const line = A.cityLockLine(id);
    return typeof line === 'string' && line.length > 40;
  }));
  check('a city with no authored line still gets a sentence', () => {
    // The fallback builds one from the gate, so adding a scenario cannot leave
    // a card mute. Simulated by asking for an id that has no LOCK_LINES entry.
    const saved = A.LOCK_LINES.tampa;
    delete A.LOCK_LINES.tampa;
    const line = A.cityLockLine('tampa');
    A.LOCK_LINES.tampa = saved;
    return /Miami/.test(line);
  });
  check('clicking anywhere else puts the reply away', () => {
    lockedCard('tampa').click();
    w.document.body.click();
    return w.document.getElementById('lockmsg').hidden === true;
  });
  check('rebuilding the strip drops a reply pointing at a dead card', () => {
    lockedCard('tampa').click();
    A.PROG().unlocked.dallas = true;      // changes the signature
    A.renderCityTabs();
    return w.document.getElementById('lockmsg').hidden === true;
  });
  // switchCity() is ASYNC — it flushes an autosave before swapping tables — so
  // the click has to be given a tick before the result is read. In jsdom there
  // is no IndexedDB, which means this also exercises the storage-failure branch:
  // the right end state is a fresh run in the new city, not a half-switch.
  A.PROG().unlocked = { austin: true, dallas: true, miami: true,
    tampa: true, orlando: true };
  S.city = 'austin'; A.loadCityTables(); A.renderCityTabs();
  cards().filter((b) => b.getAttribute('data-city') === 'miami')[0].click();
  await new Promise((r) => setTimeout(r, 120));
  check('an unlocked card still switches city', () => S.city === 'miami');
  check('the reply is not left on screen after a switch',
    () => w.document.getElementById('lockmsg').hidden === true);

  // ---- 5e. the auto-charge Easter egg ---------------------------------
  // Off by default, and the switch is not on the strip until it is found. The
  // first assertion is the one that matters: a fresh run must not be charging
  // itself, because deciding when and where to charge is the only Act 1 lever
  // that spends time as well as money.
  check('a fresh run does not charge itself', () => {
    A.newFleet('austin');
    return S.autoCharge === false;
  });
  // newFleet() sets it explicitly (it did not, until this test), so the S
  // literal is only what a boot sees before any run exists. Asserted against
  // the source because there is no reachable moment to observe it otherwise —
  // and flipping that literal back is exactly the kind of "harmless default"
  // edit that would quietly re-enable automatic charging.
  check('the state literal defaults it off too', () => {
    const src = fs.readFileSync(file, 'utf8');
    return /autoCharge:false, soundOn:true,/.test(src) &&
           /if\(S\.autoCharge===true&&c\.soc<CFG\.chargeAt\)/.test(src);
  });
  check('the switch is hidden until the egg is found', () => {
    A.PROG().eggs = {};
    A.newFleet('austin'); A.render();
    return w.document.getElementById('dp-charge').hidden === true;
  });
  // [hidden] alone is not enough here: .t-ctl .icons button sets display:flex,
  // and an author display beats the attribute's UA style. That is the bug that
  // made "Take control" look dead for three rounds, so the CSS rule that
  // undoes it is asserted rather than trusted.
  check('the CSS actually hides a [hidden] policy icon', () => {
    const css = fs.readFileSync(file, 'utf8');
    return /\.t-ctl \.icons button\[hidden\]\{display:none\}/.test(css);
  });
  check('finding the egg reveals the switch and turns it on', () => {
    A.PROG().eggs = {};
    A.newFleet('austin');
    const ver = w.document.getElementById('ver');
    for (let i = 0; i < A.EGGS.autocharge.taps; i++) ver.click();
    A.render();
    return A.eggFound('autocharge') === true && S.autoCharge === true &&
           w.document.getElementById('dp-charge').hidden === false;
  });
  check('the egg survives a new run in another city', () => {
    A.newFleet('dallas'); A.render();
    // Knowledge outlives a run: the switch stays visible. The POLICY does not
    // travel — a new run starts off, like every other run.
    return A.eggFound('autocharge') === true &&
           w.document.getElementById('dp-charge').hidden === false &&
           S.autoCharge === false;
  });
  check('four taps are not five', () => {
    A.PROG().eggs = {};
    A.newFleet('austin');
    const ver = w.document.getElementById('ver');
    for (let i = 0; i < A.EGGS.autocharge.taps - 1; i++) ver.click();
    return A.eggFound('autocharge') === false;
  });
  check('an unknown egg id is false, not a throw',
    () => A.eggFound('no-such-egg') === false && A.findEgg('no-such-egg') === false);
  // A save that already had automatic charging on keeps it AND counts as having
  // found the egg — otherwise the run would be visibly charging itself with no
  // visible control, which is a bug report waiting to happen.
  check('a save with auto-charging on reveals the switch', () => {
    A.PROG().eggs = {};
    const snap = SV.snapshot();
    snap.s.autoCharge = true;
    SV.restore(snap);
    A.render();
    return S.autoCharge === true && A.eggFound('autocharge') === true;
  });
  check('a save with auto-charging off does not reveal it', () => {
    A.PROG().eggs = {};
    const snap = SV.snapshot();
    snap.s.autoCharge = false;
    SV.restore(snap);
    A.render();
    return S.autoCharge === false && A.eggFound('autocharge') === false &&
           w.document.getElementById('dp-charge').hidden === true;
  });
  check('a save from before the field existed defaults to OFF', () => {
    A.PROG().eggs = {};
    const snap = SV.snapshot();
    delete snap.s.autoCharge;
    SV.restore(snap);
    return S.autoCharge === false;
  });

  // ---- 6a. the gate CHAIN ---------------------------------------------
  // Austin opens Dallas, Dallas opens Miami. The bare 'shift1' gate could not
  // express this: it reads the live run only and cannot tell which city the
  // shift happened in, so a second Austin shift would have opened city #3
  // without the player ever visiting city #2.
  const gateReset = () => {
    A.PROG().unlocked.dallas = false;
    A.PROG().unlocked.miami = false;
    A.PROG().results.austin = {}; A.PROG().results.dallas = {};
    S.city = 'austin'; S.shiftNo = 0; S.onClock = false;
  };
  check('Miami names Dallas in its gate, not Austin',
    () => A.CITIES.miami.needs === 'shift1@dallas' &&
          A.CITIES.dallas.needs === 'shift1@austin');
  check('an Austin shift does NOT open Miami', () => {
    gateReset();
    S.shiftNo = 1; S.onClock = false;      // clocked off, in Austin
    A.progGates();
    return A.cityUnlocked('dallas') === true && A.cityUnlocked('miami') === false;
  });
  check('a Dallas shift opens Miami', () => {
    gateReset();
    S.city = 'dallas'; S.shiftNo = 1; S.onClock = false;
    A.progGates();
    return A.cityUnlocked('miami') === true;
  });
  check('the Dallas shift is remembered after leaving Dallas', () => {
    gateReset();
    S.city = 'dallas'; S.shiftNo = 1; S.onClock = false;
    A.progGates();                          // banks results.dallas.shiftDone
    S.city = 'austin'; S.shiftNo = 0; S.onClock = false;
    A.PROG().unlocked.miami = false;        // drop the latch, keep the record
    return A.cityShiftDone('dallas') === true && A.cityUnlocked('miami') === true;
  });
  check('mid-shift in Dallas is not a finished Dallas shift', () => {
    gateReset();
    S.city = 'dallas'; S.shiftNo = 1; S.onClock = true;
    return A.gateMet('shift1@dallas') === false;
  });
  check('a gate naming a city that does not exist stays locked',
    () => A.gateMet('shift1@nowhere') === false);
  check('the Miami padlock hint names Dallas',
    () => A.gateHint('shift1@dallas').indexOf('Dallas') >= 0);
  // progTrack() REPLACES the results record rather than merging into it, so a
  // field it forgets to carry is destroyed on the next autosave — and this one
  // is the next city's unlock condition.
  check('progTrack() does not wipe shiftDone', () => {
    gateReset();
    S.city = 'dallas'; S.shiftNo = 1; S.onClock = false;
    A.progGates();
    S.onClock = true;                       // back on shift: gate goes false
    A.progTrack();
    return A.PROG().results.dallas.shiftDone === true;
  });

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

  // ---- 6g. financing has a balance -----------------------------------
  // Reported as "the price is nice, but I financed the car for 3k
  // downpayments, so I should not be able to sell financed car for a full
  // price". It was an infinite money glitch: no loan balance existed anywhere,
  // so $4,500 down on a Cybercab and an immediate sale returned $27,000.
  // It also contradicted the garage's own copy, "a financed one cannot" be
  // handed back — canSell() only ever blocked rentals.
  function financed() {
    A.newFleet('austin');
    S.ray.skipped = true;
    A.acquire('cybercab', 'finance');
    return S.cars[0];
  }
  check('financing opens a balance of price minus deposit', () => {
    const c = financed();
    const v = A.CATALOG.filter((x) => x.id === 'cybercab')[0];
    return A.owedOn(c) === v.price - v.down;
  });
  check('an owned car owes nothing', () => {
    A.newFleet('austin'); S.ray.skipped = true; S.cash = 1e6;
    A.acquire('cybercab', 'buy');
    return A.owedOn(S.cars[0]) === 0;
  });
  check('a rental owes nothing — it builds no equity', () => {
    A.newFleet('austin'); S.ray.skipped = true;
    A.acquire('cybercab', 'rent');
    return A.owedOn(S.cars[0]) === 0;
  });
  check('selling a financed car nets equity, not the sticker', () => {
    const c = financed();
    return A.sellNet(c) === A.sellValue(c) - A.owedOn(c) &&
           A.sellNet(c) < A.sellValue(c);
  });
  // The regression that matters: flipping must LOSE money.
  check('buy-and-flip is no longer free money', () => {
    const c = financed();
    const before = S.cash;
    A.sellCar(c.id);
    return S.cash < A.CFG.startCash && S.cash === before + A.sellNet(c);
  });
  check('the payoff retires with each midnight', () => {
    const c = financed();
    const owed0 = A.owedOn(c);
    S.cash += 1e6; A.billMidnight();
    const owed1 = A.owedOn(S.cars[0]);
    return owed1 < owed0 &&
           Math.abs((owed0 - owed1) - A.principalPerDay(c)) < 0.01;
  });
  // The other half of having no balance: the daily payment used to run forever.
  check('a settled loan becomes owned and stops charging', () => {
    const c = financed();
    const withLoan = A.fixedPerCar(c);
    for (let i = 0; i < A.CFG.financeDays + 1 && S.cars[0].hold === 'finance'; i++) {
      S.cash += 1e6; A.billMidnight();
    }
    const x = S.cars[0];
    return x.hold === 'own' && A.owedOn(x) === 0 && A.fixedPerCar(x) < withLoan;
  });
  check('underwater is blocked without the cash to settle', () => {
    const c = financed();
    c.odo = 200000;                    // worn down below what it owes
    S.cash = 100;
    const chk = A.canSell(c);
    return A.sellNet(c) < 0 && !chk.ok && /settle/.test(chk.why);
  });
  check('underwater is allowed once you can cover it', () => {
    const c = financed();
    c.odo = 200000; S.cash = 30000;
    return A.canSell(c).ok;
  });
  check('SAVE_V is 8', () => SV.V === 8);
  check('the balance survives a save round trip', () => {
    const c = financed();
    const owed = A.owedOn(c);
    const snap = SV.snapshot();
    S.cars[0].owed = 1;
    SV.restore(snap);
    return A.owedOn(S.cars[0]) === owed;
  });
  check('v7 saves get a balance, credited for days already paid', () => {
    financed();
    const snap = SV.snapshot();
    snap.v = 7; snap.s.day = 200;
    snap.s.cars.forEach((x) => { delete x.owed; });
    const m = SV.migrate(snap);
    const v = A.CATALOG.filter((x) => x.id === 'cybercab')[0];
    const principal = v.price - v.down;
    // Must not be 0 — that would preserve the exploit rather than close it.
    return m.s.cars[0].owed > 0 && m.s.cars[0].owed < principal;
  });
  check('a v7 loan past its term migrates to owned', () => {
    financed();
    const snap = SV.snapshot();
    snap.v = 7; snap.s.day = A.CFG.financeDays + 500;
    snap.s.cars.forEach((x) => { delete x.owed; });
    return SV.migrate(snap).s.cars[0].hold === 'own';
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
