# Deadhead — Multi-City Plan
_Decisions made 2026-07-26, against `deadhead.html` v0.22.0. Line numbers refer to the source file._

## Decisions locked

| Question | Decision | Why |
|---|---|---|
| City model | **Sequential scenarios.** One live simulation. Tab bar switches which *run* you're in, with an explicit confirm; the other city is parked, not ticking. | Matches `DESIGN.md` §5 ("scenario missions… own goal, constraints, required strategy"). Parallel live branches would turn `S` into `S.branches[city]` and force `tick()`/`render()`/`snapshot()` to answer "which one, or both?" — that's Act 2's complexity bill paid before Act 2 exists. |
| Economy | **SUPERSEDED 2026-07-27 — see `companyplan.md`.** Originally "no carryover, each city starts at `CFG.startCash` ($7,500)." Now: one shared `PROG.companyCash` across every city, real-world-midnight catch-up billing for a parked city's fleet, repossession after `CFG.parkGraceDays`. Austin alone keeps the tight tutorial start; every later city inherits whatever the company has banked. | The original reasoning (below, kept for the record) turned out to be solvable a better way: Pavel's framing — "this is not a funny game, this is a real biz simulator," one operator can't run two cities at once — makes money scarcity a permanent, earned consequence of expansion rather than a scripted reset. See `companyplan.md` for the full decision and its own open questions. |
| ~~Economy (original, superseded)~~ | ~~No carryover. Each city starts at `CFG.startCash` ($7,500). Meta-progression carries unlocks and a per-city result, never the balance sheet.~~ | ~~Arriving in Dallas with a mature bankroll means the Act 1 lesson — you cannot afford a single car outright, so you rent or you put money down — never lands again. That lesson is the game (see `S.cars=[]` at boot and the comment at 2610).~~ |
| City #2 | **Dallas / Houston.** | The only candidate that is real difficulty rather than a re-skin *and* needs zero new systems. Miami wants flooding/hurricane events (new content). SF wants a mandatory safety monitor, i.e. payroll from hour one — that **is** Act 2; don't ship it before Act 2. |
| Gate | **First shift clocked off** (`needs:'shift1'`). Dallas tab visible from the first boot, padlocked until then. | Revised — see below. A visible padlock is a goal; a tab that materialises out of nowhere is a surprise. |
| City identity | **Each city gets its own accent tone, tinting the chrome only.** See §"City identity" below. | With separate runs per city, "which run am I in" has to be answerable pre-attentively, from a screenshot, before any label is read. A city name in the topbar doesn't do that; ambient colour does. |

Note `skipTutorial` (3814) also sets `day1Done=true`. That's intended: a player who skips the script still earns the gate.

---

## What Dallas actually changes

No new systems. Data plus multipliers, hooked into fields that already exist:

- **Geography** — zones spread far wider than Austin's ~13 km worst case. Long trips become the norm rather than the one airport run. This makes the existing Supercharger trade-offs (`CHARGERS_BY_CITY`, 2301) *more* interesting, not less.
- **Permit** — `S.permit='Unsupervised'` from day one. The field already exists (2570).
- **Depreciation** — punishing, per `DESIGN.md` §5. Multiplier on the existing depreciation path.
- **Fares** — high per fare, so the gross looks great and the margin doesn't.
- **Power tariff** — currently a bare function `tariff(h)` (2548) with hardcoded Austin time-of-use rates. Becomes per-city.

The point of the city is that a strategy tuned for Austin's short-hop density loses money on Dallas geography.

---

## The real work: un-hardcoding Austin

`CITIES` (2094) and `CHARGERS_BY_CITY` (2301) are already city-keyed and commented for exactly this. Three things are not.

### 1. `ZONES` is a flat Austin-only const (2220)
Eleven zones, hardcoded. Needs `ZONES_BY_CITY` + a `zonesFor(city)` accessor following the exact `chargersFor()` pattern (2315), with `ZONES` as a reassignable `let` binding — same reasoning as the `let CHARGERS` comment at 2320.

Two hazards:
- **`ZONES[].on` is mutable player state** (the geofence) living on a module const. Improvementplan item #5 already flags that `newFleet()` (6194) doesn't reset it. Switching city must reset it too, or Dallas opens with Austin's geofence.
- The forced tutorial offers draw from `activeZones()[0]/[1]`, so a city's default-on zones are load-bearing for the script, not cosmetic.

### 2. `ROADS` is ~68 hand-baked OSRM route pairs (4013)
8 zones × 5 chargers plus zone-to-zone, ~700 coordinate points, keyed `'From|To'` with the `CH:` prefix convention (4010). There is **no generator script in the repo** — only `deploy/scripts/check-parity.js`. A second city means 68 more pairs.

**Write the bake script before writing the second city.** It should take a city's zone + charger list, call OSRM, and emit the `ROADS_BY_CITY[city]` literal. Otherwise this is hand-pasted coordinates and a bad afternoon.

Recall the fraction trick from the road-geometry work: `ROADS` is **map drawing only** and never touches the economy. Keep that invariant — a new city's routes must not become a distance source.

### 3. Per-city config needs to carry more than `{name, lat, lon, tz}`
Fold the scenario definition into `CITIES` (or a parallel `SCENARIOS`) rather than scattering it:

```
zones, chargers, roads, tariff, fareMult, depMult, insRate,
permit, fleetCap, incidentRate, startCash, goal
```

`fleetCap` matters: `DESIGN.md` §5 caps Austin near 17 cars to match the real fleet. Dallas shouldn't inherit that number silently.

---

## City identity — per-city tone

Each city carries a colour tone. The purpose is orientation, not decoration: separate runs
per city means the player must know which one they're in without reading anything.

### Rule 1 — tint the chrome, never the content

The tone is allowed to reach: the city tab, the topbar hairline, `--accent` (the
interactive/brand slot), the map route line, focus and hover states, and the blurred
background map.

