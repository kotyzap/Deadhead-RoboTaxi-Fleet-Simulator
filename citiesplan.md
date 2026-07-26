# Deadhead — Multi-City Plan
_Decisions made 2026-07-26, against `deadhead.html` v0.22.0. Line numbers refer to the source file._

## Decisions locked

| Question | Decision | Why |
|---|---|---|
| City model | **Sequential scenarios.** One live simulation. Tab bar switches which *run* you're in, with an explicit confirm; the other city is parked, not ticking. | Matches `DESIGN.md` §5 ("scenario missions… own goal, constraints, required strategy"). Parallel live branches would turn `S` into `S.branches[city]` and force `tick()`/`render()`/`snapshot()` to answer "which one, or both?" — that's Act 2's complexity bill paid before Act 2 exists. |
| Economy | **No carryover. Each city starts at `CFG.startCash` ($7,500).** Meta-progression carries unlocks and a per-city result, never the balance sheet. | Arriving in Dallas with a mature bankroll means the Act 1 lesson — you cannot afford a single car outright, so you rent or you put money down — never lands again. That lesson is the game (see `S.cars=[]` at boot and the comment at 2610). |
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
| SF Bay | `#6D3FD4` (6.34:1) | `#8B62E8` | `#9A6CF5` |

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

### Open

- **Zone centroids up to 452 m from the nearest routable road.** OSRM snaps to drivable
  geometry, so a zone placed in a park or mid-block gets a route that starts a couple of
  blocks from its own pin (worst case Austin 452 m, Dallas 311 m). Not caused by thinning —
  RDP preserves endpoints — it's the centroids themselves. Cosmetic, but visible at zoom 13.
  The fix is nudging the offending zone coordinates onto a street.
- Night-accent contrast (see 2 above).
- Correct `DESIGN.md` §5's Dallas row (see 3 above).
