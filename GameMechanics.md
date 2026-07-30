# Deadhead: game mechanics

> **⚠ SUPERSEDED — improvements.md P3-28 (2026-07-30).** This document is a design-phase
> snapshot from before Act 1 was built (see its own "Status" line below — "not yet built").
> The numbers throughout are two generations stale against the shipped game: it describes a
> **$3,000** start and a **three-car** catalogue with a flat **$18,000** price for car #2;
> the shipped game starts on **$800** (`CFG.startCash` in deadhead.html) with **no financeable
> car on day one**, against a **six-trim** catalogue (`CATALOG` in deadhead.html — Cab, Saloon,
> Crossover, Saloon Long, Crossover Six, Truck) at real, differentiated MSRPs. Rewriting this
> whole document number-by-number was judged more likely to introduce a fresh drift than to
> fix one — it is kept here as a historical record of the DESIGN, not a source of current
> numbers. For what is actually true today: `deadhead.html`'s `CATALOG`/`CFG` consts are the
> authority, `DESIGN.md` §5 for the shipped city roster, and `README.md` for the player-facing
> summary (kept in sync with the shipped numbers as of this same pass).

How the game is actually played, minute to minute and day to day. Where `DESIGN.md`
states intent, this document states rules and numbers. (See the superseded notice above —
this describes the ORIGINAL design pass, not the shipped numbers.)

- **Status:** design in progress; Act 1 is new and not yet built (as of the date below —
  Act 1 has since shipped and moved well past this document, see the notice above)
- **Date:** 2026-07-25
- **See also:** `DESIGN.md` (premise, pillars, economics), `UI-SPEC.md` (console interface),
  `deadhead.html` (running prototype — currently starts mid-Act-2)

---

## 1. What changed, and why

`DESIGN.md` opens the player as a fleet owner with capital. The prototype starts you with
**$60,000 and three cars**, which is a reasonable place to test the charging dilemma but a
terrible place to *begin*. There is nothing to learn from, no reason the systems matter,
and the trilemma is abstract from the first frame.

The game now opens on **$3,000 and no car**, working for someone else's app. Three
consequences, all good:

1. **Every system is introduced by need, not by menu.** You meet the operator system
   because a car gets blocked and you are the one who has to unstick it.
2. **Commission is felt before it's explained.** You watch 25% leave every fare while
   you're too poor to argue.
3. **The trilemma is taught in miniature.** Act 1's three pressures — cash, platform
   rating, platform share — are structurally identical to the full game's cash,
   regulator, competition. Same triangle, smaller stakes, no new rules to learn later.

That third point is the load-bearing one. Act 1 is not a prologue bolted on the front; it
is the trilemma with the serial numbers filed off.

---

## 2. Progression: three acts

| Act | You are | Demand comes from | Labour comes from | Cars earn | Ends when |
|---|---|---|---|---|---|
| **1 — Gig** | A one-car owner-operator | Hitchr and Zipp, on their terms | **You, unpaid** | **Only while you watch** | You work out that you're the bottleneck |
| **2 — Fleet** | A small fleet operator | Still the platforms | Hired operators on payroll | Whenever someone is on shift | You hold an unsupervised permit at 8+ cars |
| **3 — Operator** | A robotaxi network | Your own app, plus platform overflow | Payroll, shifts, fatigue | Around the clock | Campaign goal per city |

The acts share one simulation. Nothing is a separate mode — Act 2 begins the first time
you cannot personally watch every car, and Act 3 begins when you stop needing the
platforms to fill them.

**Two through-lines, and the second only exists because of real time:**

1. **You start renting demand and end owning it.** Commission is the tax you spend the whole
   game escaping.
2. **You start renting *hours* — your own, for nothing — and end buying them.** In Act 1 a
   car earns only while you personally watch it, so utilisation is capped by your stamina.
   Payroll is the bill that arrives the moment you stop being free labour, and it buys the
   one thing that actually fixes cost per mile (§6.3a).

The second line is the better one, and it emerged from making 1× real time rather than from
designing it deliberately. Worth noting as evidence that the time model was doing more
damage than it looked.

---

## 3. Act 1: the gig phase

### 3.1 Starting position

| | |
|---|---|
| Cash | **$3,000** |
| Fleet | **None.** The first decision is which car, and how you hold it |
| Platforms | None connected |
| Permit | Supervised commercial |
| Geofence | Downtown core, Rainey St, UT campus |
| Insurance | Gig-rideshare policy, $500 deductible |
| Rating | Unrated on both platforms |

$3,000 buys **none** of the three vehicles outright. That is the point. The opening move is
not *which car* — the cards make that comparison easy — it is *how you hold the asset*, and
every option is a different way to be exposed:

| | Up front | Per day | What you own at the end |
|---|---|---|---|
| **Rent** | nothing | highest | nothing |
| **Finance** | a deposit | middling | the car |
| **Buy** | everything | lowest | the car |

Renting is the only option that leaves the balance untouched, which makes it the obvious
first move and the most expensive one over a week. Discovering that is the first lesson the
game teaches, and it teaches it with arithmetic rather than a warning.

Financing a Cab costs $1,500 down and leaves $1,500 — close to the old fixed start,
but chosen. A player who rents instead keeps $3,000 and pays $73/day against $42.

**On the $42.** The base is what you owe whether or not you clock on:

| Component | Per car per day |
|---|---|
| Base — insurance minimum, permit fees, platform subscription, parking, autonomy licence | **$42** (Cab) |
| *plus* rental day rate | $31 → $73 total |
| *plus* loan payment, if financed (§8.1) | $13.60 → $55.60 total |
| *plus* nothing, if owned outright | **$42** |

The base is per vehicle, not global: a Saloon is $48 and a Crossover $52, because a dearer
car costs more to insure and depreciate. See §3.1a.

### 3.1a The catalogue

Three vehicles, all of which drive themselves. **Autonomy is the setting, not a spec you
shop for** — it is never a difference between two cards. The Cab simply has no
steering wheel to remove.

| | **Cab** | **Saloon** | **Crossover** |
|---|---|---|---|
| Battery | 48 kWh | 75 kWh | 75 kWh |
| Motor | 163 kW | 208 kW | 208 kW |
| EPA range | 300 mi | 350 mi | 320 mi |
| Seats | 2 | 5 | 5 |
| Consumption | 0.155 kWh/km | 0.19 | 0.21 |
| Buy | $19,500 | $26,000 | $29,000 |
| Finance | $1,500 down · $13.60/day | $2,200 · $18.10 | $2,400 · $20.20 |
| Rent | $31/day | $39/day | $44/day |
| Base fixed | $42/day | $48/day | $52/day |

Technical figures are the published ones; the Cab's come from its EPA filing, and it
is really deployed in Austin, which is where this game is set. **Prices are not MSRP.** They
are balanced against a fare model where a ride nets about $8 — real sticker prices would
need the whole economy rescaling, and that is a deliberate deferral, not an oversight.

Every spec feeds a system that already exists, so the choice is mechanical rather than
cosmetic:

- **Battery and consumption** drive `socNeeded`, `drive` and charging. The Cab is the
  cheapest to run *and* spends the most time plugged in: 50 km costs it 18.2% of its pack
  against a Saloon's 14.3%. Cheap capital, expensive attention — which is the trilemma
  again, expressed in hardware.
- **Seats** are recorded but inert until group and airport rides exist (§14).

### 3.2 Why you choose the car

