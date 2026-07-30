# Developing Deadhead

Developer and operations notes. For what the game *is*, see [README.md](README.md).

---

## Versioning

`MAJOR.MINOR.PATCH`, driven by features rather than dates.

- **PATCH** — bug fixes and balance tweaks that change no mechanic.
- **MINOR** — a new mechanic or system, or a rebalance a player would notice.
- **MAJOR** — reserved for 1.0.0, the first build worth handing to a stranger.

### `const VERSION` is the only authority

**Before numbering a release, read `const VERSION` in `deadhead.html`. Do not
infer the current version from anything else.**

This is written in bold because it has already gone wrong, more than once. The
`COMMIT_*.txt` notes are written by hand and are not written every time — they
once stopped at `COMMIT_0.26.7.txt` while the build had gone on to 0.31.0, and
later the working tree ran ~36 versions ahead of the last real commit before a
catch-up commit brought git back in sync (improvements.md #27, 2026-07-30 —
see `releases/COMMIT_0.70.0.txt` onward for the notes written since). Anyone
who reads the highest filename and adds one, or reads the newest git tag and
assumes it is current, can land several versions in the past and silently
reuse a number that has already shipped. As of this pass, `git log`/`git tag`
ARE caught up to the working tree again (commits exist through v0.72.0) — but
that is a snapshot of today, not a standing guarantee, which is exactly why
`const VERSION` and `test/version.test.js`, not the git history, are the rule
below.

So: the code is the source of truth, and `npm test` now enforces it —
`test/version.test.js` fails if the newest `COMMIT_*.txt` does not match
`const VERSION`. If you bump one without the other, the suite says so.

The version must agree in `deadhead.html`, `deploy/public/index.html` (byte
parity makes this automatic), the newest `COMMIT_*.txt` filename, and the git
tag once it is finally cut.

Note the two independent numbers. `VERSION` is the build. `SAVE_V` is the *state shape*,
and only moves when the snapshot format changes — so shipping 0.9.0 does not invalidate
0.8.0 saves. Every save also records the `app` version that wrote it, which is what makes
a bug report from a stranger diagnosable.

### History