The tone must **never** reach: panel surfaces, body text, or the four status colours.
`--s-crit` red must mean blocked/critical in every city or it means nothing anywhere, and
recolouring panel surfaces re-opens the entire night-mode readability problem the
glassmorphism merge closed (see the comment at line 78 and the `--tone-txt` set at 349–351).

Practically: **the city tone replaces `--accent` and nothing else.** Four of the six easy
hues are already spent on meaning — red critical, amber warning, green positive, blue
interactive — so the fourth slot is the only one available.

### Rule 2 — two tokens per city, per theme

One token cannot do this job. `--accent` is used as a **solid fill with `color:#fff`** in at
least four places (`.slot-act button.pri` 1109, `.chg-go`, `.rs-btns button.pri` 1127,
`.bar i` 416), which means any city fill must clear **4.5:1 against white**. Tesla blue
`#3E6AE1` only just does, at 4.82:1. Bright saturated hues do not: a mid yellow is ~1.7:1,
orange ~2.6:1, hot pink ~3.5:1. So:

- `--accent` — the **dark fill**. The only token allowed behind white text. Must be ≥4.5:1 vs `#fff`.
- `--city-tint` — the **bright hue**. Tab, hairline, route line, glow. Never behind type.

Times a night variant each (`--accent:#5A82EB` at night is the existing precedent), so it's
2 tokens × 2 themes × N cities. Also needs `--accent-rgb` per city, since the rgba washes
derive from it.

Working palette, all fills verified ≥4.5:1 against white:

| City | `--accent` (day) | `--accent` (night) | `--city-tint` |
|---|---|---|---|
| Austin | `#3E6AE1` (4.82:1) | `#5A82EB` | `#5A9BF6` |
| Dallas | `#A15C1E` (5.17:1) | `#C87A33` | `#E08A2E` |
| Miami | `#B5257E` (5.95:1) | `#D9479A` | `#F2559F` |
| SF Bay | ~~`#6D3FD4`~~ superseded — see below | | |

Austin keeps Tesla blue — it's the product's identity and the game's default look; changing
the tutorial city changes what Deadhead looks like.

### Rule 3 — this is blocked on finishing the `--accent` tokenisation

`--accent` is only **half** tokenised today. 23 `var(--accent)` uses, but also **7 hardcoded
`#3E6AE1` and 7 hardcoded `#4B77E8`**, nearly all of them this pattern:

```css
background:linear-gradient(180deg,#4B77E8,var(--accent))
```

Swap `--accent` to bronze and Dallas gets a button that's bronze at the bottom and Tesla
blue at the top. `.chip.on` (1049) likewise hardcodes `rgba(62,106,225,.13)` instead of the
`--accent-rgb` token declared two lines away from it.

This is the exact bug class the comment at line 78 records — *"these were literals until
v0.21.0, which is why night mode showed a white…"*. **Finish the tokenisation, confirm
Austin renders byte-identically, then a city tone is data.**

### Two cheap wins already present

- **Extend `data-tone`, don't invent a parallel system.** Panels already carry
  `data-tone="blue|green|amber"` driving `--tone-rgb`/`--tone-txt` (349–351). That's the
  machinery a city tone needs.
- **Pre-tint `#bgmap` per city.** Improvementplan item #8 already wants that second live
  Leaflet instance replaced by a static image. A per-city *pre-tinted* static image changes
  the whole page's mood for free and closes item #8 at the same time. Cheapest possible
  route to "whole page tone".

### The tab shape

Angled/skewed overlapping tabs look good but will not survive ≤1199px on the fixed 32:9
cockpit — narrow layout has already produced the hairline Platforms panel and the
dead-looking "Take control". **The skew should degrade to the existing `.seg` segmented
control below T3.**

Trap if reusing `.seg`: the control-strip audit found a decorative `aria-pressed` flipper
fighting `render()`. The city tab's pressed state must be derived from `S.city` on every
render and never held locally.

### The one thing to test rather than trust

**Dallas bronze against an amber low-SoC warning in the same viewport.** It's the closest
hue collision in the set, and the failure mode is that a warning stops reading as a warning.

---

## Save architecture

Saves live in IndexedDB (5455) with `auto` + `slot1..3` (5115). `S.city` is already persisted (5130) and validated on restore (5290), so **loading a manual slot already restores the correct city** — no change needed there.

Two additions:

1. **A `progress` record**, separate from any run: which cities are unlocked, and the result of each completed city. This is the only thing that survives starting a new city, and it's what the padlock reads.
2. **Per-city auto-save.** `auto` currently holds one run. Entering Dallas must not overwrite the Austin auto-save — key it `auto:austin`, `auto:dallas`, migrating the existing bare `auto` into `auto:austin`. This is a `SAVE_V` bump with an ascending migration, same as v1→v6.

`newFleet()` (6194) already sets `S.city='austin'` — it becomes "new run in city X".

---

## Prerequisites, still blocking

