# Admin page — review and improvement plan

> **STATUS: SHIPPED, 2026-07-30.** Everything below is implemented.
> `npm test` is green (729 checks, 25 suites, including the new
> `test/admin.test.js`), and the page was screenshotted in both themes at
> 1440px and 393px against a local SQLite seeded with 414 rows, running the
> real queries (47/47 browser checks).
>
> **ONE THING STILL TO DO BY HAND — the remote D1 migration.** The new geo
> columns exist in `schema.sql`, but D1 has no `ADD COLUMN IF NOT EXISTS`, so
> the live database needs this run once. Harmless "duplicate column name"
> errors mean it is already applied:
>
> ```
> cd deploy
> npx wrangler d1 execute deadhead-db --remote --command "ALTER TABLE stats ADD COLUMN country TEXT;"
> npx wrangler d1 execute deadhead-db --remote --command "ALTER TABLE stats ADD COLUMN region  TEXT;"
> npx wrangler d1 execute deadhead-db --remote --command "ALTER TABLE stats ADD COLUMN tz      TEXT;"
> npx wrangler d1 execute deadhead-db --remote --command "ALTER TABLE users ADD COLUMN country TEXT;"
> ```
>
> Until that runs, `/api/stat` will reject every shift (the INSERT names
> columns the table lacks) — so run it **before** `npm run deploy`, not after.
> The admin's new **Data health** subsection is the place that will tell you
> whether it worked: "No country (pre-geo rows)" should stop growing.

## Findings that only turned up during the work

Three bugs that were not in the review below, because none of them was
visible from reading the page:

1. **`schema.sql` never created the `achv` column** — P0, and the most
   valuable thing this review found. `models TEXT` was missing its trailing
   comma; SQLite allows a column type to be several words, so it parsed
   `models TEXT <comment> achv TEXT` as ONE column named `models` of type
   "TEXT achv TEXT" and `CREATE TABLE` succeeded silently. Any database
   created fresh from this file could not accept a single telemetry row,
   because `POST /api/stat` names `achv` in its INSERT. The live database
   escaped only because `achv` had been added to it by `ALTER TABLE`;
   `npm run db:local` did not escape. Found by *executing* schema.sql in the
   test rather than reading it, which is now what `test/admin.test.js` does
   for every column in every INSERT the Worker performs.
2. **Descending sort put NULLs first.** The obvious comparator —
   `dir * cmpVals(...)` — inverts the nulls-last rule along with everything
   else, so every legacy row with a missing value floated to the top of a
   descending table. Caught because the test asserts *both* directions. (The
   first version of that test reimplemented the comparison and passed while
   the page did the wrong thing; it now lifts and runs the page's real
   `visibleRows()`.)
3. **A CSS class collision.** The new dashboard subsection panels were
   `.sub`, which is also the class on the page-header paragraph — so the
   header line got a white card painted behind it. Both elements were
   individually valid; only a screenshot showed it. Renamed `.subpanel`.

Written 2026-07-30 against `deploy/public/admin.html` (633 lines) and the
`/api/admin/stats` views in `deploy/src/index.js` (lines 709–859), at
v0.64.4.

Companion to `onboardingplan.md` §4, which specified the telemetry this page
reads. That document said what to collect; this one is about what the back
office does with it.

---

## 0. The three asks, and the decisions taken

| Ask | Decision |
| --- | --- |
| Sortable, better tables | One shared table renderer, click-to-sort on every column, type-aware (number / text / timestamp). Replaces six hand-rolled `<table>` string builders. |
| "At least the country the player is from" | `country` + `region` + `tz`, read from Cloudflare's `request.cf` on writes that **already happen**. No external geo API, no new request, no extra D1 row. |
| A main dashboard with several TOP 5s, then subsections | New landing view, one batched server round trip, ten TOP 5 cards over four detail subsections. |

Two things explicitly **not** changing:

- **The Cars radar view stays exactly as it is.** Pavel: *"keep those cars
  stats, it is fantastic."* The hex radar, the per-axis colour legend, the
  retired-trim dimming, the photo-with-shape-fallback — all untouched. This
  plan only *adds* to that view (a sortable table under the cards, and the
  `avg_rides` figure the query already computes but the cards never print).
- **The gate.** Server-side 404-not-403, credentials in memory only, no
  localStorage. That design is right and is left alone.

---

## 1. What the page is today

A dumb viewer over six read-only aggregates. Every number is computed
server-side with `GROUP BY` so the payload stays small; the client only
formats. That division of labour is good and the plan keeps it.

The honest summary: **the data model is better than the presentation.** The
server queries are careful, well-commented and cheap. The page in front of
them is six string-concatenated tables with no sort, no filter, no refresh,
and no viewport meta tag.

---

## 2. Section-by-section findings

Severity: **P0** wrong/misleading · **P1** materially limits the tool ·
**P2** polish.

### 2.1 Global / shell

| # | Severity | Finding |
| --- | --- | --- |
| G1 | **P1** | **No `<meta name="viewport">`.** iOS lays the page out at 980px and shrinks it, so on the iPhone 14 Pro every table is a grey smear. Every other surface in this project got a mobile pass; this one never did. |
| G2 | **P1** | **No refresh.** To re-read a view you must click a different tab and click back. Telemetry is live data; the page has no way to say "again". |
| G3 | **P1** | **No "data as of" stamp.** A stale tab is indistinguishable from a quiet day. |
| G4 | P2 | **No lock.** Credentials sit in JS memory for as long as the tab lives, with no way to drop them short of a reload. A `Lock` button that nulls both and re-shows the gate is five lines. |
| G5 | P2 | **Gate has no pending state.** `Enter` on a slow link looks dead, and the button stays clickable so an impatient double-click fires two requests. |
| G6 | P2 | No autofocus on the email field. |
| G7 | — | *Checked and already correct:* `json()` sets `cache-control: no-store` on every response by default, so admin telemetry is already uncacheable. No change needed. |

### 2.2 Players

| # | Severity | Finding |
| --- | --- | --- |
| P1a | **P1** | **`MAX(name)` is the alphabetically-last name, not the current one.** A player who renames shows whichever of their names sorts last. Should be the name on their most recent row. |
| P1b | **P1** | **`LIMIT 500` with no total.** Past 500 players the table silently omits people with no hint that it has. Needs "showing N of M". |
| P1c | **P1** | No country (the ask). |
| P1d | P2 | The `Id` column shows 8 characters with the full id in a `title`. Not copyable without opening devtools, and there is no way to pivot to one player's shifts. |
| P1e | P2 | `toLocaleString()` timestamps are long and hard to scan; no relative form ("3 days ago"), which is what you actually read a `last_seen` column for. |
| P1f | P2 | No **days active** (`COUNT(DISTINCT date(ts))`). Shifts alone can't tell one long evening from a fortnight of play — the single most useful retention column is missing. |

### 2.3 Progression funnel

| # | Severity | Finding |
| --- | --- | --- |
| F1 | **P0** | **"Filed shift 1 · 100%" is a tautology presented as a finding.** A player does not exist in `stats` until they finish a shift, so the denominator *is* the first step. The largest drop-off in the whole game — loaded it, never finished a shift — is structurally invisible here, and the panel currently implies it is being measured. Must be labelled honestly and pointed at Cloudflare Analytics for the part the database cannot see. |
| F2 | **P1** | **Not a funnel.** `Turned a profit` and `Ran 2+ cars` are independent milestones, not stages after `Reached day 5`, but they sit in the same row of equal cells, which reads as sequence. Split into an ordered funnel and a separate milestones strip. |
| F3 | **P1** | **`cityLabel('sf')` → `"Sf"`.** The title-case-the-id trick was chosen (with a good comment) to avoid a third copy of the city names, and it works for five of six cities. San Francisco shipped in 0.39.5 and broke it. |
| F4 | P2 | Stops at day 5. Runs go much longer now; day 10 and day 20 are where the late-game tuning question lives. No "reached city 2" step either, despite city unlock being the main Act 2 gate. |