| Version | What landed |
|---|---|
| 0.13.0 | **Take control.** A blocked car's incident alert is now clickable: it switches the console's own centre display over to a camera view — a canvas mini-game (dodge oncoming obstacles across three lanes for eight seconds, arrow keys or on-screen arrows) that plays right inside the "Main fleet view" card instead of a popup, framing the remote-operator premise as literally as this game gets. Winning clears the block immediately; ignoring the alert, or losing, changes nothing — the existing operator-ETA timer (`stepCar`'s `blocked` branch, unaffected) still clears it on its own, and the rider-cancel threshold at 150s still applies exactly as before. Opening it pauses the sim speed for the duration and restores it on close; the map itself is never torn down, just covered. The tutorial's spotlight ring now also wraps whole panels (Platforms, Offers, Books, Rapid network, Incidents, the topbar Cash box) instead of just an inner field. The console's "Nova" clock now shows real local city time instead of the simulated shift clock. |
| 0.12.0 | **Tinted-glass restyle and a guided day one.** Management surfaces redone in the "1b" glassmorphism direction (`GLASS-STYLE.md`): thinner, deeper glass, section headers carry a semantic tone band instead of a divider, the console sits inside its own glass bezel while the screen inside stays flat and opaque. Ray's tutorial card is now an iMessage-style thread — avatar, contact line, a received bubble — and the control it's pointing at pulses instead of holding a static ring. A brand-new fleet now gets a **guided day one**: the same 14 beats, re-sequenced into one fixed path, with the offer/incident/low-charge events forced the moment their prerequisites are met rather than left to chance. Fixed: the tutorial card could ring a target hidden behind an open modal, and could balloon to nearly full viewport height when repositioning itself next to a control. Fixed: the console's chevron-split Accept button had an inconsistent clickable area around its diagonal seam. The tutorial character is renamed Ray Salcido → **Paolo Cortez**. |
| 0.11.0 | **The garage and progressive disclosure.** Three Axiom cars — Cab (48 kWh, 163 kW, 300 mi, two seats, per its EPA filing), Saloon, Crossover — each a card with a hand-drawn SVG side profile, technical specs, running costs, and three ways to acquire it: buy, finance, rent. You now start with **$3,000 and no car**, which buys none of them outright, so the opening decision is how you hold the asset. Pack size and efficiency are wired into charging, range and energy cost, so the choice is mechanical rather than cosmetic. Console panels stay greyed until earned, each showing what unlocks it; locks never revoke. A new fleet always restarts the tutorial from beat 1, now 14 beats with the opening rewritten for the garage. Save shape v5. |
| 0.10.1 | Fixes "Latency NaNs" in the incidents panel, found on the live deployment. `avgFatigue()` divided by `S.ops.length`, which is zero in Act 1 because the player is the only operator. With no staff the panel now says so instead of quoting a computed response time it has no basis for. |
| 0.10.0 | **Ray, the Act 1 tutorial** (`GameMechanics.md` §9). Thirteen beats, every one triggered by game state rather than a timer, so the script follows the player. Spotlight primitive — a ring on the referenced control, console dimmed 25%. Messages card bottom-left; never modal, never pauses the clock except beat 1. All beats stay readable in a Messages panel afterwards. Skippable from the first card and never re-offered. Adds the demand-driven surge model (0.8–2.0×) that beat 7 needs to fire at all. Save shape v4. |
| 0.9.0 | **Act 1 rebuild** (`GameMechanics.md`). Real-time clock — 1× is the wall clock, speeds pause/1/4/20. Clock on/off shift model: cars earn only while you are supervising, and the car still owes $42 at midnight. Manual accept/decline of offers on a 45-second countdown. Two platforms, Hitchr (25%) and Zipp (15%), with acceptance rate driving offer volume. Start position $1,000 and one owned car. Fixed cost decomposed to $42 base. Insurance tiers at 3 cars. Two prototype bugs fixed: the offer cap never fired, and neutral pricing shed 44% of demand. Save shape v3 with a v2 migration. |
| 0.8.0 | Save/load: versioned snapshot with reference rehydration, IndexedDB autosave, three manual slots, JSON export/import. Cloudflare Worker + D1 backend for accounts and cloud saves. Version badge in the top bar. |

**This table stops at 0.13.0 on purpose, not by neglect** — improvements.md P3-28 flagged it
as stale, and the fix is not to hand-copy sixty more rows into a second place that can drift
from the first. `releases/COMMIT_*.txt` is the real, one-entry-per-release history from
0.13.0 forward (one file per version, same voice as the rows above); the current shipped
version is always whatever `const VERSION` says in `deadhead.html` (see the rule just above).
This table is kept as-is for the early history it already has right, not extended further.

### Recovering an old version

Versions live as git tags, not as duplicated folders — one working copy, full history:

```bash
git tag                        # list versions
git show v0.8.0:deadhead.html > /tmp/old.html   # read one file from a past version
git checkout v0.8.0            # visit a past version (detached HEAD)
git checkout main              # come back
```

Duplicated per-version folders were considered and rejected: two copies of an 85 KB file
is how an edit lands in the wrong one, which already happened once in this project with
two divergent copies of the Cloudflare backend.

---

## Layout

```
deadhead.html          the whole game — one file, no build step
Deadhead-intro-video.mp4
                       welcome/cold-open video, 16:9, shown once before the tutorial
deadhead-intro-poster.jpg poster frame for that video, generated with ffmpeg
shell.html             earlier console shell prototype
DESIGN.md              premise, pillars, the trilemma
GameMechanics.md       Act 1 redesign: real-time clock, gig phase, platforms
UI-SPEC.md             console interface spec
TeslaDesignSystem.md   brand reference
deploy/                Cloudflare Workers deployment
  wrangler.jsonc         Worker + static assets + D1 binding
  schema.sql             D1 tables
  src/index.js           accounts and cloud saves API
  public/index.html      copy of deadhead.html, served at the edge
  public/cloud.js        sign-in UI and cloud save client
```

`deadhead.html` is the source of truth. `deploy/public/index.html` is a copy — refresh it
before deploying:

```bash
cp deadhead.html deploy/public/index.html
```

---

## Running it

Open `deadhead.html` in a browser. That is all — no build, no server, no dependencies.
Leaflet and OpenStreetMap tiles load from a CDN; without network the map degrades to a
notice and the simulation still runs.

Saves go to IndexedDB in that browser. Clearing site data erases them, which is what the
**Export file** button in the save manager is for.

---

## Deploying to Cloudflare

The game is static, so the Worker exists only for accounts. Requests that match a file in
`public/` are served from the edge and never invoke the Worker — only `/api/*` runs code.

### 1. Create the D1 database first

`wrangler deploy` fails if `database_id` names a database that does not exist, so do this
before the first deploy.

Dashboard → **Storage & Databases** → **D1** → **Create database**, name it `deadhead-db`.
Copy the **Database ID** from the database page into `deploy/wrangler.jsonc`, replacing
`PASTE_YOUR_DATABASE_ID_HERE`.

> Want the game online right now with no accounts? Delete the whole `d1_databases` block.
> Local browser saves keep working and `/api/*` returns a clear 503.

### 2. Apply the schema

Dashboard → D1 → `deadhead-db` → **Console**, paste the contents of `schema.sql`. Or:

```bash
cd deploy && npx wrangler d1 execute deadhead-db --remote --file=./schema.sql
```

Skipping this step produces a 503 that names the fix rather than a bare 500.

### 3. Connect the repo (Workers Builds)

Cloudflare's **Create a Worker → Import a repository** flow. Values:

| Field | Value |
|---|---|
| Project name | `deadhead-robotaxi-fleet-simulator` |
| Build command | *leave empty* — dependencies install automatically |
| Deploy command | `npx wrangler deploy` |
| Root directory (Advanced) | `deploy` — **only if** `deploy/` is a subfolder of the repo root |

The deployed Worker's name comes from `name` in `wrangler.jsonc`, not from the project
name field. Worker names must be lowercase.

No runtime secrets are needed. Session tokens are generated per login and stored as
SHA-256 hashes; there is no signing key to configure.

---

## Why the password KDF runs in the browser

The Workers **free plan caps CPU at 10 ms per request**. PBKDF2 at OWASP's recommended
210,000 iterations measures **18.7 ms**, so hashing server-side fails every register and
login with Error 1102 — which surfaces as an opaque error, not as anything pointing at the
cause. Measured on this project:

| Approach | CPU | Verdict |
|---|---|---|
| PBKDF2 210,000 iterations | 18.7 ms | over budget |
| PBKDF2 100,000 iterations | 8.9 ms | no headroom |
| PBKDF2 50,000 iterations | 4.5 ms | fits, weaker than advised |
| **single salted SHA-256** | **0.16 ms** | what ships |

So the browser derives a key and the Worker stores one salted SHA-256 of it:

```
browser:  authKey = PBKDF2-SHA256(password, "deadhead|" + email, 250,000) -> 32 bytes
server:   stored  = SHA-256(authKey + per-user salt)
```

**Preserved:** the server never sees the password, and a stolen database still forces an
attacker through 250,000 PBKDF2 iterations per guess.

**Given up:** in transit the derived key *is* the credential, so this rests entirely on
TLS, and the minimum-length rule is enforced in the browser where a determined user could
bypass it — weakening only their own account. Fine for a game; not for a bank.

Measured worst case across all endpoints: **1.00 ms**, against the 10 ms ceiling.

## Free-tier headroom

| Limit | Free plan | This game |
|---|---|---|
| Worker requests | 100,000/day | static files don't count; only `/api/*` |
| CPU per request | 10 ms | 1.00 ms worst case |
| D1 storage | 5 GB | a save is 1–15 KB |

Cloud autosave is coalesced to once per 2 minutes while local IndexedDB still saves every
30 seconds — an unthrottled tab left open all day would spend 2,880 requests, versus 720.
Nothing is lost in between: every write lands locally first.

---

## Known limitations

- No password reset. There is no email sending, so a forgotten password means a new
  account. Export your save first.
- Leaderboards would be claims, not facts. The simulation runs client-side, so any score
  a browser reports is unverifiable. A trustworthy leaderboard needs the input log
  replayed server-side — deliberately not attempted.
- IndexedDB dies with cleared site data. Use **Export file**, or sign in.
