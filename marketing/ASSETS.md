# Deadhead — Marketing Assets

Everything in `marketing/img/` exists as both `.svg` (source, editable) and `.png`
(export). All of it uses the game's own palette and Inter, so assets sit next to
screenshots without looking bolted on.

*v3 · regenerated 2026-07-27 against live build 0.39.5 (tree 0.40.0). Every figure was
read out of `deadhead.html`, not off a screenshot and not off the README. Screenshots are
fresh captures from the live 0.39.5 build.*

**The set is light-theme by default.** Every card, explainer and mockup uses the day
palette; the only dark surfaces left are the logo tile, the phone inset on the main OG card
and `mockup-laptop-night.png` / `console-wide-night.jpg`, which exist to show the theme
switcher exists.

---

## Logo & identity

| file | size | use |
|---|---|---|
| `logo-mark.png` | 512×512 | app icon, avatar, Ko-fi, itch icon |
| `logo-mark-1024.png` | 1024×1024 | anywhere that wants a large icon |
| `favicon-256.png` | 256×256 | favicon source (downscale to 32/16 as needed) |
| `logo-wordmark-light.png` | 880×290 | light backgrounds, docs, README header |
| `logo-wordmark-dark.png` | 880×290 | dark backgrounds, night-mode pages |

**The mark** is the game in one glyph: a dotted leg (the deadhead — nobody pays for it),
a pickup node, then a solid blue leg to the drop-off. It's the same idea the whole
product is built on, and it survives being 32 px.

## Social / OG cards — 1200×630

| file | lead | best for |
|---|---|---|
| `og-card-main.png` | "Six cars. Six real cities. One very honest spreadsheet." | **the default.** Put this in the meta tags. **Stale as of 2026-07-30 — the catalogue was trimmed from nine trims to six; source text in `og.py` is fixed but the PNG itself still reads "Nine cars" until re-rendered (needs Inter installed in the render environment; not available in this sandbox).** |
| `og-card-numbers.png` | "The numbers are real. That is the difficulty setting." | HN, r/gamedev, anywhere the audience respects sourcing |
| `og-card-dayone.png` | "$800 and no car." Buy and finance greyed out, rent as the only door | Reddit thumbnails, the sim subreddits, X post 2 |
| `og-card-sf.png` | "Five cities teach you to run a fleet. The sixth gives you one car and puts you in it." | **the closer.** Hold it back for the SF reveal beat, not the launch. |

`og-card-trilemma.png` was **deleted** — the three-way buy/finance/rent choice it showed
stopped being true once renting became the only affordable door. `og-card-dayone.png`
replaces it.

## Device mockups

| file | size | use |
|---|---|---|
| `mockup-hero-duo.png` | 2000×1200 | **landing page hero.** Laptop + phone, wordmark, headline. |
| `mockup-laptop-day.png` | 1800×1150 | clean laptop shot, light theme |
| `mockup-laptop-night.png` | 1800×1150 | clean laptop shot, dark theme |
| `mockup-phone.png` | 900×1400 | "it works on a phone" proof, vertical posts |
| `mockup-garage-dayone.png` | 1800×1150 | the $800 garage in a laptop frame — the strongest single asset for the launch post |

## Explainer graphics — 1600×900

These are the shareable ones. Each teaches one mechanic with real in-game numbers and
needs no caption.

| file | teaches |
|---|---|
| `explainer-deadhead-miles.png` | why the third number on an offer is the only one that matters — a real Hitchr offer, 0.7 empty miles against 1.3 paid, $17.31 → $12.98 |
| `explainer-tariff-clock.png` | six cities, six real utilities, 24 hours each, colour-coded off-peak/shoulder/peak with the actual cent rates — now including PG&E, whose off-peak ties Dallas's peak |
| `explainer-midnight-bill.png` | six hours clocked on, twenty-four hours billed — with the Cab's real daily cost and Paolo's last message |
| `explainer-city-chain.png` | the six-city ladder: each gated on a finished shift, with permits, fleet caps and cash goals — and the parked-city billing sting |
| `explainer-sf-soloseat.png` | why San Francisco has a fleet cap of 1, a locked 1× clock, a $250 stipend, and no cheap hour to charge in |

## The annotated guide — on the site, not a file

`docs/index.html` has a **Guide** section built on `console.jpg`: twelve numbered markers
positioned over the live console, each with a hover tooltip and a matching card underneath.
The tooltip copy is read out of the card at runtime, so the two can never drift apart —
edit the card and the tooltip follows.

Marker coordinates are percentages of the 1568×729 image, so the whole thing scales. If you
**reshoot `console.jpg` the markers will need re-placing.** The quickest way to check them is
to composite circles onto the image at the same percentages and look at it:

