# Deadhead — Channel Playbook

*Ready-to-post copy. Read `POSITIONING.md` first — this file assumes the voice rules in §6.*

---

## The launch sequence

Don't launch everywhere on one day. Five beats over three weeks, each aimed at a
different room, each feeding the next. The staggering matters: a Show HN that lands
gives you a "1,400 people played it in a day" line for the Reddit posts, and a good
Reddit thread gives you screenshots and quotes for the landing page.

| # | when | where | angle | needs |
|---|---|---|---|---|
| 0 | −7 days | landing page live, OG cards in place | — | `og-card-main.png`, meta tags |
| 1 | Day 0, Tue | **r/incremental_games** or **r/WebGames** (soft launch) | "the trap is the tutorial" | console-wide-day.jpg |
| 2 | Day 3, Fri | **itch.io** page goes up | store presence, discoverability | banner, cover, 5 screenshots |
| 3 | Day 7, Tue 08:00 ET | **Show HN** | "one HTML file, real utility tariffs" | landing page must survive traffic |
| 4 | Day 10 | **X / Bluesky / Mastodon** launch thread | the deadhead-miles explainer | explainer graphics |
| 5 | Day 14 | **r/BaseBuildingGames**, **r/SimGames**, **r/tycoon** | the systems pitch, city by city | Dallas/Miami/Tampa screens |
| 6 | Day 21 | **EV / robotaxi subreddits** | "real service areas" — only if beats 1–5 went well | `garage-day-one.jpg` |
| 7 | Day 28+ | wherever beat 1 landed best, as a follow-up | **the San Francisco reveal** — "the sixth city takes the fleet away" | `og-card-sf.png`, `explainer-sf-soloseat.png` |

**Beat 7 is the one to hold back.** SF is the strongest single hook the game owns, and
it's worth more as a "you got to city six?" follow-up than as part of the launch noise.
Post it to whichever room engaged most in week one, as a devlog rather than a pitch.

**Do not run any of this yet.** The live build hangs when you switch city (see
`POSITIONING.md` §11 item 0), and city-switching is the entire progression system. Every
post below promises six cities. Fix that first.

Rule for all of it: **check each subreddit's current self-promotion rules the day you
post.** They change, and one removed post costs you the sub for months. Where a sub has
a weekly showcase thread, use it first and only make a standalone post if the showcase
gets traction.

Second rule: **be in the comments for the first four hours.** On Reddit and HN the
comment response is worth more than the post. You wrote every number in this game — that's
an unfair advantage in a thread and you should use it.

---

## Beat 1 — Reddit soft launch

### r/incremental_games (or r/WebGames)

**Title:**
> I made a free browser sim where you run a robotaxi fleet — and the cars bill you at midnight whether they moved or not

**Body:**

> *Deadhead* is the trade word for driving with no fare aboard. It's the thing that
> quietly kills a taxi fleet's margin, and it's what the game is named after.
>
> You start with **$800**. The cheapest car in the catalogue is $30,000 outright, or
> $4,500 down to finance — $5,000 once the lender's reserve is counted. Both of those sit
> on the same screen as your bank balance, and both are obviously impossible. So you rent.
>
> And you can afford two, back to back. A Cab needs $389 — one day's rent at signing
> plus two days' runway. A Saloon needs $462. A second Cab needs $703, because the
> first car's own $157-a-day burn now counts against the runway check. A third needs
> $1,017. Day one isn't "which of three ways do I hold this asset", it's "how far two cars
> get me before the fleet-burn math makes me earn the third".
>
> Then it gets worse. Cars only earn while you're clocked on, because you're the remote
> operator. Clock off and they park — and still owe their fixed cost at midnight. A
> six-hour shift owns cars that sit idle for eighteen hours and get billed for all
> twenty-four. Two rented Cabs — the cheapest car in the game — burn $314 a day
> between them before either turns a wheel: $164 fixed plus $150 of rent. That's two-fifths
> of everything you own, every day, forever.
>
> Every ride offer shows three numbers: what the meter says, what you keep after the
> platform's commission, and how far you drive empty to reach the passenger. The third
> one decides whether you made money.
>
> The cars are invented. The numbers are not: real pack sizes, real range, real cost
> per mile, and six real driverless-ride-hailing service areas drawn from published maps.
> Real charging sites with actual stall counts and peak kW — a 72 kW site charges slowly
> because it genuinely does. And each city runs its real utility's time-of-use pricing,
> so "charge at 4am" is worth a different amount in Austin than in Orlando — and barely
> worth it at all in San Francisco.
>
> Six cities, and you have to earn each one — clock off a full shift in Austin and Dallas
> unlocks, clock off in Dallas and Miami unlocks, then Tampa, Orlando, and San Francisco.
> Phoenix and Las Vegas sit at the end of the strip, locked, because nobody has actually
> launched there yet and I'm not going to invent a city.
> One company and one bank across all of them, which means you don't leave a city so much
> as add one: a rented car parked in Miami keeps billing you at real-world midnight while
> you're working Tampa, and it's all settled in a lump when you go back. Three days unpaid
> and the lender takes it.
>
> Free, browser, no install, no account, no ads, no paywall. One HTML file — you can
> download it and it runs offline.
>
> ▶ https://game.deadhead.workers.dev/
>
> Happy to answer anything about how the economy is tuned. I sourced every figure and
> I'm fairly sure some of them are still wrong.

