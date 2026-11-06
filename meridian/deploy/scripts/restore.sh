#!/usr/bin/env bash
# Usage: restore.sh backups/meridian-XXXX.sql.gz.gpg [target_db]
# Restores into a FRESH database (default meridian_restore). Never overwrites the live database.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?usage: restore.sh <backup.sql.gz.gpg> [target_db]}"
TARGET="${2:-meridian_restore}"
set -a; . ./.env; set +a
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE in deploy/.env}"
[[ "$TARGET" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Database name must match ^[a-z_][a-z0-9_]*$"; exit 1; }
[ -f "$FILE" ] || { echo "No such file: $FILE"; exit 1; }
[ "$TARGET" != "${POSTGRES_DB:-meridian}" ] || { echo "Refusing to restore over the live database. Choose another name."; exit 1; }
echo "Restore $FILE into NEW database '$TARGET'. Existing '$TARGET' will be dropped."
read -r -p "Type YES to continue: " ans
[ "$ans" = "YES" ] || { echo "Cancelled."; exit 1; }
DC="docker compose --env-file .env"
$DC exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS \"$TARGET\"' -c 'CREATE DATABASE \"$TARGET\"'"
gpg --batch --pinentry-mode loopback --passphrase-fd 3 -d "$FILE" 3<<<"$BACKUP_PASSPHRASE" | gunzip \
  | $DC exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"$TARGET\" -v ON_ERROR_STOP=1 -q"
echo "Restored into '$TARGET'. Verify:  docker compose exec db psql -U $POSTGRES_USER -d $TARGET -c '\\dt'"
echo "To go live with it, a technician must repoint DATABASE_URL; do not do this without the GCAE's approval."