**Supersedes the original §3.2**, which handed the player a car outright on the grounds that
opening on a purchase decision asks them to judge $19,000 against a daily rate with no
basis for the comparison.

That objection was right about *purchase* and wrong about *acquisition*. Buying is not on
the table at $3,000, so the actual decision is rent-versus-finance — a choice between two
clearly-stated daily numbers, which a player can read off the cards before committing. The
original design avoided the decision; this one makes it small enough to make well.

What it buys the game:

- **The cost structure arrives on turn one**, as a choice the player made rather than a
  number they inherited. Beat 2 can say "forty-two a day is the floor" and mean it.
- **The catalogue earns its place.** A vehicle list you consult once, for your second car,
  is a menu. One you must read to start is a mechanic.
- **It creates the first regret.** Renting is correct on day one and wrong by day five.
  A game about margin should let you feel that.

What it costs: the opening is one click longer, and a player who rents without reading may
not understand why they are poorer on day five. That is what Paolo's beat 2 is for.

### 3.3 You are the remote operator

In Act 1 there is no payroll, because **you** answer every blocked car yourself. Your
labour is free, so it is invisible in the P&L — which is exactly the joke, and exactly
what the player must feel before Act 2 puts a price on it.

Mechanically this means:

- Blocked cars raise a **live alert** and pause nothing. The clock keeps running.
- You clear a block by selecting the car and choosing an unstick action (~8–20s sim).
- **Latency is your reaction time**, not a computed number. If you're reading the Books
  app when a car blocks, the car sits there.
- At one car this is trivial. At three it is annoying. At four it is impossible — and
  that impossibility, not a menu unlock, is what opens Act 2.

The single most important sentence in the tutorial is the one where Paolo points out your
margin was your own unpaid attention.

### 3.4 Act 1 trilemma

```
                     CASH
              $42/day, parked or not
                   /        \
      accept every ride,    run only surge,
      skip charging,        park off-peak
      serve bad zones
                 /            \
        RATING ————————————— SHARE
   offers throttled,     platform sends
   then deactivated      rides elsewhere
              \              /
        cancel bad rides, decline long
        deadheads → fewer rides served
```

Same shape as `DESIGN.md` §2.2. Rating is the regulator with a friendlier face and a
faster memory. Share is competition without a competitor to look at.

---

## 4. The platforms

Two fictional aggregators. Neither is a rival operator — those are Meridian and Halo,
who arrive in Act 2. Hitchr and Zipp sit *above* you as suppliers of demand, which is a
different and more uncomfortable relationship.

| | **Hitchr** | **Zipp** |
|---|---|---|
| Position | Entrenched incumbent | Challenger |
| Commission | **25%** | **15%** |
| Offer volume | High — ~70% of city demand | Low — ~30% |
| Offer quality | Mixed; long deadheads bundled in | Better; shorter pickups |
| Rating scale | 5.0, rolling last 100 rides | 5.0, rolling last 50 |
| Acceptance pressure | Punishes declines hard | Tolerant |
| Surge | Opaque, announced late | Visible one zone ahead |
| Character | Takes more, gives more, tells you nothing | Fairer, thinner, occasionally empty |

### 4.1 Connecting

You may run one platform or both. Both is almost always right, and the tutorial lets you
discover why rather than saying so: **multi-apping** means the offer that appears first
wins, so two feeds mean less idle time. The cost is that acceptance rate on each is
diluted, which the platforms notice.

### 4.2 Acceptance rate

Each platform tracks accepted ÷ offered over a rolling window.

| Acceptance | Hitchr effect | Zipp effect |
|---|---|---|
| ≥ 85% | Priority offers, +10% volume | +5% volume |
| 60–85% | Normal | Normal |
| 40–60% | −25% volume | −10% volume |
| < 40% | −60% volume, warning | −25% volume |

This is the mechanism that makes declining a bad ride *cost* something, so "just cherry-pick
the good fares" is a strategy with a bill attached rather than a free lunch.

### 4.3 Ratings and deactivation

Riders rate each completed trip. The score is driven by things the player controls:

| Factor | Effect on trip rating |
|---|---|
| Wait time under 4 min | +0.3 |
| Wait time over 9 min | −0.8 |
| Car cleanliness below 60% | −0.6 |
| Blocked mid-trip, over 30s | −0.5 to −1.5 by duration |
| Arrival SoC under 8% (rider sees the gauge) | −0.4 |
| Cancelled by you after accepting | counts as 1.0 |

| Rating band | Consequence |
|---|---|
| ≥ 4.80 | Priority offers, surge access first |
| 4.60 – 4.80 | Normal |
| 4.40 – 4.60 | Volume cut 30%, warning notice |
| 4.20 – 4.40 | Final warning; no surge offers |
| < 4.20 | **Deactivated 3 game days.** Fixed costs continue. |

Deactivation from Hitchr while running Hitchr-only is a near-certain loss with a thin balance on
hand. That is the argument for connecting both platforms, and it should be learned the
hard way rather than told.

---

## 5. Core loop

### 5.1 Time — 1× is real time

**Superseded:** `DESIGN.md` §6.1 and the prototype run 150 sim-seconds per real second, so
a whole day passes in ~12 real minutes. That is a spreadsheet with a map attached. It makes
every decision retrospective — you watch outcomes rather than take them.

**1× is now 1:1 with the wall clock.** A 5.5 km trip takes nine minutes and forty seconds,
and you sit through it. This is the single most consequential change in this document,
because it converts the entire game from a management screen into an occupation.

What it buys:

- **Charging becomes a real cost.** 28% → 85% is **23 real minutes**. Deciding to charge
  means deciding to lose a third of an hour of your own afternoon.
- **Deadhead becomes felt, not read.** Five minutes of watching a car drive to a pickup for
  free is a more effective argument than any number on a card.
- **Ride counts self-correct.** `DESIGN.md` §8a flags 112 rides/car/day against a real
  15–25. At 1:1 a car completes a ride cycle in ~18 minutes, so a four-hour shift yields
  **13 rides** — inside the realistic band without touching the fare model. Real time
  fixes the problem that tuning couldn't.
- **Waiting becomes content.** The real job is mostly evaluating offers you won't take.
  With the offer cap churning eight at a time, there is always something to read and judge
  even when your car is mid-trip.

What it costs: the day cycle no longer fits a session. Hence the shift.

### 5.2 The shift — and why your presence is the constraint

You **clock on** and **clock off**. The game clock is continuous and persists across
sessions: leave at 14:20 and you resume at 14:20. A four-hour afternoon is four game hours.

The rule that makes this the whole game:

> **In Act 1, cars earn only while you are clocked on.** You are the remote operator
> (§3.3). No supervision, no rides.

Clock off and the car parks. It still owes **$42 that midnight**. So a player who works a
four-hour shift owns a car that is idle for twenty hours and billed for all of them — which
is the most accurate thing this game says about gig work, and it arrives as arithmetic
rather than as a speech.

**It is also exactly what Act 2 sells you.** Hiring an operator does not make cars faster
or cheaper; it buys **hours you are not present for**. Payroll is the price of the other
twenty hours. The hiring decision in §8.2 needs no explanation once the player has felt
this, because they will already have worked out that they cannot be awake enough.

#### Clocking off

Ending a shift gives you the report, then asks when to come back:

| Choice | Effect |
|---|---|
| **Resume here** | Next session starts at this exact time |
| **Skip to tomorrow 06:00** | Time passes instantly; each midnight crossed bills fixed costs; no revenue |
| **Skip to a chosen hour** | Same, for lining up with a peak |

