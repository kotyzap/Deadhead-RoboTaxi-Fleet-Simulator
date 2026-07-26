# Deadhead — Improvement Plan
_Code review of `deadhead.html` v0.21.2 (5,972 lines) + `deploy/`, 2026-07-26. Line numbers refer to the source file._

Overall quality is high: the save/migration system (SAVE_V=6 with ascending migrations and reference rehydration), dt substepping, delegation-based event handling, and comment culture are all better than typical. Three things are actually on fire; the rest is polish.

---

## P0 — Fix now

### 1. `owns` ReferenceError kills `DH_ACT1` / `DH_SAVE` exports (line 5956)
`socNeeded:socNeeded,owns:owns,` in the `window.DH_ACT1` export — `owns` doesn't exist anywhere. The game boots (tick interval is already installed), but the export assignment throws, so **`window.DH_ACT1` and `window.DH_SAVE` are never created** and every player sees a red console error. Same bug in the deploy copy (line 5872).
**Fix:** define `owns` or drop the entry. One line, both copies.

### 2. Source ↔ deploy divergence, in both directions
DEVELOPING.md declares `deadhead.html` the source of truth, but the copies have forked:
- Deploy-only: `#sound` toggle CSS + WebAudio, T5 phone tier (≤760px), `#map-lock` gesture shield.
- Source-only: `#wxcanvas` weather overlay, red `#sel-sell` hover.
- Both claim `VERSION='0.21.2'`, so the badge can't distinguish them. The source even calls deploy-only `unlockMap`/`lockMap` behind `typeof` guards (5507, 5634).

A plain `cp` in either direction now destroys work.
**Fix:** merge deploy-only features (sound, T5 tier, map-lock) back into the source, re-copy to deploy, bump VERSION, then add a pre-deploy `diff` check (or hash) so a fork is detected immediately.

### 3. Test suite is missing — and demonstrably not run
No `*test*` files anywhere in the repo or `deploy/`, no test runner in `deploy/package.json`, yet 6+ code comments reference asserting tests and the whole `DH_ACT1`/`DH_SAVE` surface exists for a jsdom harness. Bug #1 destroys those exact hooks, proving the suite wasn't run on this build.
**Fix:** locate/restore the harness (or recreate it); add a smoke test that boots the file and asserts `window.DH_ACT1` exists. Run it before every deploy.

### 4. `S.city` never saved (snapshot 4837–4871 vs restore 5001)
`restore()` reads `s.city` but `snapshot()` never writes it. The day city #2 ships, every existing save snaps back to Austin with no migration signal. Add the field now while it's free.

---

## P1 — Correctness

### 5. `newFleet()` leaks `ZONES[].on` and `spawnAcc` (5850–5868)
Resets `PLATFORMS` but not zones: a New Fleet starts guided day 1 with the previous game's geofence, and the forced tutorial offers draw from `activeZones()[0]/[1]` — possibly zones a fresh game never enables. Reset both.

### 6. Cumulative double-escaping on save round-trips (4979–5004)
Sanitisation happens at `restore()`, then `snapshot()` persists the escaped strings — export→import turns `&` into `&amp;`, then `&amp;amp;`. No current string contains `&`, but it's one copy-edit away. Move escaping to render time (the `escapeHtml(top.from)` pattern at 4459) for offers, live feed, and fleet rows.

---

## P2 — Performance

### 7. `render()` rebuilds ~8 innerHTML regions every 200ms (4183–4510)
Fine at Act 1 fleet sizes; scales linearly and will churn in Act 2. The Messages panel re-joins all seen tutorial beats every frame — pure waste. Add per-panel dirty flags, Messages first.

### 8. Second full Leaflet map as blurred wallpaper (`#bgmap`, 4001)
Doubles tile fetches, memory, and OSM tile-server load, then gets blurred to illegibility at 0.55 opacity. Replace with a static tile image or cached screenshot.

### 9. `wxFrame` rAF runs at 60fps forever (4069)
Paints three full-canvas radial gradients per frame whenever cloud > 0.02 — even paused, covered by the dodge overlay, or behind a modal. Gate on visibility/pause and cancel when idle. Matters on battery.

---

## P3 — UX / accessibility

### 10. Modals lack dialog semantics and focus management
`#report`, `#garage`, `#savemgr`, `#resume`: no `role="dialog"`, no `aria-modal`, no focus trap or focus restore. Keyboard users tab into the dimmed page behind the garage, and the mandatory-garage exception makes Escape look broken with no explanation.

### 11. Phone tier (≤760px) exists only in the deploy copy
Standalone source bottoms out at ≤1199px — on a phone it's the fixed 32:9 cockpit on an opposite-shaped screen. Merge T5 back (part of item 2).

### 12. Weather failure is invisible to the player
Fetch failure keeps stale values (good) but the status strip shows `—°C` forever with no retry hint (retry is every 15 min). Show a subtle "wx offline" state.

---

## P4 — Cleanup (low)

- Dead code: `id0()` (5273); `S.running` duplicates `S.speed>0`; Act 2 scaffolding (`capacity()`/`loadRatio()`/`syncOps()`) runs every tick with `staffed()` hard-returning 0; duplicate `rayCheck`/`raySkip` keys in `DH_ACT1`.
- Ray→Paolo rename incomplete: Messages panel still shows "Ray · n of 14" (4484) while the card says Paolo Cortez — player-visible.
- Residual magic numbers: surge easing `dt/240` (2652), incident prob `0.00018*dt` (2917), SoC warn thresholds 10/20 (4366), `0.57`/`0.73` charge-time estimate (5253) → move to CFG.
- Duplication kept in sync by hand: `guideForceOffer()` vs `spawnRides()`, `dodgeEnd()` vs `stepCar()` blocked-clear, cost-per-mile in `shiftReport()` (3706) and `render()` (4255). Extract helpers when next touched.
- Offer IDs: 5 chars of `Math.random().toString(36)` (2594) — collision would corrupt `rideId` rehydration; astronomically unlikely, noted only.
- `CFG.cancelAt` is nearly dead in Act 1: blocked-branch rider-cancel is an `else if` behind the operator-ETA check (2871) with `act1Latency:90` — confirm that matches intent.

---

## Testing backlog (once the harness is back)
Migration chain v1→v6 against real old saves; export/import double-escape round-trip; `newFleet()` zone reset; weather `byHour` parsing (1994); IndexedDB store paths; and the deploy-only features (sound, phone tier, map-lock) once merged.

## Suggested order
1. Fix `owns` (5 min) → 2. Merge deploy features back + re-copy + VERSION bump → 3. Restore test harness + boot smoke test → 4. `S.city` in snapshot → 5. `newFleet()` zone reset → 6. render-time escaping → then performance and a11y items opportunistically.