*(That last line does a lot of work. It invites correction instead of criticism, and
sim players love correcting you.)*

### r/BaseBuildingGames / r/SimGames / r/tycoon (beat 5)

**Title:**
> Six cities, six real electricity utilities — a free browser fleet sim where the tariff is the puzzle

**Body:** lead with Pillar 1, drop the trilemma to a short paragraph, and add:

> Austin is $0.11/kWh before 07:00 and $0.34 through the evening peak — Austin Energy's
> real five-hour window, a 3.1x swing. Miami flips the clock: FPL's peak runs noon to
> nine, so nine straight hours are expensive and the overnight window is short. Tampa has
> the cheapest single rate in the game at 7.5c/kWh, if your fleet can afford to wait for
> it. Orlando only swings 1.8x, so charging overnight barely repays the idle time — and
> its corridor runs past the airport without touching it, because the real service area does.
> San Francisco breaks the pattern entirely: PG&E's real off-peak price ties Dallas's peak
> and beats every other city's, so there's no cheap hour to wait for at all.
>
> None of that is tuned for difficulty after the fact. Where the real geofence excludes
> downtown, the airport, or every brewery in town, the game excludes it too.

### EV / robotaxi subreddits (beat 6 — optional, highest risk)

Only after the others land. Lead with the catalogue screenshot, keep the body short and
factual, and **open with the disclaimer** rather than burying it:

**Title:**
> Independent project: a free browser sim of running a robotaxi fleet, built from published service areas and real running costs

**Body:**

> Not affiliated with any manufacturer — this is a hobby project and every company, car and
> commercial term inside it is invented. What's real: the six trims, their MSRPs, pack
> sizes and EPA range figures, the six service
> area maps, the charging sites with their real stall counts and peak kW, and
> each city's actual utility tariff.
>
> It's a management sim, not a driving game. You run the fleet, not the car.
>
> ▶ https://game.deadhead.workers.dev/

Expect spec arguments. Have your sources to hand. Concede fast and fix — a "you're right,
patched" reply is worth more than winning.

---

## Beat 3 — Show HN

**Title (HN titles must be plain — no hype, no emoji, under 80 chars):**
> Show HN: Deadhead – a robotaxi fleet sim in one 826 KB HTML file

**First comment (post this immediately after submitting):**