Skipping is free of penalty beyond the honest one: idle hours cost money and earn nothing.
Overnight charging happens during a skip at the $0.11/kWh tariff, so the correct play is to
end a shift plugged in — a planning habit rather than a mechanic.

### 5.2a Speed controls and auto-slow

Four settings in the status-bar segmented control (`UI-SPEC.md` §8), plus a jump:

| Control | Purpose |
|---|---|
| **‖** | Pause. Planning only; no time passes |
| **1×** | Real time. The default and the intended way to play |
| **4×** | Nudge through a quiet stretch. Still reactive — 1 game minute per 15 real seconds |
| **20×** | Charging waits and the midday trough. A 23-minute charge passes in 69 seconds |
| **Skip to ▸** | Discrete jump: *next offer* / *end of charge* / *next hour* / *end of shift* |

**Auto-slow is what makes acceleration safe.** Above 1×, any Attention or Urgent event
(§5.2b) drops the speed to 1× and pings. You can warp a charge or a dead afternoon without
gambling the fleet, and you never have to choose between acceleration and vigilance.

Two hard rules:

- **Never auto-pause.** Dropping to 1× keeps the clock and the stakes running while you
  decide. Pausing hands the player a consequence-free think, which is the thing real
  dispatchers never get.
- **Nothing irreversible above 4×.** No collision, no deactivation, no ride expiry at 20×
  — the event that would cause it triggers auto-slow first. Speed may cost you money; it
  may never cost you the run.

The loop still **sub-steps at 15 sim-seconds maximum** regardless of speed, and dispatch
still runs *before* the expiry sweep — the fix for the timestep bug in `DESIGN.md` §8a.
At 1× a tick is a tick; the sub-stepping only matters at 20×, where it matters most.

### 5.2b Alerts

Three tiers, coloured per `UI-SPEC.md` §4. The tier decides whether the game interrupts
you, and nothing below Attention ever does.

| Tier | Examples | Behaviour |
|---|---|---|
| **Notice** (grey) | New offer, charge complete, shift milestone | Badge count only. No auto-slow |
| **Attention** (amber) | SoC below 25%; charger queue ahead; cleanliness under 60%; rating band change | Badge + **auto-slow to 1×** + Paolo-style one-line summary |
| **Urgent** (red) | Car cannot reach a charger; blocked car; accepted ride about to expire; collision | Badge + auto-slow + audible tone + **the car rail auto-selects that car** |

The battery alert is deliberately not "battery low", which is not actionable. It is:

> **MY-01 cannot finish this ride and reach a charger.**

That sentence is the projected-arrival-SoC number (§5.4) doing its job, and it names the
decision instead of the reading. Amber at 25% SoC, red the moment projected arrival SoC
drops below the 12% reserve floor with no charge plan queued.

### 5.2c Standing orders

Real time is unplayable if every routine act needs a click, and unteachable if none of them
do. So each car carries a **policy** you set once and override in the moment:

| Order | Default | Range |
|---|---|---|
| Auto-accept offers | Off | On, filtered by min net fare and max deadhead |
| Auto-charge below | 28% | 15–40% |
| Charge to | 85% | 60–100% |
| Prefer charger | Nearest | Nearest / cheapest / shortest queue |
| Return-to-zone when idle | Off | Any enabled zone |

Standing orders exist for a second reason, and it is the important one: **a standing order
is a written instruction for a job you will later pay a person to do.** When Act 2 puts an
operator on payroll, that operator is executing these policies. The player writes the job
description in Act 1 and hires for it in Act 2, and nobody has to explain what an operator
is for.

Act 1 starts with auto-accept **off** on purpose. Accepting your first dozen rides by hand
is how beats 3 through 5 of the tutorial land.

### 5.2d A shift, start to finish

1. **Clock on.** Check overnight charge, pick platforms, set the multiplier, review zones.
2. **Run at 1×.** Read offers, accept the good ones, watch battery, clear blocks, decide
   when to charge. Warp the quiet parts; auto-slow brings you back.
3. **Clock off.** Shift report: rides served, gross, commission, each cost line, net, cost
   per mile, rating movement, and hours worked against hours the car sat.
4. **Choose when to return**, and whether the car spends the gap plugged in.

The report is the only place the player is handed conclusions; everything else they have to
notice. **Hours idle vs. hours worked is the line that sells Act 2** and should sit
directly under net.

### 5.3 Offer cap

The platform only ever shows **~8 waiting offers**, per `DESIGN.md` §8a. Underlying demand
stays realistic; the cap is the platform's UI, not the city's limit. Riders beyond the cap
become the *gave up waiting* counter, which is the buy-another-car signal.

Two loss counters, never merged:

- **Priced out** — your multiplier was above what the platform would route to you, so the
  ride went to another supplier. Fix: lower the multiplier.
- **Gave up waiting** — no car was free. Fix: buy a car, or serve fewer zones better.

In Act 1 *priced out* is attributed to **platform routing**, not to a named rival — Meridian
and Halo aren't visible until Act 2, and the prototype's current `Meridian took … priced
out` log line is therefore wrong for Act 1 and must be reworded.

They prompt opposite decisions, so a single "lost rides" number would actively mislead.

### 5.4 What the player actually does

Six verbs. At 1:1 there is time to take each one deliberately, which is the point.

| Verb | Where | Notes |
|---|---|---|
| **Accept / decline offer** | Offer card | **45 real seconds** to decide at 1×, counting down on the card. Declines feed acceptance rate (§4.2) |
| **Send car to pickup** | Auto from accept, or manual | One car: automatic. Two or more: nearest idle by default, manual override always available |
| **Send to charger** | Car rail → charger pins | Shows stall count, current queue, drive time, and **minutes to 85%**. Cancellable mid-drive |
| **Recall / reposition** | Car rail → zone | Move an idle car toward anticipated demand. Costs empty miles, wins shorter deadheads. The skill move |
| **Unstick** | Urgent alert → car | Clears a blocked car, ~8–20 seconds. In Act 1 this is you, free (§3.3) |
| **Send to clean** | Car rail | $25, 20 real minutes off the road |

#### The offer card

Three columns, per the metric row in `UI-SPEC.md` §7a:

| **ARRIVAL SoC** | **NET FARE** | **DEADHEAD** |

- **Arrival SoC** — projected charge on drop-off. Amber under 20%, red under 10%.
- **Net fare** — after commission. Never show gross on the offer; gross is the number the
  platform advertises and the player should have to open Books to find it.
- **Deadhead** — empty km to the pickup, with the minutes it will take. The title of the
  game, on every card, in real time.

The accept button is the chevron-split CTA (`UI-SPEC.md` §7a):
`Accept ▸ $8.10 net / 5.0 min empty`.

#### Charging while other cars keep earning

This is the central juggle from car #2 onward, and it needs three things visible at once:
which car is charging, how long it has left, and what the remaining cars are covering.

- The **car rail** shows a charging car with a countdown to its target SoC, not a percentage
  — "14 min to 85%" is a schedulable fact; "62%" is not.
- Sending a car to charge **does not pause its offers**; they flow to the remaining cars, so
  the cost of charging shows up immediately as coverage you no longer have.
- If every car is charging or blocked, offers accumulate to the cap and then become *gave up
  waiting* (§5.3). Stranding your whole fleet on chargers simultaneously is the classic
  beginner loss and the game should not prevent it.
