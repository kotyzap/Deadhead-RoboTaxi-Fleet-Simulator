-- Deadhead: D1 schema
-- Apply with:
--   npx wrangler d1 execute deadhead-db --remote --file=./schema.sql

-- Was keyed by email; Pavel asked for that requirement dropped since the
-- player already types a display name on the intro screen (PROFILE.name —
-- see onboardingplan.md §2) and re-typing an email for cloud saves was one
-- more piece of friction with no real payoff (there is no password reset
-- and no email is ever sent, so an address bought nothing). `username` is
-- free text like the display name, but — unlike it — must be UNIQUE, since
-- it is still how you sign back in on another device.
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,       -- stored lowercased, free text
  -- Format: sha256$kdf_iters$salt_b64$hash_b64
  -- The browser runs PBKDF2 (kdf_iters) and sends the derived key; the
  -- server stores a single salted SHA-256 of it. Server-side PBKDF2 was
  -- measured at 18.7 ms, over the 10 ms CPU limit on the Workers free
  -- plan. See the long comment at the top of src/index.js.
  pw         TEXT NOT NULL,
  created    INTEGER NOT NULL,
  last_seen  INTEGER,
  -- Two-letter Cloudflare country code, stamped at REGISTRATION only and
  -- never updated on later logins: this is "where the account was opened",
  -- not "where they are now", and a stable answer is the more useful one.
  -- See the geo block above `stats.country` for why no city is stored, and
  -- adminplan.md §3 for the whole design. Free: request.cf is already
  -- attached to the register request, and this rides along in an INSERT
  -- that happens anyway.
  country    TEXT
);
-- ADDITIVE MIGRATION NOTE: on a database that already has `users.email` from
-- before this rename, run once (SQLite/D1 support RENAME COLUMN):
--   ALTER TABLE users RENAME COLUMN email TO username;
--   ALTER TABLE login_attempts RENAME COLUMN email TO username;
-- Existing rows need no other change — an email address is a perfectly
-- valid (if unusually long) username.
--
-- ADDITIVE MIGRATION NOTE (2026-07-30, `country`): SQLite/D1 has no
-- `ADD COLUMN IF NOT EXISTS`, so on a database that already has this table,
-- run once — a "duplicate column name" error means it is already there and
-- is safe to ignore:
--   ALTER TABLE users ADD COLUMN country TEXT;

-- Session tokens are stored as SHA-256 hashes, never in the clear, so a
-- leaked database dump cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created    INTEGER NOT NULL,
  expires    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

-- One row per (player, slot). 'auto' plus slot1..slot3.
CREATE TABLE IF NOT EXISTS saves (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot     TEXT NOT NULL,
  version  INTEGER NOT NULL,
  ts       INTEGER NOT NULL,
  day      INTEGER,                      -- denormalised for cheap slot lists
  cash     REAL,
  cars     INTEGER,
  clock    TEXT,
  payload  TEXT NOT NULL,                -- the snapshot() JSON
  PRIMARY KEY (user_id, slot)
);

-- Failed-login throttle. Keyed by username so a distributed attacker cannot
-- dodge it by rotating IPs.
CREATE TABLE IF NOT EXISTS login_attempts (
  username TEXT PRIMARY KEY,
  fails    INTEGER NOT NULL DEFAULT 0,
  last     INTEGER NOT NULL
);

