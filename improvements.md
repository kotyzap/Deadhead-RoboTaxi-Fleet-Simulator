# Deadhead — Improvements Plan
_Code review of v0.69.0 (`deadhead.html` 14,093 lines, `cloud.js`, `deploy/` Worker + D1, tests), 2026-07-30. Supersedes `improvementplan.md` (v0.21.2 — all four of its P0s are confirmed fixed: `owns` ReferenceError gone, source↔deploy parity enforced by `check-parity.js` + predeploy hook, 42 test files exist, `S.city` is saved.)_

Overall: the game is in good shape. Parity checking, the test suite, save migrations, and the D1 write-budget work are all solid. Below is what's left, worst first.

---

## P0 — Do these first

### 1. Cloud sync silently broken for `profile` and `history` slots
Client writes `Store.put('profile',…)` (deadhead.html:11998) and `Store.put('history',…)` (:12060), but the server whitelist (`deploy/src/index.js:35-38`) only allows `auto`, `slot1-3`, `progress`, `auto:<city>`. Both get **400 unknown slot** on every write for signed-in players; the errors are swallowed, so player name and shift history have never synced. This is the exact bug class documented in the `index.js:17-34` comment — repeated.
**Fix:** add `profile` + `history` to `slotAllowed()`. Add a test that greps `Store.put('…')` literals in deadhead.html and asserts each passes `slotAllowed()`.

### 2. Cloud resume after sign-in fetches the wrong key → fresh fleet
`cloud.js:273` `fetchAuto: () => RemoteStore.get('auto')` bypasses `physKey()` (deadhead.html:11635, which maps `auto` → `auto:<city>`). On a new device the resume hook (deadhead.html:13603) gets `null` and silently starts a new fleet even though a cloud save exists at `auto:austin`.
**Fix:** resolve the city from the `progress` record first (or have the server return the newest `auto:%` row). Related: `/api/saves` (`index.js:1241`) enumerates `SLOTS` verbatim so the Saves modal always shows an empty autosave row for signed-in players — fold `auto:%` rows into `auto` server-side, mirroring `LocalStore.list()`.

### 3. Admin gate has no brute-force throttle
Every login path is throttled (8/15 min) except `isAdmin` (`index.js:454`, used at :749) — an unlimited guessing oracle against a 3-word password (`admin-config.js`). The 404-on-failure hides existence, not the endpoint.
**Fix:** apply the same IP-keyed bucket used for logins; lengthen the password to 60+ bits.

### 4. DB backup with real password hashes sitting in the repo, not gitignored
`deploy/backup-deadhead-db-20260727-171937.sql` contains users, sessions, and 3 real sha256 password hashes. It's untracked but **not** ignored — one `git add -A` publishes it.
**Fix:** move it out of the repo; add `deploy/backup-*.sql` to `.gitignore`.

### 5. Loading a manual save keeps your *current* cash
`restore()` sets `S.cash=s.cash` then overwrites it with `S.cash=PROG.companyCash` (deadhead.html:11503-11504), which is refreshed from live cash every render. Correct for city switching; wrong for explicit Slot 1 loads and imports — the save's economy state is discarded.
**Fix:** `restore(sv,{sharedCash:true})` on the city-switch/resume path only; on slot/import loads take `s.cash` and write it back into `PROG.companyCash`.

---

## P1 — Correctness

### 6. `S.d` restored without a default → invisible hard-wedge
`S.d=s.d` (deadhead.html:11334) with no fallback; a save missing `d` makes `render()` throw every tick (:10105) with no visible error. **Fix:** fall back to `newDay()` and zero-fill missing keys.

### 7. Failed resume leaves a half-restored world
`rs-go`'s catch (:13934-13941) logs, hides the modal, and starts the clock anyway on a partially mutated `S`. Every other path falls back to `newFleet()`. **Fix:** do the same here.

### 8. Autosave dropped during city switch
`autosave()` returns immediately if `saving===true` (:13495), and `switchCity()` (:9892) chains off that no-op — a concurrent interval autosave makes the departing city's last minutes vanish. **Fix:** queue instead of drop (`savingP = savingP.then(doWrite)`), return the tail.

