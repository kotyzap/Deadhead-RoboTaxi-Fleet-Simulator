# Deadhead: Robotaxi Fleet Simulator — design document

A **future job simulator**: you own and operate a driverless robotaxi fleet, played
entirely through a car's centre console screen.

*Deadhead* is the industry term for driving empty with no fare aboard. Every taxi driver
knows it, and deadhead miles are the exact thing that kills a robotaxi fleet's margin —
so the lead word names the enemy. The descriptive tail carries the genre for sim players,
who won't know the trade term. Short form in code, folders and conversation: **Deadhead**.

- **Status:** design agreed, prototype not yet built
- **Date:** 2026-07-25
- **Audience:** working taxi / rideshare drivers, and car-simulator enthusiasts
- **See also:** `UI-SPEC.md` (console interface), `TeslaDesignSystem.md` (brand reference)

---

## 1. Premise

You never drive. The cars drive themselves from car #1. You are the owner-operator of a
small robotaxi fleet in a real city, and your job is the one that *replaces* driving:
capital allocation, geofence design, charging strategy, pricing, and — above all —
staffing a room of remote human operators who supervise the cars.

The pitch to a taxi driver is not "here is the machine that took your job." It is
"here is the job on the other side of it, and it is harder than it looks."

---

## 2. Design pillars

### 2.1 Diegetic UI — the screen is the game

The entire interface is a car's centre console display. Nothing exists outside it.
Critically, the **map is the persistent background layer** and app windows float over it,
so your fleet is never out of sight — full detail in `UI-SPEC.md`.

- **Top status bar** — city, day counter, clock, cash balance, time controls (pause / 1x / 2x / 4x)
- **Left rail** — selected car (battery, range, tire wear, cleanliness, state) above a compact fleet list with state colours
- **Centre** — live map: real OpenStreetMap tiles, car positions, demand heat, geofence overlay
- **Bottom dock** — the "apps": Fleet, Books, Charging, Market, Permits, Incidents
- **Bottom-right** — where climate controls would be: pricing quick-set

A P&L statement rendered as a car app is the whole aesthetic thesis. If a feature
can't live on that screen, it doesn't ship.

### 2.5 Real cars, invented commerce

The vehicles are real hardware you could actually buy — Cybercab, Model 3, Model Y — and
every company around them is fictional: Hitchr and Zipp supply the demand, Meridian and
Halo are the rivals. The line is deliberate. Real cars let the game make checkable claims
about batteries and range; invented operators let it make uncheckable ones about
commission and conduct without libelling anybody.

**Every vehicle drives itself.** Autonomy is the setting, not a feature to shop for, and
never a difference between two cards. The Cybercab simply has no steering wheel to remove.

Technical figures on the cards are published ones. Prices are **not** MSRP — they are
balanced against a fare model where a ride nets about $8, and real sticker prices would
need the whole economy rescaling.

### 2.2 The trilemma

Three failure modes, all active, deliberately interlocked. Mitigating one worsens another.

```
                    CASH
                  bankruptcy
                   /      \
     run cars harder,      undercut Meridian
     defer maintenance,    on fare
     thin staffing
                 /          \
        REGULATOR ———————— COMPETITION
      permit pulled      lose riders/zones
              \            /
          more operators, tighter geofence,
          conservative zones → costs up, coverage down
```

No screen should offer a pure upgrade. Every decision is a move along this triangle.
If playtesting produces a dominant strategy, the triangle is mis-tuned — that is the
primary balance metric.

### 2.3 Small numbers, real weight

Real robotaxi fleets are *tiny*. Austin reportedly stalled at ~17 cars after launch.
So the campaign arc is **1 → ~30 vehicles**, never thousands.

Consequence: every car is a named individual with its own odometer, pack health, tire
wear, cleanliness, and incident history. Losing MY-03 to a flooded underpass should
hurt. No fleet abstraction, no idle-game exponents, and all numbers stay mentally
checkable — which is what earns credibility with actual drivers.

### 2.4 Remote operators are the headline system

Remote monitoring is the largest *controllable* cost line in real robotaxi
economics ($0.05–0.10/mile) and it is a **labour** cost. This is the thematic core.

