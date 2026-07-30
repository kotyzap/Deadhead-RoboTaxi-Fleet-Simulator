# Deadhead — Company Bank Plan

_Decisions made 2026-07-27, against `deadhead.html` v0.36.0. Supersedes the "no carryover,
each city starts at `CFG.startCash`" row in `citiesplan.md`'s decisions-locked table._

## Status — shipped 2026-07-27, same day as the plan

All five steps landed in one pass, in both `deadhead.html` and `deploy/public/index.html`
(parity verified with `check-parity.js`), plus a new `deploy/test/company-bank.test.js` wired
into `npm test`. The three "Open" questions below got real answers rather than staying open —
Pavel said "implement it" rather than calling each one individually, so the defaults proposed in
this doc were taken as accepted and are now load-bearing code, not still-hypothetical numbers:

- **Grace period: 3 real days** (`CFG.parkGraceDays`).
- **Migration seed:** the first `restore()` call after this shipped sets `PROG.companyCash` from
  that save's own `s.cash` if the field doesn't exist yet, with no backdated billing for time
  before the feature existed (a city's `parkedAt` is only ever stamped from the moment it's first
  observed, never inferred backwards).
- **Partial payment does NOT reset the grace counter — only a full company-wide clear does.**
  There is no per-car debt ledger, only the one shared balance, so "paid" means the whole
  company is back at `>= 0`, not that any individual car's rent specifically got covered.

**One deliberate scope cut from the plan as written:** the plan's step 2 said cold boot should
"catch up *every* unlocked city, since real time passed for all of them, not just the one you
didn't open." That was not built. `reconcileParkedBilling()` only reconciles the city that is
actually being entered (via `restore()`, which every load path — `switchCity()`, boot, save-file
import — already funnels through), so a city you never revisit simply stays frozen at whatever
its last known `parkedAt` was, indefinitely, until you do reopen it. This is simpler, was not
asked for explicitly, and is arguably the more defensible reading of "parked, not ticking" —
but it does mean a truly abandoned city never bills further and never gets repossessed on its
own. Worth flagging in case the intent was closer to "every city is always secretly billing,
whether you ever go back or not."

**Implementation shape, for anyone reading the diff cold:**

- `PROG.companyCash` (new), `PROG.results[city].parkedAt` (new) — `PROG_V` 4→5.
- `newFleet(cityId, opts)` — `opts.keepCompanyCash` is the ONLY behaviour change; every existing
  call site (the "New fleet" button, the test suite, first boot) calls it with no `opts` and gets
  byte-identical behaviour to before. Only `switchCity()`'s two "no save for this city yet" call
  sites pass `{keepCompanyCash:true}`.
- `reconcileParkedBilling()` + `realDaysElapsed()` — new functions, called from inside `restore()`
  right after cash is synced from `PROG.companyCash`.
- `c.unpaidDays` — new per-car field, persisted automatically (snapshot() already round-trips
  unknown car fields verbatim).
- `bankrupt()` — unchanged, but now reachable from `reconcileParkedBilling()` too, not only the
  live per-tick check. Same function, same consequence, new trigger.

### Follow-up — Paolo actually says this now (2026-07-27, same day)

Audited every Paolo-voiced message (Day-1 `RAY` beats, `nextTask()`, `LOCK_LINES`) against the
new mechanic. Verdict: nothing was FALSE — the confirm dialog and cash tooltip already state the
new rules, and the Day-1 script's "$7,500 and no car" line is still literally true for a
brand-new company. The gap was pure omission: nothing in Paolo's voice ever explained shared
cash or real-time parked billing, and it's exactly the kind of thing a player would only need to
know right when it becomes relevant — not on day 1, when there's only one city to be in.

