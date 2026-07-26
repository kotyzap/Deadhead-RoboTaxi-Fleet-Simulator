repo: kotyzap/Deadhead-RoboTaxi-Fleet-Simulator
branch: main

## Last sync

date: 2026-07-26T06:35:52Z

### Updated in this project

- `deadhead.html` restyled to the tinted-glass direction (1b), day and night
- Section headers now carry a semantic tone band instead of a divider (`data-tone`)
- Console wrapped in a glass bezel (`.t-inner`); its screen stays flat and opaque
- `GLASS-STYLE.md` added as the house style; `deploy/public/index.html` refreshed

## Screen map

| Project screen | Built from |
|---|---|
| Deadhead Glass.dc.html — option 1a / 1b / 1c shells | deadhead.html (`:root` tokens, `.topbar`, `.panel`, `.p-head`, `.console`, `.t-*`) |
| Fleet roster / Rapid network / Books / Offers / Platforms / Incidents panels | deadhead.html `render()` (lines ~1890–2020) |
| Garage card | deadhead.html `CATALOG`, `cardHtml`, `.card*` styles |
| Shift report | deadhead.html `endShift()` / `.rep`, `.rp-row` |
| Ray tutorial card | deadhead.html `RAY` beats, `#ray` styles |
| Icons | deadhead.html inline SVG symbol sprite (copied verbatim) |