-- ============================================================
-- Telemetry (onboardingplan.md §4) — additive, no migration of the tables
-- above. One row per finished shift, POSTed unauthenticated from the client
-- and keyed by the LOCAL profile uuid, not by an account: there is no login
-- for this. player_id/name/created travel together so two players sharing a
-- display name are told apart by `created`, the same tiebreaker the client
-- itself uses (see PROFILE in deadhead.html).
--
-- ts is SERVER time, deliberately not the client's clock — a client clock is
-- not evidence, and trusting it would let a bad row sort itself to the top
-- of every view forever. Every other field is client-reported and unverified;
-- see the rate limiting and clamping in src/index.js POST /api/stat. This
-- table is a tuning signal, not a leaderboard, and must never be presented
-- as one (three players sharing a machine or a bored prober can write
-- anything into every numeric column here).
-- ============================================================
CREATE TABLE IF NOT EXISTS stats (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,          -- the local profile uuid
  user_id   TEXT,                   -- set only if a session cookie was present
  name      TEXT,                   -- player-chosen, non-unique, untrusted
  created   INTEGER,                -- profile creation ts: the duplicate-name tiebreaker
  ts        INTEGER NOT NULL,       -- server time, NOT client time

  -- ---- GEO (2026-07-30, adminplan.md §3) ----
  -- The only three fields on this row that are NOT client-reported and NOT
  -- claimed by the payload: they come from `request.cf`, which Cloudflare
  -- attaches at the edge before the Worker is invoked. So unlike every
  -- number above, these are as trustworthy as the connection itself.
  --
  -- WHAT IS DELIBERATELY ABSENT: request.cf also offers `city`,
  -- `postalCode`, `latitude`/`longitude` and `asOrganization`. None of them
  -- is stored. `player_id` is a persistent per-browser uuid, and a
  -- persistent id plus a city (never mind a postcode or a lat/lon) narrows
  -- to a household — that is a different kind of data than this table is
  -- allowed to hold. country+region answers every question the admin
  -- dashboard actually asks, and `region` is the interesting one: on a US
  -- connection it is the STATE, which is worth knowing for a game set in
  -- Austin, Dallas, Miami, Tampa, Orlando and San Francisco.
  --
  -- COST: nothing. D1 bills ROWS WRITTEN, not columns or bytes, so three
  -- more columns on an INSERT that already happens is free — one finished
  -- shift is still one row. And note there is NO INDEX on country, for
  -- exactly the reason idx_stats_ts was dropped below: the admin's country
  -- aggregate is a GROUP BY that full-scans anyway, so an index would buy
  -- it nothing while doubling the write cost of every player's every shift.
  --
  -- NULL on every row written before this shipped. The admin counts those
  -- as "Unknown" rather than dropping them — a pre-geo row is still a real
  -- player, and silently excluding it would understate the totals.
  country   TEXT,                   -- 'CZ', 'US' — request.cf.country
  region    TEXT,                   -- 'Texas', 'Prague' — request.cf.region
  tz        TEXT,                   -- 'Europe/Prague' — request.cf.timezone

  -- NOTE THE NAME CLASH, it has bitten once already: `city` immediately
  -- below is the IN-GAME city the shift was driven in ('austin', 'sf'), and
  -- has nothing to do with the real-world location above. The real city is
  -- the field this table intentionally does not have.
  city      TEXT, day INTEGER, shift_no INTEGER, permit TEXT,
  worked_h REAL, billed_h REAL,
  gross REAL, commission REAL, cost REAL, net REAL,
  energy REAL, dep REAL, maint REAL, ins REAL, soft REAL, fixed REAL,
  miles REAL, rides INTEGER, cancels INTEGER, safety REAL,
  cash REAL, cars INTEGER,
  models   TEXT,                    -- JSON OBJECT of per-model economics for
                                     -- this shift, e.g. '{"model3":{"gross":
                                     -- 300,"cost":120,"miles":60,"rides":5},
                                     -- "cybercab":{...}}' — one key per model
                                     -- present in the fleet at shift-end,
                                     -- built from each car's own ledger
                                     -- (appendHistoryRow()'s perModel build
                                     -- in deadhead.html), so a mixed fleet's
                                     -- models get DIFFERENT numbers rather
                                     -- than all sharing the whole shift's.
                                     -- Was a flat array of ids (["model3",
                                     -- "cybercab"]) before this — the admin
                                     -- Cars query filters that legacy shape
                                     -- out with json_type(models)='object'
                                     -- rather than mixing the two.
  --
  -- THE COMMA ON THE LINE ABOVE IS LOAD-BEARING. It was missing until
  -- 2026-07-30, and SQLite does not consider that an error: a column type
  -- can legally be several words, so `models TEXT <comment> achv TEXT`
  -- parsed as ONE column called `models` of type "TEXT achv TEXT", and the
  -- `achv` column simply never existed. CREATE TABLE succeeded, silently.
  --
  -- What that cost: any database created FRESH from this file had no achv
  -- column, so every INSERT in POST /api/stat — which names achv — failed,
  -- and the deployment recorded no telemetry at all. The live database
  -- escaped only because achv was added to it by the ALTER TABLE below
  -- rather than by this CREATE TABLE. `npm run db:local` did not escape.
  -- test/admin.test.js now executes this file and asserts every column the
  -- Worker's INSERTs name actually exists, so a missing comma fails the
  -- suite instead of quietly disabling telemetry.
  achv     TEXT                      -- JSON ARRAY of achievement ids the
                                     -- player holds AT THE TIME OF THIS
                                     -- SHIFT, e.g. '["first-shift","black",
                                     -- "fleet-3"]'. Cumulative, not a delta:
                                     -- the list is bounded by the catalogue
                                     -- (~20 short ids) so resending it costs
                                     -- nothing, and it makes the admin
                                     -- unlock-rate query a plain COUNT
                                     -- (DISTINCT player_id) over json_each()
                                     -- instead of a replay of every delta.
                                     -- Whitelisted server-side against
                                     -- ACHV_IDS in src/index.js.
);
CREATE INDEX IF NOT EXISTS idx_stats_player ON stats(player_id, ts);
--
-- THERE IS DELIBERATELY NO idx_stats_ts. It existed once and was dropped.
--
-- D1's free plan allows 100,000 ROWS WRITTEN per day, and an index counts
-- as a written row of its own on every insert that touches an indexed
-- column. idx_stats_ts therefore made every finished shift cost two rows
-- instead of one — a 2x tax on the single hottest write path in the app,
-- paid by every player, forever.
--
-- What it bought: only the admin `recent` view (ORDER BY ts DESC LIMIT
-- 100) could use it. Every other admin view — players, funnel, economics,
-- cars — is a GROUP BY over the whole table and full-scans regardless, so
-- the index never helped them. Trading a scan on a page ONE person opens
-- occasionally (against a 5,000,000 rows-read/day allowance) for half the
-- write cost of every player's every shift is not close.
--
-- idx_stats_player(player_id, ts) stays: it is a real point lookup, and
-- its leading column makes it useful in a way a bare ts index is not.
--
-- MIGRATION on a database that already has the old index — run once:
--   DROP INDEX IF EXISTS idx_stats_ts;
--
-- ADDITIVE MIGRATION NOTE: `models` and `achv` were both added after `stats`
-- first shipped. SQLite/D1 has no `ADD COLUMN IF NOT EXISTS`, so on a database
-- that already has this table WITHOUT the columns, run once:
--   ALTER TABLE stats ADD COLUMN models TEXT;
--   ALTER TABLE stats ADD COLUMN achv TEXT;
-- ADDITIVE MIGRATION NOTE (2026-07-30, geo): same story for the three geo
-- columns. On a database that already has `stats`, run once:
--   ALTER TABLE stats ADD COLUMN country TEXT;
--   ALTER TABLE stats ADD COLUMN region  TEXT;
--   ALTER TABLE stats ADD COLUMN tz      TEXT;
-- Do NOT add an index on any of them — see the COST paragraph in the geo
-- block above, and the idx_stats_ts post-mortem below.
--
-- (harmless "duplicate column name" error if the column is already there —
-- ignore it. A brand-new database gets the column from CREATE TABLE above
-- and never needs this line.) No further migration is needed for the
-- array-to-object reshape above: it is purely how NEW rows are written and
-- read, and the admin Cars query already ignores old array-shaped rows.

