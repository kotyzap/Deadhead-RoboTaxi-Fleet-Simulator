-- Deadhead: D1 schema
-- Apply with:
--   npx wrangler d1 execute deadhead-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,       -- stored lowercased
  -- Format: sha256$kdf_iters$salt_b64$hash_b64
  -- The browser runs PBKDF2 (kdf_iters) and sends the derived key; the
  -- server stores a single salted SHA-256 of it. Server-side PBKDF2 was
  -- measured at 18.7 ms, over the 10 ms CPU limit on the Workers free
  -- plan. See the long comment at the top of src/index.js.
  pw         TEXT NOT NULL,
  created    INTEGER NOT NULL,
  last_seen  INTEGER
);

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

-- Failed-login throttle. Keyed by email so a distributed attacker cannot
-- dodge it by rotating IPs.
CREATE TABLE IF NOT EXISTS login_attempts (
  email    TEXT PRIMARY KEY,
  fails    INTEGER NOT NULL DEFAULT 0,
  last     INTEGER NOT NULL
);
