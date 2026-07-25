# Deadhead — robotaxi fleet simulator

**Version 0.8.0**

A future-job simulator played entirely through a car's centre console screen. You never
drive. You own and operate a small robotaxi fleet, and your job is the one that *replaces*
driving: capital allocation, geofence design, charging strategy, pricing, and staffing a
room of remote human operators who supervise the cars.

*Deadhead* is the trade term for driving empty with no fare aboard — the exact thing that
kills a robotaxi fleet's margin.

---

## Versioning

`MAJOR.MINOR.PATCH`, driven by features rather than dates.

- **PATCH** — bug fixes and balance tweaks that change no mechanic.
- **MINOR** — a new mechanic or system, or a rebalance a player would notice.
- **MAJOR** — reserved for 1.0.0, the first build worth handing to a stranger.

The version appears in three places and they must agree: `const VERSION` in
`deadhead.html`, the heading at the top of this file, and the git tag.

Note the two independent numbers. `VERSION` is the build. `SAVE_V` is the *state shape*,
and only moves when the snapshot format changes — so shipping 0.9.0 does not invalidate
0.8.0 saves. Every save also records the `app` version that wrote it, which is what makes
a bug report from a stranger diagnosable.

### History

| Version | What landed |
|---|---|
| 0.8.0 | Save/load: versioned snapshot with reference rehydration, IndexedDB autosave, three manual slots, JSON export/import. Cloudflare Worker + D1 backend for accounts and cloud saves. Version badge in the top bar. |

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
