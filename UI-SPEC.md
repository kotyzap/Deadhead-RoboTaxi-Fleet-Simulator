# Deadhead — UI specification

The in-car console spec for **Deadhead: Robotaxi Fleet Simulator** (short form:
*Deadhead*). Derived from the real in-vehicle interface, not the marketing website.

- **Companion to:** `DESIGN.md` (game design), `InCarDesignLanguage.md` (visual reference)
- **Date:** 2026-07-25

---

> **Revision 2 — 2026-07-25.** Rewritten against screenshots of the real Model S
> v7/v8 portrait console. Revision 1 was written against the Saloon/Y landscape UI and
> got several things wrong; corrections are marked **[R2]** throughout. Implemented and
> verified in `shell.html`.

---

## 0a. Architecture: two visual registers

The console is **not** the whole game. It is one panel inside a fleet-management
desktop — the *"Robotaxi IRL"* view. This is better fiction than a fully diegetic car
screen: you are at a desk, and the console is your live remote window into the fleet,
which is exactly what a real teleoperator sees.

| Register | Where | Treatment |
|---|---|---|
| **Console** | Centre panel | Flat, opaque, authentic. Black chrome, white app cards. **No glass, ever.** |
| **Management** | Everything else | Frosted glass. Blur 16px, saturate 1.15, ~72% opacity, 1px hairline, no drop shadow. |

The separation must stay legible: the console reads as *a screen you are looking at*,
the glass as *your software*. Glass bleeding into the console destroys the effect.

Glass needs something to frost against, so a **dimmed, desaturated live map fills the
whole canvas behind everything** (`#bgmap`, non-interactive, ~55% opacity in day / 40%
in night). This also quietly restores the "map is always present" idea that Revision 1
over-claimed.

---

## 0b. Responsive tiers **[R2]**

The game must run on a 49" ultrawide *and* on Full HD.

**The wings are fixed width; the console takes every remaining pixel.** This is the
opposite of the obvious arrangement, and it is the right one — the fleet view is the point
of the game, so extra screen must go to the map, not to padding around the side panels.
Wings sit at 440–520px, which is the width at which the roster table, the operator rows,
and the cost breakdown all read comfortably. Wider adds nothing.

**Wings never split two-up.** Tried at ultrawide; it squeezed each panel to ~255px and
`Downtown` collided with `$14.20` in the ride queue. Always one column of three stacked
panels. Consequently panel density is tuned once, globally, for a ~470px panel — there is
no wide-panel variant to maintain.

| Tier | Width | Wing | Console | Map |
|---|---|---|---|---|
| T1 | ≥3000 | 520px | 2760px | 2344 × 733 |
| T2 | 2200–2999 | 500px | 1520px | 1104 × 733 |
| T3 | 1500–2199 | 472px | 944px | 928 × 565 |
| T3b | ≤1699 | 440px | 621–688px | 605 × 454 |
| T4 | <1500 | full | full, console first | 994 × 673 |

Vertical also compresses under 900px height. The portrait console gets *more* authentic as
it narrows — 480 × 832 is close to the real screen's 1:1.6.

### The card is a container query, not a media query **[R2]**

Past **980px of console width** the portrait card stack breaks down: the map becomes a
letterbox strip above a very wide info block. So `.console` is a `container-type:
inline-size` and the card flips to **large map + 340–400px right rail**, which is how the
real landscape in-car UI is arranged. This keys off the console's own width, so it stays
correct regardless of viewport or wing width.

The rail holds selected vehicle → status → the three-metric row → **live activity feed**
(flex-fills, scrolls) → CTA pinned to the bottom. The feed exists because without it the
rail had a 250px void at ultrawide. It is hidden while the card is portrait.

At ultrawide the bottom control bar also needs **fixed track widths plus
`justify-content: center`** — with a `1fr` middle column, five controls smear across
2760px and look abandoned.

Below 2560px the densest panel (Books) exceeds its box by ~60px and scrolls internally.
Intended: `scrollbar-gutter: stable` keeps a persistent thin scrollbar so continued
content is always signalled.

---

## 0c. Offline robustness **[R2]**

Two failures found by testing, both fixed, both mandatory going forward:

1. **Icons must be an inline SVG sprite, never a webfont.** With Material Symbols the
   page rendered raw ligature text — `directions_car`, `near_me` — printed literally
   across the UI whenever the font didn't load. A local game file cannot depend on a CDN
   for its icons. 28 symbols are inlined in `shell.html`.
2. **A CDN failure must not take down the page.** All UI wiring is bound *before* any map
   code runs, and Leaflet is behind a `typeof L === 'undefined'` guard that degrades to a
   labelled placeholder. Previously one failed script killed the theme switcher and every
   control.

Only Leaflet, its CSS, OSM tiles, and Inter remain external. All degrade gracefully.

---

## 0. Relationship to InCarDesignLanguage.md

`InCarDesignLanguage.md` documents a **marketing showroom** pattern. It is white,
photography-led, sets body text at 14px, and states outright that semantic status
colours do not exist in the system.

Deadhead is not a showroom. It is a **dense operational console on a 15-inch screen
viewed at arm's length**, and it must communicate the state of thirty vehicles at a
glance. Following that document literally would produce an unreadable game.

**Inherited unchanged:**

- Colour anchors: Electric Blue `#3E6AE1`, Carbon Dark `#171A20`, Graphite `#393C41`, Pewter `#5C5E62`, Light Ash `#F4F4F4`, Cloud Gray `#EEEEEE`
- **Zero box-shadows.** Depth comes from layering and opacity, never shadow
- **No gradients**, no patterns, no glows, no decorative backgrounds
- **Two font weights only** — 400 and 500. No bold, no light
- 4px radius on controls; ~12px on larger surfaces
- 0.33s as the signature transition duration
- One accent colour for primary action — never decorative
- Whitespace as a luxury signal; at most two action buttons per view

**Deliberately overridden, with reasons:**

| Overridden | Why |
|---|---|
| **"No uppercase transforms"** **[R2]** | Wrong. Small uppercase labels are *core* to the real console — `MY CAR`, `PAYMENT METHOD`, `CONTROLS`, `FRONT`, `REAR`, and every app label. Use 10–11px uppercase with `.09em` tracking for all field labels. Sentence case remains for values and prose |
| **"One accent colour"** **[R2]** | Wrong. Each app has **its own colour when active** — Music orange, Nav red, Apps green — against blue for CTAs and progress. Green also means "on" in the climate bar. Four accents, assigned by app identity, not decoration |
| Black chrome canvas | The console is black chrome with **white app cards** — not a dark canvas throughout. Management glass themes light/dark independently; console chrome does not theme at all |
| 14px body text | Too small at arm's length. Base 17px in the spec, but the 1080px vertical budget forces **13–14px in practice** — see §5 |
| "No semantic colours" | A fleet console cannot work without state colour. Four states added, tightly rationed — see §4.3 |
| Photography carries the emotion | There is no product photography here. The **map** carries it — see §2 |
| 0.33s on everything | Correct for panel transitions, sluggish for controls clicked hundreds of times per session — see §7 |

---

## 1. Authenticity and legal boundaries

These rules carry more legal weight than the title does. A console styled after a real
in-car interface *combined with* a robotaxi title is what could imply affiliation —
either element alone is unremarkable. Do not relax this section.

The look is *inspired by* the general idiom of an in-car interface. It must contain **no
manufacturer's intellectual property** — and as of 0.42.0 it contains none:

- No manufacturer wordmark, badge, or press photography of any kind
- No real model names, no real charging-network name, no driver-assistance product name
- No commercially licensed typeface (Inter is the shipped face, open-licensed)
- The marque is **Axiom** and every vehicle name is a category noun: Cab, Saloon,
  Crossover, and the trims of each. See `DESIGN.md` §9.2
- The charging network is **Rapid**
- Rival operators are **Meridian** and **Halo**, both fictional
- Car art is five original SVG bodies (`CARART`), drawn here, owned by us

What layout conventions, a blue accent, flat surfaces and rounded rectangles are: not
protectable. What names, logos, typefaces and photographs are: protectable. The line
between those two sentences is the whole of this section.

Layout conventions, a blue accent, flat surfaces, and rounded rectangles are not
protectable. Names, logos, and typefaces are. The line sits there.