### 9. `clockOff()` cancels charge orders the sim promises to honour
`stepOnce()` deliberately keeps stepping `toCharge` cars off-clock (:6535 comment), but `clockOff()` (:7658) resets every non-`charging` car to idle, leaving stale `c.ch` behind. **Fix:** exclude `toCharge` from the reset; add a `clearChargeIntent(c)` helper for the four sites that half-clear charge state (also :6379-6383 blocked-cancel, `strandCar`).

### 10. Next-tariff line hardcoded to Austin's TOU windows
`tariff()` is per-city, but the Rapid panel computes the boundary as `h<16?16:(h<23?23:7)` and labels bands with literal `>=0.30`/`<=0.12` (:10077-10080). Wrong in Miami/Tampa; SF reads "peak tariff" 24h/day. **Fix:** derive boundaries and labels from `currentCity().power`.

### 11. Overnight fast-forward is one synchronous ~4,300-iteration loop
`startFastForward()` → `step()` at 15s substeps runs the full per-tick stack (achievements, advisor, render) thousands of times (:7760, :6485). This is the frame-freeze the 0.69.0 try/catch papers over, and why Paolo cards pop mid-jump. **Fix:** a "quiet" ffwd mode that skips rayAdvise/rayCheck/render and batches unlock/achievement checks to one pass at the end; or coarser substep while `S.ffwd`.

### 12. Paolo idle advisor timed in sim-seconds
`ADVISE_AFTER=75` accumulates `dt` not `realDt` (:6975) — at 20x that's 3.75 real seconds of quiet before a game-pausing card. Same bug class already fixed for offers/blocked/noFeed. **Fix:** accumulate `realDt`.

### 13. `progress` writes defeat the D1 autosave budget
`cloud.js:227` only coalesces `isAutoKey` slots, but `autosave()` calls `progSave()` every 30s → ~2,880 `progress` writes/day per signed-in tab, four times the capped `auto` writes. **Fix:** route `progress` (and `history`, `profile`) through the same coalescer.

### 14. `/api/stat` and `/api/register` abuse ceilings
Stat throttle is keyed on client-supplied `playerId` and cleared on overflow (`index.js:424-439`) — rotating playerId gives unlimited inserts. Register has no throttle at all and each signup/login costs ~5 written rows. The WAF backstop exists only as a comment. **Fix:** IP-key both buckets; write `last_seen` at most daily; add a checklist/test for the WAF rule.

### 15. Unbounded `auto:*` rows per account
Whitelist accepts any `auto:[A-Za-z0-9_-]{1,16}` and PUT upserts 256 KB per distinct slot with no per-user cap (`index.js:37`, :1271-1297). **Fix:** whitelist real city ids, or cap rows per user (~12).

---

## P2 — Integrity & injection

### 16. Save metadata interpolated into innerHTML unescaped
Saves modal `slotRow()` (:13060) and `bootResume()` (:13928) print `m.day/clock/cash/cars/app` raw. Saves come from imported files and the cloud — HTML injection into a trusted surface. **Fix:** `escapeHtml()` all fields, `Number()` the numerics.

### 17. `sanitizeRide()` is a no-op → leaderboard score exploit
Restored offers/rides/cars keep whatever numerics the file contained (:11325-11416), and `reportStat()` posts to the public leaderboard. Edited `fare` = one-line scoring exploit. **Fix:** clamp/validate numerics, drop unknown keys; same for `c.owed/odo/soc`.

### 18. Leaderboard publishes login usernames
`users.username` is half the credential and the board hands out a verified list (`index.js:540`). **Fix:** separate `display_name` for the board.

### 19. Byte caps count UTF-16 code units
`MAX_STAT_BYTES`/`MAX_SAVE_BYTES` use `text.length` (:665, :1273) — multi-byte payloads reach ~3x the budget. **Fix:** measure bytes.

### 20. `Origin: null` throws a raw 500
`new URL(origin)` runs outside the try (`index.js:1320`). **Fix:** wrap it; treat unparseable as cross-origin (403).

---

## P2 — Performance

