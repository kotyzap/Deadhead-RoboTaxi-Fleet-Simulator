# Paolo — full dialogue export (v0.40.0)

Every line of Paolo's voice in the game, pulled straight from source. Grouped by how it's
delivered, since that affects what "adding a photo" would even mean for each group.

Legend: **spot** = the UI element the card points its spotlight ring at (a natural place to also
anchor an image, if we go that way).

---

## A. Guided Day-1 tutorial (14 scripted beats, `RAY` array)

Shown only on a player's very first city, in this fixed order (day 1 forces the sequence rather
than waiting on chance). Every later city skips straight to "contextual advice" (group C).

**1.** *(spot: `gar-cards` — vehicle chooser)*
> Welcome to Deadhead Robotaxi Fleet Ops. My name is Paolo Cortez. Forty-one years in a cab
> before I got out, while getting out was still my idea. You're {NAME}, I'm told.
>
> Seven and a half thousand dollars and no car. You can't buy one outright on that, so you'll
> rent or you'll put money down. Rent costs nothing today and the most every day after.

**2.** *(spot: `tb-cash-box` — cash readout)*
> Whatever you pick, 82 a day is the floor — before rent, before finance, before a wheel turns.
>
> Do the arithmetic before you sign, not after.

**3.** *(spot: `panel-platforms`)*
> The car can't earn until somebody's sending it rides. Two apps will. Neither one is your
> friend.

**4.** *(spot: `panel-offers`)*
> Three numbers on every offer. What's on the meter, what you actually get paid, and how far you
> drive empty to reach them.
>
> Watch the third one.

**5.** *(spot: `panel-offers`)*
> Forty-five seconds to decide. That's not them being generous. That's them stopping you doing
> the arithmetic.
>
> Do it anyway.

**6.** *(spot: `panel-books`)*
> Ten eighty on the meter, eight ten in your pocket. That's the deal. It doesn't improve.

**7.** *(spot: `map`)*
> Watch that. Six minutes, nobody paying, and you'll do it a dozen times today.
>
> We called it deadheading. Killed more cabbies than bad drivers did.

**8.** *(spot: `fare-val`)*
> Surge means everyone's stranded at once. Take it.
>
> Raise your own multiplier too — but not past about 1.15, or they'll route around you.

**9.** *(spot: `seg` — speed control)*
> Most of this job is sitting. I did thirty-one years of sitting.
>
> Wind it to 20x when nothing's moving — just don't get clever and speed through a peak. And 1x
> is there if you ever want to feel what I felt.

**10.** *(spot: `panel-rapid` — charging)*
> Twenty minutes on a charger, forty if you bought big. Yours, not the car's.
>
> Do it at four in the morning when power's cheap and nobody's going anywhere. Not at six in the
> evening.

**11.** *(spot: `panel-incidents`)*
> Somebody's got it wedged. In a big outfit there's a room full of people watching for that.
>
> Right now the room is you, and you're free. Remember that.

**12.** *(spot: `rp-body` — shift report)*
> Read the whole thing, not just the bottom line. Cost per mile tells you how hard the car
> worked. It isn't what you're paid.
>
> Don't chase it.

**13.** *(spot: `panel-platforms`)*
> They're scoring you. Two bad weeks and they switch you off — and the 82 a day doesn't switch
> off with you.
>
> Run both apps.

**14.** *(spot: `rp-body`)* — the thesis of the game
> You worked six hours. The car was billed for twenty-four.
>
> Your margin was you, sitting there for free. And there's only one of you.
>
> A second car doesn't fix that. A second pair of eyes does.

---

## B. One-shot contextual cards (fire once, on a specific trigger, any day)

**First decline** *(spot: `panel-offers`)* — first time the player presses Decline
> That one stung a little, huh.
>
> Good — it should. But say yes to everything and you've got no car free the second three
> requests land at once. Declining right is how you keep enough in reserve for what's coming.
> That's not losing a fare. That's running a fleet instead of chasing pings.

**Take Control briefing** *(spot: `map-wrap`)* — first time a car is blocked and the dodge
mini-game is offered
> Somebody's wedged in front of {carId}. Normally you wait and the operator sorts it.
>
> Or you drive it out yourself. The white car is yours, the red ones are coming the other way —
> stay out of their lane for eight seconds and the car's free. Hit something and you have lost
> nothing except the eight seconds.

**City unlocked** *(spot: `citytabs`)* — new, just added this session; fires once per city the
instant its gate is met
> **{City} just opened up.** Brave enough to run it?
>
> One bank account behind every city, not five — whatever {City} costs comes out of what you
> already have. Nothing you are running now stops while you are there; it just stops earning.