---

## 2. Console structure: a stack of opaque cards **[R2]**

Revision 1 claimed the map is the persistent background of the console. **That was
overstated.** The screenshots show apps as a **stack of opaque cards**, each with its own
title bar — hamburger, app icon, app name, a secondary label, expand affordance — and the
map lives *inside* the Nav card. Map-as-background is true of fullscreen navigation, not
of the card stack.

The always-visible-fleet goal is still met, just at a different level: the **dimmed
canvas map behind the glass** (§0a) keeps the city present at all times, and the console's
map card is the interactive one.

```
┌─────────────────────────────────────────────────────────┐
│  STATUS BAR — opaque scrim, always readable             │  56px
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│   CAR    │        MAP — PERSISTENT BACKGROUND           │
│   RAIL   │        Leaflet + OSM, always live            │
│          │                                              │
│  260px   │   ┌──────────────────────────┐               │
│          │   │  APP WINDOW              │               │
│  selected│   │  floats over the map,    │               │
│  car +   │   │  never reaches the top   │               │
│  fleet   │   │  edge of the screen      │               │
│  list    │   └──────────────────────────┘               │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│  DOCK — app icons with labels        │  pricing quick-set│  72px
└─────────────────────────────────────────────────────────┘
```

### Region → system mapping

| Region | Contents |
|---|---|
| **Status bar** | City, day counter, clock, cash balance, time controls (pause / 1x / 2x / 4x), alert count |
| **Car rail** | Selected vehicle card (battery, range, tire wear, cleanliness, state, today's earnings) above a scrollable fleet list with state dots |
| **Map** | Live car positions, demand heat by zone, geofence overlay, Rapid charger pins, trip lines |
| **App windows** | Fleet, Books, Charging, Market, Permits, Incidents |
| **Dock** | Six app icons **with text labels** — never icon-only |
| **Quick-set** | Fare multiplier and cars-per-operator ratio, in the slot where climate controls live |

---

## 3. Three flaws in the real UI that we fix

Nielsen Norman Group's teardown of the in-car interface names real usability failures.
Deadhead should look authentic while being *better*, because ours is a game played for
hours, not a dashboard glanced at while driving.

1. **The status bar bleeds into the map and becomes unreadable.** We give it an opaque
   scrim. Never transparent over map tiles.
2. **Touch targets shrank below the 1cm minimum, causing mis-taps** — the seat warmer
   fires when you meant to change temperature. We hold a hard **44px minimum, 48px
   preferred**, and never place two destructive controls adjacent.
3. **Icon-only controls forced constant visual confirmation.** NN/g explicitly praised
   the media-player tabs for pairing icon *with* label. Every dock item and every
   primary control in Deadhead carries a text label.

### One mechanic worth stealing outright

The real map displays **projected battery charge remaining on arrival at the
destination.** That single number is the entire charging dilemma made legible. In
Deadhead, selecting any pending ride shows arrival state-of-charge, and it turns amber
below 20% and red below 10%. That is the charging decision UI — nothing more is needed.

---

## 4. Colour

Light theme is the default (per project convention); dark is the switcher. Both are
authentic — the real interface ships both and auto-switches with the headlights. In
Deadhead the toggle reads **Day / Night**, and Night is also the mood for a 3am shift.

### 4.1 Surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#FFFFFF` | `#171A20` | Page beneath everything |
| `--surface-1` | `#F4F4F4` | `#1F2329` | Rails, dock, inset panels |
| `--surface-2` | `#FFFFFF` | `#272C33` | App windows, cards |
| `--surface-3` | `#FFFFFF` | `#2E343C` | Menus, popovers |
| `--scrim` | `rgba(255,255,255,0.92)` | `rgba(23,26,32,0.92)` | Status bar over map |
| `--overlay` | `rgba(128,128,128,0.65)` | `rgba(0,0,0,0.65)` | Modal backdrop |

Dark surfaces step *up* in lightness with elevation. Light surfaces step *down* — pure
white sits above Light Ash. Never distinguish elevation with a shadow.

### 4.2 Text and borders

| Token | Light | Dark |
|---|---|---|
| `--text-primary` | `#171A20` | `#FFFFFF` |
| `--text-secondary` | `#393C41` | `#C4C7CC` |
| `--text-tertiary` | `#5C5E62` | `#9498A0` |
| `--text-muted` | `#8E8E8E` | `#6E727A` |
| `--border` | `#EEEEEE` | `#33383F` |
| `--border-strong` | `#D0D1D2` | `#454B54` |

### 4.3 Semantic vehicle states — the necessary extension

The marketing system has no status colours. A console tracking thirty vehicles must.
Rationed to four, plus neutral:

| State | Token | Light | Dark | Meaning |
|---|---|---|---|---|
| Idle / available | `--state-idle` | `#8E8E8E` | `#6E727A` | Parked, earning nothing. **Deliberately colourless** — most cars, most of the time, so colour here would be noise |
| On trip / earning | `--state-active` | `#3E6AE1` | `#5A82EB` | The accent. Blue means money moving |
| Charging | `--state-charge` | `#1F8A4C` | `#34C77B` | Off the road by choice |
| Needs attention | `--state-attention` | `#B87503` | `#F5B92E` | Blocked, soiled — an operator is required |
| Critical | `--state-critical` | `#C0392B` | `#E5564B` | Collision, impound, permit action |

That colourless idle state is a design decision, not an omission: a fleet screen where
the normal case is grey means **any colour on the rail is information.** The eye goes
straight to the amber dot.

### 4.4 Action colour

`--accent: #3E6AE1` (light) / `#5A82EB` (dark). One primary button per view. Never
decorative. Note the deliberate overload with `--state-active`: in Deadhead, blue
consistently means *active and earning*, whether that's a car or a button.

---

## 5. Typography

**Universal Sans is commercially licensed and not available to us.** Substitute:

- **UI and body:** `Inter` — the closest freely licensed match for legibility at console sizes
- **Numerals:** Inter with `font-variant-numeric: tabular-nums` **everywhere a figure appears**. Non-tabular numerals in a money game make columns jitter as values tick
- **Stack:** `Inter, -apple-system, "Segoe UI", Arial, sans-serif`

### Scale

**[R2] Reality check.** The 17px base below is right for a fullscreen console. In the
three-column ops centre at 1080px height it does not fit — six panels of dense tabular
data plus the console share one 1080px vertical budget. Shipped values are **14px base at
T1/T2 and 13px at T3**, with field labels at 10–11px uppercase. A 49" panel at 3840×1080
is only ~81 PPI, so uppercase tracked labels stay legible at 10px in a way they would not
on a phone.

Treat the ramp below as *ratios*, not absolutes: labels ≈ 0.75× base, section titles
≈ 0.8× base uppercase, metrics ≈ 1.5×, display ≈ 2.4×.

| Role | Size | Weight | Line height | Use |
|---|---|---|---|---|
| Display | 34px | 500 | 1.15 | City name, day header, scenario title |
| Metric | 28px | 500 | 1.1 | Cash balance, daily P&L, cost per mile — tabular |
| Section | 20px | 500 | 1.25 | App window titles |
| Body | 17px | 400 | 1.45 | Default text |
| Body emphasis | 17px | 500 | 1.45 | Car IDs, labels, button text |
| Caption | 14px | 400 | 1.4 | Units, secondary labels, dock labels |
| Micro | 13px | 400 | 1.35 | Timestamps, footnotes. **Hard floor** |

Letter-spacing stays `normal` at every level — inherited, and correct. No text shadows,
no gradients on type, no uppercase.

---

## 6. Controls and spacing

- **Base unit 8px.** Spacing steps: 8 / 16 / 24 / 32 / 48
- **Touch targets: 44px minimum, 48px standard, 56px for dock items.** Non-negotiable
- **Buttons:** 4px radius, 48px height, 200px standard width. Primary = accent fill, white text. Secondary = surface fill, `--text-secondary`, 1px `--border-strong`
- **App windows:** 12px radius, `--surface-2`, 1px `--border`, no shadow, 24px internal padding
- **Cards in the rail:** 12px radius, `--surface-2`, 16px padding
- **State dots:** 10px circle, `border-radius: 50%`
- **Sliders** (fare multiplier, cars-per-operator): 4px track, 24px thumb — larger than web because these are the two most-touched controls in the game
- **Dividers:** 1px `--border`. Prefer spacing over lines; use a line only when spacing alone fails

Never separate cards with borders *and* spacing. Pick one — spacing first.

---

## 7. Motion

| Duration | Easing | Use |
|---|---|---|
| `--dur-fast: 0.15s` | `ease-out` | Hover, press, state dot changes, value ticks |
| `--dur-base: 0.33s` | `cubic-bezier(0.5, 0, 0, 0.75)` | App windows opening/closing, panel transitions, theme switch |
| `--dur-slow: 0.6s` | `ease-in-out` | Map pans, geofence redraws |

0.33s is inherited as the signature timing and kept for anything that reads as a
*transition*. Controls clicked hundreds of times per session get 0.15s — 0.33s on a
button press feels broken when you are pressing it constantly under time pressure.

**No scale or translate transforms on hover.** Colour and border changes only. Cars
moving on the map are the sole continuous animation on screen, and that exclusivity is
what makes them draw the eye.

---

## 7a. Two patterns taken from the real console **[R2]**

**The chevron-split CTA.** The real UI's `Request Valet ▸ $5/HR $15 MAX` button — a
primary action with a live secondary readout welded to its right edge, divided by a
right-pointing chevron. Ideal for Deadhead's primary actions, where every dispatch has a
price attached: `Dispatch to Rainey St ▸ 1.4× surge / 4 waiting`. Implemented with
`clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%)`
on the main half over a darker base.

*Its refusal sits beside it, not inside it.* As of 0.43.0 the CTA shares a `.t-cta-row`
with a square red Decline (`.t-dec`) — a bare white X, no word, because the CTA's own
label is already the longest string on the card. Rules that follow from that pairing:

- **The row owns the margin, the CTA owns only its height.** Two siblings each holding
  `margin:10px` inset themselves separately and sat unevenly in the card — once per
  breakpoint, since all five responsive tiers re-set that margin.
- **One custom property is the height authority; never infer a square.** `--cta-h` on the
  row is read by the CTA for its height and by Decline on both axes. The tiers move only
  that number. Squaring Decline with `aspect-ratio:1` off `align-items:stretch` was tried
  and rendered a ~310px button beside a 52px one — the ratio wants the item's cross size
  and the line's cross size wants the tallest item, so the browser resolves the width from
  available space and squares that instead.
- **Destructive controls go grey when disabled, not faded red.** A dimmed red still reads
  as armed.
- **A refusal names the same thing the acceptance does.** Both sort by net-of-commission
  fare and act on `[0]`. Two controls sitting on one seam must describe one decision.

**The three-column metric row.** The real `ETA / Travel / Distance` row: grey uppercase
label above a dark value, three equal cells with hairline dividers. Adopted unchanged for
`Arrival SoC / Fare / Drop-off`, which turns amber below 20% and red below 10%. No
redesign was needed — it is already the right pattern for fleet stats.

**Icon clusters take group labels, not per-icon captions.** The real climate bar labels
*clusters* (`FRONT` / `CLIMATE` / `REAR`), not individual icons. Per-icon captions do not
fit a portrait console at any tier — verified. One label under the cluster.

---

## 8. Component notes

**Status bar** — 56px, `--scrim` background, 1px bottom border. Left: city and day.
Centre: clock, then cash balance at Metric size, tabular. Right: time controls as a
segmented control (‖ 1x 2x 4x) and an alert badge. The scrim is mandatory: this is
exactly where the real UI fails.

**Car rail** — 260px. Selected car occupies the top ~40%: state pill, battery arc,
range, and today's earnings at Metric size. Below, the fleet list — one 48px row per
car with ID, state dot, state word, and battery percent. Rows are bordered, not
carded; thirty rounded cards would be visual mush.

**App window** — opens over the map, never touching the top edge. Section title at 20px
with a close affordance top-right. Max ~70% of the map area so cars stay visible around
it. One app open at a time in the prototype.

**Dock** — 72px, `--surface-1`. Six items, 56px targets, 24px icon over a 14px label.
Active item gets an accent underline, not a filled background.

**Quick-set** — bottom-right, in the climate slot. Two sliders with live tabular
readouts: fare multiplier (0.7x–1.6x) and cars per operator (1–8). The two most
consequential numbers in the game live where the driver would set the temperature.

---

## 9. CSS custom properties

Light is the `:root` default; dark applies under `[data-theme="night"]`.

```css
:root {
  --canvas:#FFFFFF; --surface-1:#F4F4F4; --surface-2:#FFFFFF; --surface-3:#FFFFFF;
  --scrim:rgba(255,255,255,0.92); --overlay:rgba(128,128,128,0.65);
  --text-primary:#171A20; --text-secondary:#393C41;
  --text-tertiary:#5C5E62; --text-muted:#8E8E8E;
  --border:#EEEEEE; --border-strong:#D0D1D2;
  --accent:#3E6AE1;
  --state-idle:#8E8E8E; --state-active:#3E6AE1; --state-charge:#1F8A4C;
  --state-attention:#B87503; --state-critical:#C0392B;

  --font:Inter,-apple-system,"Segoe UI",Arial,sans-serif;
  --radius-control:4px; --radius-surface:12px;
  --unit:8px; --target:48px;
  --dur-fast:0.15s; --dur-base:0.33s; --dur-slow:0.6s;
  --ease:cubic-bezier(0.5,0,0,0.75);
}

[data-theme="night"] {
  --canvas:#171A20; --surface-1:#1F2329; --surface-2:#272C33; --surface-3:#2E343C;
  --scrim:rgba(23,26,32,0.92); --overlay:rgba(0,0,0,0.65);
  --text-primary:#FFFFFF; --text-secondary:#C4C7CC;
  --text-tertiary:#9498A0; --text-muted:#6E727A;
  --border:#33383F; --border-strong:#454B54;
  --accent:#5A82EB;
  --state-idle:#6E727A; --state-active:#5A82EB; --state-charge:#34C77B;
  --state-attention:#F5B92E; --state-critical:#E5564B;
}
```

Map tiles need a night treatment too — either a dark OSM tile provider or a
`filter: invert(1) hue-rotate(180deg)` pass on the tile layer. The filter approach is
free and looks close enough; evaluate in the prototype.

---

## 10. Accessibility

- All body and caption text must clear **4.5:1** against its surface in both themes; check `--text-muted` and `--state-attention` first, they are the tightest
- **State is never colour alone.** Every state dot is accompanied by its state word in the rail, and by shape or label on the map. A colour-blind player must be able to run a fleet
- Full keyboard operation: tab order runs status bar → rail → map controls → dock
- Visible focus ring: 2px `--accent` outline at 2px offset. It may not be removed
- Reduced motion: honour `prefers-reduced-motion`. Cars jump between positions rather than tweening; transitions collapse to 0s

---

## 11. Open items

- Whether the fleet list needs virtual scrolling at 30 cars (probably not — measure)
- Night-mode map tiles: dark provider vs CSS filter
- Whether a second app window may be open simultaneously in the full game (the real UI allows it and NN/g praised it; deferred past the prototype)
- Icon set — needs a freely licensed family. Tabler or Lucide, outline only, to match the flat aesthetic

---

## Sources

- [Tesla's Touchscreen UI: A Case Study of Car-Dashboard User Interface — Nielsen Norman Group](https://www.nngroup.com/articles/tesla-big-touchscreen/)
- [Tesla infotainment review: Tesla UI touchscreen tech tested vs rivals — Auto Express](https://www.autoexpress.co.uk/best/car-infotainment-systems/tesla-ui)
- [First look at Tesla's new user interface — Electrek](https://electrek.co/2021/06/11/tesla-new-user-interface-first-look/)
- [Tesla's 'Robotaxi' trademark refused for being too generic](https://www.aol.com/teslas-robotaxi-trademark-refused-being-225006216.html)
- [Tesla hits trademark roadblock for 'Cybercab' — Electrek](https://electrek.co/2026/01/05/tesla-hits-trademark-roadblock-for-cab-due-squatter-incompetence/) — the source behind DESIGN.md §9.3's "radioactive" note. Citation titles are quoted as published; they are not game copy.
