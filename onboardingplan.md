# Deadhead — Onboarding, Player Profile & Telemetry Plan

_Written 2026-07-27 against `deadhead.html` v0.26.7. Line numbers refer to the source file.
Decisions taken in discussion with Pavel are marked **DECIDED**; everything else is
proposal and open to change._

Four things, in dependency order. Each is shippable on its own, and the order matters:
the profile's `uuid` is the key the telemetry rows are filed under, and the shift ledger
is the payload those rows carry. Building admin.html first would mean building it against
data that does not exist yet.

1. **Intro as an in-car display** — reframe `#intro` over the live, empty dashboard.
2. **Player profile** — `{id, name, created}`, local, outliving every run.
3. **Shift-history ledger** — append one row per clocked-off shift.
4. **Telemetry + admin.html** — ship those rows to D1, read them back behind a token.

---

## 1. Intro as an in-car display

### What it is now

`#intro` (CSS 1585–1610, markup 2163–2173, logic `showIntro()` 8505–8517) is a full-screen
`position:fixed` overlay: a dark radial gradient with `backdrop-filter:blur(6px)`, holding a
centred column of wordmark + 16:9 video + Skip button. It hides the app completely.

### What it becomes

The same overlay, but **three columns instead of one**: blurred-and-dimmed left wing,
transparent centre holding the video, blurred-and-dimmed right wing. The player sees the
real car console they are about to operate, with the side panels legible-but-soft and the
centre display playing the cold open.

**No fake dashboard is needed.** At boot the app is already fully painted — `render()` and
`drawMap()` run at 8595, before `bootResume()` at 8616 — and a fresh fleet genuinely *is* an
empty dashboard: `CFG.startCash`, zero cars, 06:00, no offers, no rides (`newFleet()` 8523).
The emptiness is the truth, not a mock-up, which is why this is cheap.

### The one implementation trap

Do **not** put `filter:blur()` on `.app`. A `filter` on an ancestor creates a containing
block, which would break the `position:fixed` overlays that sit outside it — `#ray`,
`#intro` itself, `#dimscrim`. This is the same family of bug that killed the
brightness-compensation attempt on the tutorial scrim (see `DESIGN.md` and the
`#dimscrim` comment): a filter that seemed to affect only appearance changed layout
semantics underneath it.

`backdrop-filter` on the overlay's own side panels has no such side effect. `#intro`
already uses `backdrop-filter`, so this is a change of *geometry*, not of technique.

### Keeping the cut-out aligned with the real centre column

The clear centre must line up with the map column or the illusion dies. `.ops` (line 501)
is `grid-template-columns:520px minmax(0,1fr) 520px`, and that 520 is overridden at four
narrower tiers — 500px (1070), 472px (1078), 440px (1111), then a single `1fr` column (1142).

Duplicating those five numbers in `#intro` guarantees they drift apart the first time a
tier is retuned. Instead introduce **one custom property** as the single source of truth:

```css
:root{ --wing:520px }
.ops  { grid-template-columns:var(--wing) minmax(0,1fr) var(--wing) }
#intro{ grid-template-columns:var(--wing) minmax(0,1fr) var(--wing) }
```

…and each media query then sets `--wing` alone. `.ops` keeps behaving exactly as it does
today, and the overlay tracks it for free.

### The narrow tier

Below 1499px the layout collapses to one column (1142) and **there are no side wings to
blur**. That tier keeps today's full-screen framing — the three-column treatment is a
wide-layout enhancement, not a requirement. Guard it in the same media query that
collapses `.ops`, so the two can never disagree.

### Autoplay stays off

Unchanged and deliberate (comment at 8498–8504): audio should be real rather than
muted-then-unmuted, and the only way a browser grants non-muted playback is a genuine
user gesture. The poster frame is what the player sees until they press play. Note this
means the new framing must look *finished* while paused — the poster is the first
impression, not the video.

---

## 2. Player profile