### 2.4 Per-city economics

| # | Severity | Finding |
| --- | --- | --- |
| E1 | **P1** | **A median over `n = 1` is printed with exactly the same weight as a median over 200.** The Achievements view already solved this problem for itself (`tr.zero`, dimmed); Economics needs the same treatment. |
| E2 | **P1** | **No spread.** Median alone cannot separate "tightly clustered and mistuned" from "wildly variable", which is the distinction the section exists to make. Wants p25/p75. |
| E3 | P2 | Raw city ids (`sf`), inconsistent with the funnel's title-cased labels one tab away. |
| E4 | P2 | `shift_no` is uncapped, so the table grows without bound as long-running players file shift 60, 61, 62… Late shifts should roll up into a bucket. |

### 2.5 Cars — **keep**

| # | Severity | Finding |
| --- | --- | --- |
| C0 | P2 | **Three permanently empty cards.** Crossover Long / Saloon Sport / Crossover Sport kept a card each after the catalogue was trimmed to six trims, so their historical data would stay visible — but on a live database with no shifts under those ids they were just three "No shifts reported yet" tiles taking a row of the grid. Pavel asked for them to go. **Done, without losing the data**: `CARS_INFO` is now exactly the game's six-trim `CATALOG`, and a new `RETIRED_MODELS` name table means a retired *or* pre-0.42.0 id that really does have shifts appears in the Ranked table instead — dimmed, labelled `· retired`, list price `—`. Cards are for what you can buy; the table is for what people drove. Tests: `CARS_INFO` must equal the game's `CATALOG` id-for-id, and **every id the Worker whitelists in `MODEL_IDS` must resolve to a name here**, which is the assertion that catches the next retirement. |
| C1 | P2 | `avg_rides` is queried, normalised onto the radar's Rides axis, and then **never printed as a number**. The one missing stat line. |
| C2 | P2 | No way to rank the models against each other numerically — the radars are excellent for shape, useless for "which is 4th by avg net". A sortable table *under* the cards, not instead of them. |

### 2.6 Achievements

| # | Severity | Finding |
| --- | --- | --- |
| A1 | **P1** | **The rate denominator understates every row.** It is all distinct players ever, including everyone whose rows predate the achievements release and therefore carry no list at all. The empty state explains this carefully; the populated state quietly divides by it anyway. Denominator should be players who have reported a list. |
| A2 | P2 | Fixed sort by players desc. "What is too hard" wants rarest-first — free once sorting exists. |

Otherwise the best-built section on the page: walking the catalogue rather
than the result set (so an unearned achievement shows a real 0), rendering
unknown ids loudly, and the name-over-condition layout are all right.

### 2.7 Recent shifts

| # | Severity | Finding |
| --- | --- | --- |
| R1 | **P1** | No filter. 100 rows, and no way to narrow to one player, one city, or one country. |
| R2 | P2 | Shows net/cash/cars but not gross/rides/miles — the columns that say whether a shift was *busy* or merely *lucky*. |
| R3 | P2 | Nothing tells you `ts` is server time, deliberately, per the schema comment. One `title` attribute. |

### 2.8 Server side

| # | Severity | Finding |
| --- | --- | --- |
| S1 | **P1** | The new dashboard needs ~10 aggregates. Sequential `await`s would be ~10 round trips; `env.DB.batch()` makes it one. |
| S2 | P2 | `players` and `recent` both hard-code their `LIMIT` with no way to page or raise it. |

---

## 3. Geo capture

### 3.1 What is stored

Cloudflare populates `request.cf` on every incoming request at the edge, at
no cost and with no extra latency:

| Column | Source | Example |
| --- | --- | --- |
| `country` | `request.cf.country` (or the `CF-IPCountry` header) | `CZ`, `US` |
| `region` | `request.cf.region` | `Texas`, `Prague` |
| `tz` | `request.cf.timezone` | `Europe/Prague` |

**`city` and the ISP name are deliberately not stored.** City plus a
persistent `player_id` narrows to a household; country plus region answers
every question this dashboard actually asks ("is anyone outside the US
playing a game set in US cities", "which US states"). `region` is the
interesting one — it is the US state.

### 3.2 Where it is written

Only onto rows the Worker **already writes**:

- `stats` — three more columns on the existing `INSERT` in `POST /api/stat`.
- `users` — a `country` column set at registration.

### 3.3 Cost: zero

This is the part that has to be right, given the free-tier discipline in
`schema.sql`:

- **Adding columns to an existing `INSERT` costs nothing.** D1 bills *rows
  written*, not bytes or columns. One finished shift stays one row.
- **No index on `country`.** The dashboard's country aggregate is a `GROUP
  BY` over the whole table, which full-scans regardless — exactly the
  reasoning that got `idx_stats_ts` dropped. An index here would double the
  write cost of every shift to speed up a page one person opens.
- **No new request.** `request.cf` is already attached to the request being
  handled.

### 3.4 What geo does *not* answer, and the honest workaround

Per the decision above: `stats` only gets a row when somebody **finishes a
shift**, and `cloud.js` deliberately makes zero network calls at boot to
protect the anonymous-visitor budget. So the database cannot know about
visitors who never played — and adding a beacon to find out would spend
write budget on exactly the people who generate no other value, while
breaking the no-calls-at-boot rule the client was built around.

Instead the dashboard says so, in the panel, and links
**Cloudflare dashboard → Analytics & Logs → Traffic**, which is free, needs
no code, and has been collecting per-country request counts this whole time.
The admin page reports *player* geography and does not pretend to be a web
analytics tool.

### 3.5 Migration

D1 has no `ADD COLUMN IF NOT EXISTS`, so `schema.sql` gets the columns plus
the same additive-migration note style already used there for `models` and
`achv`:

```sql
ALTER TABLE stats ADD COLUMN country TEXT;
ALTER TABLE stats ADD COLUMN region  TEXT;
ALTER TABLE stats ADD COLUMN tz      TEXT;
ALTER TABLE users ADD COLUMN country TEXT;
```

Old rows keep `NULL`, which renders as `—` and is counted as `Unknown` in
the country aggregate rather than being dropped — a pre-geo row is still a
real player.

---

## 4. Sortable tables

One renderer, `dataTable(cols, rows)`, replacing six bespoke string
builders.

- A column declares `{key, label, type, fmt}` where `type` is
  `num | text | ts`, which is what makes sorting correct rather than
  lexical — the current code would sort `$1,200` before `$900` as strings.
- Click a header to sort; click again to reverse. First click on a numeric or
  timestamp column sorts **descending**, because on this page the
  interesting end of a number column is always the top.
- `NULL` always sorts last regardless of direction. A missing value is not a
  small value.
- Sort state is per-view and survives a refresh of that view.
- Headers are real `<button>`s inside the `<th>`, so the whole thing is
  keyboard-operable and screen readers announce `aria-sort`.
- Sticky header row, so scrolling a long Players table keeps the labels.
- Every table gets a row count and, where the query is capped, "showing N of
  M".
- A single filter box above the table, matching across all text columns —
  this alone fixes R1 and P1d.

Sorting is client-side, over rows already fetched. It costs no requests and
no D1 reads.

---

## 5. The dashboard

New default view, `view=dashboard`. One request, one `env.DB.batch()`.

### 5.1 Ten TOP 5 cards

All three of the offered sets, as chosen:

| Card | Metric |
| --- | --- |
| Top countries | Distinct players by `country` |
| Top cities *(in-game)* | Shifts filed per city |
| Top cars | Shifts per model, from `json_each(models)` |
| Rarest achievements | Lowest unlock count, `> 0` |
| Most active players | Shifts filed |
| Best cash | `MAX(cash)` |
| Longest runs | `MAX(day)` reached |
| Busiest days | Shifts per calendar day (server time) |
| Newest players | First `ts`, descending |
| Drop-off points | Shift number at which players were last seen |

Each card: title, five rows of `label · value`, and a bar behind each row
scaled to the card's own maximum, so a card reads at a glance without
needing the numbers. Cards with fewer than five rows show what they have and
say so; a card with nothing shows an empty state, never a zero.

Drop-off is the one to read carefully and will carry a note: it is *last
shift seen*, which conflates "quit" with "still playing, hasn't come back
yet today".

### 5.2 Subsections underneath

Below the grid, four condensed panels that summarise rather than duplicate:

1. **Right now** — shifts in the last 24h / 7d, distinct players in each,
   newest shift timestamp.
2. **Geography** — country table (players, shifts, median net) with the
   Cloudflare Analytics caveat from §3.4.
3. **Progression at a glance** — the corrected funnel from §2.3, compact.
4. **Health** — total rows, rows with no `models` object (the legacy shape),
   rows with no `achv`, rows with no country. This is the section that tells
   you a migration did not run.

Each subsection header links to the full view for that topic.

### 5.3 Cost

Ten to twelve aggregates, all `GROUP BY` scans over `stats`, batched into
one round trip. Against D1's free allowance of **5,000,000 rows read per
day** and a table that will hold thousands of rows for a long time, a page
one person opens is not a budget concern — the same reasoning `schema.sql`
uses to justify letting the `recent` view scan. Reads are cheap here;
writes are the thing to protect, and this adds none.

`batch()` also matters for the Workers CPU limit: 10 ms per request, which
is why PBKDF2 lives in the browser. D1 query time is I/O wait rather than
CPU, so the aggregates do not threaten it, but ten sequential awaits would
still make the page feel slow for no reason.

---

## 6. Order of work

1. `schema.sql` — geo columns + migration note. *(no behaviour change)*
2. `src/index.js` — capture `request.cf` on `/api/stat` and `/api/register`;
   fix `MAX(name)`, the achievements denominator, add totals to capped
   queries; add `view=dashboard`; `no-store` on admin responses.
3. `admin.html` — viewport meta, `dataTable()` + sorting + filter, refresh /
   as-of / lock, the dashboard, the funnel split, city labels, economics
   spread, the Cars table under the (unchanged) cards.
4. `test/admin.test.js` — new.
5. Screenshot both themes against a seeded local D1.

## 7. Test plan

`test/admin.test.js`, in the style of `achievements.test.js` (parse the real
files, assert on them — no mocking):

- **Sort correctness.** `$1,200` sorts above `$900`; `NULL` sorts last in
  both directions; timestamps sort chronologically not lexically.
- **City labels.** Every id in `deadhead.html`'s `CITIES` renders to that
  city's own `name` — so `sf` → `San Francisco` is asserted, and the next
  city to break the title-case trick fails the suite instead of shipping.
  This is the same drift guard `achievements.test.js` already applies to
  `ACHV_INFO`.
- **Geo round trip.** The `INSERT` column list, the `VALUES` placeholder
  count and the bound-argument count all still agree — the failure mode a
  three-column addition to a 29-column insert actually has.
- **No new index.** Assert `schema.sql` contains no index on
  `stats(country)`. The write budget is a design decision and should be
  defended by a test, not by a comment.
- **Dashboard renders from empty.** Every card and subsection survives
  `{rows: []}` without throwing — this page's most common state on a fresh
  database.
- **Cars view is intact.** Assert `hexRadar`, `AXIS_COLORS`, the six axis
  labels and all nine `CARS_INFO` rows are still present, so a later
  refactor cannot quietly gut the one section Pavel called out as
  fantastic.

Then `npm test` (the existing 27 files must stay green) and a real
screenshot in day and night theme.
