-- Deadhead — migration 002: achievements column
--
-- Run ONCE against the live database, BEFORE deploying the Worker that
-- writes it (unlike 001, which had to go after). The new Worker's INSERT
-- names `achv`, so without this column every /api/stat returns the
-- "a database column is missing" 503 from the handler's catch.
--
--   npx wrangler d1 execute deadhead-db --remote --file=./migrations/002-achievements.sql
--   npx wrangler d1 execute deadhead-db --local  --file=./migrations/002-achievements.sql
--
-- Additive and reversible-by-neglect: existing rows get NULL, and the admin
-- achievements view already filters on `achv IS NOT NULL`, so historical
-- shifts simply do not contribute to unlock rates rather than counting as
-- zero. That is the honest reading — those players may well hold
-- achievements, we just never asked.
--
-- "duplicate column name: achv" means it is already applied. Ignore it.

ALTER TABLE stats ADD COLUMN achv TEXT;