**Coffee ask** *(anchored under the Coffee button, not a spotlight)* — only when the player
clicks the Coffee button themselves
> Forty-one years driving and nobody bought me a coffee for the advice. This one's not for me,
> mind.
>
> Pavel built this and won't ask you himself, so I will. It stays free either way — say no and
> I'll drop it.

---

## C. Unprompted advice (`nextTask()` — fires when nothing has happened for 75 real seconds,
first match wins, never repeats the same one back-to-back)

**No car** *(spot: `gar-cards`)*
> Now: Choose a vehicle.
> Why: Seven and a half thousand dollars and no car. You can't buy one outright on that, so
> you'll rent or you'll put money down.

**No platform** *(spot: `panel-platforms`)*
> Now: Connect a platform.
> Why: The car can't earn until somebody's sending it rides. Neither app is your friend, but you
> need at least one of them.

**Not clocked on** *(spot: `panel-fleet`)*
> Now: Clock on.
> Why: It earns while you're watching it and not a minute otherwise — and it owes the fixed cost
> either way. That's the whole trick of this job.

**Car blocked** *(spot: `panel-incidents`)*
> Now: {car} is blocked — take control, or wait for the operator.
> Why: Somebody's got it wedged. In a big outfit there's a room full of people watching for that.
> Right now the room is you.

**Low charge** *(spot: `panel-rapid`)*
> Now: {car} is down to {%} — send it to a charger.
> Why: Do it when power is cheap, not at six in the evening. It is {price}/kWh right now.

**Offer waiting** *(spot: `panel-offers`)*
> Now: An offer is waiting — read it, then take it. / N offers waiting — take the best one.
> Why: Three numbers on every offer: what the meter says, what you actually get paid, and how far
> you drive empty to reach them. Watch the third.

**Demand is thin, zones closed** *(spot: `panel-offers`)*
> Now: Quiet — only X of Y zones are live. Open more of the map.
> Why: About {rate} offers an hour at this time of day, so roughly one every {mins} minutes.
> Every zone you switch on is more of the city allowed to call you — and the curve matters as
> much as the count. Nobody is going out at six in the morning from a bar district.

**Second platform not connected** *(spot: `panel-platforms`)*
> Now: Quiet feed — connect {platform} as well.
> Why: Two feeds mean less sitting, because whichever offer lands first wins. Your acceptance
> rate gets thinner on both, and they notice.

**Long shift** *(spot: `panel-books`)*
> Now: You have worked {h} h — clock off.
> Why: Most of this job is sitting. Knowing when to stop is the part nobody teaches you.

**A new city is open, never run** *(spot: `citytabs`)*
> Now: {City} is open — you have not run it yet.
> Why: One bank account behind every city, not five — whatever {City} costs comes out of what
> you have everywhere else. And a fleet you leave parked does not stop owing rent just because
> you stopped watching it: real days, not game days, and {N} of them unpaid and the car goes back
> to whoever it was rented or financed from.

**Nothing needs attention** *(spot: `panel-books`)*
> Now: Nothing needs you. Watch the cost per mile.
> Why: Cost per mile tells you how hard the car worked. It isn't what you're paid. Don't chase
> it.

---

## D. Log-feed lines (appear in the activity log as "Paolo", not a bubble card)

**First time switching to 1x speed** *(session-only, repeats across sessions on purpose)*
> real time. Thirty-one years I drove at that speed and nobody ever offered me a 4× button. The
> waiting is most of the job — and it is the part nobody pays for.

**First achievement of the player's life, ever** *(once, permanently)*
> you picked something up — the trophy on the app bar keeps them, and the city boards.

**First time entering a soloSeat city (currently only SF)** *(once per city, permanently)*
> This one is yours alone — one car, and you are in it. Tesla pays $250 for every day you
> actually clock on, on top of whatever the meter makes. And the clock cannot run ahead of you
> the way it does everywhere else — you cannot fast-forward through a job you are physically
> sitting in.

**Leaderboard callout at shift end** *(if the city has a live board)*
> best in {City} — 1. player $net  ·  2. player $net  ·  3. player $net
>
> …plus, if the signed-in player is on the list: "that top one is you. Enjoy it while it lasts."
> (rank 1) or "you are N on that list." (any other rank)

---

## Tally

- 14 scripted tutorial beats
- 4 one-shot contextual cards
- 10 unprompted-advice variants (dynamic, share one delivery mechanism)
- 4 log-feed lines (one of them templated per-city)

**36 distinct pieces of copy**, all in one voice, all written by the same hand — worth keeping
in mind before adding images: some of these (the tutorial 14, the one-shot cards) already anchor
to a specific UI element via `spot`, which is a natural place to also anchor a photo. The
log-feed ones (group D) have no spotlight mechanism at all right now — that would need new UI if
we wanted to attach an image to those.