**DECIDED: local profile only for now.** No login, no email, no server-side identity.

### Why not username + creation timestamp as the login

The original idea was to disambiguate duplicate names with a creation timestamp. Right
instinct, wrong slot — it conflates two different things:

- **Display name** — cosmetic. Paolo can address you by it, it heads the shift report, it
  labels rows in admin. It does **not** need to be unique.
- **Login identity** — must be unique *and typeable from memory*. `pavel#1753574400` is
  not. Discord shipped discriminators and then spent years removing them.

So the timestamp and a uuid become the **internal** identity and the admin-side tiebreaker.
Nobody ever types them. The name stays free text and may collide freely.

### Shape and storage

```js
const PROFILE_V = 1;
let PROFILE = { v:1, id:<uuid>, name:'', created:<ts> };
```

Stored via `Store.put('profile', …)`, alongside `PROG` (7496–7501) and for the same reason
spelled out in the TWO KINDS OF SAVED THING comment at 7478–7493: **`S` is a run, and the
player outlives the run.** A profile in `S` would be wiped by `newFleet()` and would not
survive starting a new city. It is a third kind of saved thing — neither run nor progress —
so it gets its own key rather than being smuggled into `PROG`.

`id` is `crypto.randomUUID()`, generated once, never regenerated. `created` is set at the
same moment and never touched again; it is what tells two players called "Pavel" apart in
admin, and it is the only field that can do so if one of them later renames.

Note `physKey()` (7494) rewrites `'auto'` to `'auto:<city>'` but passes every other key
through untouched, so `'profile'` needs no special handling — it is global by default,
which is exactly right.

### Where the name is asked for

**DECIDED: on the intro overlay itself, in the centre panel, under the video.** The cold
open becomes one screen — watch, type your name, start — rather than a video followed by a
modal followed by the garage. `showIntro()`'s `done()` already funnels both exits (ended and
skipped) into a single `next()`; the name is read there, so neither path can reach the
garage without it.

Design notes:
- **Skipping the video must not skip the name.** The Skip button dismisses the *video*, not
  the screen. Either it reveals the name field where the video was, or the field is present
  from the start and Skip only stops playback. Prefer the latter: fewer states.
- **Empty must be allowed.** A blank name defaults to something neutral rather than blocking
  entry. Nobody should be unable to start a game because they cannot think of a handle.
- **Editable later** from the control strip, next to the existing settings. The control-strip
  audit already established that settings must actually be written to the save rather than
  flipped decoratively — a rename must call `Store.put('profile', …)`, not just repaint.
- **Sanitise on the way in**, not on the way out. `restore()` escapes save-file text
  (`escapeHtml()`/`sanitizeRide()`) because saves are user-editable JSON, and the profile is
  no different — the name reaches `innerHTML` in the report header and Paolo's dialogue.
  Cap the length hard (say 24 chars) so no layout can be blown open by a long name.
- **One line of disclosure** beside the field, because a chosen name plus a stable uuid *is*
  a user identifier once §4 ships and it starts leaving the machine.

### Where the name pays off

Paolo addressing the player by name (`rayCheck()` / the beat table around 4450), the shift
report header (5010–5029), the save-slot rows (`slotRow()`), and the admin list. It is
cheap everywhere because it is one global read.

---

## 3. Shift-history ledger

### Autosave already does what was asked

Worth stating plainly, because the original request was "autosave after each shift" and
that is **already shipped**: `autosaveSoon('clock-off')` at 4971, `autosave('day-end')` on
the report button at 8494, plus a 30-second interval gated on a changed `saveSig()`
(8443–8476), plus `sell` / `acquire` / `city-switch` / `pagehide` / `beforeunload` /
`hidden`. Nothing to build here.

### What is actually missing

**History.** `PROG.results[S.city]` keeps only `bestCash` / `day` / `goalMet` / `shiftDone`,
and `progTrack()` (8419–8428) *replaces* that object wholesale — the comment there already
warns that any field not explicitly carried is silently destroyed. So the game computes a
complete per-shift ledger, shows it once, and throws it away.

