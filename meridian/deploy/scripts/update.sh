#!/usr/bin/env bash
# Update the running stack: pull, rebuild, migrate, restart, health check, UAT.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose --env-file .env"
# WARNING: migrate runs `drizzle-kit push --force`, which applies schema changes without
# asking, including column/table drops. The backup below is the safety net; read the
# release notes for schema changes before updating.
./scripts/backup-now.sh
git pull --ff-only
$DC build app
$DC --profile setup build migrate
$DC --profile setup run --rm migrate
$DC up -d --remove-orphans
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then echo "Health OK"; break; fi
  [ "$i" = 30 ] && { echo "Health check failed"; $DC logs --tail=50 app; exit 1; }
  sleep 2
done
$DC --profile setup run --rm migrate npm run uat | tail -n 8
echo "Update complete."