1. **Source ↔ deploy fork** (improvementplan item #2). City work touches both `deadhead.html`
   and `deploy/public/index.html`, and a `cp` in either direction currently destroys work.
   `check-parity.js` exists but the fork needs merging before this starts, not during.
2. **Finish tokenising `--accent`** (14 remaining literals — see §"City identity" rule 3).
   Until this is done, swapping the accent per city produces two-tone buttons.

---

## Order

1. Merge the source ↔ deploy fork, re-copy, VERSION bump.
2. Finish the `--accent` tokenisation (kill the 7 `#3E6AE1` + 7 `#4B77E8` literals and the
   `.chip.on` rgba). Austin must render byte-identically afterwards.
3. OSRM bake script (emits `ROADS_BY_CITY` literals from a zone + charger list).
4. `ZONES_BY_CITY` + `zonesFor()`, `let ZONES`, geofence reset on city switch and in `newFleet()`.
5. Widen the per-city config; move `tariff()`, the fleet cap, and the tone tokens into it.
   Austin unchanged as the only entry — verify nothing regressed with one city before adding two.
6. `progress` record + per-city auto-save (`SAVE_V` bump + migration).
7. Padlocked city tab bar gated on `S.ray.day1Done`, skew degrading to `.seg` below T3.
8. Dallas: zones, real Superchargers, baked roads, multipliers, tone, goal.

Steps 1–5 ship with Austin still the only city. If steps 2 and 5 land and the game plays and
*looks* identical, both abstractions are right.

---

## Status — all eight steps shipped, v0.23.0

Parity OK, both test files green (`npm test` now runs `boot-smoke.test.js` then the new
`city.test.js`). What landed:

| Step | Result |
|---|---|
| Source ↔ deploy fork | **Already fixed** before this work — `check-parity.js` exists and is wired into `predeploy`. The plan was stale. |
| `--accent` tokenisation | `--accent-hi`, `--accent-2-rgb`, `--city-tint` added; 14 literals removed. Austin's computed tone asserted byte-identical to `:root`. |
| OSRM bake script | `deploy/scripts/bake-roads.js`. Boots the game in jsdom and reads the real zone/charger tables through `DH_ACT1`, so geometry can never drift from shipped coordinates. |
| `ZONES_BY_CITY` / `ROADS_BY_CITY` | Per-city tables with `zonesFor()` returning **fresh clones**, so the geofence can't reach the authored defaults. |
| Scenario config | `permit`, `fleetCap`, `fareK`, `depK`, `insK`, `power`, `goal`, `order`, `needs`, `tone`. Austin all-1.0. |
| Progress + per-city autosave | `physKey()` maps the logical `'auto'` to `auto:<city>` at the Store boundary; separate `progress` record for unlocks/results/last city; one-time move of the legacy bare `auto` key. |
| City tab bar | Skewed tabs degrading to `.seg` below 1199px, padlock until `day1Done`, pressed state derived from `S.city` with a signature guard so it can't churn or eat focus. |
| Dallas | 12 zones, 4 real Superchargers, bronze tone, `SAVE_V` 7. |

### Three things worth knowing

**1. `newFleet()` had a real bug, worse than improvementplan #5 described.** It reset the
geofence with `ZONES.forEach(z => z.on = true)` — turning on *all eleven* Austin zones,
including the airport and all three breweries that the file's own comments say must be off
for a fresh save. It now re-reads the city table, restoring the authored three.

**2. Night-mode accents fail WCAG AA, and this predates cities.** `--accent` is a solid fill
under `color:#fff` (`.slot-act button.pri`, `.rs-btns button.pri`). Austin's existing night
accent `#5A82EB` measures **3.60:1** against white — below the 4.5:1 floor for normal text.
Dallas's night bronze inherits the same shortfall at 3.34:1. The test enforces 4.5:1 for day
and 3.0:1 for night, with the deviation documented in-line rather than silently blessed.
Fixing it properly means darkening the night accents, which changes how Austin looks at
night — a product decision, so it's left open rather than decided.

**3. DESIGN.md §5 is wrong about Dallas, and the code follows reality instead.** That table
guessed "enormous geography, highway-heavy". Tesla's actual Dallas launch (18 April 2026) was
a *compact* geofence over downtown, Uptown, the Park Cities and Highland Park — tighter than
Austin's. It did launch fully unsupervised, which the table got right. Dallas therefore earns
its difficulty from wear (`depK` 1.22), insurance (`insK` 1.18) and the unsupervised permit,
not from invented sprawl. §5 should be corrected.

Related: S Riverfront is 34 stalls at **325 kW** — more stalls and more power than anything in
Austin. Dallas is the harder city with the *easier* charging, which was not a design choice;
it's what the real data says.

### Open

### Road geometry — baked, then thinned

Both cities are baked: **Austin 110 pairs, Dallas 114, zero skipped.** Austin went from 68
pairs to 110 in the process, which fixed the three brewery zones that had never had geometry.

The first bake exposed a problem the plan didn't anticipate. OSRM's `overview=full` returns
every vertex it holds, including highway-ramp curvature: 50,295 points across 224 routes, an
average of **225 points per route**, taking `deadhead.html` from 363 KB to **1.2 MB** — at
which point 71% of the game was road geometry it could not visibly use.

`bake-roads.js` now runs Ramer–Douglas–Peucker over every route at a 15 m tolerance. Two
independent floors agree on that number: coordinates are already rounded to 4 dp (≈11 m
quantisation), so a tighter tolerance simplifies rounding noise rather than shape; and at the
zoom this map draws, one screen pixel covers 20–40 m at these latitudes. Measured result:

| | points | avg/route | file |
|---|---|---|---|
| before | 50,295 | 225 | 1,201,365 B |
| after | 5,168 | 24 | 444,466 B |

RDP always keeps the first and last point, so endpoints are bit-exact — which matters because
`roadFix()` pins a car's drawn position to the ends of its leg. There's a test for that
specifically.

`--thin --write` re-simplifies geometry already in the file with no network at all, which is
how the existing 1.2 MB bake was fixed without spending another four minutes of a donated
OSRM server's time.

**Verified invariant:** Downtown → AUS airport is 10.7 km straight against 18.1 km by road,
and the fare still quotes on the straight line. The geometry stayed cosmetic.

### The gate, revised — v0.23.1

Originally `needs:'day1'`, gating on `S.ray.day1Done`. Now `needs:'shift1'`: **the first shift
clocked off.** The reasoning for the change is that clocking off is the moment the game's
argument actually lands — the shift report puts what the car earned against what it costs to
own for the twenty hours you weren't watching it. A player who has read that page understands
what a second city is *for*. Making them finish the rest of the scripted day first only delays
the offer.

The trap here, and why the implementation reads the way it does:

- **`S.shiftNo` increments on clock-*on*.** So `shiftNo > 0` is true from the first minute of
  the first shift, and would have opened the tab before the player ever saw a shift report.
  The correct expression is `shiftNo > 0 && !onClock`, which is not invented for this — it's
  the codebase's existing phrase for "has completed a shift", already gating the ops panel and
  tutorial beat 12. One definition, not two that can drift.
- **`gateMet(kind)` is the single definition**, shared by `cityUnlocked()` (tab state) and
  `progGates()` (permanent promotion). When those two disagreed, a tab could light up without
  the unlock ever being recorded.
- **`PROG.unlocked` is checked *before* `gateMet()`.** `gateMet('shift1')` goes false again the
  moment the player clocks back on, so without the latch the tab would flicker shut for the
  whole of every later shift. There's a test for exactly that.
- **An unrecognised `needs` value stays locked.** A typo should hide a scenario, not silently
  open it.

Verified across all four states (never clocked on → mid-shift-1 → clocked off → mid-shift-2),
and the gate assertions were mutation-tested: weakening the expression to `shiftNo > 0` fails
two checks immediately.

### The tab did nothing but replay the intro — v0.23.2

Reported symptom: clicking Dallas played the intro video and stayed on Austin. One cause for
both halves. **`newFleet()` hardcoded `S.city='austin'`**, so `switchCity` set the city and
`newFleet` set it straight back; what remained looked like a brand-new Austin game, which is
precisely why it played the intro.

- `newFleet(cityId)` takes the city it's starting, defaulting to the first scenario, with an
  unrecognised id falling back rather than leaving `S.city` undefined. Every caller now names
  its city, so the resume dialog's "New fleet" and the boot fallback respect `PROG.last`.
- **Intro video and the scripted `DAY1_ORDER` walkthrough are first-city only.** Someone
  opening city #2 has already clocked off a shift. Those runs get `day1Done=true` so Paolo goes
  straight to contextual advice. The garage still opens either way — only the video is
  conditional.
- `newFleet()` never reset `S.permit` at all, so a Dallas run inherited Austin's "Supervised"
  and the topbar lied about the defining fact of the city. Now taken from the scenario.

Two further things found while testing, not hypothesised:

- **`switchCity` could leave the game half-switched.** If `Store.get('auto')` rejects — IndexedDB
  blocked, e.g. a private window — `S.city`, the per-city tables and the tone had all moved
  while the cars, cash and permit were still the previous run's. A storage failure now reads as
  "no save for this city" and opens a clean run; the outer catch starts fresh rather than
  leaving the chimera on screen.
- `newFleet()` asserts the intro overlay closed for a non-tutorial city instead of assuming.

Eight regression checks added and mutation-tested: restoring the hardcoded `S.city='austin'`
fails four of them immediately.

### The map stayed in Austin — v0.23.3

Reported as "Dallas is accessible but map is Austin". Three separate causes, and none of them
was the `setView` in `switchCity`:

1. **`initMap()` hardcoded `.setView([30.2700,-97.7400],13)`.** `switchCity` did move the view,
   but any *boot* into a saved Dallas run re-centred on Austin, because the only code choosing a
   centre had one city's coordinates baked in.
2. **Zone circles and Supercharger pins were built once inside `initMap()`** from whichever
   tables were live at that instant, and never rebuilt — so a Dallas run drew Austin's eleven
   zone circles and Austin's five chargers. The charger markers weren't stored anywhere either,
   so there was no handle to remove them (hence the new `chLayer`).
3. **`#bgmap`, the blurred wallpaper, was a hardcoded tile path** — `/8/58/105.png`, which is
   Austin. Every city sat on a blurred picture of Texas hill country.

`centerCity()` and `buildCityLayers()` are now called from `loadCityTables()`, the single place
every city change already passed through, so boot, `newFleet()`, `restore()` and the tab all get
the view and overlays without having to remember. Both no-op while `map` is null (loadCityTables
runs before initMap at boot), so initMap calls them once the map exists. `switchCity`'s own
`setView` is gone — it would fight a player who had already panned.

The wallpaper tile is derived with slippy-map maths rather than listed per city, so a new
scenario needs no extra asset. **There's a test pinning Austin to `/8/58/105.png`** — the exact
tile that used to be hardcoded — because replacing a constant with a derivation is only safe if
it lands on the same value. Verified end to end against a Leaflet stub: view Austin → Dallas,
zones 11 → 12, chargers 5 → 4, tile `/8/58/105.png` → `/8/59/103.png`.

Two of the six new checks cover the Leaflet-never-loaded path, since the map is an optional
dependency by design (`UI-SPEC.md` §0c): both functions must degrade rather than throw, and
leave no stale overlays.

### Units and the grey sky — v0.23.4

**Temperature never joined the units layer.** `WX.temp` holds Celsius (that's what Open-Meteo is
asked for) and nothing converted it, so a player on miles read "35" next to "mi". `uTemp()` is
now the single conversion point, rounded — 35 °C → 95 °F, 0 °C → 32 °F. A missing reading gives
a dash in the correct unit rather than `NaN`, the same guard the fetch already applies.

**The cloud overlay greyed a clear sky.** It painted whenever cover exceeded `0.02`, and "Clear"
falls back to 5% cover while the hourly forecast for a bright day is routinely 30–40%. So the
map sat under three grey gradients while the strip said Clear.

- Floor raised to **0.45**, above "Partly cloudy" (35%). Clear and partly cloudy now paint
  nothing; a veil means genuine overcast.
- **Cloud lightens instead of darkening.** The old colour was a dark slate that read as gloom or
  a dirty screen. Real overcast over a light map is a bright veil, not a shadow. Storms keep a
  cooler, deeper tint — there the menace is the point.
- The ramp starts at the floor, not at zero, so overcast fades in rather than snapping on. Three
  gradients overlap, so the per-pass ceiling is 0.085.

| cover | before | now |
|---|---|---|
| 5% (Clear) | grey gradients | **nothing** |
| 35% (Partly cloudy) | grey gradients | **nothing** |
| 60% | grey | 6.8% veil |
| 85% (Overcast) | grey | 17.4% veil |
| 100% | grey | 23.4% veil |

Worth knowing: the overlay follows the forecast for the **sim** hour while the strip shows
**real current** conditions, so the two can legitimately disagree. That's by design, and it's
also why the old threshold looked so wrong — at 06:00 sim time it painted the small hours' cloud
under a label reporting a clear afternoon. A subtler veil makes the mismatch stop mattering.

### Dallas opened at a dead hour — v0.23.5

Reported as "in Dallas it is like 4 minutes nothing". Measured, and the offer *rate* was fine —
the *defaults* weren't.

`CFG.simPerReal` is **1**, so at 1× speed offers per sim-hour are offers per **real** hour. The
day opens at 06:00 (`CFG.dayStart`), where the work curve is 1.0 and the night curve is 0.2.
Dallas's three default zones were Downtown (work) + Uptown (**night**) + Deep Ellum (**night**)
— two thirds of its opening demand asleep. I wrote the comment as "the two that carry the
work/night curve plus one night district" and then picked two night zones.

| | 06:00, one feed | gap |
|---|---|---|
| Dallas, before | 12.8/h | 1 per 4.7 min |
| Dallas, after (SMU for Deep Ellum) | 16.9/h | 1 per 3.5 min |
| Austin | 18.3/h | 1 per 3.3 min |

Verified against the simulation rather than the formula it came from: one simulated hour held at
06:00, accepting every offer, lands within **2–6%** of predicted across five configurations.

Two additions so a quiet shift can't be mistaken for a broken one:

- **`offersPerHour()` is the single definition**, and `spawnRides()` reads it too, so the readout
  can never disagree with the simulation. The Offers panel states it — *"3 of 12 zones live ·
  ~17 offers/hour at 06:00 · about one every 3.5 min"* — amber below `THIN_RATE` (18/h), and says
  plainly when no feed is connected or no zone is live.
- **Paolo names the geofence.** `nextTask()` already advised a second feed but never mentioned
  zones, which is the bigger lever: three of twelve live means opening the map roughly *triples*
  the rate, where a second feed adds ~40%. Fires only below `THIN_RATE`.

The strongest new test asserts the **mix**, not the total — at least two day-profile zones live
at the opening hour — because a future city could reproduce this bug while still summing to a
plausible-looking base.

**Time scale left alone deliberately** (1× is real-time by design). But note `DESIGN.md` §6.1
still claims a game day is 10–15 real minutes and lists speeds 1×/2×/4×, while the code has
`simPerReal:1` and `0/1/4/20`. An 18-hour day is 18 real hours at 1× and 54 minutes at 20×.
**§6.1 is stale and should be corrected**, alongside §5's Dallas row.

---

## City #3 — Miami, and the gate becomes a chain — v0.24.0

Miami over Houston and Orlando/Tampa, for the reason Dallas was picked over Miami last time:
it is the candidate that is *real difficulty* rather than a re-skin and needs the fewest new
systems. Houston launched the same day as Dallas under the same rules and would have been a
bronze city with different street names. Orlando/Tampa needs a peaky airport/theme-park demand
curve that does not exist yet.

### What makes Miami a scenario rather than a skin

Tesla's published Miami geofence (3 July 2026) is 10–14 sq mi of *western* Miami-Dade —
West Miami out to Doral and Sweetwater, bounded by the Palmetto and US-41. **Everything Miami
is famous for is outside it:** no downtown, no Brickell, no Miami Beach, no MIA, only a corner
of Coral Gables. The scenario is defined by that exclusion list:

| | Effect |
|---|---|
| **No airport zone** | First city without one. Every previous city had a long, well-paid run to lean on (AUS, Love Field). `airportZone()` returns `null` and the policy strip's airport toggle now **disables itself and says why** — before this it stayed live and did nothing when clicked, exactly the dead-control failure the control-strip audit went looking for. |
| **No downtown** | No work-curve monster like Austin's Downtown core (base 14). Demand is a business park, a mall, a university and suburbia, so `fareK` is **0.94** — below 1 for the first time. |
| **Slow charging** | Miami's Supercharger coverage is legacy urban hardware: Dadeland Station 12 stalls at **72 kW**, Brickell 10 at 72 kW. Only Doral (8 × 250 kW) is inside the geofence; measured from the default anchor zone, the others are 9.1 km, 10.9 km and 14.8 km out. Dallas is the harder city with easier charging; Miami is the reverse. |
| **Nine-hour power peak** | FPL's RTR-1 summer on-peak is **noon–21:00 at 26¢/kWh** against Austin's five-hour 16:00–21:00 window. Expensive power across the entire productive afternoon is the harshest single number in the game, and it is a published tariff. |
| **Worst insurance in the US** | `insK` **1.35**, the highest in the table by a wide margin. |
| **Rain and traffic** | `incK` **1.30** plus the new weather term — see the mechanic below. |

Rhythm consequence worth stating: **the money in Miami is the morning.** Austin and Dallas
both hand you a nightlife district (Rainey, Uptown) that carries the late hours; Miami's
nightlife is all in the excluded half of the county. The default mix is therefore
work/work/**home** rather than work/work/night — Fontainebleau and Westchester commuting into
Doral. A player who learned to run late shifts in Texas is working the wrong end of the clock.

Measured at the 06:00 open, one feed, three live zones: **Miami 20.2/h**, Austin 18.3/h,
Dallas 16.9/h. Opening the whole map: 36.3/h. Miami is the busiest opener in the game, which
is the right shape for a tiny box — the pressure is charging and margin, not finding work.

Data provenance, same standard as Dallas: the four Supercharger records are **transcribed**
from tesla.com location pages (the coordinates come out of the Google static-map URL embedded
in each page). The twelve zone coordinates are **neighbourhood centroids placed from street
geography**, not surveyed, and the file says so. The three taprooms are real Miami breweries.

### The one new mechanic: incident risk is a function

Incident risk was the literal `0.00018` sitting inline in `step()`, which could express
neither "this city is rougher" nor "it is raining". The second was the glaring one: the
weather layer already slowed every car and surged demand, and then a Florida thunderstorm made
no difference at all to whether a car got stuck — the thing a camera-only stack is genuinely
worst at.

```
incidentRisk() = INC_BASE × cityK('incK') × weatherIncidentMult()
```

Storm ×2.2, heavy rain ×1.7, light rain ×1.25 — deliberately the harshest weather factors in
the file, because rain is a safety problem before it is a schedule problem (a storm costs 35%
of the speed and more than doubles the risk). `incK` is 1.0 everywhere except Miami's 1.30.

**The elevated risk is stated, never merely applied.** `incidentRiskNote()` puts a line in the
Incidents panel — *"Risk 186% above baseline — storms + Miami traffic."* An invisible
multiplier is indistinguishable from bad luck, and a player who cannot see the reason learns
nothing from the consequence.

The test that matters here is not any of the ones asserting the multipliers. It is the one that
pins `Math.random` between the baseline and the elevated risk and drives a car through
`stepCar()`, proving **`step()` actually consumes the function** — because every other check
passes with `incidentRisk()` perfect and the old constant still inline. Mutation-tested: it
does fail on that mutation, and nothing else did.

### The gate is now a chain

Pavel's ask: one shift in Dallas opens city #3, the same way one shift in Austin opened Dallas.
The catch was that `gateMet('shift1')` reads the **live run only** and has no idea which city
the shift happened in — so a second *Austin* shift would have opened Miami without the player
ever visiting Dallas.

- New gate form **`'shift1@<city>'`**, and Dallas's `needs` moved from `'shift1'` to
  `'shift1@austin'`. Bare `'shift1'` is kept for back-compatibility and for a scenario that
  genuinely does not care where you learned the game.
- Per-city, per-run-outliving record: **`PROG.results[city].shiftDone`**, banked by
  `progNoteShift()` from `progGates()` — *before* the unlock loop, so the tab lights on the same
  frame rather than the next one, and only writing when something actually changed (this runs
  five times a second).
- **`shiftFinished()`** is now the single spelling of `shiftNo>0 && !onClock`, so the phrase
  exists once instead of in four places.
- **`gateMet('shift1@nowhere')` stays locked.** A gate naming a city that does not exist is a
  typo, and a typo must hide a scenario, not open one.
- **`progTrack()` had to be taught to carry `shiftDone`.** It *replaces* the results record
  rather than merging into it, so any field it forgets is destroyed on the next autosave — and
  this one is the next city's unlock condition. There is a test for exactly that.
- **`PROG_V` 1 → 2 with a real migration.** A v1 record has no `shiftDone`, and reading a
  missing flag as false would make a player who has already run several Dallas days clock off
  one *more* shift to open Miami — a regression dressed as a migration. A run that reached
  day 2 provably clocked off at least once (the day only advances through the shift report), so
  the flag is inferred from `results[city].day > 1`. Day-1 records stay false, where it honestly
  is not recoverable.

Mutation-tested: setting Miami's `needs` back to the bare `'shift1'` fails three checks.

### Night accents now clear AA — and the deviation that was defended

The 3.0:1 night floor was a documented deviation with a comment explaining why it was
acceptable. The comment was wrong: `--accent` is a solid **fill** under `color:#fff`, so the
dark surface behind it is irrelevant and 4.5:1 was always the real requirement. Fixed by taking
each city's night accent to the lightest value **of its own hue** that clears it:

| City | night accent, was | now |
|---|---|---|
| Austin | `#5A82EB` 3.60:1 | `#406EE8` **4.55:1** |
| Dallas | `#C87A33` 3.34:1 | `#A7662B` **4.59:1** |
| Miami | — | `#D4308D` **4.56:1** |

The `:root` night block was updated in step with `CITIES.austin.tone.night`, since that block is
what the page looks like before `applyCityTone()` runs and a test asserts the two agree.

The gradient's lighter **top stop** now has a floor too, at 4.0:1 — a real deviation rather than
a hidden one, because holding `hi` to 4.5 would mean `hi === accent` and no gradient in any city
or theme. Austin's *day* `hi` has measured 4.12:1 since the gradient existed. Dallas's day `hi`
went `#B96D28` → `#B86C28` (3.98 → 4.03), a one-digit change nobody will see, in preference to
loosening the test.

### `nudge-zones.js` — the centroid fix, as a script

Zone centroids sat up to 452 m (Austin) / 311 m (Dallas) from the nearest routable road, so
some route lines started a block or two from their own pin. `deploy/scripts/nudge-zones.js`
asks OSRM's `/nearest` service where the closest drivable way actually is, reports the gap per
zone, and with `--write` replaces the coordinate. Same conventions as `bake-roads.js`: reads the
real tables out of the booted game rather than duplicating them, one request at a time on a
donated server, and it refuses to write when every lookup failed so running it offline cannot
flatten real data.

**Order matters, and the script says so after a write:** nudging a zone moves a route endpoint,
so the geometry already in the file is anchored to the old coordinate.

```
node scripts/nudge-zones.js austin --write     # then
node scripts/bake-roads.js  austin --write
```

`nudge-splice.test.js` covers the splice with no network at all: it edits the zone it was asked
for and no other, stays inside the named city's block even where two cities share a zone name
(Austin and Dallas both have a 'Downtown core'), leaves `base`/`p`/`on` alone, throws on a name
that is not there, and the result is booted in jsdom to prove `ZONES_BY_CITY` still parses.

### Still to run on Pavel's machine

OSRM and Open-Meteo are both unreachable from the sandbox (`403 blocked-by-allowlist`), so
anything that needs the network is his to run:

```
cd deploy
node scripts/nudge-zones.js all                 # dry run first — read the gaps
node scripts/nudge-zones.js all --write
node scripts/bake-roads.js miami   --write      # no geometry yet
node scripts/bake-roads.js tampa   --write      # no geometry yet
node scripts/bake-roads.js orlando --write      # no geometry yet
node scripts/bake-roads.js austin  --write      # re-bake whatever the nudge moved
node scripts/bake-roads.js dallas  --write
npm test && npm run check-parity
```

Nudge before baking, always: a moved zone is a moved route endpoint. Baking five cities is
~550 OSRM routes at one request every 350 ms, so budget five minutes and expect the file to
grow by roughly 200 KB after thinning.

Until the Miami bake lands, `roadsFor('miami')` is `{}` and the map draws straight lines there —
a supported state (`roadPath()` returns null and the caller falls back), not a bug.

---

## Cities #4 and #5 — Tampa and Orlando — v0.25.0

Chain is now **Austin → Dallas → Miami → Tampa → Orlando**, five scenarios, each gated on one
shift clocked off in the one before it. `cityList()` order is asserted, and so is the chain
itself: every city's `needs` must be `'shift1@' + the previous city`, which catches both a city
that skips a link and two cities gating on the same one.

### The tourism premise was wrong — for the third time

`DESIGN.md` §5 had these two down as "airport and theme-park demand, extremely peaky, long
airport runs, strong seasonality", and that was the stated reason they needed a new demand
curve. What actually launched on 21 July 2026:

- **Orlando** is a corridor along Semoran Blvd (SR-436) and Lee Vista Blvd that runs past MCO
  and *does not include it*. Disney and Universal are 20+ km southwest.
- **Tampa** is downtown, Ybor City, Tampa Heights, West Tampa, Hyde Park and part of East
  Tampa — and excludes TPA, South Tampa and every suburb.

So no new curve was needed after all, and three of the five shipped cities now have no airport
zone. Third time reportage has overruled the design note (after Dallas's "enormous geography"
and Miami's hurricanes), which is starting to look like the rule rather than the exception:
**Tesla's early geofences are small, arbitrary, and exclude the landmarks.**

### Tampa — the mirror of Miami

Miami got the suburbs and no core; Tampa is nothing but core. That is what earned it a slot
ahead of Houston, and the inversion is measurable rather than thematic:

| | 06:00 | 21:00 | evening/morning | 21:00, taprooms live |
|---|---|---|---|---|
| Austin | 18.3/h | 24.0/h | 1.31 | 42.4/h |
| Dallas | 16.9/h | 24.6/h | 1.45 | 43.0/h |
| Miami | 20.2/h | 11.9/h | **0.59** | 30.2/h |
| **Tampa** | 17.7/h | 25.1/h | **1.42** | **46.0/h** |
| Orlando | 18.2/h | 14.8/h | **0.81** | 14.8/h |

Miami and Orlando are morning cities — their 21:00 rate is *below* their 06:00 rate. Tampa is
the opposite and its evening is the largest single hour in the game, because Ybor City is a
real nightlife district inside the geofence and the three Ybor-area taprooms stack the brewery
curve (2.2 at 19:00) on top of the night curve (2.0 at 21:00).

The lesson is not "evenings are good" — Austin and Dallas already reward those. It is that a
player arriving straight from Miami's morning rhythm has to unlearn it, and that the Geofence
panel is worth reopening in every city rather than set once and forgotten.

**Charging inverts too.** Both Superchargers inside the service area are 150 kW (West Swann
10 stalls, N 50th 8 stalls); both 250 kW sites are outside it (N Dale Mabry 4.5 km, E Bearss
15.6 km). Tampa's trade is therefore not "fast or far" but "stay in the box and charge slowly,
or leave the box and lose the evening you came for". TECO's off-peak is 7.5¢/kWh, the cheapest
night power in the game — real relief, available at exactly the hours you want to be working.

`fareK` 0.92 is the lowest of the five: a small dense core means the shortest trips in the game.
Tampa earns on volume and on the night, never on the individual fare.

### Orlando — the thinnest city, next to an airport it cannot serve

The geofence borders one of the busiest airports in the United States and every one of those
fares belongs to somebody else. What is actually inside is a hotel belt on Semoran, an office
park at Lee Vista, retail at Goldenrod and a lot of apartment complexes.

- **First city with no brewery zone at all.** Orlando's beer scene is real and good — Ivanhoe
  Park, Ten10, Broken Strings, Orlando Brewing — and all of it is 8–14 km northwest of this
  corridor. Adding a taproom zone would be inventing service area, so the Geofence panel has
  nothing to switch on. The number that shows it: opening every zone buys a +74% to +155%
  evening in every other city and **+0%** here.
- **Thinnest demand in the game**: 18.2/h at open (just over the `THIN_RATE` amber line, on
  purpose), 14.8/h at 21:00, and a 31.5/h ceiling with the whole corridor live — half of
  Tampa's, less than half of Dallas's. A big fleet starves, hence cap 14 and the lowest goal.
- **Genuine compensations**: OUC is a municipal utility with the cheapest power of any scenario
  (~11.8¢ average, shallow peak), and Lee Vista Blvd is 8 stalls at **325 kW** — tied with
  Dallas for the fastest hardware and the only site inside the geofence. With 8 stalls against
  a fleet of up to 14, the charger queue penalty finally bites: past eight cars the alternative
  is a 14.5 km deadhead out of the corridor.

### Two provenance notes worth keeping

1. **tesla.com can be wrong.** The Lee Vista Boulevard Supercharger page embeds a static map
   centred on 39.97,-83.00 — Columbus, Ohio, 1,500 km from the site — in every locale variant.
   Its stalls, power and host are transcribed as usual; the coordinate is placed from the
   street address and labelled as such in the file. If a future city's coordinates look
   implausible, check the embedded map against the address before trusting the trick.
2. **Orlando's zone spread is real geography, not sloppiness.** Its centroids cover ~14 km of
   latitude where Tampa's fit inside 7 km, because one city is an arterial corridor and the
   other is a core.

### Tone: Orlando takes the purple that was reserved for SF Bay

The palette table above assigned `#6D3FD4` to SF Bay. At the time this section was written, SF
was believed blocked on Act 2 (see the v0.39.3 correction below — it wasn't), so Orlando took
the violet slot. Both tones below clear the AA rules from v0.24.0 — fills ≥4.5:1 against white
in both themes, gradient top stops ≥4.0:1:

| City | `--accent` day | night | `--city-tint` |
|---|---|---|---|
| Tampa | `#0D7687` (5.31:1) | `#0E8092` (4.64:1) | `#18D7F6` |
| Orlando | `#7F4DD5` (5.35:1) | `#895BD9` (4.60:1) | `#A47CE9` |

### San Francisco — city #6, v0.39.3, and the Act 2 caveat was wrong

The reasoning above — "SF's mandatory safety monitor IS Act 2's payroll mechanic, so it can't
ship first" — was a mistake, caught when Pavel pushed back on it: `permit` was never a payroll
system. It's a label plus a couple of multipliers (`insK`, the goal text), which is exactly
what `permit:'Supervised'` has done for Austin since v0.23.2, with no hired-operator system
anywhere in the codebase. SF ships the same way, no Act 2 required.

Confirmed by research at ship time: Tesla's Bay Area service runs FSD (Supervised) with a real
safety driver in the seat — `'Supervised'` is reportage, not a difficulty knob, same as every
other city's permit. The CPUC has said on the record that this is a Transportation Charter
Party (limo-class) permit, not an autonomous-vehicle one — the "hostile regulator" texture,
obtained honestly rather than invented. The service is also still invite-only in reality, which
is why SF's fleet cap (12) is the smallest in the game rather than the largest for the biggest
metro modeled so far.

Tesla's own published area is the broadest yet — north of the Golden Gate down past San Jose —
so this models San Francisco proper, the same "one real slice of a bigger real area" move
Dallas and Tampa already made. SFO joined the real map on 21 July 2026, six days before this
scenario shipped, making it the first city where the airport run is real and current rather
than excluded (Miami, Orlando) or absent (everywhere else).

The standout real number: PG&E's EV2-A time-of-use tariff puts SF's off-peak price (31¢/kWh)
above every other city's PEAK price except Dallas's, which it ties. There is no cheap hour here
the way there is everywhere else.

SF's tone took a new hue rather than reclaiming Orlando's violet, to avoid a churn edit to a
shipped city over a palette-planning mistake:

| City | `--accent` day | night | `--city-tint` |
|---|---|---|---|
| SF | `#187A4A` (5.36:1) | `#1B8250` (4.82:1) | `#2ECC81` |

**Left open at ship time:** `ROADS_BY_CITY.sf` is `{}` — the sandbox this was built in has no
route to the public OSRM demo server, so SF draws straight-line fallbacks on the map until
`node deploy/scripts/bake-roads.js sf --write` is run somewhere with network access. This is a
fully supported state (see the comment above `roadsFor()`), the same one Orlando's zone-centroid
nudge sat in for a while — it does not block economy, fares, or distances, which never read
`ROADS`.

### The tab bar at five cities

`min-width:0` plus `overflow-x:auto` on `.citytabs`, so the strip is what gives rather than the
clock and speed control being pushed off the topbar, with tighter padding at ≤1199px (10px, and
11.5px labels) and ≤760px (8px, 11px). Deliberately the boring fix.

**Considered and rejected: collapsing to a dropdown past three cities.** It scales forever and
it throws away the padlocked tab — and a lock you can *see* is a goal, which is most of why the
Dallas gate worked in the first place.

### The clipped tab strip — v0.25.1

Reported at 1449px: `Austin | Dallas | Mia` and then nothing, with the active Miami tab sliced
down the middle. The v0.25.0 fix was worse than no scrolling at all — `min-width:0` +
`overflow-x:auto` did stop the strip pushing the clock off the topbar, but it let flex squeeze
the strip to a stub, hid the scrollbar, and then cut the **active** tab. Three things were
missing, all the same idea: *if content is going to overflow, the overflow has to be legible and
it must never hide the thing you are looking at.*

1. **A `min-width` floor** (132px, about two tabs) so flex cannot collapse the strip to a stub.
2. **`keepCityTabInView()`** scrolls the pressed tab into view on every rebuild and on resize.
   It writes `scrollLeft` directly rather than calling `scrollIntoView()`, which scrolls every
   scrollable ancestor — in a fixed 32:9 cockpit that shoves the whole layout sideways. Same
   trap `bringIntoView()` already documents, in a smaller box.
3. **`.ovf`**, toggled from JS when `scrollWidth > clientWidth`, fades the right edge, so a
   half-visible tab reads as "there is more" instead of as a rendering fault.

Also: **the skew now gives up at 1499px, not 1199px.** Five overlapping parallelograms need the
most horizontal room of any form this control can take, and 1499 is already a tier boundary in
this file (T4). Padding steps down again at 1199px (9px) and 760px (8px).

Five checks cover it, with the geometry stubbed on the element because jsdom does no layout —
what is under test is the decision, not the box model. Mutation-tested: deleting the two
`scrollLeft` lines fails two of them.

### Open

- Zone centroids not yet nudged (`nudge-zones.js` written and unit-tested, needs a network run;
  re-bake the roads for whatever moves).

### Done since — road geometry, all five cities

Baked and thinned: **Austin 110 pairs, Dallas 114, Miami 114, Tampa 114, Orlando 75** — 527
pairs, ~12,000 points, `deadhead.html` at 612 KB. Orlando averages 34 points per route against
~19 elsewhere, which is the corridor being genuinely longer rather than a thinning miss.
- `DESIGN.md` §5 and §6.1 — **corrected in v0.24.0.** §5 now carries the real launch dates,
  Dallas's compact geofence and Miami's exclusion list; §6.1 states the real time scale
  (`simPerReal:1`, speeds 0/1/4/20, 18 real hours at 1× and 54 minutes at 20×).