- **Stagger warning:** queueing a second car to charge while the first is still plugged in
  raises an Attention alert with the coverage gap spelled out. A warning, never a block.

With one car in Act 1 there is no juggle — there is a choice between earning and charging,
which is the same dilemma with the wall removed. Warp it at 20× and lose the fares, or plan
to arrive at the shift charged.

---

## 6. Money

### 6.1 Fare

`fare = (2.60 + 1.05/km + 0.22/min) × surge × yourMultiplier`

Surge is generated by the demand model (0.8×–2.0×), never set by the player. Your
multiplier (0.7×–1.6×) is the pricing quick-set in the climate slot. Above ~1.15× you
start losing offers to *priced out*.

### 6.2 Cost lines

Per mile, all tunable:

| Line | Act 1 | Notes |
|---|---|---|
| Depreciation | $0.11 | Worsens with mileage |
| Maintenance | $0.04 | Rises as service intervals slip |
| Insurance | **$0.11** | Gig-rideshare policy — worse than fleet rates, and above `DESIGN.md` §3.1's 0.05–0.08 band, which should be widened to 0.05–0.11 |
| Software / autonomy stack | $0.03 | Fixed subscription, per mile |
| Energy | ~$0.066 | 0.19 kWh/km × 1.13 heat penalty × time-of-use tariff |
| Remote monitoring | **$0.00** | Because it's you |

Plus **$42/car/day fixed** in Act 1 — base insurance, permit fees, platform subscription,
parking — accruing at midnight whether the car moved or not, and whether you clocked on or
not. Add $28/day if leased or $13.60/day if financed (§3.1).

Insurance drops to $0.08/mi on a fleet policy at 3+ cars, which is one of the few clean
rewards for scaling and worth keeping as such.

### 6.3 Act 1 unit economics

Representative trip: 5.5 km, 11 min, no surge → **$10.80 gross**.

| | Hitchr | Zipp |
|---|---|---|
| Commission | −$2.70 | −$1.62 |
| **You receive** | **$8.10** | **$9.18** |
| Variable cost (7.98 km: loaded 5.5 + 2.48 empty) | −$1.76 | −$1.76 |
| **Contribution** | **$6.34** | **$7.42** |

At 1:1 a ride cycle runs ~18 minutes — 5.0 min deadhead, 1.5 min pickup wait, 11.0 min trip,
plus idle between offers, all at `speedKmh` 30. So shift length sets ride count directly, and
the interesting table is **the same car and the same skill at two shift lengths**, 70/30
Hitchr/Zipp:

| | 4-hour shift | 6-hour shift |
|---|---|---|
| Rides | 13 | 20 |
| Gross | $140.40 | $216.00 |
| Commission (22% blended) | −$30.90 | −$47.50 |
| Variable | −$22.90 | −$35.30 |
| Fixed (one midnight) | −$42.00 | −$42.00 |
| **Net** | **+$44.60** | **+$91.20** |
| Miles driven | 64.5 | 99.2 |
| Operating cost | $64.90 | $77.30 |
| **Cost per mile** | **$1.01** | **$0.78** |
| Take rate | 22% | 22% |

**Two more hours of the same work cuts cost per mile by 23%.** Nothing about the driving
changed — the $42 simply spread over more miles. This is §6.3a item 1 made visible in the
first two shifts the player compares, and it is why the shift report puts hours worked next
to cost per mile.

A skilled 6-hour shift working both peaks at an average 1.25× surge nets **$133.30** — and
returns cost per mile of $0.78, *identical* to the unskilled 6-hour shift. Pricing moves
money, not efficiency. Two separate levers, and the report should never let them blur.

**Cost per mile counts operating lines only** — the six in `DESIGN.md` §3.1 — and never
commission. Commission is a revenue deduction, and folding it in would make the $0.55
campaign target unreachable by definition and break comparison with the real-world
benchmarks. Books shows the two numbers side by side and never adds them.

$0.78–1.01/mile against a mature target of $0.30–0.50 is dismal, and the reason is the fixed
line: on a four-hour shift, **$42 over 64.5 miles is $0.65 of that dollar.**

### 6.3a What actually moves cost per mile

An earlier draft of this document claimed scale fixes it because the fixed line spreads.
**That is false and the error is worth recording, because the intuition is very tempting.**
Fixed cost is per *car* per day and rides scale with cars, so fixed-per-mile is essentially
identical at 1 car and at 30. Adding cars buys revenue, not efficiency.

Cost per mile falls for exactly three reasons, and the player should be able to name all
three by Act 3:

1. **Utilisation — hours the car is working.** The dominant term by a wide margin, and the
   one real time makes visceral: a car earning for 6 hours of a 24-hour billing day is
   $0.78/mile, and the same car earning for 4 is $1.01. **This is why Act 1's ceiling is
   your own stamina, and why Act 2 sells you hours rather than cars.**
2. **Cheaper inputs at scale** — fleet insurance (−$0.03/mi at 3+ cars), depot charging
   (Act 3, roughly halves energy), volume maintenance.
3. **Shorter deadheads.** More cars across more zones means the nearest idle car is closer.
   Stated as a share of *total* miles run empty — the industry convention, and the only
   definition that doesn't drift: **31% at one car, ~15% at eight.** (Equivalently: 45% added
   on top of each loaded trip, falling to ~18%. Pick one form and keep it; the shift tables
   in §6.3 depend on 7.98 km per ride.)

Item 1 is the load-bearing one and it is *not* about scale, which is why the earlier draft's
error mattered. A one-car operator who could run 20 hours would beat a three-car operator
who runs four. The reason nobody does is that there is one of you — and that is the entire
argument of the game, now expressible in a single ratio: **hours worked ÷ 24.**

**The designed trap:** utilisation and profit disagree. Parking through the 10:00–15:00
trough maximises *profit* — those fares barely cover their own depreciation — but it strands
$42 of fixed cost over fewer miles and makes cost per mile look worse. A player optimising
the pretty number will work the trough and earn less.

That tension is the best thing in the economy and must survive tuning. Cost per mile is
diagnostic, not the score. Net cash is the score. The shift report presents them in that
order, and Paolo says so once (beat 11).

Skilled Act 1 play — a long shift, both platforms, both peaks, the trough skipped — reaches
**$130–135/shift**. Against $44.60 for a casual four hours, that is the difference between
**6 shifts and 16 shifts** to the down payment, and it is where Act 1's skill ceiling lives.

### 6.4 Charging

Rapid network only in Act 1; the owned depot is Act 3 capital.

Time-of-use tariff: **$0.11/kWh** 23:00–07:00, **$0.19** off-peak, **$0.34** 16:00–21:00.
Charging through the evening peak is a real and punishable mistake — it collides with the
demand peak *and* the tariff peak, so the cost of a badly timed charge is the energy
premium plus the surge fares you didn't take.

Defaults: seek a charger at 28% SoC, charge to 85%, reserve floor 12%. Queues form at
popular stalls during peaks. Pack degradation from DC fast-charging stays **deferred** per
`DESIGN.md` §8 — the intent is that it eventually feeds depreciation so the convenient
choice carries a slow bill, but Act 1 does not need it and should not claim it.

The whole charging UI remains one number: **projected arrival SoC on every offer.**

### 6.4a What real time does to charging

Charge timings are now durations the player sits through, so they need to be right:

| | |
|---|---|
| Pack | 75 kWh |
| 28% → 85% | 42.75 kWh |
| At 150 kW peak, ~110 kW average with taper | **≈ 23 real minutes** |
| Range at 0.19 kWh/km × 1.13 heat | ≈ 349 km |
| Consumption per ride cycle (7.98 km) | ≈ 1.7 kWh, ~2.3% of pack |

**An honest problem this creates.** A four-hour shift covers ~104 km — under 30% of the
pack. So in Act 1 a car rarely needs charging *mid-shift*, and `DESIGN.md`'s headline
question — is the charge/no-charge decision tense? — mostly does not get asked. Real time
did not fix this; it moved it.

Where the dilemma actually lives, and the design should say so plainly rather than pretend:

- **Act 1: a planning decision.** End the shift plugged in and the overnight tariff
  ($0.11/kWh) makes energy nearly free. Forget, and you start tomorrow at 55% and lose
  23 minutes of a peak. The punishment is real but it is administered at clock-off, not
  mid-shift.
- **Long shifts: a live decision.** Past ~7 hours a car must charge mid-shift, and now
  it collides with the evening peak and the $0.34 tariff at once. Players who push for
  the $133 shift are exactly the ones who meet the dilemma.
- **Act 2 onward: the core juggle.** Cars run 18-hour days under hired operators — far
  longer than any player sits — so every car charges daily, during demand, while its
  fares flow to the others. This is where the question `DESIGN.md` asked gets answered.

Verdict: **the charging dilemma is an Act 2 system with an Act 1 rehearsal.** Do not tune
Act 1 to force it — shrinking the pack or inflating consumption to manufacture tension
would break the range figures that make the sim credible to people who drive for a living.

---

## 7. Incidents in Act 1

Only two types, both chosen because they teach a system rather than add variety.

**Blocked** — construction, double-parked truck, confused intersection. ~1 per 40 rides.
Needs you. Teaches the operator system by making you be the operator.

**Soiled** — ~1 per 60 rides, concentrated after 22:00 near Rainey St. Car is out of
service until you send it to clean ($25, 20 min). Continuing to take rides while soiled
tanks cleanliness ratings. Teaches that revenue and rating pull in opposite directions.

Collision exists but is rare (~1 per 900 rides) and mostly present as a threat: the $500
deductible against a $1,500 balance is genuinely frightening, which makes the opening
insurance choice — $500 deductible at $0.11/mi, or $250 at $0.14/mi — a real decision on
turn one rather than a settings screen.

Vandalism, towing, and regulatory events stay deferred to Act 2.

---

## 8. Leaving Act 1

### 8.1 The financing offer

> **As shipped (0.45.0):** the opening is no longer strictly one car. The garage allows a
> fleet of **one or two** before the first shift is clocked on (`OPENING_CAP`, applied by
> `effCap()`), and says so — a dashed "2nd vehicle — optional" slot chip rather than a modal
> that closes and leaves the rule unstated. What follows is still the shape of the choice:
> a second car is bought on finance or rent, not out of pocket, and it doubles the daily bill
> before it earns anything. `effCap()` only ever *lowers* a city's `fleetCap`, so SF's
> one-seat scenario is unaffected.

Car #2 costs $18,000 cash, which one car will never generate. Financing is therefore
**pulled forward from `DESIGN.md`'s deferred list** — Act 1 does not function without it,
because the gig-worker debt trap *is* the mechanic.

| | |
|---|---|
| Down payment | **$1,500** (8.3%) |
| Amount financed | $16,500 |
| Term | 48 months |
| APR | 9.4% |
| Payment | **$413.75/month = $13.60/day** added to fixed cost |
| Minimum cash reserve | **$200** after the down payment |

Requirements: **$1,700 cash** ($1,500 down + $200 reserve), 10+ shifts logged *or* a rating
≥ 4.70 on either platform. The rating shortcut rewards playing well rather than merely
playing long.

The down payment came down from $2,500 because real time changed the clock. At $45–133 per
shift, the old $2,500-plus-reserve target meant earning $1,700 — **13 to 39 afternoons.**
The new target of $1,700 total means earning **$700**, which is **6 shifts played well or 16
played casually** — an act, not a second job.

The offer is a trap in the honest sense: it is correct to take, and it removes your margin
for error. Two cars means **$97.60/day fixed** ($42 + $42 + $13.60) before you've moved, and
the cash you had left after acquiring the first car is now a thin cushion against a doubled daily bill. The
mandatory reserve is the lender protecting itself, not you.

### 8.2 The hiring gate

Under the shift model the gate is **hours, not headcount**, and it is much the better gate
for it.

Two cars are survivable alone: two cars for six hours is 12 car-hours out of 48 billed, so
cost per mile is unchanged at $0.78 and your net roughly doubles. Nothing breaks. What
breaks is **the discovery that the ceiling is you.**

The player arrives at it by arithmetic they do themselves:

- Buying a third car adds $42/day and **no additional hours**, because you were already at
  the limit of one afternoon.
- Cost per mile does not improve. Net per car *falls*, since the same six hours now spreads
  across three cars competing for the same capped offer feed.
- The only thing that raises utilisation is somebody watching the screen when you are not.

So Act 2 does not open with an unlock, and it does not open with a punishment either. It
opens with the player noticing that **car #3 is a bad purchase and an operator is a good
one** — and that the job they are about to post is the one they have been doing for free
since minute one.

Hiring the first operator buys **coverage hours** at $22/hour. An operator working the 12
hours you don't takes a two-car fleet from 12 car-hours to 36:

| Two cars | You alone, 6 h | + one operator, 12 h |
|---|---|---|
| Car-hours | 12 | 36 |
| Rides | 40 | 120 |
| Miles | 198 | 595 |
| Net cash | **+$182** | **+$451** |
| Cost per mile | $0.78 | **$0.94** |

**Hiring more than doubles profit and makes cost per mile worse.** That is not a tuning
error, it is the correct answer, and it is the sharpest possible demonstration of §6.3a:
free hours improve cost per mile, *purchased* hours cost $0.44/mile in monitoring and only
save $0.28/mile in spread fixed cost. Paolo's warning in beat 11 — don't chase cost per mile —
pays off here, two acts later, on a player who now understands why.

### 8.2a A flaw this exposes in the original design

Working the above through raises something `DESIGN.md` does not survive contact with.

`DESIGN.md` §3.1 budgets remote monitoring at **$0.05–0.10/mile** and §2.4 caps the
cars-per-operator slider at **8**. Those two numbers are incompatible:

> A car covers ~16.5 miles per hour of operation. At $22/hour, one operator watching *n*
> cars costs `22 / (16.5n)` per mile. At n=1 that's $1.33/mile. At n=8 it is **$0.17/mile** —
> still nearly double the top of the budgeted range.

So the slider's entire stated range sits outside the cost model, and the §10 campaign target
of $0.55/mile total is **unreachable at any legal setting**. Checking it: at 8 cars/op,
dep 0.11 + energy 0.04 + maint 0.04 + ins 0.08 + software 0.03 + monitoring 0.17 + fixed
0.14 = **$0.61/mile**, and that is with cars running 18-hour days.

Three candidate fixes, in preference order:

1. **Raise the ratio ceiling to ~20.** At 12 cars/op monitoring is $0.11/mile and the total
   lands at **$0.55** — exactly the campaign target, which suggests this is what the original
   figures assumed. It also makes the headline slider far more interesting: 1 → 20 spans
   $1.33 to $0.07 per mile, so the trilemma's cost axis finally has real travel.
