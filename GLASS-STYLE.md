# Tinted glass — the management-layer visual system

Direction **1b** from the glass exploration, now the house style for everything in
`deadhead.html` that is *not* the in-car console screen. `Deadhead Glass.dc.html` in this
project is the reference mockup; this file is the rule.

The premise from `UI-SPEC.md` is unchanged: **two registers**. Management is glass. The
console screen is flat, opaque and authentic. What 1b changes is that the glass got
thinner and deeper, the section headers carry tone instead of a rule, and the boundary
between the registers is now an explicit glass **bezel** rather than a hard edge.

---

## Tokens

All of it hangs off custom properties in `:root` (and their `html[data-theme="night"]`
overrides). Never hardcode a blur, a shadow or a panel background — add or read a token.

| Token | Day | What it is |
|---|---|---|
| `--glass` | `rgba(255,255,255,.40)` | panel fill. Thin on purpose; the blur does the work |
| `--glass-brd` | `rgba(255,255,255,.55)` | the bright 1px edge |
| `--blur` / `--sat` | `34px` / `1.8` | the frost. Night goes `40px` / `1.4` |
| `--elev` / `--elev-hi` | `0 20px 44px -20px …` | resting / hover elevation |
| `--hi` | 1px top highlight + 1px inner glow | what makes it read as glass and not as paint |
| `--hi-1` | top highlight only | for small raised fills |
| `--inset` | `rgba(255,255,255,.44)` | a fill that sits **on** glass (metrics, chips, ghost buttons) |
| `--inset-2` | `rgba(23,26,32,.07)` | a track or rule cut **into** glass (bars, table rules) |
| `--overlay` | `rgba(23,26,32,.34)` | modal scrim, blurred 6px |
| `--tone` | `.13` | header tone strength |
| `--tone-rgb` / `--tone-txt` | neutral | header tone hue and its heading colour |
| `--r-srf` / `--r-ctl` | `14px` / `6px` | surface / control radius |

Two directions of light, and they are not interchangeable: `--inset` is *raised*,
`--inset-2` is *recessed*. A progress track is never `--inset`.

## Panels

```html
<section class="panel" data-tone="blue"> … </section>
```

`.panel` is glass + `--elev` + `--hi`, and lifts 2px on hover. Nothing else needs writing.

## Section headers — the tone band

The header no longer has a bottom divider. Instead it carries a top-down wash of its own
semantic hue, fading to nothing:

```css
background:linear-gradient(180deg,rgba(var(--tone-rgb),var(--tone)),rgba(var(--tone-rgb),0))
```

Type is 10px / 600 / `.14em` uppercase in `--tone-txt`. The icon takes the same colour.

Tone is set with one attribute on the panel, and there are only four:

| `data-tone` | Hue | Used by |
|---|---|---|
| *(omitted)* | neutral ink | Platforms, Books, Messages |
| `blue` | accent | Fleet roster, Offers — the things you act on |
| `green` | charge | Rapid network |
| `amber` | attention | Incidents |

Adding a fifth tone needs a reason. A tone means *what kind of thing this panel is*, not
*how the panel currently feels* — a panel does not turn amber because something is wrong
inside it; that is what `.alert` and the status colours are for.

## The console bezel

```html
<section class="console"><div class="t-inner"> … </div></section>
```

`.console` is now the glass **frame** (7px of it). `.t-inner` is the opaque black screen.
Everything inside `.t-inner` — status strip, app rail, card, control strip — stays exactly
as flat as it was. Do not put glass, transparency or a soft shadow inside `.t-inner`. The
one concession is a 14px coloured glow behind an active app ring.

## Depth, in order

1. Map plate (real Leaflet, desaturated)
2. Panels, top bar, console bezel — `--elev` + `--hi`
3. Raised fills inside panels — `--inset` + `--hi-1`
4. Offer cards and modals — deeper shadow, `--panel-solid`
5. Ray, scrim overlays — deepest

Nothing gets a shadow that does not sit on a layer above something else.

## Primary actions

One recipe, everywhere: `linear-gradient(180deg,#4B77E8,var(--accent))`, a coloured
drop shadow at about 40% of the shadow's own hue, no border. Applies to Accept, Clock on
(green variant), `#rp-go`, `#ray-go`, `.card-acts .pri`, the speed segment's active cell.
Secondary is `--inset` + `--glass-brd` + `--hi-1`. Never two gradients competing in the
same panel.

## Motion

- Panels and garage cards: 2px lift, `--dur-base` on the shared `--ease`.
- Bars and cost tracks: `transition:width` so a number that changes is *seen* changing.
- `.t-cta`: a single pass of light on hover (`@keyframes sheen`). One element on screen
  gets this. It is the primary action, and only on hover.
- Everything collapses under `prefers-reduced-motion`, which is already wired.

## Things not to do

- No hardcoded `blur(16px)` — read `--blur`.
- No `border-bottom` on `.p-head`. The band *is* the separation.
- No glass inside `.t-inner`.
- No new radius values. 14px surfaces, 9px cards, 6px controls.
- No colour that is not a token. Statuses come from `--s-*`.