> Author here. Deadhead is a management sim about the cost side of running a small
> robotaxi fleet. "Deadhead" is the trade term for driving with no fare aboard — the
> thing that quietly kills a fleet's margin.
>
> The reason I'm posting it here rather than only in game subreddits is the build. It's
> one HTML file, no build step, no framework, no bundler. You can save the page and it
> runs offline. It's served as a static asset from Cloudflare Workers, which means the
> game itself cannot really go down and cannot really cost me anything — the only
> dynamic parts are optional cloud saves and a leaderboard, both on D1, both degradable
> to nothing.
>
> Things that turned out to be more interesting than expected:
>
> - **Real time-of-use tariffs as a game mechanic.** Each of the six cities runs its
>   actual utility's pricing — Austin Energy, Oncor, FPL, TECO, OUC, PG&E. Austin's evening
>   peak is five hours, FPL's is nine, and PG&E's off-peak price ties Dallas's *peak*.
>   "Charge overnight" is a strategy in one city and not even worth it in another, and I
>   didn't have to design that; the utilities did.
> - **Real geofences.** Each service area is the published one. Miami has no airport
>   zone and Orlando has no brewery zones because the real areas don't reach them.
>   Where reality made the map worse, I left it worse.
> - **Baked OSRM routes for drawing only.** Cars follow real road geometry on the map,
>   but the economy runs on straight-line distance. Decoupling the two meant I could
>   make it look right without retuning anything.
> - **Passwords never leave the browser** — key derivation is client-side, the server
>   only ever sees derived material.
> - **One config constant carries the whole first act.** Starting cash used to be $3,000
>   and the "you can't afford a car" lesson never landed — players rented three and got
>   on with it. It also used to be tuned to $500, which overcorrected: a single car's own
>   burn ate most of a session's margin, and a second one wasn't reachable without
>   grinding day one dry. At $800 you clear the rent floor for two Cabs back to back
>   ($389, then $703 once the first car's own burn counts against the runway check) and a
>   third has to be earned. Same code, entirely different game each time.
> - **The sixth city sets `fleetCap: 1` and disables fast-forward.** San Francisco's real
>   service runs with a safety driver aboard, so the supervisor is the player rather than
>   a simulated employee — which means one car, and no running the clock ahead of a job
>   you're physically sitting in. It's one boolean, and it's the only field in the city
>   table that drives a mechanic rather than reporting a fact.
>
> Free, no ads, no account required, no paywall, and there won't be one.
>
> Happy to go into the economy tuning or the single-file constraints.

**HN etiquette:** post Tuesday–Thursday, 08:00–10:00 ET. Don't ask for upvotes anywhere.
Reply to every substantive comment. Expect "why not a framework" and "is this AI-written"
— answer both plainly and without defensiveness.

---

## Beat 4 — X / Bluesky / Mastodon launch thread

Same thread on all three. On Mastodon, add alt text to every image and drop the hashtags
to `#gamedev #indiegame`. On Bluesky it'll do better than X.

**1/**
> *Deadhead* is the trade word for driving with no fare aboard.
>
> It's the thing that quietly kills a taxi fleet's margin.
>
> So I made a game about it. Free, in your browser, no install.
>
> 🧵
>
> [console-wide-day.jpg]

**2/**
> You start with $800.
>
> The cheapest car in the catalogue is $30,000.
>
> That's not a difficulty spike. That's the lesson.
>
> [og-card-dayone.png]

**3/**
> Buying is out. Financing wants $4,500 down. So you rent.
>
> And you can afford two, back to back.
>
> A Cab needs $389. A Saloon needs $462. A second Cab needs $703, because the
> first one's burn now counts against you.
>
> A third needs $1,017. That one you earn.

**4/**
> Then: your cars only earn while you're clocked on. You're the remote operator.
>
> Clock off and they park — and still owe their fixed cost at midnight.
>
> The cheapest car in the game owes $82 a day before it turns a wheel.
>
> [explainer-midnight-bill.png]

**5/**
> Every ride offer gives you three numbers.
>
> What the meter says.
> What you keep after commission.
> How far you drive empty to reach the passenger.
>
> Only the third one decides whether you made money.
>
> [explainer-deadhead-miles.png]

**6/**
> The numbers are real.
>
> Six trims on the real spec ladder: real packs, real range, real running costs.
> Six real Robotaxi geofences.
> Real charging sites — stall counts, peak kW, actual coordinates.
> A 72 kW site charges slowly because it genuinely does.

**7/**
> Six real utilities too: Austin Energy, Oncor, FPL, TECO, OUC, PG&E.
>
> Austin's evening peak is five hours. FPL's is nine. PG&E's off-peak price ties Dallas's
> *peak* and beats every other city's.
>
> "Charge at 4am" is a strategy in most cities and not even the cheap answer in one —
> and I didn't design that. The utilities did.
>
> [explainer-tariff-clock.png]

**8/**
> No install. No account. No download. No ads. No paywall, now or later.
>
> One HTML file, 826 KB. Save it and it runs offline.
>
> ▶ game.deadhead.workers.dev
>
> Paolo drove a cab for forty-one years before he got out, while getting out was still
> his idea. He'll walk you through day one, then go quiet.
>
> [console-wide-night.jpg]

**9/ — the closer. Post this one last, and only in the thread.**
> One more thing.
>
> Five cities teach you to run a fleet.
>
> The sixth gives you one car and puts you in it.
>
> [og-card-sf.png]

**10/**
> San Francisco's real service runs with a safety driver in the seat. So the fleet cap is
> 1 — you can't be in two seats at once — and the speed control locks at 1×, because you
> can't fast-forward through a job you're physically sitting in.
>
> Axiom pays $250 for every day you actually clock on.
>
> Against a $38,000 goal, in PG&E territory, that is not generous.
>
> [explainer-sf-soloseat.png]

**Recurring posts after launch** (one every 2–3 days, never a thread):

- A single screenshot of a genuinely bad day's books with the caption `Net today: −$1.31`
- One city's tariff clock with one sentence of context
- A short clip of the take-control dodge minigame
- One line from Paolo, no context, no link
- "Someone finished Orlando" — screenshot of a leaderboard entry that isn't yours
- The SF speed control, greyed out, with the tooltip visible. One line: *you cannot
  fast-forward through a job you are physically sitting in.*
- The day-one garage at $800, with $30,000 and $4,500 both greyed out

---

## Beat 7 — the San Francisco reveal

A devlog, not a pitch. Post it 2–4 weeks after launch, to whichever room engaged most,
and lead with the constraint rather than the city.

**Reddit title:**
> The last city in my fleet sim sets the fleet cap to 1, and I think it's the best thing in it

**Body:**

> Five cities of Deadhead teach you to run a fleet — buy, rent, finance, schedule shifts,
> chase the tariff. The sixth is San Francisco, and it takes the fleet away.
>
> The real Bay Area service runs with a safety driver in the seat. I'd had SF filed as
> "blocked" for weeks because I read that as needing a payroll system I hadn't built. Then
> I read it literally instead: the supervisor isn't an employee, it's you. And you can't
> be in two seats at once.
>
> So `fleetCap` is 1. Not "SF's fleet is small" — SF has no fleet, it has one car, because
> it has one of you. The speed control locks at 1× for the same reason: you can't
> fast-forward through a job you're physically sitting in, and that's the one thing that
> changes about how every *other* city plays, in hindsight.
>
> Axiom pays $250 for each day you actually clock on. Against a $38,000 goal it's an
> offset, not a way out — especially on PG&E, where peak is 62c/kWh and *off-peak* is 31c.
> SF's off-peak price ties Dallas's peak and beats every other city's. "Charge at 4am", the
> answer that worked in five straight cities, stops being an answer.
>
> None of that is balance tuning. The CPUC has said on the record that the operator isn't
> operating an autonomous vehicle service in California — it holds a charter-party permit,
> the same class a limousine company holds. I didn't invent a hostile regulator. I
> reported one.
>
> ▶ https://game.deadhead.workers.dev/

**The single-image version, for X/Bluesky:**
> Five cities teach you to run a fleet.
>
> The sixth gives you one car and puts you in it.
>
> [og-card-sf.png]

---

## Beat 2 — itch.io page

**Title:** Deadhead
**Tagline:** A robotaxi fleet simulator where you never touch a steering wheel
**Classification:** Game · Simulation · HTML5 (playable in browser)
**Tags:** `management`, `simulation`, `economy`, `tycoon`, `singleplayer`, `html5`,
`incremental`, `text-based`, `no-install`, `free`
**Pricing:** Free, donations enabled (point at Ko-fi in the description too)

**Short description (max ~200 chars):**
> Start with $800 — enough to rent two cars, back to back. Six real robotaxi cities, real
> electricity tariffs. Your cars bill you at midnight whether they moved or not.

**Long description:** reuse the README top-to-"Real data" section verbatim — **after you
update it.** The README still says $7,500, and it gives San Francisco a fleet cap of 12
with no mention of soloSeat.

**Assets needed:** cover 630×500, banner 1920×620, six screenshots (the four console
shots, the reshot day-one garage, and one from San Francisco).

**Embed:** itch supports HTML5 uploads — but you're better off setting the page to link
out to `game.deadhead.workers.dev` so the cloud saves and leaderboard work against a
single origin. Note this on the page in one line so it doesn't read as broken.

---

## Beat 0 — Landing page

`docs/index.html` already exists. Before the launch beats it needs:

```html
<meta property="og:title" content="Deadhead — a robotaxi fleet simulator">
<meta property="og:description" content="Six cars. Six real cities. One very honest spreadsheet. Free in your browser.">
<meta property="og:image" content="https://deadhead.example/og-card-main.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="https://game.deadhead.workers.dev/">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Deadhead — a robotaxi fleet simulator">
<meta name="twitter:description" content="Six cars. Six real cities. One very honest spreadsheet. Free in your browser.">
<meta name="twitter:image" content="https://deadhead.example/og-card-main.png">
```

Above the fold, in order: wordmark, the 12-word line, the **Play** button, the wide
console screenshot. Nothing else. The trilemma table is the first scroll, the real-data
list is the second, Paolo is the third, Ko-fi is last.

Do not put an email capture on it. It isn't a goal, and it costs you the "no account,
no catch" line — which is worth more.

---

## Places worth a post that aren't on the main plan

- **r/gamedev** — a "what I learned" post about single-file constraints, 2–3 weeks after launch
- **r/EVs, r/electricvehicles** — the tariff angle, framed as EV economics rather than gaming
- **Lobste.rs** — only if the Show HN goes well, and only under `games` + `javascript`
- **Hacker Newsletter / TLDR** — they pick up Show HN posts that did well; no action needed
- **itch.io devlogs** — free discoverability, one per city release
- **r/CityBuilders, r/ManagementGames** — smaller, friendlier, good for beat 5

## Places to skip

- Product Hunt — wrong audience entirely for a free game
- Discord servers you're not already in — reads as spam and burns goodwill
- Paid anything — you have no monetisation, so there's no budget that makes sense
- Press outreach — you deliberately didn't pick it, and it's the lowest-yield channel
  for a free browser game without a hook a journalist can build a story on
