#!/usr/bin/env bash
# Deadhead — add the geo columns to the live D1 (adminplan.md §3.5).
#
# WHY A SCRIPT: D1/SQLite has no `ADD COLUMN IF NOT EXISTS`, so these cannot
# live in schema.sql's CREATE TABLE for an existing database — they have to be
# applied once, by hand, and re-running them on an already-migrated database
# errors with "duplicate column name". That error is HARMLESS and this script
# treats it as success, so it is safe to run twice.
#
# RUN THIS BEFORE `npm run deploy`, not after. The Worker being deployed writes
# country/region/tz in the POST /api/stat INSERT; against a database without
# those columns every finished shift fails with "no such column" (the API turns
# that into a 503 naming the fix, but no telemetry is recorded meanwhile).
#
# Cost: zero ongoing. D1 bills ROWS WRITTEN, not columns, so three more columns
# on an INSERT that already happens is free. There is deliberately NO INDEX on
# any of them — see the geo block in schema.sql.
#
# Usage:  cd deploy && bash scripts/migrate-geo.sh
#         cd deploy && bash scripts/migrate-geo.sh --local   # the wrangler dev DB
set -uo pipefail

DB="deadhead-db"
TARGET="--remote"
WHERE="the LIVE (remote) database"
if [ "${1:-}" = "--local" ]; then
  TARGET="--local"
  WHERE="the local wrangler dev database"
fi

echo "Applying geo columns to ${WHERE}: ${DB}"
echo

apply() {
  local sql="$1"
  printf '  %-58s ' "${sql}"
  local out
  # 2>&1 so wrangler's "duplicate column name" lands in $out rather than on the
  # terminal, where it looks like a failure when it is the already-done case.
  if out="$(npx wrangler d1 execute "${DB}" ${TARGET} --yes --command "${sql}" 2>&1)"; then
    echo "ok"
  elif printf '%s' "${out}" | grep -qi 'duplicate column name'; then
    echo "already there"
  else
    echo "FAILED"
    echo
    printf '%s\n' "${out}"
    exit 1
  fi
}

apply "ALTER TABLE stats ADD COLUMN country TEXT;"
apply "ALTER TABLE stats ADD COLUMN region TEXT;"
apply "ALTER TABLE stats ADD COLUMN tz TEXT;"
apply "ALTER TABLE users ADD COLUMN country TEXT;"

echo
echo "Done. Verify with:"
echo "  npx wrangler d1 execute ${DB} ${TARGET} --command \"PRAGMA table_info(stats);\""
echo
echo "Then deploy:  npm run deploy"
echo "After the first new shift, check the admin's Data health panel — the"
echo "\"No country (pre-geo rows)\" count should stop growing."
