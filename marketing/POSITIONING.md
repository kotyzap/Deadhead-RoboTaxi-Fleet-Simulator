# Deadhead — Positioning & Messaging

*v2 · 2026-07-27 · for game.deadhead.workers.dev · live build 0.39.5, tree at 0.40.0*

---

## 1. The one-sentence position

> **Deadhead is a management sim about the arithmetic of a robotaxi fleet — real
> cars, real service areas, real electricity tariffs — played entirely inside a car's
> centre console, free in the browser.**

Everything below is a restatement of that sentence at a different length or for a
different room. If a piece of copy can't be traced back to it, cut the copy.

### Positioning statement (internal, not for publication)

For **management-sim players who want systems that bite** — the people who liked
*Motor Town*, *Cities: Skylines*' budget screen and *Papers, Please*'s pressure more
than they liked the building — **Deadhead** is a **browser-based fleet simulator**
that **makes you feel the cost side of an asset business in about ninety seconds.**
Unlike **idle/clicker fleet games**, which abstract cost into an upgrade tree,
**Deadhead uses real published numbers** — MSRPs, EPA range figures, utility
time-of-use tariffs, actual charging-site stall counts — **so every decision has a
correct answer you have to work out rather than unlock.**

---

## 2. Why "sim/management players" is the right lead

The four audiences in play, ranked by how well the product actually serves them:

| audience | what they'd love | why they're not the lead |
|---|---|---|
| **Sim / management players** | deadhead miles, TOU tariffs, cost-per-mile breakdown, the buy/finance/rent trilemma | — **this is the lead** |
| EV enthusiasts | a real spec ladder, real service areas, real charger networks | Reachable, but they'll argue about the manufacturer, not about your game. Great *second* wave, terrible first impression. |
| HN / builder crowd | one 800 KB HTML file, no build step, Cloudflare free tier, offline | Excellent Show HN, but the thread becomes about architecture and the players don't stick. Use as a **separate** launch beat. |
| Gig-economy / labour | "you are the person the driver got replaced by" | Highest share potential, highest flame risk. Keep it in the *text* of the game (Paolo's fourteen messages) — don't lead marketing with it. |

**The rule:** lead with the *system*, let people discover the *theme*. A sim player who
arrives for tariff optimisation and leaves thinking about Paolo's last message is converted.
A player who arrives for a labour argument and finds a spreadsheet feels bait-and-switched.

---

## 3. The hook ladder

Use the shortest one that fits the space.

**6 words (title/tagline):**
> A robotaxi fleet that bills you nightly.

**12 words (subtitle, OG description):**
> Free browser sim. Six cars, six real cities, one very honest spreadsheet.

**25 words (Reddit title / itch.io blurb):**
> I built a robotaxi fleet sim with real running costs, real charger locations and
> real utility tariffs. You start with $800 — enough to rent two cars, back to back.

**60 words (store description, press email opener):**
> Deadhead is a free browser management sim about running a small robotaxi fleet.
> You start with $800. The cheapest car is $30,000, so you rent — and you can afford
> two, back to back. A third you earn. Six real driverless-ride-hailing cities, each with its
> actual geofence and its real utility's tariff. Cars only earn while you're clocked on
> and bill you at midnight regardless. That gap is the whole game.

---

## 4. The three pillars

Every asset should carry at least one. The hero assets carry all three.

### Pillar 1 — "The numbers are real, and that's the difficulty setting"
Not "realistic". *Real.* Sourced, published, checkable.

- Six trims on a real spec ladder — real pack sizes, real range, real cost per mile
- Six real driverless-ride-hailing cities, drawn from published service areas
- Real charging sites with actual coordinates, stall counts and peak kW
  — a 72 kW site charges slowly because it genuinely does
- Real time-of-use pricing from six real utilities: Austin Energy, Oncor, FPL, TECO, OUC, PG&E
- Live weather and the real local clock for whichever city you're in

**The proof line:** *Austin's power swings 3.1x between off-peak and peak. Orlando's
swings 1.8x. San Francisco's off-peak price ties Dallas's peak and beats every other
city's. "Charge at 4am" is a strategy in most cities, barely worth the wait in Orlando,
and not even the cheap answer in SF — and the utilities decided all of that, not me.*

### Pillar 2 — "The trap is the tutorial"
The game teaches through arithmetic, not tooltips.

- **$800 and no car**, once, at the very first company you ever create. The cheapest car
  is $30,000 outright, or $4,500 down to finance — $5,000 once the lender's reserve is
  counted. Both are visibly out of reach on the same screen. Renting is the only door.
- **And you can afford two, back to back.** A Cab needs $389 — $75 at signing plus
  two days' runway. A Saloon needs $462. A second Cab needs $703, because the
  first car's own $157 daily burn now counts against the runway check — $800 clears
  both. A third needs $1,017. Day one is still a real choice: not *which of three ways
  to hold an asset*, but *how far two cars get you before the third has to be earned*.
- Cars earn only while you watch them, and owe their fixed cost at midnight anyway
- Every offer shows three numbers; only the third — deadhead miles — decides if you made money
- **Financing later is cheaper for exactly as long as you keep working.** A rented car
  can be handed back. A financed one cannot. That's Act 2's version of the same trap.

**The proof line:** *A six-hour shift owns a car that sits idle for eighteen hours and
gets billed for all twenty-four. Two rented Cabs — the cheapest car in the game —
burn $314 a day before either turns a wheel: $164 fixed plus $150 of rent, between them.
On day one that's two-fifths of everything you have, every day, forever.*

### Pillar 2b — "Six cities, and you have to earn each one"

Cities aren't a menu. Each one is gated on `shift1@<previous>` — **clock off a full shift
in Austin and Dallas unlocks; clock off in Dallas and Miami unlocks**, then Tampa, then
Orlando, then San Francisco. You can see the locked tabs from the first boot, and Paolo
has a line about each one, so the ladder is visible without being available.

Two more tabs sit at the end of the strip, dashed and permanently locked: **Phoenix** and
**Las Vegas**. They're not scenarios — no zones, no economy, just a Paolo line each. As
marketing they're worth more than that: a visible roadmap costs you nothing and tells a
player the thing isn't finished with them.

| # | city | permit | fleet cap | goal | the thing about it |
|---|---|---|---|---|---|
| 1 | **Austin** | Supervised | 17 | $40,000 | the tutorial, and Austin Energy's real five-hour evening peak |
| 2 | **Dallas** | Unsupervised | 24 | $60,000, safety ≥ 70 | no monitor at all; S Riverfront is 34 stalls at 325 kW |
| 3 | **Miami** | Unsupervised | 16 | $50,000, safety ≥ 75 | tiny box, no airport, FPL's peak runs nine straight hours |
| 4 | **Tampa** | Unsupervised | 14 | $45,000 | Miami mirrored — evening rush, and 7.5c overnight power |
| 5 | **Orlando** | Unsupervised | 14 | $42,000 | the thinnest demand, a corridor that runs past MCO without touching it |
| 6 | **San Francisco** | Supervised | **1** | $38,000, safety ≥ 75 | see below |

**And it's one company, not six save files.** There is a single shared bank across every
city — `companyCash`. The $800 is where the company starts, once, ever. What's *per-city*
is the fleet, and that's the sting: a rented car you left parked in Miami keeps owing its
daily fixed cost at real-world midnight while you're working Tampa, and the bill is
settled in one lump the moment you go back. Three days unpaid and the lender takes it.

You don't move on from a city. You add one.

### Pillar 3 — "No install, no account, no download, no catch"
The friction story is a feature, not a disclaimer.

- One click, runs in the tab you already have
- One HTML file, no build step — download it and it runs offline
- Save locally or sign in for cloud saves across devices; passwords never transmitted
- Free forever, no ads, no paywall, no premium edition. Ko-fi tip jar, optional.
- Light and dark, phone through ultrawide, the layout genuinely reworks itself

**The proof line:** *The whole game is one 826 KB HTML file.*

---

## 5. San Francisco — the closing hook

**Use this at the end, never at the start.** It is the best single sentence the game
owns, and it only lands on someone who has already understood that this is a *fleet*
sim. Lead with SF and you spoil the payoff and misdescribe the first five cities.

The move: after five cities of growing a fleet, city six takes the fleet away.

- **`fleetCap: 1`.** Not "SF's fleet is small". SF has no fleet. It has one car, because
  it has one of you.
- **The speed control locks at 1×.** Every other city lets you run at 4× or 20×. You
  cannot fast-forward through a job you are physically sitting in.
- **Axiom pays you $250 for every day you actually clock on** — a wage for the seat, not
  a subsidy for the car. Silent on a day you never worked.
- **PG&E, and there is no cheap hour.** 62c/kWh at peak, 31c off-peak. SF's *off-peak*
  price ties Dallas's peak and beats every other city's peak outright. "Charge at 4am",
  the answer that worked in five straight cities, stops being an answer.
- **Three real charging sites and no clean pair.** The only 250 kW site is out in the
  Richmond District; the close one on Van Ness is 12 stalls at 72 kW. Every prior city
  gave you "fast and far or slow and close". SF gives you neither.
- **SFO is servable, and it's current** — it joined the real map on 21 July 2026, six
  days before the scenario shipped. Miami and Orlando have no airport zone at all because
  the real geofences don't reach one; SF's does, and it's the freshest fact in the game.

**The line:**
> Five cities teach you to run a fleet. The sixth gives you one car and puts you in it.

**Why it's true rather than a gimmick:** the real Bay Area service does run with a
safety driver aboard under a Transportation Charter Party permit — the same class a
limousine company holds. The CPUC has said on the record that this is not an autonomous
vehicle service. The game didn't invent a hostile regulator; it reported one.

**Careful with:** don't frame the stipend as generous. $250 a day against a $38,000 goal,
in the most expensive city in the game, with one car and no fast-forward, is an offset —
not a way around anything. The joke lands because it's small.

---

## 6. Naming the thing that makes it different

Most fleet games model **revenue**. Deadhead models **cost**.

That's the entire competitive position and it should appear, in some form, in every
long-form piece:

> Everyone's built the game where you accept the fare. Nobody's built the game where
> you find out what it cost to be in a position to accept it.

The word *deadhead* does this work for free — it's a real trade term, it's the thing
that quietly kills a fleet's margin, and explaining it takes one sentence. **Always
explain it.** Lead every long post with the definition; it's the most shareable
sentence you own.

---

## 7. Voice

The README already has the voice. It is:

- **Flat and declarative.** "Neither is wrong." "Priced as the mistake it is."
- **Numbers as punchlines.** The joke is the figure, not a comment about the figure.
- **Never oversells.** "Whether 'eventually' is soon enough is your problem."
- **Never apologises for being a spreadsheet.** The spreadsheet is the pitch.

**Do:** short sentences. Concrete figures. One dry aside per paragraph, maximum.
**Don't:** exclamation marks, "epic", "immersive", "deep dive", emoji in body copy,
"we" (it's one person — say "I").

**Banned words:** immersive, gripping, addictive, deep dive, journey, experience (noun),
game-changing, revolutionise, unleash.

---

## 8. Where the theme lives

The labour angle is the best thing in the game and the worst thing to lead with. Rules:

- **Never** in a headline, tagline, or OG card
- **Never** as a political claim ("robotaxis are bad for workers")
- **Always** as an observed consequence of the system ("cars only earn while you watch")
- Paolo carries it inside the game, across his fourteen messages — that's where it lands hardest
- If a comment thread goes there, engage honestly and specifically. Don't retreat to
  "it's just a game", and don't escalate.

**The safe framing, if asked directly:**
> I didn't set out to make a point. I set out to model the cost side honestly, and the
> point fell out of the arithmetic. That's why I left it in.

---

## 9. Objection handling

| you'll hear | say |
|---|---|
| "Is this official / manufacturer-affiliated?" | No, and it names no manufacturer. Every car, company and commercial term in the game is invented — Axiom, Hitchr, Zipp, Meridian, Halo. What is real is the arithmetic: service areas, tariffs, permit regimes, observed fares. This is in the footer of every page. |
| "Isn't this just a spreadsheet?" | Yes. That's the pitch. It takes about ninety seconds to find out whether that's your kind of thing, and it costs nothing to find out. |
| "AI slop / vibe-coded?" | Be straight about how it was built if asked. Point at the sourcing: real geofences, real tariffs, real stall counts. The verifiability is the answer. |
| "Where's the 3D driving?" | There's one optional bit — when a car gets wedged you can take the camera feed and drive it out. It's a minigame, not the point. |
| "Will it get paywalled?" | No. Free forever, no ads, no premium version. Ko-fi if you want, and it's fine if you don't. |
| "You'll get a C&D" | Nothing here uses any manufacturer's name, badge, model names, typeface or photographs — that was deliberately removed in 0.42.0 — and the project is non-commercial. Say that once, plainly, and move on. Don't litigate in comments. |
| "$800 is fake-hard, just give me money" | It's the number that clears two cars back-to-back without clearing three. At $3,000 you could rent five or six and the lesson never arrives; at $800 you rent two and the fleet-burn math starts biting on the third. That's where day one's decision actually lives. |
| "Why can I only have one car in San Francisco?" | Because you're the safety driver. The real Bay Area service runs with a human in the seat, and the human is you, not an employee. You can't be in two seats at once. |
| "The speed control is broken in SF" | It's locked at 1× on purpose, for the same reason. You can't fast-forward through a job you're physically sitting in. Hover the permit badge and it says so. |

---

## 10. What success looks like

Goal is **maximum players, tip jar only.** So the metrics that matter, in order:

1. **Sessions that rent a first car** — if $800 reads as broken rather than as the
   lesson, nothing downstream matters. This is the single riskiest moment in the product.
2. **Sessions that clock off a full shift in Austin** — that's the gate to city two, so
   it's also the gate to the whole game existing for that player
3. **Sessions that reach Dallas** — proof the loop holds
4. **Sessions that reach San Francisco** — the payoff you're building the marketing toward
5. Unique players
6. Ko-fi (a lagging vanity metric — don't optimise for it, don't ignore it)

Explicitly *not* goals: mailing list size, followers, press hits for their own sake.

---

## 11. Bugs and blockers, in priority order

**0. BLOCKER — switching city hangs the renderer.** Reproducible on the live 0.39.5 build:
with a fleet on the books and the company bank unable to cover it, clicking any other city
tab freezes the tab completely — no render, no input, requires a reload. Hit it three times
in a row, on Tampa as well as San Francisco, from a clean page load each time. The most
likely culprit is `reconcileParkedBilling()`: it debits every parked car's
`fixedPerCar()` per real calendar day, and a company balance that can never climb back
above zero looks like it could spin the grace/repossession path. That is precisely the
state a struggling player is in, and city-switching is the whole progression system. **Fix
this before any marketing beat** — none of the six-city or San Francisco messaging survives
a player who can't reach city two. It's also why there's no SF screenshot in this kit.

**0b. Paolo's first line still says $7,500.** Message 1 of 14, the first sentence a new
player reads, is *"Seven and a half thousand dollars and no car."* Starting cash is $800.
The tutorial contradicts the bank balance on screen, in the exact moment the game is trying
to teach the player what the bank balance means.

**1. Layout overlap at ~1400–1550 px and on mobile.** The "Send to charge" button
renders on top of the RANGE and POWER NOW cells. Visible in
`marketing/screens/console-1499-day.jpg` and `console-mobile-night.jpg`; clean at 1920 px.
Anyone who screenshots from a 1440p laptop will share that overlap.

**2. The advisor is labelled "Ray" in the UI.** The messages panel renders
`Ray · 14 of 14`, but the character is Paolo Cortez and introduces himself as such. `RAY`
is the internal name of the beats array leaking into the header. It reads as a bug to a
player and it undercuts the one piece of characterisation in the game. Marketing assets
here say Paolo.

**3. The six utilities are never named in-game.** Austin Energy, Oncor, FPL, TECO, OUC and
PG&E appear only in source comments — a player sees "Rapid Network" and a price. The single
best piece of proof you own is invisible to the person playing. Putting the utility name
on the tariff panel would cost one line and would make the strongest marketing claim
self-evidencing.

**4. `README.md` describes a San Francisco that no longer exists.** It has the six cities
and the chain right, but it still says **"You start with $7,500"** when the game starts
you at $800, and — worse — it gives SF a **fleet cap of 12** with no mention of soloSeat,
the 1× lock or the $250 stipend. The single best hook in the game is missing from the
first thing anyone reads on GitHub. Two paragraphs of README work unlocks the whole
closing beat in §5.

### Also worth knowing

**The live build is a version behind the tree.** `game.deadhead.workers.dev` serves
0.39.5; `deadhead.html` and `deploy/public/index.html` are both 0.40.0 and byte-identical
to each other, so the old source↔deploy fork is closed. Every number in this kit is true
of both, but deploy before you launch.

**Two bits of stale player-facing text**, both left over from the $7,500 economy: the
Crossover Long catalogue note still reads *"$7,350 with the lender's reserve, and you
have $7,500"*, and the Orlando charger comment says *"against a fleet cap of 18"* when it
is 14.

**`marketing/screens/garage-day-one.jpg` was two rebrands out of date until 2026-07-30.**
It still showed real Tesla model names and photographs (Cybercab, Model 3, Model Y) from
before the 0.42.0 rebrand, plus the old nine-trim, two-seat-Cab catalogue. Reshot against
the current build: Axiom-badged, six trims, $800 starting cash, the corrected four-seat
Cab.
