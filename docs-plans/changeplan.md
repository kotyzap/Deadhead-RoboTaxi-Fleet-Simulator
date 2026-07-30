# Deadhead — Change Plan (code review 2026-07-26, v0.11.0)

Scope reviewed: `deadhead.html`, `deploy/public/index.html`, `deploy/public/cloud.js`, `GameMechanics.md`, `DESIGN.md`, `UI-SPEC.md`. The deploy copy is the same engine plus a mobile (≤760px) CSS tier and map gesture lock — everything below applies to both files.

---

## 0. Fixed in this pass (already applied to both copies)

1. **Game-breaking: `CFG.platformCut` did not exist.** Fare completion in `stepCar()` computed `cut = f * CFG.platformCut` → `NaN`, so the first completed ride turned `S.cash`, `S.d.gross` totals and the whole economy into NaN (and `S.cash < 0` bankrupt check never fires on NaN). Now uses the ride's own platform cut: `platform(c.ride.plat).cut`.
2. **Books didn't match cash.** `drive()` recorded per-mile costs into the day ledger using per-vehicle spec cpm + fleet insurance, but deducted cash using the flat legacy `CFG.cpm`. Choosing a cheaper-to-run Cab changed the Books display but not what you actually paid. Cash deduction now uses spec cpm + `insPerMile()`.
3. **Arrival SoC used the wrong battery.** `render()` called `socNeeded(remainKm(sel))` without the car, so the console rail projected arrival charge using the default 75 kWh/0.19 pack for every model. Now passes `sel`.
4. **Charging froze while clocked off.** `stepCar` only ran when on-clock, so a car left on a charger overnight stayed at e.g. 40% forever (and Ray's "charge at 4 a.m. when power's cheap" advice was mechanically impossible — off-peak is 23:00–07:00 but the demand day ends at 24:00 and you clock off). Charging cars now progress regardless of the clock.

## 1. Bugs / correctness — high priority

- **Two source files are diverging.** `deadhead.html` and `deploy/public/index.html` are a 2700-line copy-paste pair differing only by the mobile tier. Every fix must be applied twice (as this pass had to). Either make `deadhead.html` the single source and generate/copy into `deploy/public/` in a build step, or fold the mobile CSS back into `deadhead.html` and symlink/copy verbatim.
- **Offer countdown runs on sim time, comment says real time.** `CFG.offerDecideSec: 45 /* real seconds */` but `stepOnce` does `o.left -= dt` (sim seconds). At 20× a 45 s offer expires in 2.25 real seconds — the offers panel becomes unreadable churn at high speed, which fights the "do the arithmetic anyway" design (Ray beat 5). Decide: tick `o.left` by real elapsed time (recommended — it's a UI decision timer, not a world event), or at least floor it at 4×.
- **`endDay()` is dead code.** Never called (the shift model replaced it); it references `d.payroll` and Meridian lines the live report dropped. Delete it, or wire it as an end-of-calendar-day summary.
- **Cost-per-mile is defined two different ways.** The Books panel `bk-cpm` uses `d.cost/d.miles` (includes commission + midnight fixed), the shift report deliberately uses operating-only. Same label, different number — the panel should adopt the report's operating-only definition (the report's comment already argues why).
- **Ray beat 12/14 spotlight a hidden element.** `spot:'rp-body'` is inside the report modal; if the card fires while the modal is closed the ring lands on an invisible node and the whole screen just dims. Guard `raySpot()` to skip targets whose `offsetParent` is null.
- **`migrate()` chain order.** Blocks run v4→5 before v3→4 before v<3, so a v1/v2 save is upgraded to v3 *after* the v4→5 block already ran, and never gets its car `model`/`hold` normalisation from that block (it works today only because the v<3 block duplicates it). Reorder ascending (v<2, v<3, v<4, v<5) so future bumps don't silently skip steps.
- **Double-billing edge on rented cars in `canAfford`.** Renting only needs 2 days runway but midnight bills `fixed + rent` (e.g. Crossover $52+$44 = $96/day); $88 runway on a $96/day car passes the check and bankrupts before the second midnight. Base the runway test on `fixed + rent`.

## 2. Mechanics consistency (vs GameMechanics.md / DESIGN.md)

- **`carsPerOp` stepper does nothing meaningful in Act 1.** There are no operators (`staffed()` returns a hardcoded 0, `syncOps` never hires), yet the console still exposes the Cars/op stepper and `latency()` — which sets blocked-car clear times — scales with it. Net effect: a player who lowers cars/op gets faster incident clears for free, with no payroll trade-off, contradicting the design question the file header says the prototype exists to answer. Either freeze the stepper (locked "Act 2") or make Act-1 latency a constant "you" response time.
- **`staffed(){ return S.onClock?0:0 }`** — always 0, opaque. Replace with `return 0 /* Act 1 */` or the Act-2 formula behind a flag.
- **Hours-billed line is hardcoded to 24.0 h** in the shift report even though `S.billedSec` is tracked. Since time only advances while clocked on (speed is forced to 0 on clock-off), a real day never elapses between shifts, so "the car was billed for twenty-four" is narratively right but numerically fabricated. Either bill fixed cost per clock-on day and say so, or let the world clock idle forward (see next point).
- **Time freezes when clocked off**, so midnight (and the $42 lesson) only ever arrives mid-shift. The thesis "the car owes $42 whether you work or not" is currently only true if you work. Consider letting time run 20× automatically while clocked off until the next 06:00, showing the fixed-cost hit land while you earn nothing — that's the whole Act 1 message made visible.
- **Surge is shown but never explained as revenue.** Rider fare includes `S.surge`, good — but the player's fare stepper (0.7–1.6×) and surge multiply together and `winProb` only looks at `fareMult`. At 2.0 surge + 1.15 fare a rider pays 2.3× and win probability is unchanged. Decide whether riders react to the *total* price (probably yes: feed `fareMult*surge` normalised by market surge into `winProb`).
- **Safety score has no path back up.** Only decrements (−2.5 per cancel). Add slow regeneration per clean shift, and actually enforce the "permit review at 65" the incidents panel threatens — right now nothing happens at any score.
- **`rideExpire` (9 min) vs `offerDecideSec` (45 s) interplay:** accepting with no free car quietly converts a 45 s decision into a 9 min hidden timer with no countdown anywhere in the UI. Show waiting accepted rides (with wait clock) in the Offers or Incidents panel.
- **Blocked-car incident rate is per-substep random** (`Math.random()<0.00018*dt`): fine, but `c.needs=latency()` with fatigue 0 and cpo 3 ≈ 38 s vs rider cancel at 150 s — incidents essentially always self-clear. If incidents should ever cost a fare, tighten (`cancelAt` down, or latency up at high cpo).
- **GameMechanics.md is out of date** where marked (§3.2 starting car, beat-14 trigger); fold the code-comment corrections back into the doc so it stays the source of truth.

## 3. Code quality / style

- **Split the monolith.** 2700 lines in one HTML file is at the pain threshold (this review's four fixes each risked touching the wrong copy). Suggested split for the deploy build: `style.css`, `engine.js` (CFG/state/sim), `ui.js` (render/controls), `save.js` (snapshot/migrate/store), keeping `deadhead.html` as the single-file dev artifact if you value that.
- **`render()` rebuilds all innerHTML every 200 ms** including static lists (zone chips, chargers, platforms). Fine at this scale, but wasteful and it destroys button focus/hover state each tick — noticeable when trying to click an offer that re-renders under the cursor. Cache static sections; only redraw rows whose data changed, or at minimum key offer cards by id and patch text.
- **Escape key** closes only the save manager. Also close report/garage/resume (except a forced first-run garage) for consistency.
- **Duplicate key** `fixedPerCar` appears twice in the `DH_ACT1` export object. Harmless, remove one.
- **ES5 style throughout** (`function(){}`, `filter()[0]`). Consistent, deliberate — keep it, but `find()` is available even in ancient targets you plausibly care about; a small readability win if you ever relax the constraint.
- **XSS-by-construction:** all innerHTML is built from internal constants so it's safe today, but `o.from`/`o.to` etc. flow through save-file import — a hand-edited save can inject HTML into the log/offers. Cheap fix: escape text fields on restore, or use textContent for user-touched strings.
- **`money()` vs `money2()`** mix rounding styles in adjacent lines of the report ($ integer vs $x.xx); pick per-context deliberately (cents for fares/costs, whole dollars for cash/prices) — mostly done, but "Fixed — billed at midnight" uses cents while cash uses whole dollars in the same table.

## 4. UX / polish (lower priority)

- Speed-slider "dots" row is static decoration (`on on hot`) — either drive it from `S.speed` or remove it.
- Console apps (Fleet/Energy/Books/Ops/Camera/Comms) toggle their pressed ring but never change the card content — pure chrome. Fine for a prototype, but at least Camera/Comms should be visibly "Act 2" locked rather than clickable no-ops (locks exist for some via `paintLocks` gates; Camera/Comms map to 'fleet').
- Offer cards: show **$/km net after deadhead** — the number Ray tells you to compute; the game preaches the arithmetic but makes the player do it mentally under a 45 s timer. (Or keep it hidden as a deliberate skill — then say so in DESIGN.md.)
- Night theme: `#bk-net` inline color and `.t-metrics` hardcoded `#171A20` values sit on the always-white console card, correct — but `.offer` uses `--c-card` (white) inside a glass panel that themes; in night mode offers are bright white cards on dark glass. Decide if that pop is intentional.
- Add `beforeunload` autosave in addition to `pagehide` for desktop browsers that don't fire pagehide on window close.
- Cloud (`cloud.js` + Worker) exists but there's no UI entry point in the game shell to sign in from `deadhead.html` (only in deploy's index? verify) — surface login in the save manager.

## 5. Suggested order of work

1. De-duplicate the two HTML files (build step) — everything else gets cheaper.
2. Offer countdown → real time; show accepted-but-waiting rides.
3. Cost-per-mile definition unification + rent affordability fix.
4. Act-1 latency/cpo freeze; safety score consequences.
5. Time-passes-while-clocked-off (the thesis mechanic).
6. `migrate()` reorder + save-field escaping.
7. render() incremental updates; Escape handling; dead code removal.