-- THE stat_attempts TABLE IS GONE. It was a per-(player_id, IP) throttle
-- for the unauthenticated /api/stat writes, modelled on login_attempts.
--
-- The problem was that it defended the write budget by spending it. Every
-- legitimate shift report did a SELECT plus an INSERT/UPDATE on this table
-- purely to decide it was allowed — so the anti-abuse measure doubled the
-- D1 write cost of the exact traffic it was meant to protect. Together
-- with idx_stats_ts above, one finished shift cost four written rows; it
-- now costs one.
--
-- Replaced by two things that cost no rows at all:
--   1. An isolate-local in-memory bucket in src/index.js (statThrottled).
--      Free, and enough to stop the realistic case this was written for —
--      a stuck client retry loop.
--   2. A Cloudflare Rate Limiting rule on /api/stat, which is the real
--      backstop and runs before the Worker is even invoked, so a flood
--      costs neither a request nor a row. Configure in the dashboard:
--        Security > WAF > Rate limiting rules
--        If  URI Path equals /api/stat
--        Then Block, 60 requests per 1 minute, per IP
--      (Free plan includes one rate limiting rule — this is what to spend
--      it on.)
--
-- MIGRATION on a database that already has the table — run once:
--   DROP TABLE IF EXISTS stat_attempts;