```python
import re, subprocess
s = open("docs/index.html").read()
pos = re.findall(r'data-i="(\d+)"\s+style="left:([\d.]+)%;top:([\d.]+)%"', s)
W, H = 1568, 729
cmd = ["convert", "docs/img/console.jpg"]
for i, x, y in pos:
    px, py = round(float(x)/100*W), round(float(y)/100*H)
    cmd += ["-fill", "#3E6AE1", "-stroke", "white", "-strokewidth", "2",
            "-draw", f"circle {px},{py} {px+13},{py}",
            "-stroke", "none", "-fill", "white", "-pointsize", "15",
            "-annotate", f"+{px-(9 if len(i)>1 else 4)}+{py+5}", i]
subprocess.run(cmd + ["/tmp/marker-check.png"], check=True)
```

Rule of thumb from placing them the first time: **put the marker beside the number it
describes, never on top of it.** Four of the twelve had to be nudged because they were
hiding the exact figure their own caption quoted.

## Store assets

| file | size | use |
|---|---|---|
| `itch-banner.png` | 1920×620 | itch.io page banner |
| `itch-cover.png` | 630×500 | itch.io cover / thumbnail |

## Screenshots — `marketing/screens/`

Recaptured from the live **v0.39.5** build. The tab strip now shows all eight tabs — six
playable cities plus the locked Phoenix and Las Vegas — and every shot has cars on the map
and live offers on the board.

| file | note |
|---|---|
| `console-wide-day.jpg` | 1568×755, three-column ultrawide. **The best single shot you have.** |
| `console-wide-night.jpg` | 1568×688, same layout, night theme |
| `console-mobile-night.jpg` | 528×819, phone layout |
| `console-1499-day.jpg` | 1499×819 — captured the pre-2026-07-30 layout overlap bug (Send-to-charge button over Charge/Range). **Fixed since** — the tablet sidebar was rebuilt into a collapsible right column and the narrow-console `.t-chg` grid track was bounded (see `deadhead_iphone14pro_chargerow_2026_07`); this shot is now stale and should be recaptured before publishing anything at this width. |
| `garage-day-one.jpg` | garage catalogue, day one. **Reshot 2026-07-30** — the previous capture predated the 0.42.0 rebrand and still showed real Tesla model names/photos (Cybercab, Model 3, Model Y) and the old nine-trim, two-seat-Cab catalogue. Now shows the Axiom-badged, six-trim catalogue with the corrected four-seat Cab. (`garage-catalogue.png`, referenced in older notes, no longer exists — this file is its replacement.) |

---

## Regenerating

`marketing/src/` holds the Python that produced everything. To rebuild:

```bash
pip install cairosvg fonttools brotli --break-system-packages
# Inter must be installed as a system font for text to render correctly
cd marketing/src && python3 logo.py && python3 og.py && python3 mockups.py && python3 explain.py
```

Palette, fonts and helpers live in `common.py`; every colour is lifted from
`deadhead.html`, so changing the game's theme means changing one file here.

**Known trap:** the numbers in `og.py` and `explain.py` are hardcoded. This has now bitten
three times — once from a stale screenshot, once from a rebalance ($3,000 → $500 starting
cash and the arrival of `companyCash`), and again on 2026-07-28 ($500 → $800, to make a
second car reachable on day one). If the economy is retuned, these need re-reading. The
right fix is to parse `CFG`, `CATALOG` and `CITIES` out of `deadhead.html` at generate
time so the assets can never drift from the game again; that's maybe forty lines.

**What's hardcoded and where — all of `og.py`'s and `explain.py`'s $500 figures still
need updating to $800/$703/$1,017 before the next asset regeneration run:**

| value | files | source of truth |
|---|---|---|
| `$800` starting cash | `og.py` (dayone) | `CFG.startCash` |
| `$389` / `$462` / `$703` / `$1,017` rent floors | `og.py` (dayone), docs | `rentReq()` + `CATALOG` |
| `$30,000` / `$4,500` / `$75` Cab | `og.py`, `explain.py` | `CATALOG[0]` |
| `$82` Cab daily fixed | `explain.py` (midnight) | `CATALOG[0].fixed` |
| six cities' tariffs, caps, goals | `explain.py` (`CITIES`, `CHAIN`) | `CITIES` |
| `$250` SF stipend, `1×`, cap 1 | `og.py` (sf), `explain.py` (sf) | `CFG.soloStipend`, `CITIES.sf` |

## Still to make, if you want them

- **A short clip.** The dodge minigame, 6–8 seconds, silent, looping. It's the only
  moving thing in the product and none of these assets convey it.
- **Per-city cards.** One 1200×630 for each of the six, using each city's tone colour
  (they're in `CITIES[x].tone`). Good for spacing out posts after launch.
- **An "$800 to $38,000" progression graphic.** Now that the bank is shared across all six
  cities, the arc is one continuous number for the first time. That's a chart.
- **The break-even chart.** Rent vs finance, cumulative cost over days, with the crossover
  marked. It would be the sharpest graphic in the set, but the rent-at-signing change
  means the model needs checking before it can be drawn honestly.
