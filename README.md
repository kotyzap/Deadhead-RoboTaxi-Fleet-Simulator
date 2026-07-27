# Deadhead

**A robotaxi fleet simulator where you never touch a steering wheel.**

You are not the driver. You are the person the driver got replaced by — and the job turns
out to be harder. Nine real Teslas, five real Tesla Robotaxi geofences, and a spreadsheet
that bites. All of it happens on one screen: the car's own centre console.

> *Deadhead* — the trade word for driving with no fare aboard. It is the thing that quietly
> kills a robotaxi fleet's margin, and the reason this game is named after it.

## ▶ [Play it now — game.deadhead.workers.dev](https://game.deadhead.workers.dev/)

No install. No account. No download. It runs in the browser you already have.

<a href='https://ko-fi.com/K3K6RR4LY' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

---

## The first decision is the whole game

You start with **$7,500** and no car. Every vehicle in the catalogue costs more than that.

That is not a difficulty spike, it is the lesson. You cannot buy your way in, so you have to
choose *how you hold the asset* — and each way of holding it is wrong in a different way.

| | up front | per day | what it really costs |
|---|---|---|---|
| **Buy outright** | $30,000+ | least | impossible on day one, and that's the point |
| **Finance** | 15% down | middling | a debt you cannot hand back |
| **Rent** | nothing | most | the meter never stops. Ever. |

Renting costs nothing today and the most every day after. Financing is cheaper for exactly
as long as you keep working, and a mistake the moment you stop. **Neither is wrong.**

Four of the nine are financeable on day one. The other five you can only look at.

---

## Nine real cars, and the specs actually bite

Every vehicle is real and every technical figure is the published one — the Cybercab's
numbers come straight off its EPA filing. None of it is flavour text; each spec feeds a
system that is already running.

| | pack | range | seats | what it means for you |
|---|---|---|---|---|
| **Cybercab** | 48 kWh | 300 mi | 2 | no wheel, no pedals, cheapest to own — and on a charger constantly |
| **Model 3** | 62 kWh | 321 mi | 5 | the entry trim: cheap to hold, short on legs |
| **Model Y** | 70 kWh | 321 mi | 5 | more pack, more frontal area — same distance for more money |
| **Model 3 Premium** | 82 kWh | 363 mi | 5 | longest range here, and the last car you can finance on day one |
| **Model Y Premium** | 82 kWh | 357 mi | 5 | nearly that range, in a crossover body |
| **Model Y L** | 85 kWh | 330 mi | 6 | biggest pack short of the truck, spent carrying a third row |
| **Model 3 Performance** | 82 kWh | 309 mi | 5 | 54 fewer miles from the same pack. Nothing here pays for acceleration |
| **Model Y Performance** | 82 kWh | 306 mi | 5 | buy it because you want it. The arithmetic says no |
| **Cybertruck** | 123 kWh | 320 mi | 5 | worst cost per mile by a mile, 38 minutes to fill, $152 every midnight |

Pack size decides how often a car is *earning nothing*. Energy per km decides what every
mile costs. Price decides whether you own a business or a debt. Choose badly and you won't
notice for two days.

---

## Five cities, one chain

Austin is the tutorial. Clock off your first shift there and Dallas unlocks; clock off in
Dallas and Miami unlocks; then Tampa, then Orlando. Every city is a real, currently-operating
(or just-launched) Tesla Robotaxi service area built from its actual geofence, tariff and
permit status — not a reskin with a new coat of paint.

| city | permit | fleet cap | goal | what's actually true about it |
|---|---|---|---|---|
| **Austin** | Supervised | 17 | $40,000 | the tutorial. Seven zones plus the airport, and Austin Energy's real five-hour evening peak |
| **Dallas** | Unsupervised | 24 | $60,000, safety ≥ 70 | launched with no safety monitor at all. Highway-speed trips wear the car harder, but S Riverfront is 34 stalls at 325 kW — the best charging site in the game |
| **Miami** | Unsupervised | 16 | $50,000, safety ≥ 75 | a tiny geofence with no airport and no downtown. FPL's peak runs nine straight hours, and Florida carries the harshest insurance rates in the table |
| **Tampa** | Unsupervised | 14 | $45,000 | the exact mirror of Miami: all core, no suburbs, and an evening rush instead of a morning one — plus the cheapest overnight power in the game, if the fleet can wait for it |
| **Orlando** | Unsupervised | 14 | $42,000 | a corridor that runs past MCO without touching it. No airport zone, no brewery zones, the thinnest demand of the five — and the cheapest power of all of them |