2. **Raise miles per car-hour** via longer, faster trips (highways in Dallas/Houston). At
   25 mi/car-hour, 8 cars/op gives $0.11/mile. This is the Act 3 city-progression lever and
   complements fix 1 rather than replacing it.
3. **Lower the wage.** Rejected — $22/hour is the thematic point, and cutting it to make the
   spreadsheet work would be a strange thing for this particular game to do.

Recommend fixes 1 and 2 together. Either way **this must be settled before Act 2 is built**,
because it determines whether the ratio slider is a meaningful control or a decoration.

### 8.2b Shift coverage: the axis real time adds

Once there is more than one operator, staffing derives from the ratio per `DESIGN.md` §8a:
`operators = ceil(fleet / ratio)`, with latency scaling by cars watched per person. Do not
regress this to a capacity ceiling.

Real time adds a dimension the original design lacked. Operators cover **hours**, so staffing
is now a grid of *hours × cars* rather than a single ratio, and an uncovered gap at 02:00 is
as real a decision as the ratio itself. Night shifts cost more and attract worse candidates
(`DESIGN.md` §2.4), which was always in the design but had nothing to attach to while a whole
day passed in twelve minutes.

**The line to write the act break around:** you spent Act 1 as an unpaid employee of your own
company, and Act 2 begins when you work out what you were worth.

---

## 9. Tutorial: Paolo

### 9.1 Who he is

**Paolo Cortez**, 41 years driving a cab in Austin. Got out in 2024, before it stopped
being a choice. He is not your employer, your assistant, or a UI voice — he's the guy
who sold you the car, and he texts you because he wants to see whether the thing that
ended his trade is at least a real job.

Voice rules:

- **Short sentences.** Paolo does not explain twice.
- **Dry, not folksy.** No "well howdy partner". No wisdom-of-the-elders cadence.
- **Bitter about the industry, never about you.** He wants you to make it.
- **Never says the word "tutorial", never says "click".** He says what to do, and the
  spotlight says where.
- **He is occasionally wrong**, in the way an experienced person with slightly stale
  knowledge is wrong. Once, late in Act 1, he gives advice the numbers contradict, and
  the player gets to notice. This is a feature.

Sample register:

> "Twenty-five percent. For an app. I paid a dispatcher eleven bucks an hour and she knew
> every street in this town."

> "You're going to want to take every ride they offer. Don't. The bad ones cost more than
> they pay, and the app knows that better than you do."

### 9.2 Window anatomy

Diegetic and compliant with `UI-SPEC.md`: Paolo's messages are an **opaque card**,
`--surface-2`, 12px radius, 1px `--border`, no shadow, 24px padding — the same material as
any app window, because it *is* one. His messages arrive in a Messages card.

Placement and behaviour:

- **Bottom-left, above the dock.** Never centred, never over the car rail, never touching
  the top edge (§8).
- **Max 320px wide, 3–4 lines of body text.** If a beat needs more, it's two beats.
- **Never modal, never pauses the clock** — except beat 1, which arrives at 06:00 while
  the game is already paused. Everything Paolo says can be ignored while cars keep earning,
  because a tutorial that stops the world teaches nothing about time pressure.
- **Spotlight, not arrow.** The referenced control gets a 2px `--accent` ring and the rest
  of the console dims 25%. The card physically cannot cover its own target, since it lives
  in the one corner nothing important occupies.
- **Dismissal** is a chevron-split CTA (§7a): `Got it ▸ 3 of 13`. The counter is honest
  about how much is left.
- **Persistence:** all beats stay readable in the Messages app afterward. Nothing
  important is said only once.
- **Skippable** from the first card, and the skip is not punished or re-offered.

### 9.3 Act 1 beat script

**Fourteen** beats, all triggered by game state rather than a timer, so the tutorial follows the
player rather than the reverse. Paolo never blocks the clock (§9.2) — at 1:1 there is room for
him between offers, which is the whole reason a real-time game can afford a narrator at all.

| # | Trigger | Beat | Spotlight |
|---|---|---|---|
| 1 | Garage opens on a new fleet, clock stopped | Who he is. Three thousand dollars and no car — you can't buy one outright on that, so you'll rent or put money down. Rent costs nothing today and the most every day after. | The vehicle cards |
| 2 | Card 1 dismissed | Whatever you pick, forty-two a day is the floor — before rent, before finance, before a wheel turns. Do the arithmetic before you sign, not after. | Cash balance |
| 3 | A car is in service | The car can't earn until someone's sending it rides. Two apps will. Neither is your friend. | Platforms panel |
| 4 | First platform connected | Three numbers on every offer. What's on the meter, what you actually get paid, and how far you drive empty to reach them. Watch the third one. | Offer card metric row |
| 5 | First offer appears | Forty-five seconds to decide. That's not them being generous, that's them stopping you doing the arithmetic. Do it anyway. | Offer countdown |
| 6 | First ride completed | Ten eighty on the meter, eight ten in your pocket. That's the deal. It doesn't improve. | Books app |
| 7 | Deadhead over 3 km, while the car is driving it | Watch that. Six minutes, nobody paying, and you'll do it a dozen times today. We called it deadheading. Killed more cabbies than bad drivers did. | The moving car |
| 8 | First surge ≥ 1.4× | Surge means everyone's stranded at once. Take it. Raise your own multiplier too — but not past about 1.15, or they'll route around you. | Pricing quick-set |
| 9 | First idle stretch over 4 real minutes | Most of this job is sitting. I did thirty-one years of sitting. You can speed the clock up — just don't get clever and speed through a peak. | Speed control |
| 10 | SoC first hits 28% | Twenty-three minutes on a charger. Yours, not the car's. Do it at four in the morning when power's cheap and nobody's going anywhere. Not at six in the evening. | Charger pins + minutes-to-85% |
| 11 | First blocked car | Somebody's got it wedged. In a big outfit a room full of people watch for that. Right now the room is you, and you're free. Remember that. | Urgent alert |
| 12 | First clock-off having completed a ride | Read the whole thing, not just the bottom line. Cost per mile tells you how hard the car worked. It isn't what you're paid. Don't chase it. | Shift report cost-per-mile row |
| 13 | Rating drops below 4.70, or first cancellation | They're scoring you. Two bad weeks and they switch you off, and the forty-two a day doesn't switch off with you. Run both apps. | Rating readout |
| 14 | Three shifts logged | You worked six hours. The car was billed for twenty-four. Your margin was you, sitting there for free — and there's only one of you. Second car doesn't fix that. A second pair of eyes does. | Hours idle vs. worked, on the report |

**Two beats were added at the front** because the player no longer starts with a car: beat 1
introduces the acquisition decision and beat 2 names the floor cost before they commit to
it. Everything from the old beat 2 onward shifted down by one.

**Beat 14's trigger changed.** The original was "10 shifts logged, or cash ≥ $1,700",
written when the game started you on $1,000. At a $3,000 start the money half was true on
turn one, and the thesis fired before the player had worked an hour — the closing argument
delivered as an opening. It is now three logged shifts, which cannot be satisfied by
standing still.

Beat 14 is the thesis of the game and should be the best-written 45 words in it. Note that
it points at the **hours idle** line, not the financing offer: the reveal is not "buy another
car", it is "you are the bottleneck." The financing offer is what the player reaches for
next, and reaching for it should feel slightly like a mistake.

Beat 9 is the one that earns real time its keep. A narrator who acknowledges the boredom —
and who did thirty-one years of it — converts dead air from a design flaw into the subject.

### 9.4 What the tutorial deliberately does not explain

