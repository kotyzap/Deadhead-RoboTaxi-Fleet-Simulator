-- Deadhead — migration 001: shrink the D1 write budget per finished shift
--
-- Run ONCE against the live database, before or immediately after deploying
-- the Worker that stops using these two objects:
--
--   npx wrangler d1 execute deadhead-db --remote --file=./migrations/001-shrink-write-budget.sql
--
-- and against the local dev database too, if you keep one:
--
--   npx wrangler d1 execute deadhead-db --local  --file=./migrations/001-shrink-write-budget.sql
--
-- WHAT THIS IS FOR
--
-- D1's free plan allows 100,000 rows WRITTEN per day. Before this change a
-- single finished shift — the app's hottest and most valuable write — cost
-- four of them:
--
--   1. the stats row itself                        (the only one we want)
--   2. idx_stats_player                            (kept: real point lookup)
--   3. idx_stats_ts                                (dropped below)
--   4. the stat_attempts throttle row              (dropped below)
--
-- It now costs two (the row and idx_stats_player), which doubles how many
-- shifts the free tier can absorb in a day. See the long notes in
-- schema.sql for the reasoning on each, and src/index.js for the in-memory
-- throttle that replaced stat_attempts.
--
-- SAFETY: both statements are destructive but lose NO player data. An index
-- is derived; stat_attempts held only ephemeral rate-limit counters that
-- reset hourly by design. Nothing in `stats`, `saves`, `users` or
-- `sessions` is touched.
--
-- ORDER OF OPERATIONS: deploy the new Worker FIRST, then run this. The new
-- Worker never references either object, so running it against a
-- still-old Worker would break /api/stat until the deploy lands.

DROP INDEX IF EXISTS idx_stats_ts;

DROP TABLE IF EXISTS stat_attempts;