The good news: the ledger already exists as `S.d`, consumed by `shiftReport()` at 5001–5029.
It carries `gross`, `cost`, `commission`, `energy`, `dep`, `maint`, `ins`, `soft`, `fixed`,
`miles`, `done`, `cancels` — and `newDay()` (3626) resets it. Capturing a shift is therefore
mostly a matter of copying `S.d` before it is cleared, plus context.

### The row

**DECIDED: full shift economics.**

```
ts, playerId, city, day, shiftNo, permit,
workedH, billedH,
gross, commission, cost, net,
energy, dep, maint, ins, soft, fixed,
miles, rides (d.done), cancels, safety,
cash, cars
```

`workedH`/`billedH` come from `S.workedSec`/`S.billedSec` — and `billedSec` is the honest
elapsed-registered time now that clock-off fast-forwards to the next 06:00 (`startFastForward()`
4988), so it is worth recording rather than recomputing.

### Where it is written and stored

Appended in `stopFastForward()` (4992–5000), immediately before `shiftReport()` — that is
the single point every finished shift passes through, including the fast-forward path, and
it is after the safety adjustment at 4997 so the recorded `safety` is the one the player
sees. Bankruptcy returns early at 4994 and gets its own handling; decide whether a run that
ends in bankruptcy should still file its last shift (it should — that is the most
interesting row in the table).

Stored under its own `Store` key, **not** inside `PROG`. `progSave()` runs on the autosave
cadence, and growing its payload by one row per shift means rewriting the entire history on
every 30-second tick. A separate `'history'` record is appended to and written only when a
shift actually ends.

Cap it. A few hundred rows is plenty; oldest-first eviction keeps the record bounded so a
long-lived browser profile cannot grow without limit.

**DECIDED: no backfill.** Existing saves start with an empty history. Reconstructing past
shifts from `PROG.results` would mean inventing numbers, and invented numbers in a
diagnostic table are worse than missing ones.

---

## 4. Telemetry + admin.html

**DECIDED: cloud D1 stats across all players, keyed by the local profile uuid.**

### Resolving the tension

"Stats for all players" and "no cloud login" pull against each other. The bridge is that the
profile's `uuid` *is* the player key: an unauthenticated `POST /api/stat` fired when a shift
row is appended, carrying `{playerId, name, created, city, day, …metrics}`. No account, no
email, everyone shows up.

The existing email accounts (`schema.sql` `users`, `/api/register`, `/api/login`) are
untouched — they exist for cloud **saves**, which is a different job. If a stat POST happens
to arrive with a valid `dh_session` cookie, stamping `user_id` on the row costs one extra
lookup and makes those rows verified; worth doing, but not required for v1.

### Three consequences to accept up front

1. **Writes cannot be authenticated.** Anyone can POST junk. Mitigations: a strict body-size
   cap, per-`playerId`-and-IP rate limiting (the `login_attempts` throttle table is the
   existing pattern to copy), and server-side clamping of every numeric field to a sane
   range. This makes the data useful for spotting *tuning* problems; it does not make a
   leaderboard trustworthy, and it should not be presented as one.
2. **Only the deployed build reports.** `deadhead.html` has no `cloud.js` and a `file://`
   page cannot reach the API. Your own dev play will not appear — which is arguably better,
   since it keeps your testing out of the numbers.
3. **Reporting must never affect play.** Fire-and-forget, `.catch(function(){})`, no `await`
   in the shift-end path. The pattern is already established by `progSave()` and the
   autosave, both of which swallow their own failures. A dead API must not be able to stall
   a shift report.

### Schema

New D1 table, additive — no migration of existing tables:

```sql
CREATE TABLE IF NOT EXISTS stats (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,          -- the local profile uuid
  user_id   TEXT,                   -- set only if a session cookie was present
  name      TEXT,                   -- player-chosen, non-unique, untrusted
  created   INTEGER,                -- profile creation ts: the duplicate-name tiebreaker
  ts        INTEGER NOT NULL,       -- server time, NOT client time
  city      TEXT, day INTEGER, shift_no INTEGER, permit TEXT,
  worked_h REAL, billed_h REAL,
  gross REAL, commission REAL, cost REAL, net REAL,
  energy REAL, dep REAL, maint REAL, ins REAL, soft REAL, fixed REAL,
  miles REAL, rides INTEGER, cancels INTEGER, safety REAL,
  cash REAL, cars INTEGER
);
CREATE INDEX IF NOT EXISTS idx_stats_player ON stats(player_id, ts);
CREATE INDEX IF NOT EXISTS idx_stats_ts     ON stats(ts);
```

`ts` is **server** time. A client clock is not evidence, and using it would let a bad row
sort itself to the top of the table forever.

### admin.html

Served from `public/`, but **"unlinked" is not access control** — `/admin.html` is the first
path anyone guesses. The page itself is a dumb viewer; the gate is server-side:

- An `ADMIN_TOKEN` Wrangler **secret** (`npx wrangler secret put`), never in the repo, never
  in `wrangler.jsonc` — note that `wrangler.jsonc` already documents the distinction between
  a database id, which is not a secret, and something that is.
- `GET /api/admin/stats` requires the token in a header and returns 404 (not 403) without
  it, so the endpoint does not confirm its own existence to a prober.
- admin.html asks for the token once and holds it in memory. **Not** `localStorage` — a
  shared-machine leak for no convenience worth having.
- Constant-time comparison, reusing whatever `src/index.js` already does for session tokens.

Views worth having, in order of what they will actually tell you:

1. **Players** — name, id (short), created, first seen, last seen, shifts filed, cities
   reached, best cash. The duplicate-name case renders as two rows distinguished by `created`.
2. **Progression funnel** — how many players filed shift 1, shift 2, day 2, reached Dallas,
   reached Miami. This is the number that says whether the onboarding you are about to
   rebuild actually worked.
3. **Per-city economics** — median net per shift by city and shift number. This is the
   mistuning detector: the DESIGN.md §5 fleet-cap numbers have been wrong three times, and
   this is the view that would have caught it.
4. **Recent shifts** — raw tail, for when the aggregates look wrong and you need to see rows.

Server-side aggregation for 2 and 3 rather than shipping every row to the browser; D1 can
do the `GROUP BY` and the payload stays small.

---

## Sequencing and the parity discipline

Ship in the numbered order. §2 before §3 (the rows need a `playerId`), §3 before §4 (the
endpoint needs a payload). §1 is independent and could go first or last.

Every change to §1–§3 touches the shared engine and therefore **must be hand-mirrored into
`deploy/public/index.html`**, preserving that copy's mobile-only additions — the T5 phone
tier and the Leaflet gesture-lock block appended after `initMap()`. A plain `cp` deletes
both silently. `deploy/scripts/check-parity.js` exists for exactly this; run it, and run the
`deploy/test/` suite (`boot-smoke`, `city`) before deploying.

§4 is deploy-only: `schema.sql`, `src/index.js`, `public/admin.html`. Nothing in it belongs
in `deadhead.html`.

Bump `VERSION` (7078) per step so the badge can distinguish builds — the improvement plan
already recorded a case where source and deploy both claimed the same version and could not
be told apart, and a stale deploy has cost three debugging rounds before.

## Open questions

- Should a bankruptcy file its final shift row? (Argument: yes — most informative row.)
- History cap: how many rows, and evict oldest or summarise oldest?
- Does the name appear in Paolo's dialogue everywhere, or only in the first beat? Overuse
  reads as a mail-merge.
- Should admin.html show anything when the token is absent, or be indistinguishable from a
  404 page?