Added one new low-priority `nextTask()` branch (just above the `'watch'` fallback, same slot as
the `'zones'`/`'plat2'`/`'off'` nudges): fires as `{key:'newcity:<id>'}` whenever some other city
is unlocked but has never actually been played (no `PROG.results[city]` entry yet), voicing the
shared-account/real-billing/repossession rule before the player ever opens that city — on top of,
not instead of, the confirm dialog's own version at the moment of the actual switch. It retires
itself permanently and automatically the first time that city is ever opened, since
`progTrack()` always writes a results record the moment a city becomes live — no new flag needed.
Covered by three new checks in `company-bank.test.js`.

### Second follow-up — the $500 relaunch (2026-07-27, same day)

`CFG.startCash` dropped from $7,500 to $500 — the number this whole doc's Austin-only-tight-start
section was written around, but never actually changed until now. $7,500 cleared financing on
four of nine catalogue cars and comfortably rented two or three more, so the "you can only afford
ONE car" tension never actually landed; $500 clears `rentReq()`'s ~$389 floor for exactly one
Cab rental but sits well under the ~$778 a second one needs. Twelve `city.test.js` checks
had quietly relied on the old $7,500 as a "give me a rich fresh state" shortcut rather than
testing the tutorial number itself — fixed by having each fund itself explicitly (`S.cash` +
`PROG().companyCash` set directly) instead of depending on `newFleet()`'s default.

Pavel asked for a full relaunch alongside this: existing cloud saves and telemetry were written
under the old economy and don't make sense under the new one, and a fresh company should actually
start fresh. Two separate stores, two separate answers:

- **Local (per-browser IndexedDB) saves** — cannot be touched from a coding sandbox at all; only
  reachable from inside the actual browser that holds them. Clear via DevTools → Application →
  IndexedDB → delete the `deadhead` database, or the equivalent "clear site data."