- Hire named operators, each with skill, fatigue, and shift preferences
- Set the **cars-per-operator ratio** — the single most consequential slider in the game
- Ratio drives **intervention latency**: how long a blocked car waits before someone unsticks it
- Latency drives rider cancellations, city complaints, and incident escalation
- Overworked operators degrade: fatigue raises latency and error rate
- Night shifts cost more and attract worse candidates

The player is running a call centre that happens to steer cars. A taxi driver playing
this is looking at a plausible version of their own future employment.

---

## 3. Economic model

Grounded but readable. Figures below are from real 2026 reporting and are the
prototype's starting constants — all tunable.

### 3.1 Cost per mile

| Line item | Range ($/mile) | Player control |
|---|---|---|
| Vehicle depreciation | 0.08 – 0.12 | Buy vs lease, model choice, mileage |
| Energy | 0.03 – 0.05 | Charge timing vs time-of-use tariff |
| Maintenance | 0.03 – 0.05 | Service intervals, tire replacement |
| Insurance | 0.05 – 0.08 | Safety record, city, deductible choice |
| **Remote monitoring** | **0.05 – 0.10** | **Cars-per-operator ratio, shift design** |
| Software / platform | 0.03 – 0.05 | Fixed |
| **Mature target total** | **0.30 – 0.50** | |

Reference points: current real-world Tesla robotaxi cost ≈ **$0.81/mile**; Waymo
**$1.36 – 1.98/mile**. A well-played mid-game fleet should land near $0.55; hitting
$0.40 is an expert outcome.

### 3.2 Revenue

- Tesla real-world pricing ≈ **$1.99/km**; Waymo ≈ **$5.72/km** — a ~56% undercut on identical trips
- Fare = base + per-km + per-minute, multiplied by surge
- Player sets a **price multiplier** relative to the market. Undercut for volume, or price up and cede rides to Meridian
- Surge is generated by the demand model, not set by the player

### 3.3 Balance sheet pressure

Loan payments, insurance premiums, and operator payroll are due on a fixed cadence
regardless of whether cars earned that day. Rain, a heat wave, or a pulled permit
does not pause payroll. This is the cash-flow failure mode.

---

## 4. Permits and progression

The regulatory ladder is taken directly from reality and replaces a conventional tech tree.

| Tier | Meaning | Cost |
|---|---|---|
| **Testing** | Safety monitor in every car, limited hours, small geofence | Full operator wage per car — brutal |
| **Supervised commercial** | Monitor onboard, unrestricted hours, paying riders | Wage per car; scaling is capped by hiring |
| **Unsupervised** | No monitor. Remote ops only | The game's biggest unlock |
| **Expanded unsupervised** | Highways, airport pickup, larger geofence | Requires a clean record at scale |

Advancement is gated on a **safety score** accumulated over miles driven: at-fault
incidents, intervention latency, rider complaints, and near-misses. The regulator is
a slow-moving antagonist with memory — one bad month costs you a quarter.

Real-world grounding: SF Bay Area currently requires an onboard safety monitor while
Miami, Dallas, and Houston run unsupervised. That contrast is the basis of scenario
difficulty.

---

## 5. Cities — scenario missions

Each real Tesla Robotaxi metro is a scenario with its own goal, constraints, and
required strategy. Extensible as new cities launch.

| City | Role | Character |
|---|---|---|
| **Austin, TX** | Tutorial | Permissive regulation, cheap power, sprawl → long deadheads. Brutal summer heat drains range via A/C. Event surges (SXSW, UT football, ACL). Real fleet capped near 17 cars — so does the scenario. |
| **Dallas / Houston, TX** | Expansion | Unsupervised from day one. Enormous geography, highway-heavy trips: high revenue per fare but punishing depreciation. |
| **Miami, FL** | Chaos | Unsupervised, dense, tourist-heavy. Aggressive traffic raises incident rate; flooding and hurricane events; expensive insurance. |
| **Orlando / Tampa, FL** | Tourism | Airport and theme-park demand. Extremely peaky, long airport runs, strong seasonality. |
| **SF Bay Area, CA** | Hard mode | Safety monitor mandatory — payroll from hour one. Highest fares, worst congestion, most expensive power, steep hills hurting range, Meridian entrenched with a strong reputation, hostile regulator. |

