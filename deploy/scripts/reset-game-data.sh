#!/usr/bin/env bash
# Deadhead — reset cloud saves + telemetry for the $500 economy relaunch.
#
# WHY THIS EXISTS: CFG.startCash dropped from $7,500 to $500 (companyplan.md,
# 2026-07-27). Every existing cloud save and telemetry row was written under
# the old economy — old cash figures, old fixed-cost assumptions — and the
# same for local (per-browser IndexedDB) saves, which this script cannot
# reach at all (see the note at the bottom).
#
# SCOPE, decided explicitly: wipes `saves` (cloud game saves) and `stats`
# (per-shift telemetry) only. `users`, `sessions`, and `login_attempts` are
# left untouched — nobody's account or login is affected, only the game data
# tied to it.
#
# This CANNOT be run from a sandboxed/CI shell — it needs a real Cloudflare
# login and network access to the Cloudflare API, which is why this is a
# script for YOU to run, not something already executed. Prerequisites:
#   1. cd into deploy/
#   2. npx wrangler login        (opens a browser, one-time per machine)
#   3. bash scripts/reset-game-data.sh
#
# Set -e: any failed step (including the backup) stops the script before it
# ever reaches the DELETE — a failed backup must never be silently followed
# by a wipe.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=deadhead-db
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="backup-${DB}-${STAMP}.sql"

echo "== 1/2: full backup -> ${BACKUP}"
npx wrangler d1 export "$DB" --remote --output="$BACKUP"
echo "   backup written: $(pwd)/${BACKUP}"
echo "   (this is the WHOLE database, including users/sessions, as cheap"
echo "    insurance — even though only saves+stats get deleted below.)"

echo "== 2/2: deleting saves + stats rows (schema stays, tables stay empty)"
npx wrangler d1 execute "$DB" --remote \
  --command="DELETE FROM saves; DELETE FROM stats;"

echo "Done. saves and stats are empty; users/sessions/login_attempts untouched."
echo "The backup file above is the only copy of the deleted rows — move it"
echo "somewhere durable if you want to keep it."