### 21. Extend the render-signature pattern to the remaining hot rebuilds
`plat-rows`/`offer-list` got guards in 0.68.0, but `fleet-rows`, `rapid-rows`, `bk-lines`, `bk-liab`, `inc-list`, `waiting-list`, `zone-chips`, `live-list` still rebuild via innerHTML ~5x/s (:10053-10473), plus `paintLocks()` rewrites seven lockbars every tick (:11521). Kills hover/selection and churns GC. **Fix:** cheap signature guards (e.g. `S.cars.map(c=>c.id+c.state+~~c.soc).join()`); gate `paintLocks` on `S.unlocked.join(',')`.

### 22. Map: memoise road geometry, reuse the trip polyline
`roadFix(c)` rebuilds the immutable point array per car per frame, twice for the selected car; `tripLine` is removed/recreated each frame; zone circles restyled every frame (:9532-9618). **Fix:** memoise `roadPath` per roadKey, cache `pathLen`, `setLatLngs()` on one polyline, gate zone `setStyle` on hour+zones signature, touch tooltips only on state/soc-bucket change.

### 23. Throttle `checkAchievements()`; scope the MutationObserver
Full 20-entry ACHV scan 10x/s and thousands of times per ffwd (:6638); body-wide subtree observer fires on every `hidden` toggle (:13364). **Fix:** ~1 Hz achievement scan (or dirty-flag), observe the four `MODAL_IDS` elements individually.

---

## P3 — Lifecycle, hygiene, docs

### 24. `resetRenderCaches()` from `newFleet()`/`restore()`
`lastMsgSeenCount`, `cityTabSig`, `lastPlatSig/lastOfferSig` survive run resets — a new run can show the previous run's Paolo transcript (:9629, :9984, :9999).

### 25. Failed cloud autosave never retries
`cloud.js:196-208` restores `pendingAuto` but schedules nothing — an idle tab after a network blip never syncs. Add a backoff retry. Also consider dropping the useless async `beforeunload` write (:13525) in favor of a synchronous compact localStorage snapshot.

### 26. Add a Worker HTTP test harness
Zero tests exercise `slotAllowed`, `isAdmin`, `statThrottled`, sanitizers, or the same-origin guard. The leaderboard test already proves an `env.DB` stub over `node:sqlite` + schema.sql works — add `worker.test.js` on the same pattern. Also extend `check-parity.js` to `cloud.js` (currently byte-identical by luck) and `admin.html`.

### 27. Commit! And tidy the root
Working tree is ~36 versions ahead of HEAD (last commit 0.33.2, tags stop at v0.33.x); 72 of 87 `COMMIT_*.txt` are untracked. Commit and tag current state first. Then restructure: `releases/` for COMMIT files, `media/` for mp4/jpg/zip (or gitignore the videos — two mp4s are committed twice, root + deploy/), `docs-plans/` for the 9 `*plan.md`, delete `deploy/test/dbg*.js`, `citov_regress_tmp.js`, and the stale duplicate game copy inside `Game UI glassmorphism directions/`. Note: `version.test.js`, `docs-assets.test.js`, `car-photos.test.js` assert paths — update them in the same commit.

### 28. Docs contradict the code on money and trims
README says $7,500 start and "four financeable day one" (code: $800, zero financeable — the code comments at :5291/:5372 even say so). DESIGN.md:175 also says $7,500. GameMechanics.md is two generations stale ($3,000 start, three cars, old price table, $18k car #2). DEVELOPING.md's history stops at 0.13.0 and its "uncommitted since 0.26.3" numbers are wrong. One documentation pass fixes all of it; consider a small test that greps README for `startCash` and trim count like `rebrand.test.js` does.

### 29. Small stuff
Duplicate keys in `window.DH_ACT1` (~8, :13951-14073); `CFG.speeds` vs `offerDecideBySpeed` parallel tables + hardcoded `$('spd').max` (:3923, :11584); Orlando charger comment says fleet cap 18, actual 14 (:5188); `chargersFor()` returns the live array while `zonesFor()` deep-copies; legacy `pbkdf2$` login error tells players to edit the DB (`index.js:622`); `shell.html` no longer matches shipped tokens despite DESIGN.md calling it the style reference.