Austin is the only city in the prototype.

---

## 6. Systems detail

### 6.1 Time

1 game day ≈ 10–15 real minutes. Pause, 1x, 2x, 4x. Rides, charging, and shifts all
resolve on the ticking clock. Day ends with a report; the player re-plans between days.

### 6.2 Demand

Zone-based generator over the real map: a per-zone base rate modulated by hour-of-day
curve (morning commute, lunch, evening peak, bar close), day-of-week, weather, and
scheduled events. Surge emerges where demand outruns available supply.

### 6.3 Geofence

The core strategic lever, and a real-world practice — operators genuinely draw these
by hand. The player selects which zones to serve. Wider coverage catches more demand
but stretches cars thin and exposes them to incident-prone areas. Airport and highway
access are permit-gated.

### 6.4 Car state machine

`idle → dispatched → waiting for rider → on trip → dropoff` plus
`→ charging`, `→ needs cleaning`, `→ blocked (needs operator)`, `→ in service`, `→ impounded`.

Per-car persistent state: odometer, pack health (degrades with DC fast-charge cycles),
tire wear, cleanliness, incident history.

### 6.5 Charging

**Rapid** network chargers plus an optional owned depot (large capital outlay, much
cheaper per kWh). Time-of-use electricity pricing means charging during the evening peak
is a real mistake. Queues form at popular stalls during peak hours. Deciding when to
pull an earning car off the road is a recurring genuine dilemma.

The decision is made legible by one number, borrowed from the real in-car map:
**projected state-of-charge on arrival.** Every pending ride shows it. Amber below 20%,
red below 10%. That is the whole charging UI.

### 6.6 Incidents

Escalating severity, each demanding a different response:

1. **Blocked** — construction, double-parked truck, confused intersection. Needs a remote operator. Latency = lost fare + rider frustration.
2. **Soiled** — needs cleaning before the next ride. Car out of service until dispatched to clean.
3. **Vandalism / towing** — cost plus downtime.
4. **Collision** — deductible, downtime, and a safety-score hit. At-fault is far worse.
5. **Regulatory event** — triggered by an accumulated pattern, not a single incident.

### 6.7 Competition

Two fictional rival operators, **Meridian** and **Halo**, hold market share per zone.
Meridian is the incumbent: a worse cost structure (lidar-heavy, bespoke vehicles) but a
better reputation and shorter waits in its strongholds. Halo is a scrappy price-cutter.
Both respond to the player's pricing. Losing a zone's share is sticky and slow to win
back.

Rivals are fictional by design — see §10.

---

## 7. Architecture note — "real solution" door

Keep the simulation engine strictly separate from its data source. The domain model
(fleet, vehicle, trip, charge session, incident) should be identical whether fed by the
simulator or by a real Tesla Fleet API. Costs nothing now, and keeps open the option of
pointing the same UI at a real fleet later.

---

## 8. Prototype scope

Decision: **build a throwaway single-file playable core first** and test whether the
loop is fun before choosing the real architecture.

Single `.html` file, Leaflet + OpenStreetMap tiles, light theme with a theme switcher.
No build step — opens by double-click.

**In scope — the minimum that tests whether the loop is fun:**

- Austin downtown, real map tiles, ~8 hand-defined zones
- Accelerated clock with pause / 1x / 2x / 4x, one full day cycle
- Demand generator with zone heat and an hour-of-day curve
- 1 → 6 cars, full state machine, visible moving on the map
- Auto-dispatch nearest idle car, with manual override
- Rapid chargers, a charge/no-charge decision, and arrival state-of-charge on every ride
- Money: fares in, the six cost lines out, live P&L and an end-of-day report
- **One operator with a cars-per-operator slider driving intervention latency**
- **Blocked-car incidents** — the one incident type that exercises the operator system
- Geofence zone selection
- Buy a car (simple purchase, no financing yet)

**Deliberately deferred:**

- Permit tiers and the safety score
- Competitor AI and market share
- Other cities
- Financing, leasing, owned charging depot
- Operator hiring, fatigue, and shifts (one slider stands in)
- Incident types beyond "blocked"
- Weather and scheduled events
- Pack degradation, tire wear, cleaning