- **The real, already-deployed D1 database** (`deadhead-db`, a live database_id in
  `wrangler.jsonc`, not a placeholder) — also unreachable from this sandbox (no `wrangler login`,
  no network path to Cloudflare's API). `deploy/scripts/reset-game-data.sh` (`npm run
  reset-game-data`) is prepared for Pavel to run himself: exports a full timestamped backup via
  `wrangler d1 export`, then deletes only `saves` and `stats` rows. `users`/`sessions`/
  `login_attempts` are deliberately left alone — confirmed scope, not an oversight.

## Why this changes the earlier decision

`citiesplan.md` locked "each city starts fresh at $7,500, nothing carries" specifically so the
Act 1 lesson — you cannot buy a car outright, so you rent or finance — lands again in every
scenario. That was the right call *for a single city*. It stops being the right call once a
second city exists, because a mature bankroll in Dallas isn't a bug to route around — it's the
player's own success, and pretending it didn't happen is what feels wrong, not the money itself.

The replacement idea, arrived at in conversation: Deadhead is not five separate businesses, it's
one company that happens to operate in up to five markets. There is one bank account. Opening a
second city is optional, and it does not make the first city easier — it makes the company
harder to run, because a sole operator's attention and a shared balance sheet both get thinner
the more places they're spread across.

## Decisions locked

| Question | Decision | Why |
|---|---|---|
| Money model | **One shared `companyCash`, not per-city.** Austin and Dallas draw from and pay into the same balance. | This is the entire point of the redesign — expansion is a real trade-off against the money you already have, not a fresh envelope. |
| Lesson scope | **The "can't buy outright" trilemma is Austin's job, once.** Later cities inherit whatever the company has banked at unlock time — no separate `startCash` per city. | Confirmed in conversation. Difficulty in later cities comes from their own multipliers (Dallas's depreciation, Miami's insurance, etc.) plus the shared-cash pressure, not from an artificially poor restart. |
| Parked-city simulation | **Still sequential — only one city ticks live.** No parallel `tick()`/`render()`, no live crisis-in-a-city-you're-not-watching. That's the Act 2 complexity bill this project has twice deferred on purpose. | Preserves the existing architecture entirely. The realism comes from billing, not from live simulation. |
| Parked-city billing | **Bills still land at real-world midnight, even while parked.** Reconciled by catch-up when you return: how many real calendar days passed since you left, times every parked car's daily fixed cost, debited from `companyCash` in one lump before you see anything else. | This is the one genuinely new mechanic. It's what makes "have you got the guts to run two cities" a real threat instead of a slogan — a neglected city is a real, ongoing liability, not a frozen diorama. |
| Missed payment | **Repossession after a grace period**, proposed as 3 unpaid real days per car. A rented or financed car that's racked up 3 days of unpaid fixed cost while parked is taken back: removed from the fleet, any remaining balance forgiven. An **owned** car is never repossessed (no creditor to take it from you) — its running cost still debits, it just can't be seized. | Bounded and legible. No infinite debt spiral, no forced game-over, and the player finds out what neglect cost them the moment they reopen that city, in a language ("repossessed while you were away") that needs no separate mechanic to explain. **This is my recommendation, not yet confirmed — see Open below.** |
| Fleet mobility | **Cars are permanently tied to the city they were acquired in.** No transfer mechanic. | Confirmed in conversation. Matches how zones/roads/chargers are already scoped per city — nothing new to build. |

---

## What actually has to change in the code

### 1. Cash moves out of the per-city save blob

Today `physKey('auto')` maps to `auto:<city>` (8722), and each of those Store records is a full
`snapshot()` including `S.cash` (8279). Restoring a city today restores *that city's* cash. That
has to stop being true.

- `companyCash` moves into the **`progress`** record (`PROG`, `PROG_V` currently 4 — see 8724),
  which already survives city switches and already carries `unlocked`/`results`/`last`. This is a
  `PROG_V` bump with a migration: a v4 record has no `companyCash`, and the honest inference is
  each city's *last known* `S.cash` at time of migration, summed or just taken from whichever city
  is `PROG.last` — needs a decision at implementation time, not guessed here.
- `SAVE_V` (currently 8) likely does **not** need to bump — the per-city blob can keep writing
  `S.cash` for backward compatibility/debugging, but on load it must be immediately overwritten
  from `PROG.companyCash`, never trusted as authoritative. One source of truth, one direction of
  flow.
- Every place that currently does `S.cash=CFG.startCash` on a **new city** (inside `newFleet()`,
  10421) needs to instead do `S.cash=PROG.companyCash` when the company already exists, and only
  fall back to `CFG.startCash` for a genuinely brand-new company (no `progress` record at all,
  or explicit "start a new company" from the resume dialog).

### 2. Catch-up billing needs a per-city timestamp

- `PROG.cityVisits[city].parkedAt` (a real `Date.now()` in ms), written whenever a city stops
  being the live one: inside `switchCity()` (7326) right before `S.city` moves, **and** on every
  regular autosave heartbeat while that city is active — closing the tab mid-Austin-session has
  to count as "parked starting now," not "parked never."
- A new `reconcileParkedBilling(city)`, called from `switchCity()`'s target side and from cold
  boot (restoring whichever city was last active also has to catch up *every other* unlocked
  city, since real time passed for all of them while the game was closed, not just the one you
  didn't open).
  - `daysElapsed = countRealMidnights(cityVisits[city].parkedAt, Date.now())` — real calendar
    days in the player's local zone, matching "bills land at real-world midnight" literally,
    not simulated-hour arithmetic.
  - For each elapsed day: `fleetBurn = thatCity'sCars.reduce(sum fixedPerCar(c))`, debited from
    `PROG.companyCash`. This reads that city's **saved** fleet (`auto:<city>`) without needing to
    load or render it.
  - Each affected car accumulates an `unpaidDays` counter (persisted on the car object in that
    city's save) whenever a day's debit pushes `companyCash` negative; resets to 0 the moment a
    day clears with `companyCash >= 0`. At `unpaidDays > 3` (or whatever grace value is confirmed)
    and `c.hold !== 'buy'`, the car is repossessed — spliced out of that city's saved fleet before
    the player ever opens it, with a queued message ("Paolo" seems the right voice, matching how
    every other city-gate/advisory message already lands) waiting on next visit.

### 3. UI surface

- Topbar cash readout is unchanged in *position* but its meaning changes from "this city's money"
  to "the company's money" — worth a one-time label/tooltip change so a returning player doesn't
  think Dallas's number just looks wrong.
- The city-switch confirm dialog (7329, `"Dallas starts as its own business with its own
  money — nothing transfers"`) is now **false** and has to be rewritten — something like
  *"Austin is saved and billing continues while you're away. Dallas shares your company's
  cash — whatever it costs you here comes out of what you have everywhere."*
- A repossession needs a visible landing spot: a toast/Paolo message is cheap and consistent with
  the rest of the game's voice (city-lock explanations, `nextTask()` advice), rather than a new
  modal type.

---

## Open — needs Pavel's call before implementation

1. **Grace period length.** 3 real days is a guess calibrated to "long enough that a weekend away
   isn't punished, short enough that ignoring a city for a month has a real consequence." Could
   just as easily be 5, or scale with something (e.g. the car's own `rent` size).
2. **Migration inference for existing saves.** A player with an existing Austin-only save has no
   `companyCash` concept yet — on first load post-update, does `companyCash` become that save's
   current `S.cash` (the obvious answer), and does `PROG.cityVisits.austin.parkedAt` seed to
   `Date.now()` (i.e., no retroactive billing for time before this feature existed)? I'd assume
   yes to both — flagging so it's a stated choice, not a silent one.
3. **Does the repossession grace counter reset if you make a partial payment**, or only a full
   clear? Simplest is "only a full clear resets it," but worth saying out loud since it affects
   how forgiving the mechanic feels.

---

## Order of implementation

1. Move `companyCash` into `PROG` (`PROG_V` bump + migration), stop trusting per-city `S.cash` on
   restore. Verify Austin-only play is byte-identical to today (single city, no parked-billing
   path exercised) before touching anything else — same "ship the abstraction with one city first"
   discipline `citiesplan.md` used for the tone tokens and the zones table.
2. `cityVisits` + `reconcileParkedBilling()`, exercised with a fake clock in tests (jsdom has no
   real wall-clock control, so this needs the same `Date.now()`-stubbing approach already used
   elsewhere in the test suite) rather than actually waiting real days.
3. Repossession: `unpaidDays` counter, the splice, the returning-player message.
4. Rewrite the city-switch confirm copy and the cash-readout label.
5. Update `citiesplan.md`'s decisions-locked table to point here instead of asserting the
   superseded row as current.

## Follow-up — SF's soloSeat, and a real bug it surfaced (2026-07-27, v0.39.5)

Pavel confirmed San Francisco's "Supervised" permit is not reportage the way Austin's is — the
player IS the safety driver, physically in the seat ("I am the car :)"), not an operator watching
a dashboard. That reading, after explicitly ruling out any Act 2 payroll mechanic, produced one
new `CITIES.sf.soloSeat` flag driving three things: `fleetCap` 12->1 (one seat, one car, not "a
small fleet"), `setSpeed()` clamped to 1x for the whole city regardless of caller, and
`CFG.soloStipend` ($250) credited at `billMidnight()` on any calendar day actually worked
(`S.workedToday`, new — distinct from the shift-scoped `S.workedSec`).

**The bug this surfaced:** `progTrack()` — which already runs every `render()` frame while a city
is active — never wrote `PROG.companyCash`. Every *other* `S.cash` change (fares, energy, rent,
and now the stipend) only ever touched `S.cash` directly, so `switchCity()`'s autosave could park
a city's latest earnings nowhere, and the next `newFleet({keepCompanyCash:true})` would open on a
stale balance. This was latent in the shipped company-bank system above, not introduced by SF —
SF just made it visible, since the stipend would have been the first thing to silently evaporate
on a city switch. Fixed by having `progTrack()` mirror `S.cash` into `PROG.companyCash` every
frame (cheap; `progSave()` still persists on its own schedule).

New `deploy/test/soloseat.test.js`, wired into `npm test`. See
`deadhead_sf_soloseat_2026_07.md` for the full writeup.