Left for the player to find, because being told ruins them:

- That running both platforms protects against deactivation
- That parking through the 10:00–15:00 trough beats working it — and that doing so makes
  cost per mile look *worse* while making you richer (§6.3a)
- That ending a shift plugged in makes energy nearly free
- That the fixed $42/day, not driving, is most of what a mile costs
- That standing orders (§5.2c) are the job description you'll hire against in Act 2

Paolo warns against chasing cost per mile in beat 12 without explaining why. A player who
works the trough to flatter that number and earns less has learned the lesson properly.

---

## 10. Fail and win states

**Act 1 loss:** cash below $0. No bankruptcy negotiation, no bailout. The car is
repossessed and the run is over.

**Near-loss states** that should feel survivable but awful: deactivated from your only
platform, a collision deductible, a soiled car during peak.

**Act 1 win:** finance car #2. There is no fanfare — the payment appears in tomorrow's
fixed cost and Paolo says something unencouraging.

**Campaign goal (Austin):** hold an unsupervised permit, run 15+ cars, and land cost per
mile under $0.55 with a safety score above 75. The `DESIGN.md` §10 question of whether to
respect Austin's real ~17-car ceiling stays open; Act 1 makes a low ceiling *less* of a
problem, since the interesting part of the curve is now 1 → 8, not 20 → 30.

---

## 11. Starting constants

Reconciled with `deadhead.html`'s `CFG`. Bold entries are new or changed for Act 1.

| Key | Value | Note |
|---|---|---|
| **`simPerReal`** | **1** | was 150. **1× is the wall clock** (§5.1) |
| **`speeds`** | **pause, 1, 4, 20** | was pause/1/2/4. Plus `Skip to ▸` (§5.2a) |
| **`autoSlowOn`** | **attention, urgent** | Drops to 1× from any higher speed. Never auto-pauses |
| `maxSubstep` | **15 sim-sec** | Timestep fix — currently a hardcoded local `const MAX=15` in `step()`, not a CFG key. Promote it, and do not regress |
| **`shiftModel`** | **clock on / off** | Game clock persists across sessions; cars earn only while clocked on in Act 1 (§5.2) |
| `dayStart` / `dayEnd` | 06:00 / 24:00 | Now the *demand* window, not the session length |
| **`startCash`** | **3000** | was 1000. Buys no vehicle outright — see §3.1 |
| **`startCars`** | **0** | was 1. You choose and acquire it (§3.1a) |
| **`carPrice`** | **per vehicle** | 19,500 / 26,000 / 29,000. The flat 18000 is gone |
| **`rentDaily`** | **31 / 39 / 44** | Rent adds this to the base; you build no equity |
| **`downPayment`** | **1500 / 2200 / 2400** | Per vehicle; was a single 1500 |
| **`financeReserve`** | **200** | Minimum cash the lender requires you to keep |
| **`financeDaily`** | **13.60 / 18.10 / 20.20** | Per vehicle |
| `fare.base` / `perKm` / `perMin` | 2.60 / 1.05 / 0.22 | |
| **`commission`** | **Hitchr 0.25, Zipp 0.15** | was flat 0.20 |
| **`fixedPerCarDay`** | **42 / 48 / 52** | Per vehicle base. Plus rent or finance (§3.1). Accrues at midnight, clocked on or not |
| `cpm.dep` / `maint` / `soft` | 0.11 / 0.04 / 0.03 | |
| **`cpm.ins`** | **0.11 gig → 0.08 fleet at 3+ cars** | was flat 0.08 |
| **`battery`** / **`kwhPerKm`** | **per vehicle** | 48/0.155, 75/0.19, 75/0.21. `heatPenalty` 1.13 stays global |
| `chargeAt` / `chargeTo` / `reserveSoc` | 28% / 85% / 12% | Now **standing-order defaults** (§5.2c), player-editable |
| `chargeKW` | 150 peak, ~110 avg | 28→85% = **23 real minutes** |
| **`speedKmh`** | **30** | was 34. Downtown average; makes the 5.5 km trip **11.0 real min**, matching §6.1's fare input |
| **`offerDecideSec`** | **45 real sec** | Countdown on the offer card |
| **`rideCycleMin`** | **≈18 real min** | Derived: 5.0 deadhead + 1.5 wait + 11.0 trip + idle |
| `wage` | 22 /hr | **$0 in Act 1 — the player is the operator.** Act 2 buys *hours*, not ratios |
| `rideExpire` / `cancelAt` | 9 min / 150s | Now real minutes — considerably more generous in feel |
| **`offerCap`** | **8** | Platform UI limit, not demand limit. **Currently broken:** the code reads `CFG.offerCap` but the key does not exist, so the comparison is against `undefined` and the cap never fires |
| `fareMult` range | 0.7 – 1.6 | Player-set |
| **`surge`** | **0.8 – 2.0** | Model-generated. **Does not exist yet** — the prototype has only the player multiplier |
| **`carsPerOp`** | **1 – 20**, was 1–8 | **Act 2+.** The 1–8 range cannot reach `DESIGN.md` §3.1's monitoring budget at any setting — see §8.2a. Now secondary to shift coverage |
| **`shiftCoverage`** | hours × cars grid | **Act 2+.** New axis real time adds (§8.2b) |
| `safety` start | 80 | Permit review at 65 |
| **`deductible`** | **500, or 250 at $0.14/mi** | Turn-one choice |
| **`ratingDeactivate`** | **4.20, 3 days** | |
| **`socAlertAmber`** / **`socAlertRed`** | **25%** / projected arrival below reserve | §5.2b |

---

## 12. Work this creates

Ordered by whether the prototype currently lies to us without it.

**Two live prototype bugs, found while reconciling this document:**

1. **The offer cap never fires.** The code compares against `CFG.offerCap`, which is not a
   key in `CFG` — so it reads `undefined` and every comparison is false. `DESIGN.md` §8a
   describes the cap as a shipped fix and it is not one. This means the oversupply finding
   in §8a has not actually been tested, and §5.3 is currently fiction.
2. **`maxSubstep` is a hardcoded local**, not config. It works, but it is the kind of
   thing that gets refactored away by someone who doesn't know it fixed a whole-day
   zero-rides bug. Promote it to `CFG` with the comment attached.

**Then the real-time conversion, which is one change with a long tail:**

3. **`simPerReal` 150 → 1**, speeds to pause/1/4/20, plus `Skip to ▸`. Trivially small
   edit, largest consequence in this document. Do it first and play a shift before building
   anything else — if 1:1 is boring with one car, everything below is wasted.
4. **Auto-slow** on Attention and Urgent events (§5.2a). Without this, acceleration is a
   trap and the game is unplayable above 1×. Ships with #3 or not at all.
5. **The three-tier alert system** (§5.2b), including the projected-arrival-SoC phrasing
   for the battery alert — "cannot finish this ride and reach a charger", not "battery low".
6. **Clock on / clock off, shift report, and skip-forward** (§5.2). Includes the rule that
   cars do not earn while clocked off, which is the mechanical spine of the act break.
7. **Hours worked vs. hours billed** on the shift report, directly under net. This one line
   carries beat 13 and the entire argument for Act 2.
8. **Standing orders** (§5.2c) — needed before the player has two cars, or real time becomes
   clerical work.
9. **Charging UI as duration, not percentage** — "14 min to 85%" in the car rail, and
   minutes-to-target on charger pins (§5.4).

**Then, ordered by whether the prototype lies to us without it:**