**What the prototype must answer:** is deciding *when to pull an earning car off the
road to charge*, under a ticking clock and a demand curve, actually tense? And does the
cars-per-operator slider feel like a real trade-off rather than a number to maximise?

If both are yes, the trilemma will carry a full game and we commit to an architecture.
If not, the fix is in the time and demand model, not in adding features.

Built and running: **`deadhead.html`** (`shell.html` remains the static style reference).

---

## 8a. Prototype findings — 2026-07-25

### The cars-per-operator slider was inert. Fixed.

First build: latency was identical at 1 and 8 cars per operator. The ratio only raised a
capacity *ceiling* that a three-car fleet never reached, so the game's headline system did
nothing.

**The fix changes the design, not just the code: staffing is now derived from the ratio.**
Choosing 5 cars per operator *means* fewer operators on payroll — `ceil(fleet / ratio)` —
and latency scales with how many cars each person is watching. One number now moves both
sides of the trade-off at once, which is what it was always supposed to do.

Measured over three identical 18-hour days, three cars, same demand:

| Ratio | Operators | Latency | Payroll | Net | Cancellations | Safety |
|---|---|---|---|---|---|---|
| 1 car / op | 3 | 18s | $1,187 | **−$250** | 0 | 80 |
| 3 cars / op | 1 | 42s | $396 | **+$596** | 0 | 80 |
| 8 cars / op | 1 | ~100s | $396 | **+$578** | 5 | **68** |

This is the trilemma behaving correctly, and better than designed. Running lean earns
*almost the same cash today* — but burns the safety score from 80 toward the 65 permit
review. The cheap option isn't punished in money, it's punished in regulatory standing,
which is a far more interesting pressure than a fee. Playing it safe is what actually
bankrupts you.

### Demand had to be capped, not throttled

First tuning attempt oversupplied badly: 73 rides lost against 42 served, because a real
city generates far more demand than three cars. Throttling the demand curve then went too
far — cars idled and cost per mile hit $3.67.

The right model is an **offer cap**: the platform only ever shows you ~8 waiting rides.
Underlying demand stays realistic, cars stay busy, and "riders who gave up" becomes a
meaningful buy-another-car signal instead of noise. Also split *priced out by Meridian*
(your fare multiplier) from *gave up waiting* (no car free) — they prompt different
decisions and should never share a counter.

### Economics only work at scale, which is the point

Added a **20% platform commission** and a **$70/car/day fixed cost** (lease, base
insurance, permits) that accrues whether cars earn or not. Without them, margins ran near
68% — nothing like the real business. With them, a small fleet with a dedicated operator
*loses money*, and the way out is scale plus ratio. That matches reality and gives the
campaign its spine.

### A real engine bug: the simulation wasn't timestep-independent

At high speed a single tick spanned ten sim-minutes, so every ride expired before dispatch
ever saw it — zero rides, all day. The loop now sub-steps at a 15 sim-second maximum
regardless of speed setting, and dispatch runs *before* the expiry sweep so a ride can be
taken the moment it appears.

### Still open

- **112 rides per car per day** is unrealistic (real robotaxis do 15–25). Trips average
  2.2 miles because the three starting zones sit within ~3km of each other. Enabling the
  outer zones and the airport lengthens trips; worth re-checking then rather than
  distorting the fare model now.
- Charging appears but is rare on an 18-hour day at these distances. The charge/no-charge
  dilemma needs verifying with longer trips before question 1 can be called answered.
- Geofence now does real work: only Downtown core, Rainey St and UT campus start enabled.
  The other four are the growth lever.

---

## 9. Naming and intellectual property

### 9.1 Title

**Deadhead: Robotaxi Fleet Simulator.** Short form everywhere internal: *Deadhead*.

A distinctive lead plus a descriptive tail — the Hardspace: Shipbreaker / Cities:
Skylines pattern. The lead is ownable and memorable; the tail is the phrase sim players
actually type into a store search.

**Styling: "Robotaxi", never "RoboTaxi".** The internal capital is nonstandard and dates
the title.

#### Why the tail is safe

