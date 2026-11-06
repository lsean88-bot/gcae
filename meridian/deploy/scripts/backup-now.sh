#!/usr/bin/env bash
# Encrypted nightly-capable backup: pg_dump | gzip | gpg --symmetric. Run from anywhere; use host cron (see docs).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in deploy/.env}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p backups
OUT="backups/meridian-$(date -u +%Y%m%dT%H%M%SZ).sql.gz.gpg"
docker compose --env-file .env exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  | gzip -9 \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 -o "$OUT" 3<<<"$BACKUP_PASSPHRASE"
[ -s "$OUT" ] || { echo "Backup file empty"; rm -f "$OUT"; exit 1; }
chmod 600 "$OUT"
ls -1t backups/meridian-*.sql.gz.gpg | tail -n +$((KEEP + 1)) | xargs -r rm -f
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then rclone copy "$OUT" "$RCLONE_REMOTE" && echo "Uploaded to $RCLONE_REMOTE"; fi
echo "Backup written: $OUT"