Nothing above is tuned for difficulty after the fact. Where the real service area excludes
downtown, the airport, or every brewery in town, the game excludes it too.

---

## What you actually do

**Clock on.** Cars only earn while you are watching them — you are the remote operator.
Clock off and they park, and still owe their fixed cost at midnight. A four-hour shift owns
a car that sits idle for twenty hours and gets billed for all of them. That is the most
accurate thing this game says about gig work, and it arrives as arithmetic rather than a
speech.

**Read the offers.** Three numbers on every one: what the meter says, what you actually keep
after commission, and how far you drive empty to reach the passenger. The third decides
whether you made money.

**Play the tariff.** Every city runs its own real utility's time-of-use pricing — Austin
Energy, Oncor, FPL, TECO, OUC — so "charge at 4am" means something different, and is worth a
different amount, in each one. In Austin, power is $0.11/kWh before 07:00 and $0.34 through
the evening peak. Real Superchargers back it: South Congress is 2.5 km away; Research
Boulevard never queues because it has 18 stalls, but it's 27 minutes out and charges at only
72 kW. Miami flips the clock entirely — FPL's peak runs noon to 9pm, nine hours instead of
five — and Tampa's off-peak, at 7.5c/kWh, is the cheapest power in the whole game.

**Draw the map.** Every city has its own zones and its own demand curve by hour, and no two
read the same way. Austin has seven zones plus Austin-Bergstrom — Rainey Street pays at 2am,
UT campus pays at 8am, the airport pays $30 a run and leaves your car 21 minutes from
everything else. Miami and Orlando have no airport zone at all, because the real geofences
don't reach one. Tampa's evening is the busiest hour in the game once its three Ybor taproom
zones are live; Orlando has no brewery zones, because the real ones sit outside its corridor.

**Take control.** When a car gets wedged, the console switches to its camera feed and you
drive it out yourself. Entirely optional — the incident clears on its own eventually.
Whether "eventually" is soon enough is your problem.

---

## Real data, not set dressing

- **Five real geofences** — Austin, Dallas, Miami, Tampa, Orlando — each drawn from the
  actual published or reported service area, not a symmetric shape dropped on the map
- **Live weather** for whichever city you're in, and its real local clock
- **Real Superchargers** in every city, with actual coordinates, stall counts and peak kW —
  a 72 kW site charges slower because it genuinely does
- **Real fares** calibrated against observed prices in each market: about $18 for a downtown
  Austin hop, $29–32 from Austin's airport, and a different scale entirely in each other city
- **Real MSRP** on all nine cars, with a cost side scaled to match
- **Real time-of-use electricity** from each city's actual utility — Austin Energy, Oncor,
  FPL, TECO, OUC — which is why charging at 4am is a strategy in one city and a shrug in
  another

Everything *around* the hardware — Hitchr, Zipp, Meridian, Halo — is invented. The cars and
the numbers are not. That line is deliberate.

---

## Paolo

Forty-one years in a cab before he got out, while getting out was still his idea. He walks
you through your first day, then goes quiet — and speaks again only once you've been stuck
long enough to need it. He isn't a tooltip. He has opinions about what you're doing, and
he's usually right.

A standing **Now** line always names the single most useful next thing, so you're never
lost. It never tells you what to *choose*.

---

## Also in the box

- Save anywhere, or sign in for cloud saves synced across devices
- Light and dark themes
- Works on a phone, a laptop and an ultrawide — the layout genuinely reworks itself
- Passwords are never transmitted: key derivation runs in your browser
- One HTML file, no build step — [download it](deadhead.html) and it runs offline

---

## Buy Paolo a coffee

Deadhead is free and stays free. No ads, nothing behind a paywall, no second version that
costs money. If it turned out to be worth something to you, there's a tip jar — and if it
didn't, that's completely fine.

<a href='https://ko-fi.com/K3K6RR4LY' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

There's a **Coffee** button in the top right of the game, too. Paolo will ask you himself.

---

**[▶ Play Deadhead](https://game.deadhead.workers.dev/)** · Building or deploying it? See
**[DEVELOPING.md](DEVELOPING.md)**.

<sub>Deadhead is an independent fan project, not affiliated with, endorsed by or connected to
Tesla, Inc. Vehicle names and specifications are referenced for realism; every company,
platform and commercial term in the game is fictional.</sub>