The USPTO **refused** Tesla's application to register "Robotaxi" for vehicles as merely
descriptive and generic, the examiner noting the term was already used by other companies
for similar goods. Tesla then **refiled for "Tesla Robotaxi"** — brand attached — for
autonomous ride-hailing services, which is a tacit concession that the bare word is not
ownable. As of early 2026 that application is still pending. The bare term is about as
free as a term gets.

#### Why the tail can't be the whole title

Generic cuts both ways: because nobody can own "robotaxi", **we can't either.** Anyone
could ship a competing "Robotaxi Fleet Simulator" and there would be no mark to assert,
no store-page dispute, no recourse. The descriptive phrase also ranks hopelessly against
a continuous stream of real Tesla robotaxi news. The lead word is what gives us something
to defend and something to say out loud.

#### The larger exposure is trade dress, not the name

A console styled after a real in-car interface *combined with* a robotaxi title is what
could imply affiliation. Either element alone is unremarkable. This means the rules in
`UI-SPEC.md` §1 — no wordmark, no vehicle silhouettes, no licensed typeface, fictional
marque and network — do more legal work than the title does. Do not relax them.

Clearance still owed before any public release: USPTO TESS, EUIPO, Steam, itch.io, domain.

### 9.2 In-world names

| Real thing | Deadhead name |
|---|---|
| Vehicle marque | **Nova** — Nova S2 (5-seat sedan), Nova P1 (purpose-built 2-seat pod) |
| Charging network | **Rapid** |
| Incumbent rival | **Meridian** |
| Price-cutting rival | **Halo** |
| Autonomy software | **Handover** (the player's own stack) |

### 9.3 Hard-avoid list

Never appears in code, assets, copy, or store listing:

> Tesla · Model 3 / S / X / Y · **Cybercab** · Supercharger · Autopilot ·
> Full Self-Driving / FSD · Waymo · Uber · Lyft · Universal Sans · Gotham

**Cybercab is specifically radioactive** — Tesla's own application is suspended over a
likelihood-of-confusion refusal after a French beverage company, Unibev, filed for the
name first. It is contested property; stay out of it.

Real *city* names are fine and add authenticity. Real *company* names are not,
particularly for rivals the player is designed to beat.

Layout conventions, a blue accent, flat surfaces and rounded rectangles are not
protectable. Names, logos and typefaces are.

---

## 10. Open items

- Whether the Nova P1 (2-seat pod: cheaper per mile, no manual controls, useless for airport luggage runs) enters as a distinct vehicle class in the full game.
- The Austin scenario capping near 17 cars is faithful to reality but may feel like an anticlimactic campaign ceiling. Decide during prototype tuning whether to hold the line or let the fiction diverge.
- Icon set: needs a freely licensed outline family (Tabler or Lucide).

---

## Sources

- [Tesla robotaxis now open to riders in 4 cities — Smart Cities Dive](https://www.smartcitiesdive.com/news/tesla-robotaxis-cybercab-safety/825988/)
- [Tesla adds Robotaxi in Tampa and Orlando as Austin stalls at 17 cars — Electrek](https://electrek.co/2026/07/21/tesla-robotaxi-tampa-orlando-austin-fleet-stalls/)
- [Tesla launches Robotaxi Service in two more Florida cities — Tesla Oracle](https://www.teslaoracle.com/2026/07/22/tesla-launches-robotaxi-service-in-two-more-florida-cities/)
- [Tesla Robotaxi Cities — Expansion Tracker 2026](https://robotaxi-safety-tracker.com/expansion.html)
- [Robotaxi Economics: What It Actually Costs Per Mile to Operate an Autonomous Fleet](https://tahaabbasi.com/blog/taha-abbasi-robotaxi-economics-cost-per-mile-autonomous-fleet-analysis-feb-2026)
- [Robotaxi Cost Per Mile 2026: $0.18 Target Breakdown](https://sdvguru.com/blog/robotaxi-cost-per-mile-2026-tesla-0-18-target)
- [The Economics of Robotaxis — Business Model Analyst](https://businessmodelanalyst.com/the-economics-of-robotaxis/)
- [Tesla Undercuts Waymo by Half in First Dallas Fare Comparison](https://eletric-vehicles.com/tesla/tesla-undercuts-waymo-by-half-in-first-dallas-fare-comparison/)