10. **Trip lengths.** `DESIGN.md` §8a flags 112 rides/car/day against a real 15–25. Real
    time largely fixes the *count* (§5.1) but not the cause: three starting zones within
    ~3 km still make 2.2-mile trips. Enable outer zones and re-measure §6.3.
11. **Demand-generated surge** (0.8×–2.0×), separate from the player's multiplier. Beat 7
    has nothing to point at without it.
12. **Two commission rates** replacing the flat 20%, plus the platform-selection UI.
13. **Rating and acceptance-rate systems** — Act 1's antagonist, currently absent.
14. **Manual unsticking**, so the player can be the operator before hiring one.
15. **Financing** at the new $1,500 down / $200 reserve / $13.60/day terms, from deferred.
16. **Fixed cost decomposed** to $42 base + lease/loan/owned (§3.1), replacing the flat $70.
17. **Messages app and the spotlight mechanic** for Paolo, and the thirteen beats.
18. **Soiled incidents** and the cleaning dispatch.
19. **Fleet-vs-gig insurance tiering**, and a Books view showing cost per mile and take rate
    as two separate numbers (§6.3).
20. **Deadhead ratio as a function of fleet size** (§6.3a item 3).
21. **Reword the `Meridian took … priced out` log** for Act 1 (§5.3).

**Then, before Act 2 is built — one decision that can't wait:**

22. **Settle the monitoring-cost contradiction (§8.2a).** `carsPerOp` 1–8 at $22/hour cannot
    reach `DESIGN.md` §3.1's $0.05–0.10/mile monitoring budget, which makes the §10 campaign
    target of $0.55/mile unreachable at every legal slider setting. Recommended: raise the
    ceiling to ~20 *and* lengthen trips in the expansion cities. This determines whether the
    game's headline control does anything, so it is not a tuning task.
23. **Operator shift coverage** as a grid of hours × cars (§8.2b), which real time adds to the
    cars-per-operator ratio. New design, not on the original roadmap, and now the more
    important of the two axes.

Charging no longer needs verification so much as **relocation**: §6.4a argues it is an Act 2
system with an Act 1 rehearsal, because a four-hour shift only uses 30% of the pack. That is
a reasoned prediction from the range figures, not a playtest finding, and step 3 will confirm
or kill it within one shift.

---

## 13. Edits owed to DESIGN.md

This document supersedes parts of `DESIGN.md`, which has not been updated:

- **§3.1** insurance range 0.05–0.08 → **0.05–0.11**, since the gig-rideshare policy is
  worse than any fleet rate.
- **§3.1** should state explicitly that cost per mile excludes commission, and that
  commission is reported separately as take rate (§6.3 here).
- **§8** deferred list: **financing moves out** of it (§8.1 here). Pack degradation, tire
  wear and cleaning stay deferred — but *soiled* incidents move **in scope** (§7 here).
- **§8a** claims the offer cap is implemented. It is not (§12 item 1), so the oversupply
  finding is unverified and should be marked as such.
- **§2.4** says the cars-per-operator ratio is the headline system from the start. It is
  now the headline system *from Act 2*, and Act 1's job is to make the player earn the
  right to care about it.
- **§2.4 / §3.1 conflict, and this one is a genuine error in the original design:** the
  cars-per-operator range of 1–8 cannot produce the $0.05–0.10/mile monitoring cost §3.1
  budgets, so §10's $0.55/mile target is unreachable at every setting. Raise the ceiling to
  ~20. Full arithmetic in §8.2a here.
- **§3.1** should note that monitoring cost per mile is `wage / (milesPerCarHour × ratio)`,
  which is the relationship that makes the ratio the headline slider — currently the doc
  asserts the importance without the formula that creates it.
- **§8** prototype scope opens on 3 cars and $60,000. Reframe as "Act 2 test harness" —
  it was the right thing to build first and the wrong thing to start the game with.
- **§6.1** "1 game day ≈ 10–15 real minutes" is **superseded**: 1× is now the wall clock and
  a session is a shift, not a day (§5.1–5.2 here). This is the largest single revision.
- **§2.1** lists the time controls as pause / 1x / 2x / 4x. Now pause / 1× / 4× / 20× plus
  `Skip to ▸`, and `UI-SPEC.md` §8's status-bar segmented control needs the same edit.
- **§8** "one full day cycle" as prototype scope becomes "one full shift".
- **§2.3** "small numbers, real weight" gains support it didn't have: at 1:1 the player
  watches individual cars for hours, so per-car identity stops being a stated intention and
  becomes unavoidable.

---

## 14. Open items

### New in 0.11.0

- **Real prices versus the fare model.** Card prices ($19,500–$29,000) are balanced for a
  game where a ride nets ~$8. Real MSRPs are roughly 50% higher and would need the fare
  model, the shift length, or both rescaled. Deliberately deferred — but the cards now
  invite the comparison, so somebody will notice.
- **Seats are inert.** The Cab's two seats against five is recorded and shown on the
  card, but nothing in the sim asks for more than one rider. Until group or airport rides
  exist, the Cab's only real cost is its 48 kWh pack. That makes it close to
  strictly-best at present, which is a balance problem the catalogue created.
- **Rent has no exit.** You can rent a car but not hand it back, so the option that should
  be flexible is currently just expensive. `hold` is stored per car, so returning one is a
  small change — it simply has no UI yet.
- **Whether progressive disclosure fights the diegesis.** A car's console does not grey out
  its own radio. The locks teach well and read as a game convention rather than a real
  dashboard, which is a small break with DESIGN.md §2.1. Live with it or find a diegetic
  framing (a permit tier? an app not yet installed?).
- **Ratings still do not exist**, so beat 13 rides on the cancellation half of its trigger
  and the "Rating readout" spotlight has nothing to point at. Unchanged from 0.10.0.

### Carried over

- **Paolo's ending.** He should stop texting at some point in Act 2, and the reason matters.
  Undecided.
- **Whether 1:1 with one car is actually engaging**, or whether ~18 minutes per ride cycle
  is too sparse even with an offer feed to read. This is the one open question that can
  invalidate the rest of this document, and a single playtest shift answers it (§12 step 3).
  Fallback if it fails: 2× as the Act 1 default with 1× reserved for decisions — which keeps
  every mechanic here and only softens the wall clock.
- **Whether the game should run while the app is closed.** Currently no: time only passes
  while you play or deliberately skip. Tempting to make it live, and almost certainly wrong
  — a sim that bills you for not playing is a different and worse genre.
- **How long a maximum shift should be.** Nothing currently stops a twelve-hour session, and
  a game about labour exploitation encouraging twelve-hour sessions is an outcome worth
  thinking about before it ships rather than after.
- Whether declining an offer should show what you turned down. Honest, but possibly
  cruel enough to stop players declining at all — which would break §4.2.
- Whether Act 1 supports a second car at all, or whether the correct design is that
  financing car #2 *is* the act break and Act 2 opens on two cars already owned.
- Whether the player can ever drop the platforms entirely in Act 3, or whether keeping
  Hitchr as an overflow channel at 25% remains correct forever. Leaning: they never fully
  leave, because that's true.
- Naming clearance for **Hitchr** and **Zipp** still owed: USPTO TESS, EUIPO, Steam,
  itch.io, domain. Both were chosen to avoid phonetic overlap with any live rideshare
  mark; per `DESIGN.md` §9.3 that avoidance is not optional, and near-homophones of real
  platforms are specifically what we are staying away from.
